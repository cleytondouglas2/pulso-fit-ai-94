/*
 * PulsoFit — contrato de checkout para integração com gateway.
 * ESTE MÓDULO É UM ADAPTADOR: precisa ser montado no server.mjs e receber
 * um gatewayAdapter específico do provedor antes de aceitar pagamentos.
 * Sem gateway/segredos reais, retorna erro e nunca ativa planos.
 */
import { createCipheriv, randomBytes, createHash } from "node:crypto";

export const BILLING_PLANS = Object.freeze({
  quinzenal: Object.freeze({ title: "Quinzenal", amountCents: 1490, currency: "BRL", durationDays: 15 }),
  mensal: Object.freeze({ title: "Mensal", amountCents: 2490, currency: "BRL", durationDays: 30 }),
});
const TRIAL_DAYS = 7;
const MAX_JSON = 16_384;
const reply = (res, status, data) => {
  res.writeHead(status, {"content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff"});
  res.end(JSON.stringify(data));
};
async function json(req) {
  const parts = []; let size=0;
  for await (const chunk of req) {
    size += chunk.length; if(size>MAX_JSON) throw Object.assign(new Error("Payload muito grande"),{status:413});
    parts.push(chunk);
  }
  try {return JSON.parse(Buffer.concat(parts).toString("utf8")||"{}");}
  catch {throw Object.assign(new Error("JSON inválido"),{status:400});}
}
function masterKey(){
  const raw=process.env.PULSO_BILLING_MASTER_KEY||"";
  if(!/^[\da-f]{64}$/i.test(raw))return null;
  return Buffer.from(raw,"hex");
}
function seal(text) {
  const key=masterKey(); if(!key)throw Object.assign(new Error("Armazenamento seguro não configurado"),{status:503});
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);
  const ciphertext=Buffer.concat([cipher.update(String(text),"utf8"),cipher.final()]);
  return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),ciphertext.toString("base64url")].join(".");
}
function adminReady(deps){
  return Boolean(masterKey()&&typeof deps.store?.saveGatewayConfig==="function"&&typeof deps.store?.loadGatewayConfig==="function");
}
function providerReady(deps){
  return Boolean(deps.adapter&&typeof deps.adapter.createCheckout==="function"&&typeof deps.adapter.verifyWebhook==="function"&&typeof deps.adapter.fetchVerifiedPayment==="function");
}
function safeUrl(value){
  const u=new URL(value);
  if(u.protocol!=="https:")throw Object.assign(new Error("É necessário HTTPS"),{status:400});
  return u.toString();
}
function userId(user){return String(user?.id||"");}

/**
 * deps = {
 *   auth(req): Promise<{id,role}|null>,
 *   store: {loadGatewayConfig, saveGatewayConfig, createPayment, activatePaymentOnce,
 *           firstTrialUse, getEntitlement, trackWebhookEvent},
 *   adapter: { createCheckout, verifyWebhook, fetchVerifiedPayment }
 * }
 * Retorna true quando atendeu a rota, false para delegar ao servidor existente.
 */
