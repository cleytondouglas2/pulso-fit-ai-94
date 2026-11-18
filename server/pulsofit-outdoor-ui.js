/* PulsoFit AI • Outdoor GPS, live trail, sessions and Gemini analyses.
 * Browser foreground only. Location permission is requested ONLY by Iniciar.
 * Coordinates never go to Gemini. Save requires explicit user confirmation.
 */
(function(){
"use strict";
if(window.__PULSO_OUTDOOR_UI_20261118__)return;
window.__PULSO_OUTDOOR_UI_20261118__=true;
const labels={walk:["🚶","Caminhada ao ar livre"],run:["🏃","Corrida ao ar livre"],bike:["🚴","Bicicleta ao ar livre"]};
const leafletCss="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
const leafletJs="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js";
const leafletCssSRI="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
const leafletJsSRI="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
let el=null,map=null,currentMarker=null,accuracyCircle=null,segments=[],currentPolyline=null,geoId=null,wake=null,timer=null;
let view="choose",activity=null,history=[],historyError="",fetching=false,leafletPromise=null,follow=true,scheduled=false;
let profileWeight=null,minor=false,openedHistory=null;
const token=()=>{try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}};
const logged=()=>!!token()&&!document.body.classList.contains("pf-account-locked");
const route=()=>String(location.hash||"#/home").replace(/^#\/?/,"").split("/")[0].toLowerCase();
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const nf=(n,d=1)=>Number(n||0).toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d});
const clock=s=>{s=Math.max(0,Math.floor(s));return [Math.floor(s/3600),Math.floor((s%3600)/60),s%60].map(x=>String(x).padStart(2,"0")).join(":")};
const dt=()=>{
 const n=new Date();return n.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
};
function haversine(a,b){
 const d2r=Math.PI/180,dp=(b[0]-a[0])*d2r,dl=(b[1]-a[1])*d2r;
 const h=Math.sin(dp/2)**2+Math.cos(a[0]*d2r)*Math.cos(b[0]*d2r)*Math.sin(dl/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
function pace(meters,seconds){
 if(meters<50||seconds<10)return "—";
 const perKm=Math.round(seconds*1000/meters);
 if(!Number.isFinite(perKm)||perKm>3600)return "—";
 return Math.floor(perKm/60)+":"+String(perKm%60).padStart(2,"0")+" min/km";
}
function elapsed(){
 if(!activity)return 0;
 return activity.activeMs+(activity.state==="running"?Math.max(0,Date.now()-activity.resumedAt):0);
}
function speed(){
 const secs=elapsed()/1000;
 return secs>5?(activity.distance/1000)/(secs/3600):0;
}
function metFor(kind,kph){
 // Approximate 2024 Adult Compendium MET bands. Not measured energy.
 if(kind==="walk")return kph<3.2?2.8:kph<4.4?3.0:kph<5.5?3.8:kph<6.4?4.8:5.5;
 if(kind==="run")return kph<8?6.0:kph<10?8.3:kph<12?9.8:11.0;
 return kph<13?4.0:kph<16?5.8:kph<19?6.8:kph<22?8.0:10.0;
}
function calories(){
 if(!activity||minor||!Number.isFinite(activity.weight)||activity.weight<30||activity.distance<30)return null;
 return Math.round(metFor(activity.kind,speed())*activity.weight*elapsed()/3600000);
}
function setStatus(msg,critical=false){
 const box=document.getElementById("pf-outdoor-status");
 if(box){box.textContent=msg;box.classList.toggle("pf-outdoor-warning",Boolean(critical))}
}
async function request(path,init={}){
 const t=token();if(!t)throw Error("Entre na sua conta.");
 const r=await fetch(path,{...init,cache:"no-store",headers:{"Authorization":"Bearer "+t,...(init.headers||{})},
  signal:AbortSignal.timeout(init.method==="POST"&&path.includes("analyze")?40000:16000)});
 let out;try{out=await r.json()}catch{out={}}
 if(!r.ok)throw Error(String(out.error||"Falha ao consultar o servidor."));
 return out;
}
async function readAssessment(){
 try{
  const d=await request("/api/fitness/assessment");
  const a=d.answers||{};
  if(Number.isFinite(Number(a.ageYears))&&Number(a.ageYears)<18&&Number(a.ageYears)>=13)minor=true;
  if(Number.isFinite(Number(a.weightKg))&&Number(a.weightKg)>=30&&Number(a.weightKg)<=250)profileWeight=Number(a.weightKg);
  if(!activity&&view==="choose")refreshWeightHint();
 }catch{}
}
function refreshWeightHint(){
 const input=document.getElementById("pf-outdoor-weight"),hint=document.getElementById("pf-outdoor-weight-hint");
 if(input&&profileWeight&&!input.value)input.value=String(profileWeight);
 if(hint)hint.textContent=minor?"Para menores de 18 anos, o aplicativo não exibe estimativas de calorias.":profileWeight?"Peso da sua avaliação já preenchido; você pode corrigir para esta atividade.":"Opcional. Sem peso informado, não calculamos calorias.";
}
async function loadHistory(){
 if(fetching||!logged())return;
 fetching=true;
 try{const d=await request("/api/fitness/outdoor");history=Array.isArray(d.items)?d.items:[];historyError="";}
 catch(e){historyError=e.message}
 finally{fetching=false;if(el&&view==="history")showHistory()}
}
function destroyMap(){
 try{map?.remove()}catch{}
 map=null;currentMarker=null;accuracyCircle=null;segments=[];currentPolyline=null;follow=true;
}
function layout(){
 if(el?.isConnected)return el;
 el=document.createElement("div");el.id="pf-outdoor-overlay";
 el.innerHTML='<section class="pf-outdoor-sheet" role="dialog" aria-modal="true" aria-labelledby="pf-outdoor-title">'+
  '<header class="pf-outdoor-head"><div><span class="pf-outdoor-overline">PULSOFIT AI • MOVIMENTO REAL</span>'+
  '<h2 id="pf-outdoor-title">Outdoor Live <span>⌁</span></h2><p>GPS, trajetos, ritmo e evolução ao ar livre.</p></div>'+
  '<button id="pf-outdoor-close" type="button" aria-label="Fechar atividades">×</button></header>'+
  '<div id="pf-outdoor-body" class="pf-outdoor-body"></div></section>';
 document.body.appendChild(el);
 el.querySelector("#pf-outdoor-close").addEventListener("click",close);
 el.addEventListener("click",e=>{if(e.target===el)close()});
 document.addEventListener("keydown",escapeKey);
 el.querySelector("#pf-outdoor-close").focus();
 return el;
}
function escapeKey(e){if(e.key==="Escape")close()}
function dispose(){
 stopWatch();turnOffMotion();clearInterval(timer);timer=null;releaseWake();destroyMap();
 if(el){el.remove();el=null}document.removeEventListener("keydown",escapeKey);
 activity=null;openedHistory=null;
}
function close(){
 if(activity&&["running","paused","finished"].includes(activity.state)&&!activity.saved){
  if(!confirm("Seu percurso ainda não foi salvo. Deseja encerrar e descartar esta atividade?"))return;
 }
 dispose();
}
function selectKind(kind){
 if(!labels[kind])return;
 openedHistory=null;
 activity={kind,state:"ready",started:0,resumedAt:0,activeMs:0,distance:0,points:[],lastFix:null,lastFixAt:0,
  gpsAccuracy:null,skipped:0,weight:profileWeight,ascent:0,prevAltitude:null,splits:[],nextSplit:1000,
  key:"pf"+Date.now().toString(36)+Math.random().toString(36).slice(2,12),saved:false,savedId:null,
  strideM:kind==="run"?1.05:.75,motionWanted:false,motionActive:false,motionSteps:0,motionSamples:0,motionReady:false,
  lastStepAt:0,notify:false,lastNoticeMs:0,
  signal:"Ao iniciar, o navegador solicitará sua localização."};
 showTracker();refreshWeightHint();
}
function showChooser(){
 view="choose";layout();destroyMap();
 const box=document.getElementById("pf-outdoor-body");if(!box)return;
 box.innerHTML='<div class="pf-outdoor-intro"><h3>Escolha seu caminho</h3><p>Seu movimento no mundo real, acompanhado no mapa — com controle total sobre o registro.</p></div>'+
 '<div class="pf-outdoor-choices">'+Object.entries(labels).map(([id,info])=>
 '<button type="button" data-pf-outdoor-kind="'+id+'" class="pf-outdoor-choice"><span>'+info[0]+'</span><strong>'+esc(info[1])+'</strong>'+
 '<small>'+(id==="walk"?"Passos e ritmo confortável":id==="run"?"Distância, ritmo e parciais": "Velocidade e distância pedalada")+'</small></button>').join("")+'</div>'+
 '<div class="pf-outdoor-privacy"><strong>🔐 Seu trajeto é privado</strong><p>O GPS é ativado somente quando você tocar em <b>Iniciar</b>. O percurso é salvo na sua conta apenas quando você confirmar. Para mostrar o mapa de ruas, o serviço OpenStreetMap recebe solicitações de imagens das regiões visualizadas.</p>'+
 '<p><b>Atenção no iPhone:</b> mantenha o Safari em primeiro plano e a tela ativa. O navegador pode interromper o GPS com a tela bloqueada ou em segundo plano; para gravação confiável em segundo plano é necessário um aplicativo nativo com permissões específicas.</p></div>'+
 '<div class="pf-outdoor-actions"><button id="pf-outdoor-history" class="pf-outdoor-secondary" type="button">📚 Histórico das atividades</button></div>';
 box.querySelectorAll("[data-pf-outdoor-kind]").forEach(b=>b.addEventListener("click",()=>selectKind(b.dataset.pfOutdoorKind)));
 box.querySelector("#pf-outdoor-history").addEventListener("click",()=>{showHistory();void loadHistory()});
}
/* Optional sensor + GPS indicators are ESTIMATES, never medical/pedometer measurements. */
function stepsEstimated(){
 if(!activity||activity.kind==="bike")return null;
 const gps=Math.round(activity.distance/(activity.strideM||.75));
 if(activity.motionActive&&activity.motionSamples>=20&&activity.motionSteps>=8){
  const sensor=activity.motionSteps;
  if(activity.distance<50||(sensor<=gps*2.5&&sensor>=gps*.35))
   return {value:sensor,source:"sensor estimativo"};
 }
 return {value:gps,source:"distância GPS"};
}
function floorsEstimated(){
 if(!activity||!Number.isFinite(activity.ascent)||activity.ascent<3)return null;
 return Math.floor(activity.ascent/3);
}
function motionEvent(ev){
 if(!activity||activity.state!=="running"||activity.kind==="bike")return;
 const v=ev.accelerationIncludingGravity||ev.acceleration;
 if(!v||![v.x,v.y,v.z].every(n=>Number.isFinite(n)))return;
 const signal=Math.abs(Math.hypot(v.x,v.y,v.z)-9.81),now=Date.now();
 activity.motionSamples=(activity.motionSamples||0)+1;
 if(signal<.75){activity.motionReady=true;return}
 if(activity.motionReady&&signal>1.5&&signal<14){
  if(now-(activity.lastStepAt||0)>320&&now-(activity.lastStepAt||0)<1500)activity.motionSteps++;
  activity.lastStepAt=now;activity.motionReady=false;
 }
}
function turnOffMotion(){window.removeEventListener("devicemotion",motionEvent)}
function initMotion(){
 if(!activity||activity.kind==="bike"||!activity.motionWanted||typeof DeviceMotionEvent==="undefined")return;
 if(typeof DeviceMotionEvent.requestPermission==="function"){
  let permit;try{permit=DeviceMotionEvent.requestPermission()}catch{return}
  Promise.resolve(permit).then(result=>{
   if(result==="granted"&&activity?.state==="running"){activity.motionActive=true;window.addEventListener("devicemotion",motionEvent)}
  }).catch(()=>{});
 }else{activity.motionActive=true;window.addEventListener("devicemotion",motionEvent)}
}
function liveNotice(title){
 if(!activity?.notify||typeof Notification==="undefined"||Notification.permission!=="granted"||!navigator.serviceWorker)return;
 const dist=nf(activity.distance/1000,2)+" km",time=clock(elapsed()/1000),step=stepsEstimated();
 const body=dist+" • "+time+" • "+nf(speed(),1)+" km/h"+
  (step&&step.value>0?" • ≈ "+step.value.toLocaleString("pt-BR")+" passos":"");
 navigator.serviceWorker.ready.then(reg=>reg.showNotification(title||labels[activity.kind][1]+" • PulsoFit",{
  body,icon:"/pulsofit-icon-192.png",badge:"/pulsofit-icon-192.png",
  tag:"pulsofit-outdoor-progress",renotify:false,silent:true,
  data:{url:"/?source=outdoor#/home"}
 })).catch(()=>{});
}
function refreshLiveSummary(){
 const x=document.getElementById("pf-outdoor-live-caption");
 if(x&&activity){
  const step=stepsEstimated();
  x.textContent=clock(elapsed()/1000)+" • "+nf(activity.distance/1000,2)+" km"+
   (step?" • ≈ "+step.value.toLocaleString("pt-BR")+" passos":"");
 }
 if(activity?.state==="running"&&activity.notify&&elapsed()-(activity.lastNoticeMs||0)>=5*60*1000){
  activity.lastNoticeMs=elapsed();liveNotice("⏱ Seu treino continua • PulsoFit");
 }
}
function summaryBars(){
 return '<div class="pf-outdoor-stats">'+
  '<div><small>⏱ Tempo ativo</small><strong id="pf-outdoor-time">00:00:00</strong></div>'+
  '<div><small>📍 Distância</small><strong id="pf-outdoor-distance">0,00 <em>km</em></strong></div>'+
  '<div><small>⚡ Velocidade média</small><strong id="pf-outdoor-speed">0,0 <em>km/h</em></strong></div>'+
  '<div><small>🏃 Ritmo médio</small><strong id="pf-outdoor-pace">—</strong></div>'+
  '<div><small>🔥 Calorias estimadas</small><strong id="pf-outdoor-kcal">—</strong></div>'+
  '<div><small>🛰 Precisão GPS</small><strong id="pf-outdoor-accuracy">—</strong></div>'+
  '<div><small>👣 Passos estimados</small><strong id="pf-outdoor-steps">—</strong></div>'+
  '<div><small>⛰ Subida acumulada</small><strong id="pf-outdoor-uphill">—</strong></div>'+
  '<div><small>🏢 Andares equivalentes</small><strong id="pf-outdoor-floors">—</strong></div>'+
 '</div>';
}
function mapMarkup(){
 return '<div class="pf-outdoor-map-wrap"><div id="pf-outdoor-map" aria-label="Mapa do trajeto da atividade">'+
  '<div class="pf-outdoor-map-loading">O mapa aparecerá após a autorização do GPS.</div></div>'+
  '<button type="button" id="pf-outdoor-follow">◎ Centralizar no GPS</button></div>';
}
function showTracker(){
 view="tracker";layout();destroyMap();clearInterval(timer);
 const box=document.getElementById("pf-outdoor-body");
 box.innerHTML='<div class="pf-outdoor-activity-heading"><div><span>ATIVIDADE SELECIONADA</span><h3>'+esc(labels[activity.kind][0])+' '+esc(labels[activity.kind][1])+'</h3></div>'+
 '<button id="pf-outdoor-change" type="button">Trocar</button></div>'+
 '<div class="pf-outdoor-weight"><label for="pf-outdoor-weight">Peso em kg (somente para estimar calorias)</label>'+
 '<input id="pf-outdoor-weight" min="30" max="250" step="0.1" type="number" inputmode="decimal" placeholder="Opcional"><small id="pf-outdoor-weight-hint"></small></div>'+
 '<div id="pf-outdoor-status" role="status" aria-live="polite" class="pf-outdoor-status">Clique em Iniciar para ativar o GPS.</div>'+
 '<div class="pf-outdoor-live-widget" aria-label="Resumo ao vivo"><strong>● ACOMPANHAMENTO AO VIVO</strong><span id="pf-outdoor-live-caption">00:00:00 • 0,00 km</span></div>'+
 '<div class="pf-outdoor-optional"><label><input id="pf-outdoor-push-live" type="checkbox"> Avisos de progresso a cada 5 minutos com o app aberto (notificações previamente autorizadas)</label>'+
 (activity.kind==="bike"?"":'<label><input id="pf-outdoor-motion" type="checkbox"> Usar sensor do celular para auxiliar estimativa de passos</label>'+
 '<label>Passada média <select id="pf-outdoor-stride"><option value="0.6">60 cm</option><option value="0.7">70 cm</option>'+
 '<option value="0.75" selected>75 cm</option><option value="0.85">85 cm</option><option value="1.05">105 cm</option><option value="1.2">120 cm</option></select></label>')+'</div>'+
 mapMarkup()+summaryBars()+
 '<div class="pf-outdoor-actions"><button class="pf-outdoor-primary" id="pf-outdoor-start" type="button">▶ Iniciar e ativar GPS</button>'+
 '<button id="pf-outdoor-pause" type="button" class="pf-outdoor-secondary" hidden>⏸ Pausar</button>'+
 '<button id="pf-outdoor-resume" type="button" class="pf-outdoor-primary" hidden>▶ Retomar GPS</button>'+
 '<button id="pf-outdoor-finish" type="button" class="pf-outdoor-danger" hidden>■ Finalizar</button></div>'+
 '<p class="pf-outdoor-foot">Passos por distância/sensor e andares equivalentes por altitude são apenas estimativas. O navegador não identifica escadas reais nem cria Live Activities nativas na tela bloqueada. Os avisos de progresso funcionam enquanto o app está aberto. Calorias são estimativas, não medições de suor ou gordura.</p>'+
 '<p class="pf-outdoor-foot">Para sua segurança, observe o caminho e não manipule o celular enquanto corre, caminha ou pedala.</p>';
 box.querySelector("#pf-outdoor-change").addEventListener("click",()=>{if(activity.state==="running"||activity.state==="paused"){setStatus("Finalize a atividade antes de trocar de modalidade.");return}showChooser()});
 box.querySelector("#pf-outdoor-start").addEventListener("click",startGPS);
 box.querySelector("#pf-outdoor-pause").addEventListener("click",pause);
 box.querySelector("#pf-outdoor-resume").addEventListener("click",resume);
 box.querySelector("#pf-outdoor-finish").addEventListener("click",finish);
 box.querySelector("#pf-outdoor-follow").addEventListener("click",()=>{
  follow=true;
  if(map&&activity.lastFix)map.setView([activity.lastFix[0],activity.lastFix[1]],Math.max(map.getZoom(),15),{animate:true});
 });
 refreshWeightHint();updateControls();updateStats();
}
function updateControls(){
 const state=activity?.state;
 for(const [id,flag] of [["pf-outdoor-start",state==="ready"],["pf-outdoor-pause",state==="running"],["pf-outdoor-resume",state==="paused"],["pf-outdoor-finish",state==="running"||state==="paused"]]){
  const n=document.getElementById(id);if(n)n.hidden=!flag;
 }
 const weight=document.getElementById("pf-outdoor-weight");if(weight)weight.disabled=state!=="ready";
}
async function holdWake(){
 try{if("wakeLock" in navigator)wake=await navigator.wakeLock.request("screen")}catch{}
}
async function releaseWake(){try{await wake?.release()}catch{}wake=null}
function stopWatch(){
 if(geoId!==null&&navigator.geolocation){try{navigator.geolocation.clearWatch(geoId)}catch{}}
 geoId=null;
}
function captureWeight(){
 let inp=document.getElementById("pf-outdoor-weight");
 const v=String(inp?.value||"").trim().replace(",",".");
 if(!v){activity.weight=null;return true}
 const n=Number(v);
 if(!Number.isFinite(n)||n<30||n>250){setStatus("Informe um peso entre 30 e 250 kg ou deixe em branco.",true);return false}
 activity.weight=n;return true;
}
function startGPS(){
 if(!activity||activity.state!=="ready")return;
 if(!window.isSecureContext||!navigator.geolocation){setStatus("O GPS precisa de HTTPS e de um navegador com Geolocalização. Abra o site no Safari ou Chrome e permita o acesso.",true);return}
 if(!captureWeight())return;
 const pushBox=document.getElementById("pf-outdoor-push-live");
 activity.notify=!!pushBox?.checked&&typeof Notification!=="undefined"&&Notification.permission==="granted";
 if(pushBox?.checked&&!activity.notify)setStatus("Ative primeiro as notificações em Mais → Notificações para receber avisos durante o percurso.");
 activity.motionWanted=!!document.getElementById("pf-outdoor-motion")?.checked;
 activity.strideM=Number(document.getElementById("pf-outdoor-stride")?.value)||(activity.kind==="run"?1.05:.75);
 initMotion();
 activity.started=Date.now();activity.resumedAt=Date.now();activity.activeMs=0;activity.state="running";
 activateWatch();
 timer=setInterval(updateStats,1000);
 updateControls();updateStats();void holdWake();
}
function activateWatch(){
 if(!activity||activity.state!=="running")return;
 setStatus("Buscando sinal GPS… permita a localização precisa quando o navegador solicitar.");
 try{
  geoId=navigator.geolocation.watchPosition(onFix,onGeoError,{
   enableHighAccuracy:true,maximumAge:1000,timeout:20000
  });
 }catch(e){onGeoError(e)}
}
function onGeoError(err){
 if(!activity)return;
 const code=Number(err?.code);
 if(code===1){pause();setStatus("Permissão de localização negada. Autorize localização precisa para este site nas configurações do navegador.",true)}
 else if(code===2)setStatus("GPS indisponível. Vá para uma área com céu aberto e aguarde o sinal.",true);
 else setStatus("Aguardando sinal do GPS. Confirme se a localização precisa está ativada.",true);
}
function onFix(fix){
 if(!activity||activity.state!=="running")return;
 const c=fix.coords;
 if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude))return;
 const acc=Number(c.accuracy),at=Number(fix.timestamp);
 activity.gpsAccuracy=Number.isFinite(acc)?Math.round(acc):null;
 activity.lastFixAt=Date.now();
 if(!Number.isFinite(acc)||acc>80){activity.skipped++;setStatus("Sinal GPS fraco ("+Math.round(acc||0)+" m). Aguardando leitura mais precisa.",true);updateStats();return}
 const ts=Number.isFinite(at)?at:Date.now(),a=[Number(c.latitude.toFixed(6)),Number(c.longitude.toFixed(6)),Math.round(ts),
  Math.min(250,Number(acc.toFixed(1))),Number.isFinite(c.altitude)&&Number.isFinite(c.altitudeAccuracy)&&c.altitudeAccuracy<=12?Number(c.altitude.toFixed(1)):null,0];
 const prev=activity.lastFix;
 if(activity.segmentBreak){a[5]=1;activity.segmentBreak=false}
 if(prev){
  let sec=(a[2]-prev[2])/1000,delta=haversine(prev,a);
  if(sec<=0||delta<Math.max(3,Math.min(12,acc*.13)))return;
  if(a[5]||sec>150){a[5]=1;activity.prevAltitude=null;setStatus("Novo trecho após pausa ou perda de sinal. A distância entre trechos não será somada.",true)}
  else {
   const limit=activity.kind==="bike"?21:activity.kind==="run"?10:4.5;
   if(delta/sec>limit){activity.skipped++;setStatus("Leitura GPS com salto irreal descartada.",true);return}
   activity.distance+=delta;
   const secs=elapsed()/1000;
   if(activity.distance>=activity.nextSplit){
    activity.splits.push({km:Math.floor(activity.nextSplit/1000),sec:Math.round(secs)});
    activity.nextSplit+=1000;
   }
   if(a[4]!==null&&activity.prevAltitude!==null&&a[4]-activity.prevAltitude>=5&&a[4]-activity.prevAltitude<=30&&delta>=10&&(a[4]-activity.prevAltitude)/delta<=.55){
    activity.ascent+=a[4]-activity.prevAltitude;
   }
  }
 }
 activity.points.push(a);activity.lastFix=a;
 if(a[4]!==null)activity.prevAltitude=a[4];
 if(activity.points.length>4800){
  // Keep the entire line shape at lower resolution; do not drop covered distance.
  let decimated=[];
  activity.points.forEach((p,i)=>{if(i===0||i===activity.points.length-1||p[5]||i%2===0)decimated.push(p)});
  activity.points=decimated;
 }
 setStatus("GPS ativo • precisão ±"+Math.round(acc)+" m • atualizando percurso.");
 updateStats();updateMap(a);
}
function pause(){
 if(!activity||activity.state!=="running")return;
 activity.activeMs+=Math.max(0,Date.now()-activity.resumedAt);
 activity.state="paused";stopWatch();turnOffMotion();void releaseWake();clearInterval(timer);timer=null;
 updateControls();updateStats();
 setStatus("Atividade pausada. O GPS não registra novas posições até você retomar.");
}
function resume(){
 if(!activity||activity.state!=="paused")return;
 activity.state="running";activity.resumedAt=Date.now();
 // Break the route after any pause, even when points are geographically close.
 activity.segmentBreak=true;
 if(activity.motionActive)window.addEventListener("devicemotion",motionEvent);
 activateWatch();
 timer=setInterval(updateStats,1000);updateControls();void holdWake();
}
function finish(){
 if(!activity||!["running","paused"].includes(activity.state))return;
 if(activity.state==="running")activity.activeMs+=Math.max(0,Date.now()-activity.resumedAt);
 activity.state="finished";stopWatch();turnOffMotion();void releaseWake();clearInterval(timer);timer=null;
 if(activity.notify)liveNotice("🏁 Atividade finalizada • PulsoFit");
 showCompleted();
}
function updateStats(){
 if(!activity)return;
 const boxes={
  "pf-outdoor-time":clock(elapsed()/1000),
  "pf-outdoor-distance":nf(activity.distance/1000,2)+" km",
  "pf-outdoor-speed":nf(speed(),1)+" km/h",
  "pf-outdoor-pace":pace(activity.distance,elapsed()/1000),
  "pf-outdoor-kcal":calories()===null?"—":"≈ "+nf(calories(),0)+" kcal",
  "pf-outdoor-accuracy":activity.gpsAccuracy===null?"—":"±"+activity.gpsAccuracy+" m",
  "pf-outdoor-steps":stepsEstimated()?"≈ "+stepsEstimated().value.toLocaleString("pt-BR"):"Não se aplica",
  "pf-outdoor-uphill":activity.ascent>0?"≈ "+nf(activity.ascent,1)+" m":"Sem medida",
  "pf-outdoor-floors":floorsEstimated()===null?"—":"≈ "+floorsEstimated()
 };
 Object.entries(boxes).forEach(([id,text])=>{const x=document.getElementById(id);if(x&&x.textContent!==text)x.textContent=text});
 refreshLiveSummary();
 if(activity.state==="running"&&activity.lastFixAt&&Date.now()-activity.lastFixAt>35000)
  setStatus("Sinal GPS interrompido. Mantenha o Safari aberto, com a tela ligada e a localização ativada.",true);
}
function loadLeaflet(){
 if(window.L?.map)return Promise.resolve(true);
 if(leafletPromise)return leafletPromise;
 leafletPromise=new Promise(resolve=>{
  let css=document.getElementById("pf-outdoor-leaflet-css");
  if(!css){css=document.createElement("link");css.rel="stylesheet";css.href=leafletCss;css.integrity=leafletCssSRI;css.crossOrigin="anonymous";css.id="pf-outdoor-leaflet-css";document.head.appendChild(css)}
  const script=document.createElement("script");script.src=leafletJs;script.async=true;script.integrity=leafletJsSRI;script.crossOrigin="anonymous";
  const timeout=setTimeout(()=>resolve(false),12000);
  script.onload=()=>{clearTimeout(timeout);resolve(Boolean(window.L?.map))};
  script.onerror=()=>{clearTimeout(timeout);resolve(false)};
  document.head.appendChild(script);
 });
 return leafletPromise;
}
function routeSegments(points){
 let out=[],current=[];
 for(const p of points){
  if(p[5]&&current.length){out.push(current);current=[]}
  current.push([p[0],p[1]]);
 }
 if(current.length)out.push(current);
 return out;
}
function drawFallback(points){
 const box=document.getElementById("pf-outdoor-map");
 if(!box||map)return;
 if(!points.length){box.innerHTML='<div class="pf-outdoor-map-loading">Aguardando coordenadas GPS…</div>';return}
 const lat=points.map(p=>p[0]),lon=points.map(p=>p[1]),minLat=Math.min(...lat),maxLat=Math.max(...lat),minLon=Math.min(...lon),maxLon=Math.max(...lon);
 const dx=Math.max(0.0003,maxLon-minLon),dy=Math.max(0.0003,maxLat-minLat);
 const norm=p=>[(15+(p[1]-minLon)/dx*570).toFixed(1),(225-(p[0]-minLat)/dy*210).toFixed(1)];
 const segments=routeSegments(points);
 let poly=segments.map(part=>'<polyline points="'+part.map(p=>norm(p).join(",")).join(" ")+'" fill="none" stroke="#68ffe1" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>').join("");
 const last=norm(points[points.length-1]);
 box.innerHTML='<svg viewBox="0 0 600 240" role="img" aria-label="Desenho do trajeto registrado sem mapa de ruas" preserveAspectRatio="xMidYMid meet"><rect width="600" height="240" fill="#18243c"/>'+
  '<path d="M0 60H600M0 120H600M0 180H600M150 0V240M300 0V240M450 0V240" stroke="#304262" stroke-width="1"/>'+poly+
  '<circle cx="'+last[0]+'" cy="'+last[1]+'" r="7" fill="#fff" stroke="#7949ce" stroke-width="4"/></svg>'+
  '<small class="pf-outdoor-fallback-note">Mapa de ruas indisponível. O traçado GPS continua sendo registrado.</small>';
}
function applyPolylines(points){
 if(!map||!window.L)return;
 const all=routeSegments(points).filter(part=>part.length>=2);
 while(segments.length>all.length){
  const old=segments.pop();try{map.removeLayer(old)}catch{}
 }
 all.forEach((part,i)=>{
  if(!segments[i])segments[i]=window.L.polyline(part,{color:"#74ffe0",weight:5,opacity:.95}).addTo(map);
  else segments[i].setLatLngs(part);
 });
}

