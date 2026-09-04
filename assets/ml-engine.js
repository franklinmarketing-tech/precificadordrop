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

/* ── a linha está em gramas mesmo a coluna dizendo "kg"? ──────────────────────
   Acontece o tempo todo: a planilha traz 2000 para um produto de 2 kg. Lido
   como quilo, o frete vai para a última faixa e o preço sai irreal.

   A planilha real mistura as escalas na mesma coluna, então a decisão é por
   linha. Duas condições, e as duas precisam valer:

   • acima de PISO_GRAMAS — peso de dropshipping (roupa, brinquedo, panela)
     raramente passa disso;
   • número inteiro — peso em gramas vem redondo (2000, 80, 117), enquanto
     quilo de verdade tem casa decimal (0,9 / 2,575 / 199,999).

   Só o limite de 150 kg não bastava: a planilha do usuário tinha 211 produtos
   entre 20 e 150 kg (80, 82, 117…), todos inteiros e todos gramas, que
   passavam batido e saíam com frete de centenas de reais. */
const LIMITE_ML = 150;    // acima disso o Mercado Livre não tem faixa de frete
const PISO_GRAMAS = 20;   // acima disso, um inteiro é quase certamente grama

const pareceGramas = n => Number.isInteger(n) && n >= PISO_GRAMAS;

function detectarEscalaPeso(valores) {
  const kg = [];
  for (const v of valores || []) {
    if (v === '' || v == null) continue;
    const n = parsePeso(v);
    if (!isNaN(n) && n > 0) kg.push(n);
  }
  if (!kg.length) return {suspeita: false, n: 0, acima150: 0, suspeitos: 0};

  const ordenado = kg.slice().sort((a, b) => a - b);
  const mediana = ordenado[Math.floor(ordenado.length / 2)];
  const grandes = ordenado.filter(pareceGramas);

  return {
    suspeita: grandes.length > 0,
    n: kg.length,
    mediana,
    suspeitos: grandes.length,
    acima150: kg.filter(n => n > LIMITE_ML).length,
    /* o maior de todos, para a mensagem mostrar o caso mais gritante */
    maior: ordenado[ordenado.length - 1],
    maiorConvertido: arredPeso(ordenado[ordenado.length - 1] / 1000),
    todosGrandes: grandes.length === kg.length,
    /* Amostras para a tela mostrar o antes e depois com dados reais, em vez de
       pedir uma decisão sobre números que o usuário não está vendo. Valores
       distintos e espalhados pela faixa: quatro linhas repetindo "20 → 0,02"
       não mostram o que está acontecendo na planilha. */
    exemplosGrandes: (() => {
      const unicos = [...new Set(grandes)];
      const passo = Math.max(1, Math.floor(unicos.length / 4));
      const amostra = [];
      for (let i = 0; i < unicos.length && amostra.length < 4; i += passo) amostra.push(unicos[i]);
      return amostra.map(n => ({de: n, para: arredPeso(n / 1000)}));
    })(),
    /* em torno da mediana: os extremos da lista ordenada dariam exemplos
       atípicos (0,01 kg ou 150 kg) e não representam o catálogo */
    exemplosNormais: (() => {
      const bons = ordenado.filter(n => !pareceGramas(n));
      if (!bons.length) return [];
      const meio = Math.floor(bons.length / 2);
      return bons.slice(Math.max(0, meio - 2), Math.max(0, meio - 2) + 4);
    })(),
  };
}

/* Converte só o que não cabe na tabela do ML. Devolve o peso em quilos e diz
   se houve conversão, para a tela poder marcar a linha. */
function normalizarPesoLinha(v, converterGrandes) {
  const n = parsePeso(v);
  if (isNaN(n) || n <= 0) return {kg: n, convertido: false};
  if (converterGrandes && pareceGramas(n)) return {kg: arredPeso(n / 1000), convertido: true};
  return {kg: n, convertido: false};
}

/* ── lendo planilha de qualquer origem ───────────────────────────────────────
   Cada depósito manda um formato: cabeçalho na terceira linha, aba de ajuda na
   frente da de produtos, rótulo com espaço sobrando. Estas funções trabalham
   sobre a matriz crua (AoA), sem conhecer SheetJS — por isso rodam nos testes
   em Node.                                                                  */

/* "  Descrição Curta " → "descricao curta". Sem isso, "Custo " não casa com
   /^custo$/ e a coluna certa passa despercebida. */
