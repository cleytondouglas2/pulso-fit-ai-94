/* ARGUS Pay — reseller workspace, styled to match the administration panel.
 * Existing live KYC, API, Pix and withdrawal DOM nodes are MOVED (not cloned
 * or replaced). All original event listeners, guards and balances remain.
 */
(()=>{
'use strict';
if(window.__argusResellerWorkspace)return;
window.__argusResellerWorkspace=true;
const E=id=>document.getElementById(id);
const pages=['overview','registration','charges','wallet','integrations','history'];
const titles={
 overview:'Visão geral',registration:'Cadastro e documentos',
 charges:'Gerar cobrança Pix',wallet:'Saldo e saques',
 integrations:'Chaves e integrações',history:'Histórico de cobranças'
};
let initialized=false,current='overview',scheduled=false,drawer=false;
let observer=null;
function shell(){
 const dash=E('dashboard');
 if(!dash||E('argus-reseller-workspace'))return;
 const wrapper=document.createElement('div');
 wrapper.id='argus-reseller-workspace';
 wrapper.className='argus-reseller-workspace admin-shell';
 wrapper.innerHTML=[
 '<aside class="argus-reseller-sidebar sidebar" id="argus-reseller-sidebar" aria-label="Menu do revendedor">',
 '<div class="argus-reseller-side-brand">',
 '<img src="/static/assets/argus-payments-logo-transparent.webp" alt="ARGUS Payments" width="170" height="56">',
 '<span>PAINEL DO REVENDEDOR</span></div>',
 '<nav class="argus-reseller-nav side-menu" aria-label="Áreas da conta">',
 '<button type="button" class="menu-item" data-reseller-view="overview"><span class="nav-glyph" aria-hidden="true">▦</span>Visão geral</button>',
 '<button type="button" class="menu-item" data-reseller-view="registration"><span class="nav-glyph" aria-hidden="true">◈</span>Cadastro e documentos</button>',
 '<button type="button" class="menu-item" data-reseller-view="charges"><span class="nav-glyph" aria-hidden="true">▣</span>Gerar Pix</button>',
 '<button type="button" class="menu-item" data-reseller-view="wallet"><span class="nav-glyph" aria-hidden="true">◉</span>Saldo e saques</button>',
 '<button type="button" class="menu-item" data-reseller-view="integrations"><span class="nav-glyph" aria-hidden="true">⌘</span>Chaves API</button>',
 '<button type="button" class="menu-item" data-reseller-view="history"><span class="nav-glyph" aria-hidden="true">◷</span>Histórico</button>',
 '</nav>',
 '<div class="argus-reseller-side-bottom"><a href="/" rel="noopener">Conhecer o ARGUS Pay</a>',
 '<a href="/documentacao-api">Documentação API</a><a href="/instalar">Instalar no celular</a>',
 '<small>Conta do revendedor · acesso individual</small></div></aside>',
 '<div class="argus-reseller-drawer-backdrop" id="argus-reseller-backdrop" hidden></div>',
 '<div class="argus-reseller-main main"><header class="argus-reseller-toolbar topbar">',
 '<button type="button" id="argus-reseller-menu-button" aria-controls="argus-reseller-sidebar" aria-expanded="false" aria-label="Abrir menu do revendedor">☰</button>',
 '<div class="argus-reseller-toolbar-title"><small>ARGUS PAYMENTS / REVENDEDOR</small>',
 '<strong id="argus-reseller-page-title">Visão geral</strong></div>',
 '<div class="argus-reseller-toolbar-actions" id="argus-reseller-toolbar-actions"></div>',
 '</header>',
 '<div class="argus-reseller-content admin-content content">',
 '<section class="argus-reseller-page page" id="argus-reseller-page-overview" data-reseller-page="overview">',
 '<div class="argus-reseller-page-intro section-top"><span>ARGUS PAY · REVENDEDOR</span><h2>Visão geral</h2>',
 '<p>Indicadores e movimentações da sua conta.</p></div>',
 '<div class="argus-reseller-overview-top" id="argus-reseller-overview-top"></div>',
 '<div class="argus-reseller-overview-balances" id="argus-reseller-overview-balances"></div>',
 '<div class="argus-reseller-shortcuts"><h3>Acesso rápido</h3>',
 '<div class="argus-reseller-shortcut-grid">',
 '<button type="button" class="menu-item" data-reseller-view="registration"><strong>◈ Cadastro e documentos</strong><small>Identidade e análise KYC</small></button>',
 '<button type="button" class="menu-item" data-reseller-view="charges"><strong>▣ Gerar Pix</strong><small>Cobranças e QR Codes</small></button>',
 '<button type="button" class="menu-item" data-reseller-view="wallet"><strong>◉ Saldo e saques</strong><small>Sua carteira individual</small></button>',
 '<button type="button" class="menu-item" data-reseller-view="integrations"><strong>⌘ Chaves API</strong><small>Integração com sites e sistemas</small></button>',
 '</div></div></section>',
 '<section class="argus-reseller-page" id="argus-reseller-page-registration" data-reseller-page="registration" hidden>',
 '<div class="argus-reseller-page-intro"><span>IDENTIDADE</span><h2>Cadastro e documentos</h2>',
 '<p>Consulte os dados da conta, a análise documental e o histórico de verificação.</p></div></section>',
 '<section class="argus-reseller-page" id="argus-reseller-page-charges" data-reseller-page="charges" hidden>',
 '<div class="argus-reseller-page-intro"><span>RECEBIMENTOS</span><h2>Gerar cobrança Pix</h2>',
 '<p>Gere cobranças Pix e acompanhe a confirmação do pagamento.</p></div></section>',
 '<section class="argus-reseller-page" id="argus-reseller-page-wallet" data-reseller-page="wallet" hidden>',
 '<div class="argus-reseller-page-intro"><span>FINANCEIRO</span><h2>Saldo e saques</h2>',
 '<p>Gerencie os saques disponíveis e acompanhe as solicitações da sua carteira.</p></div>',
 '<div id="argus-reseller-wallet-balances"></div></section>',
 '<section class="argus-reseller-page" id="argus-reseller-page-integrations" data-reseller-page="integrations" hidden>',
 '<div class="argus-reseller-page-intro"><span>DESENVOLVEDORES</span><h2>Chaves e integrações</h2>',
 '<p>Gere e gerencie credenciais individuais para conectar seu site, sistema ou bot.</p></div></section>',
 '<section class="argus-reseller-page" id="argus-reseller-page-history" data-reseller-page="history" hidden>',
 '<div class="argus-reseller-page-intro"><span>MOVIMENTAÇÕES</span><h2>Histórico de cobranças</h2>',
 '<p>Consulte os Pix gerados, pagamentos e cobranças pendentes.</p></div></section>',
 '</div></div>'
 ].join('');
 dash.insertBefore(wrapper,dash.firstChild);
 const top=dash.querySelector('.dash-top');
 const original=dash.querySelector('.grid');
 // The legacy customer greeting is an account detail, not the overview shell.
 move(top,E('argus-reseller-page-registration'));
 move(original,E('argus-reseller-page-registration'));
 move(E('api-panel'),E('argus-reseller-page-integrations'));
 // Keep the existing logout button and its original click handler.
 const logout=E('logout');
 move(logout,E('argus-reseller-toolbar-actions'));
 wrapper.addEventListener('click',event=>{
  const nav=event.target.closest('[data-reseller-view]');
  if(nav){select(nav.dataset.resellerView,{scroll:true});return}
 });
 E('argus-reseller-menu-button')?.addEventListener('click',()=>openDrawer(!drawer));
 E('argus-reseller-backdrop')?.addEventListener('click',()=>openDrawer(false));
 window.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&drawer)openDrawer(false);
 });
 window.addEventListener('resize',()=>{
  if(window.innerWidth>=1000&&drawer)openDrawer(false);
 },{passive:true});
 window.addEventListener('hashchange',()=>{
  const selected=fromHash();
  if(selected)select(selected,{scroll:true});
 });
 initialized=true;
 schedule();
 select(fromHash()||current);
}
function move(node,dest){
 if(node&&dest&&node.parentElement!==dest)dest.appendChild(node);
}
function openDrawer(value){
 drawer=!!value;
 const sidebar=E('argus-reseller-sidebar');
 const backdrop=E('argus-reseller-backdrop');
 const btn=E('argus-reseller-menu-button');
 if(sidebar)sidebar.classList.toggle('is-open',drawer);
 if(backdrop)backdrop.hidden=!drawer;
 if(btn){
  btn.setAttribute('aria-expanded',String(drawer));
  btn.setAttribute('aria-label',drawer?'Fechar menu do revendedor':'Abrir menu do revendedor');
 }
}
function fromHash(){
 const hash=window.location.hash;
 if(/^(?:#api-panel|#seller-key|#argus-reseller-page-integrations)/.test(hash))return 'integrations';
 if(/^(?:#seller-deposit|#argus-reseller-page-charges)/.test(hash))return 'charges';
 if(/^(?:#seller-withdraw|#argus-reseller-page-wallet)/.test(hash))return 'wallet';
 if(/^(?:#seller-sales|#argus-reseller-page-history)/.test(hash))return 'history';
 if(/^(?:#kyc-|#documents|#argus-reseller-page-registration)/.test(hash))return 'registration';
 if(hash==='#argus-reseller-page-overview')return 'overview';
 return null;
}
function select(id,options={}){
 if(!initialized||!pages.includes(id))return;
 current=id;
 const balances=E('seller-balances');
 if(balances)move(balances,E(id==='wallet'?'argus-reseller-wallet-balances':'argus-reseller-overview-balances'));
 for(const page of pages){
  const section=E('argus-reseller-page-'+page);
  if(section)section.hidden=(page!==id);
 }
 document.querySelectorAll('#argus-reseller-workspace [data-reseller-view]').forEach(b=>{
  const active=b.dataset.resellerView===id;
  b.classList.toggle('selected',active);
  if(b.closest('.argus-reseller-nav')){
   if(active)b.setAttribute('aria-current','page');
   else b.removeAttribute('aria-current');
  }
 });
 const title=E('argus-reseller-page-title');
 if(title)title.textContent=titles[id];
 openDrawer(false);
 if(options.scroll){
  const host=E('argus-reseller-workspace');
  if(host)host.scrollIntoView({behavior:'auto',block:'start'});
 }
}
function arrange(){
 if(!initialized)return;
 const dashboard=E('dashboard');
 if(!dashboard)return;
 // Existing session verification remains the sole controller of auth state.
 document.body.classList.toggle('argus-reseller-ready',!dashboard.hidden);
 move(E('kyc-client-root'),E('argus-reseller-page-registration'));
 // Registration and compliance live together, never inside the financial overview.
 move(E('argus-reseller-approval'),E('argus-reseller-page-registration'));
 const rev=E('ar-seller-revenue');
 if(rev&&rev.parentElement===E('argus-reseller-page-overview')){
  const balanceHost=E('argus-reseller-overview-balances');
  if(balanceHost)balanceHost.after(rev);
 }
 const grid=E('argus-reseller-page-registration').querySelector('.grid')||dashboard.querySelector('.grid');
 move(grid,E('argus-reseller-page-registration'));
 move(E('api-panel'),E('argus-reseller-page-integrations'));
 const merchant=E('argus-seller-root');
 if(!merchant)return;
 // The original merchant widget is injected inside the legacy greeting card.
 // Detach its container before moving its child panels, preventing nested cards.
 const parking=E('argus-reseller-merchant-parking')||document.createElement('div');
 if(!parking.id){parking.id='argus-reseller-merchant-parking';parking.className='argus-reseller-merchant-parking';E('argus-reseller-workspace').appendChild(parking);}
 move(merchant,parking);
 move(merchant.querySelector('.seller-head'),E('argus-reseller-overview-top'));
 move(E('seller-balances'),current==='wallet'?E('argus-reseller-wallet-balances'):E('argus-reseller-overview-balances'));
 // All original element references and event listeners remain intact.
 for(const section of [...document.querySelectorAll('#argus-reseller-workspace .seller-panel'),...merchant.querySelectorAll('.seller-panel')]){
  if(section.querySelector('#seller-key-create'))
   move(section,E('argus-reseller-page-integrations'));
  else if(section.querySelector('#seller-withdraw-form'))
   move(section,E('argus-reseller-page-wallet'));
  else if(section.querySelector('#seller-deposit-form'))
   move(section,E('argus-reseller-page-charges'));
  else if(section.querySelector('#seller-sales'))
   move(section,E('argus-reseller-page-history'));
 }
 merchant.classList.add('argus-reseller-empty-hub');
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
 const observer=new MutationObserver(mutations=>{
  // Asynchronous KYC/seller data requests can add the original cards later.
  if(mutations.some(m=>m.type==='childList'||(m.type==='attributes'&&m.attributeName==='hidden')))
   schedule();
 });
 observer.observe(dashboard,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 document.addEventListener('click',event=>{
  const link=event.target.closest('a[href="#api-panel"]');
  if(link&&E('argus-reseller-workspace'))select('integrations',{scroll:true});
 },true);
 window.addEventListener('pageshow',schedule);
 schedule();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();
