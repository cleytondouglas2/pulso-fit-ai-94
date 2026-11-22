/* ELNEX Sense: chat generativo com consentimento explicito e provedor configuravel */
let elxChatMessages=[];
let elxChatBusy=false;
let elxChatProvider={configured:false,provider:null,model:null};
elnexSkills.unshift({mode:'chat',title:'Conversar com IA',hint:'Pergunte livremente à inteligência artificial',icon:'🤖',cta:'Enviar mensagem',placeholder:'O que você gostaria de conversar?'});
elnexSenseMode='chat';
const elxPriorLoadSense=loadSense;
loadSense=async function(){
 if(elnexSenseMode==='chat')return elxRenderChat();
 await elxPriorLoadSense();
 const panel=$('#senseGenerate');
 if(panel){
   const consent=document.createElement('div');
   consent.id='elnexAIConsentArea';consent.className='elnex-ai-consent-wrap';
   consent.innerHTML='<label class="elnex-ai-consent-label"><input type="checkbox" id="elnexAISuggestConsent"> Autorizo o envio do texto que digitei a um provedor externo de IA, quando a geração estiver ativada.</label><div class="elnex-ai-consent-hint" id="elnexAISuggestStatus">Verificando o provedor...</div>';
   panel.insertAdjacentElement('beforebegin',consent);
   elxUpdateSuggestionStatus();
 }
 $('#content').querySelectorAll('[data-mode="chat"]').forEach(b=>b.addEventListener('click',()=>loadSense()));
};
async function elxGetProviderStatus(){
 try{
  const answer=await request('/functions/v1/elnex-ai',{method:'GET'});
  elxChatProvider=answer&&typeof answer==='object'?answer:{configured:false};
 }catch{
  elxChatProvider={configured:false,mode:'unavailable'};
 }
 return elxChatProvider;
}
async function elxUpdateSuggestionStatus(){
 const state=await elxGetProviderStatus();
 const host=$('#elnexAISuggestStatus'),consent=$('#elnexAISuggestConsent');
 if(!host)return;
 if(state.configured){
   host.textContent='IA generativa conectada ('+state.provider+'). Sua mensagem será processada externamente somente com consentimento.';
   if(consent)consent.closest('label').style.display='';
 }else{
   host.textContent='Modo básico ativo. Para ativar IA generativa, configure um provedor em ELNEX Admin → Inteligência artificial.';
   if(consent)consent.closest('label').style.display='none';
 }
}
elxAskSense=async function(){
 const field=$('#senseInput'),result=$('#senseResult'),btn=$('#senseGenerate');
 if(!field||!result||!btn)return;
 const context=field.value.trim();
 if(context.length<5){result.textContent='Escreva sua pergunta com pelo menos cinco caracteres.';field.focus();return}
 const agreed=Boolean($('#elnexAISuggestConsent')?.checked);
 if(elxChatProvider.configured&&!agreed){result.textContent='Para consultar a IA generativa, confirme o envio do texto ao provedor externo.';return}
 btn.disabled=true;btn.textContent='✦ Consultando o Sense...';result.textContent='Preparando sua resposta...';
 try{
  const answer=await request('/functions/v1/elnex-ai',{method:'POST',body:JSON.stringify({mode:elnexSenseMode,context,consent:agreed})});
  if(!answer||!answer.text)throw Error('Nenhum resultado foi retornado');
  result.innerHTML='<div class="elnex-ai-answer"><span class="elnex-answer-badge">'+(answer.source==='generative'?'✦ ELNEX SENSE · IA GENERATIVA':'✦ ELNEX SENSE · MODO BÁSICO')+'</span><div class="elnex-ai-formatted">'+elxAIFormatText(answer.text)+'</div></div>';
 }catch(error){result.textContent='Não foi possível gerar: '+(error.message||String(error))}
 finally{btn.disabled=false;const skill=elnexSkills.find(x=>x.mode===elnexSenseMode);btn.textContent=(skill?.cta||'Gerar sugestão')+' ✦'}
};
function elxChatCards(){
 return '<div class="sense-grid">'+elnexSkills.map(x=>'<button class="sense-skill '+(x.mode===elnexSenseMode?'selected':'')+'" data-ai-mode="'+esc(x.mode)+'"><span class="skill-symbol">'+x.icon+'</span><strong>'+esc(x.title)+'</strong><small>'+esc(x.hint)+'</small></button>').join('')+'</div>';
}
/* Renderização segura de Markdown simples: todo conteúdo do modelo é escapado antes de receber marcação */
function elxAIFormatText(value){
 const source=String(value||'').replace(/\r\n?/g,'\n').slice(0,6000);
 const inline=(s)=>esc(s).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>').replace(/`([^`\n]+)`/g,'<code>$1</code>');
 const lines=source.split('\n');let out='',list='',paragraph=[];
 const closeList=()=>{if(list){out+='</'+list+'>';list=''}};
 const flush=()=>{if(paragraph.length){out+='<p>'+paragraph.map(inline).join(' ')+'</p>';paragraph=[]}};
 for(const rawLine of lines){
  const line=rawLine.trim();
  if(!line){flush();closeList();continue}
  const heading=line.match(/^#{1,4}\s+(.+)$/);
  const boldTitle=line.match(/^\*\*([^*]+)\*\*:?\s*$/);
  const bullet=line.match(/^(?:[-*•])\s+(.+)$/);
  const numbered=line.match(/^\d{1,3}[.)]\s+(.+)$/);
  if(heading||boldTitle){flush();closeList();out+='<h4>'+inline(heading?heading[1]:boldTitle[1])+'</h4>';continue}
  if(bullet||numbered){
    flush();const type=bullet?'ul':'ol';
    if(list!==type){closeList();out+='<'+type+'>';list=type}
    out+='<li>'+inline((bullet||numbered)[1])+'</li>';continue
  }
  closeList();paragraph.push(line);
 }
 flush();closeList();
 return out||'<p>Não foi possível exibir a resposta.</p>';
}
function elxChatRenderMessages(){
 const host=$('#elnexAIMessages');if(!host)return;
 if(!elxChatMessages.length){
   host.innerHTML='<div class="elnex-ai-welcome"><div class="elnex-ai-avatar">✦</div><h3>Oi! Sou o ELNEX Sense.</h3><p>Posso ajudar com relacionamentos, conversas, autoconhecimento e ideias de encontros respeitosos.</p><p class="muted small">As respostas geradas por IA não substituem conhecer a outra pessoa.</p></div>';
   return;
 }
 host.innerHTML=elxChatMessages.map(x=>{
   const mine=x.role==='user';
   return '<div class="elnex-ai-message '+(mine?'mine':'bot')+'"><span class="elnex-ai-speaker">'+(mine?'Você':'✦ Sense')+'</span><div class="elnex-ai-formatted">'+(mine?'<p>'+esc(x.content)+'</p>':elxAIFormatText(x.content))+'</div></div>';
 }).join('');
 host.scrollTop=host.scrollHeight;
}
function elxPushChat(role,content){
 elxChatMessages.push({role,content:String(content).slice(0,2800)});
 elxChatMessages=elxChatMessages.slice(-20);
 elxChatRenderMessages();
}
async function elxChatSend(event){
 event.preventDefault();
 if(elxChatBusy)return;
 const input=$('#elnexAIText');
 if(!input)return;
 const prompt=input.value.trim();
 if(prompt.length<5){$('#elnexAIChatNotice').textContent='Escreva uma mensagem com pelo menos cinco caracteres.';return}
 if(elxChatProvider.configured&&!$('#elnexAIChatConsent')?.checked){
   $('#elnexAIChatNotice').textContent='Confirme o envio do texto ao provedor externo antes de usar a IA.';
   return;
 }
 const previous=elxChatMessages.slice(-8);
 elxPushChat('user',prompt);
 input.value='';input.style.height='auto';
 const button=$('#elnexAISend');button.disabled=true;elxChatBusy=true;
 $('#elnexAIChatNotice').textContent='✦ Sense preparando resposta...';
 try{
   const response=await request('/functions/v1/elnex-ai',{method:'POST',body:JSON.stringify({mode:'chat',context:prompt,history:previous,consent:Boolean($('#elnexAIChatConsent')?.checked)})});
   if(!response||!response.text)throw Error('O modelo não retornou uma resposta');
   elxPushChat('assistant',response.text);
   $('#elnexAIChatNotice').textContent=response.source==='generative'?'✓ Resposta gerada por '+(response.provider||'IA')+'.':'Modo básico: chat generativo ainda não conectado.';
 }catch(error){
   elxPushChat('assistant','Não consegui responder agora: '+(error.message||String(error)));
   $('#elnexAIChatNotice').textContent='Falha temporária. Você pode tentar novamente.';
 }finally{
   elxChatBusy=false;
   const b=$('#elnexAISend');if(b)b.disabled=false;
   const f=$('#elnexAIText');if(f)f.focus();
 }
}
async function elxRenderChat(){
 $('#content').innerHTML='<div class="sense motion-in"><section class="sense-hero"><div><div class="tag">✦ INTELIGÊNCIA ARTIFICIAL NO ELNEX</div><h2 class="display-title">Converse sobre <span style="color:#ffb1df">o que importa.</span></h2><p>Seu espaço para explorar relacionamentos com cuidado, aprender a conversar e refletir sobre conexões reais.</p></div><div class="sense-orb" aria-hidden="true">✦</div></section>'+
 elxChatCards()+
 '<section class="elnex-ai-chat card"><div class="elnex-ai-chat-top"><div><div class="tag">SENSE CHAT</div><h2 style="margin:6px 0">Sua conversa com a IA</h2></div><span class="tag-rose" id="elnexAIConnection">Verificando...</span></div><div class="elnex-ai-messages" id="elnexAIMessages" role="log" aria-label="Conversa com o ELNEX Sense"></div><div class="elnex-ai-quick"><button type="button" data-quick-ai="Como puxar conversa com alguém sem parecer forçado?">💬 Começar conversa</button><button type="button" data-quick-ai="Como posso escrever uma biografia interessante e autêntica?">✦ Melhorar meu perfil</button><button type="button" data-quick-ai="Quais sinais indicam uma conexão respeitosa e saudável?">♡ Conexão saudável</button></div><form id="elnexAIChatForm"><label class="elnex-ai-consent-label" id="elnexChatConsentLabel"><input type="checkbox" id="elnexAIChatConsent"> Concordo em enviar minhas mensagens ao provedor externo de IA para gerar respostas.</label><div class="elnex-ai-composer"><textarea id="elnexAIText" rows="2" maxlength="1100" placeholder="Escreva aqui sua pergunta..." aria-label="Escreva sua pergunta ao ELNEX Sense"></textarea><button class="btn" id="elnexAISend" type="submit">Enviar ✦</button></div></form><div class="elnex-ai-footer"><span id="elnexAIChatNotice">As conversas não são salvas em seu perfil. Não compartilhe senhas nem dados sensíveis.</span><button type="button" class="btn alt" id="elnexAIClear">Limpar conversa</button></div><p class="muted small">A modalidade gratuita de alguns provedores de IA pode utilizar dados para aprimorar serviços. Evite inserir dados pessoais de terceiros.</p></section></div>';
 elxChatRenderMessages();
 $('#elnexAIChatForm').onsubmit=elxChatSend;
 $('#elnexAIClear').onclick=()=>{elxChatMessages=[];elxChatRenderMessages();$('#elnexAIChatNotice').textContent='Conversa apagada neste navegador.'};
 $('#content').querySelectorAll('[data-ai-mode]').forEach(b=>b.onclick=()=>{
    elnexSenseMode=b.dataset.aiMode;loadSense();
 });
 $('#content').querySelectorAll('[data-quick-ai]').forEach(b=>b.onclick=()=>{
    const field=$('#elnexAIText');field.value=b.dataset.quickAi;field.focus();
 });
 $('#elnexAIText').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#elnexAIChatForm').requestSubmit()}};
 const status=await elxGetProviderStatus();
 if(!$('#elnexAIConnection'))return;
 if(status.configured){
   $('#elnexAIConnection').textContent='IA conectada · '+status.provider;
   $('#elnexAIChatNotice').textContent='IA generativa ativa. Concorde com o processamento externo antes de enviar mensagens.';
 }else{
   $('#elnexAIConnection').textContent='Aguardando provedor';
   $('#elnexAIChatNotice').textContent='O chat generativo ainda depende de uma chave no painel ELNEX Admin → Inteligência artificial. Enquanto isso, o Sense mantém sugestões básicas.';
   $('#elnexChatConsentLabel').style.display='none';
 }
}