function normalizarTexto(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/* O que vem entre parênteses costuma ser a unidade: "Peso (kg)", "Altura (cm)".
   Serve para dois fins: tirar o trecho antes de comparar com regex âncorada, e
   confirmar a escala detectada nos números. */
const semParenteses = s => normalizarTexto(String(s == null ? '' : s).replace(/\([^)]*\)/g, ''));

function unidadeDoCabecalho(h) {
  const m = String(h == null ? '' : h).match(/\(([^)]*)\)/);
  if (!m) return null;
  const u = normalizarTexto(m[1]).replace(/[.\s]/g, '');
  return ['kg','g','mg','t','mm','cm','m','pol','in'].includes(u) ? u : null;
}

const ehNumero = v => v !== '' && v != null && !isNaN(parseNumero(v));

/* Qual linha é o cabeçalho? O sinal decisivo é "texto em cima, número embaixo":
   a linha de rótulos tem palavras onde as linhas seguintes têm valores. */
function detectarCabecalho(aoa, limite) {
  const linhas = (aoa || []).slice(0, limite || 15);
  if (!linhas.length) return {linha: 0, pontos: 0, confianca: 'baixa', candidatos: []};

  const largura = (aoa || []).reduce((m, l) => Math.max(m, (l || []).length), 0);
  const candidatos = [];

  linhas.forEach((linha, i) => {
    const celulas = (linha || []).filter(c => c !== '' && c != null);
    if (celulas.length < 2) return;

    const textos = celulas.filter(c => !ehNumero(c) && /[a-zA-ZÀ-ÿ]/.test(String(c)));
    const numeros = celulas.filter(ehNumero);
    let pontos = textos.length * 2 + celulas.length;

    /* rótulo em cima, dado embaixo: comparamos com as três linhas seguintes */
    const abaixo = (aoa || []).slice(i + 1, i + 4);
    if (abaixo.length) {
      let colunasComDado = 0;
      (linha || []).forEach((c, col) => {
        if (c === '' || c == null || ehNumero(c)) return;
        if (abaixo.some(l => l && l[col] !== '' && l[col] != null)) colunasComDado++;
      });
      pontos += colunasComDado * 3;
    }

    if (celulas.length >= 4) pontos += 3;
    if (largura && celulas.length < largura / 2) pontos -= 2;   // título solto
    if (celulas.length && numeros.length / celulas.length > 0.3) pontos -= 4;
    const vistos = new Set(textos.map(normalizarTexto));
    pontos -= (textos.length - vistos.size) * 3;                // rótulos repetidos

    candidatos.push({linha: i, pontos, previa: celulas.slice(0, 5).map(String)});
  });

  if (!candidatos.length) return {linha: 0, pontos: 0, confianca: 'baixa', candidatos: []};

  const ordenado = candidatos.slice().sort((a, b) => b.pontos - a.pontos);
  const topo = ordenado[0];
  /* Empate técnico: fica com a linha DE BAIXO. Uma planilha pode ter o
     cabeçalho técnico em cima (FAMILY_ID, ITEM_ID) e o legível logo abaixo
     ("Código do anúncio") — o legível é o que casa com os nossos regexes. */
  const empatados = ordenado.filter(c => c.pontos >= topo.pontos * 0.85);
  const escolhido = empatados.reduce((a, b) => (b.linha > a.linha ? b : a));

  const segundo = ordenado.find(c => c.linha !== escolhido.linha);
  const folga = segundo ? escolhido.pontos / Math.max(1, segundo.pontos) : 2;
  return {
    linha: escolhido.linha,
    pontos: escolhido.pontos,
    confianca: escolhido.linha === 0 && folga >= 1.4 ? 'alta' : (folga >= 1.2 ? 'media' : 'baixa'),
    candidatos: ordenado.slice(0, 5),
  };
}

/* Qual aba tem os produtos? Arquivo do Mercado Livre vem com "Ajuda" na frente
   e "hidden" no meio; a que interessa é a de anúncios. */
const NOME_BOM = /an[uú]ncio|produto|item|cat[aá]logo|estoque|precifica|planilha|sheet|dados/;
const NOME_RUIM = /ajuda|instru|leia|readme|exemplo|modelo|template|hidden|oculta|config|param|glossario|legenda/;

