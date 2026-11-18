/* PulsoFit: responsive repair for the original custom workout editor.
 * Uses semantic headings and media/control structure; does not move inputs or alter form data.
 */
(function(){
"use strict";
if(window.__PULSO_WORKOUT_EDITOR_MOBILE__)return;
window.__PULSO_WORKOUT_EDITOR_MOBILE__=true;
let queued=false;
function normalize(text){return String(text||"").replace(/\s+/g," ").trim().toLowerCase()}
function enhance(){
 const app=document.getElementById("app");if(!app)return;
 // Restrict to the original builder screen (not Treino Vivo, plans, coach).
 const headings=Array.from(app.querySelectorAll("h1,h2,h3,h4"));
 if(!headings.some(el=>normalize(el.textContent).includes("crie seu treino")))return;
 const sequence=headings.find(el=>normalize(el.textContent).includes("sequência de exercícios"));
 if(!sequence)return;
 let scope=sequence.parentElement;
 for(let up=0;scope&&scope!==app&&up<7;up++,scope=scope.parentElement){
  // The heading often lives in a small header section, with cards as siblings.
  if(scope.querySelectorAll("img,video").length&&scope.querySelectorAll("button,input").length>=2)break;
 }
 if(!scope)scope=app;
 // Keep selectors limited to content following the heading.
 const images=Array.from(scope.querySelectorAll("img")).filter(img=>{
  if(sequence.compareDocumentPosition&&typeof Node!=="undefined"){
   return Boolean(sequence.compareDocumentPosition(img)&Node.DOCUMENT_POSITION_FOLLOWING);
  }
  return true;
 }).slice(0,25);
 for(const img of images){
  if(img.closest(".pf-tv-overlay,#pf-tv-overlay,#pf-rescue-panel"))continue;
  let cursor=img.parentElement,card=null;
  for(let depth=0;cursor&&depth<7&&cursor!==app;depth++,cursor=cursor.parentElement){
   const media=cursor.querySelectorAll("img,video");
   const actions=cursor.querySelectorAll("button,input,select");
   if(media.length===1&&actions.length>=2&&actions.length<=15&&
      normalize(cursor.textContent).length>4&&normalize(cursor.textContent).length<800){
    card=cursor;break;
   }
  }
  if(!card||card.classList.contains("pf-custom-workout-row"))continue;
  card.classList.add("pf-custom-workout-row");
  const wrapper=img.parentElement;
  if(wrapper&&wrapper!==card)wrapper.classList.add("pf-custom-workout-media");
  const text=card.querySelector("h3,h4,strong,b");
  if(text&&text!==sequence)text.classList.add("pf-custom-workout-title");
  const inputs=Array.from(card.querySelectorAll("input[type=number],select"));
  for(const input of inputs){
   const group=input.parentElement;
   if(group&&group!==card)group.classList.add("pf-custom-workout-field");
   const controls=group?.parentElement;
   if(controls&&controls!==card&&controls.querySelectorAll("button,input,select").length>=2)
    controls.classList.add("pf-custom-workout-controls");
  }
 }
}
function schedule(){
 if(queued)return;queued=true;
 requestAnimationFrame(()=>{queued=false;try{enhance()}catch{}});
}
function boot(){
 const app=document.getElementById("app");
 if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
 window.addEventListener("hashchange",schedule);
 window.addEventListener("pageshow",schedule);
 schedule();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();