/* ══════════════════════════════════════════════════════════════════════════
   Lista os anúncios da conta, direto do Mercado Livre.

   Substitui o passo de baixar a planilha "Editar em massa" e subir aqui: o
   que interessa daquele arquivo é o ITEM_ID de cada SKU, e isso a API entrega.

   Vem em páginas de propósito. Uma conta com milhares de anúncios não cabe
   numa função serverless de 10 segundos — a tela chama de novo com o
   `scroll` que devolvemos até acabar.
   ══════════════════════════════════════════════════════════════════════════ */
import {tokenDoVendedor, idDoVendedor, responderErro} from './_ml-token.js';
import {mesmaOrigem, limitar, exigirChave} from './_guarda.js';

const POR_PAGINA = 100;   // teto do search do ML
const LOTE_DETALHE = 20;  // teto do multiget /items?ids=

/* ── peso e medidas do anúncio ────────────────────────────────────────────
   O Mercado Livre guarda isso nos atributos de embalagem, e em formatos que
   variam: ora um value_struct {number, unit}, ora um texto "500 g". A unidade
   importa mais que o número — ler 500 g como 500 kg estoura o frete e o preço
   sai errado, então sem unidade reconhecida a gente devolve nada em vez de
   chutar. Alguns anúncios trazem tudo junto em shipping.dimensions, no
   formato "altura x largura x comprimento, peso" (cm e gramas).             */
const PESO_EM_KG = {kg: 1, kgs: 1, quilo: 1, quilos: 1, g: 0.001, gr: 0.001, grama: 0.001, gramas: 0.001, mg: 0.000001, lb: 0.4536, oz: 0.02835};
const CM_POR = {cm: 1, mm: 0.1, m: 100, in: 2.54, '"': 2.54};

function medida(attr, tabela) {
  if (!attr) return null;

  const st = attr.value_struct;
  if (st && typeof st.number === 'number' && st.unit) {
    const fator = tabela[String(st.unit).toLowerCase().trim()];
    if (fator) return st.number * fator;
  }

  /* texto solto: "500 g", "1,5 kg", "30 cm" */
  const txt = String(attr.value_name || attr.value_id || '').trim().toLowerCase();
  const m = txt.match(/^([\d.,]+)\s*([a-z"]+)$/);
  if (!m) return null;
  /* "1.250,5" — o ponto é separador de milhar, a vírgula é o decimal */
  const n = Number(m[1].replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  const fator = tabela[m[2]];
  return isFinite(n) && fator ? n * fator : null;
}

function achaAttr(item, id) {
  const busca = lista => (lista || []).find(a => a && a.id === id);
  return busca(item.attributes)
    || (item.variations || []).map(v => busca(v.attributes)).find(Boolean)
    || null;
}

export function envioDe(item) {
  const out = {pesoKg: null, alturaCm: null, larguraCm: null, comprimentoCm: null};

  const p = medida(achaAttr(item, 'PACKAGE_WEIGHT'), PESO_EM_KG);
  if (p != null && p > 0) out.pesoKg = p;
  out.alturaCm      = medida(achaAttr(item, 'PACKAGE_HEIGHT'), CM_POR);
  out.larguraCm     = medida(achaAttr(item, 'PACKAGE_WIDTH'),  CM_POR);
  out.comprimentoCm = medida(achaAttr(item, 'PACKAGE_LENGTH'), CM_POR);

  /* "30x20x10,500" — as três medidas em cm e o peso em gramas */
  const dim = item.shipping && item.shipping.dimensions;
  if (dim && (out.pesoKg == null || out.alturaCm == null)) {
    const m = String(dim).match(/^\s*([\d.]+)\s*x\s*([\d.]+)\s*x\s*([\d.]+)\s*,\s*([\d.]+)\s*$/i);
    if (m) {
      if (out.alturaCm == null)      out.alturaCm      = Number(m[1]) || null;
      if (out.larguraCm == null)     out.larguraCm     = Number(m[2]) || null;
      if (out.comprimentoCm == null) out.comprimentoCm = Number(m[3]) || null;
      if (out.pesoKg == null) {
        const g = Number(m[4]);
        if (isFinite(g) && g > 0) out.pesoKg = g / 1000;
      }
    }
  }
  return out;
}

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
  if (!mesmaOrigem(req, res) || !limitar(req, res) || !exigirChave(req, res)) return;

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
        + '&attributes=id,title,price,status,available_quantity,seller_custom_field,attributes,variations,shipping';
      const rr = await fetch(u, {headers: {Authorization: 'Bearer ' + token}});
      const dd = await rr.json().catch(() => []);
      (Array.isArray(dd) ? dd : []).forEach(linha => {
        if (!linha || linha.code !== 200 || !linha.body) return;
        const it = linha.body;
        const envio = envioDe(it);
        itens.push({
          id: it.id,
          sku: skuDe(it),
          titulo: it.title || '',
          pesoKg: envio.pesoKg,
          alturaCm: envio.alturaCm,
          larguraCm: envio.larguraCm,
          comprimentoCm: envio.comprimentoCm,
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