function escolherAba(abas) {
  const validas = (abas || []).filter(a => a && (a.aoa || []).length >= 2);
  if (!validas.length) return {indice: 0, nome: (abas && abas[0] ? abas[0].nome : ''), pontos: 0, alternativas: []};

  const notas = validas.map(a => {
    const nome = normalizarTexto(a.nome);
    let pontos = Math.min(50, a.aoa.length);
    if (NOME_BOM.test(nome)) pontos += 10;
    if (NOME_RUIM.test(nome)) pontos -= 20;
    if (a.oculta) pontos -= 30;

    const cab = detectarCabecalho(a.aoa);
    if (cab.confianca !== 'baixa') pontos += 15;

    /* assinatura de aba precificável: tem coluna de dinheiro e de descrição */
    const rotulos = (a.aoa[cab.linha] || []).map(normalizarTexto);
    const temValor = rotulos.some(h => /custo|preco|valor/.test(h));
    const temTexto = rotulos.some(h => /descri|titulo|nome|produto/.test(h));
    if (temValor && temTexto) pontos += 10;

    return {aba: a, nome: a.nome, pontos, linhas: a.aoa.length, cabecalho: cab.linha};
  });

  const ordenado = notas.slice().sort((a, b) => b.pontos - a.pontos);
  const topo = ordenado[0];
  return {
    indice: (abas || []).indexOf(topo.aba),
    nome: topo.nome,
    pontos: topo.pontos,
    cabecalho: topo.cabecalho,
    alternativas: ordenado.slice(1).map(x => ({nome: x.nome, pontos: x.pontos, linhas: x.linhas})),
  };
}

/* Entre o cabeçalho e os dados costuma sobrar lixo (linha de subtítulo, linha
   de "obrigatório"). Some com as linhas sem nenhum número logo após o
   cabeçalho — as de verdade sempre têm preço, peso ou estoque. */
