# ARGUS Pay — Revisão de segurança (19/11/2026)

## Escopo e limites
Revisão de código e registros do Render, abrangendo cadastro/autenticação de revendedores, admin/2FA, chaves API V1/V2, KYC/documentos/face capture, cobranças, carteiras, saques, notificações e configuração HTTP/Apache. Testes automatizados com dados sintéticos; nenhum pagamento real, tentativa de intrusão, varredura agressiva, auditoria externa ou certificação de segurança.

## Proteções existentes confirmadas por inspeção
- Sessões do portal com cookies Secure, HttpOnly e SameSite Strict; token CSRF em operações autenticadas.
- API keys individuais, segredo armazenado como hash, revogação e escopo próprio para saques.
- Carteiras vinculadas à conta e merchant_id, reservas de saques, livro-razão e idempotência.
- Documentos criptografados, verificação de integridade e acesso KYC de analistas com trilha de auditoria.
- Depósitos financeiros dependem de confirmação do provedor, sem creditar Pix apenas emitido.
- Captura facial guiada é evidência complementar, não detecção antifraude certificada.

## Controles acrescentados neste pacote
- Limites de tentativas de login e cadastro com contadores atômicos persistentes; os identificadores dos limites são HMAC, nunca CPF, e-mail, IP ou API Key em claro.
- Limites de volume para solicitações financeiras por vendedor (Pix e saques); aplicação tanto no portal quanto na API V2.
- Bloqueio de chaves legadas quando o vínculo do recebedor muda ou o KYC deixa de estar aprovado.
- Impedimento do uso de credenciais da API Finance como fallback indevido na API de cobrança tradicional.
- Registro pseudonimizado para saques cuja resposta do provedor é incerta, sem repetir a operação.
- Cabeçalhos de transporte/navegador: HSTS, anti-clickjacking, CSP parcial, no-referrer, restrição de permissões, no-sniff, sem cache nas páginas privadas e APIs, diretórios privados negados.

## Pendências relevantes (não resolvidas por uma alteração de código)
1. **Repositório público:** o repositório GitHub é público e contém `source.zip`. É necessária decisão do proprietário para restringir o acesso. A análise de possíveis segredos embutidos no arquivo e no histórico não foi concluída; caso existam segredos expostos, a rotação é necessária mesmo depois de privatizar.
2. **Validação biométrica:** MediaPipe e movimentos de rosto não equivalem a PAD/liveness certificado; não liberar dinheiro com base nesse sinal.
3. **Credenciais MisticPay Finance:** o ambiente Oregon retornou 401 INVALID_API_CREDENTIAL. A consulta tradicional respondeu HTTP 200; a criação real de Pix e saque ponta a ponta não está validada.
4. **Proteção de borda:** para um gateway em produção, configurar WAF/CDN, DDoS, rotação de chaves, alarmes, backups cifrados com teste de restauração, política de retenção LGPD, SIEM e revisão de terceiros.
5. **CSP rigorosa:** a versão deste pacote não define script-src porque o frontend existente utiliza dependências externas e scripts legados. Requer inventário/SRI ou hospedagem de recursos, testes e rollout gradual.
6. **Auditoria independente:** testes automatizados são insuficientes para garantir ausência de exploração, fraude ou vazamento. Solicitar pentest formal antes de operação financeira em larga escala.

## Operação segura
- Não registrar valores de credenciais, CPFs completos, tokens, payloads de Pix ou documentos nos logs.
- Em falhas de saque incertas, manter o saldo reservado e conciliar com o provedor. Nunca reenviar automaticamente.
- Em incidente, revogar/rotacionar credenciais por ambiente e revisar históricos da conta e do provedor.
- Monitorar abuso usando contadores e eventos pseudonimizados. Os alertas não substituem revisão humana.
