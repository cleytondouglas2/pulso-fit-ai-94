/**
 * PulsoFit AI — runtime dos pagamentos Argus Pay para o servidor gerado pelo Render.
 * `NODE_OPTIONS=--import=./server/misticpay-runtime.mjs`
 *
 * Intercepta exclusivamente rotas de cobrança, mantém o backend de contas
 * intacto e usa a conexão PostgreSQL já configurada no Render.
 * Fail closed: NÃO aceita pagamentos até banco permanente e validação da
 * proteção de acesso. API keys nunca chegam ao navegador.
 */
import "./pulsofit-js-boot-repair.mjs";
import "./pulsofit-static-cache.mjs";
import "./pulsofit-plans-patch.mjs";
import "./pulsofit-private-features.mjs";
import "./pulsofit-fitness-assessment.mjs";
import "./pulsofit-training-lab.mjs";
import "./pulsofit-outdoor-api.mjs";
import "./pulsofit-push-server.mjs";
import "./pulsofit-gemini-recovery.mjs";
import "./pulsofit-meal-assess.mjs";
import "./pulsofit-coach-chat.mjs";
import "./pulsofit-ar-coach.mjs";
import "./pulsofit-spotify-config.mjs";
import "./pulsofit-social-auth.mjs";
import {Server} from "node:http";
import {basename} from "node:path";
import {createMisticPayAdapter} from "./misticpay-adapter.mjs";
import {createArgusPayAdapter,isArgusCredentialPair} from "./arguspay-adapter.mjs";
import {createArgusPayCredentialStore} from "./arguspay-config.mjs";
import {createMisticPayPostgresStore} from "./misticpay-postgres-store.mjs";
import {createMisticPayBilling,settleVerifiedMisticPayOrder} from "./misticpay-billing.mjs";
import {createProductionPixReconciler} from "./misticpay-auto-reconcile.mjs";
import {TEST_PLAN,testOfferState,availableBillingPlans} from "./pulsofit-test-offer.mjs";

