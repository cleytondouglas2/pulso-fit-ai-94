/* ARGUS IA • conversational experience (admin + authorized reseller).
 * Presentation only: never intercepts or submits financial requests.
 * Text from the server is rendered as text nodes, not executable HTML.
 */
(()=>{
'use strict';
if(window.__argusMythicConversation)return;
window.__argusMythicConversation=true;
const roots=[document.getElementById('argus-portal-ai'),document.getElementById('page-argus-ai')].filter(Boolean);
if(!roots.length)return;
const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6.2 10-6.2S22 12 22 12s-3.6 6.2-10 6.2S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4 4l2 2M18 18l2 2"/></svg>';
const LABELS={'argus-portal-ai':'ASSISTENTE FINANCEIRO','page-argus-ai':'CENTRAL DE INTELIGÊNCIA'};
const MONEY=/(R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\*\*[^*]{1,130}\*\*)/g;
const payoutIntent=/^\s*(?:(?:eu\s+)?quero\s+|preciso\s+|gostaria\s+de\s+|por\s+favor\s+)?(?:sacar|fazer\s+(?:um\s+)?saque|solicitar\s+(?:um\s+)?saque|retirar\s+(?:meu\s+)?saldo)\b/i;
function inline(parent,content){
 const text=String(content||'');
 MONEY.lastIndex=0;let i=0,match;
 while((match=MONEY.exec(text))!==null){
  if(match.index>i)parent.append(document.createTextNode(text.slice(i,match.index)));
  const span=document.createElement('strong');
  span.className=match[0].startsWith('R$')?'ai-number-accent':'ai-emphasis';
  span.textContent=match[0].startsWith('**')?match[0].slice(2,-2):match[0];
  parent.append(span);i=match.index+match[0].length;
 }
 if(i<text.length)parent.append(document.createTextNode(text.slice(i)));
}
function formatSafe(source){
 const content=document.createElement('div');content.className='ai-rich-content';
 const lines=String(source||'').replace(/\r/g,'').split('\n').slice(0,90);
 let list=null,listType='';
 const flush=()=>{list=null;listType='';};
 for(const line of lines){
  const clean=line.trim();
  if(!clean){flush();continue;}
  let item=clean.match(/^[-•*]\s+(.+)$/),number=clean.match(/^\d{1,2}[.)]\s+(.+)$/);
  if(item||number){
   const type=number?'ol':'ul';
   if(!list||type!==listType){list=document.createElement(type);listType=type;content.append(list);}
   const li=document.createElement('li');inline(li,(number||item)[1]);list.append(li);continue;
  }
  flush();
  const heading=clean.match(/^#{1,3}\s+(.+)$/)||clean.match(/^\*\*(.{2,90})\*\*:?\s*$/);
  if(heading){
   const h=document.createElement('h4');h.textContent=heading[1].replace(/\*\*/g,'');
   content.append(h);continue;
  }
  const p=document.createElement('p');inline(p,clean);content.append(p);
 }
 return content;
}
function decorateMessage(node){
 if(!node?.classList?.contains('ai-message')||node.dataset.argusFormatted)return;
 node.dataset.argusFormatted='true';
 node.setAttribute('role','group');
 const label=node.querySelector(':scope > small');
 if(label){
  const isUser=node.classList.contains('ai-user');
  label.classList.add('ai-bubble-signature');
  if(!isUser&&!label.textContent.includes('Argus'))label.textContent='Argus IA · '+label.textContent;
 }
 const paragraph=node.querySelector(':scope > p');
 if(paragraph){
  const rich=formatSafe(paragraph.textContent);
  paragraph.replaceWith(rich);
 }
}
function decoratePayout(form){
 if(!form||form.dataset.argusFlow==='yes')return;
 form.dataset.argusFlow='yes';
 const bubble=form.closest('.ai-message');
 bubble?.classList.add('ai-withdrawal-dialogue');
 const intro=bubble?.querySelector(':scope > .ai-rich-content');
 if(intro){
  intro.replaceChildren();
  const p=document.createElement('p');
  p.textContent='🛡️ Aqui é o Argus! Vamos preparar seu saque Pix com atenção. Preencha os dados abaixo, confira o resumo e confirme somente se estiver tudo correto.';
  intro.append(p);
 }
 const guide=document.createElement('div');guide.className='ai-flow-header';
 guide.innerHTML='<span class="ai-flow-kicker">✧ SAQUE PIX · CONVERSA SEGURA</span><strong>Vou te guiar em 3 passos</strong><div class="ai-flow-progress" aria-label="Etapas do saque"><span data-ai-step="1"><b>1</b> Valor</span><span data-ai-step="2"><b>2</b> Destino</span><span data-ai-step="3"><b>3</b> Confirmar</span></div>';
 form.prepend(guide);
 const amount=form.elements.namedItem('amount');
 const key=form.elements.namedItem('pix_key');
 const type=form.elements.namedItem('pix_key_type');
 const consent=form.elements.namedItem('confirm');
 const balance=form.querySelector('.ai-payout-balance');
 const quote=form.querySelector('.ai-payout-quote');
 const note=form.querySelector('.ai-payout-note');
 const send=form.querySelector('button[type="submit"]');
 const cancel=form.querySelector('[data-payout-cancel]');
 const labelOf=input=>input?.closest('label');
 if(labelOf(amount)){const label=labelOf(amount);if(label.firstChild?.nodeType===3)label.firstChild.textContent='1. Qual valor você deseja sacar?';label.classList.add('ai-flow-amount');}
 if(labelOf(type)){const label=labelOf(type);if(label.firstChild?.nodeType===3)label.firstChild.textContent='2. Tipo da chave Pix';label.classList.add('ai-flow-type');}
 if(labelOf(key)){const label=labelOf(key);if(label.firstChild?.nodeType===3)label.firstChild.textContent='Chave Pix de destino';label.classList.add('ai-flow-key');}
 if(balance)balance.classList.add('ai-flow-wallet');
 if(quote)quote.classList.add('ai-flow-summary');
 if(note)note.classList.add('ai-flow-privacy');
 if(send){send.textContent='Revisar e solicitar saque Pix';send.classList.add('ai-flow-confirm');}
 if(cancel)cancel.textContent='Agora não';
 const privacy=document.createElement('p');privacy.className='ai-flow-help';
 privacy.textContent='Sua chave Pix fica somente no formulário protegido. Não a envie como mensagem para a IA.';
 if(quote)quote.after(privacy);
 const stage=()=>{
  const value=String(amount?.value||'').trim();
  const hasDestination=!!String(key?.value||'').trim();
  const checked=!!consent?.checked;
  const states=[!!value,!!value&&hasDestination,!!value&&hasDestination&&checked];
  const nodes=guide.querySelectorAll('[data-ai-step]');
  nodes.forEach((node,i)=>{
   const isDone=states[i];
   node.classList.toggle('is-done',isDone);
   node.classList.toggle('is-current',!isDone&&(i===0||states[i-1]));
   node.setAttribute('aria-current',!isDone&&(i===0||states[i-1])?'step':'false');
  });
 };
 // Only track whether the fields were filled. Pix destination contents never
 // leave the original secure form and are not sent to the language model.
 for(const el of [amount,type,key,consent]){
  el?.addEventListener('input',stage);
  el?.addEventListener('change',stage);
 }
 stage();
}
for(const root of roots){
 const isPortal=root.id==='argus-portal-ai';
 const box=root.querySelector('.ai-shell > .ai-box');
 const chat=root.querySelector('.ai-conversation');
 const input=root.querySelector('.ai-question');
 const form=root.querySelector('.ai-form');
 if(!box||!chat||!input||!form)continue;
 root.classList.add('argus-ai-mythic');
 const heading=box.querySelector('.ai-heading');
 const banner=document.createElement('div');banner.className='ai-argus-banner';
 const avatar=document.createElement('div');avatar.className='ai-argus-avatar';avatar.innerHTML=icon;
 const text=document.createElement('div');text.className='ai-argus-brand';
 const eyebrow=document.createElement('span');eyebrow.className='ai-argus-eyebrow';eyebrow.textContent=LABELS[root.id];
 const title=document.createElement('strong');title.textContent='Argus · Seus olhos atentos às finanças';
 const subtitle=document.createElement('p');subtitle.textContent='Inspirado no guardião de cem olhos da mitologia grega. Informação clara, sem perder o bom humor.';
 text.append(eyebrow,title,subtitle);banner.append(avatar,text);
 heading?.after(banner);
 const initial=chat.querySelector('.ai-message.ai-assistant');
 if(initial){
  const p=initial.querySelector(':scope > p');
  if(p)p.textContent='Saudações! ✨ Sou o Argus, seu companheiro financeiro. Posso ajudar a acompanhar Pix, conferir movimentações e entender suas integrações. Por onde vamos começar?';
 }
 chat.querySelectorAll('.ai-message').forEach(decorateMessage);
 chat.setAttribute('aria-label','Conversa com Argus IA');
 const shortcuts=root.querySelector('.ai-presets');
 if(shortcuts){
  shortcuts.classList.add('ai-argus-quick');
  if(isPortal){
   const chip=document.createElement('button');chip.type='button';chip.className='ai-argus-new-preset';
   chip.textContent='✦ Como está minha operação?';
   chip.addEventListener('click',()=>{input.value='Como está minha operação financeira?';input.focus();});
   shortcuts.prepend(chip);
  }
 }
 const prompt=document.createElement('div');prompt.className='ai-argus-prompt';
 prompt.textContent=isPortal?'Pergunte sobre sua operação ou comece um saque pelo botão abaixo.':'Pergunte sobre desempenho, alertas e integrações.';
 form.before(prompt);
 const oldLabel=form.querySelector('.ai-send');
 if(oldLabel)oldLabel.textContent='Enviar ↗';
 let typing=null,typingTimer=0;
 const clearTyping=()=>{
  typing?.remove();typing=null;
  if(typingTimer){clearTimeout(typingTimer);typingTimer=0;}
 };
 form.addEventListener('submit',()=>{
  const q=input.value.trim();
  if(q.length<2||q.length>850||(isPortal&&payoutIntent.test(q)))return;
  setTimeout(()=>{
   if(typing||!chat.isConnected)return;
   const waiting=document.createElement('div');waiting.className='ai-typing-indicator';
   waiting.setAttribute('role','status');waiting.setAttribute('aria-live','polite');
   waiting.innerHTML='<span class="ai-typing-eye">'+icon+'</span><span>Argus está analisando <i></i><i></i><i></i></span>';
   chat.append(waiting);chat.scrollTop=chat.scrollHeight;typing=waiting;
   typingTimer=setTimeout(clearTyping,18000);
  },0);
 },true);
 let scheduled=false;
 const scan=()=>{
  scheduled=false;
  for(const node of chat.querySelectorAll('.ai-message:not([data-argus-formatted])')){
   const isAssistant=node.classList.contains('ai-assistant');
   decorateMessage(node);
   if(isAssistant&&typing)clearTyping();
  }
  for(const payout of chat.querySelectorAll('.ai-payout-form:not([data-argus-flow])'))decoratePayout(payout);
 };
 const observer=new MutationObserver(()=>{
  if(!scheduled){scheduled=true;requestAnimationFrame(scan);}
 });
 observer.observe(chat,{childList:true,subtree:true});
 scan();
 window.addEventListener('pagehide',()=>{observer.disconnect();clearTyping();},{once:true});
}
})();
