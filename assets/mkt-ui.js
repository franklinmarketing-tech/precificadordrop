/* ══════════════════════════════════════════════════════════════════════════
   CALCULADORA DE QUALQUER CANAL — tela

   Uma tela só serve Shopee e Amazon: o que muda entre elas são as perguntas
   (categoria, plano, quem entrega), e cada canal descreve as suas num FORM.
   O Mercado Livre tem tela própria, mais antiga e mais completa, e fica como
   está — reescrevê-la agora seria mexer no que já roda em produção.
   ══════════════════════════════════════════════════════════════════════════ */

let mkCanal = null;      // motor do canal aberto
let mkAoa = null, mkCab = [], mkLinhaCab = 0, mkNomeArquivo = '';
/* o arquivo cru, para reescrever em cima dele na hora de baixar */
let mkBytes = null, mkAbaNome = '';
let mkLinhas = [], mkConf = null, mkFiltro = null, mkPagina = 0;
const MK_POR_PAGINA = 100;

/* Peso em gramas numa coluna que diz "kg". Sem isto, uma planilha com 350 na
   coluna de peso era lida como 350 kg: na Amazon o frete pulava de R$ 17 para
   R$ 1.244 e o preço saía dez vezes maior — com um aviso amarelo de "peso
   alto" que não impedia nada. Na Shopee o preço não muda (o vendedor não paga
   frete), mas o peso declarado a menos é cobrado depois da entrega. */
let mkPesoSuspeito = false, mkPesoConfirmadoKg = false, mkPesoInfo = null;
let mkPesosConvertidos = new Set();
/* número da linha na planilha → posição em mkLinhas, para a linha clicada
   achar o próprio registro sem varrer o vetor */
let mkIndicePorLinha = new Map();
/* produtos cujo preço atual está logo acima de um degrau de taxa */
let mkDegraus = null;

const MK_CANAIS = {
  shopee: {motor: () => window.MktShopee, nome: 'Shopee',
           logo: 'assets/img/logo-shopee.svg', classe: 'ws-shopee'},
  amazon: {motor: () => window.MktAmazon, nome: 'Amazon',
           logo: 'assets/img/logo-amazon.svg', classe: 'ws-amazon'},
};

function mkAbrir(id){
  const def = MK_CANAIS[id];
  const motor = def && def.motor();
  if(!motor){ alert('Este canal ainda não está disponível.'); return; }
  mkCanal = motor;
  mkCanal._def = def;
  mkLinhas = []; mkConf = null; mkFiltro = null; mkPagina = 0;
  mkAoa = null; mkBytes = null; mkAbaNome = '';
  mkPesoSuspeito = false; mkPesoConfirmadoKg = false; mkPesoInfo = null;

  $('mkMarca').innerHTML = `<img src="${def.logo}" alt="${esc(def.nome)}"/>`;
  $('mkTitulo').innerHTML = `Precificar <span class="grad">${esc(def.nome)}.</span>`;
  /* a cor do canal vem da mesma variável usada nos quadros da home */
  $('view-mkt').className = 'view ' + def.classe;
  ['mkStep2','mkStep3','mkInfo'].forEach(x => mostrar(x, false));
  $('mkFi').value = '';
  ir('mkt');
}

function mkDrop(ev){
  ev.preventDefault();
  ev.currentTarget.classList.remove('drag');
  const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
  if(f) mkCarregar(f);
}

