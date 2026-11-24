/* Scoped management tools. Never execute or confirm financial operations. */
(()=>{'use strict';
const E=id=>document.getElementById(id);
const add=(p,t,v,c)=>{const e=document.createElement(t);if(v!==undefined)e.textContent=v;if(c)e.className=c;p.append(e);return e};
const btn=(p,t,f)=>{const b=add(p,'button',t);b.type='button';b.onclick=f;return b};
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(c)/100);
const choices={
 subscription:['Argus Subscription · agenda de mensalidades','Gestão de ciclos e vencimentos, sem débito automático.',[['amount_cents','Valor (R$)','money'],['due','Próximo vencimento','date'],['cycle','Periodicidade',['weekly:Semanal','monthly:Mensal','yearly:Anual']]]],
 invoice:['Cobranças em lote · rascunhos','Registros e links manuais; não são Pix emitidos nem pagamentos confirmados.',[['amount_cents','Valor (R$)','money'],['due','Vencimento','date']]],
 product:['Catálogo de produtos','Cadastre e organize ofertas. O checkout atual confirma o valor efetivo.',[['amount_cents','Preço sugerido (R$)','money']]],
 coupon:['Cupons · planejamento','Registre descontos para campanhas. Ainda não altera o valor no checkout.',[['code','Código','text'],['discount_percent','Desconto (%)','number'],['due','Validade','date']]],
 flow:['Argus Flow','Regras de alerta avaliadas ao consultar indicadores. Não movimentam dinheiro.',[['trigger','Gatilho',['pending:Pix pendentes','failed:Falhas e reversões','due:Vencimentos']],['threshold','Quantidade mínima','number']]],
 support:['Central de suporte','Abra chamados e converse com a administração dentro do painel.',[['category','Categoria',['payments:Pagamento','account:Conta','technical:Técnico','other:Outros']]]],
 dispute:['Contestações e MED','Organize evidências e referências; não abre MED na adquirente nem devolve valores.',[['reference','ID de operação','text'],['category','Tipo',['refund:Devolução','partial_refund:Devolução parcial','med:MED','other:Outros']]]],
 integration:['Integrações · configuração planejada','Cadastre necessidades de integração. Use as APIs e webhooks existentes para conexão real.',[['category','Canal',['woocommerce:WooCommerce','shopify:Shopify','telegram:Telegram','api:API','other:Outros']]]],
 team:['Equipe · propostas de acesso','Registre funções desejadas. Não cria credenciais nem concede permissões.',[['role_requested','Perfil solicitado',['finance:Financeiro','support:Suporte','developer:Desenvolvedor','viewer:Consulta']]]],
 limit_request:['Limites · propostas','Não altera limites financeiros efetivos.',[['amount_cents','Limite sugerido (R$)','money']]],
 fee_request:['Taxas · propostas','Não altera tarifas vigentes.',[['basis_points','Taxa em pontos-base (100 = 1%)','number']]],
 contract:['Contratos · controle de prazos','Não substitui assinatura digital.',[['due','Data de revisão','date']]],
 incident:['Incidentes · registro','Controle operacional e trilha de alterações.',[['severity','Gravidade',['low:Baixa','medium:Média','high:Alta','critical:Crítica']]]],
 approval:['Aprovações · solicitações','Registre propostas; não autoriza saque nem operação financeira.',[['reference','Referência interna','text']]],
 routing:['Smart Routing · homologação','Registre candidatos e testes necessários. Nenhuma troca automática de adquirente.',[['category','Meio',['pix:Pix','card:Cartão','boleto:Boleto','payout:Saque']]]],
 marketplace:['Marketplace · comissões propostas','Planejamento de comissões. Split real exige integração homologada.',[['basis_points','Comissão em pontos-base','number']]]
};
const shared=['subscription','invoice','product','coupon','flow','support','dispute','integration','team'];
const adminExtra=['limit_request','fee_request','contract','incident','approval','routing','marketplace'];
const fieldsLabels={amount_cents:'Valor',due:'Vencimento',cycle:'Ciclo',code:'Código',discount_percent:'Desconto (%)',trigger:'Gatilho',threshold:'Limite',category:'Categoria',reference:'Referência',role_requested:'Perfil',basis_points:'Pontos-base',severity:'Gravidade'};
const valid=id=>/^agr_[a-f0-9]{32}$/.test(id||'');
const nonce=()=>globalThis.crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
const retryMemory=new Map();
async function retryKey(scope,identity,kind,payload){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(kind==='batch'?'pending-batch':JSON.stringify(payload)));
 const fingerprint=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 const key='argus-growth-retry:'+scope+':'+identity+':'+kind+':'+fingerprint;
 let value=retryMemory.get(key);try{value=sessionStorage.getItem(key)||value}catch{}
 if(!value){value=nonce();retryMemory.set(key,value);try{sessionStorage.setItem(key,value)}catch{}}
 return {nonce:value,done(){retryMemory.delete(key);try{sessionStorage.removeItem(key)}catch{}}};
}
async function messageHistory(id,host,call,tell){
 const first=await call('/thread/'+id);host.replaceChildren();
 let cursor=first.next_cursor,loading=false;const list=add(host,'div');const seen=new Set();
 const render=m=>{if(seen.has(m.id))return null;seen.add(m.id);const p=document.createElement('p');p.textContent=(m.sender==='admin'?'Admin: ':'Revendedor: ')+m.body;return p};
 for(const m of first.messages||[]){const p=render(m);if(p)list.append(p)}
 if(!first.messages?.length)add(list,'p','Nenhuma mensagem ainda.');
 const more=btn(host,'Carregar mensagens anteriores',async()=>{if(loading||!cursor)return;loading=true;more.disabled=true;try{const r=await call('/thread/'+id+'?cursor='+encodeURIComponent(cursor));const fragment=document.createDocumentFragment();for(const m of r.messages||[]){const p=render(m);if(p)fragment.append(p)}list.prepend(fragment);cursor=r.next_cursor;more.hidden=!cursor}catch(e){tell(e.message)}finally{loading=false;more.disabled=false}});
 more.hidden=!cursor;host.prepend(more);
}
function setup(host,scope,identity){
 const panel=add(host,'section',undefined,'argus-growth');panel.dataset.growthOwner=identity;
 const title=add(panel,'div',undefined,'ag-head');add(title,'small','ARGUS PAY · INTELIGÊNCIA E GESTÃO');add(title,'h2','Argus Intelligence & Growth');add(title,'p','Indicadores reais, gestão operacional e módulos em evolução. As propostas não alteram operações financeiras.');
 const nav=add(panel,'div',undefined,'ag-tabs');const content=add(panel,'div',undefined,'ag-content');const msg=add(panel,'p','', 'ag-message');msg.setAttribute('role','status');
 const root='/api/'+scope+'/growth';
 const call=(path,body)=>scope==='admin'?(body?post(root+path,body):api(root+path)):(body?request(root+path,{method:'POST',body}):request(root+path));
 let generation=0,view='metrics',busy=false,report=null;
 const tell=t=>{msg.textContent=t};
 const download=()=>{if(!report)return;const csv='\uFEFFData;Pix confirmados;Valor bruto em reais\n'+report.daily.map(r=>r.day+';'+r.count+';'+(r.gross_cents/100).toFixed(2).replace('.',',')).join('\n');const u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='ArgusPay-analise.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),15000)};
 async function metrics(){
  const g=++generation;content.replaceChildren();add(content,'h3','Argus Intelligence · análise financeira');const area=add(content,'div','Consultando…','ag-metrics');
  try{const r=await call('/metrics');if(g!==generation)return;report=r;area.replaceChildren();
   for(const [k,v] of [['Recebimentos confirmados (30 dias)',money(r.gross_cents)],['Pix confirmados',r.confirmed_count],['Ticket médio',r.average_ticket_cents===null?'—':money(r.average_ticket_cents)],['Projeção de 30 dias',r.forecast_30d_cents===null?'Dados insuficientes':money(r.forecast_30d_cents)],['Pendências',r.pending_count],['Vencimentos',r.due_count]]){
    const c=add(area,'article');add(c,'small',k);add(c,'strong',String(v));
   }
   const bars=add(content,'div',undefined,'ag-bars');const max=Math.max(1,...r.daily.map(x=>x.gross_cents));for(const x of r.daily){const b=add(bars,'span');b.style.height=Math.max(2,100*x.gross_cents/max)+'%';b.title=x.day+' · '+money(x.gross_cents)}
   add(content,'p',r.model);if(r.as_of)add(content,'small','Consulta em: '+new Date(r.as_of).toLocaleString('pt-BR'));
   const risk=add(content,'section',undefined,'ag-card');add(risk,'h3','Argus Shield · sinais de atenção');for(const s of r.risk_signals||[])add(risk,'p',s);if(!r.risk_signals?.length)add(risk,'p','Nenhum sinal pelas regras atuais. Isso não comprova ausência de fraude.');
   const flow=add(content,'section',undefined,'ag-card');add(flow,'h3','Argus Flow · alertas atuais');for(const f of r.flow_alerts||[])add(flow,'p',f.title+' · '+f.observed+' ocorrência(s)');if(!r.flow_alerts?.length)add(flow,'p','Nenhuma regra disparada na consulta.');
   const a=add(content,'div',undefined,'ag-tabs');btn(a,'Atualizar análise',metrics);btn(a,'Exportar CSV (Excel)',download);btn(a,'Imprimir relatório / PDF',()=>window.print());
  }catch(e){if(g===generation)area.textContent=e.message}
 }
 function blocked(){
  generation++;content.replaceChildren();add(content,'h3','Integrações financeiras · homologação');
  for(const [name,desc] of [['Cartão e parcelamento','Adquirente, tokenização e PCI DSS'],['Boleto e débito','Contrato e API bancária habilitada'],['Pix Automático','Consentimento e integração autorizada'],['Devoluções e MED','Escopo PSP, conciliação e fluxo auditado'],['Smart Routing / split / antecipação','Adaptadores homologados, idempotência e liquidação'],['Subcontas e RBAC','Abertura PSP ou autorização real de identidade e permissões'],['Mensageria e recuperação de carrinho','Consentimento, evento de checkout e provedor de entrega'],['Emissão fiscal','Integração fiscal e configuração legal']]){
   const c=add(content,'article',undefined,'ag-card');add(c,'strong',name);add(c,'p','Bloqueado para operação: '+desc);
  }
 }
 async function records(kind){
  const g=++generation;view=kind;content.replaceChildren();const spec=choices[kind];add(content,'h3',spec[0]);add(content,'p',spec[1]);
  const form=add(content,'form',undefined,'ag-form');
  const inputs={};
  function input(key,label,type){const l=add(form,'label',label);let i;if(Array.isArray(type)){i=add(l,'select');for(const pair of type){const [v,t]=pair.split(':');const o=add(i,'option',t);o.value=v}}else{i=add(l,'input');i.type=type==='money'?'text':type;i.required=key!=='note';if(type==='money'){i.inputMode='decimal';i.placeholder='10,00'}if(type==='number'){i.min='0';i.step='1'}i.maxLength=key==='note'?500:100;}inputs[key]=i}
  input('title','Nome ou referência','text');input('note','Observação (sem dados sensíveis)','text');for(const [key,label,type] of spec[2])input(key,label,type);
  const submit=add(form,'button','Salvar registro');submit.type='submit';let editing=null;const cancel=btn(form,'Cancelar edição',()=>{editing=null;form.reset();submit.textContent='Salvar registro';cancel.hidden=true});cancel.hidden=true;
  const list=add(content,'div',undefined,'ag-list');let cursor=null;
  const more=btn(content,'Carregar mais',()=>load(false));more.hidden=true;
  const thread=async(id,host)=>{
   host.replaceChildren();const log=add(host,'div','Consultando mensagens…');const form=add(host,'form',undefined,'ag-form');
   const field=add(form,'textarea');field.required=true;field.maxLength=1000;field.placeholder='Mensagem sem dados sensíveis';const send=add(form,'button','Enviar mensagem');send.type='submit';
   const load=async()=>{await messageHistory(id,log,call,tell)};
   form.onsubmit=async e=>{e.preventDefault();send.disabled=true;try{const body={message:field.value};const retry=await retryKey(scope,identity,'thread:'+id,body);await call('/thread/'+id,{...body,nonce:retry.nonce});retry.done();field.value='';await load()}catch(e){tell(e.message)}finally{send.disabled=false}};
   try{await load()}catch(e){tell(e.message)}
  };
  const copy=async t=>{try{await navigator.clipboard.writeText(t);tell('Copiado.')}catch{tell(t)}};
  async function load(reset=true){try{const r=await call('/records/'+kind+(!reset&&cursor?'?cursor='+encodeURIComponent(cursor):''));if(g!==generation)return;if(reset)list.replaceChildren();for(const item of r.items||[]){if(!valid(item.id))continue;const c=add(list,'article',undefined,'ag-card');add(c,'strong',item.data.title);add(c,'small',item.state==='open'?'Ativo · registro interno':'Arquivado');for(const [k,v] of Object.entries(item.data))if(k!=='title'&&k!=='anchor_day'&&v!=='')add(c,'p',(fieldsLabels[k]||k)+': '+(k==='amount_cents'?money(v):String(v)));const a=add(c,'div',undefined,'ag-tabs');btn(a,item.state==='open'?'Arquivar':'Reabrir',()=>action(item.id,item.state==='open'?'archive':'reopen',item.revision));if(item.state==='open'&&!item.matched_operation)btn(a,'Editar',()=>{editing=item;for(const [k,i] of Object.entries(inputs)){const x=item.data[k];i.value=k==='amount_cents'?(x/100).toFixed(2).replace('.',','):String(x??'')}submit.textContent='Salvar alterações';cancel.hidden=false;form.scrollIntoView({block:'start',behavior:'smooth'})});if(kind==='invoice'){if(item.matched_operation)add(c,'p',item.match_confirmed?'Pix vinculado e confirmado':'Pix vinculado · conferir status atual');else if(item.state==='open')btn(a,'Vincular Pix confirmado',async()=>{const op=prompt('ID do Pix confirmado da sua conta:');if(!op)return;try{await call('/match-invoice',{id:item.id,operation_id:op.trim()});tell('Pix existente associado. Nenhum valor movimentado.');await load()}catch(e){tell(e.message)}})}if(['support','dispute'].includes(kind)&&scope==='portal'){const h=add(c,'div');btn(a,'Abrir conversa',()=>thread(item.id,h))}if(kind==='subscription'&&item.state==='open')btn(a,'Avançar vencimento',()=>{if(confirm('Avançar somente a data, sem confirmar pagamento?'))action(item.id,'advance',item.revision)});if(['subscription','invoice'].includes(kind)&&scope==='portal'&&item.state==='open'&&!item.match_confirmed)btn(a,'Copiar link Pix público',async()=>{try{if(item.data.amount_cents>10000)throw Error('Valor excede o limite de R$ 100 incluindo taxas. Registro mantido como rascunho.');const r=await request('/api/portal/public-pix-link');if(!/^\/e\/[a-f0-9]{32}$/.test(r.public_path||''))throw Error('Link indisponível');const q=await fetch(r.public_path+'/quote?amount_cents='+encodeURIComponent(item.data.amount_cents),{credentials:'omit',cache:'no-store'});const data=await q.json();if(!q.ok||data.can_generate!==true||data.quote?.base_amount_cents!==item.data.amount_cents||data.quote?.total_amount_cents>10000)throw Error(data.availability_message||data.message||'Valor e taxas não compatíveis com o checkout atual.');copy(location.origin+r.public_path+'?amount_cents='+item.data.amount_cents)}catch(e){tell(e.message)}})}
   cursor=valid(r.next_cursor)?r.next_cursor:null;more.hidden=!cursor;if(reset&&!r.items?.length)add(list,'p','Nenhum registro cadastrado.');
  }catch(e){if(g===generation)tell(e.message)}}
  async function action(id,action,revision){if(busy)return;busy=true;try{await call('/action',{id,action,revision});tell('Registro atualizado. Nenhum pagamento alterado.');await load()}catch(e){tell(e.message)}finally{busy=false}}
  form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;submit.disabled=true;try{const body={};for(const [k,i] of Object.entries(inputs)){let v=i.value;if(k==='amount_cents'){const n=v.trim().replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(n))throw Error('Valor inválido');v=Math.round(Number(n)*100)}else if(['discount_percent','threshold','basis_points'].includes(k))v=Number(v);body[k]=v}if(editing)await call('/edit',{...body,id:editing.id,revision:editing.revision});else {const retry=await retryKey(scope,identity,kind,body);await call('/records/'+kind,{...body,nonce:retry.nonce});retry.done()}editing=null;cancel.hidden=true;submit.textContent='Salvar registro';tell('Registro salvo. Sem efeito financeiro.');form.reset();await load()}catch(e){tell(e.message)}finally{busy=false;submit.disabled=false}};
  if(kind==='invoice'){
   const bulk=add(content,'details');add(bulk,'summary','Importar lote de rascunhos (até 50)');
   add(bulk,'p','Uma linha por cobrança: referência;valor em reais;AAAA-MM-DD. Linhas iguais são cobranças distintas. O lote é salvo integralmente ou cancelado. Se a resposta falhar, reenvie o mesmo lote sem alterações. Nenhum Pix será criado.');
   const text=add(bulk,'textarea');text.rows=5;text.placeholder='Pedido 001;25,00;2026-12-01';
   btn(bulk,'Salvar lote de rascunhos',async()=>{if(busy)return;busy=true;let done=0;try{const lines=text.value.trim().split(/\r?\n/).filter(Boolean);if(lines.length>50)throw Error('Limite de 50 linhas');const items=lines.map(line=>{const [title,amount,due,...extra]=line.split(';');const v=(amount||'').trim().replace(',','.');if(extra.length||!title||!/^\d+(?:\.\d{1,2})?$/.test(v)||!/^\d{4}-\d{2}-\d{2}$/.test(due||''))throw Error('Linha inválida: '+line.slice(0,60));return {title,amount_cents:Math.round(Number(v)*100),due,note:'Importação de rascunho'}});const batch=await retryKey(scope,identity,'batch',items);const payload={nonce:batch.nonce,items};if(new TextEncoder().encode(JSON.stringify(payload)).length>65536)throw Error('Lote excede 64 KiB. Divida a importação.');const result=await call('/batch',payload);done=result.count;batch.done();text.value='';tell(done+' rascunho(s) processado(s).');await load()}catch(e){tell(done+' processado(s): '+e.message);await load()}finally{busy=false}});
  }
  load();
 }
 async function inbox(){
  const g=++generation;content.replaceChildren();add(content,'h3','Chamados e contestações dos revendedores');add(content,'p','Ordem de abertura. Atualize para consultar novos chamados.');const list=add(content,'div',undefined,'ag-list');
  let cursor=null,loading=false;const seen=new Set();const more=btn(content,'Carregar mais chamados',()=>load(false));const refreshList=btn(content,'Atualizar chamados',()=>load(true));more.hidden=true;async function load(reset=true){if(loading)return;loading=true;more.disabled=true;refreshList.disabled=true;try{const r=await call('/inbox'+(!reset&&cursor?'?cursor='+encodeURIComponent(cursor):''));if(g!==generation)return;if(reset){list.replaceChildren();seen.clear()}for(const item of r.items||[]){if(!valid(item.id)||seen.has(item.id))continue;seen.add(item.id);const c=add(list,'article',undefined,'ag-card');add(c,'strong',item.data.title);add(c,'p',item.data.note);add(c,'small','Última movimentação: '+(item.updated_at||'Não informada'));add(c,'small',item.kind+' · '+item.state);const log=add(c,'div');const refresh=async()=>messageHistory(item.id,log,call,tell);
   btn(c,'Ler conversa',()=>refresh().catch(e=>tell(e.message)));if(item.state==='open'){const f=add(c,'form',undefined,'ag-form');const t=add(f,'textarea');t.maxLength=1000;t.required=true;const b=add(f,'button','Responder');b.type='submit';f.onsubmit=async e=>{e.preventDefault();b.disabled=true;try{const body={message:t.value};const retry=await retryKey(scope,identity,'thread:'+item.id,body);await call('/thread/'+item.id,{...body,nonce:retry.nonce});retry.done();t.value='';await refresh()}catch(e){tell(e.message)}finally{b.disabled=false}}}}
   cursor=valid(r.next_cursor)?r.next_cursor:null;more.hidden=!cursor;if(reset&&!r.items?.length)add(list,'p','Nenhum chamado registrado.');
  }catch(e){tell(e.message)}finally{loading=false;more.disabled=false;refreshList.disabled=false}}load();
 }
 function historyPager(fetchPage,append,onBusy){
  let cursor=null,loading=false,done=false;const seen=new Set();
  return async function load(){
    if(loading||done)return;loading=true;onBusy(true,done);
    try{
      const res=await fetchPage(cursor);
      for(const event of res.items||[]){if(!seen.has(event.id)){seen.add(event.id);append(event);}}
      const next=res.next_cursor||null;done=!next||next===cursor;cursor=next;
    }finally{loading=false;onBusy(false,done);}
  };
 }
 async function health(){
  const gen=++generation;content.replaceChildren();add(content,'h3','Operações · saúde das automações');add(content,'p','Monitoramento e recuperação de alertas informativos. Nenhuma ação movimenta dinheiro.');
  const area=add(content,'div','Consultando…','ag-metrics');const list=add(content,'div',undefined,'ag-list');let cursor=null;let loading=false;let filter='pending';
  const status={healthy:'Operacional',running:'Executando',stale:'Sem atualização recente',error:'Falha',not_supported:'Banco não suportado'};
  const date=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
  try{
   const h=await call('/worker-health');if(gen!==generation)return;area.replaceChildren();
   for(const [label,value] of [['Processador',status[h.status]||'Indisponível'],['Última conclusão',date(h.last_completed_at)],['Processador de alertas',status[h.notice_worker_status]||'Indisponível'],['Último ciclo de alertas',date(h.notice_last_completed_at)],['Última aceitação pelo Push',date(h.notice_last_accepted_at)],['Último resultado',({accepted:'Aceito pelo serviço Push',disabled:'Desativado',no_devices:'Sem dispositivos',missing_event:'Evento inexistente',processed:'Processado, sem nova aceitação',deferred:'Aguardando nova tentativa'})[h.notice_outcome]||'—'],['Alertas pendentes',h.pending_advisories],['Contas em recuperação',h.deferred_accounts],['Falhas para revisão',h.failed_jobs]]){const c=add(area,'article');add(c,'small',label);add(c,'strong',String(value));}
  }catch(e){if(gen===generation)area.textContent=e.message;return}
  const actions=add(content,'div',undefined,'ag-tabs');btn(actions,'Atualizar monitoramento',health);
  const select=add(actions,'select');select.setAttribute('aria-label','Estado das falhas');for(const [v,label] of [['pending','Pendentes'],['archived','Arquivadas'],['requeued','Reencaminhadas'],['resolved','Resolvidas']]){const opt=add(select,'option',label);opt.value=v;}select.onchange=()=>{filter=select.value;cursor=null;load(true);};
  const more=btn(actions,'Carregar mais falhas',()=>load(false));more.hidden=true;
  async function load(reset){
   if(loading||gen!==generation)return;loading=true;more.disabled=true;select.disabled=true;
   try{const res=await call('/failed-jobs?state='+encodeURIComponent(filter)+(!reset&&cursor?'&cursor='+encodeURIComponent(cursor):''));if(gen!==generation)return;if(reset)list.replaceChildren();
    for(const job of res.items||[]){const c=add(list,'article',undefined,'ag-card');add(c,'strong',job.kind==='notice'?'Alerta não concluído':'Automação não concluída');add(c,'small',job.job+' · '+job.attempts+' tentativas');add(c,'p','Referência: '+job.subject);add(c,'small','Falha em '+date(new Date(job.failed_at*1000).toISOString()));
     if(job.state==='pending'){
     const b=btn(c,'Recolocar na fila',async()=>{if(!confirm('Reprocessar somente este alerta ou análise? Nenhum pagamento será executado.'))return;b.disabled=true;try{await call('/retry-job',{id:job.id});tell('Solicitação registrada. A recuperação será processada pela fila.');if(gen===generation)await health()}catch(e){tell(e.message);b.disabled=false}});
     b.disabled=job.retry_allowed===false;if(b.disabled)add(c,'small','Alerta antigo ou indisponível: arquive sem reenviar.');
     const archive=btn(c,'Arquivar falha',async()=>{if(!confirm('Arquivar esta falha? Alertas não serão reenviados; análises de contas retomam após 30 minutos. O histórico será preservado.'))return;archive.disabled=true;try{await call('/archive-job',{id:job.id});if(gen===generation)await health()}catch(e){tell(e.message);archive.disabled=false}});
     }else{add(c,'small','Revisado por '+(job.reviewed_by||'—')+' · '+(job.reviewed_at?date(new Date(job.reviewed_at*1000).toISOString()):'—'));}
     const history=btn(c,'Histórico',async()=>{history.disabled=true;const detail=add(c,'details');detail.open=true;add(detail,'summary','Histórico de recuperação');const entries=add(detail,'div');
      const labels={failed:'Falhou',archived:'Arquivada',requeued:'Reencaminhada',resolved:'Resolvida',resumed:'Retomada'};
      let moreHistory;const loadHistory=historyPager(next=>call('/failure-history?id='+encodeURIComponent(job.id)+(next?'&cursor='+encodeURIComponent(next):'')),event=>add(entries,'p',(labels[event.action]||event.action)+' · '+date(new Date(event.created_at*1000).toISOString())+' · '+event.reason+' · '+(event.actor_id||'Sistema')),(busy,done)=>{moreHistory.disabled=busy;moreHistory.hidden=done;});
      const safeLoad=async()=>{try{await loadHistory()}catch(e){tell(e.message)}};moreHistory=btn(detail,'Mais histórico / tentar novamente',safeLoad);await safeLoad();
     });

    }
    if(reset&&!res.items?.length)add(list,'p','Nenhuma falha nesta categoria.');cursor=res.next_cursor||null;more.hidden=!cursor;
   }catch(e){tell(e.message)}finally{loading=false;more.disabled=false;select.disabled=false}
  }
  await load(true);
 }
 if(scope==='admin'){btn(nav,'Chamados dos revendedores',inbox);btn(nav,'Saúde operacional',health);}

 btn(nav,'Intelligence',()=>{view='metrics';metrics()});for(const k of [...shared,...(scope==='admin'?adminExtra:[])])btn(nav,choices[k][0].split(' · ')[0],()=>records(k));btn(nav,'Homologações',blocked);btn(content,'Carregar indicadores',metrics);
}
function init(){
 if(typeof state==='undefined')return;
 const admin=E('argus-innovation-shell');const seller=E('argus-commerce-root');
 const mount=(host,scope,id)=>{if(!host)return;const old=host.querySelector('.argus-growth');if(old&&old.dataset.growthOwner!==id)old.remove();if(id&&!host.querySelector('.argus-growth'))setup(host,scope,id)};
 if(admin)mount(admin,'admin',state?.user?.role==='superadmin'?String(state.user.id||'admin'):'');
 if(seller)mount(seller,'portal',state?.account?.id?String(state.account.id):'');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();setInterval(init,1500);
})();