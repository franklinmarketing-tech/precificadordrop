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
            pwaAvisarAtualizacao(reg);
        });
      });
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
