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
import {existsSync,readFileSync,writeFileSync,readdirSync,statSync} from "node:fs";

if (basename(process.argv[1]||"")==="server.mjs") {
 try {
  const script=readFileSync(new URL("./pulsofit-plans-stable.js",import.meta.url),"utf8");
  const authJS=readFileSync(new URL("./pulsofit-auth-ui.js",import.meta.url),"utf8");
  const performanceJS=readFileSync(new URL("./pulsofit-performance-ui.js",import.meta.url),"utf8");
  const assessmentJS=readFileSync(new URL("./pulsofit-assessment-ui.js",import.meta.url),"utf8");
  const marker="pulsofit-stable-plans-20261118";
  const inject='<script id="'+marker+'">'+script.replace(/<\/script/gi,"<\\/script")+"</script>"+
   '<script id="pf-auth-required-20261118">'+authJS.replace(/<\/script/gi,"<\\/script")+"</script>"+
   '<script id="pf-performance-20261118">'+performanceJS.replace(/<\/script/gi,"<\\/script")+"</script>"+
   '<script id="pf-onboarding-assessment-20261118">'+assessmentJS.replace(/<\/script/gi,"<\\/script")+"</script>";
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
    if(!entry.isFile()||!entry.name.endsWith(".html"))continue;
    try{
     if(statSync(full).size>5500000)continue;
     const html=readFileSync(full,"utf8");
     const aiRoutes=[...new Set([...html.matchAll(/\/api\/(?:ai|coach)[a-z0-9\/_-]*/gi)].map(m=>m[0]))].slice(0,20);
     if(entry.name==="index.html")console.log("[pulso-ui] Backend AI paths referenced by frontend: "+(aiRoutes.length?aiRoutes.join(","):"none"));

     if(!/<\/body\s*>/i.test(html)||!/<html[\s>]/i.test(html))continue;
     if(html.includes(marker)){found.push(full+":already");continue}
     const matches=Array.from(html.matchAll(/<\/body\s*>/gi));
     const last=matches[matches.length-1];
     const revised=html.slice(0,last.index)+inject+html.slice(last.index);
     writeFileSync(full,revised);
     found.push(full);
    }catch{console.warn("[pulso-ui] Não foi possível atualizar arquivo HTML (continua disponível sem patch).")}
   }
  }
  for(const d of roots)visit(d,0);
  console.log("[pulso-ui] Portal de assinatura no HTML servido: "+(found.length?found.join(", "):"nenhum HTML localizado"));
 }catch(error){
  console.warn("[pulso-ui] Não foi possível integrar portal de assinatura: "+String(error.code||"init_error"));
 }
}
