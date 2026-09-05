/* ══════════════════════════════════════════════════════════════════════════
   Testes do Precificador Drop — rode com:  node testes/rodar.js

   Cobre as contas que não podem quebrar: a conferência com a planilha de
   referência, as tabelas oficiais do Mercado Livre e as regras de frete.
   Sem dependências: os motores são UMD e carregam direto no Node.
   ══════════════════════════════════════════════════════════════════════════ */
const ML = require('../assets/ml-engine.js');
const MF = require('../assets/ml-fretes.js');
const PE = require('../assets/planilha-engine.js');
const AE = require('../assets/anuncios-engine.js');
const MK = require('../assets/mkt-engine.js');

let passou = 0, falhou = 0;
const falhas = [];

function ok(condicao, titulo, detalhe) {
  if (condicao) { passou++; return; }
  falhou++;
  falhas.push(titulo + (detalhe ? '\n      ' + detalhe : ''));
}
function perto(a, b, titulo, tolerancia) {
  const t = tolerancia == null ? 0.015 : tolerancia;
  ok(Math.abs(a - b) < t, titulo, `obtido ${a} · esperado ${b}`);
}
function secao(nome) { console.log('\n' + nome); }

/* ── 1. A conta bate com a planilha "Precificação - Mercado Livre" ──────────
   Aba "Precificação", custo 89,99 · preço 188,19 · frete 19 · rebate 4 ·
   devolução 3%. A planilha está em Clássico (célula D8), então a tarifa é
   D6*0,13. O caso Premium abaixo é a mesma linha com D8="Premium".          */
const REF = {comissaoClassico:0.13, comissaoPremium:0.18, freteAutomatico:false,
             freteManual:19, rebate:4, aliquotaImposto:0, taxaDevolucao:0.03,
             embalagem:0};

secao('1. Planilha de referência — Clássico (é como a planilha está salva)');
{
  const r = ML.analisar(188.19, 89.99, 0, Object.assign({tipoAnuncio:'classico'}, REF));
  perto(r.markup,          2.0912, 'markup (D7)');
  perto(r.comissao,        24.46,  'valor da tarifa (D9)');
  perto(r.taxaFixa,        0,      'taxa fixa acima de R$ 79 (D10)');
  perto(r.receitaLiquida,  148.73, 'receita líquida (D13)');
  perto(r.margemContrib,   58.74,  'margem de contribuição (D14)');
  perto(r.margemBruta,     0.3121, 'margem bruta (D15)', 0.0005);
  perto(r.perdas,          5.65,   'perdas com devolução (D19)');
  perto(r.lucroLiquido,    53.09,  'lucro líquido (D21)');
  perto(r.margemLiquida,   0.2821, 'margem líquida (D22)', 0.0005);
}

secao('1b. Mesma linha trocada para Premium (D8="Premium")');
{
  const r = ML.analisar(188.19, 89.99, 0, Object.assign({tipoAnuncio:'premium'}, REF));
  perto(r.comissao,      33.87,  'tarifa passa a 18%');
  perto(r.lucroLiquido,  43.68,  'lucro líquido');
  perto(r.margemLiquida, 0.2321, 'margem líquida', 0.0005);
}

/* ── 2. Custo fixo por faixa (tabela oficial) ─────────────────────────────── */
secao('2. Custo fixo por faixa de preço');
[
  [10.00, 5.00,  'abaixo de R$ 12,50 → 50% do preço'],
  [12.49, 6.245, 'ainda proporcional em 12,49'],
  [12.50, 6.25,  'R$ 12,50 a R$ 29'],
  [29.00, 6.25,  'limite de R$ 29'],
  [29.01, 6.50,  'R$ 29 a R$ 50'],
  [50.00, 6.50,  'limite de R$ 50'],
  [50.01, 6.75,  'R$ 50 a R$ 79'],
  [78.99, 6.75,  'limite de R$ 78,99'],
  [79.00, 0,     'a partir de R$ 79 não tem custo fixo'],
].forEach(([preco, esperado, titulo]) => perto(ML.taxaFixaDe(preco, ML.PADRAO), esperado, titulo));

