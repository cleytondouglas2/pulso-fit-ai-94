/* PulsoFit mobile profile — isolated, stable responsive composition. */
(function(){
"use strict";
if(window.__PULSO_PROFILE_RESCUE_V2__)return;
window.__PULSO_PROFILE_RESCUE_V2__=true;
var lastSession="",lastSync=0,inFlight=false,photo=null,name="",queued=false;
var css=[
'body.pf-rescue-active #app{overflow-x:clip!important}',
'body.pf-rescue-active #app .profile-cover,body.pf-rescue-active #app #pf-profile-photo-widget,body.pf-rescue-active #app .pf-more-performance-card,body.pf-rescue-active #app .pf-profile-account-actions,body.pf-rescue-active #app .pf-eval-launch{display:none!important}',
'body.pf-rescue-active #pf-stable-open,body.pf-rescue-active #pf-plans-shortcut{display:none!important}',
'body.pf-rescue-active #app .pf-rescue-host{display:flex!important;flex-direction:column!important;align-items:stretch!important;justify-content:flex-start!important;gap:12px!important;width:100%!important;max-width:100%!important;min-width:0!important;height:auto!important;min-height:0!important;overflow:visible!important;box-sizing:border-box!important;flex-wrap:nowrap!important;grid-template-columns:minmax(0,1fr)!important}',
'body.pf-rescue-active #app .pf-rescue-host>.pf-rescue-panel{flex:0 0 auto!important;align-self:stretch!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}',
'#pf-rescue-panel{font:14px/1.45 system-ui,-apple-system,sans-serif!important;color:#f7f8ff!important;display:flex!important;flex-direction:column!important;gap:12px!important;margin:0 0 8px!important;overflow:visible!important}',
'#pf-rescue-panel,#pf-rescue-panel *{box-sizing:border-box!important;min-width:0}',
'#pf-rescue-panel .pfrr-hero{padding:clamp(18px,3.6vw,28px)!important;background:radial-gradient(circle at 90% 5%,#a25bf43b,transparent 46%),linear-gradient(125deg,#202945,#212245 72%,#33224c)!important;border:1px solid #8673c5!important;border-radius:23px!important;box-shadow:0 11px 32px #080c2c4d!important;width:100%!important}',
'#pf-rescue-panel .pfrr-eyebrow{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;color:#a4ffe9;font:800 11px/1.4 system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase}',
'#pf-rescue-panel .pfrr-online{display:inline-flex;align-items:center;gap:7px;border:1px solid #6cf8c85c;border-radius:40px;padding:6px 10px;color:#b6ffe1;letter-spacing:0;text-transform:none;background:#244d4870;white-space:nowrap}',
'#pf-rescue-panel .pfrr-online:before{content:"";width:7px;height:7px;background:#69e6bd;border-radius:50%;box-shadow:0 0 0 3px #6be7bb26}',
'#pf-rescue-panel .pfrr-row{display:flex!important;align-items:center!important;gap:clamp(13px,3.5vw,20px)!important;margin:20px 0 16px!important;width:100%!important;flex-wrap:nowrap!important}',
'#pf-rescue-panel .pfrr-avatar{width:clamp(72px,17vw,96px)!important;height:clamp(72px,17vw,96px)!important;flex:0 0 clamp(72px,17vw,96px)!important;display:grid;place-items:center;position:relative;border-radius:23px!important;background:linear-gradient(145deg,#9effcf,#a58dff)!important;border:3px solid #afffddb3!important;overflow:hidden;box-shadow:0 10px 25px #0a12336e;color:#1b1d36;font:900 30px system-ui,sans-serif}',
'#pf-rescue-panel .pfrr-avatar img{position:absolute;inset:0;width:100%!important;height:100%!important;object-fit:cover;display:block;border:0;border-radius:19px}',
'#pf-rescue-panel .pfrr-avatar img[hidden]{display:none!important}',
'#pf-rescue-panel .pfrr-identity{flex:1 1 auto!important;min-width:0!important;max-width:100%!important}',
'#pf-rescue-panel .pfrr-identity small{display:block;color:#adffe8;text-transform:uppercase;letter-spacing:.1em;font:800 10px/1.45 system-ui,sans-serif}',
'#pf-rescue-panel .pfrr-identity h2{color:#fff!important;font:850 clamp(23px,5.2vw,33px)/1.15 system-ui,sans-serif!important;letter-spacing:-.04em!important;margin:4px 0 6px!important;overflow-wrap:anywhere!important}',
'#pf-rescue-panel .pfrr-identity p{color:#d2d7eb!important;font:12px/1.4 system-ui,sans-serif!important;margin:0!important;overflow-wrap:anywhere!important}',
'#pf-rescue-panel .pfrr-status{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;padding-top:16px;border-top:1px solid #8d82b540}',
'#pf-rescue-panel .pfrr-status>div{border:1px solid #8e81b33f;border-radius:13px;background:#0f193139;padding:11px 12px;min-width:0}',
'#pf-rescue-panel .pfrr-status small{display:block;color:#adb7d4;font:11px/1.4 system-ui,sans-serif}',
'#pf-rescue-panel .pfrr-status strong{display:block;margin-top:4px;color:#d0fbea;font:800 clamp(11px,3vw,14px)/1.4 system-ui,sans-serif;overflow-wrap:anywhere}',
'#pf-rescue-panel .pfrr-card{padding:clamp(16px,3.3vw,22px)!important;border-radius:19px!important;background:linear-gradient(125deg,#202740,#212141)!important;border:1px solid #66618f!important;width:100%!important}',
'#pf-rescue-panel .pfrr-cardtop{display:flex!important;align-items:center!important;gap:11px!important;margin-bottom:15px!important}',
'#pf-rescue-panel .pfrr-cardtop span{width:36px;height:36px;display:grid;place-items:center;font-size:20px;border:1px solid #ffffff25;background:#ffffff0f;border-radius:11px;flex:none}',
'#pf-rescue-panel .pfrr-cardtop strong{display:block;color:#fff;font:850 16px/1.35 system-ui,sans-serif}',
'#pf-rescue-panel .pfrr-cardtop small{display:block;color:#c8c8df;font:11px/1.55 system-ui,sans-serif;margin-top:3px}',
'#pf-rescue-panel .pfrr-photo-actions{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:10px!important}',
'#pf-rescue-panel .pfrr-photo-actions label,#pf-rescue-panel .pfrr-photo-actions button,#pf-rescue-panel .pfrr-tools button,#pf-rescue-panel .pfrr-footer button{display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;max-width:100%!important;min-height:46px!important;padding:11px 12px!important;border-radius:13px!important;font:800 12px/1.35 system-ui,sans-serif!important;cursor:pointer!important;text-align:center!important}',
'#pf-rescue-panel .pfrr-photo-actions label{position:relative;overflow:hidden;background:linear-gradient(120deg,#8643d3,#a35de4)!important;border:1px solid #c1a6f6!important;color:#fff!important}',
'#pf-rescue-panel .pfrr-photo-actions label input{position:absolute;width:1px;height:1px;opacity:0;left:0;top:0}',
'#pf-rescue-panel .pfrr-photo-actions label:focus-within{outline:3px solid #d8bfff;outline-offset:2px}',
'#pf-rescue-panel .pfrr-photo-actions button{background:#36314d!important;color:#e7dcf4!important;border:1px solid #79708f!important}',
'#pf-rescue-panel .pfrr-photo-actions button:disabled,#pf-rescue-panel .pfrr-tools button:disabled{opacity:.46!important;cursor:not-allowed!important}',
'#pf-rescue-panel .pfrr-message{color:#b6f4d3!important;font:12px/1.45 system-ui,sans-serif!important;margin:12px 0 0;min-height:0}',
'#pf-rescue-panel .pfrr-tools{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}',
'#pf-rescue-panel .pfrr-tools button{flex-direction:column!important;align-items:flex-start!important;min-height:95px!important;text-align:left!important;border:1px solid #8069b4!important;background:linear-gradient(125deg,#362456,#222a4c)!important;color:#fff!important;padding:14px!important;font-size:14px!important}',
'#pf-rescue-panel .pfrr-tools button small{font:11px/1.5 system-ui,sans-serif;color:#d3c8e7}',
'#pf-rescue-panel .pfrr-tools button b{font-size:13px}',
'#pf-rescue-panel .pfrr-manage-plan{display:grid!important;gap:9px!important;background:#213048!important;border:1px solid #6ec7a4!important;border-radius:17px!important;padding:15px!important;margin-top:13px!important}'+
'#pf-rescue-panel .pfrr-manage-plan strong{font:850 15px system-ui;color:#c3ffe1}'+
'#pf-rescue-panel .pfrr-manage-plan p{font:12px/1.5 system-ui;color:#d9e5ed;margin:0}'+
'#pf-rescue-panel .pfrr-manage-plan button{min-height:46px!important;max-width:100%!important;background:linear-gradient(90deg,#7850d6,#995ded)!important;color:white!important;border:1px solid #c5a8ff!important;border-radius:12px!important;font:850 13px system-ui!important;cursor:pointer!important}'+
'#pf-rescue-panel .pfrr-footer{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;flex-wrap:wrap!important;padding:12px 16px!important;background:#18223b!important;border:1px solid #575b80!important;border-radius:16px!important}',
'#pf-rescue-panel .pfrr-footer p{color:#cbd0e0!important;font:12px/1.4 system-ui,sans-serif!important;margin:0!important;flex:1 1 170px}',
'#pf-rescue-panel .pfrr-footer button{border:1px solid #a97e9a!important;background:#3d2e42!important;color:#ffe3e8!important;min-width:120px!important}',
'#pf-rescue-panel .pfrr-footer button:disabled{opacity:.5}',
'@media(max-width:420px){#pf-rescue-panel .pfrr-status{gap:7px!important}#pf-rescue-panel .pfrr-status>div{padding:10px!important}#pf-rescue-panel .pfrr-tools button{padding:12px!important}#pf-rescue-panel .pfrr-row{gap:11px!important}#pf-rescue-panel .pfrr-photo-actions{grid-template-columns:1fr 1fr!important}#pf-rescue-panel .pfrr-photo-actions label,#pf-rescue-panel .pfrr-photo-actions button{font-size:11px!important;padding:10px 6px!important}}',
'@media(max-width:350px){#pf-rescue-panel .pfrr-photo-actions,#pf-rescue-panel .pfrr-tools{grid-template-columns:1fr!important}#pf-rescue-panel .pfrr-status{grid-template-columns:1fr!important}}',
'@media(prefers-reduced-motion:reduce){#pf-rescue-panel *{transition:none!important}}'
].join("\n");
function getToken(){try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}}
function currentRoute(){return String(location.hash||"").replace(/^#\/?/,"").split("/")[0].toLowerCase()}
function ok(){return Boolean(getToken())&&!document.body.classList.contains("pf-account-locked")}
function safeImage(v){return typeof v==="string"&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]{40,}$/.test(v)?v:null}
function fmt(d){if(!d)return"—";const v=new Date(d);return Number.isFinite(v.getTime())?v.toLocaleDateString("pt-BR"):"—"}
function announce(t){const msg=document.getElementById("pfrr-message");if(msg)msg.textContent=t||""}
function paint(){
 const root=document.getElementById("pf-rescue-panel");if(!root)return;
 const image=root.querySelector(".pfrr-avatar img"),placeholder=root.querySelector(".pfrr-avatar span");
 if(image){if(photo){if(image.getAttribute("src")!==photo)image.src=photo;image.hidden=false}else{image.hidden=true;image.removeAttribute("src")}}
 if(placeholder)placeholder.hidden=Boolean(photo);
 const remove=root.querySelector("[data-pfrr-remove]");if(remove)remove.disabled=!photo;
}
async function shrink(file){
 if(!file||file.size>12*1024*1024)throw Error("Escolha uma imagem de até 12 MB.");
 const url=URL.createObjectURL(file),img=new Image();
 try{
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error("Não foi possível abrir a foto. Tente JPG ou PNG."));img.src=url});
  if(img.naturalWidth<10||img.naturalHeight<10)throw Error("Imagem inválida.");
  let max=500,quality=.84;
  for(let i=0;i<8;i++){
   const ratio=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
   const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.floor(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.floor(img.naturalHeight*ratio));
   const ctx=canvas.getContext("2d");if(!ctx)throw Error("O navegador não permite converter esta foto.");
   ctx.drawImage(img,0,0,canvas.width,canvas.height);
   const value=canvas.toDataURL("image/jpeg",quality);
   if(value.length<620000)return value;
   max=Math.max(180,Math.floor(max*.8));quality=Math.max(.52,quality-.065);
  }
  throw Error("Esta foto ficou grande demais. Tente outra.");
 }finally{URL.revokeObjectURL(url)}
}
async function request(path,options){
 const token=getToken();if(!token)throw Error("Entre na sua conta novamente.");
 const opts=Object.assign({cache:"no-store"},options||{});
 opts.headers=Object.assign({},opts.headers||{},{Authorization:"Bearer "+token});
 const r=await fetch(path,opts);
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||"Serviço temporariamente indisponível.");
 return data;
}
async function update(){
 const token=getToken(),root=document.getElementById("pf-rescue-panel");
 if(!root||!ok()||inFlight||lastSession===token&&Date.now()-lastSync<45000)return;
 inFlight=true;lastSession=token;lastSync=Date.now();
 try{
  const results=await Promise.allSettled([request("/api/me"),request("/api/subscription/status"),request("/api/profile/photo")]);
  if(!root.isConnected||getToken()!==token)return;
  if(results[0].status==="fulfilled"){
   const user=results[0].value.user||results[0].value;
   name=String(user.name||user.fullName||"Aluno").trim().slice(0,90)||"Aluno";
   const el=root.querySelector(".pfrr-name");if(el)el.textContent=name;
   const p=root.querySelector(".pfrr-initials");if(p)p.textContent=name.split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase();
   const subtitle=root.querySelector(".pfrr-subtitle");
   if(subtitle)subtitle.textContent="Seu espaço de treino personalizado";
  }
  if(results[1].status==="fulfilled"){
   const d=results[1].value;
   const active=Boolean(d.planActive);
   const current=String(results[0].status==="fulfilled"?(results[0].value.user||results[0].value).plan||"":"").toLowerCase();
   const planLabel=active?(current==="quinzenal"?"Quinzenal":current==="mensal"?"Mensal":"Assinatura ativa"):
     d.trialEndsAt?"Teste grátis de 7 dias":"Plano gratuito";
   const date=active?d.planExpiresAt:d.trialEndsAt;
   const planEl=root.querySelector(".pfrr-plan");if(planEl)planEl.textContent=planLabel;
   const dateEl=root.querySelector(".pfrr-validity");if(dateEl)dateEl.textContent=fmt(date);
   const button=root.querySelector("[data-pfrr-plan]");
   if(button)button.textContent=active?"🔄 Renovar ou mudar meu plano":("💎 "+(d.trialEndsAt?"Escolher um plano pago":"Contratar um plano"));
   const description=root.querySelector(".pfrr-plan-explanation");
   if(description)description.textContent=active?
    "Assinatura ativa. Você pode renovar ou escolher outra duração. Após confirmação do Pix, os dias comprados são adicionados à validade atual.":
    "Veja os planos e contrate quando quiser. O acesso gratuito não gera cobrança automática.";
  }
  if(results[2].status==="fulfilled"){
   photo=results[2].value.hasPhoto?safeImage(results[2].value.image):null;
   paint();
  }
 }catch{announce("Não foi possível atualizar os dados neste momento.")}
 finally{inFlight=false}
}
async function upload(file){
 if(!file)return;
 const root=document.getElementById("pf-rescue-panel");if(!root)return;
 const uploadInput=root.querySelector("#pfrr-upload"),del=root.querySelector("[data-pfrr-remove]");
 if(uploadInput)uploadInput.disabled=true;if(del)del.disabled=true;
 announce("Preparando e salvando foto...");
 try{
  const image=await shrink(file);
  await request("/api/profile/photo",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({image})});
  photo=image;paint();window.dispatchEvent(new CustomEvent("pulso-avatar-changed",{detail:{src:image}}));
  announce("Foto atualizada na sua conta.");
 }catch(e){announce(String(e.message||"Não foi possível salvar sua foto."))}
 finally{if(uploadInput){uploadInput.value="";uploadInput.disabled=false}paint()}
}
async function removePhoto(){
 if(!photo||!confirm("Deseja remover sua foto de perfil?"))return;
 announce("Removendo sua foto...");
 try{
  await request("/api/profile/photo",{method:"DELETE"});
  photo=null;paint();window.dispatchEvent(new CustomEvent("pulso-avatar-changed",{detail:{src:null}}));
  announce("Foto removida.");
 }catch(e){announce(String(e.message||"Não foi possível remover."))}
}
async function logout(){
 if(!confirm("Sair da sua conta PulsoFit neste aparelho?"))return;
 const btn=document.querySelector("#pf-rescue-panel [data-pfrr-logout]");
 if(btn)btn.disabled=true;
 try{await request("/api/auth/logout",{method:"POST"}).catch(()=>{})}
 finally{
  try{sessionStorage.removeItem("pulso-fit-token")}catch{}
  photo=null;lastSession="";window.dispatchEvent(new CustomEvent("pulso-avatar-changed",{detail:{src:null}}));
  location.hash="#/home";location.reload();
 }
}
function openTool(which){
 const root=document.getElementById("pf-rescue-panel");
 const selector=which==="performance"?
  ".pf-more-performance-card [data-pf-open-performance], [data-pf-open-performance]":
  ".pf-eval-launch";
 const element=document.querySelector("#app "+selector.replaceAll(", ",", #app "));
 if(element&&!root?.contains(element)){element.click();return}
 announce(which==="performance"?"A análise de Performance não está disponível nesta tela.":"Abra sua avaliação após carregar a conta.");
}
function make(){
 const el=document.createElement("section");el.id="pf-rescue-panel";el.className="pf-rescue-panel";el.setAttribute("aria-label","Meu perfil organizado");
 el.innerHTML='<div class="pfrr-hero">'+
 '<div class="pfrr-eyebrow"><span>PULSOFIT / MEU PERFIL</span><span class="pfrr-online">Conta conectada</span></div>'+
 '<div class="pfrr-row"><div class="pfrr-avatar"><img alt="Minha foto de perfil" hidden><span class="pfrr-initials">●</span></div>'+
 '<div class="pfrr-identity"><small>Seu espaço</small><h2 class="pfrr-name">Meu perfil</h2><p class="pfrr-subtitle">Seu espaço de treino personalizado</p></div></div>'+
 '<div class="pfrr-status"><div><small>Plano atual</small><strong class="pfrr-plan">Consultando...</strong></div>'+
 '<div><small>Validade</small><strong class="pfrr-validity">Consultando...</strong></div></div></div>'+
 '<div class="pfrr-manage-plan"><strong>💎 Assinatura e renovação</strong><p class="pfrr-plan-explanation">Consultando seu plano...</p><button type="button" data-pfrr-plan>Gerenciar meu plano</button></div>'+
 '<div class="pfrr-card"><div class="pfrr-cardtop"><span aria-hidden="true">📷</span><div><strong>Minha foto de perfil</strong>'+
 '<small>Escolha uma foto para aparecer no seu cabeçalho</small></div></div>'+
 '<div class="pfrr-photo-actions"><label for="pfrr-upload">Alterar foto'+
 '<input type="file" id="pfrr-upload" accept="image/jpeg,image/png,image/webp,image/*" aria-label="Selecionar foto de perfil"></label>'+
 '<button type="button" data-pfrr-remove>Remover foto</button></div><p class="pfrr-message" id="pfrr-message" role="status" aria-live="polite"></p></div>'+
 '<div class="pfrr-card"><div class="pfrr-cardtop"><span aria-hidden="true">✨</span>'+
 '<div><strong>Minha evolução</strong><small>Acompanhe seus treinos e avaliações em um só lugar</small></div></div>'+
 '<div class="pfrr-tools"><button type="button" data-pfrr-tool="performance"><b>📸 Performance IA</b><small>Análise corporal por foto</small></button>'+
 '<button type="button" data-pfrr-tool="assessment"><b>📈 Avaliação e progresso</b><small>Seu método e histórico de treinos</small></button></div></div>'+
 '<div class="pfrr-footer"><p>Suas informações estão vinculadas à sua conta.</p>'+
 '<button type="button" data-pfrr-logout>Sair da conta</button></div>';
 el.querySelector("#pfrr-upload").addEventListener("change",function(){void upload(this.files?.[0])});
 el.querySelector("[data-pfrr-remove]").addEventListener("click",function(){void removePhoto()});
 el.querySelector("[data-pfrr-plan]").addEventListener("click",()=>window.dispatchEvent(new Event("pulso-open-plan-manager")));
 el.querySelector("[data-pfrr-logout]").addEventListener("click",function(){void logout()});
 el.querySelectorAll("[data-pfrr-tool]").forEach(button=>button.addEventListener("click",function(){openTool(button.dataset.pfrrTool)}));
 return el;
}
function reconcile(){
 if(currentRoute()!=="profile"||!ok()){
  document.body.classList.remove("pf-rescue-active");
  return;
 }
 const app=document.getElementById("app"),cover=app?.querySelector(".profile-cover");
 if(!app||!cover)return;
 const parent=cover.parentElement;if(!parent)return;
 document.body.classList.add("pf-rescue-active");
 parent.classList.add("pf-rescue-host");
 let root=app.querySelector("#pf-rescue-panel");
 if(!root){root=make();parent.insertBefore(root,cover);lastSync=0}
 else if(root.parentNode!==parent)parent.insertBefore(root,cover);
 // Always preserve the native components' click handlers for the two features,
 // while presenting only the clean, independently sized dashboard.
 void update();
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;reconcile()})}
function init(){
 const style=document.createElement("style");style.id="pf-rescue-styles";style.textContent=css;(document.head||document.documentElement).appendChild(style);
 const app=document.getElementById("app");if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
 window.addEventListener("hashchange",schedule);
 window.addEventListener("pulso-auth-ready",schedule);
 window.addEventListener("pageshow",schedule);
 setInterval(schedule,3200);
 schedule();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();