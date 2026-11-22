# Clystria Remote Browser Worker

Serviço Node 22 + Playwright Core + Chromium de navegação automatizada autorizada.

## Segurança
- O Chromium é executado no servidor, sem extensão ou aplicativo no celular. Cada solicitação cria um BrowserContext privado que é fechado ao terminar. Cookies e armazenamento de sessão NÃO são persistidos.
- A API exige BROWSER_WORKER_TOKEN (pelo menos 32 caracteres), usado como Authorization Bearer. Nunca exponha o token ao JavaScript do cliente.
- ALLOWED_PANEL_HOSTS: domínios explicitamente autorizados, separados por vírgula (sem esquema/protocolo).
- Só URLs HTTPS públicas são aceitas; URLs externas, privadas e endereços IP diretos são rejeitados. Não permita enviar destinos controlados por terceiros ao serviço.
- Uma sincronização por vez, páginas limitadas, dados extraídos somente de texto visível. A automação NÃO resolve nem contorna desafios Cloudflare ou CAPTCHA, conforme as políticas de proteção do fornecedor.
- HTML e credenciais não são registrados. O código nunca envia cookies ao Clystria, apenas nome, login, vencimento, telefone, plano e status quando detectados.
- Os seletores genéricos são um MVP; Sigma e PainelFoda podem exigir adaptadores específicos para suas páginas.
- Não use com sites/contas sem autorização.

## Rotas
GET /health — estado público sem segredos
POST /sync — Authorization: Bearer <BROWSER_WORKER_TOKEN>, JSON com url, username, password.
Responde {ok,clients,plans,diagnostics} ou {error,code}.

## Render
Docker com Chromium apt Debian. O free tier tem 512MB RAM, é sujeito a suspensão e pode não comportar Chromium. Para uso confiável recomendam-se 1-2GB RAM e um serviço dedicado. No gratuito a viabilidade somente fica comprovada após autenticação e consulta reais.
