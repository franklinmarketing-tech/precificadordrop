/* ══════════════════════════════════════════════════════════════════════════
   Precificador Drop — Motor de taxas do Mercado Livre
   FATURAM (receita líquida) = PREÇO × multiplicador − taxa fixa
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MLEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* Faixas oficiais: mn/mx = limites de preço, mu = multiplicador (o que fica
   com o vendedor antes da taxa fixa), fx = taxa fixa em R$.                 */
const FAIXAS = [
  {mn:5,    mx:12.99,   mu:0.385, fx:0,     cf:'50% do preço', fr:'R$ 0 / 5,65',  co:'11,5%', lb:'Faixa 1 (R$ 5,00 – R$ 12,99)'},
  {mn:13,   mx:18.99,   mu:0.885, fx:5.65,  cf:'R$ 5,65',      fr:'R$ 6,35',      co:'11,5%', lb:'Faixa 2 (R$ 13,00 – R$ 18,99)'},
  {mn:19,   mx:48.99,   mu:0.885, fx:6.55,  cf:'R$ 6,55',      fr:'R$ 6,50/6,65', co:'11,5%', lb:'Faixa 3 (R$ 19,00 – R$ 48,99)'},
  {mn:49,   mx:78.99,   mu:0.885, fx:7.75,  cf:'—',            fr:'R$ 7,75',      co:'11,5%', lb:'Faixa 3 (R$ 49,00 – R$ 78,99)'},
  {mn:79,   mx:118.99,  mu:0.885, fx:12.35, cf:'—',            fr:'R$ 12,35',     co:'11,5%', lb:'Faixa 4 (R$ 79,00 – R$ 118,99)'},
  {mn:119,  mx:119.99,  mu:0.885, fx:14.35, cf:'—',            fr:'R$ 14,35',     co:'11,5%', lb:'Faixa 4 (R$ 119,00)'},
  {mn:120,  mx:149.99,  mu:0.885, fx:16.45, cf:'—',            fr:'R$ 16,45',     co:'11,5%', lb:'Faixa 4 (R$ 120,00 – R$ 149,99)'},
  {mn:150,  mx:199.99,  mu:0.895, fx:18.45, cf:'—',            fr:'R$ 18,45',     co:'10,5%', lb:'Faixa 4 (R$ 150,00 – R$ 199,99)'},
  {mn:200,  mx:699.99,  mu:0.895, fx:20.95, cf:'—',            fr:'R$ 20,95',     co:'10,5%', lb:'Faixa 4 (R$ 200,00 – R$ 699,99)'},
  {mn:700,  mx:4999.99, mu:0.885, fx:20.95, cf:'—',            fr:'R$ 20,95',     co:'11,5%', lb:'Faixa 4 (R$ 700,00 – R$ 4.999,99)'},
  {mn:5000, mx:1e9,     mu:0.885, fx:26.25, cf:'—',            fr:'R$ 26,25',     co:'11,5%', lb:'Faixa 4 (R$ 5.000,00+)'},
];

/* Preço sempre em centavos: as faixas são contíguas em passos de R$ 0,01
   (…12,99 | 13,00…), então um valor com mais casas cairia num vão. */
const emCentavos = p => Math.round(p * 100) / 100;
const faixaDe = p => {
  const v = emCentavos(p);
  return FAIXAS.find(r => v >= r.mn && v <= r.mx) || null;
};
const faturam = p => {
  const v = emCentavos(p);
  const r = faixaDe(v);
  return r ? +(v * r.mu - r.fx).toFixed(2) : null;
};

/* Preço de venda que entrega a margem desejada sobre a receita líquida.
   O faturamento é arredondado para centavos, então conferimos a margem
   real e subimos o preço em centavos até alcançá-la de fato. */
function precoPara(custo, margemPct) {
  const alcanca = p => {
    const fat = faturam(p);
    return fat != null && fat > custo && (fat - custo) / fat >= margemPct - 1e-9;
  };
  const ajustar = p => {
    for (let i = 0; i < 20 && !alcanca(p); i++) p = emCentavos(p + 0.01);
    return alcanca(p) ? p : null;
  };

  for (const r of FAIXAS) {
    const fat = custo / (1 - margemPct);
    const p   = emCentavos(Math.ceil(((fat + r.fx) / r.mu) * 100) / 100);
    if (p >= r.mn && p <= r.mx && p >= 5) {
      const ok = ajustar(p);
      if (ok != null) return ok;
    }
  }
  // borda: menor preço de faixa que ainda alcança a margem
  for (const r of FAIXAS) {
    if (r.mn >= 5 && alcanca(r.mn)) return r.mn;
  }
  return null;
}

/* Número em formato brasileiro: "1.365,47" → 1365.47, "31,40" → 31.4.
   O último separador presente é o decimal; um ponto seguido de exatamente
   3 dígitos no fim é separador de milhar ("1.365" → 1365).              */
function parseNumero(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let s = String(v == null ? '' : v).trim();
  if (!s) return NaN;
  s = s.replace(/[R$\s ]/gi, '');
  // a string inteira precisa ser numerica — senao "12 unidades" viraria 12
  if (!/^[+-]?[\d.,]+$/.test(s)) return NaN;
  const temVirgula = s.includes(','), temPonto = s.includes('.');

  if (temVirgula && temPonto) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')   // 1.365,47
      : s.replace(/,/g, '');                     // 1,365.47
  } else if (temVirgula) {
    s = s.replace(',', '.');
  } else if (temPonto && /\.\d{3}$/.test(s) && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');                    // 1.365 → 1365
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}

/* Custo total no modelo drop: fornecedor + frete até o cliente. */
const custoTotal = (fornecedor, frete) => {
  const c = parseNumero(fornecedor);
  if (!c || isNaN(c) || c <= 0) return null;
  const f = parseNumero(frete);
  return +(c + (isNaN(f) ? 0 : f)).toFixed(2);
};

const brl = v => v == null ? '—' :
  'R$ ' + Number(v).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});

return { FAIXAS, faixaDe, faturam, precoPara, custoTotal, parseNumero, brl };
});
