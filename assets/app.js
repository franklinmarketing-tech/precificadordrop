/* ══════════════════════════════════════════════════════════════════════════
   Precificador Drop — hub: router + views (ML e editor de planilha)
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const ML = MLEngine;
const PE = PlanilhaEngine;
const brl = ML.brl;
const reduzido = matchMedia('(prefers-reduced-motion:reduce)').matches;
const preciso  = matchMedia('(hover:hover) and (pointer:fine)').matches;

const XU = XlsxUtils;
const $  = id => document.getElementById(id);
/* escapa também aspas: o texto vem de planilhas de terceiros e é usado
   dentro de atributos (title="…") */
const esc = s => String(s == null ? '' : s)
  .replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const mostrar = (id, sim) => $(id).classList.toggle('hide', !sim);

/* ══ ROUTER ═══════════════════════════════════════════════════════════════ */
const VIEWS = {
  hub:      {sub:'HUB DO ECOSSISTEMA',            titulo:'Precificador Drop — Hub do Ecossistema'},
  ml:       {sub:'PRECIFICAR MERCADO LIVRE',      titulo:'Precificar Mercado Livre — Precificador Drop'},
  planilha: {sub:'EDIÇÃO COMPLETA DE PLANILHA DE PRODUTOS',titulo:'Edição Completa de Planilha de Produtos — Precificador Drop'},
};
let viewAtual = 'hub';

function ir(v, semHash){
  if(!VIEWS[v]) v = 'hub';
  viewAtual = v;
  Object.keys(VIEWS).forEach(k => mostrar('view-' + k, k === v));

  document.body.classList.toggle('view-hub', v === 'hub');
  mostrar('topoHub', v === 'hub');
  mostrar('topoTool', v !== 'hub');
  mostrar('rodape', v === 'hub' ? false : true);
  mostrar('btnParams', v === 'planilha');
  mostrar('passos', v === 'ml' && mlAba === 'massa');
  $('wrap').classList.toggle('wrap-narrow', v === 'planilha');
  $('logoSub').textContent = VIEWS[v].sub;
  document.title = VIEWS[v].titulo;

  if(!semHash) location.hash = v === 'hub' ? '' : '#/' + v;
  window.scrollTo({top:0, behavior:'instant'});
  if(v === 'hub') contarPreco();
  if(v === 'ml' && mlAba === 'taxas') montarTaxas();
}
function daHash(){
  const v = (location.hash || '').replace(/^#\/?/, '') || 'hub';
  ir(VIEWS[v] ? v : 'hub', true);
}
window.addEventListener('hashchange', daHash);

/* ══ HUB: tilt 3D, spotlight e contador ═══════════════════════════════════ */
document.querySelectorAll('.tool').forEach(card => {
  card.addEventListener('animationend', e => {
    if(e.animationName === 'cardIn') card.style.animation = 'none';
  });
});

if(preciso && !reduzido){
  const spot = document.querySelector('.spot');
  addEventListener('mousemove', e => {
    document.body.classList.add('awake');
    spot.style.setProperty('--mx', (e.clientX / innerWidth  * 100).toFixed(1) + '%');
    spot.style.setProperty('--my', (e.clientY / innerHeight * 100).toFixed(1) + '%');
  }, {passive:true});

  const MAX = 7;
  document.querySelectorAll('[data-tilt]').forEach(card => {
    let raf = null, tx = 0, ty = 0;
    card.addEventListener('mousemove', e => {
      const r  = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top)  / r.height;
      ty =  (px - .5) * 2 * MAX;
      tx = -(py - .5) * 2 * MAX;
      card.style.setProperty('--gx', (px*100).toFixed(1) + '%');
      card.style.setProperty('--gy', (py*100).toFixed(1) + '%');
      if(!raf) raf = requestAnimationFrame(() => {
        raf = null;
        card.style.transform = `rotateX(${tx.toFixed(2)}deg) rotateY(${ty.toFixed(2)}deg) translateZ(6px) scale(1.012)`;
      });
    }, {passive:true});
    card.addEventListener('mouseenter', () => { card.style.transition = 'transform .12s ease-out, box-shadow .4s ease'; });
    card.addEventListener('mouseleave', () => {
      if(raf){ cancelAnimationFrame(raf); raf = null; }
      card.style.transition = 'transform .55s cubic-bezier(.16,1,.3,1), box-shadow .4s ease';
      card.style.transform  = '';
    });
  });
}

/* contador das validações no cartão em destaque */
let rafContador = null;
function contarPreco(){
  const el = $('liveChecks');
  if(!el) return;
  const total = 8;
  if(reduzido){ el.textContent = total + '/' + total; return; }
  if(rafContador) cancelAnimationFrame(rafContador);   // evita loops empilhados
  const t0 = performance.now(), dur = 1100;
  (function passo(agora){
    const p = Math.min((agora - t0) / dur, 1);
    el.textContent = Math.round(total * (1 - Math.pow(1 - p, 3))) + '/' + total;
    rafContador = p < 1 ? requestAnimationFrame(passo) : null;
  })(t0);
}
document.querySelector('.tool-1').addEventListener('mouseenter', contarPreco);

/* ══════════════════════════════════════════════════════════════════════════
   VIEW: PRECIFICADOR MERCADO LIVRE
   ══════════════════════════════════════════════════════════════════════════ */
const CHAVE_ML = 'precificador-drop:params-ml';
let mlAba = 'calc', modo = 'a';
let mlWb = null, mlBytes = null, mlAoa = [], mlCabecalho = [], mlLinhas = [], mlNome = '', mlMargem = 0.20;
let pml = carregarParamsML();

function carregarParamsML(){
  try{
    const s = localStorage.getItem(CHAVE_ML);
    if(s){
      const salvo = JSON.parse(s);
      // parâmetros de uma versão anterior: as tabelas oficiais voltam ao padrão
      // (a de custo fixo mudou), o resto das escolhas do usuário é mantido
      if((salvo.versao || 1) < ML.PADRAO.versao) delete salvo.taxaFixa;
      return Object.assign({}, ML.PADRAO, salvo, {versao: ML.PADRAO.versao});
    }
  }catch(e){}
  return Object.assign({}, ML.PADRAO);
}
function guardarParamsML(){
  try{ localStorage.setItem(CHAVE_ML, JSON.stringify(pml)); }catch(e){}
}

