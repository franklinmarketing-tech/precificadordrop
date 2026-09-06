/* ══════════════════════════════════════════════════════════════════════════
   Gera os ebooks do Precificador Drop.

     node scripts/ebooks.cjs        → escreve os HTML em ebooks/fonte/
     python scripts/ebooks-pdf.py   → transforma cada um em PDF

   Todo número vem de scripts/ebooks-dados.cjs, que por sua vez vem dos
   motores do app. Nada é digitado à mão: se uma tarifa mudar, o ebook muda
   junto na próxima geração. É o que impede o material de ensinar uma conta
   que o app não faz mais.
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const D = require('./ebooks-dados.cjs');

const SAIDA = path.join(__dirname, '..', 'ebooks', 'fonte');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── a folha de estilo, uma para todos ─────────────────────────────────────
   Feita para papel: fundo branco, texto escuro, quebra de página controlada.
   O que na tela é cor de marca aqui vira acento em pontos poucos, senão a
   impressora gasta tinta em decoração. */
const ESTILO = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --tinta:#12141c; --sub:#4a5163; --fraco:#8d94a5; --linha:#e2e6ef;
  --azul:#0B6FD8; --azul-esc:#0a5bb0; --verde:#0d8f56; --vermelho:#d6323a;
  --amarelo:#b4770a; --fundo-suave:#f6f8fc;
}
body{font-family:'Inter',system-ui,sans-serif;color:var(--tinta);font-size:11pt;line-height:1.62;
  background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}

/* uma página = uma folha A4 com respiro */
.pagina{padding:22mm 20mm;page-break-after:always;position:relative;min-height:297mm}
.pagina:last-child{page-break-after:auto}

