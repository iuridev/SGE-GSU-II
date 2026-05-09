import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  Car, ShieldCheck, FileSpreadsheet, ClipboardList,
  Loader2, Send, ArrowRight, SearchCheck, BarChart3,
  Users, Calendar, Award, Info,
  FileDown, ChevronLeft, ChevronRight, CalendarDays, TrendingUp
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';

interface CarSchedule {
  id: string;
  requester_name: string;
  service_date: string;
  status: string;
}

interface MonthlyData {
  key: string;
  label: string;
  count: number;
}

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(' ')
    .slice(0, 3)
    .join(' ');
}

export function AgendamentoCarros() {
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [schedules, setSchedules] = useState<CarSchedule[]>([]);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'none' | 'error', msg?: string }>({ type: 'idle' });
  const [activeTab, setActiveTab] = useState<'painel' | 'planilha' | 'formulario'>('painel');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeBf5H7qaSNSE_6KudfxvN4e0Z53Xgwog5JTt_Fih4HHVwvnA/viewform";
  const SHEET_URL = "https://docs.google.com/spreadsheets/d/1q67248Gbn9IBlNS9D89p_LuG6ttWSZ-TErtUMHF3BE4/edit?gid=1619415650#gid=1619415650";

  useEffect(() => {
    fetchSchedules();
  }, []);

  async function fetchSchedules() {
    setDataLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('car_schedules')
        .select('*')
        .order('service_date', { ascending: false });
      if (error) throw error;
      setSchedules(data || []);
    } catch (err) {
      console.error("Erro ao carregar agendamentos:", err);
    } finally {
      setDataLoading(false);
    }
  }

  const selectedDateStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(selectedDate);
  }, [selectedDate]);

  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }, []);

  const displayDateLabel = useMemo(() => {
    if (selectedDateStr === todayStr) return "Hoje";
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (selectedDateStr === yesterday.toISOString().split('T')[0]) return "Ontem";
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (selectedDateStr === tomorrow.toISOString().split('T')[0]) return "Amanhã";
    return `${selectedDate.getDate()} de ${MONTHS[selectedDate.getMonth()]}`;
  }, [selectedDate, selectedDateStr, todayStr]);

  const dateBookings = useMemo(() => {
    return schedules.filter(s => s.service_date === selectedDateStr);
  }, [schedules, selectedDateStr]);

  const topDrivers = useMemo(() => {
    const counts: Record<string, { count: number; displayName: string }> = {};
    schedules
      .filter(s => s.status?.toUpperCase().includes('APROVADO') || s.status?.toUpperCase() === 'OK')
      .forEach(s => {
        const key = normalizeName(s.requester_name);
        const cleanName = s.requester_name.trim().replace(/\s+/g, ' ');
        if (!counts[key]) {
          counts[key] = { count: 0, displayName: cleanName };
        } else if (cleanName.length > counts[key].displayName.length) {
          counts[key].displayName = cleanName;
        }
        counts[key].count++;
      });

    return Object.entries(counts)
      .map(([, { count, displayName }]) => ({ name: displayName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [schedules]);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const approved = schedules.filter(s => s.status?.toUpperCase().includes('APROVADO') || s.status?.toUpperCase() === 'OK');
    const thisMonth = schedules.filter(s => s.service_date.startsWith(currentMonthKey));
    const uniqueDrivers = new Set(schedules.map(s => normalizeName(s.requester_name))).size;
    return { total: schedules.length, approved: approved.length, thisMonth: thisMonth.length, uniqueDrivers };
  }, [schedules]);

  const chartData = useMemo(() => {
    const months: MonthlyData[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('pt-BR', { month: 'short' }).toUpperCase(),
        count: 0
      });
    }
    schedules
      .filter(s => s.status?.toUpperCase().includes('APROVADO') || s.status?.toUpperCase() === 'OK')
      .forEach(s => {
        const monthKey = s.service_date.substring(0, 7);
        const idx = months.findIndex(m => m.key === monthKey);
        if (idx !== -1) months[idx].count++;
      });
    return months;
  }, [schedules]);

  const currentMonthSchedules = useMemo(() => {
    const monthKey = selectedDateStr.substring(0, 7);
    return schedules.filter(s => s.service_date.startsWith(monthKey));
  }, [schedules, selectedDateStr]);

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(selectedDate.getDate() - 1);
    setSelectedDate(d);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(selectedDate.getDate() + 1);
    setSelectedDate(d);
  };

  const handleGoToToday = () => setSelectedDate(new Date());

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const loadScript = (src: string) => new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
        const s = document.createElement('script');
        s.src = src; s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });

      // html2canvas deve ser carregado antes do html2pdf (o bundle não o expõe globalmente)
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');

      // Captura o gráfico visível na tela como imagem
      const chartEl = document.getElementById('pdf-chart-source');
      if (chartEl) {
        const canvas = await (window as any).html2canvas(chartEl, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
        });
        const chartImg = document.getElementById('pdf-chart-image') as HTMLImageElement | null;
        if (chartImg) chartImg.src = canvas.toDataURL('image/png');
      }

      const element = document.getElementById('car-report-template');
      if (!element) throw new Error("Template de relatório não encontrado.");
      element.style.display = 'block';

      const opt = {
        margin: 0,
        filename: `Relatorio_Frota_${MONTHS[selectedDate.getMonth()].toUpperCase()}_${selectedDate.getFullYear()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, width: 1440 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['css', 'legacy'] }
      };

      await (window as any).html2pdf().set(opt).from(element).save();
      element.style.display = 'none';
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar o PDF.");
    } finally {
      setExporting(false);
    }
  };

  const handleAutoCheckAndNotify = async () => {
    setLoading(true);
    setStatus({ type: 'idle' });
    try {
      const { data, error } = await supabase.functions.invoke('send-outage-email', {
        body: { type: 'CAR_SCHEDULE_AUTO' }
      });
      if (error) throw error;
      if (data?.message?.includes('Nenhum')) {
        setStatus({ type: 'none', msg: data.message });
      } else {
        setStatus({ type: 'success', msg: "Equipa SEOM notificada com a lista de amanhã!" });
      }
      fetchSchedules();
    } catch (err: any) {
      setStatus({ type: 'error', msg: "Falha técnica: " + err.message });
    } finally {
      setLoading(false);
    }
  };

  const rankBadgeStyle = [
    'bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/40',
    'bg-gradient-to-br from-slate-300 to-slate-500 shadow-lg shadow-slate-400/30',
    'bg-gradient-to-br from-amber-700 to-orange-800 shadow-lg shadow-orange-800/30',
    'bg-white/20',
    'bg-white/10',
  ];
  const rankBarStyle = [
    'from-amber-400 to-orange-500',
    'from-slate-300 to-slate-400',
    'from-amber-700 to-orange-700',
    'from-indigo-400 to-indigo-600',
    'from-indigo-300 to-indigo-500',
  ];
  const rankCardStyle = [
    'bg-amber-400/10 border-amber-400/20 hover:bg-amber-400/15',
    'bg-white/5 border-white/10 hover:bg-white/8',
    'bg-white/5 border-white/10 hover:bg-white/8',
    'bg-white/5 border-white/10 hover:bg-white/8',
    'bg-white/5 border-white/10 hover:bg-white/8',
  ];

  return (
    <div className="space-y-6 pb-20 relative">

      {/* PDF Template (hidden) */}
      <div id="car-report-template" style={{ display: 'none', background: '#f1f5f9', width: '1440px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

        {/* Header escuro */}
        <div style={{ background: '#0f172a', padding: '32px 48px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '6px' }}>
                <div style={{ width: '5px', height: '36px', background: '#6366f1', borderRadius: '3px', flexShrink: 0 }}></div>
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.1 }}>RELATÓRIO DE GESTÃO DE FROTA</h1>
              </div>
              <p style={{ margin: '0 0 0 19px', fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '3px' }}>Consolidado de Uso Mensal e Condutores</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ background: '#6366f1', padding: '10px 22px', borderRadius: '10px', display: 'inline-block', marginBottom: '8px' }}>
                <p style={{ margin: 0, fontWeight: 900, fontSize: '18px', color: '#fff', lineHeight: 1 }}>{MONTHS[selectedDate.getMonth()].toUpperCase()}</p>
                <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#c7d2fe', lineHeight: 1 }}>{selectedDate.getFullYear()}</p>
              </div>
              <p style={{ margin: 0, fontSize: '8px', color: '#475569', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px' }}>SGE-GSU INTELLIGENCE II</p>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ padding: '24px 48px 0', display: 'flex', gap: '16px' }}>
          {[
            { label: 'Total de Viagens', value: String(stats.total), sub: 'total geral de registros', accent: '#6366f1' },
            { label: 'Confirmadas', value: String(stats.approved), sub: 'viagens aprovadas', accent: '#10b981' },
            { label: 'Condutor Destaque', value: topDrivers[0]?.name || 'N/A', sub: `${topDrivers[0]?.count || 0} saídas confirmadas`, accent: '#f59e0b', small: true },
            { label: 'Condutores Únicos', value: String(stats.uniqueDrivers), sub: 'pessoas diferentes', accent: '#8b5cf6' },
          ].map(card => (
            <div key={card.label} style={{ flex: 1, background: '#fff', borderRadius: '14px', padding: '20px 22px', borderTop: `4px solid ${card.accent}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <p style={{ margin: 0, fontSize: '9px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>{card.label}</p>
              <p style={{ margin: '6px 0 0', fontSize: card.small ? '14px' : '32px', fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>{card.value}</p>
              <p style={{ margin: '4px 0 0', fontSize: '9px', color: '#94a3b8', fontWeight: 600 }}>{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Gráfico + Top 5 */}
        <div style={{ padding: '20px 48px 0', display: 'flex', gap: '20px' }}>
          <div style={{ flex: 3, background: '#fff', borderRadius: '14px', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <p style={{ margin: '0 0 14px', fontSize: '10px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '1px' }}>Fluxo de Agendamentos — Últimos 12 Meses</p>
            <img id="pdf-chart-image" alt="Gráfico" style={{ width: '100%', height: 'auto', borderRadius: '8px', display: 'block' }} />
          </div>
          <div style={{ flex: 2, background: '#fff', borderRadius: '14px', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <p style={{ margin: '0 0 16px', fontSize: '10px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '1px' }}>Top 5 - Solicitações</p>
            {topDrivers.map((driver, idx) => {
              const badgeColors = ['#f59e0b', '#94a3b8', '#b45309', '#6366f1', '#8b5cf6'];
              return (
                <div key={driver.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: badgeColors[idx] || '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '11px', color: '#fff', flexShrink: 0 }}>{idx + 1}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase' }}>{driver.name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px' }}>
                      <div style={{ flex: 1, height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: '3px', background: badgeColors[idx] || '#6366f1', width: `${(driver.count / topDrivers[0].count) * 100}%` }}></div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 900, color: badgeColors[idx] || '#6366f1', flexShrink: 0, minWidth: '20px', textAlign: 'right' }}>{driver.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tabela de saídas */}
        <div style={{ padding: '20px 48px 40px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ background: '#f8fafc', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '1px' }}>Detalhamento Mensal de Saídas</p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 16px', fontSize: '9px', fontWeight: 900, textAlign: 'left', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #e2e8f0' }}>Data</th>
                  <th style={{ padding: '10px 16px', fontSize: '9px', fontWeight: 900, textAlign: 'left', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #e2e8f0' }}>Solicitante</th>
                  <th style={{ padding: '10px 16px', fontSize: '9px', fontWeight: 900, textAlign: 'center', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {currentMonthSchedules.slice(0, 25).map((row, i) => {
                  const approved = row.status?.toUpperCase().includes('APROVADO') || row.status?.toUpperCase() === 'OK';
                  return (
                    <tr key={row.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ padding: '9px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '10px', fontWeight: 700, color: '#475569' }}>{row.service_date.split('-').reverse().join('/')}</td>
                      <td style={{ padding: '9px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '10px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase' }}>{row.requester_name}</td>
                      <td style={{ padding: '9px 16px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                        <span style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', padding: '3px 10px', borderRadius: '20px', background: approved ? '#dcfce7' : '#fef3c7', color: approved ? '#166534' : '#92400e' }}>
                          {row.status?.toUpperCase() || 'PENDENTE'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {currentMonthSchedules.length > 25 && (
              <p style={{ padding: '10px 20px', margin: 0, fontSize: '9px', color: '#94a3b8', fontStyle: 'italic' }}>* Exibindo as primeiras 25 de {currentMonthSchedules.length} viagens do período.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ background: '#0f172a', padding: '14px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: '8px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', letterSpacing: '3px' }}>SGE-GSU INTELLIGENCE II • RELATÓRIO OFICIAL DE FROTA • DOCUMENTO INTERNO</p>
          <div style={{ background: '#6366f1', padding: '8px 18px', borderRadius: '8px', textAlign: 'center', flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: '8px', fontWeight: 700, color: '#c7d2fe', textTransform: 'uppercase', letterSpacing: '1px' }}>Gerado em</p>
            <p style={{ margin: '2px 0 0', fontSize: '13px', fontWeight: 900, color: '#fff', whiteSpace: 'nowrap', lineHeight: 1 }}>
              {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} • {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-slate-900 rounded-2xl text-white shadow-xl shadow-slate-200">
            <Car size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase leading-none">Logística de Veículos</h1>
            <p className="text-slate-400 font-semibold text-sm mt-0.5">Inteligência de Frota Regional II</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportPDF}
            disabled={exporting || dataLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="animate-spin" size={15}/> : <FileDown size={15}/>}
            {exporting ? 'Gerando...' : 'Exportar PDF'}
          </button>

          <div className="flex gap-1.5 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
            <TabButton active={activeTab === 'painel'} onClick={() => setActiveTab('painel')} icon={<ShieldCheck size={14}/>} label="Painel" />
            <TabButton active={activeTab === 'planilha'} onClick={() => setActiveTab('planilha')} icon={<FileSpreadsheet size={14}/>} label="Planilha" />
            <TabButton active={activeTab === 'formulario'} onClick={() => setActiveTab('formulario')} icon={<ClipboardList size={14}/>} label="Solicitar" />
          </div>
        </div>
      </div>

      {activeTab === 'painel' && (
        <div className="space-y-6 animate-in fade-in duration-500">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<Car size={18}/>} label="Total Registros" value={dataLoading ? '...' : stats.total} accent="slate" />
            <StatCard icon={<ShieldCheck size={18}/>} label="Confirmadas" value={dataLoading ? '...' : stats.approved} accent="emerald" />
            <StatCard icon={<TrendingUp size={18}/>} label="Este Mês" value={dataLoading ? '...' : stats.thisMonth} accent="indigo" />
            <StatCard icon={<Users size={18}/>} label="Condutores Únicos" value={dataLoading ? '...' : stats.uniqueDrivers} accent="amber" />
          </div>

          {/* Notificar + Agendamentos do Dia */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4">
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl h-full flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-t-3xl"></div>
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-5 mt-2">
                  <SearchCheck size={32} />
                </div>
                <h2 className="text-base font-black text-slate-800 uppercase tracking-tight">Notificar SEOM</h2>
                <p className="text-[10px] text-slate-400 font-bold mt-1.5 mb-6 max-w-[220px] uppercase tracking-widest leading-relaxed">
                  Envio automático da lista de amanhã para preparação de frota.
                </p>
                {status.type === 'idle' ? (
                  <button
                    onClick={handleAutoCheckAndNotify}
                    disabled={loading}
                    className="group w-full py-4 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-[11px] uppercase flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95 disabled:opacity-50 tracking-widest"
                  >
                    {loading ? <Loader2 className="animate-spin" size={16}/> : <Send size={16} className="group-hover:translate-x-0.5 transition-transform"/>}
                    Verificar e Notificar
                  </button>
                ) : (
                  <div className={`w-full p-5 rounded-2xl border-2 animate-in zoom-in-95 ${
                    status.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
                    status.type === 'none' ? 'bg-amber-50 border-amber-100 text-amber-800' :
                    'bg-red-50 border-red-100 text-red-800'
                  }`}>
                    <p className="font-black uppercase text-[10px] tracking-widest">{status.msg}</p>
                    <button onClick={() => setStatus({type: 'idle'})} className="mt-2 text-[10px] font-black underline opacity-50 hover:opacity-100">VOLTAR</button>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className="bg-slate-900 p-7 rounded-3xl shadow-2xl h-full text-white relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-white/10 rounded-xl"><Calendar size={20} className="text-indigo-400"/></div>
                      <div>
                        <h2 className="text-lg font-black uppercase tracking-tight">Saídas: {displayDateLabel}</h2>
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{selectedDate.toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={handlePrevDay} className="p-2 bg-white/5 hover:bg-white/15 rounded-xl transition-all text-white/60 hover:text-white"><ChevronLeft size={18}/></button>
                      <button onClick={handleGoToToday} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg transition-all">Hoje</button>
                      <button onClick={handleNextDay} className="p-2 bg-white/5 hover:bg-white/15 rounded-xl transition-all text-white/60 hover:text-white"><ChevronRight size={18}/></button>
                    </div>
                  </div>
                  <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
                    {dataLoading ? (
                      <div className="py-16 flex flex-col items-center justify-center gap-3 text-white/40">
                        <Loader2 className="animate-spin" size={28}/>
                        <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando...</p>
                      </div>
                    ) : dateBookings.length === 0 ? (
                      <div className="py-16 text-center flex flex-col items-center justify-center opacity-25 gap-3">
                        <CalendarDays size={52}/>
                        <p className="italic text-sm">Sem veículos escalados para este dia.</p>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em]">Navegue pelas setas acima</p>
                      </div>
                    ) : dateBookings.map(booking => (
                      <div key={booking.id} className="bg-white/5 border border-white/10 p-3.5 rounded-2xl flex items-center justify-between group hover:bg-white/10 transition-all animate-in slide-in-from-right-2">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-black text-sm">
                            {booking.requester_name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-black uppercase text-xs tracking-tight">{booking.requester_name}</p>
                            <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase mt-1 inline-block ${booking.status?.toUpperCase().includes('APROVADO') ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                              {booking.status || 'Pendente'}
                            </span>
                          </div>
                        </div>
                        <div className="p-1.5 bg-white/5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><ArrowRight size={13}/></div>
                      </div>
                    ))}
                  </div>
                </div>
                <Car className="absolute -bottom-8 -right-8 text-white/5 w-56 h-56 -rotate-12" />
              </div>
            </div>
          </div>

          {/* Gráfico + Ranking */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl h-full relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                  <BarChart3 size={100}/>
                </div>
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><BarChart3 size={20}/></div>
                  <div>
                    <h2 className="text-base font-black text-slate-800 uppercase tracking-tight">Fluxo de Agendamentos</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Desempenho da frota regional nos últimos 12 meses</p>
                  </div>
                </div>
                <div id="pdf-chart-source" className="h-[300px] w-full">
                  {dataLoading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-300">
                      <Loader2 className="animate-spin" size={36}/>
                      <p className="text-[10px] font-black uppercase tracking-widest">Gerando gráfico...</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#818cf8" stopOpacity={0.7}/>
                            <stop offset="100%" stopColor="#4f46e5" stopOpacity={1}/>
                          </linearGradient>
                          <linearGradient id="activeGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={1}/>
                            <stop offset="100%" stopColor="#312e81" stopOpacity={1}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#94a3b8'}} dy={12}/>
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#cbd5e1'}}/>
                        <Tooltip
                          cursor={{fill: '#f8fafc', radius: 8}}
                          contentStyle={{ borderRadius: '14px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: '900', padding: '10px 14px', textTransform: 'uppercase'}}
                          itemStyle={{ color: '#4f46e5' }}
                          formatter={(value: any) => [`${value} Saídas`, 'Total']}
                        />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={26} animationDuration={1500}>
                          {chartData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={index === chartData.length - 1 ? "url(#activeGradient)" : "url(#barGradient)"}
                              fillOpacity={index === chartData.length - 1 ? 1 : (entry.count === 0 ? 0.1 : 0.35 + (index / 22))}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="mt-6 flex items-center gap-5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mês Atual</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-200"></div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Histórico</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Ranking Card — dark themed */}
            <div className="lg:col-span-4">
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-7 rounded-3xl shadow-2xl h-full flex flex-col relative overflow-hidden">
                <Award className="absolute -bottom-8 -right-8 text-white/5 w-44 h-44"/>

                <div className="flex items-center gap-3 mb-6 relative z-10">
                  <div className="p-2.5 bg-amber-400/20 rounded-xl">
                    <Award size={20} className="text-amber-400"/>
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white uppercase tracking-tight">Ranking</h2>
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Número de Solicitações</p>
                  </div>
                </div>

                <div className="space-y-2.5 flex-1 relative z-10">
                  {dataLoading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-white/30">
                      <Loader2 className="animate-spin" size={22}/>
                      <p className="text-[9px] font-black uppercase tracking-widest text-center">Calculando...</p>
                    </div>
                  ) : topDrivers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 opacity-20 text-white">
                      <Users size={40} className="mb-2"/>
                      <p className="text-xs font-bold uppercase">Sem histórico</p>
                    </div>
                  ) : topDrivers.map((driver, idx) => (
                    <div key={driver.name} className={`p-3.5 rounded-2xl border transition-all ${rankCardStyle[idx] ?? 'bg-white/5 border-white/10'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-[11px] text-white shrink-0 ${rankBadgeStyle[idx] ?? 'bg-white/10'}`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black text-white uppercase leading-none truncate">{driver.name}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className={`h-full bg-gradient-to-r ${rankBarStyle[idx] ?? 'from-indigo-400 to-indigo-600'} rounded-full transition-all duration-700`}
                                style={{ width: `${(driver.count / topDrivers[0].count) * 100}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-black text-white/60 shrink-0 tabular-nums">{driver.count}</span>
                          </div>
                          <p className="text-[8px] font-bold text-white/30 mt-0.5 uppercase tracking-tight">saídas confirmadas</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 p-3.5 bg-white/5 rounded-2xl border border-white/10 relative z-10">
                  <div className="flex items-start gap-2">
                    <Info size={11} className="text-white/25 mt-0.5 shrink-0"/>
                    <p className="text-[9px] text-white/25 font-medium leading-relaxed uppercase tracking-tight">Base de dados sincronizada via Google Sheets. Nomes similares são consolidados automaticamente.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Links externos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ExternalCard title="Formulário de Pedidos" desc="Abertura de novas solicitações via formulário institucional." link={FORM_URL} icon={<ClipboardList size={28}/>} color="blue"/>
            <ExternalCard title="Planilha Mestra" desc="Cronograma detalhado e gestão de motoristas." link={SHEET_URL} icon={<FileSpreadsheet size={28}/>} color="emerald"/>
          </div>
        </div>
      )}

      {(activeTab === 'planilha' || activeTab === 'formulario') && (
        <div className="bg-white p-4 rounded-[3.5rem] border border-slate-100 shadow-2xl h-[750px] overflow-hidden">
          <iframe src={activeTab === 'planilha' ? SHEET_URL : FORM_URL} className="w-full h-full rounded-[2.5rem]" title="Google"/>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 flex items-center gap-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
        active ? 'bg-white text-indigo-600 shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function StatCard({ icon, label, value, accent }: { icon: any; label: string; value: number | string; accent: string }) {
  const styles: Record<string, { wrap: string; icon: string; val: string }> = {
    slate:   { wrap: 'border-slate-100',   icon: 'bg-slate-100 text-slate-600',   val: 'text-slate-900' },
    emerald: { wrap: 'border-emerald-100', icon: 'bg-emerald-100 text-emerald-600', val: 'text-emerald-700' },
    indigo:  { wrap: 'border-indigo-100',  icon: 'bg-indigo-100 text-indigo-600',  val: 'text-indigo-700' },
    amber:   { wrap: 'border-amber-100',   icon: 'bg-amber-100 text-amber-600',    val: 'text-amber-700' },
  };
  const s = styles[accent] ?? styles.slate;
  return (
    <div className={`bg-white p-5 rounded-2xl border shadow-sm flex items-center gap-4 ${s.wrap}`}>
      <div className={`p-2.5 rounded-xl shrink-0 ${s.icon}`}>{icon}</div>
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <p className={`text-2xl font-black leading-tight mt-0.5 ${s.val}`}>{value}</p>
      </div>
    </div>
  );
}

function ExternalCard({ title, desc, link, icon, color }: any) {
  const colorMap: any = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100'
  };
  return (
    <a href={link} target="_blank" rel="noopener noreferrer"
      className="group bg-white p-6 rounded-3xl border border-slate-100 shadow-lg hover:border-indigo-300 transition-all hover:-translate-y-1 flex items-center gap-5"
    >
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${colorMap[color]}`}>{icon}</div>
      <div className="flex-1">
        <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">{title}</h3>
        <p className="text-xs text-slate-400 font-medium leading-relaxed mt-0.5">{desc}</p>
      </div>
      <ArrowRight size={18} className="text-slate-200 group-hover:text-indigo-500 transition-colors shrink-0"/>
    </a>
  );
}

export default AgendamentoCarros;
