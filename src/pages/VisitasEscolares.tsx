import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import {
  Plus, Search, X, Loader2, School, CalendarDays, Target,
  MapPin, BarChart3, TrendingUp, Users, RefreshCw, ExternalLink,
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

const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

interface EscolaOption {
  id: string;
  name: string;
  fde_code?: string;
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

const FORM_INITIAL = {
  escola_id: '',
  escola_nome: '',
  fde_code: '',
  data_visita: new Date().toISOString().split('T')[0],
  objetivo: '',
  observacoes: '',
};

export default function VisitasEscolares() {
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [escolas, setEscolas] = useState<EscolaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visitante, setVisitante] = useState('');
  const [userRole, setUserRole] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(FORM_INITIAL);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterObjetivo, setFilterObjetivo] = useState('');
  const [filterMes, setFilterMes] = useState('');

  useEffect(() => {
    fetchUser();
    fetchEscolas();
    fetchVisitas();
  }, []);

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
        .select('id, name, fde_code')
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

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const visitasThisMonth = useMemo(
    () => visitas.filter(v => v.data_visita?.startsWith(currentMonthStr)),
    [visitas, currentMonthStr],
  );

  const normalizeEscolaNome = (s: string) =>
    s?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() || '';

  const uniqueEscolas = useMemo(
    () => new Set(visitas.map(v => normalizeEscolaNome(v.escola_nome)).filter(Boolean)).size,
    [visitas],
  );

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
  }, [visitas]);

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

  const formatDate = (d: string) => {
    if (!d) return '-';
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  };

  const hasFilters = searchTerm || filterObjetivo || filterMes;

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
          {userRole === 'regional_admin' && (
            <>
              <a
                href={SHEET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-medium"
              >
                <ExternalLink size={16} />
                Abrir Planilha
              </a>
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

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Total de Visitas',
            value: visitas.length,
            icon: <BarChart3 size={20} className="text-blue-600" />,
            bg: 'bg-blue-50',
          },
          {
            label: 'Visitas no Mês',
            value: visitasThisMonth.length,
            icon: <CalendarDays size={20} className="text-emerald-600" />,
            bg: 'bg-emerald-50',
          },
          {
            label: 'Escolas Visitadas',
            value: uniqueEscolas,
            icon: <MapPin size={20} className="text-violet-600" />,
            bg: 'bg-violet-50',
          },
          {
            label: 'Média / Mês',
            value: avgPerMonth,
            icon: <TrendingUp size={20} className="text-amber-600" />,
            bg: 'bg-amber-50',
          },
        ].map(card => (
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

      {/* Charts */}
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
              <BarChart
                data={chartByObjetivo}
                margin={{ top: 0, right: 10, left: -20, bottom: 70 }}
              >
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

      {/* Filters + Table — somente regional_admin */}
      {userRole !== 'regional_admin' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-center text-slate-400 text-sm">
          <School size={36} className="mx-auto mb-2 opacity-30" />
          Apenas administradores regionais podem visualizar e registrar visitas.
        </div>
      )}
      {userRole === 'regional_admin' && <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
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
                  {['Data', 'Escola', 'Visitante', 'Objetivo', 'Observações'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((v, i) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>}

      {/* Form Modal */}
      {userRole === 'regional_admin' && showForm && (
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
    </div>
  );
}