/* ── capa ── */
.capa{display:flex;flex-direction:column;justify-content:center;
  background:linear-gradient(160deg,#0b1220 0%,#132441 55%,#0e2d52 100%);color:#fff;padding:26mm 20mm}
.capa-marca{display:flex;align-items:center;gap:10px;margin-bottom:auto;
  font-size:10pt;font-weight:700;letter-spacing:2.4px;text-transform:uppercase;color:#8fb6ee}
.capa-selo{width:26px;height:26px;border-radius:8px;background:linear-gradient(160deg,#3b8ef0,#0B6FD8);
  display:grid;place-items:center;font-size:13pt;font-weight:800;color:#fff}
.capa-n{font-size:10pt;font-weight:700;letter-spacing:3px;color:#5f9ae8;text-transform:uppercase}
.capa h1{font-size:34pt;font-weight:800;line-height:1.08;letter-spacing:-1.2px;margin:10px 0 14px}
.capa h1 em{font-style:normal;color:#5aa9ff}
.capa-sub{font-size:13pt;color:#b9c8dd;line-height:1.55;max-width:36em}
.capa-pe{margin-top:auto;padding-top:22px;border-top:1px solid rgba(255,255,255,.16);
  font-size:9.5pt;color:#8fa4bf;display:flex;justify-content:space-between;gap:16px}

/* ── texto ── */
h2{font-size:19pt;font-weight:800;letter-spacing:-.5px;line-height:1.2;margin:0 0 4px}
h2 .num{color:var(--azul);font-weight:800}
.h2-sub{font-size:10.5pt;color:var(--fraco);margin-bottom:20px;
  padding-bottom:12px;border-bottom:2px solid var(--linha)}
h3{font-size:13pt;font-weight:700;margin:22px 0 8px;letter-spacing:-.2px}
p{margin:0 0 11px}
p b,li b{font-weight:700}
ul,ol{margin:0 0 12px;padding-left:20px}
li{margin-bottom:6px}
.fraco{color:var(--sub)}

/* ── destaques ── */
.chamada{background:var(--fundo-suave);border-left:4px solid var(--azul);
  padding:14px 18px;border-radius:0 10px 10px 0;margin:16px 0}
.chamada.alerta{border-left-color:var(--amarelo);background:#fdf8ee}
.chamada.erro{border-left-color:var(--vermelho);background:#fdf1f1}
.chamada.ok{border-left-color:var(--verde);background:#f0faf5}
.chamada-t{font-weight:700;margin-bottom:4px}

.numerao{display:flex;gap:20px;margin:18px 0;flex-wrap:wrap}
.numerao .n{flex:1 1 0;min-width:110px;background:var(--fundo-suave);border-radius:12px;padding:14px 16px}
.numerao .n b{display:block;font-size:22pt;font-weight:800;letter-spacing:-1px;line-height:1.05}
.numerao .n i{display:block;font-style:normal;font-size:8.5pt;color:var(--fraco);
  text-transform:uppercase;letter-spacing:1.1px;margin-top:5px;line-height:1.35}
.n.bom b{color:var(--verde)} .n.ruim b{color:var(--vermelho)} .n.aten b{color:var(--amarelo)}

/* ── tabelas ── */
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:10pt}
th{text-align:left;font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.9px;
  color:var(--fraco);padding:8px 10px;border-bottom:2px solid var(--linha)}
td{padding:9px 10px;border-bottom:1px solid var(--linha);font-variant-numeric:tabular-nums}
tr:last-child td{border-bottom:none}
.num{text-align:right}
.bom{color:var(--verde);font-weight:700}
.ruim{color:var(--vermelho);font-weight:700}
.destaque td{background:#fff8e8;font-weight:600}
.tab-nota{font-size:9pt;color:var(--fraco);margin-top:-6px;margin-bottom:16px;line-height:1.5}

/* ── passo a passo ── */
.passos{counter-reset:passo;list-style:none;padding:0;margin:14px 0}
.passos li{counter-increment:passo;position:relative;padding-left:36px;margin-bottom:12px}
.passos li::before{content:counter(passo);position:absolute;left:0;top:1px;
  width:24px;height:24px;border-radius:50%;background:var(--azul);color:#fff;
  font-size:10pt;font-weight:700;display:grid;place-items:center}

/* ── rodapé de cada página ── */
.pe{position:absolute;left:20mm;right:20mm;bottom:12mm;display:flex;justify-content:space-between;
  font-size:8.5pt;color:var(--fraco);border-top:1px solid var(--linha);padding-top:7px}

.evitar-quebra{page-break-inside:avoid}
</style>`;

/* ── peças reutilizáveis ─────────────────────────────────────────────────── */
const capa = ({ n, titulo, sub, tempo }) => `
<div class="pagina capa">
  <div class="capa-marca"><span class="capa-selo">P</span>Precificador Drop</div>
  <div>
    <div class="capa-n">Ebook ${n}</div>
    <h1>${titulo}</h1>
    <div class="capa-sub">${sub}</div>
  </div>
  <div class="capa-pe">
    <span>${tempo}</span>
    <span>Números conferidos nas tabelas oficiais · ${new Date().toLocaleDateString('pt-BR', {month:'long', year:'numeric'})}</span>
  </div>
</div>`;

const pagina = (titulo, subtitulo, corpo, rodape) => `
<div class="pagina">
  ${titulo ? `<h2>${titulo}</h2><div class="h2-sub">${subtitulo || ''}</div>` : ''}
  ${corpo}
  <div class="pe"><span>Precificador Drop</span><span>${rodape || ''}</span></div>
</div>`;

const doc = (titulo, paginas) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title>${ESTILO}</head>
<body>${paginas.join('\n')}</body></html>`;

/* ══════════════════════════════════════════════════════════════════════════
   EBOOK 1 — A conta do preço
   ══════════════════════════════════════════════════════════════════════════ */
function ebookConta() {
  const m = D.margemVersusMarkup();
  const onde = D.ondeVaiCadaReal();
  const fixa = D.pesoDaTaxaFixa();

  const p = [];

  p.push(capa({
    n: 1,
    titulo: 'A conta<br/>do <em>preço</em>',
    sub: 'Por que multiplicar o custo por 1,3 não dá 30% de margem — e o que dá. '
       + 'Com as contas abertas, parcela por parcela.',
    tempo: '12 minutos de leitura',
  }));

  p.push(pagina('O erro que custa mais caro',
    'Margem e markup não são a mesma coisa, e confundir os dois vira prejuízo',
    `
    <p>Você compra um produto por <b>${D.brl(m.custo)}</b> e quer 30% de margem. A conta que quase
    todo mundo faz é esta:</p>
    <div class="chamada erro">
      <div class="chamada-t">A conta de padaria</div>
      ${D.brl(m.custo)} × 1,3 = <b>${D.brl(m.erro.preco)}</b>
    </div>
    <p>Parece certo. Não é. A esse preço, no Mercado Livre, com peso de ${D.num(m.peso, 1)} kg e
    reputação verde, o resultado real é:</p>
    <div class="numerao">
      <div class="n ruim"><b>${D.pct(m.erro.margemReal, 1)}</b><i>margem de verdade</i></div>
      <div class="n ruim"><b>${D.brl(m.erro.sobra)}</b><i>o que sobra por venda</i></div>
      <div class="n"><b>${D.brl(m.erro.precoCerto)}</b><i>preço para 30% de verdade</i></div>
    </div>
    <p>Não é uma margem menor do que a esperada. É <b>prejuízo</b>: a cada venda saem
    ${D.brl(Math.abs(m.erro.sobra))} do seu bolso. E o preço que entregaria os 30% é
    <b>${D.brl(m.erro.precoCerto)}</b> — ${D.brl(m.erro.diferenca)} acima do que a conta de padaria
    sugeriu, quase o dobro.</p>

    <h3>Por que a diferença é tão grande</h3>
    <p>Porque <b>a comissão incide sobre a venda, não sobre o custo</b>. Quando você sobe o preço
    para cobrir as taxas, as taxas sobem junto. É uma conta que se persegue.</p>
    <ul>
      <li><b>Markup</b> é quantas vezes você multiplica o custo. Olha para trás.</li>
      <li><b>Margem</b> é quanto sobra de cada real vendido. Olha para o resultado.</li>
    </ul>
    <p>Margem de 30% quer dizer: de cada R$ 100 que entram, R$ 30 ficam com você depois de tudo.
    Para isso, o markup precisa ser bem maior que 1,3.</p>
    `, 'O erro que custa mais caro'));

  p.push(pagina('Quanto multiplicar, de verdade',
    `A tabela para um produto de ${D.brl(m.custo)} de custo e ${D.num(m.peso, 1)} kg`,
    `
    <table>
      <thead><tr>
        <th>Margem que você quer</th>
        <th class="num">Preço de venda</th>
        <th class="num">Markup real</th>
        <th class="num">Sobra por venda</th>
        <th class="num">A conta de padaria diria</th>
      </tr></thead>
      <tbody>
        ${m.linhas.filter(l => !l.impossivel).map(l => `<tr${l.margem === 0.30 ? ' class="destaque"' : ''}>
          <td>${D.pct(l.margem)}</td>
          <td class="num">${D.brl(l.preco)}</td>
          <td class="num"><b>${D.num(l.markup)}×</b></td>
          <td class="num bom">${D.brl(l.sobra)}</td>
          <td class="num ruim">${D.brl(l.ingenuo)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="tab-nota">Coluna da direita: o que sairia multiplicando o custo por 1 + margem.
    Em todas as linhas, esse preço entrega bem menos do que promete.</div>

    <div class="chamada">
      <div class="chamada-t">Leia a coluna do markup</div>
      Para 30% de margem o markup é <b>${D.num(m.linhas.find(l => l.margem === 0.30).markup)}×</b>,
      não 1,3×. Guarde a ordem de grandeza: <b>margem de 30% pede mais que o dobro do custo</b>.
    </div>

    <h3>E se o custo for outro?</h3>
    <p>O markup muda com o custo, com o peso e com o canal — não existe um número para decorar.
    Produto barato precisa de markup maior, porque a taxa fixa pesa mais. Produto pesado também,
    porque o frete cresce. É exatamente por isso que a conta tem de ser feita produto a produto,
    e não no olho.</p>
    `, 'Quanto multiplicar'));

  p.push(pagina('Para onde vai cada real',
    `Uma venda de ${D.brl(onde.preco)}, custo de ${D.brl(onde.custo)}, ${D.num(onde.peso, 1)} kg`,
    `
    <table>
      <thead><tr><th>O que sai</th><th class="num">Valor</th><th class="num">Da venda</th></tr></thead>
      <tbody>
        ${onde.parcelas.map(x => `<tr>
          <td>${esc(x.nome)}</td>
          <td class="num ruim">− ${D.brl(x.valor)}</td>
          <td class="num">${D.pct(x.valor / onde.preco, 1)}</td>
        </tr>`).join('')}
        <tr class="destaque">
          <td><b>Sobra para você</b></td>
          <td class="num bom">${D.brl(onde.sobra)}</td>
          <td class="num bom">${D.pct(onde.margem, 1)}</td>
        </tr>
      </tbody>
    </table>

    <h3>As quatro parcelas</h3>
    <ul>
      <li><b>Custo do produto.</b> O que você paga ao fornecedor. A única que você negocia.</li>
      <li><b>Comissão.</b> Percentual sobre a venda. Sobe quando o preço sobe.</li>
      <li><b>Taxa fixa.</b> Valor por venda, não percentual. É a que estrangula o produto barato —
        a página seguinte mostra o quanto.</li>
      <li><b>Envio.</b> Depende do peso, das medidas, da sua reputação e da faixa de preço.
        Quatro coisas, e nenhuma delas é o custo do produto.</li>
    </ul>

    <div class="chamada alerta">
      <div class="chamada-t">Duas parcelas que quase todo mundo esquece</div>
      <b>Imposto</b> e <b>devoluções</b> não aparecem no extrato do marketplace, mas saem do mesmo
      bolso. Se você paga 6% de Simples e 3% dos pedidos voltam, são 9 pontos de margem que
      sumiram — e a conta acima ainda não os contou.
    </div>
    `, 'Para onde vai cada real'));

  p.push(pagina('O produto barato e a taxa fixa',
    'Por que vender coisa de R$ 20 no Mercado Livre quase nunca fecha',
    `
    <p>A taxa fixa é um valor por venda, igual para todo mundo. Num produto caro ela some no meio
    da conta; num barato, ela é a conta.</p>
    <table>
      <thead><tr>
        <th class="num">Preço de venda</th>
        <th class="num">Taxa fixa</th>
        <th class="num">Quanto é da venda</th>
        <th class="num">Comissão</th>
        <th class="num">Margem final</th>
      </tr></thead>
      <tbody>
        ${fixa.map(x => `<tr${x.preco <= 30 ? ' class="destaque"' : ''}>
          <td class="num">${D.brl(x.preco)}</td>
          <td class="num">${D.brl(x.taxaFixa)}</td>
          <td class="num ${x.pesoNaVenda > 0.15 ? 'ruim' : ''}">${D.pct(x.pesoNaVenda, 1)}</td>
          <td class="num">${D.brl(x.comissao)}</td>
          <td class="num ${x.margem < 0 ? 'ruim' : 'bom'}">${D.pct(x.margem, 1)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="tab-nota">Custo considerado: 45% do preço de venda em todas as linhas, para
    isolar o efeito da taxa fixa.</div>

    <div class="chamada erro">
      <div class="chamada-t">Numa venda de ${D.brl(fixa[0].preco)}, a taxa fixa é ${D.pct(fixa[0].pesoNaVenda, 1)} da venda</div>
      Antes de qualquer comissão, antes do frete, antes do custo. É por isso que produto de baixo
      valor no Mercado Livre precisa de markup alto — ou de ser vendido em kit.
    </div>

    <h3>O que fazer com o produto barato</h3>
    <ul>
      <li><b>Vender em kit.</b> Três unidades num anúncio pagam uma taxa fixa, não três.</li>
      <li><b>Subir de faixa.</b> Acima de R$ 79 a taxa fixa deixa de existir no Mercado Livre.</li>
      <li><b>Levar para outro canal.</b> A Shopee cobra diferente — o ebook 2 compara os três.</li>
      <li><b>Aceitar que não fecha.</b> Nem todo produto cabe em todo marketplace. Descobrir isso
        na planilha custa menos do que descobrir no extrato.</li>
    </ul>
    `, 'O produto barato'));

  p.push(pagina('O que fazer com isto',
    'O checklist antes de anunciar',
    `
    <ol class="passos">
      <li><b>Pare de multiplicar o custo por um número.</b> Se você usa 1,3 ou 2, está chutando —
        e o chute erra mais no produto barato e no pesado.</li>
      <li><b>Diga a margem que quer, não o preço.</b> O preço é o resultado da conta, não a
        entrada dela.</li>
      <li><b>Conte imposto e devolução.</b> Se você paga Simples e tem devoluções, some as duas
        antes de olhar a margem.</li>
      <li><b>Confira o peso e as medidas.</b> Produto sem peso sai com frete zerado, e o lucro
        parece maior do que é.</li>
      <li><b>Olhe produto a produto.</b> A mesma margem pedida dá markups diferentes conforme
        custo, peso e canal.</li>
    </ol>

    <div class="chamada ok">
      <div class="chamada-t">O app faz essa conta para a planilha inteira</div>
      Em <b>precificador-drop.vercel.app</b>, na calculadora do canal: você sobe a planilha, diz a
      margem, e sai o preço de cada produto com a conta aberta — comissão, taxa fixa, envio e o
      que sobra. Clicar numa linha mostra o extrato dela.
    </div>

    <h3>Nos próximos ebooks</h3>
    <ul>
      <li><b>Ebook 2 — Os três canais lado a lado.</b> Como Mercado Livre, Shopee e Amazon cobram,
        e qual deles paga melhor em cada faixa de preço.</li>
      <li><b>Ebook 3 — Os degraus que comem o lucro.</b> Os preços em que cobrar um centavo a mais
        derruba o seu lucro, e como achá-los na sua planilha.</li>
    </ul>
    `, 'O checklist'));

  return doc('A conta do preço — Precificador Drop', p);
}

/* ══════════════════════════════════════════════════════════════════════════
   EBOOK 2 — Os três canais lado a lado
   ══════════════════════════════════════════════════════════════════════════ */
function ebookCanais() {
  const ml = D.tabelaMercadoLivre();
  const sh = D.tabelaShopee();
  const az = D.tabelaAmazon();
  const tres = D.tresCanais();
  const vol = D.volumetrico();

  const p = [];

  p.push(capa({
    n: 2,
    titulo: 'Os três canais<br/><em>lado a lado</em>',
    sub: 'Mercado Livre, Shopee e Amazon cobram de jeitos diferentes. Aqui estão as três '
       + 'tabelas, e o mesmo produto precificado nos três.',
    tempo: '14 minutos de leitura',
  }));

  p.push(pagina('Cada um cobra de um jeito',
    'E é por isso que o mesmo produto rende diferente em cada lugar',
    `
    <p>Antes das tabelas, a diferença de fundo entre os três:</p>

    <h3>Mercado Livre — comissão por categoria, taxa fixa por faixa, frete por reputação</h3>
    <p>Comissão de ${D.pct(ml.comissao)} no Clássico e ${D.pct(ml.comissaoPremium)} no Premium, variando
    por categoria. Abaixo de R$ 79 cobra uma taxa fixa por venda. O frete é seu acima de R$ 79 e
    depende da sua reputação — a mesma caixa custa quase o dobro na reputação vermelha.</p>

    <h3>Shopee — comissão por faixa de preço, e o vendedor não paga frete</h3>
    <p>Não é por categoria: é por <b>faixa de preço</b>, e cada faixa soma um percentual e um valor
    fixo. No modelo padrão o frete é do comprador, subsidiado por cupom. Você só é debitado se
    declarar peso a menos, se o pacote estourar as dimensões (R$ ${sh.volumoso}) ou em devolução
    por culpa sua (frete + R$ ${sh.devolucao}).</p>

    <h3>Amazon — comissão por categoria, frete por tabela de peso</h3>
    <p>De ${D.pct(az.grupos[0].pct)} a ${D.pct(az.grupos[az.grupos.length-1].pct)} conforme a categoria,
    com mínimo por item. No FBA o frete sai de uma tabela que cruza peso e faixa de preço.</p>

    <div class="chamada">
      <div class="chamada-t">A consequência prática</div>
      Não existe "o marketplace mais barato". Existe o mais barato <b>para aquele produto</b>,
      naquele preço, com aquele peso. A página 5 mostra a mesma conta nos três.
    </div>
    `, 'Cada um cobra de um jeito'));

  p.push(pagina('Mercado Livre',
    'As três tabelas que entram na conta',
    `
    <h3>Taxa fixa por faixa de preço</h3>
    <table>
      <thead><tr><th>Faixa</th><th class="num">O que cobra</th></tr></thead>
      <tbody>
        ${ml.taxaFixa.map(f => `<tr>
          <td>até ${D.brl(f.ate)}</td>
          <td class="num">${f.percentual ? D.pct(f.percentual) + ' do preço' : D.brl(f.valor)}</td>
        </tr>`).join('')}
        <tr><td>acima de ${D.brl(ml.taxaFixa[ml.taxaFixa.length-1].ate)}</td><td class="num bom">sem taxa fixa</td></tr>
      </tbody>
    </table>
    <div class="tab-nota">Abaixo de ${D.brl(ml.taxaFixa[0].ate)} a taxa é metade do preço do produto —
    metade da venda vai embora antes de qualquer outra coisa.</div>

    <h3>A reputação muda o frete</h3>
    <p>A mesma caixa de 1,2 kg num produto de R$ 89,99:</p>
    <table>
      <thead><tr><th>Reputação</th><th class="num">Frete</th><th class="num">Sobra</th><th class="num">Margem</th></tr></thead>
      <tbody>
        ${ml.porReputacao.map(r => `<tr>
          <td>${esc(r.reputacao)}</td>
          <td class="num">${D.brl(r.frete)}</td>
          <td class="num ${r.sobra > 0 ? 'bom' : 'ruim'}">${D.brl(r.sobra)}</td>
          <td class="num">${D.pct(r.margem, 1)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="chamada alerta">
      <div class="chamada-t">Reputação é dinheiro, não medalha</div>
      Entre a melhor e a pior, a diferença de frete no mesmo produto é de
      ${D.brl(Math.abs(ml.porReputacao[ml.porReputacao.length-1].frete - ml.porReputacao[0].frete))}
      por venda. Multiplique pelo seu volume mensal.
    </div>

    <h3>As faixas de preço do frete</h3>
    <p class="fraco">O frete muda de degrau nestes preços:
    ${ml.faixasFrete.map(v => D.brl(v)).join(' · ')}. O ebook 3 mostra por que isso importa.</p>
    `, 'Mercado Livre'));

  p.push(pagina('Shopee e Amazon',
    'As duas tabelas que menos gente conhece',
    `
    <h3>Shopee — comissão por faixa de preço</h3>
    <table>
      <thead><tr><th>Faixa</th><th class="num">Percentual</th><th class="num">+ valor fixo</th></tr></thead>
      <tbody>
        ${sh.faixas.map(f => `<tr><td>${esc(f.rotulo)}</td>
          <td class="num">${D.pct(f.pct)}</td><td class="num">${D.brl(f.fixo)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="tab-nota">Conta CPF que passa de 450 pedidos em 90 dias paga R$ ${sh.adicionalCpf} a mais
    por item. Abaixo de R$ ${sh.pisoMetade} o valor fixo vira metade do preço.</div>

    <div class="chamada erro">
      <div class="chamada-t">O teto de R$ 100 acabou em março de 2026</div>
      Tabelas antigas ainda circulam com esse teto. Quem calcular com ele vai achar que produto
      caro paga menos do que paga.
    </div>

    <h3>Amazon — comissão por categoria</h3>
    <table>
      <thead><tr><th class="num">Comissão</th><th class="num">Categorias</th><th>Exemplos</th></tr></thead>
      <tbody>
        ${az.grupos.map(g => `<tr>
          <td class="num"><b>${D.pct(g.pct)}</b></td>
          <td class="num">${g.n}</td>
          <td class="fraco">${esc(g.exemplos.join(' · '))}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <h3>Frete do FBA</h3>
    <table>
      <thead><tr><th class="num">Peso</th><th class="num">Preço do produto</th><th class="num">Frete</th></tr></thead>
      <tbody>
        ${az.frete.map(f => `<tr><td class="num">${D.num(f.kg, 1)} kg</td>
          <td class="num">${D.brl(f.preco)}</td><td class="num">${D.brl(f.frete)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="tab-nota">No plano Profissional a Amazon cobra R$ ${az.mensalidade} por mês, que não
    entra no preço de nenhum item — some à parte, no resultado do mês.</div>
    `, 'Shopee e Amazon'));

  p.push(pagina('O mesmo produto nos três',
    'O preço que entrega 20% de margem líquida em cada canal',
    `
    <table>
      <thead><tr>
        <th class="num">Custo</th><th class="num">Peso</th>
        <th class="num">Mercado Livre</th><th class="num">Shopee</th><th class="num">Amazon</th>
        <th>Menor preço</th>
      </tr></thead>
      <tbody>
        ${tres.map(x => `<tr>
          <td class="num">${D.brl(x.custo)}</td>
          <td class="num">${D.num(x.peso, 1)} kg</td>
          <td class="num ${x.vencedor === 'Mercado Livre' ? 'bom' : ''}">${x.ml ? D.brl(x.ml) : '—'}</td>
          <td class="num ${x.vencedor === 'Shopee' ? 'bom' : ''}">${x.sh ? D.brl(x.sh) : '—'}</td>
          <td class="num ${x.vencedor === 'Amazon' ? 'bom' : ''}">${x.az ? D.brl(x.az) : '—'}</td>
          <td><b>${esc(x.vencedor || '—')}</b>${x.espalhamento > 0.02
            ? ` <span class="fraco">(${D.pct(x.espalhamento, 0)} de diferença)</span>` : ''}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="tab-nota">Menor preço para a mesma margem = mais competitivo naquele canal. Mercado
    Livre em Clássico e reputação verde; Shopee CNPJ na logística dela; Amazon FBA, categoria padrão.</div>

    <div class="chamada">
      <div class="chamada-t">Onde está a diferença de verdade</div>
      No produto barato. Com custo de ${D.brl(tres[0].custo)} a diferença entre o melhor e o pior canal
      é de <b>${D.pct(tres[0].espalhamento, 0)}</b> — porque a taxa fixa do Mercado Livre pesa muito
      nessa faixa. Nos produtos caros os três se aproximam.
    </div>

    <h3>A regra que sai daqui</h3>
    <p>Produto barato pede atenção à taxa fixa; produto pesado pede atenção ao frete; produto caro
    é decidido pela comissão. E como cada canal cobra diferente as três coisas, <b>o mesmo catálogo
    pode ter produtos que rendem mais em canais diferentes</b>.</p>
    `, 'O mesmo produto nos três'));

  p.push(pagina('O peso que você não vê',
    'Por que uma caixa leve pode custar frete de caixa pesada',
    `
    <p>Os três canais cobram o frete pelo <b>maior</b> entre o peso da balança e o peso volumétrico:</p>
    <div class="chamada">
      <div class="chamada-t">A fórmula</div>
      peso volumétrico (kg) = altura × largura × comprimento ÷ 6.000 &nbsp;<span class="fraco">— medidas em centímetros</span>
    </div>
    <table>
      <thead><tr>
        <th>Produto</th><th class="num">Caixa</th><th class="num">Balança</th>
        <th class="num">Volumétrico</th><th class="num">Cobrado</th><th class="num">Frete</th>
      </tr></thead>
      <tbody>
        ${vol.map(x => `<tr>
          <td>${esc(x.nome)}</td>
          <td class="num fraco">${x.a}×${x.l}×${x.c}</td>
          <td class="num">${D.num(x.kg, 1)} kg</td>
          <td class="num">${D.num(x.volumetrico, 1)} kg</td>
          <td class="num"><b>${D.num(x.cobrado, 1)} kg</b></td>
          <td class="num">${x.frete != null ? D.brl(x.frete) : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="tab-nota">Frete calculado num produto de R$ 199, reputação verde.</div>

    <div class="chamada alerta">
      <div class="chamada-t">O caso que mais dói</div>
      A moto elétrica pesa ${D.num(vol[2].kg, 0)} kg na balança e é cobrada como
      <b>${D.num(vol[2].cobrado, 1)} kg</b> — mais que o dobro. Quem precificou pelo peso da balança
      perdeu ${D.brl(vol[2].frete - 30)} por venda sem saber.
    </div>

    <h3>Produto sem medidas é pior que produto sem peso</h3>
    <p>Sem altura, largura e comprimento não dá para calcular o volumétrico, e a conta usa só a
    balança — o frete sai menor do que o real, e o lucro parece maior do que é. Preencha as três
    medidas na planilha antes de precificar.</p>
    `, 'O peso que você não vê'));

  return doc('Os três canais lado a lado — Precificador Drop', p);
}

/* ══════════════════════════════════════════════════════════════════════════
   EBOOK 3 — Os degraus que comem o lucro
   ══════════════════════════════════════════════════════════════════════════ */
function ebookDegraus() {
  const d = D.degraus();
  const sh = D.tabelaShopee();
  const maior = d.shopee[0];

  const p = [];

  p.push(capa({
    n: 3,
    titulo: 'Os degraus<br/>que comem<br/>o <em>lucro</em>',
    sub: 'Existem preços em que cobrar um centavo a mais derruba o seu lucro pela metade. '
       + 'Onde eles estão, em cada canal, e como achá-los na sua planilha.',
    tempo: '10 minutos de leitura',
  }));

  p.push(pagina('As taxas sobem em degrau',
    'Não em rampa — e é aí que mora o dinheiro parado',
    `
    <p>A intuição diz que cobrar mais caro rende mais. Na maior parte da faixa de preço, é verdade.
    Mas as taxas dos marketplaces <b>não sobem junto com o preço</b>: elas ficam paradas e depois
    dão um salto.</p>
    <p>Quando o seu preço passa de um desses saltos, você paga a faixa inteira — mesmo tendo
    passado por um centavo.</p>

    <div class="chamada erro">
      <div class="chamada-t">Na Shopee, um produto de ${D.brl(maior.custo)} de custo</div>
      Vendido a ${D.brl(maior.degrau)} deixa <b>${D.brl(maior.sobraNoDegrau)}</b>.<br/>
      Vendido a ${D.brl(maior.degrau + 0.01)} deixa <b>${D.brl(maior.sobraUmCentavoAcima)}</b>.<br/>
      <b>Um centavo a mais custa ${D.brl(maior.perda)}.</b>
    </div>

    <p>E não acaba aí. Depois do salto, o lucro volta a crescer com o preço — mas leva um bom
    tempo até alcançar o que você tinha antes. Nesse intervalo, <b>você cobra mais caro e ganha
    menos</b>:</p>

    <div class="numerao">
      <div class="n"><b>${D.brl(maior.degrau)}</b><i>o degrau</i></div>
      <div class="n ruim"><b>${D.brl(maior.empate)}</b><i>só aqui volta a compensar</i></div>
      <div class="n aten"><b>${D.brl(maior.faixaMorta)}</b><i>de faixa morta no meio</i></div>
    </div>

    <p>Qualquer preço entre ${D.brl(maior.degrau)} e ${D.brl(maior.empate)} rende menos do que
    ${D.brl(maior.degrau)}. É dinheiro que você deixa na mesa cobrando mais caro do cliente —
    o pior dos dois mundos.</p>
    `, 'As taxas sobem em degrau'));

  p.push(pagina('Os degraus da Shopee',
    'Onde o valor fixo por item dá um salto',
    `
    <p>Na Shopee a comissão é por faixa de preço, somando um percentual e um valor fixo. O
    percentual quase não muda; o <b>valor fixo</b> é que salta:</p>
    <table>
      <thead><tr><th>Faixa</th><th class="num">Percentual</th><th class="num">Valor fixo</th></tr></thead>
      <tbody>
        ${sh.faixas.map((f, i) => `<tr${i === 0 ? ' class="destaque"' : ''}>
          <td>${esc(f.rotulo)}</td><td class="num">${D.pct(f.pct)}</td>
          <td class="num"><b>${D.brl(f.fixo)}</b></td></tr>`).join('')}
      </tbody>
    </table>
    <div class="tab-nota">De ${D.brl(sh.faixas[0].fixo)} para ${D.brl(sh.faixas[1].fixo)} num centavo:
    é o maior salto da tabela, e o que mais pega gente.</div>

    <h3>Os três degraus, medidos</h3>
    <table>
      <thead><tr>
        <th class="num">Degrau</th><th class="num">Custo do exemplo</th>
        <th class="num">Sobra no degrau</th><th class="num">Um centavo acima</th>
        <th class="num">Perde</th><th class="num">Só compensa acima de</th>
      </tr></thead>
      <tbody>
        ${d.shopee.map(x => `<tr>
          <td class="num"><b>${D.brl(x.degrau)}</b></td>
          <td class="num fraco">${D.brl(x.custo)}</td>
          <td class="num bom">${D.brl(x.sobraNoDegrau)}</td>
          <td class="num ruim">${D.brl(x.sobraUmCentavoAcima)}</td>
          <td class="num ruim">− ${D.brl(x.perda)}</td>
          <td class="num">${x.empate ? D.brl(x.empate) : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="chamada ok">
      <div class="chamada-t">A regra prática da Shopee</div>
      Se um produto seu está entre <b>${D.brl(sh.faixas[0].ate)}</b> e cerca de <b>R$ 88</b>,
      quase sempre rende mais baixando para ${D.brl(sh.faixas[0].ate)}. E de quebra você fica mais
      barato que o concorrente.
    </div>
    `, 'Os degraus da Shopee'));

  p.push(pagina('Os degraus do Mercado Livre',
    'Aqui quem salta é o frete',
    `
    <p>No Mercado Livre a comissão é percentual e não tem degrau. O que salta é o <b>frete</b>, que
    muda de faixa conforme o preço do produto. Os saltos são menores que os da Shopee, mas são
    mais numerosos:</p>
    <table>
      <thead><tr>
        <th class="num">Degrau</th><th class="num">Custo do exemplo</th>
        <th class="num">Sobra no degrau</th><th class="num">Perde acima</th>
        <th class="num">Só compensa acima de</th><th class="num">Faixa morta</th>
      </tr></thead>
      <tbody>
        ${d.ml.map(x => `<tr>
          <td class="num"><b>${D.brl(x.degrau)}</b></td>
          <td class="num fraco">${D.brl(x.custo)}</td>
          <td class="num bom">${D.brl(x.sobraNoDegrau)}</td>
          <td class="num ruim">− ${D.brl(x.perda)}</td>
          <td class="num">${x.empate ? D.brl(x.empate) : '—'}</td>
          <td class="num">${x.faixaMorta ? D.brl(x.faixaMorta) : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="tab-nota">Reputação verde, anúncio Clássico, 0,5 kg. Custo do exemplo: 40% do preço
    do degrau, para cada linha ser um produto plausível.</div>

    <div class="chamada">
      <div class="chamada-t">Parece pouco, mas some</div>
      ${D.brl(d.ml.find(x => Math.round(x.degrau) === 100) ? d.ml.find(x => Math.round(x.degrau) === 100).perda : d.ml[0].perda)}
      por venda parece pequeno. Em 500 vendas no mês, são
      ${D.brl(500 * (d.ml.find(x => Math.round(x.degrau) === 100) ? d.ml.find(x => Math.round(x.degrau) === 100).perda : d.ml[0].perda))} —
      e você nem sabia que estava perdendo.
    </div>

    <h3>Por que ninguém percebe</h3>
    <p>Porque olhando um produto de cada vez o número é pequeno, e olhando a planilha inteira
    ninguém tem paciência de comparar cada linha com sete degraus. É trabalho de computador.</p>
    `, 'Os degraus do Mercado Livre'));

  p.push(pagina('Como achar na sua planilha',
    'A ferramenta que faz essa varredura',
    `
    <p>O Precificador Drop tem uma ferramenta só para isso, chamada <b>Dinheiro parado</b>. Ela
    aparece nos quadros de Mercado Livre, Shopee e Amazon na página inicial.</p>

    <ol class="passos">
      <li><b>Suba a planilha com os preços que você já pratica.</b> Não é a de custos: é a que tem
        o preço que está no ar agora. Pode ser a exportação do Bling, a do Mercado Livre ou a sua.</li>
      <li><b>Aponte as colunas de custo e de preço praticado.</b> O app tenta acertar sozinho, mas
        confira — apontar a coluna errada faz toda linha parecer oportunidade.</li>
      <li><b>Escolha o canal.</b> No Mercado Livre informe também o tipo de anúncio e a sua
        reputação; os dois mudam o tamanho dos degraus.</li>
      <li><b>Leia o relatório.</b> Cada produto parado aparece com o preço de hoje, o preço
        sugerido, quanto ganha por venda ao baixar, e a partir de que preço volta a compensar
        cobrar mais.</li>
      <li><b>Baixe a lista.</b> Sai um arquivo com tudo, para você levar ao painel do marketplace.</li>
    </ol>

    <div class="chamada alerta">
      <div class="chamada-t">O relatório separa duas coisas</div>
      <b>Dinheiro parado num degrau</b> é a oportunidade de verdade — baixar aumenta o lucro.
      <b>Produtos vendendo no prejuízo</b> é outra conversa: ali a conta não fecha em preço nenhum,
      e o degrau é o menor dos problemas. Clicar na linha abre o extrato e mostra a causa.
    </div>

    <div class="chamada ok">
      <div class="chamada-t">Uma coisa que talvez surpreenda</div>
      O preço que o próprio app calcula <b>nunca</b> cai numa dessas faixas — ele percorre os
      degraus de propósito. O dinheiro parado está sempre no preço antigo, quase sempre feito por
      markup. Se você precificou tudo pelo app, provavelmente não vai achar nada — e isso é uma
      boa notícia.
    </div>
    `, 'Como achar na sua planilha'));

  return doc('Os degraus que comem o lucro — Precificador Drop', p);
}

/* ── gerar ────────────────────────────────────────────────────────────────── */
const EBOOKS = [
  {arquivo: '1-a-conta-do-preco',        html: ebookConta},
  {arquivo: '2-os-tres-canais',          html: ebookCanais},
  {arquivo: '3-os-degraus-que-comem-o-lucro', html: ebookDegraus},
];

fs.mkdirSync(SAIDA, {recursive: true});
EBOOKS.forEach(e => {
  const destino = path.join(SAIDA, e.arquivo + '.html');
  fs.writeFileSync(destino, e.html(), 'utf8');
  console.log('escrito:', path.relative(path.join(__dirname, '..'), destino));
});
console.log('\nagora: python scripts/ebooks-pdf.py');
