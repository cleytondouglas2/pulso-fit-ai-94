/* Classify exercises for camera 3D avatar; no camera frames sent to server. */
import {Server} from "node:http";
import {basename} from "node:path";

export const AR_CATALOG_LABELS=Object.freeze({
 "march":"Marcha confortável no lugar",
 "shoulder_roll":"Círculos de ombro",
 "arm_swing":"Balanço controlado de braços",
 "ankle_pump":"Mobilização de tornozelos",
 "side_step":"Passo lateral",
 "hip_circle":"Círculos pequenos de quadril",
 "chair_squat":"Sentar e levantar de cadeira",
 "body_squat":"Agachamento livre",
 "goblet_squat":"Agachamento com halter",
 "leg_press":"Leg press controlado",
 "box_step":"Subida em degrau baixo",
 "split_squat":"Afundo estático assistido",
 "wall_push":"Flexão de braços na parede",
 "incline_push":"Flexão em superfície elevada firme",
 "floor_push":"Flexão de braços no chão",
 "dumbbell_press":"Supino com halteres",
 "machine_chest":"Empurrar no aparelho peitoral",
 "band_row":"Remada com faixa",
 "dumbbell_row":"Remada unilateral com halter",
 "cable_row":"Remada sentada na máquina",
 "wall_pull":"Retração das escápulas",
 "hip_hinge":"Inclinação de quadril sem peso",
 "glute_bridge":"Ponte de glúteos",
 "dumbbell_deadlift":"Levantamento romeno leve",
 "machine_hamstring":"Flexão de joelhos na máquina",
 "calf_raise":"Elevação de panturrilhas",
 "dead_bug":"Dead bug controlado",
 "bird_dog":"Braço e perna opostos",
 "side_plank":"Prancha lateral adaptada",
 "forearm_plank":"Prancha de antebraço",
 "standing_knee":"Elevação alternada de joelhos",
 "pallof_band":"Pressão antirrotação com faixa",
 "standing_twist":"Rotação de tronco leve",
 "incline_walk":"Caminhada vigorosa leve",
 "walk_easy":"Caminhada tranquila",
 "walk_interval":"Caminhada com mudança de ritmo",
 "easy_jog":"Trote leve opcional",
 "indoor_walk":"Passos em circuito pequeno",
 "step_taps":"Toques alternados no degrau",
 "shadow_box":"Boxe sem impacto e sem saltos",
 "heel_dig":"Calcanhares à frente alternados",
 "skater_step":"Passo lateral estilo patinador",
 "squat_pulse":"Agachamento parcial ritmado",
 "low_jack":"Polichinelo sem salto",
 "jump_jack":"Polichinelo com salto opcional",
 "mountain_walk":"Escalador lento em bancada",
 "high_knee":"Marcha alta rápida",
 "hip_open":"Abertura suave de quadril",
 "thoracic_rotate":"Rotação torácica em quatro apoios",
 "cat_cow":"Gato e vaca lentos",
 "wall_slide":"Deslizamento de braços na parede",
 "neck_relax":"Relaxamento lateral do pescoço",
 "breathing":"Respiração confortável e calma",
 "seated_march":"Marcha sentada",
 "hamstring_glide":"Deslizamento leve de posterior",
 "quad_stretch":"Alongamento de quadríceps com apoio",
 "calf_stretch":"Alongamento de panturrilha na parede",
 "back_relax":"Postura confortável de descanso",
 "balance_touch":"Equilíbrio com apoio",
 "band_press":"Empurrar faixa à frente",
 "band_pull":"Puxada de faixa na frente do peito",
 "dumbbell_carry":"Caminhada curta carregando halteres",
 "step_reach":"Passo lateral com alcance",
 "sit_reach":"Sentar, levantar e alcançar",
 "fast_feet":"Passinhos rápidos sem salto",
 "single_balance":"Passo com equilíbrio",
 "seated_reach":"Alcance alternado sentado",
 "decline_pushup":"Flexão declinada (peito)",
 "diamond_pushup":"Flexão diamante (peito e tríceps)",
 "pseudo_planche":"Flexão pseudo planche (peito, ombros e core)",
 "bulgarian_squat":"Agachamento búlgaro (pernas)",
 "nordic_curl":"Flexão nórdica assistida (posterior de coxa)",
 "chinup_supinated":"Barra fixa supinada (bíceps e costas)",
 "squat":"Agachamento","lunge":"Afundo","jumping_jack":"Polichinelo","curl":"Rosca bíceps",
 "arm_raise":"Elevação lateral","pushup":"Flexão de braços","plank":"Prancha","bridge":"Ponte de glúteos"
});
export const SUPPORTED_AR_EXERCISES=Object.freeze(Object.keys(AR_CATALOG_LABELS));
const normalize=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
export function matchARExercise(text){
 const n=normalize(text);if(!n)return null;
 const key=SUPPORTED_AR_EXERCISES.find(id=>id===String(text||"").trim()||normalize(AR_CATALOG_LABELS[id])===n);
 if(key)return key;
 const aliases={"agachamento bulgaro":"bulgarian_squat","flexao nordica":"nordic_curl","flexao diamante":"diamond_pushup","flexao declinada":"decline_pushup",
  "flexao pseudo planche":"pseudo_planche","barra supinada":"chinup_supinated","polichinelo sem salto":"low_jack"};
 return aliases[n]||null;
}
function respond(res,status,data){
 if(res.headersSent)return;
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(data));
}
function readJSON(req){
 return new Promise((resolve,reject)=>{
  if(!/^application\/json\b/i.test(String(req.headers["content-type"]||"")))return reject(Object.assign(Error("Use JSON"),{status:415}));
  let len=0,chunks=[];
  req.on("data",chunk=>{len+=chunk.length;if(len>1400){reject(Object.assign(Error("Mensagem muito longa"),{status:413}));req.destroy()}else chunks.push(chunk)});
  req.on("end",()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")))}catch{reject(Object.assign(Error("JSON inválido"),{status:400}))}});
  req.on("error",reject);
 });
}
export function validateARExercise(obj){
 const exercise=String(obj?.exercise||"").trim();
 if(obj?.consent!==true)throw Object.assign(Error("Autorize o envio do nome do exercício à IA."),{status:403});
 if(!exercise||exercise.length>170)throw Object.assign(Error("Descreva um exercício em até 170 caracteres."),{status:422});
 return exercise;
}
async function classify(exercise){
 const exact=matchARExercise(exercise);if(exact)return exact;
 const key=["GEMINI_API_KEY","GOOGLE_API_KEY","PULSO_GEMINI_API_KEY","GOOGLE_GENERATIVE_AI_API_KEY","PULSO_AI_API_KEY"].map(k=>process.env[k]).find(Boolean);
 if(!key)throw Object.assign(Error("IA de exercício indisponível. Selecione manualmente."),{status:503});
 const prompt="Selecione a animação 3D correspondente ao exercício. Responda com somente UM ID exato da lista, sem explicações. Exercícios disponíveis: "+SUPPORTED_AR_EXERCISES.map(id=>id+" = "+AR_CATALOG_LABELS[id]).join("; ")+". Não selecione polichinelo se o usuário pedir outro tipo de movimento. Pedido: "+exercise;
 const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{
  method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},redirect:"error",signal:AbortSignal.timeout(12500),
  body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:0,maxOutputTokens:25}})
 });
 if(!r.ok)throw Object.assign(Error("IA temporariamente indisponível. Escolha manualmente."),{status:503});
 const j=await r.json(),answer=(j?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("").trim().replace(/["']/g,"");
 if(!SUPPORTED_AR_EXERCISES.includes(answer))throw Object.assign(Error("IA não reconheceu o exercício. Escolha manualmente."),{status:503});
 return answer;
}
if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_AR_EXERCISE_COACH__){
 globalThis.__PULSO_AR_EXERCISE_COACH__=true;
 const previous=Server.prototype.emit,last=new Map();
 Server.prototype.emit=function(event,...args){
  if(event!=="request"||args.length<2)return previous.call(this,event,...args);
  const [req,res]=args;
  let path="";try{path=new URL(req.url,"http://localhost").pathname}catch{}
  if(path!=="/api/coach/ar-exercise")return previous.call(this,event,...args);
  void (async()=>{
   if(req.method!=="POST")return respond(res,405,{error:"Método inválido"});
   const auth=String(req.headers.authorization||"");
   if(!auth.startsWith("Bearer ")||auth.length>4096)return respond(res,401,{error:"Entre na sua conta."});
   const me=await fetch("http://127.0.0.1:"+(process.env.PORT||"10000")+"/api/me",{headers:{Authorization:auth},cache:"no-store",signal:AbortSignal.timeout(5000)});
   if(!me.ok)return respond(res,401,{error:"Sessão expirada."});
   const data=await me.json(),id=String((data.user||data).id||"");
   if(!/^[a-f0-9-]{36}$/i.test(id))return respond(res,401,{error:"Conta inválida."});
   const exercise=validateARExercise(await readJSON(req));
   const now=Date.now(),history=(last.get(id)||[]).filter(x=>now-x<3600000);
   if(history.length>=12)return respond(res,429,{error:"Limite de sugestões por hora. Escolha o exercício manualmente."});
   history.push(now);last.set(id,history);
   return respond(res,200,{exercise:await classify(exercise),source:"gemini",cameraDataSent:false});
  })().catch(err=>{
   console.warn("[pulso-ar] Exercise classification unavailable code="+String(err.status||err.code||"AI").replace(/[^a-z0-9_]/gi,"").slice(0,25));
   if(!res.headersSent)respond(res,[400,401,403,405,413,415,422,429].includes(err.status)?err.status:503,{error:err.message||"IA indisponível"});
   else if(!res.writableEnded)res.end();
  });
  return true;
 };
 console.log("[pulso-ar] Exercise classification route mounted; camera frames remain client-local.");
}
