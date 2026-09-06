/* ══════════════════════════════════════════════════════════════════════════
   Confere as amarras entre HTML, CSS e JavaScript.

   Este app não tem build nem framework: uma classe escrita no HTML e esquecida
   no CSS não dá erro nenhum — só um layout torto que ninguém liga ao commit
   que o causou. O mesmo vale para um onclick que chama função que não existe
   mais, e para um id repetido, em que getElementById devolve sempre o primeiro
   e o segundo campo passa a ser ignorado em silêncio.

   Aconteceu com .nota-box, .mk-marca, .campo, .campos, .c-num, com mktAbrir e
   com o id apiPreco duplicado — todos descobertos só quando alguém abriu a
   tela. Este arquivo existe para que a próxima vez apareça no `npm test`.

   Sem dependência nenhuma: lê os arquivos como texto e compara conjuntos. As
   funções trabalham sobre TEXTO, não sobre caminhos, para que os testes possam
   alimentá-las com casos sintéticos e provar que o lint de fato pega cada
   defeito — um lint que só sabe dizer "está tudo bem" não vale nada.
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

/* Classes aplicadas pelo próprio JS como estado, ou que existem só para o JS
   achar o elemento. Sem esta lista o lint viraria ruído e ninguém olharia. */
const CLASSES_SEM_CSS_OK = new Set(['hide', 'open', 'active', 'drag', 'pronto', 'aqui', 'on']);

/* O que o navegador dá de graça, o que vem de biblioteca externa e os métodos
   encadeados que a regex de onclick captura junto (e.target.closest(), etc.). */
const GLOBAIS = new Set([
  'alert', 'confirm', 'prompt', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'setTimeout', 'clearTimeout', 'fetch', 'encodeURIComponent', 'decodeURIComponent',
  'getElementById', 'querySelector', 'querySelectorAll', 'click', 'preventDefault',
  'stopPropagation', 'closest', 'remove', 'add', 'toggle', 'contains', 'focus', 'blur',
  'XLSX', 'JSZip', 'Number', 'String', 'Boolean', 'Math', 'JSON', 'Date', 'Array',
  'Object', 'URL', 'Set', 'Map', 'Promise', 'RegExp', 'Error',
]);

/* Tira os trechos ${...} de um valor de class, respeitando chaves aninhadas.
   Um split por regex não serve: `${x ? 'a' : (y||{}).z}` tem chave dentro, e a
   regex fecharia cedo, deixando pedaços de código virarem "classe". */
function semInterpolacao(valor) {
  let saida = '', i = 0;
  while (i < valor.length) {
    if (valor[i] === '$' && valor[i + 1] === '{') {
      let nivel = 1;
      i += 2;
      while (i < valor.length && nivel > 0) {
        if (valor[i] === '{') nivel++;
        else if (valor[i] === '}') nivel--;
        i++;
      }
      saida += ' ';               // o que sai daqui não dá para saber lendo
    } else {
      saida += valor[i++];
    }
  }
  return saida;
}

function classesUsadas(fontes) {
  const achadas = new Map();
  for (const { nome, texto } of fontes) {
    const re = /class="([^"]*)"/g;
    let m;
    while ((m = re.exec(texto))) {
      for (const bruto of semInterpolacao(m[1]).split(/\s+/)) {
        const c = bruto.trim();
        if (!c || CLASSES_SEM_CSS_OK.has(c)) continue;
        if (/[-_]$/.test(c)) continue;      // "rep-" em class="rep-${id}" é prefixo
        if (!achadas.has(c)) achadas.set(c, new Set());
        achadas.get(c).add(nome);
      }
    }
  }
  return achadas;
}

function classesDefinidas(folhas) {
  const def = new Set();
  for (const folha of folhas) {
    const texto = folha.replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /(^|\})([^{}]+)\{/g;
    let m;
    while ((m = re.exec(texto))) {
      if (/^\s*@/.test(m[2])) continue;     // @media, @keyframes…
      const rc = /\.(-?[_a-zA-Z][\w-]*)/g;
      let c;
      while ((c = rc.exec(m[2]))) def.add(c[1]);
    }
  }
  return def;
}

