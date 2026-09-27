import { describe, it, expect } from 'vitest';
import {
  getQuinzena, quinzenaAnterior, ultimasQuinzenas, avaliarFiscalizacao, validarFiscalizacao,
  perguntasAplicaveis, escolasPendentes, resumirQuinzena, minutosEntre,
  type EntradaFiscalizacao, type FiscalizacaoRegistro, type Resposta,
} from '../fiscalizacaoElevadores';

function tudoOk(e: Pick<EntradaFiscalizacao, 'funcionando' | 'houveVisita'>): Record<string, Resposta> {
  return Object.fromEntries(perguntasAplicaveis(e).map(p => [p.id, 'ok' as Resposta]));
}

function entrada(over: Partial<EntradaFiscalizacao> = {}): EntradaFiscalizacao {
  const base = { funcionando: true, houveVisita: true, ...over };
  return { chamado: { houve: false }, respostas: tudoOk(base), ...base };
}

describe('quinzenas', () => {
  it('1ª quinzena vai do dia 1 ao 15', () => {
    const q = getQuinzena(new Date(2026, 8, 15));
    expect(q.inicio).toBe('2026-09-01');
    expect(q.fim).toBe('2026-09-15');
  });

  it('2ª quinzena vai do 16 ao último dia do mês', () => {
    expect(getQuinzena(new Date(2026, 8, 16)).fim).toBe('2026-09-30');
    expect(getQuinzena(new Date(2028, 1, 20)).fim).toBe('2028-02-29');
  });

  it('quinzenaAnterior atravessa mês e ano', () => {
    expect(quinzenaAnterior(getQuinzena(new Date(2026, 8, 20))).inicio).toBe('2026-09-01');
    expect(quinzenaAnterior(getQuinzena(new Date(2026, 0, 3))).inicio).toBe('2025-12-16');
  });

  it('ultimasQuinzenas retorna em ordem cronológica terminando na atual', () => {
    const l = ultimasQuinzenas(4, new Date(2026, 8, 20));
    expect(l.map(q => q.inicio)).toEqual(['2026-08-01', '2026-08-16', '2026-09-01', '2026-09-16']);
  });
});

describe('avaliarFiscalizacao', () => {
  it('tudo conforme → status conforme e score 100', () => {
    const a = avaliarFiscalizacao(entrada());
    expect(a.status).toBe('conforme');
    expect(a.score).toBe(100);
  });

  it('item com problema → atenção e score proporcional', () => {
    const e = entrada();
    e.respostas.portas = 'nok';
    const a = avaliarFiscalizacao(e);
    expect(a.status).toBe('atencao');
    expect(a.naoConformes).toEqual(['portas']);
    expect(a.score).toBeLessThan(100);
  });

  it('N/A não entra no cálculo do score', () => {
    const e = entrada();
    e.respostas.sensores = 'na';
    expect(avaliarFiscalizacao(e).score).toBe(100);
  });

  it('sem visita da empresa → atenção, e itens de visita não são exigidos', () => {
    const e = entrada({ houveVisita: false });
    expect(perguntasAplicaveis(e).some(p => p.id.startsWith('visita_'))).toBe(false);
    expect(avaliarFiscalizacao(e).status).toBe('atencao');
  });

  it('elevador parado → crítico e exige aviso de manutenção', () => {
    const e = entrada({ funcionando: false });
    expect(perguntasAplicaveis(e).some(p => p.id === 'aviso_manutencao')).toBe(true);
    expect(avaliarFiscalizacao(e).status).toBe('critico');
  });

  it('emergencial atendido em mais de 30 min → crítico', () => {
    const e = entrada({ chamado: { houve: true, tipo: 'emergencial', abertoEm: '2026-09-10T08:00', atendidoEm: '2026-09-10T08:45' } });
    const a = avaliarFiscalizacao(e);
    expect(a.minutosAtendimento).toBe(45);
    expect(a.atendimentoLento).toBe(true);
    expect(a.status).toBe('critico');
  });

  it('emergencial em 30 min exatos é dentro do prazo; corretivo nunca é "lento"', () => {
    const ok = entrada({ chamado: { houve: true, tipo: 'emergencial', abertoEm: '2026-09-10T08:00', atendidoEm: '2026-09-10T08:30' } });
    expect(avaliarFiscalizacao(ok).atendimentoLento).toBe(false);
    const corr = entrada({ chamado: { houve: true, tipo: 'corretivo', abertoEm: '2026-09-10T08:00', atendidoEm: '2026-09-12T08:00' } });
    expect(avaliarFiscalizacao(corr).atendimentoLento).toBe(false);
  });

  it('pessoa presa → crítico', () => {
    const e = entrada({ chamado: { houve: true, tipo: 'emergencial', abertoEm: '2026-09-10T08:00', pessoaPresa: true } });
    expect(avaliarFiscalizacao(e).status).toBe('critico');
  });
});

