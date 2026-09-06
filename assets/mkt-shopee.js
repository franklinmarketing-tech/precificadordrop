/* ══════════════════════════════════════════════════════════════════════════
   SHOPEE BRASIL — modelo de tarifas

   Política vigente desde 01/03/2026 (comunicada em 04/02/2026), artigo
   oficial revisado em 23/06/2026. Fonte: seller.shopee.com.br, artigos
   18483 (CNPJ), 18484 (CPF) e 26839 (comunicado de 2026).

   A Shopee cobra diferente de todo mundo, e isso muda a conta:

   • a comissão NÃO é por categoria. É por FAIXA DE PREÇO, e cada faixa soma
     um percentual e um valor fixo. Tabelas de comissão por categoria que
     circulam em blogs confundem com o programa de Afiliados — não existem na
     política do vendedor;
   • o TETO de R$ 100 por item ACABOU em março de 2026. Quem calcular com
     teto vai achar que produto caro paga menos do que paga;
   • no modelo padrão o VENDEDOR NÃO PAGA FRETE. O frete é do comprador, e a
     Shopee subsidia com cupom. O vendedor só é debitado em três casos:
     peso declarado menor que o real, pacote fora das dimensões (R$ 50) e
     devolução por culpa dele (frete + R$ 15).

   O salto do valor fixo é grande: R$ 4 até R$ 79,99 e R$ 16 logo acima.
   Um produto de R$ 80 paga R$ 27,20 de comissão; um de R$ 79, R$ 19,80.
   Vale mais vender a 79 do que a 85 — o app mostra isso na conferência.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mkt-engine.js'));
  else root.MktShopee = factory(root.MktEngine);
})(typeof self !== 'undefined' ? self : this, function (MK) {

/* pct: percentual sobre o item · fixo: valor somado por item vendido */
const FAIXAS = [
  {ate: 79.99,    pct: 0.20, fixo: 4},
  {ate: 99.99,    pct: 0.14, fixo: 16},
  {ate: 199.99,   pct: 0.14, fixo: 20},
  {ate: Infinity, pct: 0.14, fixo: 26},
];

/* Abaixo de R$ 8 o fixo do CNPJ deixa de ser R$ 4 e vira metade do preço. */
const PISO_METADE = 8;

/* CPF que passa de 450 pedidos em 90 dias paga R$ 3 a mais por item. */
const ADICIONAL_CPF = 3;

const PADRAO = {
  versao: 1,
  conta: 'cnpj',            // 'cnpj' | 'cpf'
  cpfAcimaDe450: false,     // o adicional de R$ 3 só vale acima desse volume
  logistica: 'shopee',      // 'shopee' (SPX/Correios/Full) | 'propria'
  campanhaDestaque: false,  // +3,5% para quem entra nas campanhas
  antecipacao: 'nao',       // 'nao' | 'oficial' (1%) | 'indicado' (2,5%) | 'comum' (3,5%)
  freteManual: 0,           // coparticipação na logística própria
  freteAutomatico: true,
  usarPesoVolumetrico: true,
  divisorVolumetrico: 6000,
  pesoPadrao: 0,
  rebate: 0,
  aliquotaImposto: 0,
  taxaDevolucao: 0,
  embalagem: 0,
  margemAlvo: 0.20,
};

function faixaDe(preco) {
  for (const f of FAIXAS) if (preco <= f.ate) return f;
  return FAIXAS[FAIXAS.length - 1];
}

/* ── comissão ──────────────────────────────────────────────────────────────
   Devolve a fração do preço; o valor fixo da faixa vira fração equivalente
   àquele preço, para o motor genérico multiplicar. */
function comissaoParts(p, preco) {
  const pr = Number(preco) || 0;
  const f = faixaDe(pr);

  let pct = f.pct, fixo = f.fixo;
  /* Abaixo de R$ 8 o fixo do CNPJ vira metade do preço — deixa de ser valor
     fixo e vira percentual, então entra no pct e não no fixo. */
  if (pr > 0 && pr < PISO_METADE) { pct += 0.5; fixo = 0; }
  if (p.conta === 'cpf' && p.cpfAcimaDe450) fixo += ADICIONAL_CPF;

  if (p.campanhaDestaque) pct += 0.035;
  const ant = {oficial: 0.01, indicado: 0.025, comum: 0.035}[p.antecipacao];
  if (ant) pct += ant;

  return {pct, fixo};
}

