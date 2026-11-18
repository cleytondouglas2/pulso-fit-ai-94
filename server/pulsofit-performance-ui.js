/* PulsoFit — guia Performance IA e avatar privado */
(function(){
"use strict";
if(window.__PULSO_PERFORMANCE_UI__)return;
window.__PULSO_PERFORMANCE_UI__=true;
var avatar=null,avatarFor="",photoBusy=false,working=false,selectedImage=null,photoStatus=null;
var css=[
'.mobile-nav.pf-performance-six{grid-template-columns:repeat(6,minmax(0,1fr))!important}',
'.mobile-nav.pf-performance-six .nav-link{font-size:9px!important;min-width:0!important;width:100%!important;overflow:hidden!important;gap:2px!important;padding:6px 1px!important}',

'#pf-performance-window{position:fixed!important;inset:0!important;z-index:2147482500!important;background:#050819ee!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:14px!important;box-sizing:border-box!important;overflow-y:auto!important;color:white!important;font:14px/1.5 system-ui,sans-serif!important}',
'#pf-performance-window .pf-perf-box{box-sizing:border-box;width:min(100%,790px);max-height:calc(100dvh - 28px);overflow-y:auto;border:1px solid #8a74bd;border-radius:23px;padding:clamp(18px,4vw,30px);background:linear-gradient(145deg,#2d244f,#111b32)}',
'#pf-performance-window h2{font-size:clamp(23px,4vw,31px);margin:4px 0;color:#fff}',
'#pf-performance-window p{color:#e4dcef}',
'#pf-performance-window .pf-perf-top{display:flex;align-items:start;justify-content:space-between;gap:14px}',
'#pf-performance-window .pf-perf-close{background:#3c315a;color:#fff;border:1px solid #8b77b0;border-radius:50%;width:36px;height:36px;flex:none;font-size:21px;cursor:pointer}',
'#pf-performance-window .pf-perf-upload{display:block;text-align:center;background:#27213e;border:2px dashed #9474d3;border-radius:16px;padding:18px;margin:14px 0;font-weight:800;cursor:pointer}',
'#pf-performance-window .pf-perf-upload input{display:block;max-width:100%;font-size:13px;margin:10px auto 0;color:#e3daf6}',
'#pf-performance-window #pf-perf-preview{display:block;max-width:100%;max-height:340px;object-fit:contain;margin:10px auto;border-radius:14px}',
'#pf-performance-window #pf-perf-preview[hidden]{display:none}',
'#pf-performance-window select{display:block;box-sizing:border-box;width:100%;padding:12px;background:#151b31;border:1px solid #8a73ac;color:white;border-radius:11px;font:14px system-ui,sans-serif}',
'#pf-performance-window .pf-perf-consent{display:flex;align-items:start;gap:10px;margin:16px 0;font-size:12px;color:#ddd1ef}',
'#pf-performance-window .pf-perf-consent input{width:19px;height:19px;flex:none;margin-top:2px}',
'#pf-performance-window .pf-perf-submit{width:100%;border:0;border-radius:12px;padding:14px;color:white;background:linear-gradient(110deg,#9951ed,#783bd1);font:850 14px system-ui,sans-serif;cursor:pointer}',
'#pf-performance-window .pf-perf-submit:disabled{opacity:.5}',
'#pf-performance-window .pf-perf-result{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #7967a4;border-radius:15px;padding:17px;background:#151b32;color:#f6f0ff;line-height:1.75;font-size:14px;margin-top:16px}',
'#pf-performance-window .pf-perf-note{font-size:11px;color:#c6b9df;margin-top:16px}',
'#pf-performance-window [role="status"]{font-size:13px;color:#bef6d5;margin:12px 0}',
'#pf-profile-photo-widget{margin:12px 0;display:flex;gap:9px;flex-wrap:wrap;padding:13px;border-radius:14px;background:#292440;border:1px solid #64558d;color:#fff}',
'#pf-profile-photo-widget strong,#pf-profile-photo-widget small,#pf-profile-photo-widget [role="status"]{flex-basis:100%}',
'#pf-profile-photo-widget strong{font-size:14px}',
'#pf-profile-photo-widget small{font-size:11px;color:#dad0e8}',
'#pf-profile-photo-widget label,#pf-profile-photo-widget button{padding:9px 12px;border-radius:10px;background:#8341d0;color:#fff;border:0;cursor:pointer;font:750 12px system-ui,sans-serif}',
'#pf-profile-photo-widget button{background:#46355e}',
'#pf-profile-photo-widget input{position:absolute;width:1px;height:1px;opacity:0}',
'.pf-performance-launch{border:1px solid #936bce!important;color:#e0c8ff!important}',
'#pf-performance-float{position:fixed!important;z-index:6100!important;left:12px!important;bottom:calc(92px + env(safe-area-inset-bottom,0px))!important;padding:11px 14px!important;background:linear-gradient(130deg,#30254f,#6744a3)!important;color:#fff!important;border:1px solid #a582e6!important;border-radius:14px!important;font:800 12px system-ui,sans-serif!important;cursor:pointer!important}',
'@media(min-width:850px){#pf-performance-float{display:none!important}}',
'@media(max-width:850px){.mobile-nav:has([data-route="performance"]){grid-template-columns:repeat(6,minmax(0,1fr))!important}.mobile-nav [data-route="performance"]{min-width:0!important;width:100%!important;font-size:9px!important}}',
'[hidden]{display:none!important}'
].join("\n");
function token(){try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}}
function logged(){return Boolean(token()&&!document.body.classList.contains("pf-account-locked"))}
function setupCSS(){if(document.getElementById("pf-performance-css"))return;var x=document.createElement("style");x.id="pf-performance-css";x.textContent=css;(document.head||document.documentElement).appendChild(x)}
async function shrink(file,sizeLimit,maxDim){
 if(!file||file.size>12*1024*1024)throw Error("A foto deve ter no máximo 12 MB");
 var url=URL.createObjectURL(file),img=new Image();
 try{
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error("Não foi possível abrir a foto"));img.src=url});
  var width=img.naturalWidth,height=img.naturalHeight;if(width<10||height<10||Math.max(width,height)>16000)throw Error("Foto inválida");
  var dim=maxDim,quality=.82;
  for(var i=0;i<7;i++){
   var ratio=Math.min(1,dim/Math.max(width,height)),c=document.createElement("canvas");
   c.width=Math.round(width*ratio);c.height=Math.round(height*ratio);
   var ctx=c.getContext("2d");if(!ctx)throw Error("Imagem não suportada");
   ctx.drawImage(img,0,0,c.width,c.height);
   var data=c.toDataURL("image/jpeg",quality);
   if(data.length<Math.floor(sizeLimit*4/3))return data;
   dim=Math.floor(dim*.82);quality=Math.max(.55,quality-.07);
  }
  throw Error("Não foi possível reduzir esta imagem. Escolha outra foto");
 }finally{URL.revokeObjectURL(url)}
}
function applyAvatar(){
 if(!avatar)return;
 document.querySelectorAll("#app .profile-cover .avatar, #app .sidebar-bottom .avatar, #app .pro-auth-heading .pro-avatar, #app .avatar-sm .avatar").forEach(function(el){
  if(el.dataset.pfAvatar==="active")return;
  el.dataset.pfAvatar="active";
  el.style.backgroundImage="url("+avatar+")";el.style.backgroundPosition="center";el.style.backgroundSize="cover";el.style.color="transparent";
 });
}
async function loadAvatar(){
 if(!logged()||avatarFor===token()||photoBusy)return;
 photoBusy=true;avatarFor=token();
 try{
  var r=await fetch("/api/profile/photo",{headers:{Authorization:"Bearer "+token()},cache:"no-store"});
  if(!r.ok)throw Error("Foto indisponível");
  var d=await r.json();avatar=d.hasPhoto?d.image:null;applyAvatar();
 }catch{avatar=null}finally{photoBusy=false}
}
function avatarWidget(){
 if(!logged())return;
 var app=document.getElementById("app");if(!app)return;
 var target=app.querySelector(".profile-cover")||app.querySelector(".pro-cols .pro-surface");
 if(!target||target.querySelector("#pf-profile-photo-widget"))return;
 var box=document.createElement("section");box.id="pf-profile-photo-widget";
 box.innerHTML='<strong>📷 Foto do meu perfil</strong>'+
  '<label>Adicionar ou trocar<input type="file" accept="image/*" aria-label="Enviar foto de perfil"></label>'+
  '<button type="button">Remover foto</button><small>Salva apenas na sua conta. Pode ser excluída a qualquer momento.</small>'+
  '<span role="status" aria-live="polite"></span>';
 target.appendChild(box);
 var notice=box.querySelector('[role="status"]');
 box.querySelector('input').addEventListener("change",async function(e){
  var f=e.target.files?.[0];if(!f)return;notice.textContent="Preparando foto...";
  try{
   var image=await shrink(f,480000,460);
   var r=await fetch("/api/profile/photo",{method:"PUT",cache:"no-store",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token()},body:JSON.stringify({image})});
   var d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Erro ao salvar foto");
   avatar=image;
   document.querySelectorAll("#app [data-pf-avatar]").forEach(x=>delete x.dataset.pfAvatar);
   applyAvatar();notice.textContent="Foto atualizada na sua conta.";
  }catch(err){notice.textContent=String(err.message||err)}
 });
 box.querySelector("button").addEventListener("click",async function(){
  if(!confirm("Excluir sua foto de perfil?"))return;
  try{
   var r=await fetch("/api/profile/photo",{method:"DELETE",cache:"no-store",headers:{Authorization:"Bearer "+token()}});
   if(!r.ok)throw Error("Falha ao excluir");
   avatar=null;
   document.querySelectorAll("#app [data-pf-avatar]").forEach(function(el){el.style.backgroundImage="none";el.style.color="";delete el.dataset.pfAvatar});
   notice.textContent="Foto removida.";
  }catch(err){notice.textContent=String(err.message||err)}
 });
}
function closePerformance(){document.getElementById("pf-performance-window")?.remove();selectedImage=null;performanceFile=null;}
var performanceFile=null;
function openPerformance(e){
 if(e){e.preventDefault();e.stopImmediatePropagation()}
 if(!logged())return;
 if(document.getElementById("pf-performance-window"))return;
 var el=document.createElement("div");el.id="pf-performance-window";
 el.innerHTML='<section class="pf-perf-box" role="dialog" aria-modal="true" aria-labelledby="pf-perf-title">'+
 '<div class="pf-perf-top"><div><small style="color:#b6f6cf;font-weight:900;letter-spacing:.12em">PULSOFIT AI • ANÁLISE VISUAL</small>'+
 '<h2 id="pf-perf-title">📸 Performance</h2></div><button type="button" class="pf-perf-close" aria-label="Fechar">×</button></div>'+
 '<p>Analise uma foto corporal usando a IA já conectada. Receba comentários sobre postura aparente, aspectos visuais observáveis e recomendações gerais para seus objetivos.</p>'+
 '<label class="pf-perf-upload">Selecionar foto do meu corpo<input id="pf-perf-file" type="file" accept="image/*"></label>'+
 '<img id="pf-perf-preview" alt="Foto selecionada para análise" hidden>'+
 '<label for="pf-perf-goal" style="display:block;font-weight:800;margin:16px 0 6px">Objetivo da análise</label>'+
 '<select id="pf-perf-goal"><option value="condicionamento geral">Melhorar condicionamento</option><option value="força e desenvolvimento muscular">Ganhar força e massa muscular</option>'+
 '<option value="postura e mobilidade">Postura e mobilidade</option><option value="reduzir medidas de forma saudável">Reduzir medidas com saúde</option><option value="acompanhar evolução">Acompanhar evolução</option></select>'+
 '<label class="pf-perf-consent"><input type="checkbox" id="pf-perf-consent"><span>Autorizo o envio desta foto à IA Gemini exclusivamente para gerar a análise. Entendo que o PulsoFit não salva a foto corporal no meu histórico.</span></label>'+
 '<button type="button" class="pf-perf-submit" id="pf-perf-submit">✦ Analisar minha foto com IA</button>'+
 '<p id="pf-perf-status" role="status" aria-live="polite">Escolha uma foto para começar.</p>'+
 '<div class="pf-perf-result" id="pf-perf-result" hidden></div>'+
 '<p class="pf-perf-note">Uma foto isolada não permite medir percentual de gordura, peso, saúde, lesões ou força. Os comentários são orientativos e não substituem um profissional.</p></section>';
 document.body.appendChild(el);
 var status=el.querySelector("#pf-perf-status"),button=el.querySelector("#pf-perf-submit"),report=el.querySelector("#pf-perf-result");
 el.querySelector(".pf-perf-close").addEventListener("click",closePerformance);
 el.addEventListener("click",function(ev){if(ev.target===el)closePerformance()});
 el.querySelector("#pf-perf-file").addEventListener("change",async function(ev){
  var file=ev.target.files?.[0];if(!file)return;selectedImage=null;status.textContent="Preparando imagem...";
  try{
   selectedImage=await shrink(file,930000,1100);
   var img=el.querySelector("#pf-perf-preview");img.src=selectedImage;img.hidden=false;
   status.textContent="Foto preparada. Marque o consentimento e toque em Analisar.";
  }catch(err){status.textContent=String(err.message||err)}
 });
 button.addEventListener("click",async function(){
  if(working)return;
  if(!selectedImage){status.textContent="Selecione uma foto do corpo.";return}
  if(!el.querySelector("#pf-perf-consent").checked){status.textContent="Marque o consentimento para enviar a foto à IA.";return}
  working=true;button.disabled=true;status.textContent="IA analisando a foto...";
  report.hidden=true;report.textContent="";
  try{
   var r=await fetch("/api/ai/body/analyze",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token()},
    body:JSON.stringify({image:selectedImage,consent:true,goal:el.querySelector("#pf-perf-goal").value})});
   var d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"A IA não conseguiu analisar agora");
   if(typeof d.analysis!=="string"||d.analysis.length<30)throw Error("A IA não retornou um relatório válido");
   report.textContent=d.analysis;report.hidden=false;
   status.textContent="Análise concluída. O PulsoFit não armazenou a foto corporal.";
  }catch(err){status.textContent="Não foi possível concluir: "+String(err.message||err)}
  finally{working=false;button.disabled=false}
 });
}
function ensureNavigation(){
 if(!logged())return;
 var app=document.getElementById("app");if(!app)return;
 var side=app.querySelector(".sidebar .nav");
 if(side&&!side.querySelector("[data-pf-open-performance]")){
  var item=document.createElement("button");item.type="button";item.className="nav-link pf-performance-launch";
  item.setAttribute("data-pf-open-performance","1");item.innerHTML="📸 Performance";
  item.addEventListener("click",openPerformance);side.appendChild(item);
 }
 var mobile=app.querySelector(".mobile-nav");
 if(mobile){
  mobile.classList.add("pf-performance-six");
  if(!mobile.querySelector("[data-pf-open-performance]")){
   var item=document.createElement("button");item.type="button";item.className="nav-link pf-performance-launch";
   item.setAttribute("data-pf-open-performance","1");
   item.innerHTML='<span aria-hidden="true">📈</span><span>Performance</span>';
   item.addEventListener("click",openPerformance);mobile.appendChild(item);
  }
  document.getElementById("pf-performance-float")?.remove();
 }
}
function enhance(){
 if(!logged())return;
 ensureNavigation();avatarWidget();applyAvatar();loadAvatar();
 var h=document.querySelector("#app #nutritionGuest h3");
 if(h&&h.textContent.includes("sem conta"))h.textContent="🍽️ Registro rápido do meu prato";
}
var scheduled=false;
function schedule(){
 if(scheduled)return;scheduled=true;
 requestAnimationFrame(function(){scheduled=false;enhance()});
}
document.addEventListener("click",function(e){
 var target=e.target.closest('[data-route="performance"]');
 if(target){openPerformance(e)}
},true);
function init(){
 setupCSS();
 var app=document.getElementById("app");
 if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
 window.addEventListener("pulso-auth-ready",function(){avatarFor="";schedule()});
 window.addEventListener("hashchange",schedule);
 setInterval(schedule,2700);
 schedule();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
})();