/* ── 3. Frete: tabelas, reputação e regras de faixa ───────────────────────── */
secao('3. Custo de envio');
{
  perto(MF.custoEnvio(89.99, 1.2, 'verde'),    14.75, 'verde · 1,2 kg · R$ 89,99');
  perto(MF.custoEnvio(89.99, 1.2, 'amarela'),  17.70, 'amarela · mesma linha');
  perto(MF.custoEnvio(89.99, 1.2, 'vermelha'), 29.50, 'vermelha · mesma linha');

  // abaixo de R$ 19 paga no máximo metade do preço
  perto(MF.custoEnvio(15, 0.2, 'vermelha'), 7.50, 'teto de metade do preço (R$ 15)');
  perto(MF.custoEnvio(15, 0.2, 'verde'),    5.65, 'sem teto quando a tabela é menor');

  // frete grátis rápido abaixo de R$ 79 cobra a tabela de R$ 79–99,99
  perto(MF.custoEnvio(45, 0.5, 'verde', false),  6.95,  'frete padrão em R$ 45');
  perto(MF.custoEnvio(45, 0.5, 'verde', true),  13.85,  'frete rápido opcional em R$ 45');

  ok(MF.REPUTACOES.length === 3, 'três reputações cadastradas');
  ok(Object.keys(MF.TABELAS).every(k => MF.TABELAS[k].length === 30),
     '30 faixas de peso em cada tabela');
}

/* ── 4. Peso volumétrico ──────────────────────────────────────────────────── */
secao('4. Peso volumétrico');
{
  perto(ML.pesoVolumetrico({altura:20, largura:30, comprimento:40}, ML.PADRAO), 4,
        'exemplo da regra: 20 × 30 × 40 ÷ 6.000', 0.001);

  const a = ML.pesoCobravel(13, {altura:45, largura:91, comprimento:43}, ML.PADRAO);
  ok(a.usou === 'volumétrico', 'usa o volumétrico quando ele é maior', `usou ${a.usou}`);
  perto(a.cobravel, 29.348, 'peso cobrável da moto elétrica', 0.01);

  const b = ML.pesoCobravel(4.6, {altura:36, largura:71, comprimento:8}, ML.PADRAO);
  ok(b.usou === 'real', 'usa o peso da balança quando ele é maior', `usou ${b.usou}`);
}

/* ── 5. Números em formato brasileiro ─────────────────────────────────────── */
secao('5. Leitura de números');
[
  ['1.365,47', 1365.47], ['31,40', 31.4], ['R$ 149,99', 149.99],
  ['1.365', 1365], ['1.5', 1.5], ['12', 12], ['1,365.47', 1365.47],
].forEach(([txt, esperado]) => perto(ML.parseNumero(txt), esperado, `"${txt}"`, 0.001));

[['12unidades'], ['5 anos'], ['abc'], ['']].forEach(([txt]) =>
  ok(isNaN(ML.parseNumero(txt)), `"${txt}" não vira número`));

/* ── 5b. Peso com unidade escrita junto ───────────────────────────────────── */
secao('5b. Leitura de peso (sempre em kg)');
[
  ['1,5', 1.5], ['1,5 kg', 1.5], ['1,5kg', 1.5], ['2,200 KG', 2.2],
  ['500g', 0.5], ['500 g', 0.5], ['800mg', 0.0008], ['0,001', 0.001],
].forEach(([txt, esperado]) => perto(ML.arredPeso(ML.parsePeso(txt)), esperado, `"${txt}"`, 1e-9));

/* Um ponto com três casas é decimal em peso, mesmo que em preço seja milhar:
   ler 1,091 kg como 1091 kg jogaria o produto na última faixa de frete. */
perto(ML.parsePeso('1.091'), 1.091, '"1.091" em peso é 1,091 kg', 1e-9);
perto(ML.parseNumero('1.365'), 1365, '"1.365" em preço continua milhar', 1e-9);
perto(ML.parsePeso('1.234.567'), 1234567, '"1.234.567" ainda é milhar', 1e-9);

[['1,5 libras'], ['abc'], ['']].forEach(([txt]) =>
  ok(isNaN(ML.parsePeso(txt)), `peso "${txt}" não vira número`));

