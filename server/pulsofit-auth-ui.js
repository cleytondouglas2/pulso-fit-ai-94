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
'#pf-account-lock.pf-auth-landing-lock{align-items:flex-start!important;background:radial-gradient(circle at 80% 4%,#3c2456 0,transparent 37%),linear-gradient(140deg,#080e1c,#11142d 65%,#101b28)!important;padding:clamp(13px,3vw,32px)!important;scrollbar-gutter:stable;overflow-y:auto}',
'#pf-auth-landing{box-sizing:border-box;width:min(100%,1120px);max-width:1120px;margin:0 auto 32px;position:relative;overflow:hidden;border:1px solid #8071a855;border-radius:clamp(19px,3vw,30px);background:linear-gradient(155deg,#181b36,#111b31);box-shadow:0 22px 80px #02061299;padding:clamp(19px,4vw,34px);min-height:min(90dvh,940px)}',
'#pf-auth-landing:before{content:"";position:absolute;width:340px;height:340px;right:-145px;top:55px;background:#a74bff28;filter:blur(50px);border-radius:50%;pointer-events:none}',
'#pf-auth-landing .pf-land-nav{position:relative;display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 clamp(24px,5vw,48px)}',
'#pf-auth-landing .pf-land-brand{display:flex;align-items:center;gap:10px;color:#fff;font:900 clamp(15px,3vw,19px) system-ui,sans-serif;letter-spacing:.11em}',
'#pf-auth-landing .pf-land-brand img{width:43px;height:43px;object-fit:contain;border-radius:14px;background:#ffffff10;padding:6px;box-sizing:border-box}',
'#pf-auth-landing button{font-family:system-ui,sans-serif;cursor:pointer}',
'#pf-auth-landing .pf-land-navlogin{border:1px solid #8f83b4;border-radius:13px;padding:10px 15px;background:#242645;color:#f0e4ff;font:800 12px system-ui,sans-serif;white-space:nowrap}',
'#pf-auth-landing .pf-land-cols{position:relative;display:grid;grid-template-columns:minmax(0,1.04fr) minmax(0,.96fr);align-items:center;gap:clamp(20px,4vw,48px)}',
'#pf-auth-landing .pf-land-eyebrow{display:inline-flex;align-items:center;gap:7px;border:1px solid #68e4ca77;background:#183e4155;border-radius:100px;padding:8px 12px;color:#b4ffe6;font:800 11px system-ui,sans-serif;letter-spacing:.08em}',
'#pf-auth-landing h1{font:900 clamp(35px,6.5vw,68px)/.99 system-ui,sans-serif;letter-spacing:-.055em;color:#fff;max-width:650px;margin:20px 0 15px}',
'#pf-auth-landing h1 em{font-style:normal;background:linear-gradient(100deg,#82f6db,#a6b3ff,#cb7aff);background-clip:text;-webkit-background-clip:text;color:transparent}',
'#pf-auth-landing .pf-land-sub{color:#d4cee6;font:clamp(14px,2vw,17px)/1.6 system-ui,sans-serif;max-width:560px}',
'#pf-auth-landing .pf-land-actions{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0 17px}',
'#pf-auth-landing .pf-land-cta{border:0;border-radius:14px;padding:15px 19px;min-height:50px;background:linear-gradient(115deg,#8d50dd,#b662ef);color:#fff;font:850 14px system-ui,sans-serif;box-shadow:0 8px 30px #913bd433}',
'#pf-auth-landing .pf-land-cta-secondary{background:#272e4b;color:#eee7ff;border:1px solid #7a739f;box-shadow:none}',
'#pf-auth-landing .pf-land-mini{font:11px/1.4 system-ui,sans-serif;color:#b4accd;margin:0}',
'#pf-auth-landing .pf-land-preview{border:1px solid #8373b5;border-radius:25px;padding:clamp(15px,3.1vw,23px);background:linear-gradient(165deg,#2d2651,#18243e 70%);box-shadow:0 24px 65px #080b1b80;position:relative;max-width:440px;width:100%;box-sizing:border-box;justify-self:center}',
'#pf-auth-landing .pf-land-preview-head{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#d4e7ff;font:800 12px system-ui,sans-serif}',
'#pf-auth-landing .pf-land-preview-head strong{color:#9cffcf;font:900 12px system-ui,sans-serif}',
'#pf-auth-landing .pf-land-simulation{border:1px solid #9aeaca55;background:#173a3c6e;border-radius:15px;padding:15px;margin:17px 0 13px}',
'#pf-auth-landing .pf-land-simulation b{display:block;font:800 14px system-ui,sans-serif;color:#fff}',
'#pf-auth-landing .pf-land-simulation p{margin:6px 0 0;font:12px/1.5 system-ui,sans-serif;color:#c9efe6}',
'#pf-auth-landing .pf-land-goal-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;background:#121b33;border-radius:13px;padding:5px}',
'#pf-auth-landing .pf-land-goal-tabs button{padding:10px 5px;border-radius:9px;border:0;background:transparent;color:#c9c7dc;font:800 11px system-ui,sans-serif}',
'#pf-auth-landing .pf-land-goal-tabs button[aria-pressed="true"]{background:#683f9c;color:#fff}',
'#pf-auth-landing .pf-land-session{padding:13px 0;border-bottom:1px solid #ffffff1a;display:flex;align-items:center;gap:12px}',
'#pf-auth-landing .pf-land-session span:first-child{width:35px;height:35px;border-radius:12px;background:#7551a748;display:grid;place-items:center;font-size:19px}',
'#pf-auth-landing .pf-land-session p{margin:0;flex:1;color:#f3efff;font:750 12px/1.3 system-ui,sans-serif}',
'#pf-auth-landing .pf-land-session small{display:block;color:#acaecb;font:11px/1.6 system-ui,sans-serif}',
'#pf-auth-landing .pf-land-features{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px;margin-top:clamp(24px,5vw,44px)}',
'#pf-auth-landing .pf-land-feature{padding:17px;border:1px solid #60628780;border-radius:18px;background:#1b2440;min-width:0}',
'#pf-auth-landing .pf-land-feature>span{font-size:25px;display:block;margin-bottom:7px}',
'#pf-auth-landing .pf-land-feature strong{font:850 13px system-ui,sans-serif;display:block;margin:0 0 6px;color:#fff}',
'#pf-auth-landing .pf-land-feature p{font:11px/1.55 system-ui,sans-serif;margin:0;color:#c7c6de}',
'#pf-auth-landing .pf-land-tips{margin:23px 0 0;padding:20px;border:1px solid #6574a077;border-radius:20px;background:linear-gradient(120deg,#1d2943,#202241)}',
'#pf-auth-landing .pf-land-tips h2{font:850 clamp(19px,3vw,24px) system-ui,sans-serif;letter-spacing:-.03em;color:#f9f5ff;margin:0 0 10px}',
'#pf-auth-landing .pf-land-tips-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}',
'#pf-auth-landing .pf-land-tip{padding:12px;border-radius:13px;background:#ffffff0c;border:1px solid #ffffff1c}',
'#pf-auth-landing .pf-land-tip strong{display:block;color:#c0ffe0;font:800 12px system-ui,sans-serif}',
'#pf-auth-landing .pf-land-tip p{color:#c5c4dc;font:11px/1.55 system-ui,sans-serif;margin:6px 0 0}',
'@media(max-width:770px){#pf-auth-landing .pf-land-tips-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
'@media(max-width:420px){#pf-auth-landing .pf-land-tips-grid{grid-template-columns:1fr}}',
'#pf-auth-landing .pf-land-footer{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap;border-top:1px solid #65598490;padding-top:18px;margin-top:24px;color:#aaaaca;font:11px/1.55 system-ui,sans-serif}',
'#pf-account-lock .pf-auth-dialog:not(.pf-land){width:min(100%,450px);max-height:calc(100dvh - 32px);overflow:auto;background:linear-gradient(145deg,#2e2551,#171f3a);border:1px solid #8f7ac6;border-radius:24px}',
'#pf-account-lock .pf-auth-dialog:not(.pf-land):before{content:"✦ PULSOFIT AI";display:block;color:#b9ffec;font:900 12px system-ui,sans-serif;letter-spacing:.12em;margin-bottom:10px}',
'#pf-account-lock .pf-auth-dialog:not(.pf-land) h2{font-size:clamp(24px,5vw,31px);letter-spacing:-.04em}',
'#pf-account-lock .pf-auth-dialog:not(.pf-land) button{min-height:44px}',
'@media(max-width:770px){#pf-auth-landing .pf-land-cols{grid-template-columns:1fr}#pf-auth-landing .pf-land-preview{max-width:100%}#pf-auth-landing .pf-land-features{grid-template-columns:1fr 1fr}}',
'@media(max-width:440px){#pf-auth-landing{border-radius:19px}#pf-auth-landing .pf-land-brand img{width:36px;height:36px}#pf-auth-landing .pf-land-brand{font-size:13px}#pf-auth-landing .pf-land-features{grid-template-columns:1fr}#pf-auth-landing .pf-land-actions button{flex:1 1 100%}#pf-auth-landing .pf-land-navlogin{font-size:11px;padding:9px}}',
'@media(prefers-reduced-motion:reduce){#pf-auth-landing *{animation:none!important;transition:none!important}}',
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
 if(mode==="landing"){
  el.classList.add("pf-auth-landing-lock");
  el.innerHTML='<section id="pf-auth-landing" role="region" aria-label="Conheça o PulsoFit AI">'+
  '<nav class="pf-land-nav"><div class="pf-land-brand"><img src="/pulsofit-brand.svg" alt=""> PULSOFIT <span style="color:#86f3df">AI</span></div>'+
  '<button type="button" class="pf-land-navlogin" data-pf-auth-go="login">Já tenho conta</button></nav>'+
  '<div class="pf-land-cols"><div><div class="pf-land-eyebrow">✦ SUA EVOLUÇÃO COMEÇA AGORA</div>'+
  '<h1>Seu corpo.<br>Seu ritmo.<br><em>Seu próximo nível.</em></h1>'+
  '<p class="pf-land-sub">Treinos para casa, academia e CrossFit, Coach com inteligência artificial, análise do prato, metas e acompanhamento da sua evolução. Tudo organizado para você treinar com mais direção.</p>'+
  '<div class="pf-land-actions"><button class="pf-land-cta" type="button" data-pf-auth-go="register">Começar meus 7 dias grátis</button>'+
  '<button class="pf-land-cta pf-land-cta-secondary" type="button" data-pf-auth-go="login">Entrar na minha conta</button></div>'+
  '<p class="pf-land-mini">Crie sua conta gratuitamente. Os 7 dias de teste estão vinculados ao cadastro; sem pagamento automático.</p></div>'+
  '<div class="pf-land-preview"><div class="pf-land-preview-head"><span>✺ MEU PLANO INTELIGENTE</span><strong>EXEMPLO INTERATIVO</strong></div>'+
  '<section class="pf-land-simulation"><b>Uma jornada personalizada</b><p>Escolha onde prefere treinar para ver como o aplicativo organiza exemplos de treino.</p></section>'+
  '<div class="pf-land-goal-tabs" aria-label="Ver ambientes de treino">'+
  '<button type="button" data-pf-demo="casa" aria-pressed="true">Em casa</button>'+
  '<button type="button" data-pf-demo="academia" aria-pressed="false">Academia</button>'+
  '<button type="button" data-pf-demo="crossfit" aria-pressed="false">CrossFit</button></div>'+
  '<div id="pf-land-exercises"></div>'+
  '<p style="font-size:11px;color:#c5bddd;margin:13px 0 0">Exemplos ilustrativos. A indicação real depende de sua avaliação, experiência e limitações.</p></div></div>'+
  '<div class="pf-land-features">'+
  '<article class="pf-land-feature"><span>🧠</span><strong>Coach IA que orienta</strong><p>Converse sobre sua rotina e receba sugestões de métodos e progressão conforme os dados que informar.</p></article>'+
  '<article class="pf-land-feature"><span>📸</span><strong>Performance e alimentação</strong><p>Envie fotos com autorização para observações visuais e estimativas alimentares, com limites explicados.</p></article>'+
  '<article class="pf-land-feature"><span>📈</span><strong>Resultados que você acompanha</strong><p>Registre treinos, metas, peso voluntário e evolução. Compare sua consistência ao longo das semanas.</p></article>'+
  '</div><section class="pf-land-tips"><h2>O caminho para evoluir com segurança</h2><div class="pf-land-tips-grid">'+
  '<div class="pf-land-tip"><strong>01 • Defina um objetivo</strong><p>Registre seu ponto de partida, disponibilidade e experiência.</p></div>'+
  '<div class="pf-land-tip"><strong>02 • Crie consistência</strong><p>Comece com uma frequência que consiga manter e ajuste gradualmente.</p></div>'+
  '<div class="pf-land-tip"><strong>03 • Equilibre seus treinos</strong><p>Combine força, condicionamento, mobilidade e dias de recuperação.</p></div>'+
  '<div class="pf-land-tip"><strong>04 • Acompanhe os sinais</strong><p>Registre seus treinos, sua disposição e progresso; priorize sono e alimentação adequada.</p></div>'+
  '</div></section>'+
  '<footer class="pf-land-footer"><span>1. Crie sua conta → 2. Conte seu objetivo → 3. Receba orientação → 4. Salve seu progresso</span>'+
  '<span>Resultados individuais variam. O app não substitui avaliação profissional.</span></footer>'+
  '</section>';
  el.querySelectorAll("[data-pf-auth-go]").forEach(function(button){button.addEventListener("click",function(){show(button.dataset.pfAuthGo)})});
  var demos={
   casa:[["🏠","Força sem aparelhos","Agachamento, flexões adaptadas e ponte"],["⚡","Condicionamento","Circuito de movimentos com intensidade progressiva"],["🧘","Mobilidade","Alongamento leve e consciência corporal"]],
   academia:[["🏋️","Treino de força","Exercícios com máquinas e pesos ajustados"],["💪","Divisão muscular","Treinos por grupos com recuperação planejada"],["🚶","Condicionamento","Cardio de acordo com seu nível"]],
   crossfit:[["🔥","Movimento funcional","Técnica de agachar, puxar e empurrar"],["⏱️","Metcon adaptado","Circuitos com carga e tempo graduais"],["🧎","Recuperação ativa","Mobilidade, respiração e descanso"]]
  };
  function renderDemo(which){
   var list=el.querySelector("#pf-land-exercises");if(!list)return;
   list.replaceChildren();
   el.querySelectorAll("[data-pf-demo]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.pfDemo===which)));
   (demos[which]||demos.casa).forEach(function(item){
    var row=document.createElement("div");row.className="pf-land-session";
    var ico=document.createElement("span");ico.textContent=item[0];
    var txt=document.createElement("p");txt.textContent=item[1];
    var small=document.createElement("small");small.textContent=item[2];txt.appendChild(small);
    row.appendChild(ico);row.appendChild(txt);list.appendChild(row);
   });
  }
  el.querySelectorAll("[data-pf-demo]").forEach(function(b){b.addEventListener("click",function(){renderDemo(b.dataset.pfDemo)})});
  renderDemo("casa");
  return;
 }
 el.classList.remove("pf-auth-landing-lock");
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
 if(!current){valid=false;verifiedToken="";if(!document.getElementById("pf-auth-required-form")&&!document.getElementById("pf-auth-landing"))show("landing");return}
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