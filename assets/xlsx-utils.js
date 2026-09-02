/* ══════════════════════════════════════════════════════════════════════════
   Precificador Drop — utilidades de planilha

   Existe por dois motivos:
   1. sheet_to_json indexa as colunas a partir do início do !ref. Numa planilha
      cujo range começa em C1, a "coluna C" viraria índice 0 e todo o
      mapeamento (C/AP/AV) sairia deslocado — por isso normalizamos o ref.
   2. Reconstruir a aba com aoa_to_sheet a partir de texto gravaria TUDO como
      string ("número armazenado como texto" no Excel). Em vez disso clonamos
      a aba original e trocamos só as células que mudaram, preservando tipo,
      formato e o resto do conteúdo.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('xlsx'));
  else root.XlsxUtils = factory(root.XLSX);
})(typeof self !== 'undefined' ? self : this, function (XLSX) {
'use strict';

/* Garante que o range da aba começa em A1, para que os índices de coluna
   batam com as letras reais (A=0, B=1, …). */
function normalizarRef(ws) {
  if (!ws || !ws['!ref']) return ws;
  const r = XLSX.utils.decode_range(ws['!ref']);
  if (r.s.c === 0 && r.s.r === 0) return ws;
  r.s.c = 0; r.s.r = 0;
  ws['!ref'] = XLSX.utils.encode_range(r);
  return ws;
}

/* Cópia rasa-por-célula da aba: cada célula vira um objeto novo, então
   escrever no clone não mexe na aba original. */
function clonarWs(ws) {
  const novo = {};
  for (const k in ws) {
    if (!Object.prototype.hasOwnProperty.call(ws, k)) continue;
    const v = ws[k];
    novo[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? Object.assign({}, v) : v;
  }
  ['!cols', '!rows', '!merges'].forEach(k => {
    if (Array.isArray(ws[k])) novo[k] = ws[k].map(x => (x && typeof x === 'object') ? Object.assign({}, x) : x);
  });
  return novo;
}

/* Expande o !ref para conter (linha, coluna). */
function expandirRef(ws, linha, coluna) {
  const r = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref'])
                       : {s:{r:linha, c:coluna}, e:{r:linha, c:coluna}};
  if (linha  < r.s.r) r.s.r = linha;
  if (linha  > r.e.r) r.e.r = linha;
  if (coluna < r.s.c) r.s.c = coluna;
  if (coluna > r.e.c) r.e.c = coluna;
  ws['!ref'] = XLSX.utils.encode_range(r);
}

/* Escreve uma célula preservando o tipo: número entra como número
   (nada de "armazenado como texto"), texto entra como texto. */
function escrever(ws, linha, coluna, valor) {
  const addr = XLSX.utils.encode_cell({r: linha, c: coluna});
  if (valor === '' || valor == null) {
    const antiga = ws[addr];
    ws[addr] = antiga ? Object.assign({}, antiga, {t:'z', v:undefined, w:undefined, f:undefined}) : {t:'z'};
    delete ws[addr].v; delete ws[addr].w; delete ws[addr].f;
  } else if (typeof valor === 'number' && isFinite(valor)) {
    const antiga = ws[addr] || {};
    ws[addr] = {t:'n', v: valor};
    if (antiga.z) ws[addr].z = antiga.z;      // mantém o formato numérico
    if (antiga.s) ws[addr].s = antiga.s;      // mantém o estilo
  } else {
    const antiga = ws[addr] || {};
    ws[addr] = {t:'s', v: String(valor)};
    if (antiga.s) ws[addr].s = antiga.s;
  }
  expandirRef(ws, linha, coluna);
  return ws;
}

/* Nome de aba aceito pelo Excel: até 31 caracteres, sem : \ / ? * [ ] */
function nomeDeAbaValido(nome, alternativa) {
  let s = String(nome == null ? '' : nome).replace(/[:\\\/?*\[\]]/g, '-').trim();
  if (!s) s = String(alternativa || 'Planilha');
  return s.slice(0, 31);
}

/* Devolve um nome livre dentro da pasta (evita abas duplicadas). */
function nomeDeAbaLivre(wb, desejado, alternativa) {
  const base = nomeDeAbaValido(desejado, alternativa);
  if (!wb.SheetNames.includes(base)) return base;
  for (let i = 2; i < 100; i++) {
    const tentativa = nomeDeAbaValido(base.slice(0, 28) + ' ' + i, alternativa);
    if (!wb.SheetNames.includes(tentativa)) return tentativa;
  }
  return base.slice(0, 27) + ' ' + Date.now().toString().slice(-3);
}

return { normalizarRef, clonarWs, expandirRef, escrever, nomeDeAbaValido, nomeDeAbaLivre };
});
