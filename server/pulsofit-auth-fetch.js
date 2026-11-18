/* PulsoFit 2026 — attach an authenticated session to same-origin APIs.
 * The original Coach/meal UI predates mandatory login and may omit a Bearer
 * header; only local /api/ requests receive this token.
 */
(function(){
 "use strict";
 if(window.__PULSO_AUTH_FETCH_BRIDGE__)return;
 window.__PULSO_AUTH_FETCH_BRIDGE__=true;
 var original=window.fetch.bind(window);
 window.fetch=function(input,options){
  try{
   var raw=typeof input==="string"?input:input instanceof URL?input.href:input&&input.url;
   if(!raw)return original(input,options);
   var url=new URL(raw,location.href);
   if(url.origin!==location.origin||!url.pathname.startsWith("/api/")||
      url.pathname.startsWith("/api/auth/")||
      url.pathname.startsWith("/api/health"))return original(input,options);
   var token=sessionStorage.getItem("pulso-fit-token")||"";
   if(!token)return original(input,options);
   var inherited=options?.headers||(typeof input==="object"&&input?.headers);
   var headers=new Headers(inherited||{});
   if(!headers.has("Authorization"))headers.set("Authorization","Bearer "+token);
   return original(input,Object.assign({},options||{},{headers:headers}));
  }catch{return original(input,options)}
 };
 console.log("[pulso-ui] Acesso autenticado habilitado para APIs internas do Coach e Performance.");
})();