/* ══════════════════════════════════════════════════════════════════════════
   Endpoint de notificações do Mercado Livre.

   O app só consulta tarifas, então não assinamos nenhum tópico — mas o
   DevCenter pede uma URL de retorno e valida se ela responde. Este endpoint
   existe para isso: aceita a chamada e responde 200 na hora, como o Mercado
   Livre espera (ele reenvia a notificação se não responder rápido).
   ══════════════════════════════════════════════════════════════════════════ */
export default function handler(req, res) {
  if (req.method === 'GET') {
    // acesso pelo navegador: só para conferir que está no ar
    return res.status(200).json({
      ok: true,
      endpoint: 'notificações do Mercado Livre',
      observacao: 'Nenhum tópico assinado — o app apenas consulta tarifas.',
    });
  }
  // POST: o Mercado Livre espera 200 rapidamente; nada a processar
  res.status(200).end();
}
