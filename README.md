# Pacioli — Simulador Educacional de Contabilidade Empresarial

Sistema completo de contabilidade para ensino: escrituração por **partidas dobradas**,
**estoque** com custo médio ponderado móvel, **ativos/depreciação**, relatórios
contábeis (Diário, Razão, Balancete, Balanço, DRE), **encerramento do exercício**,
exportação em **Excel e PDF**, autenticação com perfis (**Admin / Professor / Aluno**)
e isolamento de dados por empresa.

## Arquitetura

| Camada     | Stack                                                          |
| ---------- | -------------------------------------------------------------- |
| Front-end  | Next.js 15 (App Router), React 19, Tailwind 3, Recharts, TanStack Query |
| Back-end   | NestJS 11, Prisma ORM 6, JWT em cookie httpOnly, Swagger       |
| Banco      | PostgreSQL 16                                                   |
| Exportação | ExcelJS (xlsx) + pdfmake (PDF)                                  |

Monorepo com duas pastas: `backend/` e `frontend/`.

> **Deploy**: veja o guia passo a passo em [DEPLOY.md](DEPLOY.md) — GitHub + Neon
> (banco) + Render (API) + Cloudflare (site), tudo em planos gratuitos.

### Requisitos

- Node.js 20+
- PostgreSQL 14+ em execução (local ou Docker)

## Como executar

### 1. Banco de dados

Crie um banco `contabil_educacional` com usuário `contabil`/`contabil`
ou ajuste a `DATABASE_URL` em `backend/.env`:

```
DATABASE_URL=postgresql://contabil:contabil@localhost:5433/contabil_educacional?schema=public
```

Com Docker, um `docker-compose.yml` na raiz sobe o Postgres na porta **5433**:

```bash
docker compose up -d
```

### 2. Back-end

```bash
cd backend
npm install
npx prisma migrate dev      # aplica as migrações
npx prisma db seed          # dados demonstrativos
npm run start:dev           # API em http://localhost:4000/api
```

Swagger (somente fora de produção): <http://localhost:4000/api/docs>

### 3. Front-end

```bash
cd frontend
npm install
npm run dev                 # http://localhost:3000
```

O Next.js repassa `/api/*` para o back-end via rewrites, então o cookie httpOnly
de autenticação funciona em ambiente de desenvolvimento.

### 4. Entrar

A página inicial (`/`) não exige login: um retrato vetorial de Luca Pacioli
apresenta o produto e, em seguida, duas opções — **Começar nova empresa** e
**Carregar planilha (.xlsx ou .csv)**. Ambas criam uma sessão descartável de
visitante (`POST /api/auth/guest`) para explorar o simulador sem cadastro.

Não há tela de login: o acesso é feito por **sessão de visitante** (descartável)
ou por **registro livre** em `/registrar` — a sessão criada no registro também
vem pronta via cookie httpOnly. Contas de demonstração existem no seed
(`admin@pacioli.dev`, `professor@pacioli.dev`, `aluno@pacioli.dev`, senha
`pacioli123`) e podem ser usadas pela API (`POST /api/auth/login`) durante o
desenvolvimento.

> **Professores**: o registro com perfil de professor exige o código de convite
> configurado em `TEACHER_INVITE_CODE` no ambiente do servidor — **não há valor
> padrão**; sem a variável, o servidor recusa registros de professor.

## Principais fluxos

1. **Começar pela landing** — `/` mostra o retrato de Pacioli e oferece
   *Começar nova empresa* (abre o cadastro já com sessão de visitante) ou
   *Carregar planilha* (importa `.xlsx`/`.csv` com colunas **Tipo · Conta ·
   Descrição · Valor** e conclui a abertura automaticamente).
2. **Criar empresa** — *Minhas Empresas → Nova empresa*; o assistente de abertura
   cria o plano de contas padrão, o período contábil e os lançamentos de abertura
   (capital social e patrimônio inicial) em uma única transação.
3. **Lançamentos** — *Livro Diário → Novo lançamento*; o formulário valida as
   partidas dobradas em tempo real. Lançamentos não são excluídos: use **estorno**.
4. **Estoque** — cadastre produtos (com contas de estoque, receita e CMV) e
   registre compras/vendas; cada movimentação gera os lançamentos contábeis e
   recalcula o custo médio.
5. **Ativos** — aquisição, depreciação mensal linear e baixa, tudo contabilizado.
6. **Relatórios** — Balancete, Balanço, DRE e Razão com filtros por período e
   exportação Excel/PDF.
7. **Encerramento** — na DRE, *Encerrar período* zera as contas de resultado e
   transfere o resultado ao Patrimônio Líquido.

## Estrutura

```
backend/
  prisma/            schema, migrações e seed
  src/
    auth/            login, registro, JWT, perfis
    common/          guards (empresa, papéis), filtros, utilitários
    accounts/        plano de contas + plano padrão
    journal/         motor de escrituração (postEntry/estorno)
    companies/       empresas, abertura, membros, importação de planilha
    periods/         períodos contábeis
    reports/         saldos, balancete, balanço, DRE, razão, painel, encerramento
    stock/           produtos, movimentações, custo médio
    assets/          ativos, depreciação, baixas
    partners/        clientes e fornecedores
    export/          Excel e PDF
frontend/
  src/app/(auth)/    registro
  src/app/(app)/     dashboard e módulos do sistema
  src/components/    shell, providers e componentes de UI
```

## Variáveis de ambiente (backend/.env)

| Variável              | Padrão            | Uso                          |
| --------------------- | ----------------- | ---------------------------- |
| `DATABASE_URL`        | —                 | Conexão PostgreSQL (pooled em produção, ex.: Neon) |
| `DATABASE_URL_UNPOOLED` | —               | Conexão direta para migrações (Prisma `directUrl`) |
| `JWT_SECRET`          | dev               | Assinatura dos tokens (32+ caracteres em produção) |
| `JWT_EXPIRES_IN`      | `7d`              | Validade da sessão           |
| `PORT`                | `4000`            | Porta da API                 |
| `WEB_URL`             | `http://localhost:3000` | CORS do front          |
| `TEACHER_INVITE_CODE` | — (sem padrão)    | Código de convite de professor; sem ele, registros de professor são recusados |

## Segurança

Medidas já incorporadas ao código:

- **Senhas** com bcrypt (custo 10) e política de tamanho no DTO.
- **Sessões** via JWT em cookie `httpOnly` (`secure` em produção, `SameSite=Lax`).
- **Isolamento por empresa**: todo acesso passa pelo guard `CompanyAccessGuard`,
  que valida o cabeçalho `x-company-id` contra a participação do usuário.
- **Validação de entrada** global (`ValidationPipe` com `whitelist`, que descarta
  campos extras) e **sem SQL bruto** — o Prisma parametriza todas as consultas.
- **Rate limit** global por IP (120 req/min), com limites mais rígidos em
  `login` (10/min), `register` (5/min) e `guest` (20/min).
- **Swagger desativado em produção** (disponível apenas com `NODE_ENV` ≠ `production`).
- **Mensagens de erro** centralizadas, sem expor stack traces ao cliente.
- O app **não utiliza LLM/IA**, portanto não há superfície de prompt injection.
