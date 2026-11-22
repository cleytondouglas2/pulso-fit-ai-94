/* ARGUS Pay — self-healing authenticated page presentation.
   Never duplicates finance forms or invokes financial POST requests. */
(()=>{
 'use strict';
 if(window.__argusSellerStability)return;
 window.__argusSellerStability=true;
 const E=id=>document.getElementById(id);
 let deadline=0, pending=0, firstReady=false, lastPage=null;
 let lastOverview=false, revenueDeadline=0;
 function check(){
  const page=E('argus-reseller-page-charges');
  const dashboard=E('dashboard');
  if(!page||!dashboard||dashboard.hidden)return;
  const host=E('res-charge-form');
  if(!host)return;
  const form=E('seller-deposit-form');
  const panel=form?.closest('.seller-panel');
  if(panel&&panel.parentElement!==host){
   host.appendChild(panel); // preserves original submit listener and state
  }
  // If a legacy style hid a mounted form, restore its normal presentation,
  // except for a deliberately hidden/disabled financial form.
  if(form&&!form.hidden&&!form.closest('[hidden]')&&
     getComputedStyle(form).display==='none'){
   form.style.setProperty('display','grid','important');
  }
  const receipt=E('res-charge-result'),result=E('seller-pix-result');
  if(receipt&&result&&result.parentElement!==receipt)receipt.appendChild(result);
  const old=E('res-charge-load-note');
  if(form&&host.contains(form)){
   old?.remove();
   firstReady=true;return;
  }
  if(page.hidden){old?.remove();return}
  if(!deadline)deadline=Date.now()+5000;
  if(Date.now()<deadline)return;
  if(old)return;
  const note=document.createElement('div');
  note.id='res-charge-load-note';note.className='res-charge-load-note';
  note.setAttribute('role','status');
  note.innerHTML='<p>O formulário de cobrança não terminou de carregar. Seus dados permanecem seguros.</p><button type="button">Recarregar formulário</button>';
  note.querySelector('button').addEventListener('click',()=>location.reload());
  host.appendChild(note);
 }
 function schedule(){
  if(pending)return;
  pending=requestAnimationFrame(()=>{pending=0;check();});
 }
 function overviewState(){
  const page=E('argus-reseller-page-overview');
  const dashboard=E('dashboard');
  const visible=!!page&&!page.hidden&&!!dashboard&&!dashboard.hidden;
  if(visible&&!lastOverview){
   revenueDeadline=Date.now()+5500;
   // The existing revenue widget listens to the account-status event and
   // then performs its own authenticated, read-only GET request.
   document.dispatchEvent(new CustomEvent('argus:reseller-stage',{detail:window.ArgusResellerStage||null}));
  }
  if(visible&&revenueDeadline&&Date.now()>revenueDeadline){
   const host=E('ar-seller-revenue');
   const text=host?.querySelector('p');
   if(text&&text.textContent?.includes('Carregando faturamento confirmado')){
    text.textContent='O faturamento confirmado ainda está sendo consultado. A atualização não altera seu saldo ou suas cobranças.';
   }
  }
  if(!visible)revenueDeadline=0;
  lastOverview=visible;
 }
 function onView(){
  const page=E('argus-reseller-page-charges');
  const visible=page&&!page.hidden;
  if(visible&&!lastPage){deadline=Date.now()+5000;}
  if(!visible){deadline=0;E('res-charge-load-note')?.remove();}
  lastPage=visible;
  overviewState();
  schedule();
 }
 document.addEventListener('argus:reseller-view',onView);
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-reseller-view]'))queueMicrotask(onView);
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)onView();});
 window.addEventListener('pageshow',onView);
 const timer=setInterval(()=>{
  if(document.hidden||E('dashboard')?.hidden)return;
  overviewState();
  if(E('argus-reseller-page-charges')&&!E('argus-reseller-page-charges').hidden)check();
  if(firstReady&&E('seller-deposit-form')&&E('res-charge-form')?.contains(E('seller-deposit-form')))return;
 },1600);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',onView,{once:true});else onView();
})();
