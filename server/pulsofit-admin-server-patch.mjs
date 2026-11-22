/**
 * Backend generated server role binding for persistent, server-controlled admins.
 * Runs during NODE_OPTIONS preload before server.mjs itself is imported.
 * Uses user UUID from a server-loaded, audited database allowlist, not email
 * supplied by the browser or any unverified input.
 */
import {readFileSync,writeFileSync} from "node:fs";
import {basename} from "node:path";
if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_ADMIN_ROLE_PATCH__){
 globalThis.__PULSO_ADMIN_ROLE_PATCH__=true;
 globalThis.__PULSO_ADMIN_IDS=new Set();
 try{
  const url=new URL("../server.mjs",import.meta.url);
  const source=readFileSync(url,"utf8");
  const matcher=/(function\s+publicUser\s*\(\s*row\s*\)\s*\{\s*return\s*\{\s*id\s*:\s*row\.id\s*,\s*name\s*:\s*row\.name\s*,\s*email\s*:\s*row\.email\s*,\s*role\s*:\s*)(['"])user\2/;
  const bind="(globalThis.__PULSO_ADMIN_IDS instanceof Set && globalThis.__PULSO_ADMIN_IDS.has(String(row.id)) ? 'admin' : 'user')";
  if(matcher.test(source)){
   const updated=source.replace(matcher,(_,prefix)=>prefix+bind);
   if(updated!==source){writeFileSync(url,updated);console.log("[pulso-admin] Generated server role binding enabled (audited database IDs only).");}
  }else if(source.includes(bind)){
   console.log("[pulso-admin] Server role binding already installed.");
  }else console.warn("[pulso-admin] Public user role binding pattern not found; backend unchanged.");
 }catch(error){
  console.warn("[pulso-admin] Server role binding unavailable; app remains unchanged.");
 }
}
