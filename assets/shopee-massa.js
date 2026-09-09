/* ══════════════════════════════════════════════════════════════════════════
   MODELO DE UPLOAD EM MASSA DA SHOPEE

   A Shopee tem um arquivo próprio para cadastrar produto em massa, e ele não
   se parece com planilha nenhuma: são SEIS linhas de cabeçalho antes do
   primeiro produto. A linha 1 traz os códigos internos que o importador dela
   lê (ps_price, ps_weight…), a 2 traz o hash do modelo e o ID da loja — que
   amarram o arquivo à conta —, a 3 os rótulos em português, a 4 diz o que é
   obrigatório, e as linhas 5 e 6 explicam os limites. O produto começa na
   linha 7, e é a única região que se escreve.

   Por isso o app não monta um arquivo parecido: ele escreve DENTRO do que a
   Shopee entregou. E lê o cabeçalho de lá em tempo de execução, em vez de
   confiar na cópia guardada aqui — a Shopee muda o layout de tempos em
   tempos, inclusive acrescentando coluna fiscal.

   O que derruba um lote inteiro, e por isso está tratado aqui: canal de
   envio sem nenhum ativo, unidade de medida fora da lista fechada dela,
   dimensão preenchida pela metade, zero à esquerda perdido no NCM e nome
   passando de 120 caracteres.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShopeeMassa = factory();
})(typeof self !== 'undefined' ? self : this, function () {

/* Cópia do cabeçalho do modelo de 09/09/2026. Serve de reserva: quando o
   arquivo da Shopee está carregado, quem manda é o cabeçalho dele. */
const LINHA_CODIGOS = [
  "ps_category|0|0", "ps_product_name|1|0", "ps_product_description|1|0",
  "ps_sku_parent_short|0|0", "et_title_variation_integration_no|0|0",
  "et_title_variation_1|0|0", "et_title_option_for_variation_1|0|0",
  "et_title_image_per_variation|0|3", "et_title_variation_2|0|0",
  "et_title_option_for_variation_2|0|0", "ps_price|1|1", "ps_stock|0|1", "ps_sku_short|0|0",
  "ps_new_size_chart|0|1", "et_title_size_chart|0|3", "ps_gtin_code|0|0",
  "sl_tool_mass_upload_compatibility_title|0|0", "ps_item_cover_image|0|3",
  "ps_item_image_1|0|3", "ps_item_image_2|0|3", "ps_item_image_3|0|3", "ps_item_image_4|0|3",
  "ps_item_image_5|0|3", "ps_item_image_6|0|3", "ps_item_image_7|0|3", "ps_item_image_8|0|3",
  "ps_weight|1|1", "ps_length|0|1", "ps_width|0|1", "ps_height|0|1", "channel_id.90006|0|0",
  "ps_product_pre_order_dts|0|1", "ps_invoice_ncm|0|0", "ps_invoice_cfop_same|0|0",
  "ps_invoice_cfop_diff|0|0", "ps_invoice_origin|0|0", "ps_invoice_csosn|0|0",
  "ps_invoice_cest|0|0", "ps_invoice_measure_unit|0|0", "ps_pis_cofins_cst_default|0|0",
  "ps_federal_state_taxes_default|0|0", "ps_operation_type_default|0|0",
  "ps_ex_tipi_default|0|0", "ps_fci_num_default|0|0", "ps_recopi_num_default|0|0",
  "ps_additional_info_default|0|0", "sl_label_product_is_grouped_item|0|0",
  "sl_label_grouped_item_gtin_sscc|0|0", "sl_label_grouped_item_qty|0|0",
  "sl_label_grouped_item_measure_unity|0|0", "et_title_reason|0|0"
];

const LINHA_ASSINATURA = [
  "basic", "ac8e918724da5bc1abc868704cc72f1a", "0", "1841339598"
];

const LINHA_ROTULOS = [
  "Categoria", "Nome do Produto", "Descrição do Produto", "SKU principal",
  "Número de Integração de Variação", "Nome da Variação 1", "Opção para Variação 1",
  "Imagem por Variação", "Nome da Variação 2", "Opção para Variação 2", "Preço", "Estoque",
  "SKU da Variação", "Template da Tabela de Medidas", "Imagem de Tamanhos", "GTIN (EAN)",
  "IDs de compatibilidade", "Imagem de capa", "Imagem do produto 1", "Imagem do produto 2",
  "Imagem do produto 3", "Imagem do produto 4", "Imagem do produto 5", "Imagem do produto 6",
  "Imagem do produto 7", "Imagem do produto 8", "Peso", "Comprimento", "Largura", "Altura",
  "Correios", "Prazo de Postagem para Encomenda", "NCM", "CFOP (Mesmo Estado)",
  "CFOP (Outro Estado)", "Origem", "CSOSN", "CEST", "Unidade de Medida", "CST PIS/Cofins",
  "% total de tributos federais, estaduais e municipais", "Tipo de Operação",
  "EX TIPI (tabela de exceções IPI)", "Nr. de controle da FCI", "Nr. RECOPI",
  "Informações adicionais do produto", "Produto é um item agrupável",
  "GTIN da Unidade Tributável", "Quantidade da Unidade Tributável",
  "Unidade de medida do item agrupável", "Motivo da Falha"
];

