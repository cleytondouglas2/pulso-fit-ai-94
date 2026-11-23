/* ARGUS PAY — Site Studio. Draft → preview → MFA publish → version history. */
(()=>{'use strict';
const E=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'" :'&#39;'}[c]));
const nameType=t=>({text:'Texto',textarea:'Texto longo',color:'Cor',email:'E-mail',phone:'Telefone',url:'Link',asset:'Imagem',toggle:'Ativar',number:'Número'})[t]||'Conteúdo';
const icons={'Visão geral':'◈','Identidade':'✦','SEO':'↗','Avisos':'◉','Contatos':'◎','Botões':'⌁','Imagens':'▧','Seções':'☷','Rodapé':'▣'};
let studio=null,values={},published={},selected='Visão geral',filter='',dirty=false,activeRequest=false,previewReady=false,searchTimer=null;
function mark(message,warning=false){
 const el=E('argus-studio-feedback');if(!el)return;
 el.textContent=message;el.classList.toggle('is-warning',warning);
}
function groupName(v){return v.group||'Geral'}
function groups(){
 if(!studio)return [];
 const map=new Map();
 for(const f of studio.schema||[])map.set(groupName(f),(map.get(groupName(f))||0)+1);
 return [...map].map(([label,count])=>({label,count}));
}
function changed(){
 if(!studio)return false;
 return studio.schema.some(f=>JSON.stringify(values[f.key])!==JSON.stringify(published[f.key]));
}
function dirtyFromDraft(){
 if(!studio)return false;
 return studio.schema.some(f=>JSON.stringify(values[f.key])!==JSON.stringify(studio.draft[f.key]));
}
function status(){
 const total=studio?.schema?.length||0;
 E('argus-studio-field-count').textContent=String(total);
 E('argus-studio-published-version').textContent='Versão pública '+(studio?.version||0);
 E('argus-studio-save').disabled=activeRequest||!dirtyFromDraft();
 E('argus-studio-publish').disabled=activeRequest||dirtyFromDraft();
 E('argus-studio-dirty').textContent=dirtyFromDraft()?'Alterações não salvas':
  changed()?'Rascunho salvo · não publicado':'Igual ao site publicado';
 E('argus-studio-dirty').dataset.state=dirtyFromDraft()?'unsaved':changed()?'draft':'published';
}
function navigation(){
 const nav=E('argus-studio-categories');if(!studio)return;
 const opts=[{label:'Visão geral',count:0},...groups()];
 nav.innerHTML=opts.map(g=>'<button type="button" class="argus-studio-category'+(selected===g.label?' is-selected':'')+
  '" data-studio-group="'+esc(g.label)+'"><span class="argus-studio-cat-icon">'+
  (icons[g.label]||'◇')+'</span><span>'+esc(g.label)+'</span><small>'+(g.count||'')+'</small></button>').join('');
}
function overview(){
 const draftCount=studio.schema.filter(f=>JSON.stringify(values[f.key])!==JSON.stringify(published[f.key])).length;
 return '<div class="argus-studio-welcome"><div class="argus-studio-welcome-symbol">✦</div>'+
 '<div><small>CONTEÚDO, IDENTIDADE E EXPERIÊNCIA</small><h2>Seu site. Seu controle.</h2>'+
 '<p>Personalize o conteúdo do site sem editar código. Acompanhe a prévia à direita, salve como rascunho e publique somente quando estiver pronto.</p></div></div>'+
 '<div class="argus-studio-kpi-grid">'+[
  ['Campos editáveis',studio.schema.length,'Conteúdo e configurações'],
  ['Categorias',groups().length,'Organização inteligente'],
  ['Mudanças não publicadas',draftCount,'Separação entre edição e site ao vivo'],
  ['Versão atual',studio.version,'Histórico e restauração']
 ].map(([label,n,desc])=>'<div class="argus-studio-kpi"><small>'+esc(label)+'</small><strong>'+esc(n)+'</strong><span>'+esc(desc)+'</span></div>').join('')+'</div>'+
 '<div class="argus-studio-overview-note"><h3>O que você pode personalizar</h3>'+
 '<div class="argus-studio-feature-list"><span>◈ Textos da página</span><span>✦ Logo e cores</span><span>↗ SEO e compartilhamento</span>'+
 '<span>◉ Banners e avisos</span><span>◎ Contatos e redes</span><span>▣ Rodapé e seções</span>'+
 '<span>◇ Perguntas frequentes</span><span>☷ Pré-visualização</span></div>'+
 '<p>Operações Pix, contas, chaves API, carteiras, taxas e regras de saque continuam protegidas em seus respectivos painéis. Conteúdo público não pode alterar esses serviços.</p></div>';
}
function field(spec){
 const val=values[spec.key]??spec.default;
 const type=spec.type;
 const len=Number(spec.max||250);
 const common='data-studio-input="'+esc(spec.key)+'" aria-label="'+esc(spec.label)+'"';
 let control='';
 if(type==='toggle'){
  control='<label class="argus-studio-switch"><input type="checkbox" '+common+(val?' checked':'')+
   '><span class="argus-studio-switch-track"></span><b>'+(val?'Ativado':'Desativado')+'</b></label>';
 }else if(type==='textarea'){
  control='<textarea '+common+' maxlength="'+len+'" rows="'+(len>450?4:3)+'">'+esc(val)+'</textarea>';
 }else if(type==='color'){
  control='<div class="argus-studio-color"><input type="color" '+common+' value="'+esc(val)+'">'+
   '<span>'+esc(val)+'</span></div>';
 }else{
  const htmlType=type==='email'?'email':type==='number'?'number':'text';
  const placeholder=type==='asset'?'https://.../imagem.webp ou /static/assets/...':
   type==='url'?'https://... ou /pagina':'Digite o conteúdo…';
  control='<input type="'+htmlType+'" '+common+' value="'+esc(val)+'" maxlength="'+len+
   '" placeholder="'+esc(placeholder)+'"'+(type==='number'?' min="0" max="100" step="1"':'')+
   ' spellcheck="false" autocomplete="off">';
 }
 const badge=JSON.stringify(val)!==JSON.stringify(published[spec.key])?
 '<span class="argus-studio-edited">Alterado</span>':'';
 return '<div class="argus-studio-field"><div class="argus-studio-field-head"><label>'+
  esc(spec.label)+'</label><span>'+badge+'<small>'+nameType(type)+'</small></span></div>'+
  control+(type==='asset'?'<p class="argus-studio-hint">Informe o endereço HTTPS de uma imagem ou um arquivo já publicado em /static/assets. O envio de arquivos não é feito neste editor.</p>':'')+
  (type==='textarea'?'<small class="argus-studio-counter">'+
   String(val).length+' / '+len+' caracteres</small>':'')+'</div>';
}
function renderFields(){
 if(!studio)return;
 const holder=E('argus-studio-fields');
 const all=studio.schema||[];
 const subset=selected==='Visão geral'?[]:all.filter(f=>groupName(f)===selected);
 const search=filter.trim().toLocaleLowerCase('pt-BR');
 const visible=search?all.filter(f=>(f.label+' '+f.group+' '+f.key).toLocaleLowerCase('pt-BR').includes(search)):subset;
 if(selected==='Visão geral'&&!search){
  holder.innerHTML=overview();
 }else{
  holder.innerHTML='<div class="argus-studio-fields-heading"><div><small>EDIÇÃO SEGURA</small><h2>'+
   esc(search?'Resultados da busca':selected)+'</h2></div><span>'+visible.length+' campos</span></div>'+
   (visible.length?visible.map(field).join(''):
   '<p class="argus-studio-empty">Nenhum campo encontrado. Experimente outro termo.</p>');
 }
 holder.querySelectorAll('[data-studio-input]').forEach(el=>el.addEventListener(el.type==='checkbox'?'change':'input',ev=>{
  const k=ev.target.dataset.studioInput,spec=all.find(f=>f.key===k);if(!spec)return;
  const v=spec.type==='toggle'?ev.target.checked:
   spec.type==='number'?Number(ev.target.value):ev.target.value;
  values[k]=v;
  if(spec.type==='toggle')ev.target.closest('.argus-studio-switch')?.querySelector('b')?.replaceChildren(document.createTextNode(v?'Ativado':'Desativado'));
  if(spec.type==='color')ev.target.parentElement.querySelector('span').textContent=v;
  const counter=ev.target.closest('.argus-studio-field')?.querySelector('.argus-studio-counter');
  if(counter)counter.textContent=String(v).length+' / '+spec.max+' caracteres';
  status();
  preview();
 }));
}
function preview(){
 const frame=E('argus-studio-preview');
 if(frame?.contentWindow&&previewReady)frame.contentWindow.postMessage({
  kind:'ARGUS_SITE_STUDIO_PREVIEW',settings:values
 },location.origin);
}
function restoreUi(data){
 studio=data;
 values={...data.draft};published={...data.published};dirty=false;
 E('argus-studio-editor').hidden=false;
 E('argus-studio-loading').hidden=true;
 E('argus-studio-site-label').textContent=String(values['brand.name']||'ARGUS Pay');
 const frame=E('argus-studio-preview');
 frame.src='/?argus_studio_preview=1';
 frame.addEventListener('load',()=>{
  previewReady=true;
  setTimeout(preview,450);
 },{once:true});
 navigation();renderFields();status();renderHistory();
}
async function load(){
 if(!E('argus-studio-editor')||activeRequest)return;
 try{
  const data=await api('/api/admin/site-studio/status');
  if(!data?.schema||!data?.draft)throw new Error('Editor não disponível.');
  restoreUi(data);
  mark('Editor carregado. As alterações afetam apenas o conteúdo público.');
 }catch(err){mark('Não foi possível abrir o editor: '+err.message,true);}
}
function renderHistory(){
 const box=E('argus-studio-history');
 if(!studio)return;
 box.innerHTML='<h3>Histórico de versões</h3>'+
  '<p>Restaure uma publicação anterior sem editar arquivos no servidor.</p>'+
  (studio.history?.length?studio.history.slice(0,12).map(h=>
   '<div class="argus-studio-version"><div><strong>Versão '+esc(h.version)+'</strong>'+
   '<small>'+esc(h.published_at)+' · '+esc(h.published_by)+'</small></div>'+
   '<button type="button" data-studio-restore="'+esc(h.version)+'"'+
   (Number(h.version)===Number(studio.version)?' disabled':'')+'>Restaurar</button></div>').join(''):
   '<div class="argus-studio-empty">Nenhuma versão publicada anteriormente.</div>');
}
async function op(path,body){
 if(activeRequest)return;
 const otp=E('argus-studio-otp').value.trim();
 if(!/^\d{6}$/.test(otp)){mark('Informe o código atual de seis dígitos do autenticador (2FA).',true);return;}
 activeRequest=true;status();
 try{
  const result=await post('/api/admin/site-studio/'+path,{...body,otp});
  E('argus-studio-otp').value='';
  mark(result.message||'Configuração atualizada.');
  await loadAfterSave(path,result);
 }catch(err){mark('Não foi possível concluir: '+err.message,true)}
 finally{activeRequest=false;status();}
}
async function loadAfterSave(path,result){
 const refreshed=await api('/api/admin/site-studio/status');
 studio=refreshed;values={...refreshed.draft};published={...refreshed.published};
 navigation();renderFields();status();renderHistory();preview();
}
function save(){
 if(!studio||!dirtyFromDraft()){mark('Nenhuma alteração não salva.');return;}
 op('draft',{settings:values,expected_draft_revision:studio.draft_revision});
}
function publish(){
 if(!studio)return;
 if(dirtyFromDraft()){mark('Salve o rascunho antes de publicar.',true);return;}
 if(!changed()){mark('O rascunho já está igual ao site publicado.');return;}
 if(!confirm('Publicar agora? As informações do site público serão atualizadas. As operações financeiras permanecem inalteradas.'))return;
 op('publish',{expected_draft_revision:studio.draft_revision});
}
function setup(){
 if(!E('argus-studio-editor'))return;
 E('argus-studio-categories').addEventListener('click',e=>{
  const button=e.target.closest('[data-studio-group]');if(!button)return;
  selected=button.dataset.studioGroup;filter='';
  E('argus-studio-search').value='';navigation();renderFields();
  E('argus-studio-fields')?.scrollTo({top:0,behavior:'smooth'});
 });
 E('argus-studio-search').addEventListener('input',e=>{
  filter=e.target.value;renderFields();
 });
 E('argus-studio-save').addEventListener('click',save);
 E('argus-studio-publish').addEventListener('click',publish);
 E('argus-studio-reload').addEventListener('click',()=>{
  if(dirtyFromDraft()&&!confirm('Descartar alterações não salvas?'))return;
  load();
 });
 E('argus-studio-reset').addEventListener('click',()=>{
  if(!studio)return;
  if(!confirm('Restaurar o conteúdo da última versão publicada no editor? Isso não altera o site até você salvar e publicar.'))return;
  values={...published};renderFields();status();preview();
 });
 E('argus-studio-history').addEventListener('click',e=>{
  const button=e.target.closest('[data-studio-restore]');if(!button)return;
  const version=Number(button.dataset.studioRestore);
  if(!confirm('Restaurar a versão '+version+' como NOVA publicação? A ação exige 2FA e não pode ser desfeita sem uma nova versão.'))return;
  op('restore',{version,expected_draft_revision:studio.draft_revision});
 });
 E('argus-studio-preview-size').addEventListener('click',e=>{
  const frame=E('argus-studio-frame-wrap'),mobile=frame.classList.toggle('is-mobile');
  e.currentTarget.textContent=mobile?'◫ Desktop':'▣ Celular';
  preview();
 });
 document.querySelectorAll('[data-nav="site-studio"]').forEach(b=>
  b.addEventListener('click',()=>setTimeout(load,75)));
 load();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
else setup();
})();