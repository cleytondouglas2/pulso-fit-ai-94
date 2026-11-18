/* PulsoFit: página de planos independente do render() do aplicativo.
 * Injetado no HTML gerado em runtime: a troca do conteúdo de #app não apaga o portal.
 * Os planos são fixos e os prazos são consultados no backend por conta autenticada.
 */
(function(){
 "use strict";
 if(window.__PULSO_STABLE_PLANS_20261118__)return;
 window.__PULSO_STABLE_PLANS_20261118__=true;
 var opened=false,closedOnRoute=false,lastRoute="",lastToken=null,details=null;
 var css='#pf-stable-open{position:fixed!important;right:12px!important;bottom:calc(89px + env(safe-area-inset-bottom,0px))!important;z-index:2147480000!important;background:linear-gradient(125deg,#7133c5,#9f51ec)!important;border:1px solid #d4b4ff!important;color:#fff!important;box-shadow:0 10px 35px #16072a9c!important;border-radius:16px!important;padding:12px 15px!important;font:800 13px/1.3 system-ui,sans-serif!important;cursor:pointer!important;max-width:min(320px,calc(100vw - 24px))!important;text-align:left!important}'+
 '#pf-stable-open small{display:block;font:500 11px/1.4 system-ui,sans-serif;color:#efe3ff;margin-top:3px}'+
 '#pf-stable-modal{position:fixed!important;inset:0!important;z-index:2147482000!important;background:#070816e8!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow-y:auto!important;padding:16px!important;box-sizing:border-box!important;backdrop-filter:blur(8px)}'+
 '#pf-stable-modal .pf-stable-body{box-sizing:border-box;width:min(100%,760px);max-height:calc(100dvh - 32px);overflow-y:auto;border-radius:22px;padding:clamp(18px,4vw,30px);border:1px solid #8164bd;background:linear-gradient(150deg,#262044,#141d34 68%);color:#fff;font:14px/1.5 system-ui,sans-serif;box-shadow:0 20px 60px #0008;position:relative}'+
 '#pf-stable-modal .pf-stable-top{display:flex;justify-content:space-between;align-items:start;gap:12px}'+
 '#pf-stable-modal h2{font:800 clamp(23px,4vw,30px)/1.2 system-ui,sans-serif;color:#fff;margin:0 0 8px}'+
 '#pf-stable-modal .pf-stable-close{width:36px;height:36px;border-radius:50%;border:1px solid #7c6d99;background:#292947;color:#fff;cursor:pointer;font-size:22px}'+
 '#pf-stable-modal .pf-stable-trial{padding:16px;border:1px solid #825de8;border-radius:16px;background:#37255a;margin:16px 0;color:#fff}'+
 '#pf-stable-modal .pf-stable-trial strong{display:block;font-size:18px}'+
 '#pf-stable-modal .pf-stable-trial p{margin:7px 0;font-size:14px;color:#f5ebff}'+
 '#pf-stable-modal .pf-stable-plans{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}'+
 '#pf-stable-modal .pf-stable-card{min-width:0;box-sizing:border-box;padding:20px 16px;border-radius:17px;border:1px solid #6c638e;background:#1d2540;display:flex;flex-direction:column;gap:8px}'+
 '#pf-stable-modal .pf-stable-card.best{border:2px solid #b083fb;background:#302345}'+
 '#pf-stable-modal .pf-stable-card b{font-size:18px}'+
 '#pf-stable-modal .pf-stable-price{font-size:30px;color:#b0ffca;font-weight:900}'+
 '#pf-stable-modal .pf-stable-card small{font-size:12px;color:#ded5f0}'+
 '#pf-stable-modal .pf-stable-card button{width:100%;border:0;border-radius:12px;background:#8342dc;color:white;padding:12px 8px;font:800 13px system-ui,sans-serif;cursor:pointer;margin-top:auto}'+
 '#pf-stable-modal .pf-stable-foot{font-size:11px;color:#cfc4e5;margin:14px 0 0}'+
 '@media(max-width:520px){#pf-stable-modal .pf-stable-plans{grid-template-columns:1fr}#pf-stable-modal .pf-stable-body{padding:18px}}';
 function route(){return String(location.hash||"").replace(/^#\/?/,"").split("/")[0].toLowerCase()}
 function token(){try{return sessionStorage.getItem("pulso-fit-token")||""}catch(e){return ""}}
 function days(d){var end=new Date(d);return Number.isFinite(end.getTime())?Math.max(0,Math.ceil((end.getTime()-Date.now())/86400000)):null}
 function message(){
  if(details?.planActive&&details.planExpiresAt)return "Assinatura ativa até "+new Date(details.planExpiresAt).toLocaleDateString("pt-BR")+".";
  if(details?.trialEndsAt){var n=days(details.trialEndsAt);
   if(n!==null)return n>0?"Restam "+n+" dia(s) grátis. Validade: "+new Date(details.trialEndsAt).toLocaleDateString("pt-BR")+".":"O teste gratuito terminou em "+new Date(details.trialEndsAt).toLocaleDateString("pt-BR")+".";}
  return token()?"Consultando a validade da sua conta…":"Entre na sua conta para consultar a validade dos 7 dias grátis.";
 }
 function paint(){
  var b=document.getElementById("pf-stable-open");if(b){var sm=b.querySelector("small");if(sm)sm.textContent=message()}
  var p=document.getElementById("pf-stable-trial-status");if(p)p.textContent=message();
 }
 function ensureStyle(){
  if(document.getElementById("pf-stable-css"))return;
  var node=document.createElement("style");node.id="pf-stable-css";node.textContent=css;(document.head||document.documentElement).appendChild(node);
 }
 function ensureLauncher(){
  if(!document.body||document.getElementById("pf-stable-open"))return;
  var b=document.createElement("button");b.type="button";b.id="pf-stable-open";
  b.innerHTML='🎁 Ver planos e 7 dias grátis<small></small>';
  b.addEventListener("click",function(){closedOnRoute=false;show()});
  document.body.appendChild(b);
 }
 function hide(){
  opened=false;var el=document.getElementById("pf-stable-modal");if(el)el.remove();
 }
 function select(code){
  hide();
  // O botão temporário usa a rotina de checkout já implementada e autenticada
  // no aplicativo. Não criar ou inventar um segundo gateway.
  var target=document.createElement("button");
  target.type="button";target.dataset.pfSelectPlan=code;
  target.style.display="none";document.body.appendChild(target);
  target.click();target.remove();
 }
 function show(){
  if(!document.body)return;opened=true;
  var old=document.getElementById("pf-stable-modal");if(old){paint();return}
  var outer=document.createElement("div");outer.id="pf-stable-modal";
  outer.innerHTML='<section class="pf-stable-body" role="dialog" aria-modal="true" aria-labelledby="pf-stable-title">'+
  '<div class="pf-stable-top"><div><small style="color:#c4b5fd;font-weight:900">PULSOFIT AI • ASSINATURA</small><h2 id="pf-stable-title">Escolha seu plano</h2></div><button type="button" class="pf-stable-close" aria-label="Fechar">×</button></div>'+
  '<section class="pf-stable-trial"><strong>🎁 7 dias de teste grátis</strong><p id="pf-stable-trial-status"></p><small>O prazo é registrado na conta e não gera cobrança automática.</small></section>'+
  '<div class="pf-stable-plans">'+
  '<article class="pf-stable-card"><small>SEM FIDELIDADE</small><b>Plano Quinzenal</b><div class="pf-stable-price">R$ 14,90</div><small>15 dias de acesso</small><p>Treinos, Coach IA, metas e acompanhamento.</p><button type="button" data-pf-stable-plan="quinzenal">Selecionar 15 dias</button></article>'+
  '<article class="pf-stable-card best"><small>MELHOR CUSTO-BENEFÍCIO</small><b>Plano Mensal</b><div class="pf-stable-price">R$ 24,90</div><small>30 dias de acesso</small><p>Todos os recursos, com mais economia.</p><button type="button" data-pf-stable-plan="mensal">Selecionar 30 dias</button></article>'+
  '</div><p class="pf-stable-foot">Pix via MisticPay. O cartão ainda não está disponível. O pagamento somente libera o plano após confirmação no servidor.</p></section>';
  outer.querySelector(".pf-stable-close").addEventListener("click",function(){closedOnRoute=true;hide()});
  outer.addEventListener("click",function(e){
   if(e.target===outer){closedOnRoute=true;hide();return}
   var btn=e.target.closest("[data-pf-stable-plan]");if(btn)select(btn.dataset.pfStablePlan);
  });
  document.body.appendChild(outer);paint();
 }
 async function load(){
  var key=token();
  if(lastToken===key)return;
  lastToken=key;details=null;paint();
  if(!key)return;
  try{
   var resp=await fetch("/api/subscription/status",{headers:{"Authorization":"Bearer "+key},cache:"no-store"});
   if(!resp.ok)throw Error("Consulta indisponível");
   var json=await resp.json();
   if(key!==token())return;
   details=json;paint();
  }catch{if(key===token()){details=null;paint()}}
 }
 function maintain(){
  if(!document.body)return;
  ensureStyle();ensureLauncher();
  var r=route();
  if(r!==lastRoute){lastRoute=r;closedOnRoute=false;if(["subscription","plans","pricing","pro","premium"].includes(r))opened=true}
  if(!closedOnRoute&&!opened&&document.querySelector("#app .pro-price-grid, #app .pf-commercial-hero"))opened=true;
  if(opened&&!closedOnRoute&&!document.getElementById("pf-stable-modal"))show();
  load();paint();
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",maintain,{once:true});
 else maintain();
 window.addEventListener("hashchange",maintain);
 setInterval(maintain,1500);
})();
