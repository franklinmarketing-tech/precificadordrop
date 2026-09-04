/* ══════════════════════════════════════════════════════════════════════════
   Testes do Precificador Drop — rode com:  node testes/rodar.js

   Cobre as contas que não podem quebrar: a conferência com a planilha de
   referência, as tabelas oficiais do Mercado Livre e as regras de frete.
   Sem dependências: os motores são UMD e carregam direto no Node.
   ══════════════════════════════════════════════════════════════════════════ */
const ML = require('../assets/ml-engine.js');
const MF = require('../assets/ml-fretes.js');
const PE = require('../assets/planilha-engine.js');

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

/* ── 5c. Coluna em gramas com rótulo de kg ────────────────────────────────── */
secao('5c. A coluna de peso está em gramas?');
ok(ML.detectarEscalaPeso(['2000','1091','1000','2200','500','350','1500','800','2500','1200']).suspeita,
   'inteiros grandes viram suspeita de gramas');
ok(!ML.detectarEscalaPeso(['0,001','13,000','0,950','4,600','1,200','2,575','0,25','1,5','2,2','0,32']).suspeita,
   'planilha em quilos não dispara alarme falso');
ok(!ML.detectarEscalaPeso(['1','2','3','0,5','1,5','2,5','4','1,2','0,8','3']).suspeita,
   'quilos com valores inteiros pequenos não disparam');
ok(!ML.detectarEscalaPeso(['2000','1000']).suspeita, 'poucos valores não bastam para concluir');
perto(ML.detectarEscalaPeso(['2000','1091','1000','2200','500','350','1500','800','2500','1200']).medianaConvertida,
      1.2, 'sugere a mediana convertida para kg', 1e-9);

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
if (falhou) {
  console.log(`FALHOU — ${passou} passaram, ${falhou} falharam:\n`);
  falhas.forEach(f => console.log('   ✗ ' + f));
  process.exit(1);
}
console.log(`Tudo certo — ${passou} verificações passaram.`);
