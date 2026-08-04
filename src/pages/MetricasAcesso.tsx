import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { pageLabel } from '../lib/pageLabels';
import {
  BarChart3, Loader2, LogIn, Users, Clock, Eye, RefreshCw, Info, History, Timer,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface AccessLog {
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
  const [lastAccess, setLastAccess] = useState<LastAccessRow[]>([]);
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
        .select('user_id, event_type, page, created_at, session_id')
        .order('created_at', { ascending: false });
      if (periodo !== 'all') {
        const since = new Date();
        since.setDate(since.getDate() - Number(periodo));
        logsQuery = logsQuery.gte('created_at', since.toISOString());
      }
      const [{ data: logsData, error: logsError }, { data: profilesData }, { data: lastAccessData }] = await Promise.all([
        logsQuery,
        (supabase as any).from('profiles').select('id, full_name, role'),
        (supabase as any).rpc('get_user_last_access'),
      ]);
      if (logsError) throw logsError;
      setLogs((logsData || []) as AccessLog[]);
      setProfiles((profilesData || []) as ProfileLite[]);
      setLastAccess((lastAccessData || []) as LastAccessRow[]);
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

  // Tempo de uso não vem de um cronômetro real: cada sessão (session_id, uma
  // aba/janela) dura do primeiro ao último evento registrado dela — login,
  // navegação de página ou o "ainda aqui" que o app manda a cada ~5 min. É uma
  // estimativa por isso, com granularidade de ~5 min.
  const sessoes = useMemo(() => {
    const bySession = new Map<string, { userId: string; start: string; end: string }>();
    logs.forEach(l => {
      if (!l.session_id) return;
      const existing = bySession.get(l.session_id);
      if (!existing) {
        bySession.set(l.session_id, { userId: l.user_id, start: l.created_at, end: l.created_at });
      } else {
        if (l.created_at < existing.start) existing.start = l.created_at;
        if (l.created_at > existing.end) existing.end = l.created_at;
      }
    });
    return Array.from(bySession.entries()).map(([sessionId, v]) => ({
      sessionId,
      userId: v.userId,
      duracaoMin: Math.max(0, (new Date(v.end).getTime() - new Date(v.start).getTime()) / 60000),
    }));
  }, [logs]);

  const tempoMedioSessaoMin = useMemo(() => {
    if (sessoes.length === 0) return null;
    return sessoes.reduce((s, x) => s + x.duracaoMin, 0) / sessoes.length;
  }, [sessoes]);

  const formatDuracao = (min: number | null) => {
    if (min === null) return '-';
    if (min < 1) return '< 1 min';
    if (min < 60) return `${Math.round(min)} min`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  };

  const topTempoUsuarios = useMemo(() => {
    const totals = new Map<string, number>();
    sessoes.forEach(s => {
      totals.set(s.userId, (totals.get(s.userId) || 0) + s.duracaoMin);
    });
    return Array.from(totals.entries())
      .map(([userId, totalMin]) => ({
        userId,
        totalMin,
        nome: profileMap.get(userId)?.full_name || 'Usuário removido',
        role: profileMap.get(userId)?.role || '',
      }))
      .sort((a, b) => b.totalMin - a.totalMin)
      .slice(0, 10);
  }, [sessoes, profileMap]);

  const maxTempoUsuarioTotal = topTempoUsuarios[0]?.totalMin || 1;

  const ultimoAcessoLista = useMemo(() => {
    return lastAccess
      .map(a => ({
        ...a,
        nome: profileMap.get(a.user_id)?.full_name || a.email || 'Usuário removido',
        role: profileMap.get(a.user_id)?.role || '',
      }))
      .sort((a, b) => {
        if (!a.last_sign_in_at) return 1;
        if (!b.last_sign_in_at) return -1;
        return b.last_sign_in_at.localeCompare(a.last_sign_in_at);
      })
      .slice(0, 20);
  }, [lastAccess, profileMap]);

  const formatDateTime = (d: string | null) => {
    if (!d) return 'Nunca acessou';
    try { return new Date(d).toLocaleString('pt-BR'); } catch { return d; }
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
        Os dados abaixo contam apenas o acesso registrado a partir da ativação deste rastreamento — não há histórico anterior. Tempo de sessão é uma estimativa (checagem a cada ~5 min), não um cronômetro exato.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total de Logins', value: totalLogins, icon: <LogIn size={20} className="text-teal-600" />, bg: 'bg-teal-50' },
          { label: 'Usuários Únicos', value: uniqueUsers, icon: <Users size={20} className="text-blue-600" />, bg: 'bg-blue-50' },
          { label: 'Navegações entre Páginas', value: totalPageViews, icon: <Eye size={20} className="text-violet-600" />, bg: 'bg-violet-50' },
          { label: 'Horário de Pico', value: picoHorario ? picoHorario.hora : '-', icon: <Clock size={20} className="text-amber-600" />, bg: 'bg-amber-50' },
          { label: 'Tempo Médio de Sessão', value: formatDuracao(tempoMedioSessaoMin), icon: <Timer size={20} className="text-pink-600" />, bg: 'bg-pink-50' },
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Usuários com Mais Tempo de Uso</h2>
          {loading ? (
            <div className="flex items-center justify-center h-[200px] text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
          ) : topTempoUsuarios.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">Nenhuma sessão registrada no período</div>
          ) : (
            <ul className="space-y-3">
              {topTempoUsuarios.map((u, i) => (
                <li key={u.userId} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-bold text-slate-400 text-right shrink-0">{i + 1}º</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800 truncate">{u.nome}</p>
                      <span className="text-xs font-semibold text-slate-500 shrink-0">{formatDuracao(u.totalMin)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-pink-500 rounded-full" style={{ width: `${(u.totalMin / maxTempoUsuarioTotal) * 100}%` }} />
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

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
          <History size={15} /> Último Acesso Conhecido por Usuário
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Vem do próprio Supabase Auth (existia antes deste painel) — é só o timestamp do login mais recente de cada pessoa, não um histórico.
        </p>
        {loading ? (
          <div className="flex items-center justify-center h-[160px] text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
        ) : ultimoAcessoLista.length === 0 ? (
          <div className="flex items-center justify-center h-[160px] text-slate-400 text-sm">Nenhum usuário encontrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  {['Usuário', 'Perfil', 'Último Acesso'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ultimoAcessoLista.map(a => (
                  <tr key={a.user_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{a.nome}</td>
                    <td className="px-4 py-2.5 text-slate-500">{ROLE_LABELS[a.role] || a.role || '-'}</td>
                    <td className={`px-4 py-2.5 whitespace-nowrap ${a.last_sign_in_at ? 'text-slate-600' : 'text-slate-300 italic'}`}>{formatDateTime(a.last_sign_in_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
