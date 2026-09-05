/* ══════════════════════════════════════════════════════════════════════════
   ANÚNCIOS — encaixar os preços calculados no arquivo do Mercado Livre

   O arquivo "Modifique seus anúncios" que o ML entrega NÃO cria anúncios: ele
   edita os que já existem. Cada linha traz o ITEM_ID (MLB…) que o ML usa para
   saber qual anúncio mexer — não dá para inventar esse código. Por isso o
   caminho é casar por SKU: o ML diz quais anúncios existem, o Precificador diz
   quanto cada SKU deve custar, e a gente escreve o preço novo na linha certa.

   O que este motor NÃO faz, de propósito:
   • não mexe em CONDITION, SHIPPING_METHOD, LISTING_TYPE nem STATUS. No arquivo
     do ML esses campos têm lista de valores válidos POR LINHA (um anúncio
     aceita "Novo,Recondicionado", o vizinho aceita "Novo,Usado,Recondicionado")
     — são específicos do anúncio e da categoria, e sobrescrever quebraria;
   • não cria linha nova. Produto sem anúncio no ML não tem onde entrar.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AnunciosEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {

/* A linha 1 traz os códigos técnicos e é por eles que achamos as colunas —
   nunca pela posição. O ML já mudou a ordem entre versões do arquivo. */
const OBRIGATORIAS = ['ITEM_ID', 'SKU', 'PRICE'];
const CONHECIDAS = ['FAMILY_ID','ITEM_ID','PRODUCT_NUMBER','VARIATION_ID','SKU','TITLE',
  'VARIATIONS','QUANTITY','PRICE','CURRENCY_ID','CONDITION','SHIPPING_METHOD',
  'LISTING_TYPE','FEE_PER_SALE','STATUS'];

/* Linhas 1 a 5 são cabeçalho do ML (códigos, grupos, rótulos, "Obrigatório",
   dicas). Os anúncios começam na 6 — em índice de array, 5. */
const INICIO_DADOS = 5;

const ABA_ML = 'Anúncios';

/* Variação que merece conferência antes de subir. Não é regra do Mercado
   Livre: é freio de mão. Um preço que triplica quase sempre é coluna trocada
   ou peso errado, e o estrago só aparece depois de publicado. */
const VARIACAO_ALERTA = 0.5;   // 50% para cima ou para baixo

const AVISOS = {
  sem_anuncio: {gravidade:'info', titulo:'Produto sem anúncio no Mercado Livre',
    descricao:'Estão na planilha de preços mas não existem como anúncio. Este arquivo só edita anúncios que já existem, então eles ficam de fora.',
    comoResolver:'Para vender esses produtos, crie o anúncio no Mercado Livre primeiro. Depois baixe o arquivo de novo e eles aparecerão aqui.'},
  sem_preco: {gravidade:'alerta', titulo:'Anúncio sem preço novo',
    descricao:'O SKU do anúncio não foi encontrado na planilha de preços. Estas linhas seguem com o preço que já estava no Mercado Livre.',
    comoResolver:'Confira se o SKU do anúncio é o mesmo da planilha. Diferença de espaço, maiúscula ou traço já impede o encontro.'},
  anuncio_sem_sku: {gravidade:'alerta', titulo:'Anúncio sem SKU',
    descricao:'Sem SKU não há como saber a que produto o anúncio corresponde.',
    comoResolver:'Preencha o SKU desse anúncio no Mercado Livre e baixe o arquivo de novo.'},
  sku_duplicado: {gravidade:'alerta', titulo:'SKU repetido na planilha de preços',
    descricao:'O mesmo SKU aparece mais de uma vez com preços diferentes. Foi usado o primeiro.',
    comoResolver:'Deixe um preço por SKU na planilha de origem — senão o preço que sobe é o da primeira linha, que pode não ser o que você quer.'},
  preco_invalido: {gravidade:'erro', titulo:'Preço novo inválido',
    descricao:'O preço calculado é zero, negativo ou não é número. Estas linhas seguem com o preço antigo.',
    comoResolver:'Volte à precificação e confira essas linhas: quase sempre é custo vazio ou margem que não fecha.'},
  variacao_alta: {gravidade:'alerta', titulo:'Preço muda muito',
    descricao:'O preço novo é mais de 50% diferente do que está no ar. Pode estar certo, mas confira antes de publicar.',
    comoResolver:'Veja as linhas e compare com o preço atual. Salto grande costuma ser peso ou custo errado na planilha de origem.'},
  preco_atual_zero: {gravidade:'info', titulo:'Anúncio estava sem preço',
    descricao:'O preço atual no Mercado Livre é zero. O preço novo vai preencher.',
    comoResolver:''},
};

