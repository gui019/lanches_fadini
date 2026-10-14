# Carbon's Burguer

Loja e sistema de pedidos da Carbon's Burguer, de Pirassununga, com **Next.js + TypeScript**, **FastAPI + Python 3.12** e **PostgreSQL 17**. Projeto criado a partir do plano em PDF e do cardápio enviados pelo responsável.

![Página inicial da Carbon's Burguer](docs/site-desktop.png)

## O que funciona

- Cardápio com seis lanches, preços do material enviado, busca, filtros e imagens ilustrativas.
- Personalização, remoção de ingredientes, até cinco unidades de cada adicional e sacola persistente com limite de dez lanches.
- Checkout de visitante, entrega por R$ 6 ou retirada, escolha de horário, dinheiro e cartão presencial.
- Regras no servidor: agenda no fuso de São Paulo, área de entrega, preços em centavos, versões do cardápio, idempotência e estoque transacional de 40 hambúrgueres por semana.
- Acompanhamento por link seguro, histórico e cancelamento conforme o estágio do preparo.
- Painel com senha + MFA, fila de pedidos, previsão, recebimentos, edição de lanches e adicionais, estoque, rotas, auditoria e relatórios CSV/PDF pela impressão do navegador.
- Link temporário e revogável para o entregador, com múltiplas paradas e registro de entrega/ocorrências.
- Adapters de Mercado Pago e WhatsApp, webhooks validados, expiração e worker de outbox. **Integrações externas ficam desativadas até configurar e homologar as contas.**

O modo padrão é **demonstração**: pedidos de teste, sem cobranças nem mensagens reais. Ele permite testar fora do horário. A produção exige demonstração desativada, cookies seguros e HTTPS. Consulte a [situação de cada requisito](docs/requirements.md) para os limites e passos de lançamento; publicar o código no GitHub não hospeda o site.

## Preparação rápida no Linux / ambiente de nuvem

Requisitos: Python 3.12, Node.js 24, npm e Docker com Compose. Trabalhe no checkout existente; cada tarefa da nuvem já tem seu próprio ambiente isolado.

```bash
bash infra/setup.sh
bash infra/start.sh
```

O setup cria `.venv`, instala pelos lockfiles, gera `.env` com segredos locais aleatórios sem sobrescrever configuração existente, sobe o PostgreSQL e aplica migrações/cardápio. O start inicia API, worker e frontend. Interrompa com Ctrl+C.

O frontend usa a porta 3000, a API a 8000 e o banco a 5432. `GET /health` verifica a conexão com o banco. A API técnica/OpenAPI fica em `/docs` na porta da API; a loja encaminha `/api/v1/*` pelo mesmo domínio. Para teste de entrega em demonstração, use o CEP **13630-000**. Não é uma área oficial de cobertura.

## Windows 11 / PowerShell

Com Git, Python, Node.js e Docker Desktop em execução:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r backend/requirements.lock
npm --prefix frontend ci
python infra/init_env.py
docker compose up -d --wait db
cd backend
..\.venv\Scripts\alembic upgrade head
..\.venv\Scripts\python -m app.manage seed
..\.venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log
```

Em outro terminal, dentro de `backend`, execute `..\.venv\Scripts\python -m app.worker`. Em um terceiro, na raiz, execute `npm --prefix frontend run dev`.

## Administrador

Nenhuma senha administrativa padrão é criada. Com o ambiente virtual ativado:

```bash
cd backend
python -m app.manage create-admin --username seu_usuario
```

Escolha uma senha com ao menos 12 caracteres. A CLI grava temporariamente uma URI privada para cadastrar a chave em um aplicativo autenticador e exige o código TOTP antes de criar a conta. Não compartilhe esse arquivo. Ele é removido após a configuração. Depois, entre em `/admin` com usuário, senha e código.

Leia o [manual da equipe](docs/operations.md) antes de operar pedidos.

## Testes

Os testes usam PostgreSQL real, não SQLite. `infra/setup.sh` cria o banco isolado `carbons_test`. No Windows, crie-o antes com `docker compose exec db createdb -U carbons carbons_test`.

```bash
cd backend
../.venv/bin/pytest --tb=short
../.venv/bin/ruff check app tests
../.venv/bin/ruff format --check app tests
cd ../frontend
npm run build
npm run typecheck
```

Para E2E, instale o navegador com `npx playwright install chromium` dentro de `frontend` (na nuvem, Chromium do sistema é aproveitado). Depois, dentro de `backend`:

```bash
../.venv/bin/python -m app.e2e
```

O runner cria `carbons_test_e2e`, aplica migrações, gera um administrador temporário e inicia servidores nas portas 8010/3010. Executa os fluxos em desktop e celular e encerra os processos ao terminar. Não usa o banco de pedidos da aplicação. Esses testes incluem axe para cardápio/modal e navegação por teclado; não substituem uma auditoria completa de acessibilidade com pessoas e leitores de tela. No Windows, use `.venv\Scripts\python` no lugar de `.venv/bin/python`.

O GitHub Actions executa testes da API, formatação, build e E2E. As credenciais presentes no workflow são exclusivas do banco efêmero de testes.

## Docker completo

```bash
python infra/init_env.py
docker compose --profile full up --build -d
```

O perfil `full` inclui banco, API, worker e Next.js em modo de produção do framework, mas o domínio de negócio continua em demonstração conforme `.env`. Não deixe o start local usando as mesmas portas. Para criar administrador no container: `docker compose exec api python -m app.manage create-admin --username seu_usuario`.

## Configuração e operação real

Consulte [.env.example](.env.example). Nunca envie `.env`, dumps de banco ou credenciais para o GitHub. Configure segredos no cofre da hospedagem. Use credenciais de teste antes das de produção.

Para sair de demonstração, cadastre `PICKUP_ADDRESS`, os CEPs urbanos autorizados em `DELIVERY_ALLOWED_CEPS` e as integrações desejadas, homologue os fluxos e configure `APP_ENV=production`, `DEMO_MODE=false`, `COOKIE_SECURE=true`, `PUBLIC_URL=https://seu-dominio`. O endereço privado não é incluído no catálogo. Sem CEPs/endereço configurados, a respectiva modalidade fica indisponível na operação real.

`API_INTERNAL_URL` é a URL privada da API utilizada no **build do Next.js**. Em Docker, o padrão é `http://api:8000`; fora do Compose, use a URL interna da sua hospedagem durante o build. Não exponha a porta do banco ou a API interna diretamente na Internet. O limitador atual requer uma única instância de API ou proteção compartilhada no gateway ao escalar.

Backup e verificação de restauração: `python infra/backup.py --verify`. O resultado é privado e ignorado pelo Git. [Arquitetura](docs/architecture.md), [requisitos e pendências](docs/requirements.md), [manual](docs/operations.md) e [decisão inicial](docs/decisions/001-foundation.md) documentam o restante.
