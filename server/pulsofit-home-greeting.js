/* PulsoFit: personalized daily HTML5 home greeting.
 * No user name persisted to local/session storage.
 */
(function(){
"use strict";
if(window.__PULSO_HOME_GREETING_20261118__)return;
window.__PULSO_HOME_GREETING_20261118__=true;
var cachedName="",lastToken="",pending=null,scheduled=false,lastHour=-1,avatar=null,avatarForToken="",avatarPending=null;
var messages=[
 "Cada movimento conta. Comece pelo que é possível hoje.",
 "Consistência vale mais que perfeição. Seu ritmo é seu.",
 "Treinar é cuidar do seu futuro — um dia de cada vez.",
 "Seu próximo avanço começa com uma escolha simples.",
 "Descanso também é parte da evolução. Escute seu corpo.",
 "Você não precisa competir com ninguém. Evolua por você.",
 "Um treino curto ainda é um compromisso com você.",
 "A jornada é construída com passos reais, não pressa.",
 "Comece com calma, mantenha o foco e celebre o processo.",
 "A energia pode variar. Adapte seu treino e continue."
];
function safe(t){return String(t||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function token(){try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}}
function authenticated(){return !!token()&&!document.body.classList.contains("pf-account-locked")}
function home(){return String(location.hash||"#/home").replace(/^#\/?/,"").split("/")[0].toLowerCase()==="home"}
function dayGreeting(){var h=new Date().getHours();return h>=5&&h<12?"Bom dia":h>=12&&h<18?"Boa tarde":"Boa noite"}
function localDay(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function quote(){var d=new Date(),seed=Math.floor(new Date(d.getFullYear(),0,1).getTime()/86400000)+Math.floor((new Date(d.getFullYear(),d.getMonth(),d.getDate())-new Date(d.getFullYear(),0,1))/86400000);return messages[Math.abs(seed)%messages.length]}
function userFirstName(){return cachedName?cachedName.trim().split(/\s+/)[0]:"você"}
async function fetchName(){
 const t=token();
 if(!t||pending||t===lastToken&&cachedName)return;
 pending=(async()=>{
  try{
   const response=await fetch("/api/me",{cache:"no-store",headers:{"Authorization":"Bearer "+t},signal:AbortSignal.timeout(9000)});
   if(!response.ok)return;
   const data=await response.json(),u=data.user||data;
   if(t!==token())return;
   const name=String(u.name||u.fullName||u.full_name||"").trim().slice(0,90);
   cachedName=name;lastToken=t;
  }catch{}finally{pending=null;requestRender()}
 })();
 await pending;
}
function validPhoto(v){return typeof v==="string"&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]{40,}$/.test(v)?v:null}
function drawPhoto(){
 const holder=document.querySelector("#pf-home-welcome .pf-home-greet-icon");
 if(!holder)return;
 const image=holder.querySelector("img"),fallback=holder.querySelector("[data-pf-home-fallback]");
 if(image){
  if(avatar){if(image.getAttribute("src")!==avatar)image.src=avatar;image.hidden=false}
  else{image.hidden=true;image.removeAttribute("src")}
 }
 if(fallback)fallback.hidden=Boolean(avatar);
}
async function fetchPhoto(force){
 const t=token();
 if(!t){avatar=null;avatarForToken="";drawPhoto();return}
 if(avatarPending||!force&&avatarForToken===t)return;
 avatarPending=(async()=>{
  try{
   const r=await fetch("/api/profile/photo",{cache:"no-store",headers:{Authorization:"Bearer "+t},signal:AbortSignal.timeout(9000)});
   if(!r.ok)return;
   const d=await r.json();if(t!==token())return;
   avatar=Boolean(d.hasPhoto)?validPhoto(d.image):null;avatarForToken=t;
   drawPhoto();
  }catch{}finally{avatarPending=null}
 })();
 await avatarPending;
}
function normalizeBrand(area){
 // Only the exact pre-existing heading is normalized. No navigation, icons or links touched.
 const headings=area.querySelectorAll("h1,h2,.page-title,.pro-title,.home-title");
 for(const node of headings){
  if(node.closest("#pf-home-welcome"))continue;
  const content=(node.textContent||"").replace(/\s+/g," ").trim();
  if(/^(?:pulso\s*fit|pulsofit)\s*(?:ai)?\s*[-–|:]?\s*in[ií]cio$/i.test(content)){
   node.textContent="PulsoFit";return;
  }
 }
}
function render(){
 if(!home()||!authenticated())return;
 const app=document.getElementById("app");
 const area=app?.querySelector(".main")||app?.querySelector("main");
 if(!area)return;
 normalizeBrand(area);
 let banner=area.querySelector("#pf-home-welcome");
 if(!banner){
  banner=document.createElement("section");banner.id="pf-home-welcome";banner.className="pf-home-welcome";
  banner.setAttribute("aria-label","Boas-vindas e motivação diária");
  banner.innerHTML='<div class="pf-home-greet-eyebrow">PULSOFIT <span>AI</span> · SUA JORNADA</div>'+
   '<div class="pf-home-greet-row"><div><h2 id="pf-home-greet-title"></h2><p id="pf-home-greet-quote"></p></div>'+
   '<span class="pf-home-greet-icon" aria-label="Foto do perfil"><img alt="Sua foto de perfil" hidden><span data-pf-home-fallback aria-hidden="true">✦</span></span></div>'+
   '<div class="pf-home-greet-footer"><span>Hoje é uma nova oportunidade de se movimentar.</span>'+
   '<button id="pf-home-outdoor-shortcut" type="button">🚶 Atividade ao ar livre</button></div>';
  area.insertBefore(banner,area.firstElementChild);
  banner.querySelector("#pf-home-outdoor-shortcut").addEventListener("click",()=>window.dispatchEvent(new Event("pulso-open-outdoor")));
 }
 const title=banner.querySelector("#pf-home-greet-title"),desc=banner.querySelector("#pf-home-greet-quote");
 const name=userFirstName(),greet=dayGreeting();
 const newTitle=greet+", "+name+"!";
 if(title.textContent!==newTitle)title.textContent=newTitle;
  drawPhoto();
 const q=quote();if(desc.textContent!==q)desc.textContent=q;
}
function requestRender(){
 if(scheduled)return;scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;try{render()}catch{}});
}
function boot(){
 const app=document.getElementById("app");
 if(app)new MutationObserver(requestRender).observe(app,{childList:true,subtree:true});
 window.addEventListener("hashchange",requestRender);
 window.addEventListener("pageshow",requestRender);
 window.addEventListener("pulso-auth-ready",()=>{avatarForToken="";void fetchPhoto(true);void fetchName();requestRender()});
  window.addEventListener("pulso-avatar-changed",ev=>{
   avatar=validPhoto(ev.detail?.src);avatarForToken=token();drawPhoto();
  });
 // Detect token changes without adding additional network requests per DOM update.
 setInterval(()=>{
  const t=token();if(t!==lastToken){cachedName="";lastToken=t;avatar=null;avatarForToken="";if(t){void fetchName();void fetchPhoto(true)}else drawPhoto()}
  if(lastHour!==new Date().getHours()){lastHour=new Date().getHours();requestRender()}
 },45000);
 void fetchName();void fetchPhoto(false);requestRender();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