async function updateMap(point){
 const container=document.getElementById("pf-outdoor-map");
 if(!container||!el?.isConnected||!(view==="tracker"||view==="completed"||view==="detail"))return;
 const pts=openedHistory?.points||activity?.points||[];
 if(!point&&!pts.length)return;
 const ok=await loadLeaflet();
 if(!el?.isConnected||!document.getElementById("pf-outdoor-map"))return;
 if(!ok){drawFallback(pts);return}
 const L=window.L;
 if(!map){
  container.innerHTML="";
  map=L.map(container,{zoomControl:true,attributionControl:true,preferCanvas:true}).setView([point?.[0]||pts[0][0],point?.[1]||pts[0][1]],16);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
   maxZoom:19}).addTo(map);
  map.on("dragstart",()=>{follow=false});
  setTimeout(()=>{try{map.invalidateSize()}catch{}},250);
 }
 applyPolylines(pts);
 const p=point||pts[pts.length-1];
 if(p){
  if(!currentMarker)currentMarker=L.circleMarker([p[0],p[1]],{radius:8,weight:3,color:"#fff",fillColor:"#795aff",fillOpacity:1}).addTo(map);
  else currentMarker.setLatLng([p[0],p[1]]);
  const accuracy=p[3];
  if(Number.isFinite(accuracy)){
   if(!accuracyCircle)accuracyCircle=L.circle([p[0],p[1]],{radius:accuracy,weight:1,color:"#6becc8",fillOpacity:.09}).addTo(map);
   else accuracyCircle.setLatLng([p[0],p[1]]).setRadius(accuracy);
  }
  if(follow&&view==="tracker")map.setView([p[0],p[1]],Math.max(map.getZoom(),16),{animate:false});
 }
 if(view!=="tracker"&&pts.length>1){
  const bounds=L.latLngBounds(pts.map(x=>[x[0],x[1]]));
  if(bounds.isValid())map.fitBounds(bounds.pad(.18),{maxZoom:16});
 }
}
function chooseStats(s){
 return '<div class="pf-outdoor-summary-grid">'+
 '<div><small>Distância GPS</small><strong>'+nf(s.distanceM/1000,2)+' km</strong></div>'+
 '<div><small>Duração ativa</small><strong>'+clock(s.durationSec)+'</strong></div>'+
 '<div><small>Velocidade média</small><strong>'+nf(s.avgSpeedKmh,1)+' km/h</strong></div>'+
 '<div><small>Ritmo médio</small><strong>'+pace(s.distanceM,s.durationSec)+'</strong></div>'+
 '<div><small>Calorias estimadas</small><strong>'+(s.estimatedKcal==null?"Não calculadas":"≈ "+nf(s.estimatedKcal,0)+" kcal")+'</strong></div>'+
 '<div><small>Ganho de altitude</small><strong>'+(s.elevationGainM==null?"Não estimado":"≈ "+nf(s.elevationGainM,0)+" m")+'</strong></div>'+
 '<div><small>Passos estimados</small><strong>'+(s.estimatedSteps==null?"Não se aplica":"≈ "+Math.round(s.estimatedSteps).toLocaleString("pt-BR"))+'</strong></div>'+
 '<div><small>Andares equivalentes</small><strong>'+(s.floorsEquivalent==null?"Não estimado":"≈ "+Math.floor(s.floorsEquivalent))+'</strong></div></div>';
}
function summaryFromCurrent(){
 return {sport:activity.kind,durationSec:Math.max(0,Math.round(activity.activeMs/1000)),distanceM:activity.distance,
  avgSpeedKmh:activity.distance/1000/Math.max(activity.activeMs/3600000,1/3600),
  estimatedKcal:calories(),elevationGainM:activity.ascent>0?activity.ascent:null,accuracyM:activity.gpsAccuracy,
  gpsSamples:activity.points.length,points:activity.points,estimatedSteps:stepsEstimated()?.value??null,
  floorsEquivalent:floorsEstimated(),stepSource:activity.motionActive?"motion_estimate":"gps_stride_estimate"};
}
function offlineSummary(s){
 const dist=nf(s.distanceM/1000,2),time=Math.round(s.durationSec/60),velocity=nf(s.avgSpeedKmh,1);
 return "Resumo objetivo: "+dist+" km registrados em "+time+" minutos de atividade, com velocidade média aproximada de "+velocity+" km/h. "+
  (s.distanceM<200?"Percurso curto: a precisão GPS pode influenciar muito a distância. ":"")+
  "A qualidade do sinal e as pausas afetam as estimativas. Faça uma progressão gradual conforme seu conforto e recuperação.";
}
function showCompleted(){
 view="completed";layout();const box=document.getElementById("pf-outdoor-body"),s=summaryFromCurrent();
 destroyMap();
 box.innerHTML='<div class="pf-outdoor-complete"><span aria-hidden="true">🏁</span><h3>Atividade finalizada</h3><p>Confira suas medidas e escolha salvar na sua conta ou descartar.</p></div>'+
 mapMarkup()+chooseStats(s)+
 '<p class="pf-outdoor-foot">Os valores são aproximações do GPS. Não representam passos, frequência cardíaca, suor, gordura ou calorias fisiologicamente medidas.</p>'+
 '<section class="pf-outdoor-ai"><h3>✨ Resumo do desempenho</h3><p id="pf-outdoor-analysis">'+esc(offlineSummary(s))+'</p></section>'+
 '<div class="pf-outdoor-actions"><button type="button" id="pf-outdoor-save" class="pf-outdoor-primary">💾 Salvar percurso e gerar análise IA</button>'+
 '<button type="button" id="pf-outdoor-export" class="pf-outdoor-secondary">Exportar GPX</button>'+
 '<button type="button" id="pf-outdoor-discard" class="pf-outdoor-danger">Descartar</button></div>'+
 '<p id="pf-outdoor-save-status" role="status" aria-live="polite"></p>';
 box.querySelector("#pf-outdoor-save").addEventListener("click",save);
 box.querySelector("#pf-outdoor-export").addEventListener("click",()=>exportGPX(s));
 box.querySelector("#pf-outdoor-discard").addEventListener("click",()=>{if(confirm("Descartar este trajeto sem salvar?")){activity=null;showChooser()}});
 box.querySelector("#pf-outdoor-follow").addEventListener("click",()=>{follow=true;void updateMap(null)});
 void updateMap(null);
}
function saveStatus(t){const x=document.getElementById("pf-outdoor-save-status");if(x)x.textContent=t}
async function save(){
 if(!activity||activity.saved)return;
 if(activity.points.length<2||activity.distance<10){saveStatus("É necessário registrar um percurso GPS válido de pelo menos 10 metros antes de salvar.");return}
 const btn=document.getElementById("pf-outdoor-save");if(btn)btn.disabled=true;
 saveStatus("Salvando seu trajeto privadamente…");
 const s=summaryFromCurrent();
 try{
  const payload={clientKey:activity.key,sport:activity.kind,durationSec:Math.max(30,s.durationSec),
   points:activity.points,estimatedKcal:s.estimatedKcal,elevationGainM:s.elevationGainM,accuracyM:s.accuracyM,
   estimatedSteps:s.estimatedSteps,floorsEquivalent:s.floorsEquivalent,stepSource:s.stepSource};
  const d=await request("/api/fitness/outdoor",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  activity.saved=true;activity.savedId=d.id;
  saveStatus("Trajeto salvo na sua conta. Gerando análise de desempenho com a IA…");
  if(btn){btn.textContent="✓ Percurso salvo";btn.disabled=true}
  await loadHistory();
  try{
   const result=await request("/api/fitness/outdoor/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:d.id})});
   const p=document.getElementById("pf-outdoor-analysis");if(p)p.textContent=result.analysis;
   saveStatus("Análise IA concluída. Suas coordenadas não foram enviadas à IA.");
  }catch(e){saveStatus("Percurso salvo. IA indisponível agora: "+e.message+" O resumo objetivo continua disponível.");}
 }catch(e){saveStatus("Não foi possível salvar: "+e.message);if(btn)btn.disabled=false}
}
function exportGPX(s){
 const pts=s.points||[],sport=s.sport;
 if(!pts.length)return;
 const date=new Date().toISOString(),sportName=sport==="walk"?"Caminhada":sport==="run"?"Corrida":"Bicicleta";
 const xml=['<?xml version="1.0" encoding="UTF-8"?>','<gpx version="1.1" creator="PulsoFit AI" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>'+sportName+'</name><time>'+date+'</time></metadata><trk><name>'+sportName+'</name><trkseg>'];
 for(const p of pts){
  if(p[5])xml.push("</trkseg><trkseg>");
  xml.push('<trkpt lat="'+Number(p[0]).toFixed(6)+'" lon="'+Number(p[1]).toFixed(6)+'">'+
   (p[4]!==null&&Number.isFinite(p[4])?'<ele>'+p[4]+'</ele>':"")+
   '<time>'+new Date(p[2]).toISOString()+'</time></trkpt>');
 }
 xml.push('</trkseg></trk></gpx>');
 const obj=new Blob([xml.join("")],{type:"application/gpx+xml"});
 const url=URL.createObjectURL(obj),a=document.createElement("a");a.href=url;a.download="pulsofit-"+sport+"-"+new Date().toISOString().slice(0,10)+".gpx";
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function showHistory(){
 view="history";layout();destroyMap();const box=document.getElementById("pf-outdoor-body");
 const list=history.map(s=>{
  const name=labels[s.sport]?.[1]||"Atividade";
  const date=new Date(s.recordedAt);const when=Number.isNaN(date.getTime())?"":date.toLocaleString("pt-BR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
  return '<button type="button" class="pf-outdoor-history-row" data-pf-outdoor-id="'+esc(s.id)+'">'+
   '<span aria-hidden="true">'+(labels[s.sport]?.[0]||"📍")+'</span><span><strong>'+esc(name)+'</strong><small>'+esc(when)+' · '+nf(s.distanceM/1000,2)+' km · '+clock(s.durationSec)+'</small></span><span aria-hidden="true">›</span></button>';
 }).join("");
 box.innerHTML='<div class="pf-outdoor-intro"><h3>Seu histórico de atividades</h3><p>Percursos privados, salvos somente quando você confirma.</p></div>'+
 (historyError?'<p class="pf-outdoor-error">'+esc(historyError)+'</p>':"")+
 '<div class="pf-outdoor-history">'+(list||'<p class="pf-outdoor-empty">Nenhum percurso salvo ainda. Sua primeira atividade aparecerá aqui.</p>')+'</div>'+
 '<div class="pf-outdoor-actions"><button id="pf-outdoor-new" class="pf-outdoor-primary" type="button">+ Nova atividade</button></div>';
 box.querySelector("#pf-outdoor-new").addEventListener("click",()=>{activity=null;showChooser()});
 box.querySelectorAll("[data-pf-outdoor-id]").forEach(b=>b.addEventListener("click",()=>{void detail(b.dataset.pfOutdoorId)}));
}
async function detail(id){
 view="detail";layout();destroyMap();
 const box=document.getElementById("pf-outdoor-body");box.innerHTML='<p class="pf-outdoor-empty">Carregando percurso privado…</p>';
 try{
  const d=await request("/api/fitness/outdoor?id="+encodeURIComponent(id));openedHistory=d.session;
  const s=openedHistory;
  box.innerHTML='<div class="pf-outdoor-intro"><h3>'+esc(labels[s.sport]?.[1]||"Atividade")+'</h3><p>Trajeto registrado em '+esc(new Date(s.recordedAt).toLocaleString("pt-BR"))+'</p></div>'+
   mapMarkup()+chooseStats(s)+
   '<section class="pf-outdoor-ai"><h3>✨ Análise de desempenho</h3><p id="pf-outdoor-analysis">'+esc(s.analysis||offlineSummary(s))+'</p></section>'+
   '<p class="pf-outdoor-foot">Mapa recuperado da sua conta. Coordenadas não são compartilhadas com a IA. A exibição dos mapas utiliza OpenStreetMap.</p>'+
   '<div class="pf-outdoor-actions"><button id="pf-outdoor-back" class="pf-outdoor-secondary" type="button">Voltar ao histórico</button>'+
   '<button id="pf-outdoor-export" class="pf-outdoor-secondary" type="button">Exportar GPX</button>'+
   '<button id="pf-outdoor-delete" class="pf-outdoor-danger" type="button">Excluir percurso</button></div><p id="pf-outdoor-save-status" role="status"></p>';
  box.querySelector("#pf-outdoor-back").addEventListener("click",showHistory);
  box.querySelector("#pf-outdoor-follow").addEventListener("click",()=>{follow=true;void updateMap(null)});
  box.querySelector("#pf-outdoor-export").addEventListener("click",()=>exportGPX(s));
  box.querySelector("#pf-outdoor-delete").addEventListener("click",()=>{void removeSaved(s.id)});
  void updateMap(null);
 }catch(e){box.innerHTML='<p class="pf-outdoor-error">'+esc(e.message)+'</p><button type="button" id="pf-outdoor-back" class="pf-outdoor-secondary">Voltar</button>';box.querySelector("#pf-outdoor-back").addEventListener("click",showHistory)}
}
async function removeSaved(id){
 if(!confirm("Excluir permanentemente este percurso GPS do histórico da sua conta?"))return;
 saveStatus("Excluindo percurso…");
 try{
  await request("/api/fitness/outdoor?id="+encodeURIComponent(id),{method:"DELETE"});
  openedHistory=null;history=history.filter(x=>x.id!==id);showHistory();
 }catch(e){saveStatus("Falha ao excluir: "+e.message)}
}
function open(){
 if(!logged())return;
 layout();showChooser();
 void readAssessment();void loadHistory();
}
function placeLaunch(){
 if(!logged())return;
 const app=document.getElementById("app");if(!app)return;
 if(!["home","workouts"].includes(route()))return;
 const main=app.querySelector(".main")||app.querySelector("main");
 if(!main||main.querySelector("#pf-outdoor-launch"))return;
 const b=document.createElement("button");b.type="button";b.id="pf-outdoor-launch";b.className="pf-outdoor-launch";
 b.innerHTML='<span aria-hidden="true">🗺️</span><span><strong>Explorar ao ar livre <small>GPS LIVE</small></strong>'+
  '<em>Caminhada • Corrida • Bicicleta · rota, mapa, tempo e desempenho</em></span><span aria-hidden="true">›</span>';
 b.addEventListener("click",open);
 const greeting=main.querySelector("#pf-home-welcome");
 if(greeting)greeting.insertAdjacentElement("afterend",b);
 else main.insertBefore(b,main.firstElementChild);
}
function schedule(){
 if(scheduled)return;scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;try{placeLaunch()}catch{}});
}
function boot(){
 const app=document.getElementById("app");
 if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
 window.addEventListener("hashchange",schedule);
 window.addEventListener("pageshow",schedule);
 window.addEventListener("pulso-auth-ready",schedule);
 window.addEventListener("pulso-open-outdoor",open);
 document.addEventListener("visibilitychange",()=>{
  if(document.hidden&&activity?.state==="running"){
   pause();setStatus("A atividade foi pausada ao sair da tela. O Safari não garante GPS em segundo plano. Toque em Retomar quando voltar.",true);
  }
 });
 window.addEventListener("pagehide",()=>{if(activity?.state==="running")pause()});
 window.addEventListener("beforeunload",e=>{if(activity?.state==="running"&&!activity.saved){e.preventDefault();e.returnValue=""}});
 schedule();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