/* ── passo 1: a planilha ─────────────────────────────────────────────────── */
async function mkCarregar(file){
  if(!file || !mkCanal) return;
  try{
    await garantirXLSX();
    mkBytes = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(mkBytes, {type:'array'});
    /* mesma leitura da calculadora do Mercado Livre: a aba boa nem sempre é a
       primeira e o cabeçalho nem sempre está na linha 1 */
    const abas = wb.SheetNames.map((nome, i) => ({
      nome,
      aoa: XLSX.utils.sheet_to_json(XU.normalizarRef(wb.Sheets[nome]), {header:1, defval:'', raw:false}),
      oculta: !!(wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i]
                 && wb.Workbook.Sheets[i].Hidden),
    }));
    const escolha = ML.escolherAba(abas);
    const nomeAba = escolha.nome || wb.SheetNames[0];
    const aoa = (abas.find(a => a.nome === nomeAba) || abas[0]).aoa;

    mkAbaNome = nomeAba;
    const det = ML.detectarCabecalho(aoa);
    mkLinhaCab = det && det.linha != null ? det.linha : 0;
    mkAoa = aoa;
    mkCab = (aoa[mkLinhaCab] || []).map(v => v == null ? '' : String(v));
    mkNomeArquivo = file.name;

    const n = Math.max(0, aoa.length - mkLinhaCab - 1);
    $('mkInfo').innerHTML = `<div class="file-row">
      <div class="file-ic"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>
      <div><div class="file-n">${esc(file.name)}</div>
        <div class="file-i">aba <b>${esc(nomeAba)}</b> · <b>${n.toLocaleString('pt-BR')}</b> produtos · ${mkCab.length} colunas</div></div>
    </div>`;
    mostrar('mkInfo', true);
    mkMontarForm();
    mostrar('mkStep2', true);
    $('mkStep2').scrollIntoView({behavior: reduzido ? 'instant' : 'smooth', block:'start'});
  }catch(e){
    alert('Não consegui ler a planilha.\n\n' + (e && e.message ? e.message : e));
  }
}

/* ── passo 2: colunas e parâmetros do canal ──────────────────────────────── */
function mkAcha(alvos){
  for(const a of alvos){
    const i = mkCab.findIndex(c => c.trim().toLowerCase() === a);
    if(i >= 0) return i;
  }
  for(const a of alvos){
    const i = mkCab.findIndex(c => c.toLowerCase().indexOf(a) >= 0);
    if(i >= 0) return i;
  }
  return -1;
}

