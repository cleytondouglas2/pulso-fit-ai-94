/* Hide upsell/trial prompts for any account already enjoying active access.
 * Status is read from signed-in API; profile keeps renewal and expiration.
 */
(function(){
"use strict";
if(window.__PF_ACTIVE_ACCESS_CLEANUP__)return;window.__PF_ACTIVE_ACCESS_CLEANUP__=true;
const token=()=>{try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}};
let lastToken="",lastRead=0,loading=false,active=false,paid=false,queued=false;
const isCurrent=()=>!!token()&&(active||paid);
function markPromotions(){
 const app=document.getElementById("app");if(!app)return;
 for(const h of app.querySelectorAll("h1,h2,h3,h4,strong,b")){
  const txt=String(h.textContent||"").replace(/\s+/g," ").trim();
  if(!/^(?:🎁\s*)?7 dias de teste gr[aá]tis$/i.test(txt))continue;
  // Locate the compact offer tile, not a containing whole home page.
  let node=h;
  for(let depth=0;node&&node!==app&&depth<5;depth++,node=node.parentElement){
   const t=String(node.textContent||"");
   if(t.includes("Ver planos e validade")&&t.length<950){
    node.setAttribute("data-pf-active-trial-offer","1");break;
   }
  }
 }
 document.body.classList.toggle("pf-active-access",isCurrent());
 document.body.classList.toggle("pf-paid-subscriber",!!token()&&paid);
}
function schedule(){
 if(queued)return;queued=true;
 requestAnimationFrame(()=>{queued=false;markPromotions()});
}
async function check(force){
 const t=token();
 if(t!==lastToken){
  lastToken=t;lastRead=0;active=false;paid=false;
  schedule();
 }
 if(!t||loading||(!force&&Date.now()-lastRead<45000))return;
 lastRead=Date.now();loading=true;
 try{
  const r=await fetch("/api/subscription/status",{headers:{Authorization:"Bearer "+t},cache:"no-store",signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error("Subscription unavailable");
  const j=await r.json();
  if(t!==token())return;
  paid=j.planActive===true;
  active=paid||j.trialActive===true||(Number.isFinite(Date.parse(j.trialEndsAt))&&Date.parse(j.trialEndsAt)>Date.now());
 }catch{}finally{loading=false;schedule()}
}
function boot(){
 const style=document.createElement("style");style.id="pf-active-access-cleanup-style";
 style.textContent="body.pf-active-access #pf-stable-open,body.pf-active-access #pf-plans-shortcut,body.pf-active-access [data-pf-active-trial-offer]{display:none!important}"+
 "body.pf-paid-subscriber #pf-stable-test-offer,body.pf-paid-subscriber [data-pf-trial-promo]{display:none!important}";
 document.head.appendChild(style);
 const app=document.getElementById("app");
 if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
 window.addEventListener("hashchange",()=>{schedule();void check(false)});
 window.addEventListener("pageshow",()=>void check(true));
 window.addEventListener("pulso-auth-ready",()=>void check(true));
 window.addEventListener("pulso-payment-confirmed",()=>void check(true));
 setInterval(()=>void check(false),35000);
 void check(true);schedule();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();