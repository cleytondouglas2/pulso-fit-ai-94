
(function(){
"use strict";
function bootPulsoUpgrade(){
  if(typeof render!=="function"||typeof app==="undefined"||typeof pfaiChatMarkup!=="function")return;
  var revision="2026.11.18.4";
  var eggData={kcal:155,protein:12.58,carbs:1.12,fat:10.61,fiber:0,sugar:1.12,sodium:124};
  function eggRef(){return {matched:true,source:"USDA FoodData Central",description:"Egg, whole, cooked, hard-boiled (por 100g)",fdcId:173424,per100:Object.assign({},eggData)};}
  function cleanText(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
  function normalizeFoodAnalysis(a){
    if(!a||!Array.isArray(a.foods))return a;
    a.foods.forEach(function(f){
      var label=cleanText([f.name,f.preparation,f.reference&&f.reference.description].join(" "));
      var egg=/\b(ovo|egg|eggs)\b/.test(label),boiled=/cozid|hard.boil|boiled/.test(label);
      var excluded=/fried|frit|omelet|mexid|scrambl|clara|gema|yolk|egg white/.test(label);
      if(egg&&boiled&&!excluded){
        f.reference=eggRef();
        if(!Number.isFinite(Number(f.grams))||Number(f.grams)<=0){f.grams=50; a.uncertainties=Array.isArray(a.uncertainties)?a.uncertainties:[];a.uncertainties.push("Peso do ovo não identificado: 50g é apenas uma referência para 1 unidade média sem casca.");}
        f.name="Ovo cozido";
      }
    });
    return a;
  }
  if(typeof QUICK_FOODS!=="undefined"){
    var egg=QUICK_FOODS.find(function(x){return x.id==="egg";});
    if(egg){egg.grams=50;egg.per100=Object.assign({},eggData);egg.description="Egg, whole, cooked, hard-boiled";egg.fdcId=173424;}
  }
  if(typeof quickFoodEntry==="function"){
    var oldQuick=quickFoodEntry;
    quickFoodEntry=function(food,grams){var item=oldQuick(food,grams);if(food.id==="egg")item.reference=eggRef();return item;};
  }
  if(typeof apiRequest==="function"){
    var oldNutritionApi=apiRequest;
    apiRequest=async function(path,body){
      var result=await oldNutritionApi(path,body);
      if(path==="/api/ai/meal/recognize"&&result&&result.analysis){result.analysis=normalizeFoodAnalysis(result.analysis);}
      return result;
    };
  }
  function upgradeNutritionUI(){
    var picker=document.getElementById("nutritionQuickFood");
    if(picker&&!picker.dataset.pf2026){
      picker.dataset.pf2026="1";
      picker.addEventListener("change",function(){
        var food=QUICK_FOODS.find(function(x){return x.id===picker.value;});
        var grams=document.getElementById("nutritionQuickGrams");
        if(food&&grams)grams.value=String(food.grams||100);
      });
    }
    if(typeof current==="undefined"||!current||!Array.isArray(current.foods))return;
    document.querySelectorAll(".nutri-food-row").forEach(function(row,i){
      var f=current.foods[i];
      if(!f||!f.reference||Number(f.reference.fdcId)!==173424)return;
      var a=row.querySelector('a[href*="fdc.nal.usda.gov"]');
      if(a){var label=document.createElement("span");label.className="pf2026-taco";label.textContent="Fonte: USDA FoodData Central • ovo cozido";a.replaceWith(label);}
      var info=row.querySelector(".nutri-food-name");
      if(info&&!info.querySelector(".pf2026-portion")){var note=document.createElement("small");note.className="pf2026-portion";note.textContent="🥚 1 ovo médio ≈ 50 g (sem casca), cerca de 78 kcal e 6,3 g de proteína. Corrija o peso se necessário.";info.appendChild(note);}
    });
  }
  function currentSection(){return String((location.hash||"#/home").replace(/^#\/?/,"").split("/")[0]||"home");}
  function fixMobileNavigation(){
    var nav=document.querySelector(".mobile-nav");if(!nav)return;
    var page=currentSection();
    var entries=[["home","Início","home"],["workouts","Treinos","dumbbell"],["coach","Coach IA","bolt"],["goals","Metas","star"],["profile","Perfil","user"]];
    nav.classList.add("pf2026-nav");
    nav.innerHTML=entries.map(function(x){
      var active=(page===x[0]||(x[0]==="coach"&&["ai-plan","ai-meals","ai-report"].includes(page)));
      return '<button type="button" class="nav-link pf2026-tab '+(x[0]==="coach"?"pf-coach-center ":"")+(active?"active ":"")+'" data-route="'+x[0]+'" aria-label="'+(x[0]==="coach"?"Abrir Coach IA":x[1])+'" '+(active?'aria-current="page"':'')+'><span class="pf2026-ico">'+ic(x[2])+'</span><span class="pf2026-tab-label">'+x[1]+'</span>'+(x[0]==="coach"?'<span class="pf2026-ia-stamp">IA</span>':'')+'</button>';
    }).join("");
  }
  var oldChat=pfaiChatMarkup;
  pfaiChatMarkup=function(){
    var view=oldChat();
    var quick='<div class="pf2026-chat-tools"><span>✦ Sugestões inteligentes</span><button type="button" data-pf2026-action="voice" title="Ditar mensagem">🎙️ Ditar</button></div>';
    var tip='<div class="pf2026-chat-foot">↵ Enviar · Shift+Enter para nova linha · Respostas personalizadas conforme suas metas</div>';
    return view.replace('<div class="pfai-suggestions">',quick+'<div class="pfai-suggestions">').replace('</form><div class="pfai-foot">','</form>'+tip+'<div class="pfai-foot">');
  };
  var oldCoach=renderCoachAI;
  renderCoachAI=function(){
    var view=oldCoach();
    var head='<section class="pf2026-coach-hero"><div class="pf2026-coach-orb">✦<span>IA</span></div><div><span class="pf2026-overline">PULSO FIT · ASSISTENTE INTELIGENTE</span><h1>Converse com seu <em>Coach IA.</em></h1><p>Seu espaço para planejar treinos, tirar dúvidas e ajustar sua rotina com sugestões que respeitam seus objetivos.</p><div class="pf2026-status">'+pfaiOnlineLabel()+'</div></div></section><div class="pf2026-journeys"><button type="button" data-pf-action="suggest" data-message="Crie um treino de 20 minutos para hoje de acordo com meu objetivo">⚡ Treino de hoje</button><button type="button" data-pf-action="suggest" data-message="Estou cansado e quero adaptar meu treino. O que você sugere?">🧘 Adaptar treino</button><button type="button" data-pf-action="suggest" data-message="Como melhorar minha alimentação para meu objetivo?">🥗 Alimentação</button><button type="button" data-pf-action="suggest" data-message="Analise minha evolução e me ajude a manter a constância">📈 Minha evolução</button></div>';
    return view.replace(/<section class="pfai-hero">[\s\S]*?<\/section>/,head);
  };
  var oldSubscription=renderSubscription;
  renderSubscription=function(){
    var me=pro.me||null;
    var trialEnd=me&&(me.trialEndsAt||me.trial_end_at||me.trialExpiresAt);
    var remaining=trialEnd?Math.max(0,Math.ceil((new Date(trialEnd).getTime()-Date.now())/86400000)):null;
    var status=remaining!==null?(remaining>0?'Seu teste registrado no servidor: '+remaining+' dia(s) restante(s).':'Teste expirado: escolha um plano para continuar.'):'O teste de 7 dias e a cobrança dependem de ativação no servidor. Nenhuma cobrança será iniciada nesta tela.';
    return '<section class="pf2026-billing-hero"><span class="pf2026-overline">PULSO FIT · ASSINATURAS</span><h1>Seu treino merece <em>continuidade.</em></h1><p>Conheça os planos e experimente a experiência completa durante 7 dias quando o sistema de assinaturas estiver habilitado.</p><div class="pf2026-billing-status">'+status+'</div></section>'
      +'<div class="pf2026-price-grid">'
      +'<article class="pf2026-price-card"><span>FLEXÍVEL</span><h2>Quinzenal</h2><div class="pf2026-price">R$ 14,90 <small>/ 15 dias</small></div><p>Sem fidelidade • acesso por 15 dias após confirmação do pagamento.</p><ul><li>Treinos e exercícios</li><li>Coach IA, quando conectado</li><li>Meu Prato e metas</li></ul><button type="button" class="btn-alt wide" data-pf2026-action="plan" data-plan="quinzenal">Escolher quinzenal</button></article>'
      +'<article class="pf2026-price-card highlighted"><span>MAIS VANTAJOSO</span><h2>Mensal</h2><div class="pf2026-price">R$ 24,90 <small>/ 30 dias</small></div><p>Economize R$ 4,90 em relação a duas quinzenas.</p><ul><li>Todos os treinos</li><li>Coach IA, quando conectado</li><li>Análise de refeições e relatórios</li></ul><button type="button" class="btn wide" data-pf2026-action="plan" data-plan="mensal">Escolher mensal</button></article></div>'
      +'<section class="pf2026-trial"><h3>🎁 7 dias grátis</h3><p>Uma vez por conta, sem cobrança automática durante o teste. O início e o fim do período precisam ser confirmados pelo servidor para valer em qualquer aparelho.</p><button type="button" class="btn-alt" data-pf2026-action="trial">Conhecer o teste de 7 dias →</button></section>'
      +'<p class="pf2026-billing-note">Importante: o checkout, os webhooks de pagamento, a ativação automática e o bloqueio seguro após o teste ainda não estão ativos. Os preços são propostas para configuração, não cobranças disponíveis. Não informe dados de cartão nesta tela.</p>';
  };
  document.addEventListener("click",function(ev){
    var el=ev.target.closest&&ev.target.closest("[data-pf2026-action]");if(!el)return;
    ev.preventDefault();var action=el.dataset.pf2026Action;
    if(action==="plan"){flash("Plano "+el.dataset.plan+" selecionado. O pagamento ainda precisa ser integrado ao servidor; nenhuma cobrança foi realizada.");return;}
    if(action==="trial"){if(pro.me){flash("O teste de 7 dias será disponibilizado após a integração do controle de assinaturas no servidor.");}else{pro.authMode="register";navigate("account");flash("Crie sua conta. O teste será iniciado somente após a ativação do controle de assinaturas.");}return;}
    if(action==="voice"){
      var Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(!Speech){flash("Ditado por voz indisponível neste navegador. Use o teclado.");return;}
      var rec=new Speech();rec.lang="pt-BR";rec.interimResults=false;rec.maxAlternatives=1;
      rec.onresult=function(e){var inp=document.getElementById("pfaiChatInput");if(inp){inp.value=((inp.value||"")+" "+e.results[0][0].transcript).trim();inp.focus();}};
      rec.onerror=function(){flash("Não foi possível usar o microfone. Confira a permissão no navegador.");};
      try{rec.start();}catch{flash("O microfone não foi iniciado.");}
    }
  });
  document.addEventListener("keydown",function(ev){
    if(ev.target&&ev.target.id==="pfaiChatInput"&&ev.key==="Enter"&&!ev.shiftKey&&!ev.isComposing){
      ev.preventDefault();ev.target.closest("form")?.requestSubmit();
    }
  });
  var oldRender=render,lastPage=null;
  render=function(){
    var page=currentSection(),changed=lastPage!==null&&lastPage!==page;
    function paint(){oldRender();fixMobileNavigation();upgradeNutritionUI();}
    if(changed&&document.startViewTransition&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches)document.startViewTransition(paint);
    else paint();
    lastPage=page;
  };
  if(typeof env!=="undefined")env.render=render;
  render();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bootPulsoUpgrade,{once:true});
else if(document.readyState==="interactive")document.addEventListener("DOMContentLoaded",bootPulsoUpgrade,{once:true});
else bootPulsoUpgrade();
})();
