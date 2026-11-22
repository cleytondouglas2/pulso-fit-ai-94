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
  var verifiedServerAccess=null, billingServerStatus=null;
  function refreshBillingEntitlement(token){
    if(!token){verifiedServerAccess=null;billingServerStatus=null;window.PULSO_BILLING_ENFORCED=false;removeGate();return;}
    fetch('/api/subscription/status',{cache:'no-store',headers:{Authorization:'Bearer '+token}})
      .then(function(r){if(!r.ok)throw Error('Consulta de assinatura indisponível');return r.json()})
      .then(function(data){
        if(token!==pendingToken)return;
        window.PULSO_BILLING_ENFORCED=data.billingEnforced===true;
        verifiedServerAccess=window.PULSO_BILLING_ENFORCED?!!data.hasAccess:null;
        billingServerStatus=data;
        if(window.PULSO_BILLING_ENFORCED){
          entitlement.valid=verifiedServerAccess;
          entitlement.checked=true;
        }
        enhance();
      }).catch(function(){window.PULSO_BILLING_ENFORCED=false;verifiedServerAccess=null;billingServerStatus=null;enhance()});
  }

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
    pendingToken=token;verifiedServerAccess=null;billingServerStatus=null;entitlement={valid:false,token:token,checked:!token};
    refreshBillingEntitlement(token);
    if(!token){enhance();return}
    fetch("/api/me",{headers:{"Authorization":"Bearer "+token},cache:"no-store"})
    .then(function(r){if(!r.ok)throw Error("Sessão inválida");return r.json()})
    .then(function(result){
      var u=result.user||{};
      var plan=String(u.plan||"").toLowerCase();
      var expiry=Date.parse(u.expires||"");
      var legacyAccess=u.role==="admin"||(["plus","premium","quinzenal","mensal"].indexOf(plan)>=0&&Number.isFinite(expiry)&&expiry>Date.now());
      if(token===pendingToken)entitlement={valid:verifiedServerAccess!==null?verifiedServerAccess:legacyAccess,token:token,checked:true};
      enhance();
    }).catch(function(){if(token===pendingToken)entitlement={valid:verifiedServerAccess!==null?verifiedServerAccess:false,token:token,checked:true};enhance()});
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
        clone("profile","Mais","☰")
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
  /* Portal de planos acessível em qualquer tela, sem depender da rota do app */
  function planStatusText(){
    var state=billingServerStatus;
    if(state&&state.planActive&&state.planExpiresAt){
      var paidEnd=new Date(state.planExpiresAt);
      return Number.isFinite(paidEnd.getTime())?"Plano ativo até "+paidEnd.toLocaleDateString("pt-BR"):"Plano ativo";
    }
    if(state&&state.trialEndsAt){
      var trialEnd=new Date(state.trialEndsAt);
      if(Number.isFinite(trialEnd.getTime())){
        var days=Math.max(0,Math.ceil((trialEnd.getTime()-Date.now())/86400000));
        return days>0?"Restam "+days+" dia(s) grátis · até "+trialEnd.toLocaleDateString("pt-BR"):"Teste grátis encerrado em "+trialEnd.toLocaleDateString("pt-BR");
      }
    }
    var token="";try{token=sessionStorage.getItem("pulso-fit-token")||""}catch(e){}
    return token?"Consultando sua validade de 7 dias no servidor…":"Entre na sua conta para consultar os 7 dias grátis";
  }
  function openPlansOverlay(){
    var already=document.getElementById("pf-plans-portal");
    if(already){updatePlansPortal();return}
    var overlay=document.createElement("div");
    overlay.id="pf-plans-portal";overlay.className="pf-plans-portal";
    overlay.innerHTML='<section class="pf-plans-dialog" role="dialog" aria-modal="true" aria-labelledby="pf-plans-title">'+
     '<button type="button" class="pf-plans-close" aria-label="Fechar planos">×</button>'+
     '<div class="pf-plans-heading"><img src="./pulsofit-brand.svg" alt="" loading="lazy"><div><span>ASSINATURA PULSOFIT AI</span>'+
     '<h2 id="pf-plans-title">Seu treino não pode parar</h2></div></div>'+
     '<div class="pf-plans-free"><strong>🎁 Teste grátis de 7 dias</strong><p id="pf-plans-status"></p>'+
     '<small>O período começa no primeiro acesso registrado na sua conta. Não há renovação automática.</small></div>'+
     '<div class="pf-plans-options"></div>'+
     '<p class="pf-plans-fineprint">Pix pela Argus Pay. Cartão ainda indisponível. A liberação ocorre após a confirmação do pagamento pelo servidor.</p>'+
     '</section>';
    var grid=overlay.querySelector(".pf-plans-options");
    grid.appendChild(offerCard(prices[0]));grid.appendChild(offerCard(prices[1]));
    document.body.appendChild(overlay);
    function close(){overlay.remove();document.removeEventListener("keydown",onKey)}
    function onKey(e){if(e.key==="Escape")close()}
    document.addEventListener("keydown",onKey);
    overlay.addEventListener("click",function(e){if(e.target===overlay||e.target.closest(".pf-plans-close"))close()});
    overlay.querySelector(".pf-plans-close").focus();
    updatePlansPortal();
  }
  function updatePlansPortal(){
    var launcher=document.getElementById("pf-plans-shortcut");
    if(!launcher){
      launcher=document.createElement("button");launcher.type="button";
      launcher.id="pf-plans-shortcut";launcher.className="pf-plans-shortcut";
      launcher.setAttribute("aria-label","Ver planos e validade do teste grátis");
      launcher.innerHTML='<span class="pf-plans-shortcut-icon">🎁</span><span class="pf-plans-shortcut-copy"><strong>7 dias grátis · Planos</strong><small></small></span><span class="pf-plans-shortcut-chevron">›</span>';
      launcher.addEventListener("click",openPlansOverlay);
      document.body.appendChild(launcher);
    }
    var state=billingServerStatus;
    var title=launcher.querySelector("strong");
    var label=launcher.querySelector("small");
    if(title)title.textContent=state&&state.planActive?"Sua assinatura · Planos":"🎁 7 dias grátis · Planos";
    if(label)label.textContent=planStatusText();
    var status=document.getElementById("pf-plans-status");
    if(status)status.textContent=planStatusText();
  }
  function enhancePlans(root){
    var route=activeRoute();
    var main=root.querySelector(".main");
    if(route==="home"&&main){
      var intro=main.querySelector(".pf-home-pricing-entry");
      if(!intro){intro=document.createElement("section");intro.className="pf-home-pricing-entry";main.insertBefore(intro,main.firstChild);}
      var state=billingServerStatus,daysLeft=state&&Number.isFinite(Number(state.remainingTrialDays))?Number(state.remainingTrialDays):null;
      var dateText=state&&state.trialEndsAt?new Date(state.trialEndsAt).toLocaleDateString("pt-BR"):"";
      var summary=state&&state.planActive?"Seu plano está ativo"+(state.planExpiresAt?" até "+new Date(state.planExpiresAt).toLocaleDateString("pt-BR"):"")+"."
        :daysLeft!==null?(daysLeft>0?"Faltam "+daysLeft+" dia(s) para terminar o teste em "+dateText+".":"Seu teste terminou em "+dateText+"."):
          "Crie sua conta ou entre para consultar quando os 7 dias gratuitos terminam.";
      var homeMarkup='<div><strong>🎁 7 dias de teste grátis</strong><p>'+summary+'</p></div>'+
        '<button type="button" data-route="subscription">Ver planos e validade</button>';
      if(intro.innerHTML!==homeMarkup)intro.innerHTML=homeMarkup;
    }
    if(route!=="subscription")return;
    var grid=root.querySelector(".pro-price-grid");
    if(!grid&&main){grid=document.createElement("div");grid.className="pro-price-grid pf-offers";main.appendChild(grid);}
    if(!grid)return;
    var oldTrial=root.querySelector(".pf-trial-card");
    // O aplicativo re-renderiza a grade e pode recolocar os cartões antigos
    // sem apagar data-pf-pricing. Conferir as opções REAIS em vez da marca.
    var activeOffers=Array.from(grid.querySelectorAll("[data-pf-select-plan]"));
    var hasBothPlans=prices.every(function(p){
      return activeOffers.some(function(el){return el.dataset.pfSelectPlan===p.code});
    });
    if(!hasBothPlans){
      grid.replaceChildren(offerCard(prices[0]),offerCard(prices[1]));
    }
    grid.dataset.pfPricing="v3";
    var state=billingServerStatus;
    var token="";
    try{token=sessionStorage.getItem("pulso-fit-token")||""}catch(e){}
    var detail="";
    if(!token){
      detail="Crie ou acesse sua conta para iniciar e acompanhar os seus 7 dias gratuitos. Não há cobrança automática.";
    }else if(state&&state.planActive===true&&state.planExpiresAt){
      var pEnd=new Date(state.planExpiresAt);
      detail="Seu plano está ativo até "+(Number.isFinite(pEnd.getTime())?pEnd.toLocaleDateString("pt-BR"):"a data informada pelo servidor")+".";
    }else if(state&&state.trialEndsAt){
      var end=new Date(state.trialEndsAt);
      if(Number.isFinite(end.getTime())){
        var days=Math.max(0,Math.ceil((end.getTime()-Date.now())/86400000));
        detail=days>0?"Restam "+days+" dia(s) de teste. Válido até "+end.toLocaleDateString("pt-BR")+".":"Seu período gratuito terminou em "+end.toLocaleDateString("pt-BR")+".";
      }else detail="Não foi possível interpretar o prazo informado pelo servidor.";
    }else{
      detail="Consultando sua data de validade no servidor. O teste grátis é vinculado à sua conta.";
    }
    var hero=root.querySelector(".pf-commercial-hero, .pro-hero");
    var banner=root.querySelector(".pf-trial-banner")||oldTrial;
    if(!banner){
      banner=document.createElement("section");banner.className="pf-trial-banner";
      banner.setAttribute("aria-label","Status do período gratuito");
      if(hero)hero.insertAdjacentElement("afterend",banner);
      else grid.insertAdjacentElement("beforebegin",banner);
    }
    var bannerMarkup='<div><b>🎁 Teste grátis de 7 dias</b><p>'+detail+'</p>'+
       '<small>A validade é calculada no servidor quando há uma sessão autenticada. O bloqueio após o teste ainda está desativado.</small></div>'+
       (!token?'<button type="button" data-route="account">Criar conta ou entrar</button>':'');
    if(banner.innerHTML!==bannerMarkup)banner.innerHTML=bannerMarkup;
    var alert=root.querySelector(".pro-alert");
    if(alert){
      var alertMarkup="<strong>Planos PulsoFit AI • Pix via Argus Pay</strong><p>Selecione um plano para consultar a disponibilidade do pagamento. O Pix só é apresentado após a validação da cobrança pelo servidor. Cartão não está disponível neste gateway.</p>";
      if(alert.innerHTML!==alertMarkup)alert.innerHTML=alertMarkup;
    }
    var note=root.querySelector(".tiny-caption");
    if(note){
      var label="Planos de 15 e 30 dias, sem renovação automática. O acesso será registrado após confirmação segura do Pix.";
      if(note.textContent!==label)note.textContent=label;
    }
  }
  function removeGate(){var old=document.getElementById("pf-trial-gate");if(old)old.remove()}
  function enhanceGate(root){
    // Não bloqueie contas enquanto não existir checkout/validação do gateway.
    if(!window.PULSO_BILLING_ENFORCED){removeGate();return}
    var allowed=["subscription","account","admin"].indexOf(activeRoute())>=0;
    if(entitlement.valid||allowed){removeGate();return}
    var old=document.getElementById("pf-trial-gate");if(old)return;
    var overlay=document.createElement("section");overlay.id="pf-trial-gate";overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label","Período de teste encerrado");
    overlay.innerHTML="<div class='pf-gate-box'><div class='pf-gate-icon'>✦</div>"+
     "<span class='eyebrow'>PULSOFIT PREMIUM</span><h2>Seus 7 dias de teste terminaram.</h2>"+
     "<p>Escolha um plano para continuar treinando. Sua assinatura será liberada após a confirmação do pagamento pela Argus Pay, quando o checkout Pix estiver ativo.</p>"+
     "<div class='pf-gate-plans'><div><b>15 dias</b><strong>R$ 14,90</strong></div><div><b>30 dias</b><strong>R$ 24,90</strong></div></div>"+
     "<button type='button' class='btn wide' data-pf-open-plans='1'>Ver planos e ativar acesso</button>"+
     "<button type='button' class='btn-alt wide' data-pf-open-account='1'>Já tenho assinatura — entrar na conta</button>"+
     "<small>O prazo de teste e o vencimento são verificados na sua conta pelo servidor.</small></div>";
    root.appendChild(overlay);
  }
  function enhance(){
    var root=document.getElementById("app");if(!root||observerBusy)return;
    observerBusy=true;
    try{
      enhanceNav(root);enhanceCoach(root);enhanceNutrition(root);enhancePlans(root);enhanceGate(root);updatePlansPortal();
    }finally{observerBusy=false}
  }

  /* PulsoFit checkout visual — configuração e cobrança verificadas no servidor */
  function openPlanCheckout(planCode){
    var plan=prices.find(function(p){return p.code===planCode;});
    if(!plan)return;
    document.getElementById("pf-checkout-modal")?.remove();
    var modal=document.createElement("div");modal.id="pf-checkout-modal";modal.className="pf-checkout-backdrop";
    modal.innerHTML='<section class="pf-checkout-box" role="dialog" aria-modal="true" aria-labelledby="pf-checkout-heading">'+
      '<button type="button" class="pf-checkout-close" aria-label="Fechar checkout">×</button>'+
      '<img class="pf-checkout-logo" src="./pulsofit-brand.svg" alt="PulsoFit AI">'+
      '<span class="pf-checkout-kicker">PULSOFIT AI · ARGUS PAY</span>'+
      '<h2 id="pf-checkout-heading">Contratar '+plan.title+'</h2>'+
      '<div class="pf-checkout-summary"><span>'+plan.title+'</span><strong>'+plan.price+'</strong><small>'+plan.duration+' de acesso; sem renovação automática</small></div>'+
      '<p>Método de pagamento</p>'+
      '<div class="pf-checkout-methods"><label><input type="radio" name="pf-pay-method" value="pix" checked> Pix</label><label title="Não documentado pela Argus Pay"><input type="radio" name="pf-pay-method" value="card" disabled> Cartão (indisponível)</label></div>'+
      '<div class="pf-checkout-payer"><label>Nome completo do pagador<input id="pf-payer-name" type="text" autocomplete="name" maxlength="120" placeholder="Nome completo"></label><label>CPF do pagador<input id="pf-payer-document" type="text" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="000.000.000-00"></label></div>'+
      '<p class="pf-checkout-hint">Seus dados serão enviados por conexão segura à Argus Pay para gerar a cobrança. Não armazenamos números de cartão nesta página.</p>'+
      '<p id="pf-checkout-status" class="pf-checkout-status" role="status" aria-live="polite">Verificando disponibilidade da Argus Pay...</p>'+
      '<button type="button" class="pf-checkout-submit" disabled>Gerar Pix</button>'+
      '<div id="pf-checkout-pix" class="pf-checkout-pix" hidden><p><b>Escaneie o QR Code ou copie o código Pix</b></p><div class="pf-checkout-qr" role="img" aria-label="QR Code Pix Argus Pay" hidden></div><textarea readonly rows="3" aria-label="Código Pix copia e cola"></textarea><button type="button" class="pf-checkout-copy">Copiar Pix</button><button type="button" class="pf-checkout-verify">Verificar pagamento</button><p class="pf-checkout-hint">A assinatura será ativada somente após a confirmação bancária no servidor.</p></div>'+
      '<button type="button" class="pf-checkout-login">Entrar ou criar conta</button>'+
      '</section>';
    document.body.appendChild(modal);
    var status=modal.querySelector("#pf-checkout-status"),submit=modal.querySelector(".pf-checkout-submit"),pix=modal.querySelector("#pf-checkout-pix");
    var reference=null,token="",polling=false,pollId=null;
    function close(){if(pollId)clearInterval(pollId);modal.remove();document.removeEventListener("keydown",onKey)}
    function onKey(ev){if(ev.key==="Escape")close()}
    document.addEventListener("keydown",onKey);
    modal.addEventListener("click",function(e){if(e.target===modal||e.target.closest(".pf-checkout-close"))close()});
    modal.querySelector(".pf-checkout-login").addEventListener("click",function(){close();location.hash="#/account"});
    modal.querySelector(".pf-checkout-close").focus();
    fetch("/api/billing/config",{cache:"no-store"}).then(function(r){if(!r.ok)throw Error("API de cobrança não disponível");return r.json()})
      .then(function(info){
        if(!info.ready||!Array.isArray(info.supportedMethods)||!info.supportedMethods.includes("pix")){
          status.textContent="Integração Pix em preparação. O administrador precisa concluir as credenciais e o servidor antes de liberar pagamentos.";
          return;
        }
        submit.disabled=false;status.textContent="Pix disponível. Informe nome e CPF para gerar a cobrança.";
      }).catch(function(){status.textContent="Gateway ainda não ativado no servidor. Nenhum pagamento será cobrado.";});
    function verify(){
      if(!reference||polling||!modal.isConnected)return;
      polling=true;
      fetch("/api/billing/payment?reference="+encodeURIComponent(reference),{cache:"no-store",headers:{Authorization:"Bearer "+token}})
      .then(function(r){return r.json().then(function(d){if(!r.ok)throw Error(d.error||"Consulta indisponível");return d})})
      .then(function(d){if(d.paid){status.textContent="Pagamento confirmado! Seu plano foi encaminhado para ativação.";if(pollId)clearInterval(pollId);pollId=null;}else if(["DEVOLVIDO","DEVOLVIDO_PARCIAL","CANCELADO","FALHA"].includes(d.status)){status.textContent="Pagamento não concluído: "+d.status;if(pollId)clearInterval(pollId);pollId=null;}else status.textContent="Pix gerado. Aguardando confirmação do pagamento...";})
      .catch(function(err){status.textContent="Não foi possível consultar agora: "+err.message})
      .finally(function(){polling=false});
    }
    modal.querySelector(".pf-checkout-verify").addEventListener("click",verify);
    modal.querySelector(".pf-checkout-copy").addEventListener("click",function(){
      var value=pix.querySelector("textarea").value;
      if(navigator.clipboard?.writeText)navigator.clipboard.writeText(value).then(function(){status.textContent="Código Pix copiado!"}).catch(function(){status.textContent="Selecione o código Pix para copiar manualmente.";});
      else{pix.querySelector("textarea").select();status.textContent="Código selecionado. Copie usando o menu do dispositivo.";}
    });
    submit.addEventListener("click",function(){
      try{token=sessionStorage.getItem("pulso-fit-token")||""}catch(e){}
      if(!token){status.textContent="Entre na sua conta antes de contratar.";return}
      var name=modal.querySelector("#pf-payer-name").value.trim();
      var cpf=modal.querySelector("#pf-payer-document").value.replace(/\D/g,"");
      if(name.length<3||cpf.length!==11){status.textContent="Informe nome completo e CPF com 11 dígitos.";return;}
      submit.disabled=true;status.textContent="Gerando Pix seguro na Argus Pay...";
      fetch("/api/billing/checkout",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
        body:JSON.stringify({planCode:planCode,paymentMethod:"pix",payerName:name,payerDocument:cpf})})
       .then(function(r){return r.json().then(function(d){if(!r.ok)throw Error(d.error||"Falha ao gerar Pix");return d})})
       .then(function(data){
         if(!data.reference||!data.copyPaste)throw Error("Cobrança sem código Pix");
         reference=data.reference;
         pix.hidden=false;pix.querySelector("textarea").value=data.copyPaste;
         var qr=pix.querySelector(".pf-checkout-qr");
         var drawn=Boolean(window.PULSO_PIX_QR&&window.PULSO_PIX_QR.render(qr,data.copyPaste,data.qrCodeBase64));
         status.textContent=drawn?"QR Code Pix gerado. Aguardando pagamento...":
          "Pix gerado, mas o desenho do QR Code não está disponível. Use o copia e cola.";
         modal.querySelector(".pf-checkout-payer").hidden=true;submit.hidden=true;
         pollId=setInterval(verify,12000);
       }).catch(function(err){status.textContent="Não foi possível gerar Pix: "+err.message;submit.disabled=false});
    });
  }

  document.addEventListener("click",function(e){
    var button=e.target.closest("[data-pf-select-plan],[data-pf2026-action=plan],[data-pf-open-plans],[data-pf-open-account],[data-route=subscription]");
    if(!button)return;e.preventDefault();e.stopImmediatePropagation();
    var planCode=button.dataset.pfSelectPlan||(button.dataset.pf2026Action==="plan"?button.dataset.plan:null);
    if(planCode){document.getElementById("pf-plans-portal")?.remove();openPlanCheckout(planCode);return;}
    if(button.hasAttribute("data-pf-open-account")){location.hash="#/account";return;}
    openPlansOverlay();
  },true);
  document.addEventListener("keydown",function(e){
    if(e.target&&e.target.id==="pfaiChatInput"&&e.key==="Enter"&&!e.shiftKey&&!e.isComposing){
      e.preventDefault();var form=e.target.closest("form");if(form)form.requestSubmit();
    }
  });
  function init(){
    window.PULSO_BILLING_ENFORCED=false;
    // Esta rota deverá retornar billingEnforced:true somente após webhooks e cobrança ativa.
    // O estado de assinatura só é confiável quando consultado com token autenticado, via checkToken().
    var root=document.getElementById("app");if(!root)return;
    enhance();checkToken();
    var observer=new MutationObserver(function(){enhance();checkToken()});
    observer.observe(root,{childList:true,subtree:true});
    window.addEventListener("hashchange",function(){enhance();checkToken();if(activeRoute()==="subscription")openPlansOverlay()});
    if(activeRoute()==="subscription")openPlansOverlay();
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
      '<p>Configuração exclusiva de administrador. As credenciais devem ser salvas no servidor, nunca no navegador. Para Argus Pay são necessários Client ID (pk_) e Client Secret (sk_) no Render; a API documentada oferece apenas Pix. O webhook deve ser confirmado por consulta autenticada.</p>'+
      '<form class="pf-gateway-form" autocomplete="off">'+
      '<label>Gateway<select name="provider" required><option value="">Selecione</option><option value="mercadopago">Mercado Pago</option><option value="asaas">Asaas</option><option value="pagarme">Pagar.me</option><option value="stripe">Stripe</option><option value="misticpay">Argus Pay (Pix)</option><option value="other">Outro gateway</option></select></label>'+
      '<label>Ambiente<select name="environment"><option value="sandbox">Homologação (teste)</option><option value="production">Produção</option></select></label>'+
      '<label class="pf-gateway-full">URL da API (https)<input type="url" name="apiBaseUrl" placeholder="https://api.seu-gateway.com" autocomplete="off"></label>'+
      '<label>API Key secreta<input type="password" name="apiKey" placeholder="Inserir somente quando o servidor estiver preparado" autocomplete="new-password" spellcheck="false" disabled></label>'+
      '<label>Webhook secret<input type="password" name="webhookSecret" placeholder="Segredo para verificar notificações" autocomplete="new-password" spellcheck="false" disabled></label>'+
      '<label class="pf-gateway-full">URL prevista para webhook<input type="text" name="webhookUrl" readonly></label>'+
      '<div class="pf-gateway-full"><button type="submit" class="pf-gateway-save" disabled>Salvar configuração protegida</button></div>'+
      '</form><small class="pf-checkout-warning">A Argus Pay não documenta pagamentos por cartão nem assinatura de webhook. Configure pk_/sk_ diretamente nas variáveis protegidas do Render; nunca insira segredos nesta página.</small><div class="pf-gateway-status" role="status" aria-live="polite"></div>';
    main.appendChild(panel);
    var f=panel.querySelector("form"),status=panel.querySelector(".pf-gateway-status");
    function setWebhook(){f.elements.webhookUrl.value=location.origin+"/api/billing/webhook";}
    f.elements.provider.addEventListener("change",setWebhook);setWebhook();
    // O endpoint de status deve existir e confirmar explicitamente a disponibilidade do armazenamento seguro.
    var token=getToken();
    fetch("/api/admin/billing/config",{headers:{Authorization:"Bearer "+token},cache:"no-store"})
    .then(function(r){if(!r.ok)throw Error("Ainda não configurado");return r.json()})
    .then(function(data){
      if(!data||data.readyForSecureWrite!==true||data.webhookVerificationReady!==true)throw Error("Armazenamento ou verificação do webhook ainda pendente");
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
      fetch("/api/admin/billing/config",{method:"PUT",cache:"no-store",headers:{"Content-Type":"application/json",Authorization:"Bearer "+getToken()},body:JSON.stringify(body)})
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