function mkMontarForm(){
  const sel = (id, escolhido, comVazio) => `<select id="${id}">`
    + (comVazio ? `<option value="-1"${escolhido < 0 ? ' selected' : ''}>— não usar —</option>` : '')
    + mkCab.map((c, i) => `<option value="${i}"${i === escolhido ? ' selected' : ''}>${esc(c || 'coluna ' + (i+1))}</option>`).join('')
    + '</select>';

  $('mkColunas').innerHTML = `
    <label class="campo"><span>Custo do produto</span>${sel('mkColCusto', mkAcha(['custo','preço de custo','preco','valor']))}</label>
    <label class="campo"><span>Peso</span>${sel('mkColPeso', mkAcha(['peso (kg)','peso']), true)}
      <div class="uni-peso" id="mkUniBox">
        <span>Os números estão em</span>
        <select id="mkPesoUnidade" onchange="mkChecarPeso()">
          <option value="kg">quilos (2,5 = 2,5 kg)</option>
          <option value="g">gramas (2000 = 2 kg)</option>
          <option value="auto">misturado — corrigir só os que parecem gramas</option>
        </select>
      </div>
      <div class="uni-alerta hide" id="mkUniAlerta"></div></label>
    <label class="campo"><span>Altura</span>${sel('mkColA', mkAcha(['altura']), true)}</label>
    <label class="campo"><span>Largura</span>${sel('mkColL', mkAcha(['largura']), true)}</label>
    <label class="campo"><span>Comprimento</span>${sel('mkColC', mkAcha(['comprimento']), true)}</label>
    <label class="campo"><span>Gravar o preço em</span>${sel('mkColPreco', mkAcha(['preço','preco','valor']))}</label>
    <label class="campo"><span>Preço que você pratica hoje
      <i>opcional — com ele o app procura produtos parados num degrau de taxa</i></span>
      ${sel('mkColPrecoHoje', mkAcha(['preço de venda','preco de venda','preço atual','preco atual']), true)}</label>`;

  const selPeso = $('mkColPeso');
  if(selPeso) selPeso.addEventListener('change', mkChecarPeso);

  /* as perguntas do canal saem do FORM que ele mesmo declara */
  const P = mkCanal.PADRAO;
  $('mkParams').innerHTML = (mkCanal.FORM || []).map(f => {
    if(f.tipo === 'select')
      return `<label class="campo" data-campo="${f.id}"><span>${esc(f.rot)}${f.ajuda ? ` <i>${esc(f.ajuda)}</i>` : ''}</span>
        <select id="mkP_${f.id}" onchange="mkAtualizarForm()">${f.opcoes.map(o =>
          `<option value="${esc(o.v)}"${o.v === P[f.id] ? ' selected' : ''}>${esc(o.t)}</option>`).join('')}</select></label>`;
    if(f.tipo === 'numero')
      return `<label class="campo" data-campo="${f.id}"><span>${esc(f.rot)}${f.ajuda ? ` <i>${esc(f.ajuda)}</i>` : ''}</span>
        <input type="number" id="mkP_${f.id}" min="0" step="0.01" value="${Number(P[f.id]) || 0}"/></label>`;
    /* o motor trabalha com fração (0,06); quem preenche pensa em % */
    if(f.tipo === 'percentual')
      return `<label class="campo" data-campo="${f.id}"><span>${esc(f.rot)}${f.ajuda ? ` <i>${esc(f.ajuda)}</i>` : ''}</span>
        <input type="number" id="mkP_${f.id}" min="0" max="99" step="0.1" value="${((Number(P[f.id]) || 0) * 100).toFixed(2).replace(/\.?0+$/, '')}"/></label>`;
    return `<label class="sw" data-campo="${f.id}" style="grid-column:1/-1">
      <input type="checkbox" id="mkP_${f.id}"${P[f.id] ? ' checked' : ''}/>
      ${esc(f.rot)}${f.ajuda ? ` — ${esc(f.ajuda)}` : ''}</label>`;
  }).join('');

  /* o que a documentação do canal não responde fica visível, não escondido:
     quem precifica milhares de itens precisa saber onde a conta pode variar */
  const alvo = $('mkRessalvas');
  const rs = mkCanal.RESSALVAS || [];
  if(alvo){
    alvo.innerHTML = !rs.length ? '' : `
      <div class="nota-box" style="margin-top:16px;margin-bottom:0">
        <svg viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01"/><path d="M10.3 4 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/></svg>
        <div><b>O que a ${esc(mkCanal.nome)} não deixa claro</b>
          <ul style="margin:6px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:5px">
            ${rs.map(x => `<li>${esc(x)}</li>`).join('')}
          </ul></div>
      </div>`;
    mostrar('mkRessalvas', !!rs.length);
  }
  mkAtualizarForm();
  mkChecarPeso();
}

/* ── peso em gramas ────────────────────────────────────────────────────────
   Mesma detecção da calculadora do Mercado Livre (ML.detectarEscalaPeso): a
   coluna inteira é analisada e a troca é oferecida, nunca feita por conta
   própria — catálogo de item pesado de verdade existe. */
function mkChecarPeso(){
  const caixa = $('mkUniAlerta');
  const selCol = $('mkColPeso'), selUni = $('mkPesoUnidade');
  if(!caixa || !selCol) return;

  const ip = parseInt(selCol.value);
  mostrar('mkUniBox', ip >= 0);
  if(isNaN(ip) || ip < 0 || !mkAoa){
    mkPesoSuspeito = false; mostrar('mkUniAlerta', false); return;
  }

  const r = ML.detectarEscalaPeso(mkAoa.slice(mkLinhaCab + 1).map(l => l && l[ip]));
  const jaResolvido = selUni && selUni.value !== 'kg';
  mkPesoSuspeito = r.suspeita && !jaResolvido && !mkPesoConfirmadoKg;
  if(!mkPesoSuspeito){ mostrar('mkUniAlerta', false); return; }

  mkPesoInfo = r;
  const n = r.suspeitos;
  caixa.innerHTML = `<b>${n} peso${n === 1 ? '' : 's'} ${n === 1 ? 'parece' : 'parecem'} estar em gramas.</b>
    Precisa de uma conferência antes de calcular.
    <div class="uni-btns"><button type="button" class="sim" onclick="mkRevisarPeso()">Conferir agora</button></div>`;
  mostrar('mkUniAlerta', true);
}

