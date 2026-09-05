/* ══════════════════════════════════════════════════════════════════════════
   ANÚNCIOS — tela. O motor vive em anuncios-engine.js; aqui é só o que a
   pessoa vê: carregar os dois arquivos, conferir e baixar.
   ══════════════════════════════════════════════════════════════════════════ */

const AE = window.AnunciosEngine;

let anBytesML = null;      // o arquivo do ML como veio, para reescrever preservando tudo
let anAoaML = null;
let anModelo = null;
let anAoaPrecos = null;
let anCabPrecos = null;
let anLinhaCabPrecos = 0;
let anResultado = null;
let anFiltro = null;
let anPagina = 0;
const AN_POR_PAGINA = 100;

function anDrop(ev, qual){
  ev.preventDefault();
  ev.currentTarget.classList.remove('drag');
  const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
  if(f) (qual === 'ml' ? anCarregarML : anCarregarPrecos)(f);
}

/* ── passo 1: o arquivo do Mercado Livre ─────────────────────────────────── */
async function anCarregarML(file){
  if(!file) return;
  try{
    await garantirXLSX();
    const buf = new Uint8Array(await file.arrayBuffer());
    anBytesML = buf;
    const wb = XLSX.read(buf, {type:'array'});

    /* a aba certa é a "Anúncios"; se o ML renomear, procuramos a que tem as
       colunas obrigatórias em vez de desistir pelo nome */
    let nome = wb.SheetNames.find(n => n.toLowerCase().indexOf('an') === 0 && n.toLowerCase().indexOf('nci') > 0);
    let aoa = null, modelo = null;
    for(const cand of (nome ? [nome].concat(wb.SheetNames) : wb.SheetNames)){
      const a = XLSX.utils.sheet_to_json(wb.Sheets[cand], {header:1, raw:true, defval:null});
      const m = AE.lerModelo(a);
      if(m.ok){ nome = cand; aoa = a; modelo = m; break; }
    }
    if(!modelo || !modelo.ok){
      const m = AE.lerModelo(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, raw:true, defval:null}));
      alert('Este arquivo não tem a estrutura de anúncios do Mercado Livre.\n\n'
        + (m.erros || []).join('\n')
        + '\n\nBaixe em: Anúncios → Editar em massa → Baixar planilha.');
      return;
    }

    anAoaML = aoa; anModelo = modelo; anModelo.aba = nome;
    $('anMLInfo').innerHTML = `
      <div class="file-row">
        <div class="file-ic"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>
        <div><div class="file-n">${esc(file.name)}</div>
          <div class="file-i">aba <b>${esc(nome)}</b> · <b>${modelo.total.toLocaleString('pt-BR')}</b> anúncios · estrutura conferida</div></div>
      </div>`;
    mostrar('anMLInfo', true);
    mostrar('anStep2', true);
    $('anStep2').scrollIntoView({behavior: reduzido ? 'instant' : 'smooth', block:'start'});
  }catch(e){
    alert('Não consegui ler o arquivo.\n\n' + (e && e.message ? e.message : e));
  }
}

/* ── passo 2: a planilha de preços ───────────────────────────────────────── */
async function anCarregarPrecos(file){
  if(!file || !anModelo) return;
  try{
    await garantirXLSX();
    const buf = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(buf, {type:'array'});
    /* mesma detecção da calculadora: a aba boa nem sempre é a primeira e o
       cabeçalho nem sempre está na linha 1 */
    const abas = wb.SheetNames.map((nome, i) => ({
      nome,
      aoa: XLSX.utils.sheet_to_json(XU.normalizarRef(wb.Sheets[nome]), {header:1, defval:'', raw:false}),
      oculta: !!(wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i]
                 && wb.Workbook.Sheets[i].Hidden),
    }));
    const escolha = ML.escolherAba(abas);
    const nomeAba = escolha.nome || wb.SheetNames[0];
    const aoa = (abas.find(a => a.nome === nomeAba) || abas[0]).aoa;

    const det = ML.detectarCabecalho(aoa);
    anLinhaCabPrecos = det && det.linha != null ? det.linha : 0;
    anAoaPrecos = aoa;
    anCabPrecos = (aoa[anLinhaCabPrecos] || []).map(v => v == null ? '' : String(v));

    /* adivinha as colunas e deixa a pessoa corrigir: SKU e preço são o
       coração do casamento, errar aqui estraga o arquivo inteiro */
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
    const iSku = acha(['sku','código','codigo','ref']);
    const iPreco = acha(['preço de venda ml','preço de venda','preço','preco','valor']);

    const opts = (sel) => anCabPrecos.map((c, i) =>
      `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(c || 'coluna ' + (i+1))}</option>`).join('');
    $('anMapa').innerHTML = `
      <div class="file-row" style="margin-bottom:16px">
        <div class="file-ic"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>
        <div><div class="file-n">${esc(file.name)}</div>
          <div class="file-i">aba <b>${esc(nomeAba)}</b> · <b>${(aoa.length - anLinhaCabPrecos - 1).toLocaleString('pt-BR')}</b> linhas</div></div>
      </div>
      <div class="campos">
        <label class="campo"><span>Coluna do SKU</span>
          <select id="anColSku">${opts(iSku)}</select></label>
        <label class="campo"><span>Coluna do preço de venda</span>
          <select id="anColPreco">${opts(iPreco)}</select></label>
      </div>
      <button class="btn btn-green btn-block" style="margin-top:16px" onclick="anCasar()">
        <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>
        Conferir e casar por SKU</button>`;
    mostrar('anMapa', true);
    if(iSku < 0 || iPreco < 0)
      alert('Não achei sozinho as colunas de SKU e preço — escolha nas listas antes de continuar.');
  }catch(e){
    alert('Não consegui ler a planilha de preços.\n\n' + (e && e.message ? e.message : e));
  }
}

