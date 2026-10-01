import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const formTypes = ['aditivo','distrato','locacao_equipamento','locacao_imovel','locacao_veiculo','prestacao_servicos'] as const;
const fields = ['solicitante','prazo','motivacao_urgencia','local_obra','prest_nome','prest_endereco','prest_cnpj','num_contrato','proposta_anexo','negociado','data_aviso','data_encerramento','obs','parte_nome','parte_endereco','parte_doc','parte_telefone','parte_email','objeto','data_inicio','data_fim','data_fechamento_medicoes','data_pagamento_medicoes','itens_orcamento','item_financeiro','forma_pagamento','banco','agencia','conta','pix','eq_tipo','eq_marca','eq_modelo','eq_ano','eq_serie','mob_desmob','havera_operador','operador_de_quem','operador_clt','desgastes','desgastes_quais','valor_aluguel','endereco_imovel','bom_estado','mobiliado','descricao_mobilia','moveis_bom_estado','imovel_desgastes','imovel_desgastes_quais','pintura_perfeita','reformas','reformas_quais','locador_escritura','iptu_obrigacao','caucao','fornece_agua','fornece_energia','fornece_internet','fornece_gas','entrega_imovel','pagamento_avista','pagamento_parcelado','como_parcelas','eq_placa','eq_renavam','uso_funcionario','uso_funcionario_quem','valor_mensal','valor_total_contrato','forn_refeicao','forn_combustivel','forn_alojamento','forn_materiais','forn_ferramentas','abatimento_itens','emitira_art','modalidade_funcionarios','qtd_funcionarios','obrig_prestadora','obrig_contratante'] as const;

function fail(message:string,status=500){return NextResponse.json({error:message},{status});}

export async function POST(request:Request){
 let uploadedId='';
 try{
  const key=process.env.OPENAI_API_KEY;
  if(!key)return fail('OPENAI_API_KEY não configurada no Vercel.',500);
  const fd=await request.formData();
  const file=fd.get('file');
  if(!(file instanceof File))return fail('Selecione a solicitação em Word (.docx) ou PDF.',400);
  const lower=file.name.toLowerCase();
  if(!lower.endsWith('.docx')&&!lower.endsWith('.pdf'))return fail('Formato não suportado. Envie .docx ou .pdf.',400);
  if(file.size>10*1024*1024)return fail('O arquivo excede 10 MB.',400);

  const upload=new FormData(); upload.append('purpose','user_data'); upload.append('file',file,file.name);
  const up=await fetch('https://api.openai.com/v1/files',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:upload});
  const upJson:any=await up.json().catch(()=>null);
  if(!up.ok||!upJson?.id)return fail(upJson?.error?.message||'Falha ao preparar o documento para leitura.',502);
  uploadedId=upJson.id;

  const props:Record<string,unknown>={};
  for(const field of fields)props[field]={type:['string','null']};
  const prompt=`Leia esta SOLICITAÇÃO DE CONTRATO da Construtora Centro Leste (CCL). Extraia SOMENTE informações explicitamente presentes no documento. Não invente, não complete por conhecimento externo e não estime valores ou prazos. Quando não existir informação, retorne null. Datas devem ser YYYY-MM-DD quando houver data completa. Valores devem vir como texto numérico sem R$. Preserve observações e condições relevantes. Classifique form_type entre: aditivo, distrato, locacao_equipamento, locacao_imovel, locacao_veiculo, prestacao_servicos. Classifique process_type como NOVO_CONTRATO, ADITIVO ou TRANSFERENCIA. Se o documento for aditivo para transferir contrato para outra obra, use TRANSFERENCIA. O número do NOVO contrato não deve ser inventado: se ainda depende do Jurídico, contract_code deve ser null. Para TRANSFERENCIA, leia a cópia do contrato para obter valor mensal e data final, mas a data inicial da Obra destino DEVE ser a data explícita da transferência/chegada indicada na solicitação (normalmente data_aviso), nunca a data inicial original do contrato. Não invente valor total: o sistema calculará o proporcional do período da obra destino. Para aditivo/transferência, campos realmente ausentes podem permanecer null.`;
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({
    model:process.env.OPENAI_CONTRACT_MODEL||process.env.OPENAI_TRANSFER_MODEL||'gpt-5-mini',
    input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_file',file_id:uploadedId}]}],
    text:{format:{type:'json_schema',name:'contract_request_import',strict:true,schema:{type:'object',additionalProperties:false,properties:{form_type:{type:'string',enum:[...formTypes]},process_type:{type:'string',enum:['NOVO_CONTRATO','ADITIVO','TRANSFERENCIA']},contract_code:{type:['string','null']},data:{type:'object',additionalProperties:false,properties:props,required:[...fields]}},required:['form_type','process_type','contract_code','data']}}}
  })});
  const raw=await response.text(); let out:any=null; try{out=JSON.parse(raw)}catch{return fail(`A I.A. retornou resposta inválida (HTTP ${response.status}).`,502)}
  if(!response.ok)return fail(out?.error?.message||`Falha na leitura por I.A. (HTTP ${response.status}).`,502);
  const text=out?.output_text||out?.output?.flatMap((x:any)=>x?.content||[]).find((x:any)=>x?.type==='output_text')?.text;
  if(!text)return fail('A I.A. não retornou os dados da solicitação.',502);
  let parsed:any; try{parsed=JSON.parse(text)}catch{return fail('A I.A. respondeu, mas os dados não vieram no formato esperado.',502)}
  const clean:Record<string,unknown>={}; for(const field of fields){const v=parsed?.data?.[field]; if(v!==null&&v!==undefined&&String(v).trim()!=='')clean[field]=v;}
  return NextResponse.json({form_type:parsed.form_type,process_type:parsed.process_type,contract_code:parsed.contract_code||null,data:clean});
 }catch(error){return fail(error instanceof Error?error.message:'Erro ao analisar a solicitação.',500)}
 finally{if(uploadedId&&process.env.OPENAI_API_KEY){try{await fetch(`https://api.openai.com/v1/files/${uploadedId}`,{method:'DELETE',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}})}catch{}}}
}
