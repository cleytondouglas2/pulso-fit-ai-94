/* ARGUS Innovation Center: transparent 30-feature product inventory. */
(()=>{'use strict';
const E=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'" :'&#39;'}[c]));
const initiatives=[
['Fundação','Banco financeiro dedicado','external','Requer banco isolado pago, backup e restauração validada'],
['Fundação','Conciliação avançada','partial','Ledger e conciliação existem; worker independente e prova externa pendentes'],
['Fundação','Split real','external','Cálculo interno existe; PSP precisa confirmar liquidação real'],
['Fundação','Motor antifraude profissional','partial','Triagem heurística existe; requer regras operacionais e auditoria'],
['Fundação','Devoluções Pix e MED','partial','Detecção de estornos parcial; operações MED dependem de PSP'],
['Fundação','Auditoria e observabilidade 24h','external','WAF, pentest, backups e monitoramento independente'],
['Comércio','Checkout Studio','ready','Páginas comerciais publicáveis, modelos de oferta e links próprios'],
['Comércio','Pix Automático','external','Depende de autorização e integração específica da adquirente'],
['Comércio','Cartões e parcelamento','external','Depende de adquirente, contrato e tokenização homologada'],
['Comércio','Boleto bancário','external','Depende de integração bancária/PSP habilitado'],
['Comércio','Links avançados','partial','Páginas de ofertas com expiração; pagamentos ainda no checkout Pix existente'],
['Comércio','Recuperação de checkout','planned','Requer consentimento, captura de evento e mensageria homologada'],
['Comércio','Gestão de assinaturas','partial','Agenda persistente, ciclos e links manuais. Débito automático ainda depende do PSP'],
['Comércio','Saques programados','external','Exigem escopo PSP, worker persistente e auditoria'],
['Comércio','Subcontas financeiras','partial','Carteiras por conta existem; abertura no PSP depende de KYC e contrato'],
['Comércio','Emissão fiscal','external','Necessita fornecedor NFS-e e configuração legal'],
['Inteligência','Argus SmartRoute','planned','Orquestração multi-PSP sem duplo débito ainda precisa ser construída'],
['Inteligência','Argus Autopilot','partial','IA consultiva existe; recomendações e aprovações controladas pendentes'],
['Inteligência','Checkout Studio visual completo','partial','Edição de oferta pronta; cupons e layouts de funil dependem de validação financeira'],
['Inteligência','Revenue Intelligence','partial','Faturamento e ranking existem; margem, previsão e coortes pendentes'],
['Inteligência','White Label Pro','partial','Site e domínio parcialmente configuráveis; isolamento por parceiro pendente'],
['Ecossistema','Integrações sem código','planned','Catálogo e conexões gerenciadas ainda não implementados'],
['Ecossistema','Sandbox offline','ready','Cenários de transação simulados sem Pix nem crédito real'],
['Ecossistema','Portal do desenvolvedor','partial','Documentação/API existente; SDKs e OpenAPI abrangente pendentes'],
['Ecossistema','Equipe e RBAC granular','planned','Papéis específicos por organização ainda não prontos'],
['Ecossistema','Central de suporte IA','partial','IA consultiva e chamados com conversa interna; canais externos pendentes'],
['Ecossistema','Notificações multicanal','partial','Push e webhooks implementados; outros canais dependem de provedores'],
['Ecossistema','Status e incidentes','partial','Saúde interna presente; página pública e alertas SLA pendentes'],
['Ecossistema','Cobrança em massa','partial','Importação de rascunhos idempotentes e vínculo com Pix confirmado. Emissão automática ainda não homologada'],
['Ecossistema','Portal do pagador','planned','Histórico e autoatendimento precisam de autorização e privacidade']
];
let busy=false,last=0;
function render(rows){
 const root=E('argus-innovation-roadmap');if(!root)return;
 const names=[...new Set(initiatives.map(x=>x[0]))];
 const statuses={ready:'Implementado',partial:'Parcial',planned:'Planejado',external:'Requer integração / homologação'};
 root.innerHTML=names.map(name=>'<section class="argus-inno-group"><h3>'+esc(name)+'</h3>'+
 '<div class="argus-inno-grid">'+initiatives.filter(x=>x[0]===name).map(x=>
  '<article class="argus-inno-card"><div class="argus-inno-card-top"><h4>'+esc(x[1])+'</h4>'+
  '<span class="argus-inno-state is-'+x[2]+'">'+statuses[x[2]]+'</span></div>'+
  '<p>'+esc(x[3])+'</p></article>').join('')+'</div></section>').join('');
}
async function load(){
 if(busy||!E('argus-innovation-shell'))return;
 if(typeof state==='undefined'||state?.user?.role!=='superadmin')return;
 busy=true;
 try{
  const data=await api('/api/admin/commerce/overview');
  if(data.financial_transactions_triggered!==false)throw Error('Resposta não reconhecida.');
  const metrics=E('argus-innovation-metrics');
  const counts=data.pages||{};
  metrics.innerHTML='<div class="argus-inno-metrics">'+
   [['Páginas publicadas',counts.published],['Rascunhos',counts.draft],['Arquivadas',counts.archived],['Simulador','Offline e seguro']].map(([k,v])=>
    '<article><small>'+esc(k)+'</small><strong>'+esc(v??0)+'</strong></article>').join('')+'</div>'+
   '<p class="argus-inno-disclaimer">O status das iniciativas é um inventário de implementação. Não substitui homologação de PSP, contratos ou auditoria regulatória. Nenhuma operação financeira foi efetuada nesta consulta.</p>';
  render();last=Date.now();
 }catch(e){E('argus-innovation-metrics').textContent='Não foi possível consultar os indicadores: '+e.message;}
 finally{busy=false;}
}
function init(){
 if(!E('argus-innovation-shell'))return;
 E('argus-innovation-refresh')?.addEventListener('click',load);
 document.querySelectorAll('[data-nav="innovation"]').forEach(b=>b.addEventListener('click',()=>setTimeout(load,60)));
 setInterval(()=>{if(typeof state!=='undefined'&&state?.user?.role==='superadmin'&&Date.now()-last>120000&&
  E('page-innovation')&&!E('page-innovation').hidden)load()},10000);
 load();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();