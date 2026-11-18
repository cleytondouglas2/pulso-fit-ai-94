/**
 * PulsoFit AI — API de checkout PIX MisticPay.
 * Precisa ser montada no servidor HTTP do Render e conectada ao store durável
 * de contas. A mera existência deste arquivo NÃO ativa endpoints em produção.
 *
 * A documentação MisticPay NÃO publica assinatura de webhook.
 * Por isso, toda notificação é apenas um gatilho para reconsultar /transactions/check
 * usando autenticação server-side, comparar ID/valor/tipo e atualizar registro
 * de forma atômica e idempotente. Nunca ativar plano com o payload do webhook.
 */
import { randomUUID } from "node:crypto";
import { createMisticPayAdapter,paymentMatchesOrder } from "./misticpay-adapter.mjs";

const PLANS=Object.freeze({
 quinzenal:Object.freeze({title:"Plano quinzenal",amountCents:1490,days:15}),
 mensal:Object.freeze({title:"Plano mensal",amountCents:2490,days:30})
});
function reply(res,status,body){
 res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});
 res.end(JSON.stringify(body));
}
async function payload(req,limit=16000){
 if(!String(req.headers["content-type"]||"").startsWith("application/json"))throw Object.assign(Error("Use JSON"),{status:415});
 let size=0;const parts=[];
 for await(const buf of req){size+=buf.length;if(size>limit)throw Object.assign(Error("Corpo muito grande"),{status:413});parts.push(buf);}
 try{return JSON.parse(Buffer.concat(parts).toString("utf8"))}catch{throw Object.assign(Error("JSON inválido"),{status:400})}
}
const missing=(store)=>[
 "createPendingCheckout","attachProviderPayment","getByProviderPaymentId",
 "getByReference","applyVerifiedEventOnce","applyVerifiedRefundOnce"
].filter(k=>typeof store?.[k]!=="function");
/**
 * authenticate(req): {id,role}|null (token validado no servidor)
 * store deve implementar as operações descritas no README, com transações
 * atômicas e banco persistente. createPendingCheckout antes de chamar gateway.
 *   const handler=createMisticPayBilling({authenticate,store,origin});
 *   if(await handler(req,res))return;
 */
