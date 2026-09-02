/* ══════════════════════════════════════════════════════════════════════════
   Precificador Drop — Engine de edição de planilha de produtos
   Usada por planilha.html (navegador) e pelos testes em Node.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PlanilhaEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ── Parâmetros padrão (editáveis pelo usuário na interface) ─────────────── */
const DEFAULT_PARAMS = {
  abaOriginal: 'Original',
  abaModificado: 'Modificado',
  renomearAbaOriginal: true,
  incluirAbaOriginal: false,   // por padrão o arquivo sai só com a aba corrigida

  // Coluna C — Descrição
  colDescricao: 'C',
  maxDescricao: 60,
  limparPontuacaoFinal: true,
  // termos apagados da descrição antes de qualquer resumo (marca, prefixo etc.)
  palavrasRemover: ['WE DROP'],
  removerNaCurta: false,   // aplicar a remoção também na descrição curta
  abreviacoes: [
    ['Infantil', 'Inf.'],
    ['Eletrônico', 'Eletr.'],
    ['Eletrônica', 'Eletr.'],
    ['Recarregável', 'Recarr.'],
    ['Revestimento', 'Revest.'],
    ['Controle Remoto', 'C. Remoto'],
    ['Magnético', 'Magn.'],
    ['Educativo', 'Educ.'],
    ['Dinossauro', 'Dino'],
    ['Impressão', 'Impr.'],
    ['Automático', 'Autom.'],
    ['Portátil', 'Port.'],
    ['Conjunto', 'Cj.'],
    ['Unidades', 'Un.'],
    ['Centímetros', 'cm'],
    ['Peças', 'Pçs'],
  ],
  stopwords: ['com', 'de', 'da', 'do', 'para'],

  // Coluna AP — Descrição Curta
  colDescricaoCurta: 'AP',
  camposCadastrais: [
    'SKU', 'EAN', 'GTIN', 'Marca', 'NCM', 'Nome fiscal',
    'Dimensões (cm)', 'Peso (g)', 'Preço',
  ],
  camposAncora: ['SKU', 'EAN'],   // o bloco só é removido se contiver um destes
  minCamposBloco: 2,              // nº mínimo de campos seguidos pra ser bloco

  // Coluna AV — Condição do Produto
  colCondicao: 'AV',
  valorCondicao: 'NOVO',
};

/* ── Utilidades de coluna ────────────────────────────────────────────────── */
function colToIndex(col) {
  if (typeof col === 'number') return col;
  const s = String(col).trim().toUpperCase();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  let n = 0;
  for (const ch of s) {
    const v = ch.charCodeAt(0) - 64;
    if (v < 1 || v > 26) return -1;
    n = n * 26 + v;
  }
  return n - 1;
}
function indexToCol(i) {
  let s = '', n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/* ── Helpers de texto ────────────────────────────────────────────────────── */
const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// tira tags, normaliza espaços/nbsp
function normalizar(txt) {
  return String(txt)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// remove hífen/vírgula/traço pendurado no fim ("... Com Tampa -" → "... Com Tampa")
function aparar(txt) {
  return String(txt).replace(/[\s\-–—,;:/|]+$/u, '').trim();
}

/* Apaga termos indesejados (marca, prefixo de fornecedor…) e limpa o
   separador que sobra: "WE DROP - Conjunto 5 Potes" → "Conjunto 5 Potes".
   O espaço dentro do termo é flexível, então "WE DROP" também casa
   "WEDROP" e "WE  DROP".                                              */
function removerPalavras(texto, params) {
  const p = params || DEFAULT_PARAMS;
  let s = String(texto == null ? '' : texto);
  const lista = (p.palavrasRemover || []).map(t => String(t).trim()).filter(Boolean);
  if (!lista.length) return s;

  for (const termo of lista) {
    const corpo = termo.split(/\s+/).map(escapeRe).join('\\s*');
    const ini = /^\w/.test(termo) ? '(?<!\\w)' : '';
    const fim = /\w$/.test(termo) ? '(?!\\w)'  : '';
    let re;
    try { re = new RegExp(ini + corpo + fim, 'gi'); }
    catch (e) { re = new RegExp(corpo, 'gi'); }   // navegador sem lookbehind
    s = s.replace(re, ' ');
  }
  return s.replace(/[ \t]+/g, ' ')
          .replace(/^[\s\-–—,;:/|]+/u, '')   // separador órfão no começo
          .replace(/\s+([,;:.!?])/g, '$1')
          .trim();
}

/* ── 1) Resumo da descrição (coluna C) ───────────────────────────────────── */
/* Estratégia incremental: aplica só o mínimo necessário pra caber no limite.
   1. normaliza  2. abreviações (uma a uma)  3. stopwords (da direita p/ a
   esquerda, preservando o início)  4. corte em palavra inteira.            */
function resumirDescricao(texto, params) {
  const p = params || DEFAULT_PARAMS;
  const max = p.maxDescricao;

  let s = removerPalavras(normalizar(texto), p);
  if (p.limparPontuacaoFinal) s = aparar(s);
  if (!s || s.length <= max) return s;

  // 2. abreviações, uma de cada vez, até caber
  for (const par of (p.abreviacoes || [])) {
    if (s.length <= max) break;
    const [de, para] = Array.isArray(par) ? par : [par.de, par.para];
    if (!de) continue;
    // \b só funciona ao lado de caractere de palavra; para termos como
    // "(Novo)" ou "50%" a borda vira "início/fim ou não-palavra"
    const ini = /^\w/.test(de) ? '\\b' : '(?<![\\w])';
    const fim = /\w$/.test(de) ? '\\b' : '(?![\\w])';
    let re;
    try { re = new RegExp(ini + escapeRe(de) + fim, 'gi'); }
    catch (e) { re = new RegExp(escapeRe(de), 'gi'); }   // navegador sem lookbehind
    if (re.test(s)) s = s.replace(re, para).replace(/\s+/g, ' ').trim();
  }
  if (s.length <= max) return p.limparPontuacaoFinal ? aparar(s) : s;

  // 3. stopwords da direita para a esquerda (o começo do título é o que importa)
  const sw = new Set((p.stopwords || []).map(w => w.toLowerCase()));
  if (sw.size) {
    let palavras = s.split(' ');
    for (let i = palavras.length - 1; i >= 1 && palavras.join(' ').length > max; i--) {
      if (sw.has(palavras[i].toLowerCase())) palavras.splice(i, 1);
    }
    s = palavras.join(' ').replace(/\s+/g, ' ').trim();
  }
  if (s.length <= max) return p.limparPontuacaoFinal ? aparar(s) : s;

  // 4. corte em palavra inteira
  const corte = s.slice(0, max + 1);
  const ult = corte.lastIndexOf(' ');
  s = (ult > max * 0.5 ? corte.slice(0, ult) : s.slice(0, max));
  return aparar(s).slice(0, max);
}

/* ── 2) Remoção do bloco cadastral final (coluna AP) ─────────────────────── */
/* Só remove o bloco CONTÍGUO no fim do texto formado por linhas "Campo: valor".
   Ocorrências dessas palavras no meio da descrição comercial são preservadas. */
function limparBlocoCadastral(texto, params) {
  const p = params || DEFAULT_PARAMS;
  const original = String(texto == null ? '' : texto);
  const campos = (p.camposCadastrais || []).filter(Boolean);
  if (!campos.length || !original.trim()) return { texto: original, removido: '', encontrou: false };

  const reCampo = new RegExp('^\\s*(?:' + campos.map(escapeRe).join('|') + ')\\s*:', 'i');
  const reAncora = (p.camposAncora && p.camposAncora.length)
    ? new RegExp('^\\s*(?:' + p.camposAncora.map(escapeRe).join('|') + ')\\s*:', 'i')
    : null;

  // fatia em linhas lógicas preservando os separadores (\n ou <br>)
  const partes = original.split(/(\r?\n|<br\s*\/?>)/gi);
  const linhas = [];                        // {texto, sepDepois, idx}
  for (let i = 0; i < partes.length; i += 2) {
    linhas.push({ texto: partes[i], sep: partes[i + 1] || '', idx: i });
  }

  let i = linhas.length - 1, achados = 0, temAncora = false, primeiraDoBloco = -1;
  while (i >= 0) {
    const t = linhas[i].texto.trim();
    if (t === '') { i--; continue; }                 // pula linhas vazias do fim
    if (!reCampo.test(t)) break;                     // acabou o bloco
    achados++;
    if (reAncora && reAncora.test(t)) temAncora = true;
    primeiraDoBloco = i;
    i--;
  }

  const ok = achados >= (p.minCamposBloco || 2) && (!reAncora || temAncora);
  if (!ok) return { texto: original, removido: '', encontrou: false };

  const mantido = linhas.slice(0, primeiraDoBloco).map(l => l.texto + l.sep).join('');
  const removido = linhas.slice(primeiraDoBloco).map(l => l.texto + l.sep).join('');
  return {
    texto: mantido.replace(/(?:\s|<br\s*\/?>)+$/gi, ''),
    removido: removido.trim(),
    encontrou: true,
    campos: achados,
  };
}

/* ── 3) Processamento da planilha inteira ────────────────────────────────── */
/* aoa = array de arrays (linha 0 = cabeçalho). Retorna nova matriz + relatório. */
function processar(aoa, params) {
  const p = Object.assign({}, DEFAULT_PARAMS, params || {});
  const iC = colToIndex(p.colDescricao);
  const iAP = colToIndex(p.colDescricaoCurta);
  const iAV = colToIndex(p.colCondicao);

  const largura = aoa.reduce((m, r) => Math.max(m, r.length), 0);
  const saida = aoa.map(linha => {
    const nova = new Array(largura);
    for (let c = 0; c < largura; c++) nova[c] = linha[c] === undefined ? '' : linha[c];
    return nova;
  });

  const mudancas = { descricao: [], curta: [], condicao: 0 };

  for (let r = 1; r < saida.length; r++) {
    const linha = saida[r];

    // C — resumo
    if (iC >= 0) {
      const antes = String(linha[iC] == null ? '' : linha[iC]);
      if (antes.trim()) {
        const depois = resumirDescricao(antes, p);
        if (depois !== antes) {
          linha[iC] = depois;
          mudancas.descricao.push({ linha: r + 1, antes, depois });
        }
      }
    }

    // AP — bloco cadastral (e, se pedido, também os termos removidos)
    if (iAP >= 0) {
      const antes = String(linha[iAP] == null ? '' : linha[iAP]);
      if (antes.trim()) {
        const res = limparBlocoCadastral(antes, p);
        let texto = res.encontrou ? res.texto : antes;
        const comTermos = p.removerNaCurta ? removerPalavras(texto, p) : texto;
        if (res.encontrou || comTermos !== antes) {
          linha[iAP] = comTermos;
          mudancas.curta.push({
            linha: r + 1,
            removido: res.removido,
            campos: res.campos || 0,
            termos: comTermos !== texto,
          });
        }
      }
    }

    // AV — condição (só se a coluna existir; senão criaria colunas fantasma)
    if (iAV >= 0 && iAV < largura) {
      if (String(linha[iAV]) !== p.valorCondicao) mudancas.condicao++;
      linha[iAV] = p.valorCondicao;
    }
  }

  return { aoa: saida, mudancas, validacao: validar(aoa, saida, p) };
}

/* ── 4) Validação obrigatória ────────────────────────────────────────────── */
function validar(origem, saida, params) {
  const p = Object.assign({}, DEFAULT_PARAMS, params || {});
  const iC = colToIndex(p.colDescricao);
  const iAP = colToIndex(p.colDescricaoCurta);
  const iAV = colToIndex(p.colCondicao);
  const checks = [];
  const add = (ok, titulo, detalhe) => checks.push({ ok, titulo, detalhe: detalhe || '' });

  add(saida.length === origem.length,
      'Nenhuma linha foi removida',
      `Original: ${origem.length - 1} produtos · Modificado: ${saida.length - 1} produtos`);

  const largOrig = origem.reduce((m, r) => Math.max(m, r.length), 0);
  const largNova = saida.reduce((m, r) => Math.max(m, r.length), 0);
  add(largNova === largOrig, 'Nenhuma coluna foi removida ou inventada', `${largOrig} → ${largNova} colunas`);

  // as colunas configuradas precisam existir de verdade na planilha enviada
  const ausentes = [
    ['descrição',       p.colDescricao,      iC],
    ['descrição curta', p.colDescricaoCurta, iAP],
    ['condição',        p.colCondicao,       iAV],
  ].filter(([, , i]) => i < 0 || i >= largOrig)
   .map(([nome, col]) => `${nome} (${col || 'vazia'})`);
  add(ausentes.length === 0,
      'As colunas configuradas existem na planilha',
      ausentes.length ? `Fora do arquivo: ${ausentes.join(', ')} — ajuste em Editar parâmetros`
                      : `${p.colDescricao}, ${p.colDescricaoCurta} e ${p.colCondicao} encontradas`);

  if (iAV >= 0) {
    const fora = [];
    for (let r = 1; r < saida.length; r++) if (String(saida[r][iAV]) !== p.valorCondicao) fora.push(r + 1);
    add(fora.length === 0,
        `Coluna ${p.colCondicao} preenchida com "${p.valorCondicao}"`,
        fora.length ? `Linhas fora do padrão: ${fora.slice(0, 8).join(', ')}` : `${saida.length - 1} linhas conferidas`);
  }

  if (iC >= 0) {
    const longas = [];
    for (let r = 1; r < saida.length; r++) {
      const v = String(saida[r][iC] == null ? '' : saida[r][iC]);
      if (v.length > p.maxDescricao) longas.push(r + 1);
    }
    add(longas.length === 0,
        `Coluna ${p.colDescricao} com no máximo ${p.maxDescricao} caracteres`,
        longas.length ? `Ainda longas: ${longas.slice(0, 8).join(', ')}` : `${saida.length - 1} descrições conferidas`);
  }

  if (iAP >= 0) {
    // nada da descrição comercial pode ter sumido: o texto novo é sempre prefixo do antigo
    const quebradas = [];
    let vazias = 0;
    for (let r = 1; r < saida.length; r++) {
      const antes = String(origem[r][iAP] == null ? '' : origem[r][iAP]);
      const depois = String(saida[r][iAP] == null ? '' : saida[r][iAP]);
      if (!antes.trim()) continue;
      // com a remoção de termos ligada, o texto novo não é prefixo literal:
      // comparamos contra o original já sem os termos
      const base = p.removerNaCurta ? removerPalavras(antes, p) : antes;
      if (!base.startsWith(depois) && !antes.startsWith(depois)) quebradas.push(r + 1);
      if (antes.trim() && !depois.trim()) vazias++;
    }
    add(quebradas.length === 0,
        `Coluna ${p.colDescricaoCurta}: só o bloco final foi removido`,
        quebradas.length ? `Linhas suspeitas: ${quebradas.slice(0, 8).join(', ')}` : 'Todo texto restante é prefixo exato do original');
    add(vazias === 0,
        'Nenhuma descrição comercial ficou vazia',
        vazias ? `${vazias} linha(s) ficaram sem texto` : 'Todas mantiveram conteúdo');
  }

  const outras = [];
  const ignorar = new Set([iC, iAP, iAV].filter(i => i >= 0));
  for (let r = 1; r < saida.length && outras.length < 5; r++) {
    for (let c = 0; c < largOrig; c++) {
      if (ignorar.has(c)) continue;
      const a = origem[r][c] === undefined ? '' : origem[r][c];
      const b = saida[r][c] === undefined ? '' : saida[r][c];
      if (String(a) !== String(b)) { outras.push(`${indexToCol(c)}${r + 1}`); break; }
    }
  }
  add(outras.length === 0, 'Nenhuma outra coluna foi tocada',
      outras.length ? `Células alteradas: ${outras.join(', ')}` : 'Só C, AP e AV foram modificadas');

  return { checks, ok: checks.every(c => c.ok) };
}

return {
  DEFAULT_PARAMS, colToIndex, indexToCol, normalizar, aparar,
  resumirDescricao, limparBlocoCadastral, processar, validar,
};
});