// 4 casas: um miligrama precisa sobreviver ao arredondamento
perto(ML.arredPeso(0.0008), 0.0008, 'peso guarda 4 casas decimais', 1e-9);

/* ── 5c. Peso em gramas numa coluna que diz "kg" ──────────────────────────────
   Nenhum produto do Mercado Livre passa de 150 kg, então todo valor acima
   disso é grama. A planilha real mistura as escalas (0,9 kg e 2000 g na mesma
   coluna), por isso a decisão é por linha, não pela coluna inteira. */
secao('5c. Peso em gramas rotulado como kg');
{
  const soGramas = ML.detectarEscalaPeso(['2000','1091','1000','2200','500','350','1500','800','2500','1200']);
  ok(soGramas.suspeita, 'valores impossíveis viram suspeita');
  ok(soGramas.todosGrandes, 'reconhece a coluna inteira em gramas');

  const soKg = ML.detectarEscalaPeso(['0,001','13,000','0,950','4,600','1,200','2,575','0,25','1,5','2,2','0,32']);
  ok(!soKg.suspeita, 'planilha em quilos não dispara alarme falso');
  ok(!ML.detectarEscalaPeso(['1','2','3','0,5','1,5','2,5','4','1,2','0,8','3']).suspeita,
     'quilos com valores inteiros pequenos não disparam');

  // o caso real: parte em kg, parte em gramas
  const mista = ML.detectarEscalaPeso(['0,9','2000','0,01','1091','13','2200','4,6']);
  ok(mista.suspeita, 'planilha misturada dispara');
  ok(!mista.todosGrandes, 'e é reconhecida como misturada, não como toda em gramas');
  ok(mista.suspeitos === 3, 'conta só as linhas suspeitas', `contou ${mista.suspeitos}`);
  perto(mista.maiorConvertido, 2.2, 'mostra o maior valor já convertido', 1e-9);

  /* 80, 82 e 117 numa coluna "kg" são gramas: 211 produtos da planilha real
     caíam nessa faixa e passavam batido quando o corte era só 150 kg */
  const medios = ML.detectarEscalaPeso(['80','82','117','0,9','2,575','1,2']);
  ok(medios.suspeitos === 3, 'pega inteiros de 20 a 150 kg', `contou ${medios.suspeitos}`);
}

secao('5d. Conversão linha a linha');
[
  [2000, 2, true], [1091, 1.091, true], [131000, 131, true],
  // a faixa que passava batido antes
  [80, 0.08, true], [82, 0.082, true], [117, 0.117, true], [20, 0.02, true],
  // inteiros pequenos são pesos plausíveis de verdade
  [19, 19, false], [16, 16, false], [5, 5, false], [1, 1, false],
  // decimais não são gramas: gramas vêm redondas
  [0.9, 0.9, false], [4.6, 4.6, false], [2.575, 2.575, false], [149.5, 149.5, false],
  // ...até 150 kg. Acima disso o ML não entrega, então nem decimal é quilo:
  // o escorredor de macarrão que veio "199.999" pesa 199,999 g = 0,2 kg
  [199.999, 0.2, true], [150.5, 0.1505, true],
].forEach(([entrada, esperado, converteu]) => {
  const r = ML.normalizarPesoLinha(entrada, true);
  perto(r.kg, esperado, `${entrada} → ${esperado} kg`, 1e-9);
  ok(r.convertido === converteu, `${entrada} ${converteu ? 'é convertido' : 'fica como está'}`);
});

/* ── 5e. Medidas em mm/m numa coluna que diz cm ───────────────────────────────
   O erro mais caro e mais invisível: em milímetros o peso volumétrico dá mil
   vezes mais e o frete estoura, sem nenhum aviso disparar. */
