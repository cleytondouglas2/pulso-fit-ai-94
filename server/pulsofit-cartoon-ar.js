/* PulsoFit Cartoon AR: ORIGINAL animated 3D characters over the phone camera.
 * Not reproductions of Mickey, Minnie, Tom, Jerry, or any licensed cartoons.
 * On iPhone Safari, placement is manual (camera compositing), not ARKit plane anchors.
 */
(function(){
"use strict";
if(window.__PULSO_CARTOON_AR__)return;
window.__PULSO_CARTOON_AR__=true;
const $=id=>document.getElementById(id);
const looks={
 pipo:{label:"🐭 Pipo • Ratinho atleta",animal:"mouse",fur:0xc8a895,shirt:0x875ce9,shorts:0x26345d,accent:0x63ffd6},
 lila:{label:"🐭 Lila • Ratinha fitness",animal:"mouse",fur:0xe5bcca,shirt:0xf576b7,shorts:0x46417b,accent:0xf9dc72,bow:true},
 tico:{label:"🐱 Tico • Gatinho esportista",animal:"cat",fur:0xf0ac70,shirt:0x4b9bdc,shorts:0x2f375e,accent:0xf7ecaa},
 nino:{label:"🐰 Nino • Coelhinho ativo",animal:"rabbit",fur:0xe9e5df,shirt:0x55b99c,shorts:0x3b4f74,accent:0xf39ab7},
 zigi:{label:"🤖 Zigi • Robô treinador",animal:"robot",fur:0xb9d6ee,shirt:0x685de2,shorts:0x293b64,accent:0xc9ff83}
};
const exerciseLabels={
 squat:"Agachamento",lunge:"Afundo / passada",jumping_jack:"Polichinelo",curl:"Rosca bíceps",
 arm_raise:"Elevação lateral",march:"Marcha no lugar",pushup:"Flexão de braço",plank:"Prancha",bridge:"Ponte de glúteos"
};
let source=null,overlay=null,THREE=null,renderer=null,scene=null,camera=null,actor=null,raf=0,resizeObserver=null;
let selected="pipo",freeze=false,freezeAt=0,offset=0,startAt=0,queued=false;
function report(msg){const t=$("pf-ar-cartoon-status");if(t)t.textContent=msg}
function mesh(g,color){return new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:.65,metalness:0}))}
function ball(radius,color){return mesh(new THREE.SphereGeometry(radius,20,15),color)}
function linkCylinder(r,length,color){
 return mesh(new THREE.CapsuleGeometry(r,Math.max(length,.04),5,10),color);
}
function add(container,child,x,y,z){child.position.set(x,y,z);container.add(child);return child}
function createCharacter(name){
 const cfg=looks[name]||looks.pipo;
 const root=new THREE.Group(),body=new THREE.Group();root.add(body);
 const head=add(body,ball(cfg.animal==="robot"?.28:.31,cfg.fur),0,2.20,.025);
 if(cfg.animal==="robot")head.scale.set(1,.94,.9);
 const torso=add(body,linkCylinder(.23,.55,cfg.shirt),0,1.61,0);
 const hips=add(body,ball(.26,cfg.shorts),0,1.17,0);hips.scale.set(1,.52,.70);
 add(body,ball(.13,cfg.accent),0,1.61,.232).scale.set(.85,.65,.16);
 // Facial detail helps distinguish an animated character from a rigid stick figure.
 if(cfg.animal!=="robot"){
  for(const side of [-1,1]){
   const eye=add(body,ball(.07,0xfffbf6),side*.115,2.23,.30);eye.scale.set(.78,1,.5);
   const iris=add(body,ball(.038,0x20243e),side*.114,2.225,.343);iris.scale.set(.69,1,.45);
  }
  const muzzle=add(body,ball(.12,cfg.animal==="cat"?0xffe0c1:0xf8decf),0,2.095,.30);
  muzzle.scale.set(1,.64,.59);
  const nose=add(body,ball(.048,cfg.animal==="cat"?0xe66b82:0x624859),0,2.137,.37);
  nose.scale.set(.9,.58,.57);
  if(cfg.animal==="mouse"){
   for(const side of [-1,1]){
    const ear=add(body,ball(.151,cfg.fur),side*.275,2.458,-.03);ear.scale.set(1,1,.49);
    const inside=add(body,ball(.099,0xf4a7c0),side*.275,2.454,.045);inside.scale.set(.94,1,.28);
   }
   if(cfg.bow){
    for(const side of [-1,1]){
     const wing=add(body,ball(.076,cfg.accent),.16+side*.065,2.55,.18);
     wing.scale.set(1,.65,.5);
    }
   }
  }else if(cfg.animal==="cat"){
   for(const side of [-1,1]){
    const ear=mesh(new THREE.ConeGeometry(.158,.26,3),cfg.fur);
    ear.rotation.z=-side*.10;add(body,ear,side*.20,2.50,-.05);
   }
   for(const side of [-1,1])for(const y of [2.095,2.145]){
    const whisker=mesh(new THREE.CylinderGeometry(.004,.004,.27,6),0xf4f1e8);
    whisker.rotation.z=side*(Math.PI/2+.12);add(body,whisker,side*.235,y,.298);
   }
  }else if(cfg.animal==="rabbit"){
   for(const side of [-1,1]){
    const ear=add(body,ball(.12,cfg.fur),side*.162,2.56,-.03);ear.scale.set(.74,2.17,.47);
    const pink=add(body,ball(.077,0xedabc4),side*.162,2.56,.060);pink.scale.set(.71,2.10,.3);
   }
  }
  if(cfg.animal==="mouse"||cfg.animal==="cat"){
   const curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,1.17,-.19),new THREE.Vector3(-.22,1.02,-.34),
    new THREE.Vector3(-.42,1.19,-.42),new THREE.Vector3(-.45,1.39,-.41)
   ]);
   body.add(mesh(new THREE.TubeGeometry(curve,16,cfg.animal==="cat"?.043:.025,7,false),cfg.fur));
  }
 }else{
  const visor=add(body,mesh(new THREE.BoxGeometry(.40,.125,.09),0x14364e),0,2.23,.278);
  for(const side of [-1,1])add(body,ball(.045,cfg.accent),side*.11,2.23,.328);
  add(body,mesh(new THREE.CylinderGeometry(.017,.017,.20,8),0xd5eaf3),0,2.53,0);
  add(body,ball(.053,cfg.accent),0,2.65,0);
 }
 const arms=[],elbows=[],legs=[],knees=[];
 for(const side of [-1,1]){
  const shoulder=new THREE.Group();shoulder.position.set(side*.30,1.85,0);body.add(shoulder);
  add(shoulder,linkCylinder(.084,.34,cfg.fur),0,-.30,0);
  const elbow=new THREE.Group();elbow.position.y=-.55;shoulder.add(elbow);
  add(elbow,linkCylinder(.074,.25,cfg.fur),0,-.20,0);
  add(elbow,ball(.085,cfg.accent),0,-.425,0);
  const hip=new THREE.Group();hip.position.set(side*.145,1.08,0);body.add(hip);
  add(hip,linkCylinder(.111,.38,cfg.shorts),0,-.27,0);
  const knee=new THREE.Group();knee.position.y=-.53;hip.add(knee);
  add(knee,ball(.095,cfg.shorts),0,0,0);
  add(knee,linkCylinder(.080,.35,cfg.shorts),0,-.27,0);
  const shoe=add(knee,mesh(new THREE.BoxGeometry(.20,.12,.34),cfg.accent),0,-.54,.095);
  shoe.rotation.x=.05;
  arms.push(shoulder);elbows.push(elbow);legs.push(hip);knees.push(knee);
 }
 root.userData={body,arms,elbows,legs,knees,name};
 return root;
}
function pose(ms){
 if(!actor)return;
 const {body,arms,elbows,legs,knees}=actor.userData;
 const exercise=$("pf-ar-exercise")?.value||"squat";
 const speed={squat:1680,lunge:2100,jumping_jack:1240,curl:1800,arm_raise:1650,march:1200,pushup:2040,plank:3000,bridge:2150}[exercise]||1750;
 const wave=Math.sin(ms/speed*Math.PI*2),phase=(1-Math.cos(ms/speed*Math.PI*2))/2;
 body.position.set(0,0,0);body.rotation.set(0,0,0);
 for(const limb of [...arms,...elbows,...legs,...knees])limb.rotation.set(0,0,0);
 if(exercise==="squat"){
  body.position.y=-.33*phase;
  legs.forEach(p=>p.rotation.x=-.67*phase);knees.forEach(p=>p.rotation.x=1.28*phase);
  arms.forEach(p=>p.rotation.x=-.65*phase);
 }
 if(exercise==="lunge"){
  body.position.y=-.23*phase;legs[0].rotation.x=.67*phase;legs[1].rotation.x=-.64*phase;
  knees[0].rotation.x=1.13*phase;knees[1].rotation.x=.78*phase;
 }
 if(exercise==="jumping_jack"){
  body.position.y=.12*Math.max(0,wave);
  legs[0].rotation.z=-.48*phase;legs[1].rotation.z=.48*phase;
  arms[0].rotation.z=-2.42*phase;arms[1].rotation.z=2.42*phase;
 }
 if(exercise==="curl"){
  elbows.forEach(p=>p.rotation.x=-1.50*phase);
 }
 if(exercise==="arm_raise"){
  arms[0].rotation.z=-1.36*phase;arms[1].rotation.z=1.36*phase;
 }
 if(exercise==="march"){
  legs[0].rotation.x=.56*wave;legs[1].rotation.x=-.56*wave;
  knees[0].rotation.x=.45*Math.max(wave,0);knees[1].rotation.x=.45*Math.max(-wave,0);
  arms[0].rotation.x=-.35*wave;arms[1].rotation.x=.35*wave;
 }
 if(exercise==="pushup"){
  body.rotation.z=-Math.PI/2;body.position.set(-.90,-.17+.15*phase,0);
  arms[0].rotation.z=-.55*phase;arms[1].rotation.z=.55*phase;
 }
 if(exercise==="plank"){
  body.rotation.z=-Math.PI/2;body.position.set(-.90,-.10+Math.sin(ms/900)*.012,0);
 }
 if(exercise==="bridge"){
  body.rotation.z=-.83;body.position.set(-.34,-.33+.28*phase,0);
  legs.forEach(p=>p.rotation.x=-.28);knees.forEach(p=>p.rotation.x=.87);
 }
}
function frame(){
 if(!renderer||!source||!$("pf-ar-overlay"))return;
 const time=freeze?freezeAt-startAt-offset:performance.now()-startAt-offset;
 pose(Math.max(0,time));
 const x=Number($("pf-ar-x")?.value||0),y=Number($("pf-ar-cartoon-y")?.value||0);
 actor.position.set(x,y,0);
 actor.scale.setScalar(Number($("pf-ar-size")?.value||1));
 renderer.render(scene,camera);
 raf=requestAnimationFrame(frame);
}
function resize(){
 if(!renderer||!source)return;
 const w=Math.max(1,source.clientWidth),h=Math.max(1,source.clientHeight);
 renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
}
function setAvatar(id){
 if(!looks[id])return;
 selected=id;
 const sel=$("pf-ar-character");if(sel)sel.value=id;
 if(scene&&THREE){
  if(actor)scene.remove(actor);
  actor=createCharacter(id);scene.add(actor);
 }
 const preview=$("pf-ar-cartoon-name");if(preview)preview.textContent=looks[id].label;
 report(looks[id].label+" selecionado. O avatar acompanhará o exercício escolhido.");
}
async function begin(){
 const layer=$("pf-ar-canvas");if(!layer)return;
 source=layer;
 try{
  THREE=await import("https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js");
  if(!$("pf-ar-overlay")||source!==layer)return;
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:"low-power"});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  renderer.setClearColor(0x000000,0);
  renderer.domElement.setAttribute("aria-label","Personagem original animado realizando treino");
  renderer.domElement.style.cssText="width:100%;height:100%;display:block;pointer-events:none";
  layer.replaceChildren(renderer.domElement);
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(35,1,.1,100);
  camera.position.set(0,1.56,5.9);camera.lookAt(0,1.18,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0x677ba3,2.25));
  const sun=new THREE.DirectionalLight(0xffffff,2.20);sun.position.set(-2,5,4);scene.add(sun);
  const shadow=mesh(new THREE.CircleGeometry(.85,40),0x8efbd6);
  shadow.rotation.x=-Math.PI/2;shadow.position.y=-.07;shadow.material.transparent=true;shadow.material.opacity=.20;scene.add(shadow);
  actor=createCharacter(selected);scene.add(actor);
  if("ResizeObserver" in window){resizeObserver=new ResizeObserver(resize);resizeObserver.observe(layer)}
  resize();startAt=performance.now();offset=0;freeze=false;frame();
  $("pf-ar-fallback")?.setAttribute("hidden","");
  report("Personagem de desenho animado carregado. Ative a câmera e posicione-o no ambiente.");
 }catch{
  report("O navegador não carregou os gráficos 3D. Atualize o aplicativo ou tente um navegador com WebGL.");
  const fallback=$("pf-ar-fallback");if(fallback){fallback.hidden=false;fallback.textContent="Treinador 3D indisponível neste aparelho. Verifique a conexão."}
 }
}
function pause(){
 if(!freeze){freeze=true;freezeAt=performance.now()}else{offset+=performance.now()-freezeAt;freeze=false}
 const b=$("pf-ar-cartoon-pause");if(b)b.textContent=freeze?"▶ Continuar avatar":"⏸ Pausar avatar";
}
function destroy(){
 cancelAnimationFrame(raf);raf=0;
 resizeObserver?.disconnect();resizeObserver=null;
 if(renderer){renderer.dispose();renderer.domElement.remove()}
 renderer=null;scene=null;actor=null;source=null;THREE=null;
}
function mount(){
 const modal=$("pf-ar-overlay");
 if(!modal||overlay===modal)return;
 destroy();overlay=modal;
 const controls=modal.querySelector(".pf-ar-controls");
 if(!controls)return;
 const banner=document.createElement("section");banner.id="pf-ar-cartoon-controls";
 banner.innerHTML='<div class="pf-ar-cartoon-heading"><strong>🎬 Seu treinador de desenho animado</strong><span>3D original</span></div>'+
  '<p>Escolha um personagem que fará o exercício com você na imagem da sua câmera.</p>'+
  '<label for="pf-ar-character">Qual personagem vai treinar?</label>'+
  '<select id="pf-ar-character">'+Object.entries(looks).map(([key,look])=>'<option value="'+key+'">'+look.label+'</option>').join("")+'</select>'+
  '<div class="pf-ar-cartoon-tools"><button id="pf-ar-cartoon-pause" type="button">⏸ Pausar avatar</button>'+
  '<label for="pf-ar-cartoon-y">Altura no ambiente<input id="pf-ar-cartoon-y" type="range" min="-1.5" max="1.5" value="0" step=".05"></label></div>'+
  '<p id="pf-ar-cartoon-name"></p><p id="pf-ar-cartoon-status" role="status" aria-live="polite"></p>'+
  '<small>Personagens originais inspirados no estilo de animações clássicas; não são versões de personagens de estúdios. A câmera do navegador faz sobreposição 3D com posicionamento manual, não rastreamento espacial nativo.</small>';
 controls.insertBefore(banner,controls.firstChild);
 const heading=modal.querySelector(".pf-ar-header h2");if(heading)heading.textContent="Treino com personagem animado";
 banner.querySelector("#pf-ar-character").addEventListener("change",e=>setAvatar(e.target.value));
 banner.querySelector("#pf-ar-cartoon-pause").addEventListener("click",pause);
 modal.querySelector("#pf-ar-close")?.addEventListener("click",destroy);
 const basePause=modal.querySelector("#pf-ar-pause");
 if(basePause){basePause.hidden=true}
 setAvatar(selected);
 void begin();
}
function boot(){
 const css=document.createElement("style");css.id="pf-cartoon-3d-styles";
 css.textContent="#pf-ar-overlay #pf-ar-cartoon-controls{background:linear-gradient(125deg,#26305c,#29274c);padding:16px;border:1.5px solid #93e9d3;border-radius:17px;display:grid;gap:10px;box-sizing:border-box;min-width:0}"+
 "#pf-ar-overlay #pf-ar-cartoon-controls *{box-sizing:border-box;min-width:0}"+
 "#pf-ar-overlay .pf-ar-cartoon-heading{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}"+
 "#pf-ar-overlay .pf-ar-cartoon-heading strong{font:900 16px/1.3 system-ui;color:#fff}"+
 "#pf-ar-overlay .pf-ar-cartoon-heading span{font:800 11px system-ui;color:#aeffe1;background:#214c50;border-radius:20px;padding:8px}"+
 "#pf-ar-overlay #pf-ar-cartoon-controls p{margin:0;font:12px/1.5 system-ui;color:#dbebf3}"+
 "#pf-ar-overlay #pf-ar-cartoon-controls label{font:800 12px system-ui}"+
 "#pf-ar-overlay #pf-ar-character{width:100%;max-width:100%;font-size:16px!important;min-height:46px;border:1px solid #8ecbd2;border-radius:10px;background:#14233d;color:#fff;padding:10px}"+
 "#pf-ar-overlay .pf-ar-cartoon-tools{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;align-items:center}"+
 "#pf-ar-overlay .pf-ar-cartoon-tools label{font:750 12px system-ui}"+
 "#pf-ar-overlay .pf-ar-cartoon-tools input{display:block;width:100%;margin-top:8px}"+
 "#pf-ar-overlay #pf-ar-cartoon-status{color:#baffda!important;font:800 12px/1.5 system-ui!important}"+
 "#pf-ar-overlay #pf-ar-cartoon-controls small{font:11px/1.4 system-ui;color:#bfcfe5}"+
 "#pf-ar-overlay #pf-ar-canvas{z-index:4;pointer-events:none}"+
 "@media(max-width:380px){#pf-ar-overlay .pf-ar-cartoon-tools{grid-template-columns:1fr}}";
 document.head.appendChild(css);
 new MutationObserver(()=>{
  const element=$("pf-ar-overlay");
  if(element&&element!==overlay)mount();
  else if(!element&&overlay){destroy();overlay=null}
 }).observe(document.body,{childList:true,subtree:false});
 window.addEventListener("pulso-open-camera-ar",()=>setTimeout(mount,0));
 window.addEventListener("pagehide",destroy);
 mount();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();