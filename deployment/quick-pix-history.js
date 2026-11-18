/* ARGUS: one unified receipt for new and historical Pix QR, with provider-safe statuses.
   No creation, settlement or authentication logic is performed by this script. */
(()=>{
 'use strict';
 const by=id=>document.getElementById(id);
 const valid=id=>/^qpx_[a-f0-9]{32}$/.test(String(id||''));
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const brl=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(c)||0)/100);
 const parseUtc=v=>{
   if(typeof v!=='string')return 0;
   const canonical=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)?v.replace(' ','T')+'Z':v;
   const date=Date.parse(canonical);
   return Number.isFinite(date)?date:0;
 };
 const expiry=row=>{
   const epoch=Number(row?.expires_at_epoch)||0;
   const created=parseUtc(row?.created_at);
   return epoch>0?epoch*1000:(created>0?created+1800000:0);
 };
 function displayStatus(row){
   const status=String(row?.status||'unknown');
   if(['paid','failed','cancelled','refunded'].includes(status))return status;
   if(expiry(row)>0&&Date.now()>=expiry(row))return 'expired';
   if(row?.display_status==='expired')return 'expired';
   return String(row?.display_status||status);
 }
 const statusLabels={paid:'Aprovado',pending:'Aguardando',unknown:'Conferindo',creating:'Em emissão',
   expired:'Expirado',failed:'Não aprovado',cancelled:'Cancelado',refunded:'Devolvido'};
 const page=()=>by('page-charge-create');
 let rows=[],loading=false,lastLoaded=0,shown=null,historyReady=false,manualBusy=new Set();
 function panel(){
   const placeholder=by('charge-placeholder');
   return placeholder?.closest('.charge-result')||null;
 }
 function ensure(){
   const p=panel(),placeholder=by('charge-placeholder');if(!p||!placeholder)return null;
   let root=by('argus-pix-recent');
   if(!root){
     root=document.createElement('section');
     root.id='argus-pix-recent';root.className='argus-pix-recent';
     root.setAttribute('aria-label','QR Codes Pix gerados recentemente');
     root.innerHTML='<div class="argus-pix-recent-heading"><div><h3>QR Codes recentes</h3><p>Consulte as cobranças que você gerou.</p></div><button type="button" id="argus-pix-recent-refresh" class="btn secondary" aria-label="Atualizar cobranças Pix">Atualizar</button></div><div id="argus-pix-recent-body" aria-live="polite"></div>';
     placeholder.before(root);
     by('argus-pix-recent-refresh').addEventListener('click',()=>refresh(true));
     root.addEventListener('click',onAction);
   }
   return root;
 }
 function ageLabel(row){
   const time=parseUtc(row.created_at);
   return time?new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(time)):'Data indisponível';
 }
 function countdown(row){
   if(displayStatus(row)!=='pending')return '';
   const remain=Math.max(0,expiry(row)-Date.now());
   if(remain<=0)return '';
   const minutes=Math.ceil(remain/60000);
   return ' · '+minutes+' min restantes';
 }
 function render(){
   const root=ensure();if(!root)return;
   const p=panel(),target=by('argus-pix-recent-body');
   const latest=rows.filter(x=>valid(x.id)).slice(0,8);
   p.classList.toggle('argus-pix-has-recents',latest.length>0);
   if(latest.length===0){
     target.innerHTML='<p class="argus-pix-empty">Ainda não há cobranças recentes. Digite o valor acima para gerar seu primeiro Pix.</p>';
     return;
   }
   target.innerHTML='<div class="argus-pix-recent-list">'+latest.map(row=>{
     const status=displayStatus(row);
     const canView=!!row.can_view_qr && status!=='expired'&&expiry(row)>Date.now();
     const canCheck=!!row.can_reconcile && ['pending','unknown'].includes(status) && !manualBusy.has(row.id) && expiry(row)>Date.now();
     const message=status==='expired'?'Prazo de 30 minutos encerrado':
       status==='paid'?'Pagamento confirmado pela ARGUS Pay':
       status==='pending'?'Aguardando confirmação'+countdown(row):
       status==='unknown'?'Em verificação pelo provedor':'Confira o histórico';
     return '<article class="argus-pix-recent-item" data-argus-charge="'+safe(row.id)+'">'+
       '<div class="argus-pix-recent-symbol" aria-hidden="true">▦</div>'+
       '<div class="argus-pix-recent-info"><div class="argus-pix-recent-main">'+
       '<strong>'+brl(row.amount_cents)+'</strong><span class="argus-pix-pill '+safe(status)+'">'+safe(statusLabels[status]||status)+'</span>'+
       '</div><p>'+safe(message)+'</p><small>'+safe(ageLabel(row))+'</small></div>'+
       '<div class="argus-pix-recent-actions">'+
       (canView?'<button type="button" data-argus-view="'+safe(row.id)+'">Ver Pix</button>':
        status==='expired'?'<span class="argus-pix-expired-label">Expirado</span>':
        '<button type="button" data-argus-details="'+safe(row.id)+'">Detalhes</button>')+
       (canCheck?'<button type="button" data-argus-check="'+safe(row.id)+'">Conciliar</button>':'')+
       '</div></article>';
   }).join('')+'</div>';
 }
 async function refresh(force=false){
   if(loading||typeof api!=='function')return;
   if(!force && Date.now()-lastLoaded<4000)return;
   loading=true;
   const root=ensure();
   if(root&&!rows.length)by('argus-pix-recent-body').innerHTML='<p class="argus-pix-loading">Carregando suas cobranças...</p>';
   try{
     const data=await api('/api/admin/quick-pix');
     if(!Array.isArray(data))throw Error('Formato de cobranças inesperado');
     rows=data.filter(x=>valid(x.id));
     lastLoaded=Date.now();
     render();
     decoratePayments();
   }catch(e){
     if(root&&!rows.length)by('argus-pix-recent-body').textContent='As cobranças recentes não puderam ser consultadas agora.';
     if(force&&typeof toast==='function')toast('Não foi possível atualizar os Pix recentes: '+e.message,true);
   }finally{loading=false;}
 }
 function details(row){
   const status=displayStatus(row);
   const title=status==='expired'?'QR Code expirado':'Detalhes da cobrança Pix';
   const text=status==='expired'?
     'O prazo de 30 minutos terminou. Este QR Code não deve ser compartilhado. O status de pagamento só é considerado aprovado após consulta autenticada ao provedor.':
     'Esta cobrança não tem um QR Code disponível nesta integração. Não gere uma cobrança repetida enquanto o protocolo estiver incerto.';
   if(typeof dialog==='function')dialog(title,'<div class="argus-pix-expired-detail"><strong>'+brl(row.amount_cents)+'</strong><p>'+safe(text)+'</p><small>Gerado em '+safe(ageLabel(row))+'</small></div>','ARGUS PAY');
   else if(typeof toast==='function')toast(text,status!=='expired');
 }
 async function view(id){
   const row=rows.find(x=>x.id===id);
   if(!row||displayStatus(row)==='expired'||expiry(row)<=Date.now()){if(row)details(row);else if(typeof toast==='function')toast('Cobrança não encontrada.',true);return;}
   try{
     const result=await api('/api/admin/quick-pix/'+encodeURIComponent(id));
     if(!result||result.id!==id||!result.pix_copy_paste)throw Error('Este Pix não possui QR Code disponível.');
     if(displayStatus(result)==='expired'||expiry(result)<=Date.now()){await refresh(true);details(result);return;}
     // Reuse the original small QR renderer, full Pix copy and the *same* popup.
     // Historical paid views are informational; they must never celebrate as a new payment.
     shown={...result,_fromHistory:true};
     if(typeof window.showChargeReceipt!=='function')throw Error('Visualizador de QR Code indisponível');
     window.showChargeReceipt(shown);
     if(!page()?.hidden)await refresh(true);
   }catch(e){if(typeof toast==='function')toast('Não foi possível abrir a cobrança: '+e.message,true);}
 }
 async function reconcile(id){
   const row=rows.find(x=>x.id===id);
   if(!row){if(typeof toast==='function')toast('Cobrança não encontrada.',true);return;}
   const status=displayStatus(row);
   if(status==='expired'||expiry(row)<=Date.now()){details(row);return;}
   if(status==='paid'){if(typeof toast==='function')toast('Este Pix já foi confirmado pela ARGUS Pay.');return;}
   if(!String(row.provider_id||'').startsWith('tr_')){
     if(typeof toast==='function')toast('Cobrança antiga de outra integração. Consulte o provedor; nenhum novo Pix será gerado.',true);return;
   }
   if(manualBusy.has(id))return;
   manualBusy.add(id);render();
   try{
     const res=await post('/api/admin/quick-pix/'+encodeURIComponent(id)+'/reconcile');
     if(res?.charge?.id&&res.charge.id!==id)throw Error('A resposta não corresponde à cobrança consultada.');
     const newStatus=String(res?.status||res?.charge?.display_status||res?.charge?.status||'unknown');
     if(typeof toast==='function')toast(newStatus==='paid'?'Pagamento confirmado pela ARGUS Pay.':
       newStatus==='expired'?'O prazo do QR Code terminou.':'Situação consultada: '+(statusLabels[newStatus]||newStatus));
     await refresh(true);
     if(typeof loadPayments==='function'&&!by('page-payments')?.hidden)await loadPayments();
   }catch(e){
     if(typeof toast==='function')toast('Não foi possível conciliar este Pix: '+e.message+'. O pagamento não foi alterado.',true);
   }finally{manualBusy.delete(id);render();}
 }
 function onAction(event){
   const button=event.target.closest('button[data-argus-view],button[data-argus-check],button[data-argus-details]');
   if(!button)return;event.preventDefault();
   const id=button.dataset.argusView||button.dataset.argusCheck||button.dataset.argusDetails;
   if(!valid(id))return;
   if(button.dataset.argusView)view(id);
   else if(button.dataset.argusCheck)reconcile(id);
   else {const row=rows.find(x=>x.id===id);if(row)details(row);}
 }
 function decoratePayments(){
   // Existing transactions screen renders its own responsive table. Keep that
   // structure intact and update only the status/actions of traditional qpx_ rows.
   const table=by('payment-rows');if(!table)return;
   for(const tr of table.querySelectorAll('tr')){
     const id=(tr.querySelector('td[data-label="CLIENTE"]')?.textContent||'').match(/qpx_[a-f0-9]{32}/)?.[0];
     if(!valid(id))continue;
     const row=rows.find(x=>x.id===id);
     const fallback=Array.isArray(state?.payments)?state.payments.find(x=>x.id===id):null;
     const source=row||fallback;if(!source)continue;
     const status=displayStatus(source),pill=tr.querySelector('td[data-label="STATUS"] .demo-status-pill');
     if(pill){
       const label=statusLabels[status]||status;
       if(pill.textContent!==label)pill.textContent=label;
       const kind=status==='paid'?'paid':status==='expired'||status==='failed'?'failed':'pending';
       const cls='demo-status-pill demo-status-'+kind;
       if(pill.className!==cls)pill.className=cls;
     }
     const view=tr.querySelector('button[data-viewpix]');
     if(view)view.textContent=status==='expired'?'Detalhes':'Ver Pix';
     const reconcile=tr.querySelector('button[data-reconcile]');
     if(reconcile)reconcile.hidden=!row?.can_reconcile||!['pending','unknown'].includes(status);
   }
 }
 async function handleOldPaymentAction(event){
   // Older transaction rows link qpx_ charges to the Finance route and show a
   // second, incorrect text-only modal. Replace *only* qpx_ actions.
   const button=event.target.closest?.('button[data-viewpix],button[data-reconcile]');
   if(!button)return;
   const id=button.dataset.viewpix||button.dataset.reconcile;
   if(!valid(id))return;
   event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
   if(!rows.find(x=>x.id===id))await refresh(true);
   if(button.dataset.viewpix)view(id);
   else reconcile(id);
 }
 function tick(){
   if(!rows.length)return;
   const expiredShown=shown&&displayStatus(shown)==='expired'&&expiry(shown)<=Date.now();
   if(expiredShown&&by('argus-pix-popup-overlay')?.hidden===false){
     window.dispatchEvent(new CustomEvent('argus:pix-qr-expired',{detail:{id:shown.id}}));
     shown=null;
     if(typeof toast==='function')toast('O QR Code venceu após 30 minutos. Consulte o status no histórico.');
   }
   if(page()&&!page().hidden)render();
   if(by('page-payments')&&!by('page-payments').hidden)decoratePayments();
 }
 function init(){
   if(historyReady)return;historyReady=true;
   ensure();
   document.addEventListener('click',handleOldPaymentAction,true);
   const transactions=by('payment-rows');
   if(transactions)new MutationObserver(decoratePayments).observe(transactions,{childList:true});
   decoratePayments();
   const prev=window.showChargeReceipt;
   if(typeof prev==='function'){
     window.showChargeReceipt=function(data){
       const out=prev.apply(this,arguments);
       if(data?.id&&valid(data.id)){
         shown=data;
         // The backend has already created the charge; only update its history.
         setTimeout(()=>refresh(true),100);
       }
       return out;
     };
   }
   if(typeof loadPage==='function'){
     const previous=loadPage;
     loadPage=async function(tab){
       const result=await previous.apply(this,arguments);
       if(tab==='charge-create'||tab==='payments')await refresh();
       return result;
     };
   }
   // Initial list, then refresh only while authenticated and the page is active.
   setTimeout(()=>refresh(true),950);
   window.addEventListener('focus',()=>{if(page()&&!page().hidden)refresh(true)});
   document.addEventListener('visibilitychange',()=>{if(!document.hidden&&page()&&!page().hidden)refresh(true)});
   setInterval(()=>{tick();if(!document.hidden&&(page()&&!page().hidden || by('page-payments')&&!by('page-payments').hidden))refresh(true)},20000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
 else init();
})();