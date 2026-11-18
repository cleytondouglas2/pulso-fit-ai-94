/* Real movement metrics from MediaPipe's 33 body landmarks.
 * Heuristic interpretation of learned landmarks, not a clinical biomechanical
 * diagnosis. No captured photos, keypoints or videos are sent or stored.
 */
(function(root){
 "use strict";
 if(root.PulsoPoseMetrics)return;
 const pairs=[
  [11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],
  [23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32]
 ];
 function visible(p,ids,threshold=.57){
  return ids.every(i=>p[i]&&Number.isFinite(p[i].x)&&Number.isFinite(p[i].y)&&
   (p[i].visibility===undefined||p[i].visibility>=threshold)&&
   (p[i].presence===undefined||p[i].presence>=.48));
 }
 function angle(a,b,c){
  const v=[a.x-b.x,a.y-b.y],w=[c.x-b.x,c.y-b.y];
  const mag=Math.hypot(...v)*Math.hypot(...w);
  if(mag<.0001)return NaN;
  return Math.acos(Math.min(1,Math.max(-1,(v[0]*w[0]+v[1]*w[1])/mag)))*180/Math.PI;
 }
 function bilateral(p,left,right,callback){
  const measurements=[];
  for(const ids of [left,right]){
   if(visible(p,ids)){
    const value=callback(...ids.map(id=>p[id]),ids);
    if(Number.isFinite(value))measurements.push(value);
   }
  }
  return measurements.length?Math.min(...measurements):NaN;
 }
 function analyze(exercise,points){
  const p=Array.isArray(points)?points:[];
  const missing={state:"missing",signal:"Ajuste a câmera para mostrar o corpo inteiro.",metric:null,eligible:false};
  if(p.length<29)return missing;
  let knee,elbow,posture;
  if(exercise==="squat"||exercise==="lunge"){
   knee=bilateral(p,[23,25,27],[24,26,28],angle);
   if(!Number.isFinite(knee))return missing;
   const low=exercise==="squat"?knee<125&&knee>55:knee<120&&knee>55;
   return {state:low?"down":knee>158?"up":"middle",signal:low?"Boa descida. Suba com controle.":knee>158?"Pernas estendidas. Faça a próxima descida.":"Movimento detectado. Mantenha o corpo estável.",metric:Math.round(knee),eligible:true};
  }
  if(exercise==="curl"){
   elbow=bilateral(p,[11,13,15],[12,14,16],angle);
   if(!Number.isFinite(elbow))return missing;
   const bent=elbow<78&&elbow>17,extended=elbow>146;
   return {state:bent?"down":extended?"up":"middle",signal:bent?"Flexão do cotovelo detectada.":"Retorne lentamente à posição inicial.",metric:Math.round(elbow),eligible:true};
  }
  if(exercise==="arm_raise"){
   if(!visible(p,[11,12,13,14,15,16]))return missing;
   const armAngle=bilateral(p,[11,13,15],[12,14,16],angle);
   const shoulders=(p[11].y+p[12].y)/2;
   const wrists=(p[15].y+p[16].y)/2;
   const horizontal=Math.abs(p[15].x-p[11].x)+Math.abs(p[16].x-p[12].x);
   if(!Number.isFinite(armAngle)||armAngle<130)return {state:"middle",signal:"Procure estender os braços suavemente.",metric:null,eligible:true};
   const high=wrists<=shoulders+.08&&horizontal>.35,low=wrists>shoulders+.25;
   return {state:high?"down":low?"up":"middle",signal:high?"Braços na altura dos ombros.":"Eleve sem compensar com o tronco.",metric:Math.round(armAngle),eligible:true};
  }
  if(exercise==="jumping_jack"){
   if(!visible(p,[11,12,15,16,23,24,27,28]))return missing;
   const shoulders=(p[11].y+p[12].y)/2;
   const hipWidth=Math.max(.05,Math.abs(p[23].x-p[24].x));
   const feet=Math.abs(p[27].x-p[28].x)/hipWidth;
   const up=p[15].y<shoulders-.09&&p[16].y<shoulders-.09;
   const down=p[15].y>shoulders+.18&&p[16].y>shoulders+.18;
   const open=feet>2.1&&up,closed=feet<1.8&&down;
   return {state:open?"down":closed?"up":"middle",signal:open?"Braços elevados e pés abertos.":"Abra os pés e eleve os braços com conforto.",metric:Math.round(feet*10)/10,eligible:true};
  }
  if(exercise==="pushup"){
   elbow=bilateral(p,[11,13,15],[12,14,16],angle);
   posture=bilateral(p,[11,23,27],[12,24,28],angle);
   if(!Number.isFinite(elbow)||!Number.isFinite(posture))return missing;
   const bodyFlat=posture>147;
   const low=elbow<108&&elbow>32&&bodyFlat,high=elbow>155&&bodyFlat;
   return {state:low?"down":high?"up":"middle",signal:!bodyFlat?"Procure alinhar ombros, quadril e tornozelos.":low?"Flexão identificada; retorne devagar.":"Mantenha o tronco estável.",metric:Math.round(elbow),eligible:true};
  }
  if(exercise==="plank"){
   posture=bilateral(p,[11,23,27],[12,24,28],angle);
   const ids=visible(p,[11,23,27])?[11,23,27]:visible(p,[12,24,28])?[12,24,28]:null;
   if(!ids||!Number.isFinite(posture))return missing;
   // Side camera: torso should be approximately horizontal, not standing up.
   const horizontal=Math.abs(p[ids[2]].x-p[ids[0]].x)>.26;
   const level=Math.abs(p[ids[2]].y-p[ids[0]].y)<.45;
   const hold=posture>155&&horizontal&&level;
   return {state:hold?"hold":"middle",signal:hold?"Boa linha corporal. Respire normalmente.":"Enquadre o corpo de lado e mantenha a linha ombro-quadril-tornozelo.",metric:Math.round(posture),eligible:true};
  }
  return {state:"unsupported",signal:"Detecção corporal ativa. A contagem automática deste movimento ainda não é validada; siga a demonstração 3D.",metric:null,eligible:false};
 }
 function advance(machine,reading,time){
  const now=Number(time)||0;
  const next={reps:Math.max(0,machine?.reps||0),phase:machine?.phase||"up",last:machine?.last||0,holdMs:machine?.holdMs||0,holdAt:machine?.holdAt||0};
  if(reading.state==="hold"){
   if(next.holdAt&&now-next.holdAt<=900)next.holdMs+=Math.max(0,now-next.holdAt);
   next.holdAt=now;
   return next;
  }
  next.holdAt=0;
  if(reading.state==="missing"||reading.state==="unsupported"||!reading.eligible)return next;
  if(reading.state==="up"){
   if(next.phase==="down"&&now-next.last>=450){
    next.reps++;next.last=now;next.phase="up";
   } else if(next.phase!=="down")next.phase="up";
  }else if(reading.state==="down"&&next.phase==="up"&&now-next.last>=350){
   next.phase="down";next.last=now;
  }
  return next;
 }
 root.PulsoPoseMetrics=Object.freeze({pairs,visible,angle,analyze,advance});
})(window);