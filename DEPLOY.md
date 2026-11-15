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

1. Crie uma conta em <https://neon.com> (não pede cartão).
2. Crie um projeto (região mais próxima, ex.: `aws/aws-sa-east-1` para o Brasil).
3. Copie a **connection string** (formato
   `postgresql://usuario:senha@ep-xxx.aws.neon.tech/neondb?sslmode=require`).
4. Para migrações, o Prisma precisa da conexão **direta** (sem pool): no painel do Neon,
   no seletor do endpoint, desmarque "Pooled connection" ou troque o host
   `ep-xxx-pool` por `ep-xxx` ao rodar `prisma migrate deploy`.

Aplicar o schema e os dados demonstrativos, a partir da raiz do projeto:

```bash
cd backend
# Cole a connection string do Neon em backend/.env (DATABASE_URL)
npx prisma migrate deploy
npx prisma db seed
```

---

## 3. API no Render (gratuito)

1. Crie uma conta em <https://render.com> e clique em **New → Web Service**.
2. Conecte o repositório do GitHub e configure:

   | Campo            | Valor                                        |
   | ---------------- | -------------------------------------------- |
   | Root Directory   | `backend`                                    |
   | Build Command    | `npm install && npx prisma generate && npm run build` |
   | Start Command    | `npm run start:prod`                         |
   | Instance Type    | Free                                         |

3. Em **Environment Variables**, adicione:

   ```
   DATABASE_URL = <connection string do Neon>
   JWT_SECRET   = <gere 32+ caracteres aleatórios, ex.: openssl rand -base64 32>
   JWT_EXPIRES_IN = 7d
   AUTH_COOKIE_NAME = sc_token
   WEB_URL = <URL final do site, ex.: https://pacioli.pages.dev>
   NODE_ENV = production
   ```

4. Ao terminar, o Render dá uma URL tipo `https://pacioli-api.onrender.com` —
   **guarde-a**, o site vai usar como `API_URL`.

> **Cold start**: o plano free hiberna a API após ~15 min sem uso; a primeira
> request depois disso demora ~50 s. Para manter acordada, crie um ping
> agendado gratuito em <https://cron-job.org> apontando para
> `https://<sua-api>.onrender.com/api/auth/me` a cada 10 minutos.

---

## 4. Site no Cloudflare (via OpenNext — sucessor do Pages)

> O adaptador antigo `@cloudflare/next-on-pages` foi descontinuado. O caminho
> oficial atual é `@opennextjs/cloudflare`, que publica o Next.js como um
> **Worker** no Cloudflare (mesmo plano gratuito).

No diretório `frontend/`:

```bash
npx @opennextjs/cloudflare migrate   # configura wrangler, scripts e .open-next
npx wrangler login                   # autoriza sua conta Cloudflare
npm run deploy                       # build + publicação
```

Configure as variáveis de ambiente do Worker (`wrangler.jsonc` → `vars`, ou no
dashboard Cloudflare → Workers → Settings → Variables):

```
API_URL = <URL da API no Render, ex.: https://pacioli-api.onrender.com>
NEXT_PUBLIC_API_URL = <mesma URL>
```

Também é possível conectar o repositório do GitHub no dashboard do Cloudflare
(Workers → Create → Connect Git) para deploy automático a cada push.

> **Alternativa mais simples**: como o app é Next.js puro, hospedar o front-end na
> **Vercel** (plano free) dispensa o adaptador — basta importar o repositório e
> definir `API_URL`. Se preferir esse caminho, pule esta etapa e use a Vercel.

---

## 5. Checklist final

- [ ] `backend/.env` no Render com `DATABASE_URL` do Neon e `JWT_SECRET` forte
- [ ] Migrações aplicadas no Neon (`prisma migrate deploy`) e seed opcional
- [ ] `WEB_URL` da API apontando para o domínio final do site
- [ ] `API_URL` do site apontando para a URL da API no Render
- [ ] Login de teste após o deploy (ou entrada como visitante pela home)
