# ARGUS Pay — continuidade Pix e proteção contra saques duplicados
Atualizado em 19/11/2026. Este documento diferencia controles **no código** de processamento financeiro **efetivamente agendado e autorizado**.

## Princípio de segurança
- O prazo de exibição do QR Code (30 minutos) **não** encerra a verificação no servidor. Cobranças `pending` ou `unknown` permanecem consultáveis até resposta confiável do PSP, mesmo depois de semanas. Nenhum pagamento é declarado `paid` por relógio, QR gerado, resposta não autenticada ou webhook de terceiros.
- PIX recebido só credita a carteira após conferência autenticada do PSP, com identidade da transação e valor compatíveis. Repetir a mesma confirmação não adiciona saldo duas vezes.
- Um saque nasce com ID único e chave de idempotência; reserva o valor sob bloqueio de linha no banco. O novo guarda verifica saldo contra o livro-razão, impede segundo saque enquanto há um em processamento e barra novo pedido idêntico durante 10 minutos após o primeiro ser confirmado.
- O envio ao PSP usa ID estável e alteração atômica de `requested` para `processing`. Se houver timeout ou encerramento entre registrar a operação e a resposta do PSP, **não se reenvia automaticamente**: o valor permanece reservado para reconciliação usando o ID do PSP ou verificação manual com evidência. Isso evita transferir duas vezes após uma resposta ambígua.
- Pix pago pode ser consultado novamente periodicamente para detectar uma eventual devolução, reconhecendo dívida/ajuste sem repetir crédito.
- A rotina no banco utiliza lock consultivo (PostgreSQL/MySQL) para impedir dois ciclos simultâneos do mesmo banco. A falha no lock faz a execução concorrente sair sem novas chamadas. Saídas abruptas liberam o lock via encerramento da conexão.
- O painel **Saúde financeira** informa a última execução, se ela ocorreu há menos de 5 minutos e alerta divergências locais. Esses sinais **não** provam homologação pelo PSP.

## Pendência de infraestrutura: necessária para funcionar sem painel aberto
O Dockerfile possui um laço interno enquanto o web service está rodando, se `ARGUS_NOTIFICATIONS_WORKER_ENABLED=yes`. Entretanto, **Render Free suspende web services após inatividade**; portanto esse laço NÃO garante execução quando a aplicação está ociosa. Um cron/worker independente e banco persistente são indispensáveis.

### Arquitetura recomendada: Render Cron Job dedicado (cobrança adicional)
- Criar **um serviço Cron Job**, a cada minuto: `* * * * *`, runtime Docker, branch `argus-payments-deploy`, Dockerfile `./Dockerfile`, comando Docker `php /usr/local/share/argus/notify_worker.php`.
- Configure no Cron Job as **mesmas credenciais protegidas e URL do banco PostgreSQL** do ambiente financeiro, com schema específico do ARGUS, além das credenciais PSP de consulta. Use um Environment Group privado; NÃO copie valores para o código, documentação ou chat.
- Exigir `ARGUS_DB_DRIVER=pgsql`, conexão/schema persistente, `ARGUS_NOTIFICATIONS_WORKER_ENABLED=yes` e modo de Pix pertinente. Use privilégios mínimos e TLS.
- Executar primeiro em teste com credenciais de homologação e comparar logs `ARGUS_FINANCIAL_WORKER status=cycle_completed` e a última execução na tela **Saúde financeira**. Validar idempotência, falhas de rede, sinais de estorno, parada do worker e restauração de execução.
- O cron não deve criar cobranças, reenviar saques ou ligar `ARGUS_PAYOUTS_ENABLED`. São verificações de status. A configuração do PSP continua sujeita à autorização de custódia.
- No Render, um Cron Job possui cobrança mínima mensal de **US$ 1**. Não criar/provisionar serviço pago sem autorização explícita do titular. Fonte: https://render.com/docs/cronjobs .

### Estado encontrado no Render durante a revisão
- `argus-payments-oregon-testes` reportou `driver=pgsql shared=yes` — banco PostgreSQL compartilhado, apenas para teste; não substitui banco financeiro dedicado.
- `argus-payments-b2b-misticpay` reportou `driver=sqlite shared=yes`.
- `argus-payments-php-demo` reportou `driver=sqlite shared=no`.
- Free Postgres disponível é de testes e expira em 18/12/2026, sem backup automático na modalidade Free. **Não utilizar para liquidação financeira permanente**.
- Enquanto os dois serviços SQLite não migrarem a banco persistente, suas movimentações devem permanecer **bloqueadas**; o worker requer PostgreSQL ou MySQL e não trata SQLite como armazenamento financeiro confiável.

## Procedimento de incidente
1. **Não repetir o saque** quando o provedor responder `unknown`, `processing` ou não responder. A reserva permanece na carteira.
2. Consultar ID original, status e comprovante do PSP antes de qualquer conclusão. Só liberar reserva após evidência de falha/cancelamento; nunca por timeout.
3. Se houver divergência no livro-razão, não executar novos saques dessa carteira. Revisar lançamentos por auditoria e conferir total com o PSP.
4. Acompanhar operações `pending` e `unknown` pelo painel; se o provedor estiver sem permissão de leitura, resolver credenciais/escopo. Não simular status pago.
5. Manter backup criptografado externo com restauração testada, métricas/alertas e controle de risco de conta; nenhuma plataforma pode prometer risco literalmente zero.

## Testes cobertos na compilação
`financial_safety_test.php`: chave de idempotência repetida, segunda chave bloqueada, beneficiário diferente bloqueado durante saque pendente, lançamento `withdraw_paid` único apesar de confirmação repetida, novo saque idêntico recente bloqueado, divergência no saldo impede saque, heartbeat e bloqueio de trabalhador SQLite.

**Ainda não validado:** pagamento real no PSP, saque real, rollback de infraestrutura, recuperação de desastre, simultaneidade em PostgreSQL de produção e serviço Cron independente. Isso exige homologação e observabilidade em execução real.
