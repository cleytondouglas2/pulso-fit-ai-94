/**
 * PulsoFit AI — contrato de integração com gateway (Node.js ESM).
 * Não é executado até ser importado pelo servidor principal.
 * Um provedor concreto deve implementar gateway.createHostedCheckout() e
 * gateway.verifyWebhook() com a documentação e assinatura específicas.
 * Não utilize sucesso do navegador para conceder assinatura.
 *
 * Integração do host:
 *   const billing = createBillingHandler({authenticate, gateway, store, origin});
 *   if (await billing(req,res)) return;
 *
 * Funções obrigatórias:
 *   authenticate(req) => {id,role} | null  (validar token no servidor)
 *   gateway.createHostedCheckout({reference,amountCents,currency,method,
 *     successUrl,cancelUrl,userId,planCode}) => {url, providerPaymentId}
 *   gateway.verifyWebhook({rawBody,headers}) => normalized event | null
 *   store.recordCheckout({id,userId,planCode,amountCents,providerPaymentId})
 *   store.applyVerifiedEventOnce(event, lookup) => bool
 *
 * O store deve ser transacional/persistente. Confirmar evento único, valor,
 * moeda, comprador e referência do pedido ANTES de renovar assinatura.
 */
import { randomUUID } from 'node:crypto';
const PLANS = Object.freeze({
  quinzenal: Object.freeze({days:15, amountCents:1490}),
  mensal: Object.freeze({days:30, amountCents:2490})
});
const METHODS = new Set(['pix','card']);
function json(res,status,value){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(value));
}
async function readJson(req,max=16384){
  const data=await readRaw(req,max);
  try{return JSON.parse(data.toString('utf8'))}catch{throw Object.assign(Error('JSON inválido'),{status:400})}
}
async function readRaw(req,max=1024*1024){
  let size=0;const chunks=[];
  for await(const c of req){size+=c.length;if(size>max)throw Object.assign(Error('Payload muito grande'),{status:413});chunks.push(c);}
  return Buffer.concat(chunks);
}
export function createBillingHandler({authenticate, gateway, store, origin}){
  if(typeof authenticate!=='function')throw Error('authenticate obrigatório');
  if(!store||typeof store.recordCheckout!=='function'||typeof store.applyVerifiedEventOnce!=='function')throw Error('store transacional obrigatório');
  if(typeof origin!=='string'||!/^https:\/\//.test(origin))throw Error('origin HTTPS obrigatório');
  const ready=()=>Boolean(gateway&&typeof gateway.createHostedCheckout==='function'&&typeof gateway.verifyWebhook==='function'&&process.env.PULSO_GATEWAY_API_KEY&&process.env.PULSO_GATEWAY_WEBHOOK_SECRET&&process.env.PULSO_GATEWAY_PROVIDER);
  return async function handleBilling(req,res){
    const pathname=new URL(req.url,origin).pathname;
    if(!pathname.startsWith('/api/billing/')&&!pathname.startsWith('/api/admin/billing/'))return false;
    try{
      if(pathname==='/api/billing/config'&&req.method==='GET'){
        json(res,200,{ready:ready(),provider:ready()?process.env.PULSO_GATEWAY_PROVIDER:null,plans:PLANS});
        return true;
      }
      if(pathname==='/api/admin/billing/config'&&req.method==='GET'){
        const user=await authenticate(req);
        if(user?.role!=='admin'){json(res,403,{error:'Acesso restrito'});return true;}
        // Credenciais reais ficam no ambiente protegido do Render.
        json(res,200,{readyForSecureWrite:false,configured:ready(),provider:process.env.PULSO_GATEWAY_PROVIDER||null,
          webhookUrl:origin+'/api/billing/webhook'});
        return true;
      }
      if(pathname==='/api/admin/billing/config'&&req.method==='PUT'){
        json(res,409,{error:'Configure as credenciais nas variáveis de ambiente do Render. Nunca no navegador.'});
        return true;
      }
      if(pathname==='/api/billing/checkout'&&req.method==='POST'){
        const user=await authenticate(req);
        if(!user?.id){json(res,401,{error:'Entre na sua conta para assinar'});return true;}
        if(!ready()){json(res,503,{error:'Gateway ainda não configurado'});return true;}
        const body=await readJson(req);
        const planCode=String(body.planCode||'');
        const plan=PLANS[planCode];
        const method=String(body.paymentMethod||'');
        if(!plan||!METHODS.has(method)){json(res,400,{error:'Plano ou modalidade inválida'});return true;}
        const reference=randomUUID();
        const checkout=await gateway.createHostedCheckout({
          reference,amountCents:plan.amountCents,currency:'BRL',method,
          successUrl:origin+'/#/account',cancelUrl:origin+'/#/subscription',
          userId:user.id,planCode
        });
        if(!checkout||typeof checkout.url!=='string'||!checkout.url.startsWith('https://'))throw Error('URL do gateway inválida');
        await store.recordCheckout({
          id:reference,userId:user.id,planCode,
          amountCents:plan.amountCents,providerPaymentId:checkout.providerPaymentId
        });
        json(res,201,{checkoutUrl:checkout.url});
        return true;
      }
      if(pathname==='/api/billing/webhook'&&req.method==='POST'){
        if(!ready()){json(res,503,{error:'Webhook ainda não configurado'});return true;}
        const rawBody=await readRaw(req);
        // O adaptador deve verificar assinatura, timestamp/replay e origem do evento
        // conforme documentação do gateway. Nunca confiar em "paid" sem assinatura.
        const event=await gateway.verifyWebhook({rawBody,headers:req.headers});
        if(!event||!event.id||!event.paymentId){
          json(res,401,{error:'Webhook sem assinatura válida'});return true;
        }
        // A operação deve ser idempotente e revalidar estado com o provedor.
        await store.applyVerifiedEventOnce(event,PLANS);
        json(res,200,{received:true});
        return true;
      }
      json(res,404,{error:'Endpoint de pagamento não encontrado'});
    }catch(e){
      json(res,Number(e.status)||500,{error:Number(e.status)<500?e.message:'Não foi possível concluir a operação'});
    }
    return true;
  };
}
