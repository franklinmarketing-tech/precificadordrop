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

const VERSAO = 'v1';
const CACHE_SHELL = `pdrop-shell-${VERSAO}`;
const CACHE_MIDIA = `pdrop-midia-${VERSAO}`;

const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/hub.css',
  '/assets/views.css',
  '/assets/app.js',
  '/assets/ml-engine.js',
  '/assets/ml-fretes.js',
  '/assets/planilha-engine.js',
  '/assets/xlsx-utils.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_SHELL)
      .then(c => c.addAll(SHELL))
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
        .catch(() => caches.match(request).then(r => r || caches.match('/index.html')))
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