describe('validarFiscalizacao', () => {
  it('aceita formulário completo', () => {
    expect(validarFiscalizacao(entrada(), {}, null)).toEqual([]);
  });

  it('exige responder tudo e descrever cada problema', () => {
    const e = entrada();
    delete e.respostas.nivelamento;
    e.respostas.portas = 'nok';
    const erros = validarFiscalizacao(e, {}, null);
    expect(erros).toHaveLength(2);
    expect(validarFiscalizacao({ ...e, respostas: { ...e.respostas, nivelamento: 'ok' } }, { portas: 'porta 2 emperra' }, null)).toEqual([]);
  });

  it('elevador parado exige "desde quando"; chamado exige tipo e abertura', () => {
    expect(validarFiscalizacao(entrada({ funcionando: false }), {}, null)).toHaveLength(1);
    expect(validarFiscalizacao(entrada({ chamado: { houve: true } }), {}, null)).toHaveLength(2);
  });

  it('atendimento anterior à abertura é inválido', () => {
    const e = entrada({ chamado: { houve: true, tipo: 'corretivo', abertoEm: '2026-09-10T10:00', atendidoEm: '2026-09-10T09:00' } });
    expect(validarFiscalizacao(e, {}, null)).toHaveLength(1);
    expect(minutosEntre('2026-09-10T10:00', '2026-09-10T09:00')).toBeNull();
  });
});

function reg(school_id: string, period_start: string, over: Partial<FiscalizacaoRegistro> = {}): FiscalizacaoRegistro {
  return {
    id: `${school_id}-${period_start}`, school_id, period_start, period_end: period_start.replace(/-01$/, '-15'),
    inspector_name: null, created_at: '', is_operational: true, down_since: null, had_visit: true,
    answers: {}, observations: {}, had_call: false, call_type: null, call_opened_at: null, call_attended_at: null,
    call_response_minutes: null, person_trapped: false, general_notes: null, score: 100, status: 'conforme',
    nonconformities: [], ...over,
  };
}

describe('painel', () => {
  const escolas = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  const atual = getQuinzena(new Date(2026, 8, 3)); // 2026-09-01

  it('resumirQuinzena calcula adesão e ignora escolas fora da lista', () => {
    const regs = [reg('a', '2026-09-01', { score: 80, status: 'atencao' }), reg('zzz', '2026-09-01'), reg('b', '2026-08-16')];
    const r = resumirQuinzena(escolas, regs, atual);
    expect(r.respondidas).toBe(1);
    expect(r.adesao).toBe(33);
    expect(r.scoreMedio).toBe(80);
    expect(r.atencao).toBe(1);
  });

  it('escolasPendentes conta omissões consecutivas anteriores e ordena por gravidade', () => {
    const regs = [
      reg('a', '2026-09-01'),                      // respondeu a atual
      reg('b', '2026-08-16'),                      // respondeu a anterior → 0 omissões
      reg('c', '2026-07-16'),                      // faltou 08-01 e 08-16 → 2 omissões
    ];
    const p = escolasPendentes(escolas, regs, atual);
    expect(p.map(x => x.escola.id)).toEqual(['c', 'b']);
    expect(p[0].quinzenasSemResposta).toBe(2);
    expect(p[1].quinzenasSemResposta).toBe(0);
  });
});
