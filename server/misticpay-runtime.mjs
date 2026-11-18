/**
 * PulsoFit AI — runtime MisticPay para o servidor gerado pelo Render.
 * `NODE_OPTIONS=--import=./server/misticpay-runtime.mjs`
 *
 * Intercepta exclusivamente rotas de cobrança, mantém o backend de contas
 * intacto e usa a conexão PostgreSQL já configurada no Render.
 * Fail closed: NÃO aceita pagamentos até banco permanente e validação da
 * proteção de acesso. API keys nunca chegam ao navegador.
 */
import {Server} from "node:http";
import {basename} from "node:path";
import {createMisticPayAdapter} from "./misticpay-adapter.mjs";
import {createMisticPayPostgresStore} from "./misticpay-postgres-store.mjs";
import {createMisticPayBilling} from "./misticpay-billing.mjs";

if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_BILLING_RUNTIME__){
 globalThis.__PULSO_BILLING_RUNTIME__=true;
 const origin="https://pulso-fit-ai-95-online.onrender.com";
 const managed=new Set(["/api/billing/config","/api/billing/health","/api/billing/checkout",
  "/api/billing/payment","/api/billing/webhook","/api/admin/billing/config","/api/subscription/status"]);
 const dbVar=["PULSO_BILLING_DATABASE_URL","DATABASE_URL","PULSO_DATABASE_URL","POSTGRES_URL","PG_CONNECTION_STRING"].find(k=>!!process.env[k]);
 const gateway=createMisticPayAdapter();
 const state={provider:"misticpay",backendMounted:true,ready:false,production:true,
   credentialsConfigured:gateway.credentialsReady(),databaseConfigured:Boolean(dbVar),
   databaseReachable:false,accountSchemaVerified:false,storageReady:false,
   providerAuth:"unchecked",supportedMethods:[],webhookPath:"/api/billing/webhook",
   plans:{quinzenal:{days:15,amountCents:1490},mensal:{days:30,amountCents:2490}}};
 let pool=null,store=null,billing=null,configured=false;
 const requiredFlags=()=>{
  return process.env.PULSO_BILLING_STABLE_DB==="1" &&
   process.env.PULSO_BILLING_PREMIUM_API_ENFORCED==="1" &&
   process.env.PULSO_MISTICPAY_ENABLE_CHARGES==="1";
 };
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
   state.storageReady=true;
   billing=createMisticPayBilling({authenticate,store,origin,gateway});
  }catch(error){
   state.storageReady=false;
   console.error("[pulso-billing] Storage unavailable ("+String(error.code||"initialization")+"); payments disabled.");
  }
  if(state.credentialsConfigured){
   try{
    // Consulta autenticada de um ID inexistente: nenhum PIX é criado.
    await gateway.getTransaction("00000000-0000-4000-8000-000000000000");
    state.providerAuth="verified";
   }catch(error){
    const code=String(error.code||"");
    state.providerAuth=["INVALID_API_CREDENTIAL","API_SCOPE_DENIED","API_CREDENTIAL_REQUIRED","IP_NOT_ALLOWED"].includes(code)?"denied":(["TRANSACTION_NOT_FOUND","VALIDATION_ERROR"].includes(code)?"verified":"checked");
    console.log("[pulso-billing] Provider read-only probe: http="+(Number(error.status)||0)+" code="+code.replace(/[^A-Z0-9_]/g,"").slice(0,64)+" kind="+String(error.name||"").replace(/[^a-zA-Z]/g,"").slice(0,24)+"; no charge created.");
   }
  }
  // O PostgreSQL atual é de teste e expira. Exigir banco permanente e
  // controle premium real nas APIs antes de transacionar dinheiro.
  configured=Boolean(billing&&state.storageReady&&state.accountSchemaVerified&&
    state.credentialsConfigured&&state.providerAuth==="verified"&&requiredFlags());
  state.ready=configured;
  if(configured)state.supportedMethods=["pix"];
  console.log("[pulso-billing] Integration: postgres="+state.databaseReachable+
   " accountSchema="+state.accountSchemaVerified+" billingStore="+state.storageReady+
   " providerAuth="+state.providerAuth+" checkout="+(configured?"enabled":"disabled")+
   " (no keys or user records logged).");
 }
 const bootPromise=boot();
 async function handle(req,res,path){
  await bootPromise;
  if(path==="/api/billing/health"||path==="/api/billing/config"){
   if(req.method!=="GET")return respond(res,405,{error:"Método inválido"});
   return respond(res,200,{...state,nextAction:state.ready?"Conectado":"Aguardando banco permanente e proteção de acesso no servidor."});
  }
  if(path==="/api/subscription/status"&&!configured){
   return respond(res,200,{billingEnforced:false,checkoutEnabled:false});
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
  }
  return originalEmit.call(this,event,...args);
 };
 console.log("[pulso-billing] MisticPay runtime mounted; default fail-closed.");
}
