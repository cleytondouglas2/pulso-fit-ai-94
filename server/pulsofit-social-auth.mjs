/**
 * PulsoFit official Google / Apple identity integration.
 * Verifies provider ID tokens with issuer JWKS. Exchanges an Apple authorization code
 * with Apple before trusting the ID token. Creates an isolated native account per
 * (provider, immutable subject), never links to an existing password account by email.
 * Credentials are read only from protected Render environment variables.
 */
import {basename} from "node:path";
import {Server} from "node:http";
import {createHash,createHmac,createPublicKey,verify,sign,randomBytes,timingSafeEqual} from "node:crypto";

export function socialOptions(env=process.env) {
 const secret=String(env.PULSO_SOCIAL_AUTH_SECRET||"");
 const googleId=String(env.PULSO_GOOGLE_OAUTH_CLIENT_ID||"").trim();
 const appleId=String(env.PULSO_APPLE_SERVICES_ID||"").trim();
 const publicOrigin="https://pulso-fit-ai-95-online.onrender.com";
 const returnURI=publicOrigin+"/api/auth/social/apple/callback";
 const googleEnabled=secret.length>=32&&/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(googleId);
 const appleEnabled=secret.length>=32&&/^[A-Za-z0-9.-]{6,200}$/.test(appleId)&&
   /^[A-Z0-9]{10}$/.test(String(env.PULSO_APPLE_TEAM_ID||""))&&
   /^[A-Z0-9]{10}$/.test(String(env.PULSO_APPLE_KEY_ID||""))&&
   String(env.PULSO_APPLE_PRIVATE_KEY||"").includes("BEGIN PRIVATE KEY");
 return {secret,googleId,appleId,googleEnabled,appleEnabled,publicOrigin,returnURI};
}
const options=socialOptions();
export function providerAlias(provider,sub,secret=options.secret){
 if(!/^(google|apple)$/.test(provider)||typeof sub!=="string"||!sub||sub.length>300||secret.length<32)
  throw Error("Identidade não configurada.");
 const digest=(purpose)=>createHmac("sha256",secret).update("pulsofit.social.v1:"+purpose+":"+provider+":"+sub).digest("hex");
 return {email:"pf-"+digest("email").slice(0,40)+"@users.pulsofit.invalid",
  password:"Pf!9"+digest("password")+"aA"};
}
export function checkJWTClaims(payload,provider,audience,nonce,now=Math.floor(Date.now()/1000)){
 if(!payload||typeof payload!=="object"||!nonce||typeof audience!=="string")throw Error("Identidade inválida.");
 const issuer=provider==="google"?["https://accounts.google.com","accounts.google.com"]:["https://appleid.apple.com"];
 const aud=payload.aud;
 const correctAud=typeof aud==="string"?aud===audience:Array.isArray(aud)&&aud.includes(audience)&&payload.azp===audience;
 const nonceHash=createHash("sha256").update(nonce).digest("hex");
 if(!issuer.includes(payload.iss)||!correctAud||typeof payload.sub!=="string"||
  payload.sub.length<1||payload.sub.length>300||!Number.isFinite(payload.exp)||
  payload.exp<=now||!Number.isFinite(payload.iat)||payload.iat>now+60||
  payload.iat<now-86400||![nonce,nonceHash].includes(payload.nonce)||
  payload.email_verified===false||payload.email_verified==="false")
  throw Error("Token de identidade inválido ou expirado.");
 return {sub:payload.sub,name:typeof payload.name==="string"?payload.name.slice(0,80):"",email:typeof payload.email==="string"?payload.email.slice(0,250):""};
}
const b64=(bytes)=>Buffer.from(bytes).toString("base64url");
const hmac=(v)=>b64(createHmac("sha256",options.secret).update(v).digest());
function fail(status,message){return Object.assign(Error(message),{status})}
function safeEqual(a,b){
 const x=Buffer.from(String(a)),y=Buffer.from(String(b));
 return x.length===y.length&&timingSafeEqual(x,y);
}
function respond(res,status,data,extra={}){
 if(res.writableEnded)return;
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff","Vary":"Origin",...extra});
 res.end(JSON.stringify(data));
}
function parseCookie(req){
 const c=String(req.headers.cookie||"").split(";").map(s=>s.trim()).find(s=>s.startsWith("PF_SOCIAL_CHALLENGE="));
 if(!c)throw fail(403,"Solicite uma nova autenticação.");
 const parts=c.slice("PF_SOCIAL_CHALLENGE=".length).split(".");
 if(parts.length!==3||!/^[A-Za-z0-9_-]{22,70}$/.test(parts[0])||
  !/^\d{13}$/.test(parts[1])||!safeEqual(hmac(parts[0]+"."+parts[1]),parts[2])||
  Math.abs(Date.now()-Number(parts[1]))>10*60*1000)throw fail(403,"Sua autenticação expirou. Tente novamente.");
 return parts[0];
}
function readBody(req,max=14000){
 return new Promise((resolve,reject)=>{
  const chunks=[];let n=0;
  req.on("data",part=>{n+=part.length;if(n>max){reject(fail(413,"Resposta de login grande demais."));req.destroy();return}chunks.push(part)});
  req.on("end",()=>{
   if(String(req.headers["content-type"]||"").split(";")[0].trim()!=="application/json")return reject(fail(415,"Formato JSON necessário."));
   try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")))}catch{reject(fail(400,"Solicitação inválida."))}
  });
  req.on("error",reject);
 });
}
const cachedKeys=new Map();
async function keyFor(provider,kid){
 const url=provider==="google"?"https://www.googleapis.com/oauth2/v3/certs":"https://appleid.apple.com/auth/keys";
 let entry=cachedKeys.get(provider);
 if(!entry||Date.now()>entry.expires){
  const r=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(7500)});
  if(!r.ok)throw fail(503,"Não foi possível validar a identidade com o provedor.");
  const set=await r.json();
  if(!Array.isArray(set.keys)||set.keys.length>25)throw fail(503,"Chaves do provedor inválidas.");
  entry={keys:set.keys,expires:Date.now()+15*60*1000};cachedKeys.set(provider,entry);
 }
 return entry.keys.find(k=>k.kid===kid&&k.kty==="RSA"&&k.use==="sig");
}
export async function verifyIdentity(token,provider,nonce){
 if(typeof token!=="string"||token.length<100||token.length>12000)throw fail(401,"Resposta do provedor inválida.");
 const parts=token.split(".");
 if(parts.length!==3)throw fail(401,"Token incompleto.");
 let header,payload;
 try{header=JSON.parse(Buffer.from(parts[0],"base64url"));payload=JSON.parse(Buffer.from(parts[1],"base64url"))}catch{throw fail(401,"Token malformado.")}
 if(header.alg!=="RS256"||typeof header.kid!=="string"||header.kid.length>200)throw fail(401,"Assinatura não suportada.");
 const jwk=await keyFor(provider,header.kid);
 if(!jwk)throw fail(401,"Chave de assinatura desconhecida.");
 let valid=false;
 try{valid=verify("RSA-SHA256",Buffer.from(parts[0]+"."+parts[1]),createPublicKey({key:jwk,format:"jwk"}),Buffer.from(parts[2],"base64url"))}catch{}
 if(!valid)throw fail(401,"Assinatura do provedor inválida.");
 try{return checkJWTClaims(payload,provider,provider==="google"?options.googleId:options.appleId,nonce)}
 catch{throw fail(401,"Identidade expirada ou destinada a outro aplicativo.")}
}
function appleClientSecret(){
 const now=Math.floor(Date.now()/1000);
 const header=b64(JSON.stringify({alg:"ES256",kid:process.env.PULSO_APPLE_KEY_ID,typ:"JWT"}));
 const claim=b64(JSON.stringify({iss:process.env.PULSO_APPLE_TEAM_ID,iat:now,exp:now+300,sub:options.appleId,aud:"https://appleid.apple.com"}));
 const data=header+"."+claim;
 const privateKey=String(process.env.PULSO_APPLE_PRIVATE_KEY||"").replace(/\\n/g,"\n");
 return data+"."+b64(sign("sha256",Buffer.from(data),{key:privateKey,dsaEncoding:"ieee-p1363"}));
}
async function exchangeAppleCode(code){
 if(typeof code!=="string"||!code||code.length>3000)throw fail(400,"Código Apple ausente.");
 const body=new URLSearchParams({client_id:options.appleId,client_secret:appleClientSecret(),
  grant_type:"authorization_code",code:code,redirect_uri:options.returnURI});
 const r=await fetch("https://appleid.apple.com/auth/token",{method:"POST",
  headers:{"Content-Type":"application/x-www-form-urlencoded"},body,
  redirect:"error",signal:AbortSignal.timeout(10000)});
 const result=await r.json().catch(()=>({}));
 if(!r.ok||!result.id_token)throw fail(401,"Não foi possível validar o código com a Apple.");
 return result.id_token;
}
async function nativeRequest(path,body,token){
 const port=Number(process.env.PORT||10000);
 const r=await fetch("http://127.0.0.1:"+port+path,{method:body?"POST":"GET",
  headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(8000)});
 return {ok:r.ok,status:r.status,data:await r.json().catch(()=>({}))};
}
async function nativeSession(provider,subject,displayName){
 const alias=providerAlias(provider,subject);
 let login=await nativeRequest("/api/auth/login",alias);
 if(!login.ok&&[400,401,404].includes(login.status)){
  const name=String(displayName||("Conta "+(provider==="google"?"Google":"Apple"))).trim().slice(0,80);
  const created=await nativeRequest("/api/auth/register",{email:alias.email,password:alias.password,name});
  if(!created.ok&&![400,409].includes(created.status))throw fail(503,"Não foi possível criar a conta vinculada ao provedor.");
  login=created.ok&&typeof created.data.token==="string"?created:await nativeRequest("/api/auth/login",alias);
 }
 if(!login.ok||typeof login.data.token!=="string"||login.data.token.length<20)
  throw fail(503,"O login oficial foi validado, mas não foi possível abrir a sessão do PulsoFit.");
 const me=await nativeRequest("/api/me",null,login.data.token);
 if(!me.ok||!me.data?.user?.id)throw fail(503,"Não foi possível confirmar a conta no aplicativo.");
 return {token:login.data.token,provider,user:me.data.user};
}
function safeReturnHTML(res,post){
 const data=JSON.stringify(post).replace(/</g,"\\u003c").replace(/>/g,"\\u003e");
 const nonce=b64(randomBytes(16));
 res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store",
  "Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; script-src 'nonce-"+nonce+"'; base-uri 'none'; form-action 'none'","X-Content-Type-Options":"nosniff"});
 res.end("<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>Apple – PulsoFit</title><body><p>Concluindo autenticação...</p><script nonce=\""+nonce+"\">if(window.opener){window.opener.postMessage("+data+","+JSON.stringify(options.publicOrigin)+");window.close()}else{document.body.textContent='Volte ao PulsoFit para concluir o login.'}</script></body></html>");
}
if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_SOCIAL_IDENTITY__){
 globalThis.__PULSO_SOCIAL_IDENTITY__=true;
 const originalEmit=Server.prototype.emit;
 Server.prototype.emit=function(event,...args){
  if(event==="request"&&args.length>1){
   const req=args[0],res=args[1];
   let path="";try{path=new URL(req.url,"http://localhost").pathname}catch{}
   if(path.startsWith("/api/auth/social/")){
    void (async()=>{
     if(path==="/api/auth/social/config"&&req.method==="GET"){
      return respond(res,200,{googleEnabled:options.googleEnabled,appleEnabled:options.appleEnabled,
       googleClientId:options.googleEnabled?options.googleId:null,
       appleClientId:options.appleEnabled?options.appleId:null,
       appleRedirectURI:options.appleEnabled?options.returnURI:null});
     }
     if(!options.googleEnabled&&!options.appleEnabled)throw fail(503,"Login social ainda não configurado com credenciais oficiais.");
     if(path==="/api/auth/social/challenge"&&req.method==="GET"){
      const nonce=b64(randomBytes(24)),timestamp=String(Date.now());
      const cookie=nonce+"."+timestamp+"."+hmac(nonce+"."+timestamp);
      return respond(res,200,{nonce,state:nonce},{ "Set-Cookie":"PF_SOCIAL_CHALLENGE="+cookie+"; Secure; HttpOnly; SameSite=Lax; Path=/api/auth/social; Max-Age=600"});
     }
     if(path==="/api/auth/social/apple/callback"&&req.method==="POST"){
      const chunks=[];let total=0;
      for await(const piece of req){total+=piece.length;if(total>14000)throw fail(413,"Resposta inválida.");chunks.push(piece)}
      const fields=new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      return safeReturnHTML(res,{type:"pulso-apple-oauth-return",
       code:String(fields.get("code")||"").slice(0,3000),state:String(fields.get("state")||"").slice(0,200),
       error:String(fields.get("error")||"").slice(0,200)});
     }
     if(!["/api/auth/social/google","/api/auth/social/apple"].includes(path)||req.method!=="POST")
      throw fail(404,"Rota de autenticação não encontrada.");
     if(req.headers.origin!==options.publicOrigin)throw fail(403,"Origem não autorizada.");
     const provider=path.endsWith("google")?"google":"apple";
     if(!(provider==="google"?options.googleEnabled:options.appleEnabled))throw fail(503,"Provedor ainda não configurado.");
     const nonce=parseCookie(req),body=await readBody(req);
     const idToken=provider==="google"?body.idToken:await exchangeAppleCode(body.code);
     if(provider==="apple"&&body.state!==nonce)throw fail(403,"Verificação de sessão Apple inválida.");
     const identity=await verifyIdentity(idToken,provider,nonce);
     const session=await nativeSession(provider,identity.sub,identity.name);
     return respond(res,200,session,{"Set-Cookie":"PF_SOCIAL_CHALLENGE=; Secure; HttpOnly; SameSite=Lax; Path=/api/auth/social; Max-Age=0"});
    })().catch(err=>{
     if(!res.headersSent)respond(res,[400,401,403,404,413,415,503].includes(err.status)?err.status:503,{error:err.status?err.message:"Falha temporária na autenticação oficial."});
     else if(!res.writableEnded)res.end();
    });
    return true;
   }
  }
  return originalEmit.call(this,event,...args);
 };
 console.log("[pulso-social] Provider configuration Google="+options.googleEnabled+" Apple="+options.appleEnabled+"; JWT verification enabled, no third-party identity accepted without verification.");
}