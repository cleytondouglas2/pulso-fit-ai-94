/* PulsoFit Aulas: evidence-based, body-friendly movement classes.
 * Curated instruction from creators with verified public YouTube videos embedded inside the app.
 * Never downloads or rehosts videos or fakes completion.
 */
(function(){
"use strict";
if(window.__PULSO_WELLBEING_UI__)return;
window.__PULSO_WELLBEING_UI__=true;
const $=id=>document.getElementById(id);
let screen=null,selectedCategory="all",textQuery="",selectedLesson=null,account="",lastToken="",done=new Set(),faves=new Set(),loadingIdentity=false;
const lib=()=>window.PulsoWellbeingLessons;
const token=()=>{try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}};
function announce(s){const n=$("pf-class-message");if(n)n.textContent=s}
function storeKey(kind){return account?"pf-classes-"+kind+"-v1-"+account:null}
function loadProgress(){
 try{
  const completed=storeKey("done"),fav=storeKey("favorites");
  done=new Set(completed?JSON.parse(localStorage.getItem(completed)||"[]"):[]);
  faves=new Set(fav?JSON.parse(localStorage.getItem(fav)||"[]"):[]);
 }catch{done=new Set();faves=new Set()}
}
function save(kind,set){
 const key=storeKey(kind);
 if(!key){announce("Não foi possível identificar a conta. O progresso não será salvo neste aparelho.");return}
 try{localStorage.setItem(key,JSON.stringify([...set]))}
 catch{announce("O armazenamento do aparelho está indisponível.")}
}
async function identify(){
 if(loadingIdentity||!token()||account&&lastToken===token())return;
 loadingIdentity=true;
 const current=token();
 try{
  const response=await fetch("/api/me",{headers:{Authorization:"Bearer "+current},cache:"no-store",signal:AbortSignal.timeout(6500)});
  if(!response.ok||current!==token())return;
  const json=await response.json(),id=String((json.user||json).id||"");
  if(!/^[a-f0-9-]{36}$/i.test(id))return;
  account=id;lastToken=current;loadProgress();
  if(screen)renderGrid();
 }catch{}finally{loadingIdentity=false}
}
function button(label,className,callback){
 const el=document.createElement("button");
 el.type="button";el.textContent=label;el.className=className;
 el.addEventListener("click",callback);
 return el;
}
function txt(tag,content,className){
 const el=document.createElement(tag);el.textContent=content||"";
 if(className)el.className=className;
 return el;
}
let activeFrame=null,frameErrorTimer=0;
function stopVideo(){
 if(frameErrorTimer){clearTimeout(frameErrorTimer);frameErrorTimer=0}
 if(activeFrame){activeFrame.src="about:blank";activeFrame.remove();activeFrame=null}
}
function validVideo(item){return item&&/^[A-Za-z0-9_-]{11}$/.test(item.video||"")}
function fallbackLesson(item){
 const others=(lib()?.list||[]).filter(x=>x.category===item.category&&x.id!==item.id&&validVideo(x));
 return others[0]||((lib()?.list||[]).find(x=>x.id!==item.id&&validVideo(x))||null);
}
function nextLesson(item){
 const alternative=fallbackLesson(item);
 if(!alternative){announce("Não há outra aula disponível no momento.");return}
 announce("Selecionando outra aula que pode reproduzir dentro do PulsoFit.");
 select(alternative);
}
function videoPlayerMessage(event){
 if(!/^https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com$/.test(event.origin))return;
 let data;try{data=typeof event.data==="string"?JSON.parse(event.data):event.data}catch{return}
 if(!activeFrame||!screen?.isConnected||!data)return;
 if(data.event==="onError"&&[2,5,100,101,150,153].includes(Number(data.info))){
  const item=lib()?.byId(selectedLesson);
  if(!item)return;
  const message=$("pf-class-video-alert");
  if(message){
   message.hidden=false;
   message.textContent="Este vídeo não permitiu reprodução incorporada (código "+Number(data.info)+"). Experimente outra aula nesta tela.";
  }
  announce("O YouTube bloqueou esta incorporação. Toque em Tentar outra aula; você permanece no PulsoFit.");
 }
}
function showInAppVideo(item,stage){
 if(!validVideo(item)||!stage?.isConnected)return;
 stopVideo();
 stage.replaceChildren();
 const player=document.createElement("iframe");
 player.title="Aula "+item.title+" — player incorporado do YouTube";
 player.id="pf-class-youtube-frame";
 player.name="pf-class-youtube-frame";
 player.loading="eager";
 player.referrerPolicy="origin-when-cross-origin";
 player.allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
 player.allowFullscreen=true;
 player.setAttribute("allowfullscreen","");
 player.setAttribute("playsinline","");
 player.style.cssText="width:100%;height:auto;aspect-ratio:16/9;border:0;display:block;border-radius:12px;background:#090b20";
 // Full HTTPS origin/referrer required by YouTube; keeps playback inline on iOS.
 const url=new URL("https://www.youtube-nocookie.com/embed/"+item.video);
 url.searchParams.set("playsinline","1");
 url.searchParams.set("autoplay","1");
 url.searchParams.set("rel","0");
 url.searchParams.set("controls","1");
 url.searchParams.set("enablejsapi","1");
 url.searchParams.set("origin",location.origin);
 url.searchParams.set("widget_referrer",location.href.split("#")[0].split("?")[0]);
 activeFrame=player;
 player.addEventListener("load",()=>{
  if(activeFrame!==player)return;
  try{
   player.contentWindow?.postMessage(JSON.stringify({event:"listening",id:player.id}),"https://www.youtube-nocookie.com");
  }catch{}
 });
 player.addEventListener("error",()=>{
  if(activeFrame!==player)return;
  const warning=$("pf-class-video-alert");if(warning){warning.hidden=false;warning.textContent="O player não carregou. Escolha outra aula sem sair do aplicativo.";}
 });
 player.src=url.href;
 stage.appendChild(player);
 announce("Aula aberta dentro do PulsoFit. Aperte ▶ nos controles do vídeo para iniciar.");
 const warning=$("pf-class-video-alert");if(warning)warning.hidden=true;
}
function drawPlayer(item){
 const mount=$("pf-class-player");if(!mount)return;
 stopVideo();
 mount.replaceChildren();
 mount.append(
  txt("h3",item.emoji+" "+item.title),
  txt("p",item.level+" · "+item.minutes+" min · Instrutor: "+item.source),
  txt("p",item.focus),
  txt("p","Você pode precisar de: "+item.equip)
 );
 const pad=document.createElement("div");pad.className="pf-class-playarea";
 const stage=document.createElement("div");stage.className="pf-class-video-stage";
 stage.appendChild(txt("span",item.emoji,"pf-class-video-emoji"));
 stage.appendChild(txt("strong","Aula completa com instrutor real"));
 stage.appendChild(txt("p","Toque em assistir. O vídeo aparece nesta mesma tela, sem abrir Safari ou YouTube."));
 pad.appendChild(stage);
 const play=button("▶ Assistir aqui no PulsoFit","pf-class-inline-action pf-class-play-main",()=>showInAppVideo(item,stage));
 play.disabled=!validVideo(item);
 pad.appendChild(play);
 const warning=txt("p","","pf-class-video-alert");warning.id="pf-class-video-alert";warning.hidden=true;
 pad.appendChild(warning);
 pad.appendChild(button("↻ Reiniciar vídeo nesta tela","pf-class-inline-action",()=>showInAppVideo(item,stage)));
 pad.appendChild(button("⤻ Tentar outra aula aqui","pf-class-inline-action",()=>nextLesson(item)));
 mount.appendChild(pad);
 const row=document.createElement("div");row.className="pf-class-actions";
 const complete=button(done.has(item.id)?"✓ Aula concluída":"✓ Concluí esta aula","pf-class-secondary",()=>{
  if(done.has(item.id))done.delete(item.id);else done.add(item.id);
  save("done",done);drawPlayer(item);renderGrid();
  announce(done.has(item.id)?"Aula marcada como concluída por você.":"Marcação de aula removida.");
 });
 complete.setAttribute("aria-pressed",String(done.has(item.id)));row.appendChild(complete);
 const saveFav=button(faves.has(item.id)?"♥ Favorita":"♡ Favoritar","pf-class-secondary",()=>{
  if(faves.has(item.id))faves.delete(item.id);else faves.add(item.id);
  save("favorites",faves);drawPlayer(item);renderGrid();
 });
 saveFav.setAttribute("aria-pressed",String(faves.has(item.id)));row.appendChild(saveFav);
 mount.appendChild(row);
 mount.appendChild(txt("small","Vídeo do canal "+item.source+" reproduzido pelo player oficial YouTube, sem cópia no servidor. Alguns criadores ou aparelhos podem impedir incorporação; nesse caso, toque em “Tentar outra aula”."));
 mount.appendChild(txt("small","Adapte a intensidade e interrompa em caso de dor, tontura ou mal-estar. Para limitações de saúde, procure orientação profissional."));
}
function select(item){
 selectedLesson=item.id;
 document.querySelectorAll("#pf-class-list button[data-id]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.id===item.id)));
 drawPlayer(item);
 const panel=$("pf-class-player");
 if(panel)panel.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"nearest"});
}
function visibleLessons(){
 const classes=lib()?.list||[];
 const search=(textQuery||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
 return classes.filter(x=>{
  if(selectedCategory==="favorites"&&!faves.has(x.id))return false;
  if(!["all","favorites"].includes(selectedCategory)&&x.category!==selectedCategory)return false;
  return !search||[x.title,x.focus,x.level,x.category].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().includes(search);
 });
}
function renderGrid(){
 const target=$("pf-class-list");
 if(!target||!lib())return;
 target.replaceChildren();
 const current=visibleLessons();
 const count=$("pf-class-count");
 if(count)count.textContent=current.length+" aula(s) com reprodução interna";
 if(!current.length){
  target.appendChild(txt("p","Não encontramos aulas com esses filtros. Escolha outra modalidade ou limpe a busca.","pf-class-empty"));
  return;
 }
 for(const item of current){
  const card=button("","pf-class-card",()=>select(item));
  card.dataset.id=item.id;card.setAttribute("aria-pressed",String(selectedLesson===item.id));
  const emoji=txt("span",item.emoji,"pf-class-icon");emoji.setAttribute("aria-hidden","true");
  const body=document.createElement("span");body.className="pf-class-card-copy";
  body.appendChild(txt("strong",item.title));
  body.appendChild(txt("small",item.minutes+" min · "+item.level));
  body.appendChild(txt("small",item.focus));
  const badge=txt("span",done.has(item.id)?"✓":faves.has(item.id)?"♥":"▶","pf-class-card-state");
  card.append(emoji,body,badge);target.appendChild(card);
 }
}
function drawCategories(){
 const target=$("pf-class-categories");if(!target||!lib())return;target.replaceChildren();
 for(const category of [...lib().categories,{id:"favorites",label:"♥ Favoritas"}]){
  const el=button(category.label,"pf-class-chip",()=>{selectedCategory=category.id;drawCategories();renderGrid()});
  el.setAttribute("aria-pressed",String(selectedCategory===category.id));
  target.appendChild(el);
 }
}
function dismiss(){
 stopVideo();
 if(!screen)return;
 const el=screen;screen=null;el.remove();
 document.removeEventListener("keydown",escapeKey);
}
function escapeKey(e){if(e.key==="Escape")dismiss()}
function open(){
 if(!token()){return}
 if(screen?.isConnected)return;
 if(!lib())return;
 const frame=document.createElement("div");frame.id="pf-classes-modal";
 frame.innerHTML='<section class="pf-class-shell" role="dialog" aria-modal="true" aria-labelledby="pf-class-title">'+
  '<header class="pf-class-header"><div><small>✦ PULSOFIT • MOVIMENTO & BEM-ESTAR</small><h2 id="pf-class-title">Aulas para você se sentir bem</h2><p>Explore o movimento no seu ritmo, sem pressão sobre a aparência.</p></div><button id="pf-class-close" type="button" aria-label="Fechar aulas">×</button></header>'+
  '<div class="pf-class-toolbar"><label for="pf-class-search">Encontre sua aula</label><input id="pf-class-search" type="search" placeholder="Pilates, dança, relaxamento, yoga..." autocomplete="off"><div id="pf-class-categories" role="group" aria-label="Categorias de aulas"></div><p id="pf-class-count"></p></div>'+
  '<div class="pf-class-layout"><div id="pf-class-list" aria-label="Lista de aulas"></div><article id="pf-class-player" aria-label="Vídeo e detalhes da aula"></article></div>'+
  '<footer class="pf-class-footer"><p id="pf-class-message" role="status" aria-live="polite"></p><p>Vídeos reproduzidos nesta tela com o player oficial do YouTube. A disponibilidade depende das permissões do vídeo e do navegador.</p></footer>'+
  '</section>';
 document.body.appendChild(frame);screen=frame;
 const close=$("pf-class-close");close.addEventListener("click",dismiss);
 frame.addEventListener("click",e=>{if(e.target===frame)dismiss()});
 document.addEventListener("keydown",escapeKey);
 $("pf-class-search").addEventListener("input",e=>{textQuery=e.target.value;renderGrid()});
 drawCategories();renderGrid();
 if(!selectedLesson)selectedLesson=lib().list[0].id;
 drawPlayer(lib().byId(selectedLesson)||lib().list[0]);
 void identify();
 close.focus({preventScroll:true});
}
function boot(){
 window.addEventListener("message",videoPlayerMessage);
 const css=document.createElement("style");css.id="pf-class-styles";
 css.textContent=
 '#pf-classes-modal{position:fixed;inset:0;z-index:2147483400;display:flex;align-items:center;justify-content:center;padding:env(safe-area-inset-top) 8px env(safe-area-inset-bottom);background:#080b18cf;backdrop-filter:blur(12px);box-sizing:border-box}'+
 '#pf-classes-modal *{box-sizing:border-box;min-width:0}'+
 '#pf-classes-modal .pf-class-shell{width:min(860px,100%);max-height:95dvh;overflow:auto;border:1px solid #a17aff;border-radius:24px;background:linear-gradient(145deg,#191e3b,#17283e);color:white;padding:16px;box-shadow:0 20px 70px #080b19a0}'+
 '#pf-classes-modal .pf-class-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:4px 0 12px}'+
 '#pf-classes-modal .pf-class-header small{font:850 10px/1.5 system-ui;color:#a1f7d7;letter-spacing:.09em}'+
 '#pf-classes-modal .pf-class-header h2{margin:6px 0;font:900 clamp(20px,4vw,30px)/1.16 system-ui;color:white}'+
 '#pf-classes-modal .pf-class-header p,#pf-classes-modal .pf-class-footer p{font:12px/1.5 system-ui;color:#d1ddee;margin:3px 0}'+
 '#pf-classes-modal #pf-class-close{flex:0 0 44px;font:35px/1 system-ui;border:1px solid #8878b7;color:white;background:#313054;border-radius:14px;min-height:44px}'+
 '#pf-classes-modal .pf-class-toolbar{display:grid;gap:8px;margin-bottom:10px}'+
 '#pf-classes-modal .pf-class-toolbar label{font:800 12px system-ui}'+
 '#pf-classes-modal #pf-class-search{width:100%;min-height:45px;font:16px system-ui;border:1px solid #777fa8;border-radius:12px;color:white;background:#0e1b31;padding:12px}'+
 '#pf-classes-modal #pf-class-categories{display:flex;gap:7px;overflow-x:auto;padding:3px 0 8px;scrollbar-width:thin}'+
 '#pf-classes-modal .pf-class-chip{flex:0 0 auto;padding:10px 14px;min-height:40px;border-radius:30px;border:1px solid #657c9f;color:#d9eaf4;background:#28344e;font:800 12px system-ui}'+
 '#pf-classes-modal button[aria-pressed=true]{border-color:#afffcf!important;background:#34517d!important;box-shadow:0 0 0 1px #80eaba}'+
 '#pf-classes-modal #pf-class-count{font:800 11px system-ui;color:#aaf7d7;margin:0}'+
 '#pf-classes-modal .pf-class-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:12px;align-items:start}'+
 '#pf-classes-modal #pf-class-list{display:grid;gap:9px;max-height:50dvh;overflow:auto;padding:2px}'+
 '#pf-classes-modal .pf-class-card{display:flex;gap:10px;width:100%;text-align:left;align-items:center;padding:13px 10px;min-height:83px;border:1px solid #596d9b;border-radius:14px;color:white;background:#27334f}'+
 '#pf-classes-modal .pf-class-card .pf-class-icon{font-size:24px;flex:0 0 32px}'+
 '#pf-classes-modal .pf-class-card-copy{flex:1;display:grid;gap:5px}'+
 '#pf-classes-modal .pf-class-card-copy strong{font:850 13px/1.35 system-ui;color:#fff}'+
 '#pf-classes-modal .pf-class-card-copy small{font:11px/1.4 system-ui;color:#cdddeb}'+
 '#pf-classes-modal .pf-class-card-state{font:850 20px system-ui;color:#abffe0}'+
 '#pf-classes-modal #pf-class-player{border:1px solid #5a7a8f;background:#202c46;border-radius:15px;padding:12px;display:grid;gap:9px}'+
 '#pf-classes-modal #pf-class-player h3{font:900 18px/1.3 system-ui;color:white;margin:0}'+
 '#pf-classes-modal #pf-class-player p{font:12px/1.55 system-ui;color:#d5e6ec;margin:0}'+
 '#pf-classes-modal .pf-class-playarea{display:grid;gap:8px}'+
 '#pf-classes-modal .pf-class-playarea iframe{width:100%;height:auto;aspect-ratio:16/9;border:0;border-radius:11px;background:#090b1e}'+
 '#pf-classes-modal .pf-class-video-stage{display:grid;place-items:center;min-height:172px;gap:7px;background:linear-gradient(125deg,#5d35aa,#1e8a85);border-radius:12px;padding:14px;text-align:center}'+
 '#pf-classes-modal .pf-class-video-stage .pf-class-video-emoji{font-size:39px}'+
 '#pf-classes-modal .pf-class-video-stage strong{font:900 15px/1.4 system-ui;color:white}'+
 '#pf-classes-modal .pf-class-video-stage p{color:#fff!important}'+
 '#pf-classes-modal .pf-class-video-stage iframe{display:block;width:100%;height:auto;aspect-ratio:16/9;border:0;background:#080a19}'+
 '#pf-classes-modal .pf-class-video-stage iframe{max-width:100%;display:block}'+
 '#pf-classes-modal .pf-class-inline-action{width:100%;background:#273956;border:1px solid #7595b9;border-radius:10px;min-height:42px;padding:10px;font:800 12px/1.3 system-ui;color:white}'+
 '#pf-classes-modal .pf-class-play-main{min-height:52px;font:900 15px/1.3 system-ui;background:linear-gradient(105deg,#8851e9,#4a9acb);border-color:#af91ff}'+
 '#pf-classes-modal .pf-class-video-alert{color:#ffdaab!important;font-weight:800!important;border:1px solid #ce8d6e;border-radius:10px;padding:10px;background:#3a304b}'+
 '#pf-classes-modal .pf-class-video-alert[hidden]{display:none!important}'+
 '#pf-classes-modal .pf-class-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}'+
 '#pf-classes-modal .pf-class-actions button,#pf-classes-modal .pf-class-actions a{border:1px solid #7489ba;padding:10px;min-height:42px;font:800 12px/1.3 system-ui;color:#fff;background:#394464;border-radius:11px;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center}'+
 '#pf-classes-modal .pf-class-actions .pf-class-primary{grid-column:1/-1;background:#7540d4;border-color:#ae8aff;font-size:14px}'+
 '#pf-classes-modal #pf-class-player a.pf-class-credit{color:#abffe1;font:12px/1.5 system-ui;overflow-wrap:anywhere}'+
 '#pf-classes-modal #pf-class-player small{font:10px/1.55 system-ui;color:#c8d7e6}'+
 '#pf-classes-modal .pf-class-footer{padding-top:10px}'+
 '#pf-classes-modal #pf-class-message{color:#a8ffda;font-weight:800}'+
 '@media(max-width:650px){#pf-classes-modal .pf-class-layout{grid-template-columns:minmax(0,1fr)}#pf-classes-modal #pf-class-list{max-height:240px}#pf-classes-modal .pf-class-shell{max-height:94dvh}#pf-classes-modal #pf-class-player{scroll-margin-top:15px}}'+
 '@media(prefers-reduced-motion:reduce){#pf-classes-modal *{scroll-behavior:auto!important}}';
 document.head.appendChild(css);
 window.addEventListener("pulso-open-wellbeing-classes",open);
 window.addEventListener("pulso-auth-ready",()=>{account="";lastToken="";done.clear();faves.clear();if(screen)void identify()});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();