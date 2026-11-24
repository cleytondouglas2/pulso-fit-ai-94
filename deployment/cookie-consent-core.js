/* ArgusPay: purpose-specific, opt-in consent. No analytics or ad integration is installed by this module. */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else Object.defineProperty(root,'ArgusCookieConsentCore',{value:api,writable:false,configurable:false});
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const KEY='argus_cookie_preferences',VERSION='2026-11-24.1',TTL=180*24*60*60*1000;
 function decode(raw,now=Date.now()){
  try{
   const s=JSON.parse(raw);
   if(!s||s.version!==VERSION||!Number.isSafeInteger(s.decidedAt)||s.decidedAt>now||s.decidedAt<0||
    s.expiresAt!==s.decidedAt+TTL||s.expiresAt<=now||
    typeof s.analytics!=='boolean'||typeof s.marketing!=='boolean')return null;
   return {version:VERSION,decidedAt:s.decidedAt,expiresAt:s.expiresAt,analytics:s.analytics,marketing:s.marketing};
  }catch{return null;}
 }
 function choice(analytics,marketing,now=Date.now()){
  if(typeof analytics!=='boolean'||typeof marketing!=='boolean'||!Number.isSafeInteger(now)||now<0)throw new TypeError('Invalid preference');
  return {version:VERSION,decidedAt:now,expiresAt:now+TTL,analytics,marketing};
 }
 function allows(state,purpose,now=Date.now()){
  if(purpose==='essential')return true;
  if(purpose!=='analytics'&&purpose!=='marketing')return false;
  const valid=decode(JSON.stringify(state??null),now);
  return valid?.[purpose]===true;
 }
 return Object.freeze({KEY,VERSION,TTL,decode,choice,allows});
});