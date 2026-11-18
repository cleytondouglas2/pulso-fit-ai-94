/**
 * Oferta de validação PIX: R$ 1,00 por 7 dias, contratação única,
 * disponível somente durante a janela de 24 horas definida pelo servidor.
 * É uma cobrança REAL, sem renovação automática. Não cria cobrança sozinho.
 * Pedidos criados enquanto ativa continuam sujeitos à conferência no banco.
 */
export const TEST_PLAN_CODE="teste7d";
export const TEST_PLAN=Object.freeze({title:"Teste de pagamento · 7 dias",amountCents:100,days:7});
export function testOfferState(env=process.env,now=Date.now()){
 const start=Date.parse(String(env.PULSO_TEST_PLAN_STARTS_AT||""));
 const end=Date.parse(String(env.PULSO_TEST_PLAN_EXPIRES_AT||""));
 const configured=Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end-start<=24*60*60*1000;
 return {code:TEST_PLAN_CODE,amountCents:100,durationDays:7,enabled:configured&&now>=start&&now<end,
  startsAt:configured?new Date(start).toISOString():null,
  expiresAt:configured?new Date(end).toISOString():null,
  reason:!configured?"not_configured":now<start?"not_started":now>=end?"expired":"active"};
}
export function availableBillingPlans(plans,env=process.env,now=Date.now()){
 const catalog=Object.fromEntries(Object.entries(plans).filter(([code])=>code!==TEST_PLAN_CODE));
 const offer=testOfferState(env,now);
 if(offer.enabled)catalog[TEST_PLAN_CODE]=TEST_PLAN;
 return catalog;
}
