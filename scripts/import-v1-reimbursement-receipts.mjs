import { createClient } from '@supabase/supabase-js';

// Consulta o v1 e copia somente comprovantes da obra 202; nenhum dado do v1 é alterado.
const v1Project='https://dtwrectueosvnzgpmvos.supabase.co';
const v2Project='https://sjvfbgrjaycwvvkegdtp.supabase.co';
const obraV1='24fd9029-d890-4bba-b788-0e4e7ed35f1c';
const obraV2='496b2474-a3d9-482f-b5bf-b89c0357e1ac';
const execute=process.argv.includes('--execute');
async function secret(label){if(!process.stdin.isTTY)throw new Error('Execute em um terminal interativo.');process.stdout.write(`${label} (entrada oculta): `);return new Promise((resolve,reject)=>{let s='';process.stdin.setRawMode(true);process.stdin.resume();const key=data=>{for(const c of data.toString()){if(c==='\r'||c==='\n'){process.stdin.off('data',key);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');resolve(s);return}if(c==='\u0003'){process.stdin.off('data',key);process.stdin.setRawMode(false);process.stdin.pause();reject(new Error('Cancelado'));return}if(c==='\u007f'||c==='\b')s=s.slice(0,-1);else s+=c}};process.stdin.on('data',key)})}
const keyV1=process.env.CX_V1_SERVICE_ROLE_KEY||await secret('Chave secreta/service_role do v1');
const keyV2=process.env.CX_V2_SERVICE_ROLE_KEY||await secret('Chave secreta/service_role do v2');
const v1=createClient(v1Project,keyV1,{auth:{persistSession:false}}),v2=createClient(v2Project,keyV2,{auth:{persistSession:false}});
async function fetchRows(query,label){const {data,error}=await query;if(error)throw new Error(`${label}: ${error.message}`);return data||[]}
try{
 const [files,competences,people,existing]=await Promise.all([
  fetchRows(v1.from('rh_reembolso_comprovantes').select('id,competencia_id,colaborador_id,arquivo_nome,arquivo_path,arquivo_tipo').eq('obra_id',obraV1).limit(1000),'Comprovantes v1'),
  fetchRows(v1.from('rh_reembolso_competencias').select('id,competencia').eq('obra_id',obraV1).limit(1000),'Competências v1'),
  fetchRows(v2.from('cx_collaborators').select('id,legacy_source_id').eq('project_id',obraV2).limit(1000),'Colaboradores v2'),
  fetchRows(v2.from('cx_reimbursement_receipts').select('legacy_id').eq('project_id',obraV2).limit(1000),'Comprovantes v2')
 ]);
 const dates=new Map(competences.map(c=>[c.id,c.competencia])),mapped=new Map(people.filter(p=>p.legacy_source_id).map(p=>[p.legacy_source_id,p.id])),done=new Set(existing.map(x=>x.legacy_id));
 let imported=0,skipped=0,failed=0;
 console.log(`${files.length} comprovantes localizados no v1. Modo: ${execute?'IMPORTAR':'CONFERIR (SEM ALTERAR)'}.`);
 for(const file of files){
  if(done.has(file.id)){skipped++;console.log(`JÁ EXISTE: ${file.arquivo_nome}`);continue}
  const collaborator=mapped.get(file.colaborador_id),competence=dates.get(file.competencia_id);
  if(!collaborator||!competence||!file.arquivo_path){failed++;console.error(`SEM VÍNCULO: ${file.arquivo_nome} (${file.id})`);continue}
  const ext=file.arquivo_nome?.toLowerCase().endsWith('.pdf')?'pdf':file.arquivo_nome?.toLowerCase().endsWith('.png')?'png':'jpg';
  const path=`${obraV2}/${competence.slice(0,7)}/${collaborator}/${file.id}.${ext}`;
  if(!execute){console.log(`IMPORTAR: ${file.arquivo_nome} -> ${path}`);continue}
  try{
   const {data:blob,error:read}=await v1.storage.from('reembolso-comprovantes').download(file.arquivo_path);
   if(read||!blob)throw read||new Error('Arquivo não encontrado');
   const mime=file.arquivo_tipo||'application/pdf';
   const {error:upload}=await v2.storage.from('cx-reimbursement-receipts').upload(path,await blob.arrayBuffer(),{contentType:mime,upsert:false});
   if(upload&&String(upload.status)!=='409')throw upload;
   const {error:write}=await v2.from('cx_reimbursement_receipts').insert({project_id:obraV2,competence,collaborator_id:collaborator,legacy_id:file.id,file_name:file.arquivo_nome,storage_path:path,mime_type:mime});
   if(write)throw write;
   imported++;console.log(`SALVO: ${file.arquivo_nome}`);
  }catch(error){failed++;console.error(`FALHA ${file.arquivo_nome}: ${error.message||error}`)}
 }
 console.log(`RESULTADO: ${imported} importados, ${skipped} já existentes, ${failed} falhas.`);
 if(failed)process.exitCode=1;
}catch(error){console.error('Migração interrompida:',error.message||error);process.exitCode=1}
