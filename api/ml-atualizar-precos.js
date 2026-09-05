/* ══════════════════════════════════════════════════════════════════════════
   Muda o preço de anúncios que já estão no ar.

   Este é o único endpoint do projeto que ESCREVE na loja de alguém. O preço
   muda na hora, para quem estiver olhando o anúncio, e não há desfazer do
   lado do Mercado Livre. Por isso:

   • só POST — link aberto por engano não dispara nada;
   • no máximo 50 por chamada. A tela chama em lotes e vai mostrando; se algo
     estiver errado, o estrago para no primeiro lote em vez de varrer a loja;
   • devolve o resultado item a item, com o preço anterior. É o que permite
     conferir depois — e voltar atrás, se for o caso.
   ══════════════════════════════════════════════════════════════════════════ */
import {tokenDoVendedor, responderErro} from './_ml-token.js';

const MAX_LOTE = 50;

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({erro: 'Use POST. Este endpoint muda preço de anúncio no ar.'});

  try {
    const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const itens = Array.isArray(corpo.itens) ? corpo.itens : [];

    if (!itens.length)
      return res.status(400).json({erro: 'Nenhum item recebido.'});
    if (itens.length > MAX_LOTE)
      return res.status(400).json({erro: `No máximo ${MAX_LOTE} anúncios por vez. Vieram ${itens.length}.`});

    /* valida tudo ANTES de mandar qualquer coisa: melhor recusar o lote
       inteiro do que atualizar metade e parar no meio */
    for (const it of itens) {
      if (!it || typeof it.id !== 'string' || !/^MLB\d+$/i.test(it.id))
        return res.status(400).json({erro: `Código de anúncio inválido: ${it && it.id}`});
      const p = Number(it.preco);
      if (!isFinite(p) || p <= 0)
        return res.status(400).json({erro: `Preço inválido em ${it.id}: ${it && it.preco}`});
    }

    const token = await tokenDoVendedor();
    const resultados = [];

    for (const it of itens) {
      const preco = Math.round(Number(it.preco) * 100) / 100;
      try {
        const r = await fetch('https://api.mercadolibre.com/items/' + it.id, {
          method: 'PUT',
          headers: {Authorization: 'Bearer ' + token, 'content-type': 'application/json'},
          body: JSON.stringify({price: preco}),
        });
        const d = await r.json().catch(() => ({}));
        resultados.push(r.ok
          ? {id: it.id, ok: true, preco: d.price != null ? d.price : preco}
          : {id: it.id, ok: false, erro: d.message || ('HTTP ' + r.status),
             detalhe: (d.cause && d.cause[0] && d.cause[0].message) || ''});
      } catch (e) {
        resultados.push({id: it.id, ok: false, erro: e && e.message ? e.message : String(e)});
      }
    }

    res.setHeader('cache-control', 'no-store');
    res.status(200).json({
      enviados: itens.length,
      atualizados: resultados.filter(x => x.ok).length,
      falharam: resultados.filter(x => !x.ok).length,
      resultados,
    });
  } catch (e) {
    responderErro(res, e);
  }
}
