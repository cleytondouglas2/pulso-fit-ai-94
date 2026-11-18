import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {createProductionPixReconciler} from "./misticpay-auto-reconcile.mjs";
import {settleVerifiedMisticPayOrder} from "./misticpay-billing.mjs";
const pending={reference:"123e4567-e89b-42d3-a456-426614174000",providerPaymentId:"paid-001",
 userId:"user1",planCode:"teste7d",amountCents:100,currency:"BRL"};
const original={id:"paid-001",amountCents:100,currency:"BRL",type:"DEPOSITO",method:"PIX",status:"COMPLETO"};
function fakeStore(orders){
 let settled=0,claimed=0,active=false;
 return {get settled(){return settled},get claimed(){return claimed},get active(){return active},
  async claimPendingForVerification(){claimed++;return orders},
  async applyVerifiedEventOnce(evt){assert.equal(evt.durationDays,7);assert.equal(evt.amountCents,100);settled++;active=true},
  async applyVerifiedRefundOnce(){throw Error("Refund not expected")}
 };
}
test("Verificação automática usa produção existente, nunca chama criação de Pix",async()=>{
 const store=fakeStore([pending]);
 const gateway={async getTransaction(id){assert.equal(id,"paid-001");return original},
  createPixCharge(){throw Error("Must not create a new charge")}};
 const entries=[],worker=createProductionPixReconciler({store,gateway,settle:settleVerifiedMisticPayOrder,logger:x=>entries.push(x)});
 const result=await worker.check();
 assert.equal(result.confirmed,1);assert.equal(result.created,0);assert.equal(store.settled,1);assert.equal(store.active,true);
 assert.equal(entries[0].checked,1);
});
test("Pix com valor, identificador ou método divergentes nunca libera o plano",async()=>{
 for(const change of [{amountCents:200},{id:"not-this-pix"},{type:"RETIRADA"},{method:"TED"}]){
  const store=fakeStore([pending]),gateway={async getTransaction(){return {...original,...change}}};
  const result=await createProductionPixReconciler({store,gateway,settle:settleVerifiedMisticPayOrder}).check();
  assert.equal(result.unverified,1);assert.equal(store.settled,0);
 }
});
test("Transação PENDENTE continua pendente; falha do gateway não é pagamento",async()=>{
 const store=fakeStore([pending]);
 const pendingResult=await createProductionPixReconciler({store,gateway:{async getTransaction(){return {...original,status:"PENDENTE"}}},settle:settleVerifiedMisticPayOrder}).check();
 assert.equal(pendingResult.pending,1);assert.equal(store.settled,0);
 const broken=await createProductionPixReconciler({store,gateway:{async getTransaction(){throw Error("502")}},settle:settleVerifiedMisticPayOrder}).check();
 assert.equal(broken.unverified,1);assert.equal(store.settled,0);
});
test("Consulta concorrente evita chamar provedor duas vezes",async()=>{
 const store=fakeStore([pending]);let resolve;
 const gate=new Promise(r=>{resolve=r});let seen=0;
 const worker=createProductionPixReconciler({store,gateway:{async getTransaction(){seen++;await gate;return {...original,status:"PENDENTE"}}},settle:settleVerifiedMisticPayOrder});
 const first=worker.check();
 await Promise.resolve();
 const second=await worker.check();
 assert.equal(second.skipped,true);
 resolve();
 const result=await first;assert.equal(result.pending,1);assert.equal(seen,1);
});
test("Frontend consulta automaticamente e ao voltar do aplicativo de banco",()=>{
 const ui=readFileSync(new URL("./pulsofit-plans-stable.js",import.meta.url),"utf8");
 new Script(ui);
 assert.match(ui,/function autoVerifyPix/);
 assert.match(ui,/autoVerifyPix\(false\)/);
 assert.match(ui,/visibilitychange/);
 assert.match(ui,/pageshow/);
 assert.match(ui,/paymentToast/);
});
test("Worker real é integrado a partir do boot e registra contadores sem CPF ou chaves",()=>{
 const ui=readFileSync(new URL("./misticpay-runtime.mjs",import.meta.url),"utf8");
 assert.match(ui,/createProductionPixReconciler/);
 assert.match(ui,/setInterval\(\(\)=>\{void reconcileExistingPix\(\)\},65000\)/);
 assert.match(ui,/created=0/);
 assert.ok(!ui.includes("console.log(order.providerPaymentId)"));
});