secao('5e. Escala das medidas (mm / cm / m)');
{
  // gera um catálogo plausível: caixas de 20-35 × 30-40 × 40-60
  const catalogo = (n, fator, pesoKg) => {
    const a = [], l = [], c = [], p = [];
    for (let i = 0; i < n; i++) {
      a.push((20 + i % 15) * fator);
      l.push((30 + i % 10) * fator);
      c.push((40 + i % 20) * fator);
      p.push(pesoKg);
    }
    return {a, l, c, p};
  };
  const detectar = d => ML.detectarEscalaDimensao(d.a, d.l, d.c, d.p, {});

  const cm = detectar(catalogo(500, 1, 2));
  ok(!cm.suspeita, 'centímetros não disparam alarme falso');

  const mm = detectar(catalogo(500, 10, 2));
  ok(mm.suspeita, 'milímetros são detectados');
  ok(mm.escala === 'mm', 'e identificados como mm', `veio ${mm.escala}`);
  perto(mm.fator, 0.1, 'com fator 0,1 para virar cm', 1e-9);
  ok(mm.freteAntes > mm.freteDepois, 'o frete cai depois da correção',
     `${mm.freteAntes} → ${mm.freteDepois}`);

  const m = detectar(catalogo(500, 0.01, 2));
  ok(m.suspeita && m.escala === 'm', 'metros são detectados', `veio ${m.escala}`);
  perto(m.fator, 100, 'com fator 100', 1e-9);

  // amostra pequena não sustenta conclusão nenhuma
  ok(!detectar(catalogo(10, 10, 2)).suspeita, 'menos de 20 produtos não bastam');

  /* o falso positivo mais provável: quem vende móveis tem lados de 80-200 cm,
     e isso NÃO pode ser confundido com milímetros */
  const moveis = {a: [], l: [], c: [], p: []};
  for (let i = 0; i < 200; i++) {
    moveis.a.push(80 + i % 120); moveis.l.push(90 + i % 100);
    moveis.c.push(100 + i % 80); moveis.p.push(40);
  }
  ok(!detectar(moveis).suspeita, 'catálogo de móveis grandes não vira falso positivo');

  // metade numa escala, metade noutra: não dá para converter em bloco
  const mix = {a: [], l: [], c: [], p: []};
  for (let i = 0; i < 100; i++) {
    const f = i % 2 ? 1 : 10;
    mix.a.push(20 * f); mix.l.push(30 * f); mix.c.push(40 * f); mix.p.push(2);
  }
  const bagunca = detectar(mix);
  ok(bagunca.misturado, 'planilha com escalas misturadas é reconhecida');
  ok(!bagunca.suspeita, 'e não oferece conversão em bloco, que estragaria metade');
}

secao('5f. Conversão das medidas');
{
  const r = ML.normalizarDimensaoLinha(200, 300, 400, 0.1);
  perto(r.dimensoes.altura, 20, '200 mm → 20 cm', 1e-9);
  perto(r.dimensoes.largura, 30, '300 mm → 30 cm', 1e-9);
  perto(r.dimensoes.comprimento, 40, '400 mm → 40 cm', 1e-9);
  ok(r.convertido, 'marca que houve conversão');

  // fecha o círculo com a seção 4: o volumétrico corrigido bate com o esperado
  perto(ML.pesoVolumetrico(r.dimensoes, {}), 4, 'e o peso volumétrico volta a 4 kg', 1e-9);

  const igual = ML.normalizarDimensaoLinha(20, 30, 40, 1);
  ok(!igual.convertido, 'fator 1 não altera nada');
  perto(igual.dimensoes.altura, 20, 'e mantém a medida', 1e-9);

  ok(ML.normalizarDimensaoLinha('', 30, 40, 1).dimensoes === null,
     'medida faltando devolve dimensões nulas');
}

