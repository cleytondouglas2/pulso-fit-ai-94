/* PulsoFit AI — restaura "Mais" e suas opções sem alterar rotas nativas. */
(function(){
"use strict";
if(window.__PULSO_MAIS_MENU_20261118__)return;
window.__PULSO_MAIS_MENU_20261118__=true;
var sheet=null,scheduled=false,menuListeners=new WeakSet(),nextAction=null;
var css=[
'#app .mobile-nav button[data-route="goals"] > span:first-child{display:inline-flex!important;justify-content:center!important;align-items:center!important;flex:0 0 32px!important;width:32px!important;height:32px!important;min-height:32px!important;font-size:30px!important;line-height:1!important;margin-inline:auto!important}',
'#app .mobile-nav button[data-route="goals"] > span:first-child svg,#app .mobile-nav button[data-route="goals"] svg{display:block!important;width:31px!important;height:31px!important;min-width:31px!important;min-height:31px!important;max-width:31px!important;max-height:31px!important;stroke-width:2.3!important}',
'#app .mobile-nav button[data-pf-mais-tab="1"] > .pf-more-nav-icon{display:inline-flex!important;justify-content:center!important;align-items:center!important;flex:0 0 32px!important;width:32px!important;height:32px!important;min-height:32px!important;line-height:1!important;margin-inline:auto!important;color:inherit!important}',
'#app .mobile-nav button[data-pf-mais-tab="1"] > .pf-more-nav-icon svg{display:block!important;width:31px!important;height:31px!important;min-width:31px!important;min-height:31px!important;stroke-width:2.4!important;stroke:currentColor!important}',
'#app .mobile-nav button[data-pf-mais-tab="1"] > .pf-more-nav-label{display:block!important;font:800 clamp(10px,2.5vw,12px)/1.2 system-ui,sans-serif!important;white-space:nowrap!important}',
'#app .mobile-nav button[data-route="goals"],#app .mobile-nav button[data-pf-mais-tab="1"]{justify-content:center!important;align-items:center!important;gap:5px!important;overflow:visible!important}',
'.mobile-nav .pf-more-nav-icon{font:900 25px/1 system-ui,sans-serif!important;display:block!important;color:inherit!important}',
'.mobile-nav .pf-more-nav-label{font:800 11px/1.3 system-ui,sans-serif!important;display:block!important;white-space:nowrap!important}',
'.mobile-nav [data-pf-mais-tab="1"]{box-sizing:border-box!important;min-width:0!important;max-width:100%!important;color:#b2fff1!important;display:flex!important;align-items:center!important;flex-direction:column!important;justify-content:center!important;gap:5px!important;cursor:pointer!important}',
'#pf-more-drawer{position:fixed!important;inset:0!important;z-index:2147483400!important;background:#060a18dd!important;backdrop-filter:blur(8px)!important;display:flex!important;align-items:flex-end!important;justify-content:center!important;box-sizing:border-box!important;padding:0!important;overflow-y:auto!important;color:#fff!important;font-family:system-ui,-apple-system,sans-serif!important}',
'#pf-more-drawer *{box-sizing:border-box!important;min-width:0!important}',
'#pf-more-drawer .pf-more-sheet{width:min(100%,680px)!important;max-height:min(88dvh,780px)!important;overflow-y:auto!important;border:1px solid #8d73c9!important;border-bottom:0!important;border-radius:26px 26px 0 0!important;background:radial-gradient(circle at 100% 0,#793db746,transparent 48%),linear-gradient(145deg,#222443,#121b31)!important;box-shadow:0 -12px 60px #0009!important;padding:20px clamp(15px,4vw,26px) calc(25px + env(safe-area-inset-bottom,0px))!important}',
'#pf-more-drawer .pf-more-grabber{height:4px;width:44px;background:#8676b0;border-radius:5px;margin:0 auto 18px}',
'#pf-more-drawer .pf-more-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:18px}',
'#pf-more-drawer .pf-more-title{margin:0!important;color:#fff!important;font:850 clamp(23px,5vw,29px)/1.15 system-ui,sans-serif!important;letter-spacing:-.04em!important}',
'#pf-more-drawer .pf-more-desc{font:13px/1.5 system-ui,sans-serif!important;color:#c9c4df!important;margin:7px 0 0!important}',
'#pf-more-drawer .pf-more-close{width:40px;height:40px;flex:0 0 40px;border:1px solid #8172a9;border-radius:13px;background:#36334f;color:#fff;font:27px system-ui,sans-serif;cursor:pointer}',
'#pf-more-drawer .pf-more-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;width:100%}',
'#pf-more-drawer .pf-more-entry{display:flex;align-items:center;text-align:left;gap:12px;border:1px solid #66618c;border-radius:16px;background:#202b45;color:#fff;padding:15px 12px;cursor:pointer;min-height:86px;width:100%;font:800 13px/1.3 system-ui,sans-serif}',
'#pf-more-drawer .pf-more-entry:active{transform:scale(.985)}',
'#pf-more-drawer .pf-more-entry .pf-more-emoji{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;font-size:22px;border-radius:12px;background:#aa74ef2a}',
'#pf-more-drawer .pf-more-entry b{font:850 13px/1.4 system-ui,sans-serif;color:#fff}',
'#pf-more-drawer .pf-more-entry small{display:block;margin-top:4px;font:11px/1.5 system-ui,sans-serif;color:#c8c5de}',
'#pf-more-drawer .pf-more-logout{width:100%;margin-top:17px;padding:13px 16px;border:1px solid #a0799b;border-radius:13px;color:#ffe9ef;background:#3b2c42;font:800 13px system-ui,sans-serif;cursor:pointer}',
'#pf-more-drawer .pf-more-message{color:#baffdc;font:12px/1.5 system-ui,sans-serif;min-height:15px;margin-top:9px}',
'@media(max-width:360px){#pf-more-drawer .pf-more-grid{grid-template-columns:1fr}#pf-more-drawer .pf-more-entry{min-height:66px;padding:11px}}',
'@media(prefers-reduced-motion:reduce){#pf-more-drawer .pf-more-entry{transition:none!important}}'
].join("\n");
function logged(){try{return !!sessionStorage.getItem("pulso-fit-token")&&!document.body.classList.contains("pf-account-locked")}catch{return false}}
function route(){return (location.hash||"#/home").replace(/^#\/?/,"").split("/")[0].toLowerCase()}
function closeMenu(){if(sheet){sheet.remove();sheet=null}document.removeEventListener("keydown",onEscape)}
function onEscape(ev){if(ev.key==="Escape")closeMenu()}
function openMenu(){
 if(!logged())return;
 if(sheet?.isConnected)return;
 var el=document.createElement("div");el.id="pf-more-drawer";
 el.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="pf-more-menu-title" class="pf-more-sheet">'+
 '<div class="pf-more-grabber" aria-hidden="true"></div>'+
 '<header class="pf-more-head"><div><h2 id="pf-more-menu-title" class="pf-more-title">Mais opções</h2>'+
 '<p class="pf-more-desc">Perfil, evolução, recursos e sua assinatura em um só lugar.</p></div>'+
 '<button class="pf-more-close" type="button" aria-label="Fechar Mais">×</button></header>'+
 '<div class="pf-more-grid" role="group" aria-label="Outras funções do PulsoFit"></div>'+
 '<button type="button" class="pf-more-logout">Sair da conta</button>'+
 '<p class="pf-more-message" role="status" aria-live="polite"></p></section>';
 var items=[
  ["profile","👤","Meu perfil","Foto, informações e preferências"],
  ["performance","📸","Performance IA","Análise corporal por foto"],
  ["assessment","📈","Avaliação e progresso","Método da IA e evolução"],
  ["account","☁️","Conta online","Dados, sincronização e plano"],
  ["subscription","💎","Planos e validade","7 dias grátis e assinatura"],
  ["goals","🎯","Minhas metas","Objetivos e resultados"],
  ["workouts","🏋️","Treinos","Casa, academia e CrossFit"],
  ["training-lab","⚡","Treino Vivo","10 missões, substituições e histórico"],
  ["coach","✨","Coach IA","Converse sobre seus treinos"]
 ];
 var grid=el.querySelector(".pf-more-grid");
 items.forEach(function(item){
  var b=document.createElement("button");b.type="button";b.className="pf-more-entry";
  b.setAttribute("data-pf-more-action",item[0]);
  var ico=document.createElement("span");ico.className="pf-more-emoji";ico.setAttribute("aria-hidden","true");ico.textContent=item[1];
  var label=document.createElement("span");var title=document.createElement("b");title.textContent=item[2];
  var small=document.createElement("small");small.textContent=item[3];
  label.appendChild(title);label.appendChild(small);b.appendChild(ico);b.appendChild(label);
  b.addEventListener("click",function(){void act(item[0])});grid.appendChild(b);
 });
 el.querySelector(".pf-more-close").addEventListener("click",closeMenu);
 el.querySelector(".pf-more-logout").addEventListener("click",function(){void act("logout")});
 el.addEventListener("click",function(ev){if(ev.target===el)closeMenu()});
 document.body.appendChild(el);sheet=el;
 document.addEventListener("keydown",onEscape);
 el.querySelector(".pf-more-close").focus();
}
function goTo(name){
 closeMenu();
 if(route()!==name)location.hash="#/"+name;
 else window.dispatchEvent(new HashChangeEvent("hashchange"));
}
function runExistingAction(action){
 if(action==="performance"){
  var element=document.querySelector("#app [data-pf-open-performance]");
  if(element){element.click();return true}
 }
 if(action==="assessment"){
  var element=document.querySelector("#app [data-pfrr-tool='assessment']")||
    document.querySelector("#app .pf-eval-launch");
  if(element){element.click();return true}
 }
 return false;
}
function openFeature(name){
 closeMenu();
 if(route()!=="profile")location.hash="#/profile";
 var count=0;
 function attempt(){
  if(runExistingAction(name))return;
  if(++count<16){setTimeout(attempt,180);return}
  // Keep a valid route visible instead of silently doing nothing.
  location.hash="#/profile";
 }
 setTimeout(attempt,110);
}
async function logout(){
 if(!confirm("Deseja sair da sua conta PulsoFit neste aparelho?"))return;
 closeMenu();
 var t="";try{t=sessionStorage.getItem("pulso-fit-token")||""}catch{}
 try{
  if(t)await fetch("/api/auth/logout",{method:"POST",headers:{"Authorization":"Bearer "+t},signal:AbortSignal.timeout(4500)}).catch(()=>{});
 }finally{
  try{sessionStorage.removeItem("pulso-fit-token")}catch{}
  location.hash="#/home";location.reload();
 }
}
async function act(action){
 if(!logged()){closeMenu();return}
 if(action==="logout")return logout();
 if(action==="training-lab"){closeMenu();window.dispatchEvent(new Event("pulso-open-training-lab"));return}
 if(action==="performance"||action==="assessment")return openFeature(action);
 var allowed=new Set(["profile","account","subscription","goals","workouts","coach"]);
 if(allowed.has(action))goTo(action);
}
function buttonIsMore(el){
 if(!el||!el.matches("button,[data-route]"))return false;
 var r=el.getAttribute("data-route");
 if(r==="more"||r==="mais"||r==="profile")return true;
 return /^(?:mais|perfil)$/i.test(String(el.textContent||"").trim());
}
function fixNav(){
 if(!logged())return;
 var nav=document.querySelector("#app .mobile-nav");
 if(!nav)return;
 var items=Array.from(nav.querySelectorAll(":scope > button,:scope > [data-route]"));
 var tab=items.find(el=>el.getAttribute("data-route")==="profile"||el.getAttribute("data-route")==="more")||
  items.find(el=>el.getAttribute("data-pf-mais-tab")==="1")||
  items.find(buttonIsMore);
 // Avoid creating a sixth tab. The app's original fifth tab points at /profile.
 if(!tab&&items.length>=5)tab=items[items.length-1];
 if(!tab&&items.length===4){
  tab=document.createElement("button");tab.type="button";tab.className="nav-link";
  tab.setAttribute("data-route","profile");nav.appendChild(tab);
 }
 if(!tab)return;
 if(tab.dataset.pfMaisTab!=="1"){
  tab.dataset.pfMaisTab="1";tab.setAttribute("aria-label","Abrir menu Mais");
  // Preserve the existing data-route=profile for integrations with the native router.
  if(!tab.getAttribute("data-route"))tab.setAttribute("data-route","profile");
  tab.innerHTML='<span class="pf-more-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></span><span class="pf-more-nav-label">Mais</span>';
 }
 else if(!tab.querySelector(".pf-more-nav-label")||tab.querySelector(".pf-more-nav-label")?.textContent!=="Mais"){
  tab.innerHTML='<span class="pf-more-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></span><span class="pf-more-nav-label">Mais</span>';
 }
 if(!menuListeners.has(tab)){
  menuListeners.add(tab);
  tab.addEventListener("click",function(ev){
   ev.preventDefault();ev.stopImmediatePropagation();openMenu();
  },true);
 }
 // Clicking Mais on /profile still opens the drawer, never just re-renders the profile.
 tab.classList.toggle("active",["profile","account","subscription"].includes(route()));
}
function schedule(){
 if(scheduled)return;
 scheduled=true;
 requestAnimationFrame(function(){scheduled=false;fixNav()});
}
function init(){
 var style=document.createElement("style");style.id="pf-more-drawer-css";style.textContent=css;
 (document.head||document.documentElement).appendChild(style);
 var app=document.getElementById("app");
 if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
 window.addEventListener("hashchange",function(){closeMenu();schedule()});
 window.addEventListener("pulso-auth-ready",schedule);
 window.addEventListener("pageshow",schedule);
 setInterval(schedule,1700);
 schedule();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();