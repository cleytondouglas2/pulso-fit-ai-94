# ARGUS Pay — saques híbridos seguros (20/11/2026)

STATUS: implementação exclusiva na branch argus-hybrid-payout-review-20261120.
A branch de produção argus-payments-deploy não foi alterada.

## Fluxo
1. O revendedor inicia o saque e confirma o valor e a taxa existentes.
2. KYC, carteira individual, autorização do recebedor e saldo são validados.
3. Triagem determinística local calcula score de risco somente a partir dos
   dados financeiros da própria carteira, sem enviar PII a serviços de IA.
4. Em única transação do banco, reserva-se o valor e registra-se a decisão.
5. Quando suspeito, o status review exige decisão do Super Admin com 2FA.
6. Em caso de aprovação e live explicitamente habilitado, o método MisticPay
   existente pode enviar uma única transferência idempotente.
7. Em caso de rejeição, a reserva volta para a mesma carteira. O lançamento
   withdraw_release é único, e operações externas pendentes ou incertas
   jamais são revertidas por esta interface.

## Modo de segurança
ARGUS_PAYOUTS_ENABLED=yes continua obrigatório para o caminho financeiro.
ARGUS_HYBRID_PAYOUT_LIVE=yes é uma SEGUNDA flag, desabilitada por padrão.
Sem ela, pedidos novos permanecem em review, sem iniciar transferências.
ARGUS_HYBRID_REVIEW_SCORE=40 é o score padrão de revisão (20–95).

A liberação real exige validar credenciais MisticPay de saque pk/sk e escopos
BALANCE_READ, WITHDRAW_CREATE e consulta de transações, conta de custódia,
banco persistente, autenticação administrativa e reconciliação externa.
A chave privada nunca é passada para o navegador ou para modelo de IA.

A IA de triagem é heurística local sem cobrança por consulta, não é IA generativa
e não determina fraude. A Argus IA existente permanece consultiva, sem
capacidade de enviar Pix ou mover saldo.

## Não executar transferências reais em testes
A suíte hybrid_payout_test.php cria contas e carteiras totalmente sintéticas
em SQLite isolado, testa score, reserva, isolamento, duplicidade, aprovação,
rejeição e livro-razão, e NÃO invoca o método withdraw nem faz requisições
HTTP à MisticPay. A documentação MisticPay indica que não há sandbox
tradicional; qualquer teste real exige consentimento expresso.

## Antes de publicar
- Construir a imagem Docker desta branch e executar todos os testes pré-existentes.
- Confirmar segregação por account_id e falha fechada em indisponibilidade.
- Validar TOTP/2FA tanto no approve/execute quanto no reject.
- Repetir testes de simultaneidade com PostgreSQL, incluindo idempotência
  no provedor, status incertos e webhooks atrasados.
- Auditar o worker independente; Render Free pode suspender o serviço web.
- Somente depois da homologação, ativar manualmente as duas flags do servidor.

## Auditoria
As tabelas argus_payout_risk_decisions e argus_payout_review_events registram
score, motivos e decisões. Os lançamentos originais de carteira e ledger
permanecem fonte de verdade financeira. A fila protegida aparece em
GET /api/admin/merchant-wallet/hybrid-reviews, e as ações em
POST /api/admin/merchant-wallet/withdrawals/:id/execute e
POST /api/admin/merchant-wallet/withdrawals/:id/reject, com 2FA.
