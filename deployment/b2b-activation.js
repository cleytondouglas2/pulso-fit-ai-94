/* ARGUS B2B activation: Super Admin read-only preflight; NEVER sends financial changes. */
(()=>{'use strict';
const E=id=>document.getElementById(id);
const safe=t=>String(t??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'" :'&#39;'}[ch]));
let available=false,initialized=false,refreshing=false,last=0;
const links=[
 {label:'Banco dedicado e backup',url:'https://dashboard.render.com',icon:'database'},
 {label:'Configuração do B2B no Render',url:'https://dashboard.render.com/web/srv-dbusl00jo6nc73b1m05g',icon:'server'}
];
function dashboard(p){
 const box=E('argus-b2b-readiness-root');if(!box)return;
 const checks=p.requirements||[],passed=checks.filter(x=>x.passed).length,total=checks.length;
 const isRed=!p.ready_local||!p.storage?.persistent;
 box.innerHTML='<div class="argus-b2b-hero"><div><small>ARGUS PAY · SUPER ADMIN · AMBIENTE B2B</small>'+
 '<h2>Central de habilitação financeira</h2>'+
 '<p>Auditoria automática de segurança para preparar a operação. Nenhuma cobrança Pix nem saque é executado por esta tela.</p></div>'+
 '<div class="argus-b2b-progress"><strong>'+passed+' / '+total+'</strong><span>requisitos locais</span></div></div>'+
 '<div class="argus-b2b-progressbar"><div style="width:'+Math.min(100,100*passed/Math.max(1,total))+'%"></div></div>'+
 '<div class="argus-b2b-metrics">'+
 metric('Banco conectado',p.storage?.driver==='sqlite'?'SQLite':p.storage?.driver?.toUpperCase()||'Desconhecido',p.storage?.persistent===true)+
 metric('Credenciais Pix tradicional',p.integration?.traditional_pix_keys_present?'Detectadas':'Não confirmadas',p.integration?.traditional_pix_keys_present)+
 metric('Credenciais de saques',p.integration?.payout_keys_present?'Detectadas':'Ausentes',p.integration?.payout_keys_present)+
 metric('Worker financeiro',p.integration?.worker_enabled_in_environment?'Configurado':'Não configurado',p.integration?.worker_enabled_in_environment)+
 '</div>'+
 '<div class="argus-b2b-alert" role="status"><strong>'+(isRed?'Financeiro bloqueado por segurança':'Validação externa ainda pendente')+'</strong>'+
 '<p>'+safe(p.warning)+'</p></div>'+
 '<section class="argus-b2b-checks"><header><div><small>CHECKLIST DO AMBIENTE</small>'+
 '<h3>Requisitos para ativar</h3></div><span>Diagnóstico · '+safe(p.checked_at_utc||'')+'</span></header>'+
 '<div class="argus-b2b-checklist">'+checks.map((r,i)=>'<article class="argus-b2b-check'+(r.passed?' is-ready':'')+'">'+
 '<div class="argus-b2b-check-number">'+String(i+1).padStart(2,'0')+'</div>'+
 '<div class="argus-b2b-check-details"><h4>'+safe(r.title)+'</h4><p>'+safe(r.guidance)+'</p></div>'+
 '<span class="argus-b2b-check-state">'+(r.passed?'✓ Validado localmente':'! Pendente')+'</span></article>').join('')+
 '</div></section>'+
 '<section class="argus-b2b-next"><h3>Próximos passos da ativação</h3>'+
 '<div class="argus-b2b-next-cards">'+
 card('01','PostgreSQL dedicado','Contrate e vincule um banco persistente exclusivo do B2B. Confirme backup e teste de restauração. O SQLite não pode ser usado como livro financeiro.',p.storage?.persistent)+
 card('02','Adquirente e credenciais','Insira as credenciais exclusivas nas variáveis protegidas do Render. Comprove split, consulta, escopos e titularidade.',p.integration?.traditional_pix_keys_present&&p.integration?.payout_keys_present)+
 card('03','Segurança e homologação','Valide os nove controles acima. Depois teste Pix e saque em ambiente homologado, com autorização explícita antes de qualquer transferência.',false)+
 '</div>'+
 '<div class="argus-b2b-links">'+links.map(item=>'<a href="'+item.url+'" target="_blank" rel="noopener noreferrer">'+safe(item.label)+' ↗</a>').join('')+'</div>'+
 '<p><strong>Importante:</strong> mesmo com todos os itens locais concluídos, esta tela não ativa movimentações. A liberação depende de homologação externa e de uma implantação controlada.</p>'+
 '</section>';
 const button=E('argus-b2b-readiness-refresh');if(button)button.disabled=false;
}
function metric(title,value,ok){
 return '<article class="argus-b2b-metric"><small>'+safe(title)+'</small><strong>'+safe(value)+'</strong>'+
 '<span class="'+(ok?'good':'bad')+'">'+(ok?'● Configurado':'● Atenção')+'</span></article>';
}
function card(n,title,description,done){
 return '<article><small>ETAPA '+n+'</small><h4>'+safe(title)+'</h4><p>'+safe(description)+'</p>'+
 '<span>'+(done?'✓ Indício de configuração':'Requer validação')+'</span></article>';
}
async function refresh(){
 if(refreshing||!available)return;
 refreshing=true;const button=E('argus-b2b-readiness-refresh');
 if(button)button.disabled=true;
 try{
  const d=await api('/api/admin/b2b/readiness');
  if(d?.read_only!==true||d?.payments_enabled_by_this_endpoint!==false)throw Error('Retorno de segurança inválido.');
  dashboard(d);
  last=Date.now();
 }catch(e){
  const target=E('argus-b2b-readiness-root');if(target)target.textContent='A consulta falhou: '+e.message;
  if(button)button.disabled=false;
 }finally{refreshing=false;}
}
async function probe(){
 if(initialized||typeof state==='undefined'||state?.user?.role!=='superadmin')return;
 initialized=true;
 try{
  const d=await api('/api/admin/b2b/readiness');
  if(d?.read_only!==true||d?.environment!=='B2B')return;
  available=true;
  document.querySelectorAll('[data-nav="b2b-activation"]').forEach(x=>{x.hidden=false;x.style.removeProperty('display')});
  dashboard(d);last=Date.now();
 }catch(_){/* Do not expose this B2B-only menu on primary or demonstration sites. */}
}
function init(){
 E('argus-b2b-readiness-refresh')?.addEventListener('click',refresh);
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-nav="b2b-activation"]')){
   if(available&&Date.now()-last>15000)setTimeout(refresh,90);
  }
 });
 setInterval(()=>{
  const role=typeof state==='undefined'?null:state?.user?.role;
  if(role!=='superadmin'){if(initialized){initialized=false;available=false;
   document.querySelectorAll('[data-nav="b2b-activation"]').forEach(e=>{e.hidden=true;e.style.display='none'});}
   return;}
  if(!initialized)probe();
 },5000);
 probe();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();