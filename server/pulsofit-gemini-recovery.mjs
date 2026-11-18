/**
 * Gemini 404 compatibility bridge for PulsoFit AI.
 *
 * Google can return 404 for generateContent on models that still appear in
 * models.list. Only retry a 404 (not payment/quota/auth errors), with current
 * generateContent-compatible models. Preserves request body, key and consent.
 * Never logs credentials, prompts, user content, images, or query strings.
 *
 * Applies to the existing Coach AI as well as Performance and onboarding
 * without replacing their current user-facing APIs or storing personal data.
 */
import {basename} from "node:path";

if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_GEMINI_MODEL_RECOVERY__){
 globalThis.__PULSO_GEMINI_MODEL_RECOVERY__=true;
 const rawFetch=globalThis.fetch.bind(globalThis);
 const host="generativelanguage.googleapis.com";
 const supportedVersion=/^\/v1(?:beta)?\/models\/([^/?]+):generateContent$/;
 const preferences=[
  "gemini-3.5-flash-lite","gemini-3.8-flash","gemini-3.1-flash-lite",
  "gemini-3.5-flash","gemini-3-flash-preview","gemini-3-flash",
  "gemini-2.5-flash-lite","gemini-2.5-flash","gemini-2.0-flash"
 ];
 const configuredKeys=["GEMINI_API_KEY","GOOGLE_API_KEY","PULSO_GEMINI_API_KEY","GOOGLE_GENERATIVE_AI_API_KEY","PULSO_AI_API_KEY"];
 const state={models:[],until:0,loading:null,verified:false,lastError:"not_checked"};
 function getKey(url,request){
  const urlKey=url.searchParams.get("key");
  if(urlKey)return urlKey;
  const fromHeader=request.headers.get("x-goog-api-key");
  if(fromHeader)return fromHeader;
  return configuredKeys.map(k=>process.env[k]).find(Boolean)||null;
 }
 async function availableModels(key){
  const now=Date.now();
  if(state.until>now&&state.models.length)return state.models;
  if(state.loading)return state.loading;
  state.loading=(async()=>{
   if(!key){state.lastError="key_missing";state.until=Date.now()+30000;return []}
   try{
    const models=[];let token="";
    for(let i=0;i<3;i++){
     const url=new URL("https://generativelanguage.googleapis.com/v1beta/models");
     url.searchParams.set("pageSize","100");
     if(token)url.searchParams.set("pageToken",token);
     const r=await rawFetch(url.toString(),{
      method:"GET",headers:{"x-goog-api-key":key,"Accept":"application/json"},
      redirect:"error",signal:AbortSignal.timeout(8000)
     });
     if(!r.ok){state.lastError="models_http_"+r.status;break}
     const j=await r.json();
     for(const m of (Array.isArray(j.models)?j.models:[])){
      if(!m?.name?.startsWith("models/"))continue;
      if(!m.supportedGenerationMethods?.includes("generateContent"))continue;
      const name=m.name.slice("models/".length);
      if(/^[a-z0-9][a-z0-9._-]{2,95}$/i.test(name))models.push(name);
     }
     token=String(j.nextPageToken||"");
     if(!token)break;
    }
    state.models=[...new Set(models)];
    state.verified=state.models.length>0;
    state.until=Date.now()+(models.length?20*60*1000:60000);
    if(models.length)state.lastError="none";
    console.log("[pulso-ai] Gemini model catalog: generateContent="+state.models.length+
      " available="+state.verified+"; keys and user content not logged.");
    return state.models;
   }catch(e){
    state.lastError="models_network_error";
    state.until=Date.now()+60000;
    console.warn("[pulso-ai] Model catalog unavailable ("+String(e.name||"error").replace(/[^a-zA-Z]/g,"").slice(0,24)+")");
    return [];
   }
  })().finally(()=>{state.loading=null});
  return state.loading;
 }
 function rankAvailable(list,original){
  const has = new Set(list);
  const ordered=preferences.filter(m=>has.has(m)&&m!==original);
  for(const m of list)if(!ordered.includes(m)&&m!==original)ordered.push(m);
  // If listModels itself is inaccessible, fall back only to documented
  // alternatives; a new model is never assumed to work until it returns 2xx.
  if(!ordered.length && state.lastError!=="none")return preferences.slice(0,3).filter(m=>m!==original);
  return ordered.slice(0,5);
 }
 function retryRequest(source,url){
  const copy=source.clone();
  return new Request(url,{
   method:copy.method,headers:copy.headers,
   body:copy.method==="GET"||copy.method==="HEAD"?undefined:copy.body,
   duplex:"half",redirect:copy.redirect,credentials:copy.credentials,
   cache:copy.cache,signal:copy.signal
  });
 }
 globalThis.fetch=async function(input,init){
  let request,url,model;
  try{
   request=new Request(input,init);
   url=new URL(request.url);
   if(url.protocol!=="https:"||url.hostname!==host||!supportedVersion.test(url.pathname))
    return rawFetch(input,init);
   model=url.pathname.match(supportedVersion)?.[1];
  }catch{return rawFetch(input,init)}
  const key=getKey(url,request);
  let result=await rawFetch(request.clone());
  if(result.status!==404)return result;
  const list=await availableModels(key);
  const candidates=rankAvailable(list,model);
  if(!candidates.length)return result;
  const beforeResult=result;
  let attempts=0;
  for(const next of candidates){
   if(attempts++>=3)break;
   const newURL=new URL(url);
   newURL.pathname=newURL.pathname.replace("/models/"+model+":generateContent","/models/"+next+":generateContent");
   let replacement;
   try{replacement=retryRequest(request,newURL.toString())}catch{break}
   try{
    const res=await rawFetch(replacement);
    console.log("[pulso-ai] Gemini recovery: originalModel="+model+
      " retryModel="+next+" http="+res.status+" (no personal content logged)");
    if(res.status===404){result=res;continue}
    // Never retry rate limit, invalid key, input errors or server failures.
    return res;
   }catch(e){
    state.lastError="retry_network_error";
    console.warn("[pulso-ai] Gemini model retry network error.");
    break;
   }
  }
  // Preserve the first model's genuine error if nothing else worked.
  return result||beforeResult;
 };
 // Preload catalog without using any customer photo or invoking generation.
 const key=configuredKeys.map(k=>process.env[k]).find(Boolean);
 if(key){
  // Minimal live smoke test checks actual generation eligibility; models.list
  // alone cannot prove access. No user text/images, no secrets in logs.
  void (async()=>{
   const models=await availableModels(key);
   const first=rankAvailable(models,"")[0];
   if(!first){console.warn("[pulso-ai] Live smoke test: no compatible model returned.");return}
   try{
    const r=await globalThis.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(first)+":generateContent",{
       method:"POST",redirect:"error",signal:AbortSignal.timeout(28000),
       headers:{"x-goog-api-key":key,"Content-Type":"application/json"},
       body:JSON.stringify({contents:[{role:"user",parts:[{text:"Responda somente OK, sem explicações."}]}],
        generationConfig:{temperature:0,maxOutputTokens:256}})
      });
    let returnedText=false;
    if(r.ok){
     const data=await r.json().catch(()=>({}));
     returnedText=Boolean((data.candidates||[]).some(c=>(c.content?.parts||[]).some(p=>typeof p.text==="string"&&p.text.trim())));
    }
    console.log("[pulso-ai] Live generation test: http="+r.status+" hasText="+returnedText+
      " successful="+Boolean(r.ok&&returnedText)+"; test uses no customer data.");
   }catch(e){
    console.warn("[pulso-ai] Live generation test unavailable ("+
     String(e.name||"error").replace(/[^a-zA-Z]/g,"").slice(0,25)+")");
   }
  })();
 }

 console.log("[pulso-ai] Gemini 404 model fallback installed for Coach and Performance.");
}
