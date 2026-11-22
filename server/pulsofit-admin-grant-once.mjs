/**
 * Assigns a server-side admin identity to exactly one existing account.
 * The target is located by email only during an explicitly configured,
 * one-time operation; all later authorization uses the immutable user UUID.
 * No permanent password, email allowlist or public admin endpoint is created.
 */
export async function applyOneTimeAdminGrant(pool,{logger=console}={}){
 if(!pool||typeof pool.connect!=="function")throw Error("Postgres connection required");
 const email=String(process.env.PULSO_ADMIN_GRANT_EMAIL_ONCE||"").trim().toLowerCase();
 const requestId=String(process.env.PULSO_ADMIN_GRANT_REQUEST_ONCE||"").trim();
 let status="not_requested";
 try{
  // The FK means deleting an old account cannot grant access to a later sign-up.
  await pool.query("CREATE TABLE IF NOT EXISTS pf_admin_identities (user_id uuid PRIMARY KEY REFERENCES pf_users(id) ON DELETE CASCADE, granted_at timestamptz NOT NULL DEFAULT now(), active boolean NOT NULL DEFAULT true)");
  await pool.query("CREATE TABLE IF NOT EXISTS pf_admin_identity_audit (request_id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES pf_users(id), granted_at timestamptz NOT NULL DEFAULT now())");
  if(email||requestId){
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||
      !/^admin-[a-z0-9-]{18,100}$/.test(requestId)){
    status="invalid_configuration";
   }else{
    const db=await pool.connect();
    let inTransaction=false;
    try{
     await db.query("BEGIN");inTransaction=true;
     const found=await db.query("SELECT id::text AS id FROM pf_users WHERE lower(email)=lower($1) FOR UPDATE",[email]);
     if(found.rowCount!==1){
      status="existing_account_not_found_or_ambiguous";
      await db.query("ROLLBACK");inTransaction=false;
     }else{
      const userId=found.rows[0].id;
      const previous=await db.query("SELECT user_id::text AS user_id FROM pf_admin_identity_audit WHERE request_id=$1 FOR UPDATE",[requestId]);
      if(previous.rowCount){
       if(previous.rows[0].user_id!==userId)throw Error("Audit request does not match user");
       status="already_processed";
      }else{
       await db.query("INSERT INTO pf_admin_identities(user_id,active) VALUES($1::uuid,true) ON CONFLICT(user_id) DO UPDATE SET active=true",[userId]);
       await db.query("INSERT INTO pf_admin_identity_audit(request_id,user_id) VALUES($1,$2::uuid)",[requestId,userId]);
       status="applied";
      }
      await db.query("COMMIT");inTransaction=false;
     }
    }catch(error){
     if(inTransaction)await db.query("ROLLBACK").catch(()=>{});
     status="grant_failed";
     logger.warn("[pulso-admin] One-time grant transaction failed code="+String(error.code||"transaction").replace(/[^A-Za-z0-9_]/g,"").slice(0,32));
    }finally{db.release();}
   }
  }
  const active=await pool.query("SELECT user_id::text AS id FROM pf_admin_identities WHERE active=true");
  globalThis.__PULSO_ADMIN_IDS=new Set(active.rows.map(r=>String(r.id)));
  logger.log("[pulso-admin] Audited administrator identity store loaded: count="+active.rowCount+" grant="+status);
  return {status,loaded:active.rowCount};
 }catch(error){
  logger.warn("[pulso-admin] Admin identity store unavailable code="+String(error.code||"storage").replace(/[^A-Za-z0-9_]/g,"").slice(0,32));
  return {status:"storage_unavailable"};
 }
}
