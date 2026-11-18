/* Coach AI: preserve the original conversation, move the hero to the top,
   require user-controlled consent, and format assistant replies for readability.
   No replacement chat, no extra URL settings.
*/
(function(){
 "use strict";
 if(window.__PF_COACH_VISIBLE_CONSENT__)return;
 window.__PF_COACH_VISIBLE_CONSENT__=true;
 const $=id=>document.getElementById(id);
 const token=()=>{try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}};
 const route=()=>String(location.hash||"").replace(/^#\/?/,"").split("/")[0];
 let account="",checkedToken="",pending=null,queued=false;
 const consentKey=()=>"pf-coach-consent-v2-"+account;
 function consent(){try{return Boolean(account&&localStorage.getItem(consentKey())==="1")}catch{return false}}
 function showStatus(message){
  const el=$("pf-coach-status");if(el)el.textContent=message;
 }
 function update(){
  const input=$("pf-coach-consent");
  if(input){input.checked=consent();input.disabled=!account}
  const text=consent()?"✓ IA autorizada. Converse normalmente no chat logo abaixo.":"Marque a autorização acima para conversar com a IA.";
  showStatus(text);
  const old=$("pfaiChatInput");if(old)old.disabled=!consent();
  const form=old?.closest("form");
  if(form)for(const b of form.querySelectorAll("button[type=submit],input[type=submit]"))b.disabled=!consent();
 }
 async function loadUser(){
  const t=token();
  if(!t){account="";checkedToken="";update();return}
  if(pending||account&&checkedToken===t)return;
  pending=(async()=>{try{
   const r=await fetch("/api/me",{headers:{Authorization:"Bearer "+t},cache:"no-store",signal:AbortSignal.timeout(6500)});
   if(!r.ok)return;
   const j=await r.json(),id=String((j.user||j).id||"");
   if(t!==token()||!/^[0-9a-f-]{36}$/i.test(id))return;
   account=id;checkedToken=t;update();
  }catch{}finally{pending=null}})();
  await pending;
 }
 function stopIfNoConsent(e){
  const form=e.target?.closest?.("form");
  if(route()!=="coach"||!form||!form.querySelector("#pfaiChatInput"))return;
  if(consent())return;
  e.preventDefault();e.stopImmediatePropagation();
  showStatus("Para conversar, autorize o uso da IA no quadro acima.");
  $("pf-coach-consent")?.focus();
 }
 // Safe limited Markdown rendering; never insert AI-provided HTML.
 function inlineText(target,input){
  const parts=String(input||"").split(/(\*\*[^*]+\*\*)/g);
  for(const part of parts){
   if(!part)continue;
   if(part.startsWith("**")&&part.endsWith("**")&&part.length>4){
    const strong=document.createElement("strong");strong.textContent=part.slice(2,-2);target.appendChild(strong);
   }else target.appendChild(document.createTextNode(part));
  }
 }
 function formattedText(element,text){
  const lines=String(text||"").replace(/\r/g,"").split("\n");
  const root=document.createDocumentFragment();
  let list=null,kind="";
  const finishList=()=>{if(list){root.appendChild(list);list=null;kind=""}};
  for(const raw of lines){
   const value=raw.trim();
   if(!value){finishList();continue}
   const header=/^#{1,4}\s+(.+)$/.exec(value);
   const numbered=/^\d+[.)]\s+(.+)$/.exec(value);
   const bullet=/^[-*•]\s+(.+)$/.exec(value);
   if(header){finishList();const h=document.createElement("h4");inlineText(h,header[1]);root.appendChild(h);continue}
   if(numbered||bullet){
    const current=numbered?"ol":"ul";
    if(kind!==current){finishList();list=document.createElement(current);kind=current}
    const li=document.createElement("li");inlineText(li,(numbered||bullet)[1]);list.appendChild(li);continue;
   }
   finishList();const p=document.createElement("p");inlineText(p,value);root.appendChild(p);
  }
  element.replaceChildren(root);
 }
 function styleMessages(){
  const app=$("app");if(!app||route()!=="coach")return;
  const possible=app.querySelectorAll('[class*="pfai-message"],[class*="pfai-bubble"],[class*="pfai-msg"],[class*="chat-message"],[class*="chat-bubble"]');
  for(const node of possible){
   if(node.closest("#pf-coach-secure")||node.querySelector("form,textarea,input,button"))continue;
   const raw=(node.textContent||"").trim();
   if(!raw||raw.length>9000)continue;
   const isAssistant=/pulso coach|guia local|coach ia/i.test(raw.slice(0,85))||
      /assistant|bot|model/i.test(node.className||"");
   const isUser=/^voc[eê]\b/i.test(raw.slice(0,30))||/\buser\b/i.test(node.className||"");
   if(!isAssistant&&!isUser)continue;
   node.classList.add(isAssistant?"pf-coach-bubble-model":"pf-coach-bubble-user");
   if(!isAssistant)continue;
   // Prefer an existing single text container. Never replace an entire chat card.
   const content=Array.from(node.querySelectorAll("p,span,div")).find(el=>{
    if(el.children.length||el.closest("button"))return false;
    const t=(el.textContent||"").trim();
    return t.length>45&&!/^Pulso Coach IA|^Você$/i.test(t);
   });
   if(!content)continue;
   const original=content.dataset.pfCoachOriginalText||content.textContent;
   if(!original||original.length>8000||content.dataset.pfCoachStyled==="1")continue;
   content.dataset.pfCoachOriginalText=original;
   content.dataset.pfCoachStyled="1";
   content.classList.add("pf-coach-readable-answer");
   if(/(\*\*|^#{1,4} |^\s*[-*•]\s|^\d+[.)]\s)/m.test(original)){
    formattedText(content,original);
   }
  }
 }
 function mount(){
  document.body.classList.toggle("pf-coach-active",route()==="coach");
  if(route()!=="coach"||!token())return;
  const app=$("app"),hero=app?.querySelector(".pf2026-coach-hero,.pfai-hero");
  const main=app?.querySelector("main,.main");
  if(!app||!main)return;
  let section=$("pf-coach-secure");
  if(!section){
   section=document.createElement("section");section.id="pf-coach-secure";
   section.setAttribute("aria-label","Autorização para uso do Coach IA");
   section.innerHTML='<div class="pf-coach-consent-head"><span>✦ COACH IA • PRIVACIDADE</span><strong>Autorize sua conversa com IA</strong></div>'+
    '<label class="pf-coach-opt"><input type="checkbox" id="pf-coach-consent"><span><strong>Autorizo enviar minhas mensagens ao serviço de IA.</strong><small>Posso retirar a autorização quando quiser. A conversa original permanece logo abaixo.</small></span></label>'+
    '<p id="pf-coach-status" role="status" aria-live="polite"></p>';
   section.querySelector("#pf-coach-consent").addEventListener("change",e=>{
    if(!account)return;
    try{if(e.target.checked)localStorage.setItem(consentKey(),"1");else localStorage.removeItem(consentKey())}catch{}
    update();
   });
  }
  // Keep the original hero above the consent and the original conversation.
  // Do not place an extra chat before the header (the previous visual bug).
  if(hero&&hero.parentElement){
   if(hero.nextElementSibling!==section)hero.insertAdjacentElement("afterend",section);
  }else if(!section.isConnected){main.insertBefore(section,main.firstChild)}
  // Unhide the original chat, previously hidden by the replacement implementation.
  for(const block of app.querySelectorAll("[data-pf-legacy-chat]"))block.removeAttribute("data-pf-legacy-chat");
  // Keep obsolete manual Worker URL controls hidden.
  for(const el of app.querySelectorAll('input[placeholder*="seu-servidor"],input[placeholder*="https://seu-"]')){
   (el.closest("label")||el.parentElement)?.setAttribute("data-pf-worker","1");
  }
  update();styleMessages();void loadUser();
 }
 function schedule(){
  if(queued)return;queued=true;
  requestAnimationFrame(()=>{queued=false;try{mount()}catch{}});
 }
 function boot(){
  const style=document.createElement("style");style.id="pf-coach-visible-css";
  style.textContent=
   '#pf-coach-secure{box-sizing:border-box!important;margin:12px 0 18px!important;padding:16px!important;max-width:100%!important;overflow:hidden!important;background:linear-gradient(135deg,#182943,#242044)!important;border:1.5px solid #83e4c5!important;border-radius:17px!important;color:#fff!important}'+
   '#pf-coach-secure *{box-sizing:border-box;min-width:0}'+
   '#pf-coach-secure .pf-coach-consent-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;justify-content:space-between;margin-bottom:10px}'+
   '#pf-coach-secure .pf-coach-consent-head span{font:850 11px/1.5 system-ui;color:#a5f8da;letter-spacing:.12em}'+
   '#pf-coach-secure .pf-coach-consent-head strong{font:850 15px/1.4 system-ui;color:#fff}'+
   '#pf-coach-secure .pf-coach-opt{display:flex;align-items:flex-start;gap:12px;padding:12px;border-radius:13px;background:#2d3a5b;border:1px solid #7cbcae}'+
   '#pf-coach-secure .pf-coach-opt input{width:23px;height:23px;flex:0 0 23px;accent-color:#83ebc3;margin-top:3px}'+
   '#pf-coach-secure .pf-coach-opt strong{display:block;font:800 14px/1.5 system-ui;color:#fff}'+
   '#pf-coach-secure .pf-coach-opt small{display:block;font:12px/1.5 system-ui;color:#d2e7e7;margin-top:4px}'+
   '#pf-coach-secure #pf-coach-status{font:750 12px/1.5 system-ui;color:#aeffdb;margin:9px 0 0}'+
   'body.pf-coach-active #app{overflow-x:clip!important}'+
   '#app #pfaiChatInput{font-size:16px!important;line-height:1.5!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;transform:none!important}'+
   '#app .pf-coach-bubble-model,#app .pf-coach-bubble-user{box-sizing:border-box!important;min-width:0!important;max-width:100%!important;overflow-wrap:anywhere!important;word-break:normal!important;line-height:1.65!important}'+
   '#app .pf-coach-bubble-model{background:linear-gradient(150deg,#2b3a5e,#202c49)!important;border:1px solid #5e7598!important;border-radius:16px!important;box-shadow:0 8px 20px #070e2030!important;padding:14px!important;animation:pf-coach-card-in .22s ease-out both!important}'+
   '@keyframes pf-coach-card-in{from{opacity:.35;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}'+
   '@media(prefers-reduced-motion:reduce){#app .pf-coach-bubble-model{animation:none!important}}'+
   '#app .pf-coach-bubble-model > strong:first-child{display:block!important;color:#aaffdc!important;letter-spacing:.01em!important;font:850 13px/1.4 system-ui!important;margin-bottom:6px!important}'+
   '#app .pf-coach-bubble-user{background:#164b60!important;border:1px solid #4ba3ac!important;border-radius:16px!important;padding:12px!important}'+
   '#app .pf-coach-readable-answer{font:400 14px/1.72 system-ui!important;letter-spacing:.01em!important;color:#ebf1ff!important;white-space:normal!important;overflow-wrap:anywhere!important}'+
   '#app .pf-coach-readable-answer p{margin:0 0 11px!important;font:inherit!important;line-height:inherit!important;white-space:pre-wrap!important}'+
   '#app .pf-coach-readable-answer h4{margin:15px 0 7px!important;font:850 15px/1.4 system-ui!important;color:#b8ffe7!important}'+
   '#app .pf-coach-readable-answer strong{color:#a8ffe0!important;font-weight:850!important}'+
   '#app .pf-coach-readable-answer ol,#app .pf-coach-readable-answer ul{padding-left:23px!important;margin:8px 0 14px!important}'+
   '#app .pf-coach-readable-answer li{margin:0 0 8px!important;font:inherit!important}'+
   '#app [data-pf-worker]{display:none!important}';
  document.head.appendChild(style);
  const app=$("app");if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  document.addEventListener("submit",stopIfNoConsent,true);
  document.addEventListener("click",e=>{
   const button=e.target.closest?.("button[type=submit]");
   if(button&&button.closest("form")?.querySelector("#pfaiChatInput"))stopIfNoConsent(e);
  },true);
  window.addEventListener("hashchange",schedule);
  window.addEventListener("pageshow",schedule);
  window.addEventListener("pulso-auth-ready",()=>{checkedToken="";schedule()});
  schedule();
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();