/* ── 5g. Lendo planilha de qualquer origem ────────────────────────────────── */
secao('5g. Cabeçalho, aba e nomes de coluna');
{
  // "Custo " com espaço sobrando não casava com /^custo$/ e a coluna sumia
  ok(ML.normalizarTexto('  Descrição Curta ') === 'descricao curta', 'tira acento, caixa e espaço');
  ok(ML.normalizarTexto('PREÇO ') === 'preco', '"PREÇO " vira "preco"');
  ok(ML.semParenteses('Peso bruto (Kg)') === 'peso bruto', 'tira a unidade entre parênteses');
  ok(ML.unidadeDoCabecalho('Altura (mm)') === 'mm', 'lê a unidade do rótulo');
  ok(ML.unidadeDoCabecalho('Custo') === null, 'e não inventa unidade onde não há');

  // planilha comum: cabeçalho já na primeira linha
  const simples = [['SKU','Nome do Produto','Peso (kg)'], ['A1','Caixa organizadora','2000'], ['A2','Cabide','450']];
  const c1 = ML.detectarCabecalho(simples);
  ok(c1.linha === 0, 'acha o cabeçalho na primeira linha', `veio ${c1.linha}`);
  ok(c1.confianca === 'alta', 'com confiança alta', `veio ${c1.confianca}`);

  /* caso real do Mercado Livre: cabeçalho técnico na linha 1, o legível na 3,
     e duas linhas de lixo antes dos dados */
  const ml = [
    ['FAMILY_ID','ITEM_ID','SKU','TITLE','QUANTITY'],
    ['Anúncios','','','','Informações do produto'],
    ['Agrupador de variações','Código do anúncio','SKU','Título','Estoque'],
    ['','','','','Obrigatório'],
    [],
    ['49003','MLB7157','11245','Caixa 250 Envelopes','5.0'],
    ['52777','MLB4794','TRC7116','Kit 3 Cabides','20.0'],
  ];
  const c2 = ML.detectarCabecalho(ml);
  ok(c2.linha === 2, 'prefere o cabeçalho legível ao técnico', `veio ${c2.linha}`);

  const pod = ML.podarLinhasVazias(ml.slice(c2.linha));
  ok(pod.podadas === 2, 'poda as linhas de lixo antes dos dados', `podou ${pod.podadas}`);
  ok(pod.aoa[1][3] === 'Caixa 250 Envelopes', 'e o primeiro produto é o certo');
  /* o export grava por posição física: cabeçalho + podadas tem que apontar
     para a linha real do primeiro produto */
  ok(JSON.stringify(ml[c2.linha + pod.podadas + 1]) === JSON.stringify(pod.aoa[1]),
     'o índice físico continua batendo, para o export gravar na linha certa');

  const abas = [
    {nome:'Ajuda',    aoa:[['','Modifique seus anúncios'],['','Modifique os dados']], oculta:false},
    {nome:'hidden',   aoa:[['82951594-6ba5']], oculta:true},
    {nome:'Anúncios', aoa:ml, oculta:false},
  ];
  ok(ML.escolherAba(abas).nome === 'Anúncios', 'escolhe a aba de produtos, não a de ajuda');

  const uma = [{nome:'Planilha1', aoa:simples, oculta:false}];
  const so = ML.escolherAba(uma);
  ok(so.nome === 'Planilha1' && !so.alternativas.length, 'com uma aba só, escolhe ela sem alternativas');
}

/* ── 6. A margem pedida é sempre entregue ─────────────────────────────────── */
secao('6. Varredura: a margem alvo é cumprida?');
{
  let testes = 0, abaixo = 0, semPreco = 0, pior = 0;
  for (let custo = 1; custo <= 900; custo += 3.7) {
    for (const m of [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50]) {
      for (const rep of ['verde', 'amarela', 'vermelha']) {
        for (const kg of [0.1, 0.2, 1.2, 5, 12, 30]) {
          testes++;
          const p = {reputacao: rep, freteAutomatico: true};
          const preco = ML.precoPara(custo, m, kg, p);
          if (preco == null) { semPreco++; continue; }
          const dif = m - ML.analisar(preco, custo, kg, p).margemLiquida;
          if (dif > 1e-9) { abaixo++; pior = Math.max(pior, dif); }
        }
      }
    }
  }
  ok(abaixo === 0, `margem cumprida em ${testes} combinações`,
     abaixo ? `${abaixo} abaixo do alvo, pior ${(pior*100).toFixed(4)}pp` : '');
  ok(semPreco === 0, 'todas as combinações têm preço possível', `${semPreco} sem preço`);
  console.log(`   (${testes} combinações de custo × margem × reputação × peso)`);
}

