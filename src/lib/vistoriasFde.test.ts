import { describe, expect, it } from 'vitest';
import {
  apontamentos,
  desempenhoPorItem,
  distribuicaoPorAmbiente,
  evolucaoMensal,
  inicioDoPeriodo,
  interpretarCsv,
  notaMedia,
  resumoPorEscola,
} from './vistoriasFde';

const CABECALHO = '"Data","Unidade Regional de Ensino","Cód. UE","Unidade de Ensino","Nota","A1 Cons","A3Bf Limp","A6 Prepa","A7 Jardinag","PN Pont","PN Texto","PP Pont","PP Texto"';

function csv(...linhas: string[]) {
  return [CABECALHO, ...linhas].join('\n');
}

const ESCOLA_A_JAN = '"10/01/2026","GUARULHOS SUL","38362","EE ESCOLA A","50","R","B","SIM","N/A","2","Banheiro","0",""';
const ESCOLA_A_MAR = '"15/03/2026","GUARULHOS SUL","038362","ESCOLA A","70","MB","MR","NÃO","B","0","","8","Horta"';
const ESCOLA_B_JAN = '"20/01/2026","GUARULHOS SUL","6270","ESCOLA B","90","B","MB","SIM","MB","0","","10",""';

describe('interpretarCsv', () => {
  it('lê data, CIE sem zeros, nota e textos', () => {
    const { vistorias } = interpretarCsv(csv(ESCOLA_A_JAN, ESCOLA_A_MAR));
    expect(vistorias[0]).toMatchObject({ data: '2026-01-10', cie: '38362', escola: 'ESCOLA A', nota: 50, pontosNegativos: 2, textoNegativo: 'Banheiro' });
    expect(vistorias[1].cie).toBe('38362');
  });

  it('ordena por data mesmo com a planilha fora de ordem', () => {
    const { vistorias } = interpretarCsv(csv(ESCOLA_A_MAR, ESCOLA_A_JAN));
    expect(vistorias.map(v => v.data)).toEqual(['2026-01-10', '2026-03-15']);
  });

  it('ignora SIM/NÃO e N/A: não são conceitos', () => {
    const base = interpretarCsv(csv(ESCOLA_A_JAN));
    expect(base.vistorias[0].conceitos).toEqual({ 'A1 Cons': 'R', 'A3Bf Limp': 'B' });
    expect(base.itens.map(i => i.coluna)).toEqual(['A1 Cons', 'A3Bf Limp']);
  });

  it('reconhece o ambiente dos banheiros pelo nome real da coluna', () => {
    const base = interpretarCsv(csv(ESCOLA_A_JAN));
    expect(base.itens[1]).toMatchObject({ ambiente: 'A3BF', ambienteNome: 'Banheiro feminino', fator: 'Limpeza' });
  });

  it('aceita quebra de linha dentro de texto', () => {
    const linha = '"10/01/2026","GUARULHOS SUL","38362","ESCOLA A","50","R","B","SIM","B","2","Linha 1\nLinha 2","0",""';
    expect(interpretarCsv(csv(linha)).vistorias[0].textoNegativo).toBe('Linha 1\nLinha 2');
  });

  it('conta e descarta linhas sem data, escola ou nota válidas', () => {
    const invalida = '"sem data","GUARULHOS SUL","38362","ESCOLA A","50","R","B","SIM","B","0","","0",""';
    const base = interpretarCsv(csv(ESCOLA_A_JAN, invalida, ''));
    expect(base.vistorias).toHaveLength(1);
    expect(base.linhasIgnoradas).toBe(1);
  });

  it('avisa quando o formato da planilha muda', () => {
    expect(() => interpretarCsv('"Data","Escola"\n"10/01/2026","X"')).toThrow(/mudou de formato/);
  });
});

describe('métricas', () => {
  const { vistorias, itens } = interpretarCsv(csv(ESCOLA_A_JAN, ESCOLA_B_JAN, ESCOLA_A_MAR));

  it('média usa cada vistoria, não a média de médias mensais', () => {
    expect(notaMedia(vistorias)).toBe(70);
    const comMaisVistoriasEmJaneiro = interpretarCsv(csv(ESCOLA_A_JAN, ESCOLA_B_JAN, ESCOLA_B_JAN, ESCOLA_A_MAR));
    expect(notaMedia(comMaisVistoriasEmJaneiro.vistorias)).toBe(75);
  });

  it('evolução inclui mês sem vistoria com nota nula', () => {
    expect(evolucaoMensal(vistorias)).toEqual([
      { mes: '2026-01', rotulo: 'Jan/26', nota: 70, vistorias: 2 },
      { mes: '2026-02', rotulo: 'Fev/26', nota: null, vistorias: 0 },
      { mes: '2026-03', rotulo: 'Mar/26', nota: 70, vistorias: 1 },
    ]);
  });

  it('evolução atravessa a virada do ano', () => {
    const base = interpretarCsv(csv(
      '"20/12/2025","GUARULHOS SUL","6270","B","90","B","B","SIM","B","0","","0",""',
      '"20/01/2026","GUARULHOS SUL","6270","B","80","B","B","SIM","B","0","","0",""',
    ));
    expect(evolucaoMensal(base.vistorias).map(p => p.rotulo)).toEqual(['Dez/25', 'Jan/26']);
  });

  it('resumo por escola compara a última vistoria com a anterior', () => {
    const resumo = resumoPorEscola(vistorias);
    expect(resumo.map(r => r.cie)).toEqual(['38362', '6270']);
    expect(resumo[0]).toMatchObject({ vistorias: 2, media: 60, ultimaNota: 70, ultimaData: '2026-03-15', variacao: 20 });
    expect(resumo[1].variacao).toBeNull();
  });

  it('distribuição por ambiente soma 100%', () => {
    const banheiro = distribuicaoPorAmbiente(vistorias, itens).find(a => a.codigo === 'A3BF');
    expect(banheiro?.total).toBe(3);
    expect((banheiro?.MB ?? 0) + (banheiro?.B ?? 0) + (banheiro?.R ?? 0) + (banheiro?.MR ?? 0)).toBeCloseTo(100, 0);
  });

  it('itens vêm do mais problemático para o menos', () => {
    const linhas = desempenhoPorItem(vistorias, itens);
    expect(linhas[0].item.coluna).toBe('A3Bf Limp');
    expect(linhas[0].contagem.MR).toBe(1);
    expect(linhas[linhas.length - 1].percentualCritico).toBe(0);
  });

  it('apontamentos listam só Ruim e Muito ruim', () => {
    expect(apontamentos(vistorias[0], itens).map(a => [a.item.coluna, a.conceito])).toEqual([['A1 Cons', 'R']]);
  });

  it('período inclui o mês atual', () => {
    expect(inicioDoPeriodo(3, new Date(2026, 0, 31))).toBe('2025-11-01');
  });
});
