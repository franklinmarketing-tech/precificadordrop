/* ══════════════════════════════════════════════════════════════════════════
   Descobre categoria e tarifa real de vários produtos de uma vez.

   POST /api/ml-lote
   { "itens": [ {"i":0, "titulo":"Fone Bluetooth TWS", "preco":89.9}, … ] }

   Responde, para cada item: a categoria que o Mercado Livre reconhece pelo
   título, a tarifa real dessa categoria (Clássico e Premium) e os atributos
   que a categoria exige — Marca, Modelo e afins.

   ── Por que o cache é por categoria + FAIXA de preço ──────────────────────
   O percentual não é fixo por categoria: o Mercado Livre aplica uma redução
   entre R$ 150 e R$ 700 em parte das categorias. Verificado em Cofrinhos
   (MLB270405): 11,5% até R$ 60, 10,5% em R$ 150 e R$ 500, 11,5% de volta em
   R$ 2.000. Em Celulares (MLB1051) fica 13% em toda a escala.

   Por isso a chave do cache é categoria+faixa, e o preço consultado é o de um
   item real daquela faixa — o percentual vem do ML, nunca de suposição nossa.
   ══════════════════════════════════════════════════════════════════════════ */

const MAX_ITENS   = 80;   // por requisição; o navegador manda em blocos
const PARALELO    = 6;    // chamadas simultâneas ao ML
const FAIXA_DE    = 150;  // início da redução por faixa
const FAIXA_ATE   = 700;  // fim da redução

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

/* roda as tarefas em pequenos lotes, para não estourar o limite do ML */
async function emLotes(tarefas, tamanho) {
  const saida = [];
  for (let i = 0; i < tarefas.length; i += tamanho)
    saida.push(...await Promise.all(tarefas.slice(i, i + tamanho).map(f => f())));
  return saida;
}

const faixaDe = preco => preco < FAIXA_DE ? 'a' : (preco <= FAIXA_ATE ? 'b' : 'c');

/* normaliza o título: tira acento, pontuação e repetição de espaço, para que
   dois produtos com o mesmo nome não gastem duas consultas */
const chaveTitulo = t => String(t || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')   // tira acento
  .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

async function buscar(url, token) {
  const r = await fetch(url, {headers: {Authorization: 'Bearer ' + token}});
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  if (req.method !== 'POST')
    return res.status(405).json({erro: 'Use POST com {itens:[{i,titulo,preco}]}.'});

  let corpo = req.body;
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch { corpo = null; } }
  const itens = corpo && Array.isArray(corpo.itens) ? corpo.itens : null;
  if (!itens || !itens.length)
    return res.status(400).json({erro: 'Envie {itens:[{i,titulo,preco}]} com pelo menos um item.'});
  if (itens.length > MAX_ITENS)
    return res.status(400).json({erro: `No máximo ${MAX_ITENS} itens por chamada.`, max: MAX_ITENS});

  let token;
  try { token = await pegarToken(); }
  catch (e) { return res.status(503).json({erro: e.message}); }

  const t0 = Date.now();

  /* ── 1. título → categoria, uma consulta por título distinto ─────────── */
  const titulos = new Map();                        // chave normalizada → resultado
  itens.forEach(it => { const k = chaveTitulo(it.titulo); if (k) titulos.set(k, null); });

  const chaves = [...titulos.keys()];
  const achados = await emLotes(chaves.map(k => async () => {
    const d = await buscar(
      'https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=1&q=' + encodeURIComponent(k), token);
    const p = Array.isArray(d) && d[0];
    return p && p.category_id
      ? {categoria: p.category_id, categoriaNome: p.category_name || null,
         dominio: p.domain_id || null, dominioNome: p.domain_name || null}
      : null;
  }), PARALELO);
  chaves.forEach((k, i) => titulos.set(k, achados[i]));

  /* ── 2. tarifa por categoria + faixa de preço ────────────────────────── */
  const precisa = new Map();     // "categoria|faixa" → preço representativo real
  itens.forEach(it => {
    const c = titulos.get(chaveTitulo(it.titulo));
    const preco = Number(it.preco);
    if (!c || !isFinite(preco) || preco <= 0) return;
    const k = c.categoria + '|' + faixaDe(preco);
    if (!precisa.has(k)) precisa.set(k, preco);      // preço de um item de verdade
  });

  const combos = [...precisa.entries()];
  const tarifas = await emLotes(combos.map(([k, preco]) => async () => {
    const cat = k.split('|')[0];
    const d = await buscar('https://api.mercadolibre.com/sites/MLB/listing_prices?currency_id=BRL'
      + '&price=' + preco + '&category_id=' + encodeURIComponent(cat), token);
    if (!Array.isArray(d)) return [k, null];
    const t = {};
    d.forEach(x => {
      const nome = x.listing_type_id === 'gold_special' ? 'classico'
                 : x.listing_type_id === 'gold_pro'     ? 'premium' : null;
      if (nome && x.sale_fee_details) t[nome] = x.sale_fee_details.percentage_fee ?? null;
    });
    return [k, (t.classico != null || t.premium != null) ? t : null];
  }), PARALELO);
  const porCombo = new Map(tarifas);

  /* ── 3. atributos obrigatórios, uma consulta por categoria ───────────── */
  const cats = [...new Set([...titulos.values()].filter(Boolean).map(c => c.categoria))];
  const attrs = await emLotes(cats.map(cat => async () => {
    const d = await buscar('https://api.mercadolibre.com/categories/' + encodeURIComponent(cat) + '/attributes', token);
    if (!Array.isArray(d)) return [cat, null];
    const obrig = d.filter(a => a.tags && (a.tags.required || a.tags.catalog_required))
                   .map(a => ({id: a.id, nome: a.name}));
    return [cat, obrig];
  }), PARALELO);
  const porCategoria = new Map(attrs);

  /* ── 4. junta tudo de volta na ordem que chegou ──────────────────────── */
  const resultados = itens.map(it => {
    const c = titulos.get(chaveTitulo(it.titulo));
    if (!c) return {i: it.i, achou: false};
    const preco = Number(it.preco);
    const t = isFinite(preco) && preco > 0
      ? porCombo.get(c.categoria + '|' + faixaDe(preco)) : null;
    return {
      i: it.i, achou: true,
      categoria: c.categoria, categoriaNome: c.categoriaNome,
      dominio: c.dominio, dominioNome: c.dominioNome,
      classico: t ? t.classico : null,
      premium:  t ? t.premium  : null,
      obrigatorios: porCategoria.get(c.categoria) || null,
    };
  });

  res.json({
    resultados,
    resumo: {
      itens: itens.length,
      titulosConsultados: chaves.length,
      tarifasConsultadas: combos.length,
      categoriasConsultadas: cats.length,
      semCategoria: resultados.filter(r => !r.achou).length,
      ms: Date.now() - t0,
    },
  });
}