/* ── 7. Conferência do lote ───────────────────────────────────────────────── */
secao('7. Conferência do lote');
{
  const r = ML.precificarLote([
    {linha:2, custo:50,  peso:0},
    {linha:3, custo:0},
    {linha:4, custo:'abc'},
    {linha:5, custo:100, peso:1.2, dimensoes:{altura:20, largura:20, comprimento:20}},
    {linha:6, custo:100, peso:1,   comissaoProduto:130},
  ], {margemAlvo: 0.20});

  const tem = (i, aviso) => (r.linhas[i].avisos || []).includes(aviso);
  ok(tem(0, 'frete_zero'),      'produto sem peso é marcado com frete zero');
  ok(tem(0, 'sem_peso'),        'produto sem peso é marcado');
  ok(tem(1, 'sem_custo'),       'custo vazio é separado de custo inválido');
  ok(tem(2, 'custo_invalido'),  'texto no custo é marcado como inválido');
  ok(!(r.linhas[3].avisos || []).length, 'produto completo não gera aviso');
  ok(tem(4, 'tarifa_suspeita'), 'tarifa de 130% é recusada');
  perto(r.linhas[4].comissaoPct, 0.13, 'tarifa absurda cai para a do anúncio', 0.001);
  ok(r.conferencia.ok === false, 'lote com erro não passa na conferência');
  ok(r.conferencia.precificados === 3, 'conta quantos foram precificados',
     `precificados ${r.conferencia.precificados}`);
  ok(r.conferencia.grupos.every(g => Array.isArray(g.linhas) && g.linhas.length === g.n),
     'cada grupo guarda todas as linhas afetadas');
}

/* ── 8. Editor de planilha ────────────────────────────────────────────────── */
secao('8. Editor de planilha de produtos');
{
  const p = PE.DEFAULT_PARAMS;

  ok(PE.resumirDescricao('WE DROP - Conjunto 5 Potes de Vidro', p) === 'Conjunto 5 Potes de Vidro',
     'remove o termo e o hífen que sobra');
  ok(PE.resumirDescricao('WEDROP Carrinho', p) === 'Carrinho', 'pega WEDROP sem espaço');
  ok(PE.resumirDescricao('Produto sem a marca', p) === 'Produto sem a marca',
     'não mexe em quem não tem o termo');

  const longa = 'Cofrinho Eletrônico Infantil de Elefante com Senha e Impressão Digital';
  ok(PE.resumirDescricao(longa, p).length <= 60, 'descrição cabe em 60 caracteres',
     `ficou com ${PE.resumirDescricao(longa, p).length}`);

  const comBloco = 'Descrição comercial do produto.\n\nSKU: 123\nEAN: 456\nMarca: X\nPreço: R$ 10';
  const semBloco = PE.limparBlocoCadastral(comBloco, p);
  ok(semBloco.encontrou, 'acha o bloco cadastral no fim');
  ok(semBloco.texto === 'Descrição comercial do produto.', 'preserva a descrição comercial',
     JSON.stringify(semBloco.texto));

  const meio = PE.limparBlocoCadastral('Peso: 2kg é a medida do produto e nada mais', p);
  ok(!meio.encontrou, 'não corta menção no meio do texto');

  ok(PE.colToIndex('A') === 0 && PE.colToIndex('C') === 2 && PE.colToIndex('AP') === 41,
     'converte letra de coluna em índice');
}

