/* ELNEX • Gallery & Motion 2026-11 — mobile-first, no exposed service credentials */
let elxOverlaySeq=0,elxGalleryBusy=false,elxPhotoOverlayIndex=0;
const elxPhotoBase=API+'/storage/v1/object/public/elnex_avatars/';
const elxMimeOkay=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);
function elxPhotos(list){return Array.isArray(list)?list.filter(x=>typeof x==='string'&&Boolean(safeImg(x))).slice(0,6):[]}
function elxOverlay(){
 let el=document.getElementById('elnexRouteOverlay');
 if(el)return el;
 el=document.createElement('div');
 el.id='elnexRouteOverlay';
 el.className='elx-route-overlay';
 el.setAttribute('role','status');
 el.setAttribute('aria-live','polite');
 el.setAttribute('aria-label','Carregando ELNEX');
 el.innerHTML='<div class="elx-loading-stack"><div class="elx-loading-symbol"><span>♡</span><i></i></div><div class="elx-loading-brand">ELNEX</div><div class="elx-loading-track"><i></i></div><p id="elnexLoadingLabel">Preparando seu ELNEX...</p></div>';
 document.body.appendChild(el);
 return el;
}
function elxTransitionBegin(message='Preparando seu ELNEX...'){
 const n=++elxOverlaySeq;
 const veil=elxOverlay();
 const label=veil.querySelector('#elnexLoadingLabel');
 if(label)label.textContent=message;
 veil.classList.add('show');
 veil.setAttribute('aria-hidden','false');
 const content=$('#content');
 if(content){content.style.visibility='hidden';content.style.opacity='0';content.style.pointerEvents='none';content.setAttribute('aria-busy','true');content.classList.remove('elx-page-enter')}
 return n;
}
function elxImageReady(img,deadline=1250){
 if(img.complete)return Promise.resolve();
 return new Promise(resolve=>{
  let done=false;
  const finish=()=>{if(done)return;done=true;img.removeEventListener('load',finish);img.removeEventListener('error',finish);clearTimeout(timer);resolve()};
  const timer=setTimeout(finish,deadline);
  img.addEventListener('load',finish,{once:true});
  img.addEventListener('error',finish,{once:true});
 });
}
async function elxTransitionEnd(seq){
 if(seq!==elxOverlaySeq)return;
 const content=$('#content');
 if(content){
   await Promise.all(Array.from(content.querySelectorAll('img')).slice(0,5).map(img=>elxImageReady(img)));
 }
 if(seq!==elxOverlaySeq)return;
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 if(seq!==elxOverlaySeq)return;
 if(content){
  content.style.visibility='visible';
  content.style.opacity='';
  content.style.pointerEvents='';
  content.setAttribute('aria-busy','false');
  content.classList.remove('elx-page-enter');
  void content.offsetWidth;
  content.classList.add('elx-page-enter');
 }
 const veil=elxOverlay();
 document.documentElement.classList.remove('elx-booting');
 veil.classList.remove('show');
 veil.setAttribute('aria-hidden','true');
}
function elxSetProfileAvatar(){
 const photo=elxPhotos(profile?.photos)[0]||'';
 const top=$('#meAvatar');
 if(top){
   top.innerHTML=photo?'<img src="'+esc(photo)+'" alt="Minha foto principal">':esc((profile?.display_name||'E').trim().slice(0,1).toUpperCase()||'E');
   top.classList.toggle('has-photo',Boolean(photo));
 }
 const hero=document.querySelector('.profile-big-avatar');
 if(hero){
  hero.innerHTML=photo?'<img src="'+esc(photo)+'" alt="Foto principal do perfil">':'♡';
  hero.classList.toggle('has-photo',Boolean(photo));
 }
}
const elxGallerySectionHtml=()=>'<section class="card elx-gallery-card" id="elnexGallery"><div class="elx-gallery-head"><div><span class="tag">SUAS MELHORES FOTOS</span><h2>Meu álbum ELNEX <span style="color:#bde2ee">♡</span></h2><p class="muted">Até 6 fotos. A primeira é o destaque do perfil. Mude a ordem, escolha a principal e remova quando quiser.</p></div><span class="elx-gallery-counter" id="elnexPhotoCount">0/6</span></div><input type="file" id="elnexPhotoInput" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" class="elx-photo-input" aria-label="Selecionar fotos do perfil"><div id="elnexGalleryGrid" class="elx-gallery-grid"></div><div class="elx-gallery-foot"><button type="button" id="elnexAddPhotos" class="btn">＋ Adicionar fotos</button><span class="muted small">JPG, PNG, WebP ou HEIC · até 6 fotos · arquivo processado para até 5 MB</span></div><div class="elx-gallery-message" id="elnexGalleryMessage" role="status" aria-live="polite"></div></section>';
function elxGalleryNotice(message,kind=''){
 const box=$('#elnexGalleryMessage');
 if(box){box.textContent=message||'';box.dataset.kind=kind}
}
function elxGalleryRender(){
 const grid=$('#elnexGalleryGrid'),counter=$('#elnexPhotoCount');if(!grid)return;
 const photos=elxPhotos(profile?.photos);
 if(counter)counter.textContent=photos.length+'/6';
 const items=[];
 for(let i=0;i<6;i++){
  const src=photos[i];
  if(src){
   items.push('<article class="elx-photo-tile '+(i===0?'is-primary':'')+'" draggable="true" data-index="'+i+'"><div class="elx-tile-picture"><img src="'+esc(src)+'" alt="Foto '+(i+1)+' do perfil" loading="'+(i===0?'eager':'lazy')+'">'+(i===0?'<span class="elx-primary-mark">★ Principal</span>':'')+'<span class="elx-photo-number">'+(i+1)+'/6</span></div><div class="elx-photo-actions">'+
    (i>0?'<button type="button" class="elx-photo-select-primary" data-action="primary" data-index="'+i+'">★ Tornar principal</button>':'<span class="elx-primary-help">Primeira na descoberta</span>')+
    '<div class="elx-photo-controls"><button type="button" data-action="left" data-index="'+i+'" aria-label="Mover foto '+(i+1)+' para antes" '+(i===0?'disabled':'')+'>←</button>'+
    '<button type="button" data-action="right" data-index="'+i+'" aria-label="Mover foto '+(i+1)+' para depois" '+(i===photos.length-1?'disabled':'')+'>→</button>'+
    '<button type="button" class="elx-remove-photo" data-action="remove" data-index="'+i+'" aria-label="Remover foto '+(i+1)+'">✕</button></div></div></article>');
  }else{
   items.push('<button type="button" class="elx-gallery-placeholder" data-action="add" aria-label="Adicionar foto '+(i+1)+'"><span>＋</span><small>Foto '+(i+1)+'</small></button>');
  }
 }
 grid.innerHTML=items.join('');
 grid.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{
  if(elxGalleryBusy)return;
  const action=button.dataset.action,idx=Number(button.dataset.index);
  if(action==='add'){if(photos.length<6)$('#elnexPhotoInput')?.click();return}
  if(action==='primary'){elxGalleryMove(idx,0);return}
  if(action==='left'){elxGalleryMove(idx,idx-1);return}
  if(action==='right'){elxGalleryMove(idx,idx+1);return}
  if(action==='remove'){elxGalleryRemove(idx);return}
 });
 let start=-1;
 grid.querySelectorAll('.elx-photo-tile').forEach(tile=>{
  tile.addEventListener('dragstart',e=>{if(elxGalleryBusy){e.preventDefault();return}start=Number(tile.dataset.index);e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',String(start))}catch{}tile.classList.add('is-dragged')});
  tile.addEventListener('dragend',()=>tile.classList.remove('is-dragged'));
  tile.addEventListener('dragover',e=>{if(start<0)return;e.preventDefault();e.dataTransfer.dropEffect='move'});
  tile.addEventListener('drop',e=>{e.preventDefault();const target=Number(tile.dataset.index);const origin=start;start=-1;if(Number.isInteger(origin)&&origin!==target)elxGalleryMove(origin,target)});
 });
 const add=$('#elnexAddPhotos');if(add){add.disabled=photos.length>=6||elxGalleryBusy;add.textContent=photos.length>=6?'✓ Limite de 6 fotos':'＋ Adicionar fotos'}
 elxSetProfileAvatar();
}
async function elxGalleryPersist(next,message){
 if(!me?.id||!profile)throw Error('Perfil indisponível');
 if(next.length>6)throw Error('O limite é de seis fotos.');
 const data=await request('/rest/v1/profiles?id=eq.'+encodeURIComponent(me.id)+'&select=id,photos',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({photos:next})});
 if(!Array.isArray(data)||data.length!==1)throw Error('Não foi possível salvar as fotos na sua conta.');
 profile.photos=elxPhotos(data[0].photos);
 elxGalleryRender();
 if(message)elxGalleryNotice(message,'success');
}
async function elxGalleryMove(from,to){
 if(elxGalleryBusy)return;
 const photos=elxPhotos(profile?.photos);if(from<0||to<0||from>=photos.length||to>=photos.length||from===to)return;
 const next=[...photos],moved=next.splice(from,1)[0];next.splice(to,0,moved);
 elxGalleryBusy=true;
 const veil=elxTransitionBegin('Organizando suas fotos...');
 try{await elxGalleryPersist(next,'Ordem salva! '+(to===0?'Esta é sua nova foto principal.':'As fotos foram reorganizadas.'))}
 catch(e){elxGalleryNotice('Falha ao salvar a ordem: '+e.message,'error')}
 finally{elxGalleryBusy=false;await elxTransitionEnd(veil);elxGalleryRender()}
}
function elxOwnedStoragePath(url){
 if(typeof url!=='string'||!me?.id)return null;
 const prefix=elxPhotoBase+me.id+'/';
 if(!url.startsWith(prefix))return null;
 const tail=url.slice(elxPhotoBase.length).split('?')[0];
 return tail.startsWith(me.id+'/')?tail:null;
}
async function elxStorageDelete(photo){
 const path=elxOwnedStoragePath(photo);if(!path)return false;
 try{
  const r=await call('/storage/v1/object/elnex_avatars/'+path,{method:'DELETE'});
  if(!r.ok)console.warn('ELNEX: não foi possível limpar um arquivo antigo',r.status);
  return r.ok;
 }catch{return false}
}
async function elxGalleryRemove(index){
 if(elxGalleryBusy)return;
 const photos=elxPhotos(profile?.photos),src=photos[index];if(!src)return;
 if(!confirm('Remover esta foto do seu perfil?'))return;
 elxGalleryBusy=true;
 const veil=elxTransitionBegin('Atualizando seu álbum...');
 try{const next=photos.filter((_,i)=>i!==index);await elxGalleryPersist(next,'Foto removida do perfil.');await elxStorageDelete(src)}
 catch(e){elxGalleryNotice('Não foi possível remover: '+e.message,'error')}
 finally{elxGalleryBusy=false;await elxTransitionEnd(veil);elxGalleryRender()}
}
async function elxEncodePhoto(file){
 if(!file||!elxMimeOkay.has(file.type.toLowerCase()))throw Error('Use uma foto JPG, PNG, WebP ou HEIC.');
 if(file.size>25*1024*1024)throw Error('A imagem é muito grande. Selecione outra com até 25 MB.');
 if(file.size===0)throw Error('O arquivo de foto está vazio.');
 const objectUrl=URL.createObjectURL(file);
 try{
  const img=new Image();
  await new Promise((resolve,reject)=>{
   img.onload=resolve;img.onerror=()=>reject(new Error('Não consegui abrir esta imagem. Salve-a como JPG ou PNG e tente novamente.'));
   img.src=objectUrl;
  });
  const w=img.naturalWidth,h=img.naturalHeight;
  if(!w||!h||w*h>70000000)throw Error('Imagem com dimensão inválida ou excessiva.');
  const scale=Math.min(1,1600/Math.max(w,h));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('O navegador não conseguiu processar a imagem.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const toBlob=quality=>new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
  let blob=await toBlob(.84);
  if(blob?.size>5*1024*1024)blob=await toBlob(.66);
  if(!blob||blob.size>5*1024*1024)throw Error('Não consegui compactar a foto para até 5 MB.');
  return blob;
 }finally{URL.revokeObjectURL(objectUrl)}
}
async function elxGalleryUploadFiles(e){
 if(elxGalleryBusy||!me)return;
 const input=e.target,files=Array.from(input.files||[]);
 input.value='';
 if(!files.length)return;
 const old=elxPhotos(profile?.photos);
 if(old.length+files.length>6){elxGalleryNotice('Você já tem '+old.length+' fotos. Escolha no máximo '+(6-old.length)+' nova(s) foto(s).','error');return}
 for(const file of files){
  if(!elxMimeOkay.has(file.type.toLowerCase())||file.size>25*1024*1024){elxGalleryNotice('Selecione imagens JPG, PNG, WebP ou HEIC com até 25 MB antes da otimização.','error');return}
 }
 elxGalleryBusy=true;
 const veil=elxTransitionBegin('Preparando suas fotos...');
 const uploaded=[];
 try{
  for(let i=0;i<files.length;i++){
   const label=document.querySelector('#elnexLoadingLabel');
   if(label)label.textContent='Enviando foto '+(i+1)+' de '+files.length+'...';
   const blob=await elxEncodePhoto(files[i]);
   const path=me.id+'/'+crypto.randomUUID()+'.jpg';
   const res=await call('/storage/v1/object/elnex_avatars/'+path,{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'false','Cache-Control':'max-age=86400'},body:blob});
   if(!res.ok)throw Error('Falha ao enviar foto '+(i+1)+' (HTTP '+res.status+').');
   uploaded.push(elxPhotoBase+path);
  }
  await elxGalleryPersist([...old,...uploaded],uploaded.length===1?'Foto adicionada ao álbum!':'Fotos adicionadas ao álbum!');
 }catch(e){
  for(const src of uploaded)await elxStorageDelete(src);
  elxGalleryNotice('Não foi possível concluir o envio: '+e.message,'error');
 }finally{elxGalleryBusy=false;await elxTransitionEnd(veil);elxGalleryRender()}
}
function elxPhotoLightbox(list,index){
 const photos=elxPhotos(list);
 if(!photos.length)return;
 document.querySelector('#elxPhotoLightbox')?.remove();
 const overlay=document.createElement('div');overlay.id='elxPhotoLightbox';overlay.className='elx-photo-lightbox';
 overlay.innerHTML='<div class="elx-lightbox-head"><strong id="elxLightboxIndex"></strong><button type="button" id="elxLightboxClose" aria-label="Fechar fotos">✕</button></div><button type="button" class="elx-lightbox-arrow" id="elxLightboxPrev" aria-label="Foto anterior">‹</button><img id="elxLightboxImage" alt="Foto ampliada do perfil"><button type="button" class="elx-lightbox-arrow" id="elxLightboxNext" aria-label="Próxima foto">›</button>';
 document.body.appendChild(overlay);
 const close=()=>{overlay.remove();document.removeEventListener('keydown',keyHandler)};
 function show(i){
  elxPhotoOverlayIndex=(i+photos.length)%photos.length;
  overlay.querySelector('#elxLightboxIndex').textContent=(elxPhotoOverlayIndex+1)+' de '+photos.length;
  overlay.querySelector('#elxLightboxImage').src=photos[elxPhotoOverlayIndex];
  overlay.querySelector('#elxLightboxPrev').disabled=photos.length===1;
  overlay.querySelector('#elxLightboxNext').disabled=photos.length===1;
 }
 const keyHandler=e=>{if(e.key==='Escape')close();if(e.key==='ArrowRight')show(elxPhotoOverlayIndex+1);if(e.key==='ArrowLeft')show(elxPhotoOverlayIndex-1)};
 document.addEventListener('keydown',keyHandler);
 overlay.querySelector('#elxLightboxClose').onclick=close;
 overlay.querySelector('#elxLightboxPrev').onclick=()=>show(elxPhotoOverlayIndex-1);
 overlay.querySelector('#elxLightboxNext').onclick=()=>show(elxPhotoOverlayIndex+1);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 let touch=0;overlay.addEventListener('touchstart',e=>{touch=e.touches[0].clientX},{passive:true});
 overlay.addEventListener('touchend',e=>{const delta=e.changedTouches[0].clientX-touch;if(Math.abs(delta)>65)show(elxPhotoOverlayIndex+(delta<0?1:-1))},{passive:true});
 show(index);
}
function elxProfileGallery(){
 const form=$('#profileForm');if(!form||!me?.id)return;
 let gallery=$('#elnexGallery');if(gallery)gallery.remove();
 const host=document.createElement('div');host.innerHTML=elxGallerySectionHtml();
 const section=host.firstElementChild;
 form.insertAdjacentElement('beforebegin',section);
 $('#elnexPhotoInput').addEventListener('change',elxGalleryUploadFiles);
 $('#elnexAddPhotos').onclick=()=>$('#elnexPhotoInput').click();
 elxGalleryRender();
}
function elxDiscoveryGallery(){
 const info=currentCandidate;
 if(!info)return;
 const photos=elxPhotos(info.photos);
 if(!photos.length)return;
 const card=$('#activePerson');
 const side=$('.deck-side');
 const wrap=document.createElement('section');
 wrap.className='card elx-discovery-photos';
 wrap.innerHTML='<div class="tag">FOTOS DO PERFIL</div><p class="muted small">Conheça mais imagens compartilhadas por esta pessoa.</p><div class="elx-discovery-thumbs">'+photos.map((p,i)=>'<button type="button" data-photo="'+i+'" aria-label="Ver foto '+(i+1)+' de '+photos.length+'"><img src="'+esc(p)+'" loading="lazy" alt="Foto '+(i+1)+'"></button>').join('')+'</div>';
 if(side)side.appendChild(wrap);
 wrap.querySelectorAll('[data-photo]').forEach(btn=>btn.onclick=()=>elxPhotoLightbox(photos,Number(btn.dataset.photo)));
 if(card){
  card.style.cursor='zoom-in';
  card.addEventListener('click',e=>{
   if(e.target.closest('button,a'))return;
   // O gesto para curtir permanece independente do toque simples.
   elxPhotoLightbox(photos,0);
  });
 }
}
const elxBeforeGalleryProfile=getProfile;
getProfile=async function(){
 const route=typeof elnexNavigationToken==='number'?elnexNavigationToken:0;
 await elxBeforeGalleryProfile();
 if(route!==(typeof elnexNavigationToken==='number'?elnexNavigationToken:0))return;
 if(!$('#profileForm'))return;
 elxProfileGallery();
};
const elxBeforeGalleryRenderPerson=renderPerson;
renderPerson=function(){
 elxBeforeGalleryRenderPerson();
 elxDiscoveryGallery();
};
// Photo manager remains separated from the form's other personal information fields.
const elxOriginalOpenChat=openChat;
openChat=async function(match){
 const route=elnexNavigationToken;
 const veil=elxTransitionBegin('Abrindo sua conversa...');
 try{await elxOriginalOpenChat(match)}
 finally{if(route===elnexNavigationToken)await elxTransitionEnd(veil)}
};
const elxOriginalSaveProfile=saveProfile;
saveProfile=async function(event){
 const route=elnexNavigationToken;
 const veil=elxTransitionBegin('Salvando seu perfil...');
 try{await elxOriginalSaveProfile(event)}
 finally{if(route===elnexNavigationToken)await elxTransitionEnd(veil)}
};
function elxInitMotion(){
 elxOverlay();
 document.querySelectorAll('[data-tab]').forEach(node=>node.classList.add('elx-smooth-nav'));
}
elxInitMotion();