/* Abre a MESMA tela de revisão do Mercado Livre, com o contexto deste canal.
   Dimensão fica de fora por enquanto: a conversão de mm depende do cálculo de
   frete do ML, que não vale para Shopee nem Amazon. */
function mkRevisarPeso(){
  revisarAbrir({
    canal: 'a ' + mkCanal.nome,
    peso: mkPesoSuspeito ? mkPesoInfo : null,
    dim: null,
    aplicar(){
      const sel = $('mkPesoUnidade');
      if(sel) sel.value = mkPesoInfo && mkPesoInfo.todosGrandes ? 'g' : 'auto';
      mkChecarPeso();
      mkCalcular();
    },
    ignorar(){
      mkPesoConfirmadoKg = true;
      mkChecarPeso();
    },
  });
}

/* campos que só fazem sentido em certas escolhas somem quando não fazem */
function mkAtualizarForm(){
  const p = mkLerParams();
  (mkCanal.FORM || []).forEach(f => {
    if(!f.quando) return;
    const el = document.querySelector(`[data-campo="${f.id}"]`);
    if(el) el.classList.toggle('hide', !f.quando(p));
  });
}

function mkLerParams(){
  const p = Object.assign({}, mkCanal.PADRAO);
  (mkCanal.FORM || []).forEach(f => {
    const el = $('mkP_' + f.id);
    if(!el) return;
    if(f.tipo === 'switch') p[f.id] = el.checked;
    else if(f.tipo === 'numero') p[f.id] = Number(el.value) || 0;
    else if(f.tipo === 'percentual') p[f.id] = (Number(el.value) || 0) / 100;
    else p[f.id] = el.value;
  });
  const m = $('mkMargem');
  if(m) p.margemAlvo = (Number(m.value) || 20) / 100;
  return p;
}

/* ── calcular ────────────────────────────────────────────────────────────── */
async function mkCalcular(){
  if(!mkAoa || !mkCanal) return;
  const iCusto = parseInt($('mkColCusto').value);
  const iPeso  = parseInt($('mkColPeso').value);
  const iA = parseInt($('mkColA').value), iL = parseInt($('mkColL').value), iC = parseInt($('mkColC').value);
  if(isNaN(iCusto)) return;

  /* enquanto a escala do peso não for resolvida, não calcula: deixar passar
     produz frete de centenas de reais e o usuário só descobre olhando linha
     por linha na coluna Situação */
  if(mkPesoSuspeito){ mkRevisarPeso(); return; }

  const p = mkLerParams();

  /* A planilha real mistura as duas escalas (0,9 kg e 2000 g lado a lado),
     então "misturado" converte por linha: só o que passa do limite físico,
     impossível num produto de verdade, vira grama. */
  const unidade = ($('mkPesoUnidade') || {}).value || 'kg';
  mkPesosConvertidos = new Set();
  const comUnidade = (v, linha) => {
    if(v === '' || v == null) return v;
    if(unidade === 'g') return /[a-z]/i.test(String(v)) ? v : String(v) + ' g';
    if(unidade !== 'auto') return v;
    const r = ML.normalizarPesoLinha(v, true);
    if(r.convertido){ mkPesosConvertidos.add(linha); return r.kg; }
    return v;
  };

  const entradas = [];
  for(let r = mkLinhaCab + 1; r < mkAoa.length; r++){
    const L = mkAoa[r];
    if(!L) continue;
    const dims = (iA >= 0 && iL >= 0 && iC >= 0)
      ? {altura: ML.parseNumero(L[iA]), largura: ML.parseNumero(L[iL]), comprimento: ML.parseNumero(L[iC])}
      : null;
    entradas.push({linha: r, custo: L[iCusto],
                   peso: iPeso >= 0 ? comUnidade(L[iPeso], r) : '', dimensoes: dims});
  }
  if(!entradas.length){ alert('Não achei linhas de produto abaixo do cabeçalho.'); return; }

  /* Em fatias, com a mesma janela de progresso do Mercado Livre: antes esta
     tela calculava em silêncio e, com planilha grande, parecia travada. */
  progAbrir(['Lendo a planilha', 'Calculando os preços', 'Montando a tabela']);
  progEtapa(0);
  progNumero(`${entradas.length.toLocaleString('pt-BR')} produtos`);
  await respirar();

  progEtapa(1);
  const BLOCO = 400;
  mkLinhas = [];
  try{
    for(let i = 0; i < entradas.length; i += BLOCO){
      const fim = Math.min(i + BLOCO, entradas.length);
      for(let k = i; k < fim; k++) mkLinhas.push(mkCanal.precificarLinha(entradas[k], p));
      if(entradas.length > BLOCO){
        progEtapa(1, fim / entradas.length);
        progNumero(`${fim.toLocaleString('pt-BR')} de ${entradas.length.toLocaleString('pt-BR')} produtos`);
        await respirar();
      }
    }
    mkIndicePorLinha = new Map();
    mkLinhas.forEach((r, i) => mkIndicePorLinha.set(r.linha, i));
    mkConf = mkCanal.conferir(mkLinhas);
    mkAcharDegraus(parseInt(($('mkColPrecoHoje') || {}).value), p);
    progEtapa(2);
    await respirar();
  }finally{
    progFechar();
  }
  mkFiltro = null; mkPagina = 0;

  if(!mkConf.precificados){
    alert(`Nenhum preço foi calculado.\n\nA coluna "${mkCab[iCusto]}" não tem valores numéricos maiores que zero — escolha a coluna que guarda o custo.`);
    return;
  }
  mkRenderStats(); mkRenderChecks(); mkRenderDegraus(); mkRenderTabela();
  mostrar('mkStep3', true);
  $('mkStats').scrollIntoView({behavior: reduzido ? 'instant' : 'smooth', block:'start'});
}

