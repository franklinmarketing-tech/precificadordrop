/* ══════════════════════════════════════════════════════════════════════════
   Precificador Drop — hub: router + views (ML e editor de planilha)
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const ML = MLEngine;
const PE = PlanilhaEngine;
const brl = ML.brl;
const reduzido = matchMedia('(prefers-reduced-motion:reduce)').matches;

/* ── tema ────────────────────────────────────────────────────────────────────
   Claro por padrão, escuro por escolha. Não segue o sistema operacional de
   propósito: segue o botão. O <head> já aplicou a escolha salva antes da
   primeira pintura; aqui só ficam a troca e o rótulo do botão. */
function temaAplicar(t){
  const escuro = t === 'escuro';
  if(escuro) document.documentElement.setAttribute('data-tema', 'escuro');
  else document.documentElement.removeAttribute('data-tema');
  const b = document.getElementById('btnTema');
  if(b){
    const alvo = escuro ? 'claro' : 'escuro';
    b.setAttribute('aria-label', 'Mudar para o tema ' + alvo);
    b.setAttribute('title', 'Mudar para o tema ' + alvo);
  }
  try{ localStorage.setItem('drop-tema', t); }catch(e){}
}
function alternarTema(){
  const escuroAgora = document.documentElement.getAttribute('data-tema') === 'escuro';
  temaAplicar(escuroAgora ? 'claro' : 'escuro');
}
const preciso  = matchMedia('(hover:hover) and (pointer:fine)').matches;

const XU = XlsxUtils;
const $  = id => document.getElementById(id);
/* escapa também aspas: o texto vem de planilhas de terceiros e é usado
   dentro de atributos (title="…") */
const esc = s => String(s == null ? '' : s)
  .replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const mostrar = (id, sim) => $(id).classList.toggle('hide', !sim);

/* ══ BIBLIOTECA DE PLANILHAS, SOB DEMANDA ═════════════════════════════════
   O SheetJS tem 861 KB — sozinho, dois terços de tudo que a página baixava.
   Antes vinha num <script> no <head>, travando a primeira pintura: quem só
   queria ver o hub, usar a calculadora ou ler o guia esperava quase um mega
   de uma biblioteca que nunca ia usar.

   Agora ele só é buscado no momento em que alguém realmente abre ou gera uma
   planilha. Quem faz isso já clicou num arquivo e espera um instante de
   processamento de qualquer jeito — é onde a espera passa despercebida.   */
const XLSX_CDNS = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
];
let xlsxCarregando = null;

function carregarScript(src){
  return new Promise((ok, falhou) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => falhou(new Error(src));
    document.head.appendChild(s);
  });
}

/* devolve true quando a biblioteca está pronta para uso */
async function garantirXLSX(){
  if(window.XLSX) return true;
  if(!xlsxCarregando){
    xlsxCarregando = (async () => {
      for(const url of XLSX_CDNS){
        try{ await carregarScript(url); if(window.XLSX) return true; }
        catch(e){ /* tenta o próximo endereço */ }
      }
      return false;
    })();
  }
  const ok = await xlsxCarregando;
  if(!ok){
    xlsxCarregando = null;                 // deixa tentar de novo numa próxima vez
    alert('Não consegui carregar a biblioteca que lê planilhas.\n\n' +
          'Isso costuma ser conexão ou bloqueio de rede. Tente de novo; ' +
          'se continuar, tente de outra rede.');
  }
  return ok;
}

/* ══ ROUTER ═══════════════════════════════════════════════════════════════ */
const VIEWS = {
  hub:      {sub:'HUB DO ECOSSISTEMA',            titulo:'Precificador Drop — Hub do Ecossistema'},
  ml:       {sub:'PRECIFICAR MERCADO LIVRE',      titulo:'Precificar Mercado Livre — Precificador Drop'},
  planilha: {sub:'EDIÇÃO COMPLETA DE PLANILHA DE PRODUTOS',titulo:'Edição Completa de Planilha de Produtos — Precificador Drop'},
  anuncios: {sub:'AJUSTAR PREÇOS NO MERCADO LIVRE',titulo:'Ajustar preços no Mercado Livre — Precificador Drop'},
  mkt:      {sub:'PRECIFICAR OUTRO CANAL',      titulo:'Precificar — Precificador Drop'},
  manual:   {sub:'GUIA DO DROP',                   titulo:'Guia do Drop — Precificador Drop'},
  mercado:  {sub:'PESQUISA DE MERCADO',            titulo:'Pesquisa de Mercado — Precificador Drop'},
  termos:      {sub:'TERMOS DE USO',                titulo:'Termos de uso — Precificador Drop'},
  privacidade: {sub:'POLÍTICA DE PRIVACIDADE',       titulo:'Privacidade — Precificador Drop'},
};
let viewAtual = 'hub';

function ir(v, semHash){
  if(!VIEWS[v]) v = 'hub';
  viewAtual = v;
  Object.keys(VIEWS).forEach(k => mostrar('view-' + k, k === v));

  document.body.classList.toggle('view-hub', v === 'hub');
  const SIMPLES = ['hub','manual','mercado','termos','privacidade'];
  mostrar('topoTool', !SIMPLES.includes(v));
  
  mostrar('btnParams', v === 'planilha');
  mostrar('trilho', v === 'ml');
  $('wrap').classList.toggle('wrap-narrow', v === 'planilha');
  mostrar('btnVoltar', v !== 'hub');

  /* marca no menu o marketplace da tela atual */
  const MKT = {hub:'hub', ml:'ml', planilha:'ml', mercado:'ml', anuncios:'ml', manual:'guia'};
  document.querySelectorAll('.mn-t[data-mkt]').forEach(bt =>
    bt.classList.toggle('aqui', bt.dataset.mkt === MKT[v]));

  $('logoSub').textContent = VIEWS[v].sub;
  document.title = VIEWS[v].titulo;

  if(!semHash) location.hash = v === 'hub' ? '' : '#/' + v;
  window.scrollTo({top:0, behavior:'instant'});
  if(v === 'hub') contarPreco();
  if(v === 'mercado') mercadoAbrir();
  if(v === 'ml') ctxDestaque();
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
  /* O holofote que seguia o mouse saiu: era um gradiente do tamanho da tela
     repintado a cada mousemove — caro para um efeito que quase não se nota. */
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

/* contador das validações, no cabeçalho do hub */
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
/* o cabeçalho ganha sombra assim que a página desce, para descolar do conteúdo */
addEventListener('scroll', () => {
  const t = document.querySelector('.topbar');
  if(t) t.classList.toggle('rolou', scrollY > 6);
}, {passive:true});

/* quem dispara é o roteador, sempre que o hub entra em cena */

/* ══ MANUAL ════════════════════════════════════════════════════════════════
   "Gerar PDF" abre o diálogo de impressão, onde o navegador oferece "Salvar
   como PDF". O CSS de impressão já tira topo, sumário e fundo. É o caminho sem
   biblioteca nova — e sai com o texto selecionável, não como imagem. */
function manualPDF(){
  if(viewAtual !== 'manual') ir('manual');
  setTimeout(() => window.print(), 260);   // dá tempo da view trocar
}

/* o sumário rola suave até a seção, sem sujar a barra de endereço */
document.querySelectorAll('.man-sum a').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const alvo = document.querySelector(a.getAttribute('href'));
    if(alvo) alvo.scrollIntoView({behavior: reduzido ? 'instant' : 'smooth', block:'start'});
  });
});

/* ══ LÂMPADA "SAIBA MAIS" ══════════════════════════════════════════════════
   O balão abre FORA do cartão, ancorado na lâmpada. Ele é movido para o fim do
   <body> no início: dentro do cartão ficaria recortado, porque o cartão tem
   overflow escondido e ganha transform no tilt 3D — e um ancestral com
   transform recorta até quem é position:fixed.                              */
const FOLGA = 12;          // distância entre a lâmpada e o balão
let dicaAberta = null, fecharTimer = null;

document.querySelectorAll('.dica').forEach(lamp => {
  const balao = lamp.parentElement.querySelector('.saibamais');
  if(!balao) return;
  document.body.appendChild(balao);            // sai de dentro do cartão
  lamp._balao = balao;
  balao._lamp = lamp;

  const abrir  = () => abrirDica(lamp);
  const agenda = () => { clearTimeout(fecharTimer); fecharTimer = setTimeout(fecharDica, 180); };

  lamp.addEventListener('mouseenter', () => { clearTimeout(fecharTimer); abrir(); });
  lamp.addEventListener('mouseleave', agenda);
  lamp.addEventListener('focus', abrir);
  lamp.addEventListener('blur', () => { if(!lamp.classList.contains('presa')) fecharDica(); });
  // o ponteiro pode atravessar do botão até o balão sem que ele feche
  balao.addEventListener('mouseenter', () => clearTimeout(fecharTimer));
  balao.addEventListener('mouseleave', agenda);

  lamp.addEventListener('click', e => {
    e.stopPropagation();          // não abre a ferramenta do cartão
    e.preventDefault();
    const prendendo = !lamp.classList.contains('presa');
    document.querySelectorAll('.dica.presa').forEach(o => o.classList.remove('presa'));
    lamp.classList.toggle('presa', prendendo);
    prendendo ? abrirDica(lamp) : fecharDica();
  });
  lamp.addEventListener('keydown', e => {
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); lamp.click(); }
    if(e.key === 'Escape'){ lamp.classList.remove('presa'); fecharDica(); }
  });
});

function posicionarDica(lamp, balao){
  const l = lamp.getBoundingClientRect();
  const b = balao.getBoundingClientRect();
  const vw = innerWidth, vh = innerHeight;

  // abre para baixo; se não couber, abre para cima
  const paraBaixo = l.bottom + FOLGA + b.height <= vh - 8;
  balao.classList.toggle('p-baixo', paraBaixo);
  balao.classList.toggle('p-cima', !paraBaixo);
  const topo = paraBaixo ? l.bottom + FOLGA : l.top - FOLGA - b.height;

  // centraliza na lâmpada e traz de volta para dentro da janela
  let esq = l.left + l.width/2 - b.width/2;
  esq = Math.max(10, Math.min(esq, vw - b.width - 10));

  balao.style.top  = Math.round(topo) + 'px';
  balao.style.left = Math.round(esq) + 'px';
  // a seta aponta para a lâmpada, mesmo com o balão deslocado pela borda
  const seta = Math.max(16, Math.min(l.left + l.width/2 - esq, b.width - 16));
  balao.style.setProperty('--seta', Math.round(seta) + 'px');
  balao.style.setProperty('--org', `${Math.round(seta)}px ${paraBaixo ? '0' : '100%'}`);
}

function abrirDica(lamp){
  const balao = lamp._balao;
  if(dicaAberta && dicaAberta !== balao) fecharDica();
  balao.classList.add('aberto');
  balao.setAttribute('aria-hidden', 'false');
  lamp.setAttribute('aria-expanded', 'true');
  posicionarDica(lamp, balao);      // medir só depois de visível, senão dá 0
  dicaAberta = balao;
}

function fecharDica(){
  if(!dicaAberta) return;
  const lamp = dicaAberta._lamp;
  if(lamp && lamp.classList.contains('presa')) return;   // preso pelo clique
  dicaAberta.classList.remove('aberto');
  dicaAberta.setAttribute('aria-hidden', 'true');
  if(lamp) lamp.setAttribute('aria-expanded', 'false');
  dicaAberta = null;
}

/* clicar fora, rolar ou redimensionar solta o balão preso */
document.addEventListener('click', () => {
  document.querySelectorAll('.dica.presa').forEach(o => o.classList.remove('presa'));
  fecharDica();
});
addEventListener('resize', () => {
  document.querySelectorAll('.dica.presa').forEach(o => o.classList.remove('presa'));
  fecharDica();
});
addEventListener('scroll', () => {
  if(dicaAberta && dicaAberta._lamp) posicionarDica(dicaAberta._lamp, dicaAberta);
}, {passive:true});

/* ══════════════════════════════════════════════════════════════════════════
   VIEW: PRECIFICADOR MERCADO LIVRE
   ══════════════════════════════════════════════════════════════════════════ */
const CHAVE_ML = 'precificador-drop:params-ml';
let modo = 'a';
let mlWb = null, mlBytes = null, mlAoa = [], mlCabecalho = [], mlLinhas = [], mlNome = '', mlMargem = 0.20;
/* De onde a tabela foi lida. O export reabre o arquivo e escreve por posição
   física, então precisa saber a aba e em que linha está o cabeçalho — senão
   grava os preços nas linhas erradas de um arquivo com cara de certo. */
let mlAbaNome = '', mlLinhaCab = 0, mlAbas = null, mlCabInfo = null;
let mlConferencia = null, mlFiltro = null, mlPagina = 0, mlBusca = '';
/* categoria descoberta no Mercado Livre, por linha da planilha */
let mlCategorias = null;        // Map linha → {categoria, nome, classico, premium, obrigatorios}
let mlUsandoCategoria = false;
/* Correções feitas na tela: linha → {peso, custo}. Ficam separadas de mlAoa
   para o "desfazer tudo" ser possível e para o export saber o que mudou. */
let mlEdicoes = new Map();
/* a coluna de peso parece estar em gramas e ninguém decidiu ainda */
let mlPesoSuspeito = false, mlPesoConfirmadoKg = false, mlPesoInfo = null;
/* medidas em mm/m numa coluna que diz cm — mesmo problema do peso, mas sem
   nenhum aviso que o denuncie: o frete infla até 12x em silêncio */
let mlDimSuspeita = false, mlDimConfirmada = false, mlDimInfo = null, mlDimFator = 1;
/* linhas cujo peso foi convertido de gramas para quilos no cálculo */
let mlPesosConvertidos = new Set();
let ML_POR_PAGINA = 100;
const ML_PAGINAS = [100, 200, 600];
let pml = carregarParamsML();