export function createMisticPayBilling({authenticate,store,origin,gateway=createMisticPayAdapter()}={}){
 if(typeof authenticate!=="function")throw Error("Autenticação do servidor é obrigatória");
 if(!origin||!/^https:\/\/[^/]+$/.test(origin))throw Error("Origin HTTPS explícita obrigatória");
 const ready=()=>missing(store).length===0&&gateway.credentialsReady();
 async function settle(order,payment){
  if(!paymentMatchesOrder(payment,order))throw Object.assign(Error("Dados da transação divergem do pedido"),{status:409});
  if(payment.status==="COMPLETO") {
   await store.applyVerifiedEventOnce({
    reference:order.reference,providerPaymentId:payment.id,userId:order.userId,
    planCode:order.planCode,amountCents:order.amountCents,currency:"BRL",
    durationDays:PLANS[order.planCode].days,status:"paid"
   });
  } else if(["DEVOLVIDO","DEVOLVIDO_PARCIAL"].includes(payment.status)) {
   await store.applyVerifiedRefundOnce({
    reference:order.reference,providerPaymentId:payment.id,userId:order.userId,
    status:payment.status
   });
  }
  return payment.status;
 }
 return async function handle(req,res){
  const url=new URL(req.url,origin);
  const path=url.pathname;
  if(!path.startsWith("/api/billing/")&&!path.startsWith("/api/admin/billing/"))return false;
  try{
   if(path==="/api/billing/config"&&req.method==="GET"){
    reply(res,200,{provider:"misticpay",ready:ready(),supportedMethods:ready()?["pix"]:[],
     plans:PLANS,webhookPath:"/api/billing/webhook"});
    return true;
   }
   if(path==="/api/admin/billing/config"&&req.method==="GET"){
    const user=await authenticate(req);
    if(user?.role!=="admin"){reply(res,403,{error:"Acesso restrito"});return true;}
    reply(res,200,{provider:"misticpay",configured:ready(),readyForSecureWrite:false,
     webhookVerificationReady:ready(),webhookUrl:origin+"/api/billing/webhook",
     message:"Guarde pk/sk nas variáveis do Render; não envie credenciais pelo navegador."});return true;
   }
   if(path==="/api/admin/billing/config"&&req.method==="PUT"){
    const user=await authenticate(req);
    reply(res,user?.role==="admin"?409:403,{error:user?.role==="admin"?
      "Configure Client ID e Client Secret diretamente nas variáveis de ambiente do Render.":"Acesso restrito"});
    return true;
   }
   if(path==="/api/billing/checkout"&&req.method==="POST"){
    const user=await authenticate(req);
    if(!user?.id){reply(res,401,{error:"Entre na sua conta para contratar"});return true;}
    if(!ready()){reply(res,503,{error:"PIX MisticPay aguardando configuração segura no Render"});return true;}
    const input=await payload(req);
    const planCode=String(input.planCode||"");
    const plan=PLANS[planCode];
    if(!plan){reply(res,400,{error:"Plano inválido"});return true;}
    if(input.paymentMethod!=="pix"){reply(res,422,{error:"A documentação desta API MisticPay suporta apenas PIX; cartão indisponível."});return true;}
    const reference=randomUUID();
    // O banco deve rejeitar pedidos repetidos segundo sua regra de idempotência.
    await store.createPendingCheckout({reference,userId:String(user.id),planCode,amountCents:plan.amountCents,currency:"BRL"});
    const invoice=await gateway.createPixCharge({
     reference,amountCents:plan.amountCents,payerName:input.payerName,
     payerDocument:input.payerDocument,
     description:"PulsoFit AI — "+plan.title,
     webhookUrl:origin+"/api/billing/webhook"
    });
    await store.attachProviderPayment({reference,providerPaymentId:invoice.providerPaymentId});
    reply(res,201,{provider:"misticpay",reference,providerPaymentId:invoice.providerPaymentId,
     status:"PENDENTE",amountCents:plan.amountCents,
     copyPaste:invoice.copyPaste,qrCodeBase64:invoice.qrCodeBase64});
    return true;
   }
   if(path==="/api/billing/payment"&&req.method==="GET"){
    const user=await authenticate(req);
    if(!user?.id){reply(res,401,{error:"Entre na sua conta"});return true;}
    const ref=url.searchParams.get("reference");
    if(!ref||!/^[a-f0-9-]{36}$/.test(ref)){reply(res,400,{error:"Referência inválida"});return true;}
    const order=await store?.getByReference(ref);
    if(!order||String(order.userId)!==String(user.id)){reply(res,404,{error:"Pedido não encontrado"});return true;}
    if(!ready()||!order.providerPaymentId){reply(res,503,{error:"Cobrança não disponível"});return true;}
    const payment=await gateway.getTransaction(order.providerPaymentId);
    const status=await settle(order,payment);
    reply(res,200,{reference:ref,status,paid:status==="COMPLETO"});
    return true;
   }
   if(path==="/api/billing/webhook"&&req.method==="POST"){
    if(!ready()){reply(res,503,{error:"Verificação de pagamento indisponível"});return true;}
    // A documentação não fornece cabeçalho de assinatura. NÃO confiar no corpo.
    const event=await payload(req,32768);
    const providerPaymentId=String(event.transactionId??"");
    if(!providerPaymentId||providerPaymentId.length>128){reply(res,400,{error:"Transação ausente"});return true;}
    const order=await store.getByProviderPaymentId(providerPaymentId);
    if(!order){reply(res,503,{error:"Pedido ainda não registrado"});return true;}
    const payment=await gateway.getTransaction(providerPaymentId);
    await settle(order,payment);
    reply(res,200,{received:true});return true;
   }
   reply(res,404,{error:"Rota de pagamento não encontrada"});return true;
  }catch(error){
   const code=Number(error?.status);
   const status=code>=400&&code<500?code:503;
   reply(res,status,{error:status<500?error.message:"Pagamento temporariamente indisponível"});
   return true;
  }
 };
}
export { PLANS as MISTICPAY_PLANS };
