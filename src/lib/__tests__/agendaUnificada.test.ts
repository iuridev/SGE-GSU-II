import { describe, it, expect } from 'vitest';
import { parseDataFlexivel, groupAgendaItemsByDate, filterAgendaItemsByMonth, type AgendaItem } from '../agendaUnificada';

describe('parseDataFlexivel', () => {
  it('aceita yyyy-MM-dd', () => {
    expect(parseDataFlexivel('2026-08-15')).toBe('2026-08-15');
  });

  it('aceita dd/MM/yyyy e converte para yyyy-MM-dd', () => {
    expect(parseDataFlexivel('15/08/2026')).toBe('2026-08-15');
    expect(parseDataFlexivel('5/8/2026')).toBe('2026-08-05');
  });

  it('retorna null para texto livre não reconhecido, em vez de lançar', () => {
    expect(parseDataFlexivel('Previsto para o 2º semestre')).toBeNull();
    expect(parseDataFlexivel('')).toBeNull();
    expect(parseDataFlexivel(undefined)).toBeNull();
    expect(parseDataFlexivel(null)).toBeNull();
  });

  it('retorna null para data com formato certo mas valor inválido', () => {
    expect(parseDataFlexivel('2026-13-40')).toBeNull();
    expect(parseDataFlexivel('32/13/2026')).toBeNull();
  });
});

describe('groupAgendaItemsByDate', () => {
  const items: AgendaItem[] = [
    { id: '1', tipo: 'reuniao', data: '2026-08-15', hora: '14:00', titulo: 'Reunião B' },
    { id: '2', tipo: 'ambiente', data: '2026-08-15', hora: '08:00', titulo: 'Reserva A' },
    { id: '3', tipo: 'carro', data: '2026-08-15', titulo: 'Carro sem horário' },
    { id: '4', tipo: 'obra', data: '2026-08-20', titulo: 'Início de obra' },
  ];

  it('agrupa itens pela data', () => {
    const grupos = groupAgendaItemsByDate(items);
    expect(Object.keys(grupos).sort()).toEqual(['2026-08-15', '2026-08-20']);
    expect(grupos['2026-08-15']).toHaveLength(3);
    expect(grupos['2026-08-20']).toHaveLength(1);
  });

  it('ordena os itens do dia por horário, itens sem horário primeiro', () => {
    const grupos = groupAgendaItemsByDate(items);
    const ids = grupos['2026-08-15'].map(i => i.id);
    expect(ids).toEqual(['3', '2', '1']);
  });
});

describe('filterAgendaItemsByMonth', () => {
  const items: AgendaItem[] = [
    { id: '1', tipo: 'reuniao', data: '2026-08-05', titulo: 'A' },
    { id: '2', tipo: 'reuniao', data: '2026-08-28', titulo: 'B' },
    { id: '3', tipo: 'reuniao', data: '2026-09-01', titulo: 'C' },
  ];

  it('filtra só os itens do mês/ano pedidos (mês 0-indexado)', () => {
    const agosto = filterAgendaItemsByMonth(items, 2026, 7);
    expect(agosto.map(i => i.id)).toEqual(['1', '2']);

    const setembro = filterAgendaItemsByMonth(items, 2026, 8);
    expect(setembro.map(i => i.id)).toEqual(['3']);
  });
});
