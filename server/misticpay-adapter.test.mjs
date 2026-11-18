import test from "node:test";
import assert from "node:assert/strict";
import {createMisticPayAdapter,paymentMatchesOrder} from "./misticpay-adapter.mjs";

test("Criação PIX usa reais, Authorization Basic e CPF validado",async()=>{
 const calls=[];
 const adapter=createMisticPayAdapter({
  clientId:"pk_test",clientSecret:"sk_test",
  fetchImpl:async(url,opts)=>{
   calls.push({url,opts,body:JSON.parse(opts.body)});
   return {ok:true,json:async()=>({data:{
    transactionId:"pid-123",transactionState:"PENDENTE",
    transactionAmount:14.9,copyPaste:"000201010212br.gov.bcb.pix2560longcode"
   }})};
  }
 });
 const data=await adapter.createPixCharge({
  reference:"123e4567-e89b-12d3-a456-426614174000",amountCents:1490,
  payerName:"Pessoa de Teste",payerDocument:"52998224725",
  description:"PulsoFit Quinzenal",webhookUrl:"https://example.org/api/billing/webhook"
 });
 assert.equal(data.providerPaymentId,"pid-123");
 assert.equal(calls[0].body.amount,14.9);
 assert.equal(calls[0].body.payerDocument,"52998224725");
 assert.equal(calls[0].opts.headers.Authorization,
  "Basic "+Buffer.from("pk_test:sk_test").toString("base64"));
 assert.match(calls[0].url,/\/api\/transactions\/create$/);
});
test("Recusa CPF incorreto antes de gerar cobrança",async()=>{
 let called=false;
 const adapter=createMisticPayAdapter({clientId:"pk_test",clientSecret:"sk_test",
   fetchImpl:async()=>{called=true;throw Error("Não deveria chamar a API")}});
 await assert.rejects(()=>adapter.createPixCharge({
  reference:"123e4567-e89b-12d3-a456-426614174000",amountCents:2490,
  payerName:"Nome de teste",payerDocument:"11111111111"
 }),/CPF válido/);
 assert.equal(called,false);
});
test("Validação de transação exige valor, tipo, método e id corretos",()=>{
 const order={providerPaymentId:"pid-123",amountCents:1490};
 const paid={id:"pid-123",amountCents:1490,currency:"BRL",type:"DEPOSITO",method:"PIX",status:"COMPLETO"};
 assert.equal(paymentMatchesOrder(paid,order),true);
 assert.equal(paymentMatchesOrder({...paid,amountCents:2490},order),false);
 assert.equal(paymentMatchesOrder({...paid,type:"RETIRADA"},order),false);
 assert.equal(paymentMatchesOrder({...paid,method:"CARD"},order),false);
 assert.equal(paymentMatchesOrder({...paid,id:"wrong"},order),false);
});