/* ── leitura do arquivo do Mercado Livre ────────────────────────────────── */
function lerModelo(aoa) {
  const erros = [];
  if (!aoa || !aoa.length) return {ok:false, erros:['O arquivo está vazio.']};

  const cab = (aoa[0] || []).map(v => v == null ? '' : String(v).trim().toUpperCase());
  const idx = {};
  CONHECIDAS.forEach(c => { const i = cab.indexOf(c); if (i >= 0) idx[c] = i; });

  const faltando = OBRIGATORIAS.filter(c => idx[c] === undefined);
  if (faltando.length) {
    erros.push('Faltam as colunas ' + faltando.join(', ') +
      '. Este não parece o arquivo "Modifique seus anúncios" do Mercado Livre.');
    return {ok:false, erros, idx};
  }

  /* Conta os anúncios de verdade: linha com ITEM_ID preenchido. As de baixo
     costumam vir em branco até o fim da faixa que o Excel reservou. */
  let total = 0;
  for (let r = INICIO_DADOS; r < aoa.length; r++) {
    const L = aoa[r];
    if (L && L[idx.ITEM_ID] != null && String(L[idx.ITEM_ID]).trim() !== '') total++;
  }
  if (!total) erros.push('Nenhum anúncio encontrado a partir da linha 6.');

  return {ok: !erros.length, erros, idx, inicio: INICIO_DADOS, total};
}

/* ── índice de preços vindos do Precificador ────────────────────────────── */
function indexarPrecos(aoa, colSku, colPreco, linhaCabecalho) {
  const mapa = new Map();
  const duplicados = [];
  const inicio = (linhaCabecalho == null ? 0 : linhaCabecalho) + 1;

  for (let r = inicio; r < aoa.length; r++) {
    const L = aoa[r];
    if (!L) continue;
    const sku = L[colSku] == null ? '' : String(L[colSku]).trim();
    if (!sku) continue;
    const preco = numero(L[colPreco]);
    if (mapa.has(sku)) {
      /* só é conflito quando o preço difere: a mesma linha repetida com o
         mesmo valor não muda nada e não vale alarme */
      if (mapa.get(sku).preco !== preco) duplicados.push({sku, linha: r});
      continue;
    }
    mapa.set(sku, {preco, linha: r});
  }
  return {mapa, duplicados};
}

/* Aceita "1.234,56", "1234.56", "R$ 99,90" e número puro. */
function numero(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let s = String(v == null ? '' : v).replace(/[R$\s]/gi, '').trim();
  if (!s) return NaN;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}