/* ── o casamento ─────────────────────────────────────────────────────────── */
function anCasar(){
  const iSku = parseInt($('anColSku').value);
  const iPreco = parseInt($('anColPreco').value);
  if(isNaN(iSku) || isNaN(iPreco)) return;

  const precos = AE.indexarPrecos(anAoaPrecos, iSku, iPreco, anLinhaCabPrecos);
  if(!precos.mapa.size){
    alert(`A coluna "${anCabPrecos[iSku]}" não tem SKUs preenchidos. Escolha outra coluna.`);
    return;
  }
  anResultado = AE.casar(anAoaML, anModelo, precos);
  anFiltro = null; anPagina = 0;

  if(!anResultado.conferencia.atualizados){
    alert('Nenhum SKU do arquivo do Mercado Livre foi encontrado na planilha de preços.\n\n'
      + 'Confira se as colunas escolhidas estão certas — e se os SKUs são realmente os mesmos nos dois arquivos.');
    return;
  }
  anRenderStats(); anRenderChecks(); anRenderTabela();
  mostrar('anStep3', true);
  $('anStats').scrollIntoView({behavior: reduzido ? 'instant' : 'smooth', block:'start'});
}

function anRecomecar(){
  anBytesML = anAoaML = anModelo = anAoaPrecos = anResultado = null;
  anFiltro = null; anPagina = 0;
  mostrar('anStep2', false); mostrar('anStep3', false);
  mostrar('anMLInfo', false); mostrar('anMapa', false);
  $('anFi').value = ''; $('anFi2').value = '';
  window.scrollTo({top:0, behavior: reduzido ? 'instant' : 'smooth'});
}

/* ── números do lote ─────────────────────────────────────────────────────── */
function anRenderStats(){
  const c = anResultado.conferencia;
  const cards = [
    {n: c.total.toLocaleString('pt-BR'),        l:'Anúncios no arquivo',   cor:'var(--ink)'},
    {n: c.atualizados.toLocaleString('pt-BR'),  l:'Recebem preço novo',    cor:'var(--green-dk)'},
    {n: c.intocados.toLocaleString('pt-BR'),    l:'Seguem como estão',     cor: c.intocados ? 'var(--amber-dk)' : 'var(--faint)'},
    {n: c.semAnuncio.toLocaleString('pt-BR'),   l:'Produtos sem anúncio',  cor:'var(--faint)'},
  ];
  $('anStats').innerHTML = cards.map((x,i) => `
    <div class="stat" style="animation-delay:${i*.04}s">
      <div class="stat-n" style="color:${x.cor}">${x.n}</div>
      <div class="stat-l">${x.l}</div></div>`).join('');
}

