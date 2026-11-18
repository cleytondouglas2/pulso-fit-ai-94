/* PulsoFit: official Google Identity Services / Sign in with Apple UI.
 * The backend returns provider flags only after credentials are installed.
 */
(function(){
 "use strict";
 if(window.__PULSO_SOCIAL_UI__)return;
 window.__PULSO_SOCIAL_UI__=true;
 var activeScripts={};
 function scriptFrom(url){
  if(activeScripts[url])return activeScripts[url];
  activeScripts[url]=new Promise(function(resolve,reject){
   var s=document.createElement("script");s.src=url;s.async=true;s.defer=true;
   s.onload=resolve;s.onerror=function(){delete activeScripts[url];reject(Error("Não foi possível abrir o serviço de login."))};
   document.head.appendChild(s);
  });
  return activeScripts[url];
 }
 async function challenge(){
  var r=await fetch("/api/auth/social/challenge",{cache:"no-store",credentials:"same-origin"});
  var d=await r.json().catch(()=>({}));
  if(!r.ok||!d.nonce)throw Error(d.error||"Não foi possível abrir o login oficial.");
  return d;
 }
 function remember(token){
  var now=Date.now(),end=now+30*24*60*60*1000;
  try{
   var part=token.split(".")[1];
   if(part){var claims=JSON.parse(atob(part.replace(/-/g,"+").replace(/_/g,"/")));
    if(Number.isFinite(Number(claims.exp)))end=Math.min(end,Number(claims.exp)*1000)}
  }catch{}
  sessionStorage.setItem("pulso-fit-token",token);
  if(end>now)try{localStorage.setItem("pulsofit-session-remember-v1",JSON.stringify({token:token,createdAt:now,expiresAt:end}))}catch{}
 }
 async function complete(provider,data,status){
  status.textContent="Confirmando sua identidade com "+(provider==="google"?"Google":"Apple")+"...";
  var r=await fetch("/api/auth/social/"+provider,{method:"POST",cache:"no-store",credentials:"same-origin",
   headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
  var result=await r.json().catch(()=>({}));
  if(!r.ok||!result.token)throw Error(result.error||"Não foi possível entrar com o provedor.");
  var me=await fetch("/api/me",{cache:"no-store",headers:{Authorization:"Bearer "+result.token}});
  if(!me.ok)throw Error("Sua identidade foi validada, mas o aplicativo não confirmou a sessão.");
  remember(result.token);
  status.textContent="Conta conectada! Abrindo PulsoFit...";
  window.dispatchEvent(new Event("pulso-auth-ready"));
  location.reload();
 }
 async function mount(form){
  if(form.dataset.pfSocialMounted)return;
  form.dataset.pfSocialMounted="1";
  var overlay=form.closest("#pf-account-lock");
  if(!overlay)return;
  var buttons=overlay.querySelectorAll(".pf-auth-social-buttons button");
  var note=overlay.querySelector(".pf-auth-social-note");
  var status=overlay.querySelector(".pf-auth-feedback");
  if(buttons.length!==2||!note||!status)return;
  var cfg;
  try{var configResp=await fetch("/api/auth/social/config",{cache:"no-store"});
   if(!configResp.ok)throw Error("Configuração indisponível");
   cfg=await configResp.json()}catch{
    note.textContent="Não foi possível consultar Google e Apple. Continue com e-mail e senha.";return;
   }
  if(!form.isConnected)return;
  var providers=[];
  if(cfg.googleEnabled&&cfg.googleClientId){
   providers.push("Google");
   var slot=document.createElement("div");slot.id="pf-google-identity-button";slot.style.cssText="min-width:0;display:flex;align-items:center;justify-content:center;overflow:hidden";
   buttons[0].replaceWith(slot);
   try{
    var g=await challenge();
    await scriptFrom("https://accounts.google.com/gsi/client");
    if(!slot.isConnected)return;
    window.google.accounts.id.initialize({client_id:cfg.googleClientId,nonce:g.nonce,callback:async function(reply){
     try{await complete("google",{idToken:reply.credential},status)}
     catch(e){status.textContent=String(e.message||e)}
    }});
    window.google.accounts.id.renderButton(slot,{theme:"outline",size:"large",text:"continue_with",width:190});
   }catch(e){slot.textContent="Google indisponível";status.textContent=String(e.message||e)}
  }
  if(cfg.appleEnabled&&cfg.appleClientId&&cfg.appleRedirectURI){
   providers.push("Apple");
   var apple=buttons[1];apple.disabled=true;
   try{
    await scriptFrom("https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js");
    if(!apple.isConnected)return;
    apple.removeAttribute("aria-label");apple.disabled=false;apple.textContent="● Entrar com Apple";
    apple.style.cssText="opacity:1;cursor:pointer;min-height:44px;background:#fff;color:#101318";
    apple.addEventListener("click",async function(){
     if(apple.disabled)return;
     apple.disabled=true;
     var listener=null,sent=false;
     try{
      var c=await challenge();
      window.AppleID.auth.init({clientId:cfg.appleClientId,scope:"name email",
       redirectURI:cfg.appleRedirectURI,nonce:c.nonce,state:c.state,usePopup:true});
      function submit(code,state){
       if(sent)return Promise.resolve();
       if(!code||state!==c.state)throw Error("A Apple não confirmou esta tentativa.");
       sent=true;
       return complete("apple",{code:code,state:state},status);
      }
      listener=function(e){
       if(e.origin!==location.origin||e.data?.type!=="pulso-apple-oauth-return")return;
       window.removeEventListener("message",listener);listener=null;
       if(e.data.error){status.textContent="Login Apple cancelado.";apple.disabled=false;return}
       void submit(e.data.code,e.data.state).catch(function(err){status.textContent=String(err.message||err);apple.disabled=false});
      };
      window.addEventListener("message",listener);
      var result=await window.AppleID.auth.signIn();
      if(result?.authorization?.code)await submit(result.authorization.code,result.authorization.state||c.state);
     }catch(e){status.textContent=String(e.message||"Login Apple interrompido.")}
     finally{if(listener)window.removeEventListener("message",listener);if(!sent)apple.disabled=false}
    });
   }catch(e){status.textContent=String(e.message||e)}
  }
  note.textContent=providers.length?
   "Login oficial disponível: "+providers.join(" e ")+". Contas sociais usam perfil próprio, separado de acessos anteriores por e-mail.":
   "Google e Apple ainda precisam das credenciais oficiais dos provedores para funcionar. E-mail e senha continuam disponíveis.";
 }
 function watch(){
  var form=document.querySelector("#pf-auth-required-form");
  if(form&&!form.dataset.pfSocialMounted)void mount(form);
 }
 function boot(){
  new MutationObserver(function(){watch()}).observe(document.body,{subtree:true,childList:true});
  watch();
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();