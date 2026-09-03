/* ══════════════════════════════════════════════════════════════════════════
   Pesquisa de mercado no Mercado Livre — o que não é preço, mas ajuda a
   decidir o que vender e como anunciar.

   GET /api/ml-mercado?acao=tendencias        o que estão procurando agora
   GET /api/ml-mercado?acao=categorias        categorias raiz do site
   GET /api/ml-mercado?acao=categorias&id=…   filhas de uma categoria
   GET /api/ml-mercado?acao=produto&q=…       categoria, tarifa e exigências
                                              de um produto pelo título
   GET /api/ml-mercado?acao=envios            modalidades de envio do site
   GET /api/ml-mercado?acao=campeoes&id=…     mais vendidos de uma categoria
   GET /api/ml-mercado?acao=ficha&q=…         o que o anúncio exige, e uma
                                              referência de ficha preenchida

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


    if (acao === 'campeoes') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({erro: 'Informe ?id= com a categoria.'});
      res.setHeader('cache-control', 's-maxage=3600, stale-while-revalidate=86400');

      const lista = await ml('https://api.mercadolibre.com/highlights/MLB/category/'
        + encodeURIComponent(id), token);
      const conteudo = (lista && Array.isArray(lista.content)) ? lista.content : [];
      const produtos = conteudo.filter(c => c.type === 'PRODUCT').slice(0, 12);
      if (!produtos.length) return res.json({id, campeoes: [], tipo: lista && lista.query_data && lista.query_data.highlight_type});

      /* o highlight devolve só ids; o nome e a ficha vêm do catálogo */
      const detalhes = [];
      for (let i = 0; i < produtos.length; i += 6) {
        detalhes.push(...await Promise.all(produtos.slice(i, i + 6).map(async c => {
          const d = await ml('https://api.mercadolibre.com/products/' + encodeURIComponent(c.id), token);
          if (!d) return {id: c.id, posicao: c.position, nome: null};
          const at = (d.attributes || []).filter(a => a.value_name);
          return {
            id: c.id, posicao: c.position, nome: d.name || null,
            dominio: d.domain_id || null,
            foto: (d.pictures && d.pictures[0] && d.pictures[0].url) || null,
            marca: (at.find(a => a.id === 'BRAND') || {}).value_name || null,
            atributos: at.length,
          };
        })));
      }
      detalhes.sort((a, b) => (a.posicao || 99) - (b.posicao || 99));
      return res.json({id, tipo: lista.query_data && lista.query_data.highlight_type, campeoes: detalhes});
    }

    if (acao === 'ficha') {
      const q = String(req.query.q || '').trim();
      if (!q) return res.status(400).json({erro: 'Informe ?q= com o título do produto.'});
      res.setHeader('cache-control', 's-maxage=3600, stale-while-revalidate=86400');

      const achados = await ml(
        'https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=1&q=' + encodeURIComponent(q), token);
      const p = Array.isArray(achados) && achados[0];
      if (!p || !p.category_id) return res.json({q, achou: false});

      const [atributos, termos, catalogo] = await Promise.all([
        ml('https://api.mercadolibre.com/categories/' + encodeURIComponent(p.category_id) + '/attributes', token),
        ml('https://api.mercadolibre.com/categories/' + encodeURIComponent(p.category_id) + '/sale_terms', token),
        ml('https://api.mercadolibre.com/products/search?site_id=MLB&limit=1&q=' + encodeURIComponent(q), token),
      ]);

      const obrig = (Array.isArray(atributos) ? atributos : [])
        .filter(a => a.tags && (a.tags.required || a.tags.catalog_required))
        .map(a => ({id: a.id, nome: a.name, tipo: a.value_type || null,
                    valores: (a.values || []).slice(0, 8).map(v => v.name)}));

      /* condições que a categoria exige além dos atributos — garantia e afins */
      const vendaObrig = (Array.isArray(termos) ? termos : [])
        .filter(t => t.tags && t.tags.required && !(t.tags && t.tags.hidden))
        .map(t => ({id: t.id, nome: t.name,
                    valores: (t.values || []).slice(0, 6).map(v => v.name)}));

      /* Uma referência: como um produto PARECIDO preencheu a ficha. Não é o
         produto do usuário — a marca ali é de outra empresa. Vai como
         referência para conferir, nunca como preenchimento automático. */
      let referencia = null;
      const achado = catalogo && Array.isArray(catalogo.results) && catalogo.results[0];
      if (achado && achado.id) {
        const d = await ml('https://api.mercadolibre.com/products/' + encodeURIComponent(achado.id), token);
        if (d) {
          const preenchidos = (d.attributes || []).filter(a => a.value_name);
          referencia = {
            nome: d.name || null,
            campos: preenchidos.map(a => ({id: a.id, nome: a.name, valor: a.value_name})).slice(0, 14),
          };
        }
      }

      return res.json({
        q, achou: true,
        categoria: {id: p.category_id, nome: p.category_name, dominioNome: p.domain_name},
        obrigatorios: obrig,
        condicoesVenda: vendaObrig,
        totalAtributos: Array.isArray(atributos) ? atributos.length : null,
        referencia,
      });
    }

    return res.status(400).json({erro: 'Ação desconhecida. Use tendencias, categorias, produto, envios, campeoes ou ficha.'});
  } catch (e) {
    return res.status(500).json({erro: String(e.message || e)});
  }
}
