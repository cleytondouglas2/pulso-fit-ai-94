# Integração de checkout e webhook — PulsoFit

**Situação:** interface e contrato da API preparados. Ainda não habilita transações. A integração deve ser ativada somente após definição do gateway, suas rotas e a segurança de assinatura de webhooks.

## Planos propostos (BRL)
- `quinzenal`: R$ 14,90 / 15 dias.
- `mensal`: R$ 24,90 / 30 dias.
- Trial: 7 dias a partir do primeiro uso autenticado, registrado no servidor (não só no navegador).

## Rotas contratadas
- `GET /api/billing/plans`: catálogo público (definido pelo servidor).
- `GET /api/subscription/status`: trial/entitlement autenticado.
- `GET /api/admin/billing/config/status`: verificação de armazenamento seguro e webhook (admin).
- `POST /api/admin/billing/config`: credenciais do provedor (admin e HTTPS; criptografadas em repouso).
- `POST /api/billing/checkout`: cria cobrança pendente e retorna URL HTTPS do checkout hospedado.
- `POST /api/billing/webhooks/:provider`: confirma assinatura e consulta cobrança no gateway; só então ativa assinatura.

## Integração com o servidor
`billing/pulsofit-gateway.mjs` exporta `createBillingHandler(deps)`. Importar no `server.mjs` do ambiente e delegar as rotas correspondentes ao handler. **O Render atual gera o `server.mjs` a partir de variáveis protegidas de build**: uma alteração isolada no repositório não monta o handler automaticamente. É necessário atualizar o build/servidor antes de habilitar o botão de salvar as credenciais.

Dependências obrigatórias: autenticação do admin e usuário, armazenamento durável do trial e das assinaturas, armazenamento criptografado da configuração, idempotência dos eventos, e adaptador para o provedor escolhido. Não retornar segredos em APIs nem armazená-los em localStorage.

A variável `PULSO_BILLING_MASTER_KEY` deve ser uma chave de criptografia aleatória de 32 bytes em hexadecimal, guardada no gerenciador de secrets do Render. Nunca colocar esta chave no GitHub ou no front-end.

## Dados que faltam do gateway
Nome do gateway, URL de documentação técnica, sandbox/produção, modalidades Pix/cartão, método de checkout (hospedado ou API), formato e assinatura dos eventos de webhook, nome das variáveis de API Key e secret, e regras de confirmação/estorno.

**Não cole chaves de produção em conversas ou tickets.** Configurar as credenciais no ambiente protegido do Render ou na tela de administrador somente após ativar a API que as salva com segurança.

## Regras de segurança
- Não liberar assinatura por retorno do navegador, redirect ou evento de webhook não verificado.
- Validar no servidor o preço/ID do plano e comparar valor/moeda com a transação confirmada.
- Conceder direitos uma vez só por id de pagamento, mantendo log e verificando reembolso/chargeback.
- Bloquear APIs de recursos premium pelo entitlement no servidor, não apenas esconder a interface.
- Não habilitar cobrança recorrente ou coleta de cartão sem exigências e contrato do provedor.
