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
  reputacao: 'verde',            // verde | amarela | vermelha
  tipoAnuncio: 'classico',       // classico | premium
  comissaoClassico: 0.13,        // 13% do preço
  comissaoPremium: 0.18,         // 18% do preço
  // custo fixo por unidade, por faixa de preço do anúncio
  taxaFixa: [
    {ate: 29,    valor: 6.25},
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
const comissaoPct = p =>
  (p.tipoAnuncio === 'premium' ? p.comissaoPremium : p.comissaoClassico) || 0;

function taxaFixaDe(preco, p) {
  const faixas = (p.taxaFixa || []).slice().sort((a, b) => a.ate - b.ate);
  for (const f of faixas) if (preco <= f.ate) return Number(f.valor) || 0;
  return 0;
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

  const fixo = 1 - comissaoPct(p) - (Number(p.aliquotaImposto) || 0)
                 - (Number(p.taxaDevolucao) || 0) - alvo;
  if (fixo <= 0) return null;   // taxas somadas à margem passam de 100%

  const entrega = pr => {
    const a = analisar(pr, cu, peso, p);
    return a && a.margemLiquida >= alvo - 1e-9;
  };

  const limites = MLFretes ? MLFretes.FAIXAS_PRECO : [1e9];
  let anterior = 0;

  for (const limite of limites) {
    const referencia = Math.min(limite, Math.max(anterior + 0.01, 1));
    const tf    = taxaFixaDe(referencia, p);
    const frete = freteDe(referencia, peso, p);
    const numerador = cu + tf + frete - (Number(p.rebate) || 0) + (Number(p.embalagem) || 0);
    let pr = centavos(Math.ceil((numerador / fixo) * 100) / 100);

    if (pr > anterior && pr <= limite) {
      for (let i = 0; i < 30 && !entrega(pr); i++) pr = centavos(pr + 0.01);
      if (pr <= limite && entrega(pr)) return pr;
    }
    anterior = limite;
  }

  // não coube em nenhuma faixa: procura o menor preço que entregue a margem
  let pr = centavos(cu / fixo);
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

return {PADRAO, brl, parseNumero, centavos, comissaoPct, taxaFixaDe, freteDe,
        analisar, precoPara, custoTotal};
});
