/* ══════════════════════════════════════════════════════════════════════════
   Pesquisa de mercado no Mercado Livre — o que não é preço, mas ajuda a
   decidir o que vender e como anunciar.

   GET /api/ml-mercado?acao=tendencias        o que estão procurando agora
   GET /api/ml-mercado?acao=categorias        categorias raiz do site
   GET /api/ml-mercado?acao=categorias&id=…   filhas de uma categoria
   GET /api/ml-mercado?acao=produto&q=…       categoria, tarifa e exigências
                                              de um produto pelo título
   GET /api/ml-mercado?acao=envios            modalidades de envio do site

   Tudo por Client Credentials: não exige que ninguém faça login.
   ══════════════════════════════════════════════════════════════════════════ */

let cache = {token: null, expiraEm: 0};

async function pegarToken() {
  const agora = Date.now();
  if (cache.token && agora < cache.expiraEm - 60000) return cache.token;

  const clientId = process.env.ML_CLIENT_ID, secret = process.env.ML_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error('Faltam ML_CLIENT_ID e ML_CLIENT_SECRET no servidor.');

  const r = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'client_credentials', client_id: clientId, client_secret: secret}),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error(d.message || d.error || 'Credenciais recusadas.');
  cache = {token: d.access_token, expiraEm: agora + (d.expires_in || 21600) * 1000};
  return cache.token;
}

async function ml(url, token) {
  const r = await fetch(url, {headers: {Authorization: 'Bearer ' + token}});
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

/* preço usado quando o visitante não informa nenhum: só serve para o ML
   escolher a faixa e devolver o percentual — o valor em reais não é usado */
const PRECO_SONDA = 100;

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');

  const acao = String(req.query.acao || 'tendencias');
  let token;
  try { token = await pegarToken(); }
  catch (e) { return res.status(503).json({erro: e.message}); }

  try {
    if (acao === 'tendencias') {
      res.setHeader('cache-control', 's-maxage=1800, stale-while-revalidate=86400');
      const cat = req.query.categoria ? '/' + encodeURIComponent(String(req.query.categoria)) : '';
      const d = await ml('https://api.mercadolibre.com/trends/MLB' + cat, token);
      if (!Array.isArray(d)) return res.status(502).json({erro: 'O Mercado Livre não devolveu as tendências.'});
      return res.json({termos: d.slice(0, 40).map((t, i) => ({posicao: i + 1, termo: t.keyword, url: t.url}))});
    }

    if (acao === 'categorias') {
      res.setHeader('cache-control', 's-maxage=86400, stale-while-revalidate=604800');
      const id = req.query.id ? String(req.query.id) : null;
      if (!id) {
        const d = await ml('https://api.mercadolibre.com/sites/MLB/categories', token);
        if (!Array.isArray(d)) return res.status(502).json({erro: 'Não consegui ler as categorias.'});
        return res.json({caminho: [], filhas: d.map(c => ({id: c.id, nome: c.name, folha: false}))});
      }
      const d = await ml('https://api.mercadolibre.com/categories/' + encodeURIComponent(id), token);
      if (!d) return res.status(404).json({erro: 'Categoria não encontrada.'});
      return res.json({
        id: d.id, nome: d.name,
        caminho: (d.path_from_root || []).map(c => ({id: c.id, nome: c.name})),
        filhas: (d.children_categories || []).map(c => ({id: c.id, nome: c.name})),
        totalItens: d.total_items_in_this_category ?? null,
      });
    }

    if (acao === 'envios') {
      res.setHeader('cache-control', 's-maxage=86400, stale-while-revalidate=604800');
      const d = await ml('https://api.mercadolibre.com/sites/MLB/shipping_methods', token);
      if (!Array.isArray(d)) return res.status(502).json({erro: 'Não consegui ler os métodos de envio.'});
      return res.json({metodos: d.map(m => ({
        id: m.id, nome: m.name, tipo: m.type, entregaEm: m.deliver_to,
        ativo: m.status === 'active', freeOption: !!m.free_options_allowed,
      }))});
    }

    if (acao === 'produto') {
      const q = String(req.query.q || '').trim();
      if (!q) return res.status(400).json({erro: 'Informe ?q= com o título do produto.'});
      res.setHeader('cache-control', 's-maxage=3600, stale-while-revalidate=86400');

      const preco = Number(String(req.query.preco || PRECO_SONDA).replace(',', '.')) || PRECO_SONDA;

      const achados = await ml(
        'https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=4&q=' + encodeURIComponent(q), token);
      if (!Array.isArray(achados) || !achados.length)
        return res.json({q, achou: false, sugestoes: []});

      /* a primeira sugestão vem completa: tarifa e o que a categoria exige */
      const p = achados[0];
      const [precos, atributos] = await Promise.all([
        ml('https://api.mercadolibre.com/sites/MLB/listing_prices?currency_id=BRL&price=' + preco
           + '&category_id=' + encodeURIComponent(p.category_id), token),
        ml('https://api.mercadolibre.com/categories/' + encodeURIComponent(p.category_id) + '/attributes', token),
      ]);

      const tarifas = {};
      (Array.isArray(precos) ? precos : []).forEach(x => {
        const nome = x.listing_type_id === 'gold_special' ? 'classico'
                   : x.listing_type_id === 'gold_pro'     ? 'premium' : null;
        if (nome && x.sale_fee_details) tarifas[nome] = x.sale_fee_details.percentage_fee ?? null;
      });

      const obrig = (Array.isArray(atributos) ? atributos : [])
        .filter(a => a.tags && (a.tags.required || a.tags.catalog_required))
        .map(a => ({id: a.id, nome: a.name}));

      return res.json({
        q, achou: true, preco,
        categoria: {id: p.category_id, nome: p.category_name,
                    dominio: p.domain_id, dominioNome: p.domain_name},
        tarifas, obrigatorios: obrig,
        totalAtributos: Array.isArray(atributos) ? atributos.length : null,
        sugestoes: achados.slice(1).map(x => ({id: x.category_id, nome: x.category_name,
                                               dominioNome: x.domain_name})),
      });
    }

    return res.status(400).json({erro: 'Ação desconhecida. Use tendencias, categorias, produto ou envios.'});
  } catch (e) {
    return res.status(500).json({erro: String(e.message || e)});
  }
}