const LINHA_OBRIGATORIEDADE = [
  "Opcional", "Obrigatório", "Obrigatório", "Opcional", "Condicional obrigatório",
  "Condicional obrigatório", "Condicional obrigatório", "Condicional obrigatório",
  "Condicional obrigatório", "Condicional obrigatório", "Obrigatório",
  "Condicional obrigatório", "Opcional", "Condicional obrigatório", "Condicional obrigatório",
  "Opcional", "Opcional", "Opcional", "Opcional", "Opcional", "Opcional", "Opcional",
  "Opcional", "Opcional", "Opcional", "Opcional", "Obrigatório", "Condicional obrigatório",
  "Condicional obrigatório", "Condicional obrigatório", "Condicional obrigatório", "Opcional",
  "Condicional obrigatório", "Condicional obrigatório", "Condicional obrigatório",
  "Condicional obrigatório", "Condicional obrigatório", "Condicional obrigatório",
  "Condicional obrigatório", "Condicional obrigatório", "Condicional obrigatório",
  "Condicional obrigatório", "Condicional obrigatório", "Condicional obrigatório",
  "Condicional obrigatório", "Condicional obrigatório", "Condicional obrigatório",
  "Condicional obrigatório", "Condicional obrigatório", "Condicional obrigatório", ""
];

const N_COLUNAS = LINHA_CODIGOS.length;

/* As linhas 5 e 6 do original explicam os limites de cada campo. Quando o app
   monta o arquivo sem o modelo da Shopee, vão vazias: o que não pode mudar é
   a POSIÇÃO — o primeiro produto tem de cair na linha 7. */
const LINHAS_AJUDA = 2;

/* Linha (base 0) onde entra o primeiro produto: as quatro linhas do modelo
   mais as duas de ajuda. Em planilha, é a linha 7. */
const LINHA_CABECALHO = 4 + LINHAS_AJUDA;

/* posição de cada campo, pelo código interno da linha 1 */
function mapaDeColunas(codigos) {
  const col = {};
  (codigos || LINHA_CODIGOS).forEach((c, i) => { col[String(c).split('|')[0]] = i; });
  return col;
}
const COL = mapaDeColunas(LINHA_CODIGOS);

/* ── limites que a Shopee impõe ───────────────────────────────────────────
   Ela recusa a linha inteira quando um campo passa do limite, e o relatório
   de erro dela é críptico. Melhor cortar aqui. */
const NOME_MIN = 2, NOME_MAX = 120;
const DESC_MIN = 10, DESC_MAX = 5000;
const SKU_MAX = 100;
const PRECO_MIN = 1, PRECO_MAX = 100000;
const PESO_MAX = 100000;
const ESTOQUE_MAX = 10000000;

/* "Pelo menos um canal de envio precisa estar ativo por produto" — sem isto
   a Shopee recusa, e é o erro que não aparece em lugar nenhum na planilha. */
const CANAL_ATIVO = 'Ativar';

const texto = v => v == null ? '' : String(v).trim();

function nomeValido(v) {
  const t = texto(v);
  return t.length >= NOME_MIN ? t.slice(0, NOME_MAX) : '';
}

/* Catálogo de dropshipping quase nunca traz descrição: só o nome. Então ela é
   montada com o que existe — nome, marca, categoria e as medidas —, porque a
   Shopee exige de 10 a 5000 caracteres e recusa a linha sem isso. */
function descricaoValida(desc, nome, extras) {
  let t = texto(desc);
  if (!t) {
    const e = extras || {};
    const partes = [texto(nome)];
    if (texto(e.marca)) partes.push('Marca: ' + texto(e.marca) + '.');
    if (texto(e.categoria)) partes.push('Categoria: ' + texto(e.categoria) + '.');
    const a = Number(e.altura), l = Number(e.largura), c = Number(e.comprimento);
    if (a > 0 && l > 0 && c > 0) partes.push(`Medidas da embalagem: ${a} x ${l} x ${c} cm.`);
    const p = Number(e.peso);
    if (p > 0) partes.push(`Peso: ${p} kg.`);
    t = partes.filter(Boolean).join(' ');
  }
  if (!t) return '';
  /* repete até passar do mínimo: um nome de 3 letras dobrado ainda tem 9 e
     voltaria recusado. Repetir uma vez só resolvia "Pote", não "Kit". */
  const base = t;
  while (t.length < DESC_MIN) t = t + ' — ' + base;
  return t.slice(0, DESC_MAX);
}

