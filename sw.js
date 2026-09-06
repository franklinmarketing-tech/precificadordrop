/* ══════════════════════════════════════════════════════════════════════════
   Service worker do Precificador Drop.

   Duas estratégias, escolhidas pelo tipo de arquivo:

   - HTML, JS, CSS (o "shell" do app): network-first. Tenta a rede sempre
     primeiro — assim quem já instalou o app vê a versão nova no minuto em
     que ela é publicada, sem precisar desinstalar nada. Só cai para o cache
     quando a rede falha (offline de verdade), e é isso que permite abrir o
     app sem internet depois da primeira visita.

   - Ícones e imagens: cache-first. Elas quase não mudam, então poupar a
     rede vale mais que checar se há uma versão nova.

   O nome do cache é versionado: subir esse número invalida o cache antigo
   inteiro na próxima ativação. Só precisa mudar em atualização grande do
   shell (ex.: renomeou um arquivo); no dia a dia o network-first já garante
   a versão atual sem precisar tocar aqui.
   ══════════════════════════════════════════════════════════════════════════ */

const VERSAO = 'v2';   // v2: a lista abaixo passou a ter os 12 scripts
const CACHE_SHELL = `pdrop-shell-${VERSAO}`;
const CACHE_MIDIA = `pdrop-midia-${VERSAO}`;

/* Tem de listar TODOS os scripts que o index.html carrega. Faltavam sete —
   os de marketplace, os de anúncios e o pwa.js — e offline eles caíam no
   fallback de HTML, ou seja, o navegador recebia uma página inteira como
   corpo de um .js e a tela quebrava com "Unexpected token '<'". */
const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/hub.css',
  '/assets/views.css',
  '/assets/xlsx-utils.js',
  '/assets/ml-fretes.js',
  '/assets/ml-engine.js',
  '/assets/planilha-engine.js',
  '/assets/mkt-engine.js',
  '/assets/mkt-amazon.js',
  '/assets/mkt-shopee.js',
  '/assets/anuncios-engine.js',
  '/assets/app.js',
  '/assets/anuncios-ui.js',
  '/assets/mkt-ui.js',
  '/assets/pwa.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_SHELL)
      /* um a um em vez de addAll: com addAll, um único arquivo que falhe
         derruba a instalação inteira em silêncio e o app fica SEM offline
         nenhum. Assim o que baixou fica guardado, e o que faltou volta a ser
         tentado na próxima visita. */
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())          // ativa sem esperar as abas antigas fecharem
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(
        nomes.filter(n => n !== CACHE_SHELL && n !== CACHE_MIDIA).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())        // assume o controle das abas já abertas
  );
});

const ehShell = url =>
  url.pathname.endsWith('.js') || url.pathname.endsWith('.css') ||
  url.pathname.endsWith('.html') || url.pathname === '/';

const ehMidia = url =>
  /\.(png|webp|jpg|jpeg|svg|ico|woff2?)$/i.test(url.pathname);

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;   // nunca intercepta a API do Mercado Livre
  if (url.pathname.startsWith('/api/')) return;  // as funções de servidor não são cacheadas

  if (ehShell(url)) {
    event.respondWith(
      fetch(request)
        .then(resp => {
          const copia = resp.clone();
          caches.open(CACHE_SHELL).then(c => c.put(request, copia));
          return resp;
        })
        /* O fallback para o index só vale para NAVEGAÇÃO. Devolver HTML no
           lugar de um .js que não está no cache produzia um erro de sintaxe
           em vez de uma falha de rede honesta. */
        .catch(() => caches.match(request).then(r =>
          r || (request.mode === 'navigate' ? caches.match('/index.html') : Promise.reject(new Error('offline')))))
    );
    return;
  }

  if (ehMidia(url)) {
    event.respondWith(
      caches.match(request).then(cache => cache || fetch(request).then(resp => {
        const copia = resp.clone();
        caches.open(CACHE_MIDIA).then(c => c.put(request, copia));
        return resp;
      }))
    );
  }
});

/* a página pode pedir para o SW ativo assumir na hora, via postMessage —
   usado pelo aviso de "nova versão disponível" */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
