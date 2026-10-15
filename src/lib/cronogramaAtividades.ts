// Cronograma de Atividades SEOM/SEFISC — tipos e regras puras (sem React nem
// Supabase), para a página CronogramaSetor.tsx e para os testes.
// Ver migration 20261014030000_cronograma_atividades.sql.
import type { AgendaItem } from './agendaUnificada';

export const SETORES = ['SEOM', 'SEFISC'] as const;
export type Setor = typeof SETORES[number];

export const TIPOS_ATIVIDADE = ['VISITA', 'FORMACAO', 'OFICINA', 'REUNIAO', 'ROTINA_ADM', 'LIVE'] as const;
export type TipoAtividade = typeof TIPOS_ATIVIDADE[number];

export type StatusAtividade = 'PLANEJADA' | 'CONCLUIDA' | 'NAO_REALIZADA' | 'CANCELADA';

// Mesma lista da página Visitas às Escolas: o objetivo da visita planejada vai
// para a planilha de visitas quando ela é concluída.
export const OBJETIVOS_VISITA = [
  'Abertura de Obra',
  'Fechamento de Obra',
  'Patrimônio mobiliário',
  'Reunião Administrativa',
  'Fiscalização e Monitoramento',
  'Vistoria Predial',
  'Outros',
];

export const TIPO_INFO: Record<TipoAtividade, { label: string; plural: string; chip: string; dot: string; bar: string }> = {
  VISITA: { label: 'Visita Escolar', plural: 'Visitas Escolares', chip: 'bg-teal-50 text-teal-700 border-teal-200', dot: 'bg-teal-500', bar: '#14b8a6' },
  FORMACAO: { label: 'Formação', plural: 'Formações', chip: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500', bar: '#6366f1' },
  OFICINA: { label: 'Oficina', plural: 'Oficinas', chip: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', bar: '#f59e0b' },
  REUNIAO: { label: 'Reunião', plural: 'Reuniões', chip: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', bar: '#3b82f6' },
  ROTINA_ADM: { label: 'Rotina Adm.', plural: 'Rotinas Adm.', chip: 'bg-slate-100 text-slate-700 border-slate-300', dot: 'bg-slate-500', bar: '#64748b' },
  LIVE: { label: 'Live', plural: 'Lives', chip: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500', bar: '#f43f5e' },
};

// Tipos em que faz sentido registrar o nº de participantes na conclusão.
export const TIPOS_COM_PARTICIPANTES: TipoAtividade[] = ['FORMACAO', 'OFICINA', 'REUNIAO', 'LIVE'];

export interface Atividade {
  id: string;
  created_at: string;
  created_by: string | null;
  setor: Setor;
  tipo: TipoAtividade;
  titulo: string;
  descricao: string | null;
  responsavel: string | null;
  local: string | null;
  data_prevista: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  escola_id: string | null;
  escola_nome: string | null;
  fde_code: string | null;
  objetivo: string | null;
  status: StatusAtividade;
  data_realizada: string | null;
  observacoes_conclusao: string | null;
  motivo_nao_realizacao: string | null;
  participantes: number | null;
  visita_registrada: boolean;
  visita_registro_id: string | null;
  origem_id: string | null;
  sugestao_descartada: boolean;
}

// Visita já gravada na planilha de "Visitas às Escolas" (subconjunto dos campos).
export interface VisitaRegistrada {
  data_visita: string;
  escola_nome: string;
  fde_code: string;
}

// ── Datas (sempre no fuso local, como yyyy-MM-dd) ──────────────────────────

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const mesDe = (isoDate: string) => isoDate.slice(0, 7);

export const somarDias = (isoDate: string, dias: number) => {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return toISODate(d);
};

export const somarMeses = (mes: string, n: number) => {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const formatarData = (isoDate: string | null | undefined) => {
  if (!isoDate) return '-';
  const [y, m, d] = isoDate.split('-');
  return d && m && y ? `${d}/${m}/${y}` : isoDate;
};

export const nomeMes = (mes: string) => {
  const [y, m] = mes.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Semanas (segunda a domingo) que cobrem o mês; dias de fora do mês vêm como null.
export function semanasDoMes(mes: string): (string | null)[][] {
  const [y, m] = mes.split('-').map(Number);
  const ultimoDia = new Date(y, m, 0).getDate();
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // 0 = segunda
  const celulas: (string | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= ultimoDia; d++) celulas.push(`${mes}-${String(d).padStart(2, '0')}`);
  while (celulas.length % 7 !== 0) celulas.push(null);
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  return semanas;
}

// Datas de repetição dentro do mesmo mês da data inicial (inclui a própria).
export function datasRepeticao(inicio: string, intervaloDias: 0 | 7 | 14): string[] {
  if (!intervaloDias) return [inicio];
  const datas: string[] = [];
  for (let d = inicio; mesDe(d) === mesDe(inicio); d = somarDias(d, intervaloDias)) datas.push(d);
  return datas;
}

// ── Regras do cronograma ───────────────────────────────────────────────────

// Data já passou e ninguém informou se a atividade aconteceu.
export const aguardandoConfirmacao = (a: Atividade, hoje: string) =>
  a.status === 'PLANEJADA' && a.data_prevista < hoje;

// Visitas não realizadas em meses anteriores ao mês do cronograma, que ainda
// não foram reprogramadas nem descartadas — sugeridas para inclusão.
export function sugestoesParaMes(atividades: Atividade[], mes: string): Atividade[] {
  const reprogramadas = new Set(atividades.map(a => a.origem_id).filter(Boolean));
  return atividades
    .filter(a =>
      a.tipo === 'VISITA' &&
      a.status === 'NAO_REALIZADA' &&
      !a.sugestao_descartada &&
      !reprogramadas.has(a.id) &&
      mesDe(a.data_prevista) < mes,
    )
    .sort((a, b) => a.data_prevista.localeCompare(b.data_prevista));
}

const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');
const normalizar = (s: string | null | undefined) =>
  (s || '').normalize('NFD').replace(DIACRITICS, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Procura, na planilha de visitas, um registro que comprove a visita planejada:
// mesma escola (código FDE ou nome) com data entre 3 dias antes da prevista e
// o fim do mês seguinte. Serve para "acusar" a visita como realizada mesmo que
// o servidor a tenha registrado direto na página de Visitas às Escolas.
export function visitaCorrespondente(a: Atividade, visitas: VisitaRegistrada[]): VisitaRegistrada | null {
  if (a.tipo !== 'VISITA') return null;
  const de = somarDias(a.data_prevista, -3);
  const ate = `${somarMeses(mesDe(a.data_prevista), 1)}-31`;
  const fde = (a.fde_code || '').trim();
  const nome = normalizar(a.escola_nome);
  const candidatas = visitas.filter(v => {
    if (!v.data_visita || v.data_visita < de || v.data_visita > ate) return false;
    const vFde = (v.fde_code || '').trim();
    if (fde && vFde) return fde === vFde;
    return !!nome && normalizar(v.escola_nome) === nome;
  });
  if (!candidatas.length) return null;
  // A mais próxima da data prevista.
  const alvo = new Date(`${a.data_prevista}T00:00:00`).getTime();
  const dist = (v: VisitaRegistrada) => Math.abs(new Date(`${v.data_visita}T00:00:00`).getTime() - alvo);
  return candidatas.reduce((melhor, v) => (dist(v) < dist(melhor) ? v : melhor));
}

export interface ResumoExecucao {
  total: number;
  concluidas: number;
  naoRealizadas: number;
  planejadas: number;
  aguardando: number;
  canceladas: number;
  // % de execução sobre o que já tem desfecho (concluída ou não realizada).
  percentual: number | null;
}

export function resumoExecucao(atividades: Atividade[], hoje: string): ResumoExecucao {
  const r: ResumoExecucao = { total: 0, concluidas: 0, naoRealizadas: 0, planejadas: 0, aguardando: 0, canceladas: 0, percentual: null };
  for (const a of atividades) {
    if (a.status === 'CANCELADA') { r.canceladas++; continue; }
    r.total++;
    if (a.status === 'CONCLUIDA') r.concluidas++;
    else if (a.status === 'NAO_REALIZADA') r.naoRealizadas++;
    else {
      r.planejadas++;
      if (aguardandoConfirmacao(a, hoje)) r.aguardando++;
    }
  }
  const comDesfecho = r.concluidas + r.naoRealizadas;
  r.percentual = comDesfecho ? Math.round((r.concluidas / comDesfecho) * 100) : null;
  return r;
}

export function ordenarAtividades(lista: Atividade[]): Atividade[] {
  return [...lista].sort((a, b) =>
    a.data_prevista.localeCompare(b.data_prevista) ||
    (a.hora_inicio || '99').localeCompare(b.hora_inicio || '99') ||
    a.titulo.localeCompare(b.titulo),
  );
}

// Eventos da Agenda Unificada (outras páginas) exibidos no cronograma, sem a
// visita escolar que o próprio cronograma já mostra: a registrada por ele na
// planilha (id `crono-<atividade>`) e a confirmada a partir de um registro
// existente (mesma escola na data de realização).
export function eventosExternosSemDuplicata(itens: AgendaItem[], atividades: Atividade[]): AgendaItem[] {
  const ids = new Set(atividades.map(a => `esc-crono-${a.id}`));
  const concluidas = new Set(
    atividades
      .filter(a => a.tipo === 'VISITA' && a.status === 'CONCLUIDA' && a.data_realizada)
      .map(a => `${a.data_realizada}|${normalizar(a.escola_nome)}`),
  );
  return itens.filter(i => {
    if (i.tipo !== 'visita_escolar') return true;
    if (ids.has(i.id)) return false;
    const escola = normalizar(i.titulo.replace(/^Visita Escolar\s*—\s*/, ''));
    return !concluidas.has(`${i.data}|${escola}`);
  });
}
