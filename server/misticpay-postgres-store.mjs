/*
 * Store PostgreSQL para MisticPay / PulsoFit.
 * Requer pg.Pool persistente e autenticação de usuário do servidor original.
 * initialize:true cria tabelas isoladas, sem modificar contas legadas.
 */
const SQL=[
  "CREATE TABLE IF NOT EXISTS pf_billing_orders (reference UUID PRIMARY KEY, user_id TEXT NOT NULL, plan_code TEXT NOT NULL CHECK (plan_code IN ('quinzenal','mensal','teste7d')), amount_cents INTEGER NOT NULL CHECK(amount_cents>0), currency TEXT NOT NULL CHECK(currency='BRL'), provider_payment_id TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'PENDENTE', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  "DO $body$ BEGIN IF EXISTS(SELECT 1 FROM pg_constraint WHERE conname='pf_billing_orders_plan_code_check' AND conrelid='pf_billing_orders'::regclass) THEN ALTER TABLE pf_billing_orders DROP CONSTRAINT pf_billing_orders_plan_code_check; END IF; ALTER TABLE pf_billing_orders ADD CONSTRAINT pf_billing_orders_plan_code_check CHECK (plan_code IN ('quinzenal','mensal','teste7d')); END $body$",
  "ALTER TABLE pf_billing_orders ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'misticpay'",
  "CREATE INDEX IF NOT EXISTS pf_billing_orders_user_idx ON pf_billing_orders(user_id,created_at DESC)",
  "ALTER TABLE pf_billing_orders ADD COLUMN IF NOT EXISTS last_check_at TIMESTAMPTZ",
  "CREATE INDEX IF NOT EXISTS pf_billing_orders_reconcile_idx ON pf_billing_orders(status,last_check_at,created_at) WHERE provider_payment_id IS NOT NULL",
  "CREATE TABLE IF NOT EXISTS pf_billing_entitlements (user_id TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL DEFAULT '-infinity', blocked BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  "CREATE TABLE IF NOT EXISTS pf_billing_events (provider_payment_id TEXT NOT NULL, kind TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(provider_payment_id,kind))",
  "CREATE TABLE IF NOT EXISTS pf_billing_trials (user_id TEXT PRIMARY KEY, started_at TIMESTAMPTZ NOT NULL DEFAULT now())"
];
const CATALOG={quinzenal:{amount:1490,days:15},mensal:{amount:2490,days:30},teste7d:{amount:100,days:7}};
function rowToOrder(o){return o&&{reference:o.reference,userId:o.user_id,planCode:o.plan_code,amountCents:o.amount_cents,currency:o.currency,provider:o.provider||"misticpay",providerPaymentId:o.provider_payment_id,status:o.status};}
export async function createMisticPayPostgresStore(pool,{initialize=false}={}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")throw Error("Pool PostgreSQL necessário");
 if(initialize)for(const sql of SQL)await pool.query(sql);
 async function transaction(fn){
  const db=await pool.connect();
  try{await db.query("BEGIN");const v=await fn(db);await db.query("COMMIT");return v}
  catch(err){await db.query("ROLLBACK");throw err}finally{db.release()}
 }
 return {
  async createPendingCheckout(order){
   const p=CATALOG[order.planCode];
   if(!p||p.amount!==order.amountCents||order.currency!=="BRL"||!String(order.userId||""))throw Error("Pedido inválido");
   if(order.planCode==="teste7d"){
    const previous=await pool.query("SELECT status FROM pf_billing_orders WHERE user_id=$1 AND plan_code='teste7d' AND (status='COMPLETO' OR (status='PENDENTE' AND provider_payment_id IS NOT NULL AND created_at>now()-interval '48 hours')) LIMIT 1",[String(order.userId)]);
    if(previous.rowCount)throw Object.assign(Error(previous.rows[0].status==="COMPLETO"?
     "Seu Pix de teste já foi confirmado. Consulte a validade do seu plano.":
     "Já existe um Pix de R$ 1,00 nesta conta. Não gere outro: use 'Já paguei' para consultar o pagamento."),{status:409});
   }
   await pool.query("INSERT INTO pf_billing_orders(reference,user_id,plan_code,amount_cents,currency,provider) VALUES($1,$2,$3,$4,$5,$6)",
    [order.reference,String(order.userId),order.planCode,order.amountCents,order.currency,order.provider==="arguspay"?"arguspay":"misticpay"]);
  },
  async attachProviderPayment({reference,providerPaymentId}){
   if(!providerPaymentId)throw Error("Transação ausente");
   const result=await pool.query("UPDATE pf_billing_orders SET provider_payment_id=$2,updated_at=now() WHERE reference=$1 AND provider_payment_id IS NULL RETURNING reference",
    [reference,String(providerPaymentId)]);
   if(result.rowCount!==1)throw Error("Pedido não encontrado ou já registrado");
  },
  async getByProviderPaymentId(id){
   const r=await pool.query("SELECT * FROM pf_billing_orders WHERE provider_payment_id=$1",[String(id)]);return rowToOrder(r.rows[0]);
  },
  async getByReference(ref){
   const r=await pool.query("SELECT * FROM pf_billing_orders WHERE reference=$1",[String(ref)]);return rowToOrder(r.rows[0]);
  },
  async claimPendingForVerification(limit=10,provider="misticpay"){
   // Atomic reservation: concurrent app workers never claim the same order.
   // This only reads already-created charges; it never creates a new PIX.
   const count=Math.min(15,Math.max(1,Math.trunc(Number(limit)||10)));
   const r=await pool.query(`UPDATE pf_billing_orders AS orders
    SET last_check_at=now()
    WHERE orders.reference IN (
     SELECT reference FROM pf_billing_orders
     WHERE status='PENDENTE' AND provider=$2 AND provider_payment_id IS NOT NULL
      AND created_at>now()-interval '48 hours'
      AND (last_check_at IS NULL OR last_check_at<now()-interval '75 seconds')
     ORDER BY last_check_at ASC NULLS FIRST,created_at ASC
     LIMIT $1 FOR UPDATE SKIP LOCKED)
    RETURNING orders.*`,[count,provider]);
   return r.rows.map(rowToOrder);
  },
  async getLatestUserOrder(userId){
   // Recovery can only reveal an order owned by the signed-in user.
   const r=await pool.query("SELECT * FROM pf_billing_orders WHERE user_id=$1 AND provider_payment_id IS NOT NULL AND created_at > now()-interval '7 days' ORDER BY created_at DESC LIMIT 1",[String(userId)]);
   return rowToOrder(r.rows[0]);
  },
  async applyVerifiedEventOnce(evt){
   if(evt?.status!=="paid"||evt.currency!=="BRL"||CATALOG[evt.planCode]?.days!==evt.durationDays)throw Error("Pagamento inválido");
   return transaction(async(db)=>{
    const r=await db.query("SELECT * FROM pf_billing_orders WHERE reference=$1 FOR UPDATE",[evt.reference]);
    const o=r.rows[0];
    if(!o||o.user_id!==String(evt.userId)||o.provider_payment_id!==String(evt.providerPaymentId)||
       o.plan_code!==evt.planCode||o.amount_cents!==evt.amountCents||
       o.amount_cents!==CATALOG[evt.planCode].amount||o.currency!=="BRL"||
       ["DEVOLVIDO","DEVOLVIDO_PARCIAL"].includes(o.status))throw Error("Pagamento diverge do pedido");
    const once=await db.query("INSERT INTO pf_billing_events(provider_payment_id,kind) VALUES($1,'COMPLETO') ON CONFLICT DO NOTHING RETURNING provider_payment_id",[o.provider_payment_id]);
    if(!once.rowCount)return false;
    await db.query("INSERT INTO pf_billing_entitlements(user_id,expires_at,blocked) VALUES($1,now()+$2::integer*interval '1 day',false) ON CONFLICT(user_id) DO UPDATE SET expires_at=greatest(pf_billing_entitlements.expires_at,now())+$2::integer*interval '1 day',blocked=false,updated_at=now()",
     [o.user_id,evt.durationDays]);
    await db.query("UPDATE pf_billing_orders SET status='COMPLETO',updated_at=now() WHERE reference=$1",[o.reference]);
    // A UI legada consulta pf_users.plan: manter em sincronia com o entitlement validado.
    // O backend legado aceita planos pré-existentes; o acesso efetivo dura
    // exatamente os 7 dias do entitlement, não os 15 dias do nome legado.
    const legacyPlan=o.plan_code==="teste7d"?"quinzenal":o.plan_code;
    await db.query("UPDATE pf_users SET plan=$2,updated_at=now() WHERE id=$1",[o.user_id,legacyPlan]);
    return true;
   });
  },
  async applyVerifiedRefundOnce(evt){
   if(!["DEVOLVIDO","DEVOLVIDO_PARCIAL"].includes(evt.status))throw Error("Devolução inválida");
   return transaction(async(db)=>{
    const r=await db.query("SELECT * FROM pf_billing_orders WHERE reference=$1 FOR UPDATE",[evt.reference]),o=r.rows[0];
    if(!o||o.user_id!==String(evt.userId)||o.provider_payment_id!==String(evt.providerPaymentId))throw Error("Devolução não corresponde ao pedido");
    const once=await db.query("INSERT INTO pf_billing_events(provider_payment_id,kind) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING provider_payment_id",[o.provider_payment_id,evt.status]);
    if(!once.rowCount)return false;
    await db.query("UPDATE pf_billing_orders SET status=$2,updated_at=now() WHERE reference=$1",[o.reference,evt.status]);
    // Suspender acesso até auditoria evita manter benefício por pagamento estornado.
    await db.query("INSERT INTO pf_billing_entitlements(user_id,expires_at,blocked) VALUES($1,now(),true) ON CONFLICT(user_id) DO UPDATE SET blocked=true,updated_at=now()",[o.user_id]);
    await db.query("UPDATE pf_users SET plan='free',updated_at=now() WHERE id=$1 AND plan IN ('quinzenal','mensal')",[o.user_id]);
    return true;
   });
  },
  async revokeExpired(){
   // Mantém o catálogo de assinaturas do backend legado coerente com o vencimento real.
   const r=await pool.query("UPDATE pf_users u SET plan='free',updated_at=now() FROM pf_billing_entitlements e WHERE e.user_id=u.id::text AND (e.expires_at<=now() OR e.blocked=true) AND u.plan IN ('quinzenal','mensal')");
   return r.rowCount;
  },
  async firstTrialUse(userId){
   const r=await pool.query("INSERT INTO pf_billing_trials(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING started_at",[String(userId)]);
   return r.rows[0].started_at;
  },
  async getEntitlement(userId){
   const r=await pool.query("SELECT expires_at,blocked FROM pf_billing_entitlements WHERE user_id=$1",[String(userId)]);
   if(!r.rowCount)return {active:false,expiresAt:null,blocked:false};
   return {active:!r.rows[0].blocked&&new Date(r.rows[0].expires_at)>new Date(),expiresAt:r.rows[0].expires_at,blocked:r.rows[0].blocked};
  }
 };
}
