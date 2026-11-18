/* ARGUS: automatic Pix status reconciliation without trusting the QR or client-side events.
   The MisticPay /api/transactions/check endpoint is the only payment-status authority.
   The server worker also checks pending charges when this tab is closed. */
(()=>{
 'use strict';
 let chargeId='', timer=null, checking=false, autoStopped=false, resumeBusy=false;
 let lastCelebratedCharge='';
 const note=()=>document.getElementById('charge-note');
 const badge=()=>document.getElementById('charge-receipt-state');
 const form=()=>document.getElementById('charge-create-form');
 const page=()=>form()?.closest('section.page');
 const isValid=id=>/^qpx_[a-f0-9]{32}$/.test(String(id||''));
 const sectionVisible=()=>page() && !page().hidden && !document.hidden;
 function stop(){if(timer){clearInterval(timer);timer=null}autoStopped=true;}
 function showStatus(status){
   const b=badge(),n=note();if(!b||!n)return;
   if(status==='paid'){
     b.textContent='Pagamento recebido e confirmado';
     b.className='status-badge paid';
     n.textContent='Pix recebido e confirmado pela ARGUS Pay. Seu pagamento foi registrado com sucesso.';
     stop();
     // A celebration is only dispatched after the authenticated MisticPay payment
     // status (or a verified stored charge) is "paid". No client-side payment spoof.
     if(isValid(chargeId) && lastCelebratedCharge!==chargeId){
       lastCelebratedCharge=chargeId;
       window.dispatchEvent(new CustomEvent('argus:pix-paid',{detail:{chargeId}}));
     }
     if(typeof toast==='function' && !document.getElementById('argus-pix-success-overlay'))
       toast('Pix recebido e confirmado pela ARGUS Pay!');
     return;
   }
   if(['failed','cancelled','refunded','expired'].includes(status)){
     b.textContent='Pagamento '+(status==='failed'?'não concluído':status);
     n.textContent='A MisticPay não confirmou este pagamento. Verifique o extrato do provedor antes de gerar outra cobrança.';
     stop();return;
   }
   b.textContent='Aguardando confirmação do pagamento';
   n.textContent='Verificação automática ativa: consultando a MisticPay a cada 20 segundos enquanto esta tela estiver aberta.';
 }
 async function check(){
   if(!isValid(chargeId)||autoStopped||checking||!sectionVisible())return;
   checking=true;
   try{
     const result=await post('/api/admin/quick-pix/'+encodeURIComponent(chargeId)+'/reconcile');
     // Another tab/new charge must not inherit the result from this request.
     if(result?.charge?.id && result.charge.id!==chargeId)return;
     const status=result?.charge?.status||result?.status;
     if(typeof status==='string')showStatus(status);
   }catch(err){
     const message=String(err?.message||'Falha de consulta');
     if(/API_SCOPE_DENIED|TRANSACTION_READ|HTTP 403/.test(message)){
       stop();
       if(note())note().textContent='Consulta automática bloqueada pela MisticPay (403). Na chave de API, habilite TRANSACTION_READ e confira as restrições de IP. Não marque como pago sem confirmação.';
       if(badge())badge().textContent='Confirmação pendente · permissão necessária';
     }else if(note()){
       note().textContent='Não foi possível conferir o status agora. O monitor do servidor continuará consultando quando a API estiver disponível.';
     }
   }finally{checking=false;}
 }
 function watchCharge(data){
   if(!data||!isValid(data.id)||data.provider!=='MisticPay tradicional')return;
   chargeId=data.id;autoStopped=false;
   if(timer)clearInterval(timer);
   if(data.status==='paid'){showStatus('paid');return;}
   if(['failed','cancelled','expired'].includes(data.status)){showStatus(data.status);return;}
   if(!data.pix_copy_paste)return;
   showStatus(data.status||'pending');
   timer=setInterval(check,20000);
   // The provider caches pending transactions for a few seconds.
   if(sectionVisible())setTimeout(check,12000);
 }
 function attach(){
   const original=window.showChargeReceipt;
   if(typeof original!=='function')return false;
   if(original.__argusAutoStatus)return true;
   const wrapped=function(data){original.apply(this,arguments);watchCharge(data);};
   wrapped.__argusAutoStatus=true;
   window.showChargeReceipt=wrapped;
   return true;
 }
 async function restore(){
   if(!sectionVisible()||chargeId||resumeBusy||typeof api!=='function')return;
   resumeBusy=true;
   try{
     const rows=await api('/api/admin/quick-pix');
     if(!Array.isArray(rows))return;
     const pending=rows.find(r=>isValid(r.id)&&String(r.provider_id||'').startsWith('tr_')&&['pending','unknown'].includes(r.status));
     if(!pending)return;
     const charge=await api('/api/admin/quick-pix/'+encodeURIComponent(pending.id));
     if(charge?.pix_copy_paste && typeof window.showChargeReceipt==='function')window.showChargeReceipt(charge);
   }catch(e){/* Admin may not be authenticated or 2FA complete. Do not reveal account data. */}
   finally{resumeBusy=false;}
 }
 document.addEventListener('DOMContentLoaded',()=>{
   attach();
   // Resume the latest pending charge after a Safari refresh or app restart.
   setTimeout(restore,1300);
   setInterval(()=>{if(!chargeId){restore()}else if(!autoStopped&&!timer){timer=setInterval(check,20000)}},10000);
   document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(chargeId&&!autoStopped)check();else restore();}});
   window.addEventListener('pageshow',()=>{if(!chargeId)restore();});
 });
})();