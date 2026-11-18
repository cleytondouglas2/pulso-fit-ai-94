/**
 * PulsoFit AI — montagem explícita do gateway MisticPay no servidor existente.
 * NÃO é executado automaticamente apenas por existir no repositório.
 *
 * Uso no server.mjs:
 *
 * import { createPulsoBilling } from './server/mount-misticpay.mjs';
 * const billing = await createPulsoBilling({
 *   pool: existingPostgresPool,
 *   authenticate: existingAuthenticateRequest,
 *   origin: 'https://pulso-fit-ai-95-online.onrender.com'
 * });
 * // Execute no início do handler de HTTP:
 * if (await billing(req,res)) return;
 *
 * O servidor também deve aplicar a regra de trial/assinatura na API de
 * recursos premium; não basta esconder a página no navegador.
 */
import {createMisticPayAdapter} from "./misticpay-adapter.mjs";
import {createMisticPayBilling} from "./misticpay-billing.mjs";
import {createMisticPayPostgresStore} from "./misticpay-postgres-store.mjs";

export async function createPulsoBilling({pool,authenticate,origin}={}){
 if(typeof authenticate!=="function"||!pool||typeof pool.query!=="function")throw Error("Autenticação e Postgres existentes são necessários");
 const store=await createMisticPayPostgresStore(pool,{initialize:true});
 const gateway=createMisticPayAdapter();
 return createMisticPayBilling({store,gateway,authenticate,origin});
}
