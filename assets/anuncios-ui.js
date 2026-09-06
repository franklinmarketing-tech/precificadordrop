/* ══════════════════════════════════════════════════════════════════════════
   AJUSTAR PREÇOS DO MERCADO LIVRE — tela

   Dois arquivos entram, um sai. A planilha do Mercado Livre volta igual, com
   uma única diferença: o preço, tirado da planilha de preços pelo SKU.

   O que a ferramenta NÃO faz, de propósito: não remonta o arquivo, não mexe
   em título, estoque, condição, envio nem tipo de anúncio, e não cria linha.
   Quanto menos toca, menos tem como estragar o que já está no ar.
   ══════════════════════════════════════════════════════════════════════════ */

const AE = window.AnunciosEngine;

let anBytesML = null, anAoaML = null, anModeloML = null;
let anAoaPrecos = null, anCabPrecos = null, anLinhaCabPrecos = 0;
let anResultado = null, anFiltro = null, anPagina = 0;
const AN_POR_PAGINA = 100;

function anDrop(ev, qual){
  ev.preventDefault();
  ev.currentTarget.classList.remove('drag');
  const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
  if(f) (qual === 'ml' ? anCarregarML : anCarregarPrecos)(f);
}

function anCartao(nome, info){
  return `<div class="file-row">
    <div class="file-ic"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>
    <div><div class="file-n">${esc(nome)}</div><div class="file-i">${info}</div></div></div>`;
}

/* ── a planilha do Mercado Livre ─────────────────────────────────────────── */
async function anCarregarML(file){
  if(!file) return;
  try{
    await garantirXLSX();
    /* guarda o arquivo como veio: é dentro dele que o preço é trocado */
    const bytes = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(bytes, {type:'array'});

    /* acha a aba pelas colunas obrigatórias, não pelo nome: o ML já mudou */
    let aoa = null, modelo = null, nome = '';
    for(const cand of wb.SheetNames){
      const a = XLSX.utils.sheet_to_json(wb.Sheets[cand], {header:1, raw:true, defval:null});
      const m = AE.lerModelo(a);
      if(m.ok){ nome = cand; aoa = a; modelo = m; break; }
    }
    if(!modelo){
      alert('Esta não parece a planilha de anúncios do Mercado Livre.\n\n'
        + 'Ela precisa ter as colunas ITEM_ID, SKU e PRICE na primeira linha.\n\n'
        + 'Baixe em: Anúncios → Editar em massa → Baixar planilha.');
      return;
    }
    anBytesML = bytes; anAoaML = aoa; anModeloML = modelo; anModeloML.aba = nome;
    $('anMLInfo').innerHTML = anCartao(file.name,
      `<b>${modelo.total.toLocaleString('pt-BR')}</b> anúncios · aba ${esc(nome)}`);
    mostrar('anMLInfo', true);
    $('arqML').classList.add('pronto');
    anTentarCasar();
  }catch(e){
    alert('Não consegui ler a planilha do Mercado Livre.\n\n' + (e && e.message ? e.message : e));
  }
}

