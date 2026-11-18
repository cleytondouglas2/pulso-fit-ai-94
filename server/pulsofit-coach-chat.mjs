/* Authenticated generative Coach IA; no external worker URL required. */
import {Server} from "node:http";
import {basename} from "node:path";

export function validateCoachRequest(body){
 if(body?.consent!==true)throw Object.assign(Error("Autorize o uso da IA para enviar sua pergunta."),{status:403});
 const message=String(body?.message||"").trim();
 if(!message||message.length>1800)throw Object.assign(Error("Escreva uma pergunta de até 1800 caracteres."),{status:422});
 const history=Array.isArray(body?.history)?body.history.slice(-6):[];
 return {message,history:history.filter(x=>["user","model"].includes(x?.role)&&typeof x.text==="string").map(x=>({role:x.role,text:x.text.slice(0,1100)}))};
}
function reply(res,status,data){
 if(res.headersSent)return;
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(data));
}
function readJSON(req){
 return new Promise((resolve,reject)=>{
  if(!/^application\/json\b/i.test(String(req.headers["content-type"]||"")))return reject(Object.assign(Error("Envie JSON"),{status:415}));
  let bytes=0;const chunks=[];
  req.on("data",c=>{bytes+=c.length;if(bytes>14000){reject(Object.assign(Error("Mensagem muito longa"),{status:413}));req.destroy()}else chunks.push(c)});
  req.on("end",()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")))}catch{reject(Object.assign(Error("Corpo JSON inválido"),{status:400}))}});
  req.on("error",reject);
 });
}
async function generate(data){
 const env=["GEMINI_API_KEY","GOOGLE_API_KEY","PULSO_GEMINI_API_KEY","GOOGLE_GENERATIVE_AI_API_KEY","PULSO_AI_API_KEY"];
 const key=env.map(x=>process.env[x]).find(Boolean);
 if(!key)throw Object.assign(Error("Coach IA temporariamente indisponível. Não foi enviada resposta simulada."),{status:503});
 const guard="Você é o Pulso Coach IA do aplicativo PulsoFit. Responda em português do Brasil, com linguagem clara, precisa, acolhedora sem excesso, e orientações práticas sobre treino, nutrição geral, recuperação e metas. A conversa usa IA generativa real. Não invente avaliações físicas, calorias medidas, históricos nem dados pessoais. Peça contexto quando necessário. Não faça diagnósticos, prescrições médicas, promessas de resultado nem recomende atividades perigosas. Caso o usuário descreva sintomas graves, recomende atendimento apropriado. Responda à pergunta atual, sem repetir texto de aviso ou guias locais.";
 const contents=[{role:"user",parts:[{text:guard}]},...data.history.map(x=>({role:x.role,parts:[{text:x.text}]})),{role:"user",parts:[{text:data.message}]}];
 const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{
  method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
  body:JSON.stringify({contents,generationConfig:{temperature:0.65,maxOutputTokens:1200}}),
  signal:AbortSignal.timeout(23000),redirect:"error"
 });
 if(!response.ok)throw Object.assign(Error("A IA não respondeu agora. Tente novamente; nenhuma resposta genérica foi substituída."),{status:503});
 const json=await response.json();
 const answer=(json?.candidates?.[0]?.content?.parts||[]).map(x=>x.text||"").join("").trim();
 if(!answer)throw Object.assign(Error("A IA devolveu uma resposta vazia. Tente outra pergunta."),{status:503});
 return {answer:answer.slice(0,7500),provider:"gemini",generative:true};
}
if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_COACH_CHAT__){
 globalThis.__PULSO_COACH_CHAT__=true;
 const last=new Map();
 const original=Server.prototype.emit;
 Server.prototype.emit=function(event,...args){
  if(event!=="request"||args.length<2)return original.call(this,event,...args);
  const [req,res]=args;
  let path="";try{path=new URL(req.url,"http://localhost").pathname}catch{}
  if(path!=="/api/coach/secure-chat")return original.call(this,event,...args);
  void (async()=>{
   if(req.method!=="POST")return reply(res,405,{error:"Método inválido"});
   const authorization=String(req.headers.authorization||"");
   if(!authorization.startsWith("Bearer ")||authorization.length>4096)return reply(res,401,{error:"Entre na sua conta para conversar com o Coach."});
   const me=await fetch("http://127.0.0.1:"+(process.env.PORT||"10000")+"/api/me",{
    headers:{Authorization:authorization},cache:"no-store",signal:AbortSignal.timeout(5000)});
   if(!me.ok)return reply(res,401,{error:"Sessão expirada. Entre novamente."});
   const payload=await me.json(),user=payload.user||payload;
   const id=String(user.id||"");
   if(!/^[a-f0-9-]{36}$/i.test(id))return reply(res,401,{error:"Conta não reconhecida."});
   const data=validateCoachRequest(await readJSON(req));
   const now=Date.now(),used=(last.get(id)||[]).filter(t=>now-t<3600000);
   if(used.length>=35)return reply(res,429,{error:"Limite de mensagens de IA atingido. Tente novamente mais tarde."});
   used.push(now);last.set(id,used);
   if(last.size>2000)for(const [key,x] of last)if(!x.length||x[x.length-1]<now-3600000)last.delete(key);
   return reply(res,200,await generate(data));
  })().catch(e=>{
   console.warn("[pulso-coach] Generative chat unavailable code="+String(e.status||e.code||"AI").replace(/[^A-Z0-9_]/gi,"").slice(0,30));
   if(!res.headersSent)reply(res,[400,401,403,405,413,415,422,429].includes(e.status)?e.status:503,{error:e.message||"Não foi possível conversar com a IA."});
   else if(!res.writableEnded)res.end();
  });
  return true;
 };
 console.log("[pulso-coach] Private Gemini conversational route mounted; explicit consent required.");
}
