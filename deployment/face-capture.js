/* ARGUS: guided face-motion capture. Face landmarks run locally via MediaPipe.
 * This is a camera quality/motion aid, not certified PAD or identity proof.
 */
(()=>{
'use strict';
let active=null,detector=null,loadingModel=null;
const E=id=>document.getElementById(id);
const steps={blink:'Pisque os dois olhos uma vez',turn_left:'Vire devagar o rosto para a esquerda',
  turn_right:'Vire devagar o rosto para a direita',center:'Olhe para a câmera e fique parado'};
function setMessage(msg,bad=false){
 const e=E('argus-face-message');if(!e)return;
 e.textContent=msg;e.classList.toggle('error',bad);
}
function setProgress(i,total){
 const e=E('argus-face-progress');if(!e)return;
 e.textContent=i>=total?'Movimentos concluídos':'Etapa '+(i+1)+' de '+total;
}
async function model(){
 if(detector)return detector;
 if(!loadingModel)loadingModel=(async()=>{
   // Pinned model and client SDK; camera frames are processed on this device.
   const {FilesetResolver,FaceLandmarker}=await import(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm');
   const vision=await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm');
   const options={
    baseOptions:{modelAssetPath:
     'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
     delegate:'GPU'},
    runningMode:'VIDEO',numFaces:2,outputFaceBlendshapes:true
   };
   try{return await FaceLandmarker.createFromOptions(vision,options)}
   catch(e){
    options.baseOptions.delegate='CPU';
    return FaceLandmarker.createFromOptions(vision,options);
   }
 })().then(d=>{detector=d;return d}).catch(e=>{loadingModel=null;throw e});
 return loadingModel;
}
function shutdown(){
 const session=active;active=null;
 if(session){
  if(session.raf)cancelAnimationFrame(session.raf);
  for(const track of session.stream?.getTracks()||[])track.stop();
  if(session.video){session.video.pause();session.video.srcObject=null}
 }
 E('argus-face-dialog')?.remove();
}
function capture(video){
 const originalWidth=video.videoWidth,originalHeight=video.videoHeight;
 if(originalWidth<400||originalHeight<300)throw Error('Qualidade da câmera insuficiente. Use um aparelho com melhor resolução.');
 const size=Math.min(originalWidth,originalHeight),canvas=document.createElement('canvas');
 canvas.width=800;canvas.height=800;
 const x=(originalWidth-size)/2,y=(originalHeight-size)/2;
 canvas.getContext('2d',{alpha:false}).drawImage(video,x,y,size,size,0,0,800,800);
 return canvas.toDataURL('image/jpeg',.84).split(',')[1];
}
function motion(result){
 if(result.faceLandmarks?.length!==1)return null;
 const face=result.faceLandmarks[0], left=face[33], right=face[263],nose=face[1];
 if(!left||!right||!nose)return null;
 const span=Math.abs(right.x-left.x);
 if(span<.12||span>.60||nose.x<.19||nose.x>.81||
    nose.y<.24||nose.y>.76)return null;
 const blends=result.faceBlendshapes?.[0]?.categories||[];
 const score=n=>Number(blends.find(k=>k.categoryName===n)?.score||0);
 const blink=Math.min(score('eyeBlinkLeft'),score('eyeBlinkRight'));
 // Front webcam preview is mirrored visually, not in model input.
 // Nose displacement is advisory and may vary with device orientation.
 const yaw=(nose.x-(left.x+right.x)/2)/span;
 return {blink,yaw};
}
function nextStep(session){
 session.step++;session.hold=0;session.blinkSawClosed=false;
 setProgress(session.step,session.steps.length);
 setMessage(session.step>=session.steps.length?'Validando a captura...':
    steps[session.steps[session.step]]+' · mantenha o rosto na moldura');
}
async function finish(session){
 if(active!==session||session.sending)return;
 session.sending=true;
 setMessage('Protegendo e enviando a captura facial...');
 try{
  // A short minimum duration is also enforced by the server.
  const elapsed=performance.now()-session.started;
  if(elapsed<3500)await new Promise(r=>setTimeout(r,3500-elapsed));
  const b64=capture(session.video);
  const res=await request('/api/portal/kyc/face/complete',{
    method:'POST',body:{
      challenge_id:session.challenge,
      observations:session.observations,
      photo_base64:b64
    }});
  shutdown();notice(res.message);
  await session.onComplete?.();
 }catch(e){
  shutdown();
  notice('A captura não foi concluída: '+e.message+'. Inicie outra tentativa.',true);
 }
}
function loop(session){
 if(active!==session||session.sending)return;
 const now=performance.now();
 if(now-session.started>145000){
  shutdown();notice('Tempo da verificação facial esgotado. Inicie novamente.',true);return;
 }
 try{
  if(session.video.readyState>=2&&now-session.lastAnalyze>125){
   session.lastAnalyze=now;
   const info=motion(session.detector.detectForVideo(session.video,now));
   if(!info){
     setMessage('Centralize apenas um rosto na moldura, com boa iluminação.');
     session.hold=0;session.blinkSawClosed=false;
   }else{
     const step=session.steps[session.step],elapsed=Math.round(now-session.started);
     let completed=false;
     if(step==='blink'){
      setMessage(steps[step]+' · retire óculos escuros, se estiver usando');
      if(info.blink>.48)session.blinkSawClosed=true;
      if(session.blinkSawClosed&&info.blink<.19)completed=true;
     }else if(step==='turn_left'||step==='turn_right'){
      setMessage(steps[step]);
      if(step==='turn_left'&&info.yaw<-.18)completed=true;
      if(step==='turn_right'&&info.yaw>.18)completed=true;
     }else if(step==='center'){
      setMessage(steps[step]);
      if(Math.abs(info.yaw)<.11&&info.blink<.28){
       if(!session.hold)session.hold=now;
       if(now-session.hold>850&&now-session.started>3200)completed=true;
      }else session.hold=0;
     }
     if(completed){
      session.observations.push({step,elapsed_ms:elapsed});
      nextStep(session);
      if(session.step===session.steps.length){finish(session);return;}
     }
   }
  }
 }catch(e){
  shutdown();
  notice('Não foi possível acompanhar o rosto neste dispositivo. Tente outro navegador ou solicite análise assistida.',true);
  return;
 }
 session.raf=requestAnimationFrame(()=>loop(session));
}
function createDialog(onComplete){
 shutdown();
 const dialog=document.createElement('div');
 dialog.id='argus-face-dialog';dialog.className='argus-face-backdrop';
 dialog.innerHTML=[
  '<section class="argus-face-sheet" role="dialog" aria-modal="true" aria-labelledby="argus-face-title">',
  '<div class="argus-face-top"><div><small>ARGUS · IDENTIDADE</small><h2 id="argus-face-title">Verificação facial guiada</h2></div>',
  '<button type="button" id="argus-face-close" aria-label="Fechar verificação facial">✕</button></div>',
  '<div class="argus-face-camera"><video id="argus-face-video" playsinline autoplay muted></video>',
  '<div class="argus-face-oval" aria-hidden="true"></div></div>',
  '<div class="argus-face-step"><strong id="argus-face-progress">Antes de começar</strong>',
  '<p id="argus-face-message" role="status" aria-live="polite">Posicione o rosto, retire óculos escuros e deixe o ambiente iluminado.</p></div>',
  '<label class="argus-face-consent"><input id="argus-face-consent" type="checkbox">',
  '<span>Autorizo a captura de uma selfie e sua análise documental e biométrica pela equipe ARGUS. Compreendo que os movimentos guiados não representam certificação antifraude bancária.</span></label>',
  '<p class="argus-face-privacy">A análise dos movimentos é feita no aparelho. Apenas a selfie final será enviada de forma protegida para análise KYC. Não liberamos pagamentos automaticamente.</p>',
  '<div class="argus-face-actions"><button id="argus-face-begin" type="button">Começar com câmera frontal</button>',
  '<button id="argus-face-cancel" type="button" class="secondary">Cancelar</button></div>',
  '</section>'
 ].join('');
 document.body.append(dialog);
 E('argus-face-close').onclick=shutdown;
 E('argus-face-cancel').onclick=shutdown;
 dialog.onclick=e=>{if(e.target===dialog)shutdown()};
 E('argus-face-begin').onclick=()=>begin(onComplete);
 E('argus-face-begin').focus();
}
async function begin(onComplete){
 const button=E('argus-face-begin');if(!button)return;
 if(!E('argus-face-consent').checked){setMessage('Confirme o consentimento de captura para continuar.',true);return}
 if(!navigator.mediaDevices?.getUserMedia){
  setMessage('Seu navegador não oferece câmera frontal. Use Safari/Chrome atualizado ou solicite análise assistida.',true);return;
 }
 button.disabled=true;setMessage('Solicitando permissão de câmera e preparando o reconhecimento dos movimentos...');
 let stream=null;
 try{
  // MediaPipe is a local motion aid; a physical presentation attack can fool it.
  const engine=await model();
  stream=await navigator.mediaDevices.getUserMedia({
   audio:false,video:{facingMode:{ideal:'user'},width:{ideal:1280},height:{ideal:720}}
  });
  const video=E('argus-face-video');
  if(!video){for(const tr of stream.getTracks())tr.stop();return}
  video.srcObject=stream;
  await video.play();
  const answer=await request('/api/portal/kyc/face/start',{method:'POST',body:{}});
  const session={
   video,stream,detector:engine,
   challenge:answer.challenge_id,steps:answer.steps,
   step:0,observations:[],blinkSawClosed:false,hold:0,
   lastAnalyze:0,started:performance.now(),sending:false,raf:0,onComplete
  };
  active=session;
  E('argus-face-consent').closest('label').hidden=true;
  button.hidden=true;
  setProgress(0,session.steps.length);
  setMessage(steps[session.steps[0]]+' · mantenha o rosto na moldura');
  loop(session);
 }catch(e){
  if(stream)for(const tr of stream.getTracks())tr.stop();
  button.disabled=false;
  setMessage('Não foi possível iniciar a verificação facial. Verifique câmera, internet e permissão do navegador. '+(e?.message||''),true);
 }
}
window.ArgusFaceCapture={open:createDialog,close:shutdown};
window.addEventListener('pagehide',shutdown);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)shutdown()});
})();
