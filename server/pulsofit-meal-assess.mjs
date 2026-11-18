/* PulsoFit authenticated meal photo assessment, no image storage. */
import {Server} from "node:http";
import {basename} from "node:path";
export function normalizeMeal(x){
 if(!x||typeof x!=="object")throw Error("Resposta da avaliação inválida");
 const number=(n,max=4000)=>{const v=Number(n);return Number.isFinite(v)&&v>=0&&v<=max?Math.round(v*10)/10:null};
 const foods=(Array.isArray(x.foods)?x.foods:[]).slice(0,14).map(f=>({
  name:String(f?.name||"").slice(0,70),grams:number(f?.grams),calories:number(f?.calories),
  proteinG:number(f?.proteinG),carbsG:number(f?.carbsG),fatG:number(f?.fatG)
 })).filter(f=>f.name&&f.calories!==null);
 if(!foods.length)throw Object.assign(Error("Não foi possível identificar alimentos. Tire outra foto do prato inteiro, com boa luz."),{status:422});
 const total=k=>Math.round(foods.reduce((a,f)=>a+(f[k]||0),0)*10)/10;
 if(total("calories")<=0)throw Object.assign(Error("Não foi possível estimar calorias com segurança; tente uma foto mais nítida."),{status:422});
 return {foods,totals:{calories:total("calories"),proteinG:total("proteinG"),carbsG:total("carbsG"),fatG:total("fatG")},
  opinion:String(x.opinion||"").slice(0,800),
  improvements:(Array.isArray(x.improvements)?x.improvements:[]).slice(0,5).map(t=>String(t).slice(0,220)),
  uncertainty:String(x.uncertainty||"").slice(0,420),estimateOnly:true};
}
function send(res,code,j){
 if(res.headersSent)return;
 res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(j));
}
function readBody(req){
 return new Promise((ok,fail)=>{
  if(!String(req.headers["content-type"]||"").startsWith("application/json"))return fail(Object.assign(Error("Formato JSON obrigatório"),{status:415}));
  let bytes=0;const chunks=[];
  req.on("data",p=>{bytes+=p.length;if(bytes>3400000){fail(Object.assign(Error("Foto muito grande"),{status:413}));req.destroy()}else chunks.push(p)});
  req.on("end",()=>{try{ok(JSON.parse(Buffer.concat(chunks).toString("utf8")))}catch{fail(Object.assign(Error("Imagem inválida"),{status:400}))}});
  req.on("error",fail);
 });
}
async function assess(mime,b64,goal){
 const key=["GEMINI_API_KEY","GOOGLE_API_KEY","PULSO_GEMINI_API_KEY","GOOGLE_GENERATIVE_AI_API_KEY","PULSO_AI_API_KEY"]
  .map(k=>process.env[k]).find(Boolean);
 if(!key)throw Error("IA de nutrição indisponível no servidor.");
 const instruction="Analise nutricional de ALIMENTOS REAIS visiveis numa foto de prato. Identifique cada alimento e porção aproximada; NÃO descreva roupa, cenário, prato, câmera ou pessoa. Estime gramas e calorias/macros de cada alimento com números realistas. Não use zeros quando houver comida identificável; se não identificar, retorne foods vazio. Informe se a refeição é equilibrada, pontos positivos, ajustes possíveis, incertezas como azeite, molho e tamanho. Considere o objetivo: "+String(goal||"equilíbrio geral").slice(0,60)+". Retorne APENAS JSON: {\"foods\":[{\"name\":\"arroz\",\"grams\":110,\"calories\":145,\"proteinG\":3,\"carbsG\":31,\"fatG\":0.2}],\"opinion\":\"avaliação da refeição\",\"improvements\":[\"sugestão\"],\"uncertainty\":\"incertezas\"}. Para foto não alimentar, use foods: [].";
 const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{
  method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
  body:JSON.stringify({contents:[{parts:[{text:instruction},{inlineData:{mimeType:mime,data:b64}}]}],
   generationConfig:{temperature:0.25,responseMimeType:"application/json",maxOutputTokens:2100}}),
  signal:AbortSignal.timeout(27000),redirect:"error"
 });
 if(!r.ok)throw Error("A IA não respondeu. Tente novamente.");
 const answer=await r.json();
 const txt=answer?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
 let json;try{json=JSON.parse(txt.trim())}catch{throw Error("Análise incompleta. Envie outra foto.")}
 return normalizeMeal(json);
}
if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_MEAL_AI__){
 globalThis.__PULSO_MEAL_AI__=true;
 const orig=Server.prototype.emit,previous=new Map();
 Server.prototype.emit=function(event,...args){
  if(event==="request"&&args.length>1){
   const [req,res]=args;
   let path="";try{path=new URL(req.url,"http://localhost").pathname}catch{}
   if(path==="/api/ai/meal/assess"){
    void (async()=>{
     if(req.method!=="POST")return send(res,405,{error:"Método inválido"});
     if(!String(req.headers.authorization||"").startsWith("Bearer "))return send(res,401,{error:"Entre na sua conta para analisar refeições."});
     const me=await fetch("http://127.0.0.1:"+(process.env.PORT||10000)+"/api/me",{
      headers:{Authorization:req.headers.authorization},cache:"no-store",signal:AbortSignal.timeout(6000)});
     if(!me.ok)return send(res,401,{error:"Sessão expirada. Entre novamente."});
     const user=await me.json(),id=String(user?.user?.id||"");
     if(!/^[a-f0-9-]{36}$/i.test(id))return send(res,401,{error:"Conta inválida."});
     if(Date.now()-(previous.get(id)||0)<17000)return send(res,429,{error:"Aguarde alguns segundos entre análises."});
     const data=await readBody(req);
     const m=/^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(String(data.imageDataUrl||""));
     if(!m||m[2].length<800||m[2].length>2800000)return send(res,422,{error:"Selecione uma foto JPG, PNG ou WebP com até 2 MB."});
     previous.set(id,Date.now());if(previous.size>3000)for(const [key,time] of previous)if(Date.now()-time>180000)previous.delete(key);
     return send(res,200,await assess(m[1],m[2],data.goal));
    })().catch(e=>{console.warn("[pulso-meal] Analysis error code="+String(e.status||"ai"));
     if(!res.headersSent)send(res,[400,401,405,413,415,422,429].includes(e.status)?e.status:503,{error:e.message||"Falha na avaliação da refeição."});
     else if(!res.writableEnded)res.end();
    });return true;
   }
  }
  return orig.call(this,event,...args);
 };
 console.log("[pulso-meal] Private nutrition photo AI mounted; no photos persisted.");
}