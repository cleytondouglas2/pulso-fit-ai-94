(()=>{
'use strict';
const E=id=>document.getElementById(id),BRL=x=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(x)||0)/100);
const escapeText=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let working=false,active=false,at=0;
const FEE=100;
function cents(raw){const str=String(raw??'').trim();if(!/^\d{1,6}(?:[,.]\d{1,2})?$/.test(str))return null;const n=Number(str.replace(',','.'));return Number.isFinite(n)?Math.round(n*100):null}
function ensure(){
 if(E('argus-seller-root'))return;
 const top=E('dashboard')?.querySelector('.dash-top');if(!top)return;
 const root=document.createElement('section');root.id='argus-seller-root';root.className='argus-seller-root';
 root.innerHTML=[
  '<div class="seller-head"><div><small>ARGUS PAY · REVENDEDOR</small><h2>Minha conta financeira</h2><p>Suas vendas, chaves API e saldo individual.</p></div><button id="seller-refresh" type="button">Atualizar</button></div>',
  '<div class="seller-balances" id="seller-balances" aria-live="polite">Carregando...</div>',
  '<div class="seller-columns"><section class="seller-panel"><h3>Chaves de integração</h3><p>Gere uma chave pública e uma chave secreta para integrar sites e bots do Telegram. A chave secreta é exibida uma única vez.</p>',
  '<button id="seller-key-create" type="button">Gerar chave API e secreta</button><div id="seller-key-once" hidden></div><div id="seller-key-list"></div>',
  '<p><a href="/documentacao-api" target="_blank" rel="noopener">Documentação para sites e Telegram</a></p></section>',
  '<section class="seller-panel"><h3>Sacar meu saldo</h3><p>Seu saldo é reservado na solicitação. Taxa de serviço de R$ 1,00 por saque.</p>',
  '<form id="seller-withdraw-form" autocomplete="off"><label>Valor a receber (R$)<input name="amount" inputmode="decimal" placeholder="10,00" required></label>',
  '<label>Tipo da chave Pix<select name="pix_key_type"><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="phone">Celular</option><option value="evp">Chave aleatória</option></select></label>',
  '<label>Chave Pix<input name="pix_key" autocomplete="off" maxlength="190" required></label><div class="seller-quote" id="seller-quote">Informe o valor para calcular a reserva.</div>',
  '<label class="seller-checkbox"><input name="confirm" type="checkbox" required><span>Confirmo o destino, o valor e a taxa de serviço de R$ 1,00.</span></label>',
  '<button type="submit">Solicitar saque</button></form><h4>Meus saques</h4><div id="seller-withdrawals"></div></section></div>',
  '<section class="seller-panel"><h3>Minhas vendas Pix</h3><div id="seller-sales"></div></section>'
 ].join('');
 top.after(root);
 E('seller-refresh').onclick=()=>load(true);
 E('seller-key-create').onclick=createKey;
 E('seller-key-list').onclick=revokeKey;
 E('seller-withdraw-form').onsubmit=withdraw;
 E('seller-withdraw-form').elements.amount.oninput=quote;
}
function quote(){
 const n=cents(E('seller-withdraw-form')?.elements.amount.value),host=E('seller-quote');if(!host)return;
 host.textContent=n===null||n<100||n>10000?'Valor permitido entre R$ 1,00 e R$ 100,00.':
  'O destinatário recebe '+BRL(n)+' · Taxa de serviço '+BRL(FEE)+' · Total reservado '+BRL(n+FEE);
}
function walletRender(w){
 if(!w){E('seller-balances').textContent='Aguardando validação documental e aprovação financeira. Nenhuma API, recebimento ou saque está habilitado.';return}
 const blocks=[['Disponível',w.available_cents],['Reservado em saques',w.reserved_cents],['Taxa de serviço',FEE]];
 E('seller-balances').innerHTML=blocks.map(v=>'<div class="seller-balance"><small>'+v[0]+'</small><strong>'+BRL(v[1])+'</strong></div>').join('')+
  (w.negative_adjustments_cents>0?'<p class="seller-warning">Reversão/contestação em análise. Saques bloqueados até regularização.</p>':'')+
  (!w.withdrawals_enabled?'<p class="seller-warning">Carteira aguardando homologação financeira para receber e sacar.</p>':'');
}
function keysRender(v){
 const keys=v?.keys||[];E('seller-key-create').disabled=!v?.can_issue;
 E('seller-key-list').innerHTML=keys.length?keys.map(k=>'<div class="seller-item"><code>'+escapeText(k.public_key)+'</code><small>'+escapeText(k.revoked_at?'Revogada':'Ativa')+'</small>'+
  (k.revoked_at?'':'<button data-revoke="'+escapeText(k.id)+'" type="button">Revogar</button>')+'</div>').join(''):
  '<p>Nenhuma chave criada. A geração depende de KYC e aprovação financeira.</p>';
}
function activities(){
 return Promise.allSettled([request('/api/portal/wallet'),request('/api/portal/wallet/charges')]).then(arr=>{
  if(arr[0].status==='fulfilled'){
   walletRender(arr[0].value.wallet);
   const data=arr[0].value.withdrawals||[];
   E('seller-withdrawals').innerHTML=data.length?data.slice(0,12).map(r=>'<div class="seller-item"><b>'+BRL(r.amount_cents)+'</b> · Taxa de serviço '+BRL(FEE)+'<small>'+escapeText(r.status)+' · '+escapeText(r.pix_key_masked)+'</small></div>').join(''):
    '<p>Sem saques solicitados.</p>';
  }else walletRender(null);
  if(arr[1].status==='fulfilled'){
   const rows=arr[1].value.charges||[];
   const labels={paid:'Aprovado',pending:'Aguardando',expired:'Expirado',refunded:'Devolvido',unknown:'Conferindo',failed:'Não aprovado',creating:'Criando'};
   E('seller-sales').innerHTML=rows.length?rows.slice(0,15).map(r=>'<div class="seller-item"><strong>'+BRL(r.amount_cents)+'</strong> · Taxa de serviço '+BRL(r.service_fee_cents)+' <small>'+escapeText(labels[r.display_status]||r.display_status)+'</small></div>').join(''):
    '<p>Nenhuma cobrança Pix deste revendedor.</p>';
  }else E('seller-sales').textContent='Histórico de vendas indisponível.';
 });
}
async function load(force=false){
 ensure();if(!E('argus-seller-root')||working||(!force&&Date.now()-at<8000))return;
 working=true;
 try{
  const session=await request('/api/portal/session');active=!!session.account;
  if(!active)return;
  const keys=await request('/api/portal/keys');keysRender(keys);
  await activities();at=Date.now();
 }catch(err){active=false;walletRender(null)}
 finally{working=false;}
}
async function createKey(){
 if(!active||!confirm('Criar uma credencial? A chave secreta só poderá ser exibida agora.'))return;
 const button=E('seller-key-create');button.disabled=true;
 try{
  const v=await request('/api/portal/keys',{method:'POST',body:{}});
  const box=E('seller-key-once');box.hidden=false;box.replaceChildren();
  const title=document.createElement('strong');title.textContent='Chaves criadas! Copie agora; a secreta não poderá ser recuperada.';box.append(title);
  [['Chave API',v.api_key],['Chave secreta',v.api_secret]].forEach(([name,secret])=>{
   const label=document.createElement('label');label.textContent=name;
   const input=document.createElement('textarea');input.value=secret;input.readOnly=true;input.rows=2;label.append(input);
   const copy=document.createElement('button');copy.textContent='Copiar '+name;copy.type='button';
   copy.onclick=()=>navigator.clipboard?.writeText(secret).catch(()=>input.select());
   label.append(copy);box.append(label);
  });
  await load(true);
 }catch(err){notice('Falha ao gerar chave: '+err.message,true)}
 finally{button.disabled=false;}
}
async function revokeKey(event){
 const button=event.target.closest('button[data-revoke]');if(!button||!confirm('Revogar esta chave? As integrações que a usam serão interrompidas.'))return;
 button.disabled=true;
 try{await request('/api/portal/keys/'+encodeURIComponent(button.dataset.revoke)+'/revoke',{method:'POST',body:{}});
  E('seller-key-once').hidden=true;await load(true);
 }catch(err){notice(err.message,true)}
 finally{button.disabled=false;}
}
async function withdraw(event){
 event.preventDefault();if(working)return;
 const form=event.currentTarget,v=new FormData(form),amount=cents(v.get('amount'));
 if(amount===null||amount<100||amount>10000||!v.get('confirm')){notice('Confira o valor e confirme a taxa de serviço.',true);return}
 if(!confirm('Valor ao destinatário: '+BRL(amount)+'\nTaxa de serviço: R$ 1,00\nTotal reservado do seu saldo: '+BRL(amount+100)+'\n\nSolicitar saque?'))return;
 working=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;
 const idem=form.dataset.idem||crypto.randomUUID();form.dataset.idem=idem;
 try{
  await request('/api/portal/wallet/withdrawals',{method:'POST',body:{
   amount_cents:amount,pix_key_type:v.get('pix_key_type'),pix_key:v.get('pix_key'),
   description:'Saque de vendas ARGUS Pay',idempotency_key:idem,confirm:true}});
  delete form.dataset.idem;form.reset();quote();notice('Solicitação registrada. Valor reservado na sua carteira, aguardando processamento autorizado.');
  await activities();
 }catch(err){notice('Não reenvie automaticamente: '+err.message,true)}
 finally{working=false;button.disabled=false;}
}
function start(){ensure();setTimeout(()=>load(true),750);window.addEventListener('focus',()=>load());document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
 setInterval(()=>{if(!document.hidden&&!E('dashboard')?.hidden)load()},25000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();