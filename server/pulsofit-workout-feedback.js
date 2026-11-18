/* Honest end-of-workout feedback: praise only after most exercises are confirmed. */
(function(){
"use strict";
if(window.__PF_WORKOUT_FEEDBACK_V2__)return;window.__PF_WORKOUT_FEEDBACK_V2__=true;
let queued=false;
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").toLowerCase();
function numbers(root){
 const text=norm(root.textContent);
 const planned=Number(text.match(/(\d+)\s*exercicios/)?.[1]||0);
 const minutes=Number(text.match(/(\d+)\s*minutos/)?.[1]||0);
 const sets=Number(text.match(/(\d+)\s*series/)?.[1]||0);
 return {planned:planned>0&&planned<=60?planned:0,minutes,sets};
}
function classify(done,total){
 if(!total||!Number.isInteger(done)||done<0||done>total)return false;
 return done>total/2; // More than half, not merely half.
}
function apply(){
 const app=document.getElementById("app");if(!app)return;
 const headings=Array.from(app.querySelectorAll("h1,h2,h3,h4"));
 for(const title of headings){
  if(!/treino concluido[.!]?$/i.test(norm(title.dataset.pfOriginalHeadline||title.textContent)))continue;
  if(title.closest("#pf-tv-overlay"))continue;
  let root=title.parentElement;
  for(let i=0;root&&root!==app&&i<7;i++,root=root.parentElement){
   const value=norm(root.textContent);
   if(value.includes("ver minha evolucao")&&value.includes("mais treinos")&&value.includes("exercicios"))break;
  }
  if(!root||root===app||root.dataset.pfFeedbackReady)return;
  const vals=numbers(root);if(!vals.planned)continue;
  root.dataset.pfFeedbackReady="1";
  title.dataset.pfOriginalHeadline=title.textContent;
  const nodes=Array.from(root.querySelectorAll("small,strong,span,p,h4"));
  const cheer=nodes.find(x=>norm(x.textContent).trim()==="mandou bem!");
  const emoji=nodes.find(x=>x.textContent.trim()==="🎉"||x.textContent.trim()==="🎊");
  const originalText=nodes.find(x=>norm(x.textContent).includes("voce deu mais um passo para construir uma rotina saudavel")&&x.children.length===0);
  const feedback=document.createElement("div");feedback.className="pf-finish-feedback";
  feedback.innerHTML='<label for="pf-finish-done-count"><strong>Quantos exercícios você realmente realizou?</strong></label>'+
   '<select id="pf-finish-done-count"></select><p class="pf-finish-note" role="status" aria-live="polite"></p>';
  const select=feedback.querySelector("select");
  for(let k=0;k<=vals.planned;k++){
   const option=document.createElement("option");option.value=String(k);
   option.textContent=k+" de "+vals.planned+" exercícios";select.appendChild(option);
  }
  const note=feedback.querySelector(".pf-finish-note");
  const targets=root.querySelectorAll("button");
  if(targets.length)targets[0].parentElement?.insertAdjacentElement("beforebegin",feedback);
  else title.insertAdjacentElement("afterend",feedback);
  function render(){
   const finished=Number(select.value),majority=classify(finished,vals.planned);
   title.textContent=majority?"Treino concluído!":"Você pode continuar evoluindo!";
   if(cheer)cheer.textContent=majority?"MANDOU BEM!":"POXAAAA! AINDA DÁ PRA IR ALÉM";
   if(emoji)emoji.textContent=majority?"🎉":"😮";
   if(originalText)originalText.textContent=majority?
    "Você confirmou que realizou a maioria dos exercícios. Continue treinando no seu ritmo.":
    "Não conseguiu fazer a maioria? Tudo bem! Tente completar mais exercícios no próximo treino, respeitando seus limites.";
   note.textContent=majority?"✅ Maioria realizada: "+finished+" de "+vals.planned+" exercícios.":
    "💪 Poxa! Foram "+finished+" de "+vals.planned+" exercícios confirmados. Quando completar mais da metade, aí sim: mandou bem!";
   if(vals.minutes===0&&vals.sets===0)note.textContent+=" O registro mostra 0 minutos e 0 séries; revise o acompanhamento.";
  }
  select.addEventListener("change",render);render();
 }
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply()})}
function boot(){
 const css=document.createElement("style");css.id="pf-finish-feedback-style";
 css.textContent="#app .pf-finish-feedback{margin:16px auto;background:#21354d;border:1px solid #76d5af;border-radius:15px;padding:14px;max-width:560px;text-align:left;box-sizing:border-box}"+
 "#app .pf-finish-feedback label{color:#e3fff5;font:850 14px/1.45 system-ui}"+
 "#app .pf-finish-feedback select{display:block;margin:10px 0;width:100%;background:#1b2645;color:#fff;border:1px solid #a88ce5;border-radius:11px;padding:12px;font-size:16px;min-height:44px}"+
 "#app .pf-finish-feedback p{color:#def5e8;font:13px/1.55 system-ui;margin:7px 0}";document.head.appendChild(css);
 const app=document.getElementById("app");
 if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
 window.addEventListener("hashchange",schedule);window.addEventListener("pageshow",schedule);schedule();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();