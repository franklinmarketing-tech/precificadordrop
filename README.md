# Precificador Drop

Hub de precificação para dropshipping no Brasil. Sobe a planilha de produtos,
escolhe as colunas, e sai um arquivo pronto para importar no Bling — com o preço
que entrega a margem que você pediu, já descontando tarifa, custo fixo e frete
do Mercado Livre.

**No ar:** https://precificador-drop.vercel.app

## O que tem hoje

| Ferramenta | Estado |
|---|---|
| Precificar Mercado Livre | pronto |
| Edição completa de planilha de produtos | pronto |
| Precificar Shopee | a fazer |
| Editar base ML · Carregar base Shopee | a fazer |

### Precificar Mercado Livre
Calcula o preço de venda a partir do custo do fornecedor. Usa as tabelas
oficiais do Mercado Livre: tarifa por tipo de anúncio, custo fixo por faixa de
preço e frete por reputação × peso × faixa de preço. Considera **peso
volumétrico** — (A × L × C) ÷ 6.000 — e cobra pelo maior entre ele e o peso
real, como o Mercado Livre faz.

Antes de gerar o arquivo, a tela de conferência lista o que pode fazer você
perder dinheiro: produto sem peso (que sairia com frete zero), custo faltando ou
em texto, margem impossível, peso que parece estar em gramas. Cada aviso tem um
botão que filtra a tabela nas linhas afetadas.

### Edição de planilha de produtos
Encurta descrições para 60 caracteres, tira o bloco cadastral do fim da
descrição longa, remove termos que não podem ir para o marketplace, preenche a
coluna de condição e gera a coluna **Modelo**, que o Mercado Livre exige.
Nenhuma linha é perdida e o arquivo sai só com a aba corrigida.

## Rodando na sua máquina

Não tem build. É HTML, CSS e JavaScript servidos direto:

```
npx serve .          # ou qualquer servidor estático
```

Abrir por `file://` não funciona — o navegador bloqueia o carregamento dos
módulos.

## Testes

```
npm test
```

Confere as contas contra a planilha de referência (`planilhas/Precificação -
Mercado Livre.xlsx`, célula a célula), as faixas de custo fixo, as três tabelas
de frete, o peso volumétrico, a leitura de números em formato brasileiro e a
conferência do lote. Fecha com uma varredura de 34.992 combinações de custo ×
margem × reputação × peso, verificando que o preço calculado sempre entrega a
margem pedida.

## Como está organizado

```
index.html              a página inteira: hub + as duas ferramentas
assets/
  ml-engine.js          a conta do Mercado Livre (tarifas, margem, conferência)
  ml-fretes.js          as três tabelas oficiais de frete, por reputação
  planilha-engine.js    a edição da planilha de produtos
  xlsx-utils.js         leitura e escrita preservando o tipo das células
  app.js                a tela
api/                    integração com a API do Mercado Livre (OAuth)
testes/rodar.js         npm test
```

Os motores em `assets/` são UMD de propósito: rodam no navegador e no Node, o
que permite testar as contas sem abrir o navegador. Por isso `assets/` e
`testes/` têm um `package.json` marcando `commonjs` — a raiz é `module` por
causa das funções em `api/`.

A biblioteca de planilhas (SheetJS) vem de CDN, com um segundo endereço de
reserva e aviso na tela se os dois falharem.

## Integração com a API do Mercado Livre

As funções em `api/` buscam a tarifa real por categoria em vez de usar a tabela
fixa. Precisam de `ML_CLIENT_ID` e `ML_CLIENT_SECRET` nas variáveis de ambiente
da Vercel. Enquanto o secret não estiver configurado, o app usa as tabelas
oficiais embutidas — que é o comportamento padrão e já está correto.

## Publicando

```
vercel --prod
```
