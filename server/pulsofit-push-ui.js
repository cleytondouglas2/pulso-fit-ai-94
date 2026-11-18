/* PulsoFit AI • PWA installation & push notification onboarding.
 * Permission is NEVER requested on app load; only from button gesture.
 * iPhone/iPad: Home Screen-installed PWA required for Web Push.
 */
(function(){
"use strict";
if(window.__PULSO_PUSH_UI_20261118__)return;
window.__PULSO_PUSH_UI_20261118__=true;
const IOS=/iPad|iPhone|iPod/i.test(navigator.userAgent)||navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1;
const ANDROID=/Android/i.test(navigator.userAgent);
let banner=null,modal=null,reg=null,serverKey="",current=null,installPrompt=null,loading=false,seenToken="",scheduled=false;
let ready=false,deviceEnabled=false,lastStatus="",selectedHour=9,selectedTraining=true,selectedPerformance=true,selectedWellness=true,selectedFrequency=3;
const token=()=>{try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}};
const logged=()=>!!token()&&!document.body.classList.contains("pf-account-locked");
const home=()=>String(location.hash||"#/home").replace(/^#\/?/,"").split("/")[0].toLowerCase()==="home";
const installed=()=>window.matchMedia?.("(display-mode: standalone)").matches||navigator.standalone===true;
const features=()=>Boolean(window.isSecureContext&&"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window);
const firstHour=h=>Number.isInteger(Number(h))?Number(h):9;
function safe(t){return String(t||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function fromB64(v){const b=atob(v.replace(/-/g,"+").replace(/_/g,"/"));const a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}
function setText(id,value){const e=document.getElementById(id);if(e)e.textContent=value}
function setState(t,error=false){lastStatus=t;const x=document.getElementById("pf-push-status");if(x){x.textContent=t;x.classList.toggle("pf-push-error",!!error)}}
async function api(path,options={}){
 const tk=token();
 const response=await fetch(path,{...options,cache:"no-store",
  headers:{"Authorization":"Bearer "+tk,...(options.headers||{})},
  signal:AbortSignal.timeout(14000)});
 let data;try{data=await response.json()}catch{data={}}
 if(!response.ok)throw Error(data.error||"O servidor não respondeu.");
 return data;
}
async function bootstrap(){
 if(!logged()||!features())return;
 const t=token();if(ready&&seenToken===t)return;
 seenToken=t;
 try{
  const out=await Promise.all([
   navigator.serviceWorker.register("/pulsofit-sw.js",{scope:"/"}),
   api("/api/push/config")
  ]);
  reg=out[0];serverKey=out[1].publicKey;
  if(!reg.active)reg=await navigator.serviceWorker.ready;
  if(!serverKey||fromB64(serverKey).length!==65)throw Error("Chave push indisponível.");
  current=await reg.pushManager.getSubscription();
  if(current){
   const data=await api("/api/push/status");
   const mine=(data.devices||[]).find(x=>x.endpoint===current.endpoint);
   deviceEnabled=!!mine?.enabled;
   if(mine){
    selectedHour=firstHour(mine.reminderHour);
    selectedTraining=mine.training!==false;
    selectedPerformance=mine.performance!==false;
    selectedWellness=mine.wellness!==false;
    selectedFrequency=[1,2,3].includes(Number(mine.tipsPerDay))?Number(mine.tipsPerDay):3;
   }
  }else deviceEnabled=false;
  ready=true;
  updateBanner();updateDialog();
 }catch(e){
  ready=false;setState("Serviço de notificações indisponível: "+String(e.message||e),true);
  updateDialog();
 }
}
function copyPreferences(){
 const hour=document.getElementById("pf-push-hour"),training=document.getElementById("pf-push-training"),performance=document.getElementById("pf-push-performance"),wellness=document.getElementById("pf-push-wellness"),frequency=document.getElementById("pf-push-frequency");
 if(hour)selectedHour=firstHour(hour.value);
 if(training)selectedTraining=training.checked;
 if(performance)selectedPerformance=performance.checked;
 if(wellness)selectedWellness=wellness.checked;
 if(frequency)selectedFrequency=[1,2,3].includes(Number(frequency.value))?Number(frequency.value):3;
}
function timezone(){return Intl.DateTimeFormat().resolvedOptions().timeZone||"America/Sao_Paulo"}
function payload(subscription,extra={}){
 return {subscription:subscription.toJSON(),reminderHour:selectedHour,training:selectedTraining,
  performance:selectedPerformance,wellness:selectedWellness,tipsPerDay:selectedFrequency,timezone:timezone(),
  platform:IOS?"ios":ANDROID?"android":"web",...extra};
}
async function subscribe(){
 if(loading)return;
 if(IOS&&!installed()){setState("Primeiro adicione o PulsoFit à Tela de Início e abra pelo ícone. Veja o tutorial abaixo.",true);return}
 if(!features()){setState("Este navegador não oferece push. Instale e abra o aplicativo pelo ícone.",true);return}
 if(Notification.permission==="denied"){setState("Permissão bloqueada. Abra Ajustes > Notificações > PulsoFit e permita avisos, ou revise as permissões do navegador.",true);return}
 if(!reg||!serverKey){setState("Preparando o serviço de notificações…");await bootstrap();if(!reg||!serverKey)return}
 copyPreferences();
 // Respect user gesture: permission is requested only inside this click handler.
 let permission=Notification.permission;
 if(permission!=="granted"){
  try{permission=await Notification.requestPermission()}
  catch(e){setState("Não foi possível solicitar permissão: "+String(e.message||e),true);return}
 }
 if(permission!=="granted"){setState("Sem autorização do celular. O PulsoFit não enviará notificações.",true);return}
 loading=true;toggleButtons();
 try{
  current=await reg.pushManager.getSubscription();
  if(!current)current=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:fromB64(serverKey)});
  await api("/api/push/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload(current))});
  deviceEnabled=true;ready=true;
  setState("✅ Notificações ativadas neste celular! Use 'Enviar teste' para verificar o recebimento.");
  updateBanner();updateDialog();
 }catch(e){deviceEnabled=false;setState("Não foi possível ativar: "+String(e.message||e),true)}
 finally{loading=false;toggleButtons()}
}
async function savePreferences(){
 if(!current||!deviceEnabled){setState("Ative as notificações primeiro.",true);return}
 copyPreferences();loading=true;toggleButtons();
 try{
  await api("/api/push/preferences",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload(current))});
  setState("Horário e assuntos atualizados para este celular.");
 }catch(e){setState("Não foi possível salvar: "+e.message,true)}
 finally{loading=false;toggleButtons()}
}
async function sendTest(){
 if(!current||!deviceEnabled){setState("Ative as notificações antes do teste.",true);return}
 loading=true;toggleButtons();
 try{
  const result=await api("/api/push/test",{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({endpoint:current.endpoint})});
  setState(result.acceptedByPushService?"✅ Teste aceito pelo serviço de push. Confira a Central de Notificações.":"Não foi possível concluir o teste.");
 }catch(e){setState("Falha ao enviar teste: "+e.message,true)}
 finally{loading=false;toggleButtons()}
}
async function disable(){
 if(!current||loading)return;
 if(!confirm("Desativar notificações do PulsoFit neste aparelho?"))return;
 loading=true;toggleButtons();
 try{
  await api("/api/push/unsubscribe",{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({endpoint:current.endpoint})});
  await current.unsubscribe();
  current=null;deviceEnabled=false;setState("Notificações desativadas neste dispositivo.");
  updateDialog();updateBanner();
 }catch(e){setState("Não foi possível desativar: "+e.message,true)}
 finally{loading=false;toggleButtons()}
}
function toggleButtons(){
 ["pf-push-activate","pf-push-save","pf-push-test","pf-push-disable"].forEach(id=>{
  const e=document.getElementById(id);if(e)e.disabled=loading;
 });
}
function osGuide(){
 if(IOS)return '<div class="pf-push-steps"><h4>🍎 iPhone / iPad — instalar pela Tela de Início</h4>'+
 '<ol><li>Abra este site no <b>Safari</b> do iPhone.</li>'+
 '<li>Toque em <b>Compartilhar</b> (quadrado com seta para cima).</li>'+
 '<li>Selecione <b>Adicionar à Tela de Início</b> e confirme em <b>Adicionar</b>.</li>'+
 '<li>Volte à Tela de Início e <b>abra o PulsoFit pelo ícone criado</b>.</li>'+
 '<li>No aplicativo instalado, toque em <b>Ativar notificações</b> e permita os avisos.</li></ol>'+
 '<p>Necessário iOS/iPadOS 16.4 ou posterior. Uma aba comum do Safari não oferece push no iPhone.</p></div>';
 return '<div class="pf-push-steps"><h4>🤖 Android — instalar na Tela Inicial</h4>'+
 '<ol><li>Abra o PulsoFit no <b>Chrome</b> do Android.</li>'+
 '<li>Toque em <b>⋮</b> (menu do navegador).</li>'+
 '<li>Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>'+
 '<li>Confirme a instalação e <b>abra o PulsoFit pelo novo ícone</b>.</li>'+
 '<li>Toque em <b>Ativar notificações</b> e confirme <b>Permitir</b>.</li></ol>'+
 '<p>Se não aparecer a opção de instalar, use o menu ⋮ e procure “Adicionar à tela inicial”.</p></div>';
}
function guideMarkup(){
 const installStatus=installed()?"<span class='pf-push-ok'>✓ Aplicativo aberto pelo ícone da Tela de Início</span>":
 IOS?"<span>Adicione à Tela de Início antes de ativar push no iPhone.</span>":
 "<span>Para melhor experiência, instale o ícone na tela inicial.</span>";
 const p=typeof Notification!=="undefined"?Notification.permission:"unsupported";
 return '<div class="pf-push-install-state">'+installStatus+'</div>'+
 '<div class="pf-push-permission">Estado da permissão: <strong>'+esc(p==="granted"?"Permitida":p==="denied"?"Bloqueada":p==="default"?"Ainda não solicitada":"Não disponível")+'</strong></div>'+
 osGuide();
}
function renderDialog(){
 if(!modal?.isConnected)return;
 const b=modal.querySelector(".pf-push-dialog-body");if(!b)return;
 b.innerHTML='<div class="pf-push-hero"><span aria-hidden="true">🔔</span>'+
 '<div><h3>Bom dia, com dicas só para você!</h3><p>Receba até três mensagens ao longo do dia: treino, recuperação, saúde e evolução — com seu nome cadastrado.</p></div></div>'+
 '<div class="pf-push-guide">'+guideMarkup()+'</div>'+
 '<div class="pf-push-config"><h4>Escolha como quer ser lembrado</h4>'+
 '<label class="pf-push-label">Horário diário <select id="pf-push-hour">'+Array.from({length:16},(_,i)=>i+6).map(h=>
 '<option value="'+h+'"'+(h===selectedHour?" selected":"")+'>'+String(h).padStart(2,"0")+":00</option>").join("")+'</select></label>'+
 '<label class="pf-push-check"><input id="pf-push-training" type="checkbox"'+(selectedTraining?" checked":"")+'> <span>💪 Lembretes de treino</span></label>'+
 '<label class="pf-push-check"><input id="pf-push-performance" type="checkbox"'+(selectedPerformance?" checked":"")+'> <span>📈 Evolução e constância semanal</span></label>'+
 '<label class="pf-push-check"><input id="pf-push-wellness" type="checkbox"'+(selectedWellness?" checked":"")+'> <span>💚 Saúde, hidratação, sono e recuperação</span></label>'+
 '<label class="pf-push-label">Dicas por dia <select id="pf-push-frequency">'+
 [1,2,3].map(n=>'<option value="'+n+'"'+(selectedFrequency===n?" selected":"")+'>'+n+(n===1?" mensagem":" mensagens")+'</option>').join("")+
 '</select></label><p class="pf-push-info">Os avisos são enviados a partir do horário escolhido, com intervalos aproximados de quatro horas. Entre 6h e 21h, nunca à noite. A quantidade efetiva pode ser menor conforme o horário inicial e a disponibilidade do servidor.</p></div>'+
 '<div class="pf-push-actions">'+
 '<button type="button" id="pf-push-install" class="pf-push-secondary"'+(installed()?" hidden":"")+'>📲 '+(ANDROID?"Instalar no Android":"Como adicionar o ícone")+'</button>'+
 '<button type="button" id="pf-push-activate" class="pf-push-primary">'+(deviceEnabled?"✓ Reativar dispositivo":"🔔 Ativar notificações")+'</button>'+
 '<button type="button" id="pf-push-save" class="pf-push-secondary"'+(!deviceEnabled?" hidden":"")+'>Salvar horário e preferências</button>'+
 '<button type="button" id="pf-push-test" class="pf-push-secondary"'+(!deviceEnabled?" hidden":"")+'>Enviar teste</button>'+
 '<button type="button" id="pf-push-disable" class="pf-push-muted"'+(!deviceEnabled?" hidden":"")+'>Desativar neste aparelho</button>'+
 '</div><p class="pf-push-live" role="status" aria-live="polite" id="pf-push-status">'+esc(lastStatus||"Ative apenas quando desejar. Você controla o horário e as permissões.")+'</p>'+
 '<p class="pf-push-limit"><b>Importante:</b> com o PulsoFit hospedado no Render gratuito, o servidor pode suspender ao ficar inativo. Por isso, lembretes programados podem atrasar ou não chegar até o servidor voltar. O sistema de push funciona com o app fechado quando o servidor envia uma mensagem e o celular está apto a recebê-la. A entrega também depende da internet e das configurações de bateria/notificações do aparelho.</p>';
 b.querySelector("#pf-push-install")?.addEventListener("click",promptInstall);
 b.querySelector("#pf-push-activate")?.addEventListener("click",subscribe);
 b.querySelector("#pf-push-save")?.addEventListener("click",savePreferences);
 b.querySelector("#pf-push-test")?.addEventListener("click",sendTest);
 b.querySelector("#pf-push-disable")?.addEventListener("click",disable);
 toggleButtons();
}
function updateDialog(){renderDialog()}
function open(){
 if(!logged())return;
 if(modal?.isConnected){return}
 modal=document.createElement("div");modal.id="pf-push-overlay";
 modal.innerHTML='<section class="pf-push-sheet" role="dialog" aria-modal="true" aria-labelledby="pf-push-title">'+
 '<header class="pf-push-head"><div><span>PULSOFIT AI · NOTIFICAÇÕES</span><h2 id="pf-push-title">Acompanhe seu rendimento <b>todos os dias</b></h2></div>'+
 '<button type="button" aria-label="Fechar painel" id="pf-push-close">×</button></header>'+
 '<div class="pf-push-dialog-body"></div></section>';
 modal.addEventListener("click",e=>{if(e.target===modal)close()});
 modal.querySelector("#pf-push-close").addEventListener("click",close);
 document.body.appendChild(modal);document.addEventListener("keydown",onKey);
 renderDialog();
 void bootstrap();
 modal.querySelector("#pf-push-close").focus();
}
function onKey(e){if(e.key==="Escape")close()}
function close(){modal?.remove();modal=null;document.removeEventListener("keydown",onKey)}
async function promptInstall(){
 if(installed()){setState("O aplicativo já está na Tela de Início.");return}
 if(installPrompt){
  const event=installPrompt;installPrompt=null;
  try{await event.prompt();await event.userChoice}catch{}
  updateDialog();return;
 }
 setState(IOS?"No Safari, toque em Compartilhar → Adicionar à Tela de Início e abra pelo ícone.":"No Chrome, toque no menu ⋮ → Instalar app ou Adicionar à tela inicial.");
}
function updateBanner(){
 if(!banner?.isConnected)return;
 const badge=banner.querySelector(".pf-push-callout-icon"),title=banner.querySelector(".pf-push-callout-title"),text=banner.querySelector(".pf-push-callout-desc");
 if(deviceEnabled){
  if(badge)badge.textContent="✅";
  if(title)title.textContent="Notificações do PulsoFit ativadas";
  if(text)text.textContent="Toque para ajustar horário, desempenho ou enviar um teste.";
 }else{
  if(badge)badge.textContent="🔔";
  if(title)title.textContent="Não perca seu próximo treino!";
  if(text)text.textContent=IOS&&!installed()?"Adicione o PulsoFit à Tela de Início para liberar as notificações.":"Receba bom dia com seu nome e até 3 dicas diárias de treino, saúde e desempenho.";
 }
}
function placeBanner(){
 if(!logged()||!home())return;
 const app=document.getElementById("app"),area=app?.querySelector(".main")||app?.querySelector("main");
 if(!area)return;
 banner=area.querySelector("#pf-push-callout");
 if(banner){updateBanner();return}
 banner=document.createElement("button");banner.type="button";banner.id="pf-push-callout";
 banner.innerHTML='<span class="pf-push-callout-icon" aria-hidden="true">🔔</span>'+
 '<span class="pf-push-callout-copy"><strong class="pf-push-callout-title">Não perca seu próximo treino!</strong>'+
 '<small class="pf-push-callout-desc">Notificações de treino e desempenho com o app fechado.</small></span>'+
 '<span class="pf-push-callout-arrow" aria-hidden="true">›</span>';
 banner.addEventListener("click",open);
 const greet=area.querySelector("#pf-home-welcome");
 if(greet)greet.insertAdjacentElement("afterend",banner);
 else area.insertBefore(banner,area.firstElementChild);
 updateBanner();
}
function schedule(){
 if(scheduled)return;
 scheduled=true;requestAnimationFrame(()=>{scheduled=false;try{placeBanner()}catch{}});
}
function boot(){
 const app=document.getElementById("app");
 if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
 window.addEventListener("hashchange",schedule);
 window.addEventListener("pageshow",schedule);
 window.addEventListener("pulso-auth-ready",()=>{void bootstrap();schedule()});
 window.addEventListener("pulso-open-push-settings",open);
 window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e});
 window.addEventListener("appinstalled",()=>{installPrompt=null;updateDialog();schedule()});
 setTimeout(()=>{void bootstrap();schedule()},1300);
 setInterval(()=>{if(logged()&&seenToken!==token()){ready=false;deviceEnabled=false;current=null;void bootstrap()}},45000);
 schedule();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
else boot();
})();
