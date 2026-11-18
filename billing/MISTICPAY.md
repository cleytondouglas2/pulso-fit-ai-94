# Integração MisticPay → PulsoFit AI

Referência consultada: https://docs.misticpay.com (API v1, 18/11/2026).

## Suporte verificado
- **Pix (Cash-In)**: POST https://api.misticpay.com/api/transactions/create
- **Consulta**: POST https://api.misticpay.com/api/transactions/check
- **Webhooks**: HTTP POST para o \`projectWebhook\` do Pix
- **Cartão**: não há rota de cartão na documentação fornecida; permanece indisponível.
- **Sandbox**: não existe ambiente sandbox segundo a documentação da MisticPay.
- **Cobrança recorrente automática**: não documentada. Planos são períodos pagos individualmente.
- **Valores**: API espera **reais** (14.90 e 24.90), enquanto o catálogo do PulsoFit armazena centavos (1490 e 2490).

## Chaves e escopos necessários
Criar **Chave de Acesso** na MisticPay > API > Chaves de Acesso:
- Client ID: \`pk_...\` → \`PULSO_MISTICPAY_CLIENT_ID\`
- Client Secret: \`sk_...\` → \`PULSO_MISTICPAY_CLIENT_SECRET\`
- Escopos **somente** \`TRANSACTION_CREATE\` e \`TRANSACTION_READ\`; não conceder saque/saldo.

Armazenar essas variáveis no Render como segredos. **Nunca** em GitHub, HTML, JavaScript público, tickets ou mensagens. O modelo \`ci/cs\` foi descontinuado em 30/09/2026.

## Integração ao servidor real
Arquivos disponíveis:
- \`server/misticpay-adapter.mjs\`: funções \`createPixCharge\` e \`getTransaction\`, autenticação HTTP Basic com pk/sk.
- \`server/misticpay-billing.mjs\`: rotas \`/api/billing/config\`, \`/api/billing/checkout\`, \`/api/billing/payment\`, \`/api/billing/webhook\`.
- \`pulsofit-enhancements.js\`: apresentação do Pix e consulta de confirmação.

O Render atualmente usa \`build.mjs\` e \`server.mjs\` reconstruídos com scripts comprimidos em variáveis do serviço. **Os arquivos novos não entram no servidor até o processo de compilação importar e montar o handler abaixo.**

\`\`\`js
import {createMisticPayBilling} from "./server/misticpay-billing.mjs";
const billing=createMisticPayBilling({
  origin:"https://pulso-fit-ai-95-online.onrender.com",
  authenticate:authenticateUserFromExistingSession, // implementação do servidor real
  store:persistentBillingStore                    // implementação com PostgreSQL/DB durável
});
// No início do listener, antes das demais rotas:
// if(await billing(req,res)) return;
\`\`\`

### Contrato do armazenamento
O objeto \`store\` deve fornecer:
- \`createPendingCheckout({reference,userId,planCode,amountCents,currency})\`: criar pedido pendente com ID único; **antes** da requisição à MisticPay.
- \`attachProviderPayment({reference,providerPaymentId})\`: gravar ID retornado, sem sobrescrever outro pagamento.
- \`getByProviderPaymentId(id)\` e \`getByReference(reference)\`: recuperar pedido e usuário vinculado.
- \`applyVerifiedEventOnce(event)\`: atualização **transacional e idempotente**; compare ID, valor, moeda, plano, usuário e status; calcule prazo a partir do máximo entre agora e vencimento atual; conceda 15 ou 30 dias **uma vez por pagamento**.
- \`applyVerifiedRefundOnce(event)\`: transação idempotente de estorno/revisão; revogar ou rever entitlement conforme política, inclusive devolução parcial.

Criar índice único de referência, ID de pagamento do provedor e eventos aplicados. Persistir dados em banco, nunca em memória nem localStorage. Proteger todas as APIs premium com entitlement **server-side**.

### Como verificar os webhooks
A documentação publicada **não define um header de assinatura**. Um POST recebido não comprova pagamento. O handler:
1. Obtém o ID de transação reportado, procura pedido existente no banco.
2. Faz POST autenticado a \`/api/transactions/check\` com o ID.
3. Compara ID, tipo \`DEPOSITO\`, método \`PIX\`, status e valor exato em BRL.
4. Atualiza entitlement só para \`COMPLETO\`, idempotentemente.
5. Processa \`DEVOLVIDO\` e \`DEVOLVIDO_PARCIAL\` para não manter assinaturas indevidas.

Proteger a rota pública contra abuso (limite de requisições, logs sem CPF ou segredos). Não confiar em retorno de tela ou QR Code exibido.

### Testes necessários antes de cobrar em produção
- Pedido não autenticado → 401.
- Cartão → 422 indisponível (não coletar dados do cartão).
- Pix sem CPF válido → 400.
- Sem credenciais ou sem \`store\` → checkout desativado.
- Notificação falsa \`COMPLETO\` com transação pendente → não ativar.
- Valor incorreto, tipo \`RETIRADA\`, evento repetido → não ativar duas vezes.
- Confirmação legítima → ativação uma única vez.
- Reembolso (total/parcial) → reavaliar acesso.
- Teste real em produção apenas com pagamento de valor mínimo permitido, **com autorização explícita**, depois das credenciais.

**Estado atual:** código e tela preparados, **não conectados ao runtime do servidor**. Não habilitar bloqueio de avaliação grátis ou cobrança até a integração do banco, autenticação e backend estar validada.