function mkRecomecar(){
  mkAoa = null; mkLinhas = []; mkConf = null; mkFiltro = null; mkPagina = 0;
  mkBytes = null; mkAbaNome = '';
  mkPesoSuspeito = false; mkPesoConfirmadoKg = false; mkPesoInfo = null;
  mkPesosConvertidos = new Set();
  mkDegraus = null;
  ['mkStep2','mkStep3','mkInfo'].forEach(x => mostrar(x, false));
  $('mkFi').value = '';
  window.scrollTo({top:0, behavior: reduzido ? 'instant' : 'smooth'});
}

/* ── resultado ───────────────────────────────────────────────────────────── */
function mkRenderStats(){
  const ok = mkLinhas.filter(r => r.preco != null);
  const soma = ok.reduce((s, r) => s + r.lucroLiquido, 0);
  const cards = [
    {n: mkLinhas.length.toLocaleString('pt-BR'), l:'Produtos',          cor:'var(--ink)'},
    {n: ok.length.toLocaleString('pt-BR'),       l:'Preços calculados', cor:'var(--green-dk)'},
    {n: mkConf.revisar.toLocaleString('pt-BR'),  l:'Precisam de revisão',
     cor: mkConf.revisar ? 'var(--red)' : 'var(--faint)'},
    {n: mkCanal.brl(soma), l:'Lucro total estimado', cor:'var(--green-dk)'},
  ];
  $('mkStats').innerHTML = cards.map((c,i) => `
    <div class="stat" style="animation-delay:${i*.04}s">
      <div class="stat-n" style="color:${c.cor}">${c.n}</div>
      <div class="stat-l">${c.l}</div></div>`).join('');
}

