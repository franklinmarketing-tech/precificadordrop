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
  versao: 3,                     // sobe quando os padrões mudam, para migrar o que está salvo
  reputacao: 'verde',            // verde | amarela | vermelha
  tipoAnuncio: 'classico',       // classico | premium
  // tarifa de venda por categoria: Clássico entre 10% e 14%, Premium entre 15% e 19%
  comissaoClassico: 0.13,
  comissaoPremium: 0.18,
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
  freteManual: 0,                // usado quando não há peso ou automático desligado
  pesoPadrao: 0,                 // kg, quando a planilha não traz peso
  rebate: 0,                     // subsídio do ML somado à receita (+)
  aliquotaImposto: 0,            // % sobre o preço
  taxaDevolucao: 0.03,           // % do preço reservado para devoluções
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
  } else if (temPonto && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}

/* ── componentes do custo de venda ───────────────────────────────────────── */
/* A tarifa de venda varia por categoria (Clássico 10%–14%, Premium 15%–19%),
   então cada produto pode trazer a sua em `comissaoProduto`.              */
const comissaoPct = p => {
  const propria = Number(p.comissaoProduto);
  if (isFinite(propria) && propria > 0) return propria;
  return (p.tipoAnuncio === 'premium' ? p.comissaoPremium : p.comissaoClassico) || 0;
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

function freteDe(preco, peso, p) {
  if (!p.freteAutomatico) return Number(p.freteManual) || 0;
  const kg = Number(peso) || Number(p.pesoPadrao) || 0;
  if (!kg) return Number(p.freteManual) || 0;
  return MLFretes ? MLFretes.custoEnvio(preco, kg, p.reputacao) : 0;
}

/* ── conta completa a partir de um preço ─────────────────────────────────── */
function analisar(preco, custo, peso, params) {
  const p = Object.assign({}, PADRAO, params || {});
  const pr = centavos(Number(preco));
  const cu = Number(custo) || 0;
  if (!isFinite(pr) || pr <= 0) return null;

  const comissao = centavos(pr * comissaoPct(p));
  const taxaFixa = taxaFixaDe(pr, p);
  const frete    = centavos(freteDe(pr, peso, p));
  const rebate   = Number(p.rebate) || 0;

  const receitaLiquida = centavos(pr - comissao - taxaFixa - frete + rebate);
  const margemContrib  = centavos(receitaLiquida - cu);

  const imposto   = centavos(pr * (Number(p.aliquotaImposto) || 0));
  const perdas    = centavos(pr * (Number(p.taxaDevolucao) || 0));
  const embalagem = Number(p.embalagem) || 0;

  const lucroLiquido = centavos(margemContrib - imposto - perdas - embalagem);
  const pesoUsado = Number(peso) || Number(p.pesoPadrao) || 0;

  return {
    preco: pr, custo: cu, peso: pesoUsado,
    comissao, comissaoPct: comissaoPct(p), taxaFixa, frete, rebate,
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
function precoPara(custo, margemAlvo, peso, params) {
  const p = Object.assign({}, PADRAO, params || {});
  const cu = Number(custo);
  const alvo = Number(margemAlvo);
  if (!isFinite(cu) || cu <= 0 || !isFinite(alvo) || alvo >= 1) return null;

  const base = 1 - comissaoPct(p) - (Number(p.aliquotaImposto) || 0)
                 - (Number(p.taxaDevolucao) || 0) - alvo;
  if (base <= 0) return null;   // taxas somadas à margem passam de 100%

  const entrega = pr => {
    const a = analisar(pr, cu, peso, p);
    return a && a.margemLiquida >= alvo - 1e-9;
  };

  /* Os degraus de frete e de custo fixo ficam em preços diferentes, então
     percorremos a união dos dois conjuntos de limites.                  */
  const limites = Array.from(new Set(
    (MLFretes ? MLFretes.FAIXAS_PRECO : [1e9])
      .concat((p.taxaFixa || []).map(f => Number(f.ate)))
      .filter(v => isFinite(v) && v > 0)
  )).sort((a, b) => a - b);

  let anterior = 0;
  for (const limite of limites) {
    const referencia = Math.min(limite, Math.max(anterior + 0.01, 0.01));
    const faixa = faixaTaxaFixa(referencia, p);
    // faixa proporcional (metade do preço) entra no divisor, não no numerador
    const pctFixo = faixa && faixa.percentual ? Number(faixa.percentual) : 0;
    const tf      = faixa && !faixa.percentual ? (Number(faixa.valor) || 0) : 0;
    const frete   = freteDe(referencia, peso, p);
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
  let pr = centavos(cu / base);
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

return {PADRAO, brl, parseNumero, centavos, comissaoPct, taxaFixaDe, faixaTaxaFixa, freteDe,
        analisar, precoPara, custoTotal};
});