/* ── barra de contexto: reputação e tipo de anúncio ── */
function montarContexto(){
  $('ctxReputacao').innerHTML = MLFretes.REPUTACOES.map(r => `
    <button class="ctx-opt rep-${r.id}${pml.reputacao === r.id ? ' active' : ''}" data-rep="${r.id}"
            onclick="setReputacao('${r.id}',this)" title="${esc(r.desc)}">
      <i class="bolinha"></i>${esc(r.nome)}
    </button>`).join('');
  $('pctClassico').textContent = (pml.comissaoClassico * 100).toFixed(1).replace('.0','').replace('.', ',') + '%';
  $('pctPremium').textContent  = (pml.comissaoPremium  * 100).toFixed(1).replace('.0','').replace('.', ',') + '%';
  document.querySelectorAll('[data-anuncio]').forEach(b =>
    b.classList.toggle('active', b.dataset.anuncio === pml.tipoAnuncio));
  const rep = MLFretes.REPUTACOES.find(r => r.id === pml.reputacao);
  if($('mlRepAtual')) $('mlRepAtual').textContent = rep ? rep.nome.toLowerCase() : pml.reputacao;
}
function setReputacao(id, btn){
  pml.reputacao = id;
  guardarParamsML();
  document.querySelectorAll('[data-rep]').forEach(b => b.classList.toggle('active', b === btn));
  montarContexto();
  recalcularTudo();
}
function setAnuncio(tipo, btn){
  pml.tipoAnuncio = tipo;
  guardarParamsML();
  document.querySelectorAll('[data-anuncio]').forEach(b => b.classList.toggle('active', b === btn));
  recalcularTudo();
}
function recalcularTudo(){
  if(modo === 'a') calcA(); else calcB();
  if(mlAba === 'taxas'){ taxasProntas = false; montarTaxas(); }
  if(mlLinhas.length && !$('mlStep3').classList.contains('hide')) mlProcessar();
}

function abaML(qual, btn){
  mlAba = qual;
  ['calc','massa','taxas'].forEach(k => mostrar('ml-' + k, k === qual));
  document.querySelectorAll('[data-mltab]').forEach(t => t.classList.toggle('active', t.dataset.mltab === qual));
  mostrar('passos', qual === 'massa');
  if(qual === 'taxas') montarTaxas();
}

/* ── drawer de parâmetros do ML ── */
function abrirParamsML(){
  const set = (id, v) => { const el = $(id); if(el) el.value = v; };
  set('m_comissaoClassico', (pml.comissaoClassico * 100).toFixed(2).replace(/\.?0+$/, ''));
  set('m_comissaoPremium',  (pml.comissaoPremium  * 100).toFixed(2).replace(/\.?0+$/, ''));
  set('m_taxaFixa', (pml.taxaFixa || []).map(f => {
    const ate = f.ate >= 1e9 ? '999999' : String(f.ate).replace('.', ',');
    const val = f.percentual
      ? String(+(f.percentual * 100).toFixed(4)).replace('.', ',') + '%'
      : String(f.valor).replace('.', ',');
    return ate + ' = ' + val;
  }).join('\n'));
  $('m_freteAutomatico').checked = !!pml.freteAutomatico;
  set('m_freteManual', pml.freteManual);
  set('m_pesoPadrao', pml.pesoPadrao);
  set('m_rebate', pml.rebate);
  set('m_aliquotaImposto', (pml.aliquotaImposto * 100).toFixed(2).replace(/\.?0+$/, ''));
  set('m_taxaDevolucao',   (pml.taxaDevolucao   * 100).toFixed(2).replace(/\.?0+$/, ''));
  set('m_embalagem', pml.embalagem);
  $('scrimML').classList.add('open');
  $('drawerML').classList.add('open');
}
function fecharParamsML(){
  $('scrimML').classList.remove('open');
  $('drawerML').classList.remove('open');
}
function salvarParamsML(){
  const n = id => { const v = ML.parseNumero($(id).value); return isNaN(v) ? 0 : v; };
  // "12,49 = 50%" vira faixa proporcional; "29 = 6,25" vira valor fixo
  const faixas = ($('m_taxaFixa').value || '').split('\n')
    .map(l => l.split('=').map(s => s.trim()))
    .filter(a => a.length >= 2 && a[0])
    .map(a => {
      const ate = ML.parseNumero(a[0]);
      const bruto = a[1];
      if(/%\s*$/.test(bruto)){
        const pc = ML.parseNumero(bruto.replace(/%/g, ''));
        return isNaN(pc) ? null : {ate, percentual: pc / 100};
      }
      const v = ML.parseNumero(bruto);
      return isNaN(v) ? null : {ate, valor: v};
    })
    .filter(f => f && !isNaN(f.ate))
    .sort((a, b) => a.ate - b.ate);

  Object.assign(pml, {
    comissaoClassico: n('m_comissaoClassico') / 100,
    comissaoPremium:  n('m_comissaoPremium')  / 100,
    taxaFixa: faixas.length ? faixas : ML.PADRAO.taxaFixa,
    freteAutomatico: $('m_freteAutomatico').checked,
    freteManual: n('m_freteManual'),
    pesoPadrao:  n('m_pesoPadrao'),
    rebate:      n('m_rebate'),
    aliquotaImposto: n('m_aliquotaImposto') / 100,
    taxaDevolucao:   n('m_taxaDevolucao')   / 100,
    embalagem:   n('m_embalagem'),
  });
  guardarParamsML();
  fecharParamsML();
  montarContexto();
  recalcularTudo();
}
function restaurarPadraoML(){
  pml = Object.assign({}, ML.PADRAO);
  try{ localStorage.removeItem(CHAVE_ML); }catch(e){}
  guardarParamsML();
  abrirParamsML();
  montarContexto();
  recalcularTudo();
}

