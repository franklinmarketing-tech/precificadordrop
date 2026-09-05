/* ══════════════════════════════════════════════════════════════════════════
   MOTOR DE PRECIFICAÇÃO GENÉRICO

   A conta é a mesma em qualquer marketplace: do preço saem comissão, taxa
   fixa e frete; do que sobra tira-se o custo, o imposto, a devolução e a
   embalagem; o que resta é lucro. O que muda de um canal para outro é só
   QUANTO cada taxa cobra.

   Por isso aqui mora a conta, e cada canal entrega um "modelo de taxas":
   três funções (comissão, taxa fixa, frete) e a lista de preços onde essas
   taxas mudam de degrau. O motor do Mercado Livre continua o dele, testado e
   intocado — este serve aos canais novos.

   As funções de leitura (número, peso, cabeçalho, aba) vêm do ml-engine: são
   as mesmas planilhas, os mesmos fornecedores e os mesmos erros de digitação,
   independentemente de onde o produto vai ser vendido.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./ml-engine.js'));
  else root.MktEngine = factory(root.MLEngine || root.ML);
})(typeof self !== 'undefined' ? self : this, function (ML) {

const centavos = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/* Avisos comuns a qualquer canal. O texto fala do que a pessoa vê na
   planilha, não do que o código faz. */
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
    descricao:'Sem peso, sem medidas, sem peso padrão e sem frete manual, o envio entrou como R$ 0,00 — o lucro real será menor.',
    comoResolver:'Clique em "ver as linhas" e digite o peso de cada produto na coluna Peso. O preço recalcula na hora, só naquela linha.'},
  lucro_negativo: {gravidade:'erro', titulo:'Prejuízo no preço sugerido',
    descricao:'Mesmo no preço calculado, esses produtos não cobrem os custos.',
    comoResolver:'Confira o custo e o peso dessas linhas — quase sempre um dos dois está errado. Se estiverem certos, o produto não fecha conta neste canal.'},
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
  peso_alto: {gravidade:'alerta', titulo:'Peso acima do limite',
    descricao:'Acima do peso que este canal entrega. Confira se gramas entraram como quilos.',
    comoResolver:'Veja as linhas e corrija o peso na tabela. O frete dessas linhas não é confiável.'},
  preco_baixo: {gravidade:'alerta', titulo:'Preço abaixo do mínimo do canal',
    descricao:'O canal não aceita anúncio abaixo desse valor.',
    comoResolver:'Produto de custo muito baixo costuma só fechar conta em kit. Junte unidades e precifique o kit.'},
  markup_alto: {gravidade:'alerta', titulo:'Preço muito acima do custo',
    descricao:'O preço ficou bem acima do que as taxas e o frete explicam. Confira se o produto vende nesse valor.',
    comoResolver:'Veja as linhas e compare com o preço de mercado. Se não vender por esse valor, reduza a margem no passo 2.'},
};

/* ── a fábrica ──────────────────────────────────────────────────────────────
   Um canal entrega: PADRAO (os parâmetros), comissaoDe, taxaFixaDe, freteDe
   e limites (os preços onde alguma taxa muda de degrau). O resto é igual. */
