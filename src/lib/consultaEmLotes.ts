// O PostgREST recebe o filtro `.in()` na query string. Com centenas de UUIDs
// (o regional_admin enxerga TODAS as conversas/chamados) a URL passa do limite
// aceito e a resposta vem 400 — o sino de notificações e a lista do chat
// simplesmente paravam de carregar. Aqui a lista de ids é quebrada em lotes e
// as respostas são concatenadas, mantendo o mesmo resultado da consulta única.

export const MAX_IDS_POR_LOTE = 100;

export function dividirEmLotes<T>(itens: T[], tamanho: number = MAX_IDS_POR_LOTE): T[][] {
  if (tamanho < 1) throw new Error('tamanho do lote deve ser >= 1');
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}

interface RespostaSupabase<T> {
  data: T[] | null;
  error: any;
}

// Executa a consulta uma vez por lote de ids (em paralelo) e junta os dados.
// O primeiro erro encontrado é devolvido, para o chamador tratar como trataria
// o erro da consulta única.
export async function selectEmLotes<T>(
  ids: string[],
  consultar: (lote: string[]) => PromiseLike<RespostaSupabase<T>>,
  tamanhoLote: number = MAX_IDS_POR_LOTE
): Promise<RespostaSupabase<T>> {
  if (ids.length === 0) return { data: [], error: null };

  const respostas = await Promise.all(
    dividirEmLotes(ids, tamanhoLote).map((lote) => consultar(lote))
  );

  const comErro = respostas.find((r) => r.error);
  if (comErro) return { data: null, error: comErro.error };

  return { data: respostas.flatMap((r) => r.data || []), error: null };
}
