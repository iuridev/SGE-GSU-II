import { describe, it, expect } from 'vitest';
import {
  semanasDoMes, datasRepeticao, somarMeses, aguardandoConfirmacao, sugestoesParaMes,
  visitaCorrespondente, resumoExecucao, eventosExternosSemDuplicata, type Atividade,
} from '../cronogramaAtividades';

const atv = (p: Partial<Atividade>): Atividade => ({
  id: 'a', created_at: '', created_by: null, setor: 'SEOM', tipo: 'VISITA', titulo: 'EE TESTE',
  descricao: null, responsavel: null, local: null, data_prevista: '2026-09-10', hora_inicio: null, hora_fim: null,
  escola_id: 'e1', escola_nome: 'EE TESTE', fde_code: '123', objetivo: 'Vistoria Predial',
  status: 'PLANEJADA', data_realizada: null, observacoes_conclusao: null, motivo_nao_realizacao: null,
  participantes: null, visita_registrada: false, visita_registro_id: null, origem_id: null, sugestao_descartada: false,
  ...p,
});

describe('semanasDoMes', () => {
  it('começa na segunda e completa semanas com null', () => {
    const semanas = semanasDoMes('2026-10'); // 01/10/2026 é quinta
    expect(semanas[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(semanas.flat().filter(Boolean)).toHaveLength(31);
    semanas.forEach(s => expect(s).toHaveLength(7));
  });
});

describe('datasRepeticao', () => {
  it('repete semanalmente só dentro do mês', () => {
    expect(datasRepeticao('2026-10-07', 7)).toEqual(['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28']);
    expect(datasRepeticao('2026-10-07', 14)).toEqual(['2026-10-07', '2026-10-21']);
    expect(datasRepeticao('2026-10-07', 0)).toEqual(['2026-10-07']);
  });
});

describe('somarMeses', () => {
  it('vira o ano', () => {
    expect(somarMeses('2026-12', 1)).toBe('2027-01');
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
  });
});

describe('aguardandoConfirmacao', () => {
  it('só planejadas com data passada', () => {
    expect(aguardandoConfirmacao(atv({ data_prevista: '2026-10-01' }), '2026-10-14')).toBe(true);
    expect(aguardandoConfirmacao(atv({ data_prevista: '2026-10-14' }), '2026-10-14')).toBe(false);
    expect(aguardandoConfirmacao(atv({ data_prevista: '2026-10-01', status: 'CONCLUIDA' }), '2026-10-14')).toBe(false);
  });
});

describe('sugestoesParaMes', () => {
  it('sugere visitas não realizadas de meses anteriores ainda não reprogramadas nem descartadas', () => {
    const lista = [
      atv({ id: '1', status: 'NAO_REALIZADA', data_prevista: '2026-09-10' }),
      atv({ id: '2', status: 'NAO_REALIZADA', data_prevista: '2026-09-11' }),
      atv({ id: '3', origem_id: '2', data_prevista: '2026-10-05' }), // reprograma a 2
      atv({ id: '4', status: 'NAO_REALIZADA', data_prevista: '2026-09-12', sugestao_descartada: true }),
      atv({ id: '5', status: 'NAO_REALIZADA', data_prevista: '2026-10-02' }), // mesmo mês
      atv({ id: '6', status: 'NAO_REALIZADA', tipo: 'REUNIAO', data_prevista: '2026-09-02' }),
    ];
    expect(sugestoesParaMes(lista, '2026-10').map(a => a.id)).toEqual(['1']);
  });
});

describe('visitaCorrespondente', () => {
  it('encontra pela escola (FDE) dentro da janela e escolhe a mais próxima', () => {
    const a = atv({ data_prevista: '2026-09-10' });
    const visitas = [
      { data_visita: '2026-09-01', escola_nome: 'EE TESTE', fde_code: '123' }, // antes da janela
      { data_visita: '2026-09-20', escola_nome: 'EE TESTE', fde_code: '123' },
      { data_visita: '2026-09-12', escola_nome: 'EE TESTE', fde_code: '123' },
      { data_visita: '2026-09-10', escola_nome: 'EE OUTRA', fde_code: '999' },
    ];
    expect(visitaCorrespondente(a, visitas)?.data_visita).toBe('2026-09-12');
  });

  it('cai para o nome quando não há código FDE', () => {
    const a = atv({ fde_code: null, escola_nome: 'EE João Nunes' });
    expect(visitaCorrespondente(a, [{ data_visita: '2026-09-10', escola_nome: 'EE JOAO NUNES', fde_code: '' }])).not.toBeNull();
  });

  it('ignora atividades que não são visita', () => {
    expect(visitaCorrespondente(atv({ tipo: 'LIVE' }), [{ data_visita: '2026-09-10', escola_nome: 'EE TESTE', fde_code: '123' }])).toBeNull();
  });
});

describe('resumoExecucao', () => {
  it('ignora canceladas e calcula % sobre o que tem desfecho', () => {
    const r = resumoExecucao([
      atv({ status: 'CONCLUIDA' }), atv({ status: 'CONCLUIDA' }), atv({ status: 'NAO_REALIZADA' }),
      atv({ status: 'PLANEJADA', data_prevista: '2026-09-01' }), atv({ status: 'CANCELADA' }),
    ], '2026-10-14');
    expect(r).toMatchObject({ total: 4, concluidas: 2, naoRealizadas: 1, aguardando: 1, canceladas: 1, percentual: 67 });
  });
});

describe('eventosExternosSemDuplicata', () => {
  it('remove visitas escolares que o cronograma já mostra e mantém o resto', () => {
    const atividades = [
      atv({ id: 'x1', status: 'CONCLUIDA', data_realizada: '2026-09-10', visita_registrada: true }),
      atv({ id: 'x2', status: 'CONCLUIDA', data_realizada: '2026-09-12', escola_nome: 'EE João Nunes', visita_registrada: true }),
    ];
    const itens = [
      { id: 'esc-crono-x1', tipo: 'visita_escolar' as const, data: '2026-09-10', titulo: 'Visita Escolar — EE TESTE' },
      { id: 'esc-999', tipo: 'visita_escolar' as const, data: '2026-09-12', titulo: 'Visita Escolar — EE JOAO NUNES' },
      { id: 'esc-1000', tipo: 'visita_escolar' as const, data: '2026-09-15', titulo: 'Visita Escolar — EE OUTRA' },
      { id: 'reu-1', tipo: 'reuniao' as const, data: '2026-09-10', titulo: 'Reunião geral' },
    ];
    expect(eventosExternosSemDuplicata(itens, atividades).map(i => i.id)).toEqual(['esc-1000', 'reu-1']);
  });
});