/* ── conferência ─────────────────────────────────────────────────────────── */
function anRenderChecks(){
  const c = anResultado.conferencia;
  const badge = $('anBadge');
  badge.textContent = c.comErro ? `${c.comErro} PRECISAM DE CORREÇÃO`
    : (c.atualizados === c.total ? 'ESTRUTURA OK' : `${c.intocados} PARA CONFERIR`);
  badge.className = 'pill ' + (c.comErro ? 'pill-bad' : (c.intocados ? 'pill-alerta' : 'pill-ok'));

  /* O retrato do lote vem antes da lista. Numa carga real quase toda linha
     cai em "preço muda muito" — o alerta linha a linha vira ruído, e o que
     decide se pode subir é a direção e o tamanho da mudança. */
  const v = c.variacao;
  const pct = x => (x > 0 ? '+' : '') + Math.round(x * 100) + '%';
  $('anResumo').innerHTML = !v ? '' : `
    <div class="an-var ${v.descem === 0 || v.sobem === 0 ? 'unilateral' : ''}">
      <div class="an-var-t">O que muda no preço de ${v.n.toLocaleString('pt-BR')} anúncios</div>
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
        quando a mudança vai toda para o mesmo lado, costuma ser a margem do passo 2 ou a coluna de preço escolhida,
        não o mercado. São ${v.n.toLocaleString('pt-BR')} anúncios de uma vez.</div>` : ''}
    </div>`;

  $('anChecks').innerHTML = c.grupos.map(g => `
    <div class="chk ${g.gravidade === 'erro' ? 'bad' : (g.gravidade === 'alerta' ? 'alerta' : 'ok')}">
      <div class="chk-i">${g.gravidade === 'erro'
        ? '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M12 8v5m0 3h.01"/><path d="M10.3 4 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/></svg>'}</div>
      <div><div class="chk-t">${esc(g.titulo)} <span class="chk-n">${g.n.toLocaleString('pt-BR')} ${g.n === 1 ? 'produto' : 'produtos'}</span></div>
        <div class="chk-d">${esc(g.descricao)}</div>
        ${g.comoResolver ? `<div class="chk-r"><b>O que fazer agora</b>${esc(g.comoResolver)}</div>` : ''}</div>
      ${g.soLeitura ? '' : `<button class="chk-btn${anFiltro === g.id ? ' on' : ''}" onclick="anVerLinhas('${g.id}')">
        ${anFiltro === g.id ? 'ver todos' : `ver ${g.n === 1 ? 'a linha' : 'as linhas'}`}
        <svg viewBox="0 0 24 24"><path d="M5 12h14M13 5l7 7-7 7"/></svg></button>`}
    </div>`).join('');
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
  const c = anResultado.conferencia;
  const grupo = anFiltro ? c.grupos.find(g => g.id === anFiltro) : null;
  const alvo = grupo ? grupo.linhas.map(i => anResultado.linhas[i]) : anResultado.linhas;

  const total = alvo.length;
  const paginas = Math.max(1, Math.ceil(total / AN_POR_PAGINA));
  anPagina = Math.min(anPagina, paginas - 1);
  const inicio = anPagina * AN_POR_PAGINA;
  const pagina = alvo.slice(inicio, inicio + AN_POR_PAGINA);

  $('anTabInfo').textContent = `${c.atualizados.toLocaleString('pt-BR')} com preço novo`;

  $('anTabela').innerHTML =
    `<thead><tr><th>Anúncio</th><th>SKU</th><th>Título</th>
      <th class="c-num">Preço hoje</th><th class="c-num">Preço novo</th>
      <th class="c-num">Variação</th><th>Situação</th></tr></thead><tbody>` +
    pagina.map(l => {
      const grav = l.avisos.some(a => (AE.AVISOS[a]||{}).gravidade === 'erro') ? ' class="tr-erro"'
        : (l.avisos.some(a => (AE.AVISOS[a]||{}).gravidade === 'alerta') ? ' class="tr-alerta"' : '');
      const varTxt = l.variacao == null ? '—'
        : (l.variacao > 0 ? '+' : '') + (l.variacao * 100).toFixed(0) + '%';
      const varCor = l.variacao == null ? 'var(--faint)'
        : (l.variacao > 0 ? 'var(--green-dk)' : 'var(--red)');
      const sit = l.avisos.length
        ? l.avisos.map(a => `<span class="tag ${(AE.AVISOS[a]||{}).gravidade === 'erro' ? 'tag-erro' : 'tag-alerta'}">${esc((AE.AVISOS[a]||{}).titulo || a)}</span>`).join(' ')
        : '<span style="color:var(--green-dk)">ok</span>';
      return `<tr${grav}>
        <td class="c-linha">${esc(l.itemId)}</td>
        <td class="c-desc">${esc(l.sku) || '—'}</td>
        <td class="c-desc" title="${esc(l.titulo)}">${esc(l.titulo.slice(0,60)) || '—'}</td>
        <td class="c-num c-taxa">${isNaN(l.precoAtual) ? '—' : ML.brl(l.precoAtual)}</td>
        <td class="c-num c-preco">${l.precoNovo == null ? '—' : ML.brl(l.precoNovo)}</td>
        <td class="c-num" style="color:${varCor};font-weight:600">${varTxt}</td>
        <td>${sit}</td></tr>`;
    }).join('') + '</tbody>';

  $('anPaginacao').innerHTML = paginas > 1
    ? `<div class="paginacao">
        <button ${anPagina === 0 ? 'disabled' : ''} onclick="anIrPagina(${anPagina-1})">‹ Anterior</button>
        <span>${(inicio+1).toLocaleString('pt-BR')}–${Math.min(inicio+AN_POR_PAGINA,total).toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}</span>
        <button ${anPagina >= paginas-1 ? 'disabled' : ''} onclick="anIrPagina(${anPagina+1})">Próximas ›</button>
      </div>` : '';

  const fb = $('anFiltroBar');
  if(grupo){
    fb.innerHTML = `<div class="filtro-bar"><div class="f-ativo ${grupo.gravidade === 'erro' ? 'grave' : ''}">
      <div class="f-ativo-ic"><svg viewBox="0 0 24 24"><path d="M12 8v5m0 3h.01"/><path d="M10.3 4 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/></svg></div>
      <div><div class="f-ativo-t">Mostrando ${grupo.n.toLocaleString('pt-BR')} anúncios: <b>${esc(grupo.titulo)}</b></div>
        ${grupo.comoResolver ? `<div class="f-ajuda"><b>O que fazer agora</b>${esc(grupo.comoResolver)}</div>` : ''}</div>
      <button onclick="anVerLinhas('${grupo.id}')">ver todos os ${anResultado.linhas.length.toLocaleString('pt-BR')}</button>
    </div></div>`;
    mostrar('anFiltroBar', true);
  } else mostrar('anFiltroBar', false);
}

/* ── baixar ──────────────────────────────────────────────────────────────── */
async function anBaixar(){
  if(!anResultado || !anBytesML) return;
  const c = anResultado.conferencia;

  if(c.intocados){
    const ok = confirm(
      `${c.intocados.toLocaleString('pt-BR')} ${c.intocados === 1 ? 'anúncio fica' : 'anúncios ficam'} com o preço atual — `
      + 'o SKU deles não foi encontrado na planilha de preços.\n\n'
      + 'O arquivo vai ter preços novos e antigos misturados. Gerar assim?');
    if(!ok) return;
  }
  const v = c.variacao;
  if(v && (v.sobem === v.n || v.descem === v.n) && v.n > 20){
    const dir = v.sobem === v.n ? 'SOBEM' : 'DESCEM';
    const ok = confirm(
      `Todos os ${v.n.toLocaleString('pt-BR')} preços ${dir}, e metade muda mais de `
      + `${Math.round(Math.abs(v.mediana)*100)}%.\n\n`
      + 'Quando a mudança vai toda para o mesmo lado, costuma ser a margem ou a coluna de preço '
      + 'escolhida — não o mercado.\n\nSubir esse arquivo muda o preço de todos esses anúncios de uma vez. Gerar?');
    if(!ok) return;
  }

  try{
    await garantirXLSX();
    /* relê o arquivo original e escreve SÓ o preço: assim as outras abas, as
       fórmulas e os códigos do ML seguem exatamente como vieram */
    const wb = XLSX.read(anBytesML, {type:'array'});
    const ws = wb.Sheets[anModelo.aba];
    const colPreco = anModelo.idx.PRICE;
    let n = 0;
    anResultado.linhas.forEach(l => {
      if(l.precoNovo == null) return;
      const end = XLSX.utils.encode_cell({r: l.fisica, c: colPreco});
      ws[end] = {t:'n', v: l.precoNovo};
      n++;
    });

    const stamp = new Date().toISOString().slice(0,10);
    const nome = `anuncios-ml-precos-${stamp}.xlsx`;
    const saida = XLSX.write(wb, {bookType:'xlsx', type:'array'});
    const blob = new Blob([saida], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);

    $('anBtnDl').innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>`
      + `Baixado — ${n.toLocaleString('pt-BR')} preços gravados`;
  }catch(e){
    alert('Não consegui gerar o arquivo.\n\n' + (e && e.message ? e.message : e));
  }
}
