/* ══════════════════════════════════════════════════════════════════════════
   Os números dos ebooks saem daqui — dos mesmos motores que o app usa.

   Nenhuma tabela é digitada à mão. Se uma tarifa mudar no motor, o ebook
   muda junto na próxima geração, e o material nunca ensina uma conta que o
   app não faz mais. É a diferença entre um PDF que envelhece e um que
   acompanha.
   ══════════════════════════════════════════════════════════════════════════ */
const ML = require('../assets/ml-engine.js');
const MF = require('../assets/ml-fretes.js');
const SH = require('../assets/mkt-shopee.js');
const AZ = require('../assets/mkt-amazon.js');

const brl = v => ML.brl(v);
const pct = (v, casas = 0) => (v * 100).toFixed(casas).replace('.', ',') + '%';
const num = (v, casas = 2) => Number(v).toFixed(casas).replace('.', ',');

const PML = {reputacao: 'verde', tipoAnuncio: 'classico'};

/* ── 1. margem não é markup ────────────────────────────────────────────────
   O erro mais caro do dropshipping: multiplicar o custo por 1,3 achando que
   isso dá 30% de margem. */
function margemVersusMarkup(custo = 50, peso = 0.5) {
  const linhas = [0.10, 0.15, 0.20, 0.25, 0.30, 0.40].map(m => {
    const preco = ML.precoPara(custo, m, peso, PML);
    if (preco == null) return {margem: m, impossivel: true};
    const a = ML.analisar(preco, custo, peso, PML);
    return {
      margem: m, preco, markup: a.markup,
      sobra: a.lucroLiquido,
      /* o preço que a conta de padaria daria */
      ingenuo: Math.round(custo * (1 + m) * 100) / 100,
    };
  });

  /* o caso concreto do erro: custo × 1,3 */
  const ingenuo = Math.round(custo * 1.3 * 100) / 100;
  const real = ML.analisar(ingenuo, custo, peso, PML);
  const certo = ML.precoPara(custo, 0.30, peso, PML);

  return {
    custo, peso, linhas,
    erro: {
      preco: ingenuo,
      margemReal: real.margemLiquida,
      sobra: real.lucroLiquido,
      precoCerto: certo,
      diferenca: certo - ingenuo,
    },
  };
}

/* ── 2. para onde vai cada real ───────────────────────────────────────────── */
function ondeVaiCadaReal(preco = 100, custo = 40, peso = 1) {
  const a = ML.analisar(preco, custo, peso, PML);
  return {
    preco, custo, peso,
    parcelas: [
      {nome: 'Custo do produto',           valor: a.custo},
      {nome: `Comissão do Mercado Livre (${pct(a.comissaoPct)})`, valor: a.comissao},
      {nome: 'Taxa fixa',                  valor: a.taxaFixa},
      {nome: 'Envio',                      valor: a.frete},
    ].filter(x => x.valor > 0),
    sobra: a.lucroLiquido,
    margem: a.margemLiquida,
  };
}

/* ── 3. o produto barato e a taxa fixa ─────────────────────────────────────
   Abaixo de R$ 79 o Mercado Livre cobra um valor fixo por venda. Num produto
   de R$ 30 esse valor pesa cinco vezes mais do que num de R$ 150. */
function pesoDaTaxaFixa() {
  return [20, 30, 45, 60, 78, 90, 150].map(preco => {
    const a = ML.analisar(preco, preco * 0.45, 0.4, PML);
    return {
      preco, taxaFixa: a.taxaFixa,
      pesoNaVenda: a.taxaFixa / preco,
      comissao: a.comissao,
      sobra: a.lucroLiquido,
      margem: a.margemLiquida,
    };
  });
}

/* ── 4. as tabelas oficiais de cada canal ─────────────────────────────────── */
function tabelaShopee() {
  return {
    faixas: SH.FAIXAS.map(f => ({
      ate: f.ate, pct: f.pct, fixo: f.fixo,
      rotulo: f.ate == null || !isFinite(f.ate) ? 'acima de R$ 200' : 'até ' + brl(f.ate),
    })),
    pisoMetade: SH.PISO_METADE,
    adicionalCpf: SH.ADICIONAL_CPF,
    devolucao: SH.TAXA_DEVOLUCAO_CULPA,
    volumoso: SH.TAXA_VOLUMOSO,
    /* o salto dos R$ 80, medido */
    salto: [79.00, 79.99, 80.00, 85.00, 90.00].map(preco => {
      const a = SH.analisar(preco, 45, 0.5, {});
      return {preco, comissao: a.comissao, sobra: a.lucroLiquido, margem: a.margemLiquida};
    }),
  };
}

function tabelaAmazon() {
  const porPct = {};
  AZ.CATEGORIAS.forEach(c => {
    const k = c.pct;
    (porPct[k] = porPct[k] || []).push(c.nome);
  });
  return {
    grupos: Object.keys(porPct).sort((a, b) => a - b).map(k => ({
      pct: Number(k), n: porPct[k].length, exemplos: porPct[k].slice(0, 4),
    })),
    mensalidade: AZ.MENSALIDADE_PROFISSIONAL,
    frete: [[0.3, 50], [0.5, 100], [1, 150], [2, 200], [5, 300], [9, 400]].map(([kg, pr]) => ({
      kg, preco: pr, frete: AZ.freteDe(pr, kg, AZ.PADRAO),
    })),
  };
}

