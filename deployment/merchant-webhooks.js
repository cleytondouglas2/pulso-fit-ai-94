/* Merchant HMAC webhook endpoints in existing ARGUS seller integration page. */
(()=>{
'use strict';
if(window.__argusMerchantWebhooksUI)return;
window.__argusMerchantWebhooksUI=true;
const E=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let loading=false;
function mount(){
 const dash=E('dashboard'),target=E('argus-reseller-page-integrations')||E('api-panel');
 if(!dash||dash.hidden||!target||E('argus-webhook-panel'))return;
 const wrap=document.createElement('section');wrap.id='argus-webhook-panel';wrap.className='argus-webhook-panel';
 wrap.innerHTML='<div class="argus-webhook-head"><div><small>API · EVENTOS ASSINADOS</small>'+
 '<h3>Webhooks da minha conta</h3><p>Seu site recebe avisos de Pix confirmado, devolução e movimentações de saque. Somente eventos já registrados no livro-razão do ARGUS são notificados.</p></div>'+
 '<button type="button" id="argus-webhook-refresh">Atualizar</button></div>'+
 '<p class="argus-webhook-state" id="argus-webhook-status" role="status" aria-live="polite">Consultando suas integrações…</p>'+
 '<form id="argus-webhook-create" autocomplete="off"><label>URL pública HTTPS de recebimento'+
 '<input type="url" name="url" required placeholder="https://seusite.com/api/argus-webhook" maxlength="500"></label>'+
 '<button type="submit">Adicionar webhook</button></form>'+
 '<section class="argus-webhook-secret" id="argus-webhook-secret" hidden>'+
 '<strong>Copie o segredo de assinatura agora. Ele não será mostrado novamente.</strong>'+
 '<input id="argus-webhook-once" readonly autocomplete="off">'+
 '<button type="button" id="argus-webhook-copy">Copiar segredo</button></section>'+
 '<h4>Destinos configurados</h4><div id="argus-webhook-endpoints"></div>'+
 '<h4>Últimas entregas</h4><div id="argus-webhook-deliveries"></div>'+
 '<p class="argus-webhook-help">Verifique a assinatura HMAC no servidor que recebe o evento. Rejeite eventos duplicados pelo ID. Nunca libere uma venda apenas por receber um webhook: confirme também o status pela API.</p>'+
 '<a href="/documentacao-api#argus-webhooks-reference">Documentação dos webhooks</a>';
 target.append(wrap);
 E('argus-webhook-refresh').addEventListener('click',load);
 E('argus-webhook-copy').addEventListener('click',async()=>{
  const value=E('argus-webhook-once').value;
  try{await navigator.clipboard.writeText(value);setStatus('Segredo copiado. Guarde-o em local seguro.');}
  catch{setStatus('Copie o valor no campo manualmente.')}
 });
 E('argus-webhook-create').addEventListener('submit',async event=>{
   event.preventDefault();const form=event.currentTarget;
   const url=form.elements.namedItem('url').value.trim();
   const button=form.querySelector('[type=submit]');button.disabled=true;
   try{
      const result=await request('/api/portal/webhooks',{method:'POST',body:{url}});
      E('argus-webhook-once').value=result.signing_secret||'';
      E('argus-webhook-secret').hidden=false;
      form.reset();setStatus('Webhook cadastrado. Configure a assinatura antes de ativar sua automação.');
      load();
   }catch(error){setStatus(error.message,true)}
   finally{button.disabled=false}
 });
 E('argus-webhook-endpoints').addEventListener('click',async event=>{
   const button=event.target.closest('button[data-disable-webhook]');if(!button)return;
   if(!confirm('Desativar este webhook e cancelar entregas pendentes?'))return;
   button.disabled=true;
   try{await request('/api/portal/webhooks/'+encodeURIComponent(button.dataset.disableWebhook)+'/disable',
     {method:'POST',body:{}});E('argus-webhook-secret').hidden=true;E('argus-webhook-once').value='';
     await load();setStatus('Webhook desativado.');}
   catch(error){setStatus(error.message,true)}
   finally{button.disabled=false}
 });
 load();
}
function setStatus(text,bad=false){
 const el=E('argus-webhook-status');if(!el)return;
 el.textContent=text;el.classList.toggle('is-error',bad);
}
async function load(){
 if(loading||!E('argus-webhook-panel'))return;loading=true;
 try{
  const [report,log]=await Promise.all([
    request('/api/portal/webhooks'),
    request('/api/portal/webhooks/deliveries')
  ]);
  const endpoints=report.endpoints||[];
  E('argus-webhook-endpoints').innerHTML=endpoints.length?endpoints.map(w=>
    '<article class="argus-webhook-line"><div><strong>'+esc(w.url)+'</strong><small>'+
    esc(w.status==='active'?'Ativo':'Desativado')+' · '+esc(w.created_at)+'</small></div>'+
    (w.status==='active'?'<button type="button" data-disable-webhook="'+esc(w.id)+'">Desativar</button>':'')+
    '</article>').join(''):'<p class="argus-webhook-empty">Nenhum webhook cadastrado.</p>';
  const delivery=log.deliveries||[];
  E('argus-webhook-deliveries').innerHTML=delivery.length?delivery.slice(0,30).map(d=>
    '<article class="argus-webhook-line"><div><strong>'+esc(d.event_kind)+'</strong><small>'+
    esc(d.status)+' · '+Number(d.attempts||0)+' tentativa(s)'+
    (d.last_http_code?' · HTTP '+Number(d.last_http_code):'')+
    ' · '+esc(d.created_at)+'</small></div></article>').join(''):
    '<p class="argus-webhook-empty">Ainda não houve eventos para entrega.</p>';
  setStatus(report.delivery_enabled?
    'Entrega assíncrona configurada. Seu endpoint deve responder HTTP 2xx e validar HMAC.':
    'Destinos podem ser cadastrados, mas o envio automático depende de habilitação operacional do worker.');
 }catch(error){setStatus('Não foi possível consultar webhooks: '+error.message,true)}
 finally{loading=false}
}
function init(){
 const dash=E('dashboard');if(!dash)return;
 new MutationObserver(()=>mount()).observe(dash,{attributes:true,attributeFilter:['hidden']});
 if(!dash.hidden)mount();
 // The reseller SPA creates the integrations section asynchronously.
 new MutationObserver(()=>{if(!E('argus-webhook-panel'))mount()})
  .observe(dash,{childList:true,subtree:false});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
