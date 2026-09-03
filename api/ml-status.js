/* ══════════════════════════════════════════════════════════════════════════
   Diagnóstico da integração com o Mercado Livre.

   GET /api/ml-status            → só o estado da conexão
   GET /api/ml-status?sondar=1   → também bate em cada endpoint e diz se responde

   Serve ao painel "Integração" do hub: em vez de afirmar que está conectado,
   a tela mostra o que foi verificado agora. O client secret não sai daqui.
   ══════════════════════════════════════════════════════════════════════════ */

let cache = {token: null, expiraEm: 0, via: null};

async function pegarToken() {
  const agora = Date.now();
  if (cache.token && agora < cache.expiraEm - 60000) return cache.token;

  const clientId = process.env.ML_CLIENT_ID;
  const secret   = process.env.ML_CLIENT_SECRET;
  if (!clientId || !secret) {
    const e = new Error('Faltam ML_CLIENT_ID e/ou ML_CLIENT_SECRET nas variáveis de ambiente.');
    e.semCredencial = true;
    throw e;
  }

  const r = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'client_credentials', client_id: clientId, client_secret: secret}),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token)
    throw new Error(d.message || d.error || 'O Mercado Livre recusou as credenciais.');

  cache = {token: d.access_token, expiraEm: agora + (d.expires_in || 21600) * 1000,
           via: 'client_credentials', escopos: d.scope || ''};
  return cache.token;
}

/* Cada sonda é um endpoint real que o hub usa (ou pode usar). O painel mostra
   o resultado desta chamada, não uma promessa. */
const SONDAS = [
  {chave: 'tarifa',    nome: 'Comissão por categoria',
   url: 'https://api.mercadolibre.com/sites/MLB/listing_prices?price=100&currency_id=BRL&category_id=MLB1051',
   usa: 'A tarifa real de venda, Clássico e Premium, na categoria do produto.'},
  {chave: 'categorias', nome: 'Árvore de categorias',
   url: 'https://api.mercadolibre.com/sites/MLB/categories',
   usa: 'As categorias do site, para escolher a certa em cada produto.'},
  {chave: 'descobrir', nome: 'Categoria pelo título',
   url: 'https://api.mercadolibre.com/sites/MLB/domain_discovery/search?q=fone%20de%20ouvido%20bluetooth',
   usa: 'Adivinha a categoria a partir do título — permite achar a tarifa certa sem você escolher à mão.'},
  {chave: 'atributos', nome: 'Atributos obrigatórios',
   url: 'https://api.mercadolibre.com/categories/MLB1051/attributes',
   usa: 'O que a categoria exige (Marca, Modelo…) antes de o anúncio ser aceito.'},
  {chave: 'tendencias', nome: 'Tendências de busca',
   url: 'https://api.mercadolibre.com/trends/MLB',
   usa: 'O que as pessoas mais procuram no site agora.'},
  {chave: 'envios',    nome: 'Métodos de envio',
   url: 'https://api.mercadolibre.com/sites/MLB/shipping_methods',
   usa: 'Modalidades de envio disponíveis no site.'},
  {chave: 'busca',     nome: 'Busca de anúncios',
   url: 'https://api.mercadolibre.com/sites/MLB/search?q=fone&limit=1',
   usa: 'Preço da concorrência. Exige autorização de um usuário — não abre com a chave da aplicação.'},
];

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 's-maxage=300, stale-while-revalidate=3600');

  const base = {
    verificadoEm: new Date().toISOString(),
    credencial: {
      clientId: !!process.env.ML_CLIENT_ID,
      clientSecret: !!process.env.ML_CLIENT_SECRET,
      refreshToken: !!process.env.ML_REFRESH_TOKEN,
    },
  };

  let token;
  try {
    token = await pegarToken();
  } catch (e) {
    return res.status(200).json({...base, conectado: false, erro: e.message,
      semCredencial: !!e.semCredencial, sondas: []});
  }

  const conectado = {...base, conectado: true, autenticacao: cache.via,
    escopos: (cache.escopos || '').split(' ').filter(Boolean).length,
    tokenExpiraEm: new Date(cache.expiraEm).toISOString()};

  if (!req.query.sondar) return res.json({...conectado, sondas: []});

  const sondas = await Promise.all(SONDAS.map(async s => {
    const t0 = Date.now();
    try {
      const r = await fetch(s.url, {headers: {Authorization: 'Bearer ' + token}});
      let itens = null;
      try {
        const corpo = await r.json();
        itens = Array.isArray(corpo) ? corpo.length : (corpo && typeof corpo === 'object' ? 1 : null);
      } catch { /* resposta sem JSON: só o status importa */ }
      return {chave: s.chave, nome: s.nome, usa: s.usa, status: r.status,
              ok: r.ok, itens, ms: Date.now() - t0};
    } catch (e) {
      return {chave: s.chave, nome: s.nome, usa: s.usa, status: 0, ok: false,
              erro: String(e.message || e), ms: Date.now() - t0};
    }
  }));

  res.json({...conectado, sondas});
}
