/**
 * PulsoFit • Treino Vivo — personal training sessions per authenticated user.
 * Append-only storage. Does not change existing assessments, billing or progress.
 * Only the currently authenticated user's rows may be read/written.
 */
import {Server} from "node:http";
import {basename} from "node:path";

if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_TREINO_VIVO_API__){
 globalThis.__PULSO_TREINO_VIVO_API__=true;
 const route="/api/fitness/training-lab";
 const dbVar=["PULSO_BILLING_DATABASE_URL","DATABASE_URL","PULSO_DATABASE_URL","POSTGRES_URL","PG_CONNECTION_STRING"].find(k=>Boolean(process.env[k]));
 const kinds=new Set(["express","strength","mobility","quiet_cardio","core","recovery","walk_run","functional","low_impact","athletic"]);
 const places=new Set(["home","gym","crossfit","outdoor","anywhere"]);
 const levels=new Set(["beginner","intermediate","advanced"]);
 const energies=new Set(["low","medium","high"]);
 let pool=null,ready=false,condition="starting";
 function respond(res,status,payload){
  if(res.writableEnded)return;
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});
  res.end(JSON.stringify(payload));
 }
 async function initialize(){
  if(!dbVar){condition="db_missing";return}
  try{
   const p=await import("pg"),Pool=p.Pool||p.default?.Pool;
   pool=new Pool({connectionString:process.env[dbVar],max:3,connectionTimeoutMillis:6000,idleTimeoutMillis:16000});
   await pool.query("SELECT 1");
   await pool.query("CREATE TABLE IF NOT EXISTS pf_training_lab_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES pf_users(id) ON DELETE CASCADE, session_key varchar(72) NOT NULL, style varchar(32) NOT NULL,place varchar(24) NOT NULL,level varchar(24) NOT NULL, energy varchar(16) NOT NULL, minutes smallint NOT NULL, effort smallint NOT NULL, low_impact boolean NOT NULL DEFAULT false, quiet boolean NOT NULL DEFAULT false, exercises jsonb NOT NULL DEFAULT '[]'::jsonb, note varchar(320) NOT NULL DEFAULT '', completed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,session_key))");
   await pool.query("CREATE INDEX IF NOT EXISTS pf_training_lab_user_date ON pf_training_lab_sessions(user_id,completed_at DESC)");
   ready=true;condition="ready";
  }catch(e){condition="db_unavailable";console.warn("[pulso-treino] training history store unavailable: "+String(e.code||"init").replace(/[^a-zA-Z0-9]/g,"").slice(0,24));}
 }
 const startup=initialize();
 async function currentUser(req){
  const auth=String(req.headers.authorization||"");
  if(!auth.startsWith("Bearer ")||auth.length>4096)return null;
  try{
   const r=await fetch("http://127.0.0.1:"+(process.env.PORT||"10000")+"/api/me",{
    headers:{Authorization:auth},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(4500)});
   if(!r.ok)return null;
   const j=await r.json(),u=j.user||j;
   const id=String(u?.id||"");
   return /^[0-9a-f-]{36}$/i.test(id)?id:null;
  }catch{return null}
 }
 async function readBody(req){
  if(!String(req.headers["content-type"]||"").toLowerCase().startsWith("application/json"))throw Object.assign(new Error("Envie JSON."),{status:415});
  let bytes=0,parts=[];
  for await(const c of req){bytes+=c.length;if(bytes>14000)throw Object.assign(new Error("Sessão muito grande."),{status:413});parts.push(c)}
  try{return JSON.parse(Buffer.concat(parts).toString("utf8"))}catch{throw Object.assign(new Error("Dados da sessão inválidos."),{status:400})}
 }
 function validate(v){
  if(!v||typeof v!=="object"||Array.isArray(v))throw Object.assign(new Error("Sessão inválida."),{status:422});
  const key=String(v.sessionKey||"").trim();
  if(!/^[a-zA-Z0-9_-]{12,72}$/.test(key))throw Object.assign(new Error("Identificador de sessão inválido."),{status:422});
  const style=String(v.style||""),place=String(v.place||""),level=String(v.level||""),energy=String(v.energy||"");
  if(!kinds.has(style)||!places.has(place)||!levels.has(level)||!energies.has(energy))throw Object.assign(new Error("Seleção de treino inválida."),{status:422});
  const minutes=Number(v.minutes),effort=Number(v.effort);
  if(!Number.isInteger(minutes)||minutes<5||minutes>120||!Number.isInteger(effort)||effort<1||effort>10)throw Object.assign(new Error("Duração ou esforço inválido."),{status:422});
  if(!Array.isArray(v.exercises)||v.exercises.length<1||v.exercises.length>16||v.exercises.some(x=>typeof x!=="string"||!/^[a-z][a-z0-9_-]{2,56}$/.test(x)))throw Object.assign(new Error("Lista de exercícios inválida."),{status:422});
  const note=String(v.note||"").trim().slice(0,320);
  return {key,style,place,level,energy,minutes,effort,lowImpact:!!v.lowImpact,quiet:!!v.quiet,exercises:[...new Set(v.exercises)],note};
 }
 async function run(req,res,user){
  await startup;
  if(!ready)return respond(res,503,{error:"Histórico temporariamente indisponível.",code:condition});
  if(req.method==="GET"){
   const q=await pool.query("SELECT id,session_key,style,place,level,energy,minutes,effort,low_impact,quiet,exercises,note,completed_at FROM pf_training_lab_sessions WHERE user_id=$1::uuid ORDER BY completed_at DESC LIMIT 80",[user]);
   const entries=q.rows.map(x=>({id:x.id,sessionKey:x.session_key,style:x.style,place:x.place,level:x.level,energy:x.energy,minutes:x.minutes,effort:x.effort,lowImpact:x.low_impact,quiet:x.quiet,exercises:x.exercises,note:x.note,completedAt:x.completed_at}));
   return respond(res,200,{items:entries,storage:"account"});
  }
  if(req.method==="POST"){
   const v=validate(await readBody(req));
   const r=await pool.query("INSERT INTO pf_training_lab_sessions(user_id,session_key,style,place,level,energy,minutes,effort,low_impact,quiet,exercises,note) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) ON CONFLICT(user_id,session_key) DO UPDATE SET session_key=EXCLUDED.session_key RETURNING id,completed_at",
    [user,v.key,v.style,v.place,v.level,v.energy,v.minutes,v.effort,v.lowImpact,v.quiet,JSON.stringify(v.exercises),v.note]);
   return respond(res,200,{saved:true,id:r.rows[0].id,completedAt:r.rows[0].completed_at});
  }
  return respond(res,405,{error:"Método não permitido."});
 }
 const original=Server.prototype.emit;
 Server.prototype.emit=function(event,...args){
  if(event==="request"&&args.length>=2){
   const [req,res]=args;
   let path;try{path=new URL(req.url,"http://localhost").pathname}catch{}
   if(path===route){
    void(async()=>{
     const user=await currentUser(req);
     if(!user)return respond(res,401,{error:"Entre na sua conta para acompanhar seus treinos."});
     await run(req,res,user);
    })().catch(e=>{
     if(!res.headersSent)respond(res,[400,413,415,422].includes(e.status)?e.status:503,{error:e.status?String(e.message):"Não foi possível registrar esta sessão."});
     else if(!res.writableEnded)res.end();
    });
    return true;
   }
  }
  return original.call(this,event,...args);
 };
 console.log("[pulso-treino] Treino Vivo API montada; sessões vinculadas à conta.");
}
