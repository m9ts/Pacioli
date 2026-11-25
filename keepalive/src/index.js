/**
 * Worker de keep-alive da API no Render (plano free).
 *
 * O Render hiberna serviços free depois de ~15 minutos sem requisições. Ao
 * acordar, a primeira chamada leva ~50s e o edge pode devolver um desafio
 * HTML do Cloudflare, quebrando o JSON esperado pelo frontend.
 *
 * Este Worker dispara um GET /api/health a cada 10 minutos (Cron Trigger)
 * para manter a API acordada.
 */
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      fetch(`${env.API_URL}/api/health`, { headers: { 'user-agent': 'pacioli-keepalive' } }).catch(
        () => undefined,
      ),
    );
  },

  async fetch(_request, env) {
    const started = Date.now();
    try {
      const response = await fetch(`${env.API_URL}/api/health`, {
        headers: { 'user-agent': 'pacioli-keepalive' },
      });
      return Response.json({
        api: env.API_URL,
        status: response.status,
        ms: Date.now() - started,
      });
    } catch (error) {
      return Response.json({ api: env.API_URL, error: String(error) }, { status: 502 });
    }
  },
};