export function createBillingHandler(deps={}){
  return async function handleBilling(req,res){
    const path=new URL(req.url,"http://localhost").pathname;
    if(!path.startsWith("/api/billing/")&&!path.startsWith("/api/admin/billing/")&&path!=="/api/subscription/status")return false;
    try {
      const webhook=path.startsWith("/api/billing/webhooks/");
      const user=webhook?null:await deps.auth?.(req);
      if(!webhook&&!user){reply(res,401,{error:"Faça login para continuar."});return true;}
      if(path.startsWith("/api/admin/")&&user.role!=="admin"){reply(res,403,{error:"Acesso restrito a administradores."});return true;}
      if(path==="/api/admin/billing/config/status"&&req.method==="GET"){
        reply(res,200,{secureStorageReady:adminReady(deps),webhookVerificationReady:providerReady(deps),hasProvider:providerReady(deps)});
        return true;
      }
      if(path==="/api/admin/billing/config"&&req.method==="POST"){
        if(!adminReady(deps)){reply(res,503,{error:"Configure o armazenamento seguro no servidor."});return true;}
        const body=await json(req);
        if(!/^[a-z][a-z0-9-]{1,40}$/.test(String(body.provider||""))||!body.apiKey||!body.webhookSecret) {
          reply(res,400,{error:"Gateway, API Key e segredo do webhook são obrigatórios."});return true;
        }
        const safeBase=body.apiBaseUrl?safeUrl(body.apiBaseUrl):"";
        await deps.store.saveGatewayConfig({provider:body.provider,environment:body.environment==="production"?"production":"sandbox",
          apiBaseUrl:safeBase,apiKeyEncrypted:seal(body.apiKey),webhookSecretEncrypted:seal(body.webhookSecret)});
        reply(res,200,{saved:true,provider:body.provider,webhookPath:"/api/billing/webhooks/"+body.provider});
        return true;
      }
      if(path==="/api/billing/plans"&&req.method==="GET"){
        reply(res,200,{trialDays:TRIAL_DAYS,plans:BILLING_PLANS,checkoutEnabled:providerReady(deps)&&adminReady(deps)});
        return true;
      }
      if(path==="/api/subscription/status"&&req.method==="GET"){
        if(typeof deps.store?.getEntitlement!=="function"||typeof deps.store?.firstTrialUse!=="function"){
          reply(res,503,{error:"Controle de assinatura não está habilitado no servidor.",billingEnforced:false});return true;
        }
        const [plan,trialStart]=await Promise.all([deps.store.getEntitlement(userId(user)),deps.store.firstTrialUse(userId(user))]);
        const trialEnds=new Date(new Date(trialStart).getTime()+TRIAL_DAYS*864e5);
        const active=plan&&new Date(plan.expiresAt)>new Date();
        reply(res,200,{billingEnforced:providerReady(deps)&&adminReady(deps),trialEndsAt:trialEnds.toISOString(),
          trialActive:trialEnds>new Date(),plan:active?plan.plan:null,planExpiresAt:active?plan.expiresAt:null,
          hasAccess:user.role==="admin"||active||trialEnds>new Date()});
        return true;
      }
      if(path==="/api/billing/checkout"&&req.method==="POST"){
        if(!providerReady(deps)||!adminReady(deps)){reply(res,503,{error:"Gateway de pagamento ainda não ativado."});return true;}
        if(typeof deps.store?.createPayment!=="function"){reply(res,503,{error:"Registro de pagamentos indisponível."});return true;}
        const input=await json(req),plan=BILLING_PLANS[input.planId];
        if(!plan){reply(res,400,{error:"Plano inválido"});return true;}
        const reference=createHash("sha256").update(userId(user)+":"+input.planId+":"+Date.now()+":"+randomBytes(8).toString("hex")).digest("hex");
        await deps.store.createPayment({reference,userId:userId(user),planId:input.planId,amountCents:plan.amountCents,status:"pending"});
        const checkout=await deps.adapter.createCheckout({reference,userId:userId(user),amountCents:plan.amountCents,currency:"BRL",description:"PulsoFit "+plan.title});
        const redirect=safeUrl(checkout.url);
        reply(res,201,{checkoutUrl:redirect,reference,status:"pending"});
        return true;
      }
      if(webhook&&req.method==="POST"){
        if(!providerReady(deps)||!adminReady(deps)){reply(res,503,{error:"Gateway indisponível"});return true;}
        const provider=path.slice("/api/billing/webhooks/".length);
        if(!/^[a-z][a-z0-9-]{1,40}$/.test(provider)){reply(res,400,{error:"Gateway inválido"});return true;}
        // O adaptador valida a assinatura EXATA do provedor, com o corpo bruto.
        const chunks=[];let n=0;for await (const c of req){n+=c.length;if(n>MAX_JSON){reply(res,413,{error:"Evento grande demais"});return true;}chunks.push(c);}
        const rawBody=Buffer.concat(chunks);
        const verification=await deps.adapter.verifyWebhook({provider,headers:req.headers,rawBody});
        if(!verification?.verified){reply(res,401,{error:"Assinatura de webhook inválida"});return true;}
        // Nunca usar um campo "paid" do webhook como prova. Consultar o pagamento no provedor.
        const payment=await deps.adapter.fetchVerifiedPayment(verification.externalPaymentId);
        if(payment?.status==="paid"&&payment?.reference){
          if(typeof deps.store?.activatePaymentOnce!=="function"){reply(res,503,{error:"Persistência de assinatura indisponível"});return true;}
          await deps.store.activatePaymentOnce({paymentId:String(payment.id),reference:payment.reference,amountCents:payment.amountCents,
            currency:payment.currency,status:payment.status,plans:BILLING_PLANS});
        }
        reply(res,200,{received:true});return true;
      }
      reply(res,405,{error:"Método não permitido"});return true;
    }catch(e){
      reply(res,e.status||500,{error:e.status&&e.status<500?e.message:"Não foi possível concluir a operação."});
      return true;
    }
  };
}