/* ── resultado ────────────────────────────────────────────────────────────── */
console.log('\n' + '─'.repeat(58));
secao('9. Anúncios do Mercado Livre');
{
  /* recorta o formato real do arquivo "Modifique seus anúncios": 5 linhas de
     cabeçalho e os anúncios a partir da 6ª */
  const modeloAoa = [
    ['FAMILY_ID','ITEM_ID','PRODUCT_NUMBER','VARIATION_ID','SKU','TITLE','VARIATIONS','QUANTITY','PRICE','CURRENCY_ID','CONDITION','SHIPPING_METHOD','LISTING_TYPE','FEE_PER_SALE','STATUS'],
    ['Anúncios'], ['Agrupador','Código do anúncio'], ['','','','','','','','Obrigatório'], ['',''],
    ['1','MLB1','U1','','SKU-A','Panela de teste','','10',100,'R$','Novo','Mercado Envios grátis','Clássico','','Ativo'],
    ['2','MLB2','U2','','SKU-B','Caneca de teste','','5',50,'R$','Novo','Mercado Envios grátis','Clássico','','Ativo'],
    ['3','MLB3','U3','','','Sem sku','','5',20,'R$','Novo','Mercado Envios grátis','Clássico','','Ativo'],
    ['4','MLB4','U4','','SKU-D','Sem preco novo','','5',30,'R$','Novo','Mercado Envios grátis','Clássico','','Ativo'],
    [null,null,null,null,null,null,null,null,null],   // faixa vazia do Excel
  ];
  const m = AE.lerModelo(modeloAoa);
  ok(m.ok, 'reconhece o arquivo do Mercado Livre', (m.erros||[]).join(' '));
  ok(m.total === 4, 'conta só as linhas com ITEM_ID', 'contou ' + m.total);
  ok(m.inicio === 5, 'os anúncios começam na linha 6');

  const semColuna = AE.lerModelo([['SKU','TITLE','PRICE']]);
  ok(!semColuna.ok, 'recusa arquivo sem ITEM_ID');

  /* a coluna é achada pelo código, não pela posição: o ML já trocou a ordem */
  const trocado = modeloAoa.map(l => l.slice());
  trocado[0] = ['PRICE','ITEM_ID','SKU'];
  trocado[5] = [999,'MLB9','SKU-A'];
  const mt = AE.lerModelo(trocado);
  ok(mt.ok && mt.idx.PRICE === 0 && mt.idx.SKU === 2, 'acha as colunas fora de ordem');

  const precosAoa = [
    ['SKU','Preço'],
    ['SKU-A', '250,50'],      // vírgula decimal
    ['SKU-B', 'R$ 1.234,00'], // com moeda e milhar
    ['SKU-C', 80],            // não existe como anúncio
    ['SKU-A', '999'],         // repetido com preço diferente
  ];
  const px = AE.indexarPrecos(precosAoa, 0, 1, 0);
  perto(px.mapa.get('SKU-A').preco, 250.50, 'lê preço com vírgula', 1e-9);
  perto(px.mapa.get('SKU-B').preco, 1234, 'lê preço com R$ e milhar', 1e-9);
  ok(px.duplicados.length === 1, 'aponta SKU repetido com preço diferente');
  ok(px.mapa.get('SKU-A').preco === 250.50, 'no repetido vale o primeiro');

  const r = AE.casar(modeloAoa, m, px);
  const c = r.conferencia;
  ok(c.total === 4, 'casa as 4 linhas de anúncio', 'foram ' + c.total);
  ok(c.atualizados === 2, 'dois anúncios recebem preço novo', 'foram ' + c.atualizados);
  ok(c.semAnuncio === 1, 'SKU-C fica como produto sem anúncio');

  const porSku = Object.fromEntries(r.linhas.map(l => [l.sku || '(vazio)', l]));
  perto(porSku['SKU-A'].precoNovo, 250.50, 'grava o preço novo do SKU-A', 1e-9);
  perto(porSku['SKU-A'].variacao, 1.505, 'calcula a variação (100 -> 250,50)', 1e-9);
  ok(porSku['SKU-A'].avisos.includes('variacao_alta'), 'marca variação acima de 50%');
  ok(porSku['(vazio)'].avisos.includes('anuncio_sem_sku'), 'aponta anúncio sem SKU');
  ok(porSku['SKU-D'].avisos.includes('sem_preco'), 'aponta anúncio sem preço novo');
  ok(porSku['SKU-D'].precoNovo === null, 'anúncio sem preço novo não recebe valor');

  /* a linha física é o que o download usa para escrever no lugar certo */
  ok(porSku['SKU-A'].fisica === 5, 'guarda a linha física do anúncio');

  const v = c.variacao;
  ok(v && v.n === 2, 'resume a variação do lote', v ? 'n=' + v.n : 'sem resumo');
  ok(v && v.sobem === 2 && v.descem === 0, 'conta quantos sobem e quantos descem');

  /* preço inválido não pode virar preço no arquivo */
  const px2 = AE.indexarPrecos([['SKU','Preço'],['SKU-A', 0],['SKU-B','abc']], 0, 1, 0);
  const r2 = AE.casar(modeloAoa, m, px2);
  ok(r2.conferencia.atualizados === 0, 'preço zero ou texto não vira preço novo');
  ok(r2.linhas[0].avisos.includes('preco_invalido'), 'marca preço inválido');
}

