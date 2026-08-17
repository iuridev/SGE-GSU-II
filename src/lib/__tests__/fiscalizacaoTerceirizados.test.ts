import { describe, it, expect } from 'vitest';
import { startOfWeek, format } from 'date-fns';
import {
  isAtivo,
  isFrequenciaObrigatoria,
  isSchoolExempt,
  getChecklistDueInfo,
  getUltimaDataChecklist,
  summarizeChecklistAlertsBySchool,
  validateOccurrenceForm,
  rowsToCsv,
  aggregateSatisfactionByPeriod,
  getSchoolsNeedingAttention,
  getMesesPendentesDeAvaliacao,
  groupOccurrencesBySchoolChronological,
  countOccurrencesBySchool,
} from '../fiscalizacaoTerceirizados';

describe('isAtivo', () => {
  it('reconhece "sim" (em qualquer caixa) como ativo', () => {
    expect(isAtivo('sim')).toBe(true);
    expect(isAtivo('SIM')).toBe(true);
    expect(isAtivo(' Sim ')).toBe(true);
  });

  it('trata qualquer outro valor, incluindo vazio/indefinido, como inativo', () => {
    expect(isAtivo('nao')).toBe(false);
    expect(isAtivo('')).toBe(false);
    expect(isAtivo(undefined)).toBe(false);
    expect(isAtivo(null)).toBe(false);
  });
});

describe('isFrequenciaObrigatoria', () => {
  it('diária é opcional; semanal, mensal e trimestral são obrigatórias', () => {
    expect(isFrequenciaObrigatoria('diaria')).toBe(false);
    expect(isFrequenciaObrigatoria('semanal')).toBe(true);
    expect(isFrequenciaObrigatoria('mensal')).toBe(true);
    expect(isFrequenciaObrigatoria('trimestral')).toBe(true);
  });
});

describe('getChecklistDueInfo', () => {
  const hoje = new Date('2026-08-15T12:00:00');

  it('item diário nunca vence — status fixo "diaria"', () => {
    expect(getChecklistDueInfo('diaria', null, hoje)).toEqual({ status: 'diaria', proximaData: null });
    expect(getChecklistDueInfo('diaria', '2026-01-01', hoje)).toEqual({ status: 'diaria', proximaData: null });
  });

  it('item não-diário nunca preenchido fica marcado para preencher', () => {
    const info = getChecklistDueInfo('semanal', null, hoje);
    expect(info.status).toBe('nunca-preenchido');
  });

  it('item semanal preenchido há mais de 7 dias fica atrasado', () => {
    const info = getChecklistDueInfo('semanal', '2026-08-01', hoje);
    expect(info.status).toBe('atrasado');
  });

  it('item mensal preenchido há poucos dias fica em dia', () => {
    const info = getChecklistDueInfo('mensal', '2026-08-10', hoje);
    expect(info.status).toBe('em-dia');
  });

  it('item trimestral vencendo nos próximos 3 dias é sinalizado', () => {
    // último preenchimento em 2026-05-18 + 90 dias vence em 2026-08-16, 1 dia à frente de "hoje"
    const info = getChecklistDueInfo('trimestral', '2026-05-18', hoje);
    expect(info.status).toBe('vencendo');
  });
});

describe('summarizeChecklistAlertsBySchool', () => {
  it('agrupa vários alertas da mesma escola numa única linha, contando por status', () => {
    const alertas = [
      { escolaId: 'e1', escolaNome: 'Agostinho Cano', status: 'nunca-preenchido' as const },
      { escolaId: 'e1', escolaNome: 'Agostinho Cano', status: 'nunca-preenchido' as const },
      { escolaId: 'e1', escolaNome: 'Agostinho Cano', status: 'atrasado' as const },
      { escolaId: 'e2', escolaNome: 'Escola B', status: 'vencendo' as const },
    ];
    const resumo = summarizeChecklistAlertsBySchool(alertas);
    expect(resumo).toEqual([
      { escolaId: 'e1', escolaNome: 'Agostinho Cano', total: 3, atrasados: 1, vencendo: 0, nuncaPreenchido: 2 },
      { escolaId: 'e2', escolaNome: 'Escola B', total: 1, atrasados: 0, vencendo: 1, nuncaPreenchido: 0 },
    ]);
  });

  it('ordena da escola com mais pendências para a com menos', () => {
    const alertas = [
      { escolaId: 'e1', escolaNome: 'Poucas', status: 'vencendo' as const },
      { escolaId: 'e2', escolaNome: 'Muitas', status: 'atrasado' as const },
      { escolaId: 'e2', escolaNome: 'Muitas', status: 'atrasado' as const },
    ];
    const resumo = summarizeChecklistAlertsBySchool(alertas);
    expect(resumo.map(r => r.escolaId)).toEqual(['e2', 'e1']);
  });

  it('retorna array vazio quando não há alertas', () => {
    expect(summarizeChecklistAlertsBySchool([])).toEqual([]);
  });
});

