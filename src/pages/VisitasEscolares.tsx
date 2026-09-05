import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import {
  Plus, Search, X, Loader2, School, CalendarDays, Target,
  MapPin, BarChart3, TrendingUp, Users, RefreshCw, ExternalLink,
  AlertTriangle, Navigation, Route, History, Check, ChevronDown,
  Clock, ListChecks,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

const OBJETIVOS_VISITA = [
  'Abertura de Obra',
  'Fechamento de Obra',
  'Patrimônio mobiliário',
  'Reunião Administrativa',
  'Fiscalização e Monitoramento',
  'Vistoria Predial',
  'Outros',
];

const SHEET_URL = import.meta.env.VITE_VISITAS_SHEET_URL as string;
const LEGADO_CSV_URL = import.meta.env.VITE_VISITAS_LEGADO_CSV_URL as string;
const VISITANTE_LEGADO = 'Registro manual (planilha)';
const NOME_URE = 'unidade regional de ensino';
const OVERDUE_THRESHOLD_DAYS = 60;

const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

interface EscolaOption {
  id: string;
  name: string;
  fde_code?: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface Visita {
  id: string;
  data_visita: string;
  escola_nome: string;
  fde_code: string;
  visitante: string;
  objetivo: string;
  observacoes: string;
  data_registro: string;
}

interface EscolaComVisita extends EscolaOption {
  lastDate: string | null;
  dias: number | null;
}

const FORM_INITIAL = {
  escola_id: '',
  escola_nome: '',
  fde_code: '',
  data_visita: new Date().toISOString().split('T')[0],
  objetivo: '',
  observacoes: '',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers puros (sem estado do componente) — mantidos em escopo de módulo para
// não serem recriados a cada render e poderem ser testados isoladamente.
// ─────────────────────────────────────────────────────────────────────────────

const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

const normalizeEscolaNome = (s: string) =>
  s?.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim() || '';

// A planilha legada (registro manual) costuma trazer o nome divergente do
// cadastro (sem título de patrono, sigla de tipo de escola, abreviado etc. —
// ex.: "JOAO NUNES" em vez de "EE PASTOR JOÃO NUNES"), então além da igualdade
// exata e do casamento por prefixo, comparamos por palavras significativas: se
// todas as palavras do nome mais curto aparecem no nome mais longo, é a mesma
// escola.
const ESCOLA_STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e',
  'ee', 'emef', 'emei', 'emefm', 'ceu', 'cieja', 'etec', 'eja', 'cei',
  'prof', 'profa', 'professor', 'professora', 'dr', 'dra', 'doutor', 'doutora',
  'padre', 'pastor', 'dom', 'irma', 'irmao', 'frei', 'monsenhor',
  'coronel', 'general', 'comendador', 'capitao', 'major', 'sargento', 'cel', 'gal',
  'engenheiro', 'engenheira', 'desembargador', 'desembargadora',
  'deputado', 'deputada', 'senador', 'senadora', 'vereador', 'vereadora',
  'presidente', 'governador', 'governadora',
]);

const palavrasSignificativas = (s: string) =>
  s
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !ESCOLA_STOPWORDS.has(w));

const escolaNomesCorrespondem = (a: string, b: string) => {
  if (!a || !b) return false;
  if (a === b) return true;
  const [curto, longo] = a.length < b.length ? [a, b] : [b, a];
  if (longo.startsWith(`${curto} `)) return true;

  const palavrasCurto = palavrasSignificativas(curto);
  if (palavrasCurto.length < 2) return false; // 1 palavra só é comum demais
  const palavrasLongo = new Set(palavrasSignificativas(longo));
  return palavrasCurto.every(p => palavrasLongo.has(p));
};

const diasDesde = (dateStr: string, ref: Date) =>
  Math.floor((ref.getTime() - new Date(`${dateStr}T00:00:00`).getTime()) / 86400000);

const isOverdue = (dias: number | null) => dias === null || dias >= OVERDUE_THRESHOLD_DAYS;

