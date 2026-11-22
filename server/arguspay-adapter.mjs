/**
 * ARGUS Pay V2, server-side only. No payout/saldo movements.
 * The caller supplies a mutable in-memory credential snapshot so admin rotation
 * takes effect without redeploying or exposing secrets to a browser.
 */
const LIMIT_MS=12000;
const VALID_KEY=/^agp_live_[a-f0-9]{24}$/;
const VALID_SECRET=/^ags_live_[a-f0-9]{64}$/;
function error(message,status=503,code="ARGUS_UNAVAILABLE"){
 return Object.assign(new Error(message),{status,code});
}
function normalizeBase(value){
 const u=new URL(value);
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||
    u.pathname!=="/"||!u.hostname)throw Error("ARGUS API URL must be a bare HTTPS origin");
 return u.origin;
}
export function createArgusPayAdapter({
 getCredentials=()=>({key:process.env.ARGUS_API_KEY,secret:process.env.ARGUS_API_SECRET}),
 baseUrl=process.env.PULSO_ARGUSPAY_URL||"https://app.arguspay.com.br",
 fetchImpl=fetch
}={}){
 const base=normalizeBase(baseUrl);
 const credentialsReady=()=>{
  const pair=getCredentials()||{};
  return VALID_KEY.test(String(pair.key||""))&&VALID_SECRET.test(String(pair.secret||""));
 };
 async function request(method,path,body=null,idem=null,credentials=null){
  const pair=credentials||getCredentials()||{};
  if(!VALID_KEY.test(String(pair.key||""))||!VALID_SECRET.test(String(pair.secret||"")))
   throw error("Chaves ARGUS Pay não configuradas",503,"ARGUS_CREDENTIALS_MISSING");
  const headers={"Accept":"application/json","X-Argus-Key":pair.key,"X-Argus-Secret":pair.secret};
  if(body!==null)headers["Content-Type"]="application/json";
  if(idem)headers["Idempotency-Key"]=idem;
  let response;
  try{
   response=await fetchImpl(base+path,{method,headers,body:body===null?undefined:JSON.stringify(body),
    redirect:"error",cache:"no-store",signal:AbortSignal.timeout(LIMIT_MS)});
  }catch{throw error("Não foi possível consultar a Argus Pay");}
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw error(
   response.status===401||response.status===403?"Chave de integração inválida ou sem permissão":
   "Argus Pay indisponível para esta operação",
   response.status===401||response.status===403?401:503,
   "ARGUS_HTTP_"+response.status
  );
  if(!data||typeof data!=="object")throw error("Resposta inválida da Argus Pay");
  return data;
 }
 function toPayment(raw,expectedId){
  const c=raw?.charge||raw;
  if(!c||String(c.id)!==String(expectedId))throw error("ID de cobrança divergente");
  const state=String(c.status||"").toLowerCase();
  const statuses={paid:"COMPLETO",pending:"PENDENTE",creating:"PENDENTE",
   unknown:"PENDENTE",expired:"EXPIRADO",failed:"FALHA",refunded:"DEVOLVIDO",
   cancelled:"CANCELADO",canceled:"CANCELADO"};
  if(!statuses[state])throw error("Estado de cobrança não reconhecido");
  return {id:String(c.id),amountCents:Number(c.amount_cents),
   currency:"BRL",type:"DEPOSITO",method:"PIX",status:statuses[state]};
 }
 return {
  provider:"arguspay",supportedMethods:["pix"],credentialsReady,baseUrl:base,
  async testConnection(candidate){
   const data=await request("GET","/api/v2/wallet/balance",null,null,candidate);
   if(typeof data.currency!=="string"&&typeof data.wallet!=="object")
    throw error("A Argus Pay não confirmou a conta da integração");
   return {ok:true,depositsEnabled:(data.deposits_enabled??data.wallet?.deposits_enabled)===true};
  },
  async createPixCharge({reference,amountCents,payerName,payerDocument,description}){
   if(!/^[a-f0-9-]{36}$/i.test(String(reference||"")))throw error("Referência inválida",400);
   if(!Number.isSafeInteger(amountCents)||amountCents<100||amountCents>10000)
    throw error("Valor Pix fora do limite da Argus Pay",422);
   const name=String(payerName||"").trim(),doc=String(payerDocument||"").replace(/\D/g,"");
   if(name.length<3||name.length>120||!/^\d{11}$|^\d{14}$/.test(doc))
    throw error("Nome completo e CPF/CNPJ do pagador são obrigatórios",400);
   const created=await request("POST","/api/v2/pix/charges",{
    amount_cents:amountCents,payer_name:name,payer_document:doc,
    description:String(description||"Assinatura PulsoFit").slice(0,120)
   },reference);
   if(!/^mwc_[a-f0-9]{32}$/.test(String(created.id||""))||
       typeof created.pix_copy_paste!=="string"||created.pix_copy_paste.length<20||
       Number(created.amount_cents)!==amountCents)
    throw error("Cobrança criada sem Pix verificável; consulte o gateway antes de tentar novamente");
   // Prefer the PNG returned by ARGUS API; keep client-side QR fallback.
   const image=typeof created.qr_code_base64==="string"?created.qr_code_base64:"";
   const qrCodeBase64=image.length<160000&&
     /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image)?image:null;
   return {providerPaymentId:created.id,copyPaste:created.pix_copy_paste,
    qrCodeBase64,status:"pending"};
  },
  async getTransaction(id){
   if(!/^mwc_[a-f0-9]{32}$/.test(String(id||"")))throw error("ID Argus Pay inválido",400);
   return toPayment(await request("GET","/api/v2/pix/charges/"+encodeURIComponent(id)),id);
  }
 };
}
export const isArgusCredentialPair=pair=>VALID_KEY.test(String(pair?.key||""))&&VALID_SECRET.test(String(pair?.secret||""));
