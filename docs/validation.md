# Validação executada no ambiente de desenvolvimento

Verificação em 14/10/2026, com Node.js 24, Python 3.12, PostgreSQL 17 em Docker e Chromium.

| Verificação | Resultado |
| --- | --- |
| Instalação pelo `infra/setup.sh` | Concluída; lockfiles utilizados; `.env` existente preservado |
| Inicialização e encerramento | API, worker e frontend iniciados pelo script; catálogo verificado; portas liberadas ao encerrar |
| API + PostgreSQL | Health e catálogo com seis produtos e preços do cardápio conferidos |
| Testes pytest | 49 passaram, incluindo regras, autorização, assinaturas, outbox, cancelamento, Pix tardio e devoluções |
| Concorrência | 50 requisições disputando o último hambúrguer: uma reserva aceita, 49 rejeitadas, estoque final zero |
| Webhook Pix repetido | Três eventos iguais: um registro financeiro, uma transição e uma mensagem na outbox |
| Playwright | 10 testes passaram: cinco cenários em desktop e celular |
| Fluxos no navegador | Filtros, personalização, limite de adicionais, persistência, entrega/dinheiro/cancelamento, retirada/crédito, MFA e fila completa até conclusão |
| Acessibilidade automatizada | Axe sem violações nos alvos cardápio e modal; foco dentro do diálogo e fechamento por teclado verificados |
| Build Next.js / TypeScript | Passaram |
| Ruff / Prettier | Passaram |
| Backup e restauração | Dump restaurado em banco temporário; contagens de produtos e pedidos conferidas |

Os testes da API usam bancos isolados `carbons_test*`. Os testes de integração com Mercado Pago e WhatsApp substituem as respostas dos provedores por fixtures; não foram feitos pagamentos ou envios reais. Os testes automatizados de acessibilidade não equivalem a homologação completa WCAG. A concorrência foi exercitada no banco local, sem representar um laudo de capacidade em produção.

O GitHub Actions está configurado, mas sua execução remota deve ser verificada após o push. Docker/PostgreSQL foi utilizado durante os testes; o perfil opcional com os quatro containers precisa ser validado na infraestrutura de implantação. Não foram efetuados publicação em hospedagem, configuração de domínio, emissão de certificados ou homologação externa.
