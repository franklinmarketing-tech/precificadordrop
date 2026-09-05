/* ══════════════════════════════════════════════════════════════════════════
   AMAZON BRASIL — modelo de tarifas

   Levantado em venda.amazon.com.br/precos (a página carrega o carimbo
   "comissões atualizadas em 20/01/2025" e "tarifas de logística atualizadas
   em 01/08/2025"). É a fonte pública mais autoritativa: a tabela do Seller
   Central exige login.

   Três coisas que mudam a conta em relação ao Mercado Livre:

   • a comissão é POR CATEGORIA, de 10% a 15%, e tem PISO em reais — se o
     percentual der menos que o piso, cobra-se o piso. Produto barato paga
     proporcionalmente muito mais;
   • duas categorias são escalonadas: acessórios de eletrônicos cobram 15%
     até R$ 100 e 10% no que passar; móveis, o mesmo com corte em R$ 200;
   • NÃO existe taxa de fechamento no Brasil. Procurei na página de preços
     (a palavra não aparece) e nos termos; o que existe no lugar é o piso da
     comissão. As menções que circulam vêm de blogs copiando a estrutura dos
     Estados Unidos.

   A comissão incide sobre o preço TOTAL pago pelo comprador — produto mais
   frete cobrado dele. Quando o vendedor entrega por conta própria e cobra
   frete, esse frete entra na base.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mkt-engine.js'));
  else root.MktAmazon = factory(root.MktEngine);
})(typeof self !== 'undefined' ? self : this, function (MK) {

/* ── comissão por categoria ────────────────────────────────────────────────
   pct: percentual · mín: piso em reais · corte/pctAcima: as escalonadas.
   A página separa as categorias em dois blocos de piso (R$ 1 e R$ 2). O
   texto de abertura da mesma página fala só em R$ 1, então há contradição na
   fonte — seguimos a tabela, que é mais específica, e o app deixa o piso
   editável para quem quiser conferir na própria conta. */
const CATEGORIAS = [
  {id:'comidas',      nome:'Comidas e bebidas',                       pct:0.10, min:1},
  {id:'pneus',        nome:'Pneus e rodas',                           pct:0.10, min:1},
  {id:'linhabranca',  nome:'Eletrodomésticos de linha branca',        pct:0.11, min:1},
  {id:'alcoolicas',   nome:'Bebidas alcoólicas',                      pct:0.11, min:1},
  {id:'saude',        nome:'Saúde e cuidados pessoais',               pct:0.12, min:1},
  {id:'industria',    nome:'Indústria e ciência',                     pct:0.12, min:1},

  {id:'tv',           nome:'TV, áudio e cinema em casa',              pct:0.10, min:2},
  {id:'celulares',    nome:'Celulares',                               pct:0.11, min:2},
  {id:'camera',       nome:'Câmera e fotografia',                     pct:0.11, min:2},
  {id:'games',        nome:'Videogames e consoles',                   pct:0.11, min:2},
  {id:'ferramentas',  nome:'Ferramentas e construção',                pct:0.11, min:2},
  {id:'bebes',        nome:'Produtos para bebês',                     pct:0.12, min:2},
  {id:'pet',          nome:'Produtos para animais de estimação',      pct:0.12, min:2},
  {id:'eletroport',   nome:'Eletroportáteis de cuidado pessoal',      pct:0.12, min:2},
  {id:'cozinha',      nome:'Cozinha',                                 pct:0.12, min:2},
  {id:'jardim',       nome:'Jardim e piscina',                        pct:0.12, min:2},
  {id:'brinquedos',   nome:'Brinquedos e jogos',                      pct:0.12, min:2},
  {id:'pc',           nome:'PC',                                      pct:0.12, min:2},
  {id:'automotivo',   nome:'Peças e acessórios automotivos',          pct:0.12, min:2},
  {id:'casa',         nome:'Casa',                                    pct:0.12, min:2},
  {id:'esportes',     nome:'Esportes, aventura e lazer',              pct:0.12, min:2},
  {id:'instrumentos', nome:'Instrumentos musicais e acessórios',      pct:0.12, min:2},
  {id:'eletrportatil',nome:'Eletrônicos portáteis',                   pct:0.13, min:2},
  {id:'beleza',       nome:'Beleza',                                  pct:0.13, min:2},
  {id:'papelaria',    nome:'Papelaria e escritório',                  pct:0.13, min:2},
  {id:'relogios',     nome:'Relógios',                                pct:0.13, min:2},
  {id:'belezaluxo',   nome:'Beleza de luxo',                          pct:0.14, min:2},
  {id:'bagagem',      nome:'Bagagem e acessórios de viagem',          pct:0.14, min:2},
  {id:'roupas',       nome:'Roupas e acessórios',                     pct:0.14, min:2},
  {id:'calcados',     nome:'Calçados, bolsas e óculos de sol',        pct:0.14, min:2},
  {id:'joias',        nome:'Joias',                                   pct:0.14, min:2},
  {id:'livros',       nome:'Livros',                                  pct:0.15, min:2},
  {id:'video',        nome:'Vídeo e DVD',                             pct:0.15, min:2},
  {id:'musica',       nome:'Música (CDs, LPs)',                       pct:0.15, min:2},
  /* escalonadas: percentual cheio até o corte, menor no que passar */
  {id:'acessorios',   nome:'Acessórios para eletrônicos e PC',        pct:0.15, min:2, corte:100, pctAcima:0.10},
  {id:'moveis',       nome:'Móveis',                                  pct:0.15, min:2, corte:200, pctAcima:0.10},
  {id:'outras',       nome:'Demais categorias',                       pct:0.15, min:2},
];

