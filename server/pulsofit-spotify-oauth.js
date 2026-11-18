/* PulsoFit: Spotify Web API via Authorization Code + PKCE.
 * No pasted links; the user authorizes directly at Spotify and then selects
 * their own playlists or searches the catalog. No client secret in browser.
 * Audio is played via Spotify's official embed; no download or audio proxy.
 */
(function(){
"use strict";
if(window.__PULSO_SPOTIFY_OAUTH__)return;window.__PULSO_SPOTIFY_OAUTH__=true;
const $=id=>document.getElementById(id);
const pendingKey="pf-spotify-pkce-v1",authKey="pf-spotify-session-v1";
let config=null,playlists=[],results=[],busy=false,queued=false,dialog=null,accountId="",checking=false;
const sessionToken=()=>{try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}};
const oauthSession=()=>{try{const x=JSON.parse(sessionStorage.getItem(authKey)||"null");return x&&x.access_token&&x.expires_at>Date.now()+60000?x:null}catch{return null}};
function authRaw(){try{return JSON.parse(sessionStorage.getItem(authKey)||"null")}catch{return null}}
function storeAuth(value){try{if(value)sessionStorage.setItem(authKey,JSON.stringify(value));else sessionStorage.removeItem(authKey)}catch{}}
function say(msg){const node=$("pf-spotify-state");if(node)node.textContent=msg}
function randomString(len=48){
 const arr=new Uint8Array(len);crypto.getRandomValues(arr);
 return Array.from(arr,b=>"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[b%66]).join("");
}
function toBase64URL(arr){
 let binary="";for(const n of new Uint8Array(arr))binary+=String.fromCharCode(n);
 return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function challenge(verifier){
 const bytes=new TextEncoder().encode(verifier);
 return toBase64URL(await crypto.subtle.digest("SHA-256",bytes));
}
async function getConfig(force=false){
 if(config&&!force)return config;
 const r=await fetch("/api/music/spotify/config",{cache:"no-store",signal:AbortSignal.timeout(9000)});
 if(!r.ok)throw Error("Não foi possível verificar a conexão oficial com o Spotify.");
 const incoming=await r.json();
 if(incoming?.redirectUri!=="https://pulso-fit-ai-95-online.onrender.com/")throw Error("O endereço de retorno Spotify não coincide com a URL do PulsoFit.");
 config=incoming;
 return config;
}
function configurationStatus(cfg,reason=""){
 const missing=cfg?.enabled!==true||!cfg.clientId;
 const box=$("pf-spotify-setup-needed"),connect=$("pf-spotify-connect"),retry=$("pf-spotify-retry");
 if(box)box.hidden=!missing;
 if(retry)retry.hidden=!missing;
 if(connect){
  connect.disabled=missing||busy;
  connect.textContent=missing?"Spotify aguardando configuração":"Conectar minha conta Spotify";
  connect.setAttribute("aria-disabled",String(missing));
 }
 if(missing){
  storeAuth(null);playlists=[];results=[];
  $("pf-spotify-embed")?.replaceChildren();
  const connected=$("pf-spotify-connected");if(connected)connected.hidden=true;
  say(reason||"A conexão Spotify ainda não foi ativada no PulsoFit. É necessário cadastrar o Client ID do aplicativo Spotify no servidor. Não informe sua senha nem cole links.");
 }
 return !missing;
}
async function connect(){
 if(!sessionToken()){say("Entre na sua conta PulsoFit antes de conectar seu Spotify.");return}
 if(!window.isSecureContext||!crypto?.subtle){say("A autorização Spotify exige HTTPS e um navegador atualizado.");return}
 if(busy)return;busy=true;
 try{
  const cfg=await getConfig(true);
  if(!configurationStatus(cfg))return;
  const verifier=randomString(64),state=randomString(34),codeChallenge=await challenge(verifier);
  const pending={verifier,state,createdAt:Date.now(),returnTo:String(location.hash||"#/home").slice(0,100)};
  sessionStorage.setItem(pendingKey,JSON.stringify(pending));
  const url=new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("response_type","code");
  url.searchParams.set("client_id",cfg.clientId);
  url.searchParams.set("redirect_uri",cfg.redirectUri);
  url.searchParams.set("scope",cfg.scope||"playlist-read-private playlist-read-collaborative");
  url.searchParams.set("code_challenge_method","S256");
  url.searchParams.set("code_challenge",codeChallenge);
  url.searchParams.set("state",state);
  say("Abrindo o site oficial do Spotify para você autorizar suas playlists…");
  window.location.assign(url.href);
 }catch(err){say(String(err?.message||"Não foi possível abrir a autorização Spotify."))}
 finally{busy=false;updateControls()}
}
async function fetchToken(body){
 const r=await fetch("https://accounts.spotify.com/api/token",{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams(body),cache:"no-store",signal:AbortSignal.timeout(16000)
 });
 const json=await r.json().catch(()=>({}));
 if(!r.ok||!json.access_token)throw Error(json.error_description||"O Spotify não autorizou a conexão. Tente novamente.");
 const old=authRaw();
 storeAuth({access_token:json.access_token,refresh_token:json.refresh_token||old?.refresh_token||null,
  expires_at:Date.now()+Math.max(60,Number(json.expires_in)||3600)*1000,scope:json.scope||""});
 return json;
}
async function refreshToken(){
 const previous=authRaw();if(!previous?.refresh_token)return false;
 const cfg=await getConfig();
 if(!cfg.enabled)return false;
 try{
  await fetchToken({grant_type:"refresh_token",refresh_token:previous.refresh_token,client_id:cfg.clientId});
  return true;
 }catch{storeAuth(null);return false}
}
async function spotifyFetch(path,params={}){
 let auth=oauthSession();
 if(!auth){if(!await refreshToken())throw Error("Sua conexão expirou. Toque em Conectar ao Spotify novamente.");auth=oauthSession()}
 const url=new URL("https://api.spotify.com/v1"+path);
 for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
 const run=t=>fetch(url.href,{headers:{Authorization:"Bearer "+t},cache:"no-store",signal:AbortSignal.timeout(13000)});
 let r=await run(auth.access_token);
 if(r.status===401&&await refreshToken())r=await run(oauthSession().access_token);
 if(r.status===429)throw Error("O Spotify está limitando as consultas. Tente mais tarde.");
 if(r.status===403)throw Error("O Spotify restringiu esta conta ou aplicativo. Verifique Premium, permissões e usuários permitidos no modo de desenvolvimento.");
 if(!r.ok)throw Error("O Spotify não pôde consultar as playlists (HTTP "+r.status+").");
 return r.json();
}
async function identity(){
 const token=sessionToken();
 if(!token||checking)return;
 checking=true;
 try{
  const r=await fetch("/api/me",{headers:{Authorization:"Bearer "+token},cache:"no-store",signal:AbortSignal.timeout(6000)});
  if(!r.ok)return;
  const data=await r.json(),id=String((data.user||data).id||"");
  if(token!==sessionToken()||!/^[a-f0-9-]{36}$/i.test(id))return;
  const raw=authRaw();
  if(accountId&&accountId!==id){storeAuth(null);playlists=[];results=[]}
  if(raw?.pulsoUserId&&raw.pulsoUserId!==id){storeAuth(null);playlists=[];results=[]}
  accountId=id;
  if(raw&&!raw.pulsoUserId)storeAuth({...raw,pulsoUserId:id});
 }catch{}finally{checking=false}
}
function escapeID(item){return /^[A-Za-z0-9]{22}$/.test(item?.id||"")?item.id:null}
function selectedPlaylist(p){
 if(!config?.enabled){configurationStatus(config);return}
 const id=escapeID(p);
 if(!id){say("Playlist inválida. Escolha outro resultado.");return}
 const url="https://open.spotify.com/playlist/"+id;
 const player=$("pf-spotify-embed");
 if(player){
  player.replaceChildren();
  const iframe=document.createElement("iframe");
  iframe.title="Player oficial Spotify — "+String(p.name||"Playlist");
  iframe.src="https://open.spotify.com/embed/playlist/"+id;
  iframe.height="360";iframe.loading="lazy";
  iframe.style.cssText="width:100%;max-width:100%;border:0;border-radius:14px";
  iframe.setAttribute("allow","autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture");
  player.appendChild(iframe);
 }
 const external=$("pf-spotify-open");if(external){external.hidden=false;external.href=url}
 say("Playlist escolhida: "+String(p.name||"Sem título")+". Toque no player oficial para ouvir; a reprodução pode depender da sua conta Spotify.");
 try{localStorage.setItem("pf-spotify-last-playlist-"+accountId,id)}catch{}
}
function draw(list,items){
 const target=$(list);if(!target)return;target.replaceChildren();
 if(!items.length){const empty=document.createElement("p");empty.textContent="Nenhuma playlist encontrada. Escolha outra busca ou atualize a conta.";target.appendChild(empty);return}
 for(const p of items){
  const id=escapeID(p);if(!id)continue;
  const btn=document.createElement("button");btn.type="button";btn.className="pf-spotify-playlist";
  const name=document.createElement("strong");name.textContent=String(p.name||"Playlist").slice(0,100);
  const desc=document.createElement("small");desc.textContent=(p.owner?.display_name?String(p.owner.display_name).slice(0,55)+" · ":"")+"Spotify · Selecionar";
  btn.append(name,desc);btn.addEventListener("click",()=>selectedPlaylist(p));
  target.append(btn);
 }
}
async function loadMine(){
 if(busy||!oauthSession()&&!authRaw()?.refresh_token)return;
 busy=true;say("Carregando suas playlists autorizadas pelo Spotify…");
 try{
  playlists=[];let offset=0;
  for(let page=0;page<5;page++){
   const j=await spotifyFetch("/me/playlists",{limit:50,offset});
   const records=Array.isArray(j.items)?j.items:[];
   playlists.push(...records.filter(x=>escapeID(x)));
   if(!j.next||!records.length)break;
   offset+=records.length;
  }
  draw("pf-spotify-owned",playlists);
  say(playlists.length+" playlist(s) disponível(is) na sua conta Spotify.");
 }catch(e){say(String(e.message||"Não foi possível ler suas playlists."))}
 finally{busy=false;updateControls()}
}
async function search(e){
 e.preventDefault();
 if(busy)return;
 const query=String($("pf-spotify-query")?.value||"").trim();
 if(query.length<2){say("Digite pelo menos duas letras para pesquisar no Spotify.");return}
 busy=true;say("Buscando playlists no Spotify…");
 try{
  const j=await spotifyFetch("/search",{q:query,type:"playlist",limit:10});
  results=(j.playlists?.items||[]).filter(x=>escapeID(x));
  draw("pf-spotify-search-results",results);
  say(results.length+" playlist(s) encontrada(s). Escolha uma para abrir o player oficial.");
 }catch(err){say(String(err?.message||"Busca indisponível."))}
 finally{busy=false;updateControls()}
}
function disconnect(){
 storeAuth(null);playlists=[];results=[];
 $("pf-spotify-embed")?.replaceChildren();
 draw("pf-spotify-owned",[]);
 draw("pf-spotify-search-results",[]);
 updateControls();say("Spotify desconectado deste navegador. Você pode conectar novamente quando quiser.");
}
function updateControls(){
 const connected=Boolean(config?.enabled&&(oauthSession()||authRaw()?.refresh_token));
 const login=$("pf-spotify-connect"),end=$("pf-spotify-logout"),connectedArea=$("pf-spotify-connected");
 if(login){login.hidden=connected;login.disabled=busy||config?.enabled!==true}
 if(end){end.hidden=!connected;end.disabled=busy}
 if(connectedArea)connectedArea.hidden=!connected;
}
async function callback(){
 const url=new URL(location.href);
 const code=url.searchParams.get("code"),state=url.searchParams.get("state"),error=url.searchParams.get("error");
 if(!code&&!error)return;
 let pending;try{pending=JSON.parse(sessionStorage.getItem(pendingKey)||"null")}catch{}
 // Do not interfere with OAuth flows of Google, Apple or the PulsoFit itself.
 if(!pending||!pending.state||pending.state!==state||Date.now()-pending.createdAt>600000)return;
 sessionStorage.removeItem(pendingKey);
 // Prevent replay on refresh and avoid leaving OAuth codes in the address bar.
 url.searchParams.delete("code");url.searchParams.delete("state");url.searchParams.delete("error");
 history.replaceState(null,"",url.pathname+(url.search||"")+(pending.returnTo||url.hash||"#/home"));
 try{
  if(error)throw Error("Você não autorizou o acesso às playlists no Spotify.");
  const cfg=await getConfig();
  await fetchToken({grant_type:"authorization_code",code,redirect_uri:cfg.redirectUri,
   client_id:cfg.clientId,code_verifier:pending.verifier});
  await identity();
  sessionStorage.setItem("pf-spotify-just-connected","1");
  // Reopen the site's own playlist dialog instead of asking for any URL.
  setTimeout(()=>window.dispatchEvent(new Event("pulso-open-playlist")),700);
 }catch(e){
  try{sessionStorage.setItem("pf-spotify-callback-error",String(e.message||"Falha de autorização"))}catch{}
  setTimeout(()=>window.dispatchEvent(new Event("pulso-open-playlist")),700);
 }
}
function mount(){
 const modal=$("pf-companion-modal");if(!modal||dialog===modal&&$("pf-spotify-native"))return;
 dialog=modal;
 const old=$("pf-provider-section");
 if(old){old.hidden=true;old.replaceChildren()}
 const section=document.createElement("section");section.id="pf-spotify-native";
 section.innerHTML='<div class="pf-spotify-header"><div><small>SPOTIFY • INTEGRAÇÃO OFICIAL</small><h3>Escolha músicas direto do Spotify</h3></div><span>♫</span></div>'+
  '<p>Conecte sua conta Spotify, veja suas playlists e pesquise outras. Não precisa copiar links.</p>'+
  '<button type="button" id="pf-spotify-connect" disabled>Verificando conexão oficial…</button>'+
  '<div id="pf-spotify-setup-needed" class="pf-spotify-setup" hidden><strong>Configuração Spotify pendente</strong><p>O PulsoFit precisa de um aplicativo cadastrado no Spotify for Developers. Enquanto o Client ID não for configurado, não abriremos páginas de autenticação incompletas.</p><p>Endereço de retorno: <code>https://pulso-fit-ai-95-online.onrender.com/</code></p><button type="button" id="pf-spotify-retry">↻ Verificar ativação</button></div>'+
  '<div id="pf-spotify-connected" hidden><div class="pf-spotify-actions"><button type="button" id="pf-spotify-refresh">↻ Atualizar minhas playlists</button><button type="button" id="pf-spotify-logout">Desconectar</button></div>'+
  '<h4>Minhas playlists</h4><div id="pf-spotify-owned" class="pf-spotify-grid"></div>'+
  '<form id="pf-spotify-search"><label for="pf-spotify-query">Buscar playlists no Spotify</label><div class="pf-spotify-search-row"><input id="pf-spotify-query" type="search" minlength="2" placeholder="Ex.: treino, cardio, corrida" autocomplete="off"><button type="submit">Buscar</button></div></form>'+
  '<div id="pf-spotify-search-results" class="pf-spotify-grid"></div></div>'+
  '<div id="pf-spotify-embed"></div><a id="pf-spotify-open" target="_blank" rel="noopener noreferrer" hidden>Abrir playlist no Spotify</a>'+
  '<p id="pf-spotify-state" role="status" aria-live="polite">Conecte para carregar suas playlists automaticamente.</p>'+
  '<small>Autorização oficial Spotify (PKCE), sem senha no PulsoFit. O Spotify controla a reprodução, anúncios e assinaturas. No modo de desenvolvimento, o Spotify restringe o número de contas de teste.</small>';
 const anchor=modal.querySelector(".pf-companion-file");
 if(anchor)anchor.insertAdjacentElement("beforebegin",section);
 else modal.querySelector(".pf-companion-card")?.appendChild(section);
 section.querySelector("#pf-spotify-connect").addEventListener("click",()=>void connect());
 section.querySelector("#pf-spotify-retry").addEventListener("click",()=>void (async()=>{
  say("Verificando novamente a configuração do Spotify…");
  try{
   const cfg=await getConfig(true);
   if(configurationStatus(cfg)){say("Spotify ativado! Agora toque em Conectar minha conta Spotify.");updateControls()}
  }catch(err){say(String(err?.message||"Não foi possível verificar a ativação."))}
 })());
 section.querySelector("#pf-spotify-refresh").addEventListener("click",()=>void loadMine());
 section.querySelector("#pf-spotify-logout").addEventListener("click",disconnect);
 section.querySelector("#pf-spotify-search").addEventListener("submit",search);
 void (async()=>{
  await identity();
  updateControls();
  const callbackError=sessionStorage.getItem("pf-spotify-callback-error");
  if(callbackError){sessionStorage.removeItem("pf-spotify-callback-error");say(callbackError)}
  try{
   const cfg=await getConfig(true);
   if(configurationStatus(cfg)){
    updateControls();
    if(oauthSession()||authRaw()?.refresh_token)await loadMine();
    else say("Spotify pronto para conectar. Toque em Conectar minha conta Spotify para autorizar suas playlists.");
   }
  }catch(e){configurationStatus(null,String(e.message||"Spotify indisponível."));updateControls()}
 })();
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})}
function boot(){
 const st=document.createElement("style");st.id="pf-spotify-oauth-style";
 st.textContent="#pf-provider-section{display:none!important}"+
 "#pf-spotify-native{display:grid;gap:11px;margin:14px 0;padding:16px;border:1.5px solid #77dfa5;border-radius:18px;background:linear-gradient(140deg,#163b31,#1e2744);box-sizing:border-box;min-width:0;color:#fff}"+
 "#pf-spotify-native *{box-sizing:border-box;min-width:0}"+
 "#pf-spotify-native .pf-spotify-header{display:flex;justify-content:space-between;align-items:center;gap:12px}"+
 "#pf-spotify-native .pf-spotify-header small{font:900 10px/1.3 system-ui;letter-spacing:.1em;color:#b4ffe2}"+
 "#pf-spotify-native .pf-spotify-header h3{font:900 19px/1.3 system-ui;color:white;margin:4px 0}"+
 "#pf-spotify-native .pf-spotify-header span{font:900 28px system-ui;color:#9dffc2}"+
 "#pf-spotify-native p,#pf-spotify-native>small{font:12px/1.55 system-ui;color:#dbebec;margin:0}"+
 "#pf-spotify-native h4{font:900 14px system-ui;color:#b7ffe0;margin:4px 0}"+
 "#pf-spotify-native button{background:#1f9a61!important;color:white!important;border:1px solid #83e5ad;border-radius:11px;min-height:44px;font:850 13px system-ui;padding:10px}"+
 "#pf-spotify-native button:disabled{opacity:.5}"+
 "#pf-spotify-native #pf-spotify-connect{background:linear-gradient(100deg,#1db954,#147443)!important;font-size:15px}"+
 "#pf-spotify-native .pf-spotify-setup{display:grid;gap:10px;background:#22324c;border:1px solid #e6bb79;border-radius:12px;padding:14px}"+
 "#pf-spotify-native .pf-spotify-setup[hidden],#pf-spotify-native #pf-spotify-retry[hidden]{display:none!important}"+
 "#pf-spotify-native .pf-spotify-setup strong{color:#ffdaa7;font:850 15px system-ui}"+
 "#pf-spotify-native .pf-spotify-setup code{color:#a8ffe3;font:12px/1.6 monospace;overflow-wrap:anywhere}"+
 "#pf-spotify-native .pf-spotify-setup button{background:#3c5070!important}"+
 "#pf-spotify-native #pf-spotify-connected[hidden],#pf-spotify-native #pf-spotify-connect[hidden],#pf-spotify-native #pf-spotify-logout[hidden]{display:none!important}"+
 "#pf-spotify-native .pf-spotify-actions{display:flex;gap:9px;flex-wrap:wrap;margin:12px 0}"+
 "#pf-spotify-native .pf-spotify-actions button{flex:1 1 125px}"+
 "#pf-spotify-native #pf-spotify-logout{background:#313b51!important}"+
 "#pf-spotify-native .pf-spotify-grid{display:grid;gap:8px;max-height:260px;overflow:auto;margin:10px 0}"+
 "#pf-spotify-native .pf-spotify-playlist{text-align:left;background:#233d4d!important;display:flex;flex-direction:column;align-items:flex-start;gap:4px;white-space:normal;overflow-wrap:anywhere}"+
 "#pf-spotify-native .pf-spotify-playlist strong{font:850 13px system-ui;color:#fff}"+
 "#pf-spotify-native .pf-spotify-playlist small{font:11px system-ui;color:#b6eed6}"+
 "#pf-spotify-native #pf-spotify-search label{font:850 12px system-ui;color:#e3fff1}"+
 "#pf-spotify-native .pf-spotify-search-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:8px}"+
 "#pf-spotify-native #pf-spotify-query{width:100%;min-height:44px;background:#121f2c;color:#fff;border:1px solid #7abfa7;border-radius:10px;padding:10px;font-size:16px}"+
 "#pf-spotify-native #pf-spotify-state{font:800 12px/1.5 system-ui;color:#b4ffe1}"+
 "#pf-spotify-native #pf-spotify-embed{max-width:100%;overflow:hidden}"+
 "#pf-spotify-native #pf-spotify-open{color:#aaffcf;font:850 13px system-ui;text-decoration:underline}"+
 "@media(max-width:380px){#pf-spotify-native .pf-spotify-search-row{grid-template-columns:1fr}}";
 document.head.appendChild(st);
 new MutationObserver(schedule).observe(document.body,{childList:true,subtree:false});
 window.addEventListener("pulso-open-playlist",()=>setTimeout(schedule,0));
 window.addEventListener("pulso-auth-ready",()=>{accountId="";void identity()});
 schedule();void callback();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();