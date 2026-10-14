# 001 — Monorepo e ambiente de demonstração

Adotamos Next.js/TypeScript, FastAPI/Python 3.12 e PostgreSQL 17 conforme o plano. A operação padrão é demonstração; permite conhecer e testar os fluxos fora do horário de atendimento, com aviso em loja, checkout, acompanhamento e painel. O backend de produção impede ativar demonstração ou cookies inseguros.

Datas, centavos, estados e estoque são autoridade do backend. Fotos foram geradas a partir das composições; a marca foi recriada a partir do cardápio enviado e deve ser substituída pelo arquivo original quando disponível. Mantivemos os nomes enviados, inclusive “Ultimat Burguer”.

O plano não forneceu endereço de retirada, lista oficial de CEPs, credenciais nem textos jurídicos aprovados. A aplicação não inventa esses dados. Sem configuração, pagamentos externos e comunicação automática não funcionam; no modo real, modalidades sem endereço/área cadastrada ficam indisponíveis.

Integrações incluem adapters e testes por contrato, mas exigem homologação externa. A outbox prioriza conciliação de envios ambíguos de WhatsApp em vez de prometer uma garantia de entrega única que a API externa não oferece.
