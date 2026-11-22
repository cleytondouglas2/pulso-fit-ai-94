/**
 * Standalone, bookmarkable PulsoFit admin payments route.
 * UI is public code; every credential operation is protected by the
 * authenticated admin API in misticpay-runtime.mjs.
 */
import {Server} from "node:http";
import {basename} from "node:path";
import {readFileSync} from "node:fs";
const PREFIX="/admin/pagamentos";
if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_ARGUS_STANDALONE__){
 globalThis.__PULSO_ARGUS_STANDALONE__=true;
 const script=readFileSync(new URL("./pulsofit-argus-admin-ui.js",import.meta.url),"utf8");
 const page=String.raw`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow">
<meta http-equiv="Cache-Control" content="no-store">
<title>API de pagamentos — PulsoFit AI</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100dvh;background:radial-gradient(ellipse at top right,#184438,#0b1122 65%);color:#f1fffc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.pf-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px clamp(16px,4vw,40px);border-bottom:1px solid #355659;background:#0c192bd9}
.pf-bar b{font-size:18px;letter-spacing:.035em;color:#b7ffd9}.pf-bar a{color:#d9fff0;text-decoration:none;border:1px solid #598c79;border-radius:11px;padding:9px 13px;font-weight:650;font-size:13px}
#app{width:100%;padding:6px clamp(12px,3vw,28px)}#app .main{max-width:1080px;margin:auto}
#gate{width:min(610px,calc(100% - 26px));margin:9vh auto;padding:clamp(22px,4vw,36px);border:1px solid #507a7a;border-radius:20px;background:#122638;box-shadow:0 16px 45px #0004}
#gate h1{font-size:clamp(23px,5vw,31px)}#gate p{line-height:1.6;color:#d4e3e4}#gate a{display:inline-block;color:#11271f;background:#9af3c4;padding:12px 16px;border-radius:12px;text-decoration:none;font-weight:750}
.pf-argus-panel{display:block}.sidebar{display:none}
</style></head>
<body><header class="pf-bar"><b>PULSOFIT AI / ADMIN</b><a href="/#/admin">Voltar ao painel</a></header>
<div id="gate"><h1>Integração de pagamentos</h1><p id="gate-message">Verificando sua sessão de administrador…</p><a href="/#/admin">Entrar no PulsoFit</a></div>
<div id="app"><main class="main"></main></div>
<script>
(function(){
 "use strict";
 function token(){
  try{
   var t=sessionStorage.getItem("pulso-fit-token")||"";if(t)return t;
   var r=JSON.parse(localStorage.getItem("pulsofit-session-remember-v1")||"null");
   if(!r||typeof r.token!=="string"||!r.createdAt||!r.expiresAt||
       r.expiresAt<Date.now()||r.createdAt>Date.now()+60000||
       Date.now()-r.createdAt>30*86400000)return "";
   sessionStorage.setItem("pulso-fit-token",r.token);return r.token;
  }catch(e){return ""}
 }
 var t=token(),gate=document.getElementById("gate"),msg=document.getElementById("gate-message");
 if(!t){msg.textContent="Entre com sua conta de administrador no PulsoFit. Depois abra novamente este endereço.";return;}
 fetch("/api/me",{headers:{Authorization:"Bearer "+t},cache:"no-store",redirect:"error"})
 .then(function(r){if(!r.ok)throw Error("Sessão inválida");return r.json()})
 .then(function(data){
  if(data?.user?.role!=="admin"){msg.textContent="Esta tela é exclusiva do administrador do PulsoFit.";return;}
  gate.remove();
  location.hash="#/admin";
  var script=document.createElement("script");script.src="/admin/pagamentos/ui.js";script.defer=true;
  document.body.appendChild(script);
 })
 .catch(function(){msg.textContent="Não foi possível validar sua sessão. Entre no PulsoFit novamente para acessar a configuração.";});
})();
</script></body></html>`;
 const original=Server.prototype.emit;
 Server.prototype.emit=function(event,...args){
  if(event==="request"&&args.length>=2){
   const req=args[0],res=args[1];
   let path="";
   try{path=new URL(req.url,"http://localhost").pathname}catch{}
   if(path===PREFIX||path===PREFIX+"/"){
    if(req.method!=="GET"){res.writeHead(405,{"Allow":"GET"});res.end();return true;}
    res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Content-Security-Policy":"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'","Referrer-Policy":"no-referrer"});
    res.end(page);return true;
   }
   if(path===PREFIX+"/ui.js"){
    if(req.method!=="GET"){res.writeHead(405,{"Allow":"GET"});res.end();return true;}
    res.writeHead(200,{"Content-Type":"application/javascript; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});
    res.end(script);return true;
   }
  }
  return original.call(this,event,...args);
 };
 console.log("[pulso-billing] Admin payments standalone page route mounted.");
}
