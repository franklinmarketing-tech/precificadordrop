/* ══════════════════════════════════════════════════════════════════════════
   Passo 2 do OAuth: o Mercado Livre volta aqui com um `code`, que trocamos
   por access_token (vale 6 h) e refresh_token (renova sem novo login).

   O refresh_token aparece na tela uma única vez: guarde-o na variável de
   ambiente ML_REFRESH_TOKEN do projeto na Vercel.
   ══════════════════════════════════════════════════════════════════════════ */
export default async function handler(req, res) {
  const { code, error } = req.query;
  const clientId = process.env.ML_CLIENT_ID;
  const secret   = process.env.ML_CLIENT_SECRET;

  if (error) return res.status(400).send('Autorização negada: ' + error);
  if (!code)  return res.status(400).send('Faltou o parâmetro code. Comece por /api/ml-auth');
  if (!clientId || !secret)
    return res.status(500).send('ML_CLIENT_ID / ML_CLIENT_SECRET não configurados na Vercel.');

  try {
    const r = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: secret,
        code: String(code),
        redirect_uri: `https://${req.headers.host}/api/ml-callback`,
      }),
    });
    const dados = await r.json();
    if (!r.ok) return res.status(r.status).json(dados);

    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><meta charset="utf-8">
<title>Mercado Livre conectado</title>
<style>
 body{font-family:system-ui,sans-serif;background:#eef1f8;color:#0e1018;margin:0;padding:40px}
 .cx{max-width:760px;margin:0 auto;background:#fff;border-radius:18px;padding:32px;
     box-shadow:0 18px 40px -24px rgba(20,30,60,.3)}
 h1{font-size:22px;margin:0 0 6px} p{color:#666d7e;line-height:1.7}
 code{display:block;background:#0e1018;color:#7ee2a8;padding:14px 16px;border-radius:10px;
      font-size:13px;word-break:break-all;margin:10px 0 20px}
 b{color:#0e1018}
</style>
<div class="cx">
  <h1>✅ Conta do Mercado Livre conectada</h1>
  <p>Guarde o valor abaixo na variável de ambiente <b>ML_REFRESH_TOKEN</b> do projeto na Vercel
     (Settings → Environment Variables) e faça um novo deploy. Ele não será mostrado de novo.</p>
  <code>${String(dados.refresh_token || '(não veio refresh_token)')}</code>
  <p>Conta autorizada: <b>${dados.user_id || '—'}</b> · o token de acesso vale
     ${Math.round((dados.expires_in || 0) / 3600)} horas e é renovado sozinho.</p>
</div>`);
  } catch (e) {
    res.status(500).send('Falha ao trocar o code: ' + e.message);
  }
}
