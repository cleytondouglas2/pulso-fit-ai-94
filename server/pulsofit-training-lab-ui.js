/* PulsoFit AI • Treino Vivo. Sessões adaptáveis e registro autenticado.
 * Conteúdo educativo. Nenhuma prescrição clínica nem contagem calórica inventada.
 * Preserva a rota nativa de Treinos e o menu Mais.
 */
(function(){
"use strict";
if(window.__PULSO_TREINO_VIVO_UI__)return;
window.__PULSO_TREINO_VIVO_UI__=true;
var root=null,session=null,history=[],loading=false,saving=false,timerId=null,seconds=0,playing=false;
var currentView="builder",lastAccount="",scheduled=false;
var styles=[
 ["express","⚡","Treino Expresso","Força e movimento em poucos minutos"],
 ["strength","💪","Força Progressiva","Padrões de movimento para evoluir com segurança"],
 ["mobility","🧘","Mobilidade 360","Articulações e amplitude de movimento"],
 ["quiet_cardio","🌙","Cardio Silencioso","Movimente-se sem saltos e sem barulho"],
 ["core","🎯","Core Estável","Estabilidade e controle de tronco"],
 ["recovery","🌿","Recuperação Ativa","Rotina leve de movimento"],
 ["walk_run","🚶","Caminhada + Corrida","Alternância gradual conforme seu nível"],
 ["functional","🔄","Circuito Funcional","Força, coordenação e condicionamento"],
 ["low_impact","🦶","Baixo Impacto","Condicionamento com movimentos controlados"],
 ["athletic","🏃","Agilidade Consciente","Coordenação, força e movimentos variados"]
];
var styleMap=new Map(styles.map(x=>[x[0],x]));
var gears={none:"Sem equipamento",band:"Faixa elástica",dumbbell:"Halteres",machine:"Máquina",mat:"Colchonete",step:"Degrau",bar:"Barra",outdoors:"Espaço ao ar livre"};
var items=[
 // id,name,group,gear,impact,noise,description,modification
 ["march","Marcha confortável no lugar","warm cardio","none",0,0,"Marche com passos leves, tronco ereto e ritmo no qual consiga conversar.","Reduza a velocidade ou faça sentado."],
 ["shoulder_roll","Círculos de ombro","warm mobility","none",0,0,"Eleve, leve para trás e abaixe os ombros em círculos suaves; inverta o sentido.","Faça círculos menores."],
 ["arm_swing","Balanço controlado de braços","warm mobility","none",0,0,"Balance os braços à frente e para trás sem forçar os ombros.","Diminua a amplitude."],
 ["ankle_pump","Mobilização de tornozelos","warm mobility","none",0,0,"Em pé com apoio ou sentado, alterne ponta do pé e calcanhar.","Faça sentado."],
 ["side_step","Passo lateral","warm cardio","none",0,0,"Dê um passo para o lado e aproxime o outro pé, sem saltar.","Use apoio em uma parede."],
 ["hip_circle","Círculos pequenos de quadril","warm mobility","none",0,0,"Em pé, faça círculos lentos com o quadril, sem forçar a lombar.","Reduza o círculo."],
 ["chair_squat","Sentar e levantar de cadeira","squat strength","none",0,0,"Use uma cadeira firme. Sente devagar e levante empurrando o chão com os pés.","Use cadeira mais alta e apoio para as mãos."],
 ["body_squat","Agachamento livre","squat strength","none",0,0,"Pés confortáveis, flexione joelhos e quadris até onde controlar; retorne sem prender a respiração.","Agache até tocar uma cadeira."],
 ["goblet_squat","Agachamento com halter","squat strength","dumbbell",0,0,"Segure um halter junto ao peito e agache mantendo o tronco estável.","Troque pelo agachamento livre."],
 ["leg_press","Leg press controlado","squat strength","machine",0,0,"Ajuste o aparelho, pressione sem estender os joelhos abruptamente; retorne devagar.","Reduza a carga e a amplitude."],
 ["box_step","Subida em degrau baixo","squat cardio","step",0,0,"Suba em um degrau estável e baixo, desça com controle, alternando pernas.","Use degrau menor com apoio."],
 ["split_squat","Afundo estático assistido","squat strength","none",0,0,"Com uma mão apoiada, pés afastados, flexione ligeiramente ambos os joelhos e suba.","Segure apoio e diminua a amplitude."],
 ["wall_push","Flexão de braços na parede","push strength","none",0,0,"Apoie mãos na parede à altura do peito e aproxime o tronco em linha reta; empurre de volta.","Aproxime os pés da parede."],
 ["incline_push","Flexão em superfície elevada firme","push strength","none",0,0,"Mãos sobre bancada estável e fixa; flexione cotovelos com o corpo alinhado e empurre.","Use parede no lugar."],
 ["floor_push","Flexão de braços no chão","push strength","mat",0,0,"Mãos um pouco além dos ombros, desça controlado mantendo o tronco estável.","Faça com os joelhos apoiados ou na parede."],
 ["dumbbell_press","Supino com halteres","push strength","dumbbell",0,0,"Em banco estável, desça halteres lentamente e empurre sem bater os pesos.","Use halteres leves ou flexão na parede."],
 ["machine_chest","Empurrar no aparelho peitoral","push strength","machine",0,0,"Ajuste banco e pegadas, empurre sem travar cotovelos, retorne controlado.","Reduza a carga."],
 ["band_row","Remada com faixa","pull strength","band",0,0,"Segure a faixa de modo seguro, puxe cotovelos para trás mantendo ombros baixos.","Use uma faixa com menor resistência."],
 ["dumbbell_row","Remada unilateral com halter","pull strength","dumbbell",0,0,"Apoie uma mão em banco firme e puxe o halter perto da costela, sem girar o tronco.","Use peso menor."],
 ["cable_row","Remada sentada na máquina","pull strength","machine",0,0,"Sente com coluna neutra e puxe as alças para o tronco; retorne sem soltar a tensão de repente.","Reduza a carga."],
 ["wall_pull","Retração das escápulas","pull mobility","none",0,0,"Em pé, braços à frente, leve os cotovelos para trás aproximando suavemente as escápulas.","Mantenha braços mais baixos."],
 ["hip_hinge","Inclinação de quadril sem peso","hinge strength","none",0,0,"Empurre o quadril para trás com joelhos semiflexionados e volte contraindo os glúteos.","Use parede como referência do quadril."],
 ["glute_bridge","Ponte de glúteos","hinge core","mat",0,0,"Deite de costas com joelhos dobrados, eleve o quadril sem arquear excessivamente a lombar.","Eleve menos o quadril."],
 ["dumbbell_deadlift","Levantamento romeno leve","hinge strength","dumbbell",0,0,"Com halteres junto às pernas, leve quadril para trás, costas estáveis e volte.","Faça sem peso primeiro."],
 ["machine_hamstring","Flexão de joelhos na máquina","hinge strength","machine",0,0,"Ajuste o aparelho e dobre os joelhos devagar, sem tirar o quadril do banco.","Reduza a carga."],
 ["calf_raise","Elevação de panturrilhas","strength cardio","none",0,0,"Com apoio, suba na ponta dos pés e desça devagar, sem balançar.","Faça sentado."],
 ["dead_bug","Dead bug controlado","core","mat",0,0,"De costas, alterne estender braço e perna opostos mantendo lombar confortável.","Mova apenas os braços."],
 ["bird_dog","Braço e perna opostos","core mobility","mat",0,0,"Em quatro apoios, estenda braço e perna opostos sem girar o quadril.","Estenda apenas uma extremidade."],
 ["side_plank","Prancha lateral adaptada","core","mat",0,0,"Apoie antebraço e joelhos, eleve o quadril mantendo alinhamento.","Mantenha quadril baixo por menos tempo."],
 ["forearm_plank","Prancha de antebraço","core","mat",0,0,"Apoie antebraços e joelhos ou pontas dos pés; mantenha o abdômen firme sem prender o ar.","Faça com os joelhos no chão."],
 ["standing_knee","Elevação alternada de joelhos","core cardio","none",0,0,"Eleve um joelho de cada vez com o tronco alto, controlando o equilíbrio.","Use apoio e eleve menos."],
 ["pallof_band","Pressão antirrotação com faixa","core","band",0,0,"Com faixa presa em ponto seguro ao lado, empurre as mãos à frente e evite girar o tronco.","Use menos tensão na faixa."],
 ["standing_twist","Rotação de tronco leve","core mobility","none",0,0,"Gire suavemente o tórax para cada lado mantendo os pés estáveis.","Diminua a amplitude."],
 ["incline_walk","Caminhada vigorosa leve","walk cardio","outdoors",0,0,"Caminhe em ritmo confortável a moderado, observando a respiração.","Reduza o ritmo ou o percurso."],
 ["walk_easy","Caminhada tranquila","walk recover","outdoors",0,0,"Caminhe em terreno seguro em ritmo de conversa.","Faça voltas menores."],
 ["walk_interval","Caminhada com mudança de ritmo","walk cardio","outdoors",0,0,"Alterne passos confortáveis com passos ligeiramente mais rápidos; mantenha controle.","Aumente apenas a cadência dos braços."],
 ["easy_jog","Trote leve opcional","walk cardio","outdoors",1,1,"Em terreno adequado, trote devagar sem buscar velocidade. Pare se houver desconforto.","Troque por caminhada rápida."],
 ["indoor_walk","Passos em circuito pequeno","walk cardio","none",0,0,"Caminhe em pequenos trajetos livres de obstáculos.","Marche parado."],
 ["step_taps","Toques alternados no degrau","cardio","step",0,0,"Toque o degrau baixo alternando os pés sem subir completamente.","Toque uma marca no chão."],
 ["shadow_box","Boxe sem impacto e sem saltos","cardio","none",0,0,"Faça socos leves no ar alternando lados, mantendo os cotovelos confortáveis.","Reduza amplitude e velocidade."],
 ["heel_dig","Calcanhares à frente alternados","cardio","none",0,0,"Toque o calcanhar à frente com a ponta do pé elevada, alternando as pernas.","Faça segurando apoio."],
 ["skater_step","Passo lateral estilo patinador","cardio","none",0,0,"Dê passos laterais amplos sem saltar, controlando a transferência de peso.","Dê passos curtos."],
 ["squat_pulse","Agachamento parcial ritmado","cardio squat","none",0,0,"Faça agachamentos rasos controlados, sem movimentos bruscos.","Toque uma cadeira a cada repetição."],
 ["low_jack","Polichinelo sem salto","cardio","none",0,0,"Abra um pé por vez enquanto eleva os braços de forma confortável.","Mantenha os braços abaixo dos ombros."],
 ["jump_jack","Polichinelo com salto opcional","cardio","none",1,1,"Abra e feche pés em pequenos saltos, pousando com suavidade.","Troque pelo polichinelo sem salto."],
 ["mountain_walk","Escalador lento em bancada","core cardio","none",0,0,"Mãos sobre superfície firme, alternando joelhos em direção ao peito sem correr.","Apoie as mãos numa parede."],
 ["high_knee","Marcha alta rápida","cardio","none",1,1,"Eleve os joelhos alternadamente em cadência mais intensa sem perder alinhamento.","Use marcha confortável."],
 ["hip_open","Abertura suave de quadril","mobility","none",0,0,"Com apoio, eleve um joelho e faça abertura suave do quadril, sem forçar.","Faça sentado."],
 ["thoracic_rotate","Rotação torácica em quatro apoios","mobility","mat",0,0,"Em quatro apoios, uma mão atrás da cabeça; gire o peito suavemente para o lado.","Faça sentado com braços cruzados."],
 ["cat_cow","Gato e vaca lentos","mobility recover","mat",0,0,"Em quatro apoios, alterne arredondar e estender suavemente a coluna.","Faça sentado."],
 ["wall_slide","Deslizamento de braços na parede","mobility recover","none",0,0,"Encoste as costas confortavelmente na parede e deslize os braços para cima dentro da amplitude confortável.","Levante menos os braços."],
 ["neck_relax","Relaxamento lateral do pescoço","recover mobility","none",0,0,"Incline a cabeça suavemente para cada lado sem puxar com as mãos.","Use movimento menor."],
 ["breathing","Respiração confortável e calma","recover","none",0,0,"Respire de forma natural e lenta, sem prender o ar, relaxando os ombros.","Faça sentado em posição confortável."],
 ["seated_march","Marcha sentada","recover cardio","none",0,0,"Sentado em cadeira firme, alterne elevar os pés e movimente os braços.","Diminua a velocidade."],
 ["hamstring_glide","Deslizamento leve de posterior","mobility recover","none",0,0,"Sentado, estenda um joelho confortavelmente e retorne, alternando.","Reduza a extensão."],
 ["quad_stretch","Alongamento de quadríceps com apoio","mobility recover","none",0,0,"Em pé com apoio, dobre um joelho e segure o pé se alcançar sem desconforto.","Use movimento sem segurar o pé."],
 ["calf_stretch","Alongamento de panturrilha na parede","recover mobility","none",0,0,"Uma perna atrás, calcanhar apoiado, avance suavemente o corpo.","Aproxime a perna de trás."],
 ["back_relax","Postura confortável de descanso","recover","mat",0,0,"Deite de costas com joelhos flexionados, respirando naturalmente.","Apoie as pernas sobre uma cadeira."],
 ["balance_touch","Equilíbrio com apoio","mobility core","none",0,0,"Com uma mão em apoio firme, permaneça em um pé por alguns segundos; troque.","Mantenha a ponta do outro pé no chão."],
 ["band_press","Empurrar faixa à frente","push strength","band",0,0,"Segure a faixa de forma segura ao redor das costas e estenda os braços à frente.","Use faixa mais leve."],
 ["band_pull","Puxada de faixa na frente do peito","pull strength","band",0,0,"Abra os braços puxando a faixa com controle, sem elevar os ombros.","Afaste menos as mãos."],
 ["dumbbell_carry","Caminhada curta carregando halteres","functional core","dumbbell",0,0,"Caminhe devagar segurando halteres leves ao lado do corpo sem inclinar o tronco.","Use menos peso ou nenhum."],
 ["step_reach","Passo lateral com alcance","functional cardio","none",0,0,"Dê um passo lateral e alcance com o braço oposto em direção à frente.","Passo menor e alcance mais baixo."],
 ["sit_reach","Sentar, levantar e alcançar","functional squat","none",0,0,"Levante de uma cadeira firme e estenda as mãos à frente, sem perder equilíbrio.","Use apoio para levantar."],
 ["fast_feet","Passinhos rápidos sem salto","functional cardio","none",1,1,"Faça passos leves e curtos em ritmo rápido no local, controlando a respiração.","Reduza a velocidade ou marche."],
 ["single_balance","Passo com equilíbrio","functional core","none",0,0,"Dê um passo à frente, pause brevemente e volte com controle.","Segure apoio."],
 ["seated_reach","Alcance alternado sentado","recover mobility","none",0,0,"Sentado em cadeira firme, estenda o braço para frente sem forçar.","Alcance menos distante."],
 ["decline_pushup","Flexão declinada (peito)","push strength","step",0,0,"Com pés sobre plataforma baixa e firme, mãos no solo, desça controlado sem forçar a lombar. Exige nível intermediário/avançado.","Faça flexão inclinada na parede ou bancada estável."],
 ["diamond_pushup","Flexão diamante (peito e tríceps)","push strength","none",0,0,"Aproxime as mãos sob o peito em posição confortável; flexione os cotovelos sem forçar os punhos e retorne.","Afaste as mãos ou faça flexão na parede."],
 ["pseudo_planche","Flexão pseudo planche (peito, ombros e core)","push strength","none",0,0,"Avance gradualmente os ombros sobre as mãos e faça flexão curta com tronco estável. Exige preparo de punhos e ombros.","Faça flexão tradicional ou inclinada."],
 ["bulgarian_squat","Agachamento búlgaro (pernas)","squat strength","step",0,0,"Com o pé de trás apoiado em banco baixo e firme, desça com controle e apoio para equilíbrio, mantendo o joelho da frente alinhado.","Faça afundo estático com ambos os pés no chão."],
 ["nordic_curl","Flexão nórdica assistida (posterior de coxa)","hinge strength","mat",0,0,"Ajoelhado em base acolchoada e tornozelos fixados em suporte seguro, incline o tronco devagar, amparando a descida com as mãos. Não improvise ancoragem.","Faça ponte de glúteos ou flexão de joelhos na máquina."],
 ["chinup_supinated","Barra fixa supinada (bíceps e costas)","pull strength","bar",0,0,"Em barra fixa firmemente instalada, palmas voltadas para si, puxe sem balanço e desça com controle. Confira a fixação.","Use barra assistida ou remada com faixa."]
];
var byId=new Map(items.map(x=>[x[0],x]));
var recipes={
 express:["warm","squat","push","hinge","core","recover"],
 strength:["warm","squat","push","pull","hinge","core","recover"],
 mobility:["warm","mobility","mobility","mobility","core","recover"],
 quiet_cardio:["warm","cardio","cardio","core","cardio","recover"],
 core:["warm","core","core","hinge","core","recover"],
 recovery:["warm","recover","mobility","recover","mobility","recover"],
 walk_run:["warm","walk","walk","cardio","walk","recover"],
 functional:["warm","functional","squat","hinge","push","cardio","recover"],
 low_impact:["warm","cardio","squat","core","mobility","recover"],
 athletic:["warm","functional","squat","cardio","hinge","core","recover"]
};
var opts={style:"express",place:"home",level:"beginner",energy:"medium",minutes:15,gear:"none",lowImpact:true,quiet:false};
var sleepMessage="";
function token(){try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}}
function logged(){return Boolean(token()&&!document.body.classList.contains("pf-account-locked"))}
function safe(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function by(key){return document.getElementById(key)}
function validExercise(e){
 if(opts.lowImpact&&e[4])return false;
 if(opts.quiet&&e[5])return false;
 if(opts.energy==="low"&&(e[4]||e[5]))return false;
 if(opts.level==="beginner"&&(e[0]==="easy_jog"||e[0]==="fast_feet"||e[0]==="jump_jack"||
  ["decline_pushup","diamond_pushup","pseudo_planche","bulgarian_squat","nordic_curl","chinup_supinated"].includes(e[0])))return false;
 if(opts.level==="intermediate"&&["pseudo_planche","nordic_curl"].includes(e[0]))return false;
 var allowed=new Set(["none"]);
 if(opts.gear==="band")allowed.add("band");
 if(opts.gear==="dumbbell")allowed.add("dumbbell");
 if(opts.gear==="mat")allowed.add("mat");
 if(opts.gear==="gym")["band","dumbbell","mat","machine","step","bar"].forEach(x=>allowed.add(x));
 if(opts.gear==="step")allowed.add("step");
 if(opts.gear==="bar")allowed.add("bar");
 if(opts.gear==="outdoors")allowed.add("outdoors");
 if(opts.place==="outdoor")allowed.add("outdoors");
 // CrossFit sessions never require unsafe barbell lifts or skills without coaching.
 return allowed.has(e[3]);
}
function alternatives(group,exclude){
 return items.filter(e=>e[2].split(" ").includes(group)&&validExercise(e)&&!exclude.includes(e[0]));
}
function choose(group,used){
 const list=alternatives(group,used);
 if(!list.length)return null;
 const level=opts.level;
 const score=e=>{
  var x=0;
  if(opts.energy==="low"&&(e[2].includes("recover")||e[2].includes("mobility")))x+=3;
  if(level==="advanced"&&(e[3]==="dumbbell"||e[3]==="machine"))x+=2;
  if(opts.style==="walk_run"&&e[2].includes("walk"))x+=3;
  if(e[3]===opts.gear)x+=1;
  return x;
 };
 return list.sort((a,b)=>score(b)-score(a)||a[0].localeCompare(b[0],"pt-BR"))[0];
}
function build(){
 const minutes=Number(opts.minutes);
 const count=minutes<=8?3:minutes<=15?5:minutes<=25?6:minutes<=40?8:10;
 let recipe=recipes[opts.style].slice();
 if(opts.energy==="low"&&opts.style==="athletic")recipe=["warm","mobility","squat","core","recover"];
 if(opts.level==="beginner"&&opts.style==="walk_run")recipe=["warm","walk","walk","recover"];
 const categories=[];
 categories.push("warm");
 while(categories.length<count-1){
  for(const g of recipe.slice(1,-1)){if(categories.length>=count-1)break;categories.push(g)}
 }
 categories.push("recover");
 const selected=[],used=[];
 categories.forEach(group=>{
  let e=choose(group,used);
  if(!e)e=choose("mobility",used)||choose("cardio",used)||choose("warm",used)||choose("recover",used);
  if(e){selected.push(e[0]);used.push(e[0])}
 });
 if(selected.length<2)throw Error("Escolha outros equipamentos ou ambiente para montar a sessão.");
 const each=Math.max(30,Math.round((minutes*60-20*selected.length)/selected.length/5)*5);
 const label=(styleMap.get(opts.style)||[])[2]||"Treino Vivo";
 const levelNote=opts.energy==="low"?"Dia leve: movimentos e intervalos mais suaves.":opts.energy==="high"?"Dia de energia alta: mantenha a técnica e controle a intensidade.":"Ritmo moderado: priorize qualidade dos movimentos.";
 const key="pf"+Date.now().toString(36)+Math.random().toString(36).slice(2,12);
 session={key,selected,minutePlan:minutes,each,position:0,startedAt:Date.now(),completed:false,
  style:opts.style,place:opts.place,level:opts.level,energy:opts.energy,lowImpact:opts.lowImpact,quiet:opts.quiet,note:"",effort:5,
  label,levelNote};
 return session;
}
async function api(path,init={}){
 const t=token();if(!t)throw Error("Entre na sua conta para acompanhar os treinos.");
 const r=await fetch(path,{...init,cache:"no-store",headers:{"Authorization":"Bearer "+t,...(init.headers||{})},
  signal:AbortSignal.timeout(12000)});
 let body;try{body=await r.json()}catch{body={}}
 if(!r.ok)throw Error(body.error||"O servidor de treinos não respondeu.");
 return body;
}
async function loadHistory(){
 if(loading||!logged())return;
 loading=true;try{let d=await api("/api/fitness/training-lab");history=Array.isArray(d.items)?d.items:[];sleepMessage="";}
 catch(e){sleepMessage="Histórico online indisponível: "+e.message;}
 finally{loading=false;if(root&&currentView==="history")showHistory();else if(root&&currentView==="builder")showSmartTip()}
}
function stats(){
 let now=Date.now(),weekly=history.filter(h=>new Date(h.completedAt).getTime()>now-7*86400000);
 const minutes=weekly.reduce((n,h)=>n+Number(h.minutes||0),0);
 return {week:weekly.length,minutes,total:history.length};
}
function nextMission(){
 // Rules-based suggestion from REAL completed sessions; not a medical inference.
 const week=history.filter(h=>new Date(h.completedAt).getTime()>Date.now()-7*86400000);
 const recent=history.slice(0,2),tired=recent.length===2&&recent.every(h=>Number(h.effort)>=8);
 if(tired)return {style:"recovery",minutes:10,energy:"low",title:"Semana de esforço alto",explanation:"Suas duas últimas sessões foram registradas com esforço 8/10 ou mais. Considere uma missão leve de mobilidade e recuperação."};
 if(week.length>=4)return {style:"mobility",minutes:15,energy:"low",title:"Constância em alta",explanation:"Você registrou quatro ou mais sessões em sete dias. Uma missão de mobilidade pode trazer variedade à sua rotina."};
 if(week.length===0)return {style:"express",minutes:10,energy:"medium",title:"Comece pequeno",explanation:"Nenhum treino registrado nos últimos sete dias. Que tal uma missão de 10 minutos para retomar o hábito?"};
 if(recent[0]?.style==="strength")return {style:"core",minutes:15,energy:"medium",title:"Variedade de movimentos",explanation:"Seu último registro foi de força. Experimente uma sessão complementar de estabilidade."};
 return {style:"functional",minutes:15,energy:"medium",title:"Próxima missão sugerida",explanation:"Com base no histórico, um circuito funcional curto pode variar os movimentos da semana."};
}
function showSmartTip(){
 const box=by("pf-tv-smart-tip");if(!box)return;
 const x=nextMission();box.innerHTML='<strong>🧭 '+safe(x.title)+'</strong><p>'+safe(x.explanation)+'</p><button type="button" id="pf-tv-apply-tip">Aplicar sugestão</button>';
 box.querySelector("button").addEventListener("click",()=>{opts.style=x.style;opts.minutes=x.minutes;opts.energy=x.energy;opts.lowImpact=true;showBuilder()});
}
function liveEvent(action){
 if(!session)return;
 if(typeof CustomEvent!=="function"||typeof window.dispatchEvent!=="function")return;
 const exercise=byId.get(session.selected[session.position]);
 window.dispatchEvent(new CustomEvent("pulso-live-activity",{detail:{
  action,sessionKey:session.key,kind:"workout",title:session.label,
  detail:"Exercício "+(session.position+1)+"/"+session.selected.length+" • "+(exercise?.[1]||"Treino")
 }}));
}
function stopTimer(){
 if(timerId!=null)clearInterval(timerId);
 timerId=null;playing=false;
}
function startTimer(){
 if(!session)return;
 if(seconds<1)seconds=session.each;
 stopTimer();playing=true;
 timerId=setInterval(()=>{
  if(!root?.isConnected){stopTimer();return}
  seconds=Math.max(0,seconds-1);
  renderClock();
  if(seconds===0){stopTimer();renderClock()}
 },1000);
 renderClock();
}
function renderClock(){
 const clock=by("pf-tv-clock"),button=by("pf-tv-clock-toggle");
 if(clock)clock.textContent=String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
 if(button)button.textContent=playing?"Pausar cronômetro":"Iniciar cronômetro";
}
function close(){if(currentView==="runner")liveEvent("pause");stopTimer();if(root){root.remove();root=null}document.removeEventListener("keydown",keyHandler)}
function keyHandler(ev){if(ev.key==="Escape"){ev.preventDefault();close()}}
function overlay(){
 if(root?.isConnected)return root;
 const el=document.createElement("div");el.id="pf-tv-overlay";el.setAttribute("role","presentation");
 el.innerHTML='<section class="pf-tv-sheet" role="dialog" aria-modal="true" aria-labelledby="pf-tv-title"><header class="pf-tv-top"><div><span class="pf-tv-eyebrow">PULSOFIT AI • LABORATÓRIO</span><h2 id="pf-tv-title">Treino Vivo <span aria-hidden="true">✦</span></h2><p>Sessões que se adaptam ao seu dia. Sem adivinhar suas calorias.</p></div><button type="button" class="pf-tv-close" aria-label="Fechar Treino Vivo">×</button></header><div class="pf-tv-body" id="pf-tv-body"></div></section>';
 el.addEventListener("click",e=>{if(e.target===el)close()});
 el.querySelector(".pf-tv-close").addEventListener("click",close);
 document.body.appendChild(el);root=el;
 document.addEventListener("keydown",keyHandler);
 el.querySelector(".pf-tv-close").focus();
 return el;
}
function message(s){
 const el=by("pf-tv-alert");if(el)el.textContent=s||"";
}
function chooseStyle(v){
 if(!styleMap.has(v))return;
 opts.style=v;showBuilder();
}
function field(id,label,entries,current){
 return '<label class="pf-tv-field"><span>'+safe(label)+'</span><select id="'+id+'">'+entries.map(x=>'<option value="'+safe(x[0])+'"'+(String(current)===String(x[0])?' selected':'')+'>'+safe(x[1])+'</option>').join("")+'</select></label>';
}
function updateFromFields(){
 [["pf-tv-place","place"],["pf-tv-level","level"],["pf-tv-energy","energy"],["pf-tv-minutes","minutes"],["pf-tv-gear","gear"]].forEach(([id,key])=>{
  const el=by(id);if(el)opts[key]=key==="minutes"?Number(el.value):el.value;
 });
 const impact=by("pf-tv-low");if(impact)opts.lowImpact=impact.checked;
 const quiet=by("pf-tv-quiet");if(quiet)opts.quiet=quiet.checked;
}
function showBuilder(){
 currentView="builder";overlay();
 const st=stats();
 const el=by("pf-tv-body");if(!el)return;
 el.innerHTML='<div class="pf-tv-statbar"><span>📅 <b>'+st.week+'</b> sessões em 7 dias</span><span>⏱ <b>'+st.minutes+'</b> min registrados</span><button type="button" id="pf-tv-view-history">Ver histórico</button></div>'+
 '<aside id="pf-tv-smart-tip" class="pf-tv-smart-tip" aria-label="Próxima missão sugerida"></aside>'+
 '<div class="pf-tv-sectiontitle"><h3>Escolha uma missão</h3><p>Além dos treinos tradicionais do aplicativo</p></div>'+
 '<div class="pf-tv-cards">'+styles.map(x=>'<button class="pf-tv-style'+(opts.style===x[0]?' is-selected':'')+'" data-pf-tv-style="'+x[0]+'" type="button" aria-pressed="'+(opts.style===x[0])+'"><span aria-hidden="true">'+x[1]+'</span><strong>'+safe(x[2])+'</strong><small>'+safe(x[3])+'</small></button>').join("")+'</div>'+
 '<div class="pf-tv-sectiontitle"><h3>Adapte ao seu momento</h3><p>Em vez de um treino fixo, escolha seu contexto real.</p></div>'+
 '<div class="pf-tv-fields">'+
 field("pf-tv-place","Onde está?",[["home","Em casa"],["gym","Academia"],["crossfit","Box / CrossFit"],["outdoor","Ao ar livre"],["anywhere","Onde estiver"]],opts.place)+
 field("pf-tv-gear","Equipamento disponível",[["none","Nenhum"],["mat","Colchonete"],["band","Faixa elástica"],["dumbbell","Halteres"],["step","Degrau"],["gym","Academia completa"],["bar","Barra fixa segura"],["outdoors","Área externa"]],opts.gear)+
 field("pf-tv-level","Experiência",[["beginner","Iniciante"],["intermediate","Intermediário"],["advanced","Avançado"]],opts.level)+
 field("pf-tv-energy","Energia de hoje",[["low","Baixa · ritmo leve"],["medium","Moderada"],["high","Alta · técnica primeiro"]],opts.energy)+
 field("pf-tv-minutes","Quanto tempo tem?",[[5,"5 min"],[10,"10 min"],[15,"15 min"],[20,"20 min"],[30,"30 min"],[45,"45 min"],[60,"60 min"]],opts.minutes)+
 '</div><div class="pf-tv-checks"><label><input id="pf-tv-low" type="checkbox"'+(opts.lowImpact?" checked":"")+'> Sem saltos e baixo impacto</label><label><input id="pf-tv-quiet" type="checkbox"'+(opts.quiet?" checked":"")+'> Modo silencioso</label></div>'+
 '<p class="pf-tv-advice">Ajuste os movimentos à sua capacidade. Caso sinta dor, tontura, falta de ar fora do habitual ou desconforto importante, interrompa a sessão. Restrições e condições de saúde devem ser avaliadas por profissional habilitado.</p>'+
 '<button class="pf-tv-primary" id="pf-tv-generate" type="button">⚡ Criar meu treino adaptativo</button><p id="pf-tv-alert" role="status" aria-live="polite"></p>';
 showSmartTip();
 el.querySelectorAll("[data-pf-tv-style]").forEach(b=>b.addEventListener("click",()=>{updateFromFields();chooseStyle(b.dataset.pfTvStyle)}));
 el.querySelector("#pf-tv-view-history").addEventListener("click",showHistory);
 el.querySelector("#pf-tv-generate").addEventListener("click",()=>{
  updateFromFields();
  if(opts.place==="outdoor"&&opts.gear==="gym"){message("Selecione equipamento compatível com ambiente externo.");return}
  try{session=build();seconds=session.each;showPlan()}catch(e){message(e.message)}
 });
}
function exerciseMarkup(id,i,edit){
 const e=byId.get(id);if(!e)return "";
 return '<article class="pf-tv-exercise"><div class="pf-tv-exercise-index">'+(i+1)+'</div><div><h4>'+safe(e[1])+'</h4><p>'+safe(e[6])+'</p><small><b>Mais fácil:</b> '+safe(e[7])+'</small><div class="pf-tv-tags"><span>'+safe(gears[e[3]]||e[3])+'</span></div></div>'+
 (edit?'<div class="pf-tv-edit-buttons"><button class="pf-tv-swap" data-pf-tv-swap="'+i+'" type="button">Trocar rápido</button>'+
 '<button class="pf-tv-swap" data-pf-tv-pick="'+i+'" type="button">Escolher</button>'+
 '<button class="pf-tv-swap pf-tv-remove" data-pf-tv-remove="'+i+'" type="button">Remover</button></div>':"")+'</article>';
}
function removeMovement(pos){
 if(!session||session.selected.length<=2){message("Mantenha pelo menos dois exercícios para uma sessão.");return}
 session.selected.splice(pos,1);session.position=Math.min(session.position,session.selected.length-1);showPlan();
 message("Exercício removido. Adicione outro quando quiser.");
}
function showExercisePicker(pos=null){
 if(!session)return;
 currentView="picker";overlay();
 const container=by("pf-tv-body");
 const all=items.filter(e=>validExercise(e)&&!session.selected.includes(e[0]))
  .sort((a,b)=>a[1].localeCompare(b[1],"pt-BR"));
 container.innerHTML='<div class="pf-tv-sectiontitle"><h3>'+(pos===null?"Adicionar exercício":"Escolher substituição")+
 '</h3><p>Somente exercícios compatíveis com seu nível, equipamento e modo de impacto.</p></div>'+
 '<label class="pf-tv-field"><span>Buscar exercício</span><input id="pf-tv-search" type="search" placeholder="Ex.: peito, bíceps, agachamento"></label>'+
 '<p class="pf-tv-advice">Movimentos avançados aparecem somente quando o nível e os equipamentos selecionados permitem.</p>'+
 '<div id="pf-tv-pick-items" class="pf-tv-pick-items"></div>'+
 '<div class="pf-tv-actions"><button id="pf-tv-pick-back" class="pf-tv-secondary" type="button">Voltar ao treino</button></div><p id="pf-tv-alert" role="status"></p>';
 function draw(){
  const q=String(by("pf-tv-search")?.value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  const subset=all.filter(e=>(e[1]+" "+e[2]).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().includes(q)).slice(0,65);
  const holder=by("pf-tv-pick-items");
  holder.innerHTML=subset.map(e=>'<button class="pf-tv-pick-card" type="button" data-pf-tv-choose="'+safe(e[0])+'">'+
   '<strong>'+safe(e[1])+'</strong><small>'+safe(gears[e[3]]||"Sem equipamento")+' · '+safe(e[6])+'</small></button>').join("")||
   '<p class="pf-tv-empty">Nenhum exercício compatível. Ajuste seu nível ou equipamento.</p>';
  holder.querySelectorAll("[data-pf-tv-choose]").forEach(b=>b.addEventListener("click",()=>{
   const id=b.dataset.pfTvChoose,e=byId.get(id);
   if(!e||!validExercise(e)||session.selected.includes(id))return;
   if(pos===null){if(session.selected.length>=16){message("Limite de 16 exercícios por sessão.");return}session.selected.push(id)}
   else session.selected[pos]=id;
   showPlan();message("Treino personalizado atualizado.");
  }));
 }
 by("pf-tv-search").addEventListener("input",draw);
 by("pf-tv-pick-back").addEventListener("click",showPlan);draw();
}
function showPlan(){
 if(currentView==="runner")liveEvent("pause");
 currentView="plan";stopTimer();overlay();if(!session){showBuilder();return}
 let el=by("pf-tv-body"),label=session.label;
 el.innerHTML='<div class="pf-tv-plan-head"><div><span>SESSÃO ADAPTADA</span><h3>'+safe(label)+'</h3><p>'+safe(session.levelNote)+'</p></div><b>'+session.minutePlan+' min</b></div>'+
 '<div class="pf-tv-pillbar"><span>'+safe(opts.place==="home"?"Casa":opts.place==="gym"?"Academia":opts.place==="crossfit"?"CrossFit":opts.place==="outdoor"?"Ar livre":"Livre")+'</span><span>'+safe(opts.level==="beginner"?"Iniciante":opts.level==="intermediate"?"Intermediário":"Avançado")+'</span><span>'+session.selected.length+' movimentos</span></div>'+
 '<p class="pf-tv-subhead">Treino editável por você: adicione, remova ou escolha substituições. A duração é uma sugestão; faça pausas quando precisar.</p>'+
 '<div class="pf-tv-exercises">'+session.selected.map((id,i)=>exerciseMarkup(id,i,true)).join("")+'</div>'+
 '<div class="pf-tv-actions"><button class="pf-tv-secondary" id="pf-tv-back" type="button">Ajustar missão</button>'+
 '<button class="pf-tv-secondary" id="pf-tv-add-movement" type="button">+ Adicionar exercício</button>'+
 '<button class="pf-tv-primary" id="pf-tv-start" type="button">Começar sessão</button></div><p role="status" id="pf-tv-alert" aria-live="polite"></p>';
 el.querySelector("#pf-tv-back").addEventListener("click",showBuilder);
 el.querySelector("#pf-tv-start").addEventListener("click",()=>{session.startedAt=Date.now();session.position=0;seconds=session.each;liveEvent("start");showRunner()});
 el.querySelector("#pf-tv-add-movement").addEventListener("click",()=>showExercisePicker(null));
 el.querySelectorAll("[data-pf-tv-swap]").forEach(b=>b.addEventListener("click",()=>swap(Number(b.dataset.pfTvSwap),"plan")));
 el.querySelectorAll("[data-pf-tv-pick]").forEach(b=>b.addEventListener("click",()=>showExercisePicker(Number(b.dataset.pfTvPick))));
 el.querySelectorAll("[data-pf-tv-remove]").forEach(b=>b.addEventListener("click",()=>removeMovement(Number(b.dataset.pfTvRemove))));
}
function swap(pos,view){
 if(!session)return;
 const id=session.selected[pos],e=byId.get(id);if(!e)return;
 let group=e[2].split(" ").find(x=>x!=="warm"&&x!=="recover")||e[2].split(" ")[0];
 let replacements=alternatives(group,session.selected);
 if(!replacements.length){message("Não há alternativa automática compatível. Use 'Escolher' e ajuste os filtros.");return}
 session.selected[pos]=replacements[0][0];if(view==="plan")showPlan();else{seconds=session.each;showRunner()}
}
function showRunner(){
 currentView="runner";overlay();if(!session){showBuilder();return}
 const e=byId.get(session.selected[session.position]),el=by("pf-tv-body");
 el.innerHTML='<div class="pf-tv-progress-label">MOVIMENTO '+(session.position+1)+' DE '+session.selected.length+'</div><div class="pf-tv-progress"><div style="width:'+Math.round(((session.position+1)/session.selected.length)*100)+'%"></div></div>'+
 '<h3 class="pf-tv-run-title">'+safe(e[1])+'</h3><p class="pf-tv-run-how">'+safe(e[6])+'</p><p class="pf-tv-run-easy"><strong>Adaptação:</strong> '+safe(e[7])+'</p>'+
 '<div class="pf-tv-clock-wrap"><span>Tempo sugerido</span><strong id="pf-tv-clock" aria-live="off">00:00</strong><button type="button" id="pf-tv-clock-toggle">Iniciar cronômetro</button><button type="button" id="pf-tv-clock-reset">Reiniciar</button></div>'+
 '<p class="pf-tv-advice">O cronômetro é opcional. Execute com controle; descanse quando precisar e não force até a falha.</p>'+
 '<div class="pf-tv-actions"><button type="button" class="pf-tv-secondary" id="pf-tv-run-swap">Trocar exercício</button><button class="pf-tv-primary" type="button" id="pf-tv-next">'+(session.position+1===session.selected.length?"Finalizar exercícios":"Próximo exercício")+'</button></div>'+
 '<button type="button" class="pf-tv-secondary" id="pf-tv-ar-demo">📷 Ver pessoa real no ambiente</button>'+
 '<button type="button" class="pf-tv-textbutton" id="pf-tv-exit">Voltar ao roteiro</button><p id="pf-tv-alert" role="status" aria-live="polite"></p>';
 renderClock();
 el.querySelector("#pf-tv-clock-toggle").addEventListener("click",()=>{
  if(playing){stopTimer();renderClock()}else startTimer();
 });
 el.querySelector("#pf-tv-clock-reset").addEventListener("click",()=>{stopTimer();seconds=session.each;renderClock()});
 el.querySelector("#pf-tv-ar-demo").addEventListener("click",()=>window.dispatchEvent(new CustomEvent("pulso-open-camera-ar",{detail:{exercise:e[1]}})));
 el.querySelector("#pf-tv-run-swap").addEventListener("click",()=>{stopTimer();swap(session.position,"runner")});
 el.querySelector("#pf-tv-next").addEventListener("click",()=>{stopTimer();if(session.position+1<session.selected.length){session.position++;seconds=session.each;liveEvent("update");showRunner()}else showFinish()});
 el.querySelector("#pf-tv-exit").addEventListener("click",showPlan);
}
function showFinish(){
 liveEvent("finish");
 currentView="finish";stopTimer();overlay();if(!session){showBuilder();return}
 const actualMinutes=Math.max(5,Math.min(120,Math.round((Date.now()-session.startedAt)/60000)||5));
 const el=by("pf-tv-body");
 el.innerHTML='<div class="pf-tv-finish-icon">🏁</div><h3>Você concluiu os movimentos?</h3><p>Registre sua sessão apenas se realmente treinou. Isso alimenta o acompanhamento sem inventar resultados.</p>'+
 '<div class="pf-tv-fields"><label class="pf-tv-field"><span>Duração realizada</span><input id="pf-tv-done-minutes" type="number" min="5" max="120" value="'+actualMinutes+'"></label><label class="pf-tv-field"><span>Esforço percebido (1–10)</span><select id="pf-tv-done-effort">'+Array.from({length:10},(_,i)=>'<option value="'+(i+1)+'"'+(i+1===5?" selected":"")+'>'+(i+1)+'</option>').join("")+'</select></label></div>'+
 '<label class="pf-tv-field pf-tv-note"><span>Como se sentiu? (opcional)</span><textarea id="pf-tv-done-note" maxlength="320" rows="3" placeholder="Ex.: Fiz tudo em ritmo confortável, sem dor."></textarea></label>'+
 '<button class="pf-tv-primary" id="pf-tv-save" type="button">Salvar sessão na minha conta</button><button class="pf-tv-textbutton" id="pf-tv-no-save" type="button">Voltar sem salvar</button><p id="pf-tv-alert" role="status" aria-live="polite"></p>';
 el.querySelector("#pf-tv-save").addEventListener("click",save);
 el.querySelector("#pf-tv-no-save").addEventListener("click",showBuilder);
}
async function save(){
 if(!session||saving)return;
 const m=Number(by("pf-tv-done-minutes")?.value),effort=Number(by("pf-tv-done-effort")?.value),note=String(by("pf-tv-done-note")?.value||"");
 if(!Number.isInteger(m)||m<5||m>120||effort<1||effort>10){message("Confira a duração (5–120 min) e o esforço.");return}
 const button=by("pf-tv-save");if(button)button.disabled=true;saving=true;message("Salvando no histórico da sua conta…");
 try{
  await api("/api/fitness/training-lab",{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({sessionKey:session.key,style:session.style,place:session.place,level:session.level,energy:session.energy,minutes:m,effort,lowImpact:session.lowImpact,quiet:session.quiet,exercises:session.selected,note})});
  session.completed=true;await loadHistory();showHistory();
  message("Sessão salva na sua conta. Bom trabalho!");
 }catch(e){message("Não foi possível salvar: "+e.message+". A sessão não foi marcada como concluída.");if(button)button.disabled=false}
 finally{saving=false}
}
function showHistory(){
 currentView="history";stopTimer();overlay();
 const st=stats(),el=by("pf-tv-body");
 const list=history.slice(0,30).map(h=>{
  const label=styleMap.get(h.style)?.[2]||h.style;
  const when=new Date(h.completedAt);
  const date=!Number.isNaN(when.getTime())?when.toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"}):"";
  return '<article class="pf-tv-history-row"><span>✓</span><div><strong>'+safe(label)+'</strong><small>'+safe(date)+' · '+Number(h.minutes||0)+' min · Esforço '+Number(h.effort||0)+'/10</small>'+(h.note?'<small>'+safe(h.note)+'</small>':"")+'</div></article>';
 }).join("");
 el.innerHTML='<div class="pf-tv-sectiontitle"><h3>Seu histórico real</h3><p>Somente sessões concluídas e salvas na sua conta.</p></div>'+
 '<div class="pf-tv-statbar"><span>📅 <b>'+st.week+'</b> na semana</span><span>⏱ <b>'+st.minutes+'</b> min/7 dias</span><span>🏁 <b>'+st.total+'</b> no total</span></div>'+
 (sleepMessage?'<p class="pf-tv-error">'+safe(sleepMessage)+'</p>':'')+
 '<div class="pf-tv-history">'+(list||'<p class="pf-tv-empty">Nenhuma sessão registrada. Experimente sua primeira missão!</p>')+'</div>'+
 '<p class="pf-tv-advice">Os números representam apenas o que você registrou. Não são uma medida clínica de saúde, capacidade física ou gasto calórico.</p>'+
 '<button class="pf-tv-primary" id="pf-tv-new" type="button">Montar outra missão</button><p id="pf-tv-alert" role="status" aria-live="polite"></p>';
 el.querySelector("#pf-tv-new").addEventListener("click",showBuilder);
}
function open(){
 if(!logged())return;
 overlay();showBuilder();loadHistory();
}
function placeLaunch(){
 if(!logged())return;
 const app=by("app");if(!app)return;
 let rt=String(location.hash||"#/home").replace(/^#\/?/,"").split("/")[0].toLowerCase();
 const area=app.querySelector(".main")||app.querySelector("main");
 if(!area)return;
 if(!["workouts","home"].includes(rt))return;
 if(area.querySelector("#pf-tv-launch"))return;
 const b=document.createElement("button");b.type="button";b.id="pf-tv-launch";b.className="pf-tv-launch";
 b.innerHTML='<span aria-hidden="true" class="pf-tv-launch-icon">⚡</span><span><strong>Treino Vivo <small>NOVO</small></strong><em>Treino diário editável: adicione, remova ou troque exercícios • histórico online</em></span><span class="pf-tv-launch-arrow" aria-hidden="true">›</span>';
 b.addEventListener("click",open);
 const anchor=area.querySelector("h1")?.closest("section")||area.querySelector("h1");
 if(anchor?.parentNode&&anchor.parentNode!==area)anchor.parentNode.insertBefore(b,anchor.nextSibling);
 else area.insertBefore(b,area.firstElementChild);
}
function schedule(){
 if(scheduled)return;
 scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;try{placeLaunch()}catch(e){console.warn("[pulso-treino] Não foi possível exibir atalho nesta tela.")}});
}
function init(){
 const app=by("app");
 if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
 window.addEventListener("hashchange",schedule);
 window.addEventListener("pageshow",schedule);
 window.addEventListener("pulso-auth-ready",schedule);
 window.addEventListener("pulso-open-training-lab",open);
 schedule();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
})();
