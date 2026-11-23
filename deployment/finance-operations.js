/* ARGUS financial controls — read-only admin health and private CSV statements. */
(()=>{
'use strict';
if(window.__argusFinanceOperations)return;
window.__argusFinanceOperations=true;
const E=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(v)||0)/100);
const admin=()=>typeof state!=='undefined'&&state?.user?.role==='superadmin';
function day(n=0){const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
let loading=false,updated=0;
function row(label,count,bad=false){
 return '<article class="argus-op-metric'+(bad?' is-alert':'')+'"><small>'+esc(label)+'</small><strong>'+Number(count||0).toLocaleString('pt-BR')+'</strong></article>';
}
function details(title,rows,render){
 return '<details class="argus-op-details"><summary><strong>'+esc(title)+'</strong><span>'+rows.length+' registros</span></summary>'+
  (rows.length?'<div class="argus-op-items">'+rows.map(render).join('')+'</div>':
   '<p>Sem ocorrências nesta categoria.</p>')+'</details>';
}
function item(r){return '<div class="argus-op-item"><strong>'+esc(r.name||r.id||'Registro')+
 '</strong><small>'+esc(r.account_id||'')+' · '+esc(r.created_at||r.status||'')+'</small></div>'}
function show(data,preflight){
 const setting=data.settings||{},alerts=E('argus-operations-alerts'),stateEl=E('argus-operations-status');
 if(!alerts||!stateEl)return;
 const cycle=setting.reconciliation_worker||{};
 const gate=preflight||{};
 const finance=gate.finance||{},traditional=gate.traditional||{},payout=gate.payout||{};
 const blocked=[];
 if(!setting.database_persistent)blocked.push("Banco financeiro persistente indisponível nesta instância.");
 else if(setting.database_shared===true)blocked.push("Banco PostgreSQL compartilhado: backup/restauração independente ainda precisa ser comprovado.");
 if(!setting.custody_configuration_confirmed)blocked.push("Custódia do PSP sem confirmação operacional nesta instância.");
 if(finance.provider==="credentials_rejected"||finance.provider==="legacy_misticpay_keys")blocked.push("Finance QR Codes: credenciais rejeitadas ou incompatíveis. Não reutilize o par de outra API.");
 else if(finance.ready_to_attempt!==true)blocked.push("Finance QR Codes: autorização não comprovada por consulta autenticada.");
 if(traditional.transaction_read_scope!=="verified")blocked.push("API Pix tradicional: permissão de consulta TRANSACTION_READ ainda não confirmada.");
 if(payout.ready_to_request!==true)blocked.push("Saques: requisitos locais incompletos; nenhum saque foi realizado nesta verificação.");
 else blocked.push("Saques: configuração local presente, mas WITHDRAW_CREATE e liquidação real não foram verificados.");
 if(cycle.fresh!==true)blocked.push("Conciliação: execução recente não confirmada.");
 const checkText=(s)=>'<p class="argus-preflight-line">'+esc(s)+'</p>';
 const preflightMarkup='<section class="argus-op-panel argus-preflight" id="argus-finance-preflight">'+
 '<h2>Pré-homologação financeira — diagnóstico somente leitura</h2>'+
 '<p>O funcionamento da página e a criação de um QR Code não comprovam recebimento, conciliação ou autorização de saque.</p>'+
 '<div class="argus-preflight-list">'+blocked.map(checkText).join('')+'</div>'+
 '<div class="argus-preflight-states"><span>Finance QR Codes: '+esc(finance.provider||"não verificado")+'</span>'+
 '<span>API tradicional: '+esc(traditional.transaction_read_scope||"não verificado")+'</span>'+
 '<span>Saques: '+esc(payout.reason||"escopos não verificados")+'</span></div>'+
 '<p class="argus-op-disclaimer">Nenhuma operação financeira foi enviada nesta conferência. Acesso restrito ao Super Admin; não divulgue credenciais em mensagens.</p></section>';
 const settings=[['Banco persistente',setting.database_persistent],['Custódia configurada',setting.custody_configuration_confirmed],
 ['Saques habilitados',setting.payouts_enabled],
 ['Processador configurado',setting.background_reconciliation_configured],
 ['Conferência recente (5 min)',cycle.fresh===true],
 ['Agendador independente verificado',cycle.schedule_external_verified===true],
 ['E-mail de recuperação',setting.email_delivery_configured],
 ['Banco exclusivo da ARGUS',setting.database_persistent===true&&setting.database_shared===false]];
 alerts.innerHTML=preflightMarkup+'<div class="argus-op-grid">'+
  row('Carteiras conferidas',data.wallets_checked)+row('Divergências de saldo',data.ledger_mismatches?.length,!!data.ledger_mismatches?.length)+
  row('Ajustes de saldo',data.wallet_debts?.length,!!data.wallet_debts?.length)+
  row('Saques incertos',data.uncertain_withdrawals?.length,!!data.uncertain_withdrawals?.length)+
  row('Cobranças antigas',data.old_pending_charges?.length,!!data.old_pending_charges?.length)+
  row('Pix com status incerto',data.unknown_charges?.length,!!data.unknown_charges?.length)+
  '</div><section class="argus-op-panel"><h2>Condições locais de operação</h2>'+
  '<div class="argus-op-settings">'+settings.map(([name,ok])=>
  '<div><span>'+esc(name)+'</span><strong class="'+(ok?'good':'warning')+'">'+
   (ok?'Configurado':'Pendente / desativado')+'</strong></div>').join('')+'</div>'+
  '<p class="argus-op-disclaimer">'+esc(data.warning)+'</p></section>'+
  '<section class="argus-op-panel"><h2>Pendências para análise</h2>'+
  details('Saldo diferente do livro-razão',data.ledger_mismatches||[],r=>
    '<div class="argus-op-item"><strong>'+esc(r.name)+' · '+esc(r.account_id)+'</strong><small>'+
    'Dif. disponível '+money(r.available_delta_cents)+', reservado '+money(r.held_delta_cents)+
    ', ajuste '+money(r.debt_delta_cents)+'</small></div>')+
  details('Carteiras com valores negativos',data.negative_wallets||[],item)+
  details('Carteiras com dívida / estorno',data.wallet_debts||[],r=>
    '<div class="argus-op-item"><strong>'+esc(r.name)+' · '+esc(r.account_id)+
    '</strong><small>Ajuste: '+money(r.debt_cents)+'</small></div>')+
  details('Saques com resultado incerto',data.uncertain_withdrawals||[],item)+
  details('Saques aguardando conclusão',data.stale_withdrawals||[],item)+
  details('Cobranças pendentes há mais de 30 minutos',data.old_pending_charges||[],item)+
  details('Cobranças com resultado incerto',data.unknown_charges||[],item)+'</section>';
 const exceptions=(data.ledger_mismatches||[]).length+(data.negative_wallets||[]).length+
  (data.uncertain_withdrawals||[]).length;
 stateEl.textContent=!setting.background_reconciliation_configured?
 'Conciliação em segundo plano não configurada. Status podem ficar desatualizados.':
 cycle.fresh!==true?
 'Conciliação sem execução recente confirmada. Último ciclo: '+(cycle.last_cycle_utc||'não registrado')+'.':
 exceptions?'Atenção: existem operações que precisam de conferência, sem reenvio automático.':
 'Último ciclo financeiro: '+(cycle.last_cycle_utc||'não registrado')+' UTC. Confira outras pendências.';
 stateEl.classList.toggle('is-warning',exceptions>0||!setting.background_reconciliation_configured||cycle.fresh!==true);
}
async function load(force=false){
 if(!admin()||loading||(!force&&Date.now()-updated<15000))return;
 loading=true;const status=E('argus-operations-status');if(status)status.textContent='Verificando livro-razão e operações…';
 try{
  const [health,overview]=await Promise.all([
    api('/api/admin/merchant-wallet/health'),
    api('/api/admin/merchant-wallet/overview')
  ]);
  if(health?.read_only!==true)throw Error('Diagnóstico não autenticado');
  // These endpoints only query provider capabilities or local readiness.
  // Partial failures must not hide the wallet/ledger audit.
  const checks=await Promise.allSettled([
    api('/api/admin/pix/diagnostics'),
    api('/api/admin/quick-pix/config'),
    api('/api/admin/payouts/readiness')
  ]);
  const verified=(index)=>checks[index].status==='fulfilled'&&checks[index].value&&typeof checks[index].value==='object'?checks[index].value:{};
  show(health,{finance:verified(0),traditional:verified(1),payout:verified(2)});
  const select=E('argus-operations-export')?.elements.namedItem('account_id');
  if(select){
    const prior=select.value,accounts=overview.wallets||[];
    select.innerHTML='<option value="">Todos os revendedores</option>'+
      accounts.map(a=>'<option value="'+esc(a.account_id)+'">'+esc(a.display_name||a.account_id)+'</option>').join('');
    if(accounts.some(a=>a.account_id===prior))select.value=prior;
  }
  updated=Date.now();
 }catch(err){if(status){status.textContent='Falha ao conferir: '+err.message;status.classList.add('is-warning')}}
 finally{loading=false}
}
function initAdmin(){
 const form=E('argus-operations-export');if(!form)return;
 form.elements.namedItem('from').value=day(-29);
 form.elements.namedItem('to').value=day();
 E('argus-operations-refresh')?.addEventListener('click',()=>load(true));
 form.addEventListener('submit',event=>{
  event.preventDefault();if(!admin())return;
  const from=form.elements.namedItem('from').value,to=form.elements.namedItem('to').value;
  if(from>to||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))return;
  const params=new URLSearchParams({from,to});
  const id=form.elements.namedItem('account_id').value;if(id)params.set('account_id',id);
  window.location.assign('/api/admin/merchant-wallet/export.csv?'+params);
 });
}
function initSeller(){
 const dash=E('dashboard');if(!dash)return;
 function attach(){
  if(dash.hidden||E('argus-seller-csv'))return;
  const dest=E('argus-reseller-page-overview')||dash.querySelector('.dash-top');
  if(!dest)return;
  const box=document.createElement('section');box.id='argus-seller-csv';box.className='argus-seller-csv';
  box.innerHTML='<div><strong>Meu extrato financeiro</strong>'+
   '<p>Baixe um arquivo CSV com movimentos e taxas somente da sua conta. Horários em UTC.</p></div>'+
   '<form id="argus-seller-csv-form"><label>Início<span class="argus-date-shell"><input type="date" name="from" required></span></label>'+
   '<label>Fim<span class="argus-date-shell"><input type="date" name="to" required></span></label>'+
   '<button type="submit">Baixar extrato</button></form>';
  dest.append(box);
  const form=E('argus-seller-csv-form');
  form.elements.namedItem('from').value=day(-29);form.elements.namedItem('to').value=day();
  form.addEventListener('submit',event=>{
    event.preventDefault();if(dash.hidden)return;
    const from=form.elements.namedItem('from').value,to=form.elements.namedItem('to').value;
    if(from>to||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))return;
    window.location.assign('/api/portal/wallet/export.csv?'+new URLSearchParams({from,to}));
  });
 }
 new MutationObserver(attach).observe(dash,{attributes:true,attributeFilter:['hidden']});
 if(!dash.hidden)attach();
}
if(typeof loadPage==='function'){
 const old=loadPage;
 loadPage=async function(page){if(page==='operations')return load(true);return old.apply(this,arguments)};
}
if(typeof navigate==='function'){
 const old=navigate;
 navigate=function(page){if(page==='operations'&&!admin())return;return old.apply(this,arguments)};
}
function init(){initAdmin();initSeller()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
