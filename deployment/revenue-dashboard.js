/* ARGUS Pay faturamento — somente dados auditados e autenticados. */
(()=>{
'use strict';
if(window.__argusRevenueDashboard)return;
window.__argusRevenueDashboard=true;
const E=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(v)||0)/100);
const shortDate=s=>{const p=String(s).split('-');return p.length===3?p[2]+'/'+p[1]:s};
let adminLoading=false,sellerLoading=false,adminLast=0,sellerLast=0;
const adm=()=>typeof state!=='undefined'&&state?.user?.role==='superadmin';
function changeBadge(o){
 if(!o)return '<span class="ar-revenue-trend neutral">Sem comparação</span>';
 const label=o.direction==='up'?'Melhorou':o.direction==='down'?'Caiu':'Estável';
 const direction=o.direction==='up'?'up':o.direction==='down'?'down':'neutral';
 const pct=o.no_baseline?(o.delta_cents?'· sem base anterior':'· sem vendas na referência'):
   '· '+(o.percent>0?'+':'')+Number(o.percent||0).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
 return '<span class="ar-revenue-trend '+direction+'">'+esc(label+pct)+'</span>';
}
function card(title,period,footer){
 return '<article class="ar-revenue-stat"><small>'+esc(title)+'</small>'+
   '<strong>'+money(period?.gross_cents)+'</strong><span>Bruto confirmado</span>'+
   '<p>Líquido após taxa: <b>'+money(period?.net_cents)+'</b></p>'+
   '<p>Pix recebidos: '+Number(period?.paid_count||0)+' · Estornos: '+Number(period?.refund_count||0)+'</p>'+
   (footer?'<div class="ar-revenue-foot">'+footer+'</div>':'')+'</article>';
}
function chart(points){
 const vals=points||[],top=Math.max(1,...vals.map(x=>Math.abs(Number(x.gross_cents)||0)));
 return '<div class="ar-revenue-chart" role="img" aria-label="Faturamento por dia nos últimos 14 dias">'+
  vals.map(p=>{
   const v=Number(p.gross_cents)||0,h=Math.round(100*Math.abs(v)/top);
   return '<div class="ar-revenue-bar-column" title="'+esc(shortDate(p.date)+' · '+money(v))+'">'+
     '<div class="ar-revenue-bar-space"><svg class="ar-revenue-bar'+(v<0?' is-refund':'')+'" viewBox="0 0 30 100" preserveAspectRatio="none" aria-hidden="true"><rect x="1" width="28" y="'+(100-h)+'" height="'+h+'" rx="3"/></svg></div>'+
     '<small>'+esc(shortDate(p.date))+'</small></div>';
  }).join('')+'</div>';
}
function summary(data,title){
 const p=data.periods||{};
 return '<header class="ar-revenue-heading"><div><small>ARGUS PAY · RESULTADOS</small><h2>'+esc(title)+'</h2>'+
   '<p>Somente Pix pagos e confirmados no histórico financeiro. Estornos descontados na data da devolução.</p></div>'+
   '<button type="button" class="ar-revenue-refresh" data-revenue-refresh>Atualizar</button></header>'+
   '<div class="ar-revenue-grid">'+
    card('Hoje',p.today,changeBadge(data.comparison_today)+'<small>vs. ontem até este horário</small>')+
    card('Ontem',p.yesterday,'<small>Dia completo</small>')+
    card('Este mês',p.month,changeBadge(data.comparison_month)+'<small>vs. período equivalente do mês anterior</small>')+
    card('Mês anterior',p.previous_month,'<small>Mês completo</small>')+
   '</div>'+
   '<section class="ar-revenue-panel"><div class="ar-revenue-panel-head"><h3>Evolução diária</h3>'+
   '<small>Últimos 14 dias · horário de Brasília (São Paulo)</small></div>'+chart(data.daily)+
   '<p class="ar-revenue-disclaimer">Faturamento não é saldo disponível: saques, reservas e ajustes de carteira são separados. Valores negativos podem refletir devoluções.</p></section>';
}
function sellerRows(rows){
 if(!rows?.length)return '<p>Nenhum revendedor cadastrado.</p>';
 return '<div class="ar-revenue-table-wrap"><table class="ar-revenue-table"><thead><tr>'+
 '<th>Revendedor</th><th>Hoje</th><th>Ontem</th><th>Este mês</th><th>Mês anterior</th><th>Desempenho mensal</th>'+
 '</tr></thead><tbody>'+rows.map(r=>'<tr><th scope="row"><strong>'+esc(r.display_name)+'</strong>'+
 '<small>'+esc(r.account_type)+' · '+esc(r.status)+'</small></th>'+
 '<td>'+money(r.today?.gross_cents)+'</td><td>'+money(r.yesterday?.gross_cents)+'</td>'+
 '<td>'+money(r.month?.gross_cents)+'</td><td>'+money(r.previous_month?.gross_cents)+'</td>'+
 '<td>'+changeBadge(r.comparison_month)+'</td></tr>').join('')+'</tbody></table></div>';
}
function adminHost(){
 if(!adm())return null;
 return E('ar-admin-revenue');
}
function sellerHost(){
 const dash=E('dashboard'),overview=E('argus-reseller-page-overview');
 if(!dash||dash.hidden||!overview)return null;
 let host=E('ar-seller-revenue');
 if(!host){
  host=document.createElement('section');
  host.id='ar-seller-revenue';host.className='ar-revenue ar-revenue-seller';
  host.setAttribute('aria-label','Seu faturamento');
  host.innerHTML='<p>Carregando faturamento confirmado…</p>';
  const intro=overview.querySelector('.argus-reseller-page-intro');
  if(intro)intro.insertAdjacentElement('afterend',host);else overview.prepend(host);
 }
 return host;
}
async function refreshAdmin(force=false){
 const host=adminHost();
 if(!host||adminLoading||(!force&&Date.now()-adminLast<12000))return;
 adminLoading=true;
 if(!adminLast)host.textContent='Consultando faturamentos confirmados…';
 try{
  const data=await api('/api/admin/merchant-wallet/revenue');
  if(data?.basis!=='confirmed_pix_ledger')throw Error('Fonte financeira não validada');
  host.innerHTML=summary(data,'Faturamento da plataforma')+
    '<section class="ar-revenue-panel"><div class="ar-revenue-panel-head"><h3>Comparativo por revendedor</h3>'+
    '<small>Classificados pelo faturamento do mês</small></div>'+sellerRows(data.sellers)+
    '</section>';
  host.querySelector('[data-revenue-refresh]')?.addEventListener('click',()=>refreshAdmin(true));
  adminLast=Date.now();
 }catch(e){host.innerHTML='<p class="ar-revenue-error" role="alert">Faturamento indisponível: '+esc(e.message)+'. Nenhum valor estimado foi apresentado.</p>'}
 finally{adminLoading=false;}
}
async function refreshSeller(force=false){
 const host=sellerHost();
 if(!host||sellerLoading||(!force&&Date.now()-sellerLast<12000))return;
 sellerLoading=true;
 try{
  const data=await request('/api/portal/wallet/revenue');
  if(data?.basis!=='confirmed_pix_ledger'||(data.sellers||[]).length)
   throw Error('Relatório individual não validado');
  host.innerHTML=summary(data,'Meu faturamento');
  host.querySelector('[data-revenue-refresh]')?.addEventListener('click',()=>refreshSeller(true));
  sellerLast=Date.now();
 }catch(e){
  host.innerHTML='<p class="ar-revenue-error" role="alert">Não foi possível consultar seu faturamento agora. '+esc(e.message)+'</p>'+
   '<button type="button" class="ar-revenue-refresh" data-revenue-refresh>Tentar novamente</button>';
  host.querySelector('[data-revenue-refresh]').addEventListener('click',()=>refreshSeller(true));
 }
 finally{sellerLoading=false;}
}
function start(){
 // Seller SPA builds its overview after authentication; wait for that DOM.
 const dash=E('dashboard');
 if(dash){
  const observer=new MutationObserver(()=>{
   if(dash.hidden){sellerLast=0;const host=E('ar-seller-revenue');if(host)host.replaceChildren();return}
   if(!E('ar-seller-revenue'))refreshSeller();
  });
  observer.observe(dash,{childList:true,attributes:true,subtree:false,attributeFilter:['hidden']});
  refreshSeller();
 }
 document.addEventListener('argus:reseller-stage',()=>refreshSeller(true));
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-reseller-view="overview"]'))
   queueMicrotask(()=>refreshSeller());
 });
 window.addEventListener('focus',()=>{if(adm()&&!E('page-revenue')?.hidden)refreshAdmin();refreshSeller()});
 setInterval(()=>{
  if(document.hidden)return;
  if(adm()&&!E('page-revenue')?.hidden)refreshAdmin(true);
  if(dash&&!dash.hidden&&!E('argus-reseller-page-overview')?.hidden)refreshSeller(true);
 },60000);
}
if(typeof loadPage==='function'){
 const previous=loadPage;
 loadPage=async function(page){
  if(page==='revenue')return refreshAdmin(true);
  return previous.apply(this,arguments);
 };
}
if(typeof navigate==='function'){
 const previous=navigate;
 navigate=function(page){
  if(page==='revenue'&&!adm())return;
  return previous.apply(this,arguments);
 };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();
