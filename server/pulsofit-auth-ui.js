/* PulsoFit - exigir conta online para qualquer acesso; sem visitante */
(function(){
"use strict";
if(window.__PULSO_AUTH_REQUIRED_UI__)return;
window.__PULSO_AUTH_REQUIRED_UI__=true;
var valid=false,verifiedToken="",busy=false;
var css=[
'#pf-account-lock{position:fixed!important;inset:0!important;z-index:2147483600!important;display:flex!important;align-items:center!important;justify-content:center!important;background:linear-gradient(125deg,#110d27fa,#1b1533fa)!important;color:#fff!important;padding:16px!important;overflow-y:auto!important;box-sizing:border-box!important;font:14px/1.5 system-ui,sans-serif}',
'#pf-account-lock .pf-auth-dialog{width:min(100%,470px);box-sizing:border-box;padding:clamp(22px,4vw,34px);border:1px solid #8162af;border-radius:24px;background:#1b223b;box-shadow:0 20px 60px #0008}',
'#pf-account-lock h2{font-size:27px;color:#fff;margin:8px 0 12px;line-height:1.2}',
'#pf-account-lock p{font-size:13px;color:#e6ddec}',
'#pf-account-lock form{display:grid;gap:12px;margin:17px 0}',
'#pf-account-lock label{display:grid;gap:5px;font-weight:800;font-size:12px}',
'#pf-account-lock input{box-sizing:border-box;width:100%;padding:13px;border-radius:11px;border:1px solid #6c619a;background:#11182e;color:white;font:16px system-ui,sans-serif}',
'#pf-account-lock button{padding:13px;background:#8c43d5;border:0;border-radius:12px;font:800 14px system-ui,sans-serif;color:#fff;cursor:pointer}',
'#pf-account-lock button:disabled{opacity:.5}',
'#pf-account-lock .pf-auth-switch{background:transparent;border:1px solid #7963ac;color:#ddc7ff;width:100%}',
'#pf-account-lock .pf-auth-feedback{min-height:22px;color:#ffc1c5;font-size:12px}',
'body.pf-account-locked{overflow:hidden!important}',
'body.pf-account-locked #app{pointer-events:none!important;filter:blur(5px)!important;user-select:none!important}',
'body.pf-account-locked #pf-stable-open,body.pf-account-locked #pf-plans-shortcut{display:none!important}',
'[data-pro-action="offline-continue"]{display:none!important}'
].join("\n");
function token(){try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}}
function overlay(){
 if(!document.body)return null;
 document.body.classList.add("pf-account-locked");
 var el=document.getElementById("pf-account-lock");
 if(!el){el=document.createElement("div");el.id="pf-account-lock";el.setAttribute("role","dialog");el.setAttribute("aria-modal","true");document.body.appendChild(el)}
 return el;
}
function show(mode,notice){
 valid=false;
 var el=overlay();if(!el)return;
 var register=mode!=="login";
 el.innerHTML='<section class="pf-auth-dialog">'+
 '<small style="color:#b3ffdd;font-weight:900;letter-spacing:.1em">PULSOFIT AI • CONTA OBRIGATÓRIA</small>'+
 '<h2>'+(register?'Crie sua conta grátis':'Entre na sua conta')+'</h2>'+
 '<p>Seus treinos, fotos e análises precisam estar vinculados à sua conta. Não existe mais modo visitante.</p>'+
 '<form id="pf-auth-required-form">'+
 (register?'<label>Nome completo<input name="name" required minlength="2" maxlength="80" autocomplete="name" placeholder="Seu nome"></label>':'')+
 '<label>E-mail<input type="email" name="email" required maxlength="240" autocomplete="email" placeholder="nome@exemplo.com"></label>'+
 '<label>Senha<input type="password" name="password" required minlength="'+(register?10:1)+'" autocomplete="'+(register?'new-password':'current-password')+'" placeholder="'+(register?'Mínimo de 10 caracteres':'Sua senha')+'"></label>'+
 '<button type="submit">'+(register?'Cadastrar e começar':'Entrar no PulsoFit')+'</button></form>'+
 '<button class="pf-auth-switch" type="button">'+(register?'Já tenho uma conta':'Quero criar uma conta')+'</button>'+
 '<p class="pf-auth-feedback" role="status" aria-live="polite"></p>'+
 '<p style="font-size:11px">Suas imagens de performance só são enviadas à IA após você autorizar cada análise.</p></section>';
 var status=el.querySelector(".pf-auth-feedback");status.textContent=notice||"";
 el.querySelector(".pf-auth-switch").addEventListener("click",function(){show(register?"login":"register")});
 var form=el.querySelector("form");
 form.addEventListener("submit",async function(e){
  e.preventDefault();
  var button=form.querySelector('button[type="submit"]');button.disabled=true;
  status.textContent="Verificando dados...";
  var data={email:form.elements.email.value.trim(),password:form.elements.password.value};
  if(register)data.name=form.elements.name.value.trim();
  try{
   var r=await fetch("/api/auth/"+(register?"register":"login"),{method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
   var j=await r.json().catch(()=>({}));
   if(!r.ok||!j.token)throw Error(j.error||"Cadastro ou login indisponível");
   sessionStorage.setItem("pulso-fit-token",j.token);
   var check=await fetch("/api/me",{cache:"no-store",headers:{"Authorization":"Bearer "+j.token}});
   if(!check.ok)throw Error("Sessão não confirmada. Entre novamente.");
   status.textContent="Conta conectada. Abrindo seu aplicativo...";
   location.reload();
  }catch(err){status.textContent=String(err.message||err);button.disabled=false}
 });
}
async function verify(){
 if(busy||!document.body)return;
 var current=token();
 if(valid&&current===verifiedToken)return;
 if(!current){valid=false;verifiedToken="";if(!document.getElementById("pf-auth-required-form"))show("register");return}
 busy=true;
 var el=overlay();el.innerHTML='<section class="pf-auth-dialog"><h2>Validando sua conta…</h2><p>Consultando a sessão segura.</p></section>';
 try{
  var r=await fetch("/api/me",{cache:"no-store",headers:{"Authorization":"Bearer "+current},signal:AbortSignal.timeout(7000)});
  if(!r.ok)throw Error("Sua sessão terminou. Entre novamente.");
  var d=await r.json();
  if(!d?.user?.id||token()!==current)throw Error("Sessão não confirmada");
  valid=true;verifiedToken=current;
  document.body.classList.remove("pf-account-locked");
  document.getElementById("pf-account-lock")?.remove();
  window.dispatchEvent(new Event("pulso-auth-ready"));
 }catch(err){valid=false;verifiedToken="";try{sessionStorage.removeItem("pulso-fit-token")}catch{}show("login",String(err.message||err))}
 finally{busy=false}
}
function init(){
 var cssEl=document.createElement("style");cssEl.id="pf-auth-css";cssEl.textContent=css;(document.head||document.documentElement).appendChild(cssEl);
 overlay();verify();
 window.addEventListener("pageshow",verify);
 window.addEventListener("storage",verify);
 setInterval(function(){if(!valid||token()!==verifiedToken)verify()},2500);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
})();