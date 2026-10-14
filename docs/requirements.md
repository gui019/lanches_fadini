# Requisitos e situação de entrega

Fonte: plano de desenvolvimento em PDF e imagem do cardápio fornecidos pelo usuário. O cronograma de estudo não é uma sequência de autorização do assistente; foi usado como especificação do produto. A implementação não configura contas, domínio ou serviços pagos em nome do responsável.

| Área | Entregue no código | Validação ou dependência restante |
| --- | --- | --- |
| Cardápio | Seis lanches com os preços enviados, ingredientes, fotos ilustrativas, disponibilidade e busca/filtros | Substituir por fotos oficiais; confirmar composição do X-Turbo e a interpretação de cheddar/Catupiry |
| Personalização | Remoções sem desconto; até cinco unidades de cada adicional; sacola persistente | Testes de interface e API |
| Horários | Segunda 15h a quinta para agendamento; sexta 18h–21h30 para pedidos do dia; atendimento 20h–22h; fuso São Paulo | Interpretação de sexta antes das 18h deve ser confirmada com a operação |
| Entrega e retirada | Taxa fixa de R$ 6; cidade/área/CEP validados no backend; endereço privado de retirada | Cadastrar endereço e lista de CEPs urbanos revisada; não há geocodificação automática |
| Estoque | 40 por semana; extras de carne consomem estoque; reserva atômica; devolução; expiração Pix; alerta em 10 | Testes reais PostgreSQL com concorrência |
| Checkout | Visitante; limites; pagamento; troco; e-mail só para Pix; consentimentos | Homologar com a operação |
| Acompanhamento | Link seguro, histórico, cancelamento e solicitação após preparo | Link expira sete dias após o atendimento |
| Painel | MFA, fila paginada, status, previsão, recebimento, edição de lanches, estoque, auditoria | Criar conta administrativa pessoal; alterações em adicionais e devolução manual também têm API |
| Entregador | Agrupamento de pedidos, ordem manual, token temporário/revogável, ocorrências e confirmação | Testar com entregador e aparelhos reais antes do lançamento |
| Relatórios | Bruto, recebido, estornos, ticket, ranking, pagamentos e modalidade, filtro semanal, CSV e impressão/PDF | Sem conciliação de taxas; comparação entre semanas é feita alterando o filtro |
| Pix | Adapter Mercado Pago, QR Code/copia e cola, assinatura, consulta do pagamento, idempotência, expiração e reembolso | Credenciais de teste, sandbox real e homologação ausentes; desativado por padrão |
| WhatsApp | Adapter Cloud API, template operacional, assinatura do webhook, outbox, retries e rastreio de eventos | Conta/número, credenciais, template aprovado e homologação ausentes; desativado por padrão |
| Alertas | Alerta sonoro no painel e estoque baixo | Push e WhatsApp ao administrador pendentes |
| Segurança | Argon2id, TOTP, sessões, origem/CSRF, limites de requisição, tokens, CSP, validação, logs sem acesso por URL | Revisão de segurança independente, CSP com nonce e rate limiting compartilhado antes de escalar |
| Privacidade | Política inicial, dados mínimos, consentimento operacional opcional, comando de anonimização | Identificação jurídica, prazos aprovados, agenda de retenção e textos jurídicos finais |
| Infraestrutura | Docker Compose, Alembic, lockfiles, CI, scripts e teste de backup/restauração | Hospedagem, domínio, TLS, monitoramento externo e backups gerenciados |
| Homologação | Testes de regras, concorrência, adapters e navegação automatizada | Aprovação da equipe, conta de pagamentos, mensagens reais, leitor de tela e carga operacional completa |

## Antes de vender

1. Fazer as validações municipais, sanitárias e contábeis descritas no PDF.
2. Confirmar o cardápio e aprovar as políticas; definir controlador e canal de privacidade.
3. Provisionar staging, PostgreSQL gerenciado, domínio/TLS, segredos e backups.
4. Criar administrador com MFA e configurar área de entrega/retirada.
5. Homologar Pix e WhatsApp em contas de teste. A ativação por variáveis não é homologação.
6. Executar pedidos completos com a equipe, inclusive falhas, cancelamento, reembolso e rota.
7. Somente após essas etapas, usar `APP_ENV=production`, `DEMO_MODE=false`, `COOKIE_SECURE=true` e `PUBLIC_URL=https://...`.

## Integrações externas

Mercado Pago: `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`; destino `api.mercadopago.com`. Webhook público HTTPS em `/api/v1/webhooks/mercado-pago`. O payload assinado usa `data.id` da URL, `x-request-id`, `x-signature` e consulta à API.

Meta: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TEMPLATE`; destino `graph.facebook.com`. Template utilitário aprovado `pt_BR` com três parâmetros: código do pedido, estado e previsão. Webhook em `/api/v1/webhooks/whatsapp`. Traduza os estados do template para os textos finais aprovados pela operação.

Insira valores somente no cofre/variáveis protegidas da hospedagem ou no `.env` local ignorado pelo Git. Não envie segredos em issues, commits ou mensagens. Respeite as rotas de autenticação do provedor de ambiente; segredos de assinatura usados localmente precisam estar disponíveis como valores reais ao backend, não como placeholders de proxy.
