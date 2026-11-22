/**
 * One-time operator-authorized account role correction.
 * Activates only with two ephemeral environment values on the application
 * server. It never creates accounts or grants roles to future registrations.
 */
export async function applyOneTimeAdminGrant(pool,{logger=console}={}){
 const email=String(process.env.PULSO_ADMIN_GRANT_EMAIL_ONCE||"").trim().toLowerCase();
 const requestId=String(process.env.PULSO_ADMIN_GRANT_REQUEST_ONCE||"").trim();
 if(!email&&!requestId)return {status:"disabled"};
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||
    !/^admin-[a-z0-9-]{18,100}$/.test(requestId)){
  logger.warn("[pulso-admin] One-time grant skipped: missing or invalid authorization configuration");
  return {status:"invalid_configuration"};
 }
 if(!pool||typeof pool.connect!=="function")throw Error("Postgres connection required");
 const conn=await pool.connect();
 let tx=false;
 try{
  await conn.query("BEGIN");tx=true;
  const schema=await conn.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='pf_users' AND column_name IN ('id','email','role')");
  if(!["id","email","role"].every(col=>schema.rows.some(r=>r.column_name===col))){
   const all=await conn.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='pf_users'");
   const cols=all.rows.map(r=>r.column_name);
   const markers=["id","email","role","is_admin","admin","user_role","account_role","type","role_id","access_level","status"].map(name=>name+"="+cols.includes(name));
   logger.warn("[pulso-admin] User schema capability check: "+markers.join(" "));
   throw Error("User role schema missing");
  }
  // Existing-account-only: nothing is created or queued if the target is missing.
  const candidates=await conn.query(
   "SELECT id::text AS id, role::text AS role FROM pf_users WHERE lower(email)=lower($1) FOR UPDATE",
   [email]
  );
  if(candidates.rowCount!==1){
   await conn.query("ROLLBACK");tx=false;
   logger.warn("[pulso-admin] One-time grant not applied: target existing account count="+candidates.rowCount);
   return {status:"account_not_found_or_duplicate"};
  }
  const account=candidates.rows[0];
  if(!["user","admin"].includes(account.role)){
   throw Error("Unexpected current account role");
  }
  await conn.query("CREATE TABLE IF NOT EXISTS pf_admin_role_grant_audit (request_id text PRIMARY KEY, user_id uuid NOT NULL, previous_role text NOT NULL, resulting_role text NOT NULL, granted_at timestamptz NOT NULL DEFAULT now())");
  const done=await conn.query(
   "SELECT user_id::text AS user_id FROM pf_admin_role_grant_audit WHERE request_id=$1 FOR UPDATE",
   [requestId]);
  if(done.rowCount){
   if(done.rows[0].user_id!==account.id)throw Error("Grant request replay does not match target");
   await conn.query("COMMIT");tx=false;
   logger.log("[pulso-admin] One-time grant already applied; no changes made.");
   return {status:"already_processed"};
  }
  if(account.role==="user"){
   const updated=await conn.query(
    "UPDATE pf_users SET role='admin' WHERE id=$1::uuid AND role='user' RETURNING id",
    [account.id]);
   if(updated.rowCount!==1)throw Error("Account role changed during update");
  }
  await conn.query(
   "INSERT INTO pf_admin_role_grant_audit(request_id,user_id,previous_role,resulting_role) VALUES($1,$2::uuid,$3,'admin')",
   [requestId,account.id,account.role]);
  await conn.query("COMMIT");tx=false;
  logger.log("[pulso-admin] One-time existing-account administrator grant "+(account.role==="admin"?"already_admin":"applied")+
   "; audit recorded; no other accounts changed.");
  return {status:account.role==="admin"?"already_admin":"applied"};
 }catch(e){
  if(tx)await conn.query("ROLLBACK").catch(()=>{});
  const known=["User role schema missing","Unexpected current account role","Account role changed during update","Grant request replay does not match target"];
  const category=known.includes(e.message)?e.message.replaceAll(" ","_"):String(e.code||"unclassified_db_failure");
  logger.warn("[pulso-admin] One-time administrator grant failed category="+category.replace(/[^a-zA-Z0-9_]/g,"").slice(0,60));
  return {status:"failed"};
 }finally{conn.release();}
}