function podarLinhasVazias(aoa) {
  const linhas = (aoa || []).slice();
  if (linhas.length < 2) return {aoa: linhas, podadas: 0};
  let podadas = 0;
  while (linhas.length > 1) {
    const l = linhas[1] || [];
    const temAlgo = l.some(c => c !== '' && c != null);
    const temNumero = l.some(ehNumero);
    if (temAlgo && temNumero) break;
    if (!temAlgo || !temNumero) { linhas.splice(1, 1); podadas++; } else break;
  }
  return {aoa: linhas, podadas};
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

/* ── as medidas estão em milímetros mesmo a coluna dizendo "cm"? ──────────────
   O mesmo erro do peso, mas invisível: uma caixa 20×30×40 lida como mm dá
   volumétrico de 4000 kg em vez de 4, o frete pula de R$ 20,75 para R$ 262,85 e
   nenhum aviso dispara (peso_alto olha a balança, não o volumétrico).

   A escala vem da mediana de TODOS os lados juntos — com três colunas, um
   outlier não move nada. Mas a mediana sozinha erraria num catálogo de móveis,
   então ela só vira suspeita se o volumétrico e o peso real concordarem. */
/* O corte de 100 cm vem dos dados: numa planilha real de 5 mil produtos a
   mediana dos lados é 20 cm e só 0,4% passa de 100 cm. Em milímetros essa mesma
   mediana vira 200 — as duas escalas não se encostam. */
const ESCALAS_DIM = [
  {escala: 'mm', fator: 0.1,  min: 100, max: Infinity},
  {escala: 'cm', fator: 1,    min: 2,   max: 100},
  {escala: 'm',  fator: 100,  min: 0,   max: 2},
];
const escalaDoLado = n => ESCALAS_DIM.find(e => n >= e.min && n < e.max) || ESCALAS_DIM[1];

const mediana = lista => {
  if (!lista.length) return 0;
  const o = lista.slice().sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
};

function detectarEscalaDimensao(alturas, larguras, comprimentos, pesos, params) {
  const p = Object.assign({}, PADRAO, params || {});
  const caixas = [], lados = [];
  const n = Math.max(alturas ? alturas.length : 0, larguras ? larguras.length : 0);
  for (let i = 0; i < n; i++) {
    const a = parseNumero(alturas[i]), l = parseNumero(larguras[i]), c = parseNumero(comprimentos[i]);
    if (isNaN(a) || isNaN(l) || isNaN(c) || a <= 0 || l <= 0 || c <= 0) continue;
    caixas.push({altura: a, largura: l, comprimento: c});
    lados.push(a, l, c);
  }

  const vazio = {suspeita: false, escala: 'cm', fator: 1, n: caixas.length, misturado: false};
  if (caixas.length < 20) return vazio;          // amostra pequena não sustenta conclusão

  const med = mediana(lados);
  const alvo = escalaDoLado(med);

  /* Coerência: metade em mm e metade em cm não é escala errada, é bagunça —
     e converter em bloco estragaria uma das metades. */
  const coerentes = lados.filter(x => escalaDoLado(x).escala === alvo.escala).length / lados.length;
  if (coerentes < 0.8) return Object.assign({}, vazio, {misturado: true, medianaLado: med});
  if (alvo.escala === 'cm') return Object.assign({}, vazio, {medianaLado: med});

  const caixaMed = caixas[Math.floor(caixas.length / 2)];
  const volAntes = pesoVolumetrico(caixaMed, p);
  const volDepois = pesoVolumetrico({
    altura: caixaMed.altura * alvo.fator,
    largura: caixaMed.largura * alvo.fator,
    comprimento: caixaMed.comprimento * alvo.fator,
  }, p);

  /* Se o volumétrico atual já é plausível para um produto de e-commerce, não há
     o que corrigir — a mediana pode ter enganado. */
  if (volAntes >= 0.05 && volAntes <= 30) return Object.assign({}, vazio, {medianaLado: med});

  /* Sinal mais forte: o volumétrico tem que ficar na mesma ordem de grandeza do
     peso da balança. Em mm essa razão vira ~1000. */
  const kgs = (pesos || []).map(parsePeso).filter(x => !isNaN(x) && x > 0);
  const razaoPeso = kgs.length >= 10 ? volAntes / mediana(kgs) : null;
  if (razaoPeso != null && razaoPeso >= 0.1 && razaoPeso <= 10)
    return Object.assign({}, vazio, {medianaLado: med, razaoPeso});

  const precoRef = 100;
  return {
    suspeita: true, escala: alvo.escala, fator: alvo.fator, n: caixas.length,
    misturado: false, medianaLado: med, razaoPeso,
    volumetricoAntes: volAntes, volumetricoDepois: volDepois,
    /* em reais: é o número que o usuário julga sozinho */
    freteAntes: MLFretes ? MLFretes.custoEnvio(precoRef, volAntes, p.reputacao, p.freteRapidoAbaixo79) : 0,
    freteDepois: MLFretes ? MLFretes.custoEnvio(precoRef, volDepois, p.reputacao, p.freteRapidoAbaixo79) : 0,
    exemplos: caixas.slice(0, 3).map(c => ({
      de: c,
      para: {
        altura: arredPeso(c.altura * alvo.fator),
        largura: arredPeso(c.largura * alvo.fator),
        comprimento: arredPeso(c.comprimento * alvo.fator),
      },
    })),
  };
}

/* A conversão é da COLUNA inteira, não por linha: altura e largura do mesmo
   produto estão sempre na mesma unidade. */
function normalizarDimensaoLinha(a, l, c, fator) {
  const f = Number(fator) || 1;
  const na = parseNumero(a), nl = parseNumero(l), nc = parseNumero(c);
  if (isNaN(na) || isNaN(nl) || isNaN(nc) || na <= 0 || nl <= 0 || nc <= 0)
    return {dimensoes: null, convertido: false};
  return {
    dimensoes: {
      altura: arredPeso(na * f), largura: arredPeso(nl * f), comprimento: arredPeso(nc * f),
    },
    convertido: f !== 1,
  };
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

/* Cada aviso diz o problema (`descricao`) E o que fazer (`comoResolver`).
   Saber que 4 produtos estão com frete zero não adianta sem saber que basta
   digitar o peso na própria tabela. */
const AVISOS = {
  sem_custo: {gravidade:'erro', titulo:'Sem custo na planilha',
    descricao:'A coluna de custo está vazia nessas linhas — sem custo não há preço.',
    comoResolver:'Clique em "ver as linhas" e digite o custo na coluna Custo. Se a planilha inteira estiver vazia, volte ao passo 2 e escolha outra coluna.'},
  custo_invalido: {gravidade:'erro', titulo:'Custo não é um número',
    descricao:'Há texto onde deveria haver valor. Confira se a coluna de custo está certa.',
    comoResolver:'Veja as linhas e corrija o valor na coluna Custo. Se todas estiverem assim, a coluna escolhida no passo 2 não é a de custo.'},
  margem_inalcancavel: {gravidade:'erro', titulo:'Margem não alcançável',
    descricao:'As taxas somadas à margem desejada passam de 100% do preço. Reduza a margem.',
    comoResolver:'Volte ao passo 2 e escolha uma margem menor. Produto barato tem taxa fixa alta em proporção e não sustenta margens grandes.'},
  frete_zero: {gravidade:'erro', titulo:'Preço calculado com frete zero',
    descricao:'Sem peso, sem medidas e sem frete manual, o envio entrou como R$ 0,00 — o lucro real será menor.',
    comoResolver:'Clique em "ver as linhas" e digite o peso de cada produto na coluna Peso. O preço recalcula na hora, só naquela linha.'},
  lucro_negativo: {gravidade:'erro', titulo:'Prejuízo no preço sugerido',
    descricao:'Mesmo no preço calculado, esses produtos não cobrem os custos.',
    comoResolver:'Confira o custo e o peso dessas linhas — quase sempre um dos dois está errado. Se estiverem certos, o produto não fecha conta no Mercado Livre.'},
  sem_peso: {gravidade:'alerta', titulo:'Sem peso',
    descricao:'O frete usou as medidas ou o peso padrão. Confira a coluna de peso.',
    comoResolver:'Digite o peso direto na tabela, na coluna Peso. Sem ele o frete sai por estimativa e o lucro pode ser menor do que aparece.'},
  sem_dimensoes: {gravidade:'alerta', titulo:'Sem as três medidas',
    descricao:'Sem altura, largura e comprimento não dá para calcular o peso volumétrico — o frete pode sair menor que o real.',
    comoResolver:'Preencha altura, largura e comprimento na planilha e carregue de novo. Caixa grande e leve é cobrada pelo volume, não pelo peso.'},
  peso_invalido: {gravidade:'erro', titulo:'Peso não é um número',
    descricao:'Há texto onde deveria haver peso. Aceito: 1,5 / 1,5 kg / 500 g / 800 mg.',
    comoResolver:'Veja as linhas e corrija o peso na tabela. Pode escrever a unidade junto: 500 g, 1,5 kg.'},
  peso_suspeito: {gravidade:'alerta', titulo:'Peso parece errado',
    descricao:'Peso abaixo de meio grama. Confira se o valor está em quilos.',
    comoResolver:'Veja as linhas e corrija o peso. Um produto de 500 g deve estar como 0,5 (ou escrito "500 g").'},
  peso_alto: {gravidade:'alerta', titulo:'Peso acima de 150 kg',
    descricao:'Acima do limite das faixas do Mercado Livre. Confira se gramas entraram como quilos.',
    comoResolver:'Veja as linhas e corrija o peso na tabela. O Mercado Livre não entrega acima de 150 kg, então o frete dessas linhas não é confiável.'},
  tarifa_suspeita: {gravidade:'alerta', titulo:'Tarifa da categoria fora do esperado',
    descricao:'A coluna de tarifa trouxe mais de 50%. Foi ignorada — confira se é mesmo a coluna certa.',
    comoResolver:'Volte ao passo 2 e confira a coluna da tarifa. Enquanto isso, esses produtos usaram a tarifa dos parâmetros.'},
  markup_alto: {gravidade:'alerta', titulo:'Preço muito acima do custo',
    descricao:'O preço ficou bem acima do que as taxas e o frete explicam. Confira se o produto vende nesse valor.',
    comoResolver:'Veja as linhas e compare com o preço de mercado. Se não vender por esse valor, reduza a margem no passo 2.'},
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
  /* Markup alto sozinho não é defeito: num produto de R$ 2,29 o Mercado Livre
     cobra ~R$ 16 fixos (comissão + taxa fixa + frete), então qualquer preço com
     margem dá 10× o custo — é aritmética, não erro. O que merece atenção é o
     preço subir muito ALÉM do que as taxas explicam. */
  const explicado = custo + r.comissao + r.taxaFixa + r.frete;
  if (r.markup > 5 && preco > explicado * 1.6) avisos.push('markup_alto');

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
    return {id, gravidade:a.gravidade, titulo:a.titulo, descricao:a.descricao,
            comoResolver:a.comoResolver || '', n:idx.length, linhas:idx};
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

return {PADRAO, AVISOS, LIMITE_ML, PISO_GRAMAS, brl, parseNumero, parsePeso, arredPeso,
        detectarEscalaPeso, normalizarPesoLinha,
        detectarEscalaDimensao, normalizarDimensaoLinha,
        normalizarTexto, semParenteses, unidadeDoCabecalho,
        detectarCabecalho, escolherAba, podarLinhasVazias, centavos, comissaoPct, taxaFixaDe, faixaTaxaFixa, freteDe,
        pesoVolumetrico, pesoCobravel,
        analisar, precoPara, custoTotal,
        precificarLinha, precificarLote, conferir};
});
