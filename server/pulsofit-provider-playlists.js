/* Official Spotify and YouTube embeds. No ripping, scraping, audio proxy or unauthorized downloads.
 * A user enters a public URL; its provider owns availability, controls and licenses.
 */
(function(){
"use strict";
if(window.__PF_PROVIDER_PLAYLISTS__)return;window.__PF_PROVIDER_PLAYLISTS__=true;
const $=id=>document.getElementById(id);
const token=()=>{try{return sessionStorage.getItem("pulso-fit-token")||""}catch{return ""}};
let userId="",items=[],queued=false,lastToken="",loading=false;
function parseProviderLink(input){
 let u;try{u=new URL(String(input||"").trim())}catch{return null}
 if(u.protocol!=="https:")return null;
 const host=u.hostname.toLowerCase(),parts=u.pathname.split("/").filter(Boolean);
 if(host==="open.spotify.com"){
  const i=parts.indexOf("embed"),pos=i>=0?i+1:0;
  const kind=parts[pos],id=parts[pos+1];
  if(["playlist","album","track"].includes(kind)&&/^[A-Za-z0-9]{22}$/.test(id||""))
   return {provider:"spotify",kind,id,url:"https://open.spotify.com/embed/"+kind+"/"+id,source:"https://open.spotify.com/"+kind+"/"+id,title:"Spotify • "+(kind==="playlist"?"playlist":kind==="album"?"álbum":"faixa")};
 }
 if(["www.youtube.com","youtube.com","m.youtube.com","music.youtube.com","youtu.be","www.youtube-nocookie.com"].includes(host)){
  let id="",playlist="";
  if(host==="youtu.be")id=parts[0]||"";
  else if(parts[0]==="watch"||parts[0]==="playlist"){id=u.searchParams.get("v")||"";playlist=u.searchParams.get("list")||""}
  else if(["shorts","embed","live"].includes(parts[0])){id=parts[1]||"";playlist=u.searchParams.get("list")||""}
  if(host==="www.youtube-nocookie.com"&&parts[0]==="embed"){id=parts[1]||""}
  if(/^[A-Za-z0-9_-]{12,90}$/.test(playlist))
   return {provider:"youtube",kind:"playlist",id:playlist,url:"https://www.youtube-nocookie.com/embed/videoseries?list="+encodeURIComponent(playlist)+"&playsinline=1",source:"https://www.youtube.com/playlist?list="+encodeURIComponent(playlist),title:"YouTube • playlist"};
  if(/^[A-Za-z0-9_-]{11}$/.test(id))
   return {provider:"youtube",kind:"video",id,url:"https://www.youtube-nocookie.com/embed/"+id+"?playsinline=1",source:"https://www.youtube.com/watch?v="+id,title:"YouTube • vídeo"};
 }
 return null;
}
function storage(){return "pf-provider-playlists-v1:"+userId}
function readSaved(){
 items=[];if(!userId)return;
 try{
  const list=JSON.parse(localStorage.getItem(storage())||"[]");
  if(Array.isArray(list))items=list.map(o=>parseProviderLink(o.source)).filter(Boolean).slice(0,20);
 }catch{}
}
function save(){if(userId)try{localStorage.setItem(storage(),JSON.stringify(items.map(o=>({source:o.source}))))}catch{}}
async function identify(){
 const t=token();if(!t||loading||t===lastToken&&userId)return;
 loading=true;
 try{
  const r=await fetch("/api/me",{cache:"no-store",headers:{Authorization:"Bearer "+t},signal:AbortSignal.timeout(6500)});
  if(!r.ok)return;
  const j=await r.json(),id=String((j.user||j).id||"");
  if(t!==token()||!/^[a-f0-9-]{36}$/i.test(id))return;
  if(id!==userId){userId=id;readSaved()}
  lastToken=t;render();
 }catch{}finally{loading=false}
}
function status(msg){const el=$("pf-provider-status");if(el)el.textContent=msg}
function play(item){
 const holder=$("pf-provider-player");if(!holder)return;
 holder.replaceChildren();
 const iframe=document.createElement("iframe");
 iframe.title=item.title+" • player oficial";
 iframe.src=item.url;
 iframe.loading="lazy";
 iframe.referrerPolicy="strict-origin-when-cross-origin";
 iframe.setAttribute("allow","autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture");
 iframe.setAttribute("allowfullscreen","");
 iframe.setAttribute("frameborder","0");
 iframe.setAttribute("sandbox","allow-scripts allow-same-origin allow-forms allow-popups allow-presentation");
 iframe.className="pf-provider-iframe";
 iframe.height=item.provider==="spotify"?"352":"260";
 holder.appendChild(iframe);
 const link=$("pf-provider-source");if(link){link.href=item.source;link.textContent="Abrir no "+(item.provider==="spotify"?"Spotify":"YouTube");link.hidden=false}
 status("Player oficial carregado. Dê play diretamente nele; alguns conteúdos exigem login, assinatura ou ficam indisponíveis por região.");
}
function render(){
 const list=$("pf-provider-list");if(!list)return;
 list.replaceChildren();
 const note=$("pf-provider-status");
 if(!userId){if(note)note.textContent="Entre em sua conta para salvar playlists.";return}
 if(!items.length){const p=document.createElement("p");p.textContent="Nenhum link salvo ainda. Cole o link de uma playlist pública do Spotify ou YouTube.";list.appendChild(p);return}
 items.forEach((item,i)=>{
  const row=document.createElement("div");row.className="pf-provider-item";
  const select=document.createElement("button");select.type="button";select.textContent="▶ "+item.title+" "+(i+1);select.addEventListener("click",()=>play(item));
  const del=document.createElement("button");del.type="button";del.className="pf-provider-delete";del.textContent="Excluir";del.setAttribute("aria-label","Excluir playlist "+(i+1));
  del.addEventListener("click",()=>{items.splice(i,1);save();render();const holder=$("pf-provider-player");if(holder)holder.replaceChildren()});
  row.append(select,del);list.appendChild(row);
 });
}
function mount(){
 const modal=$("pf-companion-modal");if(!modal)return;
 const existing=$("pf-provider-section");if(existing)return;
 const section=document.createElement("section");section.id="pf-provider-section";
 section.innerHTML='<h3>🎧 Spotify e YouTube</h3>'+
  '<p>Importe o link de uma playlist pública ou faixa/vídeo. A reprodução acontece no player oficial, sem baixar ou copiar músicas.</p>'+
  '<form id="pf-provider-form"><label for="pf-provider-url">Link do Spotify ou YouTube</label>'+
  '<div class="pf-provider-input-row"><input id="pf-provider-url" type="url" inputmode="url" placeholder="https://open.spotify.com/playlist/..." required autocomplete="url">'+
  '<button type="submit">Adicionar</button></div></form>'+
  '<div id="pf-provider-list"></div><div id="pf-provider-player"></div>'+
  '<a id="pf-provider-source" href="#" target="_blank" rel="noopener noreferrer" hidden></a>'+
  '<p id="pf-provider-status" aria-live="polite"></p>'+
  '<small>Spotify/YouTube podem exigir login e limitar a reprodução. O PulsoFit não oferece músicas comerciais sem licença nem ignora anúncios. O iOS pode bloquear reprodução em segundo plano.</small>';
 const where=modal.querySelector(".pf-companion-file");
 if(where)where.insertAdjacentElement("beforebegin",section);
 else modal.querySelector(".pf-companion-card")?.appendChild(section);
 section.querySelector("#pf-provider-form").addEventListener("submit",e=>{
  e.preventDefault();const input=$("pf-provider-url"),parsed=parseProviderLink(input?.value||"");
  if(!parsed){status("Link inválido. Use URL pública completa de playlist/faixa do Spotify ou playlist/vídeo do YouTube.");return}
  if(!userId){status("Entre em sua conta para salvar links.");void identify();return}
  if(items.some(o=>o.provider===parsed.provider&&o.kind===parsed.kind&&o.id===parsed.id)){status("Esta playlist já foi adicionada.");return}
  if(items.length>=20){status("Limite de 20 links salvos neste aparelho.");return}
  items.unshift(parsed);save();render();input.value="";play(parsed);
 });
 render();void identify();
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})}
function boot(){
 const css=document.createElement("style");css.id="pf-provider-embed-styles";
 css.textContent="#pf-provider-section{display:grid;gap:12px;background:#17223c;border:1px solid #8473b0;border-radius:17px;margin:14px 0;padding:14px;color:#fff;min-width:0}"+
 "#pf-provider-section h3{margin:0;color:#bafde2}#pf-provider-section p,#pf-provider-section small{font:12px/1.5 system-ui;color:#d6e0f1;margin:0}"+
 "#pf-provider-section label{font:800 12px system-ui}#pf-provider-section .pf-provider-input-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin-top:8px}"+
 "#pf-provider-section input{min-width:0;width:100%;max-width:100%;background:#101b31;border:1px solid #7389ae;border-radius:10px;color:#fff;padding:11px;font-size:16px;box-sizing:border-box}"+
 "#pf-provider-section button{background:#7550bf;border:1px solid #9a86dd;border-radius:10px;color:white;min-height:42px;padding:9px 12px;font:750 12px system-ui}"+
 "#pf-provider-section #pf-provider-list{display:grid;gap:7px;max-width:100%;overflow:hidden}"+
 "#pf-provider-section .pf-provider-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}"+
 "#pf-provider-section .pf-provider-item button:first-child{text-align:left;overflow-wrap:anywhere}"+
 "#pf-provider-section .pf-provider-delete{background:#3c344d}"+
 "#pf-provider-section .pf-provider-iframe{border:0;border-radius:12px;width:100%;max-width:100%;display:block}"+
 "#pf-provider-section #pf-provider-player{min-width:0;max-width:100%;overflow:hidden}"+
 "#pf-provider-section a{font:800 13px system-ui;color:#a7f6db}"+
 "@media(max-width:390px){#pf-provider-section .pf-provider-input-row{grid-template-columns:minmax(0,1fr)}}";
 document.head.appendChild(css);
 const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:false});
 window.addEventListener("pulso-auth-ready",()=>{lastToken="";void identify()});
 window.addEventListener("pulso-open-playlist",()=>setTimeout(schedule,60));
 schedule();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();