function carregarParamsML(){
  try{
    const s = localStorage.getItem(CHAVE_ML);
    if(s){
      const salvo = JSON.parse(s);
      /* Migração por versão: só o que mudou de padrão volta ao novo valor,
         o resto das escolhas do usuário é mantido. */
      const v = Number(salvo.versao) || 1;
      if(v < 3) delete salvo.taxaFixa;        // tabela oficial de custo fixo corrigida
      if(v < 4) delete salvo.taxaDevolucao;   // padrão passou de 3% para 0
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
      <i class="radio"></i>${esc(r.nome)}
    </button>`).join('');
  $('pctClassico').textContent = (pml.comissaoClassico * 100).toFixed(1).replace('.0','').replace('.', ',') + '%';
  $('pctPremium').textContent  = (pml.comissaoPremium  * 100).toFixed(1).replace('.0','').replace('.', ',') + '%';
  document.querySelectorAll('[data-anuncio]').forEach(b =>
    b.classList.toggle('active', b.dataset.anuncio === pml.tipoAnuncio));
  const rep = MLFretes.REPUTACOES.find(r => r.id === pml.reputacao);
  if($('mlRepAtual')) $('mlRepAtual').textContent = rep ? rep.nome.toLowerCase() : pml.reputacao;
  ctxResumo();
}

/* ══ CONFERÊNCIA DA REPUTAÇÃO E DO TIPO DE ANÚNCIO ═════════════════════════
   As duas já vêm preenchidas, então o destaque não pede para "selecionar" —
   pede para conferir. A diferença importa: a tabela de frete da reputação
   vermelha custa o dobro da verde, e trocar Clássico por Premium move 5 pontos
   de comissão. Quem não repara nisso precifica errado sem saber.

   O destaque some no primeiro toque e não volta: passa a ser ruído depois que
   a pessoa já sabe que aquilo está ali. */
const CHAVE_CONFERIU = 'pdrop.ml.conferiu';

function ctxDestaque(){
  let ok = false;
  try{ ok = localStorage.getItem(CHAVE_CONFERIU) === '1'; }catch(e){}
  document.querySelectorAll('.ctx-bloco').forEach(b => b.classList.toggle('pedeconfere', !ok));
  const al = $('ctxAlerta');
  if(al) al.classList.toggle('some', ok);
}

function ctxConferido(){
  try{ localStorage.setItem(CHAVE_CONFERIU, '1'); }catch(e){}
  document.querySelectorAll('.ctx-bloco.pedeconfere').forEach(b => b.classList.remove('pedeconfere'));
  const al = $('ctxAlerta');
  if(al && !al.classList.contains('some')){
    al.classList.add('feito');
    al.querySelector('.ctx-al-tx').innerHTML = '<b>Conferido</b><i>o preço usa estas escolhas</i>';
    setTimeout(() => al.classList.add('some'), 2200);
  }
}

/* O que as escolhas acima estão produzindo agora. Fica ao lado delas porque é
   a consequência do que foi marcado — antes só dava para saber abrindo os
   parâmetros. */
function ctxResumo(){
  const el = $('ctxAgora');
  if(!el) return;
  const pct = v => (v * 100).toFixed(1).replace('.0', '').replace('.', ',') + '%';
  const itens = [
    ['Comissão', pct(pml.tipoAnuncio === 'premium' ? pml.comissaoPremium : pml.comissaoClassico)],
    ['Frete', pml.freteAutomatico ? 'tabela oficial' : ML.brl(pml.freteManual) + ' fixo'],
    ['Volumétrico', pml.usarPesoVolumetrico ? 'ligado ÷' + (pml.divisorVolumetrico || 6000) : 'desligado'],
  ];
  if(pml.taxaDevolucao) itens.push(['Devolução', pct(pml.taxaDevolucao)]);
  if(pml.aliquotaImposto) itens.push(['Imposto', pct(pml.aliquotaImposto)]);
  if(pml.rebate) itens.push(['Rebate', ML.brl(pml.rebate)]);

  el.innerHTML = `<div class="ctx-lbl">Está valendo</div>
    <div class="ctx-agora-l">${itens.map(([t, v]) =>
      `<span><i>${esc(t)}</i><b>${esc(v)}</b></span>`).join('')}</div>`;
}
function setReputacao(id, btn){
  ctxConferido();
  pml.reputacao = id;
  guardarParamsML();
  document.querySelectorAll('[data-rep]').forEach(b => b.classList.toggle('active', b === btn));
  montarContexto();
  recalcularTudo();
}
function setAnuncio(tipo, btn){
  ctxConferido();
  pml.tipoAnuncio = tipo;
  guardarParamsML();
  document.querySelectorAll('[data-anuncio]').forEach(b => b.classList.toggle('active', b === btn));
  ctxResumo();          // a comissão exibida muda com o tipo de anúncio
  recalcularTudo();
}
function recalcularTudo(){
  if(modo === 'a') calcA(); else calcB();
  if(mlLinhas.length && !$('mlStep3').classList.contains('hide')) mlProcessar();
}

/* ══ POP-UPS DO PRECIFICADOR ═══════════════════════════════════════════════
   A tela do precificador é a planilha em massa. A calculadora de um produto e
   os custos oficiais viram pop-up: são consultas pontuais, não passos do
   trabalho — antes dividiam a tela em três abas de peso igual.             */
function abrirPop(pop, scrim, aoAbrir){
  $(scrim).classList.add('open');
  $(pop).classList.add('open');
  document.body.classList.add('sem-rolagem');
  if(aoAbrir) aoAbrir();
}
function fecharPop(pop, scrim){
  $(scrim).classList.remove('open');
  $(pop).classList.remove('open');
  if(!document.querySelector('.pop.open, .drawer.open'))
    document.body.classList.remove('sem-rolagem');
}

/* abre o manual já na seção que interessa a quem estava naquela tela */
function irManual(secao){
  ir('manual');
  setTimeout(() => {
    const alvo = document.getElementById(secao);
    if(alvo) alvo.scrollIntoView({behavior: reduzido ? 'instant' : 'smooth', block:'start'});
  }, 260);
}

function abrirCalc(){ abrirPop('popCalc', 'scrimCalc', () => recalcularTudo()); }
function fecharCalc(){ fecharPop('popCalc', 'scrimCalc'); }

/* ── janela de progresso do cálculo ──────────────────────────────────────────
   Consultar a categoria de 500 produtos leva dezenas de segundos, de 20 em 20.
   Sem mostrar o que está acontecendo, a tela fica parada e parece travada.  */
const PROG_ETAPAS = ['Lendo a planilha', 'Consultando o Mercado Livre', 'Calculando os preços', 'Montando a tabela'];
let progEtapaAtual = 0;

function progAbrir(){
  progEtapaAtual = 0;
  $('progBarra').style.width = '0%';
  $('progNumero').textContent = '';
  progPassos();
  abrirPop('popProg', 'scrimProg');
}
function progFechar(){ fecharPop('popProg', 'scrimProg'); }

/* i = índice da etapa; pct e detalhe são opcionais (a consulta ao ML os usa) */
function progEtapa(i, pct, detalhe){
  progEtapaAtual = i;
  $('progEtapa').textContent = detalhe || PROG_ETAPAS[i] + '…';
  /* cada etapa ocupa uma fatia da barra; dentro dela, o avanço é proporcional */
  const fatia = 100 / PROG_ETAPAS.length;
  const dentro = pct == null ? 0 : Math.max(0, Math.min(1, pct));
  $('progBarra').style.width = (i * fatia + dentro * fatia).toFixed(1) + '%';
  progPassos();
}
function progNumero(txt){ $('progNumero').textContent = txt || ''; }

function progPassos(){
  $('progPassos').innerHTML = PROG_ETAPAS.map((nome, i) => {
    const estado = i < progEtapaAtual ? 'feito' : (i === progEtapaAtual ? 'agora' : '');
    const marca = i < progEtapaAtual
      ? '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>' : '';
    return `<div class="prog-passo ${estado}"><span class="prog-bolinha">${marca}</span>${esc(nome)}</div>`;
  }).join('');
}

/* deixa o navegador pintar antes de seguir: sem isso a barra só apareceria
   no fim, quando o trabalho pesado já travou a thread */
const respirar = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

function abrirCustos(){
  abrirPop('popCustos', 'scrimCustos', () => {
    taxasProntas = false;
    montarTaxas();
    apiCarregar();
  });
}
function fecharCustos(){ fecharPop('popCustos', 'scrimCustos'); }

/* Escape fecha o que estiver aberto */
addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  if($('popCalc').classList.contains('open')) fecharCalc();
  if($('popCustos').classList.contains('open')) fecharCustos();
  if($('popRevisar').classList.contains('open')) revisarFechar();
});

/* ── editor visual das faixas de custo fixo ─────────────────────────────── */
let faixasEditor = [];

const OFICIAIS = () => ([
  {ate: 12.49, percentual: 0.5},
  {ate: 29,    valor: 6.25},
  {ate: 50,    valor: 6.50},
  {ate: 78.99, valor: 6.75},
  {ate: 1e9,   valor: 0},
]);

const numBR = v => {
  if(v == null || v === '') return '';
  const n = Number(v);
  return (Number.isInteger(n) ? String(n) : n.toFixed(2)).replace('.', ',');
};

function renderFaixas(){
  const corpo = $('faixasCorpo');
  corpo.innerHTML = faixasEditor.map((f, i) => {
    const de = i === 0 ? 0 : (Number(faixasEditor[i-1].ate) || 0) + 0.01;
    const ultima = i === faixasEditor.length - 1;
    const ehPct = f.percentual != null;
    const valor = ehPct ? numBR(+(f.percentual * 100).toFixed(4)) : numBR(f.valor);
    return `<div class="fx-linha">
      <span class="fx-de" data-de="${i}">${ML.brl(de)}</span>
      ${ultima
        ? '<span class="fx-inf">em diante</span>'
        : `<div class="fx-campo"><span class="fx-pre">R$</span>
             <input type="text" inputmode="decimal" value="${valor === '' ? '' : numBR(f.ate)}"
                    data-ate="${i}" oninput="mudouAte(${i}, this.value)" onblur="normalizarFaixas()"/></div>`}
      <div class="fx-campo">
        <span class="fx-pre">${ehPct ? '%' : 'R$'}</span>
        <input type="text" inputmode="decimal" value="${valor}"
               oninput="mudouValor(${i}, this.value)" onblur="normalizarFaixas()"/>
        <div class="fx-tipo">
          <button type="button" class="${ehPct ? '' : 'on'}" onclick="mudouTipo(${i}, false)" title="valor em reais">R$</button>
          <button type="button" class="${ehPct ? 'on' : ''}" onclick="mudouTipo(${i}, true)" title="porcentagem do preço">%</button>
        </div>
      </div>
      <button type="button" class="fx-del" onclick="delFaixa(${i})"
              ${faixasEditor.length <= 1 ? 'disabled' : ''} title="remover faixa">
        <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>`;
  }).join('');
  atualizarExemplo();
}

/* Atualiza só os rótulos "Preço de" — sem redesenhar, para não perder o foco */
function atualizarDes(){
  faixasEditor.forEach((f, i) => {
    const el = document.querySelector(`[data-de="${i}"]`);
    if(!el) return;
    const de = i === 0 ? 0 : (Number(faixasEditor[i-1].ate) || 0) + 0.01;
    el.textContent = ML.brl(de);
  });
}

function mudouAte(i, txt){
  const v = ML.parseNumero(txt);
  faixasEditor[i].ate = isNaN(v) ? 0 : v;
  atualizarDes();
  atualizarExemplo();
}
function mudouValor(i, txt){
  const v = ML.parseNumero(txt);
  const f = faixasEditor[i];
  if(f.percentual != null) f.percentual = isNaN(v) ? 0 : v / 100;
  else f.valor = isNaN(v) ? 0 : v;
  atualizarExemplo();
}
function mudouTipo(i, pct){
  const f = faixasEditor[i];
  if(pct && f.percentual == null){
    f.percentual = 0.5; delete f.valor;
  }else if(!pct && f.percentual != null){
    f.valor = 6.25; delete f.percentual;
  }
  renderFaixas();
}
function addFaixa(){
  const ultima = faixasEditor[faixasEditor.length - 1];
  const anterior = faixasEditor.length > 1 ? faixasEditor[faixasEditor.length - 2].ate : 0;
  faixasEditor.splice(faixasEditor.length - 1, 0,
    {ate: +(Number(anterior) + 10).toFixed(2), valor: 0});
  if(ultima) ultima.ate = 1e9;
  renderFaixas();
}
function delFaixa(i){
  if(faixasEditor.length <= 1) return;
  faixasEditor.splice(i, 1);
  faixasEditor[faixasEditor.length - 1].ate = 1e9;
  renderFaixas();
}
function faixasOficiais(){
  faixasEditor = OFICIAIS();
  renderFaixas();
}
function normalizarFaixas(){
  faixasEditor.sort((a, b) => (Number(a.ate) || 0) - (Number(b.ate) || 0));
  faixasEditor[faixasEditor.length - 1].ate = 1e9;
  renderFaixas();
}

/* Mostra na hora quanto seria cobrado em preços de exemplo */
function atualizarExemplo(){
  const el = $('fxExemplo');
  if(!el) return;
  const p = {taxaFixa: faixasEditor};
  const exemplos = [9.90, 19.90, 39.90, 69.90, 149.90];
  el.innerHTML = '<div class="fx-ex-t">Como fica na prática</div>' +
    '<div class="fx-ex-linhas">' + exemplos.map(v => {
      const c = ML.taxaFixaDe(v, p);
      return `<div class="fx-ex"><span>${ML.brl(v)}</span>
        <b style="color:${c ? 'var(--red)' : 'var(--green-dk)'}">${c ? '− ' + ML.brl(c) : 'sem custo'}</b></div>`;
    }).join('') + '</div>';
}

/* ── drawer de parâmetros do ML ── */
function abrirParamsML(){
  const set = (id, v) => { const el = $(id); if(el) el.value = v; };
  set('m_comissaoClassico', (pml.comissaoClassico * 100).toFixed(2).replace(/\.?0+$/, ''));
  set('m_comissaoPremium',  (pml.comissaoPremium  * 100).toFixed(2).replace(/\.?0+$/, ''));
  set('m_reducaoDe', pml.reducaoDe);
  set('m_reducaoAte', pml.reducaoAte);
  set('m_reducaoPP', +(pml.reducaoPP || 0));
  faixasEditor = (pml.taxaFixa || []).map(f => Object.assign({}, f));
  if(!faixasEditor.length) faixasEditor = OFICIAIS();
  renderFaixas();
  $('m_freteAutomatico').checked = !!pml.freteAutomatico;
  $('m_freteRapidoAbaixo79').checked = !!pml.freteRapidoAbaixo79;
  $('m_usarPesoVolumetrico').checked = !!pml.usarPesoVolumetrico;
  set('m_divisorVolumetrico', pml.divisorVolumetrico);
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
  // faixas vindas do editor visual
  const faixas = faixasEditor
    .map(f => f.percentual != null
      ? {ate: Number(f.ate) || 0, percentual: Number(f.percentual) || 0}
      : {ate: Number(f.ate) || 0, valor: Number(f.valor) || 0})
    .sort((a, b) => a.ate - b.ate);

  Object.assign(pml, {
    comissaoClassico: n('m_comissaoClassico') / 100,
    comissaoPremium:  n('m_comissaoPremium')  / 100,
    reducaoDe:  n('m_reducaoDe'),
    reducaoAte: n('m_reducaoAte'),
    reducaoPP:  n('m_reducaoPP'),
    taxaFixa: faixas.length ? faixas : ML.PADRAO.taxaFixa,
    freteAutomatico: $('m_freteAutomatico').checked,
    freteRapidoAbaixo79: $('m_freteRapidoAbaixo79').checked,
    usarPesoVolumetrico: $('m_usarPesoVolumetrico').checked,
    divisorVolumetrico: n('m_divisorVolumetrico') || 6000,
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
/* Consulta a tarifa real na API do Mercado Livre e preenche os campos.
   Funciona assim que a aplicação estiver conectada (credenciais na Vercel). */
async function buscarTarifaAPI(){
  const el = $('apiResposta');
  const preco = ML.parseNumero($('apiPreco').value);
  if(isNaN(preco) || preco <= 0)
    return el.innerHTML = '<div class="api-msg ruim">Informe um preço de referência.</div>';

  el.innerHTML = '<div class="api-msg">Consultando o Mercado Livre…</div>';
  try{
    const q = new URLSearchParams({preco: String(preco)});
    const cat = ($('apiCategoria').value || '').trim();
    if(cat) q.set('categoria', cat);

    const r = await fetch('/api/ml-tarifa?' + q);
    const d = await lerJson(r);

    if(!r.ok || d.erro){
      const faltaSecret = (d.faltando || []).includes('ML_CLIENT_SECRET');
      return el.innerHTML = `<div class="api-msg ruim">
        ${esc(d.erro || 'Não consegui consultar.')}
        ${faltaSecret ? '<br/><b>Como ligar:</b> adicione ML_CLIENT_SECRET nas variáveis de ambiente do projeto na Vercel e refaça o deploy.' : ''}
      </div>`;
    }

    const c = d.tarifas.classico, p = d.tarifas.premium;
    if(c && c.percentual != null) $('m_comissaoClassico').value = c.percentual;
    if(p && p.percentual != null) $('m_comissaoPremium').value  = p.percentual;

    const linha = (nome, t) => t ? `<div class="api-linha"><span>${nome}</span>
      <b>${String(t.percentual).replace('.', ',')}%</b>
      <i>${ML.brl(t.valor)}${t.custoFixo ? ' + fixo ' + ML.brl(t.custoFixo) : ''}</i></div>` : '';
    el.innerHTML = `<div class="api-msg bom">
      Tarifas para ${ML.brl(d.preco)}${d.categoria ? ' · ' + esc(d.categoria) : ''}:
      ${linha('Clássico', c)}${linha('Premium', p)}
      <small>Campos acima preenchidos — clique em Salvar e recalcular.</small>
    </div>`;
  }catch(e){
    el.innerHTML = '<div class="api-msg ruim">Falha na consulta: ' + esc(e.message) + '</div>';
  }
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

function blocoResultado(r, alvo, p){
  p = p || pml;
  const pct = v => (v * 100).toFixed(1).replace('.', ',') + '%';
  const linhas = [
    ['Preço de venda',                     ML.brl(r.preco),          'var(--ink)',       ''],
    ['Comissão ' + (p.tipoAnuncio === 'premium' ? 'Premium' : 'Clássico') + ' (' + pct(r.comissaoPct) + ')',
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
        <span class="ex-v" style="color:${bom ? 'var(--green-dk)' : 'var(--red)'}">${(r.margemLiquida*100).toFixed(2).replace('.', ',')}%</span>
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

/* Os "campos amarelos" da planilha: quando preenchidos, valem só para este
   cálculo e sobrepõem os parâmetros salvos. Vazio = usa o parâmetro.     */
function paramsDoProduto(){
  const p = Object.assign({}, pml);
  const n = id => ML.parseNumero($(id).value);

  const frete = n('ajFrete');
  if(!isNaN(frete) && frete >= 0){ p.freteAutomatico = false; p.freteManual = frete; }

  const rebate = n('ajRebate');
  if(!isNaN(rebate)) p.rebate = rebate;

  const imposto = n('ajImposto');
  if(!isNaN(imposto)) p.aliquotaImposto = imposto / 100;

  const devolucao = n('ajDevolucao');
  if(!isNaN(devolucao)) p.taxaDevolucao = devolucao / 100;

  const embalagem = n('ajEmbalagem');
  if(!isNaN(embalagem)) p.embalagem = embalagem;

  return p;
}
/* dimensões da embalagem informadas na tela */
function dimsDoProduto(){
  const n = id => ML.parseNumero($(id).value);
  const a = n('ajAltura'), l = n('ajLargura'), c = n('ajComprimento');
  if(isNaN(a) || isNaN(l) || isNaN(c) || a <= 0 || l <= 0 || c <= 0) return null;
  return {altura: a, largura: l, comprimento: c};
}
/* mostra o peso volumétrico e qual dos dois o frete vai usar */
function avisoVolumetrico(pesoReal){
  const el = $('ajVolumetrico');
  if(!el) return;
  const d = dimsDoProduto();
  if(!d) return el.textContent = 'informe as três medidas';
  const r = ML.pesoCobravel(pesoReal, d, pml);
  el.innerHTML = `volumétrico <b>${String(r.volumetrico).replace('.', ',')} kg</b>`
    + ` · cobra pelo <b>${r.usou}</b> (${String(r.cobravel).replace('.', ',')} kg)`;
}

function limparAjustes(){
  ['ajFrete','ajRebate','ajImposto','ajDevolucao','ajEmbalagem',
   'ajAltura','ajLargura','ajComprimento'].forEach(id => $(id).value = '');
  recalc();
}
function recalc(){ if(modo === 'a') calcA(); else calcB(); }

/* mostra de onde veio o frete quando o campo está vazio */
function avisoFrete(peso, p){
  const el = $('ajFreteInfo');
  if(!el) return;
  if($('ajFrete').value.trim() !== ''){ el.textContent = 'valor informado'; return; }
  const kg = Number(peso) || Number(pml.pesoPadrao) || 0;
  el.textContent = (pml.freteAutomatico && kg)
    ? 'tabela oficial: ' + ML.brl(ML.freteDe(p || 100, kg, pml))
    : 'sem peso: ' + ML.brl(pml.freteManual);
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

  const p = paramsDoProduto();
  const kg = isNaN(peso) ? 0 : peso;
  const dims = dimsDoProduto();
  avisoVolumetrico(kg);
  avisoFrete(kg);
  const alvo = margem / 100;
  const preco = ML.precoPara(custo, alvo, kg, p, dims);
  if(preco == null){
    return el.innerHTML = '<div class="aviso">Com essas taxas, essa margem não é alcançável. Reduza a margem ou revise os parâmetros.</div>';
  }
  avisoFrete(kg, preco);
  el.innerHTML = blocoResultado(ML.analisar(preco, custo, kg, p, dims), alvo, p);
}

function calcB(){
  const el = $('resCalc');
  const preco = ML.parseNumero($('pB').value);
  const custo = ML.parseNumero($('cB').value);
  const peso  = ML.parseNumero($('pesoB').value);
  if(custo < 0 || peso < 0) return el.innerHTML = '<div class="aviso">Custo e peso não podem ser negativos.</div>';
  if(isNaN(preco) || preco <= 0){ el.innerHTML = ''; return; }
  const p = paramsDoProduto();
  const kg = isNaN(peso) ? 0 : peso;
  const dims = dimsDoProduto();
  avisoVolumetrico(kg);
  avisoFrete(kg, preco);
  el.innerHTML = blocoResultado(
    ML.analisar(preco, isNaN(custo) ? 0 : custo, kg, p, dims), null, p);
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
async function mlCarregar(f){
  if(!f) return;
  if(!await garantirXLSX()) return;   /* baixa o SheetJS só agora, na hora de ler o arquivo */
  /* Arquivo novo começa do zero: correções e filtros são guardados por número
     de linha e, sobrando, cairiam sobre produtos diferentes. */
  mlEdicoes.clear();
  mlConferencia = null; mlFiltro = null; mlBusca = ''; mlPagina = 0;
  mlCategorias = null; mlUsandoCategoria = false;
  mlPesoSuspeito = false; mlPesoConfirmadoKg = false;
  mlDimSuspeita = false; mlDimConfirmada = false; mlDimInfo = null; mlDimFator = 1;
  $('mlPesoUnidade').value = 'kg';
  mlNome = f.name;
  const rd = new FileReader();
  rd.onerror = () => alert('Não consegui ler esse arquivo. Verifique se ele ainda existe e tente de novo.');
  rd.onload = ev => {
    try{
      mlBytes = ev.target.result;
      mlWb = XLSX.read(mlBytes, {type:'array'});

      /* Cada depósito manda um formato: a aba de produtos pode não ser a
         primeira, e o cabeçalho pode não estar na primeira linha. Depois de
         achar os dois, fatiamos a matriz para que mlAoa[0] volte a ser o
         cabeçalho — assim o resto do app continua igual. */
      const abas = mlWb.SheetNames.map((nome, i) => ({
        nome,
        aoa: XLSX.utils.sheet_to_json(XU.normalizarRef(mlWb.Sheets[nome]), {header:1, defval:'', raw:false}),
        oculta: !!(mlWb.Workbook && mlWb.Workbook.Sheets && mlWb.Workbook.Sheets[i]
                   && mlWb.Workbook.Sheets[i].Hidden),
      }));
      const escolha = ML.escolherAba(abas);
      mlAbaNome = escolha.nome || mlWb.SheetNames[0];
      mlAbas = escolha;

      const bruto = (abas.find(a => a.nome === mlAbaNome) || abas[0]).aoa;
      const cab = ML.detectarCabecalho(bruto);
      mlCabInfo = cab;
      mlLinhaCab = cab.linha;

      const podado = ML.podarLinhasVazias(bruto.slice(mlLinhaCab));
      mlAoa = podado.aoa;
      mlLinhaCab += podado.podadas;   // o export escreve por posição física
      if(mlAoa.length < 2) throw new Error('A planilha não tem linhas de produto.');
      mlCabecalho = mlAoa[0].map(String);

      /* Sem rótulos aproveitáveis não há o que mapear — é o caso de planilha
         montada na vertical (um produto por vez, rótulo à esquerda), que não
         serve para precificar em lote. Melhor dizer isso do que mostrar uma
         lista de "Coluna A, Coluna B" e deixar o usuário adivinhando. */
      if(mlCabecalho.filter(h => h.trim()).length < 3)
        throw new Error('não encontrei uma tabela de produtos aqui.\n\n'
          + `A aba "${mlAbaNome}" não tem uma linha de cabeçalho com nomes de coluna `
          + '(como Descrição, Custo, Peso).\n\nEste app precisa de uma planilha em lista: '
          + 'uma linha por produto, com os nomes das colunas no topo.');

      const opcoes = mlCabecalho.map((h,i) =>
        `<option value="${i}">${esc(h || 'Coluna ' + PE.indexToCol(i))} (${PE.indexToCol(i)})</option>`).join('');
      $('mlCusto').innerHTML = '<option value="-1">— Selecione —</option>' + opcoes;
      $('mlPeso').innerHTML  = '<option value="-1">Sem peso — usar frete manual</option>' + opcoes;
      $('mlPreco').innerHTML = '<option value="-1">Nova coluna no final</option>' + opcoes;
      $('mlComissao').innerHTML = '<option value="-1">Usar a tarifa do tipo de anúncio</option>' + opcoes;
      $('mlAltura').innerHTML      = '<option value="-1">Sem altura</option>' + opcoes;
      $('mlLargura').innerHTML     = '<option value="-1">Sem largura</option>' + opcoes;
      $('mlComprimento').innerHTML = '<option value="-1">Sem comprimento</option>' + opcoes;
      $('mlTitulo').innerHTML      = '<option value="-1">— Selecione —</option>' + opcoes;

      // auto-seleção: só serve coluna que realmente tenha número > 0
      const temValores = i => i >= 0 && mlAoa.slice(1).some(l => {
        const n = ML.parseNumero(l[i]);
        return !isNaN(n) && n > 0;
      });
      /* Comparamos sempre com o cabeçalho normalizado (sem acento, sem caixa,
         sem espaço sobrando), senão "Custo " e "PREÇO" passam despercebidos.
         O segundo derivado tira o que está entre parênteses, para "Peso (kg)"
         casar com uma busca por "peso" exato. */
      const cabNorm = mlCabecalho.map(ML.normalizarTexto);
      const cabLimpo = mlCabecalho.map(ML.semParenteses);
      const acha = re => {
        const i = cabNorm.findIndex(h => re.test(h));
        return i >= 0 ? i : cabLimpo.findIndex(h => re.test(h));
      };
      /* "Preço de custo" do Bling costuma vir zerada; nessa planilha o custo
         real mora na coluna "Preço". Preferimos uma coluna de custo com
         valores e só então caímos no "Preço". */
      const iCusto = [acha(/custo/), acha(/^preco$/), acha(/valor.*(custo|compra)/), acha(/^cost$/)].find(temValores);
      const iPeso  = [acha(/peso\s*bruto/), acha(/peso\s*liquido/), acha(/peso/), acha(/^weight$/)].find(temValores);
      const iPreco = acha(/^preco$/);
      if(iCusto !== undefined) $('mlCusto').value = iCusto;
      if(iPeso  !== undefined) $('mlPeso').value  = iPeso;
      const iAlt  = [acha(/altura/), acha(/^height$/)].find(temValores);
      const iLarg = [acha(/largura/), acha(/^width$/)].find(temValores);
      const iComp = [acha(/profundidade|comprimento/), acha(/^(length|depth)$/)].find(temValores);
      if(iAlt  !== undefined) $('mlAltura').value      = iAlt;
      if(iLarg !== undefined) $('mlLargura').value     = iLarg;
      if(iComp !== undefined) $('mlComprimento').value = iComp;
      if(iPreco >= 0) $('mlPreco').value = iPreco;

      /* título: serve a coluna que tem texto de verdade, não código nem número */
      const temTexto = i => i >= 0 && mlAoa.slice(1).some(l => {
        const v = String(l[i] || '').trim();
        return v.length >= 12 && /[a-zA-ZÀ-ÿ]{3}/.test(v);
      });
      const iTit = [acha(/descricao\s*curta/), acha(/^titulo$/), acha(/^nome$/),
                    acha(/nome do produto/), acha(/descricao/), acha(/^title$/),
                    acha(/produto/)].find(temTexto);

      /* Tarifa por categoria vinda na planilha: até agora era o único campo
         100% manual. Percentual não passa de 50% — é o mesmo teto que o motor
         usa para marcar tarifa suspeita. */
      const temPercentual = i => {
        if(i < 0) return false;
        let n = 0;
        for(const l of mlAoa.slice(1)){
          const v = ML.parseNumero(l[i]);
          if(isNaN(v) || v <= 0) continue;
          if(v > 50) return false;
          n++;
        }
        return n >= 5;
      };
      const iCom = [acha(/tarifa/), acha(/comissao/), acha(/taxa\s*(de\s*)?venda/)].find(temPercentual);
      if(iCom !== undefined) $('mlComissao').value = iCom;
      if(iTit !== undefined) $('mlTitulo').value = iTit;
      mlToggleCategoria();

      $('mlFName').textContent = f.name;
      /* quando a aba ou a linha do cabeçalho não são as primeiras, dizemos de
         onde os dados vieram — senão o usuário não tem como conferir */
      $('mlFInfo').textContent = `${mlAoa.length - 1} produtos · ${mlCabecalho.length} colunas · aba "${mlAbaNome}"`
        + (mlWb.SheetNames.length > 1 ? ` (de ${mlWb.SheetNames.length})` : '')
        + (mlLinhaCab > 0 ? ` · cabeçalho na linha ${mlLinhaCab + 1}` : '');
      mlValidaCol();
      mlPasso(2);
      /* Achou algo para conferir? Abre já. O alerta na coluna é discreto e fica
         acima do botão de calcular — quem não rolava a tela até ele calculava
         com o peso errado sem saber. */
      if(mlPesoSuspeito || mlDimSuspeita) revisarAbrir();
    }catch(err){ alert('Não consegui ler esse arquivo: ' + err.message); }
  };
  rd.readAsArrayBuffer(f);
}

/* "Peso (kg)" com 2000 na célula é grama, não duas toneladas. Detectamos o
   padrão da coluna inteira e oferecemos a troca — sem converter por conta
   própria, porque um catálogo de itens pesados de verdade existe. */
function mlChecarUnidadePeso(ip){
  const caixa = $('mlUniAlerta');
  if(ip < 0){ mlPesoSuspeito = false; mostrar('mlUniAlerta', false); return; }

  const r = ML.detectarEscalaPeso(mlAoa.slice(1).map(l => l[ip]));
  const jaResolvido = $('mlPesoUnidade').value !== 'kg';
  /* enquanto ninguém responder, o cálculo fica bloqueado: deixar passar produz
     frete de centenas de reais nessas linhas, e o usuário só descobre olhando
     a coluna Situação uma a uma */
  mlPesoSuspeito = r.suspeita && !jaResolvido && !mlPesoConfirmadoKg;
  if(!mlPesoSuspeito){ mostrar('mlUniAlerta', false); return; }

  mlPesoInfo = r;
  const n = r.suspeitos;
  caixa.innerHTML = `<b>${n} peso${n === 1 ? '' : 's'} ${n === 1 ? 'parece' : 'parecem'} estar em gramas.</b>
    Precisa de uma conferência antes de calcular o frete.
    <div class="uni-btns"><button type="button" class="sim" onclick="revisarAbrir()">Conferir agora</button></div>`;
  mostrar('mlUniAlerta', true);
}

/* Medidas em milímetros numa coluna que diz cm inflam o volumétrico 1000x e o
   frete até 12x — sem nenhum aviso, porque peso_alto olha a balança e o frete
   inflado entra no que markup_alto considera "explicado". */
function mlChecarEscalaDimensao(iA, iL, iC, ip){
  if(iA < 0 || iL < 0 || iC < 0){ mlDimSuspeita = false; mlDimInfo = null; return; }
  const linhas = mlAoa.slice(1);
  const r = ML.detectarEscalaDimensao(
    linhas.map(l => l[iA]), linhas.map(l => l[iL]), linhas.map(l => l[iC]),
    ip >= 0 ? linhas.map(l => l[ip]) : [], pml);
  mlDimInfo = r;
  mlDimSuspeita = r.suspeita && !mlDimConfirmada && mlDimFator === 1;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TELA DE REVISÃO — como o app leu a planilha

   Cada depósito manda um formato diferente. O app detecta o que consegue, mas
   quem decide é o usuário: aqui ele vê o que foi encontrado, com os números da
   planilha dele à vista, e aprova ou ajusta. Uma tela só — quatro pop-ups em
   sequência ensinariam a clicar sem ler.
   ═══════════════════════════════════════════════════════════════════════════ */
const numBr = v => String(v).replace('.', ',');

/* Peso em gramas numa coluna que diz "kg". */
function revisarSecaoPeso(){
  const r = mlPesoInfo;
  if(!r || !mlPesoSuspeito) return '';
  const n = r.suspeitos, outros = r.n - n;
  const linhasEx = r.exemplosGrandes.map(e =>
    `<tr><td>${numBr(e.de)}</td><td class="seta">→</td><td><b>${numBr(e.para)} kg</b></td></tr>`).join('');

  return `
    <div class="pz-alerta">
      <div class="pz-num">${n}</div>
      <div><b>peso${n === 1 ? '' : 's'} que ${n === 1 ? 'parece' : 'parecem'} estar em gramas</b>
        <div class="pz-sub">de ${r.n} produtos com peso preenchido</div></div>
    </div>

    <p class="pz-p"><b>Como o app identifica.</b> Duas situações: peso <b>redondo e acima
    de ${ML.PISO_GRAMAS}</b> — como <b>${numBr(r.exemplosGrandes.length ? r.exemplosGrandes[0].de : 80)}</b> —,
    porque quilo de dropshipping tem casa decimal (0,9 · 2,575) e grama vem redondo;
    e <b>qualquer peso acima de ${ML.LIMITE_ML} kg</b>, com decimal ou sem, já que o
    Mercado Livre não entrega nessa faixa e nenhum produto real chega lá.</p>

    <p class="pz-p"><b>Por que importa.</b> Lido como quilo, o produto cai nas últimas faixas
    da tabela e o frete sai em dezenas ou centenas de reais. Esse valor entra no preço
    final, que fica irreal — e o erro não aparece em lugar nenhum, a não ser olhando
    produto por produto.</p>

    <div class="pz-tab">
      <div class="pz-tab-t">Como ${n === 1 ? 'esse produto ficaria' : 'esses produtos ficariam'} depois da correção</div>
      <table><thead><tr><th>na planilha</th><th></th><th>vira</th></tr></thead>
        <tbody>${linhasEx}${n > r.exemplosGrandes.length
          ? `<tr class="pz-mais"><td colspan="3">e mais ${n - r.exemplosGrandes.length} produto${n - r.exemplosGrandes.length === 1 ? '' : 's'}</td></tr>` : ''}</tbody></table>
    </div>

    ${outros > 0 ? `<div class="pz-ok">
      <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>
      <div><b>Os outros ${outros} produtos não serão tocados.</b>
        <div class="pz-sub">Já estão em quilos${r.exemplosNormais.length
          ? ` (${r.exemplosNormais.map(numBr).join(' · ')} kg)` : ''} e continuam como estão.</div></div>
    </div>` : `<div class="pz-ok aviso">
      <div><b>Toda a coluna está nessa escala.</b>
        <div class="pz-sub">Todos os pesos serão divididos por mil.</div></div>
    </div>`}`;
}

/* Medidas em milimetros ou metros numa coluna que diz cm. */
function revisarSecaoDimensao(){
  const r = mlDimInfo;
  if(!r || !mlDimSuspeita) return '';
  const emMm = r.escala === 'mm';
  const ex = r.exemplos.map(e =>
    `<tr><td>${numBr(e.de.altura)} × ${numBr(e.de.largura)} × ${numBr(e.de.comprimento)}</td>
       <td class="seta">→</td>
       <td><b>${numBr(e.para.altura)} × ${numBr(e.para.largura)} × ${numBr(e.para.comprimento)} cm</b></td></tr>`).join('');

  return `
    <div class="pz-alerta">
      <div class="pz-num">${r.escala}</div>
      <div><b>as medidas parecem estar em ${emMm ? 'milímetros' : 'metros'}, não em centímetros</b>
        <div class="pz-sub">medida típica da planilha: ${numBr(r.medianaLado)} — em centímetros isso seria
          ${emMm ? 'uma caixa maior que uma geladeira' : 'menor que uma moeda'}</div></div>
    </div>

    <p class="pz-p"><b>Por que importa.</b> O Mercado Livre cobra o frete pelo maior valor
    entre o peso da balança e o <b>peso volumétrico</b> (altura × largura × comprimento ÷ 6000).
    ${emMm ? 'Em milímetros esse cálculo dá mil vezes mais, e o frete estoura'
           : 'Em metros ele quase zera, e o frete sai abaixo do que você vai pagar de verdade'}.</p>

    <div class="pz-tab">
      <div class="pz-tab-t">O que muda no frete de um produto típico</div>
      <table><thead><tr><th>como está</th><th></th><th>corrigido</th></tr></thead><tbody>
        <tr><td>peso volumétrico ${numBr(r.volumetricoAntes)} kg</td><td class="seta">→</td>
            <td><b>${numBr(r.volumetricoDepois)} kg</b></td></tr>
        <tr><td>frete ${ML.brl(r.freteAntes)}</td><td class="seta">→</td>
            <td><b>${ML.brl(r.freteDepois)}</b></td></tr>
      </tbody></table>
    </div>

    <div class="pz-tab">
      <div class="pz-tab-t">Exemplos das medidas da sua planilha</div>
      <table><thead><tr><th>na planilha</th><th></th><th>vira</th></tr></thead><tbody>${ex}</tbody></table>
    </div>

    <div class="pz-ok aviso">
      <div><b>A conversão vale para as três colunas de medida.</b>
        <div class="pz-sub">Altura, largura e comprimento de um produto estão sempre na mesma unidade.</div></div>
    </div>`;
}

function revisarMontar(){
  const partes = [revisarSecaoPeso(), revisarSecaoDimensao()].filter(Boolean);
  const pendencias = partes.length;

  $('revisarCorpo').innerHTML = (pendencias
    ? partes.join('<div style="height:20px"></div>')
    : `<div class="pz-ok"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>
        <div><b>Nada a ajustar.</b>
          <div class="pz-sub">Peso e medidas estão em escalas coerentes.</div></div></div>`)
    + `<p class="pz-p pz-nota">Se os seus produtos são assim mesmo, escolha "Usar como está".
       Depois de corrigir, cada linha alterada fica marcada na tabela e pode ser ajustada na
       mão — o preço recalcula só naquele produto.</p>`;

  $('revisarAcoes').innerHTML = pendencias
    ? `<button class="btn btn-ghost" onclick="revisarIgnorar()">Usar como está</button>
       <button class="btn btn-green" onclick="revisarAplicar()">
         Aplicar ${pendencias === 1 ? 'a correção' : `as ${pendencias} correções`} e calcular</button>`
    : `<button class="btn btn-green" onclick="revisarIgnorar()">Entendi</button>`;
}

function revisarAbrir(){ revisarMontar(); abrirPop('popRevisar', 'scrimRevisar'); }
function revisarFechar(){ fecharPop('popRevisar', 'scrimRevisar'); }

function revisarAplicar(){
  /* toda a coluna em gramas divide tudo; planilha misturada corrige só as
     linhas suspeitas, para não estragar quem já está em quilos */
  if(mlPesoSuspeito)
    $('mlPesoUnidade').value = mlPesoInfo && mlPesoInfo.todosGrandes ? 'g' : 'auto';
  if(mlDimSuspeita && mlDimInfo) mlDimFator = mlDimInfo.fator;
  revisarFechar();
  mlValidaCol();
  mlProcessar();
}

/* Mantém os valores como estão. A confirmação vale só para esta planilha:
   carregar outro arquivo volta a perguntar. */
function revisarIgnorar(){
  mlPesoConfirmadoKg = true;
  mlDimConfirmada = true;
  revisarFechar();
  mlValidaCol();
}

function mlValidaCol(){
  const ic = parseInt($('mlCusto').value), ip = parseInt($('mlPeso').value);
  const id = parseInt($('mlPreco').value), im = parseInt($('mlComissao').value);
  $('mlCustoNota').textContent = ic >= 0 ? `✓ "${mlCabecalho[ic]}" — custo do produto` : '';
  $('mlPesoNota').textContent  = ip >= 0 ? `✓ "${mlCabecalho[ip]}" — frete pela tabela oficial`
                                         : `sem peso: frete manual de ${ML.brl(pml.freteManual)}`;
  mostrar('mlUniBox', ip >= 0);
  mlChecarUnidadePeso(ip);
  mlChecarEscalaDimensao(parseInt($('mlAltura').value), parseInt($('mlLargura').value),
                         parseInt($('mlComprimento').value), ip);
  $('mlPrecoNota').textContent = id >= 0 ? `⚠ vai sobrescrever "${mlCabecalho[id]}"` : '';
  /* como a opção já vem ligada, o aviso precisa acompanhar a coluna de título
     escolhida — inclusive para pedir que ela seja selecionada */
  if($('mlUsarCategoria').checked) mlToggleCategoria();
  /* A escolha manual também precisa ser conferida: escolher "Estoque" ou
     "Largura" como custo gera preços plausíveis e completamente errados. */
  const numeros = i => {
    if(i < 0) return {n:0, total:0};
    let n = 0, total = 0;
    mlAoa.slice(1).forEach(l => {
      const v = ML.parseNumero(l[i]);
      total++;
      if(!isNaN(v) && v > 0) n++;
    });
    return {n, total};
  };
  const q = numeros(ic);
  if(ic >= 0 && q.n === 0){
    $('mlCustoNota').innerHTML = `<b style="color:var(--red)">⚠ "${esc(mlCabecalho[ic])}" não tem nenhum valor maior que zero</b> — o cálculo não vai funcionar`;
  }else if(ic >= 0 && q.n < q.total){
    $('mlCustoNota').innerHTML = `✓ "${esc(mlCabecalho[ic])}" — custo do produto <b style="color:var(--amber)">· ${q.total - q.n} de ${q.total} sem valor</b>`;
  }

  const iA = parseInt($('mlAltura').value), iL = parseInt($('mlLargura').value), iC = parseInt($('mlComprimento').value);
  $('mlDimNota').innerHTML = (iA >= 0 && iL >= 0 && iC >= 0)
    ? `✓ peso volumétrico será calculado: (${esc(mlCabecalho[iA])} × ${esc(mlCabecalho[iL])} × ${esc(mlCabecalho[iC])}) ÷ ${pml.divisorVolumetrico} — o frete usa o maior entre ele e o peso`
    : 'sem as três medidas o frete usa só o peso da balança';
  $('mlComissaoNota').textContent = im >= 0
    ? `✓ "${mlCabecalho[im]}" — tarifa de cada produto`
    : `todos com ${(ML.comissaoPct(pml)*100).toFixed(1).replace('.0','').replace('.', ',')}% (${pml.tipoAnuncio === 'premium' ? 'Premium' : 'Clássico'})`;
  $('mlBtnCalc').disabled = ic < 0;
}


/* ══════════════════════════════════════════════════════════════════════════
   PESQUISA DE MERCADO

   O que a API do Mercado Livre abre sem exigir login de vendedor: o que as
   pessoas estão procurando, em que categoria um produto cai, quanto se paga
   de comissão ali e o que o anúncio vai exigir.
   ══════════════════════════════════════════════════════════════════════════ */
let merAba = 'produto';
const merJaCarregou = {tendencias: false, categorias: false, envios: false, campeoes: false};

/* Leva à pesquisa de mercado já na aba certa. Os cartões da home apontam para
   cada ferramenta direto, em vez de largar a pessoa na primeira aba. */
function irMercado(aba){
  ir('mercado');
  setTimeout(() => {
    const bt = document.querySelector(`[data-mertab="${aba}"]`);
    if(bt) bt.click();
  }, 60);
}

function abaMer(qual, botao){
  merAba = qual;
  document.querySelectorAll('[data-mertab]').forEach(b => b.classList.toggle('active', b === botao));
  ['produto','ficha','campeoes','tendencias','categorias','envios']
    .forEach(k => mostrar('mer-' + k, k === qual));
  if(qual === 'tendencias' && !merJaCarregou.tendencias) merTendencias();
  if(qual === 'categorias' && !merJaCarregou.categorias) merCategorias(null);
  if(qual === 'envios'     && !merJaCarregou.envios)     merEnvios();
  if(qual === 'campeoes'   && !merJaCarregou.campeoes)  cpAtalhos();
}

function mercadoAbrir(){
  if(merAba === 'produto') return;                 // a busca é manual
  if(merAba === 'tendencias' && !merJaCarregou.tendencias) merTendencias();
}

async function merApi(params){
  const r = await fetch('/api/ml-mercado?' + new URLSearchParams(params));
  const d = await lerJson(r);
  if(d.erro) throw new Error(d.erro);
  return d;
}
const merFalha = (alvo, e) =>
  $(alvo).innerHTML = `<div class="api-erro"><div class="api-ok-d">${esc(e.message)}</div></div>`;

/* ── consultar um produto ─────────────────────────────────────────────── */
async function merBuscar(termo){
  const q = termo !== undefined ? termo : $('merQ').value.trim();
  if(termo !== undefined) $('merQ').value = termo;
  if(!q){
    $('merResultado').innerHTML = '<div class="api-erro"><div class="api-ok-d">Digite o título do produto.</div></div>';
    return;
  }
  const preco = ML.parseNumero($('merPreco').value) || 100;
  $('merBtn').disabled = true;
  $('merResultado').innerHTML = '<div class="api-ok-d">Consultando o Mercado Livre…</div>';
  try{
    const d = await merApi({acao:'produto', q, preco});
    if(!d.achou){
      $('merResultado').innerHTML = `<div class="api-erro">
        <div class="api-ok-t">O Mercado Livre não reconheceu esse produto.</div>
        <div class="api-ok-d">Tente um título mais descritivo, como ele apareceria no anúncio.</div></div>`;
    }else{
      const c = d.categoria, t = d.tarifas || {};
      const obr = d.obrigatorios || [];
      $('merResultado').innerHTML = `
        <div class="mer-res">
          <div class="mer-res-cat">
            <span class="mer-lbl">Categoria reconhecida</span>
            <b>${esc(c.nome || '—')}</b>
            <code>${esc(c.id)}</code>
          </div>
          <div class="mer-res-tar">
            <div class="mer-tar"><span>Clássico</span><b>${t.classico != null ? String(t.classico).replace('.', ',') + '%' : '—'}</b></div>
            <div class="mer-tar"><span>Premium</span><b>${t.premium != null ? String(t.premium).replace('.', ',') + '%' : '—'}</b></div>
            <div class="mer-tar-n">comissão nesta categoria, para um produto de ${ML.brl(d.preco)}</div>
          </div>
          <div class="mer-res-obr">
            <span class="mer-lbl">O anúncio vai exigir${d.totalAtributos ? ` (${obr.length} de ${d.totalAtributos} atributos)` : ''}</span>
            ${obr.length
              ? '<div class="mer-tags">' + obr.map(a => `<span class="mer-tag">${esc(a.nome)}</span>`).join('') + '</div>'
              : '<div class="api-ok-d">Nenhum campo obrigatório nesta categoria.</div>'}
          </div>
          ${d.sugestoes && d.sugestoes.length ? `
            <div class="mer-res-sug">
              <span class="mer-lbl">O ML também considerou</span>
              <div class="api-ok-d">${d.sugestoes.map(x => esc(x.nome)).join(' · ')}</div>
            </div>` : ''}
        </div>`;
    }
  }catch(e){ merFalha('merResultado', e); }
  $('merBtn').disabled = false;
}

/* ── ficha do anúncio ─────────────────────────────────────────────────────
   O que a categoria exige, e uma referência de como um produto parecido
   preencheu. A referência é de OUTRO produto — a marca ali é de outra
   empresa. Vai marcada como referência, nunca como preenchimento: copiar
   marca de terceiro para o seu anúncio é problema de marca, não atalho.   */
async function fiBuscar(termo){
  const q = termo !== undefined ? termo : $('fiQ').value.trim();
  if(termo !== undefined) $('fiQ').value = termo;
  if(!q){
    $('fiResultado').innerHTML = '<div class="api-erro"><div class="api-ok-d">Digite o título do produto.</div></div>';
    return;
  }
  $('fiBtn').disabled = true;
  $('fiResultado').innerHTML = '<div class="api-ok-d">Consultando o Mercado Livre…</div>';
  try{
    const d = await merApi({acao:'ficha', q});
    if(!d.achou){
      $('fiResultado').innerHTML = `<div class="api-erro">
        <div class="api-ok-t">O Mercado Livre não reconheceu esse produto.</div>
        <div class="api-ok-d">Tente um título mais descritivo.</div></div>`;
    }else{
      const obr = d.obrigatorios || [], cond = d.condicoesVenda || [], ref = d.referencia;
      const campo = a => `<div class="fi-campo">
          <b>${esc(a.nome)}</b><code>${esc(a.id)}</code>
          ${a.valores && a.valores.length
            ? `<span class="fi-vals">aceita: ${a.valores.map(esc).join(' · ')}${a.valores.length >= 8 ? '…' : ''}</span>`
            : ''}
        </div>`;
      $('fiResultado').innerHTML = `
        <div class="mer-res">
          <div class="mer-res-cat">
            <span class="mer-lbl">Categoria</span>
            <b>${esc(d.categoria.nome || '—')}</b><code>${esc(d.categoria.id)}</code>
          </div>
          <div class="fi-bloco">
            <span class="mer-lbl">Campos obrigatórios${d.totalAtributos ? ` — ${obr.length} de ${d.totalAtributos} atributos` : ''}</span>
            ${obr.length ? obr.map(campo).join('')
                         : '<div class="api-ok-d">Nenhum campo obrigatório nesta categoria.</div>'}
          </div>
          ${cond.length ? `
            <div class="fi-bloco">
              <span class="mer-lbl">Condições de venda que a categoria pede</span>
              ${cond.map(campo).join('')}
            </div>` : ''}
          ${ref ? `
            <div class="fi-bloco fi-ref">
              <span class="mer-lbl">Como um produto parecido preencheu</span>
              <div class="fi-aviso">
                Esta ficha é de <b>outro produto</b> — “${esc(ref.nome || '')}”. Serve para
                ver o formato esperado. <b>Não copie a marca</b>: ela é de outra empresa,
                e anunciar com marca de terceiro dá problema.
              </div>
              <div class="fi-refs">
                ${ref.campos.map(c => `<div class="fi-ref-l ${c.id === 'BRAND' ? 'perigo' : ''}">
                    <i>${esc(c.nome)}</i><b>${esc(c.valor)}</b>
                    ${c.id === 'BRAND' ? '<span class="fi-tag">não copie</span>' : ''}
                  </div>`).join('')}
              </div>
            </div>` : ''}
        </div>`;
    }
  }catch(e){ merFalha('fiResultado', e); }
  $('fiBtn').disabled = false;
}

/* ── mais vendidos ────────────────────────────────────────────────────── */
async function cpAtalhos(){
  merJaCarregou.campeoes = true;
  try{
    const d = await merApi({acao:'categorias'});
    $('cpAtalhos').innerHTML = '<span class="cp-atalho-t">Ou escolha:</span>' +
      (d.filhas || []).slice(0, 10).map(c =>
        `<button class="cp-atalho" onclick="cpBuscar('${esc(c.id)}')">${esc(c.nome)}</button>`).join('');
  }catch(e){ /* atalho é conveniência: sem ele ainda dá para digitar o código */ }
}

async function cpBuscar(id){
  const cat = (id !== undefined ? id : $('cpCat').value).trim().toUpperCase();
  if(id !== undefined) $('cpCat').value = cat;
  if(!cat){
    $('cpResultado').innerHTML = '<div class="api-erro"><div class="api-ok-d">Informe o código da categoria, como MLB1051.</div></div>';
    return;
  }
  $('cpBtn').disabled = true;
  $('cpPill').className = 'pill';
  $('cpPill').textContent = 'consultando…';
  $('cpResultado').innerHTML = '<div class="api-ok-d">Buscando os mais vendidos…</div>';
  try{
    const d = await merApi({acao:'campeoes', id: cat});
    const lista = d.campeoes || [];
    if(!lista.length){
      $('cpPill').className = 'pill';
      $('cpPill').textContent = 'sem dados';
      $('cpResultado').innerHTML = `<div class="api-erro">
        <div class="api-ok-t">Esta categoria não tem ranking publicado.</div>
        <div class="api-ok-d">Nem toda tem. Tente uma categoria mais ampla, ou uma das sugeridas acima.</div></div>`;
    }else{
      $('cpPill').className = 'pill pill-ok';
      $('cpPill').textContent = lista.length + ' PRODUTOS';
      $('cpResultado').innerHTML = '<div class="cp-lista">' + lista.map(c => `
        <div class="cp-item">
          <span class="cp-pos">${c.posicao}</span>
          ${c.foto ? `<img src="${esc(c.foto)}" alt="" loading="lazy"/>` : '<span class="cp-semfoto"></span>'}
          <div class="cp-txt">
            <b>${esc(c.nome || 'sem nome no catálogo')}</b>
            <i>${c.marca ? 'marca ' + esc(c.marca) : ''}${c.marca && c.atributos ? ' · ' : ''}${c.atributos ? c.atributos + ' atributos na ficha' : ''}</i>
          </div>
          ${c.nome ? `<button class="cp-btn" onclick="cpConsultar(this.dataset.n)" data-n="${esc(c.nome)}">ver tarifa</button>` : ''}
        </div>`).join('') + '</div>';
    }
  }catch(e){
    $('cpPill').className = 'pill pill-bad';
    $('cpPill').textContent = 'falhou';
    merFalha('cpResultado', e);
  }
  $('cpBtn').disabled = false;
}
/* do campeão para a consulta de tarifa, sem digitar de novo */
function cpConsultar(nome){
  document.querySelector('[data-mertab="produto"]').click();
  merBuscar(nome);
}

/* ── tendências ───────────────────────────────────────────────────────── */
async function merTendencias(){
  merJaCarregou.tendencias = true;
  $('merTendPill').textContent = 'carregando…';
  try{
    const d = await merApi({acao:'tendencias'});
    $('merTendPill').className = 'pill pill-ok';
    $('merTendPill').textContent = d.termos.length + ' TERMOS';
    $('merTend').innerHTML = d.termos.map(t => `
      <button class="mer-termo" onclick="merVerTermo('${esc(t.termo).replace(/'/g, "\\'")}')">
        <span class="mer-pos">${t.posicao}</span>
        <span class="mer-kw">${esc(t.termo)}</span>
        <svg viewBox="0 0 24 24"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
      </button>`).join('');
  }catch(e){
    $('merTendPill').className = 'pill pill-bad';
    $('merTendPill').textContent = 'FALHOU';
    merFalha('merTend', e);
  }
}
/* clicar num termo leva para a consulta já preenchida */
function merVerTermo(termo){
  document.querySelector('[data-mertab="produto"]').click();
  merBuscar(termo);
}

/* ── categorias ───────────────────────────────────────────────────────── */
async function merCategorias(id){
  merJaCarregou.categorias = true;
  $('merCatPill').textContent = 'carregando…';
  try{
    const d = await merApi(id ? {acao:'categorias', id} : {acao:'categorias'});
    const trilha = (d.caminho || []);
    $('merTrilha').innerHTML =
      `<button class="mer-migalha" onclick="merCategorias(null)">Todas</button>` +
      trilha.map(c => `<span class="mer-seta">/</span>
        <button class="mer-migalha" onclick="merCategorias('${esc(c.id)}')">${esc(c.nome)}</button>`).join('');

    const filhas = d.filhas || [];
    $('merCatPill').className = 'pill pill-ok';
    $('merCatPill').textContent = d.id ? esc(d.id) : filhas.length + ' RAÍZES';

    $('merCats').innerHTML = filhas.length
      ? filhas.map(c => `
          <button class="mer-cat" onclick="merCategorias('${esc(c.id)}')">
            <b>${esc(c.nome)}</b><code>${esc(c.id)}</code>
          </button>`).join('')
      : `<div class="mer-folha">
           <b>${esc(d.nome || '')}</b>
           <div class="api-ok-d">Esta é uma categoria final — é o código que você usa na consulta de tarifa.</div>
           <code class="mer-cod">${esc(d.id || '')}</code>
           ${d.totalItens != null ? `<div class="api-ok-d">${d.totalItens.toLocaleString('pt-BR')} anúncios publicados aqui.</div>` : ''}
         </div>`;
  }catch(e){
    $('merCatPill').className = 'pill pill-bad';
    $('merCatPill').textContent = 'FALHOU';
    merFalha('merCats', e);
  }
}

/* ── envios ───────────────────────────────────────────────────────────── */
async function merEnvios(){
  merJaCarregou.envios = true;
  $('merEnvPill').textContent = 'carregando…';
  try{
    const d = await merApi({acao:'envios'});
    const ativos = d.metodos.filter(m => m.ativo);
    $('merEnvPill').className = 'pill pill-ok';
    $('merEnvPill').textContent = ativos.length + ' ATIVOS';
    $('merEnvios').innerHTML =
      '<thead><tr><th>Modalidade</th><th>Tipo</th><th>Entrega em</th><th>Frete grátis</th><th>Situação</th></tr></thead><tbody>'
      + d.metodos.map(m => `<tr>
          <td><b>${esc(m.nome)}</b></td>
          <td style="color:var(--sub)">${esc(m.tipo || '—')}</td>
          <td style="color:var(--sub)">${m.entregaEm === 'address' ? 'endereço' : esc(m.entregaEm || '—')}</td>
          <td>${m.freeOption ? '<span style="color:var(--green-dk)">permite</span>' : '<span style="color:var(--faint)">não</span>'}</td>
          <td>${m.ativo ? '<span style="color:var(--green-dk)">ativo</span>' : '<span style="color:var(--faint)">inativo</span>'}</td>
        </tr>`).join('') + '</tbody>';
  }catch(e){
    $('merEnvPill').className = 'pill pill-bad';
    $('merEnvPill').textContent = 'FALHOU';
    merFalha('merEnvios', e);
  }
}

/* ══ CATEGORIA E TARIFA REAL PELO MERCADO LIVRE ════════════════════════════
   O ML descobre a categoria pelo título e devolve a comissão daquela
   categoria. Isso muda o preço: a mesma planilha tem produtos de 10,5% e de
   14%, enquanto o parâmetro único assume um valor só para todos.

   As consultas vão em blocos porque o endpoint aceita um número limitado de
   itens por chamada, e porque assim dá para mostrar progresso em vez de
   deixar a tela parada.                                                     */
const CAT_BLOCO = 60;

function mlToggleCategoria(){
  const ligado = $('mlUsarCategoria').checked;
  const it = parseInt($('mlTitulo').value);
  const aviso = $('mlCatAviso');
  if(ligado && !(it >= 0)){
    aviso.className = 'cat-aviso mostra alerta';
    aviso.textContent = 'Escolha antes a coluna do título do produto — é ela que o Mercado Livre usa para achar a categoria.';
  }else if(ligado){
    aviso.className = 'cat-aviso mostra';
    aviso.textContent = 'Cada produto vai ser precificado com a comissão da categoria dele. A consulta acontece ao calcular.';
  }else{
    aviso.className = 'cat-aviso';
    aviso.textContent = '';
  }
}

function mlCatProgresso(feitos, total){
  const fracao = total ? feitos / total : 0;
  $('mlCatBarra').style.width = Math.round(fracao * 100) + '%';
  $('mlCatProgT').textContent = `consultando o Mercado Livre — ${feitos} de ${total} produtos`;
  /* mesma informação na janela de progresso, onde o usuário está olhando */
  progEtapa(1, fracao, `Consultando a categoria de cada produto no Mercado Livre`);
  progNumero(`${feitos} de ${total} produtos`);
}

async function mlDescobrirCategorias(entradas, iTitulo, iCusto){
  const linhas = mlAoa.slice(1);
  const pedidos = entradas.map(e => ({
    i: e.linha,
    titulo: String(linhas[e.linha - 1][iTitulo] || '').slice(0, 120),
    preco: ML.parseNumero(e.custo),
  })).filter(x => x.titulo);

  if(!pedidos.length){
    $('mlCatAviso').className = 'cat-aviso mostra alerta';
    $('mlCatAviso').textContent = 'A coluna escolhida não tem títulos — a tarifa por categoria foi ignorada.';
    return false;
  }

  mostrar('mlCatProg', true);
  mlCatProgresso(0, pedidos.length);
  const mapa = new Map();
  let feitos = 0, falhou = null;

  for(let i = 0; i < pedidos.length; i += CAT_BLOCO){
    const bloco = pedidos.slice(i, i + CAT_BLOCO);
    try{
      const r = await fetch('/api/ml-lote', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({itens: bloco}),
      });
      const d = await lerJson(r);
      if(d.erro){ falhou = d.erro; break; }
      (d.resultados || []).forEach(x => {
        if(x.achou) mapa.set(x.i, {
          categoria: x.categoria, nome: x.categoriaNome,
          classico: x.classico, premium: x.premium,
          obrigatorios: x.obrigatorios || [],
        });
      });
    }catch(e){ falhou = e.message; break; }
    feitos += bloco.length;
    mlCatProgresso(feitos, pedidos.length);
  }

  mostrar('mlCatProg', false);

  if(falhou){
    $('mlCatAviso').className = 'cat-aviso mostra ruim';
    $('mlCatAviso').textContent = 'Não consegui consultar o Mercado Livre (' + falhou
      + '). Os preços foram calculados com a tarifa dos parâmetros.';
    return false;
  }

  mlCategorias = mapa;
  const achou = mapa.size, semCat = pedidos.length - achou;
  $('mlCatAviso').className = 'cat-aviso mostra ok';
  $('mlCatAviso').textContent = `Categoria encontrada para ${achou} de ${pedidos.length} produtos`
    + (semCat ? `. Os ${semCat} sem categoria usaram a tarifa dos parâmetros.` : '.');
  return achou > 0;
}

async function mlProcessar(){
  const ic = parseInt($('mlCusto').value);
  const ip = parseInt($('mlPeso').value);
  const im = parseInt($('mlComissao').value);
  const iAlt = parseInt($('mlAltura').value);
  const iLarg = parseInt($('mlLargura').value);
  const iComp = parseInt($('mlComprimento').value);
  if(ic < 0) return;

  /* Sem responder a unidade do peso, todo o frete sai errado. Melhor parar aqui
     do que entregar uma planilha inteira com preço inflado. */
  if(mlPesoSuspeito || mlDimSuspeita){ revisarAbrir(); return; }

  progAbrir();
  try{
    await mlProcessarEtapas(ic, ip, im, iAlt, iLarg, iComp);
  } finally {
    progFechar();
  }
}

async function mlProcessarEtapas(ic, ip, im, iAlt, iLarg, iComp){
  progEtapa(0);
  progNumero(`${Math.max(0, mlAoa.length - 1)} produtos`);
  await respirar();

  /* Peso em gramas numa coluna que diz "kg". A planilha real mistura as duas
     escalas (0,9 kg e 2000 g lado a lado), então a conversão é por linha: só o
     que passa de 150 kg — impossível no Mercado Livre — vira grama. */
  const unidade = $('mlPesoUnidade').value;
  mlPesosConvertidos = new Set();
  const comUnidade = (v, linha) => {
    if(v === '' || v == null) return v;
    if(unidade === 'g') return /[a-z]/i.test(String(v)) ? v : String(v) + ' g';
    if(unidade !== 'auto') return v;
    const r = ML.normalizarPesoLinha(v, true);
    if(r.convertido){ mlPesosConvertidos.add(linha); return r.kg; }
    return v;
  };

  // monta as entradas e deixa o motor precificar e conferir tudo de uma vez
  const entradas = mlAoa.slice(1).map((linha, i) => {
    /* mlDimFator converte a coluna inteira quando as medidas vêm em mm ou m;
       vale 1 no caso normal, em que nada muda */
    const dims = (iAlt >= 0 && iLarg >= 0 && iComp >= 0)
      ? ML.normalizarDimensaoLinha(linha[iAlt], linha[iLarg], linha[iComp], mlDimFator).dimensoes
      : null;
    /* correção feita na tela vence o valor da planilha */
    const ed = mlEdicoes.get(i + 1) || {};
    return {
      linha: i + 1,
      custo: ed.custo != null ? ed.custo : linha[ic],
      /* o que o usuário digitou na tela é sempre kg (ou traz a unidade junto);
         a conversão de gramas vale só para o valor vindo da planilha */
      peso: ed.peso != null ? ed.peso : (ip >= 0 ? comUnidade(linha[ip], i + 1) : ''),
      dimensoes: dims,
      comissaoProduto: im >= 0 ? linha[im] : '',
    };
  });

  /* Antes de precificar, descobre a categoria de cada produto no Mercado Livre
     e usa a tarifa real daquela categoria em vez de uma comissão única. */
  mlCategorias = null;
  mlUsandoCategoria = false;
  const usarCat = $('mlUsarCategoria').checked && parseInt($('mlTitulo').value) >= 0;
  if(usarCat){
    progEtapa(1, 0);
    await respirar();
    const ok = await mlDescobrirCategorias(entradas, parseInt($('mlTitulo').value), ic);
    if(ok) mlUsandoCategoria = true;
  }else{
    progEtapa(1, 1, 'Consulta ao Mercado Livre desligada — usando a tarifa dos parâmetros');
    await respirar();
  }
  if(mlUsandoCategoria){
    const tipo = pml.tipoAnuncio === 'premium' ? 'premium' : 'classico';
    entradas.forEach(e => {
      const c = mlCategorias.get(e.linha);
      // só sobrescreve quando o ML devolveu a tarifa daquele tipo de anúncio
      if(c && c[tipo] != null) e.comissaoProduto = c[tipo];
    });
  }

  progEtapa(2);
  progNumero(`${entradas.length} produtos`);
  await respirar();

  const lote = ML.precificarLote(entradas, Object.assign({}, pml, {margemAlvo: mlMargem}));
  mlLinhas = lote.linhas;
  mlConferencia = lote.conferencia;
  mlFiltro = null;
  mlPagina = 0;

  const ok = mlLinhas.filter(r => r.preco != null);
  if(!ok.length){
    alert(`Nenhum preço foi calculado.\n\nA coluna "${mlCabecalho[ic]}" não tem valores numéricos maiores que zero — `
        + 'escolha a coluna que guarda o custo do produto.');
    return;
  }
  progEtapa(3);
  progNumero(`${ok.length} preços calculados`);
  await respirar();

  mlRenderStats();
  mlRenderChecks();
  mlRenderTabela();
  /* a barra cheia por um instante: fechar no meio do caminho dá a impressão
     de que algo foi interrompido */
  progEtapa(4, 0, 'Pronto');
  await new Promise(r => setTimeout(r, reduzido ? 0 : 420));

  $('mlBtnDl').innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>Baixar planilha pronta para o Bling (${ok.length} produtos)`;
  mlPasso(3);
}

/* ── estatísticas do lote ── */
function mlRenderStats(){
  const ok = mlLinhas.filter(r => r.preco != null);
  const lucros = ok.map(r => r.lucroLiquido);
  const soma = lucros.reduce((a,b) => a + b, 0);
  const revisar = mlConferencia ? mlConferencia.revisar : 0;

  /* O lucro total é o resultado que interessa e ganha destaque; o card de
     revisão vira botão, porque é o único que pede ação. */
  const primeiroGrupo = mlConferencia && mlConferencia.grupos.length ? mlConferencia.grupos[0].id : null;
  const cards = [
    {n: mlLinhas.length,   l:'Produtos',          c:'var(--ink)'},
    {n: ok.length,         l:'Preços calculados', c:'var(--green-dk)'},
    revisar
      ? {n: revisar, l:'Precisam de revisão', c:'var(--red)', acao: primeiroGrupo, dica:'ver o que precisa de atenção'}
      : {n: 'tudo certo', l:'Nada a revisar', c:'var(--green-dk)', pequeno:true},
    {n: ML.brl(soma / (lucros.length || 1)), l:'Lucro médio por venda', c:'var(--violet-dk)'},
    {n: ML.brl(soma), l:'Lucro total estimado', c:'var(--green-dk)', destaque:true},
  ];
  $('mlStats').innerHTML = cards.map((c,i) => {
    const classe = 'stat' + (c.destaque ? ' stat-destaque' : '') + (c.acao ? ' stat-acao' : '');
    const clique = c.acao ? ` onclick="mlVerLinhas('${c.acao}')" title="${esc(c.dica)}"` : '';
    return `<div class="${classe}" style="animation-delay:${i*.04}s"${clique}>
      <div class="stat-n${c.pequeno ? ' stat-n-txt' : ''}" style="color:${c.c}">${c.n}</div>
      <div class="stat-l">${c.l}</div>
      ${c.acao ? '<div class="stat-cta">ver as linhas →</div>' : ''}</div>`;
  }).join('');
}

/* ── conferência: o que precisa de atenção antes de exportar ── */
function mlRenderChecks(){
  const c = mlConferencia;
  if(!c) return;

  /* o badge diz o tamanho do problema, não só que existe um */
  const badge = $('mlBadge');
  const erros = c.grupos.filter(g => g.gravidade === 'erro').reduce((s, g) => s + g.n, 0);
  badge.textContent = !c.revisar ? 'TUDO CERTO'
    : (erros ? `${erros} ${erros === 1 ? 'PRECISA' : 'PRECISAM'} DE CORREÇÃO` : `${c.revisar} PARA CONFERIR`);
  badge.className = 'pill ' + (erros ? 'pill-bad' : (c.revisar ? 'pill-alerta' : 'pill-ok'));

  mlRenderResumo(c);

  if(!c.grupos.length){
    $('mlChecks').innerHTML = `<div class="chk ok">
      <div class="chk-i"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></div>
      <div><div class="chk-t">Nada a revisar</div>
      <div class="chk-d">Os ${c.total.toLocaleString('pt-BR')} produtos têm custo, peso e medidas — os preços podem ser usados como estão.</div></div>
    </div>`;
    return;
  }

  $('mlChecks').innerHTML = c.grupos.map(g => `
    <div class="chk ${g.gravidade === 'erro' ? 'bad' : 'alerta'}">
      <div class="chk-i">${g.gravidade === 'erro'
        ? '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M12 8v5m0 3h.01"/><path d="M10.3 4 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/></svg>'}</div>
      <div><div class="chk-t">${esc(g.titulo)} <span class="chk-n">${g.n} ${g.n === 1 ? 'produto' : 'produtos'}</span></div>
        <div class="chk-d">${esc(g.descricao)}</div>
        ${g.comoResolver ? `<div class="chk-r"><b>Como resolver</b>${esc(g.comoResolver)}</div>` : ''}</div>
      <button class="chk-btn${mlFiltro === g.id ? ' on' : ''}" onclick="mlVerLinhas('${g.id}')">
        ${mlFiltro === g.id ? 'ver todos' : `ver ${g.n === 1 ? 'a linha' : 'as linhas'}`}
        <svg viewBox="0 0 24 24"><path d="M5 12h14M13 5l7 7-7 7"/></svg></button>
    </div>`).join('') + mlChecksCategoria();
}

/* Proporção do lote em uma barra. A lista abaixo enumera problemas; aqui o
   usuário vê primeiro o tamanho deles em relação ao total — com 5.196 produtos,
   "4 para corrigir" é uma notícia boa, e a lista sozinha não passava isso. */
function mlRenderResumo(c){
  const alvo = $('mlChecksResumo');
  if(!alvo) return;

  const total = c.total || 0;
  const erro = c.comErro || 0;
  /* comAlerta conta linhas que têm alerta, inclusive as que também têm erro —
     senão as fatias somariam mais que o total */
  const alerta = Math.max(0, (c.comAlerta || 0) - erro);
  const ok = Math.max(0, total - erro - alerta);
  if(!total){ alvo.innerHTML = ''; return; }

  const pct = n => (n / total * 100).toFixed(2) + '%';
  const fatia = (n, cls) => n ? `<i class="${cls}" style="width:${pct(n)}"></i>` : '';
  const item = (n, cls, txt) => n
    ? `<span class="${cls}"><i></i><b>${n.toLocaleString('pt-BR')}</b> ${txt}</span>` : '';

  alvo.innerHTML = `
    <div class="chk-barra">${fatia(ok,'b-ok')}${fatia(alerta,'b-alerta')}${fatia(erro,'b-erro')}</div>
    <div class="chk-legenda">
      ${item(ok,'l-ok','prontos para exportar')}
      ${item(alerta,'l-alerta', alerta === 1 ? 'para conferir' : 'para conferir')}
      ${item(erro,'l-erro', erro === 1 ? 'precisa de correção' : 'precisam de correção')}
    </div>`;
}

/* O que a categoria exige antes de o anúncio ser aceito. É daqui que vem a
   coluna Modelo: quando ela falta, o Mercado Livre recusa a importação — e o
   erro só aparece lá, depois de subir tudo. */
function mlChecksCategoria(){
  if(!mlUsandoCategoria || !mlCategorias || !mlCategorias.size) return '';

  const semCat = mlLinhas.filter(r => !mlCategorias.get(r.linha)).length;

  /* junta os atributos exigidos, contando em quantos produtos cada um aparece */
  const exigidos = new Map();
  mlCategorias.forEach(c => (c.obrigatorios || []).forEach(a => {
    const e = exigidos.get(a.id) || {nome: a.nome, n: 0};
    e.n++; exigidos.set(a.id, e);
  }));
  const lista = [...exigidos.values()].sort((a, b) => b.n - a.n).slice(0, 6);

  let saida = '';
  if(semCat) saida += `
    <div class="chk ok">
      <div class="chk-i"><svg viewBox="0 0 24 24"><path d="M12 8v5m0 3h.01"/><path d="M10.3 4 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/></svg></div>
      <div><div class="chk-t">Categoria não encontrada <span class="chk-n">${semCat} ${semCat === 1 ? 'produto' : 'produtos'}</span></div>
        <div class="chk-d">O Mercado Livre não reconheceu a categoria pelo título. Esses produtos
          foram precificados com a tarifa dos parâmetros — confira se o título está descritivo.</div></div>
    </div>`;

  if(lista.length) saida += `
    <div class="chk ok">
      <div class="chk-i"><svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
      <div><div class="chk-t">O que as categorias exigem no anúncio</div>
        <div class="chk-d">Sem estes campos preenchidos o Mercado Livre recusa a importação:
          ${lista.map(a => `<b>${esc(a.nome)}</b> (${a.n})`).join(' · ')}.</div></div>
    </div>`;

  return saida;
}


/* ══════════════════════════════════════════════════════════════════════════
   A CONTA DE UMA LINHA
   O preço aparecia pronto e não havia como saber de onde saiu. Numa carga de
   cinco mil produtos é isso que decide se a pessoa confia no número e publica.
   ══════════════════════════════════════════════════════════════════════════ */
function abrirLinha(indice){
  const r = mlLinhas[indice];
  if(!r) return;
  const l = mlAoa[r.linha] || [];
  /* mesma coluna que a tabela mostra: a primeira que parece descrição */
  const iDesc = mlCabecalho.findIndex(h => /descri/i.test(String(h)));
  const desc = iDesc >= 0 ? String(l[iDesc] || '') : '';

  $('linhaTitulo').textContent = desc || ('Linha ' + (r.linha + 1));
  $('linhaSub').textContent = 'LINHA ' + (r.linha + 1) + ' · A CONTA DESTE PREÇO';

  if(r.preco == null){
    const motivos = (r.avisos || []).map(a => (ML.AVISOS[a] || {}).titulo || a);
    $('linhaCorpo').innerHTML = `
      <div class="conta-vazio">
        <div class="conta-vazio-t">Esta linha não teve preço calculado</div>
        <div class="conta-vazio-d">${motivos.length
          ? esc(motivos.join(' · '))
          : 'Faltou algum dado para a conta fechar.'}</div>
        <div class="conta-nota">${esc(((ML.AVISOS[(r.avisos||[])[0]] || {}).comoResolver) || 'Confira o custo e o peso dessa linha.')}</div>
      </div>`;
    abrirPop('popLinha', 'scrimLinha');
    return;
  }

  const p = pml;
  const linhaConta = (rot, val, cls) =>
    `<div class="conta-l ${cls || ''}"><span>${rot}</span><b>${val}</b></div>`;

  /* o peso que o frete cobrou pode ser o volumétrico, e é a explicação mais
     pedida quando o envio sai maior do que a pessoa esperava */
  const pesoTxt = kg => kg == null || !isFinite(kg) ? '—'
    : String(+Number(kg).toFixed(4)).replace('.', ',') + ' kg';
  const volumetrico = r.pesoVolumetrico > 0 && r.pesoUsou === 'volumétrico';

  const linhas = [
    linhaConta('Preço de venda', ML.brl(r.preco)),
    linhaConta('Custo do produto', '− ' + ML.brl(r.custo), 'neg'),
    linhaConta(`Comissão do Mercado Livre · ${(r.comissaoPct * 100).toFixed(0).replace('.', ',')}%`,
               '− ' + ML.brl(r.comissao), 'neg'),
  ];
  if(r.taxaFixa > 0)
    linhas.push(linhaConta(`Taxa fixa · faixa ${esc(r.faixaPreco || '')}`, '− ' + ML.brl(r.taxaFixa), 'neg'));
  if(r.frete > 0)
    linhas.push(linhaConta(
      `Envio · ${pesoTxt(r.peso)}${volumetrico ? ' (volumétrico)' : ''}, faixa ${esc(r.faixaPeso || '')}`,
      '− ' + ML.brl(r.frete), 'neg'));
  if(r.rebate > 0) linhas.push(linhaConta('Desconto que você banca', '− ' + ML.brl(r.rebate), 'neg'));
  if(r.imposto > 0) linhas.push(linhaConta('Imposto', '− ' + ML.brl(r.imposto), 'neg'));
  if(r.perdas > 0) linhas.push(linhaConta('Perdas com devolução', '− ' + ML.brl(r.perdas), 'neg'));
  if(r.embalagem > 0) linhas.push(linhaConta('Embalagem', '− ' + ML.brl(r.embalagem), 'neg'));
  linhas.push(linhaConta('Lucro líquido', ML.brl(r.lucroLiquido), 'tot'));

  const av = (r.avisos || []).map(a =>
    `<span class="tag ${(ML.AVISOS[a]||{}).gravidade === 'erro' ? 'tag-erro' : 'tag-alerta'}">${esc((ML.AVISOS[a]||{}).titulo || a)}</span>`).join(' ');

  $('linhaCorpo').innerHTML = `
    <div class="conta">${linhas.join('')}</div>
    <div class="conta-tiles">
      <div class="conta-tile"><i>Margem líquida</i><b>${(r.margemLiquida * 100).toFixed(1).replace('.', ',')}%</b></div>
      <div class="conta-tile"><i>Markup</i><b>${r.markup.toFixed(2).replace('.', ',')}×</b></div>
      <div class="conta-tile"><i>Peso da balança</i><b>${pesoTxt(r.pesoReal)}</b></div>
      <div class="conta-tile"><i>Peso cobrado</i><b>${pesoTxt(r.peso)}</b></div>
    </div>
    ${volumetrico ? `<p class="conta-nota"><b>O frete usou o peso volumétrico.</b>
      A caixa ocupa mais espaço do que pesa, e o Mercado Livre cobra pelo maior
      entre os dois — por isso o envio saiu acima do que o peso da balança sugeria.</p>` : ''}
    ${av ? `<p class="conta-nota">${av}</p>` : ''}
    <p class="conta-nota">Margem pedida no passo 2: <b>${(mlMargem * 100).toFixed(0)}%</b> sobre a venda.
      Tipo de anúncio: <b>${p.tipoAnuncio === 'premium' ? 'Premium' : 'Clássico'}</b>.</p>`;

  abrirPop('popLinha', 'scrimLinha');
}
function fecharLinha(){ fecharPop('popLinha', 'scrimLinha'); }

/* ══════════════════════════════════════════════════════════════════════════
   RESUMO ANTES DE BAIXAR
   O balanço do lote na hora da decisão. Era tudo confirm() do navegador, que
   não cabe número nem hierarquia — e por isso ninguém lia.
   ══════════════════════════════════════════════════════════════════════════ */
let resumoAcao = null;

function abrirResumo(aoConfirmar){
  resumoAcao = aoConfirmar;
  const c = mlConferencia;
  const ok = mlLinhas.filter(r => r.preco != null);
  const soma = ok.reduce((s, r) => s + r.lucroLiquido, 0);
  const erros = c ? c.grupos.filter(g => g.gravidade === 'erro').reduce((s, g) => s + g.n, 0) : 0;
  const comAnalise = $('mlColunasAnalise').checked;

  const tile = (n, rot, cor) => `<div class="res-tile2">
    <div class="res-tile2-n" style="color:${cor}">${n}</div>
    <div class="res-tile2-l">${rot}</div></div>`;

  const pend = !c ? '' : c.grupos.filter(g => g.gravidade !== 'info').map(g => `
    <div class="res-pend ${g.gravidade}">
      <span class="res-pend-n">${g.n.toLocaleString('pt-BR')}</span>
      <span class="res-pend-t">${esc(g.titulo)}</span>
    </div>`).join('');

  $('resumoCorpo').innerHTML = `
    <div class="res-tiles">
      ${tile(mlLinhas.length.toLocaleString('pt-BR'), 'produtos na planilha', 'var(--ink)')}
      ${tile(ok.length.toLocaleString('pt-BR'), 'com preço calculado', 'var(--green-dk)')}
      ${tile(ML.brl(soma), 'lucro total estimado', 'var(--green-dk)')}
      ${tile(ML.brl(soma / (ok.length || 1)), 'lucro médio por venda', 'var(--violet-dk)')}
    </div>

    ${pend ? `<div class="grp-t" style="margin-top:22px">O QUE FICA PENDENTE</div>
      <div class="res-pends">${pend}</div>` : `
      <div class="res-limpo">
        <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>
        Nada pendente — todos os produtos têm custo, peso e medidas.</div>`}

    ${erros ? `<div class="res-aviso erro">
      <b>${erros.toLocaleString('pt-BR')} ${erros === 1 ? 'produto precisa' : 'produtos precisam'} de correção.</b>
      Essas linhas vão para o arquivo com o preço que já estava lá, ou sem preço.
      O arquivo sai com valores novos e antigos misturados.</div>` : ''}

    <div class="res-aviso">
      <b>O que vai no arquivo.</b>
      ${comAnalise
        ? 'A planilha original com o preço novo, mais as colunas de análise (custo, frete, lucro, margem) para você conferir. <b>Desligue as colunas de análise antes de subir no Bling.</b>'
        : 'A planilha original com o preço novo gravado na coluna escolhida — pronta para o Bling.'}
    </div>`;

  abrirPop('popResumo', 'scrimResumo');
}
function fecharResumo(){ fecharPop('popResumo', 'scrimResumo'); }
function resumoConfirmar(){
  fecharResumo();
  const f = resumoAcao;
  resumoAcao = null;
  if(f) setTimeout(f, 180);   // deixa o modal fechar antes de gerar
}

/* filtra a tabela por um tipo de problema — inclusive linhas além da centésima.
   Filtrar sem levar até a tabela deixava o usuário olhando o mesmo card: a
   lista mudava 2.000px abaixo, fora da tela, e nada parecia ter acontecido. */
function mlVerLinhas(id){
  const ligando = mlFiltro !== id;
  mlFiltro = ligando ? id : null;
  mlPagina = 0;
  mlBusca = '';
  mlRenderChecks();
  mlRenderTabela();
  if(ligando) mlIrParaTabela();
}

/* leva à tabela já filtrada e pisca a primeira linha com problema, para o olho
   achar onde continuar em vez de cair numa grade de números */
function mlIrParaTabela(){
  const alvo = $('mlPainelTabela');
  if(!alvo) return;
  alvo.scrollIntoView({behavior: reduzido ? 'instant' : 'smooth', block: 'start'});
  const linha = alvo.querySelector('tr.tr-erro, tr.tr-alerta');
  if(!linha || reduzido) return;
  linha.classList.remove('tr-achei');
  void linha.offsetWidth;            // reinicia a animação a cada clique
  linha.classList.add('tr-achei');
}
function mlIrPagina(n){ mlPagina = n; mlRenderTabela(); }

function mlPorPagina(n){ ML_POR_PAGINA = n; mlPagina = 0; mlRenderTabela(); }

function mlBuscar(txt){
  mlBusca = String(txt || '').trim().toLowerCase();
  mlPagina = 0;
  mlRenderTabela();
}

/* ── correção direta na tabela ────────────────────────────────────────────────
   O usuário digita o peso ou o custo certo, a linha é recalculada na hora e o
   valor corrigido vai junto na exportação. Guardamos em mlEdicoes (e não em
   mlAoa) para saber o que foi corrigido e poder desfazer.                    */
function mlEditar(linha, campo, valor){
  const txt = String(valor).trim();
  const atual = mlEdicoes.get(linha) || {};
  if(txt === '') delete atual[campo];
  else atual[campo] = txt;

  if(Object.keys(atual).length) mlEdicoes.set(linha, atual);
  else mlEdicoes.delete(linha);
}

/* Recalcula só depois que o usuário sai do campo: refazer a tabela a cada
   tecla faria o input perder o foco no meio da digitação. */
/* Recalcula SÓ a linha corrigida. Antes isso chamava mlProcessar(), que
   reprocessa a planilha inteira e reconsulta o Mercado Livre — em 5 mil
   produtos, cada correção custava dezenas de segundos e a tabela voltava para
   o topo, perdendo o lugar onde o usuário estava. */
function mlEditarPronto(linha){
  const r = mlLinhas.find(x => x.linha === linha);
  if(!r){ mlProcessar(); return; }

  const ip = parseInt($('mlPeso').value), ic = parseInt($('mlCusto').value);
  const im = parseInt($('mlComissao').value);
  const iAlt = parseInt($('mlAltura').value), iLarg = parseInt($('mlLargura').value);
  const iComp = parseInt($('mlComprimento').value);
  const original = mlAoa[linha] || [];
  const ed = mlEdicoes.get(linha) || {};

  const dims = (iAlt >= 0 && iLarg >= 0 && iComp >= 0)
    ? ML.normalizarDimensaoLinha(original[iAlt], original[iLarg], original[iComp], mlDimFator).dimensoes
    : null;

  /* o que o usuário digita é sempre kg; a conversão de gramas vale só para o
     valor que veio da planilha */
  let peso = ed.peso;
  if(peso == null && ip >= 0){
    peso = original[ip];
    if($('mlPesoUnidade').value === 'auto'){
      const conv = ML.normalizarPesoLinha(peso, true);
      if(conv.convertido){ peso = conv.kg; mlPesosConvertidos.add(linha); }
    }else if($('mlPesoUnidade').value === 'g' && peso !== '' && peso != null && !/[a-z]/i.test(String(peso))){
      peso = String(peso) + ' g';
    }
  }
  if(ed.peso != null) mlPesosConvertidos.delete(linha);

  const params = Object.assign({}, pml, {margemAlvo: mlMargem});
  let comissao = im >= 0 ? original[im] : '';
  if(mlUsandoCategoria && mlCategorias){
    const c = mlCategorias.get(linha);
    const tipo = pml.tipoAnuncio === 'premium' ? 'premium' : 'classico';
    if(c && c[tipo] != null) comissao = c[tipo];
  }

  const novo = ML.precificarLinha({
    linha, custo: ed.custo != null ? ed.custo : original[ic],
    peso, dimensoes: dims, comissaoProduto: comissao,
  }, params);

  mlLinhas[mlLinhas.indexOf(r)] = novo;
  mlConferencia = ML.conferir(mlLinhas);
  mlRenderStats();
  mlRenderChecks();

  /* redesenhar a tabela joga a rolagem para o topo; guardamos a posição para o
     usuário continuar exatamente onde estava, corrigindo uma linha atrás da
     outra sem se perder */
  const caixa = document.querySelector('#mlStep3 .tbl-wrap');
  const y = caixa ? caixa.scrollTop : 0;
  mlRenderTabela();
  if(caixa) caixa.scrollTop = y;
}


/* ── tabela de conferência, com filtro, busca e paginação ── */
function mlRenderTabela(){
  const iDesc = mlCabecalho.findIndex(h => /descri/i.test(String(h)));
  const iVar  = mlCabecalho.findIndex(h => /varia[çc][ãa]o/i.test(String(h)));
  const iCod  = mlCabecalho.findIndex(h => /^c[óo]digo$/i.test(String(h)));
  const grupo = mlFiltro && mlConferencia
    ? mlConferencia.grupos.find(g => g.id === mlFiltro) : null;
  let alvo = grupo ? grupo.linhas.map(i => mlLinhas[i]) : mlLinhas;

  /* busca por descrição ou código, para achar um produto no meio de centenas */
  if(mlBusca){
    alvo = alvo.filter(r => {
      const l = mlAoa[r.linha] || [];
      const d = iDesc >= 0 ? String(l[iDesc] || '') : '';
      const c = iCod  >= 0 ? String(l[iCod]  || '') : '';
      return (d + ' ' + c).toLowerCase().includes(mlBusca);
    });
  }

  const total = alvo.length;
  const paginas = Math.max(1, Math.ceil(total / ML_POR_PAGINA));
  if(mlPagina >= paginas) mlPagina = 0;
  const inicio = mlPagina * ML_POR_PAGINA;
  const pagina = alvo.slice(inicio, inicio + ML_POR_PAGINA);

  const situacao = r => {
    if(!r.avisos || !r.avisos.length) return '<span style="color:var(--green-dk)">ok</span>';
    return r.avisos.map(a => `<span class="tag ${ (ML.AVISOS[a]||{}).gravidade === 'erro' ? 'tag-erro' : 'tag-alerta'}">${esc((ML.AVISOS[a]||{}).titulo || a)}</span>`).join(' ');
  };

  /* peso na tela: até 4 casas, sem zeros à toa (0,0008 kg / 2,2 kg) */
  const pesoTxt = kg => kg == null || !isFinite(kg) ? '' :
    String(+Number(kg).toFixed(4)).replace('.', ',');

  const campo = (r, nome, valor, prefixo) => {
    const ed = mlEdicoes.get(r.linha) || {};
    const mexido = ed[nome] != null;
    return `<div class="cel-ed${mexido ? ' mexido' : ''}">${prefixo ? `<span>${prefixo}</span>` : ''}
      <input type="text" inputmode="decimal" value="${esc(valor)}"
        onchange="mlEditar(${r.linha},'${nome}',this.value); mlEditarPronto(${r.linha})"
        title="${mexido ? 'Corrigido aqui — vai assim para o Excel' : 'Clique para corrigir'}"/></div>`;
  };

  const tdsVazios = mlUsandoCategoria ? 7 : 6;

  $('mlTabela').innerHTML =
    `<thead><tr><th>Linha</th><th>Descrição</th>${iVar >= 0 ? '<th>Variação</th>' : ''}${mlUsandoCategoria ? '<th>Categoria no ML</th>' : ''}
      <th>Custo</th><th>Peso (kg)</th><th>Preço de venda</th>
      <th>Comissão</th><th>Envio</th><th>Lucro</th><th>Situação</th></tr></thead><tbody>` +
    pagina.map(r => {
      const l = mlAoa[r.linha] || [];
      const descCheia = iDesc >= 0 ? String(l[iDesc] || '') : '';
      const desc = descCheia.slice(0, 60);
      const ed = mlEdicoes.get(r.linha) || {};
      /* a categoria vem do Mercado Livre; sem ela a linha usou a tarifa dos parâmetros */
      const cat = mlUsandoCategoria && mlCategorias ? mlCategorias.get(r.linha) : null;
      const tipoAn = pml.tipoAnuncio === 'premium' ? 'premium' : 'classico';
      const tdCat = !mlUsandoCategoria ? '' : (cat && cat[tipoAn] != null
        ? `<td class="td-cat" title="${esc(cat.categoria)}">${esc(cat.nome || cat.categoria)}
             <b>${String(cat[tipoAn]).replace('.', ',')}%</b></td>`
        : '<td class="td-cat vazia">não encontrada</td>');
      const tdVar = iVar < 0 ? '' :
        `<td style="color:var(--faint)">${esc(String(l[iVar] || '')) || '—'}</td>`;

      /* a linha inteira ganha cor quando tem problema: numa página de 600,
         procurar a última coluna é inviável */
      const grav = !r.avisos || !r.avisos.length ? '' :
        (r.avisos.some(a => (ML.AVISOS[a] || {}).gravidade === 'erro') ? ' class="tr-erro"' : ' class="tr-alerta"');

      const tdCusto = campo(r, 'custo', ed.custo != null ? ed.custo :
        (r.custo != null ? r.custo.toFixed(2).replace('.', ',') : ''), 'R$');
      /* No campo vai o peso da balança — é o que se corrige. Quando o frete
         cobra o volumétrico (caixa grande e leve), avisamos ao lado, senão o
         número editado não bate com o envio cobrado. */
      const tdPeso = campo(r, 'peso', ed.peso != null ? ed.peso : (r.pesoReal ? pesoTxt(r.pesoReal) : '')) +
        (mlPesosConvertidos.has(r.linha)
          ? `<div class="vol conv" title="A planilha trazia esse peso como número redondo acima de 20 — padrão de peso em gramas. Corrija aqui se estiver errado.">convertido de gramas</div>` : '') +
        (r.pesoUsou === 'volumétrico' && r.peso
          ? `<div class="vol" title="A caixa é grande para o peso: o Mercado Livre cobra o peso volumétrico (altura × largura × comprimento ÷ 6000)">frete cobra ${pesoTxt(r.peso)}</div>`
          : '');

      if(r.preco == null) return `<tr${grav}>
        <td style="color:var(--faint)">${r.linha + 1}</td>
        <td title="${esc(descCheia)}">${esc(desc) || '—'}</td>${tdVar}${tdCat}
        <td>${tdCusto}</td><td>${tdPeso}</td>
        <td colspan="${tdsVazios - 2}" style="color:var(--faint)">sem preço calculado</td>
        <td>${situacao(r)}</td></tr>`;
      const iReal = mlLinhas.indexOf(r);
      return `<tr${grav} class="tr-clic" onclick="if(!event.target.closest('input,button,select,a'))abrirLinha(${iReal})" title="Ver a conta desta linha">
        <td class="c-linha">${r.linha + 1}</td>
        <td class="c-desc" title="${esc(descCheia)}">${esc(desc) || '—'}</td>${tdVar}${tdCat}
        <td class="c-custo">${tdCusto}</td>
        <td class="c-peso">${tdPeso}</td>
        <td class="c-preco">${ML.brl(r.preco)}</td>
        <td class="c-taxa">${ML.brl(-r.comissao)}</td>
        <td class="c-taxa">${ML.brl(-r.frete)}</td>
        <td class="c-lucro ${r.lucroLiquido > 0 ? 'pos' : 'neg'}">${ML.brl(r.lucroLiquido)}</td>
        <td>${situacao(r)}</td>
      </tr>`;
    }).join('') + '</tbody>';

  /* atalhos que ficam sempre à mão, mesmo quando o problema não existe:
     "sem peso" precisa ser procurável, não só aparecer quando dá alerta */
  const atalhos = [['sem_peso','sem peso'], ['peso_invalido','peso inválido'],
                   ['peso_suspeito','peso suspeito'], ['sem_custo','sem custo'],
                   ['lucro_negativo','no prejuízo']]
    .map(([id, rot]) => {
      const g = mlConferencia && mlConferencia.grupos.find(x => x.id === id);
      const n = g ? g.n : 0;
      return `<button class="f-atalho${mlFiltro === id ? ' on' : ''}${n ? '' : ' zero'}"
        ${n ? `onclick="mlVerLinhas('${id}')"` : 'disabled'}>${rot} <b>${n}</b></button>`;
    }).join('');

  // barra de busca, filtro ativo e correções pendentes
  const nEd = mlEdicoes.size;
  $('mlFiltroBar').innerHTML = `<div class="filtro-bar">
      <input type="search" class="busca" placeholder="Buscar por descrição ou código…"
        value="${esc(mlBusca)}" oninput="mlBuscar(this.value)"/>
      <div class="f-atalhos"><span class="f-titulo">Clique para ver só os produtos com problema</span>${atalhos}</div>
      ${grupo ? `<div class="f-ativo ${grupo.gravidade === 'erro' ? 'grave' : ''}">
          <div class="f-ativo-ic">${grupo.gravidade === 'erro'
            ? '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>'
            : '<svg viewBox="0 0 24 24"><path d="M12 8v5m0 3h.01"/><path d="M10.3 4 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/></svg>'}</div>
          <div>
            <div class="f-ativo-t">Mostrando ${grupo.n} produto${grupo.n === 1 ? '' : 's'}: <b>${esc(grupo.titulo)}</b></div>
            ${grupo.comoResolver ? `<div class="f-ajuda"><b>O que fazer agora</b>${esc(grupo.comoResolver)}</div>` : ''}</div>
          <button onclick="mlVerLinhas('${grupo.id}')">ver todas as ${mlLinhas.length.toLocaleString('pt-BR')} linhas</button>
        </div>` : ''}
      ${mlBusca ? `<span><b>${total}</b> encontrado${total === 1 ? '' : 's'}</span>` : ''}
      ${nEd ? `<span class="ed-aviso"><b>${nEd}</b> linha${nEd === 1 ? '' : 's'} corrigida${nEd === 1 ? '' : 's'} aqui</span>
        <button onclick="mlLimparCorrecoes()">limpar correções</button>` : ''}
    </div>`;
  mostrar('mlFiltroBar', true);

  // paginação
  const fim = Math.min(inicio + ML_POR_PAGINA, total);
  const seletorTam = `<span class="pag-tam">Mostrar
      ${ML_PAGINAS.map(n => `<button class="${n === ML_POR_PAGINA ? 'on' : ''}" onclick="mlPorPagina(${n})">${n}</button>`).join('')}
      por vez</span>`;
  $('mlPaginacao').innerHTML = (paginas > 1 || total > ML_PAGINAS[0])
    ? `<div class="paginacao">
        ${paginas > 1 ? `<button ${mlPagina === 0 ? 'disabled' : ''} onclick="mlIrPagina(${mlPagina - 1})">‹ Anterior</button>
        <span>${inicio + 1}–${fim} de ${total}</span>
        <button ${mlPagina >= paginas - 1 ? 'disabled' : ''} onclick="mlIrPagina(${mlPagina + 1})">Próximas ${Math.min(ML_POR_PAGINA, total - fim)} ›</button>` : `<span>${total} linha${total === 1 ? '' : 's'}</span>`}
        ${seletorTam}
      </div>` : '';

  const c = mlConferencia;
  $('mlPrevInfo').textContent = c && c.revisar ? `${c.revisar} PRECISAM DE REVISÃO` : 'TUDO CERTO';
  $('mlPrevInfo').className = 'pill ' + (c && !c.ok ? 'pill-bad' : 'pill-ok');
}

function mlBaixar(){
  if(!mlLinhas.length || !mlBytes) return;
  /* o balanço do lote antes de gerar: era tudo confirm() do navegador, que
     não cabe número nem hierarquia — e por isso ninguém lia */
  abrirResumo(mlBaixarAgora);
}

function mlBaixarAgora(){
  if(!mlLinhas.length || !mlBytes) return;
  const id = parseInt($('mlPreco').value);
  const comAnalise = $('mlColunasAnalise').checked;

  /* Linha sem preço mantém o valor antigo na planilha. Avisamos antes de
     gerar, senão o arquivo vai para o Bling com preços novos e velhos
     misturados, sem como distinguir. */
  /* O preço novo vai para a mesma coluna de onde veio o custo: no arquivo
     gerado o custo deixa de existir. Precificar de novo por cima dele daria
     preço sobre preço. Guardar o arquivo original resolve — por isso o aviso. */
  if(id >= 0 && id === parseInt($('mlCusto').value) && !$('mlColunasAnalise').checked){
    const ok = confirm(
      `O preço novo vai ser gravado na coluna "${mlCabecalho[id]}", a mesma de onde veio o custo.\n\n`
      + 'No arquivo gerado o custo some — guarde a planilha original, ou ligue as colunas de '
      + 'análise, que salvam o custo à parte.\n\nGerar assim?');
    if(!ok) return;
  }

  let nome;
  try{
    // relê o arquivo enviado e troca só o que muda, preservando tipos e formato
    const wb = XLSX.read(mlBytes, {type:'array'});
    const nomeAba = mlAbaNome || wb.SheetNames[0];
    XU.normalizarRef(wb.Sheets[nomeAba]);
    const ws = XU.clonarWs(wb.Sheets[nomeAba]);
    const base = mlCabecalho.length;

    /* dois pesos: o da balança e o que o frete de fato cobrou (que pode ser o
       volumétrico). Um só, ambíguo, não deixa conferir o custo de envio. */
    const NOVAS = ['Custo do produto','Peso do produto (kg)','Peso cobrado no frete (kg)',
                   'Preço de venda ML','Comissão','Custo fixo',
                   'Custo de envio','Receita líquida','Lucro líquido','Margem líquida','Conferência']
      /* quando a tarifa veio do ML, o arquivo registra de onde: sem isso não dá
         para saber depois se a linha usou a tarifa da categoria ou a do parâmetro */
      .concat(mlUsandoCategoria ? ['Categoria ML','Código da categoria','Tarifa aplicada (%)'] : []);
    if(comAnalise) NOVAS.forEach((t, k) => XU.escrever(ws, mlLinhaCab, base + k, t));

    /* correções feitas na tela vão para a coluna original da planilha — é essa
       que o Bling lê; as colunas de análise abaixo são só para conferência */
    const icPeso  = parseInt($('mlPeso').value);
    const icCusto = parseInt($('mlCusto').value);

    mlLinhas.forEach((r, i) => {
      const linha = mlLinhaCab + 1 + i;   // posição real na aba, não no recorte lido
      const ed = mlEdicoes.get(r.linha);
      if(ed){
        /* r.peso pode ser o volumétrico (o que o frete cobra); na planilha vai
           o peso da balança, que foi o valor digitado */
        if(ed.peso != null && icPeso >= 0 && r.pesoReal != null) XU.escrever(ws, linha, icPeso, r.pesoReal);
        if(ed.custo != null && icCusto >= 0 && r.custo != null) XU.escrever(ws, linha, icCusto, r.custo);
      }
      if(id >= 0 && r.preco != null) XU.escrever(ws, linha, id, r.preco);
      if(comAnalise){
        const conf = (r.avisos || []).map(a => (ML.AVISOS[a] || {}).titulo || a).join(' · ');
        const vals = r.preco == null
          ? [r.custo, r.pesoReal, r.peso, '', '', '', '', '', '', '', conf || 'sem preço calculado']
          : [r.custo, r.pesoReal, r.peso, r.preco, -r.comissao, -r.taxaFixa, -r.frete,
             r.receitaLiquida, r.lucroLiquido, +(r.margemLiquida).toFixed(4), conf];
        if(mlUsandoCategoria){
          const c = mlCategorias ? mlCategorias.get(r.linha) : null;
          const tp = pml.tipoAnuncio === 'premium' ? 'premium' : 'classico';
          vals.push(c ? (c.nome || '') : 'não encontrada',
                    c ? c.categoria : '',
                    c && c[tp] != null ? c[tp] : '');
        }
        vals.forEach((v, k) => XU.escrever(ws, linha, base + k, v === undefined ? '' : v));
      }
    });

    if(comAnalise){
      const cols = ws['!cols'] ? ws['!cols'].slice() : [];
      NOVAS.forEach((_, k) => cols[base + k] = {wch: k === NOVAS.length - 1 ? 40 : 18});
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
  const pendentes = mlConferencia ? mlConferencia.revisar : 0;
  const rep = MLFretes.REPUTACOES.find(r => r.id === pml.reputacao);
  $('mlDoneMsg').innerHTML =
    `<b style="color:var(--ink)">${ok} produtos</b> precificados a <b style="color:var(--green-dk)">${(mlMargem*100).toFixed(0)}% de margem líquida</b><br/>
     Arquivo salvo como <b>${esc(nome)}</b><br/><br/>
     <span style="font-size:12px;color:var(--faint)">
     ${pendentes ? '⚠ ' + pendentes + ' produto(s) precisam de revisão — veja a conferência<br/>' : ''}
     ✔ Anúncio ${pml.tipoAnuncio === 'premium' ? 'Premium' : 'Clássico'} · reputação ${esc(rep ? rep.nome.toLowerCase() : pml.reputacao)}<br/>
     ✔ Preço gravado ${id >= 0 ? 'na coluna "' + esc(mlCabecalho[id]) + '"' : 'em nova coluna'}<br/>
     ${comAnalise ? '✔ Colunas de análise incluídas — remova antes de subir no Bling'
                  : '✔ Mesmas colunas do arquivo enviado, pronto para importar no Bling'}</span>`;
  mlPasso(4);
}

/* Limpa TUDO o que pertence à planilha anterior. As correções de peso e custo
   são guardadas por número de linha: sobrando de um arquivo para o outro,
   seriam aplicadas em produtos completamente diferentes. */
function mlReset(){
  mlWb = mlBytes = null; mlAoa = []; mlCabecalho = []; mlLinhas = []; mlNome = '';
  mlEdicoes.clear();
  mlConferencia = null; mlFiltro = null; mlBusca = ''; mlPagina = 0;
  mlCategorias = null; mlUsandoCategoria = false;
  mlPesoSuspeito = false; mlPesoConfirmadoKg = false;
  mlDimSuspeita = false; mlDimConfirmada = false; mlDimInfo = null; mlDimFator = 1;
  $('mlPesoUnidade').value = 'kg';
  $('mlFi').value = '';
  mlPasso(1);
}

/* Descarta só as correções feitas na tela, mantendo a planilha carregada. */
function mlLimparCorrecoes(){
  if(!mlEdicoes.size) return;
  const n = mlEdicoes.size;
  if(!confirm(`Descartar ${n} ${n === 1 ? 'correção feita' : 'correções feitas'} aqui e voltar aos valores da planilha?`)) return;
  mlEdicoes.clear();
  mlProcessar();
}

/* ── custos oficiais ── */
let taxasProntas = false;

/* ══════════════════════════════════════════════════════════════════════════
   PAINEL DA INTEGRAÇÃO COM O MERCADO LIVRE

   A tela não afirma "conectado": ela mostra o que foi verificado agora. O
   /api/ml-status bate em cada endpoint e devolve o status real de cada um.

   O ponto que importa entender: a API entrega a COMISSÃO (que muda por
   categoria e é o dado difícil de manter na mão), mas NÃO entrega o custo
   fixo nem a tabela de frete — esses continuam vindo das tabelas oficiais
   embutidas no app.
   ══════════════════════════════════════════════════════════════════════════ */
/* No localhost as funções /api não existem: o servidor devolve a página 404 em
   HTML e o JSON.parse estoura com "Unexpected token '<'". Isso é ambiente sem
   backend, não integração quebrada — e a mensagem precisa dizer isso. */
async function lerJson(r){
  const tipo = r.headers.get('content-type') || '';
  if(!tipo.includes('json')){
    const e = new Error(r.status === 404
      ? 'As funções do servidor não existem neste endereço. Isso acontece ao abrir o app localmente: a integração funciona no site publicado.'
      : `O servidor respondeu ${r.status} sem JSON.`);
    e.semBackend = true;
    throw e;
  }
  return r.json();
}

let apiStatus = null, apiCarregando = false;

/* o que cada fonte cobre — é isto que o painel explica */
const API_VIVO = [
  ['Comissão por categoria',
   'A tarifa real de venda em Clássico e Premium. Muda de categoria para categoria: em Celulares dá 13% e 18%; sem categoria informada, o ML devolve o piso de 11% e 16%.'],
  ['Categoria pelo título',
   'A partir do nome do produto, o ML diz em que categoria ele cai — e daí sai a comissão certa daquele item.'],
  ['Atributos obrigatórios',
   'O que a categoria exige antes de aceitar o anúncio. É de onde vem a exigência da coluna <b>Modelo</b>.'],
];
const API_TABELA = [
  ['Custo fixo por faixa',
   'A API devolve <code>fixed_fee: 0</code> em toda consulta de preço — ela não expõe esse valor. Vem da tabela oficial: 50% abaixo de R$ 12,50, depois R$ 6,25, R$ 6,50 e R$ 6,75.'],
  ['Frete por reputação',
   'As três tabelas (verde, amarela e vermelha), 30 faixas de peso por 8 faixas de preço, não têm endpoint público. Estão conferidas valor a valor no app.'],
  ['Peso volumétrico',
   'É uma regra de cálculo, não um dado: (A × L × C) ÷ 6.000, cobrando pelo maior entre ele e o peso real.'],
];

function apiChip(ok, txt){
  return `<span class="api-chip ${ok ? 'ok' : 'nao'}">${ok
    ? '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>'}${esc(txt)}</span>`;
}

async function apiCarregar(){
  if(apiCarregando || apiStatus) return apiPintar();
  apiCarregando = true;
  $('apiPill').className = 'pill';
  $('apiPill').textContent = 'verificando…';
  try{
    const r = await fetch('/api/ml-status?sondar=1');
    apiStatus = await lerJson(r);
  }catch(e){
    apiStatus = {conectado:false, erro:e.message, semBackend:!!e.semBackend, sondas:[]};
  }
  apiCarregando = false;
  apiPintar();
}

function apiPintar(){
  const st = apiStatus;
  if(!st) return;

  const pill = $('apiPill');
  pill.className = 'pill ' + (st.conectado ? 'pill-ok' : 'pill-bad');
  pill.textContent = st.conectado ? 'CONECTADO' : 'FORA DO AR';

  const quando = st.verificadoEm
    ? new Date(st.verificadoEm).toLocaleString('pt-BR', {dateStyle:'short', timeStyle:'short'})
    : '';

  $('apiTopo').innerHTML = st.conectado
    ? `<div class="api-ok">
         <div class="api-ok-t">A aplicação está autenticada no Mercado Livre.</div>
         <div class="api-ok-d">Autenticação por <b>${esc(st.autenticacao || '—')}</b> ·
           ${st.escopos || 0} permissões · verificado em ${esc(quando)}.
           A chave fica no servidor e nunca chega ao navegador.</div>
       </div>`
    : `<div class="api-erro">
         <div class="api-ok-t">A integração não está respondendo.</div>
         <div class="api-ok-d">${esc(st.erro || 'Erro desconhecido.')}
           ${st.semCredencial ? ' Configure ML_CLIENT_ID e ML_CLIENT_SECRET na Vercel.' : ''}</div>
         <div class="api-ok-d">${st.semBackend
           ? 'Os preços continuam corretos: são calculados pelas tabelas oficiais embutidas, que não dependem da internet.'
           : 'Enquanto isso o preço continua saindo pelas tabelas oficiais embutidas — que é o comportamento padrão e está correto.'}</div>
       </div>`;

  const lista = itens => itens.map(([t, d]) =>
    `<div class="api-item"><b>${esc(t)}</b><span>${d}</span></div>`).join('');
  $('apiVivo').innerHTML   = lista(API_VIVO);
  $('apiTabela').innerHTML = lista(API_TABELA);

  /* o que dá para construir: sai das sondas, então reflete o que respondeu */
  const IDEIAS = {
    descobrir: ['Tarifa certa produto a produto',
      'Hoje o app usa uma comissão só para a planilha inteira. Com a categoria descoberta pelo título de cada item, cada linha passa a ser precificada com a tarifa real da sua categoria.',
      'muda o preço de cada produto'],
    atributos: ['Checagem antes de subir no Bling',
      'A categoria diz o que é obrigatório. Dá para avisar quais produtos vão ser recusados por falta de Marca, Modelo ou ficha técnica — antes de você tentar importar.',
      'evita importação recusada'],
    tarifa: ['Tabela de comissão sempre atualizada',
      'Quando o Mercado Livre mexer nas tarifas, o app passa a usar o valor novo sem você editar nada.',
      'some a manutenção manual'],
    categorias: ['Escolher a categoria na tela',
      'Uma busca de categoria no precificador, para você fixar a categoria certa quando não quiser confiar na descoberta automática.',
      'controle fino'],
    tendencias: ['O que está sendo procurado',
      'As buscas em alta no site, para escolher o que vale a pena colocar no catálogo.',
      'ajuda a garimpar produto'],
    envios: ['Modalidades de envio',
      'As opções de envio do site, para conferir o que se aplica ao seu tipo de operação.',
      'apoio ao frete'],
    busca: ['Preço da concorrência',
      'Ver por quanto o mesmo produto está sendo anunciado. Exige autorização de uma conta de vendedor — a chave da aplicação sozinha não abre.',
      'precisa de login do vendedor'],
  };

  const sondas = st.sondas || [];
  if(!sondas.length){
    $('apiIdeias').innerHTML = '<div class="api-ok-d">Sem verificação disponível agora.</div>';
    $('apiIdeiasPill').textContent = '—';
    return;
  }
  const liberados = sondas.filter(x => x.ok).length;
  $('apiIdeiasPill').textContent = `${liberados} de ${sondas.length} liberados`;

  $('apiIdeias').innerHTML = sondas.map(sd => {
    const i = IDEIAS[sd.chave] || [sd.nome, sd.usa, ''];
    return `<div class="api-ideia ${sd.ok ? '' : 'bloq'}">
      <div class="api-ideia-h">
        <b>${esc(i[0])}</b>
        ${apiChip(sd.ok, sd.ok ? `respondeu em ${sd.ms} ms` : `HTTP ${sd.status || 'sem resposta'}`)}
      </div>
      <p>${esc(i[1])}</p>
      ${i[2] ? `<span class="api-tag">${esc(i[2])}</span>` : ''}
    </div>`;
  }).join('');
}

/* consulta ao vivo, para você conferir a tarifa de um preço e categoria */
async function apiTestar(){
  const alvo = $('apiResultado');
  const preco = ML.parseNumero($('apiPreco').value);
  if(!isFinite(preco) || preco <= 0){
    alvo.innerHTML = '<div class="api-erro"><div class="api-ok-d">Informe um preço maior que zero.</div></div>';
    return;
  }
  const cat = ($('apiCat').value || '').trim();
  $('apiBtn').disabled = true;
  alvo.innerHTML = '<div class="api-ok-d">Consultando o Mercado Livre…</div>';
  try{
    const q = new URLSearchParams({preco: String(preco)});
    if(cat) q.set('categoria', cat);
    const r = await fetch('/api/ml-tarifa?' + q);
    const d = await r.json();
    if(d.erro){
      alvo.innerHTML = `<div class="api-erro"><div class="api-ok-d">${esc(d.erro)}</div></div>`;
    }else{
      const linha = (nome, t) => t ? `
        <div class="api-linha">
          <span>${nome}</span>
          <b>${t.percentual}%</b>
          <span>${ML.brl(t.valor)}</span>
        </div>` : '';
      /* o mesmo preço pela tabela do app, para comparar lado a lado */
      const doApp = tipo => (pml[tipo === 'classico' ? 'comissaoClassico' : 'comissaoPremium'] * 100);
      alvo.innerHTML = `
        <div class="api-res">
          <div class="api-res-t">Resposta do Mercado Livre para ${ML.brl(preco)}${cat ? ' na categoria ' + esc(cat) : ' <i>sem categoria informada</i>'}</div>
          ${linha('Clássico', d.tarifas.classico)}
          ${linha('Premium',  d.tarifas.premium)}
          <div class="api-res-d">
            ${cat
              ? 'Esta é a tarifa real dessa categoria.'
              : 'Sem categoria, o Mercado Livre devolve o <b>piso</b> da tarifa. A comissão de verdade depende da categoria do produto.'}
            O app está usando ${doApp('classico').toFixed(0)}% e ${doApp('premium').toFixed(0)}% nos parâmetros.
          </div>
        </div>`;
    }
  }catch(e){
    alvo.innerHTML = `<div class="api-erro"><div class="api-ok-d">Falhou: ${esc(e.message)}</div></div>`;
  }
  $('apiBtn').disabled = false;
}

function montarTaxas(){
  if(taxasProntas) return;
  taxasProntas = true;
  const rep = MLFretes.REPUTACOES.find(r => r.id === pml.reputacao) || MLFretes.REPUTACOES[0];
  const pct = v => (v * 100).toFixed(1).replace('.0','').replace('.', ',') + '%';

  $('taxasRep').textContent = 'ANÚNCIO ' + (pml.tipoAnuncio === 'premium' ? 'PREMIUM' : 'CLÁSSICO');
  $('taxasRepFrete').textContent = 'REPUTAÇÃO ' + rep.nome.toUpperCase();

  $('formulaML').innerHTML = [
    ['Preço de venda',        'o que o comprador paga',                       ''],
    ['− Comissão',            'tarifa da categoria, pelo tipo de anúncio',    pct(ML.comissaoPct(pml, null))],
    ['− Redução por faixa',    'categorias selecionadas entre R$ 150 e R$ 700', pml.reducaoPP ? '−' + String(pml.reducaoPP).replace('.', ',') + 'pp' : 'não se aplica'],
    ['− Custo fixo',          'por unidade, em produtos abaixo de R$ 79',     'até R$ 6,75'],
    ['− Custo de envio',      'tabela oficial por peso e faixa de preço',     rep.desc],
    ['  frete abaixo de R$ 79','grátis rápido é opcional; abaixo de R$ 19 paga no máximo metade',
                                                                   pml.freteRapidoAbaixo79 ? 'ofereço rápido' : 'padrão do ML'],
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

  /* Estado de cada regra do frete, para conferência a qualquer momento */
  const regra = (ativa, titulo, detalhe, valor) => `
    <div class="regra ${ativa ? 'on' : 'off'}">
      <span class="regra-ic">${ativa
        ? '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>'}</span>
      <div><div class="regra-t">${esc(titulo)}</div><div class="regra-d">${detalhe}</div></div>
      <span class="regra-v">${esc(valor || '')}</span>
    </div>`;

  const div = pml.divisorVolumetrico || 6000;
  $('regrasFrete').innerHTML = [
    regra(true, 'Reputação da conta',
      'define qual das três tabelas oficiais é usada', rep.nome),
    regra(!!pml.freteAutomatico, 'Frete pela tabela oficial',
      pml.freteAutomatico ? 'calculado pelo peso e pela faixa de preço do anúncio'
                          : 'desligado — usa o valor manual em todos os produtos',
      pml.freteAutomatico ? 'ligado' : ML.brl(pml.freteManual) + ' fixo'),
    regra(!!pml.usarPesoVolumetrico, 'Peso volumétrico',
      pml.usarPesoVolumetrico
        ? `(altura × largura × comprimento) ÷ ${div} — o frete usa o <b>maior</b> entre ele e o peso da balança`
        : 'desligado — o frete usa só o peso da balança, o que pode <b>subestimar</b> produtos grandes e leves',
      pml.usarPesoVolumetrico ? '÷ ' + div : 'desligado'),
    regra(!!pml.freteRapidoAbaixo79, 'Frete grátis rápido abaixo de R$ 79',
      pml.freteRapidoAbaixo79
        ? 'você oferece — paga a tabela da faixa R$ 79 a 99,99'
        : 'você não oferece — de R$ 19 a R$ 78,99 o frete grátis padrão é do Mercado Livre',
      pml.freteRapidoAbaixo79 ? 'ofereço' : 'padrão do ML'),
    regra(true, 'Teto para produtos abaixo de R$ 19',
      'regra do Mercado Livre, sempre aplicada', 'metade do preço'),
    regra(!!pml.pesoPadrao, 'Peso padrão',
      pml.pesoPadrao ? 'usado nos produtos que não trazem peso na planilha'
                     : 'nenhum — produtos sem peso caem no frete manual',
      pml.pesoPadrao ? String(pml.pesoPadrao).replace('.', ',') + ' kg' : ML.brl(pml.freteManual)),
  ].join('');

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
  chk('p_preencherModelo', p.preencherModelo);
  set('p_nomeColunaModelo', p.nomeColunaModelo);
  set('p_origemModelo', p.origemModelo);
  set('p_textoModelo', p.textoModelo);
  mostrarTextoModelo();
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
    preencherModelo: c('p_preencherModelo'),
    nomeColunaModelo: v('p_nomeColunaModelo') || 'Modelo',
    origemModelo: v('p_origemModelo'),
    textoModelo: v('p_textoModelo'),
  };
}
function mostrarTextoModelo(){
  const el = $('p_origemModelo');
  if(el) mostrar('fTextoModelo', el.value === 'fixo');
}
function abrirParams(){ preencherForm(params); $('scrim').classList.add('open'); $('drawer').classList.add('open'); }
function fecharParams(){ $('scrim').classList.remove('open'); $('drawer').classList.remove('open'); }

/* ══ MENU MOBILE ═════════════════════════════════════════════════════════
   Abaixo de 880px o <nav class="menu"> de hover desaparece — não cabe, e
   hover não existe em touch mesmo. Em vez de duplicar os itens de navegação
   num segundo bloco de HTML (que viraria uma segunda fonte para manter toda
   vez que entrar uma ferramenta), o menu real é MOVIDO para dentro do drawer
   quando abre, e devolvido ao lugar de origem quando fecha. O CSS
   (.menu-mobile .menu) só troca a aparência de pílula-com-hover para
   lista-com-acordeão; a marcação é a mesma dos dois lados. */
let menuOrigPai = null, menuOrigProx = null;

function menuMobileAbrir(){
  const nav = document.querySelector('nav.menu');
  const corpo = $('menuMobileBody');
  if(nav && corpo && !corpo.contains(nav)){
    menuOrigPai = nav.parentElement;
    menuOrigProx = nav.nextElementSibling;
    corpo.appendChild(nav);
  }
  $('scrimMenu').classList.add('open');
  $('menuMobile').classList.add('open');
  $('mnHamb').setAttribute('aria-expanded', 'true');
  document.body.classList.add('sem-rolagem');
}

function menuMobileFechar(){
  $('scrimMenu').classList.remove('open');
  $('menuMobile').classList.remove('open');
  $('mnHamb').setAttribute('aria-expanded', 'false');
  if(!document.querySelector('.pop.open, .drawer.open:not(#menuMobile)'))
    document.body.classList.remove('sem-rolagem');

  /* devolve a nav para o cabeçalho — sem isso o menu de desktop sumiria
     se a tela for redimensionada ou girada (iPad) para uma largura maior */
  const nav = document.querySelector('nav.menu');
  if(nav && menuOrigPai){
    if(menuOrigProx) menuOrigPai.insertBefore(nav, menuOrigProx);
    else menuOrigPai.appendChild(nav);
  }
  document.querySelectorAll('.mn.aberto').forEach(m => m.classList.remove('aberto'));
}

/* No modo mobile, tocar no cabeçalho de um marketplace expande o acordeão em
   vez de tentar um hover que não existe. Delegado no documento porque a nav
   só existe dentro do drawer enquanto ele está aberto. */
document.addEventListener('click', e => {
  const alvo = e.target.closest('.mn-t[data-mkt]');
  if(!alvo || alvo.classList.contains('mn-home')) return;
  if(!alvo.closest('.menu-mobile')) return;      // no desktop isso é hover, não clique
  e.preventDefault();
  const grupo = alvo.closest('.mn');
  const abrindo = !grupo.classList.contains('aberto');
  document.querySelectorAll('.menu-mobile .mn.aberto').forEach(m => m.classList.remove('aberto'));
  grupo.classList.toggle('aberto', abrindo);
});

/* qualquer item que realmente navega (Home, uma ferramenta, um capítulo do
   guia) fecha o drawer depois — sem isso a próxima tela abriria atrás dele */
document.addEventListener('click', e => {
  if(!e.target.closest('.menu-mobile')) return;
  const item = e.target.closest('.mn-home, .mn-i:not(.mn-off), .mn-g');
  if(item) setTimeout(menuMobileFechar, 160);
});

/* girar o iPad ou redimensionar a janela para desktop fecha o menu mobile —
   ele ficaria preso "aberto" atrás de um hambúrguer que já sumiu */
addEventListener('resize', () => {
  if(innerWidth > 879 && $('menuMobile').classList.contains('open')) menuMobileFechar();
});
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
addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  fecharParams();
  if($('menuMobile').classList.contains('open')) menuMobileFechar();
});

function plDrop(e){
  e.preventDefault();
  $('plZone').classList.remove('drag');
  plCarregar(e.dataTransfer.files[0]);
}
async function plCarregar(f){
  if(!f) return;
  if(!await garantirXLSX()) return;
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
    {n: m.modelo || 0,      l:'Modelo preenchido',                                    c:'var(--amber)'},
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

/* Arquivo enxuto com Código + Descrição + Modelo, para colar no
   "Importador de campos customizados" do Bling (Produtos). */
function plBaixarModelo(){
  if(!plRes) return;
  const iMod = plRes.mudancas.iModelo;
  if(iMod == null || iMod < 0)
    return alert('A coluna Modelo não está sendo gerada.\n\nLigue "Gerar a coluna Modelo" em Editar parâmetros.');

  const cab = plAoa[0] || [];
  const acha = re => cab.findIndex(h => re.test(String(h)));
  const iCod  = acha(/^(c[óo]digo|sku)$/i);
  const iDesc = PE.colToIndex(params.colDescricao);

  const linhas = [['Código', 'Descrição', String(params.nomeColunaModelo || 'Modelo')]];
  for(let r = 1; r < plRes.aoa.length; r++){
    const modelo = String(plRes.aoa[r][iMod] == null ? '' : plRes.aoa[r][iMod]);
    if(!modelo.trim()) continue;
    linhas.push([
      iCod  >= 0 ? plRes.aoa[r][iCod]  : '',
      iDesc >= 0 ? plRes.aoa[r][iDesc] : '',
      modelo,
    ]);
  }
  if(linhas.length < 2) return alert('Nenhum modelo foi preenchido para exportar.');

  try{
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws['!cols'] = [{wch:18},{wch:52},{wch:52}];
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
    XLSX.writeFile(wb, plNome.replace(/\.[^.]+$/, '') + '_MODELO.xlsx', {bookType:'xlsx'});
  }catch(err){ alert('Não consegui gerar o arquivo: ' + err.message); }
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
    if(plRes.mudancas.iModelo != null && plRes.mudancas.iModelo >= 0){
      alvos.push(plRes.mudancas.iModelo);
      if(plRes.mudancas.modeloNovo) XU.escrever(ws, 0, plRes.mudancas.iModelo, plRes.aoa[0][plRes.mudancas.iModelo]);
    }
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


/* ── workspace da home ───────────────────────────────────────────────────────
   Quatro quadros, um por canal. Clicar abre o quadro no lugar da grade com as
   ferramentas daquele canal — o conteúdo vem das seções que já existiam, só
   que agora escondidas e usadas como fonte. Sem rolagem: a home inteira cabe
   numa tela e o que existe está sempre à vista. */
const WS_CANAIS = {
  ml:          {classe:'mkt-ml',          marca:'<img src="assets/img/logo-ml.svg" alt="Mercado Livre"/>'},
  shopee:      {classe:'mkt-shopee',      marca:'<img src="assets/img/logo-shopee.svg" alt="Shopee"/>'},
  amazon:      {classe:'mkt-amazon',      marca:'<img src="assets/img/logo-amazon.svg" alt="Amazon"/>'},
};

function wsAbrir(canal){
  const info = WS_CANAIS[canal];
  if(!info) return;
  $('wsPainelMarca').innerHTML = info.marca;
  /* a grade muda conforme o canal: com principais, seis colunas (duas
     retangulares em cima ocupando três cada, o apoio embaixo); sem
     principais, os quadros se distribuem sozinhos */
  /* a largura de cada principal sai da conta: seis colunas divididas pelo
     número delas. Com duas, cada uma ocupa três; com três, duas. Assim a
     primeira linha sempre fecha certo em vez de sobrar meia coluna. */
  const nDest = (WS_FERRAMENTAS[canal] || []).filter(f => f.destaque).length;
  const cls = nDest ? ' com-destaque d' + nDest : '';
  $('wsPainelCorpo').innerHTML =
    `<div class="ws-minis${cls}">` + wsCards(canal) + '</div>';
  $('wsPainel').className = 'ws-painel ws-' + canal;
  mostrar('wsGrade', false);
  mostrar('wsPainel', true);
  const primeiro = $('wsPainelCorpo').querySelector('button:not(:disabled)');
  if(primeiro) primeiro.focus({preventScroll:true});
  try{ localStorage.setItem('drop-canal', canal); }catch(e){}
}

function wsFechar(){
  mostrar('wsPainel', false);
  mostrar('wsGrade', true);
  try{ localStorage.removeItem('drop-canal'); }catch(e){}
}

/* Esc fecha, como em qualquer painel que cobre o conteúdo */
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && !$('wsPainel').classList.contains('hide')) wsFechar();
});


