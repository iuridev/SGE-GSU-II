import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { pageLabel } from '../lib/pageLabels';
import {
  BarChart3, Loader2, LogIn, Users, Clock, Eye, RefreshCw, Info, History, Timer,
  TrendingUp, TrendingDown, Minus, Activity, UserX, Layers, FileDown,
} from 'lucide-react';
import { gerarPdfMetricasAcesso } from '../lib/pdfMetricasAcesso';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts';

interface AccessLog {
  id: string;
  user_id: string;
  event_type: 'login' | 'page_view' | 'logout';
  page: string | null;
  created_at: string;
  session_id: string | null;
}

interface ProfileLite {
  id: string;
  full_name: string;
  role: string;
}

interface LastAccessRow {
  user_id: string;
  email: string | null;
  last_sign_in_at: string | null;
  created_at: string | null;
}

interface Visit {
  userId: string;
  start: number;
  end: number;
  duracaoMin: number;
}

const ROLE_LABELS: Record<string, string> = {
  regional_admin: 'Administrador',
  chefe_departamento: 'Chefe de Departamento',
  supervisor: 'Supervisor',
  dirigente: 'Dirigente',
  ure_servico: 'Serviços URE',
  ure_ecc: 'Especialista',
  school_manager: 'Gestor Unidade',
};

const PERIODOS = [
  { id: '7', label: 'Últimos 7 dias' },
  { id: '30', label: 'Últimos 30 dias' },
  { id: '90', label: 'Últimos 90 dias' },
  { id: 'all', label: 'Todo o período' },
];

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// O app manda um "ainda aqui" a cada 5 min. Se passar mais que isso sem
// nenhum evento do usuário, consideramos que a visita anterior acabou.
const VISIT_GAP_MS = 15 * 60 * 1000;
const INATIVO_DIAS = 30;
const PAGE_SIZE = 1000;
const MAX_PAGES = 300;

// O PostgREST do Supabase corta qualquer consulta em 1000 linhas por padrão.
// Como cada usuário gera um evento a cada 5 min, o limite estourava em poucos
// dias e TODAS as métricas eram calculadas só sobre os 1000 eventos mais
// recentes. Aqui paginamos até trazer tudo.
async function fetchAllPages<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Recebe eventos em ordem cronológica crescente.
function analisar(logs: AccessLog[]) {
  // Logins: o mesmo session_id pode ter gerado mais de um 'login' (bug antigo
  // no F5); mantém só o mais antigo de cada sessão.
  const loginBySession = new Map<string, AccessLog>();
  let fallbackIdx = 0;
  // Navegações reais: o "ainda aqui" é gravado como page_view repetindo a
  // página atual. Um page_view igual ao anterior da mesma sessão é heartbeat,
  // não navegação — antes ele inflava "navegações" e "páginas mais acessadas".
  const lastPageBySession = new Map<string, string>();
  const navs: AccessLog[] = [];
  const eventsByUser = new Map<string, number[]>();

  logs.forEach(l => {
    if (l.event_type === 'login') {
      const key = l.session_id || `__no_session_${fallbackIdx++}`;
      const existing = loginBySession.get(key);
      if (!existing || l.created_at < existing.created_at) loginBySession.set(key, l);
    }
    if (l.event_type === 'page_view' && l.page) {
      const key = l.session_id || l.user_id;
      if (lastPageBySession.get(key) !== l.page) navs.push(l);
      lastPageBySession.set(key, l.page);
    }
    const arr = eventsByUser.get(l.user_id) || [];
    arr.push(new Date(l.created_at).getTime());
    eventsByUser.set(l.user_id, arr);
  });

  // Visitas: por usuário, uma nova visita começa após 15 min sem eventos.
  // Antes a "sessão" ia do primeiro ao último evento do session_id — e como o
  // session_id vive no localStorage por semanas, uma sessão podia "durar"
  // dias, distorcendo o tempo médio e o ranking de tempo de uso.
  const visits: Visit[] = [];
  eventsByUser.forEach((times, userId) => {
    times.sort((a, b) => a - b);
    let start = times[0];
    let prev = times[0];
    for (let i = 1; i < times.length; i++) {
      if (times[i] - prev > VISIT_GAP_MS) {
        visits.push({ userId, start, end: prev, duracaoMin: (prev - start) / 60000 });
        start = times[i];
      }
      prev = times[i];
    }
    visits.push({ userId, start, end: prev, duracaoMin: (prev - start) / 60000 });
  });

  return {
    logins: Array.from(loginBySession.values()),
    navs,
    visits,
    users: new Set(logs.map(l => l.user_id)),
  };
}

