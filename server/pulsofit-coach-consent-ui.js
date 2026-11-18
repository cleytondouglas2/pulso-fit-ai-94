/* Top-of-page Coach IA permission and real server chat, never a Worker URL. */
(function(){
"use strict";
if(window.__PF_COACH_VISIBLE_CONSENT__)return;
window.__PF_COACH_VISIBLE_CONSENT__=true;
const token=()=>{try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}};
const $=id=>document.getElementById(id);
const route=()=>String(location.hash||"").replace(/^#\/?/,"").split("/")[0];
let account="",checkedToken="",pending=null,chat=[],busy=false,queued=false;
const consentKey=()=>"pf-coach-consent-v2-"+account;
const permitted=()=>{try{return Boolean(account&&localStorage.getItem(consentKey())==="1")}catch{return false}};
function update(){
 const input=$("pf-coach-consent"),btn=$("pf-coach-send"),status=$("pf-coach-status");
 if(input){input.checked=permitted();input.disabled=!account}
 if(btn)btn.disabled=busy||!permitted();
 if(status&&!busy)status.textContent=permitted()?"✓ IA generativa conectada. Nenhuma URL é necessária.":"Autorize acima para ativar a conversa com IA.";
}
async function loadUser(){
 const t=token();if(!t||pending||account&&checkedToken===t)return;
 pending=(async()=>{try{
  const r=await fetch("/api/me",{headers:{Authorization:"Bearer "+t},cache:"no-store",signal:AbortSignal.timeout(6500)});
  if(!r.ok)return;
  const j=await r.json(),id=String((j.user||j).id||"");
  if(t!==token()||!/^[0-9a-f-]{36}$/i.test(id))return;
  if(id!==account){account=id;chat=[]}
  checkedToken=t;update();
 }catch{}finally{pending=null}})();await pending;
}
function add(who,txt){
 const root=$("pf-coach-log");if(!root)return;
 const item=document.createElement("div");item.className="pf-coach-line "+who;
 const label=document.createElement("strong");label.textContent=who==="user"?"Você":"Pulso Coach IA";
 const body=document.createElement("p");body.textContent=txt;
 item.append(label,body);root.append(item);root.scrollTop=root.scrollHeight;
}
async function submit(e){
 e.preventDefault();const input=$("pf-coach-input");
 const message=String(input?.value||"").trim();
 if(!permitted()||busy||!message)return;
 busy=true;update();$("pf-coach-status").textContent="Coach IA preparando resposta...";
 add("user",message);input.value="";
 try{
  const r=await fetch("/api/coach/secure-chat",{method:"POST",
   headers:{"Authorization":"Bearer "+token(),"Content-Type":"application/json"},
   body:JSON.stringify({message,history:chat.slice(-6),consent:true}),signal:AbortSignal.timeout(28000)});
  const json=await r.json().catch(()=>({}));
  if(!r.ok||!json.generative||!json.answer)throw Error(json.error||"Serviço de IA indisponível.");
  add("model",json.answer);
  chat.push({role:"user",text:message},{role:"model",text:json.answer});chat=chat.slice(-8);
 }catch(err){add("model","⚠️ "+String(err.message||"Erro de conexão")+". Nenhuma resposta pré-programada foi exibida.");}
 finally{busy=false;update()}
}
function hideLegacy(){
 const app=$("app"),i=app?.querySelector("#pfaiChatInput");
 if(i){const section=i.closest("section");
  if(section&&!section.contains($("pf-coach-secure"))&&section.textContent.length<23000)
   section.setAttribute("data-pf-legacy-chat","1");
 }
 for(const input of app?.querySelectorAll('input[placeholder*="seu-servidor"],input[placeholder*="https://seu-"]')||[]){
  if(!input.closest("#pf-coach-secure"))(input.closest("label")||input.parentElement)?.setAttribute("data-pf-worker","1");
 }
 for(const title of app?.querySelectorAll("h2,h3,h4")||[]){
  if(title.textContent.trim()==="Pulso Coach IA"){
   const section=title.closest("section");
   if(section&&!section.contains($("pf-coach-secure"))&&section.textContent.length<24000)
    section.setAttribute("data-pf-legacy-chat","1");
  }
 }
 for(const lab of app?.querySelectorAll("label,summary")||[]){
  if(lab.textContent.includes("URL HTTPS do servidor")||lab.textContent.includes("Configurar conexão com IA"))
   (lab.closest("details")||lab.closest("label")||lab.parentElement)?.setAttribute("data-pf-worker","1");
 }
}
function mount(){
 document.body.classList.toggle("pf-coach-active",route()==="coach");
 if(route()!=="coach"||!token())return;
 const app=$("app"),main=app?.querySelector(".main")||app?.querySelector("main");
 if(!main)return;
 let node=$("pf-coach-secure");
 if(!node){
  node=document.createElement("section");node.id="pf-coach-secure";
  node.innerHTML='<small>✦ COACH IA • ATIVAÇÃO</small><h2>Ative sua conversa com o Coach IA</h2>'+
  '<p>Converse com IA generativa de verdade, sem URL de servidor ou Worker.</p>'+
  '<label class="pf-coach-opt"><input type="checkbox" id="pf-coach-consent"><span><strong>Autorizo enviar minhas mensagens ao serviço de IA.</strong><small>Você pode retirar a autorização desmarcando aqui.</small></span></label>'+
  '<div id="pf-coach-log" role="log" aria-live="polite"></div>'+
  '<div class="pf-coach-suggestions"><button type="button" data-suggest="Crie um treino personalizado para hoje.">💪 Treino</button><button type="button" data-suggest="Como melhorar minha alimentação para treinar?">🥗 Alimentação</button></div>'+
  '<form id="pf-coach-form"><label for="pf-coach-input">Sua pergunta</label><textarea id="pf-coach-input" maxlength="1800" placeholder="Pergunte ao Coach IA..." rows="3"></textarea><button id="pf-coach-send" type="submit">✨ Enviar à IA</button></form>'+
  '<p id="pf-coach-status" role="status"></p><small>As respostas são orientações gerais, não substituem profissionais de saúde.</small>';
  const hero=main.querySelector(".pf2026-coach-hero,.pfai-hero");
  if(hero)hero.insertAdjacentElement("afterend",node);else main.insertBefore(node,main.firstChild);
  node.querySelector("#pf-coach-consent").addEventListener("change",e=>{
   if(account)try{if(e.target.checked)localStorage.setItem(consentKey(),"1");else localStorage.removeItem(consentKey())}catch{}
   update();
  });
  node.querySelector("#pf-coach-form").addEventListener("submit",submit);
  node.querySelectorAll("[data-suggest]").forEach(b=>b.addEventListener("click",()=>{$("pf-coach-input").value=b.dataset.suggest;$("pf-coach-input").focus()}));
 }
 hideLegacy();update();void loadUser();
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;try{mount()}catch{}})}
function boot(){
 const style=document.createElement("style");style.id="pf-coach-visible-css";
 style.textContent='#pf-coach-secure{box-sizing:border-box;margin:14px 0 24px;padding:16px;border:2px solid #7ed6b8;border-radius:19px;background:linear-gradient(135deg,#21374a,#222143);color:white;max-width:100%;overflow:hidden}'+
 '#pf-coach-secure *{box-sizing:border-box;min-width:0}#pf-coach-secure h2{font:900 clamp(19px,4.7vw,26px) system-ui;margin:5px 0;color:white}'+
 '#pf-coach-secure p{font:13px/1.55 system-ui;color:#d4e4f2}#pf-coach-secure>small{color:#b4ffe5;font:800 11px/1.5 system-ui}'+
 '#pf-coach-secure .pf-coach-opt{display:flex;gap:12px;align-items:flex-start;padding:15px 11px;background:#2b3958;border:1px solid #82cabb;border-radius:13px;margin:16px 0}'+
 '#pf-coach-secure .pf-coach-opt input{width:23px;height:23px;flex:none;accent-color:#7de9bd}#pf-coach-secure .pf-coach-opt strong{font:850 14px/1.5 system-ui;color:white}'+
 '#pf-coach-secure .pf-coach-opt small{display:block;color:#d2e1ef;font:11px/1.5 system-ui;margin-top:5px}'+
 '#pf-coach-secure button{border:0;background:#794bd2;color:#fff;padding:12px;border-radius:12px;cursor:pointer;font:800 13px system-ui;min-height:43px}'+
 '#pf-coach-secure button:disabled{opacity:.5}#pf-coach-secure textarea{display:block;width:100%;max-width:100%;background:#141e37;color:white;border:1px solid #748bb2;border-radius:12px;padding:12px;margin:8px 0;font-size:16px;resize:vertical}'+
 '#pf-coach-secure form>button{width:100%}#pf-coach-secure #pf-coach-log{display:grid;gap:9px;max-height:45vh;overflow-y:auto}'+
 '#pf-coach-secure .pf-coach-line{padding:12px;border-radius:11px;background:#313d60;color:#fff}#pf-coach-secure .pf-coach-line.user{background:#165067}'+
 '#pf-coach-secure .pf-coach-line p{white-space:pre-wrap;margin:5px 0;overflow-wrap:anywhere}#pf-coach-secure .pf-coach-suggestions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}'+
 '#pf-coach-secure .pf-coach-suggestions button{background:#36445f;flex:1 1 130px}'+
 '#pf-coach-secure .pf-coach-line{display:block!important;box-sizing:border-box!important;max-width:100%!important;min-width:0!important;overflow-wrap:anywhere!important;word-break:normal!important;white-space:normal!important}'+
 '#pf-coach-secure .pf-coach-line p{white-space:pre-wrap!important;overflow-wrap:anywhere!important;word-break:normal!important;line-height:1.6!important;max-width:100%!important}'+
 '#pf-coach-secure #pf-coach-input,#app #pfaiChatInput{font-size:16px!important;line-height:1.5!important;transform:none!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}'+
 '#app form:has(#pfaiChatInput){display:flex!important;flex-wrap:wrap!important;gap:10px!important;max-width:100%!important;min-width:0!important}'+
 '#app form:has(#pfaiChatInput)>*{max-width:100%!important;min-width:0!important}'+
 '#app [class*="pfai-bubble"],#app [class*="pfai-message"],#app [class*="pfai-chat-msg"]{box-sizing:border-box!important;min-width:0!important;max-width:100%!important;overflow-wrap:anywhere!important;word-break:normal!important;white-space:pre-wrap!important}'+
 'body.pf-coach-active #app{overflow-x:clip!important}'+
 '#app [data-pf-worker],#app [data-pf-legacy-chat]{display:none!important}';
 document.head.appendChild(style);
 const app=$("app");if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
 window.addEventListener("hashchange",schedule);window.addEventListener("pageshow",schedule);
 window.addEventListener("pulso-auth-ready",()=>{checkedToken="";schedule()});
 schedule();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();