const PORID = {};
CATEGORIAS.forEach(c => PORID[c.id] = c);

/* ── logística ─────────────────────────────────────────────────────────────
   Abaixo de R$ 79 a tarifa é fixa por faixa de preço, sem olhar o peso — foi
   o que a Amazon fez com a campanha de frete grátis a partir de R$ 19. Acima
   disso volta a valer peso × faixa de preço. */
const FBA_ATE_79 = [
  {ate: 29.99, valor: 5.65},
  {ate: 49.99, valor: 5.85},
  {ate: 78.99, valor: 6.05},
];
const DBA_ATE_79 = [
  {ate: 29.99, valor: 4.50},
  {ate: 49.99, valor: 6.50},
  {ate: 78.99, valor: 6.75},
];

/* faixas de preço da tabela por peso, a partir de R$ 79 */
const FBA_FAIXAS_PRECO = [99.99, 119.99, 149.99, 199.99, Infinity];

/* peso em kg (topo da faixa) e a tarifa em cada faixa de preço acima */
const FBA_PESO = [
  {ate:0.10,  v:[10.05, 12.05, 14.05, 15.05, 15.55]},
  {ate:0.20,  v:[10.45, 12.45, 14.45, 15.45, 16.05]},
  {ate:0.30,  v:[10.95, 12.95, 14.95, 15.95, 16.55]},
  {ate:0.40,  v:[11.45, 13.45, 15.45, 16.95, 17.15]},
  {ate:0.50,  v:[11.95, 13.95, 15.95, 17.05, 17.85]},
  {ate:0.75,  v:[12.05, 14.05, 16.05, 18.45, 18.55]},
  {ate:1.00,  v:[12.45, 14.45, 16.45, 19.05, 19.25]},
  {ate:1.50,  v:[12.95, 14.95, 16.95, 19.45, 20.35]},
  {ate:2.00,  v:[13.05, 15.05, 17.05, 19.95, 21.35]},
  {ate:3.00,  v:[14.05, 16.05, 18.05, 20.05, 22.35]},
  {ate:4.00,  v:[15.05, 17.05, 19.05, 21.95, 23.35]},
  {ate:5.00,  v:[16.05, 18.05, 20.05, 22.95, 24.35]},
  {ate:6.00,  v:[24.05, 27.05, 29.05, 30.05, 30.35]},
  {ate:7.00,  v:[25.05, 28.05, 30.05, 31.05, 33.35]},
  {ate:8.00,  v:[26.05, 29.05, 31.05, 32.05, 35.35]},
  {ate:9.00,  v:[27.05, 30.05, 32.05, 33.05, 37.35]},
  {ate:10.00, v:[35.05, 40.05, 46.05, 51.05, 51.35]},
];
const FBA_KG_ADICIONAL = [3.05, 3.05, 3.05, 3.50, 3.50];

/* A Amazon manda somar 20 g de embalagem ao peso do produto e cobrar pelo
   maior entre o real e o cubado (÷ 6000). */
const EMBALAGEM_KG = 0.020;

