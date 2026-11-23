/* ARGUS Pay: confirmed Pix awards, podium and privacy-aware public showcase. */
(()=>{'use strict';
if(window.__argusAwardsDashboard)return;window.__argusAwardsDashboard=true;
const E=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'" :'&#39;'}[c]));
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(v)||0)/100);
const num=v=>Number(v||0).toLocaleString('pt-BR');
const logo='<img class="argus-aw-logo" loading="lazy" src="/static/assets/argus-payments-logo-transparent.webp" alt="Argus Pay">';
const goals=[1000000,2000000,5000000,10000000,50000000,100000000];
const tiers=['BRONZE','COBRE','PRATA','OURO','TITÂNIO','PLATINA'];
const labels=['10K','20K','50K','100K','500K','1M'];
const authenticatedAdmin=()=>typeof state!=='undefined'&&state?.user?.role==='superadmin';
const loggedSeller=()=>!!(E('dashboard')&&!E('dashboard').hidden);
let adminCache=null,sellerCache=null,refreshingAdmin=false,refreshingSeller=false,lastAdmin=0,lastSeller=0;
let adminSelected='',activeSellerId='',activeAdminId='';
function heading(title,subtitle){
 return '<div class="argus-aw-heading"><div><div class="argus-aw-eyebrow">✦ PROGRAMA ARGUS PAY</div>'+
 '<h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div>'+
 '<span class="argus-aw-updated">PIX CONFIRMADOS · MÊS ATUAL</span></div>';
}
function podium(rows){
 const data=rows||[];
 if(!data.length)return '<div class="argus-aw-empty">Ainda não existem vendas confirmadas suficientes para formar o ranking deste mês.</div>';
 const top=data.slice(0,3),order=[top[1],top[0],top[2]];
 return '<div class="argus-aw-podium">'+order.filter(Boolean).map(r=>{
   const rank=Number(r.rank),metal=rank===1?'gold':rank===2?'silver':'bronze';
   return '<article class="argus-aw-podium-card is-'+metal+'"><div class="argus-aw-rank-medal">'+
   (rank===1?'♛ ':'')+rank+'º</div><div class="argus-aw-rank-name">'+esc(r.display_name)+'</div>'+
   '<small>FATURAMENTO DO MÊS</small><strong>'+(r.private?'Privado':brl(r.monthly_gross_cents))+'</strong>'+
   '<div class="argus-aw-mini">'+(r.private?'<span>Dados não divulgados</span>':'<span>'+num(r.monthly_count)+' vendas</span><span>Ticket '+brl(r.ticket_cents)+'</span>')+'</div>'+
   '<div class="argus-aw-podium-floor" aria-hidden="true"></div></article>';
 }).join('')+'</div>'+
 (data.length>3?'<div class="argus-aw-other-places">'+data.slice(3,5).map(r=>
 '<div class="argus-aw-place"><span class="argus-aw-place-n">'+esc(r.rank)+'º</span><div><b>'+esc(r.display_name)+'</b>'+
 '<small>'+(r.private?'Dados privados':num(r.monthly_count)+' vendas · Ticket '+brl(r.ticket_cents))+'</small></div>'+
 '<strong>'+(r.private?'Privado':brl(r.monthly_gross_cents))+'</strong></div>').join('')+'</div>':'');
}
function plaque(goal,i,profile,illustration=false){
 const earned=profile?Number(profile.lifetime_gross_cents)>=goal:false;
 const current=profile?Number(profile.lifetime_gross_cents)||0:0;
 const progress=Math.min(100,Math.max(0,100*current/goal));
 const display=profile?.display_name||'Seu nome aqui';
 const footer=illustration?'Modelo de reconhecimento':
    earned?'✓ Conquistada':('Faltam '+brl(Math.max(0,goal-current)));
 return '<article class="argus-aw-plaque-item"><div class="argus-aw-plaque tier-'+i+(earned?' is-earned':'')+'">'+
   '<div class="argus-aw-plaque-shine" aria-hidden="true"></div>'+logo+
   '<div class="argus-aw-medallion"><span>'+labels[i]+'</span><small>EM VENDAS</small></div>'+
   '<div class="argus-aw-person">'+esc(display)+'</div><div class="argus-aw-tier">'+tiers[i]+'</div></div>'+
   '<div class="argus-aw-progress-track"><div style="width:'+progress.toFixed(1)+'%"></div></div>'+
   '<p class="argus-aw-plaque-caption">'+footer+'</p></article>';
}
function gallery(profile,illustration=false){
 return '<section class="argus-aw-gallery-section"><header><div><small>CONQUISTAS QUE MARCAM HISTÓRIAS</small>'+
 '<h3>Placas de faturamento</h3><p>Arraste para o lado e acompanhe cada marco de vendas confirmadas.</p></div>'+
 '<div class="argus-aw-arrows"><button type="button" data-awards-slide="-1" aria-label="Voltar placas">‹</button>'+
 '<button type="button" data-awards-slide="1" aria-label="Avançar placas">›</button></div></header>'+
 '<div class="argus-aw-plaque-rail" tabindex="0" aria-label="Galeria de seis placas">'+goals.map((g,i)=>
 plaque(g,i,profile,illustration)).join('')+'</div></section>';
}
function metric(name,value,foot){
 return '<article class="argus-aw-metric"><small>'+esc(name)+'</small><strong>'+value+'</strong>'+
 '<span>'+esc(foot||'Pix confirmado')+'</span></article>';
}
function stats(r){
 if(!r)return '';
 const goal=r.current_goal_cents;
 return '<div class="argus-aw-metrics">'+
 metric('Faturamento do mês',brl(r.monthly_gross_cents),'Bruto confirmado')+
 metric('Ticket médio',brl(r.ticket_cents),'Receitas confirmadas / vendas')+
 metric('Vendas do mês',num(r.monthly_count),'Cobranças pagas')+
 metric('Faturamento acumulado',brl(r.lifetime_gross_cents),'Após estornos')+
 metric('Líquido do mês',brl(r.monthly_net_cents),'Após taxas e estornos')+
 metric('Estornos no mês',num(r.monthly_refunds),'Eventos de devolução')+
 '</div>'+
 '<div class="argus-aw-next"><div><small>PRÓXIMA CONQUISTA</small><strong>'+
 (goal?'Faltam '+brl(r.remaining_cents)+' para '+labels[goals.indexOf(goal)]:'Todas as seis placas alcançadas!')+
 '</strong><p>Metas calculadas pelo faturamento acumulado confirmado, menos estornos.</p></div>'+
 (goal?'<span class="argus-aw-next-badge">'+labels[goals.indexOf(goal)]+'</span>':'<span class="argus-aw-next-badge">★</span>')+
 '</div>';
}
function plots(series,profile){
 const points=Array.isArray(series)?series:[];
 if(!points.length)return '<div class="argus-aw-empty">Sem dados mensais disponíveis.</div>';
 const vals=points.map(p=>Math.max(0,Number(p.gross_cents)||0));
 const top=Math.max(1,...vals);
 const coords=vals.map((v,i)=>[18+(i*600/Math.max(1,vals.length-1)),160-137*v/top]);
 const line=coords.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+','+y.toFixed(2)).join(' ');
 const area=line+' L618,160 L18,160 Z';
 const axis=points.map((p,i)=>'<span>'+esc(p.month.slice(5))+'/'+esc(p.month.slice(2,4))+'</span>').join('');
 const bars=points.map(p=>'<div class="argus-aw-countbar"><div style="height:'+
 (100*(Number(p.sales)||0)/Math.max(1,...points.map(q=>Number(q.sales)||0))).toFixed(1)+
 '%"></div><small>'+esc(p.month.slice(5))+'</small></div>').join('');
 const goal=profile?.current_goal_cents||100000000;
 const percent=Math.min(100,100*(Number(profile?.lifetime_gross_cents)||0)/goal);
 return '<div class="argus-aw-graphs"><section class="argus-aw-graph is-wide"><h3>↗ Evolução do faturamento</h3>'+
 '<p>Últimos 12 meses · valores após estornos</p><div class="argus-aw-lineplot">'+
 '<svg viewBox="0 0 640 185" preserveAspectRatio="none" role="img" aria-label="Linha de evolução do faturamento">'+
 '<defs><linearGradient id="argus-aw-gradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#dba94c" stop-opacity=".43"/>'+
 '<stop offset="100%" stop-color="#dba94c" stop-opacity="0"/></linearGradient></defs>'+
 '<path d="M18 25H618 M18 70H618 M18 115H618 M18 160H618" stroke="#667184" stroke-opacity=".25"/>'+
 '<path d="'+area+'" fill="url(#argus-aw-gradient)"/><path d="'+line+
 '" stroke="#f0c46d" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'+
 coords.map(([x,y])=>'<circle cx="'+x+'" cy="'+y+'" r="3.4" fill="#ffda84"/>').join('')+'</svg>'+
 '<div class="argus-aw-chart-axis">'+axis+'</div></div></section>'+
 '<section class="argus-aw-graph"><h3>▥ Quantidade de vendas</h3><p>Pix confirmados por mês</p>'+
 '<div class="argus-aw-barplot">'+bars+'</div></section>'+
 '<section class="argus-aw-graph"><h3>◎ Progresso da próxima placa</h3>'+
 '<div class="argus-aw-ring" style="--percent:'+Math.max(0,percent).toFixed(1)+'%"><div>'+
 '<strong>'+percent.toFixed(1).replace('.',',')+'%</strong><small>da meta</small></div></div>'+
 '<p class="argus-aw-ring-caption">'+(profile?.current_goal_cents?'Faltam '+brl(profile.remaining_cents)+' para a placa '+labels[goals.indexOf(goal)]:'Parabéns, todos os marcos conquistados!')+'</p>'+
 '</section></div>';
}
function cardsTop(rows,title,subtitle,profile){
 return heading(title,subtitle)+'<section class="argus-aw-rank"><header><div><small>🏆 CLASSIFICAÇÃO · TOP 5</small>'+
 '<h3>Ranking de faturamento</h3></div><span class="argus-aw-period">Mês atual · BRL</span></header>'+
 podium(rows)+'</section>'+gallery(profile);
}
async function adminLoad(id=''){
 if(id)adminSelected=id;
 if(!authenticatedAdmin()||refreshingAdmin)return;
 refreshingAdmin=true;
 try{
  const data=await api('/api/admin/merchant-wallet/awards'+(adminSelected?'?seller='+encodeURIComponent(adminSelected):''));
  if(data?.basis!=='confirmed_pix_ledger')throw Error('Relatório financeiro não confirmado');
  adminCache=data;lastAdmin=Date.now();adminSelected=data.selected_id||'';
  const home=adminHome();
  if(home)home.innerHTML=cardsTop(data.ranking,'Destaques de faturamento',
   'Os cinco revendedores com mais vendas confirmadas neste mês.',data.sellers.find(x=>x.account_id===data.selected_id));
  const target=E('argus-awards-admin');
  if(target){
    const current=data.sellers.find(x=>x.account_id===data.selected_id);
    target.innerHTML=heading('Ranking e placas de faturamento',
       'Vendas auditadas, premiações e indicadores de cada revendedor.')+
    '<section class="argus-aw-rank"><header><div><small>🏆 TOP 5</small><h3>Líderes do mês</h3></div>'+
    '<span class="argus-aw-period">Classificação automática</span></header>'+podium(data.ranking)+'</section>'+
    '<div class="argus-aw-selector"><label for="argus-aw-seller-pick">Revendedor analisado</label>'+
    '<select id="argus-aw-seller-pick" aria-label="Selecionar revendedor">'+
    data.sellers.map(x=>'<option value="'+esc(x.account_id)+'"'+(x.account_id===data.selected_id?' selected':'')+'>'+
    esc(x.display_name)+'</option>').join('')+'</select></div>'+
    stats(current)+plots(data.monthly,current)+gallery(current);
    target.querySelector('#argus-aw-seller-pick')?.addEventListener('change',e=>adminLoad(e.target.value));
  }
 }catch(err){const t=E('argus-awards-admin');if(t)t.textContent='Não foi possível consultar o ranking: '+err.message;}
 finally{refreshingAdmin=false;}
}
function adminHome(){
 if(!authenticatedAdmin())return null;
 const ids=['page-overview','page-dashboard','page-home','page-summary'];
 const page=ids.map(E).find(Boolean);
 if(!page)return null;
 let host=E('argus-awards-admin-home');
 if(!host){host=document.createElement('section');host.id='argus-awards-admin-home';
 host.className='argus-awards argus-aw-home';page.appendChild(host);}
 return host;
}
async function sellerLoad(){
 if(!loggedSeller()||refreshingSeller)return;
 refreshingSeller=true;
 try{
  const data=await request('/api/portal/wallet/awards');
  if(data?.basis!=='confirmed_pix_ledger')throw Error('Relatório financeiro não confirmado');
  sellerCache=data;lastSeller=Date.now();
  const home=sellerHome();
  if(home)home.innerHTML=cardsTop(data.ranking,'Meu ranking de faturamento',
   'Acompanhe sua posição e seus próximos marcos.',data.self);
  const target=E('argus-awards-seller');
  if(target){
   const isPublic=!!data.self.public_opt_in;
   target.innerHTML=heading('Minhas placas e conquistas',
      'Seu faturamento confirmado, evolução e posição no ranking Argus Pay.')+
    '<div class="argus-aw-position">'+(data.self.rank?'Minha posição atual: <strong>'+data.self.rank+'º lugar</strong>':
      'Você ainda não está classificado neste mês')+'</div>'+
    stats(data.self)+
    '<section class="argus-aw-consent"><div><h3>Participar do ranking público</h3>'+
    '<p>Autorize a divulgação do nome cadastrado, quantidade de vendas, ticket médio e faturamento mensal. Você pode cancelar quando quiser.</p></div>'+
    '<label class="argus-aw-switch"><input id="argus-aw-public-consent" type="checkbox" '+(isPublic?'checked':'')+'>'+
    '<span>Mostrar minha conta no ranking público</span></label><p id="argus-aw-consent-feedback" role="status"></p></section>'+
    '<section class="argus-aw-rank"><header><div><small>🏆 TOP 5</small><h3>Ranking do mês</h3></div>'+
    '<span class="argus-aw-period">Somente vendas confirmadas</span></header>'+
    podium(data.ranking)+'</section>'+plots(data.monthly,data.self)+gallery(data.self);
    target.querySelector('#argus-aw-public-consent')?.addEventListener('change',async e=>{
      const enabled=e.target.checked;e.target.disabled=true;
      try{
        await request('/api/portal/wallet/awards/visibility',{method:'POST',body:{enabled}});
        E('argus-aw-consent-feedback').textContent=enabled?'Participação pública ativada.':'Participação pública desativada.';
        sellerCache.self.public_opt_in=enabled;
      }catch(err){e.target.checked=!enabled;E('argus-aw-consent-feedback').textContent='Não foi possível atualizar: '+err.message;}
      finally{e.target.disabled=false;}
    });
  }
 }catch(err){const el=E('argus-awards-seller');if(el)el.textContent='Ranking indisponível: '+err.message;}
 finally{refreshingSeller=false;}
}
function sellerHome(){
 if(!loggedSeller())return null;
 const page=E('argus-reseller-page-overview');if(!page)return null;
 // The awards page now ships in the initial SPA shell, preventing deep-link races.
 if(!E('argus-reseller-page-awards'))return null;
 let host=E('argus-awards-seller-home');
 if(!host){host=document.createElement('section');host.id='argus-awards-seller-home';
 host.className='argus-awards argus-aw-home';page.appendChild(host);}
 return host;
}
async function publicLoad(){
 const host=E('argus-awards-public');if(!host)return;
 try{
  const r=await fetch('/api/public/revenue-ranking',{credentials:'omit',cache:'no-store',
   headers:{Accept:'application/json'}});
  if(!r.ok)throw Error('Serviço temporariamente indisponível');
  const data=await r.json();
  if(data.basis!=='confirmed_pix_ledger'||data.consent_required!==true)
   throw Error('Ranking público não validado');
  host.innerHTML=heading('Ranking de faturamento ARGUS Pay',
   'Destaque dos revendedores que autorizaram a divulgação de suas conquistas.')+
   '<section class="argus-aw-rank"><header><div><small>🏆 MELHORES RESULTADOS</small>'+
   '<h3>Top 5 do mês</h3></div><span class="argus-aw-period">Dados reais e consentidos</span></header>'+
   podium(data.ranking)+'</section>'+
   gallery(null,true)+
   '<p class="argus-aw-public-note">Os marcos apresentados são modelos ilustrativos. O ranking mostra somente vendas Pix confirmadas e participantes com autorização ativa.</p>'+
   '<div class="argus-aw-public-cta"><a href="/cadastro">Quero fazer parte da Argus Pay →</a></div>';
 }catch(err){host.textContent='Ranking público temporariamente indisponível. Consulte novamente mais tarde.';}
}
function installCarousel(){
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-awards-slide]');if(!button)return;
  const rail=button.closest('.argus-aw-gallery-section')?.querySelector('.argus-aw-plaque-rail');
  if(rail)rail.scrollBy({left:Number(button.dataset.awardsSlide)*Math.max(240,rail.clientWidth*.7),behavior:'smooth'});
 });
}
function initialize(){
 installCarousel();
 if(E('argus-awards-public'))publicLoad();
 // Both authenticated apps create their dashboards after login.
 let lastProbe=0;
 const resetSeller=()=>{
  sellerCache=null;lastSeller=0;
  const home=E('argus-awards-seller-home'),page=E('argus-awards-seller');
  if(home)home.replaceChildren();
  if(page)page.textContent='Consultando conquistas reais…';
 };
 const probe=()=>{
  const seller=loggedSeller();
  const sellerId=seller&&typeof state!=='undefined'?String(state?.account?.id||''):'';
  if((!seller&&activeSellerId)||(sellerId&&sellerId!==activeSellerId)){
   resetSeller();activeSellerId=sellerId;
  }
  const admin=authenticatedAdmin();
  const adminId=admin?String(state?.user?.id||''):'';
  if((!admin&&activeAdminId)||(adminId&&adminId!==activeAdminId)){
   adminCache=null;lastAdmin=0;adminSelected='';activeAdminId=adminId;
   E('argus-awards-admin-home')?.replaceChildren();
   if(E('argus-awards-admin'))E('argus-awards-admin').textContent='Consultando ranking…';
  }
  if(admin&&adminHome()&&Date.now()-lastAdmin>90000)adminLoad();
  if(seller&&sellerHome()&&Date.now()-lastSeller>90000)sellerLoad();
 };
 probe();
 setInterval(()=>{if(!document.hidden)probe()},5000);
 document.addEventListener('click',ev=>{
  if(ev.target.closest('[data-nav="awards"],[data-nav="overview"]')){
   setTimeout(()=>{if(authenticatedAdmin())adminLoad()},100);
  }
  if(ev.target.closest('[data-reseller-view="awards"],[data-reseller-view="overview"]')){
   setTimeout(()=>{if(loggedSeller())sellerLoad()},100);
  }
 });
 window.addEventListener('focus',probe);
 document.addEventListener('argus:reseller-stage',()=>{if(loggedSeller())sellerLoad()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});
else initialize();
})();