describe('validateOccurrenceForm', () => {
  it('exige data, ambiente e descrição', () => {
    const errors = validateOccurrenceForm({ data: '', ambiente: '', descricaoOcorrencia: '' });
    expect(Object.keys(errors)).toEqual(['data', 'ambiente', 'descricaoOcorrencia']);
  });

  it('não retorna erro quando os campos obrigatórios estão preenchidos', () => {
    const errors = validateOccurrenceForm({
      data: '2026-08-15', ambiente: 'Pátio', descricaoOcorrencia: 'Lixo acumulado no pátio.',
    });
    expect(errors).toEqual({});
  });

  it('não aceita espaços em branco como preenchido', () => {
    const errors = validateOccurrenceForm({ data: '2026-08-15', ambiente: '   ', descricaoOcorrencia: 'ok' });
    expect(errors.ambiente).toBeDefined();
  });
});

describe('rowsToCsv', () => {
  it('gera CSV com cabeçalho traduzido e uma linha por registro', () => {
    const csv = rowsToCsv(
      [
        { key: 'data', label: 'Data' },
        { key: 'escola', label: 'Escola' },
      ],
      [{ data: '2026-08-15', escola: 'EE Exemplo' }],
    );
    const linhas = csv.trim().split('\r\n');
    expect(linhas[0]).toBe('Data,Escola');
    expect(linhas[1]).toBe('2026-08-15,EE Exemplo');
  });
});

describe('getUltimaDataChecklist', () => {
  it('retorna a data mais recente entre os preenchimentos do item/escola', () => {
    const completions = [
      { checklistItemId: 'item-1', escolaId: 'esc-1', data: '2026-07-01' },
      { checklistItemId: 'item-1', escolaId: 'esc-1', data: '2026-08-01' },
      { checklistItemId: 'item-1', escolaId: 'esc-2', data: '2026-08-10' },
    ];
    expect(getUltimaDataChecklist(completions, 'item-1', 'esc-1')).toBe('2026-08-01');
  });

  it('retorna null quando não há preenchimento', () => {
    expect(getUltimaDataChecklist([], 'item-1', 'esc-1')).toBeNull();
  });
});

