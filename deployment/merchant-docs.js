/* ARGUS merchant integration docs: static examples, never contain live secrets. */
(()=>{
'use strict';
function init(){
 if(document.getElementById('argus-merchant-docs'))return;
 const host=document.querySelector('main')||document.body;
 const root=document.createElement('section');root.id='argus-merchant-docs';root.className='argus-merchant-docs';
 root.innerHTML=[
  '<div class="argus-doc-head"><small>DOCUMENTAÇÃO DE INTEGRAÇÃO · API V2</small>',
  '<h2>Receba Pix no seu site ou bot do Telegram</h2>',
  '<p>Use suas credenciais individuais ARGUS Pay para gerar cobranças, acompanhar a confirmação e consultar seu saldo. Sem compartilhar as chaves entre vendedores.</p></div>',
  '<div class="argus-doc-grid"><article><h3>1. Gere suas credenciais</h3><p>Na <a href="/conta">Minha conta</a>, após KYC e autorização financeira, gere uma <code>Chave API</code> e uma <code>Chave secreta</code>. A secreta aparece apenas uma vez; não pode ser recuperada e deve ficar no servidor.</p></article>',
  '<article><h3>2. Faça uma cobrança</h3><p>Envie o valor em centavos e o nome e documento reais do pagador. A resposta inclui o QR Pix Copia e Cola e um identificador de cobrança.</p></article>',
  '<article><h3>3. Confirme o pagamento</h3><p>Consulte o identificador no servidor. Somente uma confirmação autenticada pela MisticPay gera crédito. QR Codes vencem visualmente após 30 minutos.</p></article>',
  '<article><h3>4. Consulte seu saldo</h3><p>A cada depósito confirmado há uma única <strong>taxa de serviço de R$ 1,00</strong>. O saldo pertence exclusivamente ao vendedor autenticado. Saques também possuem taxa de serviço de R$ 1,00.</p></article></div>',
  '<h3>Autenticação e segurança</h3><p>Use HTTPS. Envie <code>X-Argus-Key</code> e <code>X-Argus-Secret</code> em todas as requisições de API. No navegador ou Telegram, faça sempre a chamada no seu servidor; nunca coloque a chave secreta no código JavaScript público, APK, webhook de bot ou URL.</p>',
  '<table><thead><tr><th>Método</th><th>Endpoint</th><th>Descrição</th></tr></thead><tbody>',
  '<tr><td>POST</td><td><code>/api/v2/pix/charges</code></td><td>Gerar Pix com Idempotency-Key</td></tr>',
  '<tr><td>GET</td><td><code>/api/v2/pix/charges/{id}</code></td><td>Consultar status da sua cobrança</td></tr>',
  '<tr><td>GET</td><td><code>/api/v2/pix/charges</code></td><td>Listar somente suas cobranças</td></tr>',
  '<tr><td>GET</td><td><code>/api/v2/wallet/balance</code></td><td>Consultar somente seu saldo</td></tr>',
  '<tr><td>GET</td><td><code>/api/v2/wallet/transactions</code></td><td>Seu extrato contábil</td></tr>',
  '</tbody></table><p>Saques são enviados automaticamente pelo próprio revendedor no painel autenticado, em <a href="/conta">Minha conta</a>. Não há endpoint público para sacar com apenas API Key e Secret.</p>',
  '<h3>Exemplo 1 · Gerar Pix via cURL</h3><pre><code id="argus-doc-curl"></code></pre>',
  '<h3>Exemplo 2 · Node.js (servidor)</h3><pre><code id="argus-doc-node"></code></pre>',
  '<h3>Exemplo 3 · Bot do Telegram (Node.js)</h3><pre><code id="argus-doc-telegram"></code></pre>',
  '<h3>Resposta e taxas</h3><pre><code id="argus-doc-response"></code></pre>',
  '<p>Regras: valores em centavos, entre R$ 1,00 e R$ 100,00 no limite atual. O cliente paga o valor do QR. Uma cobrança de R$ 10,00 confirmada disponibiliza R$ 9,00 na sua carteira após a taxa de serviço de R$ 1,00. Um saque de R$ 10,00 debita exatamente R$ 10,00 da carteira e envia R$ 9,00 para a chave Pix, com R$ 1,00 de serviço.</p>',
  '<p><strong>Idempotência:</strong> use um identificador exclusivo por venda e reutilize o mesmo no caso de resposta incerta. Não gere um segundo Pix automaticamente. Se o provedor não confirmar uma emissão, ela fica com status <code>unknown</code> para conferência. Uma cobrança pendente não incrementa seu saldo.</p>',
  '<p><strong>Disponibilidade:</strong> a API de custódia dos revendedores só é habilitada após homologação da conta MisticPay de recebimentos e saques, e autorização operacional do ARGUS. Chaves e cadastro podem existir antes dessa liberação; um retorno 503 significa que não deve ser repetida a cobrança.</p>'
 ].join('');
 host.append(root);
 const snippets={
  'argus-doc-curl':[
   'curl -X POST https://argus-payments-oregon-testes.onrender.com/api/v2/pix/charges \\',
   ' -H "X-Argus-Key: $ARGUS_API_KEY" \\',
   ' -H "X-Argus-Secret: $ARGUS_API_SECRET" \\',
   ' -H "Idempotency-Key: pedido-1234-venda-2026" \\',
   ' -H "Content-Type: application/json" \\',
   ' -d \'{"amount_cents":1000,"payer_name":"Cliente Exemplo",',
   '       "payer_document":"CPF_VALIDO_DO_CLIENTE",',
   '       "description":"Pedido 1234"}\'',
   '',
   '# Consultar depois: GET /api/v2/pix/charges/mwc_<id>',
   '# Consultar saldo:  GET /api/v2/wallet/balance'
  ].join('\n'),
  'argus-doc-node':[
   '// Código de backend Node.js; credenciais no ambiente do servidor.',
   'const base = "https://argus-payments-oregon-testes.onrender.com";',
   'async function gerarPix(pedido, cliente) {',
   '  const r = await fetch(base + "/api/v2/pix/charges", {',
   '    method: "POST",',
   '    headers: { "Content-Type": "application/json",',
   '      "X-Argus-Key": process.env.ARGUS_API_KEY,',
   '      "X-Argus-Secret": process.env.ARGUS_API_SECRET,',
   '      "Idempotency-Key": pedido.idempotencyKey },',
   '    body: JSON.stringify({ amount_cents: pedido.totalCentavos,',
   '      payer_name: cliente.nomeValidado, payer_document: cliente.documentoValidado,',
   '      description: "Pedido " + pedido.numero })',
   '  });',
   '  const data = await r.json();',
   '  if (!r.ok) throw Error(data.detail || data.message || "Falha na cobrança");',
   '  return data; // id, pix_copy_paste, status, net_cents',
   '}',
   '// Consulte a confirmação autenticada:',
   'async function consultarPix(id) {',
   '  const r = await fetch(base + "/api/v2/pix/charges/" + encodeURIComponent(id), {',
   '    headers: { "X-Argus-Key": process.env.ARGUS_API_KEY,',
   '      "X-Argus-Secret": process.env.ARGUS_API_SECRET }',
   '  });',
   '  return r.json();',
   '}',
   '// Entregue o produto SOMENTE se status === "paid".'
  ].join('\n'),
  'argus-doc-telegram':[
   '// npm install telegraf',
   'import { Telegraf } from "telegraf";',
   'const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);',
   '// Implemente getCustomerFromSecureDatabase() no seu backend:',
   '// nome e CPF/CNPJ já cadastrados em um formulário privado,',
   '// nunca solicite documentos num grupo público do Telegram.',
   'bot.command("comprar", async ctx => {',
   '  try {',
   '    const customer = await getCustomerFromSecureDatabase(ctx.from.id);',
   '    if (!customer) return ctx.reply("Cadastre seus dados no site seguro.");',
   '    const idempotencyKey = "telegram-" + ctx.chat.id + "-" + customer.pedidoId;',
   '    const r = await fetch("https://argus-payments-oregon-testes.onrender.com/api/v2/pix/charges", {',
   '      method: "POST", headers: { "Content-Type": "application/json",',
   '        "X-Argus-Key": process.env.ARGUS_API_KEY,',
   '        "X-Argus-Secret": process.env.ARGUS_API_SECRET,',
   '        "Idempotency-Key": idempotencyKey },',
   '      body: JSON.stringify({ amount_cents: customer.valorCentavos,',
   '        payer_name: customer.nome, payer_document: customer.documento,',
   '        description: "Pedido " + customer.pedidoId })',
   '    });',
   '    const pix = await r.json();',
   '    if (!r.ok || !pix.pix_copy_paste) throw Error("Cobrança não confirmada");',
   '    await ctx.reply("Pix Copia e Cola:\\n" + pix.pix_copy_paste);',
   '    // Salve pix.id e consulte o status a partir do seu servidor.',
   '  } catch (err) { await ctx.reply("Pagamento indisponível, tente mais tarde."); }',
   '});',
   'bot.launch();'
  ].join('\n'),
  'argus-doc-response':[
   '{',
   '  "id": "mwc_<identificador>",',
   '  "amount_cents": 1000,',
   '  "service_fee_cents": 100,',
   '  "net_cents": 900,',
   '  "status": "pending",',
   '  "pix_copy_paste": "000201...",',
   '  "expires_at": "2026-11-19T15:30:00+00:00"',
   '}',
   '// A creditação ocorre quando o status for "paid".',
   '// O exemplo não representa uma cobrança real.'
  ].join('\n')
 };
 for(const [id,body] of Object.entries(snippets)){const target=document.getElementById(id);if(target)target.textContent=body}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();