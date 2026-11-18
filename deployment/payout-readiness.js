/* Read-only ARGUS withdrawal readiness: no transfer is ever initiated here.
   The original authenticated POST remains the sole withdrawal submission. */
(()=>{
 'use strict';
 let busy=false,lastRead=0,ready=false;
 const by=id=>document.getElementById(id);
 const find=()=>{
   const buttons=Array.from(document.querySelectorAll('button[type="submit"],button:not([type])'));
   const button=buttons.find(b=>/solicitar\s+transfer[eê]ncia\s+pix/i.test((b.textContent||'').trim()));
   const form=button?.closest('form');
   return form&&form.querySelector('input')?{form,button}:null;
 };
 function ensure(){
   const elements=find();if(!elements)return null;
   if(!by('argus-payout-readiness')){
     const box=document.createElement('div');
     box.id='argus-payout-readiness';
     box.className='argus-payout-readiness';
     box.setAttribute('role','status');
     box.setAttribute('aria-live','polite');
     box.textContent='Verificando a disponibilidade das transferências...';
     elements.button.before(box);
   }
   if(!elements.form.dataset.argusPayoutGuard){
     // Client guard supplements, never replaces, the backend payoutAvailable().
     elements.form.addEventListener('submit',event=>{
       if(ready)return;
       event.preventDefault();event.stopImmediatePropagation();
       if(typeof toast==='function')toast('Saque ainda não habilitado. Confira a configuração de transferência exibida no formulário.',true);
     },true);
     elements.form.dataset.argusPayoutGuard='1';
   }
   return elements;
 }
 function show(result){
   const elements=ensure();if(!elements)return;
   const status=by('argus-payout-readiness');
   ready=result?.ready_to_request===true;
   elements.button.disabled=!ready;
   elements.button.setAttribute('aria-disabled',ready?'false':'true');
   status.className='argus-payout-readiness '+(ready?'argus-payout-ready':'argus-payout-locked');
   if(ready){
     status.innerHTML='<span class="argus-payout-readiness-icon" aria-hidden="true">✓</span>'+
       '<div><strong>Integração de saque configurada</strong>'+
       '<p>Antes de transferir, confirme na MisticPay os escopos BALANCE_READ e WITHDRAW_CREATE, saldo disponível e IP autorizado. A confirmação final será feita pelo provedor.</p></div>';
   }else{
     const reason=String(result?.reason||'not_available');
     const messages={
       payouts_disabled:['Saques ainda não ativados','O serviço está configurado para não enviar transferências. Habilite ARGUS_PAYOUTS_ENABLED somente após configurar e validar as credenciais de saque.'],
       payout_credentials_missing:['Credenciais de saque ausentes','Configure ARGUS_MISTICPAY_PAYOUT_PK e ARGUS_MISTICPAY_PAYOUT_SK no Render. Use uma chave pk_/sk_ da MisticPay com BALANCE_READ e WITHDRAW_CREATE.'],
       persistent_database_required:['Banco persistente indisponível','Transferências exigem o banco persistente conectado.'],
       not_available:['Não foi possível verificar o saque','Aguardando a configuração de transferência segura no servidor.']
     };
     const [title,description]=messages[reason]||messages.not_available;
     status.innerHTML='<span class="argus-payout-readiness-icon" aria-hidden="true">🔒</span>'+
       '<div><strong></strong><p></p></div>';
     status.querySelector('strong').textContent=title;
     status.querySelector('p').textContent=description;
   }
 }
 async function refresh(force=false){
   const elements=ensure();if(!elements||busy)return;
   if(!force&&Date.now()-lastRead<20000)return;
   busy=true;ready=false;elements.button.disabled=true;
   const warning=by('argus-payout-readiness');
   if(warning)warning.textContent='Conferindo credenciais e autorização de saque no servidor...';
   try{
     // Uses existing same-origin authenticated admin helper, never exposes secrets.
     if(typeof api!=='function')throw new Error('Sessão administrativa não iniciada');
     const result=await api('/api/admin/payouts/readiness');
     show(result);lastRead=Date.now();
   }catch(error){
     show({reason:'not_available'});
     // Auth/2FA failures intentionally do not bypass the server guard.
   }finally{busy=false}
 }
 function init(){
   ensure();
   setTimeout(()=>refresh(true),700);
   document.addEventListener('click',event=>{
     const target=event.target.closest?.('[data-nav="wallet"],[data-nav="payouts"],[data-nav="transfers"]');
     if(target)setTimeout(()=>refresh(true),150);
   });
   document.addEventListener('visibilitychange',()=>{
     if(!document.hidden&&find()?.form?.getBoundingClientRect()?.width)refresh();
   });
   window.addEventListener('focus',()=>{
     if(find()?.form?.getBoundingClientRect()?.width)refresh();
   });
   setInterval(()=>{
     const e=find();if(e&&e.form.getClientRects().length>0&&!document.hidden)refresh();
   },60000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
 else init();
})();