describe('aggregateSatisfactionByPeriod', () => {
  const ratings = [
    { data: '2026-08-05', nota: '8' },
    { data: '2026-08-10', nota: '6' },
    { data: '2026-09-01', nota: '10' },
  ];

  it('agrupa por mês e calcula a média', () => {
    const result = aggregateSatisfactionByPeriod(ratings, 'mensal');
    expect(result).toEqual([
      { periodo: '2026-08', media: 7, quantidade: 2 },
      { periodo: '2026-09', media: 10, quantidade: 1 },
    ]);
  });

  it('agrupa por semana, com início na segunda-feira', () => {
    const result = aggregateSatisfactionByPeriod(ratings, 'semanal');
    const semana5 = format(startOfWeek(new Date('2026-08-05T12:00:00'), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const periodos = result.map(r => r.periodo);
    expect(periodos).toContain(semana5);
  });

  it('respeita o filtro de período (início/fim)', () => {
    const result = aggregateSatisfactionByPeriod(ratings, 'mensal', '2026-09-01', '2026-09-30');
    expect(result).toEqual([{ periodo: '2026-09', media: 10, quantidade: 1 }]);
  });

  it('ignora notas não numéricas', () => {
    const result = aggregateSatisfactionByPeriod([{ data: '2026-08-05', nota: 'abc' }], 'mensal');
    expect(result).toEqual([]);
  });
});

describe('getSchoolsNeedingAttention', () => {
  const hoje = new Date('2026-08-15T12:00:00');
  const schools = [{ id: 'esc-1', name: 'EE Um' }, { id: 'esc-2', name: 'EE Dois' }];

  it('sinaliza escola com satisfação média baixa recente', () => {
    const ratings = [
      { escolaId: 'esc-1', nota: '3', data: '2026-08-01' },
      { escolaId: 'esc-1', nota: '4', data: '2026-08-10' },
    ];
    const result = getSchoolsNeedingAttention(schools, [], ratings, [], [], { hoje });
    expect(result).toHaveLength(1);
    expect(result[0].escolaId).toBe('esc-1');
    expect(result[0].motivos[0]).toMatch(/Satisfação média baixa/);
  });

  it('sinaliza escola com ocorrências pendentes acumuladas', () => {
    const occurrences = [
      { escolaId: 'esc-2', situacao: 'pendente' },
      { escolaId: 'esc-2', situacao: 'pendente' },
      { escolaId: 'esc-2', situacao: 'resolvido' },
    ];
    const result = getSchoolsNeedingAttention(schools, occurrences, [], [], [], { hoje });
    expect(result).toHaveLength(1);
    expect(result[0].escolaId).toBe('esc-2');
    expect(result[0].motivos[0]).toContain('2 ocorrências pendentes');
  });

  it('sinaliza escola com checklist obrigatório atrasado', () => {
    const checklistItems = [
      { id: 'item-1', serviceTypeId: 'svc-1', frequencia: 'semanal' as const, descricaoItem: 'x', ativo: 'sim' },
    ];
    const completions = [
      { checklistItemId: 'item-1', escolaId: 'esc-1', data: '2026-07-01' },
    ];
    const result = getSchoolsNeedingAttention(schools, [], [], checklistItems, completions, { hoje });
    expect(result.map(r => r.escolaId)).toContain('esc-1');
  });

  it('não sinaliza escola sem nenhum problema', () => {
    const result = getSchoolsNeedingAttention(schools, [], [], [], [], { hoje });
    expect(result).toEqual([]);
  });

  it('não sinaliza checklist atrasado de um serviço do qual a escola está isenta', () => {
    const somenteEsc1 = [{ id: 'esc-1', name: 'EE Um' }];
    const checklistItems = [
      { id: 'item-1', serviceTypeId: 'svc-1', frequencia: 'semanal' as const, descricaoItem: 'x', ativo: 'sim' },
    ];
    const completions = [
      { checklistItemId: 'item-1', escolaId: 'esc-1', data: '2026-07-01' },
    ];
    const exemptions = [
      { escolaId: 'esc-1', serviceTypeId: 'svc-1', ativo: 'sim' },
    ];
    const result = getSchoolsNeedingAttention(somenteEsc1, [], [], checklistItems, completions, { hoje }, exemptions);
    expect(result).toEqual([]);
  });
});

describe('isSchoolExempt', () => {
  const exemptions = [
    { escolaId: 'esc-1', serviceTypeId: 'svc-limpeza', ativo: 'sim' },
    { escolaId: 'esc-1', serviceTypeId: 'svc-transporte', ativo: 'nao' },
  ];

  it('retorna true para um par escola/serviço com isenção ativa', () => {
    expect(isSchoolExempt(exemptions, 'esc-1', 'svc-limpeza')).toBe(true);
  });

  it('retorna false quando a isenção existe mas está desativada (removida)', () => {
    expect(isSchoolExempt(exemptions, 'esc-1', 'svc-transporte')).toBe(false);
  });

  it('retorna false para escola/serviço sem nenhuma isenção registrada', () => {
    expect(isSchoolExempt(exemptions, 'esc-2', 'svc-limpeza')).toBe(false);
  });
});

describe('getMesesPendentesDeAvaliacao', () => {
  const hoje = new Date('2026-08-15T12:00:00');

  it('lista meses fechados com ocorrência e sem avaliação, em ordem cronológica', () => {
    const occurrences = [
      { escolaId: 'esc-1', data: '2026-06-05' },
      { escolaId: 'esc-1', data: '2026-06-20' },
      { escolaId: 'esc-1', data: '2026-07-10' },
    ];
    const result = getMesesPendentesDeAvaliacao(occurrences, [], 'esc-1', hoje);
    expect(result).toEqual([
      { mes: '2026-06', quantidade: 2 },
      { mes: '2026-07', quantidade: 1 },
    ]);
  });

  it('não inclui o mês atual, mesmo com ocorrências', () => {
    const occurrences = [{ escolaId: 'esc-1', data: '2026-08-10' }];
    const result = getMesesPendentesDeAvaliacao(occurrences, [], 'esc-1', hoje);
    expect(result).toEqual([]);
  });

  it('não repete mês que já tem avaliação registrada', () => {
    const occurrences = [{ escolaId: 'esc-1', data: '2026-07-10' }];
    const reviews = [{ escolaId: 'esc-1', mesReferencia: '2026-07' }];
    const result = getMesesPendentesDeAvaliacao(occurrences, reviews, 'esc-1', hoje);
    expect(result).toEqual([]);
  });

  it('ignora ocorrências de outra escola', () => {
    const occurrences = [{ escolaId: 'esc-2', data: '2026-07-10' }];
    const result = getMesesPendentesDeAvaliacao(occurrences, [], 'esc-1', hoje);
    expect(result).toEqual([]);
  });
});

describe('groupOccurrencesBySchoolChronological', () => {
  const schools = [{ id: 'esc-1', name: 'Zeta' }, { id: 'esc-2', name: 'Alfa' }];
  const occurrences = [
    { id: 'o1', escolaId: 'esc-1', data: '2026-07-20', criadoEm: '2026-07-20T10:00:00', ambiente: '', categoriaOcorrencia: '', descricaoOcorrencia: '', providenciaAdotada: '', retornoDaEmpresa: '', situacao: 'pendente', anexos: '', registradoPor: '', serviceTypeId: 's1' },
    { id: 'o2', escolaId: 'esc-1', data: '2026-07-05', criadoEm: '2026-07-05T10:00:00', ambiente: '', categoriaOcorrencia: '', descricaoOcorrencia: '', providenciaAdotada: '', retornoDaEmpresa: '', situacao: 'pendente', anexos: '', registradoPor: '', serviceTypeId: 's1' },
    { id: 'o3', escolaId: 'esc-2', data: '2026-07-10', criadoEm: '2026-07-10T10:00:00', ambiente: '', categoriaOcorrencia: '', descricaoOcorrencia: '', providenciaAdotada: '', retornoDaEmpresa: '', situacao: 'pendente', anexos: '', registradoPor: '', serviceTypeId: 's1' },
  ];

  it('ordena escolas alfabeticamente e ocorrências de cada uma cronologicamente', () => {
    const grupos = groupOccurrencesBySchoolChronological(occurrences, schools);
    expect(grupos.map(g => g.escolaNome)).toEqual(['Alfa', 'Zeta']);
    expect(grupos[1].occurrences.map(o => o.id)).toEqual(['o2', 'o1']);
  });

  it('filtra por período quando informado', () => {
    const grupos = groupOccurrencesBySchoolChronological(occurrences, schools, '2026-07-06', '2026-07-31');
    const todasOcorrencias = grupos.flatMap(g => g.occurrences.map(o => o.id));
    expect(todasOcorrencias.sort()).toEqual(['o1', 'o3']);
  });
});

describe('countOccurrencesBySchool', () => {
  const schools = [{ id: 'esc-1', name: 'EE Um' }, { id: 'esc-2', name: 'EE Dois' }, { id: 'esc-3', name: 'EE Três' }];
  const occurrences = [
    { escolaId: 'esc-1', data: '2026-07-01' },
    { escolaId: 'esc-1', data: '2026-07-05' },
    { escolaId: 'esc-2', data: '2026-07-10' },
  ];

  it('conta por escola e o total geral, ignorando escolas sem ocorrência', () => {
    const { porEscola, total } = countOccurrencesBySchool(occurrences, schools);
    expect(total).toBe(3);
    expect(porEscola).toEqual([
      { escolaId: 'esc-1', escolaNome: 'EE Um', quantidade: 2 },
      { escolaId: 'esc-2', escolaNome: 'EE Dois', quantidade: 1 },
    ]);
  });

  it('respeita o filtro de período', () => {
    const { porEscola, total } = countOccurrencesBySchool(occurrences, schools, '2026-07-05', '2026-07-31');
    expect(total).toBe(2);
    // Empate de 1 ocorrência cada — desempate alfabético: "EE Dois" vem antes de "EE Um".
    expect(porEscola.map(e => e.escolaId)).toEqual(['esc-2', 'esc-1']);
  });
});