/* ── calculadora individual ── */
function setModo(m){
  modo = m;
  mostrar('formA', m === 'a');
  mostrar('formB', m === 'b');
  $('modoA').classList.toggle('active', m === 'a');
  $('modoB').classList.toggle('active', m === 'b');
  $('resCalc').innerHTML = '';
  if(m === 'a') calcA(); else calcB();
}

function blocoResultado(r, alvo){
  const pct = v => (v * 100).toFixed(1).replace('.', ',') + '%';
  const linhas = [
    ['Preço de venda',                     ML.brl(r.preco),          'var(--ink)',       ''],
    ['Comissão ' + (pml.tipoAnuncio === 'premium' ? 'Premium' : 'Clássico') + ' (' + pct(r.comissaoPct) + ')',
                                           ML.brl(-r.comissao),      'var(--red)',       ''],
    ['Custo fixo por unidade',             ML.brl(-r.taxaFixa),      'var(--red)',       r.taxaFixa ? '' : 'acima de R$ 79 não tem'],
    ['Custo de envio',                     ML.brl(-r.frete),         'var(--red)',       r.faixaPeso],
    ['Rebate do ML',                       ML.brl(r.rebate),         'var(--green-dk)',  ''],
    ['Receita líquida',                    ML.brl(r.receitaLiquida), 'var(--green-dk)',  'o que entra na conta'],
    ['Custo do produto',                   ML.brl(-r.custo),         'var(--amber)',     ''],
    ['Margem de contribuição',             ML.brl(r.margemContrib),  'var(--blue-dk)',   pct(r.margemBruta) + ' do preço'],
    ['Imposto',                            ML.brl(-r.imposto),       'var(--red)',       ''],
    ['Perdas com devolução',               ML.brl(-r.perdas),        'var(--red)',       ''],
    ['Embalagem',                          ML.brl(-r.embalagem),     'var(--red)',       ''],
  ];
  const copia = r.preco.toFixed(2).replace('.', ',');
  const bom = r.lucroLiquido > 0;
  return `<div class="resultado${bom ? '' : ' ruim'}">
    <div class="res-top">
      <div class="res-lbl">${modo === 'a' ? 'Preço sugerido de venda' : 'Preço informado'}</div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div class="res-preco">${ML.brl(r.preco)}</div>
        <button class="copiar" onclick="copiar('${copia}',this)">COPIAR</button>
      </div>
      <div class="res-faixa">${esc(r.faixaPreco)}${r.markup ? ' · markup ' + r.markup.toFixed(2).replace('.', ',') + 'x' : ''}</div>
    </div>

    <div class="extrato">
      ${linhas.map(([l, v, c, obs]) => `<div class="ex-linha">
        <span class="ex-l">${esc(l)}${obs ? ' <i>' + esc(obs) + '</i>' : ''}</span>
        <span class="ex-v" style="color:${c}">${v}</span>
      </div>`).join('')}
      <div class="ex-linha total">
        <span class="ex-l">Lucro líquido</span>
        <span class="ex-v" style="color:${bom ? 'var(--green-dk)' : 'var(--red)'}">${ML.brl(r.lucroLiquido)}</span>
      </div>
      <div class="ex-linha total">
        <span class="ex-l">Margem líquida${alvo != null ? ' <i>alvo ' + pct(alvo) + '</i>' : ''}</span>
        <span class="ex-v" style="color:${bom ? 'var(--green-dk)' : 'var(--red)'}">${pct(r.margemLiquida)}</span>
      </div>
    </div>
    ${bom ? '' : '<div class="aviso" style="margin:0 22px 20px">Nesse preço a venda dá prejuízo.</div>'}
  </div>`;
}
function copiar(txt, btn){
  navigator.clipboard.writeText(txt);
  btn.textContent = '✓ COPIADO';
  setTimeout(() => btn.textContent = 'COPIAR', 1500);
}

function calcA(){
  const el = $('resCalc');
  const custo  = ML.parseNumero($('cA').value);
  const peso   = ML.parseNumero($('pesoA').value);
  const margem = ML.parseNumero($('mgA').value);

  if(custo < 0 || peso < 0) return el.innerHTML = '<div class="aviso">Custo e peso não podem ser negativos.</div>';
  if(!isNaN(margem) && (margem <= 0 || margem >= 100))
    return el.innerHTML = '<div class="aviso">A margem precisa ficar entre 1% e 99%.</div>';
  if(isNaN(custo) || custo <= 0 || isNaN(margem)){ el.innerHTML = ''; return; }

  const alvo = margem / 100;
  const preco = ML.precoPara(custo, alvo, isNaN(peso) ? 0 : peso, pml);
  if(preco == null){
    return el.innerHTML = '<div class="aviso">Com essas taxas, essa margem não é alcançável. Reduza a margem ou revise os parâmetros.</div>';
  }
  el.innerHTML = blocoResultado(ML.analisar(preco, custo, isNaN(peso) ? 0 : peso, pml), alvo);
}

function calcB(){
  const el = $('resCalc');
  const preco = ML.parseNumero($('pB').value);
  const custo = ML.parseNumero($('cB').value);
  const peso  = ML.parseNumero($('pesoB').value);
  if(custo < 0 || peso < 0) return el.innerHTML = '<div class="aviso">Custo e peso não podem ser negativos.</div>';
  if(isNaN(preco) || preco <= 0){ el.innerHTML = ''; return; }
  el.innerHTML = blocoResultado(
    ML.analisar(preco, isNaN(custo) ? 0 : custo, isNaN(peso) ? 0 : peso, pml), null);
}

/* ── planilha em massa ── */
const MARGENS = [10,15,20,25,30,35,40,50,60];
$('mlMargens').innerHTML = MARGENS.map((m,i) =>
  `<button class="margem${m === 20 ? ' active' : ''}" onclick="mlSetMargem(${m},this)">${m}%</button>`).join('');

