// Tipos, configuração e funções puras do módulo de Fiscalização de Serviços
// Terceirizados. Tipos de serviço (Limpeza, Transporte, e futuramente
// Cuidador/Merenda) e os itens de checklist NÃO ficam aqui — eles vêm da
// planilha (abas ServiceTypes/ChecklistItems) via Edge Function, para que um
// novo serviço seja só uma linha nova na planilha, sem deploy. O que fica
// aqui é o que raramente muda: categorias de ocorrência e as frequências
// possíveis de um item de checklist.
import { addDays, differenceInCalendarDays, parseISO, startOfWeek, startOfMonth, format } from 'date-fns';
import Papa from 'papaparse';

export type Frequencia = 'diaria' | 'semanal' | 'mensal' | 'trimestral';

export interface FrequenciaConfig {
  key: Frequencia;
  label: string;
  intervaloDias: number | null; // null = diária, sem conceito de "vencimento"
}

// Ordem de exibição: semanal/mensal/trimestral primeiro (respostas
// obrigatórias, é o que o gestor/fiscal precisa acompanhar de perto) e
// diária por último (opcional — o gestor não tem como fiscalizar isso todo
// dia).
export const FREQUENCIAS: FrequenciaConfig[] = [
  { key: 'semanal', label: 'Semanal', intervaloDias: 7 },
  { key: 'mensal', label: 'Mensal', intervaloDias: 30 },
  { key: 'trimestral', label: 'Trimestral', intervaloDias: 90 },
  { key: 'diaria', label: 'Diária', intervaloDias: null },
];

// Categorias sugeridas pelo material de fiscalização (DISPA/SEDUC). Ficam em
// config para serem fáceis de ajustar sem procurar pelo meio da UI — mas,
// diferente de ServiceTypes/ChecklistItems, não mudam por escola nem por
// serviço, então não justificam uma aba própria na planilha.
export const OCCURRENCE_CATEGORIES = [
  'Ausência de profissionais/quadro incompleto',
  'Falta de materiais/insumos/equipamentos',
  'Problemas de qualidade na execução',
  'Descumprimento de rotinas e frequências',
  'EPI/uniforme inadequado',
  'Conduta inadequada da equipe',
  'Reincidência de ocorrência',
  'Ocorrência não solucionada pela supervisão da empresa',
] as const;

export const SITUACOES = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'resolvido', label: 'Resolvido' },
] as const;

export interface ServiceType {
  id: string;
  nome: string;
  ativo: string; // 'sim' | 'nao' — vem da planilha como texto
}

export interface ChecklistItem {
  id: string;
  serviceTypeId: string;
  frequencia: Frequencia;
  descricaoItem: string;
  ativo: string;
}

export interface Occurrence {
  id: string;
  data: string;
  escolaId: string;
  serviceTypeId: string;
  ambiente: string;
  categoriaOcorrencia: string;
  descricaoOcorrencia: string;
  providenciaAdotada: string;
  retornoDaEmpresa: string;
  situacao: 'pendente' | 'resolvido' | string;
  anexos: string;
  registradoPor: string;
  criadoEm: string;
}

export interface ChecklistCompletion {
  id: string;
  data: string;
  escolaId: string;
  serviceTypeId: string;
  checklistItemId: string;
  executado: 'sim' | 'nao' | string;
  observacao: string;
  registradoPor: string;
  criadoEm: string;
}

export interface SatisfactionRating {
  id: string;
  data: string;
  escolaId: string;
  serviceTypeId: string;
  nota: string; // 0-10, vem da planilha como texto
  comentario: string;
  registradoPor: string;
  criadoEm: string;
}

export type VisitRequestStatus = 'pendente' | 'agendada' | 'concluida';

