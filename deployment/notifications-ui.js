/* ARGUS Payments — opt-in Web Push + Home Screen installation guide. */
(function(){
"use strict";
const isAdmin=/^\/(?:admin|operacao)?\/?$/.test(location.pathname), apiBase=isAdmin?"/api/admin/notifications":"/api/portal/notifications";
const sessionUrl=isAdmin?"/api/admin/session":"/api/portal/session";
const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1;
const installed=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
let root,registration,loaded=false,lastCheck=0,info=null,installPrompt=null,platform=ios?"ios":"android",open=false;
const $=x=>document.getElementById(x);
const escapeHTML=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cookie=name=>decodeURIComponent(((document.cookie.match(new RegExp("(?:^|;\\s*)"+name+"=([^;]*)"))||[])[1]||""));
const csrf=()=>cookie(isAdmin?"arg_admin_csrf":"arg_portal_csrf");
async function api(path,method="GET",body){
 const options={method,credentials:"same-origin",cache:"no-store",headers:{"Accept":"application/json","X-CSRF-Token":csrf()}};
 if(body!==undefined){options.headers["Content-Type"]="application/json";options.body=JSON.stringify(body);}
 const response=await fetch(apiBase+path,options),res=await response.json().catch(()=>({detail:"Resposta inválida do servidor"}));
 if(!response.ok)throw Error(res.detail||"Não foi possível concluir.");return res;
}
function feedback(text,err){const x=$("an-status");if(x){x.textContent=text;x.style.color=err?"#ffb6b6":"#bfedca";}}
function switchTab(tab){
 for(const name of ["inbox","install","prefs"]){$("an-"+name).hidden=tab!==name;$("an-tab-"+name).classList.toggle("active",tab===name);}
 if(tab==="install")guide();
}
function guide(){
 $("an-platform-ios").classList.toggle("active",platform==="ios");
 $("an-platform-android").classList.toggle("active",platform==="android");
 $("an-guide").innerHTML=platform==="ios"?
  "<b>iPhone / iPad</b><ol><li>Abra o ARGUS no <b>Safari</b>.</li><li>Toque em <b>Compartilhar</b> (quadrado com seta para cima).</li><li>Escolha <b>Adicionar à Tela de Início</b> e confirme.</li><li>Abra o ícone A do ARGUS criado na tela inicial.</li><li>Toque em <b>Ativar notificações</b> e permita os avisos.</li></ol><small>Notificações no iPhone exigem iOS 16.4 ou mais recente e o app na Tela de Início.</small>":
  "<b>Android</b><ol><li>Abra o ARGUS no <b>Chrome</b>.</li><li>Abra o menu <b>⋮</b>.</li><li>Toque em <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.</li><li>Abra o ícone A do ARGUS.</li><li>Toque em <b>Ativar notificações</b> e permita os avisos.</li></ol><small>O aviso pode ser alterado nas configurações de notificações do navegador.</small>";
 $("an-installed").textContent=installed()?"✓ ARGUS aberto como aplicativo instalado.":"É possível instalar o ARGUS sem baixar APK ou IPA.";
 $("an-install-button").hidden=!installPrompt||installed();
}
function build(){
 root=document.createElement("div");root.id="argus-notification-widget";
 root.innerHTML='<button type="button" id="an-bell" aria-label="Abrir notificações">🔔<span id="an-badge" hidden></span></button>'+
 '<section id="an-box" hidden><header><div><small>ARGUS PAYMENTS</small><h2>Notificações</h2></div><button id="an-close" aria-label="Fechar" type="button">✕</button></header>'+
 '<nav><button class="active" id="an-tab-inbox" type="button">Avisos</button><button id="an-tab-install" type="button">Instalação</button><button id="an-tab-prefs" type="button">Preferências</button></nav>'+
 '<div id="an-inbox" class="an-body"><p>Carregando avisos...</p></div>'+
 '<div id="an-install" class="an-body" hidden><p>Receba avisos de Pix e da sua conta diretamente no celular.</p><div class="an-platform"><button type="button" id="an-platform-ios">iPhone / iOS</button><button type="button" id="an-platform-android">Android</button></div>'+
 '<div id="an-guide"></div><p id="an-installed"></p><button type="button" id="an-install-button" hidden>Instalar ARGUS</button><button type="button" id="an-activate">🔔 Ativar notificações</button><button type="button" id="an-test">Enviar aviso de teste</button><button type="button" id="an-deactivate">Desativar neste aparelho</button><p id="an-server-status"></p></div>'+
 '<div id="an-prefs" class="an-body" hidden><label><input type="checkbox" id="an-received"> Pix recebidos e confirmados</label>'+
 '<label><input type="checkbox" id="an-sent"> Pix enviados e confirmados</label><label><input type="checkbox" id="an-announcements"> Avisos e novidades</label>'+
 '<label><input type="checkbox" id="an-amount"> Mostrar o valor no celular</label><button id="an-save" type="button">Salvar preferências</button>'+
 (isAdmin?'<section id="an-broadcast-block" hidden><h3>Comunicar aos usuários</h3><label>Título<input id="an-message-title" maxlength="100"></label><label>Mensagem<textarea id="an-message-body" rows="3" maxlength="280"></textarea></label><label>Público<select id="an-message-audience"><option value="clients">Clientes</option><option value="team">Equipe interna</option><option value="all">Todos</option></select></label><button type="button" id="an-send-broadcast">Enviar comunicado</button></section>':'')+
 '</div><p id="an-status" role="status" aria-live="polite"></p></section>';
 document.body.appendChild(root);
 $("an-bell").onclick=()=>{open=!open;$("an-box").hidden=!open;if(open)refresh();};
 $("an-close").onclick=()=>{open=false;$("an-box").hidden=true;};
 for(const name of ["inbox","install","prefs"])$("an-tab-"+name).onclick=()=>switchTab(name);
 $("an-platform-ios").onclick=()=>{platform="ios";guide();};
 $("an-platform-android").onclick=()=>{platform="android";guide();};
 $("an-install-button").onclick=async()=>{if(!installPrompt)return;const p=installPrompt;installPrompt=null;await p.prompt();await p.userChoice;guide();};
 $("an-activate").onclick=enable;
 $("an-deactivate").onclick=disable;
 $("an-test").onclick=async()=>{try{const x=await api("/test","POST",{});feedback(x.message);await refresh();}catch(e){feedback(e.message,true);}};
 $("an-save").onclick=async()=>{
  const prefs={pix_received:$("an-received").checked,pix_sent:$("an-sent").checked,announcements:$("an-announcements").checked,show_amount:$("an-amount").checked};
  try{await api("/preferences","POST",prefs);feedback("Preferências salvas!");await refresh();}catch(e){feedback(e.message,true);}
 };
 if(isAdmin)$("an-send-broadcast").onclick=async()=>{
  const title=$("an-message-title").value.trim(),message=$("an-message-body").value.trim(),audience=$("an-message-audience").value;
  if(title.length<4||message.length<8){feedback("Digite um título e mensagem válidos.",true);return;}
  if(!confirm("Enviar este aviso aos destinatários selecionados?"))return;
  try{const res=await api("/announce","POST",{title,message,audience});feedback("Comunicado registrado para "+res.recipients+" usuários.");$("an-message-body").value="";}catch(e){feedback(e.message,true);}
 };
 $("an-inbox").onclick=async e=>{const b=e.target.closest("[data-read]");if(!b)return;try{await api("/"+encodeURIComponent(b.dataset.read)+"/read","POST",{});await refresh();}catch(err){feedback(err.message,true);}};
 guide();
}
function renderNotifications(rows){
 $("an-inbox").innerHTML=rows.length?rows.map(x=>'<article class="an-notice"><span class="an-emoji">'+(x.category==="pix.received"?"🐶":x.category==="pix.sent"?"💸":"📣")+'</span><div><b>'+escapeHTML(x.title)+'</b><p>'+escapeHTML(x.body)+'</p><small>'+escapeHTML(x.created_at)+'</small></div>'+(x.read_at?"":'<button type="button" title="Marcar como lido" data-read="'+escapeHTML(x.id)+'">✓</button>')+'</article>').join(""):'<p>Seus avisos aparecerão aqui. Nenhuma cobrança de teste será exibida como recebida.</p>';
}
async function refresh(){
 try{
  info=await api("");lastCheck=Date.now();renderNotifications(info.notifications||[]);
  $("an-badge").hidden=!info.unread;$("an-badge").textContent=info.unread>99?"99+":String(info.unread);
  const pref=info.preferences||{};
  $("an-received").checked=!!pref.pix_received;$("an-sent").checked=!!pref.pix_sent;$("an-announcements").checked=!!pref.announcements;$("an-amount").checked=!!pref.show_amount;
  $("an-server-status").textContent=info.push_available?"Servidor Push configurado.":"Avisos internos disponíveis; notificações do sistema dependem de ativação no servidor.";
  if(isAdmin){const r=await fetch("/api/admin/session",{credentials:"same-origin",cache:"no-store"}).then(x=>x.json()).catch(()=>null);$("an-broadcast-block").hidden=r?.user?.role!=="superadmin";}
 }catch(e){feedback(e.message,true);}
}
function keyBytes(value){const raw=atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function enable(){
 if(!("Notification" in window)||!("serviceWorker" in navigator)||!("PushManager" in window)){feedback("Este navegador não oferece Push Web.",true);return;}
 if(ios&&!installed()){feedback("No iPhone, instale primeiro pela opção Adicionar à Tela de Início e abra o ícone ARGUS.",true);return;}
 if(!info?.push_available){feedback("O envio Push ainda não está configurado no servidor.",true);return;}
 try{
  // Safari requires the permission request to originate from a user click.
  const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
  if(permission!=="granted"){feedback("Permissão negada. Abra as configurações de notificações do aparelho.",true);return;}
  registration=registration||await navigator.serviceWorker.register("/sw.js",{scope:"/"});
  const existing=await registration.pushManager.getSubscription();
  const subscription=existing||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(info.vapid_public)});
  try{await api("/subscribe","POST",{subscription:subscription.toJSON()});}
  catch(error){if(!existing)await subscription.unsubscribe().catch(()=>{});throw error;}
  feedback("Notificações ativadas para este aparelho!");
 }catch(e){feedback(e.message,true);}
}
async function disable(){
 try{
  const reg=registration||await navigator.serviceWorker.getRegistration("/");
  const sub=reg?await reg.pushManager.getSubscription():null;
  if(sub){await api("/unsubscribe","POST",{endpoint:sub.endpoint});await sub.unsubscribe();}
  feedback("Notificações desativadas neste aparelho.");
 }catch(e){feedback(e.message,true);}
}
async function checkSession(){
 const res=await fetch(sessionUrl,{credentials:"same-origin",cache:"no-store"}).catch(()=>null);
 if(!res||!res.ok){if(root){root.remove();root=null;}return;}
 if(!root)build();if(Date.now()-lastCheck>60000)refresh();
}
async function init(){
 if(!isSecureContext)return;
 if("serviceWorker" in navigator)try{registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});}catch{}
 await checkSession();setInterval(checkSession,12000);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkSession();});
}
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;if(root)guide();});
window.addEventListener("appinstalled",()=>{installPrompt=null;if(root)guide();});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