function mlSetMargem(v, btn){
  mlMargem = v / 100;
  document.querySelectorAll('.margem').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  $('mlMargemCustom').value = '';
  $('mlMargemAtual').textContent = v + '%';
}
function mlMargemLivre(){
  const v = ML.parseNumero($('mlMargemCustom').value);
  if(!isNaN(v) && v > 0 && v < 100){
    mlMargem = v / 100;
    document.querySelectorAll('.margem').forEach(b => b.classList.remove('active'));
    $('mlMargemAtual').textContent = String(v).replace('.', ',') + '%';
  }
}

const PASSOS_ML = ['CARREGAR','MARGEM','REVISAR','BAIXAR'];
function mlPasso(n){
  [1,2,3,4].forEach(i => mostrar('mlStep' + i, i === n));
  $('passos').innerHTML = PASSOS_ML.map((lbl,i) => {
    const num = i + 1;
    const cls = num < n ? 'done' : (num === n ? 'on' : '');
    return `<div class="step"><div class="step-dot ${cls}">${num < n ? '✓' : num}</div>
      <span class="step-lbl ${num === n ? 'on' : ''}">${lbl}</span></div>` +
      (num < 4 ? '<div class="step-sep"></div>' : '');
  }).join('');
}
mlPasso(1);

function mlDrop(e){
  e.preventDefault();
  $('mlZone').classList.remove('drag');
  mlCarregar(e.dataTransfer.files[0]);
}
function mlCarregar(f){
  if(!f) return;
  mlNome = f.name;
  const rd = new FileReader();
  rd.onerror = () => alert('Não consegui ler esse arquivo. Verifique se ele ainda existe e tente de novo.');
  rd.onload = ev => {
    try{
      mlBytes = ev.target.result;
      mlWb = XLSX.read(mlBytes, {type:'array'});
      const ws = XU.normalizarRef(mlWb.Sheets[mlWb.SheetNames[0]]);
      mlAoa = XLSX.utils.sheet_to_json(ws, {header:1, defval:'', raw:false});
      if(mlAoa.length < 2) throw new Error('A planilha não tem linhas de produto.');
      mlCabecalho = mlAoa[0].map(String);

      const opcoes = mlCabecalho.map((h,i) =>
        `<option value="${i}">${esc(h || 'Coluna ' + PE.indexToCol(i))} (${PE.indexToCol(i)})</option>`).join('');
      $('mlCusto').innerHTML = '<option value="-1">— Selecione —</option>' + opcoes;
      $('mlPeso').innerHTML  = '<option value="-1">Sem peso — usar frete manual</option>' + opcoes;
      $('mlPreco').innerHTML = '<option value="-1">Nova coluna no final</option>' + opcoes;
      $('mlComissao').innerHTML = '<option value="-1">Usar a tarifa do tipo de anúncio</option>' + opcoes;

      // auto-seleção: só serve coluna que realmente tenha número > 0
      const temValores = i => i >= 0 && mlAoa.slice(1).some(l => {
        const n = ML.parseNumero(l[i]);
        return !isNaN(n) && n > 0;
      });
      const acha = re => mlCabecalho.findIndex(h => re.test(String(h)));
      const iCusto = [acha(/custo/i), acha(/^pre[çc]o$/i)].find(temValores);
      const iPeso  = [acha(/peso\s*bruto/i), acha(/peso\s*l[íi]quido/i), acha(/peso/i)].find(temValores);
      const iPreco = acha(/^pre[çc]o$/i);
      if(iCusto !== undefined) $('mlCusto').value = iCusto;
      if(iPeso  !== undefined) $('mlPeso').value  = iPeso;
      if(iPreco >= 0) $('mlPreco').value = iPreco;

      $('mlFName').textContent = f.name;
      $('mlFInfo').textContent = `${mlAoa.length - 1} produtos · ${mlCabecalho.length} colunas · aba "${mlWb.SheetNames[0]}"`;
      mlValidaCol();
      mlPasso(2);
    }catch(err){ alert('Não consegui ler esse arquivo: ' + err.message); }
  };
  rd.readAsArrayBuffer(f);
}

function mlValidaCol(){
  const ic = parseInt($('mlCusto').value), ip = parseInt($('mlPeso').value);
  const id = parseInt($('mlPreco').value), im = parseInt($('mlComissao').value);
  $('mlCustoNota').textContent = ic >= 0 ? `✓ "${mlCabecalho[ic]}" — custo do produto` : '';
  $('mlPesoNota').textContent  = ip >= 0 ? `✓ "${mlCabecalho[ip]}" — frete pela tabela oficial`
                                         : `sem peso: frete manual de ${ML.brl(pml.freteManual)}`;
  $('mlPrecoNota').textContent = id >= 0 ? `⚠ vai sobrescrever "${mlCabecalho[id]}"` : '';
  $('mlComissaoNota').textContent = im >= 0
    ? `✓ "${mlCabecalho[im]}" — tarifa de cada produto`
    : `todos com ${(ML.comissaoPct(pml)*100).toFixed(1).replace('.0','').replace('.', ',')}% (${pml.tipoAnuncio === 'premium' ? 'Premium' : 'Clássico'})`;
  $('mlBtnCalc').disabled = ic < 0;
}

