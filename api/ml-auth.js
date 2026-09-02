/* ══════════════════════════════════════════════════════════════════════════
   Passo 1 do OAuth: manda você para a tela de autorização do Mercado Livre.
   Abra https://precificador-drop.vercel.app/api/ml-auth e autorize.
   ══════════════════════════════════════════════════════════════════════════ */
export default function handler(req, res) {
  const clientId = process.env.ML_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({
      erro: 'ML_CLIENT_ID não configurado',
      comoResolver: 'Adicione ML_CLIENT_ID e ML_CLIENT_SECRET nas variáveis de ambiente do projeto na Vercel.',
    });
  }

  const redirect = `https://${req.headers.host}/api/ml-callback`;
  const url = 'https://auth.mercadolivre.com.br/authorization'
    + '?response_type=code'
    + '&client_id=' + encodeURIComponent(clientId)
    + '&redirect_uri=' + encodeURIComponent(redirect);

  res.redirect(302, url);
}
