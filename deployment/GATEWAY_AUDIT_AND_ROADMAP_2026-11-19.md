# ARGUS Pay — diagnóstico de funcionalidades e plano de maturidade
**Data:** 19/11/2026 — auditoria estática do repositório `argus-payments-deploy`, patches e testes de compilação Render.

## Escopo e evidências
Inspeção de `MerchantWallet.php`, `Portal.php`, `PfFinancialApproval.php`, `TraditionalQuickPix.php`, `Notifications.php`, `SecurityShield.php`, `RevenueReport.php`, `SECURITY_REVIEW_2026-11-19.md`, painéis e testes em PHP. Compara recursos usuais de um gateway com os disponíveis **na implementação**. Não substitui validação contratual do PSP, auditoria independente, autorização regulatória ou uma homologação de Pix real. Para controles de autorização por objeto/usuário, antifraude de API e SSRF, referência: [OWASP API Security Top 10 — 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/).

## Quadro de maturidade
| Área | Situação encontrada | Ação nesta revisão |
|---|---|---|
| Cadastro PF/PJ, KYC e aprovação | Presente; revisão interna distinta da homologação do provedor | Preservados todos os guardas |
| Login, sessões, MFA do Admin e recuperação | Existentes; Resend precisa credenciais e domínio verificado | Sem alterações às credenciais |
| Pix por API / QR e comprovantes | Existentes; APIs V1 e V2 e UI | Não alterar emissão nem creditar Pix sem confirmação autenticada |
| Carteiras por revendedor e saldos | Livro-razão, dívida, reserva, saque e idempotência presentes | Novo diagnóstico de **saldos x lançamentos** |
| Comparativos de faturamento | Visão consolidada e individual já presentes | Mantida; novos extratos |
| Extratos e exportação auditável | Listagem pequena em API, sem arquivo de período | **Implementado:** CSV por revendedor, Super Admin por conta/consolidado, máximo de 366 dias/10 mil eventos |
| Conciliação automática | Trabalhador existente, mas dependente de ativação e credenciais operacionais | **Implementado:** painel de operação com cobranças pendentes, saques incertos, fundos negativos e pendências de configuração |
| Notificações para usuário | PWA/Web Push existente | Mantido |
| Webhooks para sites, e-commerce e Telegram | Ausência de entrega de eventos do livro-razão assinada a endpoints externos | **Implementado:** cadastro por titular, segredo criptografado exibido uma vez, HMAC, ID determinístico, fila, até seis tentativas, histórico e desativação |
| Segurança de webhook (SSRF) | Não havia canal outbound de clientes | **Implementado:** URL HTTPS porta 443, sem credenciais ou redirecionamentos; DNS público e TLS com IP fixado e certificado validado |
| Checkout hospedado/links de pagamento | Há emissão Pix e páginas, mas nenhuma jornada de checkout hosted completa foi homologada | Pendente de escopo e testes de fluxo |
| Devoluções Pix / contestação MED | Detecta reversões do PSP e ajusta dívida, mas não há processo MED completo e auditado para usuário | Não criar endpoint de estorno financeiro sem suporte e contrato confirmados |
| Cartão, parcelamento, boleto, assinaturas/recorrência | Não verificados como meios operacionais | Dependem de parceiro habilitado, contratos, liquidação e escopo regulatório; não simular suporte |
| Antifraude de produção | Triagem/KYC, limites e proteções parciais; sem motor certificado ou monitoramento SOC 24h | Requer fornecedor, políticas, revisão manual, integração e auditoria |
| Chargebacks e gestão de disputas | Fluxo genérico insuficiente para múltiplos meios | Depende dos meios contratados e das evidências do PSP |
| Backup e restauração | Script privado de exportação; sem comprovação de execução e restauração automatizadas | Backups, retenção e restore drill são ações de infraestrutura |
| Segurança de borda / conformidade | Pendências WAF/DDoS, CSP/SRI, política LGPD e pentest formal | Não considerar solução certificada sem evidência independente |
| Custódia/PSP | Flags de liberação real exigem comprovação de conta e segregação; a revisão anterior documentou recusa de credenciais Finance em ambiente de teste | Não habilitar essas flags como se fossem autorização regulatória |

## Alterações concretas neste lote
1. **Saúde financeira do Super Admin:** `GET /api/admin/merchant-wallet/health`, página “Saúde financeira”. Apenas consulta; conta reconciliação histórica das variações do livro-razão versus saldos, e sinaliza saques e cobranças incertos.
2. **Extrato contábil:** `GET /api/portal/wallet/export.csv` (somente sessão do revendedor), `GET /api/v2/wallet/export.csv` (API autenticada), `GET /api/admin/merchant-wallet/export.csv` (Super Admin). Aceita `from`, `to` AAAA-MM-DD; versão administrativa aceita `account_id`. Escopo de conta nunca vem de parâmetros controlados pelo revendedor. CSV contém somente registros contábeis, não CPF ou chave Pix.
3. **Webhooks da própria conta:** `GET/POST /api/portal/webhooks`, `GET /api/portal/webhooks/deliveries`, `POST /api/portal/webhooks/{id}/disable`. São **avisos sobre eventos já confirmados no ledger**, não novas provas de pagamento. Apenas o proprietário autenticado e com CSRF pode gerenciar.
4. **Fila idempotente:** associação única de ID do evento contábil e endpoint, até seis tentativas com atraso progressivo, sem reemitir Pix e sem movimentar carteira. Assinatura HMAC do timestamp + corpo. Ver documentação na página da API.

## Condições para considerar as entregas de webhooks ativas
- Operador configurar `ARGUS_NOTIFICATIONS_WORKER_ENABLED=yes` e `ARGUS_MERCHANT_WEBHOOKS_ENABLED=yes` somente depois de revisar DNS, saídas HTTPS e o consumo do worker.
- Recomendável configurar `ARGUS_WEBHOOK_ENCRYPTION_KEY` de pelo menos 32 caracteres com segredo independente por ambiente; se ausente, o código usa o HMAC documental já configurado. Nunca colocar segredos no Git ou nos logs.
- Testar um endpoint HTTPS público real com HMAC, repetição, expiração de timestamp, idempotência e HTTP 2xx; a compilação usa somente testes sintéticos sem transferência nem chamada a destinos reais.
- Habilitar o worker **não** equivale a habilitar custódia financeira. Os controles de `ARGUS_MERCHANT_CUSTODY_ENABLED`, `ARGUS_MERCHANT_PSP_ACCOUNT_MATCH_CONFIRMED` e `ARGUS_PAYOUTS_ENABLED` permanecem independentes.

## Prioridades não resolvidas
**Crítica:** comprovar com o PSP a autorização de recebedor/custódia, credenciais corretas e liquidação; revisar exposição de `source.zip` e eventual histórico de segredos do repositório; configurar banco/backup robusto; pentest externo.

**Alta:** rotina de restauração testada, observabilidade de uptime/error rate/filas, WAF, alertas para saques incertos e backlog webhook, política formal de fraude e incidentes; integração de e-mail verificada para redefinição de senha.

**Por produto:** checkout hospedado, assinaturas, Pix devolução/MED e outros meios **somente após** confirmar suporte efetivo do PSP e contratos; impostos/notas e disputas exigem requisitos específicos.

### Limitações e advertências
Testes no build são sintéticos e provam casos delimitados de isolamento/contabilidade, não produção regulada. Nenhum saldo real foi conciliado manualmente com extrato do PSP nesta revisão. Não foi realizado teste de estorno real, cobrança real, ataque de penetração, teste externo de webhooks, nem homologação jurídica. 
