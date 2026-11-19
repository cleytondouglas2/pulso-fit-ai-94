/* Additional documentation: API v2 CSV and signed merchant webhooks. */
(()=>{
'use strict';
function start(){
 if(document.getElementById('argus-webhooks-reference'))return;
 const host=document.getElementById('argus-merchant-docs')||document.querySelector('main');
 if(!host)return;
 const block=document.createElement('section');
 block.id='argus-webhooks-reference';
 block.style.cssText='margin:25px 0;padding:23px;border:1px solid #816c50;border-radius:14px;background:#1d2630;color:#ece6dd;max-width:100%;overflow-wrap:anywhere';
 const p=document.createElement('div');
 p.innerHTML=[
  '<h2>Webhooks assinados e extrato CSV · API v2</h2>',
  '<p>Configure a URL em <a href="/conta#api-panel">Minha conta → Chaves e integrações → Webhooks</a>. A URL precisa usar HTTPS público, porta 443, sem parâmetros. O segredo de assinatura aparece somente na criação.</p>',
  '<p>Eventos disponíveis: <code>pix.paid</code>, <code>pix.refunded</code>, <code>payout.requested</code>, <code>payout.paid</code>, <code>payout.released</code>. São baseados no livro-razão, depois de conferência pelo provedor. A entrega é assíncrona e deve ser habilitada operacionalmente.</p>',
  '<p>Headers de cada POST: <code>X-Argus-Delivery</code> (ID único), <code>X-Argus-Timestamp</code> (Unix seconds) e <code>X-Argus-Signature: sha256=&lt;hex&gt;</code>.</p>',
  '<p>Calcule <code>HMAC-SHA256(secret, timestamp + "." + corpo_json_bruto)</code> e compare em tempo constante. Rejeite timestamps com desvio maior que 5 minutos, armazene o ID de evento para evitar duplicidade, e responda HTTP 2xx somente após persistir o evento.</p>',
  '<pre style="overflow-x:auto;padding:14px;border-radius:9px;background:#111a25;font-size:12px"><code>const crypto = require("node:crypto");\nconst expected = crypto.createHmac("sha256", secret)\n  .update(timestamp + "." + rawBody).digest("hex");\n// timingSafeEqual(Buffer.from(expected,"hex"), Buffer.from(sig,"hex"))</code></pre>',
  '<p>Se o endpoint não retornar 2xx, o ARGUS tentará novamente com intervalos progressivos, no máximo seis vezes. Consulte o histórico no painel. O recebimento do webhook não substitui o GET autenticado para verificar o pagamento.</p>',
  '<p>Extrato financeiro (autenticado, somente da própria carteira): <code>GET /api/v2/wallet/export.csv?from=AAAA-MM-DD&amp;to=AAAA-MM-DD</code>. Datas em UTC, até 366 dias e 10 mil lançamentos por arquivo. A exportação também está disponível no painel.</p>',
  '<p><strong>Operação:</strong> o envio requer <code>ARGUS_NOTIFICATIONS_WORKER_ENABLED=yes</code> e <code>ARGUS_MERCHANT_WEBHOOKS_ENABLED=yes</code>, habilitados apenas após revisão do destino e da infraestrutura. Sem esses parâmetros, os eventos não são enviados.</p>',
 ].join('');
 block.append(p);host.append(block);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
