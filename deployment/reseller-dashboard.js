/* ARGUS Pay — reseller workspace, styled to match the administration panel.
 * Existing live KYC, API, Pix and withdrawal DOM nodes are MOVED (not cloned
 * or replaced). All original event listeners, guards and balances remain.
 */
(()=>{
'use strict';
if(window.__argusResellerWorkspace)return;
window.__argusResellerWorkspace=true;
const E=id=>document.getElementById(id);
const titles={
 overview:'Visão geral',charges:'Cobrar com Pix',history:'Cobranças',
 wallet:'Saldo e saques',statement:'Extrato',integrations:'Integrações',
 registration:'Perfil e documentos',assistant:'Assistente Argus'
};
const pages=Object.keys(titles);
const icons={
 overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 charges:'<path d="M12 3v18M3 12h18"/>',
 history:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 wallet:'<path d="M20 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2M3 8h17"/><path d="M16 10h5v6h-5a3 3 0 1 1 0-6Z"/>',
 statement:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6m-6 4h6"/>',
 integrations:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-16-2 20"/>',
 registration:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2"/>',
 assistant:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
 refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 bell:'<path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>'
};
const icon=name=>'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+icons[name]+'</svg>';
const nav=name=>'<button type="button" class="menu-item" data-reseller-view="'+name+'">'+icon(name)+'<span>'+titles[name]+'</span></button>';
const page=(name,description,body='')=>'<section class="argus-reseller-page" id="argus-reseller-page-'+name+'" data-reseller-page="'+name+'" hidden>'+
 '<header class="argus-reseller-page-intro"><h2 tabindex="-1">'+titles[name]+'</h2><p>'+description+'</p></header>'+body+'</section>';
let initialized=false,current='overview',scheduled=false,drawer=false;
let drawerOrigin=null;
function shell(){
 const dash=E('dashboard');
 if(!dash||E('argus-reseller-workspace'))return;
 const wrapper=document.createElement('div');
 wrapper.id='argus-reseller-workspace';
 wrapper.className='argus-reseller-workspace admin-shell';
 wrapper.innerHTML=[
 '<aside class="argus-reseller-sidebar sidebar" id="argus-reseller-sidebar" aria-label="Menu do revendedor">',
 '<div class="argus-reseller-side-brand"><img src="/static/assets/argus-payments-logo-transparent.webp" alt="ARGUS Payments" width="170" height="56"><span>Painel do revendedor</span></div>',
 '<nav class="argus-reseller-nav side-menu" aria-label="Áreas da conta">',
 '<span class="argus-reseller-nav-caption">Operação</span>',nav('overview'),nav('charges'),nav('history'),
 '<span class="argus-reseller-nav-caption">Financeiro</span>',nav('wallet'),nav('statement'),
 '<span class="argus-reseller-nav-caption">Gestão</span>',nav('integrations'),nav('registration'),nav('assistant'),
 '</nav><div class="argus-reseller-side-bottom"><a href="/documentacao-api">Documentação API</a><a href="/instalar">Instalar no celular</a></div></aside>',
 '<div class="argus-reseller-drawer-backdrop" id="argus-reseller-backdrop" hidden></div>',
 '<div class="argus-reseller-main main" id="argus-reseller-main"><header class="argus-reseller-toolbar topbar">',
 '<button type="button" class="res-icon-button" id="argus-reseller-menu-button" aria-controls="argus-reseller-sidebar" aria-expanded="false" aria-label="Abrir menu do revendedor">'+icon('menu')+'</button>',
 '<div class="argus-reseller-toolbar-title"><strong id="argus-reseller-page-title">Visão geral</strong></div>',
 '<div class="argus-reseller-toolbar-actions" id="argus-reseller-toolbar-actions">',
 '<button type="button" class="res-icon-button" id="argus-reseller-notices" aria-label="Notificações" hidden>'+icon('bell')+'<i hidden></i></button>',
 '<button type="button" class="res-icon-button" id="res-refresh" aria-label="Atualizar carteira" title="Atualizar carteira" hidden>'+icon('refresh')+'</button>',
 '</div></header><div class="argus-reseller-content admin-content content">',
 '<section class="argus-reseller-page page" id="argus-reseller-page-overview" data-reseller-page="overview">',
 '<header class="res-overview-heading"><div><p id="res-welcome">Minha operação</p><h2 tabindex="-1">Visão geral</h2></div><button type="button" class="res-primary" data-reseller-view="charges">'+icon('charges')+'Nova cobrança Pix</button></header>',
 '<div id="argus-reseller-overview-top" hidden></div><div class="argus-reseller-overview-balances" id="argus-reseller-overview-balances" aria-label="Sua carteira"><p class="res-loading">Consultando sua carteira…</p></div>',
 '<div class="res-overview-grid"><div id="res-overview-report"></div><aside class="res-operations" aria-label="Ações da conta">',
 '<section class="res-card res-account"><h3>Situação da conta</h3><p id="res-account-state" role="status">Consultando cadastro…</p><button type="button" data-reseller-view="registration">Acompanhar cadastro '+icon('chevron')+'</button></section>',
 '<section class="res-card res-shortcuts"><h3>Ações rápidas</h3>',
 '<button type="button" data-reseller-view="history">'+icon('history')+'Consultar cobranças'+icon('chevron')+'</button>',
 '<button type="button" data-reseller-view="wallet">'+icon('wallet')+'Solicitar saque'+icon('chevron')+'</button>',
 '<button type="button" data-reseller-view="statement">'+icon('statement')+'Baixar extrato'+icon('chevron')+'</button>',
 '<button type="button" data-reseller-view="integrations">'+icon('integrations')+'Gerenciar API e webhooks'+icon('chevron')+'</button>',
 '</section></aside></div></section>',
 page('charges','Crie um QR Code e compartilhe o código Pix Copia e Cola.',
  '<div class="res-detail-grid"><div id="res-charge-form"></div><section class="res-card res-charge-receipt"><h3>Última cobrança</h3><p id="res-charge-placeholder">Ao gerar o Pix, o QR Code abre em uma janela.</p><div id="res-charge-result"></div></section></div>'),
 page('history','Localize cobranças recentes pelo status, pelo ID ou pelo valor.',
  '<section class="res-card res-history-controls" id="res-history-controls" hidden><label>Buscar cobrança<input type="search" id="res-charge-search" placeholder="ID ou valor" autocomplete="off"></label>'+
  '<label>Status<select id="res-charge-filter"><option value="">Todos</option><option value="paid">Pago</option><option value="pending">Aguardando</option><option value="expired">Expirado</option><option value="refunded">Devolvido</option><option value="checking">Em verificação</option><option value="failed">Não aprovado</option></select></label><p id="res-charge-count" role="status"></p></section>'),
 page('wallet','Confira o saldo, acompanhe valores reservados e consulte suas solicitações de saque.',
  '<div id="argus-reseller-wallet-balances"></div><div class="res-detail-grid"><div id="res-payout-form"></div><div id="res-payout-history"></div></div>'),
 page('statement','Escolha um intervalo para baixar as movimentações e taxas da sua conta.'),
 page('integrations','Configure o acesso à API e os avisos enviados ao seu sistema.',
  '<div class="res-integration-grid" id="res-integration-grid"></div>'),
 page('registration','Acompanhe a análise e atualize os dados da sua conta.',
  '<div class="res-detail-grid"><div id="res-profile-account"></div><div id="res-profile-verification"></div></div>'),
 page('assistant','Consulte as análises e os alertas da sua operação.'),
 '</div><nav class="res-mobile-nav" aria-label="Atalhos principais">'+nav('overview')+nav('charges')+nav('history')+nav('wallet')+'</nav></div>'
 ].join('');
 dash.insertBefore(wrapper,dash.firstChild);
 const top=dash.querySelector('.dash-top');
 const original=dash.querySelector('.grid');
 // The legacy customer greeting is an account detail, not the overview shell.
 move(top,E('res-profile-account'));
 move(original,E('res-profile-account'));
 move(E('api-panel'),E('res-integration-grid'));
 move(E('logout'),E('argus-reseller-toolbar-actions'));
 E('res-refresh').addEventListener('click',()=>E('seller-refresh')?.click());
 E('argus-reseller-notices').addEventListener('click',()=>E('an-bell')?.click());
 wrapper.addEventListener('click',event=>{
  const nav=event.target.closest('[data-reseller-view]');
  if(nav)select(nav.dataset.resellerView,{focus:true,updateHistory:true});
 });
 E('res-charge-search').addEventListener('input',filterCharges);
 E('res-charge-filter').addEventListener('change',filterCharges);
 E('argus-reseller-menu-button').addEventListener('click',()=>openDrawer(!drawer));
 E('argus-reseller-backdrop').addEventListener('click',()=>openDrawer(false,true));
 window.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&drawer){event.preventDefault();openDrawer(false,true);}
 });
 window.addEventListener('resize',()=>{
  if(window.innerWidth>=1000&&drawer)openDrawer(false);
 },{passive:true});
 window.addEventListener('hashchange',()=>select(fromHash()||'overview',{focus:true}));
 initialized=true;
 schedule();
 select(fromHash()||current);
}
function move(node,dest){
 if(node&&dest&&node.parentElement!==dest)dest.appendChild(node);
}
function openDrawer(value,restoreFocus=false){
 if(drawer===value)return;
 drawer=value;
 const sidebar=E('argus-reseller-sidebar');
 const btn=E('argus-reseller-menu-button');
 sidebar.classList.toggle('is-open',drawer);
 E('argus-reseller-backdrop').hidden=!drawer;
 btn.setAttribute('aria-expanded',String(drawer));
 document.body.classList.toggle('res-drawer-open',drawer);
 if(drawer){
  drawerOrigin=document.activeElement;
  const active=sidebar.querySelector('[aria-current="page"]')||sidebar.querySelector('button');
  active?.focus();
  E('argus-reseller-main').inert=true;
 }else{
  E('argus-reseller-main').inert=false;
  if(restoreFocus)drawerOrigin?.focus();
 }
}
function fromHash(){
 const hash=window.location.hash;
 const pageName=hash.slice('#argus-reseller-page-'.length);
 if(hash.startsWith('#argus-reseller-page-')&&pages.includes(pageName))return pageName;
 if(/^(?:#api-panel|#seller-key|#argus-webhook)/.test(hash))return 'integrations';
 if(/^(?:#seller-deposit|#seller-pix)/.test(hash))return 'charges';
 if(/^#seller-withdraw/.test(hash))return 'wallet';
 if(/^#seller-sales/.test(hash))return 'history';
 if(/^#argus-seller-csv/.test(hash))return 'statement';
 if(/^(?:#kyc-|#documents)/.test(hash))return 'registration';
 return null;
}
function select(id,{focus=false,updateHistory=false}={}){
 if(!initialized||!pages.includes(id))return;
 current=id;
 move(E('seller-balances'),E(id==='wallet'?'argus-reseller-wallet-balances':'argus-reseller-overview-balances'));
 for(const page of pages)E('argus-reseller-page-'+page).hidden=(page!==id);
 document.querySelectorAll('#argus-reseller-workspace nav [data-reseller-view]').forEach(button=>{
  const active=button.dataset.resellerView===id;
  button.classList.toggle('selected',active);
  if(active)button.setAttribute('aria-current','page');
  else button.removeAttribute('aria-current');
 });
 E('argus-reseller-page-title').textContent=titles[id];
 if(!E('dashboard').hidden)document.title=titles[id]+' · ARGUS Pay';
 if(updateHistory){
  const hash='#argus-reseller-page-'+id;
  if(window.location.hash!==hash)history.pushState(null,'',hash);
 }
 openDrawer(false);
 if(focus){
  E('argus-reseller-page-'+id).querySelector('h2')?.focus({preventScroll:true});
  window.scrollTo(0,0);
 }
}
function setHidden(element,hidden){
 if(element.hidden!==hidden)element.hidden=hidden;
}
function filterCharges(){
 const list=E('seller-sales');
 const controls=E('res-history-controls');
 if(!list||!controls)return;
 const rows=[...list.querySelectorAll('[data-charge-status]')];
 setHidden(controls,!rows.length);
 const normalize=value=>value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g,'');
 const query=normalize(E('res-charge-search').value.trim());
 const status=E('res-charge-filter').value;
 let visible=0;
 for(const row of rows){
  const matchStatus=!status||row.dataset.chargeStatus===status||
   (status==='checking'&&['unknown','creating'].includes(row.dataset.chargeStatus));
  const filtered=!matchStatus||!normalize(row.textContent).includes(query);
  setHidden(row,filtered);
  // The premium card stylesheet uses display:grid!important. The hidden
  // attribute alone therefore cannot hide filtered records in mobile Safari.
  if(filtered)row.style.setProperty('display','none','important');
  else row.style.removeProperty('display');
  if(!filtered)visible++;
 }
 const count=rows.length?(visible===1?'1 cobrança encontrada':visible+' cobranças encontradas'):'';
 const counter=E('res-charge-count');
 if(counter.textContent!==count)counter.textContent=count;
 // Accessible empty result: do not confuse the user with visible rows
 // after the counter correctly reaches zero.
 let empty=E('res-charge-empty');
 if(rows.length&&visible===0){
  if(!empty){
   empty=document.createElement('p');
   empty.id='res-charge-empty';
   empty.className='res-filter-empty';
   empty.setAttribute('role','status');
   list.appendChild(empty);
  }
  empty.textContent='Nenhuma cobrança corresponde aos filtros selecionados. Escolha outro status ou limpe a busca.';
  empty.hidden=false;
 }else if(empty){
  empty.hidden=true;
 }
}
function updateHeader(){
 const dashboard=E('dashboard');
 const greeting=E('hello')?.textContent.trim();
 const welcome=E('res-welcome');
 if(greeting&&welcome.textContent!==greeting)welcome.textContent=greeting;
 const state=window.ArgusResellerStage;
 const labels={
  documents_required:'Envie seus documentos',documents_under_review:'Documentos em análise',
  rejected:'Revise a análise dos documentos',suspended:'Conta suspensa'
 };
 const status=labels[state?.status]||(state?.financial_authorized?'Cadastro financeiro autorizado':
  state?.identity_approved?'Identidade aprovada · liberação financeira pendente':'Cadastro em avaliação');
 const account=E('res-account-state');
 const message=state?status:'Consultando cadastro…';
 if(account.textContent!==message)account.textContent=message;
 account.classList.toggle('res-status-ok',state?.financial_authorized===true&&state.status==='approved');
 const bell=E('an-bell');
 const notices=E('argus-reseller-notices');
 setHidden(notices,!bell);
 if(bell)setHidden(notices.querySelector('i'),E('an-badge')?.hidden!==false);
 setHidden(E('res-refresh'),!E('seller-refresh'));
 if(!dashboard.hidden)document.title=titles[current]+' · ARGUS Pay';
}
function arrange(){
 if(!initialized)return;
 const dashboard=E('dashboard');
 if(!dashboard)return;
 // Existing session verification remains the sole controller of auth state.
 document.body.classList.toggle('argus-reseller-ready',!dashboard.hidden);
 if(dashboard.hidden)openDrawer(false);
 const verification=E('res-profile-verification');
 move(E('argus-reseller-approval'),verification);
 move(E('kyc-client-root'),verification);
 move(E('portal-identity-prompt'),E('res-profile-account'));
 move(E('ar-seller-revenue'),E('res-overview-report'));
 move(E('argus-seller-csv'),E('argus-reseller-page-statement'));
 move(E('argus-portal-ai'),E('argus-reseller-page-assistant'));
 updateHeader();
 const account=E('res-profile-account');
 const grid=account.querySelector('.grid')||dashboard.querySelector('.grid');
 move(grid,account);
 move(E('api-panel'),E('res-integration-grid'));
 const merchant=E('argus-seller-root');
 if(!merchant)return;
 // The original merchant widget is injected inside the legacy greeting card.
 // Detach its container before moving its child panels, preventing nested cards.
 const parking=E('argus-reseller-merchant-parking')||document.createElement('div');
 if(!parking.id){parking.id='argus-reseller-merchant-parking';parking.className='argus-reseller-merchant-parking';E('argus-reseller-workspace').appendChild(parking);}
 move(merchant,parking);
 E('argus-reseller-overview-balances').querySelector('.res-loading')?.remove();
 move(E('seller-balances'),current==='wallet'?E('argus-reseller-wallet-balances'):E('argus-reseller-overview-balances'));
 // All original element references and event listeners remain intact.
 for(const section of merchant.querySelectorAll('.seller-panel')){
  if(section.querySelector('#seller-withdraw-form'))
   move(section,E('res-payout-form'));
  else if(section.querySelector('#seller-deposit-form'))
   move(section,E('res-charge-form'));
  else if(section.querySelector('#seller-sales'))
   move(section,E('argus-reseller-page-history'));
 }
 const pixResult=E('seller-pix-result');
 move(pixResult,E('res-charge-result'));
 const placeholder=E('res-charge-placeholder');
 setHidden(placeholder,!!pixResult?.hasChildNodes());
 move(E('seller-payout-history'),E('res-payout-history'));
 merchant.classList.add('argus-reseller-empty-hub');
 filterCharges();
}
function schedule(){
 if(scheduled)return;
 scheduled=true;
 requestAnimationFrame(()=>{
  scheduled=false;
  if(!initialized)return;
  arrange();
 });
}
function start(){
 const dashboard=E('dashboard');
 if(!dashboard)return;
 shell();
 const observer=new MutationObserver(schedule);
 observer.observe(dashboard,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 const watchNotifications=()=>{
  const widget=E('argus-notification-widget');
  if(widget)observer.observe(widget,{subtree:true,attributes:true,attributeFilter:['hidden']});
  schedule();
 };
 new MutationObserver(watchNotifications).observe(document.body,{childList:true});
 watchNotifications();
 document.addEventListener('argus:reseller-stage',schedule);
 document.addEventListener('click',event=>{
  const link=event.target.closest('a[href="#api-panel"]');
  if(!link||dashboard.hidden)return;
  event.preventDefault();
  select('integrations',{focus:true,updateHistory:true});
 });
 window.addEventListener('pageshow',schedule);
 schedule();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();