/* ── o casamento ────────────────────────────────────────────────────────── */
function casar(aoa, modelo, precos, opcoes) {
  const o = Object.assign({variacaoAlerta: VARIACAO_ALERTA}, opcoes || {});
  const idx = modelo.idx;
  const linhas = [];
  const usados = new Set();

  for (let r = modelo.inicio; r < aoa.length; r++) {
    const L = aoa[r];
    if (!L) continue;
    const itemId = L[idx.ITEM_ID] == null ? '' : String(L[idx.ITEM_ID]).trim();
    if (!itemId) continue;                     // linha vazia da faixa do Excel

    const avisos = [];
    const sku = L[idx.SKU] == null ? '' : String(L[idx.SKU]).trim();
    const precoAtual = numero(L[idx.PRICE]);
    const titulo = idx.TITLE !== undefined && L[idx.TITLE] != null ? String(L[idx.TITLE]) : '';

    let precoNovo = null, variacao = null;
    if (!sku) {
      avisos.push('anuncio_sem_sku');
    } else {
      const achado = precos.mapa.get(sku);
      if (!achado) {
        avisos.push('sem_preco');
      } else {
        usados.add(sku);
        const p = achado.preco;
        if (isNaN(p) || p <= 0) {
          avisos.push('preco_invalido');
        } else {
          precoNovo = Math.round(p * 100) / 100;
          if (!isNaN(precoAtual) && precoAtual > 0) {
            variacao = (precoNovo - precoAtual) / precoAtual;
            if (Math.abs(variacao) > o.variacaoAlerta) avisos.push('variacao_alta');
          } else {
            avisos.push('preco_atual_zero');
          }
        }
      }
    }
    if (precos.duplicados.some(d => d.sku === sku)) avisos.push('sku_duplicado');

    linhas.push({fisica: r, itemId, sku, titulo, precoAtual, precoNovo, variacao, avisos});
  }

  /* produtos precificados que não têm anúncio: entram como informação, não
     como erro — não há nada a corrigir no arquivo por causa deles */
  const semAnuncio = [];
  precos.mapa.forEach((_, sku) => { if (!usados.has(sku)) semAnuncio.push(sku); });

  return {linhas, semAnuncio, conferencia: conferir(linhas, semAnuncio)};
}

function conferir(linhas, semAnuncio) {
  const ordem = {erro:0, alerta:1, info:2};
  const mapa = new Map();
  linhas.forEach((l, i) => (l.avisos || []).forEach(id => {
    if (!mapa.has(id)) mapa.set(id, []);
    mapa.get(id).push(i);
  }));

  const grupos = Array.from(mapa.entries()).map(([id, ii]) => {
    const a = AVISOS[id] || {gravidade:'info', titulo:id, descricao:''};
    return {id, gravidade:a.gravidade, titulo:a.titulo, descricao:a.descricao,
            comoResolver:a.comoResolver || '', n:ii.length, linhas:ii};
  });

  if (semAnuncio.length) {
    const a = AVISOS.sem_anuncio;
    grupos.push({id:'sem_anuncio', gravidade:a.gravidade, titulo:a.titulo,
      descricao:a.descricao, comoResolver:a.comoResolver,
      n:semAnuncio.length, linhas:[], soLeitura:true});
  }
  grupos.sort((x, y) => (ordem[x.gravidade] - ordem[y.gravidade]) || (y.n - x.n));

  const atualizados = linhas.filter(l => l.precoNovo != null).length;
  return {
    total: linhas.length,
    atualizados,
    intocados: linhas.length - atualizados,
    semAnuncio: semAnuncio.length,
    comErro: linhas.filter(l => l.avisos.some(id => (AVISOS[id]||{}).gravidade === 'erro')).length,
    variacao: resumoVariacao(linhas),
    grupos,
  };
}

/* O retrato do lote inteiro, não linha a linha. Numa carga real quase toda
   linha caiu em "preço muda muito", e um alerta que marca tudo não informa
   nada. O que decide se pode subir é a direção e o tamanho da mudança:
   "todos sobem, metade mais que dobra" é uma frase que o dono da loja
   entende e sobre a qual ele consegue decidir. */
function resumoVariacao(linhas) {
  const v = linhas.filter(l => l.variacao != null).map(l => l.variacao).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = p => v[Math.min(v.length - 1, Math.floor(v.length * p))];
  return {
    n: v.length,
    sobem: v.filter(x => x > 0).length,
    descem: v.filter(x => x < 0).length,
    iguais: v.filter(x => x === 0).length,
    mediana: q(0.5), p10: q(0.1), p90: q(0.9),
    min: v[0], max: v[v.length - 1],
  };
}

return {OBRIGATORIAS, CONHECIDAS, INICIO_DADOS, ABA_ML, AVISOS, VARIACAO_ALERTA,
        numero, lerModelo, indexarPrecos, casar, conferir, resumoVariacao};
});
