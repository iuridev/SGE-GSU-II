// Tipos e funções puras da Agenda Unificada — agrega os diferentes tipos de
// agendamento já existentes no sistema (ambientes, carros, reuniões, visita
// técnica da fiscalização, obras, visitas escolares) numa única visão de
// calendário. A busca/mistura das fontes vive no componente (efeito
// colateral); aqui só o que é puro e testável.
import { parseISO, isValid } from 'date-fns';

export type AgendaSourceType = 'ambiente' | 'carro' | 'reuniao' | 'visita_fiscal' | 'obra' | 'visita_escolar';

export interface AgendaTipoConfig {
  tipo: AgendaSourceType;
  label: string;
  cor: string; // classe Tailwind de fundo do pontinho no calendário
}

export const AGENDA_TIPOS: AgendaTipoConfig[] = [
  { tipo: 'ambiente', label: 'Reserva de Ambiente', cor: 'bg-blue-500' },
  { tipo: 'carro', label: 'Carro Oficial', cor: 'bg-amber-500' },
  { tipo: 'reuniao', label: 'Reunião/Calendário', cor: 'bg-indigo-500' },
  { tipo: 'visita_fiscal', label: 'Visita Técnica (Fiscalização)', cor: 'bg-red-500' },
  { tipo: 'obra', label: 'Obra', cor: 'bg-orange-500' },
  { tipo: 'visita_escolar', label: 'Visita Escolar', cor: 'bg-emerald-500' },
];

export interface AgendaItem {
  id: string;
  tipo: AgendaSourceType;
  data: string; // yyyy-MM-dd
  titulo: string;
  subtitulo?: string;
  hora?: string;
}

// As datas de Obras vêm como texto livre digitado numa planilha (nem a
// própria página de Obras faz parse disso, só exibe a string crua) — não dá
// pra confiar que estão em yyyy-MM-dd. Tenta os formatos mais comuns e
// devolve null (nunca lança) quando não reconhece, para a obra simplesmente
// não aparecer no calendário em vez de quebrar a agenda inteira.
export function parseDataFlexivel(texto: string | undefined | null): string | null {
  const valor = (texto || '').trim();
  if (!valor) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return isValid(parseISO(valor)) ? valor : null;
  }

  const match = valor.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, dia, mes, ano] = match;
    const iso = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    return isValid(parseISO(iso)) ? iso : null;
  }

  return null;
}

// Agrupa por data (yyyy-MM-dd) para alimentar o grid do mês; dentro de cada
// dia, ordena por horário (itens sem horário — carro, obra — ficam no topo).
export function groupAgendaItemsByDate(items: AgendaItem[]): Record<string, AgendaItem[]> {
  const grupos: Record<string, AgendaItem[]> = {};
  for (const item of items) {
    if (!grupos[item.data]) grupos[item.data] = [];
    grupos[item.data].push(item);
  }
  for (const data of Object.keys(grupos)) {
    grupos[data].sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
  }
  return grupos;
}

// `mes` é 0-indexado (janeiro = 0), igual ao `Date.getMonth()` nativo.
export function filterAgendaItemsByMonth(items: AgendaItem[], ano: number, mes: number): AgendaItem[] {
  const prefixo = `${ano}-${String(mes + 1).padStart(2, '0')}`;
  return items.filter(item => item.data.startsWith(prefixo));
}