function mkRenderChecks(){
  const badge = $('mkBadge');
  const erros = mkConf.grupos.filter(g => g.gravidade === 'erro').reduce((s,g) => s+g.n, 0);
  badge.textContent = !mkConf.revisar ? 'TUDO CERTO'
    : (erros ? `${erros} ${erros === 1 ? 'PRECISA' : 'PRECISAM'} DE CORREÇÃO` : `${mkConf.revisar} PARA CONFERIR`);
  badge.className = 'pill ' + (erros ? 'pill-bad' : (mkConf.revisar ? 'pill-alerta' : 'pill-ok'));

  $('mkChecks').innerHTML = !mkConf.grupos.length
    ? `<div class="chk ok"><div class="chk-i"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></div>
       <div><div class="chk-t">Nada a revisar</div>
       <div class="chk-d">Os ${mkConf.total.toLocaleString('pt-BR')} produtos têm custo, peso e medidas.</div></div></div>`
    : mkConf.grupos.map(g => `
      <div class="chk ${g.gravidade === 'erro' ? 'bad' : 'alerta'}">
        <div class="chk-i">${g.gravidade === 'erro'
          ? '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>'
          : '<svg viewBox="0 0 24 24"><path d="M12 8v5m0 3h.01"/><path d="M10.3 4 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/></svg>'}</div>
        <div><div class="chk-t">${esc(g.titulo)} <span class="chk-n">${g.n.toLocaleString('pt-BR')} ${g.n === 1 ? 'produto' : 'produtos'}</span></div>
          <div class="chk-d">${esc(g.descricao)}</div>
          ${g.comoResolver ? `<div class="chk-r"><b>O que fazer agora</b>${esc(g.comoResolver)}</div>` : ''}</div>
        <button class="chk-btn${mkFiltro === g.id ? ' on' : ''}" onclick="mkVerLinhas('${g.id}')">
          ${mkFiltro === g.id ? 'ver todos' : `ver ${g.n === 1 ? 'a linha' : 'as linhas'}`}
          <svg viewBox="0 0 24 24"><path d="M5 12h14M13 5l7 7-7 7"/></svg></button>
      </div>`).join('');
}

function mkVerLinhas(id){
  const ligando = mkFiltro !== id;
  mkFiltro = ligando ? id : null;
  mkPagina = 0;
  mkRenderChecks(); mkRenderTabela();
  if(ligando){
    const alvo = $('mkPainelTabela');
    if(alvo) alvo.scrollIntoView({behavior: reduzido ? 'instant' : 'smooth', block:'start'});
  }
}
function mkIrPagina(n){ mkPagina = n; mkRenderTabela(); }

function mkRenderTabela(){
  const grupo = mkFiltro ? mkConf.grupos.find(g => g.id === mkFiltro) : null;
  const alvo = grupo ? grupo.linhas.map(i => mkLinhas[i]) : mkLinhas;
  const total = alvo.length;
  const paginas = Math.max(1, Math.ceil(total / MK_POR_PAGINA));
  mkPagina = Math.min(mkPagina, paginas - 1);
  const inicio = mkPagina * MK_POR_PAGINA;
  const pagina = alvo.slice(inicio, inicio + MK_POR_PAGINA);

  const iDesc = mkCab.findIndex(h => /descri|nome|produto|t[ií]tulo/i.test(String(h)));
  const A = mkCanal.AVISOS;

  $('mkTabela').innerHTML =
    `<thead><tr><th>Linha</th><th>Descrição</th>
      <th class="c-num">Custo</th><th class="c-num">Peso</th><th class="c-num">Preço de venda</th>
      <th class="c-num">Comissão</th><th class="c-num">Envio</th><th class="c-num">Lucro</th>
      <th>Situação</th></tr></thead><tbody>` +
    pagina.map(r => {
      const L = mkAoa[r.linha] || [];
      const desc = iDesc >= 0 ? String(L[iDesc] || '') : '';
      /* só o nome da classe, para juntar com tr-clic num class= só: dois
         atributos class fariam o navegador ficar com o primeiro e a linha
         perderia o cursor de mão */
      const grav = r.avisos.some(a => (A[a]||{}).gravidade === 'erro') ? ' tr-erro'
        : (r.avisos.length ? ' tr-alerta' : '');
      const sit = r.avisos.length
        ? r.avisos.map(a => `<span class="tag ${(A[a]||{}).gravidade === 'erro' ? 'tag-erro' : 'tag-alerta'}">${esc((A[a]||{}).titulo || a)}</span>`).join(' ')
        : '<span style="color:var(--green-dk)">ok</span>';
      const num = v => v == null ? '—' : mkCanal.brl(v);
      const i = mkIndicePorLinha.get(r.linha);
      return `<tr class="tr-clic${grav}" onclick="mkAbrirLinha(${i})" title="Ver a conta desta linha">
        <td class="c-linha">${r.linha + 1}</td>
        <td class="c-desc" title="${esc(desc)}">${esc(desc.slice(0,60)) || '—'}</td>
        <td class="c-num c-custo">${r.custo == null ? '—' : mkCanal.brl(r.custo)}</td>
        <td class="c-num c-peso">${r.peso ? String(+Number(r.peso).toFixed(3)).replace('.', ',') : '—'}</td>
        <td class="c-num c-preco">${num(r.preco)}</td>
        <td class="c-num c-taxa">${r.comissao == null ? '—' : mkCanal.brl(-r.comissao)}</td>
        <td class="c-num c-taxa">${r.frete == null ? '—' : mkCanal.brl(-r.frete)}</td>
        <td class="c-num c-lucro ${r.lucroLiquido > 0 ? 'pos' : 'neg'}">${num(r.lucroLiquido)}</td>
        <td>${sit}</td></tr>`;
    }).join('') + '</tbody>';

  $('mkPaginacao').innerHTML = paginas > 1
    ? `<div class="paginacao">
        <button ${mkPagina === 0 ? 'disabled' : ''} onclick="mkIrPagina(${mkPagina-1})">‹ Anterior</button>
        <span>${(inicio+1).toLocaleString('pt-BR')}–${Math.min(inicio+MK_POR_PAGINA,total).toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}</span>
        <button ${mkPagina >= paginas-1 ? 'disabled' : ''} onclick="mkIrPagina(${mkPagina+1})">Próximas ›</button>
      </div>` : '';
}

