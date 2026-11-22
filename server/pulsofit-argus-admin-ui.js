/* PulsoFit • Administração de API Argus Pay • sem segredos no HTML */
(function(){
 "use strict";
 if(window.__PF_ARGUS_ADMIN_20261122__)return;
 window.__PF_ARGUS_ADMIN_20261122__=true;
 var panel=null,previousToken="",isAdmin=false,pending=false;
 var css=document.createElement("style");
 css.id="pf-argus-admin-css";
 css.textContent=[
 '#app .pf-gateway-admin{display:none!important}',
 '.pf-argus-nav{display:flex;align-items:center;gap:9px;width:calc(100% - 16px);margin:10px 8px;padding:12px 14px;border:1px solid #458d74;border-radius:14px;background:linear-gradient(115deg,#153b38,#15314c);color:#e3fff4;font-weight:750;cursor:pointer}',
 '.pf-argus-nav:hover,.pf-argus-nav:focus-visible{outline:2px solid #7de8be}',
 '.pf-argus-panel{max-width:1020px;width:100%;margin:20px auto;padding:clamp(18px,3vw,28px);box-sizing:border-box;border:1px solid #355b64;border-radius:23px;background:linear-gradient(140deg,#101c2e,#172b37 55%,#12352c);color:#f2fff9;box-shadow:0 18px 65px #0004}',
 '.pf-argus-panel *{box-sizing:border-box}',
 '.pf-argus-panel h2{font-size:clamp(22px,3vw,30px);line-height:1.2;margin:8px 0 6px;color:#fff}',
 '.pf-argus-panel p{color:#c4d6db;line-height:1.55;font-size:14px;margin:4px 0 16px}',
 '.pf-argus-heading{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px}',
 '.pf-argus-kicker{font-size:11px;letter-spacing:.13em;color:#83f6b6;font-weight:800}',
 '.pf-argus-state{padding:8px 12px;border-radius:99px;background:#3e514f;color:#fff;font-size:12px;font-weight:700}',
 '.pf-argus-state[data-ready="1"]{background:#165d44;color:#baffdc}',
 '.pf-argus-info{border:1px solid #3a6270;background:#ffffff09;border-radius:14px;padding:12px 14px;margin:14px 0;color:#e5f5f0;font-size:13px;line-height:1.5}',
 '.pf-argus-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}',
 '.pf-argus-panel label{display:block;color:#d9f3eb;font-size:13px;font-weight:700}',
 '.pf-argus-input-wrap{display:flex;gap:5px;align-items:center;margin-top:7px;border:1px solid #496975;border-radius:13px;background:#0a1727;padding:4px}',
 '.pf-argus-input-wrap:focus-within{outline:2px solid #8aedd2}',
 '.pf-argus-input-wrap input{background:transparent!important;border:0!important;outline:none!important;color:#fff!important;flex:1;min-width:0;width:100%;padding:10px!important;font-size:14px!important;font-family:ui-monospace,monospace}',
 '.pf-argus-show{background:#25434c;color:#eafff6;border:0;padding:9px 11px;border-radius:10px;cursor:pointer;white-space:nowrap}',
 '.pf-argus-buttons{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0 8px}',
 '.pf-argus-buttons button{padding:12px 17px;border-radius:12px;font-weight:750;cursor:pointer;border:1px solid #51997f;background:#163b3c;color:#e9fff6}',
 '.pf-argus-buttons button.pf-argus-save{background:#8cf2b1;color:#0c2927;border:0}',
 '.pf-argus-buttons button:disabled{opacity:.45;cursor:not-allowed}',
 '.pf-argus-access-link{display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;font:750 13px/1.2 system-ui,sans-serif;color:#d5ffec;background:#164739;border:1px solid #66bd94;border-radius:12px;padding:12px 15px;box-shadow:0 5px 23px #0a0a1440}',
 '.pf-argus-access-link.pf-argus-floating{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:2147482500;max-width:calc(100vw - 32px)}',
 '.pf-argus-feedback{font-size:13px;min-height:28px;padding-top:7px;color:#b0fbd2}',
 '.pf-argus-feedback[data-error="1"]{color:#ffd0c6}',
 '.pf-argus-help{font-size:12px;color:#b5c5cf;line-height:1.5;margin-top:12px}',
 '@media(max-width:650px){.pf-argus-fields{grid-template-columns:1fr}.pf-argus-panel{margin:10px auto}.pf-argus-buttons button{flex:1}}'
 ].join("");
 document.head.appendChild(css);
 function token(){try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}}
 function route(){return (location.hash||"#/home").replace(/^#\/?/,"").split("/")[0]}
 function showFeedback(msg,err){
  if(!panel)return;var feedback=panel.querySelector(".pf-argus-feedback");
  if(feedback){feedback.textContent=msg;feedback.dataset.error=err?"1":"0";}
 }
 function request(url,opt){
  opt=opt||{};opt.cache="no-store";
  opt.headers=Object.assign({"Authorization":"Bearer "+token()},opt.headers||{});
  return fetch(url,opt).then(async function(r){
   var data=await r.json().catch(function(){return {}});
   if(!r.ok)throw Error(data.error||"Falha ao consultar o servidor");
   return data;
  });
 }
 function state(data){
  if(!panel)return;
  var ready=!!data.ready,stateTag=panel.querySelector(".pf-argus-state");
  stateTag.dataset.ready=ready?"1":"0";
  stateTag.textContent=ready?"● Pix habilitado":data.configured?"● Credenciais cadastradas":"● Não configurado";
  panel.querySelector(".pf-argus-info").textContent=[
    "Gateway: Argus Pay • Ambiente: produção",
    "Chave registrada: "+(data.keyMasked||"nenhuma"),
    "Última alteração: "+(data.updatedAt?new Date(data.updatedAt).toLocaleString("pt-BR"):"ainda não registrada neste painel"),
    "Conexão: "+(data.providerAuth==="verified"?"autenticada":data.providerAuth==="denied"?"credenciais rejeitadas":"pendente de validação")
   ].join("  |  ");
   panel.querySelector(".pf-argus-api-url").textContent=data.apiBaseUrl||"indisponível";
   var allowed=data.readyForSecureWrite===true;
   panel.querySelectorAll(".pf-argus-test,.pf-argus-save").forEach(function(btn){btn.disabled=!allowed});
   if(!allowed)showFeedback("O armazenamento seguro do servidor ainda precisa ser habilitado.",true);
 }
 function makePanel(main){
  if(panel&&panel.isConnected)return;
  panel=document.createElement("section");
  panel.id="pf-argus-panel";panel.className="pf-argus-panel";
  panel.innerHTML=[
  '<div class="pf-argus-heading"><div><span class="pf-argus-kicker">PULSOFIT AI / ADMINISTRATIVO</span><h2>Integração de pagamentos</h2></div><span class="pf-argus-state">● Consultando</span></div>',
  '<p>Gerencie as credenciais da Argus Pay sem editar o Render. Uma alteração só entra em vigor após a validação da API e o salvamento seguro no servidor.</p>',
  '<div class="pf-argus-info" aria-live="polite">Consultando a configuração atual…</div>',
  '<form class="pf-argus-form" autocomplete="off"><div class="pf-argus-fields">',
  '<label>Nova API Key<div class="pf-argus-input-wrap"><input name="apiKey" type="password" placeholder="agp_live_… ou ARGUS_API_KEY=…" required autocomplete="off" spellcheck="false"><button type="button" class="pf-argus-show" data-for="apiKey" aria-label="Mostrar ou ocultar a API Key">Mostrar</button></div></label>',
  '<label>Nova API Secret<div class="pf-argus-input-wrap"><input name="apiSecret" type="password" placeholder="ags_live_… ou ARGUS_API_SECRET=…" required autocomplete="new-password" spellcheck="false"><button type="button" class="pf-argus-show" data-for="apiSecret" aria-label="Mostrar ou ocultar a API Secret">Mostrar</button></div></label>',
  '</div><p class="pf-argus-help">Você pode colar a chave diretamente ou como <code>ARGUS_API_KEY=...</code> e <code>ARGUS_API_SECRET=...</code>. O prefixo será removido automaticamente.</p><div class="pf-argus-buttons"><button class="pf-argus-test" type="button" disabled>Testar conexão</button><button class="pf-argus-save" type="submit" disabled>Salvar novas credenciais</button></div>',
  '<div class="pf-argus-feedback" role="status" aria-live="polite"></div></form>',
  '<div class="pf-argus-help">Endpoint: <code class="pf-argus-api-url">consultando</code>. As chaves anteriores não são exibidas, a Secret nunca é enviada pelo servidor ao navegador e nenhum pagamento é gerado durante o teste. Antes de revogar chaves antigas, confira as cobranças pendentes.</div>'
  ].join("");
  main.prepend(panel);
  panel.querySelectorAll(".pf-argus-show").forEach(function(b){b.addEventListener("click",function(){
   var input=panel.querySelector('[name="'+b.dataset.for+'"]');
   input.type=input.type==="password"?"text":"password";
   b.textContent=input.type==="password"?"Mostrar":"Ocultar";
  })});
  var form=panel.querySelector("form");
  function normalizeCredential(raw,variableName){
   var value=String(raw||"").trim();
   // Accept the exact environment-variable assignment pasted from Render or docs.
   // Only the intended field prefix may be stripped; never log its value.
   var prefix=new RegExp("^(?:export\\s+)?"+variableName+"\\s*=\\s*","i");
   value=value.replace(prefix,"").trim();
   if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))
    value=value.slice(1,-1).trim();
   return value;
  }
  [["apiKey","ARGUS_API_KEY"],["apiSecret","ARGUS_API_SECRET"]].forEach(function(pair){
   var element=form.elements[pair[0]];
   element.addEventListener("change",function(){
    element.value=normalizeCredential(element.value,pair[1]);
   });
  });
  async function submit(save){
   if(pending)return;
   var key=normalizeCredential(form.elements.apiKey.value,"ARGUS_API_KEY");
   var secret=normalizeCredential(form.elements.apiSecret.value,"ARGUS_API_SECRET");
   if(!/^agp_live_[a-f0-9]{24}$/.test(key)||!/^ags_live_[a-f0-9]{64}$/.test(secret)){
    showFeedback("Confira as chaves: use apenas agp_live_… e ags_live_…, ou cole as variáveis ARGUS_API_KEY= e ARGUS_API_SECRET= completas.",true);return;
   }
   // Remove environment-variable labels from the fields and avoid reintroducing them.
   form.elements.apiKey.value=key;
   form.elements.apiSecret.value=secret;
   pending=true;panel.querySelectorAll(".pf-argus-test,.pf-argus-save").forEach(function(btn){btn.disabled=true});
   showFeedback(save?"Validando e salvando com criptografia…":"Testando autenticação sem gerar Pix…",false);
   try{
    var value=await request(save?"/api/admin/billing/config":"/api/admin/billing/test",{
     method:save?"PUT":"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({apiKey:key,apiSecret:secret})});
    if(save){
     form.reset();
     showFeedback("Novas chaves salvas com segurança. A integração foi atualizada.",false);
     var latest=await request("/api/admin/billing/config");state(latest);
    }else showFeedback(value.message||"Chaves válidas. Você já pode salvar.",false);
   }catch(e){showFeedback(e.message||"Falha ao conectar",true)}
   finally{
    pending=false;
    panel.querySelectorAll(".pf-argus-test,.pf-argus-save").forEach(function(btn){btn.disabled=false});
   }
  }
  panel.querySelector(".pf-argus-test").addEventListener("click",function(){void submit(false)});
  form.addEventListener("submit",function(e){e.preventDefault();void submit(true)});
  request("/api/admin/billing/config").then(state).catch(function(e){showFeedback(e.message,true)});
 }
 function nav(){
  if(!isAdmin)return;
  var root=document.getElementById("app"),aside=root&&root.querySelector(".sidebar");
  // Mobile does not always display .sidebar; keep an accessible direct link
  // on the admin page even when the original navigation collapses.
  if(!location.pathname.startsWith("/admin/pagamentos")&&route()==="admin"){
   var topbar=root&&root.querySelector(".topbar"),holder=topbar||document.body;
   if(holder&&!holder.querySelector(".pf-argus-access-link")){
    var link=document.createElement("a");
    link.href="/admin/pagamentos";link.textContent="🔐 API de pagamentos";
    link.className="pf-argus-access-link"+(topbar?"":" pf-argus-floating");
    link.setAttribute("aria-label","Abrir administração da API Argus Pay");
    holder.appendChild(link);
   }
  }
  if(!aside||aside.querySelector(".pf-argus-nav"))return;
  var button=document.createElement("button");
  button.type="button";button.className="pf-argus-nav";
  button.textContent="🔐 API de pagamentos";
  button.addEventListener("click",function(e){
   e.preventDefault();e.stopPropagation();
   if(route()!=="admin")location.hash="#/admin";
   setTimeout(function(){mount();document.getElementById("pf-argus-panel")?.scrollIntoView({behavior:"smooth",block:"start"})},120);
  });
  aside.appendChild(button);
 }
 function mount(){
  if(!isAdmin)return;
  nav();
  if(!["admin","account","subscription"].includes(route()))return;
  var root=document.getElementById("app"),main=root&&root.querySelector(".main");
  if(main&&!main.querySelector("#pf-argus-panel"))makePanel(main);
 }
 var checking=false;
 async function authenticate(){
  var current=token();
  if(current===previousToken)return;
  previousToken=current;isAdmin=false;
  if(!current)return;
  try{var data=await request("/api/me");isAdmin=data?.user?.role==="admin";mount();}
  catch{isAdmin=false;}
 }
 function tick(){if(checking)return;checking=true;
  void authenticate().then(mount).finally(function(){checking=false});
 }
 function init(){
  tick();var root=document.getElementById("app");
  if(root){new MutationObserver(function(){tick()}).observe(root,{childList:true,subtree:true})}
  window.addEventListener("hashchange",tick);
  document.addEventListener("visibilitychange",function(){if(!document.hidden)tick()});
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
