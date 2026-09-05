/* ══════════════════════════════════════════════════════════════════════════
   PLANILHA NO PADRÃO MERCADO LIVRE — tela.
   O motor vive em anuncios-engine.js; aqui é só o que a pessoa vê: carregar
   a planilha de preços, opcionalmente o arquivo de anúncios (que traz o
   ITEM_ID), escolher como montar, conferir e baixar.
   ══════════════════════════════════════════════════════════════════════════ */

const AE = window.AnunciosEngine;

let anAoaPrecos = null, anCabPrecos = null, anLinhaCabPrecos = 0;
let anAoaML = null, anModeloML = null, anAnuncios = null, anBytesML = null;
let anMontado = null, anFiltro = null, anPagina = 0;
const AN_POR_PAGINA = 100;

function anDrop(ev, qual){
  ev.preventDefault();
  ev.currentTarget.classList.remove('drag');
  const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
  if(f) (qual === 'ml' ? anCarregarML : anCarregarPrecos)(f);
}

/* mesma leitura da calculadora: a aba boa nem sempre é a primeira e o
   cabeçalho nem sempre está na linha 1 */
function anLerAbas(wb){
  const abas = wb.SheetNames.map((nome, i) => ({
    nome,
    aoa: XLSX.utils.sheet_to_json(XU.normalizarRef(wb.Sheets[nome]), {header:1, defval:'', raw:false}),
    oculta: !!(wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i]
               && wb.Workbook.Sheets[i].Hidden),
  }));
  const escolha = ML.escolherAba(abas);
  const nome = escolha.nome || wb.SheetNames[0];
  return {nome, aoa: (abas.find(a => a.nome === nome) || abas[0]).aoa};
}

function anCartao(nome, info){
  return `<div class="file-row">
    <div class="file-ic"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>
    <div><div class="file-n">${esc(nome)}</div><div class="file-i">${info}</div></div></div>`;
}

/* ── passo 1: a planilha de preços ───────────────────────────────────────── */
async function anCarregarPrecos(file){
  if(!file) return;
  try{
    await garantirXLSX();
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {type:'array'});
    const lido = anLerAbas(wb);
    const det = ML.detectarCabecalho(lido.aoa);
    anLinhaCabPrecos = det && det.linha != null ? det.linha : 0;
    anAoaPrecos = lido.aoa;
    anCabPrecos = (lido.aoa[anLinhaCabPrecos] || []).map(v => v == null ? '' : String(v));

    const linhas = Math.max(0, lido.aoa.length - anLinhaCabPrecos - 1);
    $('anPrecosInfo').innerHTML = anCartao(file.name,
      `aba <b>${esc(lido.nome)}</b> · <b>${linhas.toLocaleString('pt-BR')}</b> produtos · ${anCabPrecos.length} colunas`);
    mostrar('anPrecosInfo', true);
    mostrar('anStep2', true);
    anMostrarGuardado();
    anMontarOpcoes();
    $('anStep2').scrollIntoView({behavior: reduzido ? 'instant' : 'smooth', block:'start'});
  }catch(e){
    alert('Não consegui ler a planilha de preços.\n\n' + (e && e.message ? e.message : e));
  }
}

/* ── passo 2: o arquivo de anúncios (opcional) ───────────────────────────── */
async function anCarregarML(file){
  if(!file) return;
  try{
    await garantirXLSX();
    /* guarda o arquivo como veio: é dentro dele que a planilha final é
       escrita, e é de lá que vêm as cores do cabeçalho — a biblioteca do
       app lê formatação, mas não sabe criar */
    const bytes = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(bytes, {type:'array'});

    /* procura a aba que tem as colunas obrigatórias, em vez de confiar no nome */
    let aoa = null, modelo = null, nome = '';
    for(const cand of wb.SheetNames){
      const a = XLSX.utils.sheet_to_json(wb.Sheets[cand], {header:1, raw:true, defval:null});
      const m = AE.lerModelo(a);
      if(m.ok){ nome = cand; aoa = a; modelo = m; break; }
    }
    if(!modelo){
      alert('Este arquivo não tem a estrutura de anúncios do Mercado Livre.\n\n'
        + 'Ele precisa ter as colunas ITEM_ID, SKU e PRICE na primeira linha.\n\n'
        + 'Baixe em: Anúncios → Editar em massa → Baixar planilha.');
      return;
    }
    anAoaML = aoa; anModeloML = modelo; anModeloML.aba = nome;
    anBytesML = bytes;
    anAnuncios = AE.indexarAnuncios(aoa, modelo);

    $('anMLInfo').innerHTML = anCartao(file.name,
      `aba <b>${esc(nome)}</b> · <b>${modelo.total.toLocaleString('pt-BR')}</b> anúncios · `
      + `<b>${anAnuncios.size.toLocaleString('pt-BR')}</b> códigos por SKU`);
    mostrar('anMLInfo', true);
    anGuardar(anAnuncios, 'arquivo');   // na próxima vez não precisa subir de novo
    anMostrarGuardado();
    anMostrarPasso3();
  }catch(e){
    alert('Não consegui ler o arquivo de anúncios.\n\n' + (e && e.message ? e.message : e));
  }
}

function anPularML(){
  anAoaML = null; anModeloML = null; anAnuncios = null;
  mostrar('anMLInfo', false);
  anMostrarPasso3();
}

function anMostrarPasso3(){
  anMontarOpcoes();
  mostrar('anStep3', true);
  $('anStep3').scrollIntoView({behavior: reduzido ? 'instant' : 'smooth', block:'start'});
}

