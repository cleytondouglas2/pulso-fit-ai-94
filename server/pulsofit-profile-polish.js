/* PulsoFit — Perfil responsivo, header com foto, ações e sair da conta. */
(function(){
"use strict";
if(window.__PULSO_PROFILE_POLISH__)return;
window.__PULSO_PROFILE_POLISH__=true;
var avatarSrc=null,logoutBusy=false,queued=false;
var css=[
'#app .profile-cover.pf-polished-profile{position:relative!important;isolation:isolate;display:flex!important;align-items:center!important;gap:clamp(13px,3vw,20px)!important;flex-wrap:wrap!important;min-width:0!important;overflow:hidden!important;padding:clamp(18px,4vw,28px)!important;margin-bottom:14px!important;border:1px solid rgba(169,123,251,.55)!important;border-radius:23px!important;background:radial-gradient(circle at 90% 5%,rgba(146,87,251,.24),transparent 55%),linear-gradient(115deg,#1e2444,#222047 65%,#322454)!important;box-shadow:0 12px 36px rgba(23,12,54,.3)!important}',
'#app .profile-cover.pf-polished-profile::after{content:"";position:absolute;right:-40px;bottom:-85px;width:190px;height:190px;background:#a35efd29;filter:blur(43px);border-radius:50%;z-index:-1;pointer-events:none}',
'#app .profile-cover.pf-polished-profile>.avatar,#app .profile-cover.pf-polished-profile>.profile-avatar{display:none!important}',
'#app .pf-cover-avatar{position:relative;flex:0 0 clamp(70px,18vw,92px);width:clamp(70px,18vw,92px);height:clamp(70px,18vw,92px);display:flex;align-items:center;justify-content:center;background:linear-gradient(140deg,#b3ffc7,#72bddd);border:3px solid rgba(179,255,223,.8);box-shadow:0 0 0 5px #ffffff0e,0 10px 25px #03071666;border-radius:25px;overflow:hidden;color:#10263c;font:900 39px system-ui,sans-serif}',
'#app .pf-cover-avatar img{width:100%;height:100%;object-fit:cover;display:block}',
'#app .pf-cover-avatar img[hidden]{display:none!important}',
'#app .profile-cover.pf-polished-profile>:not(.pf-cover-avatar){min-width:0!important;max-width:100%}',
'#app .profile-cover.pf-polished-profile h1,#app .profile-cover.pf-polished-profile h2,#app .profile-cover.pf-polished-profile h3{overflow-wrap:anywhere;letter-spacing:-.035em!important;line-height:1.1!important;margin:5px 0!important}',
'#app .profile-cover.pf-polished-profile p,#app .profile-cover.pf-polished-profile span{overflow-wrap:anywhere}',
'#app .profile-cover.pf-polished-profile .pf-online-identity-note{flex:1 1 100%;order:10;display:inline-flex;align-items:center;gap:7px;border:1px solid #77dabb55;border-radius:12px;background:#183f4466;padding:8px 11px;margin:5px 0 0;color:#b2ffe2;font:800 11px/1.4 system-ui,sans-serif}',
'#app .pf-profile-header-tag{display:flex;gap:9px;align-items:center;color:#a4fff0;font:800 11px/1.35 system-ui,sans-serif;letter-spacing:.08em;margin-bottom:6px;text-transform:uppercase}',
'#app .pf-profile-header-tag .pf-profile-status-dot{width:7px;height:7px;border-radius:50%;background:#73f6c9;box-shadow:0 0 0 4px #57e8c51b}',
'#app #pf-profile-photo-widget{position:relative;box-sizing:border-box;width:100%;display:grid!important;grid-template-columns:78px minmax(0,1fr);grid-template-rows:auto auto auto;gap:9px 15px!important;align-items:center!important;flex-wrap:initial!important;margin:13px 0 16px!important;padding:17px!important;border-radius:19px!important;background:linear-gradient(125deg,#1b2340,#242447)!important;border:1px solid #6760a0!important;box-shadow:0 7px 28px #00000024!important;color:#fff}',
'#app #pf-profile-photo-widget strong{grid-column:2;grid-row:1;display:block;min-width:0;font:850 16px/1.35 system-ui,sans-serif}',
'#app #pf-profile-photo-widget img{grid-column:1;grid-row:1 / span 2;width:74px!important;height:74px!important;max-width:74px!important;max-height:74px!important;object-fit:cover;border:2px solid #b49bee!important;box-sizing:border-box;box-shadow:0 6px 17px #0006;border-radius:20px!important}',
'#app #pf-profile-photo-widget #pf-avatar-placeholder{grid-column:1;grid-row:1 / span 2;width:74px!important;height:74px!important;min-width:74px!important;min-height:74px!important;max-height:74px!important;max-width:74px!important;border:2px solid #a79ac7;box-sizing:border-box;box-shadow:0 6px 17px #0004;border-radius:20px!important}',
'#app #pf-profile-photo-widget label{grid-column:2;grid-row:2;display:inline-flex!important;align-items:center;justify-content:center;min-width:0;width:fit-content;max-width:100%;box-sizing:border-box;padding:11px 14px!important;background:linear-gradient(110deg,#8545c8,#a05be7)!important;border:1px solid #b79dfa!important;border-radius:12px!important;font:800 12px/1.3 system-ui,sans-serif!important;white-space:normal!important;text-align:center;cursor:pointer}',
'#app #pf-profile-photo-widget label:focus-within{outline:2px solid #d7bcff;outline-offset:3px}',
'#app #pf-profile-photo-widget>button{grid-column:1 / -1;grid-row:3;width:100%;box-sizing:border-box;min-height:42px;background:#352f50!important;border:1px solid #867ba5!important;border-radius:12px!important;color:#ebdefa!important;font:800 12px system-ui,sans-serif!important}',
'#app #pf-profile-photo-widget small{grid-column:1 / -1;grid-row:4;color:#c9bfdd;font:11px/1.45 system-ui,sans-serif}',
'#app #pf-profile-photo-widget [role="status"]{grid-column:1 / -1;grid-row:5;min-height:12px;font:12px/1.4 system-ui,sans-serif;color:#b7fadc}',
'#app .pf-more-performance-card{box-sizing:border-box;width:100%;display:flex!important;flex-wrap:wrap;align-items:center;gap:13px!important;padding:17px!important;margin:14px 0!important;border-radius:19px!important;border:1px solid #805fcb!important;background:linear-gradient(110deg,#342558,#1c2544)!important;box-shadow:0 8px 22px #11092b44}',
'#app .pf-more-performance-card button{min-height:43px!important;min-width:94px;flex:0 0 auto;border-radius:11px!important;box-sizing:border-box}',
'#app .pf-profile-account-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;box-sizing:border-box;width:100%;padding:14px 16px;margin:12px 0 18px;border:1px solid #5e5c88;border-radius:17px;background:#1b233c;color:#eef2ff}',
'#app .pf-profile-account-actions .pf-profile-account-state{display:grid;gap:3px;flex:1 1 180px;min-width:0}',
'#app .pf-profile-account-actions strong{font:850 13px system-ui,sans-serif;color:#fff}',
'#app .pf-profile-account-actions small{font:11px/1.5 system-ui,sans-serif;color:#bebed6}',
'#app .pf-profile-logout{border:1px solid #a78ead;border-radius:12px;background:#413249;color:#ffe0e5;min-height:42px;padding:10px 14px;font:800 12px system-ui,sans-serif;cursor:pointer;flex:0 0 auto}',
'#app .pf-profile-logout:disabled{opacity:.5;cursor:wait}',
'#app .profile-cover.pf-polished-profile~*,#app .pf-profile-account-actions~*{max-width:100%;box-sizing:border-box}',
'#app :is(.profile-cover,.pf-more-performance-card,#pf-profile-photo-widget,.pf-profile-account-actions) input,#app :is(.profile-cover,.pf-more-performance-card,#pf-profile-photo-widget,.pf-profile-account-actions) button{font-size:max(12px,1em)}',
'@media(max-width:420px){#app #pf-profile-photo-widget{grid-template-columns:62px minmax(0,1fr);gap:10px;padding:13px!important}#app #pf-profile-photo-widget img,#app #pf-profile-photo-widget #pf-avatar-placeholder{width:60px!important;height:60px!important;min-width:60px!important;min-height:60px!important;max-width:60px!important;max-height:60px!important}#app #pf-profile-photo-widget label{width:100%;padding:10px 9px!important}#app .profile-cover.pf-polished-profile{gap:13px!important;padding:17px!important}#app .pf-more-performance-card button{flex:1 1 100%}}',
'@media(min-width:690px){#app #pf-profile-photo-widget{grid-template-columns:92px minmax(0,1fr) auto}#app #pf-profile-photo-widget img{grid-row:1 / span 3;grid-column:1}#app #pf-profile-photo-widget strong{grid-column:2;grid-row:1}#app #pf-profile-photo-widget label{grid-column:2;grid-row:2}#app #pf-profile-photo-widget>button{grid-column:3;grid-row:2;min-width:135px}#app #pf-profile-photo-widget small{grid-column:2 / -1;grid-row:3}#app #pf-profile-photo-widget [role="status"]{grid-column:2 / -1;grid-row:4}}',
'@media(prefers-reduced-motion:reduce){#app .pf-cover-avatar{transition:none}}'
].join("\n");
function active(){try{return Boolean(sessionStorage.getItem("pulso-fit-token"))&&!document.body.classList.contains("pf-account-locked")}catch{return false}}
function route(){return String(location.hash||"").replace(/^#\/?/,"").split("/")[0].toLowerCase()}
function safePhoto(image){return typeof image==="string"&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]{30,}$/.test(image)?image:null}
function syncAvatar(){
 var img=document.querySelector("#app .pf-cover-avatar img");
 if(img){if(avatarSrc){if(img.getAttribute("src")!==avatarSrc)img.src=avatarSrc;img.hidden=false}else{img.hidden=true;img.removeAttribute("src")}}
 var preview=document.getElementById("pf-avatar-preview");
 if(preview){if(avatarSrc){preview.src=avatarSrc;preview.style.display="block"}else{preview.removeAttribute("src");preview.style.display="none"}}
}
async function logout(){
 if(logoutBusy)return;
 if(!confirm("Deseja sair da sua conta PulsoFit neste aparelho?"))return;
 logoutBusy=true;
 var btn=document.querySelector(".pf-profile-logout");if(btn){btn.disabled=true;btn.textContent="Saindo..."}
 var session="";try{session=sessionStorage.getItem("pulso-fit-token")||""}catch{}
 try{if(session)await fetch("/api/auth/logout",{method:"POST",headers:{"Authorization":"Bearer "+session},signal:AbortSignal.timeout(6000)}).catch(()=>{})}
 finally{
  try{sessionStorage.removeItem("pulso-fit-token")}catch{}
  avatarSrc=null;window.dispatchEvent(new CustomEvent("pulso-avatar-changed",{detail:{src:null}}));
  location.hash="#/home";location.reload();
 }
}
function attachProfile(){
 if(!active())return;
 var app=document.getElementById("app");if(!app)return;
 var page=route(),cover=app.querySelector(".profile-cover");
 if(page!=="profile"&&page!=="account"&&!cover)return;
 if(cover){
  cover.classList.add("pf-polished-profile");
  if(!cover.querySelector(".pf-cover-avatar")){
   var avatar=document.createElement("div");avatar.className="pf-cover-avatar";avatar.setAttribute("aria-label","Foto do perfil");
   avatar.innerHTML='<img alt="Foto da conta conectada" hidden><span aria-hidden="true">◉</span>';
   cover.insertBefore(avatar,cover.firstChild);
  }
  var visual=cover.querySelector(".pf-cover-avatar");
  if(visual){var mark=visual.querySelector("span");if(mark)mark.style.display=avatarSrc?"none":""}
  if(!cover.querySelector(".pf-profile-header-tag")){
   var tag=document.createElement("span");tag.className="pf-profile-header-tag";
   tag.innerHTML='<span class="pf-profile-status-dot" aria-hidden="true"></span> PERFIL VERIFICADO';
   // Use the existing card's visible text area; no replacement of native profile.
   cover.appendChild(tag);
  }
 }
 var parent=cover?.parentElement||app.querySelector(".pro-cols .pro-surface")?.parentElement||app.querySelector(".main")||app;
 if(!parent.querySelector(".pf-profile-account-actions")){
  var area=document.createElement("section");area.className="pf-profile-account-actions";
  area.innerHTML='<div class="pf-profile-account-state"><strong>Conta online conectada</strong>'+
   '<small>Seu perfil, progresso e fotos ficam associados ao seu acesso.</small></div>'+
   '<button type="button" class="pf-profile-logout">Sair da conta</button>';
  area.querySelector("button").addEventListener("click",logout);
  var pos=parent.querySelector(".pf-more-performance-card")||parent.querySelector("#pf-profile-photo-widget")||cover;
  if(pos&&pos.parentNode===parent)pos.insertAdjacentElement("afterend",area);
  else parent.appendChild(area);
 }
 syncAvatar();
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;attachProfile()})}
function init(){
 var style=document.createElement("style");style.id="pf-profile-polish-css";style.textContent=css;(document.head||document.documentElement).appendChild(style);
 window.addEventListener("pulso-avatar-changed",function(e){
  avatarSrc=safePhoto(e.detail?.src);
  syncAvatar();
  var mark=document.querySelector("#app .pf-cover-avatar span");if(mark)mark.style.display=avatarSrc?"none":"";
 });
 window.addEventListener("pulso-auth-ready",schedule);
 window.addEventListener("hashchange",schedule);
 var app=document.getElementById("app");
 if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
 setInterval(schedule,3000);
 schedule();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();