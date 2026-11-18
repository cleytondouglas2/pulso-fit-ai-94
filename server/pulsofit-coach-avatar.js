/* PulsoFit • show the signed-in user's profile photo in the Coach IA hero orb. */
(function(){
"use strict";
if(window.__PULSO_COACH_AVATAR__)return;
window.__PULSO_COACH_AVATAR__=true;
let cachedToken="",avatar=null,fetching=false,scheduled=false;
const validImage=s=>typeof s==="string"&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]{40,}$/.test(s)?s:null;
const token=()=>{try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}};
function render(){
 const orb=document.querySelector("#app .pf2026-coach-hero .pf2026-coach-orb");
 if(!orb)return;
 let img=orb.querySelector("img[data-pf-coach-avatar]");
 if(!avatar){
  if(img){img.remove();orb.classList.remove("pf-coach-has-photo")}
  const star=orb.querySelector("[data-pf-coach-star]");
  if(star)star.hidden=false;
  return;
 }
 if(!img){
  img=document.createElement("img");img.dataset.pfCoachAvatar="1";img.alt="Minha foto de perfil";
  orb.appendChild(img);
 }
 if(img.getAttribute("src")!==avatar)img.src=avatar;
 orb.classList.add("pf-coach-has-photo");
 const star=orb.querySelector("[data-pf-coach-star]");if(star)star.hidden=true;
 // Existing markup contains one text node with ✦, followed by the IA badge.
 for(const node of Array.from(orb.childNodes)){
  if(node.nodeType===3&&node.textContent.trim()==="✦")node.textContent="";
 }
}
function enqueue(){
 if(scheduled)return;scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;render()});
}
async function load(force){
 const current=token();
 if(!current){cachedToken="";avatar=null;enqueue();return}
 if(fetching||(!force&&cachedToken===current))return;
 cachedToken=current;fetching=true;
 try{
  const r=await fetch("/api/profile/photo",{cache:"no-store",headers:{Authorization:"Bearer "+current},signal:AbortSignal.timeout(9000)});
  if(!r.ok)return;
  const j=await r.json();if(token()!==current)return;
  avatar=j.hasPhoto?validImage(j.image):null;enqueue();
 }catch{}finally{fetching=false}
}
function start(){
 const styles=document.createElement("style");styles.id="pf-coach-personal-avatar-css";
 styles.textContent='#app .pf2026-coach-orb.pf-coach-has-photo{overflow:hidden!important;isolation:isolate!important;border-radius:30px!important;background:#33205f!important}'+
 '#app .pf2026-coach-orb img[data-pf-coach-avatar]{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:cover!important;object-position:center 32%!important;display:block!important;border-radius:inherit!important;z-index:1!important}'+
 '#app .pf2026-coach-orb.pf-coach-has-photo span{z-index:2!important;right:0!important;bottom:0!important}'+
 '@media(max-width:480px){#app .pf2026-coach-orb{width:78px!important;height:78px!important;border-radius:22px!important;flex:0 0 78px!important}#app .pf2026-coach-hero{min-width:0!important;flex-wrap:wrap!important}}';
 document.head.appendChild(styles);
 const app=document.getElementById("app");
 if(app)new MutationObserver(enqueue).observe(app,{childList:true,subtree:true});
 window.addEventListener("hashchange",enqueue);
 window.addEventListener("pageshow",()=>{enqueue();void load(false)});
 window.addEventListener("pulso-auth-ready",()=>{cachedToken="";void load(true)});
 window.addEventListener("pulso-avatar-changed",e=>{
  avatar=validImage(e.detail?.src);cachedToken=token();enqueue();
 });
 setInterval(()=>{if(token()!==cachedToken)void load(true)},12000);
 void load(false);enqueue();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();