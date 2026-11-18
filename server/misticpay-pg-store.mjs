/**
 * Implementação de persistência MisticPay para PostgreSQL durável.
 * Migração é EXPLÍCITA e não é realizada durante o build.
 * Banco free com validade limitada não pode ser usado para faturamento real.
 */
const PERIOD=Object.freeze({quinzenal:15,mensal:30});
const DDL=[
 "CREATE TABLE IF NOT EXISTS pf_billing_orders (reference uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES pf_users(id) ON DELETE RESTRICT,plan_code text NOT NULL CHECK(plan_code IN ('quinzenal','mensal')),amount_cents integer NOT NULL CHECK(amount_cents>0),currency text NOT NULL DEFAULT 'BRL',provider_payment_id text UNIQUE,state text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT now(),confirmed_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now())",
 "CREATE TABLE IF NOT EXISTS pf_billing_entitlements (user_id uuid PRIMARY KEY REFERENCES pf_users(id) ON DELETE RESTRICT,plan_code text NOT NULL,expires_at timestamptz NOT NULL,last_payment_id text,updated_at timestamptz NOT NULL DEFAULT now())",
 "CREATE TABLE IF NOT EXISTS pf_billing_events (provider_payment_id text NOT NULL,event_type text NOT NULL,processed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(provider_payment_id,event_type))",
 "CREATE TABLE IF NOT EXISTS pf_billing_trials (user_id uuid PRIMARY KEY REFERENCES pf_users(id) ON DELETE RESTRICT,started_at timestamptz NOT NULL DEFAULT now())"
];
async function transaction(pool,fn){
 const c=await pool.connect();try{await c.query("BEGIN");const r=await fn(c);await c.query("COMMIT");return r}
 catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}finally{c.release()}
}
export async function createMisticPayStore({connectionString,migrate=false}={}){
 if(!connectionString)throw Error("Postgres sem configuração");
 const pg=await import("pg");const Pool=pg.Pool||pg.default?.Pool;
 if(!Pool)throw Error("Driver PostgreSQL ausente");
 const pool=new Pool({connectionString,max:4,connectionTimeoutMillis:3500});
 try{
  await pool.query("SELECT id,plan FROM pf_users LIMIT 0");
  if(migrate){for(const sql of DDL)await pool.query(sql)}
  for(const table of ["pf_billing_orders","pf_billing_entitlements","pf_billing_events","pf_billing_trials"]){
   const r=await pool.query("SELECT to_regclass($1) AS tab",[table]);
   if(!r.rows[0].tab)throw Error("Migração pendente: "+table);
  }
 }catch(e){await pool.end().catch(()=>{});throw e}
 return {
  async createPendingCheckout({reference,userId,planCode,amountCents,currency}){
   if(!PERIOD[planCode]||currency!=="BRL"||!Number.isSafeInteger(amountCents)||amountCents<=0)throw Error("Pedido inválido");
   await pool.query("INSERT INTO pf_billing_orders(reference,user_id,plan_code,amount_cents,currency) VALUES($1,$2,$3,$4,$5)",[reference,userId,planCode,amountCents,currency]);
  },
  async attachProviderPayment({reference,providerPaymentId}){
   const r=await pool.query("UPDATE pf_billing_orders SET provider_payment_id=$2,updated_at=now() WHERE reference=$1 AND provider_payment_id IS NULL AND state='pending'",[reference,String(providerPaymentId)]);
   if(r.rowCount!==1)throw Error("Erro ao vincular pagamento");
  },
  async getByReference(ref){
   const r=await pool.query("SELECT reference::text,user_id::text AS \"userId\",plan_code AS \"planCode\",amount_cents AS \"amountCents\",provider_payment_id AS \"providerPaymentId\",state FROM pf_billing_orders WHERE reference=$1",[ref]);
   return r.rows[0]||null;
  },
  async getByProviderPaymentId(id){
   const r=await pool.query("SELECT reference::text,user_id::text AS \"userId\",plan_code AS \"planCode\",amount_cents AS \"amountCents\",provider_payment_id AS \"providerPaymentId\",state FROM pf_billing_orders WHERE provider_payment_id=$1",[String(id)]);
   return r.rows[0]||null;
  },
  async applyVerifiedEventOnce(event){
   return transaction(pool,async c=>{
    const r=await c.query("SELECT * FROM pf_billing_orders WHERE reference=$1 FOR UPDATE",[event.reference]);
    const order=r.rows[0];if(!order)throw Error("Pedido desconhecido");
    if(String(order.user_id)!==String(event.userId)||order.plan_code!==event.planCode||order.amount_cents!==event.amountCents||
       order.currency!=="BRL"||order.provider_payment_id!==event.providerPaymentId||
       event.status!=="paid"||event.durationDays!==PERIOD[order.plan_code])throw Error("Pagamento incompatível");
    if(order.state==="paid")return false;
    if(order.state!=="pending")throw Error("Pedido bloqueado");
    const e=await c.query("INSERT INTO pf_billing_events(provider_payment_id,event_type) VALUES($1,'paid') ON CONFLICT DO NOTHING RETURNING provider_payment_id",[order.provider_payment_id]);
    if(!e.rowCount)return false;
    await c.query("UPDATE pf_billing_orders SET state='paid',confirmed_at=now(),updated_at=now() WHERE reference=$1",[event.reference]);
    await c.query("INSERT INTO pf_billing_entitlements(user_id,plan_code,expires_at,last_payment_id) VALUES($1,$2,now()+($3::int*interval '1 day'),$4) ON CONFLICT(user_id) DO UPDATE SET plan_code=EXCLUDED.plan_code,expires_at=GREATEST(now(),pf_billing_entitlements.expires_at)+($3::int*interval '1 day'),last_payment_id=EXCLUDED.last_payment_id,updated_at=now()",[order.user_id,order.plan_code,PERIOD[order.plan_code],order.provider_payment_id]);
    await c.query("UPDATE pf_users SET plan=$2,updated_at=now() WHERE id=$1",[order.user_id,order.plan_code]);
    return true;
   });
  },
  async applyVerifiedRefundOnce(event){
   return transaction(pool,async c=>{
    const r=await c.query("SELECT * FROM pf_billing_orders WHERE reference=$1 FOR UPDATE",[event.reference]);
    const order=r.rows[0];
    if(!order||String(order.user_id)!==String(event.userId)||order.provider_payment_id!==event.providerPaymentId)throw Error("Estorno incompatível");
    const e=await c.query("INSERT INTO pf_billing_events(provider_payment_id,event_type) VALUES($1,'refunded') ON CONFLICT DO NOTHING RETURNING provider_payment_id",[order.provider_payment_id]);
    if(!e.rowCount)return false;
    await c.query("UPDATE pf_billing_orders SET state='review',updated_at=now() WHERE reference=$1",[event.reference]);
    await c.query("UPDATE pf_billing_entitlements SET expires_at=now(),updated_at=now() WHERE user_id=$1",[order.user_id]);
    await c.query("UPDATE pf_users SET plan='free',updated_at=now() WHERE id=$1 AND plan IN ('quinzenal','mensal')",[order.user_id]);
    return true;
   });
  },
  async revokeExpired(){
   const r=await pool.query("UPDATE pf_users u SET plan='free',updated_at=now() FROM pf_billing_entitlements e WHERE e.user_id=u.id AND e.expires_at<=now() AND u.plan IN ('quinzenal','mensal')");
   return r.rowCount;
  },
  async firstTrialUse(userId){
   const id=String(userId);
   await pool.query("INSERT INTO pf_billing_trials(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[id]);
   const r=await pool.query("SELECT started_at FROM pf_billing_trials WHERE user_id=$1",[id]);
   if(!r.rows[0])throw Error("Registro de período grátis indisponível");
   return r.rows[0].started_at;
  },
  async getEntitlement(userId){
   const r=await pool.query("SELECT plan_code AS \"planCode\",expires_at AS \"expiresAt\" FROM pf_billing_entitlements WHERE user_id=$1",[String(userId)]);
   const row=r.rows[0];
   return row?{...row,active:new Date(row.expiresAt)>new Date()}:{active:false,expiresAt:null,planCode:null};
  },
  close:()=>pool.end()
 };
}