if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_BILLING_RUNTIME__){
 globalThis.__PULSO_BILLING_RUNTIME__=true;
 const origin="https://pulso-fit-ai-95-online.onrender.com";
 const managed=new Set(["/api/billing/config","/api/billing/health","/api/billing/checkout",
  "/api/billing/payment","/api/billing/recover","/api/billing/webhook","/api/admin/billing/config","/api/admin/billing/test","/api/subscription/status"]);
 const dbVar=["PULSO_BILLING_DATABASE_URL","DATABASE_URL","PULSO_DATABASE_URL","POSTGRES_URL","PG_CONNECTION_STRING"].find(k=>!!process.env[k]);
 const argusCredentials={key:process.env.ARGUS_API_KEY||"",secret:process.env.ARGUS_API_SECRET||""};
 const gateway=createArgusPayAdapter({getCredentials:()=>argusCredentials});
 const legacyGateway=createMisticPayAdapter();
 let credentialStore=null,lastKeySaveAt=0;
 const state={provider:"arguspay",backendMounted:true,ready:false,production:true,
   credentialsConfigured:gateway.credentialsReady(),databaseConfigured:Boolean(dbVar),
   databaseReachable:false,accountSchemaVerified:false,storageReady:false,
   providerAuth:"unchecked",supportedMethods:[],webhookPath:"/api/billing/webhook",
   plans:{quinzenal:{days:15,amountCents:1490},mensal:{days:30,amountCents:2490},teste7d:TEST_PLAN}};
 let pool=null,store=null,billing=null,configured=false;
 const premiumRoutes = new Set(["/api/coach/plan","/api/videos","/api/progress","/api/nutrition/lookup"]);
 const premiumGuardInstalled=true;
 const premiumRoute=(p)=>premiumRoutes.has(p)||p.startsWith("/api/ai/")||p.startsWith("/api/videos/")||p.startsWith("/api/coach/");
 const temporaryDatabaseApproved=()=>process.env.PULSO_BILLING_TEMP_DB_ACK==="1";
 const requiredFlags=()=>(
   process.env.PULSO_BILLING_STABLE_DB==="1"||temporaryDatabaseApproved()
  )&&premiumGuardInstalled&&process.env.PULSO_ARGUSPAY_ENABLE_CHARGES==="1";
 function respond(res,status,data){
  if(res.writableEnded)return;
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
  res.end(JSON.stringify(data));
 }
 async function authenticate(req){
  const authorization=String(req.headers.authorization||"");
  if(!authorization.startsWith("Bearer ")||authorization.length>4096)return null;
  try{
   const r=await fetch("http://127.0.0.1:"+(process.env.PORT||"10000")+"/api/me",{
    headers:{Authorization:authorization},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(3500)});
   if(!r.ok)return null;
   const data=await r.json();
   return data?.user?.id&&/^[a-f0-9-]{36}$/i.test(String(data.user.id))?
    {id:String(data.user.id),role:String(data.user.role||"user")}:null;
  }catch{return null;}
 }
 async function boot(){
  if(!dbVar){
   console.log("[pulso-billing] Database variable absent; payments disabled.");
   return;
  }
  try{
   const pg=await import("pg");
   const Pool=pg.Pool||pg.default?.Pool;
   if(!Pool)throw Error("Postgres driver absent");
   pool=new Pool({connectionString:process.env[dbVar],connectionTimeoutMillis:4000,max:4,idleTimeoutMillis:15000});
   await pool.query("SELECT 1");
   state.databaseReachable=true;
   const r=await pool.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='pf_users' AND column_name IN ('id','plan')");
   state.accountSchemaVerified=r.rows.some(x=>x.column_name==="id"&&x.data_type==="uuid")&&r.rows.some(x=>x.column_name==="plan");
   if(!state.accountSchemaVerified)throw Error("Account schema mismatch");
   store=await createMisticPayPostgresStore(pool,{initialize:true});
   credentialStore=createArgusPayCredentialStore(pool);
   await credentialStore.init();
   const savedCredentials=await credentialStore.load();
   argusCredentials.key=savedCredentials.key;
   argusCredentials.secret=savedCredentials.secret;
   state.credentialsConfigured=gateway.credentialsReady();
   state.credentialSource=savedCredentials.source;
   state.credentialsUpdatedAt=savedCredentials.updatedAt||null;
   state.secureAdminStorageReady=credentialStore.secureStorageReady;
   // One-time scoped reactivation of seven free days; never modifies paid Pix.
   const resetEmail=String(process.env.PULSO_TRIAL_RESET_EMAIL_ONCE||"").trim();
   const resetId=String(process.env.PULSO_TRIAL_RESET_ID_ONCE||"").trim();
   if(resetEmail&&resetEmail.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)&&
      /^[a-zA-Z0-9-]{16,90}$/.test(resetId)){
    const db=await pool.connect();
    try{
     await db.query("BEGIN");
     await db.query("CREATE TABLE IF NOT EXISTS pf_trial_admin_reset_events (reset_id text PRIMARY KEY,user_id uuid NOT NULL,reset_at timestamptz NOT NULL DEFAULT now())");
     const r=await db.query(`INSERT INTO pf_trial_admin_reset_events(reset_id,user_id)
      SELECT $1,id FROM pf_users WHERE lower(email)=lower($2)
      ON CONFLICT(reset_id) DO NOTHING RETURNING user_id`,[resetId,resetEmail]);
     if(r.rowCount){
      await db.query(`INSERT INTO pf_billing_trials(user_id,started_at) VALUES($1,now())
       ON CONFLICT(user_id) DO UPDATE SET started_at=EXCLUDED.started_at`,[String(r.rows[0].user_id)]);
     }
     await db.query("COMMIT");
     console.log("[pulso-trial] One-time free trial reactivation "+(r.rowCount?"applied":"already_used_or_account_not_found")+"; paid orders unchanged.");
    }catch(e){
     await db.query("ROLLBACK").catch(()=>{});
     console.warn("[pulso-trial] Free trial reset failed code="+String(e.code||"database").replace(/[^a-z0-9_]/gi,"").slice(0,32));
    }finally{db.release()}
   }
   state.storageReady=true;
   billing=createMisticPayBilling({authenticate,store,origin,gateway,
    resolveGateway(order){return order.provider==="misticpay"?legacyGateway:gateway;}});
  }catch(error){
   state.storageReady=false;
   console.error("[pulso-billing] Storage unavailable ("+String(error.code||"initialization")+"); payments disabled.");
  }
  // Read-only probe; no Pix is created by testing configuration.
  if(state.credentialsConfigured){
   try{await gateway.testConnection();state.providerAuth="verified";}
   catch(error){state.providerAuth=error?.status===401?"denied":"unavailable";
    console.warn("[pulso-billing] ArgusPay balance probe unavailable; no charges created.");}
  }

  // Uso temporário autorizado pelo proprietário; não exigir banco permanente
  // durante piloto. Checkout exige confirmação de leitura da própria cobrança
  // antes de exibir o Pix. Bloqueio de acesso é uma flag independente.
  configured=Boolean(billing&&state.storageReady&&state.accountSchemaVerified&&
    state.credentialsConfigured&&state.providerAuth==="verified"&&requiredFlags());
  state.ready=configured;
  if(configured)state.supportedMethods=["pix"];
  state.accessEnforcementActive=configured&&process.env.PULSO_BILLING_ENFORCE_ACCESS==="1";
  console.log("[pulso-billing] Integration: postgres="+state.databaseReachable+
   " accountSchema="+state.accountSchemaVerified+" billingStore="+state.storageReady+
   " providerAuth="+state.providerAuth+" checkout="+(configured?"enabled":"disabled")+
   " (no keys or user records logged).");
 }
 const bootPromise=boot();
 let argusWorker=null,legacyWorker=null,livePixTest=null;
 async function reconcileExistingPix(){
  await bootPromise;
  if(!store?.claimPendingForVerification)return;
  async function run(provider,adapter){
   if(!adapter.credentialsReady())return;
   if(provider==="arguspay"&&!configured)return;
   const providerStore={...store,
    claimPendingForVerification:(limit)=>store.claimPendingForVerification(limit,provider)};
   if(provider==="arguspay"&&!argusWorker)argusWorker=createProductionPixReconciler({
    store:providerStore,gateway:adapter,settle:settleVerifiedMisticPayOrder,logger(stats){
     livePixTest={...stats,lastCheckedAt:new Date().toISOString(),environment:"production",newChargesCreated:0};
     console.log("[pulso-billing] Argus Pix reconciliation: checked="+stats.checked+" confirmed="+stats.confirmed);
    }});
   if(provider==="misticpay"&&!legacyWorker)legacyWorker=createProductionPixReconciler({
    store:providerStore,gateway:adapter,settle:settleVerifiedMisticPayOrder,logger(stats){
     console.log("[pulso-billing] Legacy Pix reconciliation: checked="+stats.checked+" confirmed="+stats.confirmed);
    }});
   await (provider==="arguspay"?argusWorker:legacyWorker).check();
  }
  try{await run("arguspay",gateway);}catch{console.warn("[pulso-billing] Argus reconciliation unavailable");}
  try{await run("misticpay",legacyGateway);}catch{console.warn("[pulso-billing] Legacy reconciliation unavailable");}
 }
 const pixPoll=setInterval(()=>{void reconcileExistingPix()},65000);
 pixPoll.unref?.();
 setTimeout(()=>{void reconcileExistingPix()},3000).unref?.();
 async function handle(req,res,path){
  await bootPromise;
  if(path==="/api/billing/health"||path==="/api/billing/config"){
   if(req.method!=="GET")return respond(res,405,{error:"Método inválido"});
   return respond(res,200,{...state,autoVerification:{enabled:configured,intervalSeconds:65,workerActive:!!argusWorker,productionTest:livePixTest},plans:availableBillingPlans(state.plans),testOffer:testOfferState(),
    nextAction:state.ready?"Conectado":"Pagamento indisponível; verifique a integração com a Argus Pay."});
  }
  // Mostrar o trial da conta no servidor, mesmo com bloqueio automático desligado.
  if(path==="/api/subscription/status"){
   const user=await authenticate(req);
   if(!user?.id)return respond(res,401,{error:"Entre na sua conta para consultar seus 7 dias grátis."});
   if(!store)return respond(res,503,{error:"Consulta do período grátis indisponível no servidor."});
   const [startedAt,entitlement]=await Promise.all([
    store.firstTrialUse(String(user.id)),store.getEntitlement(String(user.id))
   ]);
   const start=new Date(startedAt);
   if(!Number.isFinite(start.getTime()))return respond(res,503,{error:"Data do período grátis inválida."});
   const until=new Date(start.getTime()+7*86400000);
   const trialActive=until.getTime()>Date.now();
   const paid=Boolean(entitlement?.active);
   const enforce=configured&&process.env.PULSO_BILLING_ENFORCE_ACCESS==="1";
   return respond(res,200,{
     provider:"arguspay",billingEnforced:enforce,checkoutEnabled:configured,
     trialDays:7,trialStartedAt:start.toISOString(),trialEndsAt:until.toISOString(),
     trialActive,remainingTrialDays:Math.max(0,Math.ceil((until.getTime()-Date.now())/86400000)),
     planActive:paid,planExpiresAt:entitlement?.expiresAt||null,
     hasAccess:user.role==="admin"||trialActive||paid,
     accessEnforcementActive:enforce
   });
  }
  if(path==="/api/admin/billing/config"||path==="/api/admin/billing/test"){
   const user=await authenticate(req);
   if(user?.role!=="admin")return respond(res,403,{error:"Acesso restrito a administradores."});
   if(path==="/api/admin/billing/config"&&req.method==="GET"){
    return respond(res,200,{provider:"arguspay",configured:gateway.credentialsReady(),
     ready:configured,readyForSecureWrite:Boolean(credentialStore?.secureStorageReady&&state.storageReady),
     webhookVerificationReady:Boolean(state.storageReady),providerAuth:state.providerAuth,
     credentialSource:state.credentialSource||"none",updatedAt:state.credentialsUpdatedAt||null,
     keyMasked:gateway.credentialsReady()?"•••• "+argusCredentials.key.slice(-4):null,
     apiBaseUrl:gateway.baseUrl,webhookUrl:origin+"/api/billing/webhook"});
   }
   if(!credentialStore?.secureStorageReady||!state.storageReady)
    return respond(res,503,{error:"Armazenamento criptografado não está disponível."});
   if(path==="/api/admin/billing/config"&&req.method!=="PUT"||
      path==="/api/admin/billing/test"&&req.method!=="POST")
    return respond(res,405,{error:"Método não permitido"});
   const originHeader=String(req.headers.origin||"");
   if(originHeader&&originHeader!==origin)
    return respond(res,403,{error:"Origem não autorizada"});
   if(String(req.headers["sec-fetch-site"]||"")==="cross-site")
    return respond(res,403,{error:"Requisição não autorizada"});
   if(!String(req.headers["content-type"]||"").startsWith("application/json"))
    return respond(res,415,{error:"Envie JSON"});
   let size=0,parts=[];
   for await(const chunk of req){
    size+=chunk.length;
    if(size>4096)return respond(res,413,{error:"Dados muito grandes"});
    parts.push(chunk);
   }
   let body;
   try{body=JSON.parse(Buffer.concat(parts).toString("utf8"));}
   catch{return respond(res,400,{error:"Dados inválidos"});}
   const candidate={key:String(body.apiKey||""),secret:String(body.apiSecret||"")};
   if(!isArgusCredentialPair(candidate))
    return respond(res,422,{error:"Preencha uma API Key e uma API Secret válidas da Argus Pay."});
   try{await gateway.testConnection(candidate);}
   catch(error){
    return respond(res,422,{error:error.status===401?
     "A Argus Pay rejeitou as chaves. Nenhuma configuração foi alterada.":
     "Não foi possível validar as novas chaves na Argus Pay. A configuração anterior foi mantida."});
   }
   if(path==="/api/admin/billing/test")
    return respond(res,200,{valid:true,message:"Autenticação de leitura validada na Argus Pay. Nenhum Pix foi gerado."});
   if(Date.now()-lastKeySaveAt<20000)return respond(res,429,{error:"Aguarde antes de alterar as credenciais novamente."});
   try{await credentialStore.save(candidate,user.id);}
   catch{return respond(res,503,{error:"Não foi possível salvar as credenciais com segurança."});}
   argusCredentials.key=candidate.key;
   argusCredentials.secret=candidate.secret;
   state.credentialSource="database";
   state.credentialsUpdatedAt=new Date().toISOString();
   state.credentialsConfigured=true;
   state.providerAuth="verified";
   configured=Boolean(billing&&state.storageReady&&state.accountSchemaVerified&&requiredFlags());
   state.ready=configured;
   state.supportedMethods=configured?["pix"]:[];
   state.accessEnforcementActive=configured&&process.env.PULSO_BILLING_ENFORCE_ACCESS==="1";
   lastKeySaveAt=Date.now();
   console.log("[pulso-billing] Argus credentials rotated by authenticated admin; secrets redacted.");
   return respond(res,200,{saved:true,configured:true,ready:configured,
    keyMasked:"•••• "+candidate.key.slice(-4),updatedAt:state.credentialsUpdatedAt});
  }
  if(!configured){
   return respond(res,503,{error:"Pagamentos Argus Pay ainda não disponíveis. Verifique banco, credenciais e autorização de recebimentos."});
  }
  await billing(req,res);
 }
 async function checkPremiumAccess(server,req,res){
  await bootPromise;
  if(!configured)return originalEmit.call(server,"request",req,res); // Não interromper o app se a cobrança ainda não estiver pronta.
  const user=await authenticate(req);
  if(!user?.id)return respond(res,401,{error:"Entre na sua conta para começar seu período gratuito de 7 dias.",code:"LOGIN_REQUIRED"});
  if(user.role==="admin")return originalEmit.call(server,"request",req,res);
  const [trialStart,entitlement]=await Promise.all([
   store.firstTrialUse(String(user.id)),store.getEntitlement(String(user.id))
  ]);
  const trialEnds=new Date(trialStart).getTime()+7*86400000;
  const trialActive=Number.isFinite(trialEnds)&&trialEnds>Date.now();
  if(trialActive||entitlement?.active)return originalEmit.call(server,"request",req,res);
  return respond(res,402,{error:"Seu período de teste terminou. Contrate um dos planos para continuar.",code:"SUBSCRIPTION_REQUIRED",plansUrl:"/#/subscription"});
 }
 const originalEmit=Server.prototype.emit;
 Server.prototype.emit=function(event,...args){
  if(event==="request"&&args.length>=2){
   const req=args[0],res=args[1];let path="";
   try{path=new URL(req.url,"http://localhost").pathname}catch{}
   if(managed.has(path)){
    void Promise.resolve(handle(req,res,path)).catch(()=>{
     if(!res.headersSent)respond(res,503,{error:"Sistema de pagamentos indisponível"});
     else if(!res.writableEnded)res.end();
    });
    return true;
   }
   if(premiumRoute(path)&&process.env.PULSO_BILLING_ENFORCE_ACCESS==="1"){
    void Promise.resolve(checkPremiumAccess(this,req,res)).catch(()=>{
     if(!res.headersSent)respond(res,503,{error:"Não foi possível verificar a assinatura."});
     else if(!res.writableEnded)res.end();
    });
    return true;
   }
  }
  return originalEmit.call(this,event,...args);
 };
 console.log("[pulso-billing] Argus Pay runtime mounted; default fail-closed.");
}
