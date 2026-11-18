/**
 * Adaptador MisticPay v1 — apenas Cash-In PIX.
 * API pública: https://docs.misticpay.com
 * Requer par pk_.../sk_... com TRANSACTION_CREATE e TRANSACTION_READ.
 * Não fornece cartão nem débito recorrente: não simular recursos sem endpoint.
 */
const BASE = "https://api.misticpay.com/api";
const TIMEOUT_MS=12000;
function asCents(brl){const n=Number(brl);return Number.isFinite(n)?Math.round((n+Number.EPSILON)*100):NaN;}
function validCpf(value){
 const s=String(value||"").replace(/\D/g,"");
 if(!/^\d{11}$/.test(s)||/^(\d)\1{10}$/.test(s))return false;
 for(let p=9;p<11;p++){
  let sum=0;for(let i=0;i<p;i++)sum+=Number(s[i])*(p+1-i);
  if((sum*10)%11%10!==Number(s[p]))return false;
 }return true;
}
export function createMisticPayAdapter({clientId=process.env.PULSO_MISTICPAY_CLIENT_ID,clientSecret=process.env.PULSO_MISTICPAY_CLIENT_SECRET,fetchImpl=fetch}={}){
 const credentialsReady=()=>/^pk_[^\s]+$/.test(clientId||"")&&/^sk_[^\s]+$/.test(clientSecret||"");
 async function request(endpoint,body){
  if(!credentialsReady())throw Object.assign(Error("Credenciais MisticPay ausentes"),{status:503});
  const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),TIMEOUT_MS);
  try{
   const response=await fetchImpl(BASE+endpoint,{method:"POST",headers:{
     "Authorization":"Basic "+Buffer.from(clientId+":"+clientSecret).toString("base64"),
     "Content-Type":"application/json","Accept":"application/json"
   },body:JSON.stringify(body),signal:ac.signal,redirect:"error"});
   const out=await response.json().catch(()=>null);
   if(!response.ok)throw Object.assign(Error("Falha na API MisticPay ("+String(out?.code||response.status)+")"),{status:502,code:out?.code});
   return out;
  }finally{clearTimeout(timeout)}
 }
 return {
  provider:"misticpay",
  credentialsReady,
  supportedMethods:["pix"],
  async createPixCharge({reference,amountCents,payerName,payerDocument,description,webhookUrl}){
   if(!Number.isSafeInteger(amountCents)||amountCents<=0)throw Object.assign(Error("Valor inválido"),{status:400});
   const name=String(payerName||"").trim(),document=String(payerDocument||"").replace(/\D/g,"");
   if(name.length<3||name.length>120||!validCpf(document))throw Object.assign(Error("Informe nome completo e CPF válido do pagador"),{status:400});
   if(!/^[a-f0-9-]{36}$/.test(reference))throw Object.assign(Error("Identificador inválido"),{status:400});
   const result=await request("/transactions/create",{
     amount:amountCents/100,payerName:name,payerDocument:document,
     transactionId:reference,description:String(description||"Assinatura PulsoFit AI").slice(0,130),
     projectWebhook:webhookUrl
   });
   const d=result?.data;
   if(!d||!d.transactionId||typeof d.copyPaste!=="string"||d.copyPaste.length<20){
     throw Object.assign(Error("MisticPay não retornou um PIX válido"),{status:502});
   }
   if(d.transactionState&&d.transactionState!=="PENDENTE")throw Object.assign(Error("Transação retornou estado inesperado"),{status:502});
   if(d.transactionAmount!==undefined&&asCents(d.transactionAmount)!==amountCents)throw Object.assign(Error("Valor retornado pelo gateway diverge do pedido"),{status:502});
   return {
     providerPaymentId:String(d.transactionId),copyPaste:d.copyPaste,
     qrCodeBase64:typeof d.qrCodeBase64==="string"&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(d.qrCodeBase64)?d.qrCodeBase64:null,
     status:"pending"
   };
  },
  async getTransaction(providerPaymentId){
   if(!providerPaymentId||String(providerPaymentId).length>128)throw Object.assign(Error("Transação inválida"),{status:400});
   const result=await request("/transactions/check",{transactionId:String(providerPaymentId)});
   const t=result?.transaction;
   if(!t||String(t.transactionId)!==String(providerPaymentId))throw Object.assign(Error("ID da transação não corresponde"),{status:502});
   const status=String(t.transactionState||"").toUpperCase();
   return {
    id:String(t.transactionId),
    amountCents:asCents(t.value),
    currency:"BRL",
    status,
    type:String(t.transactionType||"").toUpperCase(),
    method:String(t.transactionMethod||"").toUpperCase()
   };
  }
 };
}
export function paymentMatchesOrder(payment,order){
 return Boolean(payment&&order&&payment.id===String(order.providerPaymentId)&&
 payment.type==="DEPOSITO"&&payment.method==="PIX"&&
 payment.currency==="BRL"&&payment.amountCents===Number(order.amountCents)&&
 Number.isSafeInteger(payment.amountCents)&&payment.amountCents>0);
}
