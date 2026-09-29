// Fiscalização quinzenal de elevadores (Fiscal Setorial da escola).
// Roteiro baseado em "Manual de Uso e Conservação de Elevadores em Escolas" e
// "Contratos Centralizados de Manutenção de Elevadores" (SEDUC-SP). Lógica pura,
// sem React/Supabase, para poder ser testada.

export type Resposta = 'ok' | 'nok' | 'na';
export type StatusFiscalizacao = 'conforme' | 'atencao' | 'critico';

export interface ChecklistPergunta {
  id: string;
  texto: string;
  dica?: string;
}

export interface ChecklistBloco {
  id: string;
  titulo: string;
  descricao: string;
  perguntas: ChecklistPergunta[];
}

// Itens de "inspeção visual" que o manual diz que o Fiscal Setorial pode fazer
// sozinho (p.11), mais uso/segurança e documentação (manual da escola, p.3, 7, 11).
export const BLOCOS_ESCOLA: ChecklistBloco[] = [
  {
    id: 'funcionamento',
    titulo: 'Funcionamento',
    descricao: 'Inspeção visual — leva 1 minuto no elevador',
    perguntas: [
      { id: 'nivelamento', texto: 'A cabine nivela com o piso em cada parada', dica: 'Observe ao parar em cada andar' },
      { id: 'portas', texto: 'Portas e botoeiras funcionam em todos os pavimentos' },
      { id: 'sensores', texto: 'Sensores de presença respondem corretamente' },
      { id: 'ruidos', texto: 'Sem ruídos ou vibrações anormais' },
      { id: 'limpeza', texto: 'Cabine e hall limpos e secos' },
      { id: 'interfone', texto: 'Interfone e alarme de emergência funcionam', dica: 'Teste o botão de alarme e o interfone' },
    ],
  },
  {
    id: 'uso',
    titulo: 'Uso e segurança',
    descricao: 'Controle de acesso pela direção',
    perguntas: [
      { id: 'hall_trancado', texto: 'Porta do hall trancada, chaves só com a administração' },
      { id: 'acesso_livre', texto: 'Áreas de circulação em frente ao elevador desobstruídas' },
      { id: 'uso_exclusivo', texto: 'Uso restrito a pessoas com mobilidade reduzida (crianças até 10 anos acompanhadas)' },
      { id: 'responsavel', texto: 'Há responsável designado pela direção para operar/orientar' },
    ],
  },
  {
    id: 'documentacao',
    titulo: 'Documentação',
    descricao: 'Arquivo físico ou digital da escola',
    perguntas: [
      { id: 'dossie', texto: 'Relatórios de manutenção arquivados no dossiê do equipamento' },
      { id: 'documentos', texto: 'Alvarás, contrato e laudos (RIA) disponíveis na unidade' },
    ],
  },
];

// Só aparece quando houve visita da empresa na quinzena.
export const BLOCO_VISITA: ChecklistBloco = {
  id: 'visita',
  titulo: 'Visita da empresa',
  descricao: 'Confira antes de liberar o técnico',
  perguntas: [
    { id: 'visita_prazo', texto: 'Técnico compareceu no prazo contratual' },
    { id: 'visita_os', texto: 'Apresentou a Ordem de Serviço e checklist da manutenção' },
    { id: 'visita_testes', texto: 'Realizou testes operacionais e liberou o equipamento com segurança' },
    { id: 'visita_relatorio', texto: 'Relatório técnico entregue e atestado por você' },
  ],
};

export const PERGUNTA_AVISO_MANUTENCAO: ChecklistPergunta = {
  id: 'aviso_manutencao',
  texto: 'Aviso "Elevador em Manutenção" afixado em local visível',
};

export const TODAS_PERGUNTAS: ChecklistPergunta[] = [
  ...BLOCOS_ESCOLA.flatMap(b => b.perguntas),
  ...BLOCO_VISITA.perguntas,
  PERGUNTA_AVISO_MANUTENCAO,
];

const TEXTO_POR_ID: Record<string, string> = Object.fromEntries(TODAS_PERGUNTAS.map(p => [p.id, p.texto]));
export function textoDaPergunta(id: string): string {
  return TEXTO_POR_ID[id] ?? id;
}

