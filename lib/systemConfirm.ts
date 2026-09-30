export function systemConfirm(message: string, title = 'CONFIRMAR AÇÃO'): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise(resolve => {
    const overlay=document.createElement('div'); overlay.className='cx-confirm-overlay';
    const modal=document.createElement('div'); modal.className='cx-confirm-modal'; modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true');
    const h=document.createElement('h3'); h.textContent=title;
    const p=document.createElement('p'); p.textContent=message;
    const actions=document.createElement('div'); actions.className='cx-confirm-actions';
    const cancel=document.createElement('button'); cancel.type='button'; cancel.className='cx-confirm-cancel'; cancel.textContent='CANCELAR';
    const ok=document.createElement('button'); ok.type='button'; ok.className='cx-confirm-ok'; ok.textContent='CONFIRMAR';
    actions.append(cancel,ok); modal.append(h,p,actions); overlay.append(modal); document.body.append(overlay);
    const finish=(value:boolean)=>{document.removeEventListener('keydown',key); overlay.remove(); resolve(value)};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')finish(false)};
    document.addEventListener('keydown',key); cancel.onclick=()=>finish(false); ok.onclick=()=>finish(true);
    overlay.onclick=e=>{if(e.target===overlay)finish(false)}; setTimeout(()=>cancel.focus(),0);
  });
}
