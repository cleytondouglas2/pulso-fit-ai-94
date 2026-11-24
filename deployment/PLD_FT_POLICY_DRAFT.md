# Política interna de PLD/FTP — minuta piloto, não vigente

Referências: Lei 9.613/1998, Lei 13.260/2016, Lei 13.810/2019, Circular BCB 3.978 (quando aplicável às instituições autorizadas), deveres PLD/FTP do Coaf. Confirmar enquadramento jurídico e responsabilidades contratuais com o PSP. Não declarar conformidade certificada.

## Governança
Designar responsável formal e substituto, assegurar autonomia, segregação e sigilo, acesso mínimo e revisão de conflitos. Aprovar avaliação interna de riscos, recursos e treinamento; documentar efetividade e revisão periódica. Validar prazos legais de análise, comunicação e retenção conforme segmento e contrato.

## Diligência
KYC/KYB, origem de recursos conforme risco, beneficiário final, perfil esperado, revisão periódica e reforçada, PEP e sanções com fontes atualizadas e evidências. PEP não é prova de ilícito. Não marcar sem correspondência sem consulta real. A central registra revisão manual, não consulta fontes externas.

## Monitoramento e investigação
Pilot-1 avalia apenas registros de revendedores com status atual e datas de criação UTC, não liquidação real. Indicadores de repetição, concentração de entradas/saídas, revisão de saques e desvio de perfil são hipóteses de triagem, não limiares legais. Validar calibração, cobertura, desempenho, atualização tardia, falsos positivos e falsos negativos. Revisar casos, documentar evidências em repositório restrito e registrar parecer; preservar sigilo e escalonar ao responsável. Nenhuma decisão do painel bloqueia ou libera recursos.

## Comunicação
Dossiê interno para análise e preparação de eventual comunicação. Sem transmissão ao Coaf, sem declarar comunicação realizada. Responsável habilitado decide e comunica via canal aplicável, coordena com instituição parceira, mantém evidências e sigilo. Não avisar investigados sobre comunicações.

## Implantação
Revisão jurídica e de segurança; migração CLI já existente inclui tabelas AML; ativar ARGUS_AML_ENABLED=yes somente após migração e testes. Worker /usr/local/share/argus/aml_worker.php requer PostgreSQL compartilhado, pode ser agendado em ambiente seguro com limite de execução e monitoramento; não está agendado automaticamente. Verificar cobertura de Pix API/B2B e administrativo, data de liquidação, casos tardios e integração de PEP/sanções. Acesso somente Super Admin com CSRF e MFA nas escritas; histórico append-only na aplicação, não inviolável perante DBA. Dados de investigações não devem ser publicados nem entregues ao revendedor.
