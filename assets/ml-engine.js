/* ══════════════════════════════════════════════════════════════════════════
   Precificador Drop — motor de precificação do Mercado Livre

   Segue a mesma conta da planilha "Precificação - Mercado Livre":

     Receita líquida     = Preço − comissão − taxa fixa − frete + rebate
     Margem contribuição = Receita líquida − custo do produto
     Lucro líquido       = Margem contribuição − imposto − perdas − embalagem
     Margem líquida      = Lucro líquido ÷ Preço

   O frete sai das tabelas oficiais do Mercado Livre por reputação, peso e
   faixa de preço (assets/ml-fretes.js).
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(
    typeof require === 'function' ? require('./ml-fretes.js') : null);
  else root.MLEngine = factory(root.MLFretes);
})(typeof self !== 'undefined' ? self : this, function (MLFretes) {
'use strict';

/* ── parâmetros (todos editáveis na interface) ───────────────────────────── */
const PADRAO = {
  versao: 6,                     // sobe quando os padrões mudam, para migrar o que está salvo
  reputacao: 'verde',            // verde | amarela | vermelha
  tipoAnuncio: 'classico',       // classico | premium
  // tarifa de venda por categoria: Clássico entre 10% e 14%, Premium entre 15% e 19%
  comissaoClassico: 0.13,
  comissaoPremium: 0.18,
  /* Categorias selecionadas entre R$ 150 e R$ 700 têm redução na tarifa,
     em pontos percentuais (ex.: 15% com redução de 3pp vira 12%).
     Quanto é a redução depende da categoria — por isso vem em branco. */
  reducaoDe: 150,
  reducaoAte: 700,
  reducaoPP: 0,
  /* Custo fixo por unidade, conforme a tabela oficial do Mercado Livre.
     Abaixo de R$ 12,50 a cobrança é proporcional (metade do preço do
     produto), por isso a faixa usa `percentual` em vez de `valor`.     */
  taxaFixa: [
    {ate: 12.49, percentual: 0.5},
    {ate: 29,    valor: 6.25},
    {ate: 50,    valor: 6.50},
    {ate: 78.99, valor: 6.75},
    {ate: 1e9,   valor: 0},
  ],
  freteAutomatico: true,         // usa a tabela oficial pelo peso
  freteRapidoAbaixo79: false,    // oferecer frete grátis rápido abaixo de R$ 79 (opcional)
  /* Peso volumétrico = (altura × largura × comprimento em cm) ÷ divisor.
     O frete usa o MAIOR entre ele e o peso real da balança.          */
  usarPesoVolumetrico: true,
  divisorVolumetrico: 6000,
  freteManual: 0,                // usado quando não há peso ou automático desligado
  pesoPadrao: 0,                 // kg, quando a planilha não traz peso
  rebate: 0,                     // subsídio do ML somado à receita (+)
  aliquotaImposto: 0,            // % sobre o preço
  taxaDevolucao: 0,              // % do preço reservado para devoluções
  embalagem: 0,                  // R$ por unidade
  margemDesejada: 0.20,          // margem líquida alvo
};

const centavos = v => Math.round(v * 100) / 100;

const brl = v => v == null || isNaN(v) ? '—' :
  'R$ ' + Number(v).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});

