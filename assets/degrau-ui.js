/* ══════════════════════════════════════════════════════════════════════════
   CAÇADOR DE DEGRAU — tela

   Audita os preços que o vendedor JÁ pratica. Não calcula preço novo: procura
   quem está parado logo acima de um degrau de taxa, onde BAIXAR o preço
   aumenta o lucro.

   Por que é ferramenta separada e não um campo dentro das calculadoras: o
   preço que as calculadoras geram nunca cai nessa faixa — elas percorrem as
   faixas de propósito. O dinheiro parado mora no preço antigo, que costuma vir
   de markup (custo × um número). São dois trabalhos diferentes, com planilhas
   diferentes na mão.

   A conta vive nos motores (ML.acharDegraus), que têm teste. Aqui é só a tela.
   ══════════════════════════════════════════════════════════════════════════ */

let dgAoa = null, dgCab = [], dgLinhaCab = 0, dgNome = '';
let dgMotor = null, dgResult = null, dgLinhas = [];
/* Peso em gramas numa coluna que diz "kg" — mesma armadilha das calculadoras.
   Aqui ela é ainda pior: o frete inflado vira "prejuízo" na tela, e o vendedor
   sai atrás de um problema de custo que não existe. */
let dgPesoSuspeito = false, dgPesoConfirmadoKg = false, dgPesoInfo = null;

/* Os três canais, com o motor de cada um. O Mercado Livre não é um motor do
   mkt-engine, então entra com as funções soltas do ml-engine. */
const DG_CANAIS = {
  ml: {
    nome: 'Mercado Livre',
    motor: () => ({
      nome: 'Mercado Livre', artigo: 'do Mercado Livre', brl: ML.brl,
      analisar: ML.analisar,
      acharDegraus: (linhas, p) => ML.acharDegraus(linhas, p, {
        analisar: ML.analisar, limites: () => ML.limitesDePreco(p),
      }),
      PADRAO: () => Object.assign({}, pml),
      FORM: [
        {id:'tipoAnuncio', tipo:'select', rot:'Tipo de anúncio',
         ajuda:'muda a comissão: Premium cobra mais e parcela sem juros',
         opcoes:[{v:'classico', t:'Clássico'}, {v:'premium', t:'Premium'}]},
        {id:'reputacao', tipo:'select', rot:'Reputação da sua conta',
         ajuda:'a mesma caixa custa o dobro na vermelha',
         opcoes:[{v:'verde', t:'Verde'}, {v:'amarela', t:'Amarela'}, {v:'vermelha', t:'Vermelha'}]},
      ],
    }),
  },
  shopee: {nome: 'Shopee', motor: () => window.MktShopee},
  amazon: {nome: 'Amazon', motor: () => window.MktAmazon},
};
let dgCanalId = 'ml';

function dgDrop(ev){
  ev.preventDefault();
  ev.currentTarget.classList.remove('drag');
  const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
  if(f) dgCarregar(f);
}

