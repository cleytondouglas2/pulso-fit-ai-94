/* PulsoFit • Real human in camera
 * Documentary exercise footage with source and license attribution.
 * Optionally removes the original video backdrop with MediaPipe ImageSegmenter
 * on-device. No generated "human" is mislabeled as a real person.
 */
(function(){
"use strict";
if(window.__PULSO_CARTOON_PREFERRED__)return; // Legacy filmed-instructor mode disabled for cartoon AR.
if(window.__PULSO_REAL_PERSON_AR__)return;
window.__PULSO_REAL_PERSON_AR__=true;
const $=id=>document.getElementById(id);
const footage=Object.freeze({
 squat:{file:"Squats Wikipedia.webm",src:"https://upload.wikimedia.org/wikipedia/commons/2/21/Squats_Wikipedia.webm",title:"Agachamento — pessoa real",creator:"CRiles23",license:"CC BY-SA 3.0",licenseUrl:"https://creativecommons.org/licenses/by-sa/3.0/"},
 lunge:{file:"Strength Training Circuit- Forward Lunge.webm",src:"https://upload.wikimedia.org/wikipedia/commons/5/57/Strength_Training_Circuit-_Forward_Lunge.webm",title:"Afundo frontal — pessoa real",creator:"U.S. Army / Army Combat Fitness Test",license:"Domínio público (governo dos EUA)",licenseUrl:"https://commons.wikimedia.org/wiki/Commons:Licensing"},
 pushup:{file:"Muscle Strengthening at Home - Push-ups.webm",src:"https://upload.wikimedia.org/wikipedia/commons/1/18/Muscle_Strengthening_at_Home_-_Push-ups.webm",title:"Flexão — pessoa real",creator:"Centers for Disease Control and Prevention (CDC)",license:"Domínio público (governo dos EUA)",licenseUrl:"https://commons.wikimedia.org/wiki/Commons:Licensing"},
 jumping_jack:{file:"Jumping jacks and burpees.webm",src:"https://upload.wikimedia.org/wikipedia/commons/5/57/Jumping_jacks_and_burpees.webm",title:"Polichinelos e burpees — demonstração mista",creator:"Taco Fleur / Cavemantraining",license:"CC BY-SA 4.0",licenseUrl:"https://creativecommons.org/licenses/by-sa/4.0/"},
 curl:{file:"Muscle Strengthening at Home - Bicep Curls.webm",src:"https://upload.wikimedia.org/wikipedia/commons/4/44/Muscle_Strengthening_at_Home_-_Bicep_Curls.webm",title:"Rosca bíceps — pessoa real",creator:"Centers for Disease Control and Prevention (CDC)",license:"Domínio público (governo dos EUA)",licenseUrl:"https://commons.wikimedia.org/wiki/Commons:Licensing"}
});
function page(f){return "https://commons.wikimedia.org/wiki/File:"+encodeURIComponent(f).replace(/%20/g,"_")}
// Media URLs come from the original-file links on the cited Commons pages.
const model="https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";
const moduleUrl="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs";
const wasmUrl="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
let host=null,clip=null,sourceId="",userFileUrl="",kind="real",seg=null,segLoading=false,segActive=false,renderId=0,raf=0,lastFrameTime=-1,lastInference=0,paused=false,broken=false;
let maskCanvas=null,maskCtx=null,videoCanvas=null,videoCtx=null,lastMediaRequest=0;
function notice(s){const p=$("pf-real-person-status");if(p)p.textContent=s}
function resetModel(){
 segActive=false;segLoading=false;renderId++;
 cancelAnimationFrame(raf);raf=0;lastFrameTime=-1;
 try{seg?.close()}catch{}
 seg=null;
 const cut=$("pf-real-cutout");if(cut){cut.hidden=true;cut.getContext("2d")?.clearRect(0,0,cut.width,cut.height)}
 updateModes();
}
function revokeUserFile(){
 if(userFileUrl){URL.revokeObjectURL(userFileUrl);userFileUrl=""}
}
function close(){
 resetModel();
 if(clip){clip.pause();clip.src="";clip.load();clip=null}
 revokeUserFile();sourceId="";host=null;paused=false;
}
function applyMode(){
 const overlay=$("pf-ar-overlay");
 if(!overlay)return;
 overlay.classList.toggle("pf-real-person-selected",kind==="real");
 overlay.classList.toggle("pf-real-3d-selected",kind!=="real");
 const fallback=$("pf-ar-fallback");
 if(fallback)fallback.style.display=kind==="real"?"none":"";
 const selector=$("pf-real-person-mode");if(selector)selector.value=kind;
 const cut=$("pf-real-cutout");
 if(cut)cut.hidden=kind!=="real"||!segActive;
 if(clip){clip.hidden=kind!=="real";clip.style.opacity=segActive?"0":"1";}
 updateModes();
}
function updateModes(){
 const b=$("pf-real-segment-button");
 if(b){b.disabled=segLoading||kind!=="real"||!clip?.videoWidth||broken;
 b.textContent=segLoading?"Carregando IA…":segActive?"✓ Pessoa recortada por IA":"✂️ Recortar fundo com IA"}
 const start=$("pf-real-start");
 if(start)start.textContent=paused?"▶ Continuar demonstração":"⏸ Pausar demonstração";
}
function attribution(source){
 const box=$("pf-real-credit");if(!box)return;
 box.replaceChildren();
 if(!source){box.textContent="Ainda não há vídeo real para este exercício. Envie um vídeo próprio autorizado ou escolha o avatar ilustrativo.";return}
 const title=document.createElement("strong");title.textContent=source.title;
 const creator=document.createElement("span");creator.textContent="Gravação: "+source.creator+" · ";
 const link=document.createElement("a");link.href=page(source.file);link.target="_blank";link.rel="noopener noreferrer";link.textContent="Ver vídeo e autor";
 const rights=document.createElement("a");rights.href=source.licenseUrl;rights.rel="noopener noreferrer";rights.target="_blank";rights.textContent=source.license;
 const note=document.createElement("small");note.textContent="Fonte: Wikimedia Commons. Se ativar recorte, a aparência da gravação será modificada localmente por IA. Atribuição e termos da licença acima.";
 box.append(title,creator,link,document.createTextNode(" · "),rights,note);
}
function failed(error){
 broken=true;resetModel();
 if(clip){clip.hidden=true}
 notice(error||"Não foi possível carregar o vídeo remoto. Escolha um vídeo próprio MP4 ou veja a fonte nos créditos.");
 const unavailable=$("pf-real-unavailable");if(unavailable)unavailable.hidden=false;
}
async function playVideo(){
 if(!clip)return;
 try{await clip.play();paused=false;broken=false;notice("Demonstração real reproduzindo. Ative a câmera para vê-la sobre seu ambiente.");}
 catch{paused=true;notice("Toque em ▶ Continuar para liberar a reprodução do vídeo neste celular.")}
 updateModes();
}
function changeFootage(){
 const overlay=$("pf-ar-overlay");if(!overlay)return;
 const exercise=$("pf-ar-exercise")?.value||"squat";
 const source=footage[exercise]||null;
 const note=$("pf-real-unavailable");if(note)note.hidden=!!source;
 const hint=$("pf-real-person-name");if(hint)hint.textContent=source?.title||"Nenhuma gravação disponível para este exercício";
 const userVideo=$("pf-real-person-upload");if(userVideo)userVideo.value="";
 resetModel();revokeUserFile();sourceId=exercise;
 attribution(source);
 if(!clip||kind!=="real")return;
 clip.pause();clip.removeAttribute("src");clip.load();
 if(!source){
  clip.hidden=true;
  notice("Não há gravação humana verificada para esse exercício. Use um vídeo de treinador com autorização ou ative o avatar 3D.");
  return;
 }
 broken=false;clip.crossOrigin="anonymous";clip.dataset.pfCorsRetried="";
 clip.src=source.src;clip.hidden=false;clip.load();
 void playVideo();
}
function setLocal(file){
 if(!file)return;
 if(!/^video\/(?:mp4|webm|quicktime|x-m4v)$/i.test(file.type)&&!/\.(mp4|webm|mov|m4v)$/i.test(file.name||"")){
  notice("Escolha um vídeo MP4, WebM ou MOV de uma pessoa real que você tenha direito de usar.");return;
 }
 if(file.size>160*1024*1024){notice("Vídeo muito grande: escolha uma versão de até 160 MB.");return}
 resetModel();revokeUserFile();
 userFileUrl=URL.createObjectURL(file);
 sourceId="custom";broken=false;
 if(clip){clip.pause();clip.src=userFileUrl;clip.hidden=false;clip.load();void playVideo()}
 const name=$("pf-real-person-name");if(name)name.textContent="Vídeo real escolhido: "+file.name.slice(0,60);
 const attributionBox=$("pf-real-credit");if(attributionBox)attributionBox.textContent="Vídeo local escolhido pelo usuário. Não é enviado nem armazenado no servidor. Use apenas gravações com autorização.";
 const unavailable=$("pf-real-unavailable");if(unavailable)unavailable.hidden=true;
 notice("Vídeo de pessoa real carregado deste aparelho. Você pode solicitar o recorte do fundo por IA.");
}
function dimensions(){
 const canvas=$("pf-real-cutout");
 if(!canvas||!clip)return null;
 const stage=canvas.parentElement;let width=stage.clientWidth||320,height=stage.clientHeight||400;
 // Process at screen resolution but cap pixels for mobile ML.
 const ratio=Math.min(1,680/Math.max(width,height));
 width=Math.max(1,Math.floor(width*ratio));height=Math.max(1,Math.floor(height*ratio));
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
 const videoWidth=clip.videoWidth||width,videoHeight=clip.videoHeight||height;
 const base=Math.min(width/videoWidth,height/videoHeight);
 const size=Number($("pf-real-person-size")?.value||1);
 const left=Number($("pf-real-person-x")?.value||0);
 const bottom=Number($("pf-real-person-y")?.value||0);
 const w=videoWidth*base*size,h=videoHeight*base*size;
 return {canvas,width,height,w,h,x:(width-w)/2+left*width*.22,y:(height-h)/2+bottom*height*.20};
}
function tintMask(mask){
 const w=mask.width,h=mask.height;
 if(!w||!h)return false;
 if(!maskCanvas){maskCanvas=document.createElement("canvas");maskCtx=maskCanvas.getContext("2d",{willReadFrequently:true})}
 if(maskCanvas.width!==w||maskCanvas.height!==h){maskCanvas.width=w;maskCanvas.height=h}
 const categories=mask.getAsUint8Array();
 if(!categories||categories.length!==w*h)return false;
 const pixels=maskCtx.createImageData(w,h);
 let foreground=0;
 for(let i=0;i<categories.length;i++){
  const on=categories[i]===1;
  if(on)foreground++;
  const p=i*4;pixels.data[p]=255;pixels.data[p+1]=255;pixels.data[p+2]=255;pixels.data[p+3]=on?255:0;
 }
 if(foreground<categories.length*.005||foreground>categories.length*.98)return false;
 maskCtx.putImageData(pixels,0,0);
 return true;
}
function drawMasked(){
 const d=dimensions();if(!d||!videoCanvas||!maskCanvas)return;
 const {canvas,width,height,w,h,x,y}=d;
 const ctx=canvas.getContext("2d");
 ctx.clearRect(0,0,width,height);
 // Clip the real person against an inferred alpha matte, with no background.
 videoCanvas.width=maskCanvas.width;videoCanvas.height=maskCanvas.height;
 videoCtx.drawImage(clip,0,0,videoCanvas.width,videoCanvas.height);
 videoCtx.globalCompositeOperation="destination-in";
 videoCtx.drawImage(maskCanvas,0,0,videoCanvas.width,videoCanvas.height);
 videoCtx.globalCompositeOperation="source-over";
 ctx.drawImage(videoCanvas,x,y,w,h);
}
function renderFrame(id){
 if(id!==renderId||!segActive||kind!=="real"||!clip?.videoWidth)return;
 const now=performance.now();
 if(!document.hidden&&clip.readyState>=2&&clip.currentTime!==lastFrameTime&&now-lastInference>95){
  lastInference=now;lastFrameTime=clip.currentTime;
  try{
   // The trainer video is processed locally. No webcam or user body frames
   // are sent to a remote API.
   const result=seg.segmentForVideo(clip,now);
   if(result?.categoryMask&&tintMask(result.categoryMask))drawMasked();
  }catch(e){
   resetModel();notice("Este vídeo não permite recorte por IA neste navegador. A pessoa real continua disponível com o fundo original.");return;
  }
 }
 raf=requestAnimationFrame(()=>renderFrame(id));
}
async function segment(){
 if(kind!=="real"||!clip?.videoWidth||segLoading||broken)return;
 if(segActive){resetModel();notice("Fundo original restaurado.");return}
 segLoading=true;updateModes();const id=++renderId;
 notice("Preparando recorte de fundo por inteligência artificial neste aparelho…");
 try{
  const lib=await import(moduleUrl);
  if(id!==renderId||!$("pf-ar-overlay"))return;
  const files=await lib.FilesetResolver.forVisionTasks(wasmUrl);
  if(id!==renderId)return;
  const created=await lib.ImageSegmenter.createFromOptions(files,{
   baseOptions:{modelAssetPath:model,delegate:"CPU"},runningMode:"VIDEO",outputCategoryMask:true,outputConfidenceMasks:false
  });
  if(id!==renderId){created.close();return}
  seg=created;
  videoCanvas=document.createElement("canvas");
  videoCtx=videoCanvas.getContext("2d",{willReadFrequently:true});
  segActive=true;
  applyMode();
  notice("✓ Pessoa real com fundo recortado por IA. Ajuste o tamanho e a posição para encaixá-la no ambiente. Não há detecção 3D de profundidade.");
  renderFrame(id);
 }catch{
  resetModel();
  notice("O recorte por IA não está disponível. A demonstração continua com vídeo real em tela sobreposta.");
 }finally{segLoading=false;updateModes()}
}
function mode(value){
 const next=value==="3d"?"3d":"real";
 if(next===kind)return;
 kind=next;resetModel();
 if(kind==="real"){if(!sourceId)changeFootage();else if(clip?.src)void playVideo()}
 else{clip?.pause();notice("Avatar ilustrado 3D ativado. Escolha Pessoa real para voltar à gravação.") }
 applyMode();
}
function mount(){
 const overlay=$("pf-ar-overlay");
 if(!overlay||overlay===host)return;
 close();host=overlay;kind="real";sourceId="";
 const stage=overlay.querySelector(".pf-ar-stage"),controls=overlay.querySelector(".pf-ar-controls");
 if(!stage||!controls)return;
 const humanVideo=document.createElement("video");humanVideo.id="pf-real-person-video";
 humanVideo.muted=true;humanVideo.loop=true;humanVideo.autoplay=true;humanVideo.playsInline=true;humanVideo.preload="metadata";
 humanVideo.setAttribute("playsinline","");humanVideo.setAttribute("webkit-playsinline","");
 humanVideo.setAttribute("aria-label","Pessoa real demonstrando exercício em vídeo");
 humanVideo.crossOrigin="anonymous";stage.appendChild(humanVideo);clip=humanVideo;
 const cut=document.createElement("canvas");cut.id="pf-real-cutout";cut.hidden=true;cut.setAttribute("aria-label","Vídeo de pessoa real com fundo recortado");stage.appendChild(cut);
 const holder=document.createElement("section");holder.id="pf-real-trainer-panel";
 holder.innerHTML='<header class="pf-real-head"><div><small>▶ DEMONSTRAÇÃO HUMANA · TREINOS</small><h3>Uma pessoa real no seu ambiente</h3></div><span>Vídeo real</span></header>'+
 '<p class="pf-real-intro">Treinador de verdade gravado em vídeo, não boneco de desenho. A IA pode remover o fundo para parecer que a pessoa está na sua sala.</p>'+
 '<label for="pf-real-person-mode">Tipo de treinador</label><select id="pf-real-person-mode"><option value="real">🎥 Pessoa real (vídeo)</option><option value="3d">◈ Avatar 3D ilustrado</option></select>'+
 '<p class="pf-real-person-name" id="pf-real-person-name">Escolha um exercício acima.</p>'+
 '<div class="pf-real-actions"><button id="pf-real-segment-button" type="button">✂️ Recortar fundo com IA</button><button id="pf-real-start" type="button">⏸ Pausar demonstração</button></div>'+
 '<div class="pf-real-sliders"><label for="pf-real-person-size">Tamanho da pessoa<input id="pf-real-person-size" type="range" min=".40" max="2.1" value="1.05" step=".05"></label>'+
 '<label for="pf-real-person-x">Posição lateral<input id="pf-real-person-x" type="range" min="-1.5" max="1.5" value="0" step=".05"></label>'+
 '<label for="pf-real-person-y">Altura<input id="pf-real-person-y" type="range" min="-1.5" max="1.5" value="0" step=".05"></label></div>'+
 '<label class="pf-real-upload"><strong>📁 Usar meu vídeo de treinador real</strong><input id="pf-real-local-file" type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mov"></label>'+
 '<div id="pf-real-unavailable" hidden>Sem gravação humana disponível para este movimento. Use um vídeo autorizado ou selecione o avatar.</div>'+
 '<p role="status" id="pf-real-person-status">Ative a câmera para posicionar a pessoa real sobre o ambiente.</p>'+
 '<div class="pf-real-credits" id="pf-real-credit"></div>'+
 '<small class="pf-real-warning">A imagem é sobreposta à câmera. O recorte por IA ocorre no celular e não fixa a pessoa no chão com profundidade real; ARKit nativo é necessário para rastreamento espacial. Vídeos públicos exigem internet e podem falhar no Safari. Nenhuma mídia pessoal é enviada ao servidor.</small>';
 const vision=controls.querySelector("#pf-ar-vision-panel");
 if(vision)vision.insertAdjacentElement("beforebegin",holder);else controls.insertBefore(holder,controls.firstChild);
 holder.querySelector("#pf-real-person-mode").addEventListener("change",e=>mode(e.target.value));
 holder.querySelector("#pf-real-segment-button").addEventListener("click",()=>void segment());
 holder.querySelector("#pf-real-start").addEventListener("click",()=>{if(!clip)return;if(clip.paused){void playVideo()}else{clip.pause();paused=true;notice("Demonstração pausada.")}updateModes()});
 holder.querySelector("#pf-real-local-file").addEventListener("change",e=>setLocal(e.target.files?.[0]));
 humanVideo.addEventListener("error",()=>{
  if(clip!==humanVideo||userFileUrl)return;
  const source=footage[$("pf-ar-exercise")?.value||"squat"];
  if(source&&!humanVideo.dataset.pfCorsRetried){
   humanVideo.dataset.pfCorsRetried="1";
   humanVideo.removeAttribute("crossorigin");humanVideo.src=source.src;humanVideo.load();
   notice("Ativando modo de vídeo compatível com o navegador. O recorte por IA pode ficar indisponível para este arquivo.");
   void humanVideo.play().catch(()=>{});
   return;
  }
  failed("Vídeo público indisponível. Envie um vídeo MP4 próprio e autorizado ou abra a fonte nos créditos.");
 });
 humanVideo.addEventListener("loadedmetadata",()=>{broken=false;updateModes()});
 humanVideo.addEventListener("canplay",()=>{if(kind==="real"&&!paused)void clip.play().catch(()=>{})});
 const exercise=$("pf-ar-exercise");
 if(exercise)exercise.addEventListener("change",changeFootage);
 overlay.querySelector("#pf-ar-close")?.addEventListener("click",close);
 const liveCamera=overlay.querySelector("#pf-ar-camera");
 if(liveCamera)liveCamera.addEventListener("click",()=>{
  // The real instructor remains visible without segmentation on unsupported devices.
  setTimeout(()=>{
   if(clip?.videoWidth&&kind==="real"&&!segActive&&!segLoading&&!broken&&clip.crossOrigin==="anonymous")void segment();
  },650);
 });
 const swap=overlay.querySelector("#pf-ar-facing");
 if(swap)swap.addEventListener("click",()=>{if(segActive){resetModel();notice("Câmera alterada. Inicie o recorte novamente se desejar.")}});
 changeFootage();applyMode();
}
function boot(){
 const s=document.createElement("style");s.id="pf-ar-real-person-css";
 s.textContent=
 '#pf-ar-overlay.pf-real-person-selected #pf-ar-canvas{display:none!important}'+
 '#pf-ar-overlay.pf-real-person-selected #pf-ar-fallback{display:none!important}'+
 '#pf-ar-overlay.pf-real-3d-selected #pf-real-person-video,#pf-ar-overlay.pf-real-3d-selected #pf-real-cutout{display:none!important}'+
 '#pf-ar-overlay #pf-real-person-video,#pf-ar-overlay #pf-real-cutout{position:absolute;inset:0;width:100%;height:100%;z-index:4;pointer-events:none;object-fit:contain;object-position:center;transform:translateZ(0)}'+
 '#pf-ar-overlay #pf-real-cutout[hidden],#pf-ar-overlay #pf-real-person-video[hidden]{display:none!important}'+
 '#pf-ar-overlay #pf-real-trainer-panel{display:grid;gap:11px;padding:15px;border:2px solid #8ef1c9;border-radius:18px;color:#fff;background:linear-gradient(140deg,#1c3345,#232044);min-width:0;max-width:100%;overflow:hidden}'+
 '#pf-ar-overlay #pf-real-trainer-panel *{box-sizing:border-box;min-width:0}'+
 '#pf-ar-overlay #pf-real-trainer-panel .pf-real-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}'+
 '#pf-ar-overlay #pf-real-trainer-panel .pf-real-head h3{color:#fff;font:900 20px/1.25 system-ui;margin:3px 0 0}'+
 '#pf-ar-overlay #pf-real-trainer-panel .pf-real-head span{border-radius:30px;border:1px solid #8ef8db;color:#b7ffde;padding:6px 9px;font:850 11px system-ui}'+
 '#pf-ar-overlay #pf-real-trainer-panel .pf-real-head small{color:#9fffe0;font:850 10px system-ui;letter-spacing:.09em}'+
 '#pf-ar-overlay #pf-real-trainer-panel p,#pf-ar-overlay #pf-real-trainer-panel .pf-real-warning{color:#d6e8ef;font:12px/1.55 system-ui;margin:0}'+
 '#pf-ar-overlay #pf-real-trainer-panel select{color:white;background:#14223a;border:1px solid #87a6c2;border-radius:10px;min-height:44px;padding:10px;font:16px system-ui;width:100%}'+
 '#pf-ar-overlay #pf-real-trainer-panel>label{font:800 13px system-ui}'+
 '#pf-ar-overlay #pf-real-trainer-panel .pf-real-person-name{color:#baffde;font:800 13px/1.4 system-ui}'+
 '#pf-ar-overlay #pf-real-trainer-panel .pf-real-actions{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:8px}'+
 '#pf-ar-overlay #pf-real-trainer-panel .pf-real-actions button:disabled{opacity:.50}'+
 '#pf-ar-overlay #pf-real-trainer-panel .pf-real-sliders{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}'+
 '#pf-ar-overlay #pf-real-trainer-panel .pf-real-sliders label{font:750 11px system-ui}'+
 '#pf-ar-overlay #pf-real-trainer-panel input[type=range]{display:block;width:100%;margin:9px 0}'+
 '#pf-ar-overlay #pf-real-trainer-panel .pf-real-upload{display:grid;border:1px dashed #8fdcbf;border-radius:12px;padding:12px;gap:9px;font:750 13px system-ui}'+
 '#pf-ar-overlay #pf-real-trainer-panel input[type=file]{font:12px/1.4 system-ui;color:#c6eadd;width:100%;max-width:100%}'+
 '#pf-ar-overlay #pf-real-unavailable{padding:11px;border:1px solid #efad89;border-radius:11px;background:#3d2e46;font:12px/1.4 system-ui;color:#fff}'+
 '#pf-ar-overlay #pf-real-person-status{color:#baffdc!important;font:800 12px/1.55 system-ui!important}'+
 '#pf-ar-overlay #pf-real-trainer-panel .pf-real-credits{display:flex;flex-wrap:wrap;gap:3px 5px;border-top:1px solid #6d7294;padding-top:9px;color:#c9dbea;font:11px/1.5 system-ui}'+
 '#pf-ar-overlay #pf-real-trainer-panel .pf-real-credits strong{flex-basis:100%;color:#d4ffed}'+
 '#pf-ar-overlay #pf-real-trainer-panel .pf-real-credits a{color:#b0ffdc;text-decoration:underline}'+
 '#pf-ar-overlay #pf-real-trainer-panel .pf-real-credits small{flex-basis:100%;color:#c3cfdd}'+
 '@media(max-width:460px){#pf-ar-overlay #pf-real-trainer-panel .pf-real-sliders{grid-template-columns:1fr 1fr}#pf-ar-overlay #pf-real-trainer-panel .pf-real-sliders label:first-child{grid-column:1/-1}}';
 document.head.appendChild(s);
 const observer=new MutationObserver(()=>{const el=$("pf-ar-overlay");if(!el){if(host)close()}else if(el!==host)mount()});
 observer.observe(document.body,{childList:true,subtree:false});
 window.addEventListener("pulso-open-camera-ar",()=>setTimeout(mount,0));
 window.addEventListener("pagehide",close);
 window.addEventListener("hashchange",()=>{if(!$("pf-ar-overlay"))close()});
 mount();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();