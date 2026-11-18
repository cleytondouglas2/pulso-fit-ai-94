/**
 * PulsoFit AI • Outdoor GPS sessions (walking, running, cycling).
 * Reads/writes only the authenticated user's records. No background tracking,
 * GPS collection at the server, or request logs with coordinates.
 * AI receives derived statistics only, never raw GPS points.
 */
import {Server} from "node:http";
import {basename} from "node:path";

if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_OUTDOOR_API__){
 globalThis.__PULSO_OUTDOOR_API__=true;
 const prefix="/api/fitness/outdoor";
 const dbVar=["PULSO_BILLING_DATABASE_URL","DATABASE_URL","PULSO_DATABASE_URL","POSTGRES_URL","PG_CONNECTION_STRING"].find(k=>!!process.env[k]);
 const aiVar=["GEMINI_API_KEY","GOOGLE_API_KEY","PULSO_GEMINI_API_KEY","GOOGLE_GENERATIVE_AI_API_KEY","PULSO_AI_API_KEY"].find(k=>!!process.env[k]);
 const model=/^[\w.-]{3,90}$/.test(process.env.PULSO_PERFORMANCE_MODEL||"")?process.env.PULSO_PERFORMANCE_MODEL:"gemini-2.5-flash";
 const SPORTS=new Set(["walk","run","bike"]);
 const aiWindow=new Map();
 let pool,ready=false,dbState="initializing";
 const send=(res,status,obj)=>{
  if(res.writableEnded)return;
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});
  res.end(JSON.stringify(obj));
 };
 const fail=(status,msg)=>Object.assign(new Error(msg),{status});
 const init=(async()=>{
  if(!dbVar){dbState="db_not_configured";return}
  try{
   const pg=await import("pg"),Pool=pg.Pool||pg.default?.Pool;
   pool=new Pool({connectionString:process.env[dbVar],max:3,connectionTimeoutMillis:6000,idleTimeoutMillis:16000});
   await pool.query("SELECT 1");
   await pool.query(`CREATE TABLE IF NOT EXISTS pf_outdoor_sessions(
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES pf_users(id) ON DELETE CASCADE,
     client_key varchar(75) NOT NULL,
     sport varchar(10) NOT NULL,
     duration_sec integer NOT NULL,
     distance_m numeric(11,2) NOT NULL,
     avg_speed_kmh numeric(7,2) NOT NULL,
     estimated_kcal numeric(9,1),
     elevation_gain_m numeric(8,1),
     gps_samples integer NOT NULL DEFAULT 0,
     accuracy_m numeric(7,1),
     route_points jsonb NOT NULL,
     analysis text,
     recorded_at timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT pf_outdoor_user_key UNIQUE(user_id,client_key)
    )`);
   await pool.query("CREATE INDEX IF NOT EXISTS pf_outdoor_user_dates ON pf_outdoor_sessions(user_id,recorded_at DESC)");
   ready=true;dbState="ready";
  }catch(e){dbState="unavailable";console.warn("[pulso-outdoor] Storage unavailable code="+String(e.code||"init").replace(/[^a-zA-Z0-9]/g,"").slice(0,24))}
  console.log("[pulso-outdoor] Private GPS sessions store="+dbState+" AI="+Boolean(aiVar)+"; no locations logged.");
 })();
 async function auth(req){
  const h=String(req.headers.authorization||"");
  if(!h.startsWith("Bearer ")||h.length>4096)return null;
  try{
   const r=await fetch("http://127.0.0.1:"+(process.env.PORT||"10000")+"/api/me",{
    headers:{Authorization:h},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(4500)});
   if(!r.ok)return null;
   const j=await r.json(),u=j.user||j,id=String(u?.id||"");
   return /^[0-9a-f-]{36}$/i.test(id)?{id}:null;
  }catch{return null}
 }
 async function body(req,max=600000){
  if(!/^application\/json\b/i.test(String(req.headers["content-type"]||"")))throw fail(415,"Envie JSON.");
  let total=0,parts=[];
  for await(const c of req){total+=c.length;if(total>max)throw fail(413,"O percurso é grande demais. Salve uma atividade menor.");parts.push(c)}
  try{return JSON.parse(Buffer.concat(parts).toString("utf8"))}catch{throw fail(400,"Dados inválidos.")}
 }
 function number(v,min,max,label,optional=false){
  if(optional&&(v===null||v===undefined||v===""))return null;
  const n=Number(v);
  if(!Number.isFinite(n)||n<min||n>max)throw fail(422,label+" fora dos limites.");
  return n;
 }
 function degToRad(n){return n*Math.PI/180}
 function meters(a,b){
  let da=degToRad(b[0]-a[0]),db=degToRad(b[1]-a[1]),x=Math.sin(da/2)**2+
   Math.cos(degToRad(a[0]))*Math.cos(degToRad(b[0]))*Math.sin(db/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));
 }
 function pointsCheck(v){
  if(!Array.isArray(v)||v.length<2||v.length>5000)throw fail(422,"O percurso deve conter de 2 a 5.000 pontos válidos.");
  return v.map((p,i)=>{
   if(!Array.isArray(p)||p.length<3||p.length>6)throw fail(422,"Ponto GPS inválido.");
   const lat=number(p[0],-85,85,"Latitude"),lng=number(p[1],-180,180,"Longitude");
   const ts=number(p[2],1000000000000,Date.now()+3600000,"Horário GPS");
   const accuracy=p[3]===null?null:number(p[3],0,250,"Precisão GPS");
   const altitude=p[4]===null?null:number(p[4],-500,9000,"Altitude");
   const gap=(p[5]===true||p[5]===1)?1:0;
   if(i>0&&ts<v[i-1][2])throw fail(422,"Horários GPS fora de ordem.");
   return [Number(lat.toFixed(6)),Number(lng.toFixed(6)),Math.round(ts),accuracy===null?null:Number(accuracy.toFixed(1)),altitude===null?null:Number(altitude.toFixed(1)),gap];
  });
 }
 function parseSession(d){
  if(!d||typeof d!=="object"||Array.isArray(d))throw fail(422,"Sessão inválida.");
  const key=String(d.clientKey||"").trim();
  if(!/^[a-zA-Z0-9_-]{12,75}$/.test(key))throw fail(422,"Identificador da sessão inválido.");
  const sport=String(d.sport||"");
  if(!SPORTS.has(sport))throw fail(422,"Modalidade inválida.");
  const duration=number(d.durationSec,30,86400,"Tempo de atividade");
  let pts=pointsCheck(d.points);
  let calc=0;
  for(let i=1;i<pts.length;i++){
   const prev=pts[i-1],curr=pts[i],elapsed=(curr[2]-prev[2])/1000;
   if(curr[5]||elapsed<1||elapsed>150)continue;
   const segment=meters(prev,curr);
   if(segment>0&&segment/elapsed<=(sport==="bike"?21:sport==="run"?10:4.5))calc+=segment;
  }
  if(calc>300000)throw fail(422,"Percurso fora dos limites esperados.");
  let speed=calc/1000/(duration/3600),kcal=number(d.estimatedKcal,0,20000,"Calorias estimadas",true);
  let elevation=number(d.elevationGainM,0,3000,"Altimetria",true);
  let accuracy=number(d.accuracyM,0,250,"Precisão média",true);
  return {key,sport,duration:Math.round(duration),distance:Number(calc.toFixed(2)),speed:Number(speed.toFixed(2)),kcal:kcal===null?null:Number(kcal.toFixed(1)),elevation:elevation===null?null:Number(elevation.toFixed(1)),accuracy:accuracy===null?null:Number(accuracy.toFixed(1)),points:pts};
 }
 function summary(row,includeRoute){
  const d={id:row.id,sport:row.sport,durationSec:row.duration_sec,distanceM:Number(row.distance_m),avgSpeedKmh:Number(row.avg_speed_kmh),
   estimatedKcal:row.estimated_kcal===null?null:Number(row.estimated_kcal),elevationGainM:row.elevation_gain_m===null?null:Number(row.elevation_gain_m),
   gpsSamples:row.gps_samples,accuracyM:row.accuracy_m===null?null:Number(row.accuracy_m),
   recordedAt:row.recorded_at,analysis:row.analysis||null};
  if(includeRoute)d.points=row.route_points;
  return d;
 }
 async function analyze(row){
  if(!aiVar)throw fail(503,"A análise por IA está indisponível; os dados objetivos da atividade estão salvos.");
  const now=Date.now(),id=String(row.user_id),hist=(aiWindow.get(id)||[]).filter(t=>now-t<3600000);
  if(hist.length>=4)throw fail(429,"Limite temporário de análises atingido. Consulte o resumo objetivo da atividade.");
  hist.push(now);aiWindow.set(id,hist);
  // Coordinates and start/end location NEVER sent to Gemini.
  const data={tipo:row.sport==="walk"?"caminhada":row.sport==="run"?"corrida":"ciclismo",
   duracaoMinutos:Number(row.duration_sec)/60,distanciaKm:Number(row.distance_m)/1000,
   velocidadeMediaKmh:Number(row.avg_speed_kmh),estimativaCalorias:row.estimated_kcal===null?null:Number(row.estimated_kcal),
   ganhoAltitudeEstimadoM:row.elevation_gain_m===null?null:Number(row.elevation_gain_m),
   amostrasGPS:row.gps_samples,precisaoGPSAproximadaM:row.accuracy_m===null?null:Number(row.accuracy_m)};
  const prompt=[
   "Você é o Coach PulsoFit AI. Analise uma atividade registrada por GPS em português do Brasil.",
   "Dados estritamente agregados, sem localização:",JSON.stringify(data),
   "Produza uma análise simples e motivadora (130–260 palavras) com seções RESUMO, RITMO E CONSISTÊNCIA, PRÓXIMA SESSÃO e LIMITAÇÕES DAS MEDIDAS.",
   "Distância/velocidade vêm do GPS e podem variar por precisão, sinal e pausas. Calorias e elevação, quando disponíveis, são estimativas aproximadas e não gasto medido nem gordura perdida.",
   "Não invente batimentos, passos, ganhos fisiológicos, recordes, condições médicas, percentuais de gordura, perda de peso nem comparações com treinos anteriores que não recebeu.",
   "Sugira progressão gradual e recuperação; não trate os números como diagnóstico. Se não houver calorias, não infira um valor. Nenhuma coordenada foi compartilhada."
  ].join("\n");
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
   method:"POST",redirect:"error",signal:AbortSignal.timeout(35000),
   headers:{"x-goog-api-key":process.env[aiVar],"Content-Type":"application/json"},
   body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:0.25,maxOutputTokens:1100}})
  });
  if(!r.ok){console.warn("[pulso-outdoor] AI analysis temporarily unavailable http="+r.status);throw fail(503,"A atividade foi salva, mas a IA não respondeu. Tente novamente mais tarde.");}
  const j=await r.json(),text=(j.candidates||[]).flatMap(c=>c.content?.parts||[]).map(p=>p.text||"").join("\n").trim();
  if(text.length<60)throw fail(503,"A IA não retornou uma análise suficiente. Seus dados continuam salvos.");
  return text.slice(0,6000);
 }
 async function dispatch(req,res,user,url){
  await init;
  if(!ready)return send(res,503,{error:"Histórico GPS temporariamente indisponível.",code:dbState});
  if(url.pathname===prefix&&req.method==="GET"){
   const id=url.searchParams.get("id");
   if(id){
    if(!/^[a-f0-9-]{36}$/i.test(id))throw fail(400,"Identificador inválido.");
    const q=await pool.query("SELECT * FROM pf_outdoor_sessions WHERE id=$1::uuid AND user_id=$2::uuid",[id,user.id]);
    return q.rows.length?send(res,200,{session:summary(q.rows[0],true)}):send(res,404,{error:"Atividade não encontrada."});
   }
   const q=await pool.query("SELECT id,sport,duration_sec,distance_m,avg_speed_kmh,estimated_kcal,elevation_gain_m,gps_samples,accuracy_m,recorded_at,analysis FROM pf_outdoor_sessions WHERE user_id=$1::uuid ORDER BY recorded_at DESC LIMIT 50",[user.id]);
   return send(res,200,{items:q.rows.map(row=>summary(row,false))});
  }
  if(url.pathname===prefix&&req.method==="POST"){
   const v=parseSession(await body(req));
   const q=await pool.query(`INSERT INTO pf_outdoor_sessions(user_id,client_key,sport,duration_sec,distance_m,avg_speed_kmh,estimated_kcal,elevation_gain_m,gps_samples,accuracy_m,route_points)
      VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
      ON CONFLICT(user_id,client_key) DO UPDATE SET client_key=EXCLUDED.client_key RETURNING id`,
      [user.id,v.key,v.sport,v.duration,v.distance,v.speed,v.kcal,v.elevation,v.points.length,v.accuracy,JSON.stringify(v.points)]);
   return send(res,200,{saved:true,id:q.rows[0].id,distanceM:v.distance,avgSpeedKmh:v.speed});
  }
  if(url.pathname===prefix&&req.method==="DELETE"){
   const id=url.searchParams.get("id");
   if(!id||!/^[a-f0-9-]{36}$/i.test(id))throw fail(400,"Identificador inválido.");
   const q=await pool.query("DELETE FROM pf_outdoor_sessions WHERE id=$1::uuid AND user_id=$2::uuid",[id,user.id]);
   return send(res,200,{deleted:q.rowCount>0});
  }
  if(url.pathname===prefix+"/analyze"&&req.method==="POST"){
   const reqBody=await body(req,5000),id=String(reqBody.id||"");
   if(!/^[a-f0-9-]{36}$/i.test(id))throw fail(400,"Atividade inválida.");
   const q=await pool.query("SELECT * FROM pf_outdoor_sessions WHERE id=$1::uuid AND user_id=$2::uuid",[id,user.id]);
   if(!q.rows.length)return send(res,404,{error:"Atividade não encontrada."});
   if(q.rows[0].analysis)return send(res,200,{analysis:q.rows[0].analysis,cached:true});
   const analysis=await analyze(q.rows[0]);
   await pool.query("UPDATE pf_outdoor_sessions SET analysis=$3 WHERE id=$1::uuid AND user_id=$2::uuid",[id,user.id,analysis]);
   return send(res,200,{analysis,cached:false});
  }
  return send(res,405,{error:"Método não permitido."});
 }
 const original=Server.prototype.emit;
 Server.prototype.emit=function(event,...args){
  if(event==="request"&&args.length>=2){
   const [req,res]=args;
   let url;try{url=new URL(req.url,"http://localhost")}catch{}
   if(url&&(url.pathname===prefix||url.pathname===prefix+"/analyze")){
    void(async()=>{
     const user=await auth(req);
     if(!user)return send(res,401,{error:"Faça login para usar e salvar atividades ao ar livre.",code:"LOGIN_REQUIRED"});
     return dispatch(req,res,user,url);
    })().catch(e=>{
     if(!res.headersSent)send(res,[400,401,404,413,415,422,429,503].includes(e.status)?e.status:503,{error:e.status?String(e.message).slice(0,280):"Não foi possível processar a atividade."});
     else if(!res.writableEnded)res.end();
    });
    return true;
   }
  }
  return original.call(this,event,...args);
 };
 console.log("[pulso-outdoor] Walking, running, cycling GPS API mounted; account-only routes.");
}
