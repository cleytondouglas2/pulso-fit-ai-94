/* ARGUS Chat -> secure merchant payout form. Never treats model text as financial authority. */
(()=>{
'use strict';
const root=document.getElementById('argus-portal-ai');
if(!root)return; // Admin chat has no merchant wallet authority.
const chat=root.querySelector('.ai-conversation');
const chatForm=root.querySelector('.ai-form');
const chatField=root.querySelector('.ai-question');
const presets=root.querySelector('.ai-presets');
if(!chat||!chatForm||!chatField||!presets)return;
const MIN=200,MAX=10000,FEE=100;
const brl=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
const safeCents=v=>{
 const raw=String(v||'').trim();
 if(!/^\d{1,5}(?:[,.]\d{1,2})?$/.test(raw))return null;
 const [whole,part='']=raw.replace(',','.').split('.');
 const value=Number(whole)*100+Number((part+'00').slice(0,2));
 return Number.isSafeInteger(value)?value:null;
};
const payoutIntent=q=>/^\s*(?:(?:eu\s+)?quero\s+|preciso\s+|gostaria\s+de\s+|por\s+favor\s+)?(?:sacar|fazer\s+(?:um\s+)?saque|solicitar\s+(?:um\s+)?saque|retirar\s+(?:meu\s+)?saldo)\b/i.test(q);
function amountFromPhrase(phrase){
 const match=phrase.match(/(?:R\$\s*)?(\d{1,5}(?:[.,]\d{1,2})?)/i);
 return match?safeCents(match[1]):null;
}
function line(text){
 const node=document.createElement('div');node.className='ai-message ai-assistant';
 const label=document.createElement('small');label.textContent='Argus IA · Saque protegido';
 const p=document.createElement('p');p.textContent=text;node.append(label,p);
 chat.append(node);chat.scrollTop=chat.scrollHeight;return node;
}
function status(node,text){node.textContent=text;node.classList.add('ai-payout-note')}
async function begin(phrase=''){
 if(root.hidden||document.querySelector('#dashboard')?.hidden){
  line('Entre na sua conta de revendedor para solicitar um saque.');return;
 }
 const bubble=line('Posso preparar seu saque aqui na conversa. A chave Pix deve ser preenchida somente no formulário seguro; não a envie como mensagem para a IA.');
 const form=document.createElement('form');
 form.className='ai-payout-form';form.autocomplete='off';form.noValidate=true;
 form.innerHTML=[
  '<label>Valor total do saque (R$)<input name="amount" inputmode="decimal" placeholder="10,00" maxlength="9" required></label>',
  '<label>Tipo da chave Pix<select name="pix_key_type" required>',
  '<option value="cpf">CPF</option><option value="cnpj">CNPJ</option>',
  '<option value="email">E-mail</option><option value="phone">Celular</option>',
  '<option value="evp">Chave aleatória</option></select></label>',
  '<label>Chave Pix do destinatário<input name="pix_key" maxlength="190" autocomplete="off" spellcheck="false" required></label>',
  '<p class="ai-payout-balance" aria-live="polite">Consultando sua carteira individual…</p>',
  '<p class="ai-payout-quote" aria-live="polite">Preencha o valor para conferir a operação.</p>',
  '<label class="ai-payout-consent"><input name="confirm" type="checkbox" required>',
  '<span>Revisei a chave de destino, o valor e a taxa de serviço de R$ 1,00. Autorizo esta solicitação.</span></label>',
  '<div class="ai-payout-actions"><button type="submit" disabled>Confirmar e solicitar saque</button>',
  '<button type="button" data-payout-cancel>Cancelar</button></div>',
  '<p class="ai-payout-note" role="status" aria-live="polite">A IA não aprova, executa ou confirma pagamentos. A API financeira verifica saldo, cadastro e regras de risco.</p>'
 ].join('');
 bubble.append(form);
 const amount=form.elements.namedItem('amount');
 const type=form.elements.namedItem('pix_key_type');
 const key=form.elements.namedItem('pix_key');
 const confirmCheck=form.elements.namedItem('confirm');
 const send=form.querySelector('[type="submit"]');
 const note=form.querySelector('.ai-payout-note');
 const balance=form.querySelector('.ai-payout-balance');
 const quote=form.querySelector('.ai-payout-quote');
 let available=0,enabled=false,started=false,finished=false;
 const preset=amountFromPhrase(phrase);
 if(preset!==null)amount.value=(preset/100).toFixed(2).replace('.',',');
 const update=()=>{
  const v=safeCents(amount.value);
  const valid=v!==null&&v>=MIN&&v<=MAX;
  quote.textContent=!valid?'O saque deve ficar entre R$ 2,00 e R$ 100,00.':
   'Debitado '+brl(v)+' · Taxa de serviço '+brl(FEE)+' · Pix ao destinatário '+brl(v-FEE);
  send.disabled=started||finished||!enabled||!valid||v>available||!key.value.trim()||!confirmCheck.checked;
  if(valid && v>available)quote.textContent+=' · Saldo disponível insuficiente.';
 };
 for(const input of [amount,type,key,confirmCheck]){input.addEventListener('input',update);input.addEventListener('change',update);}
 form.querySelector('[data-payout-cancel]').addEventListener('click',()=>{
  if(started)return;finished=true;form.reset();form.remove();status(bubble.querySelector('p'),'Solicitação cancelada. Nenhum saque foi enviado.');});
 update();chat.scrollTop=chat.scrollHeight;
 try{
  const data=await request('/api/portal/wallet'); // authenticated session, tenant-scoped
  if(!form.isConnected||finished)return;
  available=Math.max(0,Number(data.wallet?.available_cents||0));
  enabled=data.wallet?.withdrawals_enabled===true;
  balance.textContent='Saldo disponível da sua conta: '+brl(available)+'.'+(enabled?'':' Saques financeiros ainda não estão habilitados.');
  if(/(?:todo|tudo|integral)/i.test(phrase)&&amount.value==='')amount.value=(Math.min(available,MAX)/100).toFixed(2).replace('.',',');
  update();
 }catch(e){balance.textContent='Não foi possível validar sua carteira: '+String(e?.message||e);enabled=false;update();return;}
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(started||finished)return;
  const value=safeCents(amount.value);
  const pix=key.value.trim();
  if(value===null||value<MIN||value>MAX||value>available||!enabled||!confirmCheck.checked||!pix){update();return;}
  if(!window.confirm('Confirmar solicitação de saque de '+brl(value)+'?\nTaxa de serviço: '+brl(FEE)+'\nValor líquido do Pix: '+brl(value-FEE)+'\n\nConfira a chave no formulário antes de continuar.'))return;
  // At most one POST from this form. Reconciliation is separate; never blind-retry.
  started=true;send.disabled=true;amount.disabled=true;type.disabled=true;key.disabled=true;confirmCheck.disabled=true;
  note.textContent='Solicitação em andamento. Não repita o saque enquanto o resultado não for confirmado.';
  const idempotency='chat-withdraw-'+crypto.randomUUID();
  try{
   const response=await request('/api/portal/wallet/withdrawals',{method:'POST',body:{
    amount_cents:value,pix_key_type:type.value,pix_key:pix,
    description:'Saque de vendas ARGUS Pay',idempotency_key:idempotency,confirm:true
   }});
   finished=true;
   key.value='';key.type='password';form.querySelector('[data-payout-cancel]').disabled=true;
   const withdraw=response.withdrawal||{};
   const labels={review:'Aguardando análise do Super Admin',requested:'Solicitação registrada',
    processing:'Processamento iniciado',queued:'Enviado para fila de pagamento',
    pending:'Aguardando confirmação da MisticPay',unknown:'Resultado incerto: aguardando conciliação',
    paid:'Pago conforme o status confirmado pelo provedor',failed:'Falhou',cancelled:'Cancelado'};
   note.textContent=(labels[withdraw.status]||'Solicitação recebida')+
    '. Protocolo: '+String(withdraw.id||'consultar extrato')+
    '. Acompanhe em Meus saques. Isso não significa Pix liquidado.';
   balance.textContent='O valor solicitado permanece vinculado à sua própria carteira até a conciliação.';
  }catch(e){
   // An HTTP failure might occur after the provider has accepted a transfer.
   // Do not retry, create a new idempotency key or assert that funds were unchanged.
   note.textContent='A confirmação não foi recebida. Consulte Meus saques antes de qualquer nova solicitação. Detalhe: '+String(e?.message||e);
  }finally{started=false;finished=true;send.disabled=true;chat.scrollTop=chat.scrollHeight;}
 });
}
chatForm.addEventListener('submit',event=>{
 const q=chatField.value.trim();
 if(!payoutIntent(q))return;
 event.preventDefault();event.stopImmediatePropagation();
 chatField.value='';
 begin(q); // bypass Groq: Pix keys are never transmitted to model providers
},true);
const shortcut=document.createElement('button');
shortcut.type='button';shortcut.className='ai-payout-shortcut';shortcut.textContent='Sacar meu saldo';
shortcut.addEventListener('click',()=>begin('sacar'));
presets.append(shortcut);
})();