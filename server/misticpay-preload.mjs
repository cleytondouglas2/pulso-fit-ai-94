/**
 * Preload não intrusivo para o backend gerado pelo Render.
 * Ativo APENAS em "node server.mjs"; o build não é modificado.
 *
 * Monta diagnóstico de integração da MisticPay, sem cobrança. Uma transação
 * paga exige storage durável + vinculação às contas PulsoFit, cuja compatibilidade
 * precisa ser validada antes de habilitar checkout em produção.
 */
import {Server} from "node:http";
import {basename} from "node:path";
import {createMisticPayBilling} from "./misticpay-billing.mjs";
import {createMisticPayAdapter} from "./misticpay-adapter.mjs";
import {createMisticPayStore} from "./misticpay-pg-store.mjs";

if (basename(process.argv[1]||"") === "server.mjs" && !globalThis.__PULSO_MISTICPAY_PRELOAD__) {
  globalThis.__PULSO_MISTICPAY_PRELOAD__ = true;
  const origin = "https://pulso-fit-ai-95-online.onrender.com";
  const publicPaths = new Set(["/api/billing/config","/api/billing/health"]);
  const managedPaths = new Set(["/api/billing/checkout","/api/billing/payment","/api/billing/webhook","/api/admin/billing/config","/api/subscription/status"]);
  const originalEmit = Server.prototype.emit;
  const accessId = process.env.PULSO_MISTICPAY_CLIENT_ID||"";
  const accessSecret = process.env.PULSO_MISTICPAY_CLIENT_SECRET||"";
  const credsPresent = /^pk_[^\s]+$/.test(accessId) && /^sk_[^\s]+$/.test(accessSecret);
  const dbVar = ["PULSO_BILLING_DATABASE_URL","DATABASE_URL","PULSO_DATABASE_URL","POSTGRES_URL","PG_CONNECTION_STRING"].find(k=>!!process.env[k]);
  let dbDetected = !!dbVar, databaseReachable=false, driverAvailable=false;
  let readScopeVerified=false, readScopeResult="not_checked";
  async function validateReadScope(){
    if(!credsPresent)return;
    try{
      const response=await fetch("https://api.misticpay.com/api/transactions/check",{
        method:"POST",redirect:"error",signal:AbortSignal.timeout(8000),
        headers:{"Authorization":"Basic "+Buffer.from(accessId+":"+accessSecret).toString("base64"),
          "Content-Type":"application/json","Accept":"application/json"},
        body:JSON.stringify({transactionId:"pulsofit-verify-read-scope-not-a-real-transaction"})
      });
      const body=await response.json().catch(()=>({}));
      const code=String(body?.code||"");
      readScopeVerified=response.status===404&&code==="TRANSACTION_NOT_FOUND";
      readScopeResult=readScopeVerified?"scope_valid":("HTTP_"+response.status+"_"+code.replace(/[^A-Z_]/g,"").slice(0,50));
    }catch{readScopeResult="network_unavailable"}
    console.log("[pulso-billing] MisticPay read-only auth probe: "+readScopeResult);
  }
  void validateReadScope();

  let pgProbeStarted = false;
  let activeBillingHandler = null;
  const billingFlagsApproved = process.env.PULSO_BILLING_ENABLE_PAYMENTS==="1" && process.env.PULSO_BILLING_DURABLE_ACK==="1";
  const json=(res,code,obj)=>{
    if(res.writableEnded)return;
    res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
    res.end(JSON.stringify(obj));
  };
  async function probe(){
    if(pgProbeStarted)return;
    pgProbeStarted=true;
    if(!dbDetected)return;
    try {
      const pg=await import("pg");
      driverAvailable=!!(pg.Pool||pg.default?.Pool);
      if(!driverAvailable)return;
      const Pool=pg.Pool||pg.default.Pool;
      const pool=new Pool({connectionString:process.env[dbVar],connectionTimeoutMillis:3500,max:1});
      try {
        await pool.query("SELECT 1");databaseReachable=true;
        const schema=await pool.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND (table_name ILIKE '%user%' OR table_name ILIKE '%account%' OR table_name ILIKE '%profile%' OR table_name ILIKE '%subscr%' OR table_name ILIKE '%member%') ORDER BY table_name,column_name LIMIT 100");
        console.log("[pulso-billing] Available account table field names: "+JSON.stringify(schema.rows.map(r=>r.table_name+"."+r.column_name+" ("+r.data_type+")")));
      }
      finally {await pool.end();}
    }catch{databaseReachable=false;}
    console.log("[pulso-billing] Database probe: driver="+driverAvailable+" reachable="+databaseReachable);
    if(billingFlagsApproved && databaseReachable && credsPresent){
      try{
        const store=await createMisticPayStore({connectionString:process.env[dbVar],migrate:process.env.PULSO_BILLING_SCHEMA_MIGRATE==="1"});
        await store.revokeExpired();
        activeBillingHandler=createMisticPayBilling({authenticate,store,origin,gateway:createMisticPayAdapter()});
        const sweep=setInterval(()=>store.revokeExpired().catch(()=>{}),900000);
        sweep.unref?.();
        console.log("[pulso-billing] Full MisticPay Pix API enabled with persistent entitlement storage.");
      }catch(e){console.error("[pulso-billing] Billing stayed DISABLED: "+e.message);}
    }
    // Não criar tabelas nem alterar o banco durante o diagnóstico.
  }
  void probe();
  const ready=()=>Boolean(activeBillingHandler); // Ativar somente após dois flags explícitos e store SQL validado.
  const supported=()=>ready()?["pix"]:[];
  function status(){
    return {
      provider:"misticpay",backendMounted:true,ready:ready(),
      production:true,credentialsConfigured:credsPresent,
      readScopeVerified,
      databaseConfigured:dbDetected,databaseReachable,driverAvailable,
      supportedMethods:supported(),
      plans:{quinzenal:{days:15,amountCents:1490},mensal:{days:30,amountCents:2490}},
      webhookPath:"/api/billing/webhook",
      nextAction:"Ativar armazenamento persistente de assinaturas e integração com as contas antes de aceitar pagamentos."
    };
  }
  async function authenticate(req){
    const authorization=req.headers.authorization||"";
    if(!authorization.startsWith("Bearer ")||authorization.length>4096)return null;
    try{
      const response=await fetch("http://127.0.0.1:"+(process.env.PORT||"10000")+"/api/me",{
        headers:{Authorization:authorization},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(3500)
      });
      if(!response.ok)return null;
      const result=await response.json();
      return result?.user&&result.user.id?{id:result.user.id,role:result.user.role||"user"}:null;
    }catch{return null}
  }
  async function handle(req,res,pathname){
    if(activeBillingHandler && pathname!=="/api/billing/health")return activeBillingHandler(req,res);
    if(req.method==="GET"&&publicPaths.has(pathname)){
      return json(res,200,status());
    }
    if(pathname==="/api/admin/billing/config"){
      const user=await authenticate(req);
      if(user?.role!=="admin")return json(res,403,{error:"Acesso restrito"});
      if(req.method==="GET")return json(res,200,{
        provider:"misticpay",configured:credsPresent,readyForSecureWrite:false,
        webhookVerificationReady:false,
        webhookUrl:origin+"/api/billing/webhook",
        message:"Chaves pk/sk são configuradas nas variáveis protegidas do Render."
      });
      return json(res,409,{error:"Não envie credenciais por navegador. Gerencie-as no Render."});
    }
    if(pathname==="/api/subscription/status"){return json(res,200,{billingEnforced:false,checkoutEnabled:false,trialDays:7});}
    if(pathname==="/api/billing/webhook"){
      // O webhook não é aceito sem verificação independente e banco idempotente.
      return json(res,503,{error:"Webhook ainda não habilitado. Nenhuma assinatura foi ativada."});
    }
    if(pathname==="/api/billing/checkout"||pathname==="/api/billing/payment"){
      return json(res,503,{error:"Checkout Pix aguardando vinculação ao banco e ativação segura do assinante."});
    }
    return json(res,404,{error:"Rota de pagamento não encontrada"});
  }
  Server.prototype.emit = function(event, ...args) {
    if(event==="request"&&args.length>=2){
      const req=args[0],res=args[1];
      let pathname="";
      try{pathname=new URL(req.url,"http://localhost").pathname}catch{}
      if(publicPaths.has(pathname)||managedPaths.has(pathname)){
        void Promise.resolve(handle(req,res,pathname)).catch(()=>{
          if(!res.headersSent)json(res,503,{error:"Integração de pagamento temporariamente indisponível"});
          else if(!res.writableEnded)res.end();
        });
        return true;
      }
    }
    return originalEmit.call(this,event,...args);
  };
  console.log("[pulso-billing] MisticPay routes mounted (safe mode; charges disabled).");
  console.log("[pulso-billing] Diagnostics: credentials="+(credsPresent?"present":"missing")+
    " databaseEnv="+(dbDetected?"present":"missing")+"; no secrets displayed.");
}