/* ── o que existe em cada canal ──────────────────────────────────────────────
   Catálogo em um lugar só: os quadros internos são gerados daqui, e é daqui
   que sai também a explicação que abre ao passar o mouse. Antes a descrição
   de cada ferramenta vivia espalhada pelo HTML e ninguém sabia dizer, de
   fora, o que a ferramenta fazia sem abrir. */
const WS_FERRAMENTAS = {
  ml: [
    {nome:'Precificar Mercado Livre', img:'assets/img/ic-ml.webp', acao:"ir('ml')", destaque:true,
     fluxo:['Planilha do Bling','Preços calculados'],
     resumo:'O preço que entrega a margem que você pediu.',
     itens:['Tarifa real da categoria, consultada no ML',
            'Custo fixo por faixa de preço, pela tabela oficial',
            'Frete pela sua reputação, peso e faixa de preço',
            'Peso volumétrico: cobra pelo maior entre ele e o real',
            'Sai um arquivo pronto para o Bling']},
    {nome:'Planilha de produtos', img:'assets/img/ic-planilha.webp', acao:"ir('planilha')", destaque:true,
     fluxo:['Planilha do fornecedor','Bling'],
     resumo:'Arruma a estrutura do arquivo para subir no Bling sem erro.',
     itens:['Encurta a descrição para os 60 caracteres do anúncio',
            'Tira o bloco cadastral colado no fim da descrição',
            'Preenche a condição do produto como NOVO',
            'Gera a coluna Modelo, que o Mercado Livre exige',
            'Remove termos que o marketplace não aceita',
            'Confere 8 pontos antes de gerar o arquivo']},
    {nome:'Ajustar preços no ML', img:'assets/img/ic-base-ml.webp', acao:"ir('anuncios')", destaque:true,
     fluxo:['Preços calculados','Mercado Livre'],
     resumo:'A planilha do ML volta igual, só com o preço trocado.',
     itens:['Você sobe a planilha do ML e a de preços',
            'Ele casa por SKU e troca só a coluna de preço',
            'O arquivo sai idêntico — título, código e cores intactos',
            'Mostra quanto cada preço muda antes de você subir',
            'É só mandar de volta para o Mercado Livre']},
    {nome:'Consultar um produto', img:'assets/img/ic-base-ml.webp', acao:"irMercado('produto')",
     resumo:'Comissão e exigências de um produto.',
     itens:['Tarifa da categoria', 'O que a ficha do anúncio obriga']},
    {nome:'Ficha do anúncio', img:'assets/img/ic-planilha.webp', acao:"irMercado('ficha')",
     resumo:'O que a categoria obriga preencher.',
     itens:['Campos obrigatórios', 'Campos que ajudam a vender']},
    {nome:'Mais vendidos', img:'assets/img/ic-base-ml.webp', acao:"irMercado('campeoes')",
     resumo:'O ranking de cada categoria.',
     itens:['Os campeões por categoria', 'Preço praticado por eles']},
    {nome:'Em alta agora', img:'assets/img/ic-base-shop.webp', acao:"irMercado('tendencias')",
     resumo:'O que estão procurando hoje.',
     itens:['Termos em alta no site', 'Serve para achar produto novo']},
    {nome:'Categorias', img:'assets/img/ic-shopee.webp', acao:"irMercado('categorias')",
     resumo:'A árvore e os códigos.',
     itens:['Estrutura completa', 'Código de cada categoria']},
    {nome:'Envios', img:'assets/img/ic-base-shop.webp', acao:"irMercado('envios')",
     resumo:'Modalidades ativas no site.',
     itens:['Formas de entrega', 'Regra de cada uma']},
  ],
  shopee: [
    {nome:'Precificar Shopee', img:'assets/img/ic-shopee.webp', acao:"mkAbrir('shopee')", destaque:true,
     fluxo:['Planilha de custos','Preços da Shopee'],
     resumo:'O preço que entrega a margem, com a tabela de 2026.',
     itens:['A comissão da Shopee é por faixa de preço, não por categoria',
            'Percentual mais valor fixo: 20% + R$ 4 até R$ 79,99; 14% + R$ 16 acima',
            'O teto de R$ 100 por item acabou em março de 2026',
            'No modelo padrão o vendedor não paga frete',
            'Avisa quando o preço cai logo acima da virada dos R$ 80']},
    {nome:'Base da Shopee', img:'assets/img/ic-base-shop.webp', breve:true,
     resumo:'Reprocessar o que já está no ar.',
     itens:['Revisar preço do que já está publicado']},
  ],
  amazon: [
    {nome:'Precificar Amazon', img:'assets/img/ic-ml.webp', acao:"mkAbrir('amazon')", destaque:true,
     fluxo:['Planilha de custos','Preços da Amazon'],
     resumo:'O preço que entrega a margem, por categoria.',
     itens:['A comissão é por categoria: 37 delas, de 10% a 15%',
            'Tem piso em reais — produto barato paga o piso, não o percentual',
            'Móveis e acessórios de eletrônicos são escalonados',
            'Abaixo de R$ 79 a logística é tarifa fixa, sem olhar o peso',
            'Não existe taxa de fechamento no Brasil']},
    {nome:'Base da Amazon', img:'assets/img/ic-base-ml.webp', breve:true,
     resumo:'Reprocessar o que já está no ar.',
     itens:['Revisar preço do que já está publicado']},
  ],
};