const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatDate = (d: string) => {
  if (!d) return '-';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
};

// Todas as visitas que correspondem a uma escola do cadastro, mais recentes primeiro.
const visitasDaEscola = (escola: EscolaOption, visitas: Visita[]) => {
  const alvo = normalizeEscolaNome(escola.name);
  return visitas
    .filter(v => v.data_visita && escolaNomesCorrespondem(alvo, normalizeEscolaNome(v.escola_nome)))
    .sort((a, b) => (b.data_visita || '').localeCompare(a.data_visita || ''));
};

type ViewMode = 'registros' | 'historico' | 'indicadores';

// ─────────────────────────────────────────────────────────────────────────────

export default function VisitasEscolares() {
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [escolas, setEscolas] = useState<EscolaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visitante, setVisitante] = useState('');
  const [userRole, setUserRole] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(FORM_INITIAL);
  const [recommendFor, setRecommendFor] = useState<EscolaComVisita | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('registros');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterObjetivo, setFilterObjetivo] = useState('');
  const [filterMes, setFilterMes] = useState('');

  // Histórico por escola
  const [historicoIds, setHistoricoIds] = useState<Set<string>>(new Set());
  const [escolaPickerOpen, setEscolaPickerOpen] = useState(false);
  const [escolaPickerBusca, setEscolaPickerBusca] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  const isAdmin = userRole === 'regional_admin';

  // `now` estável durante o ciclo de vida da tela — evita recomputar memos por
  // mudança de referência de Date e mantém os cálculos de "dias sem visita"
  // consistentes entre si.
  const now = useMemo(() => new Date(), []);
  const currentMonthStr = useMemo(
    () => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    [now],
  );

  useEffect(() => {
    fetchUser();
    fetchEscolas();
    fetchVisitas();
  }, []);

  useEffect(() => {
    if (!escolaPickerOpen) return;
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setEscolaPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [escolaPickerOpen]);

  const fetchUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('full_name, role')
          .eq('id', user.id)
          .single();
        setVisitante(profile?.full_name || user.email || 'Usuário');
        setUserRole(resolveViewRole(profile?.role || ''));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchEscolas = async () => {
    try {
      const { data } = await supabase
        .from('schools')
        .select('id, name, fde_code, latitude, longitude')
        .order('name');
      if (data) setEscolas(data as EscolaOption[]);
    } catch (e) {
      console.error(e);
    }
  };

  // Planilha antiga (servidores que ainda registram manualmente, fora do sistema).
  // Colunas: DATA, ESCOLA, MOTIVO — sem vínculo com escola_id nem visitante identificado.
  const fetchVisitasLegado = async (): Promise<Visita[]> => {
    if (!LEGADO_CSV_URL) {
      console.warn('VITE_VISITAS_LEGADO_CSV_URL não configurada — planilha legada de visitas não será exibida.');
      return [];
    }
    const response = await fetch(LEGADO_CSV_URL);
    if (!response.ok) throw new Error('Falha ao buscar planilha legada de visitas');
    const csvText = await response.text();

    const parseLine = (line: string): string[] => {
      const matches = line.match(/(".*?"|[^",\r\n]+)(?=\s*,|\s*$)/g);
      return matches ? matches.map(m => m.replace(/^"|"$/g, '').trim()) : [];
    };

    return csvText
      .split('\n')
      .filter(l => l.trim())
      .slice(1) // pula o cabeçalho (DATA, ESCOLA, MOTIVO, TOTAL DE VISITAS:, ...)
      .map((line, i): Visita | null => {
        const [dataRaw, escolaNome, motivo] = parseLine(line);
        if (!dataRaw || !escolaNome) return null;

        const [d, m, y] = dataRaw.split('/');
        const dataVisita = d && m && y?.length === 4
          ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
          : dataRaw;

        return {
          id: `legado-${i}-${dataRaw}`,
          data_visita: dataVisita,
          escola_nome: escolaNome,
          fde_code: '',
          visitante: VISITANTE_LEGADO,
          objetivo: motivo || '',
          observacoes: '',
          data_registro: '',
        };
      })
      .filter((v): v is Visita => v !== null);
  };

  const fetchVisitas = async () => {
    setLoading(true);
    try {
      const [oficialResult, legadoResult] = await Promise.allSettled([
        supabase.functions.invoke('google-sheets-visitas', { method: 'GET' }),
        fetchVisitasLegado(),
      ]);

      let oficial: Visita[] = [];
      if (oficialResult.status === 'fulfilled') {
        const { data, error } = oficialResult.value;
        if (error) console.error('Erro ao buscar visitas (sistema):', error);
        else if (Array.isArray(data)) oficial = data;
      } else {
        console.error('Erro ao buscar visitas (sistema):', oficialResult.reason);
      }

      let legado: Visita[] = [];
      if (legadoResult.status === 'fulfilled') {
        legado = legadoResult.value;
      } else {
        console.error('Erro ao buscar visitas (planilha legada):', legadoResult.reason);
      }

      const merged = [...oficial, ...legado].sort((a, b) =>
        (b.data_visita || '').localeCompare(a.data_visita || '')
      );
      setVisitas(merged);
    } finally {
      setLoading(false);
    }
  };

  const handleEscolaChange = (escolaId: string) => {
    const escola = escolas.find(e => e.id === escolaId);
    setFormData(prev => ({
      ...prev,
      escola_id: escolaId,
      escola_nome: escola?.name || '',
      fde_code: escola?.fde_code || '',
    }));
  };

  const openVisitaForm = (escolaId: string) => {
    handleEscolaChange(escolaId);
    setRecommendFor(null);
    setShowForm(true);
  };

  const abrirHistorico = (escolaId: string) => {
    setHistoricoIds(prev => new Set(prev).add(escolaId));
    setRecommendFor(null);
    setViewMode('historico');
  };

  const toggleHistorico = (escolaId: string) => {
    setHistoricoIds(prev => {
      const next = new Set(prev);
      next.has(escolaId) ? next.delete(escolaId) : next.add(escolaId);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.objetivo) {
      alert('O objetivo da visita é obrigatório.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke('google-sheets-visitas', {
        body: {
          id: Date.now().toString(),
          data_visita: formData.data_visita,
          escola_nome: formData.escola_nome,
          fde_code: formData.fde_code,
          visitante,
          objetivo: formData.objetivo,
          observacoes: formData.observacoes,
          data_registro: new Date().toISOString(),
        },
      });
      if (error) throw error;

      setShowForm(false);
      setFormData({ ...FORM_INITIAL, data_visita: new Date().toISOString().split('T')[0] });
      // Aguarda propagação no Sheets antes de recarregar
      setTimeout(() => fetchVisitas(), 2000);
    } catch (e) {
      console.error(e);
      alert('Erro ao registrar visita. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  // ── Derivados ──────────────────────────────────────────────────────────────

  const visitasThisMonth = useMemo(
    () => visitas.filter(v => v.data_visita?.startsWith(currentMonthStr)),
    [visitas, currentMonthStr],
  );

  const uniqueEscolas = useMemo(
    () => new Set(visitas.map(v => normalizeEscolaNome(v.escola_nome)).filter(Boolean)).size,
    [visitas],
  );

  // Ranking de escolas por tempo desde a última visita técnica (nunca visitada no topo)
  const escolasSemVisita = useMemo<EscolaComVisita[]>(() => {
    return escolas
      .filter(e => normalizeEscolaNome(e.name) !== NOME_URE)
      .map(e => {
        const ultima = visitasDaEscola(e, visitas)[0]?.data_visita || null;
        const dias = ultima ? diasDesde(ultima, now) : null; // null = nunca visitada
        return { ...e, lastDate: ultima, dias };
      })
      .sort((a, b) => {
        if (a.dias === null && b.dias === null) return a.name.localeCompare(b.name);
        if (a.dias === null) return -1;
        if (b.dias === null) return 1;
        return b.dias - a.dias;
      });
  }, [escolas, visitas, now]);

  const recomendacoesRota = useMemo(() => {
    if (!recommendFor?.latitude || !recommendFor?.longitude) return [];
    return escolasSemVisita
      .filter(e => e.id !== recommendFor.id && isOverdue(e.dias) && e.latitude && e.longitude)
      .map(e => ({
        ...e,
        distanciaKm: distanceKm(recommendFor.latitude!, recommendFor.longitude!, e.latitude!, e.longitude!),
      }))
      .sort((a, b) => a.distanciaKm - b.distanciaKm)
      .slice(0, 2);
  }, [recommendFor, escolasSemVisita]);

  const OBJETIVOS_SET = useMemo(() => new Set(OBJETIVOS_VISITA), []);
  const OUTROS_LABEL = 'Outros (registros manuais)';

  const chartByObjetivo = useMemo(() => {
    const map = new Map<string, number>();
    visitas.forEach(v => {
      if (!v.objetivo) return;
      // Motivos livres da planilha legada são agrupados para o gráfico não ficar poluído
      const key = OBJETIVOS_SET.has(v.objetivo) ? v.objetivo : OUTROS_LABEL;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([objetivo, total]) => ({ objetivo, total }))
      .sort((a, b) => b.total - a.total);
  }, [visitas, OBJETIVOS_SET]);

  const chartByMonth = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      const total = visitas.filter(v => v.data_visita?.startsWith(key)).length;
      months.push({ mes: label, total });
    }
    return months;
  }, [visitas, now]);

  const avgPerMonth = useMemo(() => {
    const active = chartByMonth.filter(m => m.total > 0);
    if (!active.length) return 0;
    return Math.round(active.reduce((s, m) => s + m.total, 0) / active.length);
  }, [chartByMonth]);

  const filtered = useMemo(() => {
    return visitas.filter(v => {
      const q = searchTerm.toLowerCase();
      const matchSearch =
        !searchTerm ||
        v.escola_nome?.toLowerCase().includes(q) ||
        v.visitante?.toLowerCase().includes(q) ||
        v.objetivo?.toLowerCase().includes(q);
      const matchObjetivo = !filterObjetivo || v.objetivo === filterObjetivo;
      const matchMes = !filterMes || v.data_visita?.startsWith(filterMes);
      return matchSearch && matchObjetivo && matchMes;
    });
  }, [visitas, searchTerm, filterObjetivo, filterMes]);

  const hasFilters = Boolean(searchTerm || filterObjetivo || filterMes);

  // Histórico das escolas selecionadas
  const historico = useMemo(() => {
    return escolas
      .filter(e => historicoIds.has(e.id))
      .map(e => {
        const lista = visitasDaEscola(e, visitas);
        const ultima = lista[0]?.data_visita || null;
        const dias = ultima ? diasDesde(ultima, now) : null;

        const porObjetivo = new Map<string, number>();
        const porAno = new Map<string, number>();
        lista.forEach(v => {
          const obj = OBJETIVOS_SET.has(v.objetivo) ? v.objetivo : (v.objetivo || 'Não informado');
          porObjetivo.set(obj, (porObjetivo.get(obj) || 0) + 1);
          const ano = v.data_visita?.slice(0, 4) || '—';
          porAno.set(ano, (porAno.get(ano) || 0) + 1);
        });

        return {
          escola: e,
          visitas: lista,
          total: lista.length,
          ultima,
          dias,
          porObjetivo: Array.from(porObjetivo.entries()).sort((a, b) => b[1] - a[1]),
          porAno: Array.from(porAno.entries()).sort((a, b) => a[0].localeCompare(b[0])),
        };
      })
      .sort((a, b) => a.escola.name.localeCompare(b.escola.name));
  }, [escolas, visitas, historicoIds, now, OBJETIVOS_SET]);

  const escolasFiltradasPicker = useMemo(() => {
    const q = normalizeEscolaNome(escolaPickerBusca);
    return escolas
      .filter(e => normalizeEscolaNome(e.name) !== NOME_URE)
      .filter(e => !q || normalizeEscolaNome(e.name).includes(q) || (e.fde_code || '').includes(q));
  }, [escolas, escolaPickerBusca]);

  // ── Blocos reutilizados ────────────────────────────────────────────────────

  const metricCards = [
    { label: 'Total de Visitas', value: visitas.length, icon: <BarChart3 size={20} className="text-blue-600" />, bg: 'bg-blue-50' },
    { label: 'Visitas no Mês', value: visitasThisMonth.length, icon: <CalendarDays size={20} className="text-emerald-600" />, bg: 'bg-emerald-50' },
    { label: 'Escolas Visitadas', value: uniqueEscolas, icon: <MapPin size={20} className="text-violet-600" />, bg: 'bg-violet-50' },
    { label: 'Média / Mês', value: avgPerMonth, icon: <TrendingUp size={20} className="text-amber-600" />, bg: 'bg-amber-50' },
  ];

  const MetricGrid = (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metricCards.map(card => (
        <div key={card.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
              {card.icon}
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">{card.label}</p>
              <p className="text-2xl font-bold text-slate-800">{card.value}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const Charts = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <Target size={16} className="text-blue-500" />
          Visitas por Objetivo
        </h2>
        {loading || chartByObjetivo.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">
            {loading ? <Loader2 size={24} className="animate-spin" /> : 'Nenhum dado disponível'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartByObjetivo} margin={{ top: 0, right: 10, left: -20, bottom: 70 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="objetivo" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(v) => [v, 'Visitas']} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {chartByObjetivo.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-emerald-500" />
          Visitas nos Últimos 6 Meses
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartByMonth} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip formatter={(v) => [v, 'Visitas']} />
            <Bar dataKey="total" fill="#0d9488" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const PrioridadesCard = (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
      <h2 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-500" />
        Escolas Prioritárias — Mais Tempo sem Visita Técnica
      </h2>
      <p className="text-xs text-slate-400 mb-4">
        Ao planejar uma visita, o sistema sugere escolas próximas também atrasadas para otimizar a viagem.
      </p>
      {loading ? (
        <div className="flex justify-center items-center py-10">
          <Loader2 size={24} className="animate-spin text-teal-500" />
        </div>
      ) : escolasSemVisita.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Nenhuma escola cadastrada</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {escolasSemVisita.slice(0, 8).map(e => (
            <div key={e.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{e.name}</p>
                <p className={`text-xs ${isOverdue(e.dias) ? 'text-red-500' : 'text-slate-400'}`}>
                  {e.dias === null ? 'Nunca visitada' : `${e.dias} dia(s) sem visita`}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <button
                  onClick={() => abrirHistorico(e.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <History size={14} />
                  <span className="hidden sm:inline">Histórico</span>
                </button>
                <button
                  onClick={() => setRecommendFor(e)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-teal-700 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
                >
                  <Route size={14} />
                  <span className="hidden sm:inline">Planejar</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <School className="text-teal-600" size={28} />
            Visitas às Unidades Escolares
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Registro e acompanhamento de visitas às escolas da supervisão
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={fetchVisitas}
            className="flex items-center gap-2 px-3 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm"
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
          {isAdmin && (
            <>
              <a
                href={SHEET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-medium"
              >
                <ExternalLink size={16} />
                Planilha do Sistema
              </a>
              {LEGADO_CSV_URL && (
                <a
                  href={LEGADO_CSV_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-amber-700 border border-amber-200 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors text-sm font-medium"
                >
                  <ExternalLink size={16} />
                  Planilha Legada
                </a>
              )}
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
              >
                <Plus size={18} />
                Nova Visita
              </button>
            </>
          )}
        </div>
      </div>

      {/* Acesso restrito para quem não é admin regional */}
      {!isAdmin ? (
        <>
          {MetricGrid}
          {Charts}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-center text-slate-400 text-sm">
            <School size={36} className="mx-auto mb-2 opacity-30" />
            Apenas administradores regionais podem visualizar os registros e o histórico detalhado de visitas.
          </div>
        </>
      ) : (
        <>
          {/* Navegação de visões */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-fit">
            {([
              { key: 'registros', label: 'Registros', icon: ListChecks },
              { key: 'historico', label: 'Histórico por Escola', icon: History },
              { key: 'indicadores', label: 'Indicadores', icon: BarChart3 },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon size={15} />
                <span>{label}</span>
                {key === 'historico' && historicoIds.size > 0 && (
                  <span className="text-[10px] font-bold bg-teal-100 text-teal-700 rounded-full px-1.5 py-0.5">
                    {historicoIds.size}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ─── REGISTROS ─── */}
          {viewMode === 'registros' && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
              <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar escola, visitante ou objetivo..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <select
                  value={filterObjetivo}
                  onChange={e => setFilterObjetivo(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                >
                  <option value="">Todos os objetivos</option>
                  {OBJETIVOS_VISITA.map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <input
                  type="month"
                  value={filterMes}
                  onChange={e => setFilterMes(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                {hasFilters && (
                  <button
                    onClick={() => { setSearchTerm(''); setFilterObjetivo(''); setFilterMes(''); }}
                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-red-500 transition-colors"
                  >
                    <X size={14} /> Limpar
                  </button>
                )}
                <span className="text-xs text-slate-400 ml-auto">{filtered.length} registro(s)</span>
              </div>

              <div className="overflow-x-auto">
                {loading ? (
                  <div className="flex justify-center items-center py-16">
                    <Loader2 size={32} className="animate-spin text-teal-500" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <School size={48} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">
                      {hasFilters
                        ? 'Nenhuma visita encontrada com os filtros aplicados'
                        : 'Nenhuma visita registrada ainda'}
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        {['Data', 'Escola', 'Visitante', 'Objetivo', 'Observações', ''].map((h, i) => (
                          <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filtered.map((v, i) => {
                        const escolaCadastro = escolas.find(e =>
                          normalizeEscolaNome(e.name) !== NOME_URE &&
                          escolaNomesCorrespondem(normalizeEscolaNome(e.name), normalizeEscolaNome(v.escola_nome)),
                        );
                        return (
                          <tr key={v.id || i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDate(v.data_visita)}</td>
                            <td className="px-4 py-3 font-medium text-slate-800">{v.escola_nome}</td>
                            <td className="px-4 py-3 text-slate-600">{v.visitante}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700">
                                {v.objetivo}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{v.observacoes || '-'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              {escolaCadastro && (
                                <button
                                  onClick={() => abrirHistorico(escolaCadastro.id)}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700"
                                  title="Ver histórico desta escola"
                                >
                                  <History size={14} /> Histórico
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ─── HISTÓRICO POR ESCOLA ─── */}
          {viewMode === 'historico' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h2 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
                  <History size={16} className="text-teal-600" />
                  Histórico de Visitas por Escola
                </h2>
                <p className="text-xs text-slate-400 mb-3">
                  Selecione uma ou mais escolas para ver toda a linha do tempo de visitas — do sistema e da planilha legada.
                </p>

                {/* Seletor de escolas */}
                <div className="relative" ref={pickerRef}>
                  <button
                    onClick={() => setEscolaPickerOpen(o => !o)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-slate-500">
                      {historicoIds.size === 0
                        ? 'Selecionar escolas...'
                        : `${historicoIds.size} escola(s) selecionada(s)`}
                    </span>
                    <ChevronDown size={16} className={`text-slate-400 transition-transform ${escolaPickerOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {escolaPickerOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-80 overflow-hidden flex flex-col">
                      <div className="p-2 border-b border-slate-100">
                        <div className="relative">
                          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            autoFocus
                            type="text"
                            placeholder="Filtrar por nome ou código FDE..."
                            value={escolaPickerBusca}
                            onChange={e => setEscolaPickerBusca(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                      </div>
                      <div className="overflow-y-auto">
                        {escolasFiltradasPicker.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-6">Nenhuma escola encontrada</p>
                        ) : (
                          escolasFiltradasPicker.map(e => {
                            const checked = historicoIds.has(e.id);
                            return (
                              <button
                                key={e.id}
                                onClick={() => toggleHistorico(e.id)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors"
                              >
                                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                  checked ? 'bg-teal-600 border-teal-600' : 'border-slate-300'
                                }`}>
                                  {checked && <Check size={12} className="text-white" />}
                                </span>
                                <span className="truncate text-slate-700">{e.name}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Chips das escolas selecionadas */}
                {historicoIds.size > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {historico.map(h => (
                      <span key={h.escola.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-100">
                        {h.escola.name}
                        <button onClick={() => toggleHistorico(h.escola.id)} className="hover:text-red-500">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={() => setHistoricoIds(new Set())}
                      className="text-xs text-slate-400 hover:text-red-500 transition-colors ml-1"
                    >
                      Limpar tudo
                    </button>
                  </div>
                )}
              </div>

              {/* Painéis de histórico */}
              {loading ? (
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm flex justify-center py-16">
                  <Loader2 size={32} className="animate-spin text-teal-500" />
                </div>
              ) : historicoIds.size === 0 ? (
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm text-center py-16 text-slate-400">
                  <History size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Escolha uma escola acima para começar</p>
                </div>
              ) : (
                historico.map(h => (
                  <div key={h.escola.id} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <h3 className="text-base font-bold text-slate-800">{h.escola.name}</h3>
                          {h.escola.fde_code && (
                            <p className="text-xs text-slate-400 mt-0.5">Código FDE: {h.escola.fde_code}</p>
                          )}
                        </div>
                        <button
                          onClick={() => openVisitaForm(h.escola.id)}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
                        >
                          <Plus size={14} /> Nova Visita
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-50 text-slate-600">
                          <BarChart3 size={13} /> {h.total} visita(s)
                        </span>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                          isOverdue(h.dias) ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                        }`}>
                          <Clock size={13} />
                          {h.dias === null ? 'Nunca visitada' : `Última há ${h.dias} dia(s) — ${formatDate(h.ultima!)}`}
                        </span>
                        {h.porObjetivo.slice(0, 3).map(([obj, n]) => (
                          <span key={obj} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-teal-50 text-teal-700">
                            {obj}: {n}
                          </span>
                        ))}
                      </div>

                      {/* Distribuição por ano */}
                      {h.porAno.length > 0 && (
                        <div className="flex items-end gap-2 mt-4 h-16">
                          {h.porAno.map(([ano, n]) => {
                            const max = Math.max(...h.porAno.map(([, v]) => v));
                            return (
                              <div key={ano} className="flex flex-col items-center gap-1 flex-1 max-w-[52px]">
                                <span className="text-[10px] font-semibold text-slate-500">{n}</span>
                                <div
                                  className="w-full bg-teal-500 rounded-t"
                                  style={{ height: `${Math.max(6, (n / max) * 40)}px` }}
                                />
                                <span className="text-[10px] text-slate-400">{ano}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Linha do tempo */}
                    {h.visitas.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-10">
                        Nenhuma visita registrada para esta escola
                      </p>
                    ) : (
                      <ol className="divide-y divide-slate-50">
                        {h.visitas.map((v, i) => (
                          <li key={v.id || i} className="flex gap-3 px-4 py-3">
                            <div className="flex flex-col items-center pt-0.5">
                              <div className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                              {i < h.visitas.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                            </div>
                            <div className="min-w-0 pb-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-slate-800">{formatDate(v.data_visita)}</span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-50 text-teal-700">
                                  {v.objetivo || 'Sem objetivo'}
                                </span>
                                {v.visitante === VISITANTE_LEGADO && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700">
                                    planilha legada
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {v.visitante !== VISITANTE_LEGADO ? v.visitante : 'Visitante não identificado'}
                              </p>
                              {v.observacoes && (
                                <p className="text-xs text-slate-600 mt-1 bg-slate-50 rounded-lg px-2.5 py-1.5">
                                  {v.observacoes}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ─── INDICADORES ─── */}
          {viewMode === 'indicadores' && (
            <div className="space-y-6">
              {MetricGrid}
              {PrioridadesCard}
              {Charts}
            </div>
          )}
        </>
      )}

      {/* Form Modal */}
      {isAdmin && showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <School size={20} className="text-teal-600" />
                Registrar Nova Visita
              </h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Unidade Escolar <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.escola_id}
                  onChange={e => handleEscolaChange(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                >
                  <option value="">Selecione a escola...</option>
                  {escolas.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Data da Visita <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.data_visita}
                  onChange={e => setFormData(prev => ({ ...prev, data_visita: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Objetivo da Visita <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.objetivo}
                  onChange={e => setFormData(prev => ({ ...prev, objetivo: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                >
                  <option value="">Selecione o objetivo...</option>
                  {OBJETIVOS_VISITA.map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Observações
                </label>
                <textarea
                  rows={3}
                  value={formData.observacoes}
                  onChange={e => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
                  placeholder="Observações sobre a visita (opcional)..."
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>

              <div className="bg-slate-50 rounded-lg px-3 py-2.5 flex items-center gap-2">
                <Users size={15} className="text-slate-400 shrink-0" />
                <div>
                  <p className="text-xs text-slate-400">Visitante (usuário logado)</p>
                  <p className="text-sm font-medium text-slate-700">{visitante || '...'}</p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <><Loader2 size={16} className="animate-spin" /> Salvando...</>
                  ) : (
                    'Registrar Visita'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de recomendação de roteiro */}
      {isAdmin && recommendFor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Route size={20} className="text-teal-600" />
                Recomendação de Roteiro
              </h2>
              <button onClick={() => setRecommendFor(null)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Escola selecionada</p>
                <div className="flex items-center justify-between gap-3 bg-teal-50 border border-teal-100 rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{recommendFor.name}</p>
                    <p className="text-xs text-red-500">
                      {recommendFor.dias === null ? 'Nunca visitada' : `${recommendFor.dias} dia(s) sem visita`}
                    </p>
                  </div>
                  <button
                    onClick={() => openVisitaForm(recommendFor.id)}
                    className="shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
                  >
                    Registrar Visita
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Navigation size={13} />
                  Escolas próximas também atrasadas
                </p>

                {!recommendFor.latitude || !recommendFor.longitude ? (
                  <p className="text-sm text-slate-400 bg-slate-50 rounded-xl px-4 py-3">
                    Esta escola não possui latitude/longitude cadastrada, então não é possível calcular a distância
                    até outras unidades. Cadastre a localização em Unidades Escolares para habilitar a recomendação.
                  </p>
                ) : recomendacoesRota.length === 0 ? (
                  <p className="text-sm text-slate-400 bg-slate-50 rounded-xl px-4 py-3">
                    Nenhuma escola próxima com localização cadastrada e também atrasada foi encontrada.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recomendacoesRota.map(r => (
                      <div key={r.id} className="flex items-center justify-between gap-3 border border-slate-100 rounded-xl px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{r.name}</p>
                          <p className="text-xs text-slate-400">
                            {r.distanciaKm < 1 ? `${Math.round(r.distanciaKm * 1000)} m` : `${r.distanciaKm.toFixed(1)} km`} de distância
                            {' · '}
                            <span className="text-red-500">
                              {r.dias === null ? 'nunca visitada' : `${r.dias} dia(s) sem visita`}
                            </span>
                          </p>
                        </div>
                        <button
                          onClick={() => openVisitaForm(r.id)}
                          className="shrink-0 px-3 py-1.5 text-xs font-medium text-teal-700 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
                        >
                          Registrar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => setRecommendFor(null)}
                className="w-full px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