export const PRAZO_EMERGENCIAL_MIN = 30;

export const EMPRESAS_CONTATO = [
  { nome: 'Orona AMG Elevadores', regiao: 'Grande SP, litoral e Vale do Paraíba', fones: ['4007-2088 (opção 1)', '0800 607 2088'] },
];

// ---------------------------------------------------------------------------
// Quinzenas: 1ª = dias 1–15, 2ª = dia 16 até o fim do mês.
// Datas circulam como 'yyyy-mm-dd' para evitar problemas de fuso.
// ---------------------------------------------------------------------------

export interface Quinzena {
  inicio: string;
  fim: string;
  label: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getQuinzena(date: Date = new Date()): Quinzena {
  const y = date.getFullYear();
  const m = date.getMonth();
  const primeira = date.getDate() <= 15;
  const ultimoDia = new Date(y, m + 1, 0).getDate();
  const diaIni = primeira ? 1 : 16;
  const diaFim = primeira ? 15 : ultimoDia;
  return {
    inicio: `${y}-${pad(m + 1)}-${pad(diaIni)}`,
    fim: `${y}-${pad(m + 1)}-${pad(diaFim)}`,
    label: `${pad(diaIni)}–${pad(diaFim)}/${MESES[m]}/${String(y).slice(2)}`,
  };
}

export function quinzenaAnterior(q: Quinzena): Quinzena {
  const [y, m, d] = q.inicio.split('-').map(Number);
  // dia 16 -> dia 1 do mesmo mês; dia 1 -> dia 16 do mês anterior
  return d === 16 ? getQuinzena(new Date(y, m - 1, 1)) : getQuinzena(new Date(y, m - 2, 16));
}

/** Últimas `n` quinzenas terminando na atual, da mais antiga para a mais recente. */
export function ultimasQuinzenas(n: number, ref: Date = new Date()): Quinzena[] {
  const lista: Quinzena[] = [getQuinzena(ref)];
  while (lista.length < n) lista.unshift(quinzenaAnterior(lista[0]));
  return lista;
}

export function diasRestantes(q: Quinzena, hoje: Date = new Date()): number {
  const [y, m, d] = q.fim.split('-').map(Number);
  const fim = new Date(y, m - 1, d);
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((fim.getTime() - h.getTime()) / 86400000);
}

// ---------------------------------------------------------------------------
// Avaliação de uma fiscalização
// ---------------------------------------------------------------------------

export interface ChamadoInfo {
  houve: boolean;
  tipo?: 'emergencial' | 'corretivo';
  abertoEm?: string | null; // datetime-local
  atendidoEm?: string | null;
  pessoaPresa?: boolean;
}

export interface EntradaFiscalizacao {
  funcionando: boolean;
  houveVisita: boolean;
  respostas: Record<string, Resposta>;
  chamado: ChamadoInfo;
}

export function minutosEntre(inicio?: string | null, fim?: string | null): number | null {
  if (!inicio || !fim) return null;
  const a = new Date(inicio).getTime();
  const b = new Date(fim).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}

export function perguntasAplicaveis(e: Pick<EntradaFiscalizacao, 'funcionando' | 'houveVisita'>): ChecklistPergunta[] {
  return [
    ...BLOCOS_ESCOLA.flatMap(b => b.perguntas),
    ...(e.houveVisita ? BLOCO_VISITA.perguntas : []),
    ...(!e.funcionando ? [PERGUNTA_AVISO_MANUTENCAO] : []),
  ];
}

export interface Avaliacao {
  totalItens: number;
  respondidos: number;
  naoConformes: string[];
  score: number | null; // % de conformidade entre os itens aplicáveis (exclui N/A)
  minutosAtendimento: number | null;
  atendimentoLento: boolean;
  status: StatusFiscalizacao;
}

export function avaliarFiscalizacao(e: EntradaFiscalizacao): Avaliacao {
  const aplicaveis = perguntasAplicaveis(e);
  const respondidos = aplicaveis.filter(p => e.respostas[p.id]).length;
  const naoConformes = aplicaveis.filter(p => e.respostas[p.id] === 'nok').map(p => p.id);
  const oks = aplicaveis.filter(p => e.respostas[p.id] === 'ok').length;
  const avaliados = oks + naoConformes.length;

  const minutos = e.chamado.houve ? minutosEntre(e.chamado.abertoEm, e.chamado.atendidoEm) : null;
  const atendimentoLento = e.chamado.houve && e.chamado.tipo === 'emergencial'
    && minutos !== null && minutos > PRAZO_EMERGENCIAL_MIN;

  let status: StatusFiscalizacao = 'conforme';
  if (naoConformes.length > 0 || !e.houveVisita) status = 'atencao';
  if (!e.funcionando || (e.chamado.houve && e.chamado.pessoaPresa) || atendimentoLento) status = 'critico';

  return {
    totalItens: aplicaveis.length,
    respondidos,
    naoConformes,
    score: avaliados === 0 ? null : Math.round((oks / avaliados) * 100),
    minutosAtendimento: minutos,
    atendimentoLento,
    status,
  };
}

/** Erros que impedem o envio. Vazio = pode enviar. */
export function validarFiscalizacao(
  e: EntradaFiscalizacao,
  observacoes: Record<string, string>,
  desde: string | null,
): string[] {
  const erros: string[] = [];
  const faltando = perguntasAplicaveis(e).filter(p => !e.respostas[p.id]).length;
  if (faltando > 0) erros.push(`Faltam ${faltando} item(ns) para responder.`);
  const semObs = perguntasAplicaveis(e).filter(p => e.respostas[p.id] === 'nok' && !observacoes[p.id]?.trim()).length;
  if (semObs > 0) erros.push(`Descreva brevemente o problema em ${semObs} item(ns) marcado(s) como "Problema".`);
  if (!e.funcionando && !desde) erros.push('Informe desde quando o elevador está parado.');
  if (e.chamado.houve) {
    if (!e.chamado.tipo) erros.push('Informe o tipo do chamado.');
    if (!e.chamado.abertoEm) erros.push('Informe quando o chamado foi aberto.');
    if (e.chamado.abertoEm && e.chamado.atendidoEm && minutosEntre(e.chamado.abertoEm, e.chamado.atendidoEm) === null) {
      erros.push('O horário de atendimento deve ser posterior à abertura do chamado.');
    }
  }
  return erros;
}

// ---------------------------------------------------------------------------
// Agregações para o painel do Fiscal Técnico / URE
// ---------------------------------------------------------------------------

export interface FiscalizacaoRegistro {
  id: string;
  school_id: string;
  period_start: string;
  period_end: string;
  inspector_name: string | null;
  created_at: string;
  updated_at?: string | null;
  is_operational: boolean;
  down_since: string | null;
  had_visit: boolean;
  answers: Record<string, Resposta>;
  observations: Record<string, string>;
  had_call: boolean;
  call_type: 'emergencial' | 'corretivo' | null;
  call_opened_at: string | null;
  call_attended_at: string | null;
  call_response_minutes: number | null;
  person_trapped: boolean;
  general_notes: string | null;
  score: number | null;
  status: StatusFiscalizacao;
  nonconformities: string[];
}

export interface EscolaRef { id: string; name: string }

export interface ResumoQuinzena {
  quinzena: Quinzena;
  totalEscolas: number;
  respondidas: number;
  adesao: number; // %
  scoreMedio: number | null;
  conformes: number;
  atencao: number;
  criticas: number;
  parados: number;
  chamados: number;
  chamadosLentos: number;
  pessoasPresas: number;
}

export function resumirQuinzena(escolas: EscolaRef[], regs: FiscalizacaoRegistro[], q: Quinzena): ResumoQuinzena {
  const ids = new Set(escolas.map(e => e.id));
  const doPeriodo = regs.filter(r => r.period_start === q.inicio && ids.has(r.school_id));
  const scores = doPeriodo.map(r => r.score).filter((s): s is number => s !== null);
  const total = escolas.length;
  return {
    quinzena: q,
    totalEscolas: total,
    respondidas: doPeriodo.length,
    adesao: total === 0 ? 0 : Math.round((doPeriodo.length / total) * 100),
    scoreMedio: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    conformes: doPeriodo.filter(r => r.status === 'conforme').length,
    atencao: doPeriodo.filter(r => r.status === 'atencao').length,
    criticas: doPeriodo.filter(r => r.status === 'critico').length,
    parados: doPeriodo.filter(r => !r.is_operational).length,
    chamados: doPeriodo.filter(r => r.had_call).length,
    chamadosLentos: doPeriodo.filter(r => r.call_type === 'emergencial'
      && r.call_response_minutes !== null && r.call_response_minutes > PRAZO_EMERGENCIAL_MIN).length,
    pessoasPresas: doPeriodo.filter(r => r.person_trapped).length,
  };
}

export function topNaoConformidades(regs: FiscalizacaoRegistro[], limite = 6): { id: string; texto: string; total: number }[] {
  const cont = new Map<string, number>();
  for (const r of regs) for (const id of r.nonconformities ?? []) cont.set(id, (cont.get(id) ?? 0) + 1);
  return [...cont.entries()]
    .map(([id, total]) => ({ id, texto: textoDaPergunta(id), total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limite);
}

export interface EscolaPendente {
  escola: EscolaRef;
  /** quinzenas seguidas sem resposta, contando a atual só se ela já estiver vencida */
  quinzenasSemResposta: number;
  ultimaFiscalizacao: string | null;
  respondeuAtual: boolean;
}

/** Escolas que ainda não responderam a quinzena atual, com sequência de omissões anteriores. */
export function escolasPendentes(escolas: EscolaRef[], regs: FiscalizacaoRegistro[], atual: Quinzena): EscolaPendente[] {
  const porEscola = new Map<string, Set<string>>();
  const ultima = new Map<string, string>();
  for (const r of regs) {
    if (!porEscola.has(r.school_id)) porEscola.set(r.school_id, new Set());
    porEscola.get(r.school_id)!.add(r.period_start);
    if (!ultima.has(r.school_id) || r.period_end > ultima.get(r.school_id)!) ultima.set(r.school_id, r.period_end);
  }
  return escolas
    .map(escola => {
      const feitas = porEscola.get(escola.id) ?? new Set<string>();
      const respondeuAtual = feitas.has(atual.inicio);
      let seq = 0;
      let q = quinzenaAnterior(atual);
      // limita a 12 quinzenas para não varrer histórico infinito
      for (let i = 0; i < 12 && !feitas.has(q.inicio); i++) { seq++; q = quinzenaAnterior(q); }
      return { escola, quinzenasSemResposta: seq, ultimaFiscalizacao: ultima.get(escola.id) ?? null, respondeuAtual };
    })
    .filter(p => !p.respondeuAtual)
    .sort((a, b) => b.quinzenasSemResposta - a.quinzenasSemResposta || a.escola.name.localeCompare(b.escola.name, 'pt-BR'));
}

export function rowsToCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(esc).join(';')).join('\r\n');
}

// ---------------------------------------------------------------------------
// Conversão de/para as abas do Google Sheets (ElevatorInspections e
// ElevatorInspectionItems). A planilha só guarda texto: booleanos viram
// "sim"/"nao", listas e mapas viram JSON.
// ---------------------------------------------------------------------------

export type LinhaPlanilha = Record<string, string>;

const RESPOSTA_LEGIVEL: Record<Resposta, string> = { ok: 'Conforme', nok: 'Problema', na: 'N/A' };
const simNao = (v: boolean) => (v ? 'sim' : 'nao');

function blocoDaPergunta(id: string): string {
  if (id === PERGUNTA_AVISO_MANUTENCAO.id) return 'Elevador parado';
  if (BLOCO_VISITA.perguntas.some(p => p.id === id)) return BLOCO_VISITA.titulo;
  return BLOCOS_ESCOLA.find(b => b.perguntas.some(p => p.id === id))?.titulo ?? '';
}

export interface DadosEnvio {
  escola: EscolaRef;
  quinzena: Quinzena;
  fiscal: { id: string; nome: string };
  funcionando: boolean;
  paradoDesde: string | null;
  houveVisita: boolean;
  chamado: { houve: boolean; tipo: string | null; abertoEmISO: string | null; atendidoEmISO: string | null; pessoaPresa: boolean };
  respostas: Record<string, Resposta>;
  observacoes: Record<string, string>;
  observacoesGerais: string;
  avaliacao: Avaliacao;
}

export function montarLinhasPlanilha(d: DadosEnvio): { data: LinhaPlanilha; items: LinhaPlanilha[] } {
  const id = `${d.escola.id}_${d.quinzena.inicio}`;
  const naoConformidades = d.avaliacao.naoConformes
    .map(i => `${textoDaPergunta(i)}${d.observacoes[i]?.trim() ? ` (${d.observacoes[i].trim()})` : ''}`)
    .join('; ');
  const data: LinhaPlanilha = {
    id,
    escolaId: d.escola.id,
    escolaNome: d.escola.name,
    periodoInicio: d.quinzena.inicio,
    periodoFim: d.quinzena.fim,
    fiscalId: d.fiscal.id,
    fiscalNome: d.fiscal.nome,
    elevadorFuncionando: simNao(d.funcionando),
    paradoDesde: d.funcionando ? '' : d.paradoDesde ?? '',
    houveVisita: simNao(d.houveVisita),
    houveChamado: simNao(d.chamado.houve),
    tipoChamado: d.chamado.houve ? d.chamado.tipo ?? '' : '',
    chamadoAbertoEm: d.chamado.houve ? d.chamado.abertoEmISO ?? '' : '',
    chamadoAtendidoEm: d.chamado.houve ? d.chamado.atendidoEmISO ?? '' : '',
    minutosAtendimento: d.chamado.houve && d.avaliacao.minutosAtendimento !== null ? String(d.avaliacao.minutosAtendimento) : '',
    pessoaPresa: simNao(d.chamado.houve && d.chamado.pessoaPresa),
    conformidade: d.avaliacao.score === null ? '' : String(d.avaliacao.score),
    situacao: d.avaliacao.status,
    naoConformidades,
    observacoesGerais: d.observacoesGerais.trim(),
    respostas: JSON.stringify(d.respostas),
    observacoes: JSON.stringify(d.observacoes),
    naoConformidadesIds: JSON.stringify(d.avaliacao.naoConformes),
  };
  const items: LinhaPlanilha[] = Object.entries(d.respostas).map(([itemId, r]) => ({
    inspecaoId: id,
    escolaId: d.escola.id,
    escolaNome: d.escola.name,
    periodoInicio: d.quinzena.inicio,
    periodoFim: d.quinzena.fim,
    bloco: blocoDaPergunta(itemId),
    itemId,
    item: textoDaPergunta(itemId),
    resposta: RESPOSTA_LEGIVEL[r],
    observacao: r === 'nok' ? d.observacoes[itemId]?.trim() ?? '' : '',
  }));
  return { data, items };
}

function jsonOu<T>(s: string | undefined, vazio: T): T {
  if (!s) return vazio;
  try { return JSON.parse(s) as T; } catch { return vazio; }
}

export function linhaParaRegistro(l: LinhaPlanilha): FiscalizacaoRegistro {
  const minutos = l.minutosAtendimento ? Number(l.minutosAtendimento) : NaN;
  const score = l.conformidade ? Number(l.conformidade) : NaN;
  const status: StatusFiscalizacao = l.situacao === 'critico' || l.situacao === 'atencao' ? l.situacao : 'conforme';
  return {
    id: l.id,
    school_id: l.escolaId,
    period_start: l.periodoInicio,
    period_end: l.periodoFim,
    inspector_name: l.fiscalNome || null,
    created_at: l.criadoEm || '',
    updated_at: l.atualizadoEm || null,
    is_operational: l.elevadorFuncionando !== 'nao',
    down_since: l.paradoDesde || null,
    had_visit: l.houveVisita === 'sim',
    answers: jsonOu<Record<string, Resposta>>(l.respostas, {}),
    observations: jsonOu<Record<string, string>>(l.observacoes, {}),
    had_call: l.houveChamado === 'sim',
    call_type: l.tipoChamado === 'emergencial' || l.tipoChamado === 'corretivo' ? l.tipoChamado : null,
    call_opened_at: l.chamadoAbertoEm || null,
    call_attended_at: l.chamadoAtendidoEm || null,
    call_response_minutes: Number.isFinite(minutos) ? minutos : null,
    person_trapped: l.pessoaPresa === 'sim',
    general_notes: l.observacoesGerais || null,
    score: Number.isFinite(score) ? score : null,
    status,
    nonconformities: jsonOu<string[]>(l.naoConformidadesIds, []),
  };
}