secao('10. Motor genérico de marketplace');
{
  /* canal de mentira, com taxas simples de conferir na mão: comissão 10%,
     taxa fixa de R$ 5 abaixo de 50, frete de R$ 10 quando há peso */
  const teste = MK.criarMotor({
    id:'teste', nome:'Teste', PESO_MAXIMO:30, PRECO_MINIMO:2,
    PADRAO:{margemAlvo:0.2, usarPesoVolumetrico:true, divisorVolumetrico:6000,
            freteAutomatico:true, pesoPadrao:0, rebate:0, aliquotaImposto:0,
            taxaDevolucao:0, embalagem:0},
    comissaoDe: () => 0.10,
    taxaFixaDe: pr => pr < 50 ? 5 : 0,
    freteDe: (pr, kg) => kg ? 10 : 0,
    limites: () => [50],
  });

  const r = teste.analisar(100, 50, 1, {});
  perto(r.comissao, 10, 'comissão de 10% sobre 100');
  perto(r.taxaFixa, 0, 'acima de 50 não tem taxa fixa');
  perto(r.frete, 10, 'frete de 10 com peso');
  perto(r.lucroLiquido, 30, 'lucro = 100 - 10 - 10 - 50');
  perto(r.margemLiquida, 0.30, 'margem líquida de 30%', 0.001);

  const r2 = teste.analisar(40, 10, 1, {});
  perto(r2.taxaFixa, 5, 'abaixo de 50 tem taxa fixa');

  /* o inverso tem de devolver o alvo, não um valor perto */
  [[50, 0.20], [10, 0.30], [200, 0.15], [7.5, 0.10]].forEach(([custo, alvo]) => {
    const pr = teste.precoPara(custo, alvo, 1, {});
    ok(pr != null, `acha preço para custo ${custo} e margem ${alvo*100}%`);
    if (pr != null) {
      const a = teste.analisar(pr, custo, 1, {});
      ok(a.margemLiquida >= alvo - 1e-6,
         `custo ${custo} margem ${alvo*100}% é cumprida`,
         `obtida ${(a.margemLiquida*100).toFixed(2)}%`);
    }
  });

  /* margem impossível: 10% de comissão + 95% de margem passa de 100% */
  ok(teste.precoPara(50, 0.95, 1, {}) === null, 'recusa margem que não cabe');

  /* peso volumétrico manda quando a caixa é grande e leve */
  const vol = teste.pesoCobravel(1, {altura:30, largura:40, comprimento:50}, teste.PADRAO);
  perto(vol.volumetrico, 10, 'volumétrico 30x40x50 ÷ 6000 = 10 kg', 0.001);
  ok(vol.usou === 'volumétrico', 'usa o volumétrico quando ele é maior');

  /* os avisos de linha */
  const lote = teste.precificarLote([
    {linha:1, custo:50,  peso:1, dimensoes:{altura:10,largura:10,comprimento:10}},
    {linha:2, custo:'',  peso:1},
    {linha:3, custo:20,  peso:''},
    {linha:4, custo:'abc', peso:1},
    {linha:5, custo:20,  peso:99},
  ], {margemAlvo:0.2});
  perto(lote.conferencia.total, 5, 'conta as cinco linhas');
  const av = l => lote.linhas.find(x => x.linha === l).avisos;
  ok(av(2).includes('sem_custo'), 'aponta custo vazio');
  ok(av(3).includes('sem_peso'), 'aponta peso vazio');
  ok(av(4).includes('custo_invalido'), 'aponta custo que é texto');
  ok(av(5).includes('peso_alto'), 'aponta peso acima do limite do canal');
  ok(lote.linhas.find(x => x.linha === 1).avisos.length === 0,
     'linha completa não gera aviso', JSON.stringify(av(1)));
}

if (falhou) {
  console.log(`FALHOU — ${passou} passaram, ${falhou} falharam:\n`);
  falhas.forEach(f => console.log('   ✗ ' + f));
  process.exit(1);
}
console.log(`Tudo certo — ${passou} verificações passaram.`);
