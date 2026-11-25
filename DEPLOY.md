# Guia de Deploy — Pacioli

Como publicar o projeto gratuitamente: **GitHub → Neon (banco) → Render (API) → Cloudflare (site)**.

## Visão geral

| Parte     | Serviço            | Plano gratuito                     | Observação                          |
| --------- | ------------------ | ---------------------------------- | ----------------------------------- |
| Código    | GitHub             | Ilimitado                          | Repositório único (`backend/`, `frontend/`) |
| Banco     | Neon               | 1 GB, autosuspend                  | Postgres 16, funciona direto com Prisma |
| API       | Render             | 750 h/mês, hiberna após ~15 min    | Primeira request após hibernar demora ~50 s |
| Site      | Cloudflare Workers | Incluído no plano free             | Via adaptador OpenNext (sucessor do Pages) |

> O front-end **proxy-iza** `/api/*` para a API (rewrites do `next.config`). Assim o
> navegador só fala com o domínio do site — os cookies de autenticação funcionam
> sem configurar CORS.

---

## 1. Subir para o GitHub

```bash
git init
git add .
git commit -m "Pacioli — simulador educacional de contabilidade"
git branch -M main
git remote add origin https://github.com/<seu-usuario>/pacioli.git
git push -u origin main
```

O `.gitignore` já protege `.env`, `node_modules`, `.next`, `dist` e artefatos de build.

---

## 2. Banco de dados no Neon (gratuito)

O jeito mais rápido é a **CLI do Neon**, que cria o projeto, provisiona o Postgres
e puxa as variáveis para `.env.local`:

```bash
npm i -g neon@latest
neon login            # abre o navegador para autorizar
neon init -y --org-id <sua-org> --project-id <id-do-projeto> --branch production --services postgres
neon deploy           # provisiona e atualiza .env.local (DATABASE_URL, DATABASE_URL_UNPOOLED)
```

O `neon init` também cria um `neon.ts` na raiz (política de branches) e instala as
skills/plugins do Neon para agentes de código.

Aplicar o schema e os dados demonstrativos (a partir de `backend/.env`, que deve
conter `DATABASE_URL` — pooled — e `DATABASE_URL_UNPOOLED` — direta):

```bash
cd backend
npx prisma migrate deploy   # usa directUrl (conexão direta) automaticamente
npx prisma db seed          # rodar com DATABASE_URL apontando para a conexão DIRETA
```

> **Dica**: o seed abre uma transação grande; contra bancos remotos o timeout
> padrão de 5 s do Prisma pode estourar — o `seed.ts` já vem configurado com
> `timeout: 60_000`.

---

## 3. API no Render (gratuito, via Blueprint)

O arquivo `render.yaml` na raiz do repositório descreve o serviço — o Render
detecta e cria tudo automaticamente:

1. Entre em <https://dashboard.render.com> (pode usar SSO do GitHub).
2. **New → Blueprint** e conecte o repositório (`m9ts/Pacioli`, branch `main`).
3. Revise a configuração (serviço `pacioli-api`, raiz `backend`, health check
   `/api/health`). As variáveis marcadas como `sync: false` pedem valores:

   | Variável | Valor |
   | -------- | ----- |
   | `DATABASE_URL` | connection string **pooled** do Neon (arquivo `.env.local`) |
   | `DATABASE_URL_UNPOOLED` | connection string **direta** do Neon (usada nas migrações do build) |
   | `WEB_URL` | URL final do site (pode deixar um placeholder e ajustar depois) |

   O `JWT_SECRET` é gerado automaticamente pelo Render (`generateValue: true`).
4. Clique em **Deploy Blueprint**. O build roda `npm ci && prisma generate &&
   prisma migrate deploy && npm run build` e sobe com `npm run start:prod`.

5. Ao terminar, o Render dá uma URL tipo `https://pacioli-api.onrender.com` —
   **guarde-a**, o site vai usar como `API_URL`. Teste:
   `GET https://<sua-api>.onrender.com/api/health` deve responder `{"status":"ok"}`.

> **Cold start**: o plano free hiberna a API após ~15 min sem uso; a primeira
> request depois disso demora ~50 s e o edge pode responder um desafio HTML em
> vez do JSON. Para evitar isso, o repositório inclui o Worker `keepalive/`, que
> faz `GET /api/health` a cada 10 minutos via Cron Trigger (gratuito):
>
> ```powershell
> cd keepalive
> ..\frontend\node_modules\.bin\wrangler deploy
> ```
>
> Alternativa sem Worker: um ping agendado em <https://cron-job.org> apontando
> para `https://<sua-api>.onrender.com/api/health` a cada 10 minutos.

---

## 4. Site no Cloudflare (via OpenNext — sucessor do Pages)

> O adaptador antigo `@cloudflare/next-on-pages` foi descontinuado. O caminho
> oficial atual é `@opennextjs/cloudflare`, que publica o Next.js como um
> **Worker** no Cloudflare (mesmo plano gratuito).

No diretório `frontend/`:

```bash
npx @opennextjs/cloudflare migrate   # configura wrangler, scripts e .open-next
npx wrangler login                   # autoriza sua conta Cloudflare (OAuth no navegador)
npx wrangler r2 bucket create pacioli-web-opennext-cache   # cache incremental do OpenNext
```

> **Importante**: o rewrite de `/api/*` é resolvido no **build**, então a URL da
> API precisa estar definida como variável de ambiente na hora do deploy.
> No PowerShell:

```powershell
$env:API_URL = "https://pacioli-api-bs5n.onrender.com"
npm run deploy      # build + publicação do Worker (pacioli-web)
```

O `wrangler.jsonc` já vem configurado com: assets, binding R2 de cache,
`nodejs_compat` e self-reference de service binding. O app não usa
`next/image`, então o binding opcional de imagens foi removido (exige plano pago).

> O `NEXT_PUBLIC_API_URL` não é necessário: o front só fala com `/api/*`
> (same-origin, via rewrite) — sem CORS.

---

## 5. Checklist final

- [ ] Blueprint do Render aplicado com `DATABASE_URL` / `DATABASE_URL_UNPOOLED` do Neon
- [ ] Migrações aplicadas pelo próprio build do Render (`prisma migrate deploy` + seed opcional)
- [ ] `GET https://<sua-api>.onrender.com/api/health` respondendo `{"status":"ok"}`
- [ ] Deploy do site feito com `API_URL` apontando para a URL da API no Render
- [ ] `WEB_URL` da API atualizada para o domínio final do site (no Render, dispara redeploy)
- [ ] Login de teste após o deploy (ou entrada como visitante pela home)
- [ ] Worker `keepalive` publicado (`crons: ["*/10 * * * *"]`) para a API não hibernar
