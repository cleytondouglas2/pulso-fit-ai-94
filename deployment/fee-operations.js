/* ARGUS fee accounting view. Quote endpoints are READ ONLY.
   Only existing payout-form submission can move money, after OTP + consent. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const fmt=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0)/100);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const admin=()=>state?.user?.role==='superadmin';
 let ledgerBusy=false,depositTimer=0,payoutTimer=0;
 function toCents(raw){
   const s=String(raw??'').trim().replace(/\s/g,'').replace(/^R\$\s*/,'');
   if(!/^\d{1,9}(?:[,.]\d{1,2})?$/.test(s))return null;
   const val=Number(s.replace(',','.'));
   return Number.isFinite(val)?Math.round(val*100):null;
 }
 function previewRoot(){
   if(!admin())return;
   const chargeForm=$('charge-create-form');
   if(chargeForm&&!$('argus-deposit-fee-summary')){
     const box=document.createElement('div');
     box.id='argus-deposit-fee-summary';
     box.className='argus-operation-fee-preview';
     box.setAttribute('aria-live','polite');
     box.textContent='Digite um valor para consultar as taxas de depósito.';
     chargeForm.append(box);
     chargeForm.addEventListener('input',()=>{clearTimeout(depositTimer);depositTimer=setTimeout(depositQuote,340)});
     chargeForm.addEventListener('change',()=>{clearTimeout(depositTimer);depositTimer=setTimeout(depositQuote,200)});
   }
   const payoutForm=$('payout-form');
   if(payoutForm&&!$('argus-withdraw-fee-summary')){
     const box=document.createElement('div');
     box.id='argus-withdraw-fee-summary';
     box.className='argus-operation-fee-preview';
     box.setAttribute('aria-live','polite');
     box.textContent='Informe o valor a sacar para ver quanto o destinatário receberá.';
     const submit=payoutForm.querySelector('button[type="submit"]');
     if(submit)submit.before(box);else payoutForm.append(box);
     payoutForm.addEventListener('input',()=>{clearTimeout(payoutTimer);payoutTimer=setTimeout(payoutQuote,340)});
     payoutForm.addEventListener('change',()=>{clearTimeout(payoutTimer);payoutTimer=setTimeout(payoutQuote,200)});
   }
 }
 function setPreview(id,title,fee,kind){
   const el=$(id);if(!el)return;
   el.replaceChildren();
   const h=document.createElement('strong');h.textContent=title;el.append(h);
   const rows=kind==='withdraw'?[
     ['Valor solicitado',fee.gross_cents],
     ['Taxa ARGUS descontada',fee.argus_fee_cents],
     ['Pix ao destinatário',fee.recipient_cents],
     ['Custo MisticPay (separado)',fee.mistic_cost_estimate_cents],
   ]:[
     ['Valor do QR Code Pix',fee.gross_cents],
     ['Taxa ARGUS na apuração',fee.argus_fee_cents],
     ['Base líquida contábil',fee.commercial_net_cents],
     ['Custo MisticPay (estimado)',fee.mistic_cost_estimate_cents],
   ];
   for(const [label,amount] of rows){
     const row=document.createElement('div');row.className='argus-operation-fee-row';
     const k=document.createElement('span'),v=document.createElement('b');
     k.textContent=label;v.textContent=fmt(amount);row.append(k,v);el.append(row);
   }
   const note=document.createElement('p');
   note.textContent=kind==='withdraw'?
     'A taxa ARGUS é abatida do valor enviado ao destino. O custo MisticPay é considerado separadamente pelo provedor, sem segundo desconto pelo ARGUS. Confirmação 2FA obrigatória.':
     'O cliente paga exatamente o valor do QR Code. A apuração líquida fica registrada após pagamento confirmado; o custo MisticPay não é debitado novamente.';
   el.append(note);
 }
 async function depositQuote(){
   if(!admin())return;
   const box=$('argus-deposit-fee-summary');if(!box)return;
   const cents=typeof pixAmountCents==='function'?pixAmountCents():toCents($('charge-amount')?.value);
   if(!Number.isInteger(cents)||cents<100||cents>10000){box.textContent='Digite um valor válido para visualizar as taxas de depósito.';return;}
   try{
     const result=await api('/api/admin/quick-pix/fee-quote?amount_cents='+cents);
     if(box && toCents($('charge-amount')?.value)===cents) setPreview(box.id,'Taxas desta cobrança',result.fee,'deposit');
   }catch(error){box.textContent='Taxas indisponíveis no momento. A geração será bloqueada se não for possível registrar a tabela vigente.'}
 }
 async function payoutQuote(){
   if(!admin())return;
   const box=$('argus-withdraw-fee-summary'),form=$('payout-form');if(!box||!form)return;
   const cents=toCents(form.elements.namedItem('amount')?.value);
   if(!Number.isInteger(cents)||cents<100||cents>10000){
     box.textContent='Digite um valor entre R$ 1,00 e R$ 100,00 para conferir o valor líquido.';
     return;
   }
   try{
     const result=await api('/api/admin/payouts/fee-quote?amount_cents='+cents);
     if(box && toCents(form.elements.namedItem('amount')?.value)===cents)
       setPreview(box.id,'Prévia do saque',result.fee,'withdraw');
   }catch(error){box.textContent='Não é possível cotar este saque: '+error.message;}
 }
 const states={reserved:'Aguardando',submitted:'Em processamento',settled:'Confirmado',not_collected:'Não cobrado'};
 function renderOperations(operations){
   const host=$('argus-fee-operations-list');if(!host)return;
   if(!Array.isArray(operations)||!operations.length){
     host.innerHTML='<p class="argus-fee-operation-empty">Nenhuma cobrança ou saque novo possui taxas vinculadas ainda. Operações anteriores à ativação não são recalculadas.</p>';
     return;
   }
   host.innerHTML=operations.slice(0,60).map(r=>{
     const kind=r.operation_kind==='deposit'?'Depósito Pix':'Saque Pix';
     const time=Date.parse(String(r.created_at||'').replace(' ','T')+'Z');
     const when=Number.isFinite(time)?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(time)):'—';
     const status=states[r.status]||r.status;
     return '<article class="argus-fee-operation-item">'+
       '<div class="argus-fee-operation-main"><strong>'+esc(kind)+'</strong><small>'+esc(when)+'</small>'+
       '<span class="argus-fee-operation-state '+esc(r.status)+'">'+esc(status)+'</span></div>'+
       '<div class="argus-fee-operation-amounts"><span>Bruto <b>'+fmt(r.gross_cents)+'</b></span>'+
       '<span>ARGUS <b>'+fmt(r.argus_fee_cents)+'</b></span>'+
       '<span>MisticPay (ref.) <b>'+fmt(r.mistic_cost_estimate_cents)+'</b></span>'+
       '<span>'+(r.operation_kind==='deposit'?'Líquido contábil':'Enviado ao destino')+
       ' <b>'+fmt(r.operation_kind==='deposit'?r.commercial_net_cents:r.provider_amount_cents)+'</b></span>'+
       '</div><small class="argus-fee-operation-version">Tabela v'+esc(r.policy_version)+' · '+esc(r.operation_id.slice(-9))+'</small></article>';
   }).join('');
 }
 async function loadFeeOperations(){
   if(!admin()||ledgerBusy)return;
   const host=$('argus-fee-operations-list');if(!host)return;
   ledgerBusy=true;
   try{
     const res=await api('/api/admin/fees/operations');
     renderOperations(res.operations);
   }catch(error){host.textContent='Não foi possível consultar as taxas por operação: '+error.message;}
   finally{ledgerBusy=false;}
 }
 function init(){
   previewRoot();
   $('argus-fees-operations-refresh')?.addEventListener('click',loadFeeOperations);
 }
 const oldLoad=loadPage;
 loadPage=async function(page){
   const res=await oldLoad.apply(this,arguments);
   if(!admin())return res;
   previewRoot();
   if(page==='fees')await loadFeeOperations();
   if(page==='charge-create')await depositQuote();
   if(page==='wallet')await payoutQuote();
   return res;
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
 else init();
})();
