import { Fragment, useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import { WATER_REPORTING_HARD_START } from './Dashboard';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';
import {
  fetchManejoFromSheet, normalizeName, matchNames, determinarStatus, temPendenciaManejo,
  type ManejoSheetRow, type StatusManejo,
} from '../lib/manejoArboreo';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  Lock, Loader2, RefreshCw, FileDown, TrendingDown, TrendingUp, Minus,
  Droplets, TreeDeciduous, AlertTriangle, CheckCircle2, ClipboardCheck, Table as TableIcon, Target, Search,
  ChevronDown, ChevronRight, CalendarX2,
} from 'lucide-react';

const ALLOWED_ROLES = ['regional_admin', 'school_manager', 'supervisor', 'dirigente'];

const COR_TOTAL = '#e11d48';   // rose-600 — % da rede com qualquer pendência
const COR_AGUA = '#2563eb';    // blue-600 — mesma cor usada em Consumo de Água
const COR_MANEJO = '#059669';  // emerald-600 — mesma cor usada em Manejo Arbóreo

// Manejo arbóreo entra numa fase posterior — por ora a página acompanha apenas
// a água. Com `false`, todos os elementos de manejo somem (KPIs, gráfico, tabela,
// PDF, título e menu em src/App.tsx) e o snapshot semanal grava só os campos de
// água. Todo o código de manejo continua aqui: basta voltar para `true`.
export const MOSTRAR_MANEJO: boolean = false;

interface SchoolLite { id: string; name: string; water_exempt: boolean; }

interface SnapshotRow {
  id: string;
  semana: string; // YYYY-MM-DD (segunda-feira)
  escola_id: string;
  escola_nome: string;
  tem_pendencia_agua: string; // 'TRUE' | 'FALSE'
  dias_agua_pendentes: string;
  agua_dispensada: string; // 'TRUE' | 'FALSE' — escola dispensada do registro de água
  status_manejo: string;
  tem_pendencia_manejo: string; // 'TRUE' | 'FALSE'
  gerado_em: string;
  gerado_por_nome: string;
}

// Registro administrativo da própria URE, não uma escola — nunca deve entrar
// nas contagens/percentuais desta página (mesmo padrão de exclusão usado em
// src/pages/VisitasEscolares.tsx e src/pages/Remanejamento.tsx).
const NOME_URE = 'UNIDADE REGIONAL DE ENSINO';

// Tolerância de atraso no registro de água: uma escola com até 2 dias úteis sem
// lançamento ainda está dentro do prazo e NÃO conta como pendência. Só vira
// pendência a partir do 3º dia. Aplicada tanto ao gerar o snapshot quanto na
// leitura do histórico (para que snapshots antigos também respeitem a regra).
const TOLERANCIA_DIAS_AGUA = 2;

// Escola pendente de água na última semana + contexto de recorrência.
interface OfensoraAgua {
  escolaId: string;
  nome: string;
  dias: number;
  diasAnterior: number | null;
  sequencia: number;              // semanas seguidas com pendência aberta (incluindo a atual)
  acumulando: boolean;            // true = os dias em aberto cresceram desde o início da sequência (continua deixando de lançar); false = lacuna antiga não regularizada
  historico: (boolean | null)[];  // últimas semanas: true=pendente, false=ok, null=sem dado/dispensada
}

const HIST_SEMANAS = 8;   // semanas mostradas na minilinha do tempo
const SEQ_CRONICA = 3;    // ≥ 3 semanas seguidas pendente = pendência crônica

function formatDateToYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mondayOnOrBefore(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0=Dom, 1=Seg, ... 6=Sáb
  const diasDesdeSegunda = (dayOfWeek + 6) % 7;
  d.setDate(d.getDate() - diasDesdeSegunda);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Segunda-feira ainda é tolerância da semana anterior: o snapshot gerado nesse
// dia usa o domingo como data de referência, então atualiza a semana que acabou
// já com os lançamentos atrasados feitos na segunda e não cobra a própria
// segunda. A semana nova só começa a ser medida na terça.
function dataReferenciaSnapshot(agora: Date): Date {
  if (agora.getDay() !== 1) return agora;
  const domingo = new Date(agora);
  domingo.setDate(domingo.getDate() - 1);
  return domingo;
}

function parseYMD(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Semana (segunda-feira, YYYY-MM-DD) que um snapshot gerado agora atualiza.
function semanaCorrenteYMD(agora: Date): string {
  return formatDateToYMD(mondayOnOrBefore(dataReferenciaSnapshot(agora)));
}

// Até que dia os lançamentos contam para a semana `semana`: na semana corrente,
// até hoje (ou domingo, se hoje é segunda); numa semana passada, até o domingo
// dela. Assim, recalcular uma semana antiga mede só os dias daquela semana (e
// anteriores), mas já com os lançamentos que a escola fez depois.
function referenciaDaSemana(semana: string, agora: Date): Date {
  if (semana === semanaCorrenteYMD(agora)) return dataReferenciaSnapshot(agora);
  const domingo = parseYMD(semana);
  domingo.setDate(domingo.getDate() + 6);
  return domingo;
}

const DIAS_SEMANA_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// "qua 04/11"
function formatDayLabel(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${DIAS_SEMANA_PT[parseYMD(ymd).getDay()]} ${d}/${m}`;
}

// Início da janela de cobrança de água para uma data de referência: mês dela
// + 2 anteriores, nunca antes do início obrigatório do registro.
function inicioJanelaAgua(referencia: Date): Date {
  const tresMesesAtras = new Date(referencia.getFullYear(), referencia.getMonth() - 2, 1);
  return tresMesesAtras > WATER_REPORTING_HARD_START ? tresMesesAtras : WATER_REPORTING_HARD_START;
}

function formatWeekLabel(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${d}/${m}`;
}

function isTrue(v: string): boolean {
  return v === 'TRUE' || v === 'true';
}

// Pendência de água considerando a tolerância: releva o booleano gravado e
// recalcula a partir dos dias pendentes, para que snapshots antigos (gerados
// antes da tolerância) também deixem de acusar escolas com ≤ 2 dias de atraso.
function aguaPendente(r: SnapshotRow): boolean {
  return (Number(r.dias_agua_pendentes) || 0) > TOLERANCIA_DIAS_AGUA;
}

export default function PendenciasSemanais() {
  const [loading, setLoading] = useState(true);
  const [userRoleRaw, setUserRoleRaw] = useState('');
  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [supervisorSchoolIds, setSupervisorSchoolIds] = useState<string[]>([]);

  const [schools, setSchools] = useState<SchoolLite[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);

  const [filtroOfensora, setFiltroOfensora] = useState<'todas' | 'cronicas' | 'novas'>('todas');
  const [buscaOfensora, setBuscaOfensora] = useState('');

  const [snapshotting, setSnapshotting] = useState(false);
  const [semanaAlvo, setSemanaAlvo] = useState<string>(''); // '' = semana corrente; 'todas' = histórico inteiro; ou YYYY-MM-DD
  const [snapshotProgresso, setSnapshotProgresso] = useState<string | null>(null);

  // Detalhamento da tabela "Dados por semana": semana aberta → escolas pendentes;
  // escola aberta → dias úteis ainda sem lançamento.
  const [semanaDetalhe, setSemanaDetalhe] = useState<string | null>(null);
  const [escolaDetalheId, setEscolaDetalheId] = useState<string | null>(null);
  const [diasDetalhe, setDiasDetalhe] = useState<{ loading: boolean; erro: string | null; dias: string[]; ate: string }>({ loading: false, erro: null, dias: [], ate: '' });
  const [snapshotMsg, setSnapshotMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  async function invoke(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke('pendencias-semanais', {
      body: { action, ...payload },
    });
    if (error) {
      let message = error.message;
      const context = (error as any).context;
      if (context && typeof context.json === 'function') {
        try {
          const body = await context.clone().json();
          if (body?.error) message = body.error;
        } catch { /* corpo não é JSON, mantém mensagem padrão */ }
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function carregarHistorico() {
    const data = await invoke('listar');
    setSnapshots(data?.rows || []);
  }

  async function carregarContexto() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let rawRole = '';
      let supSchools: string[] = [];
      let schoolId: string | null = null;

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, school_id, supervisor_schools')
          .eq('id', user.id)
          .single();
        rawRole = (profile as any)?.role || '';
        schoolId = (profile as any)?.school_id || null;
        supSchools = (profile as any)?.supervisor_schools || [];
      }

      setUserRoleRaw(rawRole);
      setUserRole(resolveViewRole(rawRole));
      setUserSchoolId(schoolId);
      setSupervisorSchoolIds(supSchools);

      // Escolas paginadas (Supabase limita 1000 linhas por requisição por padrão),
      // mesmo padrão usado em src/pages/Dashboard.tsx / ConsumoAgua.tsx.
      const PAGE = 1000;
      const all: SchoolLite[] = [];
      let from = 0;
      while (true) {
        const { data: page } = await supabase.from('schools').select('id, name, water_exempt').order('name').range(from, from + PAGE - 1);
        if (!page || page.length === 0) break;
        all.push(...(page as SchoolLite[]));
        if (page.length < PAGE) break;
        from += PAGE;
      }
      setSchools(all.filter(s => normalizeName(s.name) !== NOME_URE));

      await carregarHistorico();
    } catch (err) {
      console.error('Erro ao carregar contexto de pendências semanais:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarContexto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calcula as linhas do snapshot com os lançamentos de água atuais, contando
  // os dias pendentes até `referencia` (inclusive).
  async function calcularLinhasSnapshot(referencia: Date, sheetMap: Map<string, ManejoSheetRow>) {
    // ── Água: reaproveita a mesma RPC e janela do Dashboard ──────────────
    // Janela de 3 meses (mês atual + 2 anteriores): lacunas mais antigas que isso
    // não entram no índice.
    const windowStart = inicioJanelaAgua(referencia);
    const { data: pendenciasAgua, error: aguaError } = await supabase.rpc('get_pending_water_schools', {
      p_window_start: formatDateToYMD(windowStart),
      p_today: formatDateToYMD(referencia),
    });
    if (aguaError) throw aguaError;

    const diasPendentesPorEscola: Record<string, number> = {};
    (pendenciasAgua || []).forEach((row: any) => {
      diasPendentesPorEscola[row.school_id] = (diasPendentesPorEscola[row.school_id] || 0) + row.missing_days;
    });

    return schools.map((escola) => {
      const diasAgua = diasPendentesPorEscola[escola.id] || 0;

      let statusManejo = '';
      let temManejo = false;
      if (MOSTRAR_MANEJO) {
        const supNorm = normalizeName(escola.name);
        let sheetRow: ManejoSheetRow | undefined;
        for (const [sheetNorm, row] of sheetMap) {
          if (matchNames(supNorm, sheetNorm)) { sheetRow = row; break; }
        }
        const status: StatusManejo = determinarStatus({
          naoSeAplica: sheetRow?.naoSeAplica ?? false,
          validadeAutorizacao: sheetRow ? (sheetRow.naoSeAplica ? null : sheetRow.validadeISO) : null,
          daPlanilha: !!sheetRow,
        });
        statusManejo = status;
        temManejo = temPendenciaManejo(status);
      }

      return {
        escola_id: escola.id,
        escola_nome: escola.name,
        tem_pendencia_agua: diasAgua > TOLERANCIA_DIAS_AGUA,
        dias_agua_pendentes: diasAgua,
        agua_dispensada: !!escola.water_exempt,
        status_manejo: statusManejo,
        tem_pendencia_manejo: temManejo,
      };
    });
  }

  async function gerarSnapshot() {
    const agora = new Date();
    const semanaCorrente = semanaCorrenteYMD(agora);
    const alvo = semanaAlvo || semanaCorrente;
    const semanas = alvo === 'todas' ? semanasSelecionaveis : [alvo];
    const recalculaPassado = semanas.some(s => s !== semanaCorrente);

    if (recalculaPassado && !window.confirm(
      alvo === 'todas'
        ? `Recalcular as ${semanas.length} semanas do histórico com os lançamentos atuais? As escolas que já regularizaram deixam de aparecer como pendentes nessas semanas.`
        : `Recalcular a semana de ${formatWeekLabel(alvo)} com os lançamentos atuais? As escolas que já regularizaram deixam de aparecer como pendentes nessa semana.`,
    )) return;

    setSnapshotting(true);
    setSnapshotMsg(null);
    setSnapshotProgresso(null);
    try {
      // ── Manejo arbóreo: só é calculado quando MOSTRAR_MANEJO está ativo.
      // Enquanto a página acompanha apenas água, o snapshot grava os campos de
      // manejo vazios (mesma lógica/planilha de src/pages/ManejoArboreo.tsx).
      // Ao recalcular semanas passadas, usa a situação atual da planilha. ─
      const sheetMap = MOSTRAR_MANEJO
        ? await fetchManejoFromSheet().catch((err) => {
            console.warn('Planilha de manejo indisponível ao gerar snapshot:', err);
            return new Map<string, ManejoSheetRow>();
          })
        : new Map<string, ManejoSheetRow>();

      let criadas = 0;
      let atualizadas = 0;
      for (let i = 0; i < semanas.length; i++) {
        const semana = semanas[i];
        if (semanas.length > 1) setSnapshotProgresso(`${i + 1}/${semanas.length}`);
        const linhas = await calcularLinhasSnapshot(referenciaDaSemana(semana, agora), sheetMap);
        const resultado = await invoke('gerar_snapshot', { semana, rows: linhas });
        criadas += resultado.criadas || 0;
        atualizadas += resultado.atualizadas || 0;
      }

      await carregarHistorico();
      let texto: string;
      if (alvo === 'todas') {
        texto = `${semanas.length} semana(s) recalculada(s) com os lançamentos atuais: ${criadas} linha(s) nova(s), ${atualizadas} atualizada(s).`;
      } else if (recalculaPassado) {
        texto = `Semana de ${formatWeekLabel(alvo)} recalculada com os lançamentos atuais (dias contados até o domingo): ${criadas} escola(s) nova(s), ${atualizadas} atualizada(s).`;
      } else {
        const avisoSegunda = agora.getDay() === 1 ? ' Às segundas, o snapshot ainda fecha a semana anterior.' : '';
        texto = `Snapshot da semana de ${formatWeekLabel(alvo)} gerado: ${criadas} escola(s) nova(s), ${atualizadas} atualizada(s).${avisoSegunda}`;
      }
      setSnapshotMsg({ tipo: 'ok', texto });
      setSemanaAlvo('');
    } catch (err: any) {
      console.error('Erro ao gerar snapshot semanal:', err);
      setSnapshotMsg({ tipo: 'erro', texto: err?.message || 'Erro ao gerar snapshot semanal.' });
    } finally {
      setSnapshotting(false);
      setSnapshotProgresso(null);
    }
  }

  // Semanas que o admin pode (re)gerar: a corrente + todas que já têm snapshot,
  // da mais recente para a mais antiga.
  const semanasSelecionaveis = useMemo(() => {
    const set = new Set(snapshots.map(s => s.semana));
    set.add(semanaCorrenteYMD(new Date()));
    return Array.from(set).sort().reverse();
  }, [snapshots]);

  // Escolas pendentes de água na semana aberta no detalhamento (mesmo critério
  // do % Água: tolerância aplicada, dispensadas fora, supervisor só as suas).
  const pendentesDaSemana = useMemo(() => {
    if (!semanaDetalhe) return [] as SnapshotRow[];
    return snapshots
      .filter(r => r.semana === semanaDetalhe)
      .filter(r => userRole !== 'supervisor' || supervisorSchoolIds.includes(r.escola_id))
      .filter(r => !isTrue(r.agua_dispensada) && aguaPendente(r))
      .sort((a, b) => (Number(b.dias_agua_pendentes) || 0) - (Number(a.dias_agua_pendentes) || 0) || a.escola_nome.localeCompare(b.escola_nome));
  }, [snapshots, semanaDetalhe, userRole, supervisorSchoolIds]);

  const detalheReqRef = useRef(0);

  function abrirSemanaDetalhe(semana: string) {
    setSemanaDetalhe(atual => (atual === semana ? null : semana));
    setEscolaDetalheId(null);
  }

  // Dias úteis ainda sem lançamento da escola, contados até o fim da semana
  // (domingo; na semana corrente, até hoje) com os lançamentos atuais.
  async function abrirEscolaDetalhe(escolaId: string, semana: string) {
    if (escolaDetalheId === escolaId) { setEscolaDetalheId(null); return; }
    setEscolaDetalheId(escolaId);
    const req = ++detalheReqRef.current;
    const referencia = referenciaDaSemana(semana, new Date());
    const ate = formatDateToYMD(referencia);
    setDiasDetalhe({ loading: true, erro: null, dias: [], ate });
    const { data, error } = await (supabase as any).rpc('get_pending_water_days', {
      p_school_id: escolaId,
      p_window_start: formatDateToYMD(inicioJanelaAgua(referencia)),
      p_today: ate,
    });
    if (req !== detalheReqRef.current) return; // usuário já abriu outra escola
    if (error) {
      console.error('Erro ao buscar dias pendentes de água:', error);
      setDiasDetalhe({ loading: false, erro: 'Não foi possível carregar os dias pendentes.', dias: [], ate });
      return;
    }
    setDiasDetalhe({ loading: false, erro: null, dias: (data || []).map((r: any) => String(r.day)), ate });
  }

  const escolasVisiveisPicker = useMemo(() => {
    if (userRole === 'supervisor') return schools.filter(s => supervisorSchoolIds.includes(s.id));
    return schools;
  }, [schools, userRole, supervisorSchoolIds]);

  const weeklyData = useMemo(() => {
    const bySemana = new Map<string, SnapshotRow[]>();
    for (const s of snapshots) {
      if (!bySemana.has(s.semana)) bySemana.set(s.semana, []);
      bySemana.get(s.semana)!.push(s);
    }
    const semanas = Array.from(bySemana.keys()).sort();
    return semanas.map((semana) => {
      let rows = bySemana.get(semana)!;
      if (userRole === 'supervisor') rows = rows.filter(r => supervisorSchoolIds.includes(r.escola_id));
      const total = rows.length;
      // Escolas dispensadas (água) ou "não se aplica" (manejo) não são avaliadas
      // nesses pilares — mesmo critério de RankingEscolas.tsx/ManejoArboreo.tsx —
      // então saem do denominador de cada percentual, não só do numerador.
      const elegiveisAgua = rows.filter(r => !isTrue(r.agua_dispensada));
      const elegiveisManejo = rows.filter(r => r.status_manejo !== 'NAO_SE_APLICA');
      const comAgua = elegiveisAgua.filter(r => aguaPendente(r)).length;
      const comManejo = elegiveisManejo.filter(r => isTrue(r.tem_pendencia_manejo)).length;
      const pct = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 1000) / 10 : 0);
      const pctAgua = pct(comAgua, elegiveisAgua.length);
      const pctManejo = pct(comManejo, elegiveisManejo.length);
      return {
        semana,
        semanaLabel: formatWeekLabel(semana),
        total, comAgua, comManejo,
        pctAgua, pctManejo,
        // Com manejo ativo, Total = média simples entre % Água e % Manejo (não é
        // a % de escolas com pelo menos uma das duas pendências). Enquanto só a
        // água é acompanhada, Total = % Água.
        pctQualquer: MOSTRAR_MANEJO
          ? Math.round(((pctAgua + pctManejo) / 2) * 10) / 10
          : pctAgua,
      };
    });
  }, [snapshots, userRole, supervisorSchoolIds]);

  const escolaFocoId = userRole === 'school_manager' ? userSchoolId : (selectedSchoolId || null);
  const nomeEscolaFoco = escolaFocoId ? schools.find(s => s.id === escolaFocoId)?.name : null;

  const schoolWeeklyData = useMemo(() => {
    if (!escolaFocoId) return [];
    return snapshots
      .filter(s => s.escola_id === escolaFocoId)
      .sort((a, b) => a.semana.localeCompare(b.semana))
      .map(s => ({
        semana: s.semana,
        semanaLabel: formatWeekLabel(s.semana),
        agua: aguaPendente(s),
        manejo: isTrue(s.tem_pendencia_manejo),
        statusManejo: s.status_manejo,
      }));
  }, [snapshots, escolaFocoId]);

  // ── Escolas que seguram o índice (água) ─────────────────────────────────
  // Para cada escola pendente na última semana, calcula há quantas semanas
  // seguidas ela está pendente (sequência) e o histórico recente, para separar
  // as crônicas (o que trava o índice) das que acabaram de cair na pendência.
  const ofensoras = useMemo(() => {
    const semanas = Array.from(new Set(snapshots.map(s => s.semana))).sort();
    if (semanas.length === 0) return { lista: [] as OfensoraAgua[], base: 0, semanasHist: [] as string[] };
    const ultima = semanas[semanas.length - 1];
    const semanasHist = semanas.slice(-HIST_SEMANAS);

    const porEscola = new Map<string, Map<string, SnapshotRow>>();
    for (const s of snapshots) {
      if (userRole === 'supervisor' && !supervisorSchoolIds.includes(s.escola_id)) continue;
      if (!porEscola.has(s.escola_id)) porEscola.set(s.escola_id, new Map());
      porEscola.get(s.escola_id)!.set(s.semana, s);
    }

    let base = 0;
    const lista: OfensoraAgua[] = [];
    for (const [escolaId, mapa] of porEscola) {
      const atual = mapa.get(ultima);
      if (!atual || isTrue(atual.agua_dispensada)) continue;
      base++;
      if (!aguaPendente(atual)) continue;

      // Os dias pendentes são o acumulado da janela (não da semana). Por isso a
      // sequência sozinha engana: 3 dias antigos em aberto ficam "pendentes"
      // todas as semanas. Compara com o início da sequência para distinguir
      // quem segue faltando (dias crescendo) de uma lacuna antiga parada.
      let sequencia = 0;
      let diasInicio = 0;
      for (let i = semanas.length - 1; i >= 0; i--) {
        const r = mapa.get(semanas[i]);
        if (r && !isTrue(r.agua_dispensada) && aguaPendente(r)) {
          sequencia++;
          diasInicio = Number(r.dias_agua_pendentes) || 0;
        } else break;
      }
      const diasAtual = Number(atual.dias_agua_pendentes) || 0;
      const anterior = mapa.get(semanas[semanas.length - 2]);
      lista.push({
        escolaId,
        nome: atual.escola_nome,
        dias: Number(atual.dias_agua_pendentes) || 0,
        diasAnterior: anterior ? (Number(anterior.dias_agua_pendentes) || 0) : null,
        sequencia,
        acumulando: sequencia > 1 && diasAtual > diasInicio,
        historico: semanasHist.map(sem => {
          const r = mapa.get(sem);
          return !r || isTrue(r.agua_dispensada) ? null : aguaPendente(r);
        }),
      });
    }
    lista.sort((a, b) => b.sequencia - a.sequencia || b.dias - a.dias || a.nome.localeCompare(b.nome));
    return { lista, base, semanasHist };
  }, [snapshots, userRole, supervisorSchoolIds]);

  const ofensorasFiltradas = useMemo(() => {
    const termo = normalizeName(buscaOfensora);
    return ofensoras.lista.filter(o => {
      if (filtroOfensora === 'cronicas' && o.sequencia < SEQ_CRONICA) return false;
      if (filtroOfensora === 'novas' && o.sequencia !== 1) return false;
      if (termo && !normalizeName(o.nome).includes(termo)) return false;
      return true;
    });
  }, [ofensoras, filtroOfensora, buscaOfensora]);

  const semanaAtual = weeklyData[weeklyData.length - 1];
  const semanaAnterior = weeklyData[weeklyData.length - 2];
  const delta = semanaAtual && semanaAnterior ? Math.round((semanaAtual.pctQualquer - semanaAnterior.pctQualquer) * 10) / 10 : null;

  const podeGerarSnapshot = userRoleRaw === 'regional_admin';
  const podeFiltrarEscola = userRole === 'regional_admin' || userRole === 'dirigente';
  // A escola (school_manager) vê o % da rede, mas não a lista de outras escolas.
  const podeDetalhar = userRole !== 'school_manager';

  async function handleExportPDF() {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const opts = { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' };
      const canvas = await html2canvas(printRef.current, opts);
      const doc = new jsPDF('portrait', 'mm', 'a4');
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();

      const usableTop = 32;
      const usableH = ph - 32 - 12;
      const ratio = canvas.width / canvas.height;
      const usableRatio = pw / usableH;
      let w, h, x, y;
      if (ratio > usableRatio) {
        w = pw; h = pw / ratio; x = 0; y = usableTop + (usableH - h) / 2;
      } else {
        h = usableH; w = usableH * ratio; x = (pw - w) / 2; y = usableTop;
      }
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, w, h);
      addTimbradoAllPages(doc);
      doc.save(`pendencias-semanais-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar PDF.');
    } finally {
      setExporting(false);
    }
  }

  // ── Guarda de acesso ──────────────────────────────────────────────────
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={32} /></div>;
  }

  if (!ALLOWED_ROLES.includes(userRole)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Lock className="w-16 h-16 text-red-400 mb-4" />
        <h1 className="text-xl font-black text-slate-800 mb-2">Acesso Restrito</h1>
        <p className="text-slate-500 text-center max-w-md text-sm">
          Esta página é de uso exclusivo do acompanhamento de metas do Plano de Ação.
        </p>
      </div>
    );
  }

  const DeltaIcon = delta === null ? Minus : delta < 0 ? TrendingDown : delta > 0 ? TrendingUp : Minus;
  const deltaCor = delta === null || delta === 0 ? 'text-slate-500 bg-slate-50 border-slate-200' : delta < 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200';

  return (
    <div className="space-y-6">
      {/* ── Banner principal ── */}
      <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background: 'linear-gradient(135deg, #4c0519 0%, #7f1d1d 50%, #831843 100%)' }}>
        <div className="relative px-6 py-7 md:px-8">
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-rose-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-rose-500/40 flex-shrink-0">
                <ClipboardCheck size={34} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black text-rose-300 uppercase tracking-[0.2em] bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">Plano de Ação</span>
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">{MOSTRAR_MANEJO ? 'Pendências Semanais — Água e Manejo Arbóreo' : 'Pendências Semanais — Água'}</h1>
                <p className="text-rose-200/70 text-sm mt-1">
                  Meta: zerar o percentual de escolas com pendências junto à URE
                </p>
              </div>
            </div>

            {podeGerarSnapshot && (
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={semanaAlvo}
                  onChange={(e) => setSemanaAlvo(e.target.value)}
                  disabled={snapshotting}
                  title="Semanas passadas são recalculadas com os lançamentos atuais, contando os dias até o domingo de cada semana."
                  className="px-3 py-3 rounded-xl text-sm font-bold text-white bg-white/10 border border-white/20 focus:outline-none focus:border-rose-300 disabled:opacity-60"
                >
                  {semanasSelecionaveis.map((s, i) => (
                    <option key={s} value={i === 0 ? '' : s} className="text-slate-800">
                      {i === 0 ? `Semana atual (${formatWeekLabel(s)})` : `Recalcular semana de ${formatWeekLabel(s)}`}
                    </option>
                  ))}
                  {semanasSelecionaveis.length > 1 && (
                    <option value="todas" className="text-slate-800">Recalcular todo o histórico</option>
                  )}
                </select>
                <button
                  onClick={gerarSnapshot}
                  disabled={snapshotting}
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-rose-500 hover:bg-rose-400 disabled:opacity-60 shadow-lg shadow-rose-500/30 transition-all"
                >
                  {snapshotting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  {snapshotting && snapshotProgresso ? `Recalculando ${snapshotProgresso}…` : semanaAlvo ? 'Recalcular' : 'Gerar snapshot da semana'}
                </button>
              </div>
            )}
          </div>
        </div>

        {MOSTRAR_MANEJO && (
          <div className="bg-black/20 px-8 py-3 flex flex-wrap items-center gap-2 border-t border-white/5">
            <span className="text-xs text-rose-300/70 font-semibold">
              Pendência de manejo arbóreo = aguardando validade, vencida ou sem resposta.
            </span>
          </div>
        )}
      </div>

      {snapshotMsg && (
        <div className={`rounded-xl px-4 py-3 text-sm font-semibold border flex items-center gap-2 ${snapshotMsg.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {snapshotMsg.tipo === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {snapshotMsg.texto}
        </div>
      )}

      {snapshots.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-rose-50 text-rose-400 rounded-2xl flex items-center justify-center mb-4">
            <ClipboardCheck size={30} />
          </div>
          <h3 className="text-xl font-black text-slate-800">Ainda não há histórico</h3>
          <p className="text-slate-500 max-w-md mt-2 text-sm leading-relaxed">
            {podeGerarSnapshot
              ? 'Clique em "Gerar snapshot da semana" para registrar a primeira leitura de pendências.'
              : 'Assim que o primeiro snapshot semanal for gerado pela gestão regional, a evolução aparecerá aqui.'}
          </p>
        </div>
      ) : (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Semana Atual</p>
              <p className="text-2xl font-black text-slate-700">{semanaAtual ? formatWeekLabel(semanaAtual.semana) : '—'}</p>
            </div>
            <div className={`bg-white rounded-2xl p-5 border shadow-sm ${semanaAtual?.pctQualquer === 0 ? 'border-emerald-200' : 'border-rose-200'}`}>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">% Escolas com Pendência</p>
              <p className={`text-3xl font-black ${semanaAtual?.pctQualquer === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{semanaAtual ? `${semanaAtual.pctQualquer}%` : '—'}</p>
            </div>
            <div className={`bg-white rounded-2xl p-5 border shadow-sm ${deltaCor}`}>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Variação vs. Semana Anterior</p>
              <p className="text-2xl font-black flex items-center gap-1.5"><DeltaIcon size={20} />{delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}%`}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{MOSTRAR_MANEJO ? 'Água / Manejo Pendentes' : 'Escolas com Água Pendente'}</p>
              <p className="text-2xl font-black text-slate-700 flex items-center gap-3">
                <span className="flex items-center gap-1.5"><Droplets size={18} style={{ color: COR_AGUA }} />{semanaAtual?.comAgua ?? '—'}</span>
                {MOSTRAR_MANEJO && (
                  <span className="flex items-center gap-1.5"><TreeDeciduous size={18} style={{ color: COR_MANEJO }} />{semanaAtual?.comManejo ?? '—'}</span>
                )}
              </p>
            </div>
          </div>

          {/* ── Escolas que seguram o índice ── */}
          {(() => {
            const { lista, base, semanasHist } = ofensoras;
            const cronicas = lista.filter(o => o.sequencia >= SEQ_CRONICA);
            const novas = lista.filter(o => o.sequencia === 1);
            const pctPorEscola = base > 0 ? 100 / base : 0;
            const pctSemCronicas = base > 0 ? Math.round(((lista.length - cronicas.length) / base) * 1000) / 10 : 0;
            const maxSeq = Math.max(1, ...lista.map(o => o.sequencia));
            return (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 pt-5 pb-4 border-b border-slate-100">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                        <Target size={18} className="text-rose-500" /> Escolas que seguram o índice
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Pendências de água na semana de {semanaAtual ? formatWeekLabel(semanaAtual.semana) : '—'}, das mais antigas para as mais recentes.
                        Cada escola pesa <strong>{pctPorEscola.toFixed(1).replace('.', ',')} p.p.</strong> no índice.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                    <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pendentes agora</p>
                      <p className="text-2xl font-black text-slate-700">{lista.length}<span className="text-sm font-bold text-slate-400"> / {base}</span></p>
                    </div>
                    <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3">
                      <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Crônicas (≥ {SEQ_CRONICA} sem.)</p>
                      <p className="text-2xl font-black text-rose-600">{cronicas.length}</p>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                      <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Novas na semana</p>
                      <p className="text-2xl font-black text-amber-600">{novas.length}</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Índice sem as crônicas</p>
                      <p className="text-2xl font-black text-emerald-600">{pctSemCronicas}%</p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
                    <div className="flex gap-1.5">
                      {([['todas', `Todas (${lista.length})`], ['cronicas', `Crônicas (${cronicas.length})`], ['novas', `Novas (${novas.length})`]] as const).map(([k, label]) => (
                        <button
                          key={k}
                          onClick={() => setFiltroOfensora(k)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${filtroOfensora === k ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-500 border-slate-200 hover:border-rose-300'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="relative sm:ml-auto sm:w-64">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={buscaOfensora}
                        onChange={(e) => setBuscaOfensora(e.target.value)}
                        placeholder="Buscar escola…"
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {lista.length === 0 ? (
                  <div className="p-10 text-center text-sm font-semibold text-emerald-600 flex items-center justify-center gap-2">
                    <CheckCircle2 size={18} /> Nenhuma escola com pendência de água na última semana.
                  </div>
                ) : ofensorasFiltradas.length === 0 ? (
                  <div className="p-10 text-center text-sm text-slate-400">Nenhuma escola encontrada para este filtro.</div>
                ) : (
                  <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50 z-10">
                        <tr className="border-b border-slate-100">
                          <th className="text-left py-2.5 px-4 text-[11px] font-black text-slate-400 uppercase tracking-widest w-10">#</th>
                          <th className="text-left py-2.5 px-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Escola</th>
                          <th className="text-left py-2.5 px-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Situação</th>
                          <th className="text-center py-2.5 px-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Dias sem lançar</th>
                          <th className="text-left py-2.5 px-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Últimas {semanasHist.length} semanas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {ofensorasFiltradas.map((o, i) => {
                          const cronica = o.sequencia >= SEQ_CRONICA;
                          const variacao = o.diasAnterior === null ? null : o.dias - o.diasAnterior;
                          return (
                            <tr
                              key={o.escolaId}
                              onClick={podeFiltrarEscola ? () => { setSelectedSchoolId(o.escolaId); window.scrollTo({ top: 0, behavior: 'smooth' }); } : undefined}
                              className={`${podeFiltrarEscola ? 'cursor-pointer hover:bg-rose-50/40' : ''} transition-colors`}
                            >
                              <td className="py-2.5 px-4 text-xs font-black text-slate-300">{i + 1}</td>
                              <td className="py-2.5 px-4 font-bold text-slate-700">{o.nome}</td>
                              <td className="py-2.5 px-4">
                                <div className="flex items-center gap-2">
                                  <span
                                    title={o.sequencia === 1 ? 'Pendência surgiu nesta semana' : o.acumulando ? `Segue deixando de lançar: pendente há ${o.sequencia} semanas e os dias em aberto aumentaram` : `Lacuna antiga: ${o.dias} dia(s) em aberto que ainda não foram regularizados (pendente há ${o.sequencia} semanas, sem novas faltas)`}
                                    className={`text-[11px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap ${o.sequencia === 1 ? 'bg-amber-50 text-amber-600 border-amber-200' : o.acumulando ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
                                  >
                                    {o.sequencia === 1 ? 'Nova' : o.acumulando ? `Acumulando · ${o.sequencia} sem.` : `Lacuna de ${o.dias} dia${o.dias === 1 ? '' : 's'}`}
                                  </span>
                                  <div className="hidden md:block w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${(o.sequencia / maxSeq) * 100}%`, background: cronica ? '#e11d48' : '#f59e0b' }} />
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <span className="font-black text-slate-700">{o.dias}</span>
                                {variacao !== null && variacao !== 0 && (
                                  <span className={`ml-1.5 text-[11px] font-bold ${variacao > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                    {variacao > 0 ? '▲' : '▼'}{Math.abs(variacao)}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-4">
                                <div className="flex items-center gap-1">
                                  {o.historico.map((p, idx) => (
                                    <span
                                      key={idx}
                                      title={`${formatWeekLabel(semanasHist[idx])}: ${p === null ? 'sem dado' : p ? 'pendente' : 'ok'}`}
                                      className="w-3 h-3 rounded-sm"
                                      style={{ background: p === null ? '#e2e8f0' : p ? '#ef4444' : '#10b981' }}
                                    />
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> pendente</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> em dia</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-200" /> sem dado</span>
                  <span>Pendência = mais de {TOLERANCIA_DIAS_AGUA} dias úteis sem lançamento. Escolas dispensadas não entram.</span>
                  {podeFiltrarEscola && <span className="sm:ml-auto">Clique na escola para ver a evolução dela.</span>}
                </div>
              </div>
            );
          })()}

          {/* ── Filtro por escola (regional_admin/dirigente) ── */}
          {podeFiltrarEscola && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Ver escola específica</label>
              <select
                value={selectedSchoolId}
                onChange={(e) => setSelectedSchoolId(e.target.value)}
                className="flex-1 max-w-sm px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 bg-slate-50 focus:bg-white transition-all"
              >
                <option value="">Todas as escolas (média da rede)</option>
                {escolasVisiveisPicker.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* ── Área exportável (gráfico + tabela) ── */}
          <div ref={printRef} className="space-y-6 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            {nomeEscolaFoco && (
              <p className="text-sm font-bold text-slate-600">Escola selecionada: <span className="text-rose-600">{nomeEscolaFoco}</span></p>
            )}

            {escolaFocoId ? (
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">{MOSTRAR_MANEJO ? 'Evolução semanal — Água e Manejo Arbóreo' : 'Evolução semanal — Água'}</p>
                <div className="overflow-x-auto">
                  <div className="flex gap-2 min-w-max pb-2">
                    {schoolWeeklyData.map((w) => (
                      <div key={w.semana} className="flex flex-col items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 min-w-[64px]">
                        <span className="text-[10px] font-black text-slate-400">{w.semanaLabel}</span>
                        <div className="flex items-center gap-1" title={`Água: ${w.agua ? 'pendente' : 'ok'}`}>
                          <Droplets size={13} style={{ color: w.agua ? COR_AGUA : '#cbd5e1' }} />
                          <div className="w-2 h-2 rounded-full" style={{ background: w.agua ? '#ef4444' : '#10b981' }} />
                        </div>
                        {MOSTRAR_MANEJO && (
                          <div className="flex items-center gap-1" title={`Manejo: ${w.statusManejo}`}>
                            <TreeDeciduous size={13} style={{ color: w.manejo ? COR_MANEJO : '#cbd5e1' }} />
                            <div className="w-2 h-2 rounded-full" style={{ background: w.manejo ? '#ef4444' : '#10b981' }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Evolução semanal — % da rede com pendência</p>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={weeklyData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="semanaLabel" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Meta: 0%', position: 'insideTopRight', fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} />
                    <Tooltip formatter={(value: any, name: any) => [`${value}%`, name]} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                    {MOSTRAR_MANEJO && <Line type="monotone" dataKey="pctQualquer" name="Total com pendência" stroke={COR_TOTAL} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />}
                    <Line type="monotone" dataKey="pctAgua" name="Água" stroke={COR_AGUA} strokeWidth={MOSTRAR_MANEJO ? 2 : 2.5} dot={{ r: MOSTRAR_MANEJO ? 3 : 4 }} activeDot={{ r: 6 }} />
                    {MOSTRAR_MANEJO && <Line type="monotone" dataKey="pctManejo" name="Manejo Arbóreo" stroke={COR_MANEJO} strokeWidth={2} dot={{ r: 3 }} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Tabela (visão acessível dos mesmos dados) ── */}
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><TableIcon size={13} /> Dados por semana</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left py-2.5 px-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Semana</th>
                      {MOSTRAR_MANEJO && <th className="text-center py-2.5 px-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">% Total</th>}
                      <th className="text-center py-2.5 px-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">% Água</th>
                      {MOSTRAR_MANEJO && <th className="text-center py-2.5 px-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">% Manejo</th>}
                      <th className="text-center py-2.5 px-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Escolas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {weeklyData.slice().reverse().map(w => {
                      const aberta = semanaDetalhe === w.semana;
                      const clicavel = podeDetalhar && w.comAgua > 0;
                      return (
                        <Fragment key={w.semana}>
                          <tr className={aberta ? 'bg-blue-50/40' : ''}>
                            <td className="py-2.5 px-4 font-bold text-slate-700">{w.semanaLabel}</td>
                            {MOSTRAR_MANEJO && <td className="py-2.5 px-4 text-center font-black" style={{ color: COR_TOTAL }}>{w.pctQualquer}%</td>}
                            <td className="py-2.5 px-4 text-center" style={{ color: COR_AGUA }}>
                              {clicavel ? (
                                <button
                                  onClick={() => abrirSemanaDetalhe(w.semana)}
                                  title="Ver escolas pendentes nesta semana"
                                  className="inline-flex items-center gap-1 font-bold underline decoration-dotted underline-offset-4 hover:decoration-solid"
                                >
                                  {aberta ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                  {w.pctAgua}% <span className="text-slate-400 font-semibold no-underline">({w.comAgua})</span>
                                </button>
                              ) : (
                                <>{w.pctAgua}%</>
                              )}
                            </td>
                            {MOSTRAR_MANEJO && <td className="py-2.5 px-4 text-center" style={{ color: COR_MANEJO }}>{w.pctManejo}%</td>}
                            <td className="py-2.5 px-4 text-center text-slate-400">{w.total}</td>
                          </tr>
                          {aberta && (
                            <tr>
                              <td colSpan={MOSTRAR_MANEJO ? 5 : 3} className="px-4 pb-4 pt-1 bg-blue-50/40">
                                <p className="text-[11px] text-slate-500 mb-2">
                                  {pendentesDaSemana.length} escola(s) pendente(s) na semana de {w.semanaLabel}. Clique na escola para ver os dias em aberto.
                                </p>
                                <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                                  {pendentesDaSemana.map(r => {
                                    const escolaAberta = escolaDetalheId === r.escola_id;
                                    return (
                                      <div key={r.escola_id}>
                                        <button
                                          onClick={() => abrirEscolaDetalhe(r.escola_id, w.semana)}
                                          className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
                                        >
                                          <span className="flex items-center gap-1.5 font-bold text-slate-700">
                                            {escolaAberta ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                                            {r.escola_nome}
                                          </span>
                                          <span className="text-xs font-black text-red-600 whitespace-nowrap">{Number(r.dias_agua_pendentes) || 0} dia(s)</span>
                                        </button>
                                        {escolaAberta && (
                                          <div className="px-9 pb-3">
                                            {diasDetalhe.loading ? (
                                              <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Buscando dias em aberto…</p>
                                            ) : diasDetalhe.erro ? (
                                              <p className="text-xs text-red-600">{diasDetalhe.erro}</p>
                                            ) : (
                                              <>
                                                <p className="text-[11px] text-slate-500 mb-1.5">
                                                  No snapshot: {Number(r.dias_agua_pendentes) || 0} dia(s).
                                                  {' '}Com os lançamentos de hoje, faltam <strong>{diasDetalhe.dias.length}</strong> dia(s) até {formatDayLabel(diasDetalhe.ate)}.
                                                  {diasDetalhe.dias.length <= TOLERANCIA_DIAS_AGUA && ' A escola já regularizou: recalcule a semana para atualizar o índice.'}
                                                </p>
                                                {diasDetalhe.dias.length > 0 && (
                                                  <div className="flex flex-wrap gap-1.5">
                                                    {diasDetalhe.dias.map(d => (
                                                      <span key={d} className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-md px-1.5 py-0.5 flex items-center gap-1">
                                                        <CalendarX2 size={11} /> {formatDayLabel(d)}
                                                      </span>
                                                    ))}
                                                  </div>
                                                )}
                                              </>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-60 shadow-lg transition-all"
            >
              {exporting ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
              Exportar PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}