const PADRAO = {
  versao: 1,
  categoria: 'outras',
  plano: 'profissional',        // 'profissional' (R$ 19/mês) ou 'individual' (R$ 2/item)
  logistica: 'dba',             // 'fba' | 'dba' | 'propria'
  parcelamento: true,           // 1,5% sobre vendas a partir de R$ 40
  pisoComissao: true,           // aplicar o piso em reais da categoria
  freteManual: 0,               // usado na logística própria e acima de R$ 79 no DBA
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

function faixaAte(tabela, valor) {
  for (const f of tabela) if (valor <= f.ate) return f;
  return null;
}

/* ── comissão ──────────────────────────────────────────────────────────────
   Devolve a FRAÇÃO do preço, para o motor genérico multiplicar. O piso em
   reais e o escalonamento viram fração equivalente àquele preço. */
function comissaoDe(p, preco) {
  const cat = PORID[p.categoria] || PORID.outras;
  const pr = Number(preco);
  if (!isFinite(pr) || pr <= 0) return cat.pct;

  let valor;
  if (cat.corte && pr > cat.corte) {
    valor = cat.corte * cat.pct + (pr - cat.corte) * cat.pctAcima;
  } else {
    valor = pr * cat.pct;
  }
  if (p.pisoComissao && valor < cat.min) valor = cat.min;

  /* o parcelamento sem juros é automático e entra a partir de R$ 40 */
  if (p.parcelamento && pr >= 40) valor += pr * 0.015;

  return valor / pr;
}

/* ── taxa fixa ─────────────────────────────────────────────────────────────
   No plano individual a Amazon cobra R$ 2 por produto vendido. No
   profissional a mensalidade é fixa e não cabe no custo por item. */
function taxaFixaDe(preco, p) {
  return p.plano === 'individual' ? 2 : 0;
}

/* ── logística ─────────────────────────────────────────────────────────── */
function freteDe(preco, kg, p) {
  if (!p.freteAutomatico || p.logistica === 'propria') return Number(p.freteManual) || 0;

  const pr = Number(preco) || 0;
  const tabelaCurta = p.logistica === 'fba' ? FBA_ATE_79 : DBA_ATE_79;
  const curta = faixaAte(tabelaCurta, pr);
  if (curta) return curta.valor;

  /* acima de R$ 79 o DBA depende do estado de origem e a Amazon só publica
     no Seller Central — o app pede o valor em vez de inventar um */
  if (p.logistica === 'dba') return Number(p.freteManual) || 0;

  const peso = (Number(kg) || 0) + EMBALAGEM_KG;
  let col = FBA_FAIXAS_PRECO.findIndex(f => pr <= f);
  if (col < 0) col = FBA_FAIXAS_PRECO.length - 1;

  const faixa = faixaAte(FBA_PESO, peso);
  if (faixa) return faixa.v[col];

  /* acima de 10 kg: a última faixa mais o adicional por quilo */
  const ultima = FBA_PESO[FBA_PESO.length - 1];
  const excedente = Math.ceil(peso - ultima.ate);
  return ultima.v[col] + excedente * FBA_KG_ADICIONAL[col];
}

function faixaPreco(pr, p) {
  const cat = PORID[p.categoria] || PORID.outras;
  if (cat.corte) return pr > cat.corte
    ? `${(cat.pct*100).toFixed(0)}% até R$ ${cat.corte} + ${(cat.pctAcima*100).toFixed(0)}%`
    : `${(cat.pct*100).toFixed(0)}%`;
  return `${(cat.pct*100).toFixed(0)}% · piso R$ ${cat.min.toFixed(2).replace('.', ',')}`;
}

function faixaPeso(kg, p) {
  if (p.logistica === 'propria') return 'logística própria';
  const f = faixaAte(FBA_PESO, (Number(kg)||0) + EMBALAGEM_KG);
  return f ? `até ${String(f.ate).replace('.', ',')} kg` : 'acima de 10 kg';
}

/* os preços onde alguma tarifa muda de degrau */
function limites(p) {
  const cat = PORID[p.categoria] || PORID.outras;
  const L = [29.99, 49.99, 78.99, 99.99, 119.99, 149.99, 199.99, 40];
  if (cat.corte) L.push(cat.corte);
  /* o piso deixa de valer quando o percentual o alcança */
  L.push(cat.min / cat.pct);
  return L;
}

const motor = MK.criarMotor({
  id: 'amazon', nome: 'Amazon',
  PADRAO, PESO_MAXIMO: 22, PRECO_MINIMO: 0,
  comissaoDe, taxaFixaDe, freteDe, limites, faixaPreco, faixaPeso,
});

return Object.assign({}, motor, {
  CATEGORIAS, PORID, FBA_PESO, FBA_ATE_79, DBA_ATE_79, EMBALAGEM_KG,
  MENSALIDADE_PROFISSIONAL: 19,
});
});
