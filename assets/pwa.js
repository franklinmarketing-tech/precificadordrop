/* ══════════════════════════════════════════════════════════════════════════
   PWA — service worker, deteção de plataforma e o banner de instalação.

   Android, Chrome, Edge e a maioria dos PCs disparam o evento
   `beforeinstallprompt`: o navegador avisa que pode instalar e entrega um
   prompt nativo do sistema para acionar. iOS e iPadOS não têm esse evento —
   lá a instalação só existe pelo Safari, em Compartilhar → Adicionar à Tela
   de Início — então para essas plataformas o banner abre o passo a passo em
   vez de tentar um prompt que não existe.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── service worker ──────────────────────────────────────────────────────
   Sem ele o Chrome/Edge/Android não oferece instalar (é pré-requisito do
   `beforeinstallprompt`), e o app não abre offline depois da primeira visita. */
if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      /* quando uma versão nova termina de baixar em segundo plano, avisa —
         sem isso a pessoa ficaria na versão antiga até fechar e reabrir o app */
      reg.addEventListener('updatefound', () => {
        const novo = reg.installing;
        if (!novo) return;
        novo.addEventListener('statechange', () => {
          if (novo.state === 'installed' && navigator.serviceWorker.controller)
            pwaAplicarOuAvisar(reg);
        });
      });

      /* já havia uma versão nova esperando de uma visita anterior: quem
         instalou o app e nunca clicou no aviso ficava preso na antiga */
      if (reg.waiting && navigator.serviceWorker.controller) pwaAplicarOuAvisar(reg);

      /* ── forçar a busca por versão nova ───────────────────────────────
         O navegador só checa o sw.js sozinho numa navegação. Quem instalou
         o PWA passa dias com o app aberto e nunca navega, então nunca via a
         atualização. Aqui a checagem acontece ao abrir, toda vez que o app
         volta para a frente, e de meia em meia hora enquanto fica aberto. */
      const checar = () => { try{ reg.update(); }catch(e){} };
      checar();
      addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checar();
      });
      addEventListener('online', checar);
      setInterval(checar, 30 * 60 * 1000);
    }).catch(() => { /* offline na primeira visita: sem SW, só sem cache */ });
  });

  /* a aba recarrega sozinha assim que o SW novo assume — só depois de o
     usuário confirmar no aviso, nunca no meio do que ele está fazendo */
  let jaRecarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (jaRecarregou) return;
    jaRecarregou = true;
    location.reload();
  });
}

/* Uma planilha carregada só existe na memória da aba: recarregar no meio
   do trabalho jogaria fora o arquivo que a pessoa acabou de subir. Então a
   atualização entra sozinha quando a tela está limpa, e vira convite quando
   há trabalho em andamento. */
function pwaTemTrabalho(){
  /* declaradas com `let` nos outros scripts, essas variáveis NÃO existem em
     window — só o typeof enxerga, e sem ele um nome ausente vira ReferenceError */
  const cheio = v => Array.isArray(v) ? v.length > 0 : !!v;
  try{
    if (typeof mlAoa       !== 'undefined' && cheio(mlAoa))       return true;  // ML calcular preços
    if (typeof mkAoa       !== 'undefined' && cheio(mkAoa))       return true;  // Shopee / Amazon
    if (typeof plAoa       !== 'undefined' && cheio(plAoa))       return true;  // planilha do Bling
    if (typeof dgAoa       !== 'undefined' && cheio(dgAoa))       return true;  // caçador de degrau
    if (typeof anAoaML     !== 'undefined' && cheio(anAoaML))     return true;  // ajustar preços do ML
    if (typeof anAoaPrecos !== 'undefined' && cheio(anAoaPrecos)) return true;
  }catch(e){ return true; }   // na dúvida, não recarrega por conta própria
  return false;
}

function pwaAplicarOuAvisar(reg){
  if (pwaTemTrabalho()) { pwaAvisarAtualizacao(reg); return; }
  /* sem nada aberto: aplica na hora. O controllerchange lá em cima recarrega
     a aba, e a pessoa cai na versão nova sem precisar de clique nenhum. */
  if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
  else pwaAvisarAtualizacao(reg);
}

function pwaAvisarAtualizacao(reg){
  const el = document.createElement('div');
  el.className = 'pwa-toast';
  el.innerHTML = `
    <span>Uma versão nova do hub chegou.</span>
    <button id="pwaAtualizarBtn">Atualizar</button>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  el.querySelector('#pwaAtualizarBtn').onclick = () => {
    if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
    el.remove();
  };
}

/* ── plataforma ───────────────────────────────────────────────────────── */
const pwaEhIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS 13+ se anuncia como Mac
const pwaJaInstalado = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let pwaPrompt = null;         // o beforeinstallprompt guardado, para disparar depois
const PWA_CHAVE = 'pdrop.pwa.dispensou';

addEventListener('beforeinstallprompt', e => {
  e.preventDefault();          // o Chrome mostraria seu próprio mini-banner; usamos o nosso
  pwaPrompt = e;
  pwaMostrarSePossivel();
});

addEventListener('appinstalled', () => {
  pwaPrompt = null;
  $('pwaBanner') && $('pwaBanner').classList.add('hide');
  $('peInstalar') && $('peInstalar').classList.add('hide');
});

function pwaMostrarSePossivel(){
  if (pwaJaInstalado()) return;
  const b = $('pwaBanner'), p = $('peInstalar');
  if (p) p.classList.remove('hide');           // o link do rodapé fica sempre disponível

  let dispensou = false;
  try{ dispensou = localStorage.getItem(PWA_CHAVE) === '1'; }catch(e){}
  if (dispensou || !b) return;
  if (pwaPrompt || pwaEhIOS) setTimeout(() => b.classList.remove('hide'), 1400);
}

function pwaFechar(){
  $('pwaBanner').classList.add('hide');
  try{ localStorage.setItem(PWA_CHAVE, '1'); }catch(e){}
}

/* acionado pelo botão do banner OU pelo link "Instalar app" no rodapé */
async function pwaInstalar(){
  if (pwaEhIOS){ pwaAbrirIOS(); return; }
  if (!pwaPrompt){ pwaAbrirIOS(); return; }     // navegador sem suporte: mostra o passo a passo como último recurso

  pwaPrompt.prompt();
  const { outcome } = await pwaPrompt.userChoice;
  pwaPrompt = null;
  $('pwaBanner').classList.add('hide');
  if (outcome === 'accepted') try{ localStorage.setItem(PWA_CHAVE, '1'); }catch(e){}
}

/* o link do rodapé: se já sabe que pode instalar direto, instala; senão, explica */
function pwaAbrirInstalacao(){
  if (pwaJaInstalado()){
    alert('O Precificador Drop já está instalado neste aparelho.');
    return;
  }
  if (pwaEhIOS || !pwaPrompt) pwaAbrirIOS();
  else pwaInstalar();
}

function pwaAbrirIOS(){
  $('scrimIOS').classList.add('open');
  $('popIOS').classList.add('open');
  document.body.classList.add('sem-rolagem');
}
function pwaFecharIOS(){
  $('scrimIOS').classList.remove('open');
  $('popIOS').classList.remove('open');
  if (!document.querySelector('.pop.open, .drawer.open'))
    document.body.classList.remove('sem-rolagem');
}

/* No iOS o beforeinstallprompt nunca dispara, então o banner depende só da
   plataforma — mostra assim que a página termina de carregar. */
addEventListener('DOMContentLoaded', () => {
  if (pwaEhIOS) pwaMostrarSePossivel();
});
