/* Mobile SPA route shield: never expose stale content between route commits.
 * Navigation is never delayed. A loading layer covers the old frame until the
 * destination DOM has actually rendered for two animation frames.
 */
(function(){
"use strict";
if(window.__PF_NAVIGATION_GUARD__)return;window.__PF_NAVIGATION_GUARD__=true;
let active=false,epoch=0,mutations=0,stable=0,started=0,scheduled=false,routeAtStart="",exitTimer=null,revealTimer=null;
const current=()=>String(location.hash||"#/home").replace(/^#\/?/,"").split("/")[0].toLowerCase();
const getApp=()=>document.getElementById("app");
function layer(){
 let el=document.getElementById("pf-screen-curtain");
 if(el)return el;
 el=document.createElement("div");el.id="pf-screen-curtain";
 el.setAttribute("role","status");el.setAttribute("aria-label","Carregando próxima página");
 el.innerHTML='<div class="pf-screen-loader"><span class="pf-screen-spinner" aria-hidden="true"></span><strong>Carregando página…</strong><span class="pf-screen-progress" aria-hidden="true"><span></span></span></div>';
 document.body.appendChild(el);
 return el;
}
function finish(sequence){
 if(!active||epoch!==sequence)return;
 active=false;stable=0;
 document.body.classList.remove("pf-screen-changing");
 document.body.classList.add("pf-page-revealing");
 const el=document.getElementById("pf-screen-curtain");
 if(el)el.classList.add("pf-screen-curtain--exit");
 clearTimeout(exitTimer);
 clearTimeout(revealTimer);
 exitTimer=setTimeout(()=>{if(!active&&epoch===sequence)el?.remove()},240);
 revealTimer=setTimeout(()=>{if(!active&&epoch===sequence)document.body.classList.remove("pf-page-revealing")},390);
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
 clearTimeout(exitTimer);clearTimeout(revealTimer);
 document.body.classList.remove("pf-page-revealing");
 const existing=document.getElementById("pf-screen-curtain");
 if(existing)existing.classList.remove("pf-screen-curtain--exit");
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
 const section=(el.getAttribute("data-route")||
   (el.getAttribute("href")||"").replace(/^#\/?/,"").split("/")[0]||
   el.getAttribute("data-pf-more-action")||"").toLowerCase();
 if(!section||["more","mais","playlist","camera-ar","logout","notifications","outdoor","meal","training-lab","wellbeing","performance","assessment"].includes(section))return;
 if(el.hasAttribute("data-pf-more-action")&&!["profile","account","subscription","goals","workouts","coach"].includes(section))return;
 if((section==="subscription"?"profile":section)===current())return;
 begin();
}
function init(){
 const style=document.createElement("style");style.id="pf-screen-guard-style";
 style.textContent=`
#pf-screen-curtain{
 position:fixed!important;inset:0!important;z-index:2147483000!important;
 display:grid!important;place-items:center!important;box-sizing:border-box!important;
 background:radial-gradient(ellipse at 30% 25%,#403070 0%,transparent 48%),
 linear-gradient(145deg,#0c1125,#171332)!important;
 color:#c6ffe8!important;font:800 13px/1.5 system-ui!important;
 pointer-events:auto!important;isolation:isolate;
 opacity:1;transition:opacity .22s ease!important
}
#pf-screen-curtain::before{
 content:"";position:absolute;inset:0;pointer-events:none;
 background:radial-gradient(circle at 72% 65%,#8057c72b,transparent 43%);
 animation:pf-curtain-glow 1.6s ease-in-out infinite alternate
}
#pf-screen-curtain.pf-screen-curtain--exit{opacity:0!important;pointer-events:none!important}
#pf-screen-curtain .pf-screen-loader{
 display:flex;flex-direction:column;align-items:center;gap:15px;
 width:min(260px,calc(100vw - 48px));text-align:center;z-index:1
}
#pf-screen-curtain .pf-screen-loader strong{font-weight:800;letter-spacing:.015em}
#pf-screen-curtain .pf-screen-spinner{
 box-sizing:border-box;width:40px;height:40px;border-radius:50%;
 border:3px solid #7054ad;border-top-color:#aaffdf;
 box-shadow:0 0 0 6px #b18aff12,0 0 24px #aa82ec3b;
 animation:pf-curtain-spin .75s linear infinite
}
#pf-screen-curtain .pf-screen-progress{
 position:relative;display:block;width:160px;height:3px;overflow:hidden;
 border-radius:99px;background:#c4b2ec29
}
#pf-screen-curtain .pf-screen-progress>span{
 position:absolute;inset:0 auto 0 0;width:42%;
 border-radius:99px;background:linear-gradient(90deg,#ad87ff,#a6ffda);
 animation:pf-curtain-progress 1.15s ease-in-out infinite
}
@keyframes pf-curtain-spin{to{transform:rotate(360deg)}}
@keyframes pf-curtain-progress{0%{transform:translateX(-120%)}100%{transform:translateX(360%)}}
@keyframes pf-curtain-glow{from{opacity:.35}to{opacity:1}}
body.pf-screen-changing #app{visibility:hidden!important}
@keyframes pf-page-reveal{
 from{opacity:0;transform:translate3d(0,12px,0)}
 to{opacity:1;transform:translate3d(0,0,0)}
}
body.pf-page-revealing #app .main,
body.pf-page-revealing #app main:not(.main){
 animation:pf-page-reveal .32s cubic-bezier(.2,.8,.2,1) both!important;
}
/* The app creates its internal panels outside #app. Animate only their entrance. */
@keyframes pf-dialog-backdrop-in{from{opacity:0}to{opacity:1}}
@keyframes pf-dialog-panel-in{
 from{opacity:0;transform:translate3d(0,16px,0) scale(.985)}
 to{opacity:1;transform:translate3d(0,0,0) scale(1)}
}
:is(#pf-more-drawer,#pf-classes-modal,#pf-eval-overlay,#pf-performance-overlay,
#pf-tv-overlay,#pf-outdoor-overlay,#pf-account-lock,#pf-push-overlay,
#pf-companion-modal,#pf-stable-modal,.pf-plans-portal,.pf-checkout-backdrop){
 animation:pf-dialog-backdrop-in .18s ease-out both
}
:is(#pf-more-drawer .pf-more-sheet,#pf-classes-modal .pf-class-shell,
#pf-eval-overlay .pf-eval-shell,#pf-tv-overlay .pf-tv-sheet,
#pf-outdoor-overlay .pf-outdoor-sheet,#pf-account-lock .pf-auth-dialog,
#pf-stable-modal .pf-stable-body,.pf-plans-portal .pf-plans-dialog,
.pf-checkout-backdrop .pf-checkout-box){
 animation:pf-dialog-panel-in .28s cubic-bezier(.2,.8,.2,1) both
}
@media(prefers-reduced-motion:reduce){
 #pf-screen-curtain,#pf-screen-curtain::before,
 #pf-screen-curtain .pf-screen-spinner,#pf-screen-curtain .pf-screen-progress>span,
 body.pf-page-revealing #app .main,body.pf-page-revealing #app main:not(.main),
 :is(#pf-more-drawer,#pf-classes-modal,#pf-eval-overlay,#pf-performance-overlay,
 #pf-tv-overlay,#pf-outdoor-overlay,#pf-account-lock,#pf-push-overlay,
 #pf-companion-modal,#pf-stable-modal,.pf-plans-portal,.pf-checkout-backdrop),
 :is(#pf-more-drawer .pf-more-sheet,#pf-classes-modal .pf-class-shell,
 #pf-eval-overlay .pf-eval-shell,#pf-tv-overlay .pf-tv-sheet,
 #pf-outdoor-overlay .pf-outdoor-sheet,#pf-account-lock .pf-auth-dialog,
 #pf-stable-modal .pf-stable-body,.pf-plans-portal .pf-plans-dialog,
 .pf-checkout-backdrop .pf-checkout-box){
 animation:none!important;transition:none!important;transform:none!important
 }
}
`;
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