/* ── caçador de degrau ─────────────────────────────────────────────────────
   Só roda quando o vendedor aponta a coluna do preço que ele JÁ pratica. O
   preço que este app calcula nunca cai na zona morta (ele caminha faixa por
   faixa), então não haveria o que achar nele. O dinheiro está no preço antigo,
   que quase sempre veio de markup. */
function mkAcharDegraus(iPrecoHoje, params){
  mkDegraus = null;
  if(isNaN(iPrecoHoje) || iPrecoHoje < 0) return;

  const linhas = [];
  for(const r of mkLinhas){
    const L = mkAoa[r.linha] || [];
    const preco = ML.parseNumero(L[iPrecoHoje]);
    if(!isFinite(preco) || preco <= 0 || r.custo == null) continue;
    const a = mkCanal.analisar(preco, r.custo, r.pesoReal != null ? r.pesoReal : r.peso,
                               params, r.dimensoes);
    if(a) linhas.push(Object.assign({linha: r.linha, custo: r.custo,
                                     pesoReal: r.pesoReal, dimensoes: r.dimensoes}, a));
  }
  if(!linhas.length) return;
  const d = mkCanal.acharDegraus(linhas, params);
  if(d.n) mkDegraus = d;
}

function mkRenderDegraus(){
  const caixa = $('mkDegraus');
  if(!caixa) return;
  if(!mkDegraus){ mostrar('mkDegraus', false); return; }
  caixa.innerHTML = degrausHTML(mkDegraus, {
    canal: 'da ' + mkCanal.nome, brl: mkCanal.brl, cabecalho: mkCab, aoa: mkAoa,
  });
  mostrar('mkDegraus', true);
}

/* ── a conta de uma linha ──────────────────────────────────────────────────
   Mesmo pop-up e mesma função do Mercado Livre (contaHTML, em app.js): os dois
   motores devolvem os mesmos campos, então o que muda é o rótulo do canal. */
function mkAbrirLinha(indice){
  const r = mkLinhas[indice];
  if(!r) return;
  const L = mkAoa[r.linha] || [];

  $('linhaTitulo').textContent = contaTitulo(mkCab, L, r.linha + 1);
  $('linhaSub').textContent = 'LINHA ' + (r.linha + 1) + ' · A CONTA DESTE PREÇO';
  $('linhaCorpo').innerHTML = contaHTML({
    AVISOS: mkCanal.AVISOS,
    brl: mkCanal.brl,
    canal: 'da ' + mkCanal.nome,
    margem: (Number(($('mkMargem') || {}).value) || 20) / 100,
    rodape: `Canal: <b>${esc(mkCanal.nome)}</b>.`,
  }, r);
  abrirPop('popLinha', 'scrimLinha');
}

/* ── baixar ──────────────────────────────────────────────────────────────── */
async function mkBaixar(){
  if(!mkLinhas.length) return;
  const iPreco = parseInt($('mkColPreco').value);
  /* o mesmo resumo do Mercado Livre, em vez do confirm() do navegador: é a
     última tela antes de gerar o arquivo, e vale mostrar o balanço do lote */
  abrirResumo(mkBaixarAgora, {
    linhas: mkLinhas,
    conferencia: mkConf,
    brl: mkCanal.brl,
    avisoFinal: `A planilha original com o preço novo gravado em `
      + `"${esc(mkCab[iPreco] || 'nova coluna')}", mais as colunas de análise `
      + `(custo, comissão, envio, lucro, margem) para você conferir.`,
  });
}

async function mkBaixarAgora(){
  const iPreco = parseInt($('mkColPreco').value);
  try{
    await garantirXLSX();
    /* Relê o arquivo enviado e troca só o que muda. Montar a aba do zero a
       partir do que foi lido com raw:false gravava tudo como texto — o Excel
       mostrava "número armazenado como texto" e nenhuma soma funcionava.

       O que isto preserva: os tipos (número continua número), o formato
       numérico de cada célula e as outras abas do arquivo. O que NÃO
       preserva: cores, negrito e bordas — a versão livre do SheetJS lê
       estilo mas não sabe gravá-lo. Quando a formatação importa, o caminho é
       o da tela de Anúncios, que edita o XML do arquivo direto.

       Diferente do Mercado Livre, esta tela não poda linhas vazias: r.linha já
       é a posição real na aba, sem precisar de ajuste. */
    const wb = XLSX.read(mkBytes, {type:'array'});
    const nomeAba = mkAbaNome || wb.SheetNames[0];
    XU.normalizarRef(wb.Sheets[nomeAba]);
    const ws = XU.clonarWs(wb.Sheets[nomeAba]);
    const base = mkCab.length;

    const NOVAS = ['Custo','Peso cobrado (kg)','Preço de venda','Comissão','Taxa fixa',
                   'Envio','Receita líquida','Lucro líquido','Margem líquida','Conferência'];
    NOVAS.forEach((t, k) => XU.escrever(ws, mkLinhaCab, base + k, t));

    mkLinhas.forEach(r => {
      if(iPreco >= 0 && r.preco != null) XU.escrever(ws, r.linha, iPreco, r.preco);
      const conf = (r.avisos || []).map(a => (mkCanal.AVISOS[a] || {}).titulo || a).join(' · ');
      const vals = r.preco == null
        ? [r.custo, '', '', '', '', '', '', '', '', conf || 'sem preço calculado']
        : [r.custo, r.peso, r.preco, -r.comissao, -r.taxaFixa, -r.frete,
           r.receitaLiquida, r.lucroLiquido, +(r.margemLiquida).toFixed(4), conf];
      vals.forEach((v, k) => XU.escrever(ws, r.linha, base + k, v === undefined ? '' : v));
    });

    const cols = ws['!cols'] ? ws['!cols'].slice() : [];
    NOVAS.forEach((_, k) => cols[base + k] = {wch: k === NOVAS.length - 1 ? 40 : 18});
    ws['!cols'] = cols;

    /* as outras abas vão junto: o usuário mandou um arquivo com elas, e sumir
       com dados sem avisar é pior do que carregar aba a mais */
    const saida = XLSX.utils.book_new();
    wb.SheetNames.forEach(n => XLSX.utils.book_append_sheet(
      saida, n === nomeAba ? ws : wb.Sheets[n], XU.nomeDeAbaValido(n, 'Aba')));
    XLSX.writeFile(saida, mkNomeArquivo.replace(/\.[^.]+$/, '') + '_' + mkCanal.id.toUpperCase() + '.xlsx');

    $('mkBtnDl').innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
      + `Baixado — ${mkConf.precificados.toLocaleString('pt-BR')} preços`;
  }catch(e){
    alert('Não consegui gerar a planilha.\n\n' + (e && e.message ? e.message : e));
  }
}