export interface VisitRequest {
  id: string;
  escolaId: string;
  motivo: string;
  status: VisitRequestStatus | string;
  dataSolicitacao: string;
  // Vem vazio para quem não é fiscal/regional — redigido no backend
  // (Edge Function), não só escondido na tela.
  dataAgendada: string;
  observacaoFiscal: string;
  solicitadoPor: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ServiceExemption {
  id: string;
  escolaId: string;
  serviceTypeId: string;
  motivo: string;
  ativo: string; // 'sim' | 'nao' — "remover isenção" só desativa, não apaga a linha
  isentoPor: string;
  criadoEm: string;
}

export type GrauImpacto = 'baixo' | 'medio' | 'alto';

export interface OccurrenceImpactReview {
  id: string;
  escolaId: string;
  mesReferencia: string; // yyyy-MM
  quantidadeOcorrencias: string;
  grauImpacto: GrauImpacto | string;
  comentario: string;
  registradoPor: string;
  criadoEm: string;
}

export interface TechnicalReport {
  id: string;
  periodoInicio: string; // yyyy-MM-dd
  periodoFim: string; // yyyy-MM-dd
  titulo: string;
  textoAdmin: string;
  criadoPor: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ImpactoConfig {
  valor: GrauImpacto;
  label: string;
  cor: string; // classes Tailwind (texto + fundo) do badge
}

export const IMPACTO_OPTIONS: ImpactoConfig[] = [
  { valor: 'baixo', label: 'Baixo', cor: 'bg-emerald-100 text-emerald-700' },
  { valor: 'medio', label: 'Médio', cor: 'bg-amber-100 text-amber-700' },
  { valor: 'alto', label: 'Alto', cor: 'bg-red-100 text-red-700' },
];

export function isAtivo(value: string | undefined | null): boolean {
  return (value || '').trim().toLowerCase() === 'sim';
}

// Uma escola isenta de um serviço (o fiscal entende que ela não faz parte
// daquele contrato) não deve ser cobrada por checklist, nem aparecer nos
// alertas/painel de atenção daquele serviço específico — só isenta o par
// (escola, serviço), os outros serviços continuam normais para ela.
export function isSchoolExempt(
  exemptions: Pick<ServiceExemption, 'escolaId' | 'serviceTypeId' | 'ativo'>[],
  escolaId: string,
  serviceTypeId: string,
): boolean {
  return exemptions.some(e => e.escolaId === escolaId && e.serviceTypeId === serviceTypeId && isAtivo(e.ativo));
}

// Itens diários ficam como preenchimento opcional para a escola — o gestor
// não tem como fiscalizar isso todo dia. Semanal/mensal/trimestral são
// obrigatórios: é o que de fato precisa ser respondido e acompanhado.
export function isFrequenciaObrigatoria(frequencia: Frequencia): boolean {
  return frequencia !== 'diaria';
}

export type ChecklistDueStatus = 'diaria' | 'em-dia' | 'vencendo' | 'atrasado' | 'nunca-preenchido';

export interface ChecklistDueInfo {
  status: ChecklistDueStatus;
  proximaData: string | null; // yyyy-MM-dd
}

export interface ChecklistAlertSummary {
  escolaId: string;
  escolaNome: string;
  total: number;
  atrasados: number;
  vencendo: number;
  nuncaPreenchido: number;
}

// Resume os alertas de checklist (um por item vencido/vencendo/nunca
// preenchido) em uma linha por escola — evita a mesma escola aparecer
// dezenas de vezes no banner quando ela tem muitos itens pendentes.
// Ordenado da escola com mais pendências para a com menos.
export function summarizeChecklistAlertsBySchool(
  alerts: { escolaId: string; escolaNome: string; status: ChecklistDueStatus }[],
): ChecklistAlertSummary[] {
  const porEscola = new Map<string, ChecklistAlertSummary>();
  for (const alerta of alerts) {
    if (!porEscola.has(alerta.escolaId)) {
      porEscola.set(alerta.escolaId, {
        escolaId: alerta.escolaId, escolaNome: alerta.escolaNome,
        total: 0, atrasados: 0, vencendo: 0, nuncaPreenchido: 0,
      });
    }
    const resumo = porEscola.get(alerta.escolaId)!;
    resumo.total += 1;
    if (alerta.status === 'atrasado') resumo.atrasados += 1;
    else if (alerta.status === 'vencendo') resumo.vencendo += 1;
    else if (alerta.status === 'nunca-preenchido') resumo.nuncaPreenchido += 1;
  }
  return Array.from(porEscola.values()).sort((a, b) => b.total - a.total);
}

// Calcula a situação de vencimento de um item não-diário a partir do último
// preenchimento registrado (ChecklistCompletions é append-only, então "o
// último" é sempre o mais recente por data). Itens diários não têm
// vencimento — ficam sempre disponíveis para marcar no dia.
export function getChecklistDueInfo(
  frequencia: Frequencia,
  ultimaDataPreenchida: string | null,
  hoje: Date = new Date(),
): ChecklistDueInfo {
  if (frequencia === 'diaria') return { status: 'diaria', proximaData: null };

  const config = FREQUENCIAS.find(f => f.key === frequencia);
  const intervaloDias = config?.intervaloDias ?? 30;

  if (!ultimaDataPreenchida) return { status: 'nunca-preenchido', proximaData: null };

  const proxima = addDays(parseISO(ultimaDataPreenchida), intervaloDias);
  const diasRestantes = differenceInCalendarDays(proxima, hoje);
  const proximaData = proxima.toISOString().split('T')[0];

  if (diasRestantes < 0) return { status: 'atrasado', proximaData };
  if (diasRestantes <= 3) return { status: 'vencendo', proximaData };
  return { status: 'em-dia', proximaData };
}

// Data do último preenchimento de um item de checklist para uma escola.
// ChecklistCompletions é append-only, então "o último" é o de maior data.
export function getUltimaDataChecklist(
  completions: Pick<ChecklistCompletion, 'checklistItemId' | 'escolaId' | 'data'>[],
  itemId: string,
  escolaId: string,
): string | null {
  const doItem = completions
    .filter(c => c.checklistItemId === itemId && c.escolaId === escolaId)
    .sort((a, b) => b.data.localeCompare(a.data));
  return doItem[0]?.data || null;
}

export interface OccurrenceFormInput {
  data: string;
  ambiente: string;
  descricaoOcorrencia: string;
}

// Validação obrigatória do formulário de ocorrência: data, ambiente e
// descrição (conforme requisito não funcional do módulo). Retorna um mapa
// campo → mensagem; vazio significa formulário válido.
export function validateOccurrenceForm(form: OccurrenceFormInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.data?.trim()) errors.data = 'Informe a data.';
  if (!form.ambiente?.trim()) errors.ambiente = 'Informe o ambiente/local.';
  if (!form.descricaoOcorrencia?.trim()) errors.descricaoOcorrencia = 'Descreva a ocorrência.';
  return errors;
}

// Converte linhas filtradas em CSV pronto para download (usado pela tela de
// Histórico/Exportar). Separado da parte que dispara o download no browser
// para poder ser testado isoladamente.
export function rowsToCsv<T extends Record<string, unknown>>(
  columns: { key: keyof T; label: string }[],
  rows: T[],
): string {
  const data = rows.map(row => Object.fromEntries(columns.map(c => [c.label, row[c.key] ?? ''])));
  return Papa.unparse(data, { columns: columns.map(c => c.label) });
}

export type Granularidade = 'semanal' | 'mensal';

export interface SatisfactionPeriodPoint {
  periodo: string; // rótulo ordenável: 'yyyy-MM' (mensal) ou início da semana 'yyyy-MM-dd' (semanal)
  media: number;
  quantidade: number;
}

// Agrupa notas de satisfação por semana ou mês, dentro de um período
// opcional, para alimentar o gráfico de evolução do fiscal. `inicio`/`fim`
// são strings 'yyyy-MM-dd' comparadas lexicograficamente (mesmo formato
// usado em todo o módulo).
export function aggregateSatisfactionByPeriod(
  ratings: Pick<SatisfactionRating, 'data' | 'nota'>[],
  granularidade: Granularidade,
  inicio?: string,
  fim?: string,
): SatisfactionPeriodPoint[] {
  const grupos = new Map<string, number[]>();

  for (const r of ratings) {
    if (!r.data) continue;
    if (inicio && r.data < inicio) continue;
    if (fim && r.data > fim) continue;
    const nota = Number(r.nota);
    if (Number.isNaN(nota)) continue;

    const data = parseISO(r.data);
    const periodo = granularidade === 'mensal'
      ? format(startOfMonth(data), 'yyyy-MM')
      : format(startOfWeek(data, { weekStartsOn: 1 }), 'yyyy-MM-dd');

    if (!grupos.has(periodo)) grupos.set(periodo, []);
    grupos.get(periodo)!.push(nota);
  }

  return Array.from(grupos.entries())
    .map(([periodo, notas]) => ({
      periodo,
      media: Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10,
      quantidade: notas.length,
    }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}

export interface AttentionReason {
  escolaId: string;
  escolaNome: string;
  motivos: string[];
}

export interface AttentionOptions {
  satisfacaoMinima?: number; // default 6 (escala 0-10)
  janelaDiasSatisfacao?: number; // default 90
  ocorrenciasPendentesMinimas?: number; // default 2
  hoje?: Date;
}

// Sinaliza escolas que precisam de mais atenção do fiscal, combinando 3
// sinais independentes (qualquer um já basta para aparecer na lista):
// satisfação média recente baixa, ocorrências pendentes acumulando, e
// checklist obrigatório atrasado. Limiares são um ponto de partida —
// ajustáveis via `options`.
export function getSchoolsNeedingAttention(
  schools: { id: string; name: string }[],
  occurrences: Pick<Occurrence, 'escolaId' | 'situacao'>[],
  ratings: Pick<SatisfactionRating, 'escolaId' | 'nota' | 'data'>[],
  checklistItems: ChecklistItem[],
  completions: Pick<ChecklistCompletion, 'checklistItemId' | 'escolaId' | 'data'>[],
  options: AttentionOptions = {},
  exemptions: Pick<ServiceExemption, 'escolaId' | 'serviceTypeId' | 'ativo'>[] = [],
): AttentionReason[] {
  const {
    satisfacaoMinima = 6,
    janelaDiasSatisfacao = 90,
    ocorrenciasPendentesMinimas = 2,
    hoje = new Date(),
  } = options;

  const limiteData = format(addDays(hoje, -janelaDiasSatisfacao), 'yyyy-MM-dd');
  const itensObrigatoriosAtivos = checklistItems.filter(i => isAtivo(i.ativo) && isFrequenciaObrigatoria(i.frequencia));

  const resultado: AttentionReason[] = [];

  for (const escola of schools) {
    const motivos: string[] = [];

    const notasRecentes = ratings
      .filter(r => r.escolaId === escola.id && r.data >= limiteData)
      .map(r => Number(r.nota))
      .filter(n => !Number.isNaN(n));
    if (notasRecentes.length > 0) {
      const media = notasRecentes.reduce((a, b) => a + b, 0) / notasRecentes.length;
      if (media < satisfacaoMinima) {
        motivos.push(`Satisfação média baixa (${media.toFixed(1)}/10 nos últimos ${janelaDiasSatisfacao} dias)`);
      }
    }

    const pendentes = occurrences.filter(o => o.escolaId === escola.id && o.situacao === 'pendente').length;
    if (pendentes >= ocorrenciasPendentesMinimas) {
      motivos.push(`${pendentes} ocorrências pendentes`);
    }

    const atrasados = itensObrigatoriosAtivos
      .filter(item => !isSchoolExempt(exemptions, escola.id, item.serviceTypeId))
      .filter(item => {
        const ultima = getUltimaDataChecklist(completions, item.id, escola.id);
        const due = getChecklistDueInfo(item.frequencia, ultima, hoje);
        return due.status === 'atrasado' || due.status === 'nunca-preenchido';
      }).length;
    if (atrasados > 0) {
      motivos.push(`${atrasados} item(ns) de checklist obrigatório atrasado(s)`);
    }

    if (motivos.length > 0) {
      resultado.push({ escolaId: escola.id, escolaNome: escola.name, motivos });
    }
  }

  return resultado.sort((a, b) => b.motivos.length - a.motivos.length || a.escolaNome.localeCompare(b.escolaNome));
}

export interface MesPendente {
  mes: string; // yyyy-MM
  quantidade: number;
}

// Meses "fechados" (antes do mês atual — o mês corrente nunca é cobrado,
// porque ainda pode receber novas ocorrências) em que a escola teve
// ocorrência e ainda não respondeu o impacto na qualidade do serviço.
// Usada tanto pelo card dentro da aba Satisfação quanto pelo pop-up global
// (ImpactoOcorrenciasModal) — os dois enxergam exatamente os mesmos
// pendentes, então responder em um faz sumir dos dois.
export function getMesesPendentesDeAvaliacao(
  occurrences: Pick<Occurrence, 'escolaId' | 'data'>[],
  reviews: Pick<OccurrenceImpactReview, 'escolaId' | 'mesReferencia'>[],
  escolaId: string,
  hoje: Date = new Date(),
): MesPendente[] {
  const mesAtual = format(hoje, 'yyyy-MM');
  const contagemPorMes = new Map<string, number>();

  for (const o of occurrences) {
    if (o.escolaId !== escolaId || !o.data) continue;
    const mes = o.data.slice(0, 7);
    if (mes >= mesAtual) continue;
    contagemPorMes.set(mes, (contagemPorMes.get(mes) || 0) + 1);
  }

  const mesesRespondidos = new Set(reviews.filter(r => r.escolaId === escolaId).map(r => r.mesReferencia));

  return Array.from(contagemPorMes.entries())
    .filter(([mes]) => !mesesRespondidos.has(mes))
    .map(([mes, quantidade]) => ({ mes, quantidade }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

export interface SchoolOccurrenceGroup {
  escolaId: string;
  escolaNome: string;
  occurrences: Occurrence[];
}

// Espinha dorsal do Relatório Técnico: escolas em ordem alfabética
// ("processo por ordem de escola"), cada uma com suas ocorrências do
// período em ordem cronológica.
export function groupOccurrencesBySchoolChronological(
  occurrences: Occurrence[],
  schools: { id: string; name: string }[],
  periodoInicio?: string,
  periodoFim?: string,
): SchoolOccurrenceGroup[] {
  const filtradas = occurrences.filter(o => {
    if (periodoInicio && o.data < periodoInicio) return false;
    if (periodoFim && o.data > periodoFim) return false;
    return true;
  });

  const porEscola = new Map<string, Occurrence[]>();
  for (const o of filtradas) {
    if (!porEscola.has(o.escolaId)) porEscola.set(o.escolaId, []);
    porEscola.get(o.escolaId)!.push(o);
  }

  const grupos: SchoolOccurrenceGroup[] = [];
  for (const [escolaId, lista] of porEscola.entries()) {
    const escolaNome = schools.find(s => s.id === escolaId)?.name || escolaId;
    grupos.push({
      escolaId,
      escolaNome,
      occurrences: [...lista].sort((a, b) => a.data.localeCompare(b.data) || a.criadoEm.localeCompare(b.criadoEm)),
    });
  }

  return grupos.sort((a, b) => a.escolaNome.localeCompare(b.escolaNome));
}

export interface SchoolOccurrenceCount {
  escolaId: string;
  escolaNome: string;
  quantidade: number;
}

// Total geral + por escola, para o painel do fiscal. Só entram escolas com
// pelo menos 1 ocorrência no período — sem linha zerada poluindo a lista.
export function countOccurrencesBySchool(
  occurrences: Pick<Occurrence, 'escolaId' | 'data'>[],
  schools: { id: string; name: string }[],
  periodoInicio?: string,
  periodoFim?: string,
): { porEscola: SchoolOccurrenceCount[]; total: number } {
  const filtradas = occurrences.filter(o => {
    if (periodoInicio && o.data < periodoInicio) return false;
    if (periodoFim && o.data > periodoFim) return false;
    return true;
  });

  const contagem = new Map<string, number>();
  for (const o of filtradas) {
    contagem.set(o.escolaId, (contagem.get(o.escolaId) || 0) + 1);
  }

  const porEscola = schools
    .map(s => ({ escolaId: s.id, escolaNome: s.name, quantidade: contagem.get(s.id) || 0 }))
    .filter(e => e.quantidade > 0)
    .sort((a, b) => b.quantidade - a.quantidade || a.escolaNome.localeCompare(b.escolaNome));

  return { porEscola, total: filtradas.length };
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