/* ── a planilha de preços ────────────────────────────────────────────────── */
async function anCarregarPrecos(file){
  if(!file) return;
  try{
    await garantirXLSX();
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {type:'array'});
    /* mesma leitura da calculadora: a aba boa nem sempre é a primeira e o
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

    const n = Math.max(0, aoa.length - anLinhaCabPrecos - 1);
    $('anPrecosInfo').innerHTML = anCartao(file.name,
      `<b>${n.toLocaleString('pt-BR')}</b> produtos · aba ${esc(nomeAba)}`);
    mostrar('anPrecosInfo', true);
    $('arqPrecos').classList.add('pronto');
    anTentarCasar();
  }catch(e){
    alert('Não consegui ler a planilha de preços.\n\n' + (e && e.message ? e.message : e));
  }
}

/* ── com os dois na mão, casa sozinho ────────────────────────────────────── */
function anTentarCasar(){
  if(!anModeloML || !anAoaPrecos) return;

  /* adivinha as colunas; o seletor só aparece se errar, para não pedir
     decisão que o app já sabe tomar */
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

  const sel = (id, escolhido) => `<select id="${id}" onchange="anCasar()">`
    + anCabPrecos.map((c, i) => `<option value="${i}"${i === escolhido ? ' selected' : ''}>${esc(c || 'coluna ' + (i+1))}</option>`).join('')
    + '</select>';
  $('anMapa').innerHTML = `
    <div class="grp-t">DA PLANILHA DE PREÇOS, O APP USA</div>
    <div class="campos">
      <label class="campo"><span>Coluna do SKU</span>${sel('anColSku', iSku)}</label>
      <label class="campo"><span>Coluna do preço de venda</span>${sel('anColPreco', iPreco)}</label>
    </div>`;
  mostrar('anMapa', true);

  if(iSku < 0 || iPreco < 0){
    alert('Não achei sozinho as colunas de SKU e preço.\n\nEscolha nas listas abaixo.');
    return;
  }
  anCasar();
}

function anCasar(){
  const iSku = parseInt($('anColSku').value);
  const iPreco = parseInt($('anColPreco').value);
  if(isNaN(iSku) || isNaN(iPreco)) return;

  const precos = AE.indexarPrecos(anAoaPrecos, iSku, iPreco, anLinhaCabPrecos);
  if(!precos.mapa.size){
    alert(`A coluna "${anCabPrecos[iSku]}" não tem SKUs preenchidos. Escolha outra.`);
    return;
  }
  anResultado = AE.casar(anAoaML, anModeloML, precos);
  anFiltro = null; anPagina = 0;

  if(!anResultado.conferencia.atualizados){
    alert('Nenhum SKU da planilha do Mercado Livre foi encontrado na de preços.\n\n'
      + 'Confira se as colunas escolhidas estão certas — e se os SKUs são os mesmos nos dois arquivos.');
    return;
  }
  anRenderStats(); anRenderChecks(); anRenderTabela();
  mostrar('anStep4', true);
  anRestaurarChave();
  anMostrarConta();
  $('anStats').scrollIntoView({behavior: reduzido ? 'instant' : 'smooth', block:'start'});
}

function anRecomecar(){
  anBytesML = anAoaML = anModeloML = anAoaPrecos = anResultado = null;
  anFiltro = null; anPagina = 0;
  ['anStep4','anMapa','anMLInfo','anPrecosInfo'].forEach(id => mostrar(id, false));
  ['arqML','arqPrecos'].forEach(id => $(id).classList.remove('pronto'));
  $('anFi').value = ''; $('anFi2').value = '';
  window.scrollTo({top:0, behavior: reduzido ? 'instant' : 'smooth'});
}

/* ── números do lote ─────────────────────────────────────────────────────── */
function anRenderStats(){
  const c = anResultado.conferencia;
  const cards = [
    {n: c.total.toLocaleString('pt-BR'),        l:'Anúncios na planilha',  cor:'var(--ink)'},
    {n: c.atualizados.toLocaleString('pt-BR'),  l:'Com preço novo',        cor:'var(--green-dk)'},
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
    : (c.intocados ? `${c.intocados.toLocaleString('pt-BR')} SEM PREÇO NOVO` : 'PRONTO PARA SUBIR');
  badge.className = 'pill ' + (c.comErro ? 'pill-bad' : (c.intocados ? 'pill-alerta' : 'pill-ok'));

  /* o retrato do lote antes da lista: numa carga real quase toda linha cai em
     "preço muda muito", e um alerta que marca tudo não informa nada */
  const v = c.variacao;
  const pct = x => (x > 0 ? '+' : '') + Math.round(x * 100) + '%';
  const uni = v && (v.sobem === v.n || v.descem === v.n);
  const fatia = x => v.n ? (x / v.n * 100).toFixed(2) + '%' : '0%';
  $('anResumo').innerHTML = !v ? '' : `
    <div class="an-var ${uni ? 'unilateral' : ''}">
      <div class="an-var-topo">
        <div>
          <div class="an-var-lbl">O que muda no preço</div>
          <div class="an-var-h"><em>${v.n.toLocaleString('pt-BR')}</em> anúncios comparados</div>
        </div>
        <div class="an-var-mediana">
          <span>mediana</span>
          <b class="${v.mediana >= 0 ? 'sobe' : 'desce'}">${pct(v.mediana)}</b>
        </div>
      </div>

      <div class="an-var-barra">
        ${v.sobem ? `<i class="b-sobe" style="width:${fatia(v.sobem)}"></i>` : ''}
        ${v.iguais ? `<i class="b-igual" style="width:${fatia(v.iguais)}"></i>` : ''}
        ${v.descem ? `<i class="b-desce" style="width:${fatia(v.descem)}"></i>` : ''}
      </div>

      <div class="an-var-tiles">
        <div class="an-tile t-sobe">
          <span class="an-tile-ic"><svg viewBox="0 0 24 24"><path d="M12 19V6m0 0-6 6m6-6 6 6"/></svg></span>
          <span class="an-tile-n">${v.sobem.toLocaleString('pt-BR')}</span>
          <span class="an-tile-l">sobem</span>
        </div>
        <div class="an-tile t-desce">
          <span class="an-tile-ic"><svg viewBox="0 0 24 24"><path d="M12 5v13m0 0 6-6m-6 6-6-6"/></svg></span>
          <span class="an-tile-n">${v.descem.toLocaleString('pt-BR')}</span>
          <span class="an-tile-l">descem</span>
        </div>
        <div class="an-tile t-igual">
          <span class="an-tile-ic"><svg viewBox="0 0 24 24"><path d="M5 9h14M5 15h14"/></svg></span>
          <span class="an-tile-n">${v.iguais.toLocaleString('pt-BR')}</span>
          <span class="an-tile-l">iguais</span>
        </div>
        <div class="an-tile t-faixa">
          <span class="an-tile-l">faixa comum</span>
          <span class="an-tile-f">${pct(v.p10)} <i>a</i> ${pct(v.p90)}</span>
          <span class="an-tile-x">extremos ${pct(v.min)} · ${pct(v.max)}</span>
        </div>
      </div>

      ${uni ? `<div class="an-var-av">
        <span class="an-var-av-ic"><svg viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01"/><path d="M10.3 4 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/></svg></span>
        <span><b>Confira antes de subir.</b> ${v.sobem === v.n ? 'Todos os preços sobem' : 'Todos os preços descem'} —
        quando a mudança vai toda para o mesmo lado, costuma ser a margem usada na precificação
        ou a coluna de preço escolhida, não o mercado.</span>
      </div>` : ''}
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
    `<thead><tr><th>Código do anúncio</th><th>SKU</th><th>Título</th>
      <th class="c-num">Preço hoje</th><th class="c-num">Preço novo</th>
      <th class="c-num">Variação</th><th>Situação</th></tr></thead><tbody>` +
    pagina.map(l => {
      const grav = l.avisos.some(a => (AE.AVISOS[a]||{}).gravidade === 'erro') ? ' class="tr-erro"'
        : (l.avisos.some(a => (AE.AVISOS[a]||{}).gravidade === 'alerta') ? ' class="tr-alerta"' : '');
      const varTxt = l.variacao == null ? '—' : (l.variacao > 0 ? '+' : '') + (l.variacao*100).toFixed(0) + '%';
      const varCor = l.variacao == null ? 'var(--faint)' : (l.variacao > 0 ? 'var(--green-dk)' : 'var(--red)');
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

  if(grupo){
    $('anFiltroBar').innerHTML = `<div class="filtro-bar"><div class="f-ativo ${grupo.gravidade === 'erro' ? 'grave' : ''}">
      <div class="f-ativo-ic"><svg viewBox="0 0 24 24"><path d="M12 8v5m0 3h.01"/><path d="M10.3 4 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/></svg></div>
      <div><div class="f-ativo-t">Mostrando ${grupo.n.toLocaleString('pt-BR')} anúncios: <b>${esc(grupo.titulo)}</b></div>
        ${grupo.comoResolver ? `<div class="f-ajuda"><b>O que fazer agora</b>${esc(grupo.comoResolver)}</div>` : ''}</div>
      <button onclick="anVerLinhas('${grupo.id}')">ver todos os ${anResultado.linhas.length.toLocaleString('pt-BR')}</button>
    </div></div>`;
    mostrar('anFiltroBar', true);
  } else mostrar('anFiltroBar', false);
}

/* ── baixar: a mesma planilha, só com o preço trocado ────────────────────── */
async function anBaixar(){
  if(!anResultado || !anBytesML) return;
  const c = anResultado.conferencia;

  if(c.intocados){
    const ok = confirm(
      `${c.intocados.toLocaleString('pt-BR')} ${c.intocados === 1 ? 'anúncio fica' : 'anúncios ficam'} com o preço atual — `
      + 'o SKU deles não foi encontrado na planilha de preços.\n\n'
      + 'A planilha vai ter preços novos e antigos misturados. Gerar assim?');
    if(!ok) return;
  }
  const v = c.variacao;
  if(v && (v.sobem === v.n || v.descem === v.n) && v.n > 20){
    const ok = confirm(
      `Todos os ${v.n.toLocaleString('pt-BR')} preços ${v.sobem === v.n ? 'SOBEM' : 'DESCEM'}, `
      + `e metade muda mais de ${Math.round(Math.abs(v.mediana)*100)}%.\n\n`
      + 'Quando a mudança vai toda para o mesmo lado, costuma ser a margem da precificação '
      + 'ou a coluna de preço escolhida — não o mercado.\n\nGerar assim?');
    if(!ok) return;
  }

  try{
    /* só as células de preço mudam: o arquivo que sai é o que entrou */
    const novos = new Map();
    anResultado.linhas.forEach(l => {
      if(l.precoNovo != null) novos.set(l.fisica, l.precoNovo);
    });
    const r = await anTrocarPrecos(anBytesML, anModeloML.aba, anModeloML.idx.PRICE, novos);

    const stamp = new Date().toISOString().slice(0,10);
    const blob = new Blob([r.bytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mercado-livre-precos-${stamp}.xlsx`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);

    $('anBtnDl').innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
      + `Baixado — ${r.trocados.toLocaleString('pt-BR')} preços trocados`;
  }catch(e){
    alert('Não consegui gerar a planilha.\n\n' + (e && e.message ? e.message : e));
  }
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


/* ── troca os preços dentro do XML ─────────────────────────────────────────
   Aqui só o ZIP: abrir, achar o XML da aba e devolver. A reescrita é do motor
   (AE.trocarPrecosNoXml), que é texto puro e por isso tem teste. */
async function anTrocarPrecos(bytes, nomeAba, colPreco, novos){
  if(!await garantirZip()) throw new Error('Não consegui carregar a biblioteca que abre o arquivo.');

  const zip = await window.JSZip.loadAsync(bytes);
  const caminho = await anAcharXmlDaAba(zip, nomeAba);
  if(!caminho || !zip.file(caminho)) throw new Error('Não achei a aba "' + nomeAba + '" dentro do arquivo.');

  const xml = await zip.file(caminho).async('string');
  const r = AE.trocarPrecosNoXml(xml, AE.letraDaColuna(colPreco), novos);
  if(!r.trocados) return {bytes, trocados: 0};

  zip.file(caminho, r.xml);
  return {bytes: await zip.generateAsync({type:'uint8array', compression:'DEFLATE'}), trocados: r.trocados};
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

      const r = await anApi('/api/ml-atualizar-precos', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({itens: fatia.map(l => ({id: l.itemId, preco: l.preco}))}),
      });
      const d = await r.json().catch(() => ({}));
      if(!r.ok){
        if(r.status === 401 || r.status === 503 || d.precisaChave){
          caixa.className = 'api-estado erro';
          caixa.innerHTML = anErroChave(d);
          return;
        }
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
   A CHAVE DE PUBLICAÇÃO

   Mexer nos preços da loja exige uma senha que o dono digita. Ela não fica no
   código: este site é estático, e tudo que a página mandasse sozinha estaria
   no arquivo que qualquer um baixa. Digitada, ela é comparada no servidor com
   APP_SECRET e nunca aparece em endereço, log ou planilha.

   Guardamos em sessionStorage, não em localStorage, de propósito: some quando
   a aba fecha. Quem usa o app num computador compartilhado não deixa a chave
   para o próximo.
   ══════════════════════════════════════════════════════════════════════════ */
const AN_CHAVE_PUB = 'drop-chave-publicacao';

function anLerChave(){
  const campo = $('anChave');
  const digitada = campo && campo.value.trim();
  if(digitada) return digitada;
  try{ return sessionStorage.getItem(AN_CHAVE_PUB) || ''; }catch(e){ return ''; }
}

/* chamada pelo oninput do campo: quem digita uma vez não digita de novo
   enquanto a aba estiver aberta */
let anContaTimer = null;

function anLembrarChave(){
  const campo = $('anChave');
  if(!campo) return;
  /* espera parar de digitar: senão cada tecla vira uma chamada recusada */
  clearTimeout(anContaTimer);
  anContaTimer = setTimeout(anMostrarConta, 600);
  try{
    const v = campo.value.trim();
    if(v) sessionStorage.setItem(AN_CHAVE_PUB, v);
    else sessionStorage.removeItem(AN_CHAVE_PUB);
  }catch(e){ /* navegador sem storage: a chave vale só para esta chamada */ }
}

function anRestaurarChave(){
  const campo = $('anChave');
  if(!campo || campo.value) return;
  try{ campo.value = sessionStorage.getItem(AN_CHAVE_PUB) || ''; }catch(e){}
}

/* Toda chamada aos endpoints que tocam a conta passa por aqui. */
function anApi(rota, opcoes){
  const o = Object.assign({}, opcoes);
  const chave = anLerChave();
  o.headers = Object.assign({}, o.headers || {}, chave ? {'x-drop-chave': chave} : {});
  return fetch(rota, o);
}

/* Mensagem para quando o servidor recusa por causa da chave. */
function anErroChave(d){
  if(d && d.precisaChave && d.comoResolver)
    return '<b>Falta configurar a chave.</b> ' + esc(d.comoResolver);
  return '<b>Chave de publicação inválida.</b> Confira o campo acima — é a mesma senha '
    + 'que está em <b>APP_SECRET</b> nas variáveis de ambiente do projeto na Vercel.';
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
    const r = await anApi('/api/ml-conta');
    const d = await r.json().catch(() => ({}));
    anConta = r.ok ? d : null;
    return anConta;
  }catch(e){
    anConta = null;
    return null;
  }
}

/* Busca a conta e desenha o cartão. Só faz sentido com a chave preenchida —
   sem ela o servidor recusa, e aí o cartão simplesmente não aparece. */
async function anMostrarConta(){
  const caixa = $('anContaCaixa');
  if(!caixa) return;
  if(!anLerChave()){ caixa.innerHTML = ''; return; }
  await anVerConta();
  caixa.innerHTML = anCartaoConta();
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


