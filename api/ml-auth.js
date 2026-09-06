/* ══════════════════════════════════════════════════════════════════════════
   Passo 1 do OAuth: manda você para a tela de autorização do Mercado Livre.
   Abra https://precificador-drop.vercel.app/api/ml-auth e autorize.

   O `state` é um número sorteado agora, guardado num cookie que só o
   servidor lê. O Mercado Livre devolve o mesmo valor no passo 2, e lá os
   dois são comparados. Sem isso, qualquer `code` que chegasse no callback
   seria aceito — inclusive um code de outra pessoa, plantado por link.
   ══════════════════════════════════════════════════════════════════════════ */
import {randomBytes} from 'node:crypto';

export default function handler(req, res) {
  const clientId = process.env.ML_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({
      erro: 'ML_CLIENT_ID não configurado',
      comoResolver: 'Adicione ML_CLIENT_ID e ML_CLIENT_SECRET nas variáveis de ambiente do projeto na Vercel.',
    });
  }

  const state = randomBytes(24).toString('base64url');
  res.setHeader('set-cookie',
    `drop_oauth_state=${state}; Path=/api; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);

  const redirect = `https://${req.headers.host}/api/ml-callback`;
  const url = 'https://auth.mercadolivre.com.br/authorization'
    + '?response_type=code'
    + '&client_id=' + encodeURIComponent(clientId)
    + '&redirect_uri=' + encodeURIComponent(redirect)
    + '&state=' + encodeURIComponent(state);

  res.redirect(302, url);
}
