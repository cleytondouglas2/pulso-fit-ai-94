/* ARGUS access history for logged-in seller. Never displays raw IP or UA. */
(()=>{
'use strict';if(window.__argusLoginAudit)return;window.__argusLoginAudit=true;
let card=null,last=0,working=false;
function setup(){
 const page=document.getElementById('argus-reseller-page-registration');
 if(!page||card?.isConnected)return;
 card=document.createElement('section');card.className='seller-panel argus-login-audit';
 card.innerHTML='<h3>Segurança dos acessos</h3><p>Histórico de navegadores e redes usados após login. Não mostramos seu endereço IP.</p><div id="argus-login-events" aria-live="polite">Carregando histórico...</div>';
 page.append(card);
 refresh();
}
async function refresh(){
 if(!card?.isConnected||working||Date.now()-last<10000)return;
 working=true;
 const pane=document.getElementById('argus-login-events');
 try{
  const v=await request('/api/portal/security/activity');
  if(!pane)return;
  pane.replaceChildren();
  if(!v.events?.length){pane.textContent='Ainda não há histórico de acessos.';return;}
  for(const item of v.events){
   const row=document.createElement('div');row.className='argus-login-row';
   const date=new Date(item.date);
   const left=document.createElement('span');
   left.textContent=Number.isFinite(date.getTime())?date.toLocaleString('pt-BR'):'Acesso recente';
   const badge=document.createElement('strong');
   badge.textContent=item.unusual?'Novo navegador ou rede':'Acesso reconhecido';
   if(item.unusual)row.classList.add('unusual');
   row.append(left,badge);pane.append(row);
  }
  last=Date.now();
 }catch(e){if(pane)pane.textContent='Não foi possível carregar o histórico agora.';}
 finally{working=false;}
}
const obs=new MutationObserver(()=>{
 if(document.getElementById('argus-reseller-page-registration'))setup();
 if(card?.isConnected && !document.getElementById('dashboard')?.hidden)refresh();
});
obs.observe(document.documentElement,{childList:true,subtree:false});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
