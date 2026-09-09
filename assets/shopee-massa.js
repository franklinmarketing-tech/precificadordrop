/* ══════════════════════════════════════════════════════════════════════════
   MODELO DE UPLOAD EM MASSA DA SHOPEE

   A Shopee tem um arquivo próprio para cadastrar produto em massa, e ele não
   se parece com planilha nenhuma: são SEIS linhas de cabeçalho antes do
   primeiro produto. A linha 1 traz os códigos internos que o importador da
   Shopee lê (ps_price, ps_weight…), a 2 traz a assinatura do modelo, a 3 os
   rótulos em português, a 4 diz o que é obrigatório, e as linhas 5 e 6 são
   textos de ajuda para quem preenche à mão. O produto começa na linha 7.

   Aqui o catálogo do fornecedor (SKU, nome, custo, peso, medidas, EAN, NCM,
   imagem) vira esse formato, com o preço que o app calculou pela tabela real
   da Shopee no lugar do custo.

   O que este módulo NÃO preenche, de propósito: categoria, CFOP, origem,
   CSOSN, tipo de operação e o canal Correios. Categoria pede o ID da árvore
   da Shopee, que o catálogo não tem — em branco, a própria Shopee sugere. O
   resto é decisão fiscal de cada vendedor: chutar um CFOP ou uma origem sai
   como nota fiscal errada, e isso é problema maior do que preencher à mão.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShopeeMassa = factory();
})(typeof self !== 'undefined' ? self : this, function () {

/* As quatro primeiras linhas saem do modelo oficial baixado da Shopee, sem
   uma vírgula mudada: é por elas que o importador reconhece cada coluna. */
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

/* As linhas 5 e 6 do original são só texto de ajuda para quem preenche na
   mão. Vão vazias: o que não pode mudar é a POSIÇÃO — o primeiro produto
   tem de cair na linha 7, e é isso que estas duas linhas garantem. */
const LINHAS_AJUDA = 2;

/* Linha (base 0) onde entra o primeiro produto: as quatro linhas do modelo
   mais as duas de ajuda. Em planilha, é a linha 7. */
const LINHA_CABECALHO = 4 + LINHAS_AJUDA;

/* posição de cada campo, pelo código interno da linha 1 */
const COL = {};
LINHA_CODIGOS.forEach((c, i) => { COL[String(c).split('|')[0]] = i; });

/* ── validações que evitam o arquivo voltar recusado ──────────────────────
   A Shopee recusa a linha inteira quando um campo passa do limite dela, e o
   relatório de erro dela é críptico. Melhor cortar aqui. */
const NOME_MAX = 120;      // "Insira 2 a 120 caracteres para o nome do produto"
const DESC_MIN = 10;       // "insira 10 para 5000 caracteres"
const DESC_MAX = 5000;
const SKU_MAX = 100;

const texto = v => v == null ? '' : String(v).trim();

function nomeValido(v) {
  const t = texto(v);
  return t.length >= 2 ? t.slice(0, NOME_MAX) : '';
}

/* Catálogo de dropshipping quase nunca traz descrição: só o nome. Repetir o
   nome é o que sobra — mas abaixo de 10 caracteres a Shopee recusa, então o
   nome curto ganha um complemento em vez de derrubar a linha. */
function descricaoValida(desc, nome) {
  let t = texto(desc) || texto(nome);
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

/* NCM é sempre 8 dígitos; qualquer outra coisa a Shopee recusa. */
function ncmValido(v) {
  const t = texto(v).replace(/[^0-9]/g, '');
  return t.length === 8 ? t : '';
}

function numero(v) {
  if (v === '' || v == null) return '';
  const n = Number(String(v).replace(',', '.'));
  return isFinite(n) && n >= 0 ? n : '';
}

/* ── uma linha do arquivo ─────────────────────────────────────────────────
   produto = {sku, nome, descricao, preco, estoque, peso, altura, largura,
              comprimento, ean, ncm, cest, imagem, unidadeMedida}          */
function montarLinha(produto) {
  const linha = new Array(N_COLUNAS).fill('');
  const p = produto || {};

  const nome = nomeValido(p.nome);
  const sku = texto(p.sku).slice(0, SKU_MAX);

  linha[COL.ps_product_name]         = nome;
  linha[COL.ps_product_description]  = descricaoValida(p.descricao, nome);
  /* o mesmo código nos dois campos: sem variação, a Shopee aceita os dois e
     não é claro qual ela indexa para o estoque — preencher os dois não custa */
  linha[COL.ps_sku_parent_short]     = sku;
  linha[COL.ps_sku_short]            = sku;
  linha[COL.ps_price]                = numero(p.preco);
  linha[COL.ps_stock]                = numero(p.estoque);
  linha[COL.ps_weight]               = numero(p.peso);
  linha[COL.ps_length]               = numero(p.comprimento);
  linha[COL.ps_width]                = numero(p.largura);
  linha[COL.ps_height]               = numero(p.altura);
  linha[COL.ps_gtin_code]            = gtinValido(p.ean);
  linha[COL.ps_item_cover_image]     = texto(p.imagem);
  linha[COL.ps_invoice_ncm]          = ncmValido(p.ncm);
  linha[COL.ps_invoice_cest]         = texto(p.cest);
  linha[COL.ps_invoice_measure_unit] = texto(p.unidadeMedida);

  return linha;
}

/* O arquivo inteiro: seis linhas de cabeçalho e um produto por linha. */
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

  (produtos || []).forEach(p => aoa.push(montarLinha(Object.assign(
    {unidadeMedida: o.unidadeMedida || ''}, p))));

  return aoa;
}

/* O que a Shopee vai recusar, dito antes de baixar. Só o que é obrigatório
   por regra dela: nome, descrição, preço e peso. */
function conferir(produtos) {
  const problemas = {semNome: [], semPreco: [], semPeso: [], semEstoque: [], eanIgnorado: []};
  (produtos || []).forEach((p, i) => {
    if (!nomeValido(p.nome)) problemas.semNome.push(i);
    if (!(Number(p.preco) > 0)) problemas.semPreco.push(i);
    if (!(Number(p.peso) > 0)) problemas.semPeso.push(i);
    if (!(Number(p.estoque) > 0)) problemas.semEstoque.push(i);
    if (texto(p.ean) && !gtinValido(p.ean)) problemas.eanIgnorado.push(i);
  });
  return problemas;
}

return {LINHA_CODIGOS, LINHA_ROTULOS, N_COLUNAS, COL, LINHAS_AJUDA, LINHA_CABECALHO,
        NOME_MAX, DESC_MIN, DESC_MAX,
        nomeValido, descricaoValida, gtinValido, ncmValido,
        montarLinha, montarAoa, conferir};
});
