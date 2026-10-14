import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import { TimbradoHeader, TimbradoFooter } from '../components/TimbradoPDF';
import {
  Building2, ShieldCheck, FileSpreadsheet, ClipboardList,
  Loader2, BarChart3, Calendar, Award, FileDown, Clock, MapPin,
  Users, ChevronLeft, ChevronRight, CalendarDays, User, Phone,
  Plus, Check, ChevronDown, Save, X, AlertCircle
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
  service_name: string;
  solicitor_name: string | null;
  solicitor_whatsapp: string | null;
}

interface BookingSolicitor {
  id: string;
  user_id: string;
  name: string;
  whatsapp: string;
}

interface MonthlyData {
  key: string;
  label: string;
  count: number;
}

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DAYS_WEEK = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

function formatWhatsapp(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function AgendamentoAmbientes() {
  const [dataLoading, setDataLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [schedules, setSchedules] = useState<RoomSchedule[]>([]);
  const [activeTab, setActiveTab] = useState<'painel' | 'planilha' | 'formulario'>('painel');

  const [selectedDate, setSelectedDate] = useState(new Date());

  // Usuário e solicitantes
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState('');
  const [solicitors, setSolicitors] = useState<BookingSolicitor[]>([]);
  const [roomSuggestions, setRoomSuggestions] = useState<string[]>([]);

  // Formulário de agendamento
  const todayISO = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  const emptyForm = {
    solicitorId: '',       // '' = não selecionado, 'novo' = novo solicitante
    solicitorName: '',
    solicitorWhatsapp: '',
    saveSolicitor: true,
    roomName: '',
    serviceName: '',
    startDate: todayISO,
    endDate: todayISO,
    startTime: '08:00',
    endTime: '17:00',
  };
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const SHEET_URL = import.meta.env.VITE_AGENDAMENTO_AMBIENTES_SHEET_URL as string;

  useEffect(() => {
    loadUserAndSolicitors();
    fetchSchedules();
  }, []);

  async function loadUserAndSolicitors() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: profile } = await (supabase as any)
        .from('profiles').select('role').eq('id', user.id).single();
      setUserRole(resolveViewRole(profile?.role || ''));

      const { data: sols } = await (supabase as any)
        .from('booking_solicitors').select('*').order('name');
      setSolicitors(sols || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchSchedules() {
    setDataLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('room_schedules')
        .select('*')
        .order('start_date', { ascending: false });
      if (error) throw error;
      const rows: RoomSchedule[] = data || [];
      setSchedules(rows);
      // Sugestões de ambientes a partir dos agendamentos existentes
      const names = [...new Set(rows.map(r => r.room_name).filter(Boolean))].sort();
      setRoomSuggestions(names);
    } catch (err) {
      console.error(err);
    } finally {
      setDataLoading(false);
    }
  }

  // ─── Handlers do formulário ──────────────────────────────────────────────

  function handleSolicitorSelect(id: string) {
    if (id === 'novo') {
      setForm(f => ({ ...f, solicitorId: 'novo', solicitorName: '', solicitorWhatsapp: '' }));
    } else {
      const sol = solicitors.find(s => s.id === id);
      setForm(f => ({
        ...f,
        solicitorId: id,
        solicitorName: sol?.name || '',
        solicitorWhatsapp: sol?.whatsapp || '',
      }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');

    const solName = form.solicitorId === 'novo'
      ? form.solicitorName.trim()
      : (solicitors.find(s => s.id === form.solicitorId)?.name || '');
    const solWa = form.solicitorId === 'novo'
      ? form.solicitorWhatsapp.trim()
      : (solicitors.find(s => s.id === form.solicitorId)?.whatsapp || '');

    if (!solName) { setSubmitError('Informe o nome do solicitante.'); return; }
    if (!form.roomName.trim()) { setSubmitError('Informe o ambiente.'); return; }
    if (!form.startDate) { setSubmitError('Informe a data de início.'); return; }
    if (!form.startTime || !form.endTime) { setSubmitError('Informe os horários.'); return; }

    setSubmitting(true);
    try {
      // Salvar novo solicitante se solicitado
      if (form.solicitorId === 'novo' && form.saveSolicitor && solName) {
        const dup = solicitors.find(
          s => s.name.toLowerCase() === solName.toLowerCase() && s.whatsapp === solWa
        );
        if (!dup) {
          const { data: newSol, error: solErr } = await (supabase as any)
            .from('booking_solicitors')
            .insert({ user_id: userId, name: solName, whatsapp: solWa })
            .select().single();
          if (!solErr && newSol) {
            setSolicitors(prev =>
              [...prev, newSol as BookingSolicitor].sort((a, b) => a.name.localeCompare(b.name))
            );
          }
        }
      }

      const uniqueKey = `app-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const { error } = await (supabase as any)
        .from('room_schedules')
        .insert({
          room_name: form.roomName.trim(),
          service_name: form.serviceName.trim() || null,
          start_date: form.startDate,
          end_date: form.endDate || form.startDate,
          start_time: form.startTime,
          end_time: form.endTime,
          status: 'Pendente',
          solicitor_name: solName || null,
          solicitor_whatsapp: solWa || null,
          user_id: userId,
          unique_key: uniqueKey,
        });

      if (error) throw error;

      setSubmitSuccess(true);
      setForm({ ...emptyForm, startDate: todayISO, endDate: todayISO });
      await fetchSchedules();
      setTimeout(() => setSubmitSuccess(false), 4000);
    } catch (err: any) {
      setSubmitError(err.message || 'Erro ao criar agendamento. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Datas ───────────────────────────────────────────────────────────────

  const selectedDateStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(selectedDate);
  }, [selectedDate]);

  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }, []);

  const displayDateLabel = useMemo(() => {
    if (selectedDateStr === todayStr) return "Hoje";
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(yesterday);
    if (selectedDateStr === yd) return "Ontem";
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const td2 = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(tomorrow);
    if (selectedDateStr === td2) return "Amanhã";
    return `${selectedDate.getDate()} de ${MONTHS[selectedDate.getMonth()]}`;
  }, [selectedDate, selectedDateStr, todayStr]);

  const dateBookings = useMemo(() => {
    return schedules
      .filter(s => selectedDateStr >= s.start_date && selectedDateStr <= s.end_date)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [schedules, selectedDateStr]);

  const topRooms = useMemo(() => {
    const counts: Record<string, number> = {};
    schedules
      .filter(s => s.status?.toUpperCase().includes('APROVADO') || s.status?.toUpperCase() === 'SIM')
      .forEach(s => { counts[s.room_name] = (counts[s.room_name] || 0) + 1; });
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
        count: 0,
      });
    }
    schedules
      .filter(s => s.status?.toUpperCase().includes('APROVADO') || s.status?.toUpperCase() === 'SIM')
      .forEach(s => {
        const idx = months.findIndex(m => m.key === s.start_date.substring(0, 7));
        if (idx !== -1) months[idx].count++;
      });
    return months;
  }, [schedules]);

  const currentMonthSchedules = useMemo(() => {
    const monthKey = selectedDateStr.substring(0, 7);
    return schedules
      .filter(s => s.start_date.startsWith(monthKey) || s.end_date.startsWith(monthKey))
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [schedules, selectedDateStr]);

  const handlePrevDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); };
  const handleNextDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); };
  const handleGoToToday = () => setSelectedDate(new Date());

  const isAdmin = userRole === 'regional_admin';

  // ─── PDF Export ──────────────────────────────────────────────────────────

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const loadScript = (src: string) => new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
        const s = document.createElement('script');
        s.src = src; s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
      const element = document.getElementById('room-report-template');
      if (!element) throw new Error("Template não encontrado.");
      element.style.display = 'block';
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `Relatorio_Ambientes_${MONTHS[selectedDate.getMonth()].toUpperCase()}_${selectedDate.getFullYear()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, width: 1120 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
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

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 pb-20 relative">

      {/* TEMPLATE PDF (OCULTO) */}
      <div id="room-report-template" style={{ display: 'none', background: 'white', width: '1080px', padding: '40px' }}>
        <TimbradoHeader />
        <div style={{ borderBottom: '6px solid #4f46e5', paddingBottom: '20px', marginBottom: '30px' }}>
          <table style={{ width: '100%' }}>
            <tbody>
              <tr>
                <td style={{ border: 'none' }}>
                  <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900, color: '#0f172a' }}>RELATÓRIO ESTRATÉGICO: GESTÃO DE AMBIENTES</h1>
                  <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px' }}>CONSOLIDADO REGIONAL DE OCUPAÇÃO E USO</p>
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
                  <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'left' }}>SOLICITANTE</th>
                  <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'center' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {currentMonthSchedules.slice(0, 25).map(row => (
                  <tr key={row.id}>
                    <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 700 }}>
                      {row.start_date.split('-').reverse().join('/')} <br />
                      <span style={{ color: '#64748b', fontSize: '8px' }}>{row.start_time} às {row.end_time}</span>
                    </td>
                    <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>
                      <div style={{ color: '#1e293b' }}>{row.room_name}</div>
                      <div style={{ color: '#6366f1', fontSize: '8px', marginTop: '2px' }}>{row.service_name || 'N/D'}</div>
                    </td>
                    <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '9px' }}>
                      {row.solicitor_name ? (
                        <>
                          <div style={{ fontWeight: 700, color: '#1e293b' }}>{row.solicitor_name}</div>
                          {row.solicitor_whatsapp && (
                            <div style={{ color: '#64748b', fontSize: '8px' }}>{row.solicitor_whatsapp}</div>
                          )}
                        </>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '8px', textAlign: 'center', fontWeight: 900, color: row.status.includes('APROVADO') || row.status.includes('SIM') ? '#059669' : '#d97706' }}>
                      {row.status.toUpperCase()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          </div>
        </div>
        <div style={{ marginTop: '100px', paddingTop: '20px', borderTop: '2px solid #f1f5f9', textAlign: 'center' }}>
          <p style={{ fontSize: '10px', fontWeight: 900, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '4px' }}>SGE-GSU INTELLIGENCE • RELATÓRIO OFICIAL DE OCUPAÇÃO</p>
        </div>
        <TimbradoFooter />
      </div>

      {/* CABEÇALHO */}
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
            {exporting ? <Loader2 className="animate-spin" size={18} /> : <FileDown size={18} />}
            {exporting ? 'GERANDO PDF...' : 'RELATÓRIO P/ CHEFIA'}
          </button>
          <div className="flex gap-2 p-2 bg-slate-100 rounded-[1.5rem] border border-slate-200">
            <TabButton active={activeTab === 'painel'} onClick={() => setActiveTab('painel')} icon={<ShieldCheck size={16} />} label="Painel" />
            <TabButton active={activeTab === 'planilha'} onClick={() => setActiveTab('planilha')} icon={<FileSpreadsheet size={16} />} label="Planilha" />
            <TabButton active={activeTab === 'formulario'} onClick={() => setActiveTab('formulario')} icon={<ClipboardList size={16} />} label="Reservar" />
          </div>
        </div>
      </div>

      {/* ABA: PAINEL */}
      {activeTab === 'painel' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-12">
              <div className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl h-full text-white relative overflow-hidden">
                <div className="relative z-10 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-white/10 rounded-2xl"><Calendar size={24} className="text-indigo-400" /></div>
                      <div>
                        <p className="text-indigo-400 font-black text-[10px] uppercase tracking-[0.3em] mb-1">{DAYS_WEEK[selectedDate.getDay()]}</p>
                        <h2 className="text-xl font-black uppercase tracking-tight">Ocupação: {displayDateLabel}</h2>
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{selectedDate.toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={handlePrevDay} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white/60 hover:text-white"><ChevronLeft size={20} /></button>
                      <button onClick={handleGoToToday} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg transition-all">Hoje</button>
                      <button onClick={handleNextDay} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white/60 hover:text-white"><ChevronRight size={20} /></button>
                    </div>
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-[300px]">
                    {dataLoading ? (
                      <div className="py-20 text-center opacity-30">
                        <Loader2 className="animate-spin inline mr-2" /> Sincronizando...
                      </div>
                    ) : dateBookings.length === 0 ? (
                      <div className="py-20 text-center flex flex-col items-center justify-center opacity-30 gap-4">
                        <CalendarDays size={64} />
                        <p className="italic text-sm">Nenhum ambiente reservado para este dia.</p>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em]">Navegue nas setas acima</p>
                      </div>
                    ) : (
                      dateBookings.map(b => (
                        <div key={b.id} className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center justify-between group hover:bg-white/10 transition-all animate-in slide-in-from-right-2 duration-300">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-black"><MapPin size={22} /></div>
                            <div>
                              <p className="font-black uppercase text-sm tracking-tight">{b.room_name}</p>
                              {b.service_name && (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <Users size={10} className="text-indigo-500" />
                                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter line-clamp-1">{b.service_name}</p>
                                </div>
                              )}
                              {b.solicitor_name && (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <User size={10} className="text-white/40" />
                                  <span className="text-[10px] font-bold text-white/60">{b.solicitor_name}</span>
                                  {isAdmin && b.solicitor_whatsapp && (
                                    <>
                                      <span className="text-white/20 text-[10px]">•</span>
                                      <Phone size={10} className="text-emerald-400/70" />
                                      <span className="text-[10px] font-bold text-emerald-400/80">{b.solicitor_whatsapp}</span>
                                    </>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <Clock size={12} className="text-white/40" />
                                <span className="text-[11px] font-black text-white/70 uppercase">{b.start_time} até {b.end_time}</span>
                              </div>
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
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shadow-inner"><BarChart3 size={24} /></div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Ocupação Mensal</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Reservas aprovadas nos últimos 12 meses</p>
                  </div>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#94a3b8' }} dy={15} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#cbd5e1' }} />
                      <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: '900' }} />
                      <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={28}>
                        {chartData.map((_, index) => (
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
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><Award size={24} /></div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Mais Utilizados</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Top ambientes da regional</p>
                  </div>
                </div>
                <div className="space-y-6 flex-1 text-slate-700">
                  {topRooms.map((room, idx) => (
                    <div key={room.name} className="flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-[10px] ${idx === 0 ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-400'}`}>{idx + 1}</div>
                        <div>
                          <p className="text-xs font-black uppercase leading-none group-hover:text-indigo-600 transition-colors">{room.name}</p>
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

      {/* ABA: PLANILHA */}
      {activeTab === 'planilha' && (
        <div className="bg-white p-4 rounded-[3.5rem] border border-slate-100 shadow-2xl h-[750px] overflow-hidden">
          <iframe src={SHEET_URL} className="w-full h-full rounded-[2.5rem]" title="Planilha de Ambientes" />
        </div>
      )}

      {/* ABA: FORMULÁRIO NATIVO */}
      {activeTab === 'formulario' && (
        <div className="animate-in fade-in duration-500">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl overflow-hidden">

              {/* Cabeçalho do form */}
              <div className="bg-indigo-600 px-10 py-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-2xl"><ClipboardList size={24} className="text-white" /></div>
                  <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">Nova Reserva</h2>
                    <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mt-0.5">Preencha os dados para solicitar um ambiente</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-10 space-y-8">

                {/* Seção: Solicitante */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-indigo-50 rounded-xl"><User size={16} className="text-indigo-600" /></div>
                    <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Solicitante</h3>
                  </div>

                  {/* Dropdown de solicitantes salvos */}
                  <div className="relative">
                    <select
                      value={form.solicitorId}
                      onChange={e => handleSolicitorSelect(e.target.value)}
                      className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 pr-12 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="">— Selecione um solicitante salvo —</option>
                      {solicitors.map(s => (
                        <option key={s.id} value={s.id}>{s.name}{s.whatsapp ? ` — ${s.whatsapp}` : ''}</option>
                      ))}
                      <option value="novo">+ Novo solicitante</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>

                  {/* Campos de novo solicitante */}
                  {form.solicitorId === 'novo' && (
                    <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Nome *</label>
                          <div className="relative">
                            <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              value={form.solicitorName}
                              onChange={e => setForm(f => ({ ...f, solicitorName: e.target.value }))}
                              placeholder="Nome completo"
                              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3.5 text-sm font-bold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">WhatsApp</label>
                          <div className="relative">
                            <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="tel"
                              value={form.solicitorWhatsapp}
                              onChange={e => setForm(f => ({ ...f, solicitorWhatsapp: formatWhatsapp(e.target.value) }))}
                              placeholder="(11) 99999-9999"
                              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3.5 text-sm font-bold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div
                          onClick={() => setForm(f => ({ ...f, saveSolicitor: !f.saveSolicitor }))}
                          className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${form.saveSolicitor ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300 group-hover:border-indigo-400'}`}
                        >
                          {form.saveSolicitor && <Check size={12} className="text-white" />}
                        </div>
                        <span className="text-xs font-bold text-slate-600">Salvar para uso futuro</span>
                        <Save size={12} className="text-slate-400" />
                      </label>
                    </div>
                  )}

                  {/* Preview do solicitante selecionado */}
                  {form.solicitorId && form.solicitorId !== 'novo' && (
                    <div className="flex items-center gap-3 bg-indigo-50 rounded-2xl px-5 py-3.5 animate-in slide-in-from-top-2 duration-200">
                      <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-xs">
                        {form.solicitorName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-black text-indigo-900">{form.solicitorName}</p>
                        {form.solicitorWhatsapp && (
                          <p className="text-xs font-bold text-indigo-600 flex items-center gap-1 mt-0.5">
                            <Phone size={10} /> {form.solicitorWhatsapp}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, solicitorId: '', solicitorName: '', solicitorWhatsapp: '' }))}
                        className="ml-auto p-1.5 hover:bg-indigo-100 rounded-lg transition-colors text-indigo-400 hover:text-indigo-700"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </section>

                <div className="border-t border-slate-100" />

                {/* Seção: Detalhes do Agendamento */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-indigo-50 rounded-xl"><Building2 size={16} className="text-indigo-600" /></div>
                    <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Detalhes do Agendamento</h3>
                  </div>

                  {/* Ambiente */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Ambiente *</label>
                    <div className="relative">
                      <MapPin size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        list="room-suggestions"
                        value={form.roomName}
                        onChange={e => setForm(f => ({ ...f, roomName: e.target.value }))}
                        placeholder="Ex: Sala de Reunião, Auditório..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3.5 text-sm font-bold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <datalist id="room-suggestions">
                        {roomSuggestions.map(r => <option key={r} value={r} />)}
                      </datalist>
                    </div>
                  </div>

                  {/* Finalidade */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Finalidade / Serviço</label>
                    <div className="relative">
                      <Users size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={form.serviceName}
                        onChange={e => setForm(f => ({ ...f, serviceName: e.target.value }))}
                        placeholder="Ex: Reunião pedagógica, Treinamento..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3.5 text-sm font-bold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Datas */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Data Início *</label>
                      <input
                        type="date"
                        value={form.startDate}
                        onChange={e => setForm(f => ({
                          ...f,
                          startDate: e.target.value,
                          endDate: f.endDate < e.target.value ? e.target.value : f.endDate,
                        }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Data Fim *</label>
                      <input
                        type="date"
                        value={form.endDate}
                        min={form.startDate}
                        onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Horários */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Horário Início *</label>
                      <div className="relative">
                        <Clock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="time"
                          value={form.startTime}
                          onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Horário Fim *</label>
                      <div className="relative">
                        <Clock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="time"
                          value={form.endTime}
                          onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Feedback */}
                {submitError && (
                  <div className="flex items-center gap-3 bg-red-50 border border-red-100 text-red-700 px-5 py-4 rounded-2xl animate-in slide-in-from-top-2 duration-200">
                    <AlertCircle size={18} className="shrink-0" />
                    <p className="text-sm font-bold">{submitError}</p>
                  </div>
                )}
                {submitSuccess && (
                  <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 text-emerald-700 px-5 py-4 rounded-2xl animate-in slide-in-from-top-2 duration-200">
                    <Check size={18} className="shrink-0" />
                    <p className="text-sm font-bold">Agendamento criado com sucesso! Status: Pendente.</p>
                  </div>
                )}

                {/* Botão */}
                <button
                  type="submit"
                  disabled={submitting || !userId}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-indigo-200 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {submitting ? (
                    <><Loader2 className="animate-spin" size={18} /> Salvando...</>
                  ) : (
                    <><Plus size={18} /> Solicitar Agendamento</>
                  )}
                </button>

                <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  O agendamento ficará com status <span className="text-amber-500">Pendente</span> até aprovação.
                </p>
              </form>
            </div>
          </div>
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
