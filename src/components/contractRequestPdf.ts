import formsJson from './contractRequestForms.json';

type Field = {id?: string;type: string;label?: string;showIf?: {field:string;equals:string}};
type Section = {num?: string;title?: string;fields: Field[]};
type Form = {code:string;label:string;docTitle:string;sections:Section[];hasChecklist?:boolean;checklist?: {id:string;label:string;sub?:{id:string;label:string}[]}[];hasAditivoTable?:boolean;hasPricingTable?:boolean;pricingAfterFields?:string[];photoPageTitle?:string};
export const contractForms = formsJson.forms as Record<string,Form>;
export type RequestData = Record<string,unknown>;
const esc=(v:unknown)=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
const number=(v:unknown)=>Number(String(v??'0').replace(/\./g,'').replace(',','.'))||0;
const money=(v:unknown)=>number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const brdate=(v:unknown)=>/^\d{4}-\d\d-\d\d$/.test(String(v))?String(v).split('-').reverse().join('/'):String(v||'—');
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const rows=(v:unknown)=>Array.isArray(v)?v.map(record):[];
export function buildContractRequestPrint(type:string,data:RequestData,projectLabel:string){
 const f=contractForms[type]; if(!f) throw Error('Modelo de formulário inválido');
 const field=(fl:Field)=>{if(['static','irrf-table','file'].includes(fl.type)||fl.showIf&&data[fl.showIf.field]!==fl.showIf.equals)return '';
 let value=data[fl.id||''];if(Array.isArray(value)) value=value.join(', ');if(fl.type==='money'&&value)value='R$ '+money(value);if(fl.type==='date'&&value)value=brdate(value);
 return `<div class="pr-row">${fl.label?`<b>${esc(fl.label)}:</b> `:''}${esc(value||'—')}</div>`;};
 const title=f.docTitle.split(/\s+[–-]\s+/).map(esc).join('<br>');
 let html=`<div class="pr-block"><div class="pr-header"><img class="pr-logo" src="/ccl-logo-contratos-v1.png" alt="CCL"><h1>${title}</h1></div><div class="pr-meta"><b>Solicitante:</b> ${esc(data.solicitante||'—')}<br><b>Prazo:</b> ${esc(data.prazo||'—')}<br>${data.motivacao_urgencia?`<b>Motivação (urgência):</b> ${esc(data.motivacao_urgencia)}<br>`:''}<b>1° Local e Nº da Obra:</b> ${esc(data.local_obra||projectLabel)}</div></div>`;
 for(const section of f.sections){if(!section.title&&!section.num)continue;
 let sectionFields=section.fields;
 if(f.hasPricingTable&&section.title==='VALOR')sectionFields=(f.pricingAfterFields||[]).map(id=>section.fields.find(fl=>fl.id===id)).filter((fl):fl is Field=>!!fl);
 html+=`<div class="pr-block"><h2>${esc(section.num||'')} ${esc(section.title||'')}</h2>${sectionFields.map(field).join('')}</div>`;
 if(f.hasPricingTable&&section.title==='VALOR'){
 if(data.usar_precificacao==='SIM'){let total=0;html+='<div class="pr-block"><h2>Itens da Prestação / Precificação</h2><table><tr><th>Item</th><th>Unidade</th><th>Quantidade</th><th>Valor Unitário</th><th>Total</th></tr>';
 for(const r of rows(data.__pricing)){const sub=number(r.quantidade)*number(r.valor_unitario);total+=sub;html+=`<tr><td>${esc(r.item)}</td><td>${esc(r.unidade)}</td><td>${esc(r.quantidade)}</td><td>R$ ${money(r.valor_unitario)}</td><td>R$ ${money(sub)}</td></tr>`;}html+=`<tr><td colspan="4" style="text-align:right"><b>TOTAL GERAL</b></td><td><b>R$ ${money(total)}</b></td></tr></table></div>`;}
 const after=section.fields.filter(fl=>!(f.pricingAfterFields||[]).includes(fl.id||''));if(after.length)html+=`<div class="pr-block">${after.map(field).join('')}</div>`;
 }
 const attachments=record(data.__files);for(const fl of section.fields.filter(fl=>fl.type==='file')){const files=rows(attachments[fl.id||'']);const images=files.filter(x=>typeof x.dataUrl==='string'&&String(x.dataUrl).startsWith('data:image/'));
 for(let i=0;i<images.length;i+=4)html+=`<div class="pr-block"><h2>${esc(f.photoPageTitle||'FOTOS')}</h2><div class="pr-photos">${images.slice(i,i+4).map(x=>`<div><img src="${esc(x.dataUrl)}" alt=""><small>${esc(x.name)}</small></div>`).join('')}</div></div>`;
 const other=files.filter(x=>!images.includes(x));if(other.length)html+=`<div class="pr-block"><b>Documentos anexados (anexar o arquivo original ao processo):</b><br>${other.map(x=>esc(x.name)).join('<br>')}</div>`;
 }
 }
 if(f.hasAditivoTable){html+='<div class="pr-block"><h2>Tabela de Valores — Contrato x Aditivo</h2><table><tr><th>Item</th><th>Serviço</th><th>Und</th><th>Qtd Prevista</th><th>Preço Unit.</th><th>Total Previsto</th><th>Qtd Aditivo</th><th>Total Aditivo</th></tr>';
 for(const [i,r] of rows(data.__tabela).entries())html+=`<tr><td>${i+1}</td><td>${esc(r.servico)}</td><td>${esc(r.und)}</td><td>${esc(r.qtd_prevista)}</td><td>${esc(r.preco_unit)}</td><td>R$ ${money(number(r.qtd_prevista)*number(r.preco_unit))}</td><td>${esc(r.qtd_aditivo)}</td><td>R$ ${money(number(r.qtd_aditivo)*number(r.preco_unit))}</td></tr>`;html+='</table></div>';}
 if(f.hasChecklist){const checks=record(data.__checklist);html+='<div class="pr-block"><h2>Check-list das Documentações</h2>';
 for(const item of f.checklist||[]){html+=`<div class="pr-check">${checks[item.id]?'☑':'☐'} ${esc(item.label)}</div>`;for(const sub of item.sub||[])html+=`<div class="pr-check pr-check-sub">${checks[item.id+'__'+sub.id]?'☑':'☐'} ${esc(sub.label)}</div>`;}html+='</div>';}
 html+=`<div class="pr-block pr-footer"><b>CCL — CONSTRUTORA CENTRO LESTE</b> · Gestão 360º · ${esc(projectLabel)}<br><i>Projeto desenvolvido por Luciano Garcia Borba — Constru-X · Gestão Inteligente 360º</i></div>`;return html;
}
export async function downloadContractRequestPdf(node:HTMLElement,filename:string){
 const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')]);
 await document.fonts.ready;
 await Promise.all(Array.from(node.querySelectorAll('img')).map(img=>img.decode().catch(()=>undefined)));
 await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
 const canvas=await html2canvas(node,{scale:2,backgroundColor:'#ffffff',useCORS:true});
 const rect=node.getBoundingClientRect();const blocks=Array.from(node.querySelectorAll('.pr-block')).map(b=>({top:(b.getBoundingClientRect().top-rect.top)*2,bottom:(b.getBoundingClientRect().bottom-rect.top)*2}));
 const doc=new jsPDF({orientation:'portrait',unit:'pt',format:'a4'});const side=5*2.83465,top=10*2.83465,usableW=doc.internal.pageSize.getWidth()-side*2;const pxPerPt=canvas.width/usableW;const maxPx=(doc.internal.pageSize.getHeight()-top*2)*pxPerPt;
 let cursor=0;while(cursor<canvas.height-1){let end=Math.min(cursor+maxPx,canvas.height);for(const b of blocks){if(b.top>cursor+1&&b.top<end&&b.bottom>end){end=b.top;break;}}if(end<=cursor)end=Math.min(cursor+maxPx,canvas.height);
 const slice=document.createElement('canvas');slice.width=canvas.width;slice.height=Math.ceil(end-cursor);slice.getContext('2d')?.drawImage(canvas,0,cursor,canvas.width,end-cursor,0,0,canvas.width,end-cursor);if(cursor)doc.addPage();doc.addImage(slice.toDataURL('image/png'),'PNG',side,top,usableW,(end-cursor)/pxPerPt);cursor=end;}
 doc.save(filename);
}