/* Monta os quadros de dentro do canal. Mesmo desenho da home — quadrados,
   iguais entre si — só que menores, porque aqui já se sabe qual é o canal. */
/* De onde o arquivo vem e para onde vai. Uma ferramenta de planilha só faz
   sentido quando se sabe o que entra e o que sai — sem isso a pessoa abre
   para descobrir, e às vezes abre a errada. */
function wsFluxo(f){
  const [de, para] = f;
  return `<span class="ws-fluxo">
    <span class="ws-fluxo-p">${esc(de)}</span>
    <svg viewBox="0 0 24 24"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
    <span class="ws-fluxo-p">${esc(para)}</span>
  </span>`;
}

function wsCards(canal){
  const lista = WS_FERRAMENTAS[canal] || [];
  return lista.map((f, i) => {
    const cls = 'ws-mini' + (f.destaque ? ' destaque' : '') + (f.breve ? ' breve' : '');
    const clique = f.breve ? '' : ` onclick="${f.acao}"`;
    /* a principal é retangular e mostra o resumo: ela tem o dobro da largura,
       então cabe dizer o que faz sem depender do balão */
    return `<button class="${cls}"${clique}${f.breve ? ' disabled' : ''}
        onmouseenter="wsExplicar(this,'${canal}',${i})" onmouseleave="wsEsconder()"
        onfocus="wsExplicar(this,'${canal}',${i})" onblur="wsEsconder()">
      <span class="ws-mini-ic"><img src="${f.img}" alt="" loading="lazy"/></span>
      <span class="ws-mini-txt">
        <span class="ws-mini-n">${esc(f.nome)}</span>
        ${f.destaque ? `<span class="ws-mini-r">${esc(f.resumo)}</span>` : ''}
        ${f.destaque && f.fluxo ? wsFluxo(f.fluxo) : ''}
      </span>
      ${f.breve ? '<span class="ws-mini-tag">em breve</span>' : ''}
    </button>`;
  }).join('');
}

