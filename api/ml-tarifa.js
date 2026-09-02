/* ══════════════════════════════════════════════════════════════════════════
   Tarifa real do Mercado Livre para um preço (e, se informada, categoria).

   GET /api/ml-tarifa?preco=188.19&categoria=MLB1132&logistica=drop_off&peso=1200

   Responde com a tarifa de cada tipo de anúncio, já com a redução por faixa
   de preço que o próprio Mercado Livre aplica:

   { "preco":188.19,
     "tarifas":{ "classico":{"percentual":13,"valor":24.46,"custoFixo":0},
                 "premium"  :{"percentual":18,"valor":33.87,"custoFixo":0} } }

   O client secret nunca chega ao navegador: fica só aqui, nas variáveis de
   ambiente da Vercel.
   ══════════════════════════════════════════════════════════════════════════ */

const TIPOS = {gold_special: 'classico', gold_pro: 'premium'};

/* O access token vale 6 h; guardamos em memória entre as invocações
   e renovamos pelo refresh token quando falta pouco para expirar. */
let cache = {token: null, expiraEm: 0};

async function pegarToken() {
  const agora = Date.now();
  if (cache.token && agora < cache.expiraEm - 60000) return cache.token;

  const clientId = process.env.ML_CLIENT_ID;
  const secret   = process.env.ML_CLIENT_SECRET;
  const refresh  = process.env.ML_REFRESH_TOKEN;
  if (!clientId || !secret || !refresh) {
    const faltando = [
      !clientId && 'ML_CLIENT_ID',
      !secret   && 'ML_CLIENT_SECRET',
      !refresh  && 'ML_REFRESH_TOKEN',
    ].filter(Boolean);
    const e = new Error('Faltam variáveis de ambiente: ' + faltando.join(', '));
    e.faltando = faltando;
    throw e;
  }

  const r = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: secret,
      refresh_token: refresh,
    }),
  });
  const dados = await r.json();
  if (!r.ok) throw new Error('Não consegui renovar o token: ' + (dados.message || r.status));

  cache = {token: dados.access_token, expiraEm: agora + (dados.expires_in || 21600) * 1000};
  return cache.token;
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 's-maxage=3600, stale-while-revalidate=86400');

  const preco = Number(String(req.query.preco || '').replace(',', '.'));
  if (!isFinite(preco) || preco <= 0)
    return res.status(400).json({erro: 'Informe ?preco= com um valor maior que zero.'});

  try {
    const token = await pegarToken();

    const q = new URLSearchParams({price: String(preco), currency_id: 'BRL'});
    if (req.query.categoria) q.set('category_id', String(req.query.categoria));
    if (req.query.logistica) { q.set('logistic_type', String(req.query.logistica)); q.set('shipping_mode', 'me2'); }
    if (req.query.peso)      q.set('billable_weight', String(req.query.peso));

    const r = await fetch('https://api.mercadolibre.com/sites/MLB/listing_prices?' + q, {
      headers: {Authorization: 'Bearer ' + token},
    });
    const lista = await r.json();
    if (!r.ok) return res.status(r.status).json({erro: lista.message || 'Erro na API do Mercado Livre', detalhe: lista});

    const tarifas = {};
    (Array.isArray(lista) ? lista : []).forEach(item => {
      const nome = TIPOS[item.listing_type_id];
      if (!nome) return;
      const d = item.sale_fee_details || {};
      tarifas[nome] = {
        percentual: d.percentage_fee ?? null,        // % da tarifa de venda
        valor: item.sale_fee_amount ?? null,         // quanto dá em reais
        custoFixo: d.fixed_fee ?? 0,                 // custo fixo por unidade
        percentualML: d.meli_percentage_fee ?? null,
      };
    });

    if (!Object.keys(tarifas).length)
      return res.status(404).json({erro: 'A API não retornou Clássico nem Premium para esse preço.', detalhe: lista});

    res.json({preco, categoria: req.query.categoria || null, tarifas, fonte: 'api.mercadolibre.com/sites/MLB/listing_prices'});
  } catch (e) {
    res.status(500).json({erro: e.message, faltando: e.faltando || null});
  }
}
