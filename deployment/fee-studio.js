/* ARGUS Pay fee studio: private Super Admin settings, safe estimates only.
   No Pix, payout, balance or ledger operation occurs in this file. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const keys=['mistic_deposit_cents','mistic_withdraw_cents',
   'argus_deposit_fixed_cents','argus_withdraw_fixed_cents',
   'argus_deposit_bps','argus_withdraw_bps'];
 const bpsKeys=new Set(['argus_deposit_bps','argus_withdraw_bps']);
 const fmt=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(cents)/100);
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let current=null,saving=false,loading=false;
 function allowed(){return state?.user?.role==='superadmin'}
 function normalized(value){
   const text=String(value||'').trim();
   if(!/^\d{1,3}(?:[,.]\d{1,2})?$/.test(text))return null;
   const n=Number(text.replace(',','.'));
   return Number.isFinite(n)?Math.round(n*100):null;
 }
 function amountInput(input){
   const text=String(input||'').trim();
   if(!/^\d{1,9}(?:[,.]\d{1,2})?$/.test(text))return null;
   const n=Number(text.replace(',','.'));
   return Number.isFinite(n)?Math.round(n*100):null;
 }
 function values(){
   const result={};const errors=[];
   for(const key of keys){
     const el=document.querySelector('#argus-fee-form [name="'+key+'"]');
     if(!el){errors.push(key);continue}
     const n=normalized(el.value);
     const max=bpsKeys.has(key)?5000:10000;
     el.setAttribute('aria-invalid',n===null||n>max?'true':'false');
     if(n===null||n<0||n>max)errors.push(key);else result[key]=n;
   }
   return {result,errors};
 }
 function canSave(){
   if(!allowed()||!current||saving)return false;
   const data=values();
   const changed=keys.some(key=>data.result[key]!==current[key]);
   const reason=String($('argus-fee-reason')?.value||'').trim();
   return data.errors.length===0&&changed&&reason.length>=8&&reason.length<=240;
 }
 function updateSave(){
   const button=$('argus-fee-save');if(button)button.disabled=!canSave();
 }
 function quote(rates,amount,direction){
   const base=direction==='deposit'?'deposit':'withdraw';
   const provider=rates['mistic_'+base+'_cents'];
   const fixed=rates['argus_'+base+'_fixed_cents'];
   const bps=rates['argus_'+base+'_bps'];
   const percent=Math.round(amount*bps/10000);
   return {provider,fixed,percent,revenue:fixed+percent,margin:fixed+percent-provider};
 }
 function renderSimulation(){
   const host=$('argus-fee-sim-cards');if(!host)return;
   const {result,errors}=values(),amount=amountInput($('argus-fee-sample-amount')?.value);
   if(!current||errors.length||amount===null||amount<100||amount>100000000){
     host.innerHTML='<p class="argus-fee-validation">Informe valores válidos para visualizar a simulação. Use até duas casas decimais.</p>';
     updateSave();return;
   }
   const cards=[
     ['deposit','Depósito Pix','Recebimento'],
     ['withdraw','Saque Pix','Transferência']
   ];
   host.innerHTML=cards.map(([direction,title,label])=>{
     const q=quote(result,amount,direction);
     return '<article class="argus-fee-result">'+
       '<div class="argus-fee-result-head"><div><span>'+safe(label)+'</span><h3>'+safe(title)+'</h3></div><strong>'+fmt(amount)+'</strong></div>'+
       '<div class="argus-fee-result-row"><span>Custo MisticPay</span><b>'+fmt(q.provider)+'</b></div>'+
       '<div class="argus-fee-result-row"><span>Taxa fixa ARGUS</span><b>'+fmt(q.fixed)+'</b></div>'+
       '<div class="argus-fee-result-row"><span>Taxa percentual ARGUS</span><b>'+fmt(q.percent)+'</b></div>'+
       '<div class="argus-fee-result-row emphasized"><span>Receita ARGUS estimada</span><strong>'+fmt(q.revenue)+'</strong></div>'+
       '<div class="argus-fee-result-margin '+(q.margin<0?'negative':'positive')+'">'+
       '<small>Margem por operação · estimativa</small><strong>'+fmt(q.margin)+'</strong></div>'+
       '</article>';
   }).join('');
   updateSave();
 }
 function fill(policy){
   current=policy;
   for(const key of keys){
     const input=document.querySelector('#argus-fee-form [name="'+key+'"]');
     if(input)input.value=(Number(policy[key])/100).toFixed(2).replace('.',',');
   }
   $('argus-fee-reason').value='';
   $('argus-fee-version').textContent='Tabela v'+String(policy.version||1);
   renderSimulation();
 }
 function renderHistory(events){
   const host=$('argus-fee-history');if(!host)return;
   if(!events?.length){
     host.innerHTML='<div class="argus-fee-history-empty">A tabela inicial está ativa. Ainda não houve alterações manuais.</div>';
     return;
   }
   host.innerHTML=events.map(row=>{
     const timestamp=String(row.changed_at||'').replace(' ','T')+'Z';
     const when=Date.parse(timestamp);
     const label=Number.isFinite(when)?
       new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(when)):
       String(row.changed_at||'');
     const actor=String(row.updated_by||'');
     return '<article class="argus-fee-history-item"><div><strong>Versão '+safe(row.version)+'</strong>'+
       '<span>'+safe(label)+'</span><small>Alteração registrada por ID '+safe(actor.slice(0,12))+'</small></div>'+
       '<p>'+safe(row.reason)+'</p></article>';
   }).join('');
 }
 async function loadFees(force=false){
   if(!allowed()||loading)return;
   loading=true;
   const button=$('argus-fee-reload');if(button)button.disabled=true;
   try{
     const response=await api('/api/admin/fees');
     if(!response?.fees||response.fees.currency!=='BRL')throw Error('Tabela de taxas indisponível');
     fill(response.fees);renderHistory(response.history||[]);
     if(force&&typeof toast==='function')toast('Tabela de taxas atualizada.');
   }catch(error){
     if(typeof toast==='function')toast('Não foi possível carregar as taxas: '+error.message,true);
   }finally{loading=false;if(button)button.disabled=false;updateSave();}
 }
 async function submit(event){
   event.preventDefault();
   if(!allowed()||saving||!current)return;
   if(!canSave()){if(typeof toast==='function')toast('Confira valores, motivo e alterações antes de salvar.',true);return}
   const data=values().result;
   data.version=current.version;
   data.reason=$('argus-fee-reason').value.trim();
   if(!confirm('Salvar a nova tabela de taxas ARGUS? Isso altera a configuração e o histórico, mas não desconta valores nem modifica transações.'))return;
   saving=true;const button=$('argus-fee-save');button.disabled=true;
   try{
     const response=await post('/api/admin/fees',data);
     if(!response?.ok||!response?.fees)throw Error('Não foi possível confirmar a atualização');
     fill(response.fees);renderHistory(response.history||[]);
     if(typeof toast==='function')toast(response.message||'Tabela de taxas registrada.');
   }catch(error){
     if(typeof toast==='function')toast('Falha ao salvar taxas: '+error.message,true);
     if(/outra sessão|versão/i.test(error.message||''))await loadFees();
   }finally{saving=false;updateSave();}
 }
 function init(){
   const form=$('argus-fee-form');if(!form)return;
   form.addEventListener('input',renderSimulation);
   form.addEventListener('submit',submit);
   $('argus-fee-reload').addEventListener('click',()=>loadFees(true));
   document.querySelectorAll('.menu-item[data-nav="fees"]').forEach(button=>{
     button.style.display=allowed()?'flex':'none';
   });
 }
 const loadPrevious=loadPage;
 loadPage=async function(page){
   if(page==='fees')return loadFees();
   return loadPrevious.apply(this,arguments);
 };
 const navigatePrevious=navigate;
 navigate=function(page){
   if(page==='fees'&&!allowed())return;
   return navigatePrevious.apply(this,arguments);
 };
 const signinPrevious=signin;
 signin=function(data){
   const value=signinPrevious.apply(this,arguments);
   document.querySelectorAll('.menu-item[data-nav="fees"]').forEach(button=>{
     button.style.display=allowed()?'flex':'none';
   });
   return value;
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
 else init();
})();
