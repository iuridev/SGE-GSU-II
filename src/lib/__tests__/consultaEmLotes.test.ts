import { describe, it, expect } from 'vitest';
import { dividirEmLotes, selectEmLotes } from '../consultaEmLotes';

describe('dividirEmLotes', () => {
  it('quebra a lista em pedaços do tamanho pedido', () => {
    expect(dividirEmLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('devolve lista vazia para entrada vazia', () => {
    expect(dividirEmLotes([], 10)).toEqual([]);
  });

  it('mantém um único lote quando cabe tudo', () => {
    expect(dividirEmLotes([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });
});

describe('selectEmLotes', () => {
  it('não consulta nada quando não há ids', async () => {
    let chamadas = 0;
    const r = await selectEmLotes<number>([], async () => {
      chamadas++;
      return { data: [], error: null };
    });
    expect(chamadas).toBe(0);
    expect(r).toEqual({ data: [], error: null });
  });

  it('junta o resultado de todos os lotes', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const lotesRecebidos: string[][] = [];
    const r = await selectEmLotes<string>(
      ids,
      async (lote) => {
        lotesRecebidos.push(lote);
        return { data: lote.map((id) => `msg-${id}`), error: null };
      },
      2
    );
    expect(lotesRecebidos).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    expect(r.error).toBeNull();
    expect(r.data).toEqual(['msg-a', 'msg-b', 'msg-c', 'msg-d', 'msg-e']);
  });

  it('devolve o erro quando algum lote falha', async () => {
    const r = await selectEmLotes<string>(
      ['a', 'b', 'c'],
      async (lote) =>
        lote.includes('c')
          ? { data: null, error: { message: 'boom' } }
          : { data: lote, error: null },
      2
    );
    expect(r.data).toBeNull();
    expect(r.error).toEqual({ message: 'boom' });
  });
});
