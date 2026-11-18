/* PulsoFit — onboarding obrigatório de conta, avaliação inicial e progresso por usuário.
 * A apresentação pode ser adiada, mas nunca inventa resultados e jamais salva dados sem consentimento.
 */
(function(){
"use strict";
if(window.__PULSO_FITNESS_ASSESSMENT_UI__)return;
window.__PULSO_FITNESS_ASSESSMENT_UI__=true;
var tokenSeen="",account=null,subscription=null,evaluation=null,progress=[],checked=false,loading=false,modal=null,activeTab="form",requesting=false,runId=0,lastLoaded=0;
var css=[
'#pf-eval-overlay{position:fixed!important;inset:0!important;z-index:2147483200!important;background:#07081aef!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:14px!important;box-sizing:border-box!important;overflow-y:auto!important;backdrop-filter:blur(11px)!important}',
'#pf-eval-overlay .pf-eval-shell{box-sizing:border-box;width:min(100%,780px);max-height:calc(100dvh - 28px);overflow-y:auto;border:1px solid #8b77c3;border-radius:23px;background:linear-gradient(150deg,#2b2450,#131d35 60%);color:white;padding:clamp(18px,4vw,32px);font:14px/1.5 system-ui,-apple-system,sans-serif;box-shadow:0 18px 60px #000b}',
'#pf-eval-overlay h2{font-size:clamp(23px,4.5vw,31px);line-height:1.17;margin:7px 0 12px;color:white}',
'#pf-eval-overlay h3{font-size:18px;margin:14px 0 10px;color:#d8e5ff}',
'#pf-eval-overlay p{color:#ded7ed;margin:8px 0}',
'#pf-eval-overlay .pf-eval-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
'#pf-eval-overlay .pf-eval-close{border:1px solid #8071a9;background:#383354;color:#fff;border-radius:50%;font-size:22px;min-width:37px;width:37px;height:37px;cursor:pointer}',
'#pf-eval-overlay .pf-eval-greeting{color:#b8ffe8;font-size:11px;font-weight:900;letter-spacing:.11em}',
'#pf-eval-overlay .pf-eval-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:17px 0;padding:4px;background:#111a30;border-radius:14px}',
'#pf-eval-overlay .pf-eval-tabs button{border:0;background:transparent;color:#d6d2f0;padding:10px 5px;border-radius:11px;cursor:pointer;font:800 12px system-ui,sans-serif}',
'#pf-eval-overlay .pf-eval-tabs button.active{background:#6635ab;color:#fff}',
'#pf-eval-overlay .pf-eval-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}',
'#pf-eval-overlay label.pf-eval-field{display:flex;flex-direction:column;gap:5px;color:#e6def4;font-size:12px;font-weight:800;margin-bottom:11px}',
'#pf-eval-overlay input:not([type=checkbox]),#pf-eval-overlay select,#pf-eval-overlay textarea{display:block;width:100%;min-width:0;box-sizing:border-box;border:1px solid #7a739a;background:#111b30;color:white;border-radius:11px;padding:12px;font:15px system-ui,sans-serif}',
'#pf-eval-overlay textarea{resize:vertical;min-height:76px}',
'#pf-eval-overlay .pf-eval-consent{display:flex;gap:10px;align-items:flex-start;padding:12px;background:#2d274d;border:1px solid #795f9f;border-radius:13px;font-size:12px;color:#e4dafa;margin:12px 0}',
'#pf-eval-overlay .pf-eval-consent input{height:19px;width:19px;flex:none;margin:2px 0 0;accent-color:#9d62e9}',
'#pf-eval-overlay .pf-eval-button{display:block;width:100%;border:0;padding:13px 14px;margin-top:12px;border-radius:12px;color:white;background:linear-gradient(105deg,#8239c7,#ab62ed);font:850 14px system-ui,sans-serif;cursor:pointer}',
'#pf-eval-overlay .pf-eval-button:disabled{opacity:.55;cursor:wait}',
'#pf-eval-overlay .pf-eval-secondary{background:#303655;border:1px solid #8076a4}',
'#pf-eval-overlay .pf-eval-status{min-height:23px;margin:12px 0;font-size:13px;color:#bffbd2}',
'#pf-eval-overlay .pf-eval-plan{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.7 system-ui,sans-serif;color:#f7f2ff;background:#141c34;border:1px solid #61578f;border-radius:15px;padding:18px;margin-top:12px;max-height:50dvh;overflow:auto}',
'#pf-eval-overlay .pf-eval-foot{color:#c9bfdc;font-size:11px;margin-top:13px}',
'#pf-eval-overlay .pf-eval-progress{list-style:none;padding:0;margin:13px 0;display:grid;gap:8px}',
'#pf-eval-overlay .pf-eval-progress li{background:#202946;border:1px solid #4f5b7c;border-radius:12px;padding:11px;display:flex;gap:8px;align-items:center;justify-content:space-between}',
'#pf-eval-overlay .pf-eval-progress li button{border:1px solid #806a9e;background:#322b4c;color:#ffe7ed;border-radius:8px;padding:7px;cursor:pointer}',
'#pf-eval-overlay .pf-eval-progress li small{font-size:11px;color:#d5cce5}',
'.pf-eval-launch{border:1px solid #9179d0!important;background:linear-gradient(120deg,#573097,#7e4db8)!important;color:white!important;border-radius:12px!important;padding:11px 14px!important;font:800 13px system-ui,sans-serif!important;cursor:pointer!important;min-height:43px;margin:12px 0!important}',
'.pf-online-identity-note{display:block;margin:9px 0;color:#a9fbe1;font:800 12px/1.45 system-ui,sans-serif}',
'@media(max-width:530px){#pf-eval-overlay .pf-eval-grid{grid-template-columns:1fr}#pf-eval-overlay .pf-eval-shell{max-height:calc(100dvh - 22px)}#pf-eval-overlay .pf-eval-tabs button{font-size:11px}}'
].join("\n");
function authToken(){try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}}
function accountIsReady(){return Boolean(authToken()&&!document.body.classList.contains("pf-account-locked"))}
function greet(){var h=new Date().getHours();return h<12?"Bom dia":h<18?"Boa tarde":"Boa noite"}
function firstName(){return String(account?.name||account?.fullName||"aluno").trim().split(/\s+/)[0].slice(0,50)||"aluno"}
function todayDate(){var d=new Date();var off=d.getTimezoneOffset()*60000;return new Date(d.getTime()-off).toISOString().slice(0,10)}
function fmt(v){if(!v)return"";var d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleDateString("pt-BR"):""}
function str(v){return v==null?"":String(v)}
function getPlanLabel(){
 if(!subscription)return null;
 if(subscription.planActive){
  var p=String(account?.plan||"").toLowerCase();
  return p==="quinzenal"?"Plano Quinzenal":p==="mensal"?"Plano Mensal":p==="premium"||p==="plus"?"Plano Premium":"Plano ativo";
 }
 return subscription.trialActive?"Teste grátis de 7 dias":"Teste grátis encerrado";
}
function getPlanExpiration(){
 if(!subscription)return null;
 if(subscription.planActive)return subscription.planExpiresAt?fmt(subscription.planExpiresAt):"Consultando vencimento";
 return subscription.trialEndsAt?fmt(subscription.trialEndsAt):"Consultando validade";
}
function textLeaves(root,oldValue,newValue){
 if(!root||newValue==null)return;
 var walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[],n;
 while((n=walk.nextNode()))if(n.nodeValue.trim()===oldValue)nodes.push(n);
 nodes.slice(0,15).forEach(function(t){if(t.nodeValue.trim()===oldValue)t.nodeValue=newValue});
}
function modifyAccountCard(){
 if(!accountIsReady()||!account)return;
 var app=document.getElementById("app");if(!app)return;
 var route=String(location.hash||"").replace(/^#\/?/,"").split("/")[0];
 if(route==="profile"){
  var cover=app.querySelector(".profile-cover");
  if(cover){
   textLeaves(cover,"Visitante",String(account.name||account.fullName||"Aluno"));
   var note=cover.querySelector(".pf-online-identity-note");
   if(!note){note=document.createElement("span");note.className="pf-online-identity-note";cover.appendChild(note)}
   var label=getPlanLabel();
   var noteLabel="✓ Conta online vinculada"+(label?" • "+label:"");
   if(note.textContent!==noteLabel)note.textContent=noteLabel;
  }
  // A rotina local também deixa "Visitante" dentro do campo de preferências.
  app.querySelectorAll("input").forEach(function(input){
   if(input.value.trim()==="Visitante"&&String(account.name||"").trim()){
    input.value=String(account.name).trim();
   }
  });
 }
 if(route==="account"||route==="profile"){
  var label=getPlanLabel(),expiration=getPlanExpiration();
  if(label){
   // O bloco nativo da conta mostra "Essencial / Não se aplica"
   // apesar de /api/subscription/status informar a validade da conta.
   textLeaves(app,"Essencial",label);
   textLeaves(app,"Não se aplica",expiration||"Consultando validade");
  }
  var targets=app.querySelectorAll(".profile-cover, .pro-surface, .pro-cols .pro-surface, .main");
  var anchor=route==="profile"?(app.querySelector(".profile-cover")||app.querySelector(".main")):(app.querySelector(".pro-cols .pro-surface")||app.querySelector(".main"));
  if(anchor&&!anchor.querySelector(".pf-eval-launch")){
   var btn=document.createElement("button");btn.type="button";btn.className="pf-eval-launch";btn.textContent="✦ Minha avaliação IA e progresso";
   btn.addEventListener("click",function(){openModal(evaluation?"plan":"form",false)});
   anchor.appendChild(btn);
  }
 }
}
async function api(url,options){
 var t=authToken();
 if(!t)throw Error("Entre na sua conta.");
 var res=await fetch(url,Object.assign({cache:"no-store",headers:{Authorization:"Bearer "+t}},options||{}));
 var data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||"Serviço temporariamente indisponível");
 return data;
}
function renderResultsNotice(){
 if(!evaluation)return "Sua avaliação será salva de forma privada e poderá ser atualizada depois.";
 if(evaluation.aiMethodology)return "Sua metodologia foi gerada pela IA e está salva nesta conta.";
 return "Dados salvos. Você poderá gerar uma orientação quando a IA estiver disponível.";
}
async function loadIdentity(){
 if(!accountIsReady()||loading)return;
 var t=authToken(),current=++runId;
 if(t===tokenSeen&&checked&&Date.now()-lastLoaded<30000)return;
 loading=true;tokenSeen=t;checked=false;
 try{
  var me=await api("/api/me");
  if(current!==runId||t!==authToken())return;
  account=me.user||me;
  var results=await Promise.allSettled([api("/api/fitness/assessment"),api("/api/subscription/status"),api("/api/fitness/progress")]);
  if(current!==runId||t!==authToken())return;
  var a=results[0],b=results[1],c=results[2];
  evaluation=a.status==="fulfilled"&&a.value.hasAssessment?a.value:null;
  subscription=b.status==="fulfilled"?b.value:null;
  progress=c.status==="fulfilled"&&Array.isArray(c.value.items)?c.value.items:[];
  checked=a.status==="fulfilled";
  lastLoaded=Date.now();
  modifyAccountCard();
  if(checked&&!evaluation&&!sessionStorage.getItem("pf-eval-dismissed-"+str(account.id)))openModal("form",true);
 }catch(e){checked=false;console.warn("[pulso-eval] Conta indisponível para avaliação.");}
 finally{loading=false}
}
function modalStatus(m){return m.querySelector("#pf-eval-status")}
function updateStatus(message){var s=modalStatus(modal||document);if(s)s.textContent=message}
function openModal(tab,automatic){
 if(!accountIsReady()||!account)return;
 if(modal&&modal.isConnected){switchTab(tab||activeTab);return}
 modal=document.createElement("div");modal.id="pf-eval-overlay";modal.setAttribute("role","presentation");
 modal.innerHTML='<section class="pf-eval-shell" role="dialog" aria-modal="true" aria-labelledby="pf-eval-title">'+
 '<div class="pf-eval-head"><div><span class="pf-eval-greeting" id="pf-eval-greeting"></span>'+
 '<h2 id="pf-eval-title">Sua jornada começa com você</h2></div>'+
 '<button class="pf-eval-close" type="button" aria-label="Fechar avaliação">×</button></div>'+
 '<p>Sou seu <strong>Coach IA PulsoFit</strong>. Quero entender seu ponto de partida para indicar uma metodologia de treino compatível com seus objetivos e sua rotina.</p>'+
 '<nav class="pf-eval-tabs" aria-label="Avaliação e progresso">'+
 '<button type="button" data-pf-eval-tab="form">Avaliação</button>'+
 '<button type="button" data-pf-eval-tab="plan">Método da IA</button>'+
 '<button type="button" data-pf-eval-tab="progress">Progresso</button></nav>'+
 '<div id="pf-eval-content"></div>'+
 '<p class="pf-eval-status" id="pf-eval-status" role="status" aria-live="polite"></p>'+
 '<p class="pf-eval-foot">As sugestões da IA são educacionais e não substituem orientação individual de um profissional. Seus dados ficam vinculados à sua conta; você pode excluir a avaliação.</p>'+
 '</section>';
 document.body.appendChild(modal);
 modal.querySelector("#pf-eval-greeting").textContent=greet()+", "+firstName()+"! ✨";
 modal.querySelector(".pf-eval-close").addEventListener("click",function(){
  if(account?.id){try{sessionStorage.setItem("pf-eval-dismissed-"+account.id,"1")}catch{}}
  closeModal();
 });
 modal.querySelectorAll("[data-pf-eval-tab]").forEach(function(btn){btn.addEventListener("click",function(){switchTab(btn.dataset.pfEvalTab)})});
 modal.addEventListener("click",function(e){if(e.target===modal){if(account?.id){try{sessionStorage.setItem("pf-eval-dismissed-"+account.id,"1")}catch{}}closeModal()}});
 switchTab(tab||"form");
 if(automatic&&!evaluation)updateStatus("Preencha o seu perfil inicial para receber uma metodologia personalizada.");
}
function closeModal(){if(modal)modal.remove();modal=null;requesting=false}
function switchTab(tab){
 if(!modal)return;
 activeTab=tab;modal.querySelectorAll("[data-pf-eval-tab]").forEach(b=>b.classList.toggle("active",b.dataset.pfEvalTab===tab));
 var content=modal.querySelector("#pf-eval-content");
 if(tab==="form")renderForm(content);else if(tab==="plan")renderPlan(content);else renderProgress(content);
 updateStatus("");
}
function renderForm(content){
 var v=evaluation?.answers||{};
 content.innerHTML='<form id="pf-eval-form" autocomplete="on">'+
 '<h3>Conhecendo seu corpo e sua rotina</h3><p>Estas respostas vão orientar a IA. Não é necessário enviar foto nesta avaliação.</p>'+
 '<div class="pf-eval-grid">'+
 '<label class="pf-eval-field">Peso atual (kg)<input name="weightKg" type="number" inputmode="decimal" min="20" max="350" step="0.1" required placeholder="Ex.: 74,5"></label>'+
 '<label class="pf-eval-field">Altura (cm)<input name="heightCm" type="number" inputmode="numeric" min="100" max="240" step="1" required placeholder="Ex.: 175"></label>'+
 '<label class="pf-eval-field">Idade (opcional)<input name="ageYears" type="number" inputmode="numeric" min="13" max="100" step="1" placeholder="Não é obrigatório"></label>'+
 '<label class="pf-eval-field">Objetivo principal<select name="goal" required>'+
 '<option value="condicionamento">Melhorar o condicionamento</option>'+
 '<option value="massa_muscular">Ganhar massa muscular</option>'+
 '<option value="emagrecimento_saudavel">Reduzir medidas com saúde</option>'+
 '<option value="forca">Ganhar força</option>'+
 '<option value="mobilidade">Mobilidade e postura</option>'+
 '<option value="bem_estar">Mais bem-estar e atividade</option>'+
 '<option value="resistencia">Melhorar resistência</option></select></label>'+
 '<label class="pf-eval-field">Onde vai treinar?<select name="place" required>'+
 '<option value="casa">Em casa</option><option value="academia">Na academia</option><option value="crossfit">CrossFit / box</option><option value="misto">Ambientes variados</option></select></label>'+
 '<label class="pf-eval-field">Seu nível de experiência<select name="level" required>'+
 '<option value="iniciante">Iniciante</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option></select></label>'+
 '<label class="pf-eval-field">Dias disponíveis por semana<input name="daysPerWeek" type="number" inputmode="numeric" min="1" max="7" required placeholder="Ex.: 3"></label>'+
 '<label class="pf-eval-field">Minutos disponíveis por treino<input name="sessionMinutes" type="number" inputmode="numeric" min="15" max="180" step="5" required placeholder="Ex.: 45"></label></div>'+
 '<label class="pf-eval-field">Algum exercício que você quer evitar ou limitação de movimento? (opcional)<textarea name="limitations" maxlength="400" rows="3" placeholder="Ex.: prefiro exercícios sem saltos. Evite dados médicos detalhados."></textarea></label>'+
 '<label class="pf-eval-consent"><input name="consent" type="checkbox" required>'+
 '<span>Autorizo o PulsoFit a armazenar estes dados na minha conta e enviá-los à IA Gemini para personalizar meus treinos. Posso refazer ou excluir a avaliação depois.</span></label>'+
 '<button class="pf-eval-button" type="submit">✦ Salvar avaliação e criar metodologia com IA</button>'+
 '<button class="pf-eval-button pf-eval-secondary" type="button" id="pf-eval-later">Fazer mais tarde</button></form>';
 var form=content.querySelector("form");
 ["weightKg","heightCm","ageYears","goal","place","level","daysPerWeek","sessionMinutes","limitations"].forEach(function(k){if(v[k]!=null&&form.elements[k])form.elements[k].value=str(v[k])});
 content.querySelector("#pf-eval-later").addEventListener("click",function(){
  if(account?.id){try{sessionStorage.setItem("pf-eval-dismissed-"+account.id,"1")}catch{}}
  closeModal();
 });
 form.addEventListener("submit",async function(ev){
  ev.preventDefault();if(requesting)return;
  var d={weightKg:Number(form.elements.weightKg.value),heightCm:Number(form.elements.heightCm.value),
   ageYears:form.elements.ageYears.value?Number(form.elements.ageYears.value):null,
   goal:form.elements.goal.value,place:form.elements.place.value,level:form.elements.level.value,
   daysPerWeek:Number(form.elements.daysPerWeek.value),sessionMinutes:Number(form.elements.sessionMinutes.value),
   limitations:form.elements.limitations.value.trim(),consent:form.elements.consent.checked};
  if(!d.consent){updateStatus("Para salvar, autorize o uso dos dados na sua conta.");return}
  requesting=true;var btn=form.querySelector('[type="submit"]');btn.disabled=true;
  updateStatus("Salvando avaliação e solicitando sua metodologia ao Coach IA...");
  try{
   var response=await api("/api/fitness/assessment",{method:"POST",headers:{"Authorization":"Bearer "+authToken(),"Content-Type":"application/json"},body:JSON.stringify(d)});
   evaluation={answers:response.answers,aiMethodology:response.aiMethodology||null,hasAssessment:true};
   if(account?.id){try{sessionStorage.removeItem("pf-eval-dismissed-"+account.id)}catch{}}
   // Register the starting weight as a progress entry only when the user
   // explicitly submits the assessment; avoid duplicates on re-evaluation.
   if(!progress.length)try{
    await api("/api/fitness/progress",{method:"POST",headers:{"Authorization":"Bearer "+authToken(),"Content-Type":"application/json"},body:JSON.stringify({weightKg:d.weightKg,date:todayDate(),note:"Avaliação inicial"})});
    await reloadProgress();
   }catch{}
   switchTab("plan");
   updateStatus(response.aiError?"Avaliação salva. "+response.aiError:"Sua avaliação e metodologia foram salvas! Você pode acompanhar sua evolução.");
  }catch(e){updateStatus("Não foi possível salvar: "+str(e.message));btn.disabled=false}
  finally{requesting=false}
 });
}
function renderPlan(content){
 if(!evaluation){
  content.innerHTML='<h3>Metodologia personalizada</h3><p>Complete sua avaliação inicial para receber um plano de treinos criado pela IA, com duração e dias ajustados à sua rotina.</p><button class="pf-eval-button" id="pf-go-to-evaluation">Começar avaliação</button>';
  content.querySelector("#pf-go-to-evaluation").addEventListener("click",()=>switchTab("form"));return;
 }
 content.innerHTML='<h3>Seu método de treinamento</h3><p id="pf-eval-result-info"></p>'+
 '<div id="pf-eval-ai-report" class="pf-eval-plan"></div>'+
 '<button class="pf-eval-button" id="pf-eval-regenerate" type="button">✦ Gerar nova orientação com IA</button>'+
 '<button class="pf-eval-button pf-eval-secondary" id="pf-eval-record" type="button">Registrar meu progresso</button>';
 content.querySelector("#pf-eval-result-info").textContent=renderResultsNotice();
 content.querySelector("#pf-eval-ai-report").textContent=evaluation.aiMethodology||
  "Sua avaliação foi salva. A IA não devolveu uma metodologia completa nesta tentativa. Você pode solicitar outra orientação, sem perder os dados.";
 content.querySelector("#pf-eval-record").addEventListener("click",()=>switchTab("progress"));
 content.querySelector("#pf-eval-regenerate").addEventListener("click",async function(){
  if(requesting)return;requesting=true;this.disabled=true;updateStatus("Coach IA preparando sua metodologia...");
  try{
   var d=await api("/api/fitness/assessment/plan",{method:"POST",headers:{"Authorization":"Bearer "+authToken(),"Content-Type":"application/json"},body:"{}"});
   evaluation.aiMethodology=d.aiMethodology;renderPlan(content);updateStatus("Nova metodologia salva na sua conta.");
  }catch(e){updateStatus("Não foi possível gerar orientação: "+str(e.message));this.disabled=false}
  finally{requesting=false}
 });
}
async function reloadProgress(){
 try{var d=await api("/api/fitness/progress");progress=Array.isArray(d.items)?d.items:[]}
 catch{progress=[]}
}
function renderProgress(content){
 content.innerHTML='<h3>Meu progresso</h3><p>Registre seu peso voluntariamente e anotações sobre força, energia, disposição ou constância. Nenhuma foto é necessária.</p>'+
 '<form id="pf-eval-progress-form"><div class="pf-eval-grid">'+
 '<label class="pf-eval-field">Peso atual (kg)<input name="weightKg" type="number" inputmode="decimal" min="20" max="350" step="0.1" required></label>'+
 '<label class="pf-eval-field">Data<input name="date" type="date" required></label></div>'+
 '<label class="pf-eval-field">Como foi sua evolução? (opcional)<textarea name="note" rows="2" maxlength="300" placeholder="Ex.: melhorei a resistência, completei 3 treinos nesta semana"></textarea></label>'+
 '<button type="submit" class="pf-eval-button">Salvar novo progresso</button></form>'+
 '<div id="pf-eval-progress-summary"></div><ul class="pf-eval-progress" id="pf-eval-progress-list"></ul>'+
 '<button class="pf-eval-button pf-eval-secondary" type="button" id="pf-eval-clear">Excluir avaliação e histórico</button>';
 var form=content.querySelector("#pf-eval-progress-form");
 form.elements.date.value=todayDate();
 form.elements.weightKg.value=progress.length?str(progress[0].weightKg):str(evaluation?.answers?.weightKg||"");
 drawProgress(content);
 form.addEventListener("submit",async function(e){
  e.preventDefault();if(requesting)return;requesting=true;var btn=form.querySelector('[type="submit"]');btn.disabled=true;
  updateStatus("Salvando seu progresso...");
  try{
   await api("/api/fitness/progress",{method:"POST",headers:{"Authorization":"Bearer "+authToken(),"Content-Type":"application/json"},
    body:JSON.stringify({weightKg:Number(form.elements.weightKg.value),date:form.elements.date.value,note:form.elements.note.value})});
   await reloadProgress();renderProgress(content);updateStatus("Seu progresso foi registrado e vinculado à sua conta.");
  }catch(err){updateStatus("Não foi possível salvar o progresso: "+str(err.message));btn.disabled=false}
  finally{requesting=false}
 });
 content.querySelector("#pf-eval-clear").addEventListener("click",async function(){
  if(!confirm("Deseja excluir a avaliação, a metodologia da IA e TODO o histórico de progresso desta conta?"))return;
  if(requesting)return;requesting=true;
  try{
   await api("/api/fitness/assessment",{method:"DELETE"});
   evaluation=null;progress=[];renderForm(content);activeTab="form";modal.querySelectorAll("[data-pf-eval-tab]").forEach(b=>b.classList.toggle("active",b.dataset.pfEvalTab==="form"));
   updateStatus("Seus dados de avaliação e histórico foram excluídos.");
  }catch(e){updateStatus("Não foi possível excluir: "+str(e.message))}
  finally{requesting=false}
 });
}
function drawProgress(root){
 var ul=root.querySelector("#pf-eval-progress-list"),head=root.querySelector("#pf-eval-progress-summary");
 if(!ul||!head)return;
 ul.replaceChildren();head.replaceChildren();
 if(!progress.length){head.textContent="Ainda não há registros de evolução. Comece com seu peso atual.";return}
 var oldest=progress[progress.length-1],newest=progress[0];
 var delta=(Number(newest.weightKg)-Number(oldest.weightKg));
 var desc=document.createElement("p");desc.textContent="Registros: "+progress.length+
  " • Último peso informado: "+Number(newest.weightKg).toLocaleString("pt-BR",{maximumFractionDigits:1})+
  " kg"+(progress.length>1?" • Variação no período: "+(delta>0?"+":"")+delta.toLocaleString("pt-BR",{maximumFractionDigits:1})+" kg":"");
 head.appendChild(desc);
 progress.slice(0,30).forEach(function(item){
  var li=document.createElement("li"),div=document.createElement("div"),strong=document.createElement("strong"),sm=document.createElement("small"),btn=document.createElement("button");
  strong.textContent=Number(item.weightKg).toLocaleString("pt-BR",{maximumFractionDigits:1})+" kg • "+fmt(item.date+"T12:00:00");
  sm.textContent=item.note||"Registro de evolução";
  div.appendChild(strong);div.appendChild(document.createElement("br"));div.appendChild(sm);
  btn.textContent="Excluir";btn.setAttribute("aria-label","Excluir este registro de progresso");
  btn.addEventListener("click",async function(){
   if(!confirm("Excluir este registro de progresso?"))return;
   try{await api("/api/fitness/progress?id="+encodeURIComponent(item.id),{method:"DELETE"});await reloadProgress();renderProgress(root);updateStatus("Registro excluído.")}
   catch(e){updateStatus("Não foi possível excluir: "+str(e.message))}
  });
  li.appendChild(div);li.appendChild(btn);ul.appendChild(li);
 });
}
function observe(){
 var style=document.getElementById("pf-eval-css");
 if(!style){style=document.createElement("style");style.id="pf-eval-css";style.textContent=css;(document.head||document.documentElement).appendChild(style)}
 if(!accountIsReady()){
  if(authToken()!==tokenSeen){tokenSeen="";account=null;subscription=null;evaluation=null;progress=[];checked=false;runId++}
  return;
 }
 if(authToken()!==tokenSeen||(checked&&Date.now()-lastLoaded>=30000))void loadIdentity();
 modifyAccountCard();
}
function boot(){
 var app=document.getElementById("app");
 if(app){
  var pending=false;new MutationObserver(function(){
   if(pending)return;pending=true;requestAnimationFrame(function(){pending=false;modifyAccountCard()});
  }).observe(app,{childList:true,subtree:true});
 }
 window.addEventListener("pulso-auth-ready",function(){tokenSeen="";checked=false;observe()});
 window.addEventListener("hashchange",observe);
 window.addEventListener("pageshow",observe);
 setInterval(observe,2600);
 observe();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
else boot();
})();