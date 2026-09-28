import { createClient } from '@supabase/supabase-js';

// Executar somente no computador do administrador. As chaves ficam em variáveis de ambiente.
const obraV1='24fd9029-d890-4bba-b788-0e4e7ed35f1c';
const obraV2='496b2474-a3d9-482f-b5bf-b89c0357e1ac';
const v1Project='https://dtwrectueosvnzgpmvos.supabase.co';
const v2Project='https://sjvfbgrjaycwvvkegdtp.supabase.co';
const sourceBucket='folga-campo-documentos';
const targetBucket='cx-field-leave-v1-simulations';
const obsoleteRogerioQuote=`${obraV2}/363f039a-c99b-46ad-bcc2-f6a67275b7c3/55e92e95-ef98-4723-8833-46f1dae691b9.jpg`;
const execute=process.argv.includes('--execute');
async function readSecret(label){if(!process.stdin.isTTY)throw new Error('Execute em um terminal interativo para digitar as chaves sem exibi-las.');process.stdout.write(`${label} (entrada oculta): `);return new Promise((resolve,reject)=>{let value='';process.stdin.setRawMode(true);process.stdin.resume();const onKey=data=>{for(const ch of data.toString()){if(ch==='\r'||ch==='\n'){process.stdin.off('data',onKey);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');resolve(value);return}if(ch==='\u0003'){process.stdin.off('data',onKey);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');reject(new Error('Cancelado'))}if(ch==='\u007f'||ch==='\b'){value=value.slice(0,-1)}else value+=ch}};process.stdin.on('data',onKey)})}
const keyV1=process.env.CX_V1_SERVICE_ROLE_KEY||await readSecret('Chave secreta/service_role do v1');
const keyV2=process.env.CX_V2_SERVICE_ROLE_KEY||await readSecret('Chave secreta/service_role do v2');
if(!keyV1||!keyV2)throw new Error('As duas chaves são necessárias.');
const v1=createClient(v1Project,keyV1,{auth:{persistSession:false}});
const v2=createClient(v2Project,keyV2,{auth:{persistSession:false}});
const get=async(promise,label)=>{const {data,error}=await promise;if(error)throw new Error(`${label}: ${error.message}`);return data||[]};
const clean=value=>String(value||'SEM_NOME').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').slice(0,60);
const sameDate=(a,b)=>String(a||'').slice(0,10)===String(b||'').slice(0,10);

try{
 if(execute){const removed=await v2.storage.from('cx-field-leave-quotes').remove([obsoleteRogerioQuote]);if(removed.error)throw new Error(`Remoção da cotação descartada de Rogério: ${removed.error.message}`);console.log('Imagem da cotação descartada de Rogério removida do armazenamento v2.')}else console.log('A imagem descartada de Rogério será removida ao executar a importação.');
 const imports=await get(v1.from('folga_campo_importacoes').select('id,folga_campo_id,colaborador_id,simulacao_pdf_path,arquivo_path,simulacao_pdf_nome,status').eq('obra_id',obraV1).not('simulacao_pdf_path','is',null).order('created_at',{ascending:true}).limit(1000),'Lendo simulações v1');
 const oldLeaves=await get(v1.from('folga_campo').select('id,colaborador_id,matricula,colaborador_nome,competencia').eq('obra_id',obraV1).limit(1000),'Lendo folgas v1');
 const leaves=await get(v2.from('cx_field_leaves').select('id,legacy_id,collaborator_id,registration,collaborator_name,competence').eq('project_id',obraV2).limit(1000),'Lendo folgas v2');
 const v1ById=new Map(oldLeaves.map(leave=>[leave.id,leave]));
 let linked=0,archived=0,uploaded=0,skipped=0,failed=0;
 console.log(`${imports.length} PDFs do v1 encontrados. Modo: ${execute?'IMPORTAR':'CONFERIR (SEM ALTERAR)'}.`);
 for(const item of imports){
  const old=v1ById.get(item.folga_campo_id);
  const exact=old?leaves.filter(l=>l.legacy_id===old.id):[];
  const fallback=old?leaves.filter(l=>l.collaborator_id===old.colaborador_id&&sameDate(l.competence,old.competencia)):[];
  const matches=exact.length?exact:fallback;
  // A simulação de Redenção do v1, confirmada como correta, será associada à nova folga de Rogério.
  const linkedLeave=matches.length===1?matches[0]:null;
  const label=clean(old?.colaborador_nome||item.simulacao_pdf_nome?.replace('SIMULACAO_DE_PASSAGEM_','').replace('.pdf',''));
  const folder=linkedLeave?linkedLeave.id:'archive';
  const stem=folder==='archive'?`${label}__${item.id}`:item.id;
  const files=[{src:item.simulacao_pdf_path,dst:`${obraV2}/${folder}/${stem}.pdf`,mime:'application/pdf'},{src:item.arquivo_path,dst:`${obraV2}/${folder}/${stem}.jpg`,mime:'image/jpeg'}].filter(x=>x.src);
  if(linkedLeave)linked++;else archived++;
  console.log(`${linkedLeave?'VINCULAR':'ARQUIVAR'} ${label}: ${files.map(f=>f.dst.split('/').at(-1)).join(', ')}`);
  if(!execute)continue;
  for(const file of files){try{
   const {data:blob,error:readError}=await v1.storage.from(sourceBucket).download(file.src);
   if(readError||!blob)throw readError||new Error('Arquivo não encontrado no v1');
   const {error:writeError}=await v2.storage.from(targetBucket).upload(file.dst,await blob.arrayBuffer(),{contentType:file.mime,upsert:false});
   if(writeError){if(String(writeError.status)==='409'){skipped++;continue}throw writeError}
   uploaded++;
  }catch(error){failed++;console.error(`FALHA ${file.dst}: ${error.message||error}`)}}
 }
 console.log(`RESULTADO: ${linked} simulações ligadas às folgas; ${archived} arquivadas sem vínculo; ${uploaded} arquivos enviados; ${skipped} já existentes; ${failed} falhas.`);
 if(failed)process.exitCode=1;
}catch(error){console.error('Importação interrompida:',error.message||error);process.exitCode=1}
