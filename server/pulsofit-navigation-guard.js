/* Mobile SPA route shield: never expose stale content between route commits.
 * Navigation is never delayed. A loading layer covers the old frame until the
 * destination DOM has actually rendered for two animation frames.
 */
(function(){
"use strict";
if(window.__PF_NAVIGATION_GUARD__)return;window.__PF_NAVIGATION_GUARD__=true;
let active=false,epoch=0,mutations=0,stable=0,started=0,scheduled=false,routeAtStart="",timer=null;
const current=()=>String(location.hash||"#/home").replace(/^#\/?/,"").split("/")[0].toLowerCase();
const getApp=()=>document.getElementById("app");
function layer(){
 let el=document.getElementById("pf-screen-curtain");
 if(el)return el;
 el=document.createElement("div");el.id="pf-screen-curtain";
 el.setAttribute("role","status");el.setAttribute("aria-label","Carregando próxima página");
 el.innerHTML='<span class="pf-screen-spinner" aria-hidden="true"></span><span>Carregando página…</span>';
 document.body.appendChild(el);
 return el;
}
function finish(sequence){
 if(!active||epoch!==sequence)return;
 active=false;stable=0;
 document.body.classList.remove("pf-screen-changing");
 const el=document.getElementById("pf-screen-curtain");if(el)el.remove();
}
function verify(sequence){
 if(!active||epoch!==sequence)return;
 const age=performance.now()-started;
 // If the app never emits a route DOM change, release the curtain rather
 // than trapping the user behind an eternal loading state.
 if(age>950){finish(sequence);return}
 if(!document.body.contains(getApp())){requestAnimationFrame(()=>verify(sequence));return}
 if(current()===routeAtStart&&age<150){requestAnimationFrame(()=>verify(sequence));return}
 if(mutations===0&&age<110){requestAnimationFrame(()=>verify(sequence));return}
 if(mutations>0){
  // Wait for a stable paint after childList DOM changes have settled.
  if(scheduled){stable=0;scheduled=false}else stable++;
  if(stable>=2){finish(sequence);return}
 }
 requestAnimationFrame(()=>verify(sequence));
}
function begin(){
 if(!document.body)return;
 const now=performance.now();
 if(!active){routeAtStart=current();started=now;mutations=0;stable=0}
 else{started=Math.min(started,now);stable=0}
 active=true;epoch++;
 document.body.classList.add("pf-screen-changing");
 layer();
 const sequence=epoch;
 requestAnimationFrame(()=>verify(sequence));
}
function navigationalClick(event){
 const el=event.target?.closest?.("[data-route],a[href^='#/'],[data-pf-more-action]");
 if(!el||el.disabled)return;
 if(el.getAttribute("data-pf-mais-tab")==="1"||el.getAttribute("data-route")==="more")return;
 const section=el.getAttribute("data-route")||
   (el.getAttribute("href")||"").replace(/^#\/?/,"").split("/")[0]||
   el.getAttribute("data-pf-more-action")||"";
 if(!section||["more","mais","playlist","camera-ar","logout","notifications","outdoor","meal","training-lab"].includes(section))return;
 if(section===current())return;
 begin();
}
function init(){
 const style=document.createElement("style");style.id="pf-screen-guard-style";
 style.textContent='#pf-screen-curtain{position:fixed!important;inset:0!important;z-index:2147483000!important;background:linear-gradient(150deg,#0c1125,#171332)!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:13px!important;color:#b9ffe3!important;font:850 13px/1.4 system-ui!important;letter-spacing:.02em!important;pointer-events:auto!important}'+
  '#pf-screen-curtain .pf-screen-spinner{width:34px;height:34px;border-radius:50%;border:3px solid #6e53a8;border-top-color:#abffe2;animation:pf-curtain-spin .65s linear infinite}'+
  '@keyframes pf-curtain-spin{to{transform:rotate(360deg)}}'+
  'body.pf-screen-changing #app{visibility:hidden!important}'+
  '@media(prefers-reduced-motion:reduce){#pf-screen-curtain .pf-screen-spinner{animation:none}}';
 document.head.appendChild(style);
 const app=getApp();
 if(app)new MutationObserver(records=>{
  if(!active)return;
  for(const record of records){if(record.type==="childList"&&record.addedNodes.length+record.removedNodes.length>0){mutations++;scheduled=true;break}}
 }).observe(app,{childList:true,subtree:true});
 document.addEventListener("click",navigationalClick,true);
 window.addEventListener("hashchange",()=>{if(!active)begin()});
 window.addEventListener("popstate",()=>{if(!active)begin()});
 // No focus manipulation; the destination retains native keyboard and touch behavior.
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();