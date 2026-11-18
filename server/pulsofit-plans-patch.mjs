/**
 * Ajuste de distribuição do frontend do PulsoFit.
 * O build do Render gera arquivos HTML antes de "node server.mjs".
 * Injetar o portal no HTML GERADO (cópia efêmera de deploy), sem tocar no
 * repositório ou credenciais, garante planos independentes do render SPA.
 *
 * É um complemento temporário até o frontend ser reconstruído com este
 * componente incorporado diretamente na página de assinatura.
 */
import {basename,join} from "node:path";
import {ensureHTML5Document} from "./pulsofit-html5.mjs";
import {existsSync,readFileSync,writeFileSync,readdirSync,statSync} from "node:fs";

if (basename(process.argv[1]||"")==="server.mjs") {
 try {
  const script=readFileSync(new URL("./pulsofit-plans-stable.js",import.meta.url),"utf8");
  const authJS=readFileSync(new URL("./pulsofit-auth-ui.js",import.meta.url),"utf8");
  const performanceJS=readFileSync(new URL("./pulsofit-performance-ui.js",import.meta.url),"utf8");
  const assessmentJS=readFileSync(new URL("./pulsofit-assessment-ui.js",import.meta.url),"utf8");
  const profilePolishJS=readFileSync(new URL("./pulsofit-profile-polish.js",import.meta.url),"utf8");
  const profileRescueJS=readFileSync(new URL("./pulsofit-profile-rescue.js",import.meta.url),"utf8");
  const maisJS=readFileSync(new URL("./pulsofit-mais-menu.js",import.meta.url),"utf8");
  const authFetchJS=readFileSync(new URL("./pulsofit-auth-fetch.js",import.meta.url),"utf8");
  const marker="pulsofit-stable-plans-20261118";
  const inject='<script id="'+marker+'">'+script.replace(/<\/script/gi,"<\\/script")+"</script>"+
   '<script id="pf-api-auth-bridge-20261118">'+authFetchJS.replace(/<\/script/gi,"<\\/script")+"</script>"+
   '<script id="pf-auth-required-20261118">'+authJS.replace(/<\/script/gi,"<\\/script")+"</script>"+
   '<script id="pf-performance-20261118">'+performanceJS.replace(/<\/script/gi,"<\\/script")+"</script>"+
   '<script id="pf-onboarding-assessment-20261118">'+assessmentJS.replace(/<\/script/gi,"<\\/script")+"</script>"+
   '<script id="pf-profile-polish-20261118">'+profilePolishJS.replace(/<\/script/gi,"<\\/script")+"</script>"+
   '<script id="pf-profile-rescue-20261118">'+profileRescueJS.replace(/<\/script/gi,"<\\/script")+"</script>"+
   '<script id="pf-mais-menu-20261118">'+maisJS.replace(/<\/script/gi,"<\\/script")+"</script>";
  const found=[];
  const roots=[".","dist","public","build","out","site","web","client"];
  const seen=new Set();
  function visit(dir,depth){
   if(depth>2||!existsSync(dir)||seen.has(dir))return;
   seen.add(dir);
   let entries;try{entries=readdirSync(dir,{withFileTypes:true})}catch{return}
   for(const entry of entries){
    if(entry.name.startsWith(".")||entry.name==="node_modules")continue;
    const full=join(dir,entry.name);
    if(entry.isDirectory()){if(depth<2)visit(full,depth+1);continue}
    if(entry.isFile()&&/\.m?js$/.test(entry.name)&&entry.name!=="pulsofit-auth-fetch.js"){
     try{
      const bytes=statSync(full).size;
      if(bytes>2000&&bytes<1500000){
       const js=readFileSync(full,"utf8");
       const foundRoutes=[...new Set([...js.matchAll(/\/api\/[a-z0-9/_-]{2,70}/gi)].map(m=>m[0]))].slice(0,35);
       if(foundRoutes.some(v=>/coach|chat|gemini|ai|nutrition|meal/i.test(v)))
        console.log("[pulso-ui] Frontend API paths in "+entry.name+": "+foundRoutes.join(","));
      }
     }catch{}
     continue;
    }
    if(!entry.isFile()||!entry.name.endsWith(".html"))continue;
    try{
     if(statSync(full).size>5500000)continue;
     const html=readFileSync(full,"utf8");
     const aiRoutes=[...new Set([...html.matchAll(/\/api\/(?:ai|coach)[a-z0-9\/_-]*/gi)].map(m=>m[0]))].slice(0,20);
     if(entry.name==="index.html")console.log("[pulso-ui] Backend AI paths referenced by frontend: "+(aiRoutes.length?aiRoutes.join(","):"none"));

     if(!/<\/body\s*>/i.test(html)||!/<html[\s>]/i.test(html))continue;
     const html5=ensureHTML5Document(html);
     if(!html5.valid)continue;
     if(entry.name==="index.html")console.log("[pulso-html5] Documento validado: "+(html5.additions.length?html5.additions.join(","):"metadados HTML5 já presentes"));

     if(html.includes(marker)){found.push(full+":already");continue}
     const matches=Array.from(html.matchAll(/<\/body\s*>/gi));
     const last=matches[matches.length-1];
     // Safari may cache the old syntactically invalid bundle after deploy.
     // Bust only the script URL; the generated app.js itself is repaired
     // before this file is updated by pulsofit-js-boot-repair.mjs.
     const freshHtml=html5.html.replace(/(<script\b[^>]*\bsrc\s*=\s*["'])([^"']*\/assets\/app\.js)(?:\?[^"']*)?(["'])/gi,
      (_,prefix,url,quote)=>prefix+url+"?pf_build=20261118-renderer-recovery-v3"+quote);
     const changedAssets=(freshHtml!==html);
     if(entry.name==="index.html")console.log("[pulso-ui] Safari bundle cache refresh="+changedAssets);
     const lastBody=Array.from(freshHtml.matchAll(/<\/body\s*>/gi)).at(-1);
     const revised=freshHtml.slice(0,lastBody.index)+inject+freshHtml.slice(lastBody.index);
     writeFileSync(full,revised);
     found.push(full);
    }catch{console.warn("[pulso-ui] Não foi possível atualizar arquivo HTML (continua disponível sem patch).")}
   }
  }
  for(const d of roots)visit(d,0);
  console.log("[pulso-ui] Portal de assinatura no HTML servido: "+(found.length?found.join(", "):"nenhum HTML localizado"));
  console.log("[pulso-ui] Carregados: autenticação, apresentação inicial, foto/perfil, Performance em Mais, planos e avaliação.");
 }catch(error){
  console.warn("[pulso-ui] Não foi possível integrar portal de assinatura: "+String(error.code||"init_error"));
 }
}