function funcoesChamadasNoHtml(html) {
  const chamadas = new Set();
  const re = /\son(?:click|change|input|submit|dragover|dragleave|drop)="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    const rf = /([A-Za-z_$][\w$]*)\s*\(/g;
    let f;
    while ((f = rf.exec(m[1]))) chamadas.add(f[1]);
  }
  return chamadas;
}

function funcoesDefinidas(scripts) {
  const def = new Set(GLOBAIS);
  for (const texto of scripts) {
    let m;
    const rf = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
    while ((m = rf.exec(texto))) def.add(m[1]);
    const rv = /(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g;
    while ((m = rv.exec(texto))) def.add(m[1]);
  }
  return def;
}

function idsNoHtml(html) {
  const conta = new Map();
  const re = /\sid="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) conta.set(m[1], (conta.get(m[1]) || 0) + 1);
  return conta;
}

function idsUsadosNoJs(fontes) {
  const usados = new Map();
  for (const { nome, texto } of fontes) {
    const re = /(?:\$\(|getElementById\()\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(texto))) {
      if (!usados.has(m[1])) usados.set(m[1], new Set());
      usados.get(m[1]).add(nome);
    }
  }
  return usados;
}

/* ids que o próprio JS cria. Três formas:
   - literal no template: id="mkUniAlerta"
   - prefixo + interpolação: id="mkP_${f.id}"  → guarda o prefixo
   - passado como argumento para quem monta o campo: sel('mkColCusto', …), que
     desemboca em id="${id}". O sinal é o nome aparecer no arquivo como string
     em algum lugar que NÃO seja $(...). Se só aparece dentro de $(), ninguém o
     cria — e é exatamente o defeito que queremos pegar. */
function idsCriadosNoJs(fontes) {
  const criados = new Set();
  const prefixos = [];
  const passados = new Set();

  for (const { texto } of fontes) {
    let m;
    const fixo = /id="([^"$]+)"/g;
    while ((m = fixo.exec(texto))) criados.add(m[1]);

    const dinamico = /id="([^"]*)\$\{/g;
    while ((m = dinamico.exec(texto))) if (m[1]) prefixos.push(m[1]);

    const semBusca = texto.replace(/(?:\$\(|getElementById\()\s*'[^']+'/g, ' ');
    const solta = /'([A-Za-z][\w-]*)'/g;
    while ((m = solta.exec(semBusca))) passados.add(m[1]);
  }
  return { criados, prefixos, passados };
}

/* ── o relatório ──────────────────────────────────────────────────────────
   `fontes` = {html, css: [texto…], js: [{nome, texto}…]} */
function analisar(fontes) {
  const problemas = [];
  const paginas = [{ nome: 'index.html', texto: fontes.html }].concat(fontes.js);

  const definidas = classesDefinidas(fontes.css);
  for (const [classe, onde] of classesUsadas(paginas)) {
    if (!definidas.has(classe))
      problemas.push(`classe .${classe} usada em ${[...onde].join(', ')} e não definida em nenhum CSS`);
  }

  const defs = funcoesDefinidas(fontes.js.map(x => x.texto));
  for (const f of funcoesChamadasNoHtml(fontes.html)) {
    if (!defs.has(f))
      problemas.push(`o HTML chama ${f}() e essa função não existe em assets/*.js`);
  }

  const ids = idsNoHtml(fontes.html);
  for (const [id, n] of ids) {
    if (n > 1)
      problemas.push(`id "${id}" aparece ${n} vezes no HTML — getElementById devolve só o primeiro`);
  }

  const { criados, prefixos, passados } = idsCriadosNoJs(fontes.js);
  for (const [id, onde] of idsUsadosNoJs(fontes.js)) {
    if (ids.has(id) || criados.has(id) || passados.has(id)) continue;
    if (prefixos.some(p => id.startsWith(p))) continue;
    problemas.push(`$('${id}') em ${[...onde].join(', ')} aponta para um id que não existe em lugar nenhum`);
  }

  return problemas;
}

/* Lê o projeto do disco e analisa. */
function rodarLint() {
  const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const js = fs.readdirSync(path.join(RAIZ, 'assets'))
    .filter(f => f.endsWith('.js'))
    .map(f => ({ nome: 'assets/' + f, texto: ler('assets/' + f) }));
  return analisar({
    html: ler('index.html'),
    css: [ler('assets/hub.css'), ler('assets/views.css')],
    js,
  });
}

module.exports = { rodarLint, analisar };