function tabelaMercadoLivre() {
  return {
    comissao: ML.PADRAO.comissaoClassico,
    comissaoPremium: ML.PADRAO.comissaoPremium,
    taxaFixa: ML.PADRAO.taxaFixa.filter(f => isFinite(f.ate) && f.ate < 1e6),
    faixasFrete: MF.FAIXAS_PRECO.filter(v => isFinite(v) && v < 1e6),
    reputacao: MF.REPUTACOES.map(r => r.id),
    /* a mesma caixa nas três reputações */
    porReputacao: MF.REPUTACOES.map(r => {
      const p = Object.assign({}, PML, {reputacao: r.id});
      const a = ML.analisar(89.99, 40, 1.2, p);
      return {reputacao: r.nome || r.id, frete: a.frete, sobra: a.lucroLiquido, margem: a.margemLiquida};
    }),
  };
}

/* ── 5. o mesmo produto nos três canais ────────────────────────────────────
   A comparação que o vendedor não consegue fazer sozinho: o preço que entrega
   a MESMA margem em cada lugar. */
function tresCanais(margem = 0.20) {
  return [20, 45, 80, 150, 300].map(custo => {
    const peso = custo < 50 ? 0.5 : custo < 150 ? 1 : 2;
    const ml = ML.precoPara(custo, margem, peso, PML);
    const sh = SH.precoPara(custo, margem, peso, {});
    const az = AZ.precoPara(custo, margem, peso, {});
    const validos = [ml, sh, az].filter(v => v != null);
    const menor = validos.length ? Math.min(...validos) : null;
    return {
      custo, peso, ml, sh, az, menor,
      vencedor: menor == null ? null : (menor === ml ? 'Mercado Livre' : menor === sh ? 'Shopee' : 'Amazon'),
      espalhamento: validos.length > 1 ? (Math.max(...validos) - menor) / menor : 0,
    };
  });
}

/* ── 6. os degraus de cada canal ───────────────────────────────────────────
   Onde cobrar um centavo a mais custa a faixa inteira. */
function degrausDoCanal(motor, params, peso, limites, fracaoCusto) {
  return limites.map(L => {
    /* o custo acompanha o degrau: um produto que se vende a R$ 20 não tem o
       mesmo custo de um de R$ 200, e usar um custo fixo faria as faixas
       baixas aparecerem no prejuízo por um motivo que não é o degrau */
    const custo = Math.round(L * (fracaoCusto || 0.45) * 100) / 100;
    const noDegrau = motor.analisar(L, custo, peso, params);
    const acima = motor.analisar(Math.round((L + 0.01) * 100) / 100, custo, peso, params);
    if (!noDegrau || !acima) return null;
    const perda = noDegrau.lucroLiquido - acima.lucroLiquido;
    if (perda <= 0.02) return null;
    /* degrau em preço que já dá prejuízo não ensina nada sobre degrau: ali o
       problema é o produto ser barato demais para o canal, que é outra lição */
    if (noDegrau.lucroLiquido <= 0) return null;

    /* Até que preço continua rendendo menos do que estar no degrau. Começa
       ACIMA dele: partindo do próprio degrau o teste passaria de imediato,
       porque ali o lucro é igual a ele mesmo. */
    let empate = null;
    for (let pr = L + 0.01; pr < L * 2 + 40; pr = Math.round((pr + 0.05) * 100) / 100) {
      const a = motor.analisar(pr, custo, peso, params);
      if (a && a.lucroLiquido >= noDegrau.lucroLiquido) { empate = pr; break; }
    }
    return {
      degrau: L, custo,
      sobraNoDegrau: noDegrau.lucroLiquido,
      sobraUmCentavoAcima: acima.lucroLiquido,
      perda, empate,
      /* quanto se pode cobrar a mais sem ganhar nada com isso */
      faixaMorta: empate == null ? null : empate - L,
    };
  }).filter(Boolean);
}

function degraus() {
  return {
    shopee: degrausDoCanal(SH, {}, 0.5, [79.99, 99.99, 199.99], 0.56),
    ml: degrausDoCanal(ML, PML, 0.5, MF.FAIXAS_PRECO.filter(v => isFinite(v) && v < 1e6), 0.4),
  };
}


/* ── 7. peso volumétrico ──────────────────────────────────────────────────── */
function volumetrico() {
  const casos = [
    {nome: 'Caixa pequena e densa', a: 20, l: 15, c: 10, kg: 1.2},
    {nome: 'Caixa grande e leve',   a: 45, l: 40, c: 35, kg: 2.0},
    {nome: 'Moto elétrica infantil', a: 45, l: 91, c: 43, kg: 13},
  ];
  return casos.map(x => {
    const vol = (x.a * x.l * x.c) / 6000;
    const cobrado = Math.max(vol, x.kg);
    const a = ML.analisar(199, 80, x.kg, PML, {altura: x.a, largura: x.l, comprimento: x.c});
    return Object.assign({}, x, {
      volumetrico: vol, cobrado,
      frete: a ? a.frete : null,
      usou: a ? a.pesoUsou : null,
    });
  });
}

module.exports = {
  brl, pct, num,
  margemVersusMarkup, ondeVaiCadaReal, pesoDaTaxaFixa,
  tabelaShopee, tabelaAmazon, tabelaMercadoLivre,
  tresCanais, degraus, volumetrico,
};