function mlProcessar(){
  const ic = parseInt($('mlCusto').value);
  const ip = parseInt($('mlPeso').value);
  const im = parseInt($('mlComissao').value);
  if(ic < 0) return;

  mlLinhas = mlAoa.slice(1).map(linha => {
    const custo = ML.parseNumero(linha[ic]);
    const peso  = ip >= 0 ? ML.parseNumero(linha[ip]) : NaN;
    if(isNaN(custo) || custo <= 0) return {custo:null};
    const kg = isNaN(peso) ? 0 : peso;

    // tarifa própria do produto: aceita 13 ou 0,13
    let p = pml;
    if(im >= 0){
      let taxa = ML.parseNumero(linha[im]);
      if(!isNaN(taxa) && taxa > 0){
        if(taxa > 1) taxa = taxa / 100;
        p = Object.assign({}, pml, {comissaoProduto: taxa});
      }
    }
    const preco = ML.precoPara(custo, mlMargem, kg, p);
    if(preco == null) return {custo, preco:null, peso:kg};
    return Object.assign({peso:kg}, ML.analisar(preco, custo, kg, p));
  });

  const ok = mlLinhas.filter(r => r.preco != null);
  if(!ok.length){
    alert(`Nenhum preço foi calculado.\n\nA coluna "${mlCabecalho[ic]}" não tem valores numéricos maiores que zero — `
        + 'escolha a coluna que guarda o custo do produto.');
    return;
  }
  const lucros = ok.map(r => r.lucroLiquido);
  const soma = lucros.reduce((a,b) => a + b, 0);
  const semPeso = mlLinhas.filter(r => r.custo != null && !r.peso).length;

  const cards = [
    {n: mlLinhas.length,                 l:'Produtos',             c:'var(--ink)'},
    {n: ok.length,                       l:'Preços calculados',    c:'var(--green-dk)'},
    {n: (mlMargem*100).toFixed(0) + '%', l:'Margem líquida',       c:'var(--blue-dk)'},
    {n: ML.brl(soma / lucros.length),    l:'Lucro médio',          c:'var(--violet-dk)'},
    {n: ML.brl(soma),                    l:'Lucro total estimado', c:'var(--green-dk)'},
  ];
  $('mlStats').innerHTML = cards.map((c,i) =>
    `<div class="stat" style="animation-delay:${i*.04}s"><div class="stat-n" style="color:${c.c}">${c.n}</div>
     <div class="stat-l">${c.l}</div></div>`).join('');

  const iDesc = mlCabecalho.findIndex(h => /descri/i.test(String(h)));
  const prev = mlLinhas.slice(0, 100);
  $('mlTabela').innerHTML =
    `<thead><tr><th>#</th><th>Descrição</th><th>Custo</th><th>Peso</th><th>Preço de venda</th>
      <th>Comissão</th><th>Envio</th><th>Receita líq.</th><th>Lucro</th></tr></thead><tbody>` +
    prev.map((r,i) => {
      const desc = iDesc >= 0 ? String(mlAoa[i+1][iDesc] || '').slice(0, 42) : '';
      if(r.preco == null) return `<tr>
        <td style="color:var(--faint)">${i+1}</td>
        <td title="${esc(desc)}">${esc(desc) || '—'}</td>
        <td colspan="7" style="color:var(--faint)">${r.custo == null ? 'sem custo na planilha' : 'margem não alcançável'}</td></tr>`;
      return `<tr>
        <td style="color:var(--faint)">${i+1}</td>
        <td title="${esc(desc)}">${esc(desc) || '—'}</td>
        <td style="color:var(--amber)">${ML.brl(r.custo)}</td>
        <td style="color:var(--faint)">${r.peso ? String(r.peso).replace('.', ',') + ' kg' : '—'}</td>
        <td style="font-weight:700">${ML.brl(r.preco)}</td>
        <td style="color:var(--red)">${ML.brl(-r.comissao)}</td>
        <td style="color:var(--red)">${ML.brl(-r.frete)}</td>
        <td style="color:var(--blue-dk)">${ML.brl(r.receitaLiquida)}</td>
        <td style="color:${r.lucroLiquido > 0 ? 'var(--green-dk)' : 'var(--red)'}">${ML.brl(r.lucroLiquido)}</td>
      </tr>`;
    }).join('') + '</tbody>';

  $('mlPrevInfo').textContent = `PRÉVIA DOS ${Math.min(100, prev.length)} PRIMEIROS`
    + (semPeso ? ` · ${semPeso} SEM PESO` : '');
  $('mlBtnDl').innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>Baixar planilha pronta para o Bling (${ok.length} produtos)`;
  mlPasso(3);
}

function mlBaixar(){
  const id = parseInt($('mlPreco').value);
  const comAnalise = $('mlColunasAnalise').checked;
  let nome;
  try{
    // relê o arquivo enviado e troca só o que muda, preservando tipos e formato
    const wb = XLSX.read(mlBytes, {type:'array'});
    const nomeAba = wb.SheetNames[0];
    XU.normalizarRef(wb.Sheets[nomeAba]);
    const ws = XU.clonarWs(wb.Sheets[nomeAba]);
    const base = mlCabecalho.length;

    const NOVAS = ['Custo do produto','Peso (kg)','Preço de venda ML','Comissão','Custo fixo',
                   'Custo de envio','Receita líquida','Lucro líquido','Margem líquida'];
    if(comAnalise) NOVAS.forEach((t, k) => XU.escrever(ws, 0, base + k, t));

    mlLinhas.forEach((r, i) => {
      const linha = i + 1;
      if(id >= 0 && r.preco != null) XU.escrever(ws, linha, id, r.preco);
      if(comAnalise){
        const vals = r.preco == null
          ? [r.custo, r.peso, '', '', '', '', '', '', '']
          : [r.custo, r.peso, r.preco, -r.comissao, -r.taxaFixa, -r.frete,
             r.receitaLiquida, r.lucroLiquido, +(r.margemLiquida).toFixed(4)];
        vals.forEach((v, k) => XU.escrever(ws, linha, base + k, v === undefined ? '' : v));
      }
    });

    if(comAnalise){
      const cols = ws['!cols'] ? ws['!cols'].slice() : [];
      NOVAS.forEach((_, k) => cols[base + k] = {wch:18});
      ws['!cols'] = cols;
    }

    const saida = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(saida, ws, XU.nomeDeAbaValido(nomeAba, 'Produtos'));
    nome = mlNome.replace(/\.[^.]+$/, '') + (comAnalise ? '_PRECOS_ML.xlsx' : '_BLING.xlsx');
    XLSX.writeFile(saida, nome);
  }catch(err){
    alert('Não consegui gerar o arquivo: ' + err.message);
    return;
  }

  const ok = mlLinhas.filter(r => r.preco != null).length;
  const rep = MLFretes.REPUTACOES.find(r => r.id === pml.reputacao);
  $('mlDoneMsg').innerHTML =
    `<b style="color:var(--ink)">${ok} produtos</b> precificados a <b style="color:var(--green-dk)">${(mlMargem*100).toFixed(0)}% de margem líquida</b><br/>
     Arquivo salvo como <b>${esc(nome)}</b><br/><br/>
     <span style="font-size:12px;color:var(--faint)">
     ✔ Anúncio ${pml.tipoAnuncio === 'premium' ? 'Premium' : 'Clássico'} · reputação ${esc(rep ? rep.nome.toLowerCase() : pml.reputacao)}<br/>
     ✔ Preço gravado ${id >= 0 ? 'na coluna "' + esc(mlCabecalho[id]) + '"' : 'em nova coluna'}<br/>
     ${comAnalise ? '✔ Colunas de análise incluídas — remova antes de subir no Bling'
                  : '✔ Mesmas colunas do arquivo enviado, pronto para importar no Bling'}</span>`;
  mlPasso(4);
}

function mlReset(){
  mlWb = mlBytes = null; mlAoa = []; mlCabecalho = []; mlLinhas = []; mlNome = '';
  $('mlFi').value = '';
  mlPasso(1);
}

/* ── custos oficiais ── */
let taxasProntas = false;
function montarTaxas(){
  if(taxasProntas) return;
  taxasProntas = true;
  const rep = MLFretes.REPUTACOES.find(r => r.id === pml.reputacao) || MLFretes.REPUTACOES[0];
  const pct = v => (v * 100).toFixed(1).replace('.0','').replace('.', ',') + '%';

  $('taxasRep').textContent = 'ANÚNCIO ' + (pml.tipoAnuncio === 'premium' ? 'PREMIUM' : 'CLÁSSICO');
  $('taxasRepFrete').textContent = 'REPUTAÇÃO ' + rep.nome.toUpperCase();

  $('formulaML').innerHTML = [
    ['Preço de venda',        'o que o comprador paga',                       ''],
    ['− Comissão',            'percentual do tipo de anúncio',                pct(ML.comissaoPct(pml))],
    ['− Custo fixo',          'por unidade, em produtos abaixo de R$ 79',     'até R$ 6,75'],
    ['− Custo de envio',      'tabela oficial por peso e faixa de preço',     rep.desc],
    ['+ Rebate',              'subsídio do Mercado Livre',                    ML.brl(pml.rebate)],
    ['= Receita líquida',     'o que entra na sua conta',                     ''],
    ['− Custo do produto',    'o que você paga ao fornecedor',                ''],
    ['− Imposto',             'alíquota sobre o preço',                       pct(pml.aliquotaImposto)],
    ['− Devoluções',          'reserva para perdas',                          pct(pml.taxaDevolucao)],
    ['− Embalagem',           'por unidade',                                  ML.brl(pml.embalagem)],
    ['= Lucro líquido',       'o que sobra de verdade',                       ''],
  ].map(([t, d, v]) => `<div class="f-linha${t.startsWith('=') ? ' destaque' : ''}">
      <span class="f-t">${esc(t)}</span><span class="f-d">${esc(d)}</span><span class="f-v">${esc(v)}</span>
    </div>`).join('');

  $('mlTabFixa').innerHTML = '<thead><tr><th>Faixa de preço do anúncio</th><th>Custo fixo por unidade</th></tr></thead><tbody>'
    + (pml.taxaFixa || []).slice().sort((a,b) => a.ate - b.ate).map((f, i, arr) => {
        const de = i === 0 ? 0 : arr[i-1].ate + 0.01;
        const ate = f.ate >= 1e9 ? null : f.ate;
        const cobra = f.percentual
          ? {txt: (+(f.percentual*100).toFixed(2)).toString().replace('.', ',') + '% do preço do produto', cor:'var(--red)'}
          : (f.valor ? {txt: ML.brl(f.valor), cor:'var(--red)'} : {txt:'sem custo fixo', cor:'var(--green-dk)'});
        return `<tr><td>${ate == null ? 'a partir de ' + ML.brl(de) : ML.brl(de) + ' a ' + ML.brl(ate)}</td>
          <td style="color:${cobra.cor}">${cobra.txt}</td></tr>`;
      }).join('') + '</tbody>';

  const T = MLFretes.TABELAS[rep.id];
  $('mlTabFrete').innerHTML =
    '<thead><tr><th>Peso da embalagem</th>' + MLFretes.ROTULO_FAIXA.map(f => `<th>${esc(f)}</th>`).join('') + '</tr></thead><tbody>'
    + T.map((linha, i) => `<tr><td style="font-weight:600">${esc(MLFretes.ROTULO_PESO[i])}</td>`
        + linha.map(v => `<td>${ML.brl(v)}</td>`).join('') + '</tr>').join('')
    + '</tbody>';
}
/* ══════════════════════════════════════════════════════════════════════════
   VIEW: EDITOR DE PLANILHA DE PRODUTOS
   ══════════════════════════════════════════════════════════════════════════ */
const CHAVE = 'precificador-drop:params-planilha';
let params = carregarParams();
let plWb = null, plAoa = null, plRes = null, plNome = '', plAbaAtual = 'desc';
let plBytes = null;   // bytes do arquivo enviado: cada download relê daqui

function carregarParams(){
  try{
    const s = localStorage.getItem(CHAVE);
    if(s) return Object.assign({}, PE.DEFAULT_PARAMS, JSON.parse(s));
  }catch(e){}
  return Object.assign({}, PE.DEFAULT_PARAMS);
}
function preencherForm(p){
  const set = (id,v) => { const el = $(id); if(el) el.value = v; };
  const chk = (id,v) => { const el = $(id); if(el) el.checked = !!v; };
  set('p_abaOriginal', p.abaOriginal);   set('p_abaModificado', p.abaModificado);
  chk('p_renomearAbaOriginal', p.renomearAbaOriginal);
  chk('p_incluirAbaOriginal', p.incluirAbaOriginal);
  set('p_colDescricao', p.colDescricao); set('p_maxDescricao', p.maxDescricao);
  set('p_palavrasRemover', (p.palavrasRemover || []).join('\n'));
  chk('p_removerNaCurta', p.removerNaCurta);
  set('p_abreviacoes', (p.abreviacoes || []).map(a => a[0] + ' = ' + a[1]).join('\n'));
  set('p_stopwords', (p.stopwords || []).join(', '));
  chk('p_limparPontuacaoFinal', p.limparPontuacaoFinal);
  set('p_colDescricaoCurta', p.colDescricaoCurta);
  set('p_camposCadastrais', (p.camposCadastrais || []).join('\n'));
  set('p_camposAncora', (p.camposAncora || []).join(', '));
  set('p_minCamposBloco', p.minCamposBloco);
  set('p_colCondicao', p.colCondicao);   set('p_valorCondicao', p.valorCondicao);
}
function lerForm(){
  const v = id => ($(id).value || '').trim();
  const c = id => $(id).checked;
  const linhas = id => v(id).split('\n').map(s => s.trim()).filter(Boolean);
  return {
    abaOriginal: v('p_abaOriginal') || 'Original',
    abaModificado: v('p_abaModificado') || 'Modificado',
    renomearAbaOriginal: c('p_renomearAbaOriginal'),
    incluirAbaOriginal: c('p_incluirAbaOriginal'),
    colDescricao: v('p_colDescricao').toUpperCase(),
    maxDescricao: Math.max(10, parseInt(v('p_maxDescricao'), 10) || 60),
    palavrasRemover: linhas('p_palavrasRemover'),
    removerNaCurta: c('p_removerNaCurta'),
    abreviacoes: linhas('p_abreviacoes').map(l => l.split('=').map(s => s.trim()))
      .filter(a => a.length >= 2 && a[0]).map(a => [a[0], a.slice(1).join('=')]),
    stopwords: v('p_stopwords').split(',').map(s => s.trim()).filter(Boolean),
    limparPontuacaoFinal: c('p_limparPontuacaoFinal'),
    colDescricaoCurta: v('p_colDescricaoCurta').toUpperCase(),
    camposCadastrais: linhas('p_camposCadastrais'),
    camposAncora: v('p_camposAncora').split(',').map(s => s.trim()).filter(Boolean),
    minCamposBloco: Math.max(1, parseInt(v('p_minCamposBloco'), 10) || 2),
    colCondicao: v('p_colCondicao').toUpperCase(),
    valorCondicao: v('p_valorCondicao'),
  };
}
function abrirParams(){ preencherForm(params); $('scrim').classList.add('open'); $('drawer').classList.add('open'); }
function fecharParams(){ $('scrim').classList.remove('open'); $('drawer').classList.remove('open'); }
function salvarParams(){
  params = Object.assign({}, PE.DEFAULT_PARAMS, lerForm());
  try{ localStorage.setItem(CHAVE, JSON.stringify(params)); }catch(e){}
  fecharParams();
  if(plAoa) plProcessar();
}
function restaurarPadrao(){
  params = Object.assign({}, PE.DEFAULT_PARAMS);
  try{ localStorage.removeItem(CHAVE); }catch(e){}
  preencherForm(params);
  if(plAoa) plProcessar();
}
addEventListener('keydown', e => { if(e.key === 'Escape') fecharParams(); });

function plDrop(e){
  e.preventDefault();
  $('plZone').classList.remove('drag');
  plCarregar(e.dataTransfer.files[0]);
}
function plCarregar(f){
  if(!f) return;
  plNome = f.name;
  const rd = new FileReader();
  rd.onerror = () => alert('Não consegui ler esse arquivo. Verifique se ele ainda existe e tente de novo.');
  rd.onload = ev => {
    try{
      plBytes = ev.target.result;
      plWb  = XLSX.read(plBytes, {type:'array', cellStyles:true});
      plAoa = XLSX.utils.sheet_to_json(XU.normalizarRef(plWb.Sheets[plWb.SheetNames[0]]), {header:1, defval:'', raw:false});
      if(plAoa.length < 2) throw new Error('A planilha não tem linhas de produto.');
      $('plFName').textContent = f.name;
      $('plFInfo').textContent =
        `${plAoa.length - 1} produtos · ${plAoa.reduce((m,r) => Math.max(m, r.length), 0)} colunas · aba "${plWb.SheetNames[0]}"`;
      mostrar('plZoneWrap', false);
      mostrar('plFileInfo', true);
      plProcessar();
    }catch(err){ alert('Não consegui ler esse arquivo: ' + err.message); }
  };
  rd.readAsArrayBuffer(f);
}
function plReset(){
  plWb = plAoa = plRes = plBytes = null; plNome = '';
  $('plFi').value = '';
  mostrar('plZoneWrap', true);
  mostrar('plFileInfo', false);
  mostrar('plResultado', false);
}

function plProcessar(){
  plRes = PE.processar(plAoa, params);
  const m = plRes.mudancas;

  const cards = [
    {n: plAoa.length - 1,   l:'Produtos',                                            c:'var(--ink)'},
    {n: m.descricao.length, l:`Descrições ajustadas (${esc(params.colDescricao)})`,   c:'var(--blue-dk)'},
    {n: m.curta.length,     l:`Blocos removidos (${esc(params.colDescricaoCurta)})`,  c:'var(--violet-dk)'},
    {n: m.condicao,         l:`Condição corrigida (${esc(params.colCondicao)})`,      c:'var(--green-dk)'},
  ];
  $('plStats').innerHTML = cards.map((c,i) =>
    `<div class="stat" style="animation-delay:${i*.04}s"><div class="stat-n" style="color:${c.c}">${c.n}</div>
     <div class="stat-l">${c.l}</div></div>`).join('');

  const v = plRes.validacao;
  $('plChecks').innerHTML = v.checks.map(c => `
    <div class="chk ${c.ok ? 'ok' : 'bad'}">
      <div class="chk-i"><svg viewBox="0 0 24 24">${c.ok ? '<path d="M20 6 9 17l-5-5"/>' : '<path d="M18 6 6 18M6 6l12 12"/>'}</svg></div>
      <div><div class="chk-t">${esc(c.titulo)}</div><div class="chk-d">${esc(c.detalhe)}</div></div>
    </div>`).join('');

  const badge = $('plBadge');
  badge.textContent = v.ok ? 'TUDO CERTO' : 'REVISAR';
  badge.className = 'pill ' + (v.ok ? 'pill-ok' : 'pill-bad');

  $('plDlInfo').innerHTML = params.incluirAbaOriginal
    ? `Abre na aba <b style="color:var(--green-dk)">${esc(params.abaModificado)}</b>, já corrigida · a aba <b>${esc(params.abaOriginal)}</b> vem junto, intacta, para conferência · ${plAoa.length - 1} linhas`
    : `Arquivo só com a aba <b style="color:var(--green-dk)">${esc(params.abaModificado)}</b>, já corrigida · ${plAoa.length - 1} linhas`;

  mostrar('plResultado', true);
  plAba(plAbaAtual, null);
}

function plAba(qual, btn){
  plAbaAtual = qual;
  if(btn){
    btn.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
  }
  const el = $('plPrev');
  const m  = plRes.mudancas;

  if(qual === 'desc'){
    if(!m.descricao.length) return el.innerHTML = '<div class="vazio">Nenhuma descrição precisou de ajuste.</div>';
    el.innerHTML = m.descricao.map(x => `
      <div class="prev">
        <div class="prev-l">LINHA ${x.linha}<span class="tag">${x.antes.length} → ${x.depois.length} caracteres</span></div>
        <div class="prev-a">${esc(x.antes)}</div>
        <div class="prev-b"><b>${esc(x.depois)}</b></div>
      </div>`).join('');
  }
  else if(qual === 'curta'){
    if(!m.curta.length) return el.innerHTML = '<div class="vazio">Nenhum bloco cadastral encontrado no fim das descrições.</div>';
    el.innerHTML = m.curta.map(x => `
      <div class="prev">
        <div class="prev-l">LINHA ${x.linha}<span class="tag">${x.campos} campos removidos do fim</span></div>
        <div class="cut">${esc(x.removido)}</div>
      </div>`).join('');
  }
  else{
    const iAV = PE.colToIndex(params.colCondicao);
    if(iAV < 0) return el.innerHTML =
      `<div class="vazio">A coluna da condição ("${esc(params.colCondicao)}") não é válida. Ajuste em <b>Editar parâmetros</b>.</div>`;
    const linhas = [];
    for(let r = 1; r < plAoa.length; r++){
      const antes = String(plAoa[r][iAV] == null ? '' : plAoa[r][iAV]);
      if(antes !== params.valorCondicao) linhas.push({linha: r + 1, antes});
    }
    if(!linhas.length) return el.innerHTML = `<div class="vazio">Todas as linhas já estavam como "${esc(params.valorCondicao)}".</div>`;
    el.innerHTML = linhas.map(x => `
      <div class="prev">
        <div class="prev-l">LINHA ${x.linha}</div>
        <div class="prev-a">${esc(x.antes || '(vazio)')}</div>
        <div class="prev-b"><b>${esc(params.valorCondicao)}</b></div>
      </div>`).join('');
  }
}

function plBaixar(){
  if(!plRes) return;
  try{
    // relê do arquivo enviado: sem isso, baixar duas vezes acumularia as
    // abas geradas antes no mesmo workbook em memória
    const wb = XLSX.read(plBytes, {type:'array', cellStyles:true});
    XU.normalizarRef(wb.Sheets[wb.SheetNames[0]]);
    const atual = wb.SheetNames[0];

    // renomear a aba enviada, sem atropelar outra que já tenha esse nome
    if(params.renomearAbaOriginal){
      const alvo = XU.nomeDeAbaValido(params.abaOriginal, 'Original');
      if(atual !== alvo){
        const livre = wb.SheetNames.includes(alvo) ? XU.nomeDeAbaLivre(wb, alvo, 'Original') : alvo;
        wb.Sheets[livre] = wb.Sheets[atual];
        delete wb.Sheets[atual];
        wb.SheetNames[wb.SheetNames.indexOf(atual)] = livre;
      }
    }

    // a aba modificada nunca pode cair em cima da aba de origem
    const nomeOriginal = wb.SheetNames[0];
    let nomeMod = XU.nomeDeAbaValido(params.abaModificado, 'Modificado');
    if(nomeMod === nomeOriginal) nomeMod = XU.nomeDeAbaLivre(wb, nomeMod, 'Modificado');
    const jaTem = wb.SheetNames.indexOf(nomeMod);
    if(jaTem > 0){ delete wb.Sheets[nomeMod]; wb.SheetNames.splice(jaTem, 1); }

    // clona a aba de origem e troca só C, AP e AV — o resto mantém tipo e formato
    const ws = XU.clonarWs(wb.Sheets[nomeOriginal]);
    const alvos = [params.colDescricao, params.colDescricaoCurta, params.colCondicao]
      .map(c => PE.colToIndex(c)).filter(i => i >= 0);
    for(let r = 1; r < plRes.aoa.length; r++){
      alvos.forEach(c => {
        const antes  = plAoa[r] ? plAoa[r][c] : undefined;
        const depois = plRes.aoa[r][c];
        if(String(antes == null ? '' : antes) !== String(depois == null ? '' : depois)){
          XU.escrever(ws, r, c, depois);
        }
      });
    }

    XLSX.utils.book_append_sheet(wb, ws, nomeMod);

    if(params.incluirAbaOriginal){
      // aba corrigida primeiro, a original ao lado para conferência
      const pos = wb.SheetNames.indexOf(nomeMod);
      if(pos > 0){
        wb.SheetNames.splice(pos, 1);
        wb.SheetNames.unshift(nomeMod);
      }
    }else{
      // arquivo sai só com a aba corrigida
      wb.SheetNames.filter(n => n !== nomeMod).forEach(n => delete wb.Sheets[n]);
      wb.SheetNames = [nomeMod];
    }
    wb.Workbook = wb.Workbook || {};
    wb.Workbook.Views = [{activeTab: 0}];

    XLSX.writeFile(wb, plNome.replace(/\.[^.]+$/, '') + '_MODIFICADO.xlsx', {bookType:'xlsx'});
  }catch(err){
    alert('Não consegui gerar o arquivo: ' + err.message);
  }
}

/* ══ início ═══════════════════════════════════════════════════════════════ */
montarContexto();
daHash();
