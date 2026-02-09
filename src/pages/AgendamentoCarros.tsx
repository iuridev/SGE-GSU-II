import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Car, ShieldCheck, FileSpreadsheet, ClipboardList, 
  Loader2, Send, ArrowRight, SearchCheck, BarChart3, 
  Users, Calendar, Award, Info, 
  FileDown, ChevronLeft, ChevronRight, CalendarDays
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

export function AgendamentoCarros() {
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [schedules, setSchedules] = useState<CarSchedule[]>([]);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'none' | 'error', msg?: string }>({ type: 'idle' });
  const [activeTab, setActiveTab] = useState<'painel' | 'planilha' | 'formulario'>('painel');

  // Estado para a data seleccionada no visualizador
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

  // --- CÁLCULOS ANALÍTICOS E FILTROS ---

  const selectedDateStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(selectedDate);
  }, [selectedDate]);

  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }, []);

  const displayDateLabel = useMemo(() => {
    if (selectedDateStr === todayStr) return "Hoje";
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    if (selectedDateStr === yesterdayStr) return "Ontem";
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    if (selectedDateStr === tomorrowStr) return "Amanhã";

    return `${selectedDate.getDate()} de ${MONTHS[selectedDate.getMonth()]}`;
  }, [selectedDate, selectedDateStr, todayStr]);

  const dateBookings = useMemo(() => {
    return schedules.filter(s => s.service_date === selectedDateStr);
  }, [schedules, selectedDateStr]);

  const topDrivers = useMemo(() => {
    const counts: Record<string, number> = {};
    schedules
      .filter(s => s.status?.toUpperCase().includes('APROVADO') || s.status?.toUpperCase() === 'OK')
      .forEach(s => {
        counts[s.requester_name] = (counts[s.requester_name] || 0) + 1;
      });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
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
        const monthIndex = months.findIndex(m => m.key === monthKey);
        if (monthIndex !== -1) {
          months[monthIndex].count++;
        }
      });

    return months;
  }, [schedules]);

  const currentMonthSchedules = useMemo(() => {
    const monthKey = selectedDateStr.substring(0, 7);
    return schedules.filter(s => s.service_date.startsWith(monthKey));
  }, [schedules, selectedDateStr]);

  // --- NAVEGAÇÃO ---

  const handlePrevDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const handleNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const handleGoToToday = () => {
    setSelectedDate(new Date());
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const loadScript = (src: string) => {
        return new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
          const script = document.createElement('script');
          script.src = src;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      };

      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');

      const element = document.getElementById('car-report-template');
      if (!element) throw new Error("Template de relatório não encontrado.");

      element.style.display = 'block';

      const opt = {
        margin: [10, 10, 10, 10],
        filename: `Relatorio_Frota_${MONTHS[selectedDate.getMonth()].toUpperCase()}_${selectedDate.getFullYear()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          letterRendering: true,
          width: 1120 
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      };

      await (window as any).html2pdf().set(opt).from(element).save();
      element.style.display = 'none';
      setExporting(false);

    } catch (err) {
      console.error(err);
      alert("Erro ao gerar o PDF.");
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

  return (
    <div className="space-y-8 pb-20 relative">
      
      {/* --- TEMPLATE PARA PDF (OCULTO) --- */}
      <div id="car-report-template" style={{ display: 'none', background: 'white', width: '1080px', padding: '40px' }}>
          <div style={{ borderBottom: '6px solid #1e293b', paddingBottom: '20px', marginBottom: '30px' }}>
              <table style={{ width: '100%' }}>
                  <tbody>
                    <tr>
                        <td style={{ border: 'none' }}>
                            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900, color: '#0f172a' }}>RELATÓRIO ESTRATÉGICO: GESTÃO DE FROTA</h1>
                            <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px' }}>CONSOLIDADO DE USO MENSAL E CONDUTORES</p>
                        </td>
                        <td style={{ border: 'none', textAlign: 'right' }}>
                            <p style={{ margin: 0, fontWeight: 900, fontSize: '14px', color: '#1e293b' }}>{MONTHS[selectedDate.getMonth()].toUpperCase()} / {selectedDate.getFullYear()}</p>
                            <p style={{ margin: 0, fontSize: '9px', color: '#94a3b8', fontWeight: 800 }}>SGE-GSU INTELLIGENCE II</p>
                        </td>
                    </tr>
                  </tbody>
              </table>
          </div>

          <div style={{ marginBottom: '40px' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '10px' }}>
                <tbody>
                  <tr>
                      <td style={{ width: '50%', background: '#f8fafc', padding: '25px', borderRadius: '20px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                          <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Total de Viagens (Mês)</p>
                          <h3 style={{ margin: '8px 0 0', fontSize: '32px', fontWeight: 900, color: '#0f172a' }}>{currentMonthSchedules.length}</h3>
                          <p style={{ margin: '2px 0 0', fontSize: '9px', fontWeight: 700, color: '#94a3b8' }}>Solicitações processadas</p>
                      </td>
                      <td style={{ width: '50%', background: '#eff6ff', padding: '25px', borderRadius: '20px', border: '1px solid #bfdbfe', textAlign: 'center' }}>
                          <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, color: '#1e40af', textTransform: 'uppercase' }}>Condutor Principal</p>
                          <h3 style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: 900, color: '#1e3a8a' }}>{topDrivers[0]?.name || 'N/A'}</h3>
                          <p style={{ margin: '2px 0 0', fontSize: '9px', fontWeight: 700, color: '#60a5fa' }}>Maior recorrência no período</p>
                      </td>
                </tr>
                </tbody>
            </table>
          </div>

          <div style={{ display: 'table', width: '100%', tableLayout: 'fixed' }}>
            <div style={{ display: 'table-cell', width: '65%', paddingRight: '20px', verticalAlign: 'top' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', marginBottom: '15px' }}>Detalhamento Mensal de Saídas</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                            <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'left' }}>DATA</th>
                            <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'left' }}>SOLICITANTE</th>
                            <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'center' }}>STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {currentMonthSchedules.slice(0, 20).map(row => (
                            <tr key={row.id}>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 700 }}>{row.service_date.split('-').reverse().join('/')}</td>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>{row.requester_name}</td>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '8px', textAlign: 'center', fontWeight: 900, color: row.status.includes('APROVADO') ? '#059669' : '#d97706' }}>{row.status.toUpperCase()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {currentMonthSchedules.length > 20 && <p style={{ fontSize: '9px', color: '#94a3b8', marginTop: '10px' }}>* Mostrando as primeiras 20 de {currentMonthSchedules.length} viagens do período.</p>}
            </div>

            <div style={{ display: 'table-cell', width: '35%', paddingLeft: '20px', verticalAlign: 'top' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', marginBottom: '15px' }}>Top 5 Condutores</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'left' }}>NOME</th>
                            <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'center' }}>QTD.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {topDrivers.map(row => (
                            <tr key={row.name}>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>{row.name}</td>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'center', fontWeight: 800, color: '#4f46e5' }}>{row.count}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ marginTop: '30px', padding: '20px', background: '#f8fafc', borderRadius: '15px', border: '1px dashed #cbd5e1' }}>
                    <p style={{ margin: 0, fontSize: '9px', color: '#64748b', lineHeight: '1.6', fontWeight: 500 }}>
                        Este documento consolida o histórico de uso da frota oficial para fins de prestação de contas e planejamento logístico regional.
                    </p>
                </div>
            </div>
          </div>

          <div style={{ marginTop: '100px', paddingTop: '20px', borderTop: '2px solid #f1f5f9', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', fontWeight: 900, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '4px' }}>SGE-GSU INTELLIGENCE • RELATÓRIO OFICIAL DE FROTA</p>
          </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-slate-900 rounded-[2rem] text-white shadow-2xl shadow-slate-200">
            <Car size={36} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Logística de Veículos</h1>
            <p className="text-slate-500 font-medium mt-1">Inteligência de Frota Regional II</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button 
            onClick={handleExportPDF}
            disabled={exporting || dataLoading}
            className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl hover:bg-black transition-all active:scale-95 disabled:opacity-50 text-xs"
          >
            {exporting ? <Loader2 className="animate-spin" size={18}/> : <FileDown size={18} />}
            {exporting ? 'GERANDO PDF...' : 'RELATÓRIO P/ CHEFIA'}
          </button>

          <div className="flex gap-2 p-2 bg-slate-100 rounded-[1.5rem] border border-slate-200">
            <TabButton active={activeTab === 'painel'} onClick={() => setActiveTab('painel')} icon={<ShieldCheck size={16}/>} label="Painel Inteligente" />
            <TabButton active={activeTab === 'planilha'} onClick={() => setActiveTab('planilha')} icon={<FileSpreadsheet size={16}/>} label="Planilha" />
            <TabButton active={activeTab === 'formulario'} onClick={() => setActiveTab('formulario')} icon={<ClipboardList size={16}/>} label="Solicitar" />
          </div>
        </div>
      </div>

      {activeTab === 'painel' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5">
              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-2xl h-full flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600"></div>
                <div className="w-20 h-20 bg-indigo-50 rounded-[2rem] flex items-center justify-center text-indigo-600 mb-6">
                  <SearchCheck size={40} />
                </div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Notificar SEOM</h2>
                <p className="text-xs text-slate-400 font-bold mt-2 mb-8 max-w-[250px] uppercase tracking-widest">
                  Envio automático da lista de amanhã para preparação de frota.
                </p>

                {status.type === 'idle' ? (
                  <button 
                    onClick={handleAutoCheckAndNotify}
                    disabled={loading}
                    className="group w-full py-6 bg-slate-900 hover:bg-black text-white rounded-[2rem] font-black text-xs uppercase flex items-center justify-center gap-4 shadow-2xl transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" /> : <Send size={20} className="group-hover:translate-x-1 transition-transform" />}
                    VERIFICAR E NOTIFICAR
                  </button>
                ) : (
                  <div className={`w-full p-6 rounded-[2rem] border-2 animate-in zoom-in-95 ${
                    status.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
                    status.type === 'none' ? 'bg-amber-50 border-amber-100 text-amber-800' :
                    'bg-red-50 border-red-100 text-red-800'
                  }`}>
                    <p className="font-black uppercase text-[10px] tracking-widest">{status.msg}</p>
                    <button onClick={() => setStatus({type: 'idle'})} className="mt-3 text-[10px] font-black underline opacity-50 hover:opacity-100">VOLTAR</button>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl h-full text-white relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-white/10 rounded-2xl"><Calendar size={24} className="text-indigo-400"/></div>
                      <div>
                        <h2 className="text-xl font-black uppercase tracking-tight">Saídas: {displayDateLabel}</h2>
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{selectedDate.toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                       <button onClick={handlePrevDay} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white/60 hover:text-white"><ChevronLeft size={20}/></button>
                       <button onClick={handleGoToToday} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg transition-all">Hoje</button>
                       <button onClick={handleNextDay} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white/60 hover:text-white"><ChevronRight size={20}/></button>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {dataLoading ? (
                      <div className="py-20 flex flex-col items-center justify-center gap-3 text-white/40">
                        <Loader2 className="animate-spin" size={32} />
                        <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando...</p>
                      </div>
                    ) : dateBookings.length === 0 ? (
                      <div className="py-20 text-center flex flex-col items-center justify-center opacity-30 gap-4">
                        <CalendarDays size={64}/>
                        <p className="italic text-sm">Sem veículos escalados para este dia.</p>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em]">Navega nas setas acima</p>
                      </div>
                    ) : dateBookings.map(booking => (
                      <div key={booking.id} className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center justify-between group hover:bg-white/10 transition-all animate-in slide-in-from-right-2">
                        <div className="flex items-center gap-4">
                           <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-black">{booking.requester_name.charAt(0)}</div>
                           <div>
                              <p className="font-black uppercase text-xs tracking-tight">{booking.requester_name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-md uppercase ${booking.status?.toUpperCase().includes('APROVADO') ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                                  {booking.status || 'Pendente'}
                                </span>
                              </div>
                           </div>
                        </div>
                        <div className="p-2 bg-white/5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><ArrowRight size={14}/></div>
                      </div>
                    ))}
                  </div>
                </div>
                <Car className="absolute -bottom-10 -right-10 text-white/5 w-64 h-64 -rotate-12" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8">
              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-2xl h-full relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                  <BarChart3 size={120} />
                </div>
                
                <div className="flex items-center gap-3 mb-12">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shadow-inner"><BarChart3 size={24}/></div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Fluxo de Agendamentos</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Desempenho da frota regional nos últimos 12 meses</p>
                  </div>
                </div>

                <div className="h-[320px] w-full">
                  {dataLoading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-300">
                      <Loader2 className="animate-spin" size={40} />
                      <p className="text-[10px] font-black uppercase tracking-widest">Gerando Gráfico...</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#818cf8" stopOpacity={0.8}/>
                            <stop offset="100%" stopColor="#4f46e5" stopOpacity={1}/>
                          </linearGradient>
                          <linearGradient id="activeGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={1}/>
                            <stop offset="100%" stopColor="#312e81" stopOpacity={1}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#94a3b8'}} dy={15} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#cbd5e1'}} />
                        <Tooltip cursor={{fill: '#f8fafc', radius: 8}} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: '900', padding: '12px 16px', textTransform: 'uppercase'}} itemStyle={{ color: '#4f46e5' }} formatter={(value: any) => [`${value} Saídas`, 'Total']}/>
                        <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={28} animationDuration={1500}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? "url(#activeGradient)" : "url(#barGradient)"} fillOpacity={index === chartData.length - 1 ? 1 : (entry.count === 0 ? 0.1 : 0.4 + (index / 20))} className="transition-all duration-300 hover:opacity-100"/>
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="mt-8 flex items-center gap-6">
                   <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-indigo-600 shadow-sm shadow-indigo-200"></div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mês Atual</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-indigo-200"></div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Histórico</span>
                   </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-4">
              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-2xl h-full flex flex-col">
                <div className="flex items-center gap-3 mb-10">
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><Award size={24}/></div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Ranking</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Condutores frequentes</p>
                  </div>
                </div>

                <div className="space-y-6 flex-1">
                  {dataLoading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-300">
                      <Loader2 className="animate-spin" size={24} />
                      <p className="text-[9px] font-black uppercase tracking-widest text-center">Calculando...</p>
                    </div>
                  ) : topDrivers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 opacity-20">
                      <Users size={48} className="mb-2"/>
                      <p className="text-xs font-bold uppercase">Sem histórico</p>
                    </div>
                  ) : topDrivers.map((driver, idx) => (
                    <div key={driver.name} className="flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-[10px] shadow-sm ${idx === 0 ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-700 uppercase leading-none group-hover:text-indigo-600 transition-colors">{driver.name}</p>
                          <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">{driver.count} saídas confirmadas</p>
                        </div>
                      </div>
                      <div className="h-1.5 w-12 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                        <div className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600" style={{ width: `${(driver.count / topDrivers[0].count) * 100}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-10 p-5 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                   <div className="flex items-start gap-3">
                      <Info size={14} className="text-slate-400 mt-0.5" />
                      <p className="text-[9px] text-slate-500 font-medium leading-relaxed uppercase tracking-tight font-bold">Base de dados sincronizada via Google Sheets.</p>
                   </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <ExternalCard title="Formulário de Pedidos" desc="Abertura de novas solicitações via formulário institucional." link={FORM_URL} icon={<ClipboardList size={32} />} color="blue" />
             <ExternalCard title="Planilha Mestra" desc="Cronograma detalhado e gestão de motoristas." link={SHEET_URL} icon={<FileSpreadsheet size={32} />} color="emerald" />
          </div>
        </div>
      )}

      {(activeTab === 'planilha' || activeTab === 'formulario') && (
        <div className="bg-white p-4 rounded-[3.5rem] border border-slate-100 shadow-2xl h-[750px] overflow-hidden">
          <iframe src={activeTab === 'planilha' ? SHEET_URL : FORM_URL} className="w-full h-full rounded-[2.5rem]" title="Google" />
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={`px-8 py-4 flex items-center gap-3 rounded-[1.2rem] text-[11px] font-black uppercase tracking-widest transition-all ${active ? 'bg-white text-indigo-600 shadow-xl shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}>
      {icon} {label}
    </button>
  );
}

function ExternalCard({ title, desc, link, icon, color }: any) {
  const colorMap: any = { blue: "bg-blue-50 text-blue-600 border-blue-100", emerald: "bg-emerald-50 text-emerald-600 border-emerald-100" };
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" className="group bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl hover:border-indigo-400 transition-all hover:-translate-y-2 flex items-center gap-6">
      <div className={`w-16 h-16 rounded-[1.8rem] flex items-center justify-center shrink-0 shadow-lg ${colorMap[color]}`}>{icon}</div>
      <div className="flex-1">
        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{title}</h3>
        <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">{desc}</p>
      </div>
      <ArrowRight size={20} className="text-slate-200 group-hover:text-indigo-500 transition-colors" />
    </a>
  );
}

export default AgendamentoCarros;