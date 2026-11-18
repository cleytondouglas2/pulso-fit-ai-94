/* PulsoFit AI: account-local training playlist and best-effort PWA live updates.
   Does not scrape copyrighted tracks or promise native iOS Live Activities.
   User-selected audio files are held in browser IndexedDB, never uploaded. */
(function(){
 "use strict";
 if(window.__PULSO_LIVE_COMPANION__)return;
 window.__PULSO_LIVE_COMPANION__=true;
 let accountId="",db=null,tracks=[],order=[],index=-1,currentURL="",modal=null;
 let playing=false,shuffle=false,repeat=true,autoPlay=true,volume=.8;
 let workout=null,lastServerUpdate=0,lastLocalNotice=0,liveEnabled=false,serverEnabled=false;
 const audio=new Audio();audio.preload="metadata";audio.volume=volume;
 const by=id=>document.getElementById(id);
 const escape=s=>String(s??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
 const token=()=>{try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}};
 const playConfig="pf-companion-preferences-v1";
 const settings=()=>{try{return JSON.parse(localStorage.getItem(playConfig)||"{}")}catch{return {}}};
 const prefs=settings();
 shuffle=!!prefs.shuffle;repeat=prefs.repeat!==false;autoPlay=prefs.autoPlay!==false;
 liveEnabled=!!prefs.liveEnabled;volume=Number.isFinite(Number(prefs.volume))?Math.min(1,Math.max(0,Number(prefs.volume))):.8;audio.volume=volume;
 function savePrefs(){try{localStorage.setItem(playConfig,JSON.stringify({shuffle,repeat,autoPlay,liveEnabled,volume}))}catch{}}
 const status=t=>{const x=by("pf-companion-status");if(x)x.textContent=String(t||"")};
 function openDB(id){
  return new Promise((resolve,reject)=>{
   if(!indexedDB)return reject(Error("Armazenamento de áudio indisponível."));
   const q=indexedDB.open("pulsofit-music-v1-"+id,1);
   q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains("tracks"))q.result.createObjectStore("tracks",{keyPath:"id"})};
   q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
  });
 }
 function dbRequest(mode,operation){
  return new Promise((resolve,reject)=>{
   if(!db)return reject(Error("A playlist ainda está carregando."));
   const tx=db.transaction("tracks",mode),store=tx.objectStore("tracks");
   const request=operation(store);
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
  });
 }
 function orderKey(){return "pf-music-order-"+accountId}
 function readOrder(){try{const x=JSON.parse(localStorage.getItem(orderKey())||"[]");return Array.isArray(x)?x:[]}catch{return []}}
 function saveOrder(){try{localStorage.setItem(orderKey(),JSON.stringify(order))}catch{}}
 async function loadTracks(){
  if(!db)return;
  const rows=await dbRequest("readonly",s=>s.getAll());
  const ranks=readOrder();tracks=rows.sort((a,b)=>{
   const x=ranks.indexOf(a.id),y=ranks.indexOf(b.id);
   return (x<0?99999:x)-(y<0?99999:y);
  });
  order=tracks.map(t=>t.id);saveOrder();
  refresh();
 }
 function cleanupURL(){if(currentURL)URL.revokeObjectURL(currentURL);currentURL=""}
 async function chooseTrack(idx,autostart){
  if(idx<0||idx>=tracks.length)return;
  index=idx;const t=tracks[index];
  audio.pause();playing=false;cleanupURL();
  currentURL=URL.createObjectURL(t.blob);
  audio.src=currentURL;
  audio.load();
  try{
   if("mediaSession" in navigator){
    navigator.mediaSession.metadata=new MediaMetadata({title:t.name,artist:"Minha playlist • PulsoFit",album:"Treino",artwork:[]});
   }
  }catch{}
  if(autostart)await playAudio();
  refresh();
 }
 async function playAudio(){
  if(!tracks.length){status("Adicione suas músicas para iniciar a playlist.");return}
  try{
   if(index<0){await chooseTrack(0,false)}
   await audio.play();playing=true;status("▶ Música tocando. Controle também pela tela de bloqueio quando suportado.");
  }catch{
   playing=false;status("O celular exige tocar em Reproduzir para liberar o áudio.");
  }
  mediaState();refresh();
 }
 function pauseAudio(){audio.pause();playing=false;mediaState();refresh()}
 function mediaState(){
  if("mediaSession" in navigator)try{navigator.mediaSession.playbackState=playing?"playing":"paused"}catch{}
 }
 function nextTrack(delta){
  if(!tracks.length)return;
  const idx=shuffle&&tracks.length>1?
   (()=>{let n=index;while(n===index)n=Math.floor(Math.random()*tracks.length);return n})():
   ((index+delta+tracks.length)%tracks.length);
  void chooseTrack(idx,playing);
 }
 audio.addEventListener("ended",()=>{playing=false;
  if(index+1<tracks.length||repeat||shuffle){playing=true;nextTrack(1)}else{mediaState();refresh()}
 });
 audio.addEventListener("pause",()=>{playing=false;mediaState();refresh()});
 audio.addEventListener("play",()=>{playing=true;mediaState();refresh()});
 if("mediaSession" in navigator)try{
  for(const [key,handler] of [["play",()=>void playAudio()],["pause",pauseAudio],
   ["previoustrack",()=>nextTrack(-1)],["nexttrack",()=>nextTrack(1)],["stop",pauseAudio]])
    navigator.mediaSession.setActionHandler(key,handler);
 }catch{}
 async function addFiles(files){
  const incoming=Array.from(files||[]).slice(0,35);
  if(!incoming.length)return;
  if(!db){status("Não foi possível acessar o armazenamento local. Abra o PulsoFit no navegador atualizado.");return}
  let size=tracks.reduce((n,t)=>n+(t.blob?.size||0),0),added=0;
  for(const file of incoming){
   if(!file.type.startsWith("audio/")&&!/\.(mp3|m4a|wav|ogg|aac|flac|opus)$/i.test(file.name))continue;
   if(file.size>25*1024*1024||file.size<100||size+file.size>120*1024*1024)continue;
   const id="music-"+Date.now()+"-"+Math.random().toString(36).slice(2,10);
   const name=file.name.replace(/\.[a-z0-9]+$/i,"").slice(0,100);
   try{await dbRequest("readwrite",s=>s.put({id,name,blob:file,lastModified:file.lastModified||0}));
    size+=file.size;added++;
   }catch{status("Armazenamento do aparelho cheio ou bloqueado. Remova arquivos antigos.");break}
  }
  await loadTracks();if(index<0&&tracks.length)await chooseTrack(0,false);
  status(added?"🎵 "+added+" música(s) adicionada(s). A playlist fica somente neste aparelho.":"Nenhuma música foi adicionada; confira formato ou espaço disponível.");
 }
 async function removeTrack(id){
  const i=tracks.findIndex(t=>t.id===id);if(i<0)return;
  if(tracks[index]?.id===id){pauseAudio();audio.removeAttribute("src");cleanupURL();index=-1}
  try{await dbRequest("readwrite",s=>s.delete(id))}catch{}
  await loadTracks();
 }
 function moveTrack(id,delta){
  const i=tracks.findIndex(t=>t.id===id),j=i+delta;
  if(i<0||j<0||j>=tracks.length)return;
  const active=tracks[index]?.id||"";
  [tracks[i],tracks[j]]=[tracks[j],tracks[i]];
  index=tracks.findIndex(t=>t.id===active);order=tracks.map(t=>t.id);saveOrder();refresh();
 }
 const elapsed=()=>workout?(workout.elapsedMs+(workout.state==="running"?Date.now()-workout.resumedAt:0)):0;
 const clock=ms=>{const s=Math.floor(Math.max(0,ms)/1000);
  return [Math.floor(s/3600),Math.floor((s%3600)/60),s%60].map(v=>String(v).padStart(2,"0")).join(":")};
 async function pushSubscription(){
  if(!("serviceWorker" in navigator))return null;
  try{const reg=await navigator.serviceWorker.ready;return await reg.pushManager?.getSubscription()}catch{return null}
 }
 function localNotice(){
  if(!liveEnabled||!workout||typeof Notification==="undefined"||Notification.permission!=="granted"||!("serviceWorker" in navigator))return;
  if(Date.now()-lastLocalNotice<90000)return;
  lastLocalNotice=Date.now();
  navigator.serviceWorker.ready.then(reg=>reg.showNotification("⏱ "+workout.title+" • PulsoFit",{
   body:(workout.state==="paused"?"Pausado":"Tempo transcorrido")+" • "+clock(elapsed())+
    (workout.detail?" • "+workout.detail:""),tag:"pulsofit-live-workout",
   icon:"/pulsofit-icon-192.png",badge:"/pulsofit-icon-192.png",
   silent:true,renotify:false,requireInteraction:true,
   data:{url:"/?source=live#/workouts"}
  })).catch(()=>{});
 }
 async function serverAction(action){
  const w=workout;
  if(!w||!liveEnabled||!token())return;
  const sub=await pushSubscription();
  if(!sub){status("Para acompanhamento em segundo plano, ative as notificações em Mais → Notificações.");serverEnabled=false;return}
  try{
   const response=await fetch("/api/push/activity",{method:"POST",cache:"no-store",credentials:"same-origin",
    headers:{Authorization:"Bearer "+token(),"Content-Type":"application/json"},
    body:JSON.stringify({action,sessionKey:w.key,kind:w.kind,title:w.title,detail:w.detail,endpoint:sub.endpoint})});
   const answer=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(answer.error||"Falha no acompanhamento do servidor.");
   serverEnabled=action!=="finish";if(action==="start")status("Acompanhamento ativado. Atualizações do servidor a cada 3 minutos, quando disponível.");
  }catch(err){serverEnabled=false;status(String(err.message||err))}
 }
 function eventUpdate(detail){
  const action=String(detail?.action||"");
  if(!["start","pause","resume","update","finish"].includes(action))return;
  if(action==="start"){
   if(workout&&workout.state!=="finished"&&workout.key!==detail.sessionKey)void serverAction("finish");
   workout={key:String(detail.sessionKey||("workout-"+Date.now())),kind:detail.kind||"workout",
    title:String(detail.title||"Treino em andamento").slice(0,85),
    detail:String(detail.detail||"").slice(0,90),elapsedMs:0,resumedAt:Date.now(),state:"running"};
   lastLocalNotice=0;lastServerUpdate=0;
   if(autoPlay&&tracks.length)void playAudio();
   if(liveEnabled){localNotice();void serverAction("start")}
  }else if(workout&&workout.key===detail.sessionKey){
   if(detail.detail!==undefined)workout.detail=String(detail.detail).slice(0,90);
   if(action==="pause"&&workout.state==="running"){
    workout.elapsedMs=elapsed();workout.state="paused";
    if(liveEnabled){lastLocalNotice=0;localNotice();void serverAction("pause")}
   }else if(action==="resume"&&workout.state==="paused"){
    workout.resumedAt=Date.now();workout.state="running";
    if(liveEnabled){lastLocalNotice=0;localNotice();void serverAction("resume")}
   }else if(action==="update"){
    if(liveEnabled&&Date.now()-lastServerUpdate>60000){lastServerUpdate=Date.now();void serverAction("update")}
   }else if(action==="finish"){
    if(liveEnabled)void serverAction("finish");
    workout=null;pauseAudio();
    try{navigator.serviceWorker.ready.then(reg=>reg.getNotifications({tag:"pulsofit-live-workout"})
     .then(list=>list.forEach(n=>n.close()))).catch(()=>{})}catch{}
   }
  }
  refresh();
 }
 window.addEventListener("pulso-live-activity",e=>eventUpdate(e.detail));
 setInterval(()=>{if(workout?.state==="running"){
  const label=by("pf-companion-time");if(label)label.textContent=clock(elapsed());
  if(liveEnabled&&!document.hidden)localNotice();
 }},1000);
 async function enableLive(){
  if(!("Notification" in window)){status("Este navegador não oferece notificações de treino.");return}
  if(Notification.permission!=="granted"){
   const answer=await Notification.requestPermission();
   if(answer!=="granted"){status("Permissão de notificações não concedida.");return}
  }
  const sub=await pushSubscription();
  if(!sub){
   status("Ative as notificações na área Mais → Notificações e volte aqui.");
   window.dispatchEvent(new Event("pulso-open-push-settings"));return;
  }
  liveEnabled=true;savePrefs();
  if(workout){lastLocalNotice=0;localNotice();void serverAction("start")}
  refresh();
 }
 function disableLive(){
  if(workout&&liveEnabled)void serverAction("finish");
  liveEnabled=false;serverEnabled=false;savePrefs();refresh();
 }
 function refresh(){
  const button=by("pf-companion-fab");if(button){
   const route=String(location.hash||"").toLowerCase();
   button.hidden=!(workout||route.includes("workouts")||by("pf-tv-overlay")||by("pf-outdoor-overlay"));
   button.textContent=workout?"⏱ "+clock(elapsed())+" · 🎵":"🎵 Música e notificações";
  }
  const list=by("pf-companion-tracklist");
  if(list){
   list.innerHTML=tracks.length?tracks.map((t,i)=>'<li class="'+(i===index?"active":"")+'"><button type="button" data-pf-track="'+i+'">'+
    (i===index?"♫ ":"▶ ")+escape(t.name)+'</button><div><button type="button" data-pf-up="'+escape(t.id)+'" aria-label="Mover acima">↑</button>'+
    '<button type="button" data-pf-down="'+escape(t.id)+'" aria-label="Mover abaixo">↓</button>'+
    '<button type="button" data-pf-remove="'+escape(t.id)+'" aria-label="Remover música">×</button></div></li>').join(""):
    '<li class="pf-empty-song">Nenhuma música adicionada. Escolha arquivos MP3, M4A, WAV ou OGG do seu celular.</li>';
   list.querySelectorAll("[data-pf-track]").forEach(b=>b.addEventListener("click",()=>void chooseTrack(Number(b.dataset.pfTrack),true)));
   list.querySelectorAll("[data-pf-remove]").forEach(b=>b.addEventListener("click",()=>void removeTrack(b.dataset.pfRemove)));
   list.querySelectorAll("[data-pf-up]").forEach(b=>b.addEventListener("click",()=>moveTrack(b.dataset.pfUp,-1)));
   list.querySelectorAll("[data-pf-down]").forEach(b=>b.addEventListener("click",()=>moveTrack(b.dataset.pfDown,1)));
  }
  const title=by("pf-companion-now");if(title)title.textContent=tracks[index]?.name||"Escolha suas músicas";
  const playButton=by("pf-companion-play");if(playButton)playButton.textContent=playing?"⏸ Pausar música":"▶ Reproduzir";
  const time=by("pf-companion-time");if(time)time.textContent=workout?clock(elapsed()):"00:00:00";
  const activity=by("pf-companion-activity");if(activity)activity.textContent=workout?workout.title+" · "+(workout.state==="paused"?"Pausado":"Em andamento"):
   "Inicie um treino para acompanhar a duração";
  const button=by("pf-companion-live");if(button)button.textContent=liveEnabled?"🔔 Desativar acompanhamento":"🔔 Ativar notificações ao vivo";
  const repeatBtn=by("pf-companion-repeat");if(repeatBtn)repeatBtn.setAttribute("aria-pressed",String(repeat));
  const shuffleBtn=by("pf-companion-shuffle");if(shuffleBtn)shuffleBtn.setAttribute("aria-pressed",String(shuffle));
  const autoBtn=by("pf-companion-autoplay");if(autoBtn)autoBtn.checked=autoPlay;
 }
 function show(){
  if(modal?.isConnected){modal.focus();return}
  modal=document.createElement("div");modal.id="pf-companion-modal";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");
  modal.setAttribute("aria-label","Playlist e notificações do treino");
  modal.innerHTML='<section class="pf-companion-card"><header><div><small>🎵 PULSOFIT • TREINO COM MÚSICA</small>'+
   '<h2>Sua playlist de treino</h2></div><button type="button" id="pf-companion-close" aria-label="Fechar">×</button></header>'+
   '<p>Escolha as músicas do seu aparelho. Os arquivos ficam salvos apenas neste dispositivo, sem envio ao servidor.</p>'+
   '<label class="pf-companion-file">＋ Adicionar músicas<input id="pf-companion-files" type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.opus" multiple></label>'+
   '<div class="pf-companion-playing"><strong id="pf-companion-now">Escolha suas músicas</strong><div class="pf-companion-buttons">'+
   '<button type="button" id="pf-companion-prev" aria-label="Anterior">⏮</button>'+
   '<button type="button" id="pf-companion-play">▶ Reproduzir</button>'+
   '<button type="button" id="pf-companion-next" aria-label="Próxima">⏭</button></div>'+
   '<div class="pf-companion-options"><button id="pf-companion-shuffle" type="button">Aleatório</button><button id="pf-companion-repeat" type="button">Repetir</button>'+
   '<label>Volume <input type="range" id="pf-companion-volume" min="0" max="1" step="0.05" value="'+volume+'"></label></div>'+
   '<label class="pf-companion-auto"><input id="pf-companion-autoplay" type="checkbox"> Tocar playlist ao começar treino</label></div>'+
   '<h3>Ordem das músicas</h3><ol id="pf-companion-tracklist"></ol>'+
   '<div class="pf-companion-live"><h3>⏱ Acompanhamento no aparelho</h3>'+
   '<p id="pf-companion-activity"></p><strong id="pf-companion-time">00:00:00</strong>'+
   '<button type="button" id="pf-companion-live"></button>'+
   '<p>Com Web Push ativo, o servidor envia a duração do treino a cada 3 minutos enquanto estiver disponível. A duração não mede os movimentos executados. A distância GPS precisa do navegador ativo para ser atualizada.</p>'+
   '<p class="pf-companion-warning">No iPhone, instale o aplicativo na tela inicial para receber notificações web. Não se trata de Live Activity nativa. No Android, economia de bateria pode atrasar atualizações.</p></div>'+
   '<p id="pf-companion-status" role="status" aria-live="polite"></p></section>';
  document.body.appendChild(modal);document.body.classList.add("pf-companion-open");
  const close=()=>{modal?.remove();modal=null;document.body.classList.remove("pf-companion-open")};
  by("pf-companion-close").addEventListener("click",close);
  modal.addEventListener("click",e=>{if(e.target===modal)close()});
  by("pf-companion-files").addEventListener("change",e=>{void addFiles(e.target.files);e.target.value=""});
  by("pf-companion-play").addEventListener("click",()=>{if(playing)pauseAudio();else void playAudio()});
  by("pf-companion-prev").addEventListener("click",()=>nextTrack(-1));
  by("pf-companion-next").addEventListener("click",()=>nextTrack(1));
  by("pf-companion-shuffle").addEventListener("click",()=>{shuffle=!shuffle;savePrefs();refresh()});
  by("pf-companion-repeat").addEventListener("click",()=>{repeat=!repeat;savePrefs();refresh()});
  by("pf-companion-autoplay").addEventListener("change",e=>{autoPlay=e.target.checked;savePrefs()});
  by("pf-companion-volume").addEventListener("input",e=>{volume=Number(e.target.value);audio.volume=volume;savePrefs()});
  by("pf-companion-live").addEventListener("click",()=>{if(liveEnabled)disableLive();else void enableLive()});
  refresh();
 }
 function place(){
  if(!document.body)return;
  if(!by("pf-companion-fab")){
   const b=document.createElement("button");b.type="button";b.id="pf-companion-fab";
   b.textContent="🎵 Música e notificações";b.addEventListener("click",show);document.body.appendChild(b);
  }
  refresh();
 }
 async function connect(){
  if(!token())return;
  try{
   const r=await fetch("/api/me",{cache:"no-store",headers:{Authorization:"Bearer "+token()}});
   const data=await r.json(),id=String(data?.user?.id||data?.id||"");
   if(!/^[a-f0-9-]{36}$/i.test(id)||accountId===id)return;
   if(db)db.close();
   pauseAudio();cleanupURL();audio.removeAttribute("src");
   tracks=[];order=[];index=-1;db=null;accountId=id;
   try{db=await openDB(accountId);await loadTracks();if(tracks.length)await chooseTrack(0,false)}catch{}
  }catch{}
 }
 function boot(){
  place();void connect();
  const app=by("app");
  if(app)new MutationObserver(()=>{place()}).observe(app,{childList:true,subtree:false});
  window.addEventListener("hashchange",place);
  window.addEventListener("pageshow",()=>{place();void connect()});
  window.addEventListener("pulso-auth-ready",()=>void connect());
  setInterval(()=>{if(token()&&!accountId)void connect()},8000);
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();