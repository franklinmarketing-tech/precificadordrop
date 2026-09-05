/* ══════════════════════════════════════════════════════════════════════════
   Diz QUAL conta do Mercado Livre está ligada.

   Existe por causa de um acidente que quase aconteceu: a tela de autorização
   do ML usa a conta que já está logada no navegador, sem perguntar. Autorizar
   pela conta errada é fácil, e o erro só apareceria na hora em que os preços
   fossem publicados — na loja errada, sem desfazer.

   Com isto a tela mostra o apelido da conta antes de qualquer publicação.
   ══════════════════════════════════════════════════════════════════════════ */
import {tokenDoVendedor, responderErro} from './_ml-token.js';

export default async function handler(req, res) {
  try {
    const token = await tokenDoVendedor();
    const r = await fetch('https://api.mercadolibre.com/users/me', {
      headers: {Authorization: 'Bearer ' + token},
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json({
        erro: d.message || 'O Mercado Livre não reconheceu a autorização.',
        precisaAutorizar: r.status === 401 || r.status === 403,
      });
    }

    res.setHeader('cache-control', 'no-store');
    res.status(200).json({
      id: d.id,
      apelido: d.nickname || '',
      nome: [d.first_name, d.last_name].filter(Boolean).join(' '),
      email: d.email || '',
      site: d.site_id || '',
      tipo: d.user_type || '',
      permissoes: d.tags || [],
    });
  } catch (e) {
    responderErro(res, e);
  }
}