/* A explicação abre ao lado do quadro, não dentro: o quadro fica pequeno de
   propósito, e a lista do que a ferramenta faz não caberia nele. */
let wsTimer = null;
function wsExplicar(el, canal, i){
  clearTimeout(wsTimer);
  const f = (WS_FERRAMENTAS[canal] || [])[i];
  if(!f) return;
  const pop = $('wsPop');
  pop.innerHTML = `
    <div class="ws-pop-h">
      <img src="${f.img}" alt=""/>
      <div><div class="ws-pop-t">${esc(f.nome)}</div>
        <div class="ws-pop-s">${esc(f.resumo)}</div></div>
    </div>
    ${f.fluxo ? wsFluxo(f.fluxo) : ''}
    <ul class="ws-pop-l">${(f.itens || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    ${f.breve ? '<div class="ws-pop-breve">Ainda não está no ar — está sendo preparada.</div>' : ''}`;

  /* fica preso à tela: sem isso o balão sai pela direita nos últimos quadros */
  const r = el.getBoundingClientRect();
  pop.classList.remove('hide');
  const larg = pop.offsetWidth, alt = pop.offsetHeight;
  let x = r.left + r.width / 2 - larg / 2;
  x = Math.max(12, Math.min(x, window.innerWidth - larg - 12));
  let y = r.bottom + 10;
  if(y + alt > window.innerHeight - 12) y = Math.max(12, r.top - alt - 10);
  pop.style.left = x + 'px';
  pop.style.top = y + 'px';
}
function wsEsconder(){
  wsTimer = setTimeout(() => $('wsPop').classList.add('hide'), 90);
}
