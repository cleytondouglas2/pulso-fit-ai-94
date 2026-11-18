/**
 * PulsoFit — account-scoped Web Push for installed PWA (iOS + Android).
 * Pure Node 22 Web Push (RFC8291 AES-128-GCM and RFC8292 VAPID).
 * The server signs/encrypts push using a VAPID keypair persisted in PostgreSQL.
 * No user coordinates, images, API keys or passwords are sent in notifications.
 *
 * On Render Free instances background reminders are BEST EFFORT; the server
 * can sleep, suspending its in-process schedule. Real always-on reminders
 * need a paid always-on instance or an external cron sender.
 */
import {Server} from "node:http";
import {basename} from "node:path";
import {readFileSync} from "node:fs";
import {createECDH,createPrivateKey,createCipheriv,createDecipheriv,hkdfSync,randomBytes,sign} from "node:crypto";
import {pulsoIcon,pulsoManifest} from "./pulsofit-pwa-asset.mjs";

if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_WEB_PUSH_RUNTIME__){
 globalThis.__PULSO_WEB_PUSH_RUNTIME__=true;
 const prefix="/api/push";
 const assetPaths=new Set(["/pulsofit-sw.js","/pulsofit.webmanifest","/pulsofit-icon-192.png","/pulsofit-icon-512.png"]);
 const dbVar=["PULSO_BILLING_DATABASE_URL","DATABASE_URL","PULSO_DATABASE_URL","POSTGRES_URL","PG_CONNECTION_STRING"].find(k=>Boolean(process.env[k]));
 let pool=null,ready=false,state="initializing",vapid=null,checking=false;
 const sw=readFileSync(new URL("./pulsofit-push-sw.js",import.meta.url),"utf8");
 const json=(res,status,data)=>{
  if(res.writableEnded)return;
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"});
  res.end(JSON.stringify(data));
 };
 const fail=(status,msg)=>Object.assign(new Error(msg),{status});
 const b64=buf=>Buffer.from(buf).toString("base64url");
 const un64=s=>Buffer.from(String(s||""),"base64url");
 function validEndpoint(endpoint){
  try{
   const u=new URL(endpoint),h=u.hostname.toLowerCase();
   if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash)return false;
   const allow=h==="fcm.googleapis.com"||h==="updates.push.services.mozilla.com"||
     h==="web.push.apple.com"||h==="push.services.mozilla.com"||
     (h.endsWith(".push.apple.com")&&h.split(".").length>=4)||
     (h.endsWith(".notify.windows.com")&&h.split(".").length>=4);
   return allow&&u.href.length<2300;
  }catch{return false}
 }
 function verifySub(d){
  const sub=d?.subscription||d;
  if(!sub||typeof sub!=="object"||!validEndpoint(sub.endpoint))throw fail(422,"Endpoint push inválido ou não suportado.");
  const p=String(sub.keys?.p256dh||""),a=String(sub.keys?.auth||"");
  if(!/^[A-Za-z0-9_-]{70,125}$/.test(p)||!/^[A-Za-z0-9_-]{15,50}$/.test(a)||
   un64(p).length!==65||un64(p)[0]!==4||un64(a).length!==16)throw fail(422,"Chaves de inscrição push inválidas.");
  return {endpoint:sub.endpoint,p256dh:p,auth:a};
 }
 function tzValid(s){
  if(typeof s!=="string"||s.length>60||!s.includes("/")||!/^[A-Za-z0-9_+./-]+$/.test(s))return "America/Sao_Paulo";
  try{new Intl.DateTimeFormat("en-US",{timeZone:s});return s}catch{return "America/Sao_Paulo"}
 }
 function parseOptions(d){
  const h=Number(d?.reminderHour);
  const hour=Number.isInteger(h)&&h>=6&&h<=21?h:9;
  const tz=tzValid(d?.timezone);
  const categories={training:d?.training!==false,performance:d?.performance!==false,wellness:d?.wellness!==false};
  const perDay=Number(d?.tipsPerDay);
  const tipsPerDay=Number.isInteger(perDay)&&perDay>=1&&perDay<=3?perDay:3;
  return {hour,timezone:tz,categories,tipsPerDay};
 }
 async function body(req,max=8000){
  if(!/^application\/json\b/i.test(String(req.headers["content-type"]||"")))throw fail(415,"Envie JSON.");
  const parts=[];let bytes=0;
  for await(const c of req){bytes+=c.length;if(bytes>max)throw fail(413,"Dados enviados muito grandes.");parts.push(c)}
  try{return JSON.parse(Buffer.concat(parts).toString("utf8"))}catch{throw fail(400,"Dados inválidos.")}
 }
 async function currentUser(req){
  const authorization=String(req.headers.authorization||"");
  if(!authorization.startsWith("Bearer ")||authorization.length>4096)return null;
  try{
   const r=await fetch("http://127.0.0.1:"+(process.env.PORT||"10000")+"/api/me",{
    headers:{Authorization:authorization},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(4500)});
   if(!r.ok)return null;
   const j=await r.json(),u=j.user||j,id=String(u?.id||"");
   return /^[a-f0-9-]{36}$/i.test(id)?id:null;
  }catch{return null}
 }
 async function verifiedFirstName(req){
  const authorization=String(req.headers.authorization||"");
  if(!authorization.startsWith("Bearer "))return "você";
  try{
   const r=await fetch("http://127.0.0.1:"+(process.env.PORT||"10000")+"/api/me",{
    headers:{Authorization:authorization},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(4000)});
   if(!r.ok)return "você";
   const d=await r.json(),u=d?.user||d;
   const raw=String(u?.name||u?.fullName||u?.full_name||"").trim().split(/\s+/)[0]||"";
   const value=raw.replace(/[^\p{L}\p{M}'-]/gu,"").slice(0,35);
   return value.length>=2?value:"você";
  }catch{return "você"}
 }
 async function initialize(){
  if(!dbVar){state="database_not_configured";return}
  try{
   const pg=await import("pg"),Pool=pg.Pool||pg.default?.Pool;
   pool=new Pool({connectionString:process.env[dbVar],max:3,connectionTimeoutMillis:6000,idleTimeoutMillis:16000});
   await pool.query("SELECT 1");
   await pool.query(`CREATE TABLE IF NOT EXISTS pf_push_vapid (
    id smallint PRIMARY KEY CHECK(id=1),
    public_key varchar(128) NOT NULL,
    private_key varchar(128) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
   )`);
   await pool.query(`CREATE TABLE IF NOT EXISTS pf_push_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES pf_users(id) ON DELETE CASCADE,
    endpoint text NOT NULL UNIQUE,
    p256dh varchar(140) NOT NULL,
    auth_key varchar(70) NOT NULL,
    platform varchar(25) NOT NULL DEFAULT 'web',
    timezone varchar(65) NOT NULL DEFAULT 'America/Sao_Paulo',
    reminder_hour smallint NOT NULL DEFAULT 9,
    training boolean NOT NULL DEFAULT true,
    performance boolean NOT NULL DEFAULT true,
    wellness boolean NOT NULL DEFAULT false,
    tips_per_day smallint NOT NULL DEFAULT 1,
    first_name varchar(40) NOT NULL DEFAULT 'você',
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_sent_at timestamptz
   )`);
   await pool.query("ALTER TABLE pf_push_subscriptions ADD COLUMN IF NOT EXISTS wellness boolean NOT NULL DEFAULT false");
   await pool.query("ALTER TABLE pf_push_subscriptions ADD COLUMN IF NOT EXISTS tips_per_day smallint NOT NULL DEFAULT 1");
   await pool.query("ALTER TABLE pf_push_subscriptions ADD COLUMN IF NOT EXISTS first_name varchar(40) NOT NULL DEFAULT 'você'");
   await pool.query("CREATE INDEX IF NOT EXISTS pf_push_subscriptions_active ON pf_push_subscriptions(enabled,reminder_hour)");
   await pool.query(`CREATE TABLE IF NOT EXISTS pf_push_active_workouts (
    user_id uuid PRIMARY KEY REFERENCES pf_users(id) ON DELETE CASCADE,
    session_key varchar(80) NOT NULL,
    kind varchar(16) NOT NULL,
    title varchar(90) NOT NULL,
    state varchar(10) NOT NULL CHECK(state IN ('running','paused')),
    elapsed_ms bigint NOT NULL DEFAULT 0,
    resumed_at timestamptz,
    started_at timestamptz NOT NULL DEFAULT now(),
    detail varchar(100) NOT NULL DEFAULT '',
    endpoint text,
    last_notified_at timestamptz
   )`);
   await pool.query("ALTER TABLE pf_push_active_workouts ADD COLUMN IF NOT EXISTS endpoint text");
   await pool.query("CREATE INDEX IF NOT EXISTS pf_push_workouts_due ON pf_push_active_workouts(state,last_notified_at)");
   await pool.query(`CREATE TABLE IF NOT EXISTS pf_push_deliveries (
    subscription_id uuid NOT NULL REFERENCES pf_push_subscriptions(id) ON DELETE CASCADE,
    notification_key varchar(40) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    success boolean NOT NULL DEFAULT false,
    PRIMARY KEY(subscription_id,notification_key)
   )`);
   const old=await pool.query("SELECT public_key,private_key FROM pf_push_vapid WHERE id=1");
   if(!old.rows.length){
    const e=createECDH("prime256v1");e.generateKeys();
    await pool.query("INSERT INTO pf_push_vapid(id,public_key,private_key) VALUES (1,$1,$2) ON CONFLICT(id) DO NOTHING",
     [b64(e.getPublicKey()),b64(e.getPrivateKey())]);
   }
   const existing=await pool.query("SELECT public_key,private_key FROM pf_push_vapid WHERE id=1");
   vapid={public:existing.rows[0].public_key,private:existing.rows[0].private_key};
   if(un64(vapid.public).length!==65||un64(vapid.private).length!==32)throw Error("Vapid key format");
   ready=true;state="ready";
  }catch(e){state="database_unavailable";console.warn("[pulso-push] startup unavailable code="+String(e.code||"init").replace(/[^a-zA-Z0-9]/g,"").slice(0,30))}
  console.log("[pulso-push] Server state="+state+" webpush=encryption-enabled scheduled=best-effort-on-free");
 }
 const initialized=initialize();
 function vapidJWT(endpoint){
  const p=un64(vapid.public),d=un64(vapid.private);
  const priv=createPrivateKey({key:{kty:"EC",crv:"P-256",x:b64(p.subarray(1,33)),y:b64(p.subarray(33,65)),d:b64(d)},format:"jwk"});
  const head=b64(JSON.stringify({typ:"JWT",alg:"ES256"}));
  const claims=b64(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+35000,
   sub:"https://pulso-fit-ai-95-online.onrender.com"}));
  const data=head+"."+claims;
  return data+"."+b64(sign("sha256",Buffer.from(data),{key:priv,dsaEncoding:"ieee-p1363"}));
 }
 function encryptedPayload(subscription,plain){
  // RFC8291 Section 3: "WebPush: info\0" || UA pub || AS pub
  const ua=un64(subscription.p256dh),auth=un64(subscription.auth_key);
  const e=createECDH("prime256v1");e.generateKeys();
  const sender=e.getPublicKey(),shared=e.computeSecret(ua),salt=randomBytes(16);
  const info=Buffer.concat([Buffer.from("WebPush: info\0"),ua,sender]);
  const ikm=Buffer.from(hkdfSync("sha256",shared,auth,info,32));
  const cek=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: aes128gcm\0"),16));
  const nonce=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: nonce\0"),12));
  const cipher=createCipheriv("aes-128-gcm",cek,nonce);
  const data=Buffer.from(JSON.stringify(plain),"utf8");
  const padded=Buffer.concat([data,Buffer.from([2])]);
  const encrypted=Buffer.concat([cipher.update(padded),cipher.final(),cipher.getAuthTag()]);
  const count=Buffer.alloc(4);count.writeUInt32BE(4096);
  return Buffer.concat([salt,count,Buffer.from([sender.length]),sender,encrypted]);
 }
 async function send(subscription,message){
  if(!validEndpoint(subscription.endpoint))return {ok:false,status:422};
  const jwt=vapidJWT(subscription.endpoint);
  const encrypted=encryptedPayload(subscription,message);
  const r=await fetch(subscription.endpoint,{
   method:"POST",redirect:"error",signal:AbortSignal.timeout(14000),
   headers:{"Content-Encoding":"aes128gcm","Content-Type":"application/octet-stream","TTL":"86400",
    "Authorization":"vapid t="+jwt+", k="+vapid.public,"Urgency":"normal"},
   body:encrypted
  });
  return {ok:r.status>=200&&r.status<300,status:r.status};
 }
 async function removeInvalid(sub){
  try{await pool.query("DELETE FROM pf_push_subscriptions WHERE id=$1::uuid",[sub.id])}catch{}
 }
 function localParts(zone){
  const f=new Intl.DateTimeFormat("en-CA",{timeZone:tzValid(zone),year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"});
  const o=Object.fromEntries(f.formatToParts(new Date()).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return {key:o.year+"-"+o.month+"-"+o.day,hour:Number(o.hour)%24};
 }
 async function weeklySessions(userId){
  try{
   const q=await pool.query(`SELECT
    (SELECT count(*) FROM pf_training_lab_sessions WHERE user_id=$1::uuid AND completed_at >= now()-interval '7 days') AS gym,
    (SELECT count(*) FROM pf_outdoor_sessions WHERE user_id=$1::uuid AND recorded_at >= now()-interval '7 days') AS outdoor`,[userId]);
   return Math.min(100,Number(q.rows[0]?.gym||0)+Number(q.rows[0]?.outdoor||0));
  }catch{return 0}
 }
 function slotsFor(sub){
  // The chosen reminder time is the first notification. Optional reminders
  // follow at least 3 hours apart and never run later than 21:00 local time.
  const first=Math.max(6,Math.min(21,Number(sub.reminder_hour)||9));
  const hours=[first,Math.min(21,first+4),Math.min(21,first+8)];
  return [...new Set(hours)].slice(0,Math.max(1,Math.min(3,Number(sub.tips_per_day)||3)))
    .map((hour,i)=>({hour,index:i}));
 }
 function firstName(sub){
  const n=String(sub.first_name||"você").replace(/[^\p{L}\p{M}'-]/gu,"").slice(0,35);
  return n.length>1?n:"você";
 }
 function messageFor(count,day,sub,slot){
  const name=firstName(sub),hour=slot.hour,hello=hour<12?"Bom dia":hour<18?"Boa tarde":"Boa noite";
  const seed=Number(day.replace(/-/g,""))||1,index=(seed+slot.index*3)%6;
  const ideas=[
   "Que tal hoje uma caminhada de 15 minutos em ritmo confortável? Comece sem pressa.",
   "Antes de treinar, faça 5 minutos de aquecimento progressivo e respeite seu ritmo.",
   "Para evoluir na força, foque na técnica e anote suas repetições em vez de se apressar.",
   "Se estiver com pouca energia, uma sessão leve de mobilidade também conta.",
   "Experimente um treino curto de força com movimentos de empurrar, puxar e agachar.",
   "Varie os estímulos: um passeio de bicicleta em ritmo leve pode tornar o dia mais ativo."
  ];
  const wellness=[
   "Dica de hoje: beba água regularmente, especialmente antes e depois da atividade.",
   "Seu corpo também progride no descanso. Priorize uma rotina de sono suficiente.",
   "Que tal levantar e se movimentar por alguns minutos depois de muito tempo sentado?",
   "Inclua frutas, legumes e fontes variadas de proteína nas refeições, conforme sua rotina.",
   "Um alongamento leve e confortável pode ser uma boa pausa entre as tarefas.",
   "Respeite os sinais do corpo. Dor fora do habitual pede pausa, não insistência."
  ];
  const performance=[
   count>0?"Você registrou "+count+" atividade"+(count===1?"":"s")+" nos últimos 7 dias. Parabéns pela constância!":"Que tal registrar sua primeira atividade da semana e acompanhar a evolução?",
   "Olhe para sua evolução nas repetições, na regularidade e no conforto dos movimentos — não apenas no peso.",
   "Registre hoje como foi sua energia e recuperação. Pequenos dados ajudam a ajustar os treinos.",
   "Se treinou intensamente ontem, considere hoje uma sessão mais leve e mantenha a técnica.",
   "Sua melhor referência é seu próprio progresso: compare treinos similares ao longo das semanas.",
   "Que tal revisar suas metas? Uma meta pequena e possível é melhor que uma promessa impossível."
  ];
  const topic=slot.index===0?(sub.training?"training":sub.wellness?"wellness":"performance"):
   slot.index===1?(sub.wellness?"wellness":sub.training?"training":"performance"):
   (sub.performance?"performance":sub.wellness?"wellness":"training");
  const text=topic==="training"?ideas[index]:topic==="wellness"?wellness[index]:performance[index];
  return {title:(hour<12?"☀️ ":hour<18?"🌤️ ":"🌙 ")+hello+", "+name+"! • PulsoFit",
   body:text,tag:"pulsofit-"+day+"-"+slot.index,
   url:topic==="performance"?"/?source=push#/goals":topic==="training"?"/?source=push#/workouts":"/?source=push#/home"};
 }
 async function dispatchReminders(){
  if(checking||!ready)return;
  checking=true;
  try{
   const q=await pool.query("SELECT id,user_id,endpoint,p256dh,auth_key,timezone,reminder_hour,training,performance,wellness,tips_per_day,first_name FROM pf_push_subscriptions WHERE enabled=true AND (training=true OR performance=true OR wellness=true) ORDER BY updated_at DESC LIMIT 500");
   let sent=0,skipped=0;
   for(const sub of q.rows){
    const now=localParts(sub.timezone);
    // Send at most one time slot per scheduler pass, never catch up with a burst.
    const due=slotsFor(sub).filter(x=>now.hour>=x.hour&&now.hour<=x.hour+1).at(-1);
    if(!due)continue;
    const key=now.key+":slot-"+due.index;
    const done=await pool.query("INSERT INTO pf_push_deliveries(subscription_id,notification_key) VALUES ($1::uuid,$2) ON CONFLICT DO NOTHING RETURNING notification_key",[sub.id,key]);
    if(!done.rowCount)continue;
    try{
     const n=await weeklySessions(sub.user_id);
     const msg=messageFor(n,now.key,sub,due);
     const r=await send(sub,msg);
     if(r.ok){sent++;await pool.query("UPDATE pf_push_deliveries SET success=true WHERE subscription_id=$1::uuid AND notification_key=$2",[sub.id,key]);
      await pool.query("UPDATE pf_push_subscriptions SET last_sent_at=now() WHERE id=$1::uuid",[sub.id]);}
     else if(r.status===404||r.status===410)await removeInvalid(sub);
     else skipped++;
    }catch{skipped++}
   }
   if(sent||skipped)console.log("[pulso-push] Daily notifications sent="+sent+" unavailable="+skipped);
  }catch(e){console.warn("[pulso-push] Scheduler temporary issue: "+String(e.code||"runtime").replace(/[^a-zA-Z0-9]/g,"").slice(0,20))}
  finally{checking=false}
 }
 const liveElapsed=x=>Math.max(0,Math.min(4*3600000,Number(x.elapsed_ms||0)+
  (x.state==="running"&&x.resumed_at?Math.max(0,Date.now()-new Date(x.resumed_at).getTime()):0)));
 function liveTime(x){
  let s=Math.floor(liveElapsed(x)/1000);
  return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,"0")).join(":");
 }
 async function sendLive(x){
  const rows=await pool.query("SELECT id,endpoint,p256dh,auth_key FROM pf_push_subscriptions WHERE user_id=$1::uuid AND endpoint=$2 AND enabled=true AND training=true LIMIT 1",[x.user_id,x.endpoint]);
  let successful=0;
  for(const sub of rows.rows){
   const notice={title:"⏱ "+x.title+" • PulsoFit",
    body:(x.state==="paused"?"Pausado • ":"Tempo transcorrido ")+liveTime(x)+(x.detail?" • "+x.detail:""),
    tag:"pulsofit-live-workout",url:"/?source=live#/workouts",live:true,requireInteraction:true};
   try{
    const sent=await send(sub,notice);
    if(sent.ok)successful++;
    else if([404,410].includes(sent.status))await removeInvalid(sub);
   }catch{}
  }
  return successful;
 }
 async function liveTick(){
  if(!ready)return;
  try{
   await pool.query("DELETE FROM pf_push_active_workouts WHERE started_at<now()-interval '4 hours'");
   const q=await pool.query(\`UPDATE pf_push_active_workouts SET last_notified_at=now()
    WHERE state='running' AND (last_notified_at IS NULL OR last_notified_at<now()-interval '3 minutes')
    RETURNING *\`);
   for(const x of q.rows.slice(0,60))await sendLive(x);
  }catch(e){console.warn("[pulso-push] Live scheduler code="+String(e.code||"runtime").replace(/[^A-Za-z0-9]/g,"").slice(0,30))}
 }
 setInterval(()=>{void liveTick()},180000).unref?.();
 async function liveAction(req,res,user){
  const d=await body(req,2400),action=String(d.action||""),key=String(d.sessionKey||"");
  if(!["start","pause","resume","update","finish"].includes(action)||!/^[A-Za-z0-9_-]{8,80}$/.test(key))
   throw fail(422,"Identificador de treino inválido.");
  const kind=String(d.kind||"workout");
  if(!["workout","walk","run","cycle"].includes(kind))throw fail(422,"Modalidade inválida.");
  const title=String(d.title||"Treino em andamento").trim().replace(/[<>]/g,"").slice(0,85);
  const detail=String(d.detail||"").trim().replace(/[<>]/g,"").slice(0,90);
  if(action==="start"){
   const endpoint=String(d.endpoint||"");
   if(!validEndpoint(endpoint))throw fail(422,"Inscrição push do aparelho inválida.");
   const subs=await pool.query("SELECT count(*)::int n FROM pf_push_subscriptions WHERE user_id=$1::uuid AND endpoint=$2 AND enabled=true AND training=true",[user,endpoint]);
   if(!subs.rows[0]?.n)return json(res,409,{error:"Ative as notificações de treino nas configurações do PulsoFit primeiro."});
   const q=await pool.query(\`INSERT INTO pf_push_active_workouts
    (user_id,session_key,kind,title,state,resumed_at,detail,endpoint,last_notified_at)
    VALUES($1::uuid,$2,$3,$4,'running',now(),$5,$6,now())
    ON CONFLICT(user_id) DO UPDATE SET session_key=EXCLUDED.session_key,kind=EXCLUDED.kind,
    title=EXCLUDED.title,state='running',elapsed_ms=0,resumed_at=now(),started_at=now(),
    detail=EXCLUDED.detail,endpoint=EXCLUDED.endpoint,last_notified_at=now() RETURNING *\`,[user,key,kind,title,detail,endpoint]);
   const sent=await sendLive(q.rows[0]);
   return json(res,200,{active:true,state:"running",sent,periodMinutes:3});
  }
  if(action==="finish"){
   const q=await pool.query("DELETE FROM pf_push_active_workouts WHERE user_id=$1::uuid AND session_key=$2 RETURNING user_id",[user,key]);
   return json(res,200,{active:false,removed:q.rowCount>0});
  }
  const sql=action==="pause"?
   "UPDATE pf_push_active_workouts SET state='paused',elapsed_ms=elapsed_ms+GREATEST(0,EXTRACT(EPOCH FROM(now()-resumed_at))*1000)::bigint,resumed_at=NULL,detail=$3 WHERE user_id=$1::uuid AND session_key=$2 AND state='running' RETURNING *":
   action==="resume"?
   "UPDATE pf_push_active_workouts SET state='running',resumed_at=now(),detail=$3,last_notified_at=now() WHERE user_id=$1::uuid AND session_key=$2 AND state='paused' RETURNING *":
   "UPDATE pf_push_active_workouts SET detail=$3 WHERE user_id=$1::uuid AND session_key=$2 RETURNING *";
  const q=await pool.query(sql,[user,key,detail]);
  if(!q.rows.length)return json(res,404,{error:"Sessão de treino encerrada ou em outro estado."});
  if(action!=="update")await sendLive(q.rows[0]);
  return json(res,200,{active:true,state:q.rows[0].state});
 }
 // Render Free services sleep when idle. This timer only runs when the server
 // is awake; no guarantee of delivery time is made to the user.
 const schedule=setInterval(()=>{void dispatchReminders()},180000);
 schedule.unref?.();
 setTimeout(()=>{void dispatchReminders()},30000).unref?.();
 async function dispatch(req,res,user,url){
  await initialized;
  if(!ready)return json(res,503,{error:"Notificações ainda indisponíveis no servidor.",code:state});
  if(url.pathname===prefix+"/config"&&req.method==="GET")
   return json(res,200,{publicKey:vapid.public,ready:true});
  if(!user)return json(res,401,{error:"Entre na sua conta para configurar notificações."});
  if(url.pathname===prefix+"/activity"&&req.method==="POST")return liveAction(req,res,user);
  if(url.pathname===prefix+"/activity"&&req.method==="GET"){
   const q=await pool.query("SELECT session_key,kind,title,state,elapsed_ms,resumed_at,started_at,detail FROM pf_push_active_workouts WHERE user_id=$1::uuid",[user]);
   const x=q.rows[0];return json(res,200,{active:Boolean(x),state:x?.state||"stopped",elapsedMs:x?liveElapsed(x):0,kind:x?.kind||null,title:x?.title||null});
  }
  if(url.pathname===prefix+"/status"&&req.method==="GET"){
   const q=await pool.query("SELECT id,endpoint,enabled,reminder_hour,timezone,training,performance,wellness,tips_per_day,created_at,last_sent_at FROM pf_push_subscriptions WHERE user_id=$1::uuid ORDER BY created_at DESC LIMIT 20",[user]);
   return json(res,200,{devices:q.rows.map(x=>({
    id:x.id,endpoint:x.endpoint,enabled:x.enabled,reminderHour:x.reminder_hour,timezone:x.timezone,
    training:x.training,performance:x.performance,wellness:x.wellness,tipsPerDay:x.tips_per_day,lastSentAt:x.last_sent_at
   })),ready:true});
  }
  if(url.pathname===prefix+"/subscribe"&&req.method==="POST"){
   const data=await body(req),sub=verifySub(data),opt=parseOptions(data),firstName=await verifiedFirstName(req);
   const q=await pool.query(`INSERT INTO pf_push_subscriptions (user_id,endpoint,p256dh,auth_key,platform,reminder_hour,timezone,training,performance,wellness,tips_per_day,first_name,enabled)
    VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh,auth_key=EXCLUDED.auth_key,
     reminder_hour=EXCLUDED.reminder_hour,timezone=EXCLUDED.timezone,training=EXCLUDED.training,
     performance=EXCLUDED.performance,wellness=EXCLUDED.wellness,tips_per_day=EXCLUDED.tips_per_day,
     first_name=EXCLUDED.first_name,enabled=true,updated_at=now()
    WHERE pf_push_subscriptions.user_id=EXCLUDED.user_id RETURNING id`,
    [user,sub.endpoint,sub.p256dh,sub.auth,String(data.platform||"web").slice(0,25),opt.hour,opt.timezone,opt.categories.training,opt.categories.performance,opt.categories.wellness,opt.tipsPerDay,firstName]);
   if(!q.rows.length)throw fail(409,"Este dispositivo já está vinculado a outra conta. Desative as notificações da conta anterior primeiro.");
   return json(res,200,{subscribed:true,id:q.rows[0].id,reminderHour:opt.hour,timezone:opt.timezone,tipsPerDay:opt.tipsPerDay});
  }
  if(url.pathname===prefix+"/preferences"&&req.method==="POST"){
   const data=await body(req),sub=verifySub(data),opt=parseOptions(data),firstName=await verifiedFirstName(req);
   const q=await pool.query(`UPDATE pf_push_subscriptions SET reminder_hour=$3,timezone=$4,training=$5,performance=$6,
    wellness=$7,tips_per_day=$8,enabled=$9,first_name=$10,updated_at=now() WHERE user_id=$1::uuid AND endpoint=$2 RETURNING id`,
    [user,sub.endpoint,opt.hour,opt.timezone,opt.categories.training,opt.categories.performance,opt.categories.wellness,opt.tipsPerDay,data.enabled!==false,firstName]);
   if(!q.rowCount)return json(res,404,{error:"Este celular não tem inscrição ativa nesta conta."});
   return json(res,200,{saved:true});
  }
  if(url.pathname===prefix+"/unsubscribe"&&req.method==="POST"){
   const data=await body(req),endpoint=String(data.endpoint||"");
   if(!validEndpoint(endpoint))throw fail(422,"Inscrição inválida.");
   const q=await pool.query("DELETE FROM pf_push_subscriptions WHERE user_id=$1::uuid AND endpoint=$2",[user,endpoint]);
   return json(res,200,{removed:q.rowCount>0});
  }
  if(url.pathname===prefix+"/test"&&req.method==="POST"){
   const data=await body(req),endpoint=String(data.endpoint||"");
   if(!validEndpoint(endpoint))throw fail(422,"Inscrição inválida.");
   const q=await pool.query("SELECT id,endpoint,p256dh,auth_key FROM pf_push_subscriptions WHERE user_id=$1::uuid AND endpoint=$2 AND enabled=true",[user,endpoint]);
   if(!q.rows.length)return json(res,404,{error:"Ative as notificações antes de testar."});
   const r=await send(q.rows[0],{
    title:"✅ PulsoFit AI: notificações ativadas",body:"Seu acompanhamento está conectado! Prepare seu próximo treino.",
    tag:"pulsofit-test",url:"/?source=push#/home"
   });
   if(r.ok)return json(res,200,{sent:true,acceptedByPushService:true});
   if([404,410].includes(r.status))await removeInvalid(q.rows[0]);
   return json(res,503,{sent:false,error:"O serviço de push não aceitou esta mensagem de teste.",providerStatus:r.status});
  }
  return json(res,405,{error:"Método não permitido."});
 }
 function asset(req,res,path){
  let payload,mime;
  if(path==="/pulsofit-sw.js"){payload=sw;mime="text/javascript; charset=utf-8"}
  else if(path==="/pulsofit.webmanifest"){payload=JSON.stringify(pulsoManifest());mime="application/manifest+json; charset=utf-8"}
  else if(path==="/pulsofit-icon-192.png"){payload=pulsoIcon(192);mime="image/png"}
  else if(path==="/pulsofit-icon-512.png"){payload=pulsoIcon(512);mime="image/png"}
  else return false;
  res.writeHead(200,{"Content-Type":mime,"Content-Length":Buffer.byteLength(payload),
   "Cache-Control":path==="/pulsofit-sw.js"?"no-cache, no-store, must-revalidate":"public, max-age=3600",
   "X-Content-Type-Options":"nosniff","Service-Worker-Allowed":"/"});
  if(req.method==="HEAD")res.end();else res.end(payload);
  return true;
 }
 function selfCheckCrypto(){
  const receiver=createECDH("prime256v1");receiver.generateKeys();
  const secret=randomBytes(16),ua=receiver.getPublicKey();
  const data=encryptedPayload({p256dh:b64(ua),auth_key:b64(secret)},{title:"PulsoFit",body:"encryption-test"});
  const salt=data.subarray(0,16),sender=data.subarray(21,86),enc=data.subarray(86);
  const ikm=Buffer.from(hkdfSync("sha256",receiver.computeSecret(sender),secret,
    Buffer.concat([Buffer.from("WebPush: info\0"),ua,sender]),32));
  const cek=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: aes128gcm\0"),16));
  const nonce=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: nonce\0"),12));
  const dec=createDecipheriv("aes-128-gcm",cek,nonce);dec.setAuthTag(enc.subarray(-16));
  const plain=Buffer.concat([dec.update(enc.subarray(0,-16)),dec.final()]);
  if(plain.at(-1)!==2||JSON.parse(plain.subarray(0,-1).toString()).body!=="encryption-test")throw Error("encryption mismatch");
  if(vapidJWT("https://web.push.apple.com/endpoint").split(".").length!==3)throw Error("JWT failure");
 }
 setTimeout(()=>{
  void(async()=>{
   if(!ready){console.warn("[pulso-push] Selfcheck skipped: backend unavailable");return}
   try{selfCheckCrypto();console.log("[pulso-push] Encryption selfcheck=ok AES128GCM VAPID-ES256")}
   catch{ready=false;state="push_crypto_failed";console.warn("[pulso-push] Encryption selfcheck=failed; push disabled")}
   for(const p of ["/pulsofit.webmanifest","/pulsofit-sw.js","/pulsofit-icon-192.png","/pulsofit-icon-512.png","/api/push/config"]){
    try{
     const r=await fetch("http://127.0.0.1:"+(process.env.PORT||"10000")+p,{
      cache:"no-store",signal:AbortSignal.timeout(4000)});
     console.log("[pulso-push] Asset "+p+" http="+r.status+" type="+String(r.headers.get("content-type")||"").split(";")[0]);
    }catch{console.warn("[pulso-push] Asset "+p+" check unavailable")}
   }
  })();
 },5500).unref?.();
 const oldEmit=Server.prototype.emit;
 Server.prototype.emit=function(event,...args){
  if(event==="request"&&args.length>=2){
   const [req,res]=args;let url;
   try{url=new URL(req.url,"http://localhost")}catch{}
   if(url&&assetPaths.has(url.pathname)&&(req.method==="GET"||req.method==="HEAD")){asset(req,res,url.pathname);return true}
   if(url&&url.pathname.startsWith(prefix+"/")){
    void(async()=>{
     const user=url.pathname===prefix+"/config"?null:await currentUser(req);
     await dispatch(req,res,user,url);
    })().catch(e=>{
     if(!res.headersSent)json(res,[400,401,404,409,413,415,422,429,503].includes(e.status)?e.status:503,
      {error:e.status?String(e.message).slice(0,200):"Não foi possível processar as notificações."});
     else if(!res.writableEnded)res.end();
    });
    return true;
   }
  }
  return oldEmit.call(this,event,...args);
 };
 console.log("[pulso-push] PWA manifest, push service worker and private account API mounted.");
}
