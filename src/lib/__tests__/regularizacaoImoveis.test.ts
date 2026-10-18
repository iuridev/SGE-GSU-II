import { describe, it, expect } from 'vitest';
import {
  parsePlanilha, resumir, extrairRegistros, compararSnapshots, montarSnapshot, anoDoOficio,
  cartorioDoTexto, compararCartorio, projetarConclusao,
} from '../regularizacaoImoveis';

// Trechos reais da planilha (formato do export CSV do Google Sheets).
const CSV = [
  'nº,Escola,OFICIO URE,MATRICULAS / TRANSCRIÇÕES,,SOLICITAÇÃO 2º CRI,OFICIO CRI,ATUALIZAÇÃO,PROPRIETARIA,SOLICITAÇÃO 2º CRI,ATUALIZAÇÕES SEI',
  '1,AGOSTINHO CANO,OF - 224,NÃO TEM 1º CRI,,SOLICITAR,1549/26 RI,,,OK - OF,',
  '2,ALAYDE MARIA VICENTE PROFA,OF - 202,TRANS. 3821/3822/3823/3824/3825,,,1394/26 RI,2026,PMG,,',
  ',,,,,,,,,,',
  '5,ALEXANDRE LOPES OLIVEIRA,,MATRICULA 125.240,,,,2019,PMG,,',
  '6,ALICE CHUERY PROFA,,,,,,,,,',
  '39,JOAO CRISPINIANO SOARES,OF - 217,NÃO TEM 1º CRI,,SOLICITAR,1547/26 RI,,,,',
  ',JOAO NUNES PASTOR,OF - 314,MATRIC. 57.863,,,1223/26 RI,2026,FAZENDA ESTADO SP,,',
  '41,,,MATRIC. 142.696,,,1194/26 RI,2026,PMG,,',
  '71,VALENTIN GONZALEZ ALONSO,OF - 259,INSCRIÇÃO 103,,,1191/26 RI,NÃO LOCALIZ,NÃO LOCALIZ.,,',
  '65,REPUBLICA DA VENEZUELA,OF - 234,MATRIC. 139.082/12.361,,,1126/26 RI,2026,AS DEMAIS - PMG,,',
  ',,,,,,,,PARTICULAR -139080/139082,,',
  '46,JOSE ROBERTO FRIEBOLIN,OF - 502/2019,2º CRI - 20.380/53.684,,,,,,,',
].join('\n');

