/* ══════════════════════════════════════════════════════════════════════════
   Lista os anúncios da conta, direto do Mercado Livre.

   Substitui o passo de baixar a planilha "Editar em massa" e subir aqui: o
   que interessa daquele arquivo é o ITEM_ID de cada SKU, e isso a API entrega.

   Vem em páginas de propósito. Uma conta com milhares de anúncios não cabe
   numa função serverless de 10 segundos — a tela chama de novo com o
   `scroll` que devolvemos até acabar.
   ══════════════════════════════════════════════════════════════════════════ */
import {tokenDoVendedor, idDoVendedor, responderErro} from './_ml-token.js';

const POR_PAGINA = 100;   // teto do search do ML
const LOTE_DETALHE = 20;  // teto do multiget /items?ids=

/* O SKU pode estar em dois lugares, e varia por como o anúncio foi criado. */
function skuDe(item) {
  if (item.seller_custom_field) return String(item.seller_custom_field).trim();
  const attrs = item.attributes || [];
  for (const a of attrs) {
    if (a.id === 'SELLER_SKU' && a.value_name) return String(a.value_name).trim();
  }
  const v = item.variations || [];
  for (const x of v) {
    if (x.seller_custom_field) return String(x.seller_custom_field).trim();
  }
  return '';
}

export default async function handler(req, res) {
  try {
    const token = await tokenDoVendedor();
    const uid = await idDoVendedor(token);
    const scroll = req.query.scroll ? String(req.query.scroll) : '';

    /* search_type=scan é o único caminho para passar de 1.000 anúncios */
    const url = new URL(`https://api.mercadolibre.com/users/${uid}/items/search`);
    url.searchParams.set('search_type', 'scan');
    url.searchParams.set('limit', String(POR_PAGINA));
    if (scroll) url.searchParams.set('scroll_id', scroll);

    const r = await fetch(url, {headers: {Authorization: 'Bearer ' + token}});
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json({
        erro: d.message || 'O Mercado Livre recusou a consulta aos anúncios.',
        detalhe: d.error || '',
        precisaAutorizar: r.status === 401 || r.status === 403,
      });
    }

    const ids = d.results || [];
    const itens = [];

    /* multiget: 20 por vez, e só os campos que a tela usa */
    for (let i = 0; i < ids.length; i += LOTE_DETALHE) {
      const fatia = ids.slice(i, i + LOTE_DETALHE);
      const u = 'https://api.mercadolibre.com/items?ids=' + fatia.join(',')
        + '&attributes=id,title,price,status,available_quantity,seller_custom_field,attributes,variations';
      const rr = await fetch(u, {headers: {Authorization: 'Bearer ' + token}});
      const dd = await rr.json().catch(() => []);
      (Array.isArray(dd) ? dd : []).forEach(linha => {
        if (!linha || linha.code !== 200 || !linha.body) return;
        const it = linha.body;
        itens.push({
          id: it.id,
          sku: skuDe(it),
          titulo: it.title || '',
          preco: typeof it.price === 'number' ? it.price : null,
          estoque: typeof it.available_quantity === 'number' ? it.available_quantity : null,
          situacao: it.status || '',
        });
      });
    }

    res.setHeader('cache-control', 'no-store');
    res.status(200).json({
      total: d.paging ? d.paging.total : null,
      scroll: d.scroll_id || '',
      acabou: !d.scroll_id || ids.length === 0,
      itens,
    });
  } catch (e) {
    responderErro(res, e);
  }
}