/* O valor fixo já entra na comissão — a Shopee o trata como parte dela, não
   como linha separada. Aqui fica zero para não cobrar duas vezes. */
function taxaFixaDe() { return 0; }

/* ── frete ─────────────────────────────────────────────────────────────────
   No modelo padrão o vendedor não paga. Na logística própria há
   coparticipação: 25% do cupom de frete, com teto de R$ 10 por pedido — e
   só quando o comprador usa cupom, então o valor entra à mão. */
function freteDe(preco, kg, p) {
  if (p.logistica === 'propria') return Math.min(Number(p.freteManual) || 0, 10);
  return 0;
}

function faixaPreco(pr) {
  const f = faixaDe(pr);
  const nome = f.ate === Infinity ? 'acima de R$ 200' : `até R$ ${String(f.ate).replace('.', ',')}`;
  return `${nome} · ${(f.pct*100).toFixed(0)}% + R$ ${f.fixo}`;
}
function faixaPeso(kg) {
  return kg ? `${String(+Number(kg).toFixed(3)).replace('.', ',')} kg` : '';
}

/* Os preços onde a comissão muda de degrau. Os limites das faixas entram e,
   logo acima de cada um, o preço dá um salto — é onde vale conferir. */
function limites() {
  return [PISO_METADE, 79.99, 99.99, 199.99];
}

const motor = MK.criarMotor({
  id: 'shopee', nome: 'Shopee',
  PADRAO, PESO_MAXIMO: 30, PRECO_MINIMO: 0,
  /* no modelo padrão o vendedor não paga frete: zero é o valor certo */
  avisaFreteZero: false,
  comissaoParts, taxaFixaDe, freteDe, limites, faixaPreco, faixaPeso,
});

const FORM = [
  {id:'conta', tipo:'select', rot:'Tipo de conta',
   ajuda:'CPF paga R$ 3 a mais por item depois de 450 pedidos em 90 dias',
   opcoes:[{v:'cnpj', t:'CNPJ'}, {v:'cpf', t:'CPF'}]},
  {id:'cpfAcimaDe450', tipo:'switch', rot:'Já passei de 450 pedidos em 90 dias',
   ajuda:'só então o adicional de R$ 3 por item começa a valer',
   quando: p => p.conta === 'cpf'},
  {id:'logistica', tipo:'select', rot:'Quem entrega',
   ajuda:'Na logística da Shopee o vendedor não paga frete — é do comprador, subsidiado por cupom',
   opcoes:[{v:'shopee', t:'Logística da Shopee (SPX, Correios, Full)'},
           {v:'propria', t:'Logística própria'}]},
  {id:'freteManual', tipo:'numero', rot:'Coparticipação no frete (R$)',
   ajuda:'Na logística própria o vendedor paga 25% do cupom, no máximo R$ 10 por pedido',
   quando: p => p.logistica === 'propria'},
  {id:'antecipacao', tipo:'select', rot:'Antecipação (Shopee Acelera)',
   ajuda:'Opcional, só para vendedores selecionados',
   opcoes:[{v:'nao', t:'Não uso'}, {v:'oficial', t:'Loja Oficial — 1%'},
           {v:'indicado', t:'Vendedor Indicado — 2,5%'}, {v:'comum', t:'Demais — 3,5%'}]},
  {id:'campanhaDestaque', tipo:'switch', rot:'Campanhas de Destaque',
   ajuda:'soma 3,5% sobre a venda, para quem entra no programa'},
];

/* O que a documentação da Shopee não responde. Aparece na tela: quem
   precifica milhares de itens tem de saber onde a conta pode variar, e
   descobrir isso no extrato é tarde. */
const RESSALVAS = [
  'A Shopee diz "por item vendido" mas não esclarece se 3 unidades do mesmo produto num pedido geram uma taxa fixa ou três. Com R$ 26 de taxa, a diferença é grande — confira num extrato real antes de fechar sua margem.',
  'Também não está claro se a faixa de preço olha o valor unitário ou o total da linha do pedido.',
];

return Object.assign({}, motor, {
  FORM, RESSALVAS, FAIXAS, PISO_METADE, ADICIONAL_CPF,
  TAXA_DEVOLUCAO_CULPA: 15, TAXA_VOLUMOSO: 50,
});
});