/* ── passo 1: a planilha ─────────────────────────────────────────────────── */
async function dgCarregar(file){
  if(!file) return;
  try{
    await garantirXLSX();
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {type:'array'});
    /* mesma leitura das outras telas: a aba boa nem sempre é a primeira e o
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
    dgLinhaCab = det && det.linha != null ? det.linha : 0;
    dgAoa = aoa;
    dgCab = (aoa[dgLinhaCab] || []).map(v => v == null ? '' : String(v));
    dgNome = file.name;

    const n = Math.max(0, aoa.length - dgLinhaCab - 1);
    $('dgStep1').querySelector('.zone-t').textContent = file.name;
    $('dgStep1').querySelector('.zone-s').textContent =
      `aba ${nomeAba} · ${n.toLocaleString('pt-BR')} produtos · ${dgCab.length} colunas`;

    dgMontarForm();
    mostrar('dgStep2', true);
    $('dgStep2').scrollIntoView({behavior: reduzido ? 'instant' : 'smooth', block:'start'});
  }catch(e){
    alert('Não consegui ler a planilha.\n\n' + (e && e.message ? e.message : e));
  }
}

/* ── passo 2: colunas e canal ────────────────────────────────────────────── */
function dgAcha(alvos){
  const norm = dgCab.map(c => ML.normalizarTexto(c));
  for(const a of alvos){ const i = norm.findIndex(c => c === a); if(i >= 0) return i; }
  for(const a of alvos){ const i = norm.findIndex(c => c.indexOf(a) >= 0); if(i >= 0) return i; }
  return -1;
}

/* só serve coluna que tenha número maior que zero */
function dgTemValores(i){
  if(i < 0) return false;
  return dgAoa.slice(dgLinhaCab + 1).some(l => {
    const n = ML.parseNumero(l && l[i]);
    return !isNaN(n) && n > 0;
  });
}

function dgSel(id, escolhido, comVazio, aoMudar){
  return `<select id="${id}"${aoMudar ? ` onchange="${aoMudar}"` : ''}>`
    + (comVazio ? `<option value="-1"${escolhido < 0 ? ' selected' : ''}>— não usar —</option>` : '')
    + dgCab.map((c, i) => `<option value="${i}"${i === escolhido ? ' selected' : ''}>${esc(c || 'coluna ' + (i+1))}</option>`).join('')
    + '</select>';
}

function dgMontarForm(){
  const iCusto = [dgAcha(['custo','preco de custo','valor de custo']), dgAcha(['preco'])].find(dgTemValores);
  /* o preço praticado nunca pode ser a mesma coluna do custo: comparar o custo
     com ele mesmo apontaria oportunidade em toda linha */
  const iPreco = [dgAcha(['preco de venda','preco venda','preco atual','venda']),
                  dgAcha(['preco'])].find(i => dgTemValores(i) && i !== iCusto);
  const iPeso = [dgAcha(['peso (kg)','peso bruto','peso'])].find(dgTemValores);

  $('dgColunas').innerHTML = `
    <label class="campo"><span>Custo do produto</span>
      ${dgSel('dgColCusto', iCusto == null ? -1 : iCusto)}</label>
    <label class="campo"><span>Preço que você pratica hoje
      <i>o que está no ar agora, não o custo</i></span>
      ${dgSel('dgColPreco', iPreco == null ? -1 : iPreco)}</label>
    <label class="campo"><span>Peso
      <i>opcional — sem ele o frete entra pelo padrão do canal</i></span>
      ${dgSel('dgColPeso', iPeso == null ? -1 : iPeso, true, 'dgChecarPeso()')}
      <div class="uni-peso" id="dgUniBox">
        <span>Os números estão em</span>
        <select id="dgPesoUnidade" onchange="dgChecarPeso()">
          <option value="kg">quilos (2,5 = 2,5 kg)</option>
          <option value="g">gramas (2000 = 2 kg)</option>
          <option value="auto">misturado — corrigir só os que parecem gramas</option>
        </select>
      </div>
      <div class="uni-alerta hide" id="dgUniAlerta"></div></label>`;

  $('dgCanal').innerHTML = `
    <label class="campo"><span>Canal</span>
      <select id="dgCanalSel" onchange="dgTrocarCanal()">
        ${Object.keys(DG_CANAIS).map(k =>
          `<option value="${k}"${k === dgCanalId ? ' selected' : ''}>${esc(DG_CANAIS[k].nome)}</option>`).join('')}
      </select></label>`;

  dgTrocarCanal();
  dgChecarPeso();
}

/* ── peso em gramas ────────────────────────────────────────────────────────
   Mesma detecção das calculadoras (ML.detectarEscalaPeso). Sem ela, uma
   planilha em gramas faz o frete estourar e a ferramenta acusa "prejuízo" em
   produtos que estão bem. */
function dgChecarPeso(){
  const caixa = $('dgUniAlerta'), selCol = $('dgColPeso'), selUni = $('dgPesoUnidade');
  if(!caixa || !selCol) return;

  const ip = parseInt(selCol.value);
  mostrar('dgUniBox', ip >= 0);
  if(isNaN(ip) || ip < 0 || !dgAoa){ dgPesoSuspeito = false; mostrar('dgUniAlerta', false); return; }

  const r = ML.detectarEscalaPeso(dgAoa.slice(dgLinhaCab + 1).map(l => l && l[ip]));
  const jaResolvido = selUni && selUni.value !== 'kg';
  dgPesoSuspeito = r.suspeita && !jaResolvido && !dgPesoConfirmadoKg;
  if(!dgPesoSuspeito){ mostrar('dgUniAlerta', false); return; }

  dgPesoInfo = r;
  const n = r.suspeitos;
  caixa.innerHTML = `<b>${n} peso${n === 1 ? '' : 's'} ${n === 1 ? 'parece' : 'parecem'} estar em gramas.</b>
    Lido como quilo, o frete estoura e produto bom aparece como prejuízo.
    <div class="uni-btns"><button type="button" class="sim" onclick="dgRevisarPeso()">Conferir agora</button></div>`;
  mostrar('dgUniAlerta', true);
}

function dgRevisarPeso(){
  revisarAbrir({
    canal: 'o ' + (dgMotor ? dgMotor.nome : 'canal'),
    peso: dgPesoSuspeito ? dgPesoInfo : null,
    dim: null,
    aplicar(){
      const sel = $('dgPesoUnidade');
      if(sel) sel.value = dgPesoInfo && dgPesoInfo.todosGrandes ? 'g' : 'auto';
      dgChecarPeso();
      dgProcurar();
    },
    ignorar(){ dgPesoConfirmadoKg = true; dgChecarPeso(); },
  });
}

function dgTrocarCanal(){
  const sel = $('dgCanalSel');
  if(sel) dgCanalId = sel.value;
  const def = DG_CANAIS[dgCanalId];
  dgMotor = def && def.motor();
  if(!dgMotor){ $('dgParams').innerHTML = ''; return; }

  const P = typeof dgMotor.PADRAO === 'function' ? dgMotor.PADRAO() : dgMotor.PADRAO;
  const form = (dgMotor.FORM || []).filter(f => !f.quando || f.quando(P));

  $('dgParams').innerHTML = form.map(f => {
    if(f.tipo === 'select')
      return `<label class="campo"><span>${esc(f.rot)}${f.ajuda ? ` <i>${esc(f.ajuda)}</i>` : ''}</span>
        <select id="dgP_${f.id}">${f.opcoes.map(o =>
          `<option value="${esc(o.v)}"${o.v === P[f.id] ? ' selected' : ''}>${esc(o.t)}</option>`).join('')}</select></label>`;
    if(f.tipo === 'percentual')
      return `<label class="campo"><span>${esc(f.rot)}${f.ajuda ? ` <i>${esc(f.ajuda)}</i>` : ''}</span>
        <input type="number" id="dgP_${f.id}" min="0" max="99" step="0.1" value="${((Number(P[f.id]) || 0) * 100) || 0}"/></label>`;
    if(f.tipo === 'numero')
      return `<label class="campo"><span>${esc(f.rot)}${f.ajuda ? ` <i>${esc(f.ajuda)}</i>` : ''}</span>
        <input type="number" id="dgP_${f.id}" min="0" step="0.01" value="${Number(P[f.id]) || 0}"/></label>`;
    return `<label class="sw" style="grid-column:1/-1">
      <input type="checkbox" id="dgP_${f.id}"${P[f.id] ? ' checked' : ''}/>
      ${esc(f.rot)}${f.ajuda ? ` — ${esc(f.ajuda)}` : ''}</label>`;
  }).join('');
}

function dgLerParams(){
  const P = typeof dgMotor.PADRAO === 'function' ? dgMotor.PADRAO() : dgMotor.PADRAO;
  const p = Object.assign({}, P);
  (dgMotor.FORM || []).forEach(f => {
    const el = $('dgP_' + f.id);
    if(!el) return;
    if(f.tipo === 'switch') p[f.id] = el.checked;
    else if(f.tipo === 'numero') p[f.id] = Number(el.value) || 0;
    else if(f.tipo === 'percentual') p[f.id] = (Number(el.value) || 0) / 100;
    else p[f.id] = el.value;
  });
  return p;
}

/* ── passo 3: procurar ───────────────────────────────────────────────────── */
async function dgProcurar(){
  if(!dgAoa || !dgMotor) return;
  const iCusto = parseInt($('dgColCusto').value);
  const iPreco = parseInt($('dgColPreco').value);
  const iPeso  = parseInt($('dgColPeso').value);

  if(isNaN(iCusto) || iCusto < 0 || isNaN(iPreco) || iPreco < 0)
    return alert('Escolha a coluna do custo e a do preço que você pratica hoje.');
  if(iCusto === iPreco)
    return alert('O custo e o preço praticado não podem ser a mesma coluna.\n\n'
      + 'O app compara os dois — apontando a mesma, toda linha pareceria uma oportunidade.');

  if(dgPesoSuspeito){ dgRevisarPeso(); return; }

  const p = dgLerParams();
  const unidade = ($('dgPesoUnidade') || {}).value || 'kg';
  const pesoDe = v => {
    if(v === '' || v == null) return 0;
    if(unidade === 'g') return /[a-z]/i.test(String(v)) ? ML.parsePeso(v) : ML.parsePeso(String(v) + ' g');
    if(unidade === 'auto') return ML.normalizarPesoLinha(v, true).kg;
    return ML.parsePeso(v);
  };

  progAbrir(['Lendo a planilha', 'Conferindo os preços', 'Montando o relatório']);
  progEtapa(0);
  await respirar();

  progEtapa(1);
  dgLinhas = [];
  let semDado = 0;
  const BLOCO = 400;
  try{
    const total = dgAoa.length - dgLinhaCab - 1;
    for(let r = dgLinhaCab + 1; r < dgAoa.length; r++){
      const L = dgAoa[r];
      if(!L) continue;
      const custo = ML.parseNumero(L[iCusto]);
      const preco = ML.parseNumero(L[iPreco]);
      if(!isFinite(custo) || custo <= 0 || !isFinite(preco) || preco <= 0){ semDado++; continue; }
      const peso = iPeso >= 0 ? pesoDe(L[iPeso]) : 0;
      const a = dgMotor.analisar(preco, custo, isFinite(peso) ? peso : 0, p, null);
      if(a) dgLinhas.push(Object.assign({linha: r, custo, pesoReal: peso, dimensoes: null}, a));

      if((r - dgLinhaCab) % BLOCO === 0){
        progEtapa(1, (r - dgLinhaCab) / Math.max(1, total));
        progNumero(`${(r - dgLinhaCab).toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`);
        await respirar();
      }
    }
    progEtapa(2);
    await respirar();
    dgResult = dgLinhas.length ? dgMotor.acharDegraus(dgLinhas, p) : {n:0, ganhoTotal:0, casos:[]};
  }finally{
    progFechar();
  }

  if(!dgLinhas.length)
    return alert('Nenhuma linha tinha custo e preço preenchidos.\n\n'
      + 'Confira se as colunas escolhidas são as certas.');

  dgRenderStats(semDado);
  dgRenderResultado();
  mostrar('dgStep3', true);
  $('dgStats').scrollIntoView({behavior: reduzido ? 'instant' : 'smooth', block:'start'});
}

function dgRenderStats(semDado){
  const d = dgResult;
  const brl = dgMotor.brl;
  const cards = [
    {n: dgLinhas.length.toLocaleString('pt-BR'), l:'produtos conferidos', cor:'var(--ink)'},
    {n: d.n.toLocaleString('pt-BR'), l:'parados num degrau',
     cor: d.n ? 'var(--red)' : 'var(--green-dk)'},
    {n: brl(d.ganhoTotal), l:'a mais por venda, somando', cor:'var(--green-dk)'},
    {n: semDado.toLocaleString('pt-BR'), l:'sem custo ou preço',
     cor: semDado ? 'var(--amber-dk)' : 'var(--faint)'},
  ];
  $('dgStats').innerHTML = cards.map(c =>
    `<div class="stat"><div class="stat-n" style="color:${c.cor}">${c.n}</div>
     <div class="stat-l">${esc(c.l)}</div></div>`).join('');
}

function dgRenderResultado(){
  const d = dgResult;
  if(!d.n){
    $('dgResultado').innerHTML = `
      <div class="panel-h"><div class="panel-t verde">Nada parado</div>
        <span class="pill pill-ok">tudo certo</span></div>
      <div class="res-limpo">
        <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>
        Nenhum produto está logo acima de um degrau de taxa ${esc(dgMotor.artigo || 'do canal')}.
        Nesses preços, cobrar mais caro rende mais mesmo.</div>`;
    mostrar('dgBtnDl', false);
    return;
  }
  $('dgResultado').innerHTML = degrausHTML(d, {
    canal: dgMotor.artigo || ('da ' + dgMotor.nome),
    brl: dgMotor.brl, cabecalho: dgCab, aoa: dgAoa,
    aoClicar: 'dgVerConta',
  });
  mostrar('dgBtnDl', true);
}

/* A conta da linha, para explicar de onde vem o prejuízo. */
function dgVerConta(linha){
  const r = dgLinhas.find(x => x.linha === linha);
  if(!r) return;
  const L = dgAoa[linha] || [];
  $('linhaTitulo').textContent = contaTitulo(dgCab, L, linha + 1);
  $('linhaSub').textContent = 'LINHA ' + (linha + 1) + ' · A CONTA DO PREÇO QUE VOCÊ PRATICA HOJE';
  $('linhaCorpo').innerHTML = contaHTML({
    AVISOS: ML.AVISOS, brl: dgMotor.brl,
    canal: dgMotor.artigo || ('da ' + dgMotor.nome),
    margem: r.margemLiquida,
    rodape: 'Esta é a conta do preço que está no ar hoje.',
  }, r);
  abrirPop('popLinha', 'scrimLinha');
}

/* ── baixar a lista ──────────────────────────────────────────────────────── */
async function dgBaixar(){
  if(!dgResult || !dgResult.n) return;
  try{
    await garantirXLSX();
    const iDesc = dgCab.findIndex(h => /descri|nome|produto|t[ií]tulo/i.test(String(h)));
    const iCod  = dgCab.findIndex(h => /c[oó]digo|sku|refer/i.test(String(h)));

    const aoa = [['Linha', 'Código', 'Descrição', 'Preço hoje', 'Lucro hoje',
                  'Preço sugerido', 'Lucro sugerido', 'Ganho por venda',
                  'Margem hoje', 'Margem sugerida', 'Volta a compensar acima de']];
    dgResult.casos.forEach(c => {
      const L = dgAoa[c.linha] || [];
      aoa.push([
        c.linha + 1,
        iCod >= 0 ? L[iCod] : '',
        iDesc >= 0 ? L[iDesc] : '',
        c.precoAtual, c.lucroAtual,
        c.precoSugerido, c.lucroSugerido, c.ganhoPorVenda,
        +(c.margemAtual).toFixed(4), +(c.margemSugerida).toFixed(4),
        c.voltaACompensar,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{wch:8},{wch:16},{wch:44},{wch:12},{wch:12},{wch:14},{wch:14},
                   {wch:15},{wch:12},{wch:14},{wch:22}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Degraus');
    XLSX.writeFile(wb, dgNome.replace(/\.[^.]+$/, '') + '_DEGRAUS_' + dgCanalId.toUpperCase() + '.xlsx');

    $('dgBtnDl').innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
      + `Baixado — ${dgResult.n.toLocaleString('pt-BR')} produtos`;
  }catch(e){
    alert('Não consegui gerar a lista.\n\n' + (e && e.message ? e.message : e));
  }
}

function dgRecomecar(){
  dgAoa = null; dgResult = null; dgLinhas = [];
  dgPesoSuspeito = false; dgPesoConfirmadoKg = false; dgPesoInfo = null;
  ['dgStep2','dgStep3'].forEach(x => mostrar(x, false));
  $('dgFi').value = '';
  const z = $('dgStep1');
  z.querySelector('.zone-t').textContent = 'Arraste a planilha aqui';
  z.querySelector('.zone-s').textContent =
    'precisa ter o custo e o preço que você pratica hoje · .xlsx · .xls · .csv';
  window.scrollTo({top:0, behavior: reduzido ? 'instant' : 'smooth'});
}

/* Abre a ferramenta já no canal pedido, vindo do quadro daquele marketplace. */
function dgAbrir(canal){
  if(canal && DG_CANAIS[canal]) dgCanalId = canal;
  const sel = $('dgCanalSel');
  if(sel){ sel.value = dgCanalId; dgTrocarCanal(); }
  ir('degrau');
}