/* Número em formato brasileiro: "1.365,47" → 1365.47 */
function parseNumero(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let s = String(v == null ? '' : v).trim();
  if (!s) return NaN;
  s = s.replace(/[R$\s ]/gi, '');
  if (!/^[+-]?[\d.,]+$/.test(s)) return NaN;
  const temVirgula = s.includes(','), temPonto = s.includes('.');
  if (temVirgula && temPonto) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (temVirgula) {
    s = s.replace(',', '.');
  } else if (temPonto && /^[+-]?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}

/* Peso em quilos, aceitando a unidade escrita junto: "500 g", "1,5kg",
   "800mg". Sem unidade, assume kg — é o que o Bling exporta e o que a
   coluna "Peso bruto (Kg)" promete.

   Existe separado de parseNumero porque unidade só faz sentido em peso:
   deixar "mg" passar num campo de preço esconderia um erro de coluna. */
const UNIDADES_PESO = {kg:1, quilo:1, quilos:1, k:1, g:.001, grama:.001, gramas:.001, mg:.000001, t:1000, ton:1000};
function parsePeso(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  const s = String(v == null ? '' : v).trim();
  if (!s) return NaN;
  const m = s.match(/^(.*?)\s*([a-zA-Zçã]+)\.?$/);
  const fator = m ? UNIDADES_PESO[m[2].toLowerCase()] : 1;
  if (fator === undefined) return NaN;          // sufixo desconhecido: não adivinha
  const corpo = m ? m[1] : s;

  /* "1.091" é ambíguo: em preço parseNumero lê milhar (1091), o que em peso
     viraria 1091 kg e jogaria o produto na última faixa de frete. Num campo
     de peso, um ponto com um único grupo de 3 dígitos é decimal. */
  if (/^[+-]?\d{1,3}\.\d{3}$/.test(corpo)) {
    const n = parseFloat(corpo);
    return isFinite(n) ? n * fator : NaN;
  }
  const n = parseNumero(corpo);
  return isNaN(n) ? NaN : n * fator;
}

/* Peso arredondado a 4 casas: 1 mg = 0,000001 kg sumiria em 3 casas, e
   produtos muito leves (brinco, adesivo) vivem nessa escala. */
const arredPeso = kg => isNaN(kg) ? kg : Math.round(kg * 1e4) / 1e4;

/* ── a coluna está em gramas mesmo dizendo "kg"? ──────────────────────────────
   Acontece o tempo todo: a planilha traz 2000 para um produto de 2 kg. Lido
   como quilo, o frete vai para a última faixa e o preço sai irreal.

   Não dá para decidir linha a linha (2000 kg é uma carga possível), mas a
   coluna inteira entrega o padrão: se quase nada tem casa decimal e a mediana
   está na casa das centenas, são gramas. Devolvemos a suspeita para a tela
   perguntar — converter sozinho seria pior que o erro que corrige. */
function detectarEscalaPeso(valores) {
  const kg = [];
  for (const v of valores || []) {
    if (v === '' || v == null) continue;
    const n = parsePeso(v);
    if (!isNaN(n) && n > 0) kg.push(n);
  }
  if (kg.length < 3) return {suspeita: false, n: kg.length};

  const ordenado = kg.slice().sort((a, b) => a - b);
  const mediana = ordenado[Math.floor(ordenado.length / 2)];
  const inteiros = kg.filter(n => Number.isInteger(n)).length / kg.length;
  const acima50 = kg.filter(n => n >= 50).length / kg.length;

  /* Um produto de e-commerce raramente passa de 50 kg. Quando a maioria passa,
     são inteiros e a mediana é grande, a unidade é grama. */
  const suspeita = mediana >= 100 && inteiros >= 0.9 && acima50 >= 0.75;
  return {
    suspeita, n: kg.length, mediana,
    medianaConvertida: arredPeso(mediana / 1000),
    acima150: kg.filter(n => n > 150).length,
  };
}

/* ── componentes do custo de venda ───────────────────────────────────────── */
/* A tarifa de venda varia por categoria (Clássico 10%–14%, Premium 15%–19%),
   então cada produto pode trazer a sua em `comissaoProduto`.              */
const comissaoBase = p => {
  const propria = Number(p.comissaoProduto);
  if (isFinite(propria) && propria > 0) return propria;
  return (p.tipoAnuncio === 'premium' ? p.comissaoPremium : p.comissaoClassico) || 0;
};

/* Tarifa efetiva num preço: aplica a redução por faixa quando houver.
   Sem preço, devolve a tarifa cheia da categoria.                     */
const comissaoPct = (p, preco) => {
  const base = comissaoBase(p);
  const pp = Number(p.reducaoPP) || 0;
  if (!pp || preco == null) return base;
  const de = Number(p.reducaoDe) || 0, ate = Number(p.reducaoAte) || 0;
  if (preco >= de && preco <= ate) return Math.max(0, base - pp / 100);
  return base;
};

/* Devolve a faixa de custo fixo que vale para esse preço. */
function faixaTaxaFixa(preco, p) {
  const faixas = (p.taxaFixa || []).slice().sort((a, b) => a.ate - b.ate);
  for (const f of faixas) if (preco <= f.ate) return f;
  return null;
}

/* Custo fixo em reais. Uma faixa pode cobrar valor fixo (R$ 6,25) ou uma
   proporção do preço (abaixo de R$ 12,50 é metade do produto).        */
function taxaFixaDe(preco, p) {
  const f = faixaTaxaFixa(preco, p);
  if (!f) return 0;
  if (f.percentual) return centavos(Number(preco) * Number(f.percentual));
  return Number(f.valor) || 0;
}

/* Peso volumétrico: (altura × largura × comprimento) ÷ divisor, em cm.
   Ex.: 20 × 30 × 40 ÷ 6.000 = 4 kg.                                  */
function pesoVolumetrico(dimensoes, params) {
  const p = Object.assign({}, PADRAO, params || {});
  if (!p.usarPesoVolumetrico || !dimensoes) return 0;
  const a = Number(dimensoes.altura) || 0;
  const l = Number(dimensoes.largura) || 0;
  const c = Number(dimensoes.comprimento) || 0;
  const div = Number(p.divisorVolumetrico) || 6000;
  if (!a || !l || !c || div <= 0) return 0;
  return +((a * l * c) / div).toFixed(3);
}

/* Peso que o Mercado Livre cobra: o maior entre o da balança e o volumétrico. */
function pesoCobravel(pesoReal, dimensoes, params) {
  const real = Number(pesoReal) || 0;
  const vol  = pesoVolumetrico(dimensoes, params);
  return {
    real, volumetrico: vol,
    cobravel: Math.max(real, vol),
    usou: vol > real ? 'volumétrico' : 'real',
  };
}

function freteDe(preco, peso, p, dimensoes) {
  if (!p.freteAutomatico) return Number(p.freteManual) || 0;
  const base = pesoCobravel(peso, dimensoes, p).cobravel;
  const kg = base || Number(p.pesoPadrao) || 0;
  if (!kg) return Number(p.freteManual) || 0;
  return MLFretes ? MLFretes.custoEnvio(preco, kg, p.reputacao, p.freteRapidoAbaixo79) : 0;
}

/* ── conta completa a partir de um preço ─────────────────────────────────── */
function analisar(preco, custo, peso, params, dimensoes) {
  const p = Object.assign({}, PADRAO, params || {});
  const pr = centavos(Number(preco));
  const cu = Number(custo) || 0;
  if (!isFinite(pr) || pr <= 0) return null;

  const pctComissao = comissaoPct(p, pr);
  const comissao = centavos(pr * pctComissao);
  const taxaFixa = taxaFixaDe(pr, p);
  const pesos    = pesoCobravel(peso, dimensoes, p);
  const frete    = centavos(freteDe(pr, peso, p, dimensoes));
  const rebate   = Number(p.rebate) || 0;

  const receitaLiquida = centavos(pr - comissao - taxaFixa - frete + rebate);
  const margemContrib  = centavos(receitaLiquida - cu);

  const imposto   = centavos(pr * (Number(p.aliquotaImposto) || 0));
  const perdas    = centavos(pr * (Number(p.taxaDevolucao) || 0));
  const embalagem = Number(p.embalagem) || 0;

  const lucroLiquido = centavos(margemContrib - imposto - perdas - embalagem);
  const pesoUsado = pesos.cobravel || Number(p.pesoPadrao) || 0;

  return {
    preco: pr, custo: cu, peso: pesoUsado,
    pesoReal: pesos.real, pesoVolumetrico: pesos.volumetrico, pesoUsou: pesos.usou,
    comissao, comissaoPct: pctComissao, taxaFixa, frete, rebate,
    receitaLiquida, margemContrib,
    imposto, perdas, embalagem,
    lucroLiquido,
    margemLiquida: pr ? lucroLiquido / pr : 0,
    margemBruta:   pr ? margemContrib / pr : 0,
    markup:        cu ? pr / cu : 0,
    totalTaxas: centavos(comissao + taxaFixa + frete - rebate),
    faixaPreco: MLFretes ? MLFretes.faixaDePreco(pr).rotulo : '',
    faixaPeso:  MLFretes && pesoUsado ? MLFretes.faixaDePeso(pesoUsado).rotulo : '',
  };
}

/* ── preço que entrega a margem desejada ─────────────────────────────────── */
/* Frete e taxa fixa mudam em degraus conforme a faixa de preço, então
   testamos faixa por faixa: assumimos os custos da faixa, isolamos o preço
   e só aceitamos se o resultado realmente cair dentro dela.               */
function precoPara(custo, margemAlvo, peso, params, dimensoes) {
  const p = Object.assign({}, PADRAO, params || {});
  const cu = Number(custo);
  const alvo = Number(margemAlvo);
  if (!isFinite(cu) || cu <= 0 || !isFinite(alvo) || alvo >= 1) return null;

  const outros = (Number(p.aliquotaImposto) || 0) + (Number(p.taxaDevolucao) || 0) + alvo;
  if (1 - comissaoPct(p, null) - outros <= 0 && 1 - comissaoPct(p, Number(p.reducaoDe)) - outros <= 0)
    return null;   // taxas somadas à margem passam de 100% em qualquer faixa

  const entrega = pr => {
    const a = analisar(pr, cu, peso, p, dimensoes);
    return a && a.margemLiquida >= alvo - 1e-9;
  };

  /* Os degraus de frete e de custo fixo ficam em preços diferentes, então
     percorremos a união dos dois conjuntos de limites.                  */
  const limites = Array.from(new Set(
    (MLFretes ? MLFretes.FAIXAS_PRECO : [1e9])
      .concat((p.taxaFixa || []).map(f => Number(f.ate)))
      .concat(Number(p.reducaoPP) ? [Number(p.reducaoDe) - 0.01, Number(p.reducaoAte)] : [])
      .filter(v => isFinite(v) && v > 0)
  )).sort((a, b) => a - b);

  let anterior = 0;
  for (const limite of limites) {
    const referencia = Math.min(limite, Math.max(anterior + 0.01, 0.01));
    const faixa = faixaTaxaFixa(referencia, p);
    const base = 1 - comissaoPct(p, referencia) - outros;   // tarifa da faixa
    if (base <= 0) { anterior = limite; continue; }
    // faixa proporcional (metade do preço) entra no divisor, não no numerador
    const pctFixo = faixa && faixa.percentual ? Number(faixa.percentual) : 0;
    const tf      = faixa && !faixa.percentual ? (Number(faixa.valor) || 0) : 0;
    const frete   = freteDe(referencia, peso, p, dimensoes);
    const divisor = base - pctFixo;
    if (divisor <= 0) { anterior = limite; continue; }

    const numerador = cu + tf + frete - (Number(p.rebate) || 0) + (Number(p.embalagem) || 0);
    let pr = centavos(Math.ceil((numerador / divisor) * 100) / 100);

    if (pr > anterior && pr <= limite) {
      for (let i = 0; i < 30 && !entrega(pr); i++) pr = centavos(pr + 0.01);
      if (pr <= limite && entrega(pr)) return pr;
    }
    anterior = limite;
  }

  // não coube em nenhuma faixa: procura o menor preço que entregue a margem
  let pr = centavos(cu / Math.max(0.01, 1 - comissaoPct(p, null) - outros));
  for (let i = 0; i < 5000 && !entrega(pr); i++) pr = centavos(pr + 0.05);
  return entrega(pr) ? pr : null;
}

/* Custo total no modelo drop: fornecedor + frete do fornecedor até você. */
const custoTotal = (fornecedor, extra) => {
  const c = parseNumero(fornecedor);
  if (!c || isNaN(c) || c <= 0) return null;
  const e = parseNumero(extra);
  return centavos(c + (isNaN(e) ? 0 : e));
};

/* ══════════════════════════════════════════════════════════════════════════
   PRECIFICAÇÃO EM LOTE COM CONFERÊNCIA

   O preço só vale se os dados de entrada valem. Um produto sem peso, por
   exemplo, seria precificado com frete zero e pareceria muito mais lucrativo
   do que é — por isso cada linha volta com a lista de problemas encontrados.
   ══════════════════════════════════════════════════════════════════════════ */

const AVISOS = {
  sem_custo: {gravidade:'erro', titulo:'Sem custo na planilha',
    descricao:'A coluna de custo está vazia nessas linhas — sem custo não há preço.'},
  custo_invalido: {gravidade:'erro', titulo:'Custo não é um número',
    descricao:'Há texto onde deveria haver valor. Confira se a coluna de custo está certa.'},
  margem_inalcancavel: {gravidade:'erro', titulo:'Margem não alcançável',
    descricao:'As taxas somadas à margem desejada passam de 100% do preço. Reduza a margem.'},
  frete_zero: {gravidade:'erro', titulo:'Preço calculado com frete zero',
    descricao:'Sem peso, sem medidas e sem frete manual, o envio entrou como R$ 0,00 — o lucro real será menor.'},
  lucro_negativo: {gravidade:'erro', titulo:'Prejuízo no preço sugerido',
    descricao:'Mesmo no preço calculado, esses produtos não cobrem os custos.'},
  sem_peso: {gravidade:'alerta', titulo:'Sem peso',
    descricao:'O frete usou as medidas ou o peso padrão. Confira a coluna de peso.'},
  sem_dimensoes: {gravidade:'alerta', titulo:'Sem as três medidas',
    descricao:'Sem altura, largura e comprimento não dá para calcular o peso volumétrico — o frete pode sair menor que o real.'},
  peso_invalido: {gravidade:'erro', titulo:'Peso não é um número',
    descricao:'Há texto onde deveria haver peso. Aceito: 1,5 / 1,5 kg / 500 g / 800 mg.'},
  peso_suspeito: {gravidade:'alerta', titulo:'Peso parece errado',
    descricao:'Peso abaixo de meio grama. Confira se o valor está em quilos.'},
  peso_alto: {gravidade:'alerta', titulo:'Peso acima de 150 kg',
    descricao:'Acima do limite das faixas do Mercado Livre. Confira se gramas entraram como quilos.'},
  tarifa_suspeita: {gravidade:'alerta', titulo:'Tarifa da categoria fora do esperado',
    descricao:'A coluna de tarifa trouxe mais de 50%. Foi ignorada — confira se é mesmo a coluna certa.'},
  markup_alto: {gravidade:'alerta', titulo:'Preço muito acima do custo',
    descricao:'O preço passou de 5x o custo, quase sempre por causa do frete. Confira se o produto vende nesse valor.'},
};

/* Precifica uma linha e devolve, junto, o que há de errado com ela.
   entrada = {linha, custo, peso, dimensoes, comissaoProduto} */
function precificarLinha(entrada, params) {
  const p = Object.assign({}, PADRAO, params || {});
  const avisos = [];
  const linha = entrada.linha;
  const alvo = Number(p.margemAlvo);

  // custo: distingue "vazio" de "texto onde deveria ter número"
  const cru = entrada.custo;
  const vazio = cru === '' || cru == null;
  const custo = vazio ? NaN : parseNumero(cru);
  if (vazio || custo === 0) { avisos.push('sem_custo'); return {linha, custo:null, preco:null, avisos}; }
  if (isNaN(custo) || custo < 0) { avisos.push('custo_invalido'); return {linha, custo:null, preco:null, avisos}; }

  // peso e medidas — aceita "500 g" e "1,5kg", sempre convertendo para quilos
  const pesoCru = entrada.peso;
  const pesoVazio = pesoCru === '' || pesoCru == null;
  const peso = pesoVazio ? NaN : arredPeso(parsePeso(pesoCru));
  const kg = isNaN(peso) ? 0 : peso;
  const dims = entrada.dimensoes || null;
  if (!pesoVazio && isNaN(peso)) avisos.push('peso_invalido');
  else if (!kg) avisos.push('sem_peso');
  else if (kg < 0.0005) avisos.push('peso_suspeito');
  else if (kg > 150) avisos.push('peso_alto');
  if (p.usarPesoVolumetrico && !dims) avisos.push('sem_dimensoes');

  /* Tarifa própria da categoria: aceita 13 ou 0,13. Acima de 50% é quase
     certo que a coluna escolhida não é de tarifa — ignoramos e avisamos,
     em vez de precificar com uma comissão absurda.                     */
  const pl = Object.assign({}, p);
  const taxa = parseNumero(entrada.comissaoProduto);
  if (!isNaN(taxa) && taxa > 0) {
    const fracao = taxa > 1 ? taxa / 100 : taxa;
    if (fracao > 0.5) avisos.push('tarifa_suspeita');
    else pl.comissaoProduto = fracao;
  }

  const preco = precoPara(custo, alvo, kg, pl, dims);
  if (preco == null) { avisos.push('margem_inalcancavel'); return {linha, custo, peso:kg, preco:null, avisos}; }

  const r = analisar(preco, custo, kg, pl, dims);
  // frete zero com cálculo automático ligado significa que faltou dado de peso
  if (pl.freteAutomatico && r.frete === 0) avisos.push('frete_zero');
  if (r.lucroLiquido <= 0) avisos.push('lucro_negativo');
  if (r.markup > 5) avisos.push('markup_alto');

  return Object.assign({linha, avisos}, r);
}

/* Agrupa os problemas do lote. Guarda TODOS os índices de cada grupo, para a
   tela poder mostrar linhas que ficariam fora de uma prévia truncada.      */
function conferir(linhas) {
  const ordem = {erro:0, alerta:1, info:2};
  const mapa = new Map();

  linhas.forEach((l, i) => {
    (l.avisos || []).forEach(id => {
      if (!mapa.has(id)) mapa.set(id, []);
      mapa.get(id).push(i);
    });
  });

  const grupos = Array.from(mapa.entries()).map(([id, idx]) => {
    const a = AVISOS[id] || {gravidade:'info', titulo:id, descricao:''};
    return {id, gravidade:a.gravidade, titulo:a.titulo, descricao:a.descricao, n:idx.length, linhas:idx};
  }).sort((x, y) => (ordem[x.gravidade] - ordem[y.gravidade]) || (y.n - x.n));

  const comErro   = linhas.filter(l => (l.avisos || []).some(id => (AVISOS[id] || {}).gravidade === 'erro')).length;
  const comAlerta = linhas.filter(l => (l.avisos || []).some(id => (AVISOS[id] || {}).gravidade === 'alerta')).length;

  return {
    total: linhas.length,
    precificados: linhas.filter(l => l.preco != null).length,
    comErro, comAlerta,
    revisar: linhas.filter(l => (l.avisos || []).length).length,
    ok: comErro === 0,
    grupos,
  };
}

function precificarLote(entradas, params) {
  const linhas = (entradas || []).map(e => precificarLinha(e, params));
  return {linhas, conferencia: conferir(linhas)};
}

return {PADRAO, AVISOS, brl, parseNumero, parsePeso, arredPeso, detectarEscalaPeso, centavos, comissaoPct, taxaFixaDe, faixaTaxaFixa, freteDe,
        pesoVolumetrico, pesoCobravel,
        analisar, precoPara, custoTotal,
        precificarLinha, precificarLote, conferir};
});
