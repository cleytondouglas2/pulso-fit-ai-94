# Clystria PHP — gestão de assinantes

Aplicação web 100% PHP 8.3+ (servidor) com HTML5, CSS3 e JavaScript (interface). Não depende de Node.js para rodar. Interface PWA preservada da versão anterior.

## Funcionalidades

- Primeiro acesso de administrador protegido por `SETUP_TOKEN`, login/sessão HTTP-only, proteção CSRF e limites de tentativas; funções de administrador, gerente e operador.
- Cadastros de clientes, logins, senhas criptografadas, telefones, status, vencimento, plano, dispositivos, observações, tags e painel de origem.
- Renovação com lançamento opcional de pagamento, controle de valores, painel financeiro, relatórios, gráfico de seis meses.
- Vencimentos, mensagens para WhatsApp (envio **manual**), lembretes via e-mail SMTP por script de cron (quando agendado), auditoria das alterações, importação e exportação CSV.
- Integrações Sigma, PainelFoda e painéis customizados: cadastro de URL HTTPS, usuário e senha ou token, tentativa de autenticar por **API autorizada**, leitura de clientes, planos e datas retornadas, atualização idempotente. **Não existe garantia de compatibilidade universal** nem contorno de Cloudflare, pois os endpoints variam por fornecedor.
- Backend em PHP com PDO PostgreSQL ou SQLite, banco SQLite somente para desenvolvimento; PostgreSQL recomendado para implantação.

## Rodar localmente

Requisitos: PHP 8.3+, extensões PDO SQLite, cURL e OpenSSL.

```sh
php -S 127.0.0.1:8080 -t public public/router.php
```

Abra http://127.0.0.1:8080 e crie sua primeira conta. Use HTTPS e configuração de segredos ao publicar.

## Deploy no Render

O Render **não oferece PHP como runtime nativo**; esta aplicação inclui `Dockerfile` com PHP 8.3 + Apache, API em `/api/*` e assets estáticos.

1. Hospede o projeto em um repositório Git separado e crie um **Web Service — Docker** no Render.
2. Configure **`DATABASE_URL`** de um banco PostgreSQL dedicado e persistente. Não utilize SQLite em instâncias gratuitas: seus arquivos desaparecem ao reiniciar.
3. Configure variáveis (guarde em segredo):

```env
APP_ENV=production
APP_KEY=64_DIGITOS_HEXADECIMAIS_GERADOS_CRIPTOGRAFICAMENTE
SETUP_TOKEN=CHAVE_FORTE_DE_PELO_MENOS_20_CARACTERES
DATABASE_URL=postgresql://USER:PASS@HOST:5432/DATABASE
SMTP_HOST=
SMTP_PORT=465
SMTP_FROM=
SMTP_USER=
SMTP_PASS=
```

Gere `APP_KEY` usando `php -r 'echo bin2hex(random_bytes(32)),"\n";'`. Gere `SETUP_TOKEN` usando `php -r 'echo bin2hex(random_bytes(24)),"\n";'`. **Não altere APP_KEY após gravar senhas**, pois isso impede a descriptografia posterior.

4. Configure o usuário administrador acessando o site e preenchendo a `SETUP_TOKEN` no primeiro cadastro.
5. Agende `php src/tasks.php` a cada 15-60 minutos com processo externo/scheduler para sincronização automática e lembretes por e-mail. Rodar a interface no Render Free não garante execução de tarefas com o app desligado.
6. Realize backup regular do PostgreSQL, valide domínio e HTTPS, testes de integração reais e políticas de privacidade/LGPD antes de usar com clientes.

**Segurança:** o backend cria tabelas em um schema Postgres separado, `clystria`, evitando disponibilizá-las no schema público de provedores como Supabase. Somente o PHP no servidor deve ter acesso ao banco. Nunca coloque `DATABASE_URL` ou `APP_KEY` no JavaScript.

## APIs e sincronização

Crie uma integração em **Integrações**. A opção “URL + login + senha” tenta `POST /api/login` com JSON `{username,password}`, lê token/cookie de sessão da resposta e consulta `GET /api/clients` e opcionalmente `GET /api/plans`. Ajuste nomes dos campos e rotas em “Configurações avançadas”. Painéis sem estes endpoints precisam de adaptador aprovado pelo fabricante; a página HTML de login protegida pela Cloudflare **não é uma API**. Não há captura de cookies do navegador.

O sincronizador nunca inventa vencimento ausente. Entradas sem login ou vencimento válido são ignoradas, mantendo clientes locais intactos. Respostas bem-sucedidas atualizam ou adicionam clientes vinculados ao painel, com histórico das tentativas.

## E-mail

Envio SMTP TLS/SSL com `SMTP_HOST`, `SMTP_PORT` (465 ou 587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. A opção deve estar habilitada nas Configurações do painel; execute `php src/tasks.php` em um agendador. Só envie aos destinatários com relação comercial e base legal apropriada.

## Observações

- Esta edição é uma **conversão para PHP**. Os dados da base SQLite Node antiga não são migrados automaticamente; use a exportação CSV ou uma migração planejada.
- A conexão com Sigma/PainelFoda real precisa ser homologada. Uma URL, um usuário e uma senha **não bastam** para superar proteção Cloudflare nem para deduzir endpoints proprietários.
- A edição inclui rotas de API para gerenciamento, mas não inclui gateway de pagamento nem integrações homologadas WhatsApp Business para disparo automático.
- Realize testes de ponta a ponta em hospedagem com as extensões PHP e banco disponíveis antes de uso crítico.


## Pesquisa pública TopGestor (22/11/2026)

A página https://topgestor.com/site informa que o usuário cadastra credenciais, enquanto o serviço emprega **APIs dos fornecedores nos bastidores**. Não há detalhes públicos suficientes para reproduzir os adaptadores proprietários ou transferir sessões do Chrome/Safari. Os comunicados oficiais do TopGestor mencionam conectores específicos e importação de planilhas para Sigma. Portanto, o Clystria não deve presumir que `/api/login` funcione em todos os painéis, nem mostrar status de sucesso quando a API falha. A sincronização com Sigma/PainelFoda permanece não homologada até obter endpoints e respostas autorizados para cada fornecedor.
