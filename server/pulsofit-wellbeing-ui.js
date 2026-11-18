/* PulsoFit Aulas: evidence-based, body-friendly movement classes.
 * Verified NHS instructor-led footage only, external pages or official YouTube embed.
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
function openExternal(url){
 try{
  const parsed=new URL(url);
  if(parsed.protocol!=="https:"||!["www.nhs.uk","www.youtube.com"].includes(parsed.hostname))throw Error("Fonte não permitida");
  window.open(parsed.href,"_blank","noopener,noreferrer");
 }catch{announce("O endereço da aula não está disponível.")}
}
function drawPlayer(item){
 const mount=$("pf-class-player");if(!mount)return;
 mount.replaceChildren();
 const header=txt("h3",item.emoji+" "+item.title);
 const meta=txt("p",item.level+" · "+item.minutes+" minutos · "+item.source);
 const info=txt("p",item.focus);
 const equipment=txt("p","Você pode precisar de: "+item.equip);
 mount.append(header,meta,info,equipment);
 const pad=document.createElement("div");pad.className="pf-class-playarea";
 if(item.video&&/^[A-Za-z0-9_-]{11}$/.test(item.video)){
  const frame=document.createElement("iframe");
  frame.title="Vídeo oficial: "+item.title;
  frame.src="https://www.youtube-nocookie.com/embed/"+item.video+"?rel=0&playsinline=1";
  frame.loading="lazy";frame.referrerPolicy="strict-origin-when-cross-origin";
  frame.allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  frame.allowFullscreen=true;pad.appendChild(frame);
  pad.appendChild(txt("p","Vídeo incorporado do canal oficial NHS. Se não abrir, use “Assistir no site oficial”."));
 }else{
  const placeholder=txt("div","▶", "pf-class-video-placeholder");
  placeholder.setAttribute("aria-hidden","true");pad.appendChild(placeholder);
  pad.appendChild(txt("p","Esta aula tem vídeo na página oficial do NHS. Abra pelo botão abaixo para assistir integralmente com o instrutor."));
 }
 mount.append(pad);
 const row=document.createElement("div");row.className="pf-class-actions";
 row.appendChild(button("↗ Assistir no site oficial","pf-class-primary",()=>openExternal(item.url)));
 const complete=button(done.has(item.id)?"✓ Aula concluída":"✓ Concluí esta aula","pf-class-secondary",()=>{
  if(done.has(item.id))done.delete(item.id);else done.add(item.id);
  save("done",done);drawPlayer(item);renderGrid();
  announce(done.has(item.id)?"Aula marcada como concluída por você. Bom trabalho em se movimentar!":"Marcação de aula removida.");
 });
 complete.setAttribute("aria-pressed",String(done.has(item.id)));row.appendChild(complete);
 const saveFav=button(faves.has(item.id)?"♥ Favorita":"♡ Favoritar","pf-class-secondary",()=>{
  if(faves.has(item.id))faves.delete(item.id);else faves.add(item.id);
  save("favorites",faves);drawPlayer(item);renderGrid();
 });
 saveFav.setAttribute("aria-pressed",String(faves.has(item.id)));row.appendChild(saveFav);
 mount.appendChild(row);
 const source=document.createElement("a");source.href=item.url;source.rel="noopener noreferrer";source.target="_blank";
 source.textContent="Fonte original: "+item.source+" · vídeo e orientações do instrutor";
 mount.appendChild(source);
 mount.appendChild(txt("small","Aulas de educação física e bem-estar, não atendimento médico. Ajuste o ritmo, faça pausas e interrompa se sentir dor, tontura ou mal-estar. Se tiver lesão, estiver grávida ou se recuperando de cirurgia, peça orientação profissional."));
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
 if(count)count.textContent=current.length+" aula(s) com vídeo oficial";
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
  '<footer class="pf-class-footer"><p id="pf-class-message" role="status" aria-live="polite"></p><p>Vídeos externos oficiais, com créditos preservados. A reprodução depende da disponibilidade do NHS/YouTube.</p></footer>'+
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
 '#pf-classes-modal .pf-class-video-placeholder{display:grid;place-items:center;height:158px;background:linear-gradient(125deg,#5d35aa,#1e8a85);border-radius:12px;font-size:48px;color:white}'+
 '#pf-classes-modal .pf-class-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}'+
 '#pf-classes-modal .pf-class-actions button{border:1px solid #7489ba;padding:10px;min-height:42px;font:800 12px/1.3 system-ui;color:#fff;background:#394464;border-radius:11px}'+
 '#pf-classes-modal .pf-class-actions .pf-class-primary{grid-column:1/-1;background:#7540d4;border-color:#ae8aff;font-size:14px}'+
 '#pf-classes-modal #pf-class-player a{color:#abffe1;font:12px/1.5 system-ui;overflow-wrap:anywhere}'+
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