/* GTIN é de 8 a 14 dígitos. Catálogo de fornecedor costuma repetir o SKU
   nessa coluna quando o produto não tem código de barras ("PTE-008"), e aí
   a Shopee recusa a linha. Sem número válido, vai em branco. */
function gtinValido(v) {
  const t = texto(v);
  return /^[0-9]{8,14}$/.test(t) ? t : '';
}

/* NCM é sempre 8 dígitos. O zero à esquerda é o problema clássico: a planilha
   de origem já pode ter perdido, e quem lê como número perde de novo. */
function ncmValido(v) {
  const t = texto(v).replace(/[^0-9]/g, '');
  if (!t) return '';
  if (t.length === 8) return t;
  /* 7 dígitos quase sempre é um 8 que perdeu o zero da frente no Excel */
  if (t.length === 7) return '0' + t;
  return '';
}

function numero(v) {
  if (v === '' || v == null) return '';
  const n = Number(String(v).replace(',', '.'));
  return isFinite(n) && n >= 0 ? n : '';
}

/* As três dimensões vão juntas ou nenhuma vai: "preencher todas as dimensões
   ou deixar todas vazias". Uma sozinha derruba a linha. */
function dimensoes(p) {
  const a = numero(p.altura), l = numero(p.largura), c = numero(p.comprimento);
  if (a > 0 && l > 0 && c > 0) return {altura: a, largura: l, comprimento: c};
  return {altura: '', largura: '', comprimento: ''};
}

/* ── uma linha do arquivo ─────────────────────────────────────────────────
   produto = {sku, nome, descricao, preco, estoque, peso, altura, largura,
              comprimento, ean, ncm, cest, imagem, marca, categoria}
   ctx     = {col, nColunas, fiscal} — o cabeçalho lido do arquivo da Shopee
             e os valores fiscais escolhidos na tela.                       */
function montarLinha(produto, ctx) {
  const c = (ctx && ctx.col) || COL;
  const n = (ctx && ctx.nColunas) || N_COLUNAS;
  const fiscal = (ctx && ctx.fiscal) || {};
  const linha = new Array(n).fill('');
  const p = produto || {};

  const põe = (campo, valor) => { if (c[campo] != null) linha[c[campo]] = valor; };

  const nome = nomeValido(p.nome);
  const sku = texto(p.sku).slice(0, SKU_MAX);
  const dim = dimensoes(p);

  põe('ps_product_name', nome);
  põe('ps_product_description', descricaoValida(p.descricao, nome, p));
  /* o mesmo código nos dois campos: sem variação, a Shopee aceita os dois e
     não é claro qual ela indexa para o estoque — preencher os dois não custa */
  põe('ps_sku_parent_short', sku);
  põe('ps_sku_short', sku);

  const preco = numero(p.preco);
  põe('ps_price', preco >= PRECO_MIN && preco <= PRECO_MAX ? preco : '');

  const estoque = numero(p.estoque);
  põe('ps_stock', estoque <= ESTOQUE_MAX ? Math.floor(estoque || 0) : ESTOQUE_MAX);

  const peso = numero(p.peso);
  põe('ps_weight', peso > 0 && peso <= PESO_MAX ? peso : '');

  põe('ps_length', dim.comprimento);
  põe('ps_width', dim.largura);
  põe('ps_height', dim.altura);

  põe('ps_gtin_code', gtinValido(p.ean));
  põe('ps_item_cover_image', texto(p.imagem));

  /* sem canal ativo a Shopee recusa o produto, e nada na planilha avisa */
  põe('channel_id.90006', CANAL_ATIVO);

  põe('ps_invoice_ncm', ncmValido(p.ncm));
  põe('ps_invoice_cest', texto(p.cest));

  /* Os fiscais vêm da tela, iguais para todas as linhas: dependem do regime
     da empresa, não do produto. Vazio é vazio — chutar CFOP ou origem sai
     como nota fiscal errada. */
  põe('ps_invoice_measure_unit', texto(fiscal.unidade));
  põe('ps_invoice_origin', texto(fiscal.origem));
  põe('ps_invoice_csosn', texto(fiscal.csosn));
  põe('ps_pis_cofins_cst_default', texto(fiscal.cstPisCofins));
  põe('ps_invoice_cfop_same', texto(fiscal.cfopMesmo));
  põe('ps_invoice_cfop_diff', texto(fiscal.cfopOutro));
  const trib = numero(fiscal.tributos);
  põe('ps_federal_state_taxes_default', trib === '' ? '' : trib);

  /* "Motivo da Falha" é coluna de retorno: a Shopee escreve nela quando
     recusa. Sai vazia daqui. */
  põe('et_title_reason', '');

  return linha;
}

/* Colunas que precisam ir como TEXTO no arquivo, senão o zero à esquerda
   some: 07013429 viraria 7013429 e a Shopee recusa o NCM. */
const COLUNAS_TEXTO = ['ps_gtin_code', 'ps_invoice_ncm', 'ps_invoice_cest'];

/* O arquivo inteiro, para quando não há o modelo da Shopee em mãos. */
function montarAoa(produtos, opcoes) {
  const o = opcoes || {};
  const vazia = new Array(N_COLUNAS).fill('');
  const aoa = [
    LINHA_CODIGOS.slice(),
    LINHA_ASSINATURA.slice(),
    LINHA_ROTULOS.slice(),
    LINHA_OBRIGATORIEDADE.slice(),
  ];
  for (let i = 0; i < LINHAS_AJUDA; i++) aoa.push(vazia.slice());
  (produtos || []).forEach(p => aoa.push(montarLinha(p, o)));
  return aoa;
}

/* ── o que a Shopee vai recusar, dito antes de baixar ─────────────────────
   Só o que ela trata como obrigatório de verdade, mais o que o documento
   dela chama de opcional mas impede a publicação (a imagem de capa). */
function conferir(produtos, ctx) {
  const fiscal = (ctx && ctx.fiscal) || {};
  const p = {semNome: [], semDescricao: [], semPreco: [], semPeso: [],
             semEstoque: [], semImagem: [], eanIgnorado: [], dimensaoParcial: [],
             skuRepetido: [], semUnidade: !texto(fiscal.unidade)};
  const vistos = new Map();

  (produtos || []).forEach((prod, i) => {
    const nome = nomeValido(prod.nome);
    if (!nome) p.semNome.push(i);
    if (!descricaoValida(prod.descricao, nome, prod)) p.semDescricao.push(i);
    const preco = numero(prod.preco);
    if (!(preco >= PRECO_MIN && preco <= PRECO_MAX)) p.semPreco.push(i);
    const peso = numero(prod.peso);
    if (!(peso > 0 && peso <= PESO_MAX)) p.semPeso.push(i);
    if (!(numero(prod.estoque) > 0)) p.semEstoque.push(i);
    if (!texto(prod.imagem)) p.semImagem.push(i);
    if (texto(prod.ean) && !gtinValido(prod.ean)) p.eanIgnorado.push(i);

    /* dimensão pela metade não vai para o arquivo — some inteira. Vale
       avisar: quem preencheu duas de três achava que tinha medida. */
    const a = numero(prod.altura), l = numero(prod.largura), c = numero(prod.comprimento);
    const preenchidas = [a, l, c].filter(x => x > 0).length;
    if (preenchidas > 0 && preenchidas < 3) p.dimensaoParcial.push(i);

    const sku = texto(prod.sku);
    if (sku) {
      if (vistos.has(sku)) p.skuRepetido.push(i);
      else vistos.set(sku, i);
    }
  });
  return p;
}

/* ── leitura do modelo carregado ──────────────────────────────────────────
   O cabeçalho de verdade é o do arquivo que a pessoa acabou de carregar. A
   Shopee muda o layout de tempos em tempos, e um mapa fixo aqui dentro
   escreveria o preço na coluna errada sem ninguém perceber. */
function lerCabecalho(aoa) {
  const codigos = (aoa && aoa[0]) || [];
  if (!codigos.length) return null;
  return {
    col: mapaDeColunas(codigos),
    nColunas: codigos.length,
    codigos: codigos.slice(),
    rotulos: (aoa && aoa[2]) ? aoa[2].slice() : [],
  };
}

/* As listas fechadas (Origem, CSOSN, CST PIS/Cofins, Unidade de Medida) vivem
   na aba HiddenTax do próprio modelo, uma por coluna, a partir da linha 7.
   Ler de lá é melhor do que guardar cópia: valem os valores daquele arquivo. */
function lerListasFiscais(aoaHiddenTax) {
  const col = i => (aoaHiddenTax || []).slice(6)
    .map(l => (l && l[i] != null ? String(l[i]).trim() : ''))
    .filter(Boolean);
  return {
    csosn:        col(1),   // B
    origem:       col(2),   // C
    cstPisCofins: col(3),   // D
    unidade:      col(4),   // E
  };
}

return {LINHA_CODIGOS, LINHA_ROTULOS, LINHA_ASSINATURA, N_COLUNAS, COL,
        LINHAS_AJUDA, LINHA_CABECALHO, COLUNAS_TEXTO, CANAL_ATIVO,
        NOME_MIN, NOME_MAX, DESC_MIN, DESC_MAX, PRECO_MIN, PRECO_MAX,
        nomeValido, descricaoValida, gtinValido, ncmValido, dimensoes,
        mapaDeColunas, lerCabecalho, lerListasFiscais,
        montarLinha, montarAoa, conferir};
});
