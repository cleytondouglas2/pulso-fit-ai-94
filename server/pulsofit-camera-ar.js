/* PulsoFit Camera Studio: real camera + procedurally animated 3D humanoid.
 * iOS Safari = camera overlay with manual placement, not world-tracked ARKit.
 * Camera stays local; never uploads frames or creates recordings.
 */
(function(){
"use strict";
if(window.__PF_CAMERA_AR_STUDIO__)return;window.__PF_CAMERA_AR_STUDIO__=true;
const exercises={
 squat:{label:"Agachamento",tempo:1.65},
 lunge:{label:"Afundo / passada",tempo:2.2},
 jumping_jack:{label:"Polichinelo",tempo:1.4},
 curl:{label:"Rosca bíceps",tempo:1.8},
 arm_raise:{label:"Elevação lateral",tempo:1.8},
 march:{label:"Marcha no lugar",tempo:1.3},
 pushup:{label:"Flexão de braço",tempo:2},
 plank:{label:"Prancha",tempo:3},
 bridge:{label:"Ponte de glúteos",tempo:2.3}
};
const $=id=>document.getElementById(id);
const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
function keyFromName(text){
 const t=norm(text);
 if(/polichinelo|jumping/.test(t))return "jumping_jack";
 if(/b[uú]lgaro|passada|afundo|lunge/.test(t))return "lunge";
 if(/rosca|biceps|bíceps|barra supinada/.test(t))return "curl";
 if(/lateral|ombro|elevacao/.test(t))return "arm_raise";
 if(/flexao|push.?up|diamante|planche/.test(t))return "pushup";
 if(/prancha|plank/.test(t))return "plank";
 if(/ponte|gluteo/.test(t))return "bridge";
 if(/caminhada|marcha|passo/.test(t))return "march";
 return "squat";
}
let stream=null,renderer=null,scene=null,camera=null,actor=null,raf=0,started=0,paused=false,pausedAt=0,elapsedPause=0,selected="squat",controller=null,cameraOpen=false,lastFacing="environment",aiBusy=false;
const status=msg=>{const el=$("pf-ar-status");if(el)el.textContent=msg};
function showFallback(label){
 const fallback=$("pf-ar-fallback");if(!fallback)return;
 fallback.hidden=false;
 fallback.innerHTML='<svg viewBox="0 0 170 320" role="img" aria-label="Pessoa demonstrando '+label.replace(/[<>&"]/g,"")+'"><ellipse cx="85" cy="296" rx="66" ry="12" fill="#1b243e88"/>'+
 '<g class="pf-ar-silhouette"><circle cx="85" cy="72" r="24" fill="#d49c77"/><rect x="61" y="99" width="48" height="85" rx="18" fill="#8c5be7"/>'+
 '<path d="M68 183 L66 270 M102 183 L104 270" stroke="#283a6b" stroke-width="23" stroke-linecap="round"/>'+
 '<path d="M63 115 L43 204 M107 115 L128 204" stroke="#d49c77" stroke-width="15" stroke-linecap="round"/></g></svg>'+
 '<small>Prévia ilustrada 2D (o renderizador 3D está indisponível)</small>';
}
function stopMedia(){
 if(stream){for(const track of stream.getTracks())track.stop();stream=null}
 const video=$("pf-ar-video");if(video){video.pause();video.srcObject=null}
 cameraOpen=false;
}
function dispose(){
 cancelAnimationFrame(raf);raf=0;
 if(controller){controller.disconnect();controller=null}
 if(renderer){renderer.dispose();renderer.domElement.remove();renderer=null}
 scene=null;actor=null;camera=null;
}
function close(){
 stopMedia();dispose();
 $("pf-ar-overlay")?.remove();document.body.classList.remove("pf-ar-open");
}
async function startCamera(){
 if(!navigator.mediaDevices?.getUserMedia){status("Este navegador não permite câmera. A demonstração pode ser vista sem câmera.");return}
 try{
  stopMedia();
  stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:lastFacing},width:{ideal:1280},height:{ideal:720}}});
  if(!$("pf-ar-overlay")){stopMedia();return}
  const video=$("pf-ar-video");video.srcObject=stream;video.muted=true;video.playsInline=true;
  await video.play();cameraOpen=true;
  status("Câmera ativa somente neste aparelho. Ajuste a posição e o tamanho do avatar. Não há detecção automática do chão no Safari.");
 }catch(e){
  status(e?.name==="NotAllowedError"?"Permissão de câmera negada. Libere em Ajustes e tente novamente.":"Não foi possível ligar a câmera. A prévia 3D continua sem câmera.");
 }
}
function capsule(THREE,radius,length,color){
 const g=new THREE.CapsuleGeometry(radius,Math.max(.05,length),6,12);
 return new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:.75,metalness:0}));
}
function createBody(THREE){
 const root=new THREE.Group(),person=new THREE.Group();root.add(person);
 const material=(color)=>new THREE.MeshStandardMaterial({color,roughness:.78});
 const head=new THREE.Mesh(new THREE.SphereGeometry(.21,20,14),material("#c88f6f"));head.position.y=2.16;
 const hair=new THREE.Mesh(new THREE.SphereGeometry(.214,20,14),material("#29283d"));hair.scale.set(1,0.36,1);hair.position.y=2.28;
 const torso=capsule(THREE,.23,.5,"#9154e6");torso.position.y=1.60;
 const hips=new THREE.Mesh(new THREE.SphereGeometry(.25,18,12),material("#313c67"));hips.scale.set(1,.58,.7);hips.position.y=1.18;
 person.add(head,hair,torso,hips);
 const arms=[],legs=[],forearms=[],knees=[];
 for(const side of [-1,1]){
  const shoulder=new THREE.Group();shoulder.position.set(side*.30,1.84,0);
  const arm=capsule(THREE,.087,.39,"#c88f6f");arm.position.y=-.30;shoulder.add(arm);
  const elbow=new THREE.Group();elbow.position.y=-.58;
  const forearm=capsule(THREE,.075,.26,"#c88f6f");forearm.position.y=-.22;elbow.add(forearm);shoulder.add(elbow);
  person.add(shoulder);arms.push(shoulder);forearms.push(elbow);
  const hip=new THREE.Group();hip.position.set(side*.15,1.08,0);
  const thigh=capsule(THREE,.115,.39,"#303a65");thigh.position.y=-.28;hip.add(thigh);
  // True knee joint: shin and foot articulate independently of the thigh.
  const knee=new THREE.Group();knee.position.y=-.55;
  const joint=new THREE.Mesh(new THREE.SphereGeometry(.10,12,10),material("#38496a"));knee.add(joint);
  const shin=capsule(THREE,.083,.39,"#303a65");shin.position.y=-.28;knee.add(shin);
  const shoe=new THREE.Mesh(new THREE.BoxGeometry(.20,.13,.34),material("#bdeeed"));shoe.position.set(0,-.57,.11);knee.add(shoe);
  hip.add(knee);person.add(hip);legs.push(hip);knees.push(knee);
 }
 root.userData={person,arms,legs,forearms,knees};
 return root;
}
function animatePose(t){
 if(!actor)return;
 const {person,arms,legs,forearms,knees}=actor.userData;
 const speed=exercises[selected]?.tempo||2;
 const wave=Math.sin(t*Math.PI*2/speed);
 const phase=(1-Math.cos(t*Math.PI*2/speed))/2;
 person.position.set(0,0,0);person.rotation.set(0,0,0);
 for(const p of arms)p.rotation.set(0,0,0);
 for(const p of legs)p.rotation.set(0,0,0);
  for(const p of knees)p.rotation.set(0,0,0);
 for(const p of forearms)p.rotation.set(0,0,0);
 if(selected==="squat"){person.position.y=-.36*phase;legs[0].rotation.x=-.65*phase;legs[1].rotation.x=-.65*phase;knees[0].rotation.x=1.15*phase;knees[1].rotation.x=1.15*phase;arms[0].rotation.x=-.70*phase;arms[1].rotation.x=-.70*phase}
 if(selected==="lunge"){person.position.y=-.23*phase;legs[0].rotation.x=.72*phase;legs[1].rotation.x=-.62*phase;knees[0].rotation.x=1.1*phase;knees[1].rotation.x=.70*phase;arms[0].rotation.x=-.15;arms[1].rotation.x=.15}
 if(selected==="jumping_jack"){person.position.y=.12*Math.max(0,wave);legs[0].rotation.z=-.4*phase;legs[1].rotation.z=.4*phase;arms[0].rotation.z=-2.4*phase;arms[1].rotation.z=2.4*phase}
 if(selected==="curl"){forearms[0].rotation.x=-1.6*phase;forearms[1].rotation.x=-1.6*phase}
 if(selected==="arm_raise"){arms[0].rotation.z=-1.32*phase;arms[1].rotation.z=1.32*phase}
 if(selected==="march"){legs[0].rotation.x=.6*wave;legs[1].rotation.x=-.6*wave;knees[0].rotation.x=.45*Math.max(wave,0);knees[1].rotation.x=.45*Math.max(-wave,0);arms[0].rotation.x=-.35*wave;arms[1].rotation.x=.35*wave}
 if(selected==="pushup"){person.rotation.z=-Math.PI/2;person.position.set(-.95,-.18+phase*.14,0);arms[0].rotation.z=-.6*phase;arms[1].rotation.z=.6*phase}
 if(selected==="plank"){person.rotation.z=-Math.PI/2;person.position.set(-.95,-.10+Math.sin(t*2)*.02,0)}
 if(selected==="bridge"){person.rotation.z=-.83;person.position.set(-.35,-.30+.30*phase,0);legs[0].rotation.x=-.3;legs[1].rotation.x=-.3;knees[0].rotation.x=.85;knees[1].rotation.x=.85}
}
async function setup3D(){
 const display=$("pf-ar-canvas");if(!display)return;
 try{
  // Original procedural model. Three.js is MIT-licensed, pinned for stability.
  const THREE=await import("https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js");
  if(!$("pf-ar-overlay"))return;
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:"low-power"});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  renderer.setClearColor(0,0);
  renderer.domElement.setAttribute("aria-label","Avatar 3D de demonstração");
  renderer.domElement.style.cssText="width:100%;height:100%;pointer-events:none;display:block";
  display.appendChild(renderer.domElement);
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(35,1,.1,100);
  camera.position.set(0,1.55,5.8);camera.lookAt(0,1.16,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0x536096,2));
  const light=new THREE.DirectionalLight(0xffffff,2.1);light.position.set(-2,5,5);scene.add(light);
  actor=createBody(THREE);scene.add(actor);
  const ground=new THREE.Mesh(new THREE.CircleGeometry(.85,48),new THREE.MeshBasicMaterial({color:0x8fffdc,transparent:true,opacity:.20,depthWrite:false}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.05;scene.add(ground);
  const resize=()=>{const w=display.clientWidth||320,h=display.clientHeight||400;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()};
  controller=new ResizeObserver(resize);controller.observe(display);resize();
  $("pf-ar-fallback").hidden=true;
  const loop=()=>{
   if(!renderer||!$("pf-ar-overlay"))return;
   const secs=paused?pausedAt-started-elapsedPause:(performance.now()-started-elapsedPause);
   animatePose(Math.max(0,secs)/1000);
   actor.position.x=Number($("pf-ar-x")?.value||0);
   actor.scale.setScalar(Number($("pf-ar-size")?.value||1));
   renderer.render(scene,camera);
   raf=requestAnimationFrame(loop);
  };started=performance.now();loop();
  status("Treinador 3D articulado pronto. Para analisar seu movimento com IA real, abra a câmera e inicie a análise corporal abaixo.");
 }catch(err){
  showFallback(exercises[selected].label);
  status("Renderização 3D indisponível neste aparelho. Mostrando demonstração 2D; verifique a conexão e o suporte gráfico.");
 }
}
function updateExercise(choice){
 if(!exercises[choice])return;
 selected=choice;
 const sel=$("pf-ar-exercise");if(sel)sel.value=choice;
 const lbl=$("pf-ar-exercise-name");if(lbl)lbl.textContent=exercises[choice].label;
 const fallback=$("pf-ar-fallback");if(fallback&&!fallback.hidden)showFallback(exercises[choice].label);
}
function open(exercise){
 if($("pf-ar-overlay")){if(exercise)updateExercise(keyFromName(exercise));return}
 if(!document.body)return;
 const modal=document.createElement("div");modal.id="pf-ar-overlay";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-label","Treino com câmera e avatar 3D");
 modal.innerHTML='<div class="pf-ar-header"><div><small>◈ PULSOFIT · CÂMERA 3D</small><h2>Seu treinador no ambiente</h2></div><button type="button" id="pf-ar-close" aria-label="Fechar câmera">×</button></div>'+
 '<div class="pf-ar-stage"><video id="pf-ar-video" playsinline muted autoplay></video><div id="pf-ar-canvas"></div><div id="pf-ar-fallback" hidden></div>'+
 '<span id="pf-ar-exercise-name" class="pf-ar-label">Agachamento</span></div>'+
 '<div class="pf-ar-controls"><label for="pf-ar-exercise">Exercício demonstrado</label><select id="pf-ar-exercise">'+
 Object.entries(exercises).map(([k,v])=>'<option value="'+k+'">'+v.label+'</option>').join("")+'</select>'+
 '<div class="pf-ar-buttons"><button type="button" id="pf-ar-camera">📷 Ativar câmera</button><button type="button" id="pf-ar-pause">⏸ Pausar</button><button type="button" id="pf-ar-facing">↻ Trocar câmera</button></div>'+
 '<div class="pf-ar-sliders"><label>Tamanho do avatar<input type="range" id="pf-ar-size" min=".45" max="1.8" step=".05" value="1"></label>'+
 '<label>Posição horizontal<input type="range" id="pf-ar-x" min="-1.8" max="1.8" step=".1" value="0"></label></div>'+
 '<form id="pf-ar-ai-form"><label for="pf-ar-ai-text">Escolher exercício com IA (opcional)</label>'+
 '<div class="pf-ar-ai-row"><input id="pf-ar-ai-text" maxlength="170" placeholder="Ex.: quero aprender agachamento búlgaro" type="text">'+
 '<button type="submit">✨ Sugerir</button></div><label class="pf-ar-ai-consent"><input type="checkbox" id="pf-ar-ai-consent"> Autorizo enviar somente o nome do exercício à IA</label></form>'+
 '<p role="status" id="pf-ar-status" aria-live="polite"></p><small class="pf-ar-foot">A pessoa real aparece por vídeo licenciado ou autorizado; o fundo pode ser recortado por IA no aparelho. No Safari, o posicionamento é manual, sem ancoragem espacial ARKit. A análise corporal da câmera é opcional; nenhuma imagem é enviada à IA remota. As demonstrações não substituem orientação técnica.</small></div>';
 document.body.appendChild(modal);document.body.classList.add("pf-ar-open");
 modal.querySelector("#pf-ar-close").addEventListener("click",close);
 modal.querySelector("#pf-ar-camera").addEventListener("click",()=>void startCamera());
 modal.querySelector("#pf-ar-facing").addEventListener("click",()=>{lastFacing=lastFacing==="environment"?"user":"environment";void startCamera()});
 modal.querySelector("#pf-ar-pause").addEventListener("click",e=>{
  if(paused){elapsedPause+=performance.now()-pausedAt;paused=false;e.target.textContent="⏸ Pausar"}
  else{pausedAt=performance.now();paused=true;e.target.textContent="▶ Retomar"}
 });
 modal.querySelector("#pf-ar-exercise").addEventListener("change",e=>updateExercise(e.target.value));
 modal.querySelector("#pf-ar-ai-form").addEventListener("submit",async e=>{
  e.preventDefault();if(aiBusy)return;
  const input=$("pf-ar-ai-text"),name=String(input?.value||"").trim();
  if(!name){status("Descreva o exercício ou selecione diretamente na lista.");return}
  if(!$("pf-ar-ai-consent")?.checked){status("Autorize o envio do nome do exercício à IA ou escolha manualmente.");return}
  const token=(()=>{try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}})();
  if(!token){status("Entre na sua conta antes de pedir a sugestão à IA.");return}
  aiBusy=true;status("IA identificando a demonstração disponível...");
  try{
   const r=await fetch("/api/coach/ar-exercise",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({exercise:name,consent:true}),signal:AbortSignal.timeout(16000)});
   const j=await r.json().catch(()=>({}));
   if(!r.ok||!exercises[j.exercise])throw Error(j.error||"A IA não conseguiu selecionar este movimento.");
   updateExercise(j.exercise);status("✨ IA sugeriu "+exercises[j.exercise].label+". A animação é ilustrativa; confira a execução com um profissional.");
  }catch(err){status(String(err.message||"IA indisponível")+". Você pode selecionar o exercício manualmente.")}
  finally{aiBusy=false}
 });
 updateExercise(exercise?keyFromName(exercise):"squat");
 void setup3D();
}
function boot(){
 const css=document.createElement("style");css.id="pf-camera-ar-css";
 css.textContent="#pf-ar-overlay{position:fixed;inset:0;z-index:2147482500;background:#090d1a;color:white;overflow-y:auto;overscroll-behavior:contain;padding:calc(env(safe-area-inset-top,0px) + 12px) 12px calc(env(safe-area-inset-bottom,0px) + 18px);box-sizing:border-box}"+
 "#pf-ar-overlay *{box-sizing:border-box}#pf-ar-overlay .pf-ar-header{max-width:800px;margin:0 auto;display:flex;justify-content:space-between;gap:12px;align-items:center}"+
 "#pf-ar-overlay h2{font:850 clamp(19px,4.5vw,27px) system-ui;margin:4px 0 12px}#pf-ar-overlay small{color:#baefdf;font:11px/1.5 system-ui}"+
 "#pf-ar-overlay button{min-height:44px;background:#724dc9;color:white;border:1px solid #b8a1f5;border-radius:11px;padding:10px;font:800 13px system-ui;cursor:pointer}"+
 "#pf-ar-overlay #pf-ar-close{width:48px;height:48px;flex:none;font-size:27px;background:#26253f}"+
 "#pf-ar-overlay .pf-ar-stage{position:relative;width:min(100%,800px);height:clamp(300px,52vh,540px);margin:0 auto;background:radial-gradient(circle at 50% 60%,#282346,#071424);border:2px solid #7be2c5;border-radius:20px;overflow:hidden}"+
 "#pf-ar-overlay #pf-ar-video,#pf-ar-overlay #pf-ar-canvas,#pf-ar-overlay #pf-ar-fallback{position:absolute;inset:0;width:100%;height:100%}"+
 "#pf-ar-overlay #pf-ar-video{object-fit:cover}#pf-ar-overlay #pf-ar-canvas{pointer-events:none}#pf-ar-overlay #pf-ar-fallback{display:grid;place-content:center;text-align:center;pointer-events:none}"+
 "#pf-ar-overlay #pf-ar-fallback[hidden]{display:none!important}#pf-ar-overlay #pf-ar-fallback svg{max-height:250px;width:100%}"+
 "#pf-ar-overlay #pf-ar-fallback .pf-ar-silhouette{transform-origin:85px 260px;animation:pf-ar-squat 2s ease-in-out infinite}"+
 "@keyframes pf-ar-squat{50%{transform:translateY(25px) scaleY(.82)}}"+
 "#pf-ar-overlay .pf-ar-label{position:absolute;left:12px;bottom:12px;background:#10243cce;border:1px solid #77e7c1;border-radius:10px;padding:7px 11px;font:800 13px system-ui}"+
 "#pf-ar-overlay .pf-ar-controls{max-width:800px;margin:12px auto;display:grid;gap:10px}"+
 "#pf-ar-overlay .pf-ar-controls>label,#pf-ar-overlay .pf-ar-sliders label,#pf-ar-overlay form>label{font:800 13px system-ui}"+
 "#pf-ar-overlay .pf-ar-controls select,#pf-ar-overlay .pf-ar-controls input[type=text]{width:100%;min-width:0;min-height:46px;background:#192440;color:white;border:1px solid #818ac0;border-radius:11px;font-size:16px;padding:10px}"+
 "#pf-ar-overlay .pf-ar-buttons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}"+
 "#pf-ar-overlay .pf-ar-sliders{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}"+
 "#pf-ar-overlay input[type=range]{display:block;width:100%;margin:12px 0}"+
 "#pf-ar-overlay #pf-ar-ai-form{display:grid;gap:9px;border:1px solid #575a84;border-radius:12px;padding:12px}"+
 "#pf-ar-overlay .pf-ar-ai-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}"+
 "#pf-ar-overlay .pf-ar-ai-consent{display:flex;gap:8px;font:12px/1.45 system-ui}"+
 "#pf-ar-overlay #pf-ar-status{font:13px/1.5 system-ui;color:#c2ffe4;margin:0}"+
 "#pf-ar-overlay .pf-ar-foot{font:11px/1.5 system-ui;color:#c9d5e8}"+
 "body.pf-ar-open{overflow:hidden}"+
 "@media(max-width:400px){#pf-ar-overlay .pf-ar-buttons{grid-template-columns:1fr 1fr}#pf-ar-overlay .pf-ar-sliders{grid-template-columns:1fr}}";
 document.head.appendChild(css);
 window.addEventListener("pulso-open-camera-ar",e=>open(e.detail?.exercise||""));
 window.addEventListener("pagehide",close);
 window.addEventListener("hashchange",()=>{if($("pf-ar-overlay"))close()});
 const app=$("app");
 if(app)app.addEventListener("click",e=>{
  const el=e.target.closest?.("[data-pf-ar-exercise]");if(!el)return;
  e.preventDefault();open(el.getAttribute("data-pf-ar-exercise")||"");
 });
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();