import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {createMisticPayBilling} from "./misticpay-billing.mjs";
const reference="123e4567-e89b-42d3-a456-426614174000";
const paymentId="gateway-773";
const order={reference,userId:"account-A",planCode:"teste7d",amountCents:100,currency:"BRL",providerPaymentId:paymentId,status:"PENDENTE"};
function setup({status="COMPLETO",outage=false,alreadyPaid=false}={}){
 let checks=0,activations=0,lookups=[];
 const stored={...order,status:alreadyPaid?"COMPLETO":"PENDENTE"};
 const store={
  async createPendingCheckout(){},async attachProviderPayment(){},async getByProviderPaymentId(){},
  async getByReference(){return stored},
  async getLatestUserOrder(id){lookups.push(id);return id==="account-A"?stored:null},
  async firstTrialUse(){return new Date()},
  async getEntitlement(){return {active:stored.status==="COMPLETO",expiresAt:stored.status==="COMPLETO"?"2026-11-25T12:00:00Z":null}},
  async applyVerifiedEventOnce(evt){activations++;assert.equal(evt.amountCents,100);assert.equal(evt.durationDays,7);stored.status="COMPLETO";},
  async applyVerifiedRefundOnce(){}
 };
 const gateway={credentialsReady:()=>true,async getTransaction(){
  checks++;if(outage)throw Object.assign(Error("503"),{status:503,code:"INTERNAL_ERROR"});
  return {id:paymentId,amountCents:100,currency:"BRL",type:"DEPOSITO",method:"PIX",status};
 }};
 const handler=createMisticPayBilling({authenticate:async()=>({id:"account-A"}),store,gateway,origin:"https://pulso-fit-ai-95-online.onrender.com"});
 async function run(path="/api/billing/recover"){
  const req={url:path,method:"GET",headers:{}};
  const res={status:0,result:null,writeHead(status){this.status=status},end(raw){this.result=JSON.parse(raw)}};
  assert.equal(await handler(req,res),true);return res;
 }
 return {run,checks:()=>checks,activations:()=>activations,lookups};
}
test("Recuperação confirma Pix real validado e libera plano de 7 dias",async()=>{
 const x=setup();const r=await x.run();assert.equal(r.status,200);
 assert.equal(r.result.found,true);assert.equal(r.result.paid,true);
 assert.equal(r.result.planCode,"teste7d");assert.equal(r.result.planActive,true);
 assert.equal(x.checks(),1);assert.equal(x.activations(),1);
 assert.deepEqual(x.lookups,["account-A"]);
});
test("Falha de verificação não aprova pagamento nem exige nova cobrança",async()=>{
 const x=setup({outage:true});const r=await x.run();
 assert.equal(r.status,200);assert.equal(r.result.paid,false);
 assert.equal(r.result.status,"VERIFICATION_UNAVAILABLE");
 assert.equal(r.result.retryable,true);assert.equal(x.activations(),0);
});
test("Pagamento já confirmado no banco não depende da MisticPay estar online",async()=>{
 const x=setup({alreadyPaid:true,outage:true});const r=await x.run();
 assert.equal(r.status,200);assert.equal(r.result.paid,true);
 assert.equal(x.checks(),0);assert.equal(x.activations(),0);
 const y=await x.run("/api/billing/payment?reference="+reference);
 assert.equal(y.result.paid,true);assert.equal(x.checks(),0);
});
test("Status PENDENTE permanece pendente mesmo após consulta legítima",async()=>{
 const x=setup({status:"PENDENTE"});const r=await x.run();
 assert.equal(r.status,200);assert.equal(r.result.paid,false);
 assert.equal(r.result.status,"PENDENTE");assert.equal(x.activations(),0);
});
test("UI conserva referência e recupera Pix ao retornar ao aplicativo",()=>{
 const ui=readFileSync(new URL("./pulsofit-plans-stable.js",import.meta.url),"utf8");
 new Script(ui);
 assert.match(ui,/\/api\/billing\/recover/);
 assert.match(ui,/pf-stable-recover-button/);
 assert.match(ui,/pulsofit-pix-pending-ref-v1/);
 assert.match(ui,/visibilitychange/);
 assert.match(ui,/function renderPaid/);
});
test("Backend de cobrança reserva rota de recuperação autenticada e conta isolada",()=>{
 const server=readFileSync(new URL("./misticpay-runtime.mjs",import.meta.url),"utf8");
 const store=readFileSync(new URL("./misticpay-postgres-store.mjs",import.meta.url),"utf8");
 assert.match(server,/"/api\/billing\/recover"/);
 assert.match(store,/user_id=\$1 AND provider_payment_id IS NOT NULL/);
 assert.match(store,/ORDER BY created_at DESC LIMIT 1/);
});