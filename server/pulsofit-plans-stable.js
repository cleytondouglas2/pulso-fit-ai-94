/* PulsoFit: página de planos independente do render() do aplicativo.
 * Injetado no HTML gerado em runtime: a troca do conteúdo de #app não apaga o portal.
 * Os planos são fixos e os prazos são consultados no backend por conta autenticada.
 */
(function(){
 "use strict";
 if(window.__PULSO_STABLE_PLANS_20261118__)return;
 window.__PULSO_STABLE_PLANS_20261118__=true;
 var opened=false,closedOnRoute=false,lastRoute="",lastToken=null,details=null,offer=null,offerCheckedAt=0,offerLoading=false;
 var css='#pf-stable-open[hidden]{display:none!important}'+
 '#pf-stable-open{position:fixed!important;right:12px!important;bottom:calc(112px + env(safe-area-inset-bottom,0px))!important;z-index:2147480000!important;background:linear-gradient(125deg,#7133c5,#9f51ec)!important;border:1px solid #d4b4ff!important;color:#fff!important;box-shadow:0 10px 35px #16072a9c!important;border-radius:16px!important;padding:8px 10px!important;font:800 11px/1.3 system-ui,sans-serif!important;cursor:pointer!important;max-width:min(180px,calc(100vw - 24px))!important;text-align:left!important}'+
 '#pf-stable-open small{display:block;font:500 11px/1.4 system-ui,sans-serif;color:#efe3ff;margin-top:3px}'+
 '#pf-stable-modal{position:fixed!important;inset:0!important;z-index:2147482000!important;background:#070816e8!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow-y:auto!important;padding:16px!important;box-sizing:border-box!important;backdrop-filter:blur(8px)}'+
 '#pf-stable-modal .pf-stable-body{box-sizing:border-box;width:min(100%,760px);max-height:calc(100dvh - 32px);overflow-y:auto;border-radius:22px;padding:clamp(18px,4vw,30px);border:1px solid #8164bd;background:linear-gradient(150deg,#262044,#141d34 68%);color:#fff;font:14px/1.5 system-ui,sans-serif;box-shadow:0 20px 60px #0008;position:relative}'+
 '#pf-stable-modal .pf-stable-top{display:flex;justify-content:space-between;align-items:start;gap:12px}'+
 '#pf-stable-modal h2{font:800 clamp(23px,4vw,30px)/1.2 system-ui,sans-serif;color:#fff;margin:0 0 8px}'+
 '#pf-stable-modal .pf-stable-close{width:36px;height:36px;border-radius:50%;border:1px solid #7c6d99;background:#292947;color:#fff;cursor:pointer;font-size:22px}'+
 '#pf-stable-modal .pf-stable-trial{padding:16px;border:1px solid #825de8;border-radius:16px;background:#37255a;margin:16px 0;color:#fff}'+
 '#pf-stable-modal .pf-stable-trial strong{display:block;font-size:18px}'+
 '#pf-stable-modal .pf-stable-trial p{margin:7px 0;font-size:14px;color:#f5ebff}'+
 '#pf-stable-modal .pf-stable-plans{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}'+
 '#pf-stable-modal .pf-stable-card{min-width:0;box-sizing:border-box;padding:20px 16px;border-radius:17px;border:1px solid #6c638e;background:#1d2540;display:flex;flex-direction:column;gap:8px}'+
 '#pf-stable-modal .pf-stable-card.best{border:2px solid #b083fb;background:#302345}'+
 '#pf-stable-modal .pf-stable-card.promo{border:2px solid #83e8ba;background:linear-gradient(130deg,#153e42,#1d2540);grid-column:1/-1}'+
 '#pf-stable-modal .pf-stable-card.promo .pf-stable-price{color:#baffcb}'+
 '#pf-stable-modal #pf-stable-test-offer[hidden]{display:none!important}'+
 '#pf-stable-modal #pf-stable-test-offer button:disabled{opacity:.65;cursor:not-allowed}'+
 '#pf-stable-modal .pf-stable-card b{font-size:18px}'+
 '#pf-stable-modal .pf-stable-price{font-size:30px;color:#b0ffca;font-weight:900}'+
 '#pf-stable-modal .pf-stable-card small{font-size:12px;color:#ded5f0}'+
 '#pf-stable-modal .pf-stable-card button{width:100%;border:0;border-radius:12px;background:#8342dc;color:white;padding:12px 8px;font:800 13px system-ui,sans-serif;cursor:pointer;margin-top:auto}'+
 '#pf-stable-modal .pf-stable-foot{font-size:11px;color:#cfc4e5;margin:14px 0 0}'+
 '@media(max-width:520px){#pf-stable-modal .pf-stable-plans{grid-template-columns:1fr}#pf-stable-modal .pf-stable-body{padding:18px}}';
 function route(){return String(location.hash||"").replace(/^#\/?/,"").split("/")[0].toLowerCase()}
 function token(){try{return sessionStorage.getItem("pulso-fit-token")||""}catch(e){return ""}}
 function days(d){var end=new Date(d);return Number.isFinite(end.getTime())?Math.max(0,Math.ceil((end.getTime()-Date.now())/86400000)):null}
 function message(){
  if(details?.planActive&&details.planExpiresAt)return "Assinatura ativa até "+new Date(details.planExpiresAt).toLocaleDateString("pt-BR")+".";
  if(details?.trialEndsAt){var n=days(details.trialEndsAt);
   if(n!==null)return n>0?"Restam "+n+" dia(s) grátis. Validade: "+new Date(details.trialEndsAt).toLocaleDateString("pt-BR")+".":"O teste gratuito terminou em "+new Date(details.trialEndsAt).toLocaleDateString("pt-BR")+".";}
  return token()?"Consultando a validade da sua conta…":"Entre na sua conta para consultar a validade dos 7 dias grátis.";
 }
 function paint(){
  var b=document.getElementById("pf-stable-open");
  if(b){
   var sm=b.querySelector("small");if(sm)sm.textContent=message();
   var activePaid=!!details?.planActive;
   var activeTrial=Number.isFinite(Date.parse(details?.trialEndsAt))&&Date.parse(details.trialEndsAt)>Date.now();
   // An active account already has Planos in Mais. Never obscure exercise controls.
   b.hidden=activePaid||activeTrial||["workouts","coach","training-lab","outdoor","goals","profile","account"].includes(route());
  }
  var p=document.getElementById("pf-stable-trial-status");if(p)p.textContent=message();
 }
 function offerActive(){
  return Boolean(offer?.enabled&&Number.isFinite(Date.parse(offer.expiresAt))&&Date.now()<Date.parse(offer.expiresAt));
 }
 function updateOffer(){
  var box=document.getElementById("pf-stable-test-offer");if(!box)return;
  var active=offerActive();box.hidden=!active;
  if(!active){box.innerHTML="";return}
  var until=new Date(offer.expiresAt).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
  box.innerHTML='<small>🧪 OFERTA TEMPORÁRIA • TESTE REAL DE PIX</small>'+
   '<b>Teste da API de pagamento</b><div class="pf-stable-price">R$ 1,00</div>'+
   '<small>7 dias de acesso após confirmação do Pix</small>'+
   '<p>Oferta disponível até '+until+' (horário local). Encerra automaticamente após 24 horas. Pagamento único, sem renovação.</p>'+
   '<button type="button" data-pf-stable-plan="teste7d"'+(offer.ready?"":" disabled")+'>'+
   (offer.ready?"Contratar 7 dias por R$ 1,00":"PIX temporariamente indisponível")+'</button>';
 }
 async function refreshOffer(force){
  if(offerLoading||!force&&Date.now()-offerCheckedAt<40000)return;
  offerCheckedAt=Date.now();offerLoading=true;
  try{
   var resp=await fetch("/api/billing/config",{cache:"no-store"});
   if(!resp.ok)throw Error("Configuração indisponível");
   var info=await resp.json();
   offer=info.testOffer&&typeof info.testOffer==="object"?
     {...info.testOffer,ready:!!(info.ready&&info.supportedMethods?.includes("pix"))}:null;
   updateOffer();
  }catch{offer=null;updateOffer()}finally{offerLoading=false}
 }
 function ensureStyle(){
  if(document.getElementById("pf-stable-css"))return;
  var node=document.createElement("style");node.id="pf-stable-css";node.textContent=css;(document.head||document.documentElement).appendChild(node);
 }
 function ensureLauncher(){
  if(!document.body||document.getElementById("pf-stable-open"))return;
  var b=document.createElement("button");b.type="button";b.id="pf-stable-open";
  b.innerHTML='🎁 Ver planos e 7 dias grátis<small></small>';
  b.addEventListener("click",function(){closedOnRoute=false;show()});
  document.body.appendChild(b);
 }
 function hide(){
  opened=false;var el=document.getElementById("pf-stable-modal");if(el)el.remove();
 }
 var paymentPoll=null;
 function stopPolling(){if(paymentPoll){clearInterval(paymentPoll);paymentPoll=null}}
 var checkingPreviousPix=false;
 var autoLastCheckedAt=0,autoAccountToken="",autoPendingPix=false,autoWasConfirmed=false;
 function paymentReceiptKey(data){
  var id=String(data?.reference||"").trim();
  // Reference is the immutable, per-order UUID returned by the signed-in API.
  if(!/^[0-9a-f-]{32,40}$/i.test(id))return "";
  return "pf-pix-confirmed-notification-v1:"+id;
 }
 function hasShownReceipt(data){var k=paymentReceiptKey(data);try{return !!k&&localStorage.getItem(k)==="shown"}catch{return false}}
 function markReceiptShown(data){var k=paymentReceiptKey(data);if(k)try{localStorage.setItem(k,"shown")}catch{}}
 function paymentToast(message){
  if(!document.body)return;
  var old=document.getElementById("pf-auto-payment-notice");if(old)old.remove();
  var n=document.createElement("div");n.id="pf-auto-payment-notice";
  n.setAttribute("role","status");
  n.style.cssText="position:fixed;z-index:2147483000;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:calc(98px + env(safe-area-inset-bottom));background:#1f3651;color:#e8fff2;border:2px solid #73e5a3;border-radius:14px;box-shadow:0 12px 40px #0009;font:800 14px/1.5 system-ui;padding:15px;max-width:440px;margin:auto;text-align:center";
  n.textContent=String(message);document.body.appendChild(n);
  setTimeout(function(){if(n.isConnected)n.remove()},12000);
 }
 function autoVerifyPix(force){
  var key=token();
  if(!key||document.hidden)return;
  if(key!==autoAccountToken){autoAccountToken=key;autoLastCheckedAt=0;autoPendingPix=false;autoWasConfirmed=false}
  if(autoWasConfirmed&&!force)return;
  var interval=autoPendingPix?12000:90000;
  if(!force&&Date.now()-autoLastCheckedAt<interval)return;
  if(checkingPreviousPix)return;
  autoLastCheckedAt=Date.now();
  void recoverPreviousPix(true);
 }
 function renderPaid(data){
  autoWasConfirmed=true;autoPendingPix=false;
  markReceiptShown(data);
  var root=document.querySelector("#pf-stable-modal .pf-stable-body");
  if(!root)return;
  stopPolling();
  try{localStorage.removeItem("pulsofit-pix-pending-ref-v1")}catch{}
  root.innerHTML='<div class="pf-stable-top"><div><small>✅ PULSOFIT • PIX CONFIRMADO</small>'+
   '<h2>Pagamento confirmado!</h2></div><button type="button" class="pf-stable-close" aria-label="Fechar">×</button></div>'+
   '<section class="pf-stable-trial"><strong>Seu pagamento foi reconhecido pelo servidor.</strong>'+
   '<p id="pf-stable-paid-detail"></p></section>'+
   '<button id="pf-stable-continue" type="button" style="width:100%;background:#6a42b4;border:0;border-radius:12px;color:white;padding:15px;font-weight:800">Continuar para o aplicativo</button>';
  var expire=data?.planExpiresAt&&Number.isFinite(Date.parse(data.planExpiresAt))?
   new Date(data.planExpiresAt).toLocaleString("pt-BR"):"";
  root.querySelector("#pf-stable-paid-detail").textContent=
    data.planActive?"Plano ativo"+(expire?" até "+expire:"")+". Aproveite seus treinos!":
     "Pix confirmado. A liberação ainda não apareceu na assinatura; confira sua conta antes de tentar pagar novamente.";
  root.querySelector(".pf-stable-close").addEventListener("click",function(){closedOnRoute=true;stopPolling();hide()});
  root.querySelector("#pf-stable-continue").addEventListener("click",function(){stopPolling();hide();location.hash="#/home"});
  void load(true);
  try{window.dispatchEvent(new Event("pulso-payment-confirmed"))}catch{}
 }
 async function recoverPreviousPix(quiet){
  if(checkingPreviousPix||!token())return;
  checkingPreviousPix=true;
  try{
   const response=await fetch("/api/billing/recover",{cache:"no-store",headers:{Authorization:"Bearer "+token()}});
   const json=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(json.error||"Não foi possível consultar o pagamento.");
   autoPendingPix=!!json.found&&!json.paid&&!["DEVOLVIDO","DEVOLVIDO_PARCIAL","CANCELADO","FALHA"].includes(json.status);
   if(json.paid){
    autoPendingPix=false;
    if(!autoWasConfirmed){
     autoWasConfirmed=true;
     if(document.querySelector("#pf-stable-modal .pf-stable-body"))renderPaid(json);
     else{
      try{localStorage.removeItem("pulsofit-pix-pending-ref-v1")}catch{}
      void load(true);
      if(!hasShownReceipt(json)){
       markReceiptShown(json);
       paymentToast(json.planActive?"✅ Pix confirmado! Seu plano foi ativado automaticamente.":"✅ Pix confirmado. Consulte sua assinatura para verificar a liberação.");
      }
      try{window.dispatchEvent(new Event("pulso-payment-confirmed"))}catch{}
     }
    }
    return json;
   }
   const message=document.getElementById("pf-stable-recovery-status");
   if(message&&json.found){
    message.textContent=json.retryable?
      "Não foi possível consultar a MisticPay agora. Se você pagou, não pague novamente; tente verificar mais tarde.":
      "Pix encontrado nesta conta. Situação: "+String(json.status||"PENDENTE")+". Aguardando confirmação da MisticPay.";
    if(!paymentPoll)paymentPoll=setInterval(function(){if(!document.hidden)void recoverPreviousPix(true)},16000);
   }else if(message&&!quiet){message.textContent="Não encontrei Pix recente nesta conta. Confirme se entrou com o mesmo usuário usado no pagamento."}
  }catch(e){
   const message=document.getElementById("pf-stable-recovery-status");
   if(message&&!quiet)message.textContent="Falha na consulta: "+String(e.message||e)+". Não gere outra cobrança.";
  }finally{checkingPreviousPix=false}
 }
 function select(code){
  var plan=code==="teste7d"&&offerActive()?{code:"teste7d",name:"Teste do Pix",price:"R$ 1,00",days:7}:
       code==="mensal"?{code:"mensal",name:"Mensal",price:"R$ 24,90",days:30}:
           code==="quinzenal"?{code:"quinzenal",name:"Quinzenal",price:"R$ 14,90",days:15}:null;
  if(!plan)return;
  stopPolling();
  var outer=document.getElementById("pf-stable-modal");
  if(!outer){show();outer=document.getElementById("pf-stable-modal")}
  if(!outer)return;
  opened=true;closedOnRoute=false;
  var body=outer.querySelector(".pf-stable-body");
  if(!body)return;
  body.innerHTML='<div class="pf-stable-top"><div><small style="color:#c4b5fd;font-weight:900">PULSOFIT AI • PIX MISTICPAY</small>'+
   '<h2>Contratar Plano '+plan.name+'</h2></div><button type="button" class="pf-stable-close" aria-label="Fechar">×</button></div>'+
   '<section class="pf-stable-trial"><strong>'+plan.price+' • '+plan.days+' dias de acesso</strong>'+
   '<p>Pagamento único por Pix, sem renovação automática.</p></section>'+
   '<form id="pf-stable-checkout-form" autocomplete="on">'+
   '<label style="display:block;margin:12px 0;font-weight:700">Nome completo do pagador'+
   '<input name="payerName" required minlength="3" maxlength="120" autocomplete="name" placeholder="Nome completo" style="display:block;box-sizing:border-box;width:100%;padding:13px;margin-top:5px;background:#0d1429;color:#fff;border:1px solid #8077ac;border-radius:10px;font:16px system-ui,sans-serif"></label>'+
   '<label style="display:block;margin:12px 0;font-weight:700">CPF do pagador'+
   '<input name="payerDocument" required inputmode="numeric" maxlength="14" autocomplete="off" placeholder="000.000.000-00" style="display:block;box-sizing:border-box;width:100%;padding:13px;margin-top:5px;background:#0d1429;color:#fff;border:1px solid #8077ac;border-radius:10px;font:16px system-ui,sans-serif"></label>'+
   '<p id="pf-stable-payment-status" role="status" aria-live="polite" style="color:#efe3ff">Verificando a disponibilidade do Pix...</p>'+
   '<button type="submit" id="pf-stable-pay-button" disabled style="display:block;width:100%;background:#8a49db;color:#fff;border:0;padding:14px;border-radius:12px;font-weight:850;cursor:pointer">Gerar QR Code Pix</button>'+
   '</form>'+
   '<div id="pf-stable-pix-result" hidden style="padding-top:15px;text-align:center">'+
   '<strong style="display:block;font-size:17px">Pague usando o QR Code ou o Pix copia e cola</strong>'+
   '<img id="pf-stable-pix-image" alt="QR Code Pix para pagamento" hidden style="display:block;max-width:250px;width:85%;margin:16px auto;border-radius:10px;border:10px solid white;background:white">'+
   '<label for="pf-stable-pix-code" style="display:block;margin:10px 0">Código Pix copia e cola</label>'+
   '<textarea id="pf-stable-pix-code" readonly rows="4" style="box-sizing:border-box;width:100%;background:#0d1429;color:white;border:1px solid #8077ac;border-radius:10px;padding:12px;overflow-wrap:anywhere"></textarea>'+
   '<button type="button" id="pf-stable-pix-copy" style="margin:12px 5px 4px;background:#8a49db;color:white;border:0;padding:12px;border-radius:10px;font-weight:800">Copiar código Pix</button>'+
   '<button type="button" id="pf-stable-pix-check" style="margin:12px 5px 4px;background:#33405e;color:white;border:1px solid #8174b6;padding:12px;border-radius:10px;font-weight:800">Verificar pagamento</button>'+
   '</div>'+
   '<button type="button" id="pf-stable-back-plans" style="margin-top:16px;width:100%;background:transparent;color:#e9d7ff;border:1px solid #7966ac;padding:10px;border-radius:10px;font-weight:700">Voltar aos planos</button>'+
   '<p class="pf-stable-foot">O QR Code só é apresentado após a validação da cobrança no servidor. Seus dados de pagamento são enviados por HTTPS; nunca informe sua senha neste formulário.</p>';
  var form=body.querySelector("#pf-stable-checkout-form");
  var btn=body.querySelector("#pf-stable-pay-button");
  var status=body.querySelector("#pf-stable-payment-status");
  var result=body.querySelector("#pf-stable-pix-result");
  var reference=null,processing=false;
  body.querySelector(".pf-stable-close").addEventListener("click",function(){closedOnRoute=true;stopPolling();hide()});
  body.querySelector("#pf-stable-back-plans").addEventListener("click",function(){stopPolling();hide();show()});
  body.querySelector("#pf-stable-pix-copy").addEventListener("click",function(){
   var area=body.querySelector("#pf-stable-pix-code");
   var text=area.value;
   if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(function(){status.textContent="Código Pix copiado!"}).catch(function(){area.select();status.textContent="Código selecionado. Use Copiar no celular."});
   else{area.select();status.textContent="Código selecionado. Use Copiar no celular."}
  });
  function verify(){
   if(processing||!reference||!body.isConnected)return;
   processing=true;
   fetch("/api/billing/payment?reference="+encodeURIComponent(reference),{cache:"no-store",
    headers:{Authorization:"Bearer "+token()}})
   .then(function(r){return r.json().then(function(j){if(!r.ok)throw Error(j.error||"Consulta indisponível");return j})})
   .then(function(j){
    if(j.paid){renderPaid(j)}
    else if(["DEVOLVIDO","DEVOLVIDO_PARCIAL","CANCELADO","FALHA"].includes(j.status)){stopPolling();status.textContent="Pagamento não concluído: "+j.status}
    else status.textContent="Aguardando o pagamento do Pix...";
   }).catch(function(e){status.textContent="Confirmação temporariamente indisponível: "+e.message+". Não pague novamente. Vá a Planos para recuperar este Pix."})
    .finally(function(){processing=false});
  }
  body.querySelector("#pf-stable-pix-check").addEventListener("click",verify);
  const onReturn=()=>{if(reference&&body.isConnected&&!processing&&!document.hidden)verify()};
  document.addEventListener("visibilitychange",onReturn);
  window.addEventListener("pageshow",onReturn);
  window.addEventListener("focus",onReturn);
  var loggedIn=token();
  if(!loggedIn){
   status.textContent="Entre ou crie uma conta para gerar seu Pix.";
   var login=document.createElement("button");login.type="button";login.textContent="Entrar ou criar conta";
   login.style.cssText="display:block;width:100%;margin:12px 0;background:#41517e;color:#fff;padding:12px;border-radius:10px;border:0;font-weight:800";
   login.addEventListener("click",function(){stopPolling();hide();location.hash="#/account"});
   form.appendChild(login);
  }else{
   fetch("/api/billing/config",{cache:"no-store"})
   .then(function(r){if(!r.ok)throw Error("Servidor de pagamentos indisponível");return r.json()})
   .then(function(config){if(!config.ready||!config.supportedMethods?.includes("pix"))throw Error("Pix temporariamente indisponível");
    if(body.isConnected){btn.disabled=false;status.textContent="Informe seu nome e CPF e toque em Gerar QR Code Pix."}})
   .catch(function(e){status.textContent=e.message+". Nenhuma cobrança foi efetuada."});
  }
  form.addEventListener("submit",function(e){
   e.preventDefault();
   if(btn.disabled||processing||!token())return;
   var name=form.elements.payerName.value.trim();
   var cpf=form.elements.payerDocument.value.replace(/\D/g,"");
   if(name.length<3||cpf.length!==11){status.textContent="Informe nome completo e CPF com 11 dígitos.";return}
   btn.disabled=true;processing=true;status.textContent="Gerando Pix seguro na MisticPay...";
   fetch("/api/billing/checkout",{method:"POST",cache:"no-store",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token()},
    body:JSON.stringify({planCode:plan.code,paymentMethod:"pix",payerName:name,payerDocument:cpf})})
   .then(function(r){return r.json().then(function(j){if(!r.ok)throw Error(j.error||"Não foi possível gerar o Pix");return j})})
   .then(function(j){
    if(!j.reference||!j.copyPaste)throw Error("Cobrança sem código Pix válido");
    reference=j.reference;result.hidden=false;form.hidden=true;
    autoWasConfirmed=false;autoPendingPix=true;autoLastCheckedAt=0;
    try{localStorage.setItem("pulsofit-pix-pending-ref-v1",reference)}catch{}
    body.querySelector("#pf-stable-pix-code").value=j.copyPaste;
    var img=body.querySelector("#pf-stable-pix-image");
    var raw=String(j.qrCodeBase64||"").trim();
    var data=/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(raw)?raw:
      /^[A-Za-z0-9+/=]{200,}$/.test(raw)?"data:image/png;base64,"+raw:"";
    if(data){img.src=data;img.hidden=false;img.style.display="block"}
    status.textContent=data?"QR Code Pix gerado. Aguardando pagamento...":
       "Pix gerado. Use o código copia e cola abaixo no aplicativo do seu banco.";
    stopPolling();paymentPoll=setInterval(verify,12000);
    setTimeout(verify,2500);
   }).catch(function(e){status.textContent="Não foi possível gerar Pix: "+e.message;btn.disabled=false})
    .finally(function(){processing=false});
  });
 }
 function show(){
  if(!document.body)return;opened=true;
  var old=document.getElementById("pf-stable-modal");if(old){paint();return}
  var outer=document.createElement("div");outer.id="pf-stable-modal";
  outer.innerHTML='<section class="pf-stable-body" role="dialog" aria-modal="true" aria-labelledby="pf-stable-title">'+
  '<div class="pf-stable-top"><div><small style="color:#c4b5fd;font-weight:900">PULSOFIT AI • ASSINATURA</small><h2 id="pf-stable-title">Escolha seu plano</h2></div><button type="button" class="pf-stable-close" aria-label="Fechar">×</button></div>'+
  '<section class="pf-stable-trial"><strong>🎁 7 dias de teste grátis</strong><p id="pf-stable-trial-status"></p><small>O prazo é registrado na conta e não gera cobrança automática.</small></section>'+
  '<div class="pf-stable-plans">'+
  '<article class="pf-stable-card promo" id="pf-stable-test-offer" hidden></article>'+
  '<article class="pf-stable-card"><small>SEM FIDELIDADE</small><b>Plano Quinzenal</b><div class="pf-stable-price">R$ 14,90</div><small>15 dias de acesso</small><p>Treinos, Coach IA, metas e acompanhamento.</p><button type="button" data-pf-stable-plan="quinzenal">Selecionar 15 dias</button></article>'+
  '<article class="pf-stable-card best"><small>MELHOR CUSTO-BENEFÍCIO</small><b>Plano Mensal</b><div class="pf-stable-price">R$ 24,90</div><small>30 dias de acesso</small><p>Todos os recursos, com mais economia.</p><button type="button" data-pf-stable-plan="mensal">Selecionar 30 dias</button></article>'+
  '</div><button type="button" id="pf-stable-recover-button" style="display:block;width:100%;margin:15px 0;background:#33426a;color:white;border:1px solid #a78fe8;border-radius:12px;padding:14px;font-weight:800">✅ Já paguei — recuperar e confirmar meu Pix</button>'+
  '<p id="pf-stable-recovery-status" role="status" style="color:#e1daff;font-size:13px"></p>'+
  '<p class="pf-stable-foot">Pix via MisticPay. O cartão ainda não está disponível. O pagamento somente libera o plano após confirmação no servidor.</p></section>';
  outer.querySelector(".pf-stable-close").addEventListener("click",function(){closedOnRoute=true;hide()});
  outer.addEventListener("click",function(e){
   if(e.target===outer){closedOnRoute=true;hide();return}
   var btn=e.target.closest("[data-pf-stable-plan]");if(btn)select(btn.dataset.pfStablePlan);
  });
  document.body.appendChild(outer);paint();updateOffer();void refreshOffer(true);
  outer.querySelector("#pf-stable-recover-button")?.addEventListener("click",()=>void recoverPreviousPix(false));
  try{if(token()&&localStorage.getItem("pulsofit-pix-pending-ref-v1"))void recoverPreviousPix(true)}catch{}
 }
 async function load(force){
  var key=token();
  if(!force&&lastToken===key)return;
  lastToken=key;details=null;paint();
  if(!key)return;
  try{
   var resp=await fetch("/api/subscription/status",{headers:{"Authorization":"Bearer "+key},cache:"no-store"});
   if(!resp.ok)throw Error("Consulta indisponível");
   var json=await resp.json();
   if(key!==token())return;
   details=json;paint();
  }catch{if(key===token()){details=null;paint()}}
 }
 function maintain(){
  if(!document.body)return;
  ensureStyle();ensureLauncher();
  var r=route();
  if(r!==lastRoute){lastRoute=r;closedOnRoute=false;if(["subscription","plans","pricing","pro","premium"].includes(r))opened=true}
  if(!closedOnRoute&&!opened&&document.querySelector("#app .pro-price-grid, #app .pf-commercial-hero"))opened=true;
  if(opened&&!closedOnRoute&&!document.getElementById("pf-stable-modal"))show();
  load();paint();updateOffer();if(opened)void refreshOffer(false);
  autoVerifyPix(false);
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",maintain,{once:true});
 else maintain();
 window.addEventListener("hashchange",maintain);
 window.addEventListener("pageshow",()=>autoVerifyPix(true));
 window.addEventListener("focus",()=>autoVerifyPix(true));
 window.addEventListener("online",()=>autoVerifyPix(true));
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)autoVerifyPix(true)});
 window.addEventListener("pulso-auth-ready",()=>{autoLastCheckedAt=0;autoVerifyPix(true)});
 setInterval(maintain,1500);
})();