const formatDuracao = (min: number | null) => {
  if (min === null || Number.isNaN(min)) return '-';
  if (min < 1) return '< 1 min';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
};

const formatDateTime = (d: string | null) => {
  if (!d) return 'Nunca acessou';
  try { return new Date(d).toLocaleString('pt-BR'); } catch { return d; }
};

function Delta({ atual, anterior }: { atual: number; anterior: number | null }) {
  if (anterior === null) return null;
  if (anterior === 0) {
    return atual === 0 ? null : <span className="text-[11px] text-slate-400">novo vs. período anterior</span>;
  }
  const pct = ((atual - anterior) / anterior) * 100;
  if (Math.abs(pct) < 0.5) {
    return <span className="flex items-center gap-1 text-[11px] text-slate-400"><Minus size={12} /> estável</span>;
  }
  const up = pct > 0;
  return (
    <span className={`flex items-center gap-1 text-[11px] font-medium ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? '+' : ''}{Math.round(pct)}% <span className="text-slate-400 font-normal">vs. anterior</span>
    </span>
  );
}

function Card({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-100 shadow-sm p-4 ${className}`}>
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

const Loading = ({ h = 220 }: { h?: number }) => (
  <div className="flex items-center justify-center text-slate-400" style={{ height: h }}><Loader2 size={24} className="animate-spin" /></div>
);
const Empty = ({ text, h = 220 }: { text: string; h?: number }) => (
  <div className="flex items-center justify-center text-slate-400 text-sm text-center px-4" style={{ height: h }}>{text}</div>
);

export default function MetricasAcesso() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [lastAccess, setLastAccess] = useState<LastAccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('30');
  const [statusFiltro, setStatusFiltro] = useState<'todos' | 'ativos' | 'inativos' | 'nunca'>('todos');

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Busca o dobro do período para comparar com o período anterior.
      let sinceIso: string | null = null;
      if (periodo !== 'all') {
        const since = new Date();
        since.setDate(since.getDate() - Number(periodo) * 2);
        sinceIso = since.toISOString();
      }
      const [logsData, profilesData, lastAccessRes] = await Promise.all([
        fetchAllPages<AccessLog>((from, to) => {
          let q = (supabase as any)
            .from('access_logs')
            .select('id, user_id, event_type, page, created_at, session_id')
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to);
          if (sinceIso) q = q.gte('created_at', sinceIso);
          return q;
        }),
        fetchAllPages<ProfileLite>((from, to) =>
          (supabase as any).from('profiles').select('id, full_name, role').order('id').range(from, to)),
        (supabase as any).rpc('get_user_last_access'),
      ]);
      setLogs(logsData);
      setProfiles(profilesData);
      if (lastAccessRes?.error) console.error('Erro ao carregar último acesso:', lastAccessRes.error);
      setLastAccess((lastAccessRes?.data || []) as LastAccessRow[]);
    } catch (e) {
      console.error('Erro ao carregar métricas de acesso:', e);
    } finally {
      setLoading(false);
    }
  };

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  // Separa período atual e anterior.
  const { atualLogs, anteriorLogs, cutoffMs } = useMemo(() => {
    if (periodo === 'all') return { atualLogs: logs, anteriorLogs: null as AccessLog[] | null, cutoffMs: 0 };
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(periodo));
    const c = cutoff.getTime();
    const atual: AccessLog[] = [];
    const anterior: AccessLog[] = [];
    logs.forEach(l => (new Date(l.created_at).getTime() >= c ? atual : anterior).push(l));
    return { atualLogs: atual, anteriorLogs: anterior, cutoffMs: c };
  }, [logs, periodo]);

  const atual = useMemo(() => analisar(atualLogs), [atualLogs]);
  const anterior = useMemo(() => (anteriorLogs ? analisar(anteriorLogs) : null), [anteriorLogs]);

  const totalUsuarios = profiles.length;
  const tempoTotalMin = useMemo(() => atual.visits.reduce((s, v) => s + v.duracaoMin, 0), [atual]);
  const tempoMedioVisita = atual.visits.length ? tempoTotalMin / atual.visits.length : null;
  const tempoMedioAnterior = anterior && anterior.visits.length
    ? anterior.visits.reduce((s, v) => s + v.duracaoMin, 0) / anterior.visits.length : null;
  const paginasPorVisita = atual.visits.length ? atual.navs.length / atual.visits.length : null;

  // Série diária
  const diario = useMemo(() => {
    const rows = new Map<string, { dia: string; label: string; logins: number; ativos: Set<string>; visitas: number }>();
    const ensure = (d: Date) => {
      const k = dayKey(d);
      let r = rows.get(k);
      if (!r) {
        r = { dia: k, label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, logins: 0, ativos: new Set(), visitas: 0 };
        rows.set(k, r);
      }
      return r;
    };
    // preenche todos os dias do período (dias sem acesso = 0)
    const first = periodo === 'all'
      ? (atualLogs[0] ? new Date(atualLogs[0].created_at) : new Date())
      : new Date(cutoffMs);
    const cur = new Date(first.getFullYear(), first.getMonth(), first.getDate());
    const end = new Date();
    while (cur <= end) { ensure(cur); cur.setDate(cur.getDate() + 1); }
    atual.logins.forEach(l => { ensure(new Date(l.created_at)).logins += 1; });
    atual.visits.forEach(v => { ensure(new Date(v.start)).visitas += 1; });
    atualLogs.forEach(l => { ensure(new Date(l.created_at)).ativos.add(l.user_id); });
    return Array.from(rows.values())
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .map(r => ({ dia: r.dia, label: r.label, Logins: r.logins, 'Usuários ativos': r.ativos.size, Visitas: r.visitas }));
  }, [atual, atualLogs, cutoffMs, periodo]);

  const mediaAtivosDia = useMemo(() => {
    if (!diario.length) return 0;
    return diario.reduce((s, d) => s + d['Usuários ativos'], 0) / diario.length;
  }, [diario]);

  const porHora = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, h) => ({ hora: `${String(h).padStart(2, '0')}h`, total: 0 }));
    atual.visits.forEach(v => { hours[new Date(v.start).getHours()].total += 1; });
    return hours;
  }, [atual]);

  const picoHorario = useMemo(() => {
    if (!porHora.some(h => h.total > 0)) return null;
    return porHora.reduce((max, h) => (h.total > max.total ? h : max), porHora[0]);
  }, [porHora]);

  const porDiaSemana = useMemo(() => {
    const dias = DIAS_SEMANA.map(d => ({ dia: d, total: 0 }));
    atual.visits.forEach(v => { dias[new Date(v.start).getDay()].total += 1; });
    return dias;
  }, [atual]);

  const topUsuarios = useMemo(() => {
    const map = new Map<string, { visitas: number; minutos: number; navegacoes: number }>();
    const get = (id: string) => {
      let r = map.get(id);
      if (!r) { r = { visitas: 0, minutos: 0, navegacoes: 0 }; map.set(id, r); }
      return r;
    };
    atual.visits.forEach(v => { const r = get(v.userId); r.visitas += 1; r.minutos += v.duracaoMin; });
    atual.navs.forEach(n => { get(n.user_id).navegacoes += 1; });
    return Array.from(map.entries())
      .map(([userId, v]) => ({
        userId, ...v,
        nome: profileMap.get(userId)?.full_name || 'Usuário removido',
        role: profileMap.get(userId)?.role || '',
      }))
      .sort((a, b) => b.visitas - a.visitas || b.minutos - a.minutos)
      .slice(0, 10);
  }, [atual, profileMap]);
  const maxVisitas = topUsuarios[0]?.visitas || 1;

  const topPaginas = useMemo(() => {
    const counts = new Map<string, { total: number; users: Set<string> }>();
    atual.navs.forEach(l => {
      const r = counts.get(l.page!) || { total: 0, users: new Set<string>() };
      r.total += 1;
      r.users.add(l.user_id);
      counts.set(l.page!, r);
    });
    return Array.from(counts.entries())
      .map(([page, r]) => ({ page, total: r.total, usuarios: r.users.size, label: pageLabel(page) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [atual]);
  const maxPagina = topPaginas[0]?.total || 1;

  // Adesão por perfil: quantos dos usuários cadastrados acessaram no período.
  const adesaoPorPerfil = useMemo(() => {
    const totals = new Map<string, { total: number; ativos: number }>();
    profiles.forEach(p => {
      const r = totals.get(p.role) || { total: 0, ativos: 0 };
      r.total += 1;
      if (atual.users.has(p.id)) r.ativos += 1;
      totals.set(p.role, r);
    });
    return Array.from(totals.entries())
      .map(([role, r]) => ({ role, label: ROLE_LABELS[role] || role || 'Sem perfil', ...r, pct: r.total ? (r.ativos / r.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [profiles, atual]);

  const ativosCadastrados = useMemo(
    () => profiles.filter(p => atual.users.has(p.id)).length, [profiles, atual]);
  const adesaoGeral = totalUsuarios ? (ativosCadastrados / totalUsuarios) * 100 : 0;

  // Último acesso (Supabase Auth)
  const ultimoAcessoLista = useMemo(() => {
    const limite = Date.now() - INATIVO_DIAS * 86400000;
    return lastAccess
      .map(a => {
        const ts = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : null;
        const status: 'ativos' | 'inativos' | 'nunca' = ts === null ? 'nunca' : ts >= limite ? 'ativos' : 'inativos';
        return {
          ...a, status,
          nome: profileMap.get(a.user_id)?.full_name || a.email || 'Usuário removido',
          role: profileMap.get(a.user_id)?.role || '',
        };
      })
      .sort((a, b) => {
        if (!a.last_sign_in_at) return 1;
        if (!b.last_sign_in_at) return -1;
        return b.last_sign_in_at.localeCompare(a.last_sign_in_at);
      });
  }, [lastAccess, profileMap]);

  const semAcesso = useMemo(() => ultimoAcessoLista.filter(a => a.status !== 'ativos').length, [ultimoAcessoLista]);
  const listaFiltrada = useMemo(
    () => (statusFiltro === 'todos' ? ultimoAcessoLista : ultimoAcessoLista.filter(a => a.status === statusFiltro)),
    [ultimoAcessoLista, statusFiltro]);

  const kpis = [
    {
      label: 'Logins', value: atual.logins.length, icon: <LogIn size={20} className="text-teal-600" />, bg: 'bg-teal-50',
      hint: 'autenticações no período', delta: <Delta atual={atual.logins.length} anterior={anterior ? anterior.logins.length : null} />,
    },
    {
      label: 'Visitas', value: atual.visits.length, icon: <Layers size={20} className="text-indigo-600" />, bg: 'bg-indigo-50',
      hint: 'idas ao sistema (pausa > 15 min = nova visita)', delta: <Delta atual={atual.visits.length} anterior={anterior ? anterior.visits.length : null} />,
    },
    {
      label: 'Usuários Ativos', value: atual.users.size, icon: <Users size={20} className="text-blue-600" />, bg: 'bg-blue-50',
      hint: totalUsuarios ? `${Math.round(adesaoGeral)}% dos ${totalUsuarios} cadastrados · ~${mediaAtivosDia.toFixed(1)}/dia` : 'no período',
      delta: <Delta atual={atual.users.size} anterior={anterior ? anterior.users.size : null} />,
    },
    {
      label: 'Navegações', value: atual.navs.length, icon: <Eye size={20} className="text-violet-600" />, bg: 'bg-violet-50',
      hint: paginasPorVisita !== null ? `${paginasPorVisita.toFixed(1)} páginas por visita` : 'trocas de página',
      delta: <Delta atual={atual.navs.length} anterior={anterior ? anterior.navs.length : null} />,
    },
    {
      label: 'Tempo Médio por Visita', value: formatDuracao(tempoMedioVisita), icon: <Timer size={20} className="text-pink-600" />, bg: 'bg-pink-50',
      hint: `${formatDuracao(tempoTotalMin)} de uso total`,
      delta: tempoMedioVisita !== null ? <Delta atual={tempoMedioVisita} anterior={tempoMedioAnterior} /> : null,
    },
    {
      label: 'Horário de Pico', value: picoHorario ? picoHorario.hora : '-', icon: <Clock size={20} className="text-amber-600" />, bg: 'bg-amber-50',
      hint: picoHorario ? `${picoHorario.total} visitas nesse horário` : 'sem dados',
      delta: null,
    },
  ];

  const exportarPdf = () => {
    const pctTexto = (a: number, b: number | null) => {
      if (b === null || b === 0) return '';
      const pct = Math.round(((a - b) / b) * 100);
      return pct > 0 ? `+${pct}%` : `${pct}%`;
    };
    const deltas = [
      pctTexto(atual.logins.length, anterior ? anterior.logins.length : null),
      pctTexto(atual.visits.length, anterior ? anterior.visits.length : null),
      pctTexto(atual.users.size, anterior ? anterior.users.size : null),
      pctTexto(atual.navs.length, anterior ? anterior.navs.length : null),
      tempoMedioVisita !== null ? pctTexto(tempoMedioVisita, tempoMedioAnterior) : '',
      '',
    ];
    const problemas = ultimoAcessoLista.filter(a => a.status !== 'ativos');
    gerarPdfMetricasAcesso({
      periodoLabel: PERIODOS.find(p => p.id === periodo)?.label || periodo,
      comparaAnterior: !!anterior,
      totalEventos: atualLogs.length,
      kpis: kpis.map((k, i) => ({ label: k.label, value: String(k.value), hint: k.hint, delta: deltas[i] })),
      diario: diario.map(d => ({ label: d.label, ativos: d['Usuários ativos'], visitas: d.Visitas, logins: d.Logins })),
      porHora: porHora.map(h => ({ label: h.hora, value: h.total })),
      porDiaSemana: porDiaSemana.map(d => ({ label: d.dia, value: d.total })),
      adesao: adesaoPorPerfil.map(r => ({ label: r.label, ativos: r.ativos, total: r.total, pct: r.pct })),
      topUsuarios: topUsuarios.map(u => ({
        nome: u.nome, perfil: ROLE_LABELS[u.role] || u.role || '-', visitas: u.visitas,
        tempo: formatDuracao(u.minutos), navegacoes: u.navegacoes,
      })),
      topPaginas: topPaginas.map(p => ({ label: p.label, total: p.total, usuarios: p.usuarios })),
      semAcesso: problemas.slice(0, 60).map(a => ({
        nome: a.nome, perfil: ROLE_LABELS[a.role] || a.role || '-',
        situacao: a.status === 'nunca' ? 'Nunca acessou' : `Inativo +${INATIVO_DIAS}d`,
        ultimo: a.last_sign_in_at ? formatDateTime(a.last_sign_in_at) : '-',
      })),
      semAcessoTotal: problemas.length,
      inativoDias: INATIVO_DIAS,
    });
  };

  const statusBadge = (s: 'ativos' | 'inativos' | 'nunca') => {
    if (s === 'ativos') return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700">Ativo</span>;
    if (s === 'inativos') return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700">Inativo +{INATIVO_DIAS}d</span>;
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700">Nunca acessou</span>;
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="text-teal-600" size={28} />
            Métricas de Acesso
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Adesão, engajamento, horários de pico e páginas mais usadas no SGE
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={periodo} onChange={e => setPeriodo(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          >
            {PERIODOS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button
            onClick={exportarPdf}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm disabled:opacity-50"
          >
            <FileDown size={16} />
            Exportar PDF
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-xs rounded-lg px-3 py-2.5">
        <Info size={14} className="shrink-0 mt-0.5" />
        <span>
          Só há registro a partir da ativação do rastreamento. Uma <b>visita</b> é um período de uso contínuo (pausa maior que 15 min inicia outra); o tempo é estimado por checagens a cada ~5 min.
          {anterior && ' As variações comparam com o período imediatamente anterior, de mesmo tamanho.'}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>{card.icon}</div>
              <p className="text-xs text-slate-500 font-medium leading-tight">{card.label}</p>
            </div>
            <p className="text-2xl font-bold text-slate-800">{loading ? '…' : card.value}</p>
            <div className="min-h-[16px]">{!loading && card.delta}</div>
            <p className="text-[11px] text-slate-400 leading-tight">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title="Evolução Diária" subtitle="Usuários ativos, visitas e logins por dia">
          {loading ? <Loading /> : atual.visits.length === 0 ? <Empty text="Nenhum acesso registrado no período" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={diario} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gAtivos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={20} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="Usuários ativos" stroke="#3b82f6" strokeWidth={2} fill="url(#gAtivos)" />
                <Area type="monotone" dataKey="Visitas" stroke="#6366f1" strokeWidth={2} fill="none" />
                <Area type="monotone" dataKey="Logins" stroke="#0d9488" strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Adesão por Perfil" subtitle="Cadastrados que acessaram no período">
          {loading ? <Loading /> : adesaoPorPerfil.length === 0 ? <Empty text="Nenhum usuário cadastrado" /> : (
            <ul className="space-y-3">
              {adesaoPorPerfil.map(r => (
                <li key={r.role}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-700 truncate">{r.label}</span>
                    <span className="text-xs text-slate-500 shrink-0">{r.ativos}/{r.total} · <b className="text-slate-700">{Math.round(r.pct)}%</b></span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full ${r.pct >= 60 ? 'bg-emerald-500' : r.pct >= 30 ? 'bg-amber-400' : 'bg-rose-400'}`}
                      style={{ width: `${r.pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Visitas por Horário do Dia" subtitle="Hora em que cada visita começou">
          {loading ? <Loading /> : atual.visits.length === 0 ? <Empty text="Nenhum acesso registrado no período" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={porHora} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="hora" tick={{ fontSize: 10 }} interval={1} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [v, 'Visitas']} />
                <Bar dataKey="total" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Visitas por Dia da Semana" subtitle="Quando o sistema é mais usado">
          {loading ? <Loading /> : atual.visits.length === 0 ? <Empty text="Nenhum acesso registrado no período" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={porDiaSemana} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [v, 'Visitas']} />
                <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Usuários Mais Engajados" subtitle="Ordenado por número de visitas">
          {loading ? <Loading h={200} /> : topUsuarios.length === 0 ? <Empty h={200} text="Nenhum acesso registrado no período" /> : (
            <ul className="space-y-3">
              {topUsuarios.map((u, i) => (
                <li key={u.userId} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-bold text-slate-400 text-right shrink-0">{i + 1}º</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800 truncate">{u.nome}</p>
                      <span className="text-xs text-slate-500 shrink-0">
                        <b className="text-slate-700">{u.visitas}</b> visita{u.visitas !== 1 ? 's' : ''} · {formatDuracao(u.minutos)} · {u.navegacoes} pág.
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(u.visitas / maxVisitas) * 100}%` }} />
                      </div>
                      {u.role && <span className="text-[10px] text-slate-400 shrink-0">{ROLE_LABELS[u.role] || u.role}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Páginas Mais Acessadas" subtitle="Trocas de página (sem contar tempo parado)">
          {loading ? <Loading h={200} /> : topPaginas.length === 0 ? <Empty h={200} text="Nenhuma navegação registrada no período" /> : (
            <ul className="space-y-3">
              {topPaginas.map((p, i) => (
                <li key={p.page} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-bold text-slate-400 text-right shrink-0">{i + 1}º</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.label}</p>
                      <span className="text-xs text-slate-500 shrink-0"><b className="text-slate-700">{p.total}</b> · {p.usuarios} usuário{p.usuarios !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(p.total / maxPagina) * 100}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <History size={15} /> Último Acesso por Usuário
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Vem do Supabase Auth (existe desde antes deste painel): só o login mais recente de cada pessoa.
              {!loading && semAcesso > 0 && (
                <span className="inline-flex items-center gap-1 ml-2 text-amber-700 font-medium">
                  <UserX size={12} /> {semAcesso} sem acesso há mais de {INATIVO_DIAS} dias
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {([['todos', 'Todos'], ['ativos', 'Ativos'], ['inativos', `Inativos +${INATIVO_DIAS}d`], ['nunca', 'Nunca acessou']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setStatusFiltro(id)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${statusFiltro === id ? 'bg-teal-600 text-white border-teal-600' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          {loading ? <Loading h={160} /> : listaFiltrada.length === 0 ? <Empty h={160} text="Nenhum usuário encontrado" /> : (
            <div className="overflow-auto max-h-[420px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50">
                    {['Usuário', 'Perfil', 'Situação', 'Último Acesso'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {listaFiltrada.map(a => (
                    <tr key={a.user_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{a.nome}</td>
                      <td className="px-4 py-2.5 text-slate-500">{ROLE_LABELS[a.role] || a.role || '-'}</td>
                      <td className="px-4 py-2.5">{statusBadge(a.status)}</td>
                      <td className={`px-4 py-2.5 whitespace-nowrap ${a.last_sign_in_at ? 'text-slate-600' : 'text-slate-300 italic'}`}>{formatDateTime(a.last_sign_in_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-400 flex items-center gap-1"><Activity size={12} /> {loading ? 'Carregando…' : `${atualLogs.length.toLocaleString('pt-BR')} eventos analisados no período.`}</p>
    </div>
  );
}
