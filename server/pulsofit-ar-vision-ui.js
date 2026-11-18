/* REAL on-device AI body tracking with MediaPipe Pose Landmarker (33 landmarks).
 * No imagery or landmarks uploaded to PulsoFit. Optional, explicit camera consent.
 * Existing 3D preview remains usable even if inference is unavailable.
 */
(function(){
 "use strict";
 if(window.__PF_AR_LIVE_VISION__)return;window.__PF_AR_LIVE_VISION__=true;
 const $=id=>document.getElementById(id);
 const modelUrl="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
 const libUrl="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs";
 const wasmUrl="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
 const tips={
  squat:"Câmera lateral, corpo inteiro visível. Dobre os joelhos com controle e volte a ficar em pé.",
  lunge:"Câmera lateral, ambos os pés visíveis. Desça suavemente e retorne. A IA não julga a carga ou segurança do exercício.",
  jumping_jack:"Fique a alguns passos da câmera. Abra os pés e eleve ambos os braços; volte à posição inicial.",
  curl:"Mostre ombros, cotovelos e punhos. Estenda e flexione o braço sem forçar a articulação.",
  arm_raise:"Mostre braços inteiros. Eleve lateralmente até a altura dos ombros e retorne devagar.",
  pushup:"Coloque a câmera de lado, mostrando ombros, quadril e tornozelos. Flexione e estenda os braços.",
  plank:"Coloque a câmera de lado, mostrando o corpo inteiro. O cronômetro só avança quando os pontos detectados indicam sustentação.",
  march:"A câmera pode mostrar os pontos do corpo; a contagem automática de marcha ainda não está validada.",
  bridge:"A câmera pode mostrar os pontos do corpo; a contagem automática de ponte de glúteos ainda não está validada."
 };
 let detector=null,runId=0,active=false,loading=false,raf=0,lastFrame=-1,lastInfer=0,mounted=false,overlay=null;
 let lastExercise="",state={reps:0,phase:"up",last:0,holdMs:0,holdAt:0},lastHint="",missingSince=0;
 const metrics=()=>window.PulsoPoseMetrics;
 function announce(value){
  const el=$("pf-ar-vision-status");if(el)el.textContent=value;
 }
 function renderCount(){
  const count=$("pf-ar-vision-count"),label=$("pf-ar-vision-count-label");
  if(!count||!label)return;
  if(lastExercise==="plank"){count.textContent=Math.floor(state.holdMs/1000)+"s";label.textContent="tempo analisado em postura"}
  else{count.textContent=String(state.reps);label.textContent="repetições reconhecidas"}
 }
 function reset(exercise){
  lastExercise=exercise||"squat";
  state={reps:0,phase:"up",last:0,holdMs:0,holdAt:0};
  renderCount();
  const guide=$("pf-ar-vision-guide");if(guide)guide.textContent=tips[lastExercise]||tips.squat;
  const m=$("pf-ar-vision-mode");if(m)m.textContent=lastExercise==="plank"?"Prancha • sustentação":tips[lastExercise]?.includes("não está validada")?"Acompanhamento visual":"Contagem por movimento";
 }
 function sizeCanvas(canvas,video){
  const w=canvas.parentElement.clientWidth,h=canvas.parentElement.clientHeight;
  const scale=Math.min(2,window.devicePixelRatio||1);
  const W=Math.round(w*scale),H=Math.round(h*scale);
  if(W!==canvas.width||H!==canvas.height){canvas.width=W;canvas.height=H}
  const ctx=canvas.getContext("2d");
  ctx.setTransform(scale,0,0,scale,0,0);
  return {ctx,w,h,videoWidth:video.videoWidth||w,videoHeight:video.videoHeight||h};
 }
 function renderPose(points,video){
  const canvas=$("pf-ar-vision-canvas");if(!canvas)return;
  const {ctx,w,h,videoWidth:vw,videoHeight:vh}=sizeCanvas(canvas,video);
  ctx.clearRect(0,0,w,h);
  if(!points?.length)return;
  const scale=Math.max(w/vw,h/vh);
  const offX=(w-vw*scale)/2,offY=(h-vh*scale)/2;
  const xy=p=>[p.x*vw*scale+offX,p.y*vh*scale+offY];
  const visible=metrics()?.visible;
  ctx.lineWidth=3;ctx.strokeStyle="#9bffe1";ctx.fillStyle="#b4f3ff";
  ctx.shadowBlur=7;ctx.shadowColor="#003b42";
  for(const [a,b] of metrics()?.pairs||[]){
   if(!visible?.(points,[a,b],.55))continue;
   const u=xy(points[a]),v=xy(points[b]);
   ctx.beginPath();ctx.moveTo(u[0],u[1]);ctx.lineTo(v[0],v[1]);ctx.stroke();
  }
  for(const id of [11,12,13,14,15,16,23,24,25,26,27,28]){
   if(!visible?.(points,[id],.55))continue;
   const p=xy(points[id]);
   ctx.beginPath();ctx.arc(p[0],p[1],4.3,0,Math.PI*2);ctx.fill();
  }
  ctx.shadowBlur=0;
 }
 function changeState(next){
  const activeClass=document.getElementById("pf-ar-overlay");
  if(activeClass)activeClass.classList.toggle("pf-ar-vision-active",next);
  const toggle=$("pf-ar-vision-start");if(toggle){toggle.textContent=next?"⏹ Parar análise de movimento":"✨ Iniciar análise corporal por IA";toggle.setAttribute("aria-pressed",String(next));toggle.disabled=loading}
  const scope=$("pf-ar-vision-panel");if(scope)scope.dataset.state=next?"active":"idle";
 }
 function stop(){
  active=false;runId++;
  cancelAnimationFrame(raf);raf=0;lastFrame=-1;lastInfer=0;
  if(detector){try{detector.close()}catch{}detector=null}
  const canvas=$("pf-ar-vision-canvas");canvas?.getContext("2d")?.clearRect(0,0,canvas.width,canvas.height);
  changeState(false);
  if($("pf-ar-vision-status"))announce("Análise parada. A câmera pode continuar aberta para a demonstração 3D; feche a janela para desligá-la.");
 }
 function lost(){
  const el=$("pf-ar-overlay");
  if(overlay&&overlay!==el){stop();overlay=null;mounted=false}
 }
 function cue(reading){
  const result=$("pf-ar-vision-cue");if(!result)return;
  const next=reading?.signal||"Posicione o corpo inteiro na câmera.";
  if(next!==lastHint){lastHint=next;result.textContent=next}
 }
 function loop(id){
  if(!active||id!==runId)return;
  const modal=$("pf-ar-overlay"),video=$("pf-ar-video");
  if(!modal||!video){stop();return}
  const choice=$("pf-ar-exercise")?.value||"squat";
  if(choice!==lastExercise)reset(choice);
  const now=performance.now();
  if(!document.hidden&&video.readyState>=2&&video.videoWidth>0&&video.currentTime!==lastFrame&&now-lastInfer>=125){
   lastFrame=video.currentTime;lastInfer=now;
   try{
    const output=detector.detectForVideo(video,now);
    const pose=output.landmarks?.[0]||[];
    renderPose(pose,video);
    const measure=metrics()?.analyze(choice,pose);
    if(measure){
     // Full-body visibility gate. Never claim a completed repetition if lost.
     if(measure.state==="missing"){
      if(!missingSince)missingSince=now;
      if(now-missingSince>1000)cue(measure);
     }else{
      missingSince=0;
      state=metrics().advance(state,measure,now);
      renderCount();cue(measure);
     }
     const feedback=$("pf-ar-vision-quality");
     if(feedback)feedback.textContent=measure.metric===null?"IA acompanha os pontos do corpo":Number.isFinite(measure.metric)?
      (choice==="jumping_jack"?"Abertura dos pés • "+measure.metric+"×":"Ângulo observado • "+measure.metric+"°"):"Sem medida";
    }
   }catch{
    stop();announce("A análise corporal parou por uma falha de inferência. A câmera e o treinador 3D continuam disponíveis.");return;
   }
  }
  raf=requestAnimationFrame(()=>loop(id));
 }
 async function waitForCamera(id){
  const video=$("pf-ar-video");
  if(!video)return false;
  if(video.readyState>=2&&video.videoWidth>0)return true;
  $("pf-ar-camera")?.click();
  for(let i=0;i<26;i++){
   if(id!==runId||!$("pf-ar-overlay"))return false;
   if(video.readyState>=2&&video.videoWidth>0)return true;
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  return false;
 }
 async function start(){
  if(active){stop();return}
  if(loading)return;
  if(!$("pf-ar-vision-optin")?.checked){announce("Marque a autorização da análise corporal no aparelho antes de iniciar.");return}
  if(!metrics()){announce("Módulo de métricas corporais não carregou.");return}
  loading=true;const id=++runId;changeState(false);
  const button=$("pf-ar-vision-start");if(button)button.disabled=true;
  announce("Abrindo a câmera e carregando o modelo de IA corporal neste aparelho…");
  try{
   if(!await waitForCamera(id))throw Error("A câmera não ficou disponível. Ative-a e autorize o acesso nas configurações do navegador.");
   if(id!==runId)return;
   const pkg=await import(libUrl);
   if(id!==runId)return;
   const files=await pkg.FilesetResolver.forVisionTasks(wasmUrl);
   if(id!==runId)return;
   let engine;
   try{
    engine=await pkg.PoseLandmarker.createFromOptions(files,{
     baseOptions:{modelAssetPath:modelUrl,delegate:"GPU"},runningMode:"VIDEO",numPoses:1,
     minPoseDetectionConfidence:.55,minPosePresenceConfidence:.55,minTrackingConfidence:.55
    });
   }catch{
    engine=await pkg.PoseLandmarker.createFromOptions(files,{
     baseOptions:{modelAssetPath:modelUrl,delegate:"CPU"},runningMode:"VIDEO",numPoses:1,
     minPoseDetectionConfidence:.55,minPosePresenceConfidence:.55,minTrackingConfidence:.55
    });
   }
   if(id!==runId){engine.close();return}
   detector=engine;active=true;reset($("pf-ar-exercise")?.value||"squat");
   changeState(true);
   announce("✓ IA real ligada (MediaPipe Pose Landmarker). Aguarde aparecer o esqueleto sobre o seu corpo; tudo é analisado no aparelho.");
   loop(id);
  }catch(err){
   if(id===runId)announce("Não foi possível carregar a IA de movimentos: "+String(err.message||"falha desconhecida")+". A demonstração 3D permanece disponível.");
  }finally{
   loading=false;
   if(id===runId)changeState(active);
  }
 }
 function mount(){
  const modal=$("pf-ar-overlay");
  if(!modal){lost();return}
  if(overlay!==modal){lost();overlay=modal;mounted=false}
  if(mounted||$("pf-ar-vision-panel"))return;
  const stage=modal.querySelector(".pf-ar-stage"),controls=modal.querySelector(".pf-ar-controls");
  if(!stage||!controls)return;
  mounted=true;
  const canvas=document.createElement("canvas");canvas.id="pf-ar-vision-canvas";canvas.setAttribute("aria-hidden","true");stage.appendChild(canvas);
  const badge=document.createElement("span");badge.id="pf-ar-ai-badge";badge.textContent="IA de movimento • desligada";stage.appendChild(badge);
  const panel=document.createElement("section");panel.id="pf-ar-vision-panel";panel.dataset.state="idle";
  panel.innerHTML='<div class="pf-ar-vision-head"><div><small>✦ VISÃO COMPUTACIONAL REAL</small>'+
   '<h3>Coach IA de movimento</h3><p>Reconhece pontos do corpo pela câmera e acompanha fases do exercício em tempo real.</p></div>'+
   '<span class="pf-ar-vision-source">33 pontos corporais</span></div>'+
   '<div class="pf-ar-vision-dashboard"><div class="pf-ar-vision-counter"><span id="pf-ar-vision-count">0</span><small id="pf-ar-vision-count-label">repetições reconhecidas</small></div>'+
   '<div class="pf-ar-vision-instruction"><strong id="pf-ar-vision-mode">Contagem por movimento</strong><p id="pf-ar-vision-guide"></p>'+
   '<p id="pf-ar-vision-cue" aria-live="polite">Para começar, ative a câmera e autorize a IA.</p></div></div>'+
   '<label class="pf-ar-vision-permission"><input id="pf-ar-vision-optin" type="checkbox"><span>Autorizo a análise dos meus movimentos pela IA <strong>neste aparelho</strong>. Nenhuma imagem do vídeo será enviada ao PulsoFit.</span></label>'+
   '<div class="pf-ar-vision-actions"><button type="button" id="pf-ar-vision-start">✨ Iniciar análise corporal por IA</button>'+
   '<button type="button" id="pf-ar-vision-clear">↺ Zerar contagem</button></div>'+
   '<p id="pf-ar-vision-quality"></p><p id="pf-ar-vision-status" role="status" aria-live="polite">A análise é opcional. Use preferencialmente a câmera frontal, com todo o corpo visível.</p>'+
   '<small class="pf-ar-vision-disclaimer">O modelo MediaPipe é baixado somente após autorização. Os resultados são estimativas visuais, não garantem execução segura e não substituem um treinador. Não armazenamos fotos, vídeo ou coordenadas corporais. A biblioteca pode enviar diagnósticos técnicos próprios conforme sua política de privacidade. iOS Safari não oferece ancoragem ARKit ao chão nesta versão web.</small>';
  controls.insertBefore(panel,controls.firstChild);
  panel.querySelector("#pf-ar-vision-start").addEventListener("click",()=>void start());
  panel.querySelector("#pf-ar-vision-clear").addEventListener("click",()=>{reset($("pf-ar-exercise")?.value||"squat");announce("Contagem zerada pelo usuário.")});
  panel.querySelector("#pf-ar-vision-optin").addEventListener("change",e=>{if(!e.target.checked&&active)stop()});
  modal.querySelector("#pf-ar-close")?.addEventListener("click",stop);
  modal.querySelector("#pf-ar-facing")?.addEventListener("click",()=>{if(active){stop();announce("Câmera alterada. Inicie novamente a análise para recalibrar.")}});
  reset($("pf-ar-exercise")?.value||"squat");
  changeState(false);
 }
 function boot(){
  const style=document.createElement("style");style.id="pf-ar-ai-vision-style";
  style.textContent=
   '#pf-ar-vision-panel{display:grid;gap:12px;background:linear-gradient(125deg,#1e294a,#172e3e);border:1.5px solid #86d9c0;border-radius:17px;padding:15px;min-width:0}'+
   '#pf-ar-vision-panel *{box-sizing:border-box;min-width:0}'+
   '#pf-ar-vision-panel .pf-ar-vision-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}'+
   '#pf-ar-vision-panel .pf-ar-vision-head small{color:#b9ffe2;font:850 10px/1.3 system-ui;letter-spacing:.12em}'+
   '#pf-ar-vision-panel h3{font:900 clamp(19px,4.5vw,24px)/1.2 system-ui;margin:4px 0 6px;color:#fff}'+
   '#pf-ar-vision-panel p{font:12px/1.5 system-ui;margin:0;color:#d6e7f3}'+
   '#pf-ar-vision-panel .pf-ar-vision-source{font:800 11px system-ui;color:#9ff7d9;border:1px solid #7adbc2;border-radius:99px;padding:7px}'+
   '#pf-ar-vision-panel .pf-ar-vision-dashboard{display:grid;grid-template-columns:minmax(96px,1fr) minmax(0,2fr);gap:10px}'+
   '#pf-ar-vision-panel .pf-ar-vision-counter{padding:12px 8px;text-align:center;display:grid;align-content:center;justify-items:center;background:#122c3c;border-radius:12px;border:1px solid #4fc4a9}'+
   '#pf-ar-vision-panel #pf-ar-vision-count{font:900 clamp(29px,7vw,43px)/1 system-ui;color:#a7ffdb}'+
   '#pf-ar-vision-panel .pf-ar-vision-counter small{font:10px/1.3 system-ui;color:#cfe8e8;margin-top:6px;text-align:center}'+
   '#pf-ar-vision-panel .pf-ar-vision-instruction{background:#2e3554;border-radius:12px;padding:12px;display:grid;gap:8px;align-content:start}'+
   '#pf-ar-vision-panel .pf-ar-vision-instruction strong{font:850 13px system-ui;color:#fff}'+
   '#pf-ar-vision-panel #pf-ar-vision-cue{font:800 12px/1.5 system-ui;color:#b8ffdf}'+
   '#pf-ar-vision-panel .pf-ar-vision-permission{display:flex;align-items:flex-start;gap:10px;border:1px solid #7c9baf;border-radius:11px;background:#263854;padding:12px;font:12px/1.5 system-ui}'+
   '#pf-ar-vision-panel .pf-ar-vision-permission input{width:21px;height:21px;flex:0 0 21px;accent-color:#8bf3cc;margin:1px 0}'+
   '#pf-ar-vision-panel .pf-ar-vision-actions{display:flex;gap:8px;flex-wrap:wrap}'+
   '#pf-ar-vision-panel #pf-ar-vision-start{flex:2 1 170px;background:linear-gradient(110deg,#774adb,#9761e7)}'+
   '#pf-ar-vision-panel #pf-ar-vision-clear{flex:1 1 110px;background:#273b54}'+
   '#pf-ar-vision-panel #pf-ar-vision-status{color:#baffd8;font:800 12px/1.5 system-ui}'+
   '#pf-ar-vision-panel .pf-ar-vision-disclaimer{font:11px/1.5 system-ui;color:#c2cfe0}'+
   '#pf-ar-overlay #pf-ar-vision-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6}'+
   '#pf-ar-overlay #pf-ar-ai-badge{position:absolute;top:9px;left:10px;z-index:7;background:#13243dd9;border:1px solid #7bdcc0;border-radius:9px;padding:6px 9px;font:800 11px system-ui;color:#bbffe0}'+
   '#pf-ar-overlay.pf-ar-vision-active #pf-ar-ai-badge{background:#175444de}'+
   '#pf-ar-overlay.pf-ar-vision-active #pf-ar-canvas{opacity:.20;transition:opacity .2s ease}'+
   '#pf-ar-overlay.pf-ar-vision-active #pf-ar-ai-badge::after{content:" • REAL";color:#e3fff4}'+
   '@media(max-width:390px){#pf-ar-vision-panel .pf-ar-vision-dashboard{grid-template-columns:1fr 1.7fr}}';
  document.head.appendChild(style);
  const observer=new MutationObserver(()=>{if(!$("pf-ar-overlay"))lost();else if(!$("pf-ar-vision-panel"))mount()});
  observer.observe(document.body,{childList:true,subtree:false});
  window.addEventListener("pulso-open-camera-ar",()=>setTimeout(mount,0));
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&active){stop();announce("Análise interrompida ao sair da tela. Inicie novamente ao retornar.")}});
  window.addEventListener("pagehide",stop);
  mount();
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();