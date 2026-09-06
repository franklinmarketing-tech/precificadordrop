/* ══════════════════════════════════════════════════════════════════════════
   Quem pode chamar os endpoints que mexem na conta do Mercado Livre.

   O problema que isto resolve: /api/ml-atualizar-precos muda o preço de
   anúncios que estão no ar, usando o token guardado no servidor. Sem nada
   na frente, qualquer pessoa com a URL podia mandar um POST e zerar a loja.

   Por que a chave é DIGITADA e não embutida no app: este site é estático e
   não tem login. Todo segredo que a página mandasse sozinha estaria no
   JavaScript que qualquer um baixa — protegeria zero. A chave fica só na
   cabeça do dono da loja, é digitada na hora de publicar e vive na aba até
   ela fechar.

   Regra de ouro aqui: na dúvida, RECUSA. Se APP_SECRET não estiver
   configurada na Vercel, nada passa — o contrário (deixar aberto quando
   falta configuração) é como o endpoint nasceu, e é o erro que estamos
   consertando.
   ══════════════════════════════════════════════════════════════════════════ */
import {timingSafeEqual} from 'node:crypto';

/* Compara sem vazar, pelo tempo de resposta, quantos caracteres acertaram.
   Chaves de tamanhos diferentes já saem no primeiro teste — o tamanho não é
   segredo, o conteúdo é. */
function iguais(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length || !x.length) return false;
  return timingSafeEqual(x, y);
}

/* ── a chave do dono ──────────────────────────────────────────────────────
   Devolve true se pode seguir. Se não, já respondeu — quem chama só sai. */
export function exigirChave(req, res) {
  const esperada = process.env.APP_SECRET;

  if (!esperada || esperada.length < 16) {
    res.status(503).json({
      erro: 'Este app ainda não tem chave de publicação configurada.',
      comoResolver: 'No projeto da Vercel, em Settings → Environment Variables, '
        + 'crie APP_SECRET com uma senha longa (16 caracteres ou mais) e refaça o deploy. '
        + 'Enquanto ela não existir, nada que mexe na sua loja funciona — de propósito.',
      precisaChave: true,
    });
    return false;
  }

  const enviada = req.headers['x-drop-chave'];
  if (!enviada || !iguais(enviada, esperada)) {
    res.status(401).json({
      erro: 'Chave de publicação inválida ou não informada.',
      precisaChave: true,
    });
    return false;
  }
  return true;
}

/* ── a chamada veio da própria página? ────────────────────────────────────
   Vale contra site de terceiro que tenta usar o navegador de quem já está
   com o app aberto. NÃO vale contra curl — lá o Origin é o que o autor
   quiser. É a segunda tranca, não a primeira; a primeira é a chave. */
export function mesmaOrigem(req, res) {
  const de = req.headers.origin || req.headers.referer || '';
  if (!de) return true;                    // curl e afins caem na chave
  try {
    if (new URL(de).host === req.headers.host) return true;
  } catch (e) { /* cabeçalho torto cai no bloqueio */ }
  res.status(403).json({erro: 'Chamada recusada: veio de outro endereço.'});
  return false;
}

/* ── freio de mão ─────────────────────────────────────────────────────────
   A memória de uma função serverless não é compartilhada entre instâncias e
   some quando ela hiberna, então isto NÃO é um limite exato — é um freio
   contra repetição rápida na mesma instância. O limite que vale de verdade
   é o teto de 50 itens por chamada, que fica no próprio endpoint. */
const marcas = new Map();

export function limitar(req, res, {max = 20, janelaMs = 60000} = {}) {
  const quem = String(req.headers['x-forwarded-for'] || 'sem-ip').split(',')[0].trim();
  const agora = Date.now();
  const lista = (marcas.get(quem) || []).filter(t => agora - t < janelaMs);

  if (lista.length >= max) {
    res.setHeader('retry-after', Math.ceil(janelaMs / 1000));
    res.status(429).json({
      erro: `Muitas chamadas seguidas. Espere ${Math.ceil(janelaMs / 1000)} segundos.`,
    });
    return false;
  }

  lista.push(agora);
  marcas.set(quem, lista);
  if (marcas.size > 500) marcas.clear();   // não deixa a memória crescer sem fim
  return true;
}

/* Atalho: as três trancas na ordem que importa.

   O freio vem ANTES da chave de propósito: assim tentativa de adivinhar a
   chave também é freada. Se a chave viesse primeiro, quem erra nunca chegaria
   a contar, e dava para tentar sem parar. */
export function protegido(req, res, opcoesLimite) {
  return mesmaOrigem(req, res) && limitar(req, res, opcoesLimite) && exigirChave(req, res);
}
