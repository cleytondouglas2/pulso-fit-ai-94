/* ARGUS Pix overlay: move the original receipt and its handlers, never duplicate IDs. */
(()=>{
 'use strict';
 const byId=id=>document.getElementById(id);
 let receiptHome=null,receiptNext=null,activeId='',previousFocus=null,previousOverflow='';
 let popup=null,success=null;
 const valid=id=>/^qpx_[a-f0-9]{32}$/.test(String(id||''));
 const pageVisible=()=>{const p=byId('page-charge-create');return !!p&&!p.hidden&&!document.hidden;};
 function ensurePopup(){
   if(popup)return popup;
   popup=document.createElement('div');
   popup.id='argus-pix-popup-overlay';popup.className='argus-pix-overlay';popup.hidden=true;
   popup.innerHTML=[
     '<section class="argus-pix-modal-card charge-result" role="dialog" aria-modal="true" aria-labelledby="argus-pix-popup-title" tabindex="-1">',
     '<header class="argus-pix-modal-header"><div><h2 id="argus-pix-popup-title">QR Code PIX</h2>',
     '<p>Compartilhe este QR Code para receber o pagamento.</p></div>',
     '<button type="button" class="argus-pix-modal-close" aria-label="Fechar janela do Pix" title="Fechar">×</button>',
     '</header><div id="argus-pix-modal-receipt-host"></div></section>'
   ].join('');
   document.body.appendChild(popup);
   popup.querySelector('.argus-pix-modal-close').addEventListener('click',closePopup);
   popup.addEventListener('click',evt=>{if(evt.target===popup)closePopup();});
   document.addEventListener('keydown',evt=>{
     if(evt.key==='Escape'&&!popup.hidden){evt.preventDefault();closePopup();}
   });
   return popup;
 }
 function restoreScroll(){
   if((!popup||popup.hidden)&&(!success||success.hidden))
     document.body.style.overflow=previousOverflow;
 }
 function closePopup(){
   if(!popup||popup.hidden)return;
   popup.hidden=true;
   const receipt=byId('charge-receipt');
   if(receiptHome&&receipt){
     if(receiptNext&&receiptNext.parentElement===receiptHome)receiptHome.insertBefore(receipt,receiptNext);
     else receiptHome.appendChild(receipt);
     receipt.hidden=true;
     const placeholder=byId('charge-placeholder');
     if(placeholder)placeholder.hidden=false;
   }
   receiptHome=null;receiptNext=null;
   restoreScroll();
   if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
 }
 function openPopup(data){
   if(!valid(data?.id)||typeof data?.pix_copy_paste!=='string'||!data.pix_copy_paste)return;
   if(data.status==='paid')return;
   const receipt=byId('charge-receipt');
   if(!receipt)return;
   ensurePopup();
   if(popup.hidden){
     receiptHome=receipt.parentElement;
     receiptNext=receipt.nextSibling;
     previousFocus=document.activeElement;
     previousOverflow=document.body.style.overflow;
   }
   const host=byId('argus-pix-modal-receipt-host');
   if(receipt.parentElement!==host)host.appendChild(receipt);
   receipt.hidden=false;
   popup.hidden=false;
   document.body.style.overflow='hidden';
   popup.querySelector('.argus-pix-modal-close').focus({preventScroll:true});
 }
 function ensureSuccess(){
   if(success)return success;
   success=document.createElement('div');
   success.id='argus-pix-success-overlay';success.className='argus-pix-overlay argus-pix-success-overlay';
   success.hidden=true;
   success.innerHTML=[
     '<section class="argus-pix-success-card" role="dialog" aria-modal="true" aria-labelledby="argus-pix-success-title" aria-describedby="argus-pix-success-description" tabindex="-1">',
     '<div class="argus-pix-success-symbol" aria-hidden="true">✓</div>',
     '<h2 id="argus-pix-success-title">Parabéns! 🎉</h2>',
     '<p id="argus-pix-success-description">Seu Pix foi recebido e confirmado pela ARGUS Pay.</p>',
     '<strong id="argus-pix-success-amount"></strong>',
     '<button id="argus-pix-success-ok" class="btn primary" type="button">OK</button>',
     '</section>'
   ].join('');
   document.body.appendChild(success);
   byId('argus-pix-success-ok').addEventListener('click',()=>{
     success.hidden=true;
     restoreScroll();
     const create=byId('charge-create-form');
     if(create?.isConnected)create.scrollIntoView({behavior:'smooth',block:'nearest'});
   });
   return success;
 }
 function showSuccess(chargeId){
   if(!valid(chargeId)||chargeId!==activeId||!pageVisible())return;
   const amount=(byId('charge-amount')?.textContent||'').trim();
   closePopup();
   ensureSuccess();
   byId('argus-pix-success-amount').textContent=/^R\$\s*\d/.test(amount)?amount:'';
   success.hidden=false;
   document.body.style.overflow='hidden';
   byId('argus-pix-success-ok').focus({preventScroll:true});
 }
 function hideGenericPixUnavailableNotice(){
   // Suppress only the generic banner requested by the user. Specific API errors
   // and security/permission messages remain available to diagnose failures.
   const warning=byId('pix-config-alert');
   if(!warning)return;
   const clean=()=>{
     const value=(warning.textContent||'').trim();
     if(value==='A emissão Pix está indisponível no momento.'||
        value==='O piloto Pix não está disponível. Confirme a ativação no dashboard.'){
       warning.hidden=true;
       warning.textContent='';
     }
   };
   clean();
   new MutationObserver(clean).observe(warning,{subtree:true,childList:true,characterData:true});
 }
 function attach(){
   ensurePopup();ensureSuccess();
   hideGenericPixUnavailableNotice();
   const original=window.showChargeReceipt;
   if(typeof original!=='function'||original.__argusPopupV1)return;
   const wrapped=function(data){
     if(valid(data?.id)&&data?.pix_copy_paste)activeId=data.id;
     const output=original.apply(this,arguments);
     if(valid(data?.id)&&data?.pix_copy_paste&&data.status!=='paid')openPopup(data);
     return output;
   };
   wrapped.__argusPopupV1=true;
   window.showChargeReceipt=wrapped;
   // Existing New QR button resets the form; only close the overlay afterwards.
   document.addEventListener('click',evt=>{
     if(evt.target?.closest?.('#argus-pix-new')){
       if(!popup.hidden)closePopup();
       activeId='';
     }
   });
   // The event originates only from the authenticated server payment reconciliation.
   window.addEventListener('argus:pix-paid',event=>showSuccess(event.detail?.chargeId));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach);
 else attach();
})();