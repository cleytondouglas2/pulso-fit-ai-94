/* Classify exercises for camera 3D avatar; no camera frames sent to server. */
import {Server} from "node:http";
import {basename} from "node:path";

export const SUPPORTED_AR_EXERCISES=Object.freeze([
 "squat","lunge","jumping_jack","curl","arm_raise","march","pushup","plank","bridge"
]);
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
 const key=["GEMINI_API_KEY","GOOGLE_API_KEY","PULSO_GEMINI_API_KEY","GOOGLE_GENERATIVE_AI_API_KEY","PULSO_AI_API_KEY"].map(k=>process.env[k]).find(Boolean);
 if(!key)throw Object.assign(Error("IA de exercício indisponível. Selecione manualmente."),{status:503});
 const prompt="Classifique o exercício descrito na melhor animação de treino 3D disponível. Responda EXCLUSIVAMENTE com uma chave exata dentre: "+SUPPORTED_AR_EXERCISES.join(", ")+". Agachamento búlgaro, passada = lunge; flexão diamante e pseudo planche = pushup; ponte glúteos = bridge. Em caso de ambiguidade, escolha a mais próxima, sem inventar animações. Exercício: "+exercise;
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
