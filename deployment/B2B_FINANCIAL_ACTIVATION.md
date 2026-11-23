# ARGUS Pay — B2B: preparação segura da ativação financeira

Esta implantação **não habilita Pix ou saques**. Acrescenta uma central de pré-ativação, disponível exclusivamente no Super Admin do serviço B2B quando `ARGUS_B2B_PREFLIGHT_UI=yes`.

## 1. Armazenamento dedicado e persistente (bloqueador)

O serviço B2B está em SQLite, em um serviço Free do Render. Em produção, não use o sistema financeiro com banco SQLite ou PostgreSQL Free expirável/compartilhado.

- Contrate um PostgreSQL persistente dedicado ao B2B, com backup e política de recuperação, **após autorização de cobrança**.
- Faça inventário dos registros existentes, exporte e verifique o backup; restaure uma cópia em staging.
- Confira os totais do livro financeiro, IDs, transações pendentes e idempotência. Se houver dinheiro real, faça janela de migração com escritas bloqueadas e reconciliação com a adquirente.
- Configure a conexão privada no Render por variáveis de ambiente protegidas, nunca em GitHub, HTML ou chat.
- O aplicativo usa `ARGUS_DB_DRIVER=pgsql`, `ARGUS_PGSQL_URL`; a variável `ARGUS_PGSQL_SHARED=false` **não é comprovação de isolamento por si só**.
- Execute smoke tests e compare linhas de banco e eventos antes de habilitar qualquer escrita.

## 2. Credenciais, PSP e domínio (bloqueadores)

- Provisione credenciais de Pix **exclusivas e autorizadas** para o ambiente B2B na MisticPay.
- Configure `ARGUS_TRADITIONAL_PIX_CLIENT_ID` e `ARGUS_TRADITIONAL_PIX_CLIENT_SECRET` no Render, utilizando o formato fornecido pelo provedor.
- Para saques, configure `ARGUS_MISTICPAY_PAYOUT_PK` e `ARGUS_MISTICPAY_PAYOUT_SK` **somente após** aprovação do escopo, conta e beneficiário. Credenciais presentes não significam WITHDRAW_CREATE autorizado.
- Confirme as regras de split com a adquirente por contrato ou consulta autenticada. Não presume que qualquer configuração interna mude a retenção real.
- Cadastre o endereço HTTPS de callback/webhook aprovado pela adquirente; confirme autenticação, replay e idempotência. Preserve a rota anterior até reconciliar os eventos em aberto.
- Configure segredos exclusivos para o operador e bloqueio de pagadores em variáveis de ambiente seguras.
- Não copie as chaves/segredos do ambiente principal para o B2B e não divulgue credenciais por chat.

## 3. Conciliação contínua e liberação controlada

- Separe o worker de conciliação do web service Free; não há garantia de execução contínua quando o serviço é suspenso.
- Comprove status *paid* por consulta autenticada e compare registros do PSP x livro financeiro, taxas e estornos.
- Homologue saques separadamente, incluindo saldo, CPF/CNPJ autorizado, estados incertos e prevenção contra duplicidade.
- O operador deve verificar os **nove requisitos** já definidos em `LivePix::readiness`. A nova API read-only `GET /api/admin/b2b/readiness` retorna somente nomes/estados, sem segredos.
- Mesmo nove requisitos locais como `true` **não autorizam automaticamente dinheiro real**: restauração de backup, escopos PSP e contratos exigem verificação externa.
- Só após homologação autorizar explicitamente a ativação manual em janela controlada, com plano de reversão. Não execute pagamentos reais de teste sem autorização específica.

## Situação atual verificada (23/11/2026)

O B2B usa SQLite. Logs mostram: `missing=explicit_activation,persistent_database,storage_policy,split_direction_authorized,provider_split_confirmed,strong_operator_secret,protected_webhook,https_callback,payer_blocklist_secret`. O diagnóstico de saques relata `credentials=missing`. Existe um único PostgreSQL Free no workspace, compartilhado e com vencimento em 18/12/2026.

Todos esses fatos devem ser verificados novamente após qualquer atualização, pela central B2B e pelos logs do Render, sem inferir homologação financeira apenas de um deploy `Live`.
