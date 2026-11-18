/**
 * PulsoFit AI — runtime MisticPay para o servidor gerado pelo Render.
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
import "./pulsofit-social-auth.mjs";
import {Server} from "node:http";
import {basename} from "node:path";
import {createMisticPayAdapter} from "./misticpay-adapter.mjs";
import {createMisticPayPostgresStore} from "./misticpay-postgres-store.mjs";
import {createMisticPayBilling,settleVerifiedMisticPayOrder} from "./misticpay-billing.mjs";
import {createProductionPixReconciler} from "./misticpay-auto-reconcile.mjs";
import {TEST_PLAN,testOfferState,availableBillingPlans} from "./pulsofit-test-offer.mjs";

if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_BILLING_RUNTIME__){
 globalThis.__PULSO_BILLING_RUNTIME__=true;
 const origin="https://pulso-fit-ai-95-online.onrender.com";
 const managed=new Set(["/api/billing/config","/api/billing/health","/api/billing/checkout",
  "/api/billing/payment","/api/billing/recover","/api/billing/webhook","/api/admin/billing/config","/api/subscription/status"]);
 const dbVar=["PULSO_BILLING_DATABASE_URL","DATABASE_URL","PULSO_DATABASE_URL","POSTGRES_URL","PG_CONNECTION_STRING"].find(k=>!!process.env[k]);
 const gateway=createMisticPayAdapter();
 const state={provider:"misticpay",backendMounted:true,ready:false,production:true,
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
  )&&premiumGuardInstalled&&process.env.PULSO_MISTICPAY_ENABLE_CHARGES==="1";
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
   billing=createMisticPayBilling({authenticate,store,origin,gateway});
  }catch(error){
   state.storageReady=false;
   console.error("[pulso-billing] Storage unavailable ("+String(error.code||"initialization")+"); payments disabled.");
  }
  if(state.credentialsConfigured){
   try{
    // Consulta autenticada de um ID inexistente: nenhum PIX é criado.
    await gateway.getTransaction("0");
    state.providerAuth="verified";
   }catch(error){
    const code=String(error.code||"");
    state.providerAuth=["INVALID_API_CREDENTIAL","API_SCOPE_DENIED","API_CREDENTIAL_REQUIRED","IP_NOT_ALLOWED"].includes(code)?"denied":(["TRANSACTION_NOT_FOUND","VALIDATION_ERROR"].includes(code)?"verified":"checked");
    console.log("[pulso-billing] Provider read-only probe: http="+(Number(error.status)||0)+" code="+code.replace(/[^A-Z0-9_]/g,"").slice(0,64)+" kind="+String(error.name||"").replace(/[^a-zA-Z]/g,"").slice(0,24)+"; no charge created.");
    // Um ID inexistente pode provocar INTERNAL_ERROR no gateway. Consulte
    // validação de parâmetro vazio para distinguir escopo de falha do provedor.
    // Este teste não cria transação, nem divulga credenciais.
    if(state.providerAuth==="checked"){
     try{
      const id=process.env.PULSO_MISTICPAY_CLIENT_ID,secret=process.env.PULSO_MISTICPAY_CLIENT_SECRET;
      const response=await fetch("https://api.misticpay.com/api/transactions/check",{
       method:"POST",redirect:"error",signal:AbortSignal.timeout(7000),
       headers:{"Authorization":"Basic "+Buffer.from(id+":"+secret).toString("base64"),
        "Content-Type":"application/json","Accept":"application/json"},
       body:JSON.stringify({transactionId:""})
      });
      const result=await response.json().catch(()=>({}));
      const safeCode=String(result?.code||"").replace(/[^A-Z0-9_]/g,"").slice(0,48);
      const requestId=String(result?.requestId||"").replace(/[^a-zA-Z0-9-]/g,"").slice(0,80);
      if(response.status===400&&["VALIDATION_ERROR","TRANSACTION_ID_REQUIRED"].includes(safeCode)){
       // Confirme a ordem de autenticação: uma credencial fictícia deve ser
       // rejeitada antes da validação do corpo. Só então a resposta 400
       // das credenciais reais comprova que elas foram aceitas.
       const fake=await fetch("https://api.misticpay.com/api/transactions/check",{
        method:"POST",redirect:"error",signal:AbortSignal.timeout(7000),
        headers:{"Authorization":"Basic "+Buffer.from("pk_invalid_proof:sk_invalid_proof").toString("base64"),
         "Content-Type":"application/json","Accept":"application/json"},
        body:JSON.stringify({transactionId:""})
       });
       const fakeBody=await fake.json().catch(()=>({}));
       const fakeCode=String(fakeBody?.code||"");
       if(fake.status===401&&fakeCode==="INVALID_API_CREDENTIAL")state.providerAuth="verified";
       console.log("[pulso-billing] Negative credential control: http="+fake.status+
        " code="+fakeCode.replace(/[^A-Z0-9_]/g,"").slice(0,50)+
        " readScope="+state.providerAuth+"; no charge created.");
      }
      else if(["INVALID_API_CREDENTIAL","API_SCOPE_DENIED","IP_NOT_ALLOWED"].includes(safeCode))state.providerAuth="denied";
      console.log("[pulso-billing] Read scope fallback: http="+response.status+" code="+safeCode+
       " requestId="+(requestId||"not_provided")+" result="+state.providerAuth+"; no charge created.");
     }catch{console.log("[pulso-billing] Read scope fallback network error; charges stay disabled.");}
    }
   }
  }
  /* Confirmação diferencial dos escopos de criar e consultar sem cobrança */
  if(state.credentialsConfigured&&state.providerAuth!=="denied"){
   async function validateScope(url){
    const id=process.env.PULSO_MISTICPAY_CLIENT_ID,secret=process.env.PULSO_MISTICPAY_CLIENT_SECRET;
    const data=JSON.stringify({}); // JSON sem campos obrigatórios: jamais gera PIX
    async function call(user,pass){
     const response=await fetch(url,{method:"POST",redirect:"error",signal:AbortSignal.timeout(6000),
      headers:{"Authorization":"Basic "+Buffer.from(user+":"+pass).toString("base64"),
        "Content-Type":"application/json","Accept":"application/json"},
      body:data});
     const result=await response.json().catch(()=>({}));
     return {status:response.status,code:String(result?.code||"").slice(0,64)};
    }
    try{
     const real=await call(id,secret);
     const fake=await call("pk_invalid_pulsofit_scope_probe","sk_invalid_pulsofit_scope_probe");
     const invalidFake=fake.status===401&&["INVALID_API_CREDENTIAL","IP_NOT_ALLOWED"].includes(fake.code);
     const validReal=real.status===400&&!["INVALID_API_CREDENTIAL","API_CREDENTIAL_REQUIRED","API_SCOPE_DENIED","IP_NOT_ALLOWED"].includes(real.code);
     console.log("[pulso-billing] Scope contrast "+url.split("/").pop()+": realStatus="+real.status+
      " realCode="+real.code.replace(/[^A-Z0-9_]/g,"")+" fakeStatus="+fake.status+
      " fakeCode="+fake.code.replace(/[^A-Z0-9_]/g,"")+
      " verified="+Boolean(invalidFake&&validReal)+"; no PIX created.");
     return invalidFake&&validReal;
    }catch{
     console.log("[pulso-billing] Scope contrast unavailable, no PIX created.");
     return false;
    }
   }
   const readOk=await validateScope("https://api.misticpay.com/api/transactions/check");
   const createOk=await validateScope("https://api.misticpay.com/api/transactions/create");
   state.readScopeVerified=readOk;
   state.createScopeVerified=createOk;
   if(readOk&&createOk)state.providerAuth="verified";
   else if(state.providerAuth!=="denied")state.providerAuth="checked";
  }

  /* Teste diferencial com ID não vazio: somente leitura, nenhum Pix */
  if(state.credentialsConfigured&&state.providerAuth!=="denied"){
   try{
    const reference="978154328728161432"; // ID improvável, sem dados de cliente
    const id=process.env.PULSO_MISTICPAY_CLIENT_ID,sk=process.env.PULSO_MISTICPAY_CLIENT_SECRET;
    async function readWith(user,pass){
     const res=await fetch("https://api.misticpay.com/api/transactions/check",{
      method:"POST",redirect:"error",signal:AbortSignal.timeout(6500),
      headers:{"Authorization":"Basic "+Buffer.from(user+":"+pass).toString("base64"),"Content-Type":"application/json"},
      body:JSON.stringify({transactionId:reference})
     });
     const body=await res.json().catch(()=>({}));
     return {http:res.status,code:String(body?.code||"").replace(/[^A-Z0-9_]/g,"").slice(0,45)};
    }
    const real=await readWith(id,sk);
    const fake=await readWith("pk_invalid_pulsofit","sk_invalid_pulsofit");
    const validFake=fake.http===401&&fake.code==="INVALID_API_CREDENTIAL";
    const realAuthorized=(real.http===404&&real.code==="TRANSACTION_NOT_FOUND")||
      (real.http===200);
    if(validFake&&realAuthorized)state.providerAuth="verified";
    else if(validFake&&real.http===502)state.providerAuth="checked";
    state.readProbeResult={realHttp:real.http,realCode:real.code,fakeHttp:fake.http,fakeCode:fake.code,confirmed:Boolean(validFake&&realAuthorized)};
    console.log("[pulso-billing] Nonempty read contrast: real="+real.http+"/"+real.code+
      " invalid="+fake.http+"/"+fake.code+" authorized="+Boolean(validFake&&realAuthorized)+
      "; no transaction created.");
   }catch{
    console.log("[pulso-billing] Nonempty read contrast unavailable; no PIX created.");
   }
  }

  // Uso temporário autorizado pelo proprietário; não exigir banco permanente
  // durante piloto. Checkout exige confirmação de leitura da própria cobrança
  // antes de exibir o Pix. Bloqueio de acesso é uma flag independente.
  configured=Boolean(billing&&state.storageReady&&state.accountSchemaVerified&&
    state.credentialsConfigured&&state.providerAuth!=="denied"&&requiredFlags());
  state.ready=configured;
  if(configured)state.supportedMethods=["pix"];
  state.accessEnforcementActive=configured&&process.env.PULSO_BILLING_ENFORCE_ACCESS==="1";
  console.log("[pulso-billing] Integration: postgres="+state.databaseReachable+
   " accountSchema="+state.accountSchemaVerified+" billingStore="+state.storageReady+
   " providerAuth="+state.providerAuth+" checkout="+(configured?"enabled":"disabled")+
   " (no keys or user records logged).");
 }
 const bootPromise=boot();
 let verifiedPixWorker=null,livePixTest=null;
 // Verify existing production PIX transactions. Never create or pay a charge.
 async function reconcileExistingPix(){
  await bootPromise;
  if(!configured||!store?.claimPendingForVerification)return;
  if(!verifiedPixWorker)verifiedPixWorker=createProductionPixReconciler({
   store,gateway,settle:settleVerifiedMisticPayOrder,logger(stats){
    livePixTest={...stats,lastCheckedAt:new Date().toISOString(),environment:"production",newChargesCreated:0};
    // Count-only telemetry. No transaction IDs, payer identities or secrets in logs.
    console.log("[pulso-billing] Production PIX verification: checked="+stats.checked+
     " confirmed="+stats.confirmed+" pending="+stats.pending+
     " failedOrCancelled="+stats.declined+" unverified="+stats.unverified+" created=0");
   }});
  try{await verifiedPixWorker.check()}catch(error){
   console.warn("[pulso-billing] Production PIX verification unavailable code="+
    String(error.code||"runtime").replace(/[^A-Z0-9_]/gi,"").slice(0,40));
  }
 }
 const pixPoll=setInterval(()=>{void reconcileExistingPix()},65000);
 pixPoll.unref?.();
 setTimeout(()=>{void reconcileExistingPix()},3000).unref?.();
 async function handle(req,res,path){
  await bootPromise;
  if(path==="/api/billing/health"||path==="/api/billing/config"){
   if(req.method!=="GET")return respond(res,405,{error:"Método inválido"});
   return respond(res,200,{...state,autoVerification:{enabled:configured,intervalSeconds:65,workerActive:!!verifiedPixWorker,productionTest:livePixTest},plans:availableBillingPlans(state.plans),testOffer:testOfferState(),
    nextAction:state.ready?"Conectado":"Pagamento indisponível; verifique integração com a MisticPay."});
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
     provider:"misticpay",billingEnforced:enforce,checkoutEnabled:configured,
     trialDays:7,trialStartedAt:start.toISOString(),trialEndsAt:until.toISOString(),
     trialActive,remainingTrialDays:Math.max(0,Math.ceil((until.getTime()-Date.now())/86400000)),
     planActive:paid,planExpiresAt:entitlement?.expiresAt||null,
     hasAccess:user.role==="admin"||trialActive||paid,
     accessEnforcementActive:enforce
   });
  }
  if(path==="/api/admin/billing/config"&&!configured){
   const user=await authenticate(req);
   if(user?.role!=="admin")return respond(res,403,{error:"Acesso restrito"});
   if(req.method==="GET")return respond(res,200,{provider:"misticpay",configured:false,
    webhookUrl:origin+"/api/billing/webhook",readyForSecureWrite:false,
    message:"Client ID e Client Secret estão configurados no Render. Checkout aguarda banco permanente e controle do acesso."});
   return respond(res,409,{error:"Credenciais só podem ser alteradas por variáveis protegidas no Render."});
  }
  if(!configured){
   return respond(res,503,{error:"Pagamentos MisticPay em preparação; não é possível criar ou confirmar cobranças antes de validar o banco e as assinaturas."});
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
 console.log("[pulso-billing] MisticPay runtime mounted; default fail-closed.");
}
