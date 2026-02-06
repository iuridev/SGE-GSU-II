import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Building2, ShieldCheck, FileSpreadsheet, ClipboardList, 
  Loader2, Send, ArrowRight, SearchCheck, BarChart3,
  Calendar, Award, Info, FileDown, Clock, MapPin,
  Users
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell 
} from 'recharts';

interface RoomSchedule {
  id: string;
  room_name: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  status: string;
  service_name: string; // Corresponde à Coluna K da Planilha
}

interface MonthlyData {
  key: string;
  label: string;
  count: number;
}

export function AgendamentoAmbientes() {
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [schedules, setSchedules] = useState<RoomSchedule[]>([]);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'none' | 'error', msg?: string }>({ type: 'idle' });
  const [activeTab, setActiveTab] = useState<'painel' | 'planilha' | 'formulario'>('painel');

  const FORM_URL = "https://docs.google.com/forms/d/15DLCkBhBcdzeSjcHOayi9P1tp1q36LBLafAjyxIxiGI/viewform";
  const SHEET_URL = "https://docs.google.com/spreadsheets/d/1Uq6IUuVNEnveu__cp2YDEy4AAvl77JHkr5_IP-Bjnwg/edit";

  useEffect(() => {
    fetchSchedules();
  }, []);

  async function fetchSchedules() {
    setDataLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('room_schedules')
        .select('*')
        .order('start_date', { ascending: false });
      
      if (error) throw error;
      setSchedules(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setDataLoading(false);
    }
  }

  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }, []);

  const todayDisplay = useMemo(() => {
    const [y, m, d] = todayStr.split('-');
    return `${d}/${m}/${y}`;
  }, [todayStr]);

  const currentMonthName = new Date().toLocaleString('pt-BR', { month: 'long' }).toUpperCase();

  // Filtro de agendamentos de hoje - Verifica se hoje está dentro do intervalo
  const todayBookings = useMemo(() => {
    return schedules
      .filter(s => {
        return todayStr >= s.start_date && todayStr <= s.end_date;
      })
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [schedules, todayStr]);

  const topRooms = useMemo(() => {
    const counts: Record<string, number> = {};
    schedules
      .filter(s => s.status?.toUpperCase().includes('APROVADO') || s.status?.toUpperCase() === 'SIM')
      .forEach(s => {
        counts[s.room_name] = (counts[s.room_name] || 0) + 1;
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
      .filter(s => s.status?.toUpperCase().includes('APROVADO') || s.status?.toUpperCase() === 'SIM')
      .forEach(s => {
        const monthKey = s.start_date.substring(0, 7);
        const monthIndex = months.findIndex(m => m.key === monthKey);
        if (monthIndex !== -1) months[monthIndex].count++;
      });
    return months;
  }, [schedules]);

  const currentMonthSchedules = useMemo(() => {
    const monthKey = todayStr.substring(0, 7);
    return schedules
      .filter(s => s.start_date.startsWith(monthKey) || s.end_date.startsWith(monthKey))
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [schedules, todayStr]);

  // --- AÇÕES ---

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

      const element = document.getElementById('room-report-template');
      if (!element) throw new Error("Template de relatório não encontrado.");

      element.style.display = 'block';

      const opt = {
        margin: [10, 10, 10, 10],
        filename: `Relatorio_Ambientes_${currentMonthName}_${new Date().getFullYear()}.pdf`,
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
        body: { type: 'ROOM_SCHEDULE_AUTO' }
      });
      if (error) throw error;
      if (data?.message?.includes('Sem ambientes')) setStatus({ type: 'none', msg: data.message });
      else setStatus({ type: 'success', msg: "Equipes SEOM e SEFISC notificadas!" });
    } catch (err: any) {
      setStatus({ type: 'error', msg: "Falha técnica: " + err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-20 relative">
      
      {/* --- TEMPLATE PARA PDF (OCULTO) --- */}
      <div id="room-report-template" style={{ display: 'none', background: 'white', width: '1080px', padding: '40px' }}>
          <div style={{ borderBottom: '6px solid #4f46e5', paddingBottom: '20px', marginBottom: '30px' }}>
              <table style={{ width: '100%' }}>
                  <tbody>
                    <tr>
                        <td style={{ border: 'none' }}>
                            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900, color: '#0f172a' }}>RELATÓRIO ESTRATÉGICO: GESTÃO DE AMBIENTES</h1>
                            <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px' }}>CONSOLIDADO REGIONAL DE OCUPAÇÃO E USO</p>
                        </td>
                        <td style={{ border: 'none', textAlign: 'right' }}>
                            <p style={{ margin: 0, fontWeight: 900, fontSize: '14px', color: '#1e293b' }}>{currentMonthName} / {new Date().getFullYear()}</p>
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
                          <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Total de Reservas (Mês)</p>
                          <h3 style={{ margin: '8px 0 0', fontSize: '32px', fontWeight: 900, color: '#0f172a' }}>{currentMonthSchedules.length}</h3>
                          <p style={{ margin: '2px 0 0', fontSize: '9px', fontWeight: 700, color: '#94a3b8' }}>Eventos registrados no período</p>
                      </td>
                      <td style={{ width: '50%', background: '#eef2ff', padding: '25px', borderRadius: '20px', border: '1px solid #c7d2fe', textAlign: 'center' }}>
                          <p style={{ margin: 0, fontSize: '10px', fontWeight: 900, color: '#4338ca', textTransform: 'uppercase' }}>Espaço de Maior Demanda</p>
                          <h3 style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: 900, color: '#312e81' }}>{topRooms[0]?.name || 'N/A'}</h3>
                          <p style={{ margin: '2px 0 0', fontSize: '9px', fontWeight: 700, color: '#6366f1' }}>Local mais utilizado na Regional</p>
                      </td>
                </tr>
                </tbody>
            </table>
          </div>

          <div style={{ display: 'table', width: '100%', tableLayout: 'fixed' }}>
            <div style={{ display: 'table-cell', width: '65%', paddingRight: '20px', verticalAlign: 'top' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', marginBottom: '15px' }}>Cronograma Mensal Detalhado</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                            <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'left' }}>DATA/HORA</th>
                            <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'left' }}>AMBIENTE / SERVIÇO</th>
                            <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'center' }}>STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {currentMonthSchedules.slice(0, 25).map(row => (
                            <tr key={row.id}>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 700 }}>
                                    {row.start_date.split('-').reverse().join('/')} <br/>
                                    <span style={{color: '#64748b', fontSize: '8px'}}>{row.start_time} às {row.end_time}</span>
                                </td>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>
                                    <div style={{color: '#1e293b'}}>{row.room_name}</div>
                                    <div style={{color: '#6366f1', fontSize: '8px', marginTop: '2px'}}>{row.service_name || 'N/D'}</div>
                                </td>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '8px', textAlign: 'center', fontWeight: 900, color: row.status.includes('APROVADO') || row.status.includes('SIM') ? '#059669' : '#d97706' }}>{row.status.toUpperCase()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {currentMonthSchedules.length > 25 && <p style={{ fontSize: '9px', color: '#94a3b8', marginTop: '10px' }}>* Exibindo 25 de {currentMonthSchedules.length} registros totais.</p>}
            </div>

            <div style={{ display: 'table-cell', width: '35%', paddingLeft: '20px', verticalAlign: 'top' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 900, color: '#334155', textTransform: 'uppercase', marginBottom: '15px' }}>Top Ambientes</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'left' }}>LOCAL</th>
                            <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'center' }}>USO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {topRooms.map(row => (
                            <tr key={row.name}>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>{row.name}</td>
                                <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'center', fontWeight: 800, color: '#4f46e5' }}>{row.count}x</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ marginTop: '30px', padding: '20px', background: '#f8fafc', borderRadius: '15px', border: '1px dashed #cbd5e1' }}>
                    <p style={{ margin: 0, fontSize: '9px', color: '#64748b', lineHeight: '1.6', fontWeight: 500 }}>
                        Este documento consolida o cronograma de ocupação dos ambientes da Regional para fins de planejamento e gestão de apoio logístico (Limpeza/Segurança).
                    </p>
                </div>
            </div>
          </div>

          <div style={{ marginTop: '100px', paddingTop: '20px', borderTop: '2px solid #f1f5f9', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', fontWeight: 900, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '4px' }}>SGE-GSU INTELLIGENCE • RELATÓRIO OFICIAL DE OCUPAÇÃO</p>
          </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-2xl shadow-indigo-200">
            <Building2 size={36} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Ambientes</h1>
            <p className="text-slate-500 font-medium mt-1">Gestão de Salas e Auditórios da Regional</p>
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
            <TabButton active={activeTab === 'painel'} onClick={() => setActiveTab('painel')} icon={<ShieldCheck size={16}/>} label="Painel" />
            <TabButton active={activeTab === 'planilha'} onClick={() => setActiveTab('planilha')} icon={<FileSpreadsheet size={16}/>} label="Planilha" />
            <TabButton active={activeTab === 'formulario'} onClick={() => setActiveTab('formulario')} icon={<ClipboardList size={16}/>} label="Reservar" />
          </div>
        </div>
      </div>

      {activeTab === 'painel' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5">
              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-2xl h-full flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600"></div>
                <div className="w-20 h-20 bg-indigo-50 rounded-[2rem] flex items-center justify-center text-indigo-600 mb-6"><SearchCheck size={40} /></div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Notificar Pátio/Apoio</h2>
                <p className="text-xs text-slate-400 font-bold mt-2 mb-8 max-w-[250px] uppercase tracking-widest">Envia as reservas de amanhã para SEOM e SEFISC.</p>

                {status.type === 'idle' ? (
                  <button onClick={handleAutoCheckAndNotify} disabled={loading} className="group w-full py-6 bg-slate-900 hover:bg-black text-white rounded-[2rem] font-black text-xs uppercase flex items-center justify-center gap-4 shadow-2xl transition-all active:scale-95 disabled:opacity-50">
                    {loading ? <Loader2 className="animate-spin" /> : <Send size={20} />} VERIFICAR E NOTIFICAR
                  </button>
                ) : (
                  <div className={`w-full p-6 rounded-[2rem] border-2 ${status.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : status.type === 'none' ? 'bg-amber-50 border-amber-100 text-amber-800' : 'bg-red-50 text-red-800'}`}>
                    <p className="font-black uppercase text-[10px] tracking-widest">{status.msg}</p>
                    <button onClick={() => setStatus({type: 'idle'})} className="mt-3 text-[10px] font-black underline opacity-50">VOLTAR</button>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl h-full text-white relative overflow-hidden">
                <div className="relative z-10 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-white/10 rounded-2xl"><Calendar size={24} className="text-indigo-400"/></div>
                      <div>
                        <h2 className="text-xl font-black uppercase tracking-tight">Uso dos Ambientes: Hoje</h2>
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{todayDisplay}</p>
                      </div>
                    </div>
                    {!dataLoading && <span className="bg-indigo-600 px-4 py-1 rounded-full text-[10px] font-black uppercase">{todayBookings.length} Reservas</span>}
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-[250px]">
                    {dataLoading ? (
                      <div className="py-20 text-center opacity-30">
                        <Loader2 className="animate-spin inline mr-2" /> Sincronizando...
                      </div>
                    ) : todayBookings.length === 0 ? (
                      <div className="py-20 text-center opacity-30 italic text-sm">Nenhum ambiente reservado para hoje.</div>
                    ) : (
                      todayBookings.map(b => (
                        <div key={b.id} className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center justify-between group hover:bg-white/10 transition-all">
                          <div className="flex items-center gap-4">
                             <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-black"><MapPin size={22}/></div>
                             <div>
                                <p className="font-black uppercase text-sm tracking-tight">{b.room_name}</p>
                                {b.service_name && (
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <Users size={10} className="text-indigo-500" />
                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter line-clamp-1">{b.service_name}</p>
                                  </div>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                  <Clock size={12} className="text-white/40"/>
                                  <span className="text-[11px] font-black text-white/70 uppercase">{b.start_time} até {b.end_time}</span>
                                </div>
                                <p className="text-[8px] text-white/30 font-bold uppercase mt-1">Até {b.end_date.split('-').reverse().join('/')}</p>
                             </div>
                          </div>
                          <div className="text-right">
                            <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase ${b.status?.toUpperCase().includes('APROVADO') || b.status?.toUpperCase() === 'SIM' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                              {b.status || 'Pendente'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <Building2 className="absolute -bottom-10 -right-10 text-white/5 w-64 h-64 -rotate-12" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8">
              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-2xl h-full">
                <div className="flex items-center gap-3 mb-10">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shadow-inner"><BarChart3 size={24}/></div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Ocupação Mensal</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Reservas aprovadas nos últimos 12 meses</p>
                  </div>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#94a3b8'}} dy={15} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#cbd5e1'}} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: '900'}} />
                      <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={28}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? "#4f46e5" : "#e2e8f0"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="lg:col-span-4">
              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-2xl h-full flex flex-col">
                <div className="flex items-center gap-3 mb-10">
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><Award size={24}/></div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Mais Utilizados</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Top ambientes da regional</p>
                  </div>
                </div>
                <div className="space-y-6 flex-1">
                  {topRooms.map((room, idx) => (
                    <div key={room.name} className="flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-[10px] ${idx === 0 ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-400'}`}>{idx + 1}</div>
                        <div>
                          <p className="text-xs font-black text-slate-700 uppercase leading-none group-hover:text-indigo-600 transition-colors">{room.name}</p>
                          <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">{room.count} reservas aprovadas</p>
                        </div>
                      </div>
                      <div className="h-1.5 w-12 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                        <div className="h-full bg-indigo-500" style={{ width: `${(room.count / (topRooms[0]?.count || 1)) * 100}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
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

export default AgendamentoAmbientes;