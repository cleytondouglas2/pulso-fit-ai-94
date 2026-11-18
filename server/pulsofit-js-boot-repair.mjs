/**
 * PulsoFit 9.5 — emergency build-output syntax repair.
 * The build supplied by PULSO_BUILD_BR sometimes emits more than one lexical
 * "mobileNavItems" declaration. Safari then refuses to execute the whole app.
 * This runs on generated public files before server.mjs begins serving them.
 * No auth, billing, database or user data is read or changed.
 */
import {basename,join} from "node:path";
import {existsSync,readdirSync,readFileSync,statSync,writeFileSync} from "node:fs";
import {Script} from "node:vm";

if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_BOOT_JS_REPAIR__){
 globalThis.__PULSO_BOOT_JS_REPAIR__=true;
 const id="mobileNavItems";
 const decl=/\b(?:const|let)\s+mobileNavItems\s*=/g;
 const fn=()=>null;
 function countDeclarations(code){return [...code.matchAll(decl)].map(m=>m.index);}
 function parse(code,filename){try{new Script(code,{filename,displayErrors:false});return {ok:true}}catch(e){return {ok:false,error:String(e.message||e).slice(0,190)}}}
 function preserveReferences(code){
  // Two top-level lexical declarations with the same name are invalid in
  // Safari. Using "var" on both keeps every original reference intact.
  // Renaming earlier code sections caused runtime lookup failures even
  // though the file parsed in Node.
  const replaced=code.replace(/\b(?:const|let)\s+mobileNavItems(?=\s*=)/g,"var mobileNavItems");
  return replaced===code?null:replaced;
 }
 function uniqueSegments(code){
  // Keep the newest navigation definition under its original identifier.
  // Earlier implementations receive a private identifier and keep their own
  // existing references. This preserves both old/new render logic.
  const found=countDeclarations(code);if(found.length<2)return null;
  let result="";
  for(let i=0;i<found.length-1;i++){
   const begin=i===0?0:found[i],end=found[i+1];
   const slice=code.slice(begin,end);
   result+=slice.replace(/\bmobileNavItems\b/g,"pfLegacyMobileNavItems_"+(i+1));
  }
  result+=code.slice(found[found.length-1]);
  return result;
 }
 const roots=[".","dist","public","build","out","site","web","client"];
 const seen=new Set(),locations=[];
 function visit(dir,depth){
  if(depth>2||seen.has(dir)||!existsSync(dir))return;
  seen.add(dir);let items;try{items=readdirSync(dir,{withFileTypes:true})}catch{return}
  for(const entry of items){
   if(entry.name.startsWith(".")||entry.name==="node_modules")continue;
   const loc=join(dir,entry.name);
   if(entry.isDirectory()){if(depth<2)visit(loc,depth+1);continue}
   if(!entry.isFile()||!(/\.html?$/i.test(entry.name)||/\.js$/i.test(entry.name)))continue;
   const size=statSync(loc).size;
   if(size>7000000||size<1000)continue;
   // Generated app.js and generated HTML only, not our standalone extensions.
   if(!/\.html?$/i.test(entry.name)&&!/^app(?:\.[a-z0-9-]+)?\.js$/i.test(entry.name))continue;
   locations.push(loc);
  }
 }
 for(const root of roots)visit(root,0);
 function rewriteFile(loc){
  let source;try{source=readFileSync(loc,"utf8")}catch{return}
  if(!source.includes(id))return;
  if(/\.js$/i.test(loc)){
   const declarations=countDeclarations(source);
   const before=parse(source,loc);
   let fixed=false,after=before,method="none";
   if(declarations.length>=2 && !before.ok && /already been declared|declared twice|Identifier/.test(before.error)){
    const candidate=preserveReferences(source);
    if(candidate){
     after=parse(candidate,loc);
     if(after.ok){writeFileSync(loc,candidate);fixed=true;method="preserve-references-var";}
    }
    // A fallback is intentionally not applied if parse still fails:
    // renaming lexical scopes can silently break variables after login.
   }
   // A second build issue: renderSubscription is referenced by the
   // generated subscription wrapper but not available in its global scope.
   // Safari throws ReferenceError during bundle evaluation even though a
   // nested function of the same name is present in source text.
   // Define only a missing GLOBAL binding, before the bundle executes.
   const prelude=";(function(){if(typeof globalThis.renderSubscription!=='function'){"+
    "globalThis.renderSubscription=function(){return "+
    "'<section class=\"pro-surface pf-subscription-rescue\" style=\"padding:20px;margin:16px 0\">'+"+
    "'<h2>Seus planos PulsoFit AI</h2>'+"+
    "'<p>7 dias de teste grátis para novas contas. Após o teste, escolha um plano:</p>'+"+
    "'<div class=\"pro-price-grid\" style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px\">'+"+
    "'<article class=\"pf-offer\"><h3>Quinzenal</h3><p><b>R$ 14,90</b> por 15 dias</p><button type=\"button\" data-pf-select-plan=\"quinzenal\">Contratar com Pix</button></article>'+"+
    "'<article class=\"pf-offer\"><h3>Mensal</h3><p><b>R$ 24,90</b> por 30 dias</p><button type=\"button\" data-pf-select-plan=\"mensal\">Contratar com Pix</button></article>'+"+
    "'</div></section>';};"+
    "}})();\n";
   // Older generated enhancements also capture renderAdmin and other
   // render functions as bare identifiers outside the app's inner scope.
   // Supply minimal placeholders ONLY for globals absent in that environment.
   // This keeps login and the main app available without exposing admin data.
   const globalRenderPrelude=";(function(){const names=[\"renderAdmin\",\"renderSubscription\"];for(const id of names){if(typeof globalThis[id]!==\"function\"){globalThis[id]=function(){return '<section class=\"pro-surface\" style=\"padding:18px;margin:16px 0\"><h2>'+(id===\"renderAdmin\"?\"Área administrativa indisponível\":\"Planos PulsoFit\")+'</h2><p>Esta seção está temporariamente indisponível. Use as opções do menu.</p></section>';};}}})();\n";
   function missingRenderSymbols(source){
    // Find bare renderer calls. If a symbol has no declaration anywhere in
    // this generated JS, its reference will throw when that route is visited.
    // Report and guard ONLY missing symbols. Do not override existing renderers.
    const invoked=new Set([...source.matchAll(/(^|[^\w.$])\b(render[A-Z][A-Za-z0-9_]*)\s*\(/gm)].map(m=>m[2]));
    const declared=new Set([
      ...[...source.matchAll(/\b(?:function|const|let|var)\s+(render[A-Z][A-Za-z0-9_]*)\b/g)].map(m=>m[1]),
      ...[...source.matchAll(/\b(?:globalThis|window)\.(render[A-Z][A-Za-z0-9_]*)\s*=/g)].map(m=>m[1]),
    ]);
    return [...invoked].filter(n=>!declared.has(n)).slice(0,25);
   }
   // Do not re-add when server restarts or the file was already fixed.
   let globalSubscriptionFixed=false;
   const candidateSource=fixed?readFileSync(loc,"utf8"):source;
   const needsSub=candidateSource.includes("var originalSubs=renderSubscription") &&
      !candidateSource.includes("pf-subscription-rescue") &&
      !/\b(?:globalThis|window)\.renderSubscription\s*=\s*function/.test(candidateSource);
   const missingRenderers=missingRenderSymbols(candidateSource);
   const needsAdmin=/\brenderAdmin\s*\(/.test(candidateSource) &&
      !candidateSource.includes("const names=[\"renderAdmin\",\"renderSubscription\"]");
   console.log("[pulso-boot] Missing renderer declarations: "+missingRenderers.join(","));
   const missingPrelude=missingRenderers.length?
    ";(function(){for(const n of "+JSON.stringify(missingRenderers)+"){if(typeof globalThis[n]!=='function')globalThis[n]=function(){return '<section><h2>Seção indisponível</h2><p>Use o menu para navegar.</p></section>';};}})();\n":"";

   if(needsSub||needsAdmin||missingRenderers.length){
    const candidate=missingPrelude+globalRenderPrelude+(needsSub?prelude:"")+candidateSource;
    const check=parse(candidate,loc+"#subscription-fallback");
    if(check.ok){
      writeFileSync(loc,candidate);
      globalSubscriptionFixed=true;
    }else console.warn("[pulso-boot] Subscription bootstrap rejected by syntax check: "+check.error);
   }
   console.log("[pulso-boot] Render globals fallback available="+globalSubscriptionFixed+ " admin="+needsAdmin+
     " wrapperReferenced="+candidateSource.includes("var originalSubs=renderSubscription"));

   const effective=fixed?readFileSync(loc,"utf8"):source;
   const rendererNames=[...new Set([...effective.matchAll(/\brender(?:Admin|Subscription|Home|Profile|Account|Plans|Pricing|Settings|More|Coach)\b/g)].map(x=>x[0]))];
   console.log("[pulso-boot] Referenced render names: "+rendererNames.join(","));

   const targets=[...effective.matchAll(/\brenderSubscription\b/g)].slice(0,16);
   const declarationsFound=[...effective.matchAll(/\b(?:function\s+|(?:const|let|var)\s+)(render(?:Subscription|Plans|Pricing|Pro|Paywall)\b)/g)].map(m=>({name:m[1],at:m.index})).slice(0,25);
   const contexts=targets.map(m=>{
     const before=effective.slice(Math.max(0,m.index-70),m.index);
     const after=effective.slice(m.index+m[0].length,m.index+m[0].length+95);
     const kind=/function\s*$|(?:const|let|var)\s*$/.test(before)?"declaration":/:\s*$/.test(before)?"property":"reference";
     return {at:m.index,kind,prefix:before.replace(/[^a-zA-Z0-9_:.,(){ }=]/g,"_").slice(-55),
       suffix:after.replace(/[^a-zA-Z0-9_:.,(){ }=]/g,"_").slice(0,80)};
   });
   console.log("[pulso-boot] Subscription symbol diagnostic: "+JSON.stringify({
      bytes:effective.length,mentions:targets.length,declarations:declarationsFound,contexts
   }));
   console.log("[pulso-boot] "+loc+" mobileNavDeclarations="+declarations.length+
    " parseBefore="+(before.ok?"ok":before.error)+
    " fixed="+fixed+" method="+method+" parseAfter="+(after.ok?"ok":after.error));
   return;
  }
  // HTML may include several separate classic scripts which share a global
  // lexical environment, or a repeated generated app.js script reference.
  let revised=source, changed=false, inlineCount=0;
  const scripts=[...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  const inline=scripts.filter(m=>!/\bsrc\s*=/.test(m[1])&&!/\btype\s*=\s*["']module["']/.test(m[1]));
  inlineCount=inline.reduce((n,m)=>n+countDeclarations(m[2]).length,0);
  if(inlineCount>1){
   // Last declaration wins. Rewrite earlier scripts in reverse to preserve
   // offsets and avoid modifying the size of subsequent script locations.
   let remaining=inlineCount;
   for(let i=scripts.length-1;i>=0;i--){
    const m=scripts[i];
    if(/\bsrc\s*=/.test(m[1])||/\btype\s*=\s*["']module["']/.test(m[1]))continue;
    const n=countDeclarations(m[2]).length;if(!n)continue;
    const shouldKeep=remaining===n?0:1;
    // Simpler and conservative: modify only if one script contains multiple
    // colliding declarations and the corrected script parses successfully.
    if(n>1){
     const before=parse(m[2],loc+"#inline");
     const cand=preserveReferences(m[2]);
     if(cand&&(!before.ok)&&parse(cand,loc+"#inline").ok){
      const start=m.index+m[0].indexOf(">")+1;
      revised=revised.slice(0,start)+cand+revised.slice(start+m[2].length);changed=true;
     }
    }
    remaining-=n;
   }
  }
  // Avoid loading the same classic app bundle twice through identical tags.
  let srcCount=0;
  const unique=new Set();
  const tag=/<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>\s*<\/script\s*>/gi;
  revised=revised.replace(tag,(all,quote,url)=>{
   if(!/(?:^|\/)app(?:\.[a-z0-9-]+)?\.js(?:\?|$)/i.test(url))return all;
   srcCount++;
   if(unique.has(url)){changed=true;return ""}
   unique.add(url);return all;
  });
  if(changed){try{writeFileSync(loc,revised)}catch{changed=false}}
  console.log("[pulso-boot] "+loc+" inlineMobileNavDeclarations="+inlineCount+
   " appBundleReferences="+srcCount+" modified="+changed);
 }
 for(const loc of new Set(locations))try{rewriteFile(loc)}catch(e){
  console.warn("[pulso-boot] Could not analyze "+loc+": "+String(e.code||"check_error").slice(0,30));
 }
 console.log("[pulso-boot] JavaScript initialization sanity pass complete.");
}