function criarMotor(canal) {
  const PADRAO = canal.PADRAO;

  function pesoVolumetrico(dimensoes, p) {
    if (!p.usarPesoVolumetrico || !dimensoes) return 0;
    const a = Number(dimensoes.altura) || 0;
    const l = Number(dimensoes.largura) || 0;
    const c = Number(dimensoes.comprimento) || 0;
    const div = Number(p.divisorVolumetrico) || 6000;
    if (!a || !l || !c || div <= 0) return 0;
    return +((a * l * c) / div).toFixed(3);
  }

  /* o canal cobra pelo maior entre a balança e o volume */
  function pesoCobravel(pesoReal, dimensoes, p) {
    const real = Number(pesoReal) || 0;
    const vol = pesoVolumetrico(dimensoes, p);
    return {real, volumetrico: vol, cobravel: Math.max(real, vol),
            usou: vol > real ? 'volumétrico' : 'real'};
  }

  function analisar(preco, custo, peso, params, dimensoes) {
    const p = Object.assign({}, PADRAO, params || {});
    const pr = centavos(Number(preco));
    const cu = Number(custo) || 0;
    if (!isFinite(pr) || pr <= 0) return null;

    const parte = canal.comissaoParts(p, pr);
    const comissao = centavos(pr * parte.pct + parte.fixo);
    const pctComissao = pr ? comissao / pr : parte.pct;
    const taxaFixa = centavos(canal.taxaFixaDe(pr, p));
    const pesos    = pesoCobravel(peso, dimensoes, p);
    const frete    = centavos(canal.freteDe(pr, pesos.cobravel || Number(p.pesoPadrao) || 0, p));
    const rebate   = Number(p.rebate) || 0;

    const receitaLiquida = centavos(pr - comissao - taxaFixa - frete + rebate);
    const margemContrib  = centavos(receitaLiquida - cu);

    const imposto   = centavos(pr * (Number(p.aliquotaImposto) || 0));
    const perdas    = centavos(pr * (Number(p.taxaDevolucao) || 0));
    const embalagem = Number(p.embalagem) || 0;

    const lucroLiquido = centavos(margemContrib - imposto - perdas - embalagem);

    return {
      preco: pr, custo: cu, peso: pesos.cobravel || Number(p.pesoPadrao) || 0,
      pesoReal: pesos.real, pesoVolumetrico: pesos.volumetrico, pesoUsou: pesos.usou,
      comissao, comissaoPct: pctComissao, taxaFixa, frete, rebate,
      receitaLiquida, margemContrib, imposto, perdas, embalagem, lucroLiquido,
      margemLiquida: pr ? lucroLiquido / pr : 0,
      margemBruta:   pr ? margemContrib / pr : 0,
      markup:        cu ? pr / cu : 0,
      totalTaxas:    centavos(comissao + taxaFixa + frete + imposto + perdas + embalagem),
      faixaPreco:    canal.faixaPreco ? canal.faixaPreco(pr, p) : '',
      faixaPeso:     canal.faixaPeso ? canal.faixaPeso(pesos.cobravel, p) : '',
    };
  }

  /* O preço que entrega a margem pedida. As taxas mudam em degraus (faixa de
     preço, faixa de peso), então a conta é feita dentro de cada faixa e a
     primeira que fecha vale — resolver direto daria um preço de uma faixa
     usando a taxa de outra. */
  function precoPara(custo, margemAlvo, peso, params, dimensoes) {
    const p = Object.assign({}, PADRAO, params || {});
    const cu = Number(custo);
    const alvo = Number(margemAlvo);
    if (!isFinite(cu) || cu <= 0 || !isFinite(alvo) || alvo >= 1) return null;

    const outros = (Number(p.aliquotaImposto) || 0) + (Number(p.taxaDevolucao) || 0) + alvo;
    const pesos = pesoCobravel(peso, dimensoes, p);
    const kg = pesos.cobravel || Number(p.pesoPadrao) || 0;

    const entrega = pr => {
      const a = analisar(pr, cu, peso, p, dimensoes);
      return a && a.margemLiquida >= alvo - 1e-9;
    };

    const limites = Array.from(new Set(
      (canal.limites(p) || []).concat([1e9]).filter(v => isFinite(v) && v > 0)
    )).sort((a, b) => a - b);

    let anterior = 0;
    for (const limite of limites) {
      /* dentro da faixa a comissão é percentual × preço + valor fixo, então a
         conta fecha em uma linha. Usar a FRAÇÃO de um preço de referência para
         resolver outro preço dava erro grande: numa faixa com R$ 26 fixos, a
         fração no piso da faixa não é nem parecida com a do topo. */
      const ref = Math.min(limite, Math.max(anterior + 0.01, 0.01));
      const parte = canal.comissaoParts(p, ref);
      const base = 1 - parte.pct - outros;
      if (base <= 0) { anterior = limite; continue; }

      const fixa = canal.taxaFixaDe(ref, p);
      const frete = canal.freteDe(ref, kg, p);
      const embalagem = Number(p.embalagem) || 0;
      const rebate = Number(p.rebate) || 0;

      let pr = centavos((cu + parte.fixo + fixa + frete + embalagem - rebate) / base);
      /* o arredondamento para centavo pode derrubar a margem por um fio */
      for (let i = 0; i < 3 && !entrega(pr); i++) pr = centavos(pr + 0.01);

      if (pr > anterior && pr <= limite && entrega(pr)) return pr;
      anterior = limite;
    }
    return null;
  }

  /* ── uma linha da planilha ─────────────────────────────────────────────── */
  function precificarLinha(entrada, params) {
    const p = Object.assign({}, PADRAO, params || {});
    const avisos = [];
    const linha = entrada.linha;
    const alvo = Number(p.margemAlvo);

    const cru = entrada.custo;
    const vazio = cru === '' || cru == null;
    const custo = vazio ? NaN : ML.parseNumero(cru);
    if (vazio || custo === 0) { avisos.push('sem_custo'); return {linha, custo:null, preco:null, avisos}; }
    if (isNaN(custo) || custo < 0) { avisos.push('custo_invalido'); return {linha, custo:null, preco:null, avisos}; }

    const pesoCru = entrada.peso;
    const pesoVazio = pesoCru === '' || pesoCru == null;
    const peso = pesoVazio ? NaN : ML.arredPeso(ML.parsePeso(pesoCru));
    const kg = isNaN(peso) ? 0 : peso;
    const dims = entrada.dimensoes || null;

    if (!pesoVazio && isNaN(peso)) avisos.push('peso_invalido');
    else if (!kg) avisos.push('sem_peso');
    else if (kg < 0.0005) avisos.push('peso_suspeito');
    else if (kg > canal.PESO_MAXIMO) avisos.push('peso_alto');
    if (p.usarPesoVolumetrico && !dims) avisos.push('sem_dimensoes');

    const preco = precoPara(custo, alvo, kg, p, dims);
    if (preco == null) { avisos.push('margem_inalcancavel'); return {linha, custo, peso:kg, preco:null, avisos}; }

    const r = analisar(preco, custo, kg, p, dims);
    /* Frete zero é erro onde o vendedor paga o envio. Na Shopee ele não paga
       no modelo padrão — lá zero é o valor certo, e avisar seria alarme falso
       em toda linha. Por isso quem decide é o canal. */
    if (canal.avisaFreteZero !== false && p.freteAutomatico && r.frete === 0)
      avisos.push('frete_zero');
    if (r.lucroLiquido <= 0) avisos.push('lucro_negativo');
    if (canal.PRECO_MINIMO && preco < canal.PRECO_MINIMO) avisos.push('preco_baixo');

    /* markup alto sozinho não é defeito: num produto barato as taxas fixas
       explicam quase todo o preço. O que merece atenção é subir ALÉM disso. */
    const explicado = custo + r.comissao + r.taxaFixa + r.frete;
    if (r.markup > 5 && preco > explicado * 1.6) avisos.push('markup_alto');

    return Object.assign({linha, avisos}, r);
  }

  function conferir(linhas) {
    const ordem = {erro:0, alerta:1, info:2};
    const mapa = new Map();
    linhas.forEach((l, i) => (l.avisos || []).forEach(id => {
      if (!mapa.has(id)) mapa.set(id, []);
      mapa.get(id).push(i);
    }));
    const grupos = Array.from(mapa.entries()).map(([id, idx]) => {
      const a = AVISOS[id] || {gravidade:'info', titulo:id, descricao:''};
      return {id, gravidade:a.gravidade, titulo:a.titulo, descricao:a.descricao,
              comoResolver:a.comoResolver || '', n:idx.length, linhas:idx};
    }).sort((x, y) => (ordem[x.gravidade] - ordem[y.gravidade]) || (y.n - x.n));

    const comErro = linhas.filter(l => (l.avisos||[]).some(id => (AVISOS[id]||{}).gravidade === 'erro')).length;
    return {
      total: linhas.length,
      precificados: linhas.filter(l => l.preco != null).length,
      comErro,
      comAlerta: linhas.filter(l => (l.avisos||[]).some(id => (AVISOS[id]||{}).gravidade === 'alerta')).length,
      revisar: linhas.filter(l => (l.avisos || []).length).length,
      ok: comErro === 0,
      grupos,
    };
  }

  function precificarLote(entradas, params) {
    const linhas = (entradas || []).map(e => precificarLinha(e, params));
    return {linhas, conferencia: conferir(linhas)};
  }

  return {
    id: canal.id, nome: canal.nome, PADRAO, AVISOS,
    PESO_MAXIMO: canal.PESO_MAXIMO, PRECO_MINIMO: canal.PRECO_MINIMO,
    brl: ML.brl, parseNumero: ML.parseNumero, parsePeso: ML.parsePeso,
    arredPeso: ML.arredPeso, detectarCabecalho: ML.detectarCabecalho,
    escolherAba: ML.escolherAba,
    pesoVolumetrico, pesoCobravel,
    comissaoDe: (p, pr) => {
      const x = canal.comissaoParts(p, pr);
      return pr ? x.pct + x.fixo / pr : x.pct;
    },
    comissaoParts: canal.comissaoParts,
    taxaFixaDe: canal.taxaFixaDe, freteDe: canal.freteDe,
    analisar, precoPara, precificarLinha, precificarLote, conferir,
  };
}

return {criarMotor, AVISOS, centavos};
});
