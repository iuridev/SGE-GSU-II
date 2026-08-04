import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { pageLabel } from '../lib/pageLabels';
import {
  BarChart3, Loader2, LogIn, Users, Clock, Eye, RefreshCw, Info,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface AccessLog {
  user_id: string;
  event_type: 'login' | 'page_view';
  page: string | null;
  created_at: string;
}

interface ProfileLite {
  id: string;
  full_name: string;
  role: string;
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

export default function MetricasAcesso() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('30');

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let logsQuery = (supabase as any)
        .from('access_logs')
        .select('user_id, event_type, page, created_at')
        .order('created_at', { ascending: false });
      if (periodo !== 'all') {
        const since = new Date();
        since.setDate(since.getDate() - Number(periodo));
        logsQuery = logsQuery.gte('created_at', since.toISOString());
      }
      const [{ data: logsData, error: logsError }, { data: profilesData }] = await Promise.all([
        logsQuery,
        (supabase as any).from('profiles').select('id, full_name, role'),
      ]);
      if (logsError) throw logsError;
      setLogs((logsData || []) as AccessLog[]);
      setProfiles((profilesData || []) as ProfileLite[]);
    } catch (e) {
      console.error('Erro ao carregar métricas de acesso:', e);
    } finally {
      setLoading(false);
    }
  };

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  const totalLogins = useMemo(() => logs.filter(l => l.event_type === 'login').length, [logs]);
  const totalPageViews = useMemo(() => logs.filter(l => l.event_type === 'page_view').length, [logs]);
  const uniqueUsers = useMemo(() => new Set(logs.map(l => l.user_id)).size, [logs]);

  const loginsByHour = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, h) => ({ hora: `${String(h).padStart(2, '0')}h`, total: 0 }));
    logs.forEach(l => {
      if (l.event_type !== 'login') return;
      hours[new Date(l.created_at).getHours()].total += 1;
    });
    return hours;
  }, [logs]);

  const picoHorario = useMemo(() => {
    if (!loginsByHour.some(h => h.total > 0)) return null;
    return loginsByHour.reduce((max, h) => (h.total > max.total ? h : max), loginsByHour[0]);
  }, [loginsByHour]);

  const topUsuarios = useMemo(() => {
    const counts = new Map<string, number>();
    logs.forEach(l => {
      if (l.event_type !== 'login') return;
      counts.set(l.user_id, (counts.get(l.user_id) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([userId, total]) => ({
        userId,
        total,
        nome: profileMap.get(userId)?.full_name || 'Usuário removido',
        role: profileMap.get(userId)?.role || '',
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [logs, profileMap]);

  const maxUsuarioTotal = topUsuarios[0]?.total || 1;

  const topPaginas = useMemo(() => {
    const counts = new Map<string, number>();
    logs.forEach(l => {
      if (l.event_type !== 'page_view' || !l.page) return;
      counts.set(l.page, (counts.get(l.page) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([page, total]) => ({ page, total, label: pageLabel(page) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [logs]);

  const maxPaginaTotal = topPaginas[0]?.total || 1;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="text-teal-600" size={28} />
            Métricas de Acesso
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Logins, horários de pico, usuários e páginas mais acessadas no SGE
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
            className="flex items-center gap-2 px-3 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm"
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-xs rounded-lg px-3 py-2.5">
        <Info size={14} className="shrink-0 mt-0.5" />
        Os dados abaixo contam apenas o acesso registrado a partir da ativação deste rastreamento — não há histórico anterior.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total de Logins', value: totalLogins, icon: <LogIn size={20} className="text-teal-600" />, bg: 'bg-teal-50' },
          { label: 'Usuários Únicos', value: uniqueUsers, icon: <Users size={20} className="text-blue-600" />, bg: 'bg-blue-50' },
          { label: 'Navegações entre Páginas', value: totalPageViews, icon: <Eye size={20} className="text-violet-600" />, bg: 'bg-violet-50' },
          { label: 'Horário de Pico', value: picoHorario ? picoHorario.hora : '-', icon: <Clock size={20} className="text-amber-600" />, bg: 'bg-amber-50' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>{card.icon}</div>
              <div>
                <p className="text-xs text-slate-500 font-medium">{card.label}</p>
                <p className="text-2xl font-bold text-slate-800">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Logins por Horário do Dia</h2>
        {loading ? (
          <div className="flex items-center justify-center h-[220px] text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
        ) : totalLogins === 0 ? (
          <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm">Nenhum login registrado no período</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={loginsByHour} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="hora" tick={{ fontSize: 10 }} interval={1} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(v) => [v, 'Logins']} />
              <Bar dataKey="total" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Usuários que Mais Acessam</h2>
          {loading ? (
            <div className="flex items-center justify-center h-[200px] text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
          ) : topUsuarios.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">Nenhum login registrado no período</div>
          ) : (
            <ul className="space-y-3">
              {topUsuarios.map((u, i) => (
                <li key={u.userId} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-bold text-slate-400 text-right shrink-0">{i + 1}º</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800 truncate">{u.nome}</p>
                      <span className="text-xs font-semibold text-slate-500 shrink-0">{u.total} login{u.total !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(u.total / maxUsuarioTotal) * 100}%` }} />
                      </div>
                      {u.role && <span className="text-[10px] text-slate-400 shrink-0">{ROLE_LABELS[u.role] || u.role}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Páginas Mais Acessadas</h2>
          {loading ? (
            <div className="flex items-center justify-center h-[200px] text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
          ) : topPaginas.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">Nenhuma navegação registrada no período</div>
          ) : (
            <ul className="space-y-3">
              {topPaginas.map((p, i) => (
                <li key={p.page} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-bold text-slate-400 text-right shrink-0">{i + 1}º</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.label}</p>
                      <span className="text-xs font-semibold text-slate-500 shrink-0">{p.total}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(p.total / maxPaginaTotal) * 100}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
