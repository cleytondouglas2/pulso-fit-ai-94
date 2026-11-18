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
  const multi=Array.isArray(raw);
  if(multi&&(raw.length<1||raw.length>3))throw Object.assign(Error("Selecione de 1 a 3 fotos do próprio corpo."),{status:422});
  const photos=(multi?raw:[raw]).map(value=>imageData(value,multi?350000:950000));
  if(photos.reduce((sum,p)=>sum+p.bytes.length,0)>1020000)
   throw Object.assign(Error("As imagens somadas são grandes demais. Selecione fotos menores."),{status:413});
  const selectedGoal=String(goal||"condicionamento geral").slice(0,70).replace(/[<>]/g,"");
  const prompt=[
   "Você é um especialista em treinamento físico com capacidade de interpretação visual de imagens. Realize uma AVALIAÇÃO VISUAL FÍSICA FUNCIONAL da PESSOA NA FOTO, em português brasileiro, com conteúdo objetivo, útil e específico. Não faça uma simples legenda, descrição de roupa, acessórios, cenário ou estilo da fotografia.",
   "Objetivo de treino declarado: "+selectedGoal+".",
   "A imagem ou até três ângulos foram enviados voluntariamente pelo titular da conta para acompanhar o próprio treinamento. Examine todas as imagens anexadas, sem usar texto genérico. Se houver mais de uma imagem, trate as vistas como ângulos complementares da mesma pessoa, mas nunca afirme ter visto partes ocultas.",
   "Priorize, conforme visibilidade: (1) CONTORNO E PROPORÇÕES CORPORAIS APARENTES: tronco em relação a membros, largura e contornos aparentes da região dos ombros, tórax, cintura e quadril; (2) REGIÕES MUSCULARES VISÍVEIS: ombros, braços, tórax, dorso, abdômen, glúteos, coxas e panturrilhas; relate apenas definição/contorno VISUAL aparente quando realmente perceptível; (3) SIMETRIA E ALINHAMENTO APARENTES: diferenças visíveis entre lados e posicionamento de ombros, tronco, quadril, joelhos, com cautela por ângulo/posição; (4) O QUE PODE SER ACOMPANHADO: quais regiões são comparáveis em fotos futuras e quais estão encobertas, fora da foto ou pouco nítidas.",
   "É expressamente proibido transformar contornos visuais em medições de massa muscular, percentual de gordura, peso, saúde metabólica, força, condição clínica, presença de lesão, deformidade, diagnóstico, deficiência, idade, identidade ou aptidão física. Uma foto também NÃO permite provar mudança corporal ou evolução sem comparação padronizada. Não faça afirmações 'você tem X% de gordura' nem declare hipertrofia mensurada.",
   "Se uma região não estiver visível, escreva 'não avaliável nas imagens', em vez de inventar avaliação. Se o corpo completo não aparecer, avalie COM DETALHES as regiões visíveis e limite as demais. Se a imagem não mostrar corpo humano suficiente, explique claramente e solicite nova foto.",
   "Não comente se a pessoa está vestida, sem camisa, com roupa, com biquíni, ou descreva roupas/cenário, salvo uma frase estritamente necessária para dizer que determinada região não pode ser observada. Não atribua padrões de beleza nem nota ao corpo; mantenha linguagem respeitosa, motivadora e sem julgamento. Não diga que tem gordura a perder ou recomende emagrecimento apenas pela aparência.",
   "Formato obrigatório do relatório em Markdown, com estas seções, nesta ordem:",
   "## Panorama físico visível — detalhe em 3–5 frases as proporções e os contornos efetivamente identificáveis; não use clichês como 'corpo em forma'.",
   "## Análise por região — com subitens OMBROS E BRAÇOS, TÓRAX E DORSO, ABDÔMEN/TRONCO, QUADRIL E GLÚTEOS, COXAS E PANTURRILHAS. Para cada região observável, registre 1–3 observações visuais concretas; para as não visíveis, diga 'não avaliável nesta imagem'.",
   "## Simetria e postura aparentes — descreva alinhamentos que a foto permite observar, considerando ângulo, pose e perspectiva. Não diagnostique desvios posturais.",
   "## Interpretação para seu objetivo — conecte as observações ao objetivo declarado e proponha 3 recomendações PRÁTICAS de treinamento baseadas em movimentos e progressão gradual (e.g. agachar, empurrar, puxar, caminhar); não prescreva tratamentos.",
   "## Como acompanhar a evolução — descreva 3 maneiras verificáveis (medidas voluntárias, cargas/repetições, fotos de mesmo ângulo/iluminação) e quais conclusões dependem dessas medições.",
   "## Confiança e limitações — indique quais regiões realmente puderam ser analisadas, sem estimar gordura, massa muscular, calorias nem resultados clínicos.",
   "Dê preferência ao conteúdo da avaliação visual, não gaste espaço narrando a captura. Seja específico dentro do que é justificável pela foto, mas admita incerteza; nada de dados pessoais ou sensíveis inferidos. Não indique dietas restritivas, suplementos ou medicamentos.",
   "A resposta precisa ser substancial, bem organizada e diretamente vinculada às imagens enviadas. Em múltiplas vistas, diferencie as regiões visíveis em cada ângulo e não afirme que ocorreu evolução entre fotos do mesmo envio."
  ].join("\n");
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
   method:"POST",redirect:"error",signal:AbortSignal.timeout(35000),
   headers:{"x-goog-api-key":process.env[aiVar],"Content-Type":"application/json"},
   body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt},...photos.map(p=>({inline_data:{mime_type:p.mime,data:p.base64}}))]}],
    generationConfig:{temperature:0.2,maxOutputTokens:3600}})
  });
  if(!response.ok){console.warn("[pulso-private] Gemini body analysis unavailable; status="+response.status);throw Object.assign(Error("A IA está indisponível agora. Nenhuma análise simulada foi produzida."),{status:503})}
  const result=await response.json();
  const answer=(result.candidates||[]).flatMap(x=>x?.content?.parts||[]).map(x=>typeof x.text==="string"?x.text:"").join("\n").trim();
  if(answer.length<250||!/ombros|braços|tórax|dorso|tronco|quadril|coxas|panturrilhas/i.test(answer)){
   throw Object.assign(Error("A IA não produziu uma avaliação física específica desta foto. Tente uma imagem com corpo bem enquadrado, braços visíveis e boa iluminação."),{status:422});
  }
  return {analysis:answer.slice(0,18000),model,stored:false,analysisType:"visual_physical_structure",disclaimer:"Esta interpretação é apenas visual: não mede massa muscular, percentual de gordura, composição corporal, força ou problemas médicos."};
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
   const result=await analyzePhoto(user.id,Array.isArray(data?.images)?data.images:data?.image,data?.goal);
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
