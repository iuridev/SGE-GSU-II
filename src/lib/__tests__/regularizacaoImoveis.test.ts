import { describe, it, expect } from 'vitest';
import { parsePlanilha, resumir, extrairRegistros, compararSnapshots, montarSnapshot, anoDoOficio } from '../regularizacaoImoveis';

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

  it('detecta mudanças de status entre fotografias', () => {
    const antes = montarSnapshot(imoveis, '2026-08-31');
    const depois = montarSnapshot(imoveis.map(i => i.escola.startsWith('ALICE') ? { ...i, status: 'em_andamento' as const } : i), '2026-09-30');
    expect(compararSnapshots(antes, depois)).toEqual([
      { chave: 'ALICE CHUERY PROFA', escola: 'ALICE CHUERY PROFA', de: 'nao_iniciada', para: 'em_andamento' },
    ]);
  });
});
