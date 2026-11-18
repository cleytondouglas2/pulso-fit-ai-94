/**
 * PulsoFit: avoid stale HTML/JavaScript on Safari/iOS after hotfix deploys.
 * Only modifies caching headers for same-origin static frontend resources.
 * No request body, cookies, authentication or billing data is accessed.
 */
import {ServerResponse} from "node:http";
import {basename} from "node:path";

if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_FRONTEND_NOSTORE__){
 globalThis.__PULSO_FRONTEND_NOSTORE__=true;
 const oldWrite=ServerResponse.prototype.writeHead;
 const RELEASE="20261118-mobile-nav-repair";
 function isFrontend(req){
  if(!req||req.method!=="GET"&&req.method!=="HEAD")return false;
  try{
   const pathname=new URL(req.url,"http://localhost").pathname;
   return pathname==="/"||pathname==="/index.html"||
    (/^\/(?:assets|static|js|scripts)\/[\w./-]+\.m?js$/i.test(pathname))||
    (/^\/[\w.-]+\.m?js$/i.test(pathname)&&!pathname.startsWith("/api/"));
  }catch{return false}
 }
 ServerResponse.prototype.writeHead=function(statusCode,...args){
  if(isFrontend(this.req)&&!this.headersSent){
   const nocache="no-store, no-cache, max-age=0, must-revalidate";
   try{
    this.setHeader("Cache-Control",nocache);
    this.setHeader("Pragma","no-cache");
    this.setHeader("Expires","0");
    this.setHeader("X-Pulso-Frontend-Release",RELEASE);
    const idx=typeof args[0]==="string"?1:0;
    if(args[idx]){
     const headers=args[idx];
     if(Array.isArray(headers)){
      const omit=new Set(["cache-control","pragma","expires"]);
      const clean=[];
      for(let i=0;i<headers.length;i+=2)
       if(!omit.has(String(headers[i]).toLowerCase()))clean.push(headers[i],headers[i+1]);
      clean.push("Cache-Control",nocache,"Pragma","no-cache","Expires","0");
      args[idx]=clean;
     }else if(typeof headers==="object"){
      const updated={};
      for(const [key,val] of Object.entries(headers))
       if(!["cache-control","pragma","expires"].includes(key.toLowerCase()))updated[key]=val;
      updated["Cache-Control"]=nocache;
      updated.Pragma="no-cache";
      updated.Expires="0";
      args[idx]=updated;
     }
    }
   }catch(e){console.warn("[pulso-cache] Could not set static no-store headers.")}
  }
  return oldWrite.call(this,statusCode,...args);
 };
 console.log("[pulso-cache] Safari static HTML/JS cache bypass installed release="+RELEASE);
}
