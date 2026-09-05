/* ══════════════════════════════════════════════════════════════════════════
   Token de VENDEDOR para o Mercado Livre.

   Diferente do resto da pasta: aqui o client_credentials NÃO serve. Ele
   autentica o aplicativo, não a conta — e com ele o ML responde "não
   autorizado" em tudo que é dos seus anúncios (listar os seus itens, mudar
   preço). Para isso só vale o token que sai do fluxo de autorização, em
   /api/ml-auth, guardado como ML_REFRESH_TOKEN.

   O arquivo começa com _ de propósito: a Vercel não publica como rota.
   ══════════════════════════════════════════════════════════════════════════ */

let cache = {token: null, expiraEm: 0, userId: null};

export class SemAutorizacao extends Error {
  constructor(msg) {
    super(msg);
    this.semAutorizacao = true;
  }
}

export async function tokenDoVendedor() {
  const agora = Date.now();
  if (cache.token && agora < cache.expiraEm - 60000) return cache.token;

  const clientId = process.env.ML_CLIENT_ID;
  const secret   = process.env.ML_CLIENT_SECRET;
  const refresh  = process.env.ML_REFRESH_TOKEN;

  if (!clientId || !secret)
    throw new SemAutorizacao('Faltam ML_CLIENT_ID e ML_CLIENT_SECRET nas variáveis de ambiente.');

  if (!refresh)
    throw new SemAutorizacao(
      'Esta conta ainda não autorizou o app a mexer nos anúncios. '
      + 'Abra /api/ml-auth, entre com a conta que vende, autorize, e guarde o '
      + 'refresh_token que aparece na variável ML_REFRESH_TOKEN do projeto na Vercel.');

  const r = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: secret,
      refresh_token: refresh,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token)
    throw new SemAutorizacao(
      'O Mercado Livre recusou o refresh token'
      + (d.message ? ' (' + d.message + ')' : '')
      + '. Refaça a autorização em /api/ml-auth e atualize ML_REFRESH_TOKEN.');

  cache = {token: d.access_token, expiraEm: agora + (d.expires_in || 21600) * 1000, userId: cache.userId};
  return cache.token;
}

export async function idDoVendedor(token) {
  if (cache.userId) return cache.userId;
  const r = await fetch('https://api.mercadolibre.com/users/me', {
    headers: {Authorization: 'Bearer ' + token},
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.id) throw new SemAutorizacao('Não consegui identificar a conta do vendedor.');
  cache.userId = d.id;
  return d.id;
}

/* Erro em JSON, no formato que a tela sabe mostrar. */
export function responderErro(res, e) {
  const status = e && e.semAutorizacao ? 401 : 500;
  res.status(status).json({
    erro: e && e.message ? e.message : String(e),
    precisaAutorizar: !!(e && e.semAutorizacao),
  });
}
