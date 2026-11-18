/**
 * PulsoFit AI - cadastro obrigatório, mídia privada e Performance IA.
 * Carregado pelo NODE_OPTIONS/servidor gerado, sem editar credenciais.
 * Fotos de perfil armazenadas por usuário no PostgreSQL; fotos de performance
 * são processadas em memória e NÃO são gravadas no servidor.
 */
import { Server } from "node:http";
import { basename } from "node:path";

if (basename(process.argv[1] || "") === "server.mjs" && !globalThis.__PULSO_PRIVATE_FEATURES__) {
 globalThis.__PULSO_PRIVATE_FEATURES__ = true;
 const dbVar=["PULSO_BILLING_DATABASE_URL","DATABASE_URL","PULSO_DATABASE_URL","POSTGRES_URL","PG_CONNECTION_STRING"].find(k=>Boolean(process.env[k]));
 const aiVar=["GEMINI_API_KEY","GOOGLE_API_KEY","PULSO_GEMINI_API_KEY","GOOGLE_GENERATIVE_AI_API_KEY","PULSO_AI_API_KEY"].find(k=>Boolean(process.env[k]));
 const model= /^[A-Za-z0-9._-]+$/.test(process.env.PULSO_PERFORMANCE_MODEL||"")?process.env.PULSO_PERFORMANCE_MODEL:"gemini-2.5-flash";
 const routes=new Set(["/api/profile/photo","/api/ai/body/analyze","/api/performance/config"]);
 const publicPaths=new Set(["/api/health","/api/health/ai","/api/plans","/api/billing/config","/api/billing/health","/api/me"]);
 const exempt=(path)=>!path.startsWith("/api/")||publicPaths.has(path)||path.startsWith("/api/auth/");
 let pool=null,dbReady=false;
 const lastAI=new Map();
 const init=(async()=>{
  try{
   if(!dbVar)throw Error("missing_database");
   const pg=await import("pg");
   const Pool=pg.Pool||pg.default?.Pool;
   if(!Pool)throw Error("missing_pg");
   pool=new Pool({connectionString:process.env[dbVar],max:4,connectionTimeoutMillis:6000,idleTimeoutMillis:15000});
   await pool.query("SELECT 1");
   await pool.query("CREATE TABLE IF NOT EXISTS pf_private_profile_photos (user_id uuid PRIMARY KEY REFERENCES pf_users(id) ON DELETE CASCADE,mime text NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),data bytea NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())");
   dbReady=true;
  }catch(e){console.warn("[pulso-private] Photo storage not ready (code="+String(e.code||"init").replace(/[^a-zA-Z0-9_]/g,"").slice(0,30)+")");}
  console.log("[pulso-private] Account-only API mounted; avatarDB="+(dbReady?"ready":"unavailable")+" bodyAIKey="+Boolean(aiVar)+"; no secrets or images logged.");
 })();
 function json(res,status,body){
  if(res.writableEnded)return;
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store, private, max-age=0","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});
  res.end(JSON.stringify(body));
 }
 async function bodyJSON(req,limit=1400000){
  const type=String(req.headers["content-type"]||"");
  if(!type.startsWith("application/json"))throw Object.assign(Error("Envie dados JSON"),{status:415});
  let total=0;const chunks=[];
  for await(const chunk of req){
   total+=chunk.length;
   if(total>limit)throw Object.assign(Error("Arquivo muito grande; reduza a foto para até 1 MB"),{status:413});
   chunks.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8"))}catch{throw Object.assign(Error("Dados JSON inválidos"),{status:400})}
 }
 function imageData(value,maxBytes=900000){
  const input=String(value||"");
  const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
  if(!match)throw Object.assign(Error("Use uma imagem JPG, PNG ou WebP"),{status:422});
  const b64=match[2];
  if(b64.length>Math.ceil(maxBytes*4/3)+8)throw Object.assign(Error("A foto excede o tamanho permitido"),{status:413});
  const bytes=Buffer.from(b64,"base64");
  if(bytes.length<180||bytes.length>maxBytes)throw Object.assign(Error("Arquivo de imagem inválido ou muito grande"),{status:422});
  const mime=match[1];
  const isJpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const isPng=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isWebp=bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
  if(!(mime==="image/jpeg"&&isJpg||mime==="image/png"&&isPng||mime==="image/webp"&&isWebp))throw Object.assign(Error("A foto não corresponde ao formato declarado"),{status:422});
  return {mime,bytes,base64:b64};
 }
 async function authenticate(req){
  const auth=String(req.headers.authorization||"");
  if(!auth.startsWith("Bearer ")||auth.length>4096)return null;
  try{
   const response=await fetch("http://127.0.0.1:"+(process.env.PORT||"10000")+"/api/me",{
    headers:{Authorization:auth},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(5000)
   });
   if(!response.ok)return null;
   const payload=await response.json(),user=payload?.user||payload;
   if(!/^[0-9a-f-]{36}$/i.test(String(user?.id||"")))return null;
   return {id:String(user.id),role:String(user.role||"user")};
  }catch{return null}
 }
 async function analyzePhoto(userId,raw,goal){
  if(!aiVar)throw Object.assign(Error("A IA de visão ainda não está configurada no servidor"),{status:503});
  const now=Date.now(),history=(lastAI.get(userId)||[]).filter(x=>now-x<3600000);
  if(history.length>=6)throw Object.assign(Error("Limite de 6 análises por hora; tente novamente mais tarde"),{status:429});
  history.push(now);lastAI.set(userId,history);
  const photo=imageData(raw,950000);
  const selectedGoal=String(goal||"condicionamento geral").slice(0,70).replace(/[<>]/g,"");
  const prompt=[
   "Você é um assistente de educação física. Faça uma análise VISUAL CUIDADOSA de uma foto corporal, em português do Brasil, com objetivo de acompanhamento de desempenho.",
   "Objetivo informado pelo próprio usuário: "+selectedGoal+".",
   "Só descreva características de fato observáveis na imagem: posição aparente de ombros, tronco, quadril e membros, alinhamento visível, iluminação, enquadramento, se partes do corpo são visíveis, e possíveis limitações de avaliação.",
   "A partir de uma única foto estática NÃO é possível concluir composição corporal, percentual de gordura, massa muscular real, peso, saúde, força, lesões, diagnóstico, evolução entre datas ou qualidade de movimento. Não invente esses números ou afirmações. Não assuma idade, gênero, identidade ou diagnóstico.",
   "Use linguagem respeitosa e neutra, nunca vergonha corporal, insultos, notas de beleza ou promessas de transformação. Se a pessoa não aparecer por inteiro, explique o que fica impossível avaliar. Se a imagem não apresentar uma pessoa identificável para fins de postura, informe que não foi possível analisar.",
   "Responda detalhadamente em seções Markdown: 1. Observações visuais objetivas; 2. Postura e alinhamento aparentes (com limites); 3. O que a imagem NÃO permite medir; 4. Orientações práticas de treino para o objetivo informado, progressivas e seguras; 5. Como acompanhar a evolução usando medidas funcionais, treinos e fotos padronizadas. Termine com nota breve de que não substitui avaliação profissional.",
   "Não prescreva dietas restritivas, calorias personalizadas, suplemento ou tratamento médico. Informe que foto corporal não serve para estimar riscos médicos."
  ].join("\n");
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
   method:"POST",redirect:"error",signal:AbortSignal.timeout(35000),
   headers:{"x-goog-api-key":process.env[aiVar],"Content-Type":"application/json"},
   body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt},{inline_data:{mime_type:photo.mime,data:photo.base64}}]}],
    generationConfig:{temperature:0.25,maxOutputTokens:2100}})
  });
  if(!response.ok){console.warn("[pulso-private] Gemini body analysis unavailable; status="+response.status);throw Object.assign(Error("A IA está indisponível agora. Nenhuma análise simulada foi produzida."),{status:503})}
  const result=await response.json();
  const answer=(result.candidates||[]).flatMap(x=>x?.content?.parts||[]).map(x=>typeof x.text==="string"?x.text:"").join("\n").trim();
  if(answer.length<50)throw Object.assign(Error("A IA não conseguiu analisar essa foto. Envie outra com melhor iluminação e enquadramento."),{status:422});
  return {analysis:answer.slice(0,13000),model,stored:false,disclaimer:"A análise é apenas informativa e não estima gordura corporal, peso, saúde ou diagnóstico a partir de uma foto."};
 }
 async function route(req,res,path,user){
  await init;
  if(path==="/api/performance/config"){
   if(req.method!=="GET")return json(res,405,{error:"Método não permitido"});
   return json(res,200,{authenticated:true,avatarStorageReady:dbReady,bodyAIConfigured:Boolean(aiVar),photoStoredForAnalysis:false,limits:{maxBodyImageBytes:950000,maxAvatarImageBytes:500000}});
  }
  if(path==="/api/profile/photo"){
   if(!dbReady)return json(res,503,{error:"Armazenamento de foto temporariamente indisponível"});
   if(req.method==="GET"){
    const result=await pool.query("SELECT mime,data,updated_at FROM pf_private_profile_photos WHERE user_id=$1",[user.id]);
    const item=result.rows[0];
    return json(res,200,item?{hasPhoto:true,image:"data:"+item.mime+";base64,"+item.data.toString("base64"),updatedAt:item.updated_at}:{hasPhoto:false});
   }
   if(req.method==="DELETE"){
    await pool.query("DELETE FROM pf_private_profile_photos WHERE user_id=$1",[user.id]);
    return json(res,200,{deleted:true});
   }
   if(req.method==="PUT"){
    const data=await bodyJSON(req,900000),photo=imageData(data?.image,500000);
    await pool.query("INSERT INTO pf_private_profile_photos(user_id,mime,data,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(user_id) DO UPDATE SET mime=EXCLUDED.mime,data=EXCLUDED.data,updated_at=now()",[user.id,photo.mime,photo.bytes]);
    return json(res,200,{saved:true});
   }
   return json(res,405,{error:"Método não permitido"});
  }
  if(path==="/api/ai/body/analyze"){
   if(req.method!=="POST")return json(res,405,{error:"Método não permitido"});
   const data=await bodyJSON(req);
   if(data?.consent!==true)return json(res,422,{error:"Autorize explicitamente o envio da foto à IA para análise"});
   const result=await analyzePhoto(user.id,data?.image,data?.goal);
   return json(res,200,result);
  }
  return json(res,404,{error:"Rota não encontrada"});
 }
 const previousEmit=Server.prototype.emit;
 Server.prototype.emit=function(event,...args){
  if(event==="request"&&args.length>=2){
   const [req,res]=args;
   let path="";try{path=new URL(req.url,"http://localhost").pathname}catch{}
   if(path.startsWith("/api/")&&!exempt(path)){
    void (async()=>{
     const user=await authenticate(req);
     if(!user){json(res,401,{error:"Entre ou crie uma conta para usar o PulsoFit.",code:"ACCOUNT_REQUIRED"});return}
     if(routes.has(path))return route(req,res,path,user);
     return previousEmit.call(this,event,...args);
    })().catch(err=>{
     if(!res.headersSent)json(res,[400,413,415,422,429].includes(err.status)?err.status:503,{error:[400,413,415,422,429].includes(err.status)||err.status===503?String(err.message).slice(0,260):"Serviço temporariamente indisponível"});
     else if(!res.writableEnded)res.end();
    });
    return true;
   }
  }
  return previousEmit.call(this,event,...args);
 };
 console.log("[pulso-private] Auth guard and private photo routes installed; guests cannot use protected APIs.");
}