describe('regularizacaoImoveis', () => {
  const imoveis = parsePlanilha(CSV);
  const por = (nome: string) => imoveis.find(i => i.escola.startsWith(nome))!;

  it('agrupa linhas de continuação na unidade anterior', () => {
    expect(imoveis).toHaveLength(9);
    expect(por('JOAO NUNES').matriculas).toEqual(['57.863', '142.696']);
    expect(por('JOAO NUNES').oficiosCri).toHaveLength(2);
    expect(por('REPUBLICA').proprietarias).toEqual(['Prefeitura (PMG)', 'Particular']);
  });

  it('classifica o status de cada unidade', () => {
    expect(por('AGOSTINHO').status).toBe('aguardando_2cri');
    expect(por('ALAYDE').status).toBe('atualizada');
    expect(por('ALEXANDRE').status).toBe('desatualizada');
    expect(por('ALICE').status).toBe('nao_iniciada');
    expect(por('VALENTIN').status).toBe('nao_localizada');
    expect(por('JOSE ROBERTO').status).toBe('em_andamento');
  });

  it('extrai matrículas e transcrições ignorando o nº do cartório', () => {
    expect(extrairRegistros('MATRICULA 15.536 - TRANSCRIÇÃO 17.065 - 29.490'))
      .toEqual({ matriculas: ['15.536'], transcricoes: ['17.065', '29.490'], outros: [] });
    expect(extrairRegistros('MATRICULA 309 - 2º CARTORIO').matriculas).toEqual(['309']);
    expect(extrairRegistros('NÃO TEM 1º CRI').matriculas).toEqual([]);
  });

  it('resume contagens e pendências do 2º CRI', () => {
    const r = resumir(imoveis);
    expect(r.transcricoes).toBe(5);
    expect(r.solicitacoes2CriFeitas).toBe(1);
    expect(r.solicitacoes2CriPendentes).toBe(1);
    expect(anoDoOficio('1549/26 RI')).toBe(2026);
  });

  it('separa a situação no 1º e no 2º CRI', () => {
    expect(cartorioDoTexto('2º CRI - 20.380/53.684')).toBe(2);
    expect(cartorioDoTexto('MATRICULA 309 - 2º CARTORIO')).toBe(2);
    expect(cartorioDoTexto('NÃO TEM 1º CRI')).toBe(1);
    expect(cartorioDoTexto('1º CRI - TRANSCRIÇÃO 42.423')).toBe(1);

    expect(por('ALAYDE').cri1.status).toBe('atualizada');
    expect(por('ALAYDE').cri2.status).toBe('nao_se_aplica');
    expect(por('AGOSTINHO').cri1.status).toBe('nao_consta');
    expect(por('AGOSTINHO').cri2.status).toBe('aguardando');
    expect(por('JOAO CRISPINIANO').cri2.status).toBe('a_solicitar');
    expect(por('VALENTIN').cri1.status).toBe('nao_localizado');
    expect(por('JOSE ROBERTO').cri1.status).toBe('nao_consta');
    expect(por('JOSE ROBERTO').cri2.matriculas).toEqual(['20.380', '53.684']);
    expect(por('JOSE ROBERTO').cri2.status).toBe('aguardando');
    expect(por('ALICE').cri1.status).toBe('nao_pesquisado');

    const r = resumir(imoveis);
    expect(r.cri1.porStatus.atualizada).toBe(3);
    expect(r.cri2.unidades).toBe(3);
  });

  it('compara cartório só quando as duas fotografias têm o dado', () => {
    const depois = montarSnapshot(imoveis, '2026-10-31');
    const antigo = { ...depois, por_escola: Object.fromEntries(Object.entries(depois.por_escola).map(([k, v]) => [k, { escola: v.escola, status: v.status }])) };
    expect(compararCartorio(antigo, depois, 'cri1')).toEqual([]);
    const antes = montarSnapshot(imoveis.map(i => i.escola.startsWith('JOAO CRISPINIANO') ? { ...i, cri2: { ...i.cri2, status: 'a_solicitar' as const } } : i), '2026-09-30');
    const fim = montarSnapshot(imoveis.map(i => i.escola.startsWith('JOAO CRISPINIANO') ? { ...i, cri2: { ...i.cri2, status: 'aguardando' as const } } : i), '2026-10-31');
    expect(compararCartorio(antes, fim, 'cri2')).toEqual([
      { chave: 'JOAO CRISPINIANO SOARES', escola: 'JOAO CRISPINIANO SOARES', de: 'a_solicitar', para: 'aguardando' },
    ]);
  });

  it('projeta conclusão pelo ritmo mensal', () => {
    expect(projetarConclusao([{ ym: '2026-09', atualizadas: 20, total: 40 }, { ym: '2026-10', atualizadas: 30, total: 40 }]))
      .toEqual({ ritmo: 10, conclusao: '2026-11' });
    expect(projetarConclusao([{ ym: '2026-10', atualizadas: 30, total: 40 }])).toBeNull();
  });

  it('detecta mudanças de status entre fotografias', () => {
    const antes = montarSnapshot(imoveis, '2026-08-31');
    const depois = montarSnapshot(imoveis.map(i => i.escola.startsWith('ALICE') ? { ...i, status: 'em_andamento' as const } : i), '2026-09-30');
    expect(compararSnapshots(antes, depois)).toEqual([
      { chave: 'ALICE CHUERY PROFA', escola: 'ALICE CHUERY PROFA', de: 'nao_iniciada', para: 'em_andamento' },
    ]);
  });
});
