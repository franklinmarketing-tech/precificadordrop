/* ══════════════════════════════════════════════════════════════════════════
   Precificador Drop — hub: router + views (ML e editor de planilha)
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const ML = MLEngine;
const PE = PlanilhaEngine;
const brl = ML.brl;
const reduzido = matchMedia('(prefers-reduced-motion:reduce)').matches;
const preciso  = matchMedia('(hover:hover) and (pointer:fine)').matches;

const $  = id => document.getElementById(id);
const esc = s => String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
const mostrar = (id, sim) => $(id).classList.toggle('hide', !sim);

/* ══ ROUTER ═══════════════════════════════════════════════════════════════ */
const VIEWS = {
  hub:      {sub:'HUB DO ECOSSISTEMA',            titulo:'Precificador Drop — Hub do Ecossistema'},
  ml:       {sub:'PRECIFICAR MERCADO LIVRE',      titulo:'Precificar Mercado Livre — Precificador Drop'},
  planilha: {sub:'EDIÇÃO DE PLANILHA DE PRODUTOS',titulo:'Edição de Planilha — Precificador Drop'},
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

function subirAte(el, alvo, dur){
  if(reduzido){ el.textContent = brl(alvo); return; }
  const t0 = performance.now();
  (function passo(agora){
    const p = Math.min((agora - t0) / dur, 1);
    el.textContent = brl(alvo * (1 - Math.pow(1 - p, 3)));
    if(p < 1) requestAnimationFrame(passo);
  })(t0);
}
function contarPreco(){
  subirAte($('livePrice'),  79.90, 1100);
  subirAte($('liveProfit'), 16.48, 1300);
}
document.querySelector('.tool-1').addEventListener('mouseenter', contarPreco);

/* ══════════════════════════════════════════════════════════════════════════
   VIEW: PRECIFICADOR MERCADO LIVRE
   ══════════════════════════════════════════════════════════════════════════ */
let mlAba = 'calc', modo = 'a';
let mlWb = null, mlAoa = [], mlCabecalho = [], mlLinhas = [], mlNome = '', mlMargem = 0.10;

function abaML(qual, btn){
  mlAba = qual;
  ['calc','massa','taxas'].forEach(k => mostrar('ml-' + k, k === qual));
  document.querySelectorAll('[data-mltab]').forEach(t => t.classList.toggle('active', t.dataset.mltab === qual));
  mostrar('passos', qual === 'massa');
  if(qual === 'taxas') montarTaxas();
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

function blocoResultado(preco, fat, taxas, lucro, margem, faixa, custo){
  if(!faixa) return '';
  const tiles = [
    {l:'Preço de venda',           v:brl(preco),  c:'var(--ink)'},
    {l:'Total de taxas ML',        v:brl(-taxas), c:'var(--red)'},
    {l:'Receita líquida (FATURAM)',v:brl(fat),    c:'var(--green-dk)'},
  ];
  if(custo){
    tiles.push(
      {l:'Custo + frete',    v:brl(-custo), c:'var(--amber)'},
      {l:'Lucro líquido',    v:brl(lucro),  c: lucro > 0 ? 'var(--green-dk)' : 'var(--red)'},
      {l:'Margem sobre receita', v: margem != null ? (margem*100).toFixed(1).replace('.', ',') + '%' : '—',
       c: margem > 0 ? 'var(--green-dk)' : 'var(--red)'},
    );
  }
  const copia = preco.toFixed(2).replace('.', ',');
  return `<div class="resultado">
    <div class="res-top">
      <div class="res-lbl">Preço sugerido de venda</div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div class="res-preco">${brl(preco)}</div>
        <button class="copiar" onclick="copiar('${copia}',this)">COPIAR</button>
      </div>
      <div class="res-faixa">${faixa.lb}</div>
    </div>
    <div class="res-grid">
      ${tiles.map(t => `<div class="res-tile"><div class="res-tile-l">${t.l}</div>
        <div class="res-tile-v" style="color:${t.c}">${t.v}</div></div>`).join('')}
    </div>
    <div class="res-taxas">
      <span><b>Custo fixo:</b> ${faixa.cf}</span>
      <span><b>Frete:</b> ${faixa.fr}</span>
      <span><b>Comissão:</b> ${faixa.co}</span>
    </div>
  </div>`;
}
function copiar(txt, btn){
  navigator.clipboard.writeText(txt);
  btn.textContent = '✓ COPIADO';
  setTimeout(() => btn.textContent = 'COPIAR', 1500);
}

function calcA(){
  const custo = ML.custoTotal($('cA').value, $('frA').value);
  const pct   = parseFloat($('mgA').value) / 100;
  const el    = $('resCalc');
  if(custo == null || !pct){ el.innerHTML = ''; return; }
  const preco = ML.precoPara(custo, pct);
  if(!preco){ el.innerHTML = '<div class="aviso">Não foi possível calcular com esses valores. Revise custo e margem.</div>'; return; }
  const fat   = ML.faturam(preco);
  const lucro = +(fat - custo).toFixed(2);
  el.innerHTML = blocoResultado(preco, fat, +(preco - fat).toFixed(2), lucro, fat ? lucro/fat : 0, ML.faixaDe(preco), custo);
}

function calcB(){
  const preco = parseFloat($('pB').value);
  const cf    = parseFloat($('cB').value)  || 0;
  const fr    = parseFloat($('frB').value) || 0;
  const custo = (cf || fr) ? +(cf + fr).toFixed(2) : null;
  const el    = $('resCalc');
  if(!preco){ el.innerHTML = ''; return; }
  if(preco < 5){ el.innerHTML = '<div class="aviso">O preço mínimo no Mercado Livre é R$ 5,00.</div>'; return; }
  const fat   = ML.faturam(preco);
  const faixa = ML.faixaDe(preco);
  if(!fat || !faixa){ el.innerHTML = ''; return; }
  const lucro  = custo != null ? +(fat - custo).toFixed(2) : null;
  const margem = custo != null && fat ? lucro / fat : null;
  el.innerHTML = blocoResultado(preco, fat, +(preco - fat).toFixed(2), lucro, margem, faixa, custo);
}

/* ── planilha em massa ── */
const MARGENS = [10,15,20,25,30,35,40,50,60];
$('mlMargens').innerHTML = MARGENS.map((m,i) =>
  `<button class="margem${i===0?' active':''}" onclick="mlSetMargem(${m},this)">${m}%</button>`).join('');

function mlSetMargem(v, btn){
  mlMargem = v / 100;
  document.querySelectorAll('.margem').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  $('mlMargemCustom').value = '';
  $('mlMargemAtual').textContent = v + '%';
}
function mlMargemLivre(){
  const v = parseFloat($('mlMargemCustom').value);
  if(!isNaN(v) && v > 0 && v < 100){
    mlMargem = v / 100;
    document.querySelectorAll('.margem').forEach(b => b.classList.remove('active'));
    $('mlMargemAtual').textContent = v + '%';
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
  rd.onload = ev => {
    try{
      mlWb = XLSX.read(ev.target.result, {type:'array'});
      const ws = mlWb.Sheets[mlWb.SheetNames[0]];
      mlAoa = XLSX.utils.sheet_to_json(ws, {header:1, defval:'', raw:false});
      if(mlAoa.length < 2) throw new Error('A planilha não tem linhas de produto.');
      mlCabecalho = mlAoa[0].map(String);

      const opcoes = mlCabecalho.map((h,i) =>
        `<option value="${i}">${esc(h || 'Coluna ' + PE.indexToCol(i))} (${PE.indexToCol(i)})</option>`).join('');
      $('mlCusto').innerHTML = '<option value="-1">— Selecione —</option>' + opcoes;
      $('mlFrete').innerHTML = '<option value="-1">Sem frete (custo = 0)</option>' + opcoes;
      $('mlPreco').innerHTML = '<option value="-1">Nova coluna no final</option>' + opcoes;

      // auto-seleção: a coluna de custo precisa ter valores de verdade —
      // exports costumam trazer "Preço de custo" zerada
      const temValores = i => i >= 0 && mlAoa.slice(1).some(l => {
        const n = ML.parseNumero(l[i]);
        return !isNaN(n) && n > 0;
      });
      const iCusto = mlCabecalho.findIndex(h => /custo/i.test(String(h)));
      const iPreco = mlCabecalho.findIndex(h => /^pre[çc]o$/i.test(String(h).trim()));
      const iFrete = mlCabecalho.findIndex(h => /frete/i.test(String(h)));
      const escolha = [iCusto, iPreco].find(temValores);
      if(escolha !== undefined) $('mlCusto').value = escolha;
      if(temValores(iFrete)) $('mlFrete').value = iFrete;
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
  const ic = parseInt($('mlCusto').value), iF = parseInt($('mlFrete').value), ip = parseInt($('mlPreco').value);
  $('mlCustoNota').textContent = ic >= 0 ? `✓ "${mlCabecalho[ic]}" — custo do fornecedor` : '';
  $('mlFreteNota').textContent = iF >= 0 ? `✓ "${mlCabecalho[iF]}" — somado ao custo` : '';
  $('mlPrecoNota').textContent = ip >= 0 ? `⚠ vai sobrescrever "${mlCabecalho[ip]}"` : '';
  $('mlBtnCalc').disabled = ic < 0;
}

function mlProcessar(){
  const ic = parseInt($('mlCusto').value);
  const iF = parseInt($('mlFrete').value);
  if(ic < 0) return;

  mlLinhas = mlAoa.slice(1).map(linha => {
    const custo = ML.custoTotal(linha[ic], iF >= 0 ? linha[iF] : 0);
    if(custo == null) return {custo:null, preco:null, fat:null, lucro:null, faixa:null};
    const preco = ML.precoPara(custo, mlMargem);
    const fat   = preco ? ML.faturam(preco) : null;
    return {
      custo, preco, fat,
      lucro: fat != null ? +(fat - custo).toFixed(2) : null,
      faixa: preco ? ML.faixaDe(preco) : null,
    };
  });

  const ok     = mlLinhas.filter(r => r.preco != null);
  const lucros = ok.map(r => r.lucro);
  const soma   = lucros.reduce((a,b) => a + b, 0);
  const cards  = [
    {n: mlLinhas.length,                        l:'Produtos',              c:'var(--ink)'},
    {n: ok.length,                              l:'Preços calculados',     c:'var(--green-dk)'},
    {n: (mlMargem*100).toFixed(0) + '%',        l:'Margem aplicada',       c:'var(--blue-dk)'},
    {n: brl(lucros.length ? soma/lucros.length : 0), l:'Lucro médio',      c:'var(--violet-dk)'},
    {n: brl(soma),                              l:'Lucro total estimado',  c:'var(--green-dk)'},
  ];
  $('mlStats').innerHTML = cards.map((c,i) =>
    `<div class="stat" style="animation-delay:${i*.04}s"><div class="stat-n" style="color:${c.c}">${c.n}</div>
     <div class="stat-l">${c.l}</div></div>`).join('');

  const iDesc = mlCabecalho.findIndex(h => /descri/i.test(String(h)));
  const prev  = mlLinhas.slice(0, 100);
  $('mlTabela').innerHTML =
    `<thead><tr><th>#</th><th>Descrição</th><th>Custo + frete</th><th>Novo preço</th>
      <th>FATURAM</th><th>Lucro</th><th>Faixa</th></tr></thead><tbody>` +
    prev.map((r,i) => {
      const desc = iDesc >= 0 ? String(mlAoa[i+1][iDesc] || '').slice(0, 46) : '';
      return `<tr>
        <td style="color:var(--faint)">${i+1}</td>
        <td title="${esc(desc)}">${esc(desc) || '—'}</td>
        <td style="color:var(--amber)">${brl(r.custo)}</td>
        <td style="font-weight:700;color:${r.preco ? 'var(--ink)' : 'var(--faint)'}">${r.preco ? brl(r.preco) : '— sem custo'}</td>
        <td style="color:var(--green-dk)">${brl(r.fat)}</td>
        <td style="color:${r.lucro > 0 ? 'var(--green-dk)' : 'var(--red)'}">${brl(r.lucro)}</td>
        <td style="color:var(--faint);font-size:10.5px">${r.faixa ? r.faixa.lb.split('(')[0].trim() : '—'}</td>
      </tr>`;
    }).join('') + '</tbody>';

  $('mlPrevInfo').textContent = `PRÉVIA DOS ${Math.min(100, prev.length)} PRIMEIROS`;
  $('mlBtnDl').innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>Baixar Excel atualizado (${ok.length} produtos)`;
  mlPasso(3);
}

function mlBaixar(){
  const ip = parseInt($('mlPreco').value);
  const n2 = v => v == null ? '' : +v.toFixed(2);

  const saida = mlAoa.map((linha, i) => {
    const nova = [...linha];
    if(i === 0){
      nova.push('Custo Total (Fornecedor+Frete)','Preço de Venda ML','FATURAM (Receita Líquida)','Lucro Líquido (R$)','Faixa ML');
      return nova;
    }
    const r = mlLinhas[i-1];
    if(ip >= 0 && r && r.preco != null) nova[ip] = r.preco;
    nova.push(
      r ? n2(r.custo) : '',
      r && r.preco != null ? n2(r.preco) : '',
      r ? n2(r.fat)   : '',
      r ? n2(r.lucro) : '',
      r && r.faixa ? r.faixa.lb : '—',
    );
    return nova;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(saida);
  ws['!cols'] = saida[0].map((_, i) => ({wch: i >= mlCabecalho.length ? 24 : 18}));
  XLSX.utils.book_append_sheet(wb, ws, mlWb.SheetNames[0].slice(0, 31));
  const nome = mlNome.replace(/\.[^.]+$/, '') + '_PRECOS_ML.xlsx';
  XLSX.writeFile(wb, nome);

  const ok = mlLinhas.filter(r => r.preco != null).length;
  $('mlDoneMsg').innerHTML =
    `<b style="color:var(--ink)">${ok} produtos</b> com preço calculado a <b style="color:var(--green-dk)">${(mlMargem*100).toFixed(0)}% de margem</b><br/>
     Arquivo salvo como <b>${esc(nome)}</b><br/><br/>
     <span style="font-size:12px;color:var(--faint)">
     ✔ Custo original preservado em "Custo Total (Fornecedor+Frete)"<br/>
     ✔ Novo preço gravado ${ip >= 0 ? 'na coluna "' + esc(mlCabecalho[ip]) + '"' : 'em nova coluna'}<br/>
     ✔ FATURAM, lucro e faixa do ML adicionados</span>`;
  mlPasso(4);
}

function mlReset(){
  mlWb = null; mlAoa = []; mlCabecalho = []; mlLinhas = []; mlNome = '';
  $('mlFi').value = '';
  mlPasso(1);
}

/* ── tabela de taxas ── */
let taxasProntas = false;
function montarTaxas(){
  if(taxasProntas) return;
  taxasProntas = true;
  $('mlTaxas').innerHTML =
    `<thead><tr><th>Faixa</th><th>Custo fixo</th><th>Frete</th><th>Comissão</th>
      <th>Multiplicador</th><th>Taxa fixa</th><th>Exemplo FATURAM</th></tr></thead><tbody>` +
    ML.FAIXAS.map(r => {
      const ex  = Math.min(r.mn + 10, (r.mn + Math.min(r.mx, r.mn + 50)) / 2);
      const fat = +(ex * r.mu - r.fx).toFixed(2);
      return `<tr>
        <td style="font-weight:600">${r.lb}</td>
        <td style="color:var(--amber)">${r.cf}</td>
        <td style="color:var(--blue-dk)">${r.fr}</td>
        <td style="color:var(--violet-dk)">${r.co}</td>
        <td style="color:var(--green-dk)">${(r.mu*100).toFixed(1)}%</td>
        <td style="color:var(--red)">R$ ${r.fx.toFixed(2)}</td>
        <td style="color:var(--faint)">R$ ${ex.toFixed(2)} → ${brl(fat)}</td>
      </tr>`;
    }).join('') + '</tbody>';
}

/* ══════════════════════════════════════════════════════════════════════════
   VIEW: EDITOR DE PLANILHA DE PRODUTOS
   ══════════════════════════════════════════════════════════════════════════ */
const CHAVE = 'precificador-drop:params-planilha';
let params = carregarParams();
let plWb = null, plAoa = null, plRes = null, plNome = '', plAbaAtual = 'desc';

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
  set('p_colDescricao', p.colDescricao); set('p_maxDescricao', p.maxDescricao);
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
    colDescricao: v('p_colDescricao').toUpperCase(),
    maxDescricao: Math.max(10, parseInt(v('p_maxDescricao'), 10) || 60),
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
  rd.onload = ev => {
    try{
      plWb  = XLSX.read(ev.target.result, {type:'array', cellStyles:true});
      plAoa = XLSX.utils.sheet_to_json(plWb.Sheets[plWb.SheetNames[0]], {header:1, defval:'', raw:false});
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
  plWb = plAoa = plRes = null; plNome = '';
  $('plFi').value = '';
  mostrar('plZoneWrap', true);
  mostrar('plFileInfo', false);
  mostrar('plResultado', false);
}

function plProcessar(){
  plRes = PE.processar(plAoa, params);
  const m = plRes.mudancas;

  const cards = [
    {n: plAoa.length - 1,   l:'Produtos',                                       c:'var(--ink)'},
    {n: m.descricao.length, l:`Descrições ajustadas (${params.colDescricao})`,   c:'var(--blue-dk)'},
    {n: m.curta.length,     l:`Blocos removidos (${params.colDescricaoCurta})`,  c:'var(--violet-dk)'},
    {n: m.condicao,         l:`Condição corrigida (${params.colCondicao})`,      c:'var(--green-dk)'},
  ];
  $('plStats').innerHTML = cards.map((c,i) =>
    `<div class="stat" style="animation-delay:${i*.04}s"><div class="stat-n" style="color:${c.c}">${c.n}</div>
     <div class="stat-l">${c.l}</div></div>`).join('');

  const v = plRes.validacao;
  $('plChecks').innerHTML = v.checks.map(c => `
    <div class="chk ${c.ok ? 'ok' : 'bad'}">
      <div class="chk-i"><svg viewBox="0 0 24 24">${c.ok ? '<path d="M20 6 9 17l-5-5"/>' : '<path d="M18 6 6 18M6 6l12 12"/>'}</svg></div>
      <div><div class="chk-t">${c.titulo}</div><div class="chk-d">${c.detalhe}</div></div>
    </div>`).join('');

  const badge = $('plBadge');
  badge.textContent = v.ok ? 'TUDO CERTO' : 'REVISAR';
  badge.className = 'pill ' + (v.ok ? 'pill-ok' : 'pill-bad');

  $('plDlInfo').innerHTML =
    `Aba <b>${esc(params.abaOriginal)}</b> intacta + aba <b>${esc(params.abaModificado)}</b> com as alterações · ${plAoa.length - 1} linhas`;

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
  const wb = plWb;
  const atual = wb.SheetNames[0];
  if(params.renomearAbaOriginal && atual !== params.abaOriginal){
    wb.Sheets[params.abaOriginal] = wb.Sheets[atual];
    delete wb.Sheets[atual];
    wb.SheetNames[0] = params.abaOriginal;
  }
  const jaTem = wb.SheetNames.indexOf(params.abaModificado);
  if(jaTem >= 0){ delete wb.Sheets[params.abaModificado]; wb.SheetNames.splice(jaTem, 1); }

  const ws = XLSX.utils.aoa_to_sheet(plRes.aoa);
  ws['!cols'] = plRes.aoa[0].map(() => ({wch:20}));
  XLSX.utils.book_append_sheet(wb, ws, params.abaModificado);
  XLSX.writeFile(wb, plNome.replace(/\.[^.]+$/, '') + '_MODIFICADO.xlsx', {bookType:'xlsx'});
}

/* ══ início ═══════════════════════════════════════════════════════════════ */
daHash();
