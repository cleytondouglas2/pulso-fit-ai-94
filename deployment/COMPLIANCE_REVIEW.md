# Compliance — revisão pendente

- Minutas públicas em /privacidade e /termos, links em páginas públicas e painéis.
- Auditoria somente leitura para superadmin, baseada nas tabelas de Pix, saques, taxas e ledger existentes. Não registra novos eventos nem cria histórico imutável. EndToEndId permanece indisponível até confirmação do esquema e integração do provedor.
- Antes de mesclar: confirmar razão social, CNPJ, endereço, canal LGPD para não cadastrados, bases legais, prazos e compartilhamentos reais, responsável financeiro e identificação BaaS; revisar com jurídico e remover indicação de minuta somente após aprovação.
- Aceite eletrônico persistente e obrigatório, central de direitos LGPD e trilha append-only de webhooks/transições ainda pendentes; não simular aceite nem fazer alterações financeiras.
- Executar build Docker completo e testes sintéticos em ambiente isolado, sem credenciais financeiras de produção. Verificar páginas e RBAC, consultas Pix/saques/taxas em todos os quatro tipos, e regressão de pagamentos sem movimentar dinheiro real.
