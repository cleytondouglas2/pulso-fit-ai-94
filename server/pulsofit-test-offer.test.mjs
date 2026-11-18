import test from "node:test";
import assert from "node:assert/strict";
import {testOfferState,availableBillingPlans,TEST_PLAN} from "./pulsofit-test-offer.mjs";
import {createMisticPayBilling,MISTICPAY_PLANS} from "./misticpay-billing.mjs";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const NOW=Date.parse("2026-11-18T12:00:00Z");
const liveEnv={PULSO_TEST_PLAN_STARTS_AT:new Date(NOW-5000).toISOString(),PULSO_TEST_PLAN_EXPIRES_AT:new Date(NOW+86395000).toISOString()};
test("Plano promocional é exatamente R$1 por 7 dias",()=>{
 assert.equal(TEST_PLAN.amountCents,100);
 assert.equal(TEST_PLAN.days,7);
 assert.equal(MISTICPAY_PLANS.teste7d.amountCents,100);
 assert.equal(MISTICPAY_PLANS.teste7d.days,7);
});
test("Promoção encerra automaticamente 24h após iniciar, sem cron ou expiração dos 7 dias",()=>{
 const start=Date.parse(liveEnv.PULSO_TEST_PLAN_STARTS_AT);
 const end=Date.parse(liveEnv.PULSO_TEST_PLAN_EXPIRES_AT);
 assert.equal(end-start,86400000);
 assert.equal(testOfferState(liveEnv,start-1).enabled,false);
 assert.equal(testOfferState(liveEnv,start).enabled,true);
 assert.equal(testOfferState(liveEnv,end-1).enabled,true);
 assert.equal(testOfferState(liveEnv,end).enabled,false);
 assert.equal(testOfferState({...liveEnv,PULSO_TEST_PLAN_EXPIRES_AT:new Date(start+86400001).toISOString()},start).enabled,false);
 assert.equal(testOfferState({},start).enabled,false);
});
test("Catálogo público só mostra R$1 durante a oferta",()=>{
 assert.equal(availableBillingPlans(MISTICPAY_PLANS,liveEnv,NOW).teste7d.amountCents,100);
 assert.equal(availableBillingPlans(MISTICPAY_PLANS,liveEnv,NOW+86400000).teste7d,undefined);
 assert.equal(availableBillingPlans(MISTICPAY_PLANS,liveEnv,NOW).mensal.amountCents,2490);
});
test("Checkout R$1 não chama MisticPay depois do vencimento",async()=>{
 const prevStart=process.env.PULSO_TEST_PLAN_STARTS_AT,prevEnd=process.env.PULSO_TEST_PLAN_EXPIRES_AT;
 process.env.PULSO_TEST_PLAN_STARTS_AT="2026-01-01T00:00:00.000Z";
 process.env.PULSO_TEST_PLAN_EXPIRES_AT="2026-01-02T00:00:00.000Z";
 let charged=0,created=0;
 const store=Object.fromEntries(["createPendingCheckout","attachProviderPayment","getByProviderPaymentId","getByReference",
  "applyVerifiedEventOnce","applyVerifiedRefundOnce","firstTrialUse","getEntitlement"].map(k=>[k,async()=>{created++}]));
 const gateway={credentialsReady:()=>true,createPixCharge:async()=>{charged++}};
 const handle=createMisticPayBilling({authenticate:async()=>({id:"dummy"}),store,origin:"https://example.com",gateway});
 const req={method:"POST",url:"/api/billing/checkout",headers:{"content-type":"application/json"},
  async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify({planCode:"teste7d",paymentMethod:"pix"}))}};
 const res={status:null,body:"",writeHead(status){this.status=status},end(data){this.body=data}};
 try{
  const result=await handle(req,res);
  assert.equal(result,true);assert.equal(res.status,410);assert.equal(charged,0);assert.equal(created,0);
  assert.match(JSON.parse(res.body).error,/encerrada/);
 }finally{
  if(prevStart===undefined)delete process.env.PULSO_TEST_PLAN_STARTS_AT;else process.env.PULSO_TEST_PLAN_STARTS_AT=prevStart;
  if(prevEnd===undefined)delete process.env.PULSO_TEST_PLAN_EXPIRES_AT;else process.env.PULSO_TEST_PLAN_EXPIRES_AT=prevEnd;
 }
});
test("Store preserva validação atômica de pagamento e os 7 dias sem alterar assinaturas existentes",()=>{
 const store=readFileSync(new URL("./misticpay-postgres-store.mjs",import.meta.url),"utf8");
 assert.match(store,/teste7d:\{amount:100,days:7\}/);
 assert.match(store,/evt\.durationDays/);
 assert.match(store,/INSERT INTO pf_billing_entitlements/);
 assert.match(store,/ON CONFLICT DO NOTHING RETURNING provider_payment_id/);
 assert.match(store,/plan_code IN \('quinzenal','mensal','teste7d'\)/);
});
test("Interface só apresenta botão promocional se a API o autorizar",()=>{
 const ui=readFileSync(new URL("./pulsofit-plans-stable.js",import.meta.url),"utf8");
 new Script(ui);
 assert.match(ui,/offerActive/);
 assert.match(ui,/testOffer/);
 assert.match(ui,/offer\?\.enabled/);
 assert.match(ui,/data-pf-stable-plan="teste7d"/);
});
test("Ativar todas as notificações requer toque e respeita as permissões do celular",()=>{
 const ui=readFileSync(new URL("./pulsofit-push-ui.js",import.meta.url),"utf8");
 new Script(ui);
 assert.match(ui,/async function activateAll/);
 assert.match(ui,/selectedTraining=true;selectedPerformance=true;selectedWellness=true;selectedFrequency=3/);
 assert.match(ui,/Notification\.requestPermission/);
 assert.match(ui,/pf-push-activate-all/);
 assert.match(ui,/addEventListener\("click",activateAll\)/);
});