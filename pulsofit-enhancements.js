/* PulsoFit UX 9.8: experiência de IA, oferta de planos e trial de navegação.
 * ATENÇÃO: o vencimento local é uma barreira de interface. A produção deve
 * confirmar a assinatura no servidor e no gateway antes de proteger APIs.
 */
(function () {
  "use strict";
  var TRIAL_KEY="pf_trial_first_use_2026_v1";
  var DAYS=7, DAY=86400000;
  var prices=[
    {code:"quinzenal",title:"Plano Quinzenal",price:"R$ 14,90",duration:"15 dias",detail:"Ideal para começar sem compromisso.",featured:false},
    {code:"mensal",title:"Plano Mensal",price:"R$ 24,90",duration:"30 dias",detail:"Mais economia e continuidade na rotina.",featured:true}
  ];
  var entitlement={valid:false,token:"",checked:false};
  var pendingToken="";
  var observerBusy=false;
  function firstUse(){
    var raw=null;try{raw=localStorage.getItem(TRIAL_KEY)}catch(e){}
    var value=Number(raw),now=Date.now();
    if(!value||value>now||value<1577836800000){value=now;try{localStorage.setItem(TRIAL_KEY,String(value))}catch(e){}}
    return value;
  }
  var trialStart=firstUse();
  function remain(){return Math.max(0,Math.ceil((trialStart+DAYS*DAY-Date.now())/DAY))}
  function expired(){return Date.now()>=trialStart+DAYS*DAY}
  function checkToken(){
    var token="";
    try{token=sessionStorage.getItem("pulso-fit-token")||""}catch(e){}
    if(token===pendingToken)return;
    pendingToken=token;entitlement={valid:false,token:token,checked:!token};
    if(!token){enhance();return}
    fetch("/api/me",{headers:{"Authorization":"Bearer "+token},cache:"no-store"})
    .then(function(r){if(!r.ok)throw Error("Sessão inválida");return r.json()})
    .then(function(result){
      var u=result.user||{};
      var plan=String(u.plan||"").toLowerCase();
      var expiry=Date.parse(u.expires||"");
      entitlement={valid:u.role==="admin"||(["plus","premium","quinzenal","mensal"].indexOf(plan)>=0&&Number.isFinite(expiry)&&expiry>Date.now()),token:token,checked:true};
      enhance();
    }).catch(function(){entitlement={valid:false,token:token,checked:true};enhance()});
  }
  function activeRoute(){return (location.hash.replace(/^#\/?/,"").split("/")[0]||"home")}
  function formatDates(){
    var end=new Date(trialStart+DAYS*DAY);
    return end.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"});
  }
  function enhanceNav(root){
    var nav=root.querySelector(".mobile-nav");if(!nav)return;
    var ids=["home","workouts","coach","goals","profile"];
    var els=Array.from(nav.querySelectorAll("[data-route]"));
    var needs=els.length!==5||els.some(function(el,i){return el.dataset.route!==ids[i]});
    if(needs){
      var sources={};
      els.forEach(function(el){sources[el.dataset.route]=el});
      var clone=function(route,title,icon){
        if(sources[route])return sources[route];
        var el=document.createElement("button");
        el.className="nav-link";el.type="button";el.dataset.route=route;
        el.innerHTML="<span aria-hidden='true'>"+icon+"</span><span>"+title+"</span>";return el
      };
      nav.replaceChildren(
        clone("home","Início","⌂"),clone("workouts","Treinos","🏋"),
        clone("coach","Coach IA","✦"),clone("goals","Metas","◎"),
        clone("profile","Perfil","◉")
      );
      els=Array.from(nav.querySelectorAll("[data-route]"));
    }
    els.forEach(function(el){
      el.classList.toggle("pf-coach-center",el.dataset.route==="coach");
      if(el.dataset.route==="coach"){
        var s=el.querySelector("span:last-child");if(s&&s.textContent!=="Coach IA")s.textContent="Coach IA";
        el.setAttribute("aria-label","Abrir Coach IA");
      }
      el.classList.toggle("active",el.dataset.route===activeRoute());
    });
  }
  function enhanceCoach(root){
    var chat=root.querySelector(".pfai-chat-panel");if(!chat)return;
    chat.classList.add("pf-coach-revamp");
    var title=chat.querySelector(".pfai-chat-header h2");if(title&&title.textContent!=="Seu espaço de conversa")title.textContent="Seu espaço de conversa";
    var textarea=chat.querySelector("#pfaiChatInput");
    if(textarea&&textarea.placeholder!=="Pergunte qualquer coisa sobre treino, recuperação ou alimentação...")textarea.placeholder="Pergunte qualquer coisa sobre treino, recuperação ou alimentação...";
    var hero=root.querySelector(".pfai-hero h1");
    if(hero&&!hero.dataset.pfHeroReady){hero.dataset.pfHeroReady="true";hero.innerHTML="Seu treino evolui.<br><em>A conversa também.</em>";}
    var list=chat.querySelector("#pfaiChatLog");
    if(list&&!chat.querySelector(".pf-chat-modes")){
      var bar=document.createElement("div");bar.className="pf-chat-modes";
      bar.innerHTML="<span class='pf-chat-kicker'>ESCOLHA POR ONDE COMEÇAR</span>"+
        "<div class='pf-chat-topic-grid'>"+
        "<button type='button' data-pf-action='suggest' data-message='Monte um treino de 30 minutos em casa para meu nível'>🏠 Treinar em casa <small>Um treino sob medida</small></button>"+
        "<button type='button' data-pf-action='suggest' data-message='Quero ganhar massa: como organizar meus treinos da semana?'>💪 Ganhar massa <small>Força e progresso</small></button>"+
        "<button type='button' data-pf-action='suggest' data-message='Como melhorar minha alimentação considerando meu objetivo?'>🥗 Alimentação <small>Escolhas práticas</small></button>"+
        "<button type='button' data-pf-action='suggest' data-message='Estou cansado depois do treino; como organizar a recuperação?'>🌙 Recuperação <small>Descanso inteligente</small></button>"+
        "</div>";
      list.parentNode.insertBefore(bar,list);
    }
    var foot=chat.querySelector(".pfai-foot");
    if(foot)foot.setAttribute("aria-label","Informação sobre o modo do treinador");
  }
  function enhanceNutrition(root){
    var select=root.querySelector("#nutritionQuickFood");
    if(!select)return;
    var input=root.querySelector("#nutritionQuickGrams");
    if(!select.dataset.pfReady){
      select.dataset.pfReady="true";
      select.addEventListener("change",function(){
        var defaults={rice:120,chicken:100,egg:50,banana:100,broccoli:100};
        if(input)input.value=String(defaults[select.value]||100);
      });
    }
    var guest=root.querySelector("#nutritionGuest");
    if(guest&&!guest.querySelector(".pf-egg-tip")){
      var tip=document.createElement("p");tip.className="pf-egg-tip";
      tip.textContent="🥚 Referência: 1 ovo cozido grande = cerca de 50 g, 78 kcal e 6,3 g de proteína (USDA). Selecione o alimento e ajuste a quantidade em gramas.";
      guest.appendChild(tip);
    }
  }
  function offerCard(p){
    var d=document.createElement("article");
    d.className="pro-price-card pf-offer"+(p.featured?" featured":"");
    d.innerHTML="<span class='eyebrow'>"+(p.featured?"MELHOR CUSTO-BENEFÍCIO":"SEM FIDELIDADE")+"</span>"+
      "<h2>"+p.title+"</h2><div class='pro-price'>"+p.price+"<small> / "+p.duration+"</small></div>"+
      "<p>"+p.detail+"</p><div class='pro-features'>"+
      "<p>✓ Acesso aos treinos e metas</p><p>✓ Coach IA e Meu Prato*</p>"+
      "<p>✓ Progresso, rotina e vídeos</p><p>✓ Cancele ao fim do período</p></div>"+
      "<button type='button' class='"+(p.featured?"btn":"btn-alt")+" wide' data-pf-select-plan='"+p.code+"'>Selecionar "+p.title+"</button>";
    return d;
  }
  function enhancePlans(root){
    var grid=root.querySelector(".pro-price-grid");if(!grid)return;
    if(grid.dataset.pfPricing==="v1")return;
    grid.dataset.pfPricing="v1";grid.replaceChildren(offerCard(prices[0]),offerCard(prices[1]));
    var hero=root.querySelector(".pro-hero");if(hero){
      var banner=document.createElement("div");banner.className="pf-trial-banner";
      banner.innerHTML="<div><b>🎁 7 dias para conhecer o PulsoFit</b><p>Teste o aplicativo antes de escolher um plano. "+
      (expired()?"Seu período demonstrativo terminou.":"Restam "+remain()+" dia(s) deste período neste navegador. Válido até "+formatDates()+".")+"</p></div>";
      hero.parentNode.insertBefore(banner,hero.nextSibling);
    }
    var alert=root.querySelector(".pro-alert");
    if(alert)alert.innerHTML="<strong>Pagamento não conectado.</strong><p>Os valores são propostas. Não há cobrança por Pix ou cartão nesta versão; liberação de planos depende de ativação pelo administrador. O controle de vencimento ainda precisa de validação no servidor.</p>";
    var note=root.querySelector(".tiny-caption");if(note)note.textContent="*Recursos de IA online dependem do servidor configurado. Nenhuma cobrança ocorre ao selecionar um plano.";
  }
  function removeGate(){var old=document.getElementById("pf-trial-gate");if(old)old.remove()}
  function enhanceGate(root){
    // Não bloqueie contas enquanto não existir checkout/validação do gateway.
    if(!window.PULSO_BILLING_ENFORCED){removeGate();return}
    var allowed=["subscription","account","admin"].indexOf(activeRoute())>=0;
    if(!expired()||entitlement.valid||allowed){removeGate();return}
    var old=document.getElementById("pf-trial-gate");if(old)return;
    var overlay=document.createElement("section");overlay.id="pf-trial-gate";overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label","Período de teste encerrado");
    overlay.innerHTML="<div class='pf-gate-box'><div class='pf-gate-icon'>✦</div>"+
     "<span class='eyebrow'>PULSOFIT PREMIUM</span><h2>Seus 7 dias de teste terminaram.</h2>"+
     "<p>Escolha um plano para continuar treinando. A liberação de assinatura é feita pelo administrador enquanto o pagamento online não estiver configurado.</p>"+
     "<div class='pf-gate-plans'><div><b>15 dias</b><strong>R$ 14,90</strong></div><div><b>30 dias</b><strong>R$ 24,90</strong></div></div>"+
     "<button type='button' class='btn wide' data-pf-open-plans='1'>Ver planos e ativar acesso</button>"+
     "<button type='button' class='btn-alt wide' data-pf-open-account='1'>Já tenho assinatura — entrar na conta</button>"+
     "<small>O período nesta versão é vinculado ao navegador. Proteção segura depende de autenticação e pagamentos verificados no servidor.</small></div>";
    root.appendChild(overlay);
  }
  function enhance(){
    var root=document.getElementById("app");if(!root||observerBusy)return;
    observerBusy=true;
    try{
      enhanceNav(root);enhanceCoach(root);enhanceNutrition(root);enhancePlans(root);enhanceGate(root);
    }finally{observerBusy=false}
  }
  document.addEventListener("click",function(e){
    var button=e.target.closest("[data-pf-select-plan],[data-pf-open-plans],[data-pf-open-account]");
    if(!button)return;e.preventDefault();e.stopImmediatePropagation();
    if(button.dataset.pfSelectPlan){
      try{sessionStorage.setItem("pf_preferred_plan",button.dataset.pfSelectPlan)}catch(err){}
      location.hash="#/account";
      return;
    }
    location.hash=button.hasAttribute("data-pf-open-account")?"#/account":"#/subscription";
  },true);
  document.addEventListener("keydown",function(e){
    if(e.target&&e.target.id==="pfaiChatInput"&&e.key==="Enter"&&!e.shiftKey&&!e.isComposing){
      e.preventDefault();var form=e.target.closest("form");if(form)form.requestSubmit();
    }
  });
  function init(){
    window.PULSO_BILLING_ENFORCED=false;
    // Esta rota deverá retornar billingEnforced:true somente após webhooks e cobrança ativa.
    fetch('/api/subscription/status',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(data){if(data&&data.billingEnforced===true){window.PULSO_BILLING_ENFORCED=true;enhance()}}).catch(function(){});
    var root=document.getElementById("app");if(!root)return;
    enhance();checkToken();
    var observer=new MutationObserver(function(){enhance();checkToken()});
    observer.observe(root,{childList:true,subtree:true});
    window.addEventListener("hashchange",function(){enhance();checkToken()});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();


/* Identidade e configuração do gateway — sem chaves no frontend. */
(function(){
  "use strict";
  if(window.__PULSO_BILLING_UI_2026__)return;
  window.__PULSO_BILLING_UI_2026__=true;
  var checkedToken=null,isAdmin=false,apiReady=false,busy=false,observer=null;
  function getToken(){try{return sessionStorage.getItem("pulso-fit-token")||""}catch(e){return ""}}
  function route(){return (location.hash||"#/home").replace(/^#\/?/,"").split("/")[0]}
  function brand(){
    var root=document.getElementById("app");if(!root)return;
    var aside=root.querySelector(".sidebar");
    if(aside&&!aside.querySelector(".pf-new-brand")){
      var a=document.createElement("button");
      a.type="button";a.className="pf-new-brand";
      a.dataset.route="home";a.setAttribute("aria-label","PulsoFit AI, ir para o início");
      a.innerHTML='<img src="./pulsofit-brand.svg" alt="" loading="eager"><strong>Pulso<b>Fit</b><span class="pf-brand-ai">AI</span></strong>';
      var first=aside.firstElementChild;
      if(first && (/logo|brand/i).test(first.className||""))first.style.display="none";
      aside.insertBefore(a,aside.firstChild);
    }
    var top=root.querySelector(".topbar");
    if(top&&!top.querySelector(".pf-top-logo")){
      var img=document.createElement("img");img.className="pf-top-logo";img.src="./pulsofit-brand.svg";img.alt="PulsoFit AI";
      img.width=34;img.height=34;img.style.cssText="height:34px;width:34px;object-fit:contain;flex:none";
      top.insertBefore(img,top.firstChild);
    }
  }
  function escapeHtml(value){return String(value||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function gatewayPanel(){
    var root=document.getElementById("app");if(!root||!isAdmin)return;
    if(!["subscription","admin","account"].includes(route()))return;
    var main=root.querySelector(".main");if(!main||main.querySelector(".pf-gateway-admin"))return;
    var panel=document.createElement("section");
    panel.className="pf-gateway-admin";
    panel.setAttribute("aria-label","Configurar gateway de pagamentos");
    panel.innerHTML='<h3>⚙️ Gateway de pagamentos</h3>'+
      '<p>Configuração exclusiva de administrador. As credenciais devem ser salvas no servidor, nunca no navegador. Checkout e webhooks só podem ser ativados depois de conectar o provedor.</p>'+
      '<form class="pf-gateway-form" autocomplete="off">'+
      '<label>Gateway<select name="provider" required><option value="">Selecione</option><option value="mercadopago">Mercado Pago</option><option value="asaas">Asaas</option><option value="pagarme">Pagar.me</option><option value="stripe">Stripe</option><option value="other">Outro gateway</option></select></label>'+
      '<label>Ambiente<select name="environment"><option value="sandbox">Homologação (teste)</option><option value="production">Produção</option></select></label>'+
      '<label class="pf-gateway-full">URL da API (https)<input type="url" name="apiBaseUrl" placeholder="https://api.seu-gateway.com" autocomplete="off"></label>'+
      '<label>API Key secreta<input type="password" name="apiKey" placeholder="Inserir somente quando o servidor estiver preparado" autocomplete="new-password" spellcheck="false" disabled></label>'+
      '<label>Webhook secret<input type="password" name="webhookSecret" placeholder="Segredo para verificar notificações" autocomplete="new-password" spellcheck="false" disabled></label>'+
      '<label class="pf-gateway-full">URL prevista para webhook<input type="text" name="webhookUrl" readonly></label>'+
      '<div class="pf-gateway-full"><button type="submit" class="pf-gateway-save" disabled>Salvar configuração protegida</button></div>'+
      '</form><small class="pf-checkout-warning">Aguardando definição do gateway e implementação do endpoint de credenciais. Nenhuma chave será armazenada neste navegador.</small><div class="pf-gateway-status" role="status" aria-live="polite"></div>';
    main.appendChild(panel);
    var f=panel.querySelector("form"),status=panel.querySelector(".pf-gateway-status");
    function setWebhook(){f.elements.webhookUrl.value=location.origin+"/api/billing/webhooks/"+encodeURIComponent(f.elements.provider.value||"seu-gateway");}
    f.elements.provider.addEventListener("change",setWebhook);setWebhook();
    // O endpoint de status deve existir e confirmar explicitamente a disponibilidade do armazenamento seguro.
    var token=getToken();
    fetch("/api/admin/billing/config/status",{headers:{Authorization:"Bearer "+token},cache:"no-store"})
    .then(function(r){if(!r.ok)throw Error("Ainda não configurado");return r.json()})
    .then(function(data){
      if(!data||data.secureStorageReady!==true||data.webhookVerificationReady!==true)throw Error("Armazenamento ou verificação do webhook ainda pendente");
      apiReady=true;
      f.elements.apiKey.disabled=false;f.elements.webhookSecret.disabled=false;
      f.querySelector(".pf-gateway-save").disabled=false;
      status.textContent="Servidor preparado para configuração segura.";
    }).catch(function(){status.textContent="Configuração protegida ainda não disponível; informe o gateway para habilitar.";});
    f.addEventListener("submit",function(ev){
      ev.preventDefault();
      if(!apiReady){status.textContent="O backend seguro ainda não está habilitado.";return}
      var v=f.elements,body={provider:v.provider.value,environment:v.environment.value,apiBaseUrl:v.apiBaseUrl.value,apiKey:v.apiKey.value,webhookSecret:v.webhookSecret.value};
      if(!body.provider||!body.apiKey||!body.webhookSecret){status.textContent="Preencha gateway, API Key e segredo do webhook.";return}
      status.textContent="Enviando configuração ao servidor...";
      fetch("/api/admin/billing/config",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",Authorization:"Bearer "+getToken()},body:JSON.stringify(body)})
      .then(function(r){return r.json().then(function(data){if(!r.ok)throw Error(data.error||"Falha ao configurar");return data})})
      .then(function(){v.apiKey.value="";v.webhookSecret.value="";status.textContent="Configuração recebida pelo servidor. Confirme o webhook com um evento de teste antes de liberar cobranças.";})
      .catch(function(e){status.textContent="Não foi possível salvar: "+e.message});
    });
  }
  function refreshRole(){
    var token=getToken();
    if(checkedToken===token)return;checkedToken=token;isAdmin=false;apiReady=false;
    if(!token)return;
    fetch("/api/me",{headers:{Authorization:"Bearer "+token},cache:"no-store"})
    .then(function(r){return r.ok?r.json():null})
    .then(function(data){isAdmin=!!(data&&data.user&&data.user.role==="admin");schedule()})
    .catch(function(){});
  }
  function refresh(){if(busy)return;busy=true;try{brand();refreshRole();gatewayPanel()}finally{busy=false}}
  var scheduled=false;
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){scheduled=false;refresh()})}
  function init(){
    refresh();var root=document.getElementById("app");
    if(root){observer=new MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true})}
    window.addEventListener("hashchange",schedule);
    document.addEventListener("visibilitychange",function(){if(!document.hidden)schedule()});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
