/**
 * PulsoFit billing credentials: encrypted Postgres storage, AES-256-GCM.
 * No secret leaves this module in JSON or logs. Environment variables are
 * only a fallback until the first authenticated admin rotation.
 */
import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {isArgusCredentialPair} from "./arguspay-adapter.mjs";
const KEY_ENV="PULSO_BILLING_MASTER_KEY";
export function createArgusPayCredentialStore(pool){
 const raw=String(process.env[KEY_ENV]||"");
 const key=/^[0-9a-f]{64}$/i.test(raw)?Buffer.from(raw,"hex"):null;
 const fallback=()=>({key:process.env.ARGUS_API_KEY||"",secret:process.env.ARGUS_API_SECRET||""});
 function enc(value){
  if(!key)throw Error("Master key unavailable");
  const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,nonce);
  const data=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return Buffer.concat([nonce,cipher.getAuthTag(),data]).toString("base64");
 }
 function dec(value){
  if(!key)throw Error("Master key unavailable");
  const b=Buffer.from(value,"base64");
  if(b.length<29)throw Error("Encrypted secret unavailable");
  const decipher=createDecipheriv("aes-256-gcm",key,b.subarray(0,12));
  decipher.setAuthTag(b.subarray(12,28));
  return Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]).toString("utf8");
 }
 async function init(){
  if(!pool||typeof pool.query!=="function")throw Error("Billing database unavailable");
  await pool.query("CREATE TABLE IF NOT EXISTS pf_billing_gateway_config (provider TEXT PRIMARY KEY, api_key_ciphertext TEXT NOT NULL, api_secret_ciphertext TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  await pool.query("CREATE TABLE IF NOT EXISTS pf_billing_gateway_audit (id BIGSERIAL PRIMARY KEY, provider TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), key_tail VARCHAR(4) NOT NULL)");
 }
 async function load(){
  const rows=await pool.query("SELECT api_key_ciphertext,api_secret_ciphertext,updated_at FROM pf_billing_gateway_config WHERE provider='arguspay'");
  if(!rows.rowCount)return {...fallback(),source:"environment",updatedAt:null};
  const data=rows.rows[0],value={key:dec(data.api_key_ciphertext),secret:dec(data.api_secret_ciphertext)};
  if(!isArgusCredentialPair(value))throw Error("Stored credential format invalid");
  return {...value,source:"database",updatedAt:data.updated_at};
 }
 async function save(candidate,adminId){
  if(!key)throw Error("Secure key management not configured");
  if(!isArgusCredentialPair(candidate))throw Error("Invalid credential format");
  if(!/^[a-f0-9-]{36}$/i.test(String(adminId||"")))throw Error("Authenticated admin required");
  const encryptedKey=enc(candidate.key),encryptedSecret=enc(candidate.secret);
  const db=await pool.connect();
  try{
   await db.query("BEGIN");
   await db.query("INSERT INTO pf_billing_gateway_config(provider,api_key_ciphertext,api_secret_ciphertext,updated_by,updated_at) VALUES('arguspay',$1,$2,$3,now()) ON CONFLICT(provider) DO UPDATE SET api_key_ciphertext=EXCLUDED.api_key_ciphertext,api_secret_ciphertext=EXCLUDED.api_secret_ciphertext,updated_by=EXCLUDED.updated_by,updated_at=now()",[encryptedKey,encryptedSecret,adminId]);
   await db.query("INSERT INTO pf_billing_gateway_audit(provider,updated_by,key_tail) VALUES('arguspay',$1,$2)",[adminId,candidate.key.slice(-4)]);
   await db.query("COMMIT");
  }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e;}
  finally{db.release();}
 }
 return {init,load,save,secureStorageReady:!!key};
}