/* ── passo 3: as escolhas ────────────────────────────────────────────────── */
function anMontarOpcoes(){
  if(!anCabPrecos) return;

  /* adivinha as colunas e deixa corrigir: errar o SKU ou o preço estraga o
     arquivo inteiro, e o nome da coluna muda de fornecedor para fornecedor */
  const acha = alvos => {
    for(const a of alvos){
      const i = anCabPrecos.findIndex(c => c.trim().toLowerCase() === a);
      if(i >= 0) return i;
    }
    for(const a of alvos){
      const i = anCabPrecos.findIndex(c => c.toLowerCase().indexOf(a) >= 0);
      if(i >= 0) return i;
    }
    return -1;
  };
  const sel = (id, escolhido, comVazio) => `<select id="${id}">`
    + (comVazio ? `<option value="-1"${escolhido < 0 ? ' selected' : ''}>— não usar —</option>` : '')
    + anCabPrecos.map((c, i) => `<option value="${i}"${i === escolhido ? ' selected' : ''}>${esc(c || 'coluna ' + (i+1))}</option>`).join('')
    + '</select>';

  $('anMapa').innerHTML = `
    <label class="campo"><span>SKU do produto</span>${sel('anColSku', acha(['sku','código','codigo','ref']))}</label>
    <label class="campo"><span>Título do anúncio</span>${sel('anColTitulo', acha(['nome do produto','título','titulo','nome','descrição','descricao']))}</label>
    <label class="campo"><span>Preço de venda</span>${sel('anColPreco', acha(['preço de venda ml','preço de venda','preço','preco','valor']))}</label>
    <label class="campo"><span>Estoque (opcional)</span>${sel('anColEstoque', acha(['estoque','quantidade','qtd']), true)}</label>`;

  const temML = !!(anAnuncios && anAnuncios.size);
  $('anQuais').innerHTML = `
    <div class="an-opts">
      <label class="an-opt">
        <input type="radio" name="anIncluir" value="todos" checked/>
        <div><b>Todos os produtos da planilha</b>
          <i>${temML
            ? 'Quem já tem anúncio sai com o código preenchido e sobe direto. Quem não tem sai com o código em branco — o Mercado Livre não publica anúncio novo por esta planilha, mas você fica com a lista do que falta criar.'
            : 'Sem o arquivo de anúncios, todas as linhas saem sem o código ITEM_ID.'}</i></div>
      </label>
      <label class="an-opt${temML ? '' : ' off'}">
        <input type="radio" name="anIncluir" value="comAnuncio" ${temML ? '' : 'disabled'}/>
        <div><b>Só os que já têm anúncio no Mercado Livre</b>
          <i>${temML
            ? 'Arquivo enxuto, só com linhas que o Mercado Livre aceita de fato. Mais seguro para subir sem erro.'
            : 'Precisa do arquivo de anúncios do passo 2 para saber quais já existem.'}</i></div>
      </label>
    </div>`;

  const opc = (id, rot, vals, padrao, ajuda) => `
    <label class="campo"><span>${rot}${ajuda ? ' ' + ajuda : ''}</span>
      <select id="${id}">${vals.map(v =>
        `<option value="${esc(v)}"${v === padrao ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;

  $('anPadroes').innerHTML =
    opc('anTipo', 'Tipo de anúncio', ['Clássico','Premium'], 'Clássico', '(Clássico = 13%, Premium = 18%)')
  + opc('anCondicao', 'Condição', ['Novo','Usado','Recondicionado'], 'Novo')
  + opc('anEnvio', 'Forma de entrega',
        ['Mercado Envios por conta do comprador','Mercado Envios grátis'],
        'Mercado Envios por conta do comprador')
  + opc('anEstado', 'Estado do anúncio', ['Ativo','Inativo'], 'Ativo')
  + `<label class="campo"><span>Estoque padrão (quando a planilha não traz)</span>
       <input type="number" id="anEstoque" min="0" step="1" value="1"/></label>`;

  /* o resumo na linha fechada tem de dizer a verdade: se a pessoa mudar uma
     opção e fechar, o que ela lê ali é o que vai para o arquivo */
  ['anTipo','anCondicao','anEnvio','anEstado','anEstoque'].forEach(id => {
    const el = $(id);
    if(el) el.addEventListener('change', anResumirPadroes);
  });
  anResumirPadroes();
}

function anResumirPadroes(){
  const alvo = $('anResumoPadroes');
  if(!alvo || !$('anTipo')) return;
  const envio = $('anEnvio').value.indexOf('grátis') >= 0 ? 'frete grátis' : 'envio pelo comprador';
  alvo.textContent = [$('anTipo').value, $('anCondicao').value, $('anEstado').value, envio,
                      'estoque ' + ($('anEstoque').value || '1')].join(' · ');
}

/* ── gerar ───────────────────────────────────────────────────────────────── */
function anGerar(){
  const cols = {
    sku: parseInt($('anColSku').value),
    titulo: parseInt($('anColTitulo').value),
    preco: parseInt($('anColPreco').value),
    estoque: parseInt($('anColEstoque').value),
  };
  if(isNaN(cols.sku) || isNaN(cols.preco)) return;
  if(cols.sku === cols.preco){
    alert('SKU e preço estão apontando para a mesma coluna. Escolha colunas diferentes.');
    return;
  }

  const prods = AE.lerProdutos(anAoaPrecos, cols, anLinhaCabPrecos);
  if(!prods.itens.length){
    alert(`A coluna "${anCabPrecos[cols.sku]}" não tem SKUs preenchidos. Escolha outra coluna.`);
    return;
  }

  const marcado = document.querySelector('input[name="anIncluir"]:checked');
  const padroes = {
    incluir: marcado ? marcado.value : 'todos',
    tipo: $('anTipo').value,
    condicao: $('anCondicao').value,
    envio: $('anEnvio').value,
    estado: $('anEstado').value,
    estoque: Math.max(0, parseInt($('anEstoque').value) || 1),
    atualizarTitulo: $('anAtualizarTitulo').checked,
  };

  anMontado = AE.montarML(prods.itens, anAnuncios, padroes, anAoaML);
  anMontado.duplicados = prods.duplicados;
  anFiltro = null; anPagina = 0;

  if(!anMontado.linhas.length){
    alert('Nenhum produto entrou no arquivo.\n\n'
      + 'Você escolheu "só os que já têm anúncio", e nenhum SKU da planilha bateu com os anúncios do Mercado Livre.');
    return;
  }
  anRenderStats(); anRenderChecks(); anRenderTabela();
  mostrar('anStep4', true);
  $('anStats').scrollIntoView({behavior: reduzido ? 'instant' : 'smooth', block:'start'});
}

function anRecomecar(){
  anAoaPrecos = anAoaML = anModeloML = anAnuncios = anMontado = anBytesML = null;
  anFiltro = null; anPagina = 0;
  ['anStep2','anStep3','anStep4','anPrecosInfo','anMLInfo'].forEach(id => mostrar(id, false));
  $('anFi').value = ''; $('anFi2').value = '';
  window.scrollTo({top:0, behavior: reduzido ? 'instant' : 'smooth'});
}

/* ── números do lote ─────────────────────────────────────────────────────── */
function anRenderStats(){
  const r = anMontado.resumo;
  const cards = [
    {n: r.total.toLocaleString('pt-BR'),      l:'Linhas no arquivo',         cor:'var(--ink)'},
    {n: r.comAnuncio.toLocaleString('pt-BR'), l:'Sobem direto (com código)', cor:'var(--green-dk)'},
    {n: r.novos.toLocaleString('pt-BR'),      l:'Ainda sem anúncio',         cor: r.novos ? 'var(--amber-dk)' : 'var(--faint)'},
    {n: r.semPreco.toLocaleString('pt-BR'),   l:'Sem preço',                 cor: r.semPreco ? 'var(--red)' : 'var(--faint)'},
  ];
  $('anStats').innerHTML = cards.map((x,i) => `
    <div class="stat" style="animation-delay:${i*.04}s">
      <div class="stat-n" style="color:${x.cor}">${x.n}</div>
      <div class="stat-l">${x.l}</div></div>`).join('');
}

/* ── conferência ─────────────────────────────────────────────────────────── */
function anRenderChecks(){
  const c = anMontado.conferencia, r = anMontado.resumo;
  const badge = $('anBadge');
  badge.textContent = c.comErro ? `${c.comErro} PRECISAM DE CORREÇÃO`
    : (r.novos ? `${r.novos.toLocaleString('pt-BR')} SEM ANÚNCIO` : 'PRONTO PARA SUBIR');
  badge.className = 'pill ' + (c.comErro ? 'pill-bad' : (r.novos ? 'pill-alerta' : 'pill-ok'));

  /* O retrato do lote vem antes da lista: numa carga real quase toda linha cai
     em "preço muda muito", e um alerta que marca tudo não informa nada. */
  const v = r.variacao;
  const pct = x => (x > 0 ? '+' : '') + Math.round(x * 100) + '%';
  $('anResumo').innerHTML = !v ? '' : `
    <div class="an-var ${(v.sobem === v.n || v.descem === v.n) ? 'unilateral' : ''}">
      <div class="an-var-t">O que muda no preço de ${v.n.toLocaleString('pt-BR')} anúncios que já estão no ar</div>
      <div class="an-var-g">
        <span class="l-sobe"><b>${v.sobem.toLocaleString('pt-BR')}</b> sobem</span>
        <span class="l-desce"><b>${v.descem.toLocaleString('pt-BR')}</b> descem</span>
        <span class="l-igual"><b>${v.iguais.toLocaleString('pt-BR')}</b> ficam iguais</span>
      </div>
      <div class="an-var-e">
        <span>metade muda mais de <b>${pct(v.mediana)}</b></span>
        <span>faixa comum: <b>${pct(v.p10)}</b> a <b>${pct(v.p90)}</b></span>
        <span>extremos: <b>${pct(v.min)}</b> e <b>${pct(v.max)}</b></span>
      </div>
      ${(v.sobem === v.n || v.descem === v.n) ? `<div class="an-var-av">
        <b>Confira antes de subir.</b> ${v.sobem === v.n ? 'Todos os preços sobem' : 'Todos os preços descem'} —
        quando a mudança vai toda para o mesmo lado, costuma ser a margem usada na precificação ou a coluna
        de preço escolhida, não o mercado. São ${v.n.toLocaleString('pt-BR')} anúncios de uma vez.</div>` : ''}
    </div>`;

  const extras = (anMontado.duplicados && anMontado.duplicados.length) ? `
    <div class="chk alerta">
      <div class="chk-i"><svg viewBox="0 0 24 24"><path d="M12 8v5m0 3h.01"/><path d="M10.3 4 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/></svg></div>
      <div><div class="chk-t">SKU repetido na planilha <span class="chk-n">${anMontado.duplicados.length.toLocaleString('pt-BR')} linhas</span></div>
        <div class="chk-d">O mesmo SKU aparece mais de uma vez. Cada SKU vira uma linha só no arquivo — valeu a primeira.</div>
        <div class="chk-r"><b>O que fazer agora</b>Deixe um preço por SKU na planilha de origem, senão o preço que sobe pode não ser o que você quer.</div></div>
    </div>` : '';

  $('anChecks').innerHTML = c.grupos.map(g => `
    <div class="chk ${g.gravidade === 'erro' ? 'bad' : (g.gravidade === 'alerta' ? 'alerta' : 'ok')}">
      <div class="chk-i">${g.gravidade === 'erro'
        ? '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M12 8v5m0 3h.01"/><path d="M10.3 4 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/></svg>'}</div>
      <div><div class="chk-t">${esc(g.titulo)} <span class="chk-n">${g.n.toLocaleString('pt-BR')} ${g.n === 1 ? 'produto' : 'produtos'}</span></div>
        <div class="chk-d">${esc(g.descricao)}</div>
        ${g.comoResolver ? `<div class="chk-r"><b>O que fazer agora</b>${esc(g.comoResolver)}</div>` : ''}</div>
      <button class="chk-btn${anFiltro === g.id ? ' on' : ''}" onclick="anVerLinhas('${g.id}')">
        ${anFiltro === g.id ? 'ver todos' : `ver ${g.n === 1 ? 'a linha' : 'as linhas'}`}
        <svg viewBox="0 0 24 24"><path d="M5 12h14M13 5l7 7-7 7"/></svg></button>
    </div>`).join('') + extras;
}

function anVerLinhas(id){
  const ligando = anFiltro !== id;
  anFiltro = ligando ? id : null;
  anPagina = 0;
  anRenderChecks(); anRenderTabela();
  if(ligando){
    const alvo = $('anPainelTabela');
    if(alvo) alvo.scrollIntoView({behavior: reduzido ? 'instant' : 'smooth', block:'start'});
  }
}
function anIrPagina(n){ anPagina = n; anRenderTabela(); }

/* ── tabela ──────────────────────────────────────────────────────────────── */
function anRenderTabela(){
  const c = anMontado.conferencia;
  const grupo = anFiltro ? c.grupos.find(g => g.id === anFiltro) : null;
  const alvo = grupo ? grupo.linhas.map(i => anMontado.linhas[i]) : anMontado.linhas;

  const total = alvo.length;
  const paginas = Math.max(1, Math.ceil(total / AN_POR_PAGINA));
  anPagina = Math.min(anPagina, paginas - 1);
  const inicio = anPagina * AN_POR_PAGINA;
  const pagina = alvo.slice(inicio, inicio + AN_POR_PAGINA);

  $('anTabInfo').textContent = `${anMontado.resumo.total.toLocaleString('pt-BR')} linhas`;

  $('anTabela').innerHTML =
    `<thead><tr><th>Código do anúncio</th><th>SKU</th><th>Título</th>
      <th class="c-num">Preço hoje</th><th class="c-num">Preço novo</th>
      <th class="c-num">Variação</th><th class="c-num">Estoque</th><th>Situação</th></tr></thead><tbody>` +
    pagina.map(l => {
      const grav = l.avisos.some(a => (AE.AVISOS_MONTAGEM[a]||{}).gravidade === 'erro') ? ' class="tr-erro"'
        : (l.avisos.some(a => (AE.AVISOS_MONTAGEM[a]||{}).gravidade === 'alerta') ? ' class="tr-alerta"' : '');
      const varTxt = l.variacao == null ? '—' : (l.variacao > 0 ? '+' : '') + (l.variacao*100).toFixed(0) + '%';
      const varCor = l.variacao == null ? 'var(--faint)' : (l.variacao > 0 ? 'var(--green-dk)' : 'var(--red)');
      const sit = l.avisos.length
        ? l.avisos.map(a => `<span class="tag ${(AE.AVISOS_MONTAGEM[a]||{}).gravidade === 'erro' ? 'tag-erro' : 'tag-alerta'}">${esc((AE.AVISOS_MONTAGEM[a]||{}).titulo || a)}</span>`).join(' ')
        : '<span style="color:var(--green-dk)">ok</span>';
      return `<tr${grav}>
        <td class="c-linha">${esc(l.itemId) || '<i style="color:var(--faint)">sem código</i>'}</td>
        <td class="c-desc">${esc(l.sku)}</td>
        <td class="c-desc" title="${esc(l.titulo)}">${esc(l.titulo.slice(0,60)) || '—'}</td>
        <td class="c-num c-taxa">${isNaN(l.precoAtual) ? '—' : ML.brl(l.precoAtual)}</td>
        <td class="c-num c-preco">${l.preco === '' ? '—' : ML.brl(l.preco)}</td>
        <td class="c-num" style="color:${varCor};font-weight:600">${varTxt}</td>
        <td class="c-num c-peso">${esc(String(l.celulas[7]))}</td>
        <td>${sit}</td></tr>`;
    }).join('') + '</tbody>';

  $('anPaginacao').innerHTML = paginas > 1
    ? `<div class="paginacao">
        <button ${anPagina === 0 ? 'disabled' : ''} onclick="anIrPagina(${anPagina-1})">‹ Anterior</button>
        <span>${(inicio+1).toLocaleString('pt-BR')}–${Math.min(inicio+AN_POR_PAGINA,total).toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}</span>
        <button ${anPagina >= paginas-1 ? 'disabled' : ''} onclick="anIrPagina(${anPagina+1})">Próximas ›</button>
      </div>` : '';

  if(grupo){
    $('anFiltroBar').innerHTML = `<div class="filtro-bar"><div class="f-ativo ${grupo.gravidade === 'erro' ? 'grave' : ''}">
      <div class="f-ativo-ic"><svg viewBox="0 0 24 24"><path d="M12 8v5m0 3h.01"/><path d="M10.3 4 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/></svg></div>
      <div><div class="f-ativo-t">Mostrando ${grupo.n.toLocaleString('pt-BR')} produtos: <b>${esc(grupo.titulo)}</b></div>
        ${grupo.comoResolver ? `<div class="f-ajuda"><b>O que fazer agora</b>${esc(grupo.comoResolver)}</div>` : ''}</div>
      <button onclick="anVerLinhas('${grupo.id}')">ver todas as ${anMontado.linhas.length.toLocaleString('pt-BR')}</button>
    </div></div>`;
    mostrar('anFiltroBar', true);
  } else mostrar('anFiltroBar', false);
}

/* ── baixar ──────────────────────────────────────────────────────────────── */
async function anBaixar(){
  if(!anMontado) return;
  const r = anMontado.resumo;

  if(r.novos){
    const ok = confirm(
      `${r.novos.toLocaleString('pt-BR')} ${r.novos === 1 ? 'produto sai' : 'produtos saem'} sem o código do anúncio.\n\n`
      + 'A planilha de edição do Mercado Livre não publica anúncio novo — essas linhas servem como '
      + 'lista do que falta criar, e o ML vai recusá-las se você subir assim.\n\n'
      + 'Quer gerar mesmo assim? (Para um arquivo só com o que sobe, volte e escolha '
      + '"só os que já têm anúncio".)');
    if(!ok) return;
  }
  const v = r.variacao;
  if(v && (v.sobem === v.n || v.descem === v.n) && v.n > 20){
    const ok = confirm(
      `Todos os ${v.n.toLocaleString('pt-BR')} preços ${v.sobem === v.n ? 'SOBEM' : 'DESCEM'}, `
      + `e metade muda mais de ${Math.round(Math.abs(v.mediana)*100)}%.\n\n`
      + 'Quando a mudança vai toda para o mesmo lado, costuma ser a margem da precificação ou a '
      + 'coluna de preço escolhida — não o mercado.\n\nGerar assim?');
    if(!ok) return;
  }

  if(!anBytesML){
    const ok = confirm(
      'A planilha vai sair com a estrutura certa do Mercado Livre, mas SEM as cores '
      + 'e os grupos do cabeçalho.\n\n'
      + 'Essa formatação vem do próprio arquivo que o ML entrega — para tê-la, volte ao '
      + 'passo 2 e envie a planilha baixada em Anúncios → Editar em massa.\n\n'
      + 'Gerar sem a formatação?');
    if(!ok) return;
  }

  try{
    await garantirXLSX();
    const nomeAba = 'Anúncios';

    let saida;
    if(anBytesML){
      /* dentro do arquivo do ML, trocando só as linhas de dados: é assim que
         o cabeçalho colorido sobrevive */
      saida = await anGerarComMolde(anBytesML, anModeloML.aba,
                                    anMontado.linhas.map(l => l.celulas), AE.INICIO_DADOS);
    } else {
      /* Sem o arquivo do ML não há molde: sai com a estrutura certa, só sem
         as cores do cabeçalho. O aviso na tela diz isso antes de gerar. */
      const aoa = anMontado.cabecalho.concat(anMontado.linhas.map(l => l.celulas));
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{wch:20},{wch:16},{wch:15},{wch:15},{wch:16},{wch:56},{wch:22},
                     {wch:11},{wch:11},{wch:8},{wch:12},{wch:34},{wch:14},{wch:13},{wch:9}];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, nomeAba);
      saida = XLSX.write(wb, {bookType:'xlsx', type:'array'});
    }

    const stamp = new Date().toISOString().slice(0,10);
    const blob = new Blob([saida], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mercado-livre-${stamp}.xlsx`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);

    $('anBtnDl').innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
      + `Baixado — ${r.total.toLocaleString('pt-BR')} linhas no padrão do Mercado Livre`;
  }catch(e){
    alert('Não consegui gerar o arquivo.\n\n' + (e && e.message ? e.message : e));
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   BUSCAR OS ANÚNCIOS DIRETO NO MERCADO LIVRE

   O que interessa do arquivo "Editar em massa" é o ITEM_ID de cada SKU, e a
   API entrega isso sem ninguém precisar baixar e subir planilha. Vem em
   páginas porque conta grande não cabe numa função serverless de 10 s.
   ══════════════════════════════════════════════════════════════════════════ */
async function anBuscarNaApi(){
  const btn = $('anBtnApi');
  const caixa = $('anApiEstado');
  const antes = btn.innerHTML;
  btn.disabled = true;
  mostrar('anApiEstado', true);

  const mostrarEstado = (cls, html) => {
    caixa.className = 'api-estado ' + (cls || '');
    caixa.innerHTML = html;
  };

  try{
    mostrarEstado('', 'Falando com o Mercado Livre…');
    const mapa = new Map();
    let scroll = '', paginas = 0, total = null;

    while(paginas < 200){                    // trava de segurança contra laço infinito
      const r = await fetch('/api/ml-meus-anuncios' + (scroll ? '?scroll=' + encodeURIComponent(scroll) : ''));
      const d = await r.json().catch(() => ({}));

      if(!r.ok){
        if(d.precisaAutorizar){
          mostrarEstado('erro',
            '<b>Falta autorizar a conta que vende.</b> A ligação de hoje é do aplicativo, e com ela o '
            + 'Mercado Livre deixa consultar categorias e tarifas, mas não deixa ver nem mexer nos seus anúncios. '
            + 'Isso é uma autorização à parte, e só você pode dar:'
            + '<ol class="api-passos">'
            + '<li>Abra <a href="/api/ml-auth" target="_blank" rel="noopener">/api/ml-auth</a> e entre com a conta que vende.</li>'
            + '<li>Autorize o aplicativo.</li>'
            + '<li>Copie o <b>refresh_token</b> que aparece e guarde na variável <b>ML_REFRESH_TOKEN</b> do projeto na Vercel.</li>'
            + '</ol>'
            + 'Enquanto isso, o caminho do arquivo abaixo funciona igual.');
          return;
        }
        throw new Error(d.erro || ('O Mercado Livre respondeu ' + r.status));
      }

      (d.itens || []).forEach(it => {
        if(!it.sku || mapa.has(it.sku)) return;
        mapa.set(it.sku, {
          FAMILY_ID: '', ITEM_ID: it.id, PRODUCT_NUMBER: '', VARIATION_ID: '',
          TITLE: it.titulo || '', PRICE: it.preco == null ? NaN : it.preco,
          QUANTITY: it.estoque == null ? '' : it.estoque,
        });
      });

      paginas++;
      if(total == null && d.total != null) total = d.total;
      mostrarEstado('', `Trazendo seus anúncios… <b>${mapa.size.toLocaleString('pt-BR')}</b>`
        + (total ? ` de ${total.toLocaleString('pt-BR')}` : '') + ' com SKU.');

      scroll = d.scroll || '';
      if(d.acabou || !scroll) break;
    }

    if(!mapa.size){
      mostrarEstado('erro',
        '<b>Nenhum anúncio com SKU.</b> Vieram anúncios da sua conta, mas nenhum tem SKU preenchido — '
        + 'e é pelo SKU que a planilha encontra cada anúncio. Preencha o SKU nos anúncios do Mercado Livre '
        + 'ou use o arquivo abaixo.');
      return;
    }

    anAnuncios = mapa;
    anGuardar(mapa, 'api');             // vale para a próxima visita
    anMostrarGuardado();
    anAoaML = null;          // veio da API, não de arquivo: sem molde para as cores
    anModeloML = null; anBytesML = null;
    await anVerConta();
    mostrarEstado('ok', `<b>${mapa.size.toLocaleString('pt-BR')} anúncios</b> trazidos do Mercado Livre`
      + (total ? ` (de ${total.toLocaleString('pt-BR')} na conta)` : '') + '.'
      + anCartaoConta());
    mostrar('anMLInfo', false);
    anMostrarPasso3();
  }catch(e){
    mostrarEstado('erro', '<b>Não consegui buscar.</b> ' + esc(e && e.message ? e.message : String(e)));
  }finally{
    btn.disabled = false;
    btn.innerHTML = antes;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   PUBLICAR OS PREÇOS DIRETO NO MERCADO LIVRE

   Muda o preço do anúncio no ar, para quem estiver olhando agora, e o
   Mercado Livre não tem desfazer. Vai em lotes de 50 mostrando o andamento:
   se algo estiver errado dá para parar no primeiro lote em vez de varrer a
   loja inteira.
   ══════════════════════════════════════════════════════════════════════════ */
async function anPublicarPrecos(){
  if(!anMontado) return;
  const alvo = anMontado.linhas.filter(l => l.itemId && l.preco !== '' && l.preco > 0);
  if(!alvo.length){
    alert('Nenhuma linha tem código de anúncio e preço ao mesmo tempo.\n\n'
      + 'Traga os códigos no passo 2 — pelo botão do Mercado Livre ou pelo arquivo.');
    return;
  }

  const v = anMontado.resumo.variacao;
  const aviso = v && (v.sobem === v.n || v.descem === v.n)
    ? `\n\nATENÇÃO: todos os preços ${v.sobem === v.n ? 'SOBEM' : 'DESCEM'}, metade mais de `
      + `${Math.round(Math.abs(v.mediana)*100)}%.`
    : '';
  if(!anConta) await anVerConta();
  const quem = anConta ? 'CONTA: ' + (anConta.apelido || anConta.nome || anConta.id) + '\n\n' : '';
  const ok = confirm(
    quem + `Isto muda o preço de ${alvo.length.toLocaleString('pt-BR')} anúncios no ar, agora.\n\n`
    + 'Quem estiver vendo o anúncio passa a ver o preço novo. O Mercado Livre não tem desfazer — '
    + 'para voltar seria preciso publicar os preços antigos de novo.' + aviso
    + '\n\nQuer publicar?');
  if(!ok) return;

  const btn = $('anBtnPub');
  const caixa = $('anApiPub');
  btn.disabled = true;
  mostrar('anApiPub', true);

  const LOTE = 50;
  let feitos = 0, falhas = [];
  try{
    for(let i = 0; i < alvo.length; i += LOTE){
      const fatia = alvo.slice(i, i + LOTE);
      caixa.className = 'api-estado';
      caixa.innerHTML = `Publicando… <b>${feitos.toLocaleString('pt-BR')}</b> de ${alvo.length.toLocaleString('pt-BR')}`;

      const r = await fetch('/api/ml-atualizar-precos', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({itens: fatia.map(l => ({id: l.itemId, preco: l.preco}))}),
      });
      const d = await r.json().catch(() => ({}));
      if(!r.ok){
        if(d.precisaAutorizar){
          caixa.className = 'api-estado erro';
          caixa.innerHTML = '<b>Falta autorizar a conta que vende.</b> Abra '
            + '<a href="/api/ml-auth" target="_blank" rel="noopener">/api/ml-auth</a>, autorize, e guarde o '
            + 'refresh_token em <b>ML_REFRESH_TOKEN</b> na Vercel.';
          return;
        }
        throw new Error(d.erro || ('O Mercado Livre respondeu ' + r.status));
      }
      feitos += d.atualizados || 0;
      (d.resultados || []).filter(x => !x.ok).forEach(x => falhas.push(x));
    }

    caixa.className = 'api-estado ' + (falhas.length ? 'erro' : 'ok');
    caixa.innerHTML = `<b>${feitos.toLocaleString('pt-BR')} preços publicados.</b>`
      + (falhas.length
        ? ` ${falhas.length.toLocaleString('pt-BR')} não foram: `
          + esc(falhas.slice(0,3).map(f => f.id + ' (' + (f.erro || '') + ')').join(' · '))
          + (falhas.length > 3 ? ' …' : '')
        : ' Confira no Mercado Livre.');
  }catch(e){
    caixa.className = 'api-estado erro';
    caixa.innerHTML = `<b>Parou no meio.</b> ${esc(e && e.message ? e.message : String(e))}`
      + ` Publicados até aqui: <b>${feitos.toLocaleString('pt-BR')}</b>.`;
  }finally{
    btn.disabled = false;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   QUAL CONTA ESTÁ LIGADA

   A tela de autorização do Mercado Livre usa a conta logada no navegador, sem
   perguntar — autorizar pela conta errada é fácil, e o erro só apareceria com
   os preços já publicados na loja errada. Por isso o apelido da conta aparece
   antes de qualquer publicação, e a confirmação repete o nome.
   ══════════════════════════════════════════════════════════════════════════ */
let anConta = null;

async function anVerConta(){
  try{
    const r = await fetch('/api/ml-conta');
    const d = await r.json().catch(() => ({}));
    anConta = r.ok ? d : null;
    return anConta;
  }catch(e){
    anConta = null;
    return null;
  }
}

function anCartaoConta(){
  if(!anConta) return '';
  return `<div class="conta-ml">
    <div class="conta-ml-ic"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
    <div><div class="conta-ml-t">Conectado como <b>${esc(anConta.apelido || anConta.nome || ('conta ' + anConta.id))}</b></div>
      <div class="conta-ml-d">Os preços vão para os anúncios desta conta. Se não for ela,
        refaça a autorização em <a href="/api/ml-auth" target="_blank" rel="noopener">/api/ml-auth</a>
        usando uma janela anônima.</div></div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   ESCREVER DENTRO DO ARQUIVO DO MERCADO LIVRE, SEM PERDER A FORMATAÇÃO

   A biblioteca que o app usa para planilhas lê cor de célula, mas não sabe
   gravar: passar o arquivo por ela devolve tudo em branco, e o cabeçalho
   colorido do Mercado Livre — os grupos "Anúncios", "Informações do
   produto", "Condições de entrega", "Condições do anúncio" — some.

   Um .xlsx é um zip de XMLs. Aqui trocamos SÓ as linhas de dados dentro do
   XML da aba e devolvemos o resto do zip intacto: as cinco linhas de
   cabeçalho continuam com o estilo que vieram, porque nunca são tocadas.

   Os valores vão como texto embutido (inlineStr) em vez de entrar na tabela
   de textos compartilhados: assim não é preciso mexer em sharedStrings.xml,
   que é usado por todas as abas ao mesmo tempo.
   ══════════════════════════════════════════════════════════════════════════ */
const JSZIP_CDNS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
];
let zipCarregando = null;

async function garantirZip(){
  if(window.JSZip) return true;
  if(!zipCarregando){
    zipCarregando = (async () => {
      for(const url of JSZIP_CDNS){
        try{ await carregarScript(url); if(window.JSZip) return true; }
        catch(e){ /* tenta o próximo endereço */ }
      }
      return false;
    })();
  }
  const ok = await zipCarregando;
  if(!ok) zipCarregando = null;
  return ok;
}

function anColunaLetra(n){
  let s = '';
  while(n >= 0){ s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}
function anEscXml(t){
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* Descobre qual XML guarda a aba, seguindo workbook.xml → rels. O nome do
   arquivo não é fixo: "Anúncios" pode ser sheet3.xml num arquivo e sheet1.xml
   noutro, conforme a ordem das abas. */
async function anAcharXmlDaAba(zip, nomeAba){
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  const rels  = await zip.file('xl/_rels/workbook.xml.rels').async('string');

  const alvo = nomeAba.toLowerCase();
  let rid = null;
  const re = /<sheet[^>]*\sname="([^"]*)"[^>]*\sr:id="([^"]*)"/g;
  let m;
  while((m = re.exec(wbXml))){
    const nome = m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    if(nome.toLowerCase() === alvo){ rid = m[2]; break; }
  }
  if(!rid) return null;

  const reRel = new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"');
  const mr = rels.match(reRel) || rels.match(new RegExp('Target="([^"]+)"[^>]*Id="' + rid + '"'));
  if(!mr) return null;
  let alvoArq = mr[1].replace(/^\/?xl\//, '').replace(/^\//, '');
  return 'xl/' + alvoArq;
}

async function anGerarComMolde(bytes, nomeAba, linhas, primeira){
  if(!await garantirZip()) throw new Error('Não consegui carregar a biblioteca que abre o arquivo.');

  const zip = await window.JSZip.loadAsync(bytes);
  const caminho = await anAcharXmlDaAba(zip, nomeAba);
  if(!caminho || !zip.file(caminho)) throw new Error('Não achei a aba "' + nomeAba + '" dentro do arquivo.');

  let xml = await zip.file(caminho).async('string');

  /* estilo de cada coluna, copiado da primeira linha de dados do arquivo
     original: assim as linhas novas saem com a mesma cara das que vieram */
  const estilos = {};
  const mPrim = xml.match(new RegExp('<row r="' + (primeira + 1) + '"[\\s\\S]*?</row>'));
  if(mPrim){
    const reC = /<c r="([A-Z]+)\d+"([^>]*)>/g;
    let mc;
    while((mc = reC.exec(mPrim[0]))){
      const s = mc[2].match(/s="(\d+)"/);
      if(s) estilos[mc[1]] = s[1];
    }
  }

  const partes = [];
  linhas.forEach((celulas, i) => {
    const r = primeira + 1 + i;
    const cs = [];
    celulas.forEach((v, c) => {
      if(v === '' || v == null) return;
      const L = anColunaLetra(c);
      const st = estilos[L] ? ` s="${estilos[L]}"` : '';
      if(typeof v === 'number' && isFinite(v)){
        cs.push(`<c r="${L}${r}"${st}><v>${v}</v></c>`);
      } else {
        cs.push(`<c r="${L}${r}"${st} t="inlineStr"><is><t xml:space="preserve">${anEscXml(v)}</t></is></c>`);
      }
    });
    partes.push(`<row r="${r}">${cs.join('')}</row>`);
  });

  const ini = xml.indexOf('<row r="' + (primeira + 1) + '"');
  const fim = xml.lastIndexOf('</row>');
  if(ini < 0 || fim < 0) throw new Error('O arquivo não tem linhas de dados onde eu esperava.');
  xml = xml.slice(0, ini) + partes.join('') + xml.slice(fim + 6);

  const ultima = primeira + linhas.length;
  xml = xml.replace(/<dimension ref="[^"]*"\/>/,
                    `<dimension ref="A1:${anColunaLetra(AE.ORDEM.length - 1)}${ultima}"/>`);

  zip.file(caminho, xml);
  return await zip.generateAsync({type:'uint8array', compression:'DEFLATE'});
}

/* ══════════════════════════════════════════════════════════════════════════
   GUARDAR OS ANÚNCIOS NO NAVEGADOR

   O que interessa do arquivo do Mercado Livre é o código de cada SKU, e isso
   muda pouco: anúncio novo entra de vez em quando, o resto continua igual.
   Baixar e subir a planilha toda vez para buscar a mesma coisa é trabalho à
   toa — então o app guarda depois do primeiro envio e oferece na volta.

   Fica só neste navegador. São ~320 KB para 2.650 anúncios; o limite costuma
   ser 5 MB, mas se estourar o app segue funcionando sem guardar.
   ══════════════════════════════════════════════════════════════════════════ */
const AN_CHAVE = 'drop-anuncios';

/* formato enxuto: array de arrays em vez de objetos com nome de campo
   repetido 2.650 vezes — cabe quase o dobro no mesmo espaço */
function anGuardar(mapa, origem){
  try{
    const linhas = [];
    mapa.forEach((a, sku) => linhas.push([
      sku, a.ITEM_ID, a.FAMILY_ID || '', a.PRODUCT_NUMBER || '',
      a.VARIATION_ID || '', a.TITLE || '',
      (isNaN(a.PRICE) ? 0 : a.PRICE), a.QUANTITY === '' ? '' : a.QUANTITY,
    ]));
    localStorage.setItem(AN_CHAVE, JSON.stringify({
      versao: 1, em: Date.now(), origem: origem || 'arquivo', linhas,
    }));
    return true;
  }catch(e){
    /* cota estourada ou navegador em modo restrito: não é erro que mereça
       parar o fluxo, só não vai ter atalho na próxima vez */
    return false;
  }
}

function anLerGuardado(){
  try{
    const cru = localStorage.getItem(AN_CHAVE);
    if(!cru) return null;
    const d = JSON.parse(cru);
    if(!d || d.versao !== 1 || !Array.isArray(d.linhas) || !d.linhas.length) return null;
    const mapa = new Map();
    d.linhas.forEach(L => mapa.set(L[0], {
      ITEM_ID: L[1], FAMILY_ID: L[2], PRODUCT_NUMBER: L[3], VARIATION_ID: L[4],
      TITLE: L[5], PRICE: Number(L[6]) || NaN, QUANTITY: L[7],
    }));
    return {mapa, em: d.em, origem: d.origem};
  }catch(e){ return null; }
}

function anEsquecer(){
  try{ localStorage.removeItem(AN_CHAVE); }catch(e){}
  anAnuncios = null;
  anMostrarGuardado();
}

function anDataCurta(ms){
  const d = new Date(ms);
  return d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})
       + ' às ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
}

/* o atalho aparece no passo 2, antes de pedir o arquivo de novo */
function anMostrarGuardado(){
  const caixa = $('anGuardado');
  if(!caixa) return;
  const g = anLerGuardado();
  if(!g){ mostrar('anGuardado', false); return; }

  caixa.innerHTML = `
    <div class="an-salvo">
      <div class="an-salvo-ic"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></div>
      <div class="an-salvo-txt">
        <b>${g.mapa.size.toLocaleString('pt-BR')} anúncios já guardados aqui</b>
        <i>${g.origem === 'api' ? 'buscados no Mercado Livre' : 'do arquivo que você enviou'}
           em ${esc(anDataCurta(g.em))} · ficam só neste navegador</i>
      </div>
      <div class="an-salvo-btns">
        <button class="btn btn-green" onclick="anUsarGuardado()">Usar estes</button>
        <button class="btn btn-ghost" onclick="anEsquecer()">Apagar</button>
      </div>
    </div>`;
  mostrar('anGuardado', true);
}

function anUsarGuardado(){
  const g = anLerGuardado();
  if(!g) return;
  anAnuncios = g.mapa;
  anAoaML = null; anModeloML = null; anBytesML = null;   // sem arquivo: sem molde de cor
  $('anMLInfo').innerHTML = anCartao('Anúncios guardados',
    `<b>${g.mapa.size.toLocaleString('pt-BR')}</b> códigos por SKU · de ${esc(anDataCurta(g.em))}`);
  mostrar('anMLInfo', true);
  anMostrarPasso3();
}
