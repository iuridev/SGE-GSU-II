import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Building2, Calendar, Clock, MapPin, Users, Plus, 
  Settings, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight,
  Info, Trash2, FileDown, Loader2, X, RefreshCw
} from 'lucide-react';

const GOOGLE_SCRIPT_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL_AGENDAMENTO;

interface Ambiente {
  id: string;
  nome: string;
  capacidade: number;
}

interface Agendamento {
  id: string;
  ambiente_id: string;
  user_name: string;
  titulo_evento: string;
  data_agendamento: string;
  hora_inicio: string;
  hora_fim: string;
  quantidade_pessoas: number;
  observacao: string;
  ambientes?: Ambiente;
}

// Função para pegar a data e hora atual do sistema (Fuso horário de SP)
const getFormDefaults = () => {
  const now = new Date();
  const data_agendamento = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  const hora_inicio = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  
  return {
    data_agendamento,
    hora_inicio,
    hora_fim: '18:00', // Padrão fixo
    ambiente_id: '',
    titulo_evento: '',
    quantidade_pessoas: '',
    observacao: ''
  };
};

export function AgendamentoNovo() {
  const [activeTab, setActiveTab] = useState<'calendario' | 'agendar' | 'gerenciar'>('calendario');
  const [userRole, setUserRole] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  const [ambientes, setAmbientes] = useState<Ambiente[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [nomeAmbiente, setNomeAmbiente] = useState('');
  const [capacidadeAmbiente, setCapacidadeAmbiente] = useState('');

  // Iniciando o formulário já com as datas preenchidas!
  const [agendamentoForm, setAgendamentoForm] = useState(getFormDefaults());

  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfDateStr, setPdfDateStr] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()));

  useEffect(() => {
    fetchSessionAndData();
  }, []);

  async function fetchSessionAndData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setCurrentUser(session.user);
      const { data: profile } = await (supabase as any).from('profiles').select('role').eq('id', session.user.id).single();
      if (profile) setUserRole(profile.role);
    }
    fetchAmbientes();
    fetchAgendamentos();
  }

  async function fetchAmbientes() {
    const { data } = await (supabase as any).from('ambientes').select('*').eq('ativo', true).order('nome');
    if (data) setAmbientes(data);
  }

  async function fetchAgendamentos() {
    const { data } = await (supabase as any).from('agendamentos_ambientes').select('*, ambientes(*)').order('data_agendamento', { ascending: false });
    if (data) setAgendamentos(data);
  }

  const obterStatusAmbiente = (ambienteId: string) => {
    if (!agendamentoForm.data_agendamento || !agendamentoForm.hora_inicio || !agendamentoForm.hora_fim) return 'livre';

    const formInicio = new Date(`1970-01-01T${agendamentoForm.hora_inicio}`);
    const formFim = new Date(`1970-01-01T${agendamentoForm.hora_fim}`);

    const conflito = agendamentos.some(ag => {
      if (ag.ambiente_id !== ambienteId || ag.data_agendamento !== agendamentoForm.data_agendamento) return false;
      const agInicio = new Date(`1970-01-01T${ag.hora_inicio}`);
      const agFim = new Date(`1970-01-01T${ag.hora_fim}`);
      return (formInicio < agFim && formFim > agInicio);
    });

    return conflito ? 'ocupado' : 'livre';
  };

  useEffect(() => {
    if (agendamentoForm.ambiente_id && obterStatusAmbiente(agendamentoForm.ambiente_id) === 'ocupado') {
      setAgendamentoForm(prev => ({ ...prev, ambiente_id: '' }));
      setErrorMsg('O horário foi alterado e o ambiente selecionado não está mais disponível.');
    } else {
      setErrorMsg(''); 
    }
  }, [agendamentoForm.data_agendamento, agendamentoForm.hora_inicio, agendamentoForm.hora_fim]);

  const agendamentosDoDiaSelecionado = useMemo(() => {
    if (!agendamentoForm.data_agendamento) return [];
    return agendamentos
      .filter(a => a.data_agendamento === agendamentoForm.data_agendamento)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  }, [agendamentos, agendamentoForm.data_agendamento]);

  const handleAgendar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const ambienteSelecionado = ambientes.find(a => a.id === agendamentoForm.ambiente_id);
    if (Number(agendamentoForm.quantidade_pessoas) > (ambienteSelecionado?.capacidade || 0)) {
      setErrorMsg(`A capacidade máxima deste ambiente é de ${ambienteSelecionado?.capacidade} pessoas.`);
      return;
    }

    setLoading(true);
    try {
      const userName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
      
      const { error } = await (supabase as any).from('agendamentos_ambientes').insert([{
        ...agendamentoForm,
        quantidade_pessoas: Number(agendamentoForm.quantidade_pessoas),
        user_id: currentUser.id,
        user_name: userName
      }]);

      if (error) throw error;

      setSuccessMsg('Agendamento realizado com sucesso!');
      
      // Reseta para o padrão automático após salvar
      setAgendamentoForm(getFormDefaults()); 
      
      fetchAgendamentos();
      setTimeout(() => setActiveTab('calendario'), 2000);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCriarAmbiente = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await (supabase as any).from('ambientes').insert([{ nome: nomeAmbiente, capacidade: Number(capacidadeAmbiente) }]);
      if (error) throw error;
      setNomeAmbiente(''); setCapacidadeAmbiente(''); fetchAmbientes();
      alert('Ambiente cadastrado com sucesso!');
    } catch (err) {
      alert('Erro ao cadastrar ambiente.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletarAmbiente = async (id: string) => {
    if(!confirm('Deseja realmente remover este ambiente?')) return;
    await (supabase as any).from('ambientes').update({ ativo: false }).eq('id', id);
    fetchAmbientes();
  };

  const handleSyncSheet = async () => {
    if (!GOOGLE_SCRIPT_URL) {
      alert("URL da planilha não configurada no .env!");
      return;
    }
    
    setSyncing(true);
    try {
      const payload = agendamentos.map(ag => ({
        id: ag.id,
        data_agendamento: ag.data_agendamento.split('-').reverse().join('/'),
        hora_inicio: ag.hora_inicio.slice(0, 5),
        hora_fim: ag.hora_fim.slice(0, 5),
        ambiente: ag.ambientes?.nome || 'Ambiente Excluído',
        titulo_evento: ag.titulo_evento,
        responsavel: ag.user_name,
        quantidade_pessoas: ag.quantidade_pessoas,
        observacao: ag.observacao || "",
        criado_em: "Exportado via Sistema"
      }));

      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      alert("Planilha sincronizada com sucesso! Verifique o Google Sheets.");
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar dados para a planilha.");
    } finally {
      setSyncing(false);
    }
  };

  const selectedDateTelaStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(selectedDate);
  const dateBookings = useMemo(() => {
    return agendamentos
      .filter(s => s.data_agendamento === selectedDateTelaStr)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  }, [agendamentos, selectedDateTelaStr]);

  const { pdfStartOfWeek, pdfEndOfWeek, pdfStartStr, pdfEndStr } = useMemo(() => {
    const [y, m, d] = pdfDateStr.split('-').map(Number);
    const refDate = new Date(y, m - 1, d);
    const day = refDate.getDay();
    
    const start = new Date(refDate);
    start.setDate(refDate.getDate() - day);
    
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const startStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(start);
    const endStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(end);

    return { pdfStartOfWeek: start, pdfEndOfWeek: end, pdfStartStr: startStr, pdfEndStr: endStr };
  }, [pdfDateStr]);

  const groupedPdfBookings = useMemo(() => {
    const filtered = agendamentos.filter(a => a.data_agendamento >= pdfStartStr && a.data_agendamento <= pdfEndStr)
                                 .sort((a,b) => a.data_agendamento === b.data_agendamento ? a.hora_inicio.localeCompare(b.hora_inicio) : a.data_agendamento.localeCompare(b.data_agendamento));
    
    const grouped: Record<string, Agendamento[]> = {};
    filtered.forEach(ag => {
      if (!grouped[ag.data_agendamento]) grouped[ag.data_agendamento] = [];
      grouped[ag.data_agendamento].push(ag);
    });
    return grouped;
  }, [agendamentos, pdfStartStr, pdfEndStr]);

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

      const element = document.getElementById('weekly-report-template');
      if (!element) throw new Error("Template de relatório não encontrado.");

      element.style.display = 'block';

      const opt = {
        margin: [15, 15, 15, 15],
        filename: `Agenda_Semanal_${pdfStartStr.replace(/-/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, width: 1500 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['css', 'legacy'] }
      };

      await (window as any).html2pdf().set(opt).from(element).save();
      element.style.display = 'none';
      setExporting(false);
      setShowPdfModal(false);

    } catch (err) {
      console.error(err);
      alert("Erro ao gerar o PDF.");
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500 relative">
      
      {showPdfModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Exportar PDF Semanal</h3>
              <button onClick={() => setShowPdfModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
                <X size={24}/>
              </button>
            </div>
            
            <p className="text-sm text-slate-500 font-bold mb-6">
              Selecione qualquer data. O sistema gerará um PDF no formato Paisagem, do <span className="text-indigo-600">Domingo ao Sábado</span> daquela semana.
            </p>
            
            <div className="mb-8 p-6 bg-slate-50 rounded-[1.5rem] border border-slate-100">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Data de Referência</label>
              <input 
                type="date"
                value={pdfDateStr}
                onChange={e => setPdfDateStr(e.target.value)}
                className="w-full bg-white border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-black focus:ring-2 focus:ring-indigo-500 outline-none text-lg text-center"
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowPdfModal(false)} className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">Cancelar</button>
              <button onClick={handleExportPDF} disabled={exporting} className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg">
                {exporting ? <Loader2 className="animate-spin" size={18}/> : <FileDown size={18}/>}
                Baixar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      <div id="weekly-report-template" style={{ display: 'none', background: 'white', width: '1500px', padding: '50px' }}>
          <div style={{ borderBottom: '6px solid #4f46e5', paddingBottom: '25px', marginBottom: '40px' }}>
              <table style={{ width: '100%' }}>
                  <tbody>
                    <tr>
                        <td style={{ border: 'none' }}>
                            <h1 style={{ margin: 0, fontSize: '38px', fontWeight: 900, color: '#0f172a' }}>AGENDA DE AMBIENTES</h1>
                            <p style={{ margin: 0, fontSize: '16px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px' }}>CRONOGRAMA SEMANAL DA REGIONAL</p>
                        </td>
                        <td style={{ border: 'none', textAlign: 'right' }}>
                            <p style={{ margin: 0, fontWeight: 900, fontSize: '22px', color: '#1e293b' }}>
                              {pdfStartOfWeek.toLocaleDateString('pt-BR')} a {pdfEndOfWeek.toLocaleDateString('pt-BR')}
                            </p>
                            <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', fontWeight: 800 }}>SGE-GSU INTELLIGENCE II</p>
                        </td>
                    </tr>
                  </tbody>
              </table>
          </div>

          {Object.keys(groupedPdfBookings).length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', fontSize: '18px', color: '#94a3b8', fontWeight: 'bold' }}>Nenhum evento agendado para esta semana.</div>
          ) : (
            Object.keys(groupedPdfBookings).sort().map(dataStr => {
              const [y, m, d] = dataStr.split('-');
              const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
              const dayOfWeek = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
              const formattedDate = dateObj.toLocaleDateString('pt-BR');

              return (
                <div key={dataStr} style={{ marginBottom: '40px', pageBreakInside: 'avoid' }}>
                  <h4 style={{ margin: '0 0 15px 0', fontSize: '20px', fontWeight: 900, color: '#4f46e5', textTransform: 'uppercase', borderBottom: '3px solid #e2e8f0', paddingBottom: '10px' }}>
                    {dayOfWeek}, {formattedDate}
                  </h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                          <tr style={{ background: '#f8fafc' }}>
                              <th style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', textAlign: 'left', color: '#334155', width: '12%', fontWeight: 900 }}>HORÁRIO</th>
                              <th style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', textAlign: 'left', color: '#334155', width: '23%', fontWeight: 900 }}>AMBIENTE</th>
                              <th style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', textAlign: 'left', color: '#334155', width: '50%', fontWeight: 900 }}>EVENTO / OBSERVAÇÃO</th>
                              <th style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', textAlign: 'center', color: '#334155', width: '15%', fontWeight: 900 }}>LOTAÇÃO</th>
                          </tr>
                      </thead>
                      <tbody>
                          {groupedPdfBookings[dataStr].map(row => (
                              <tr key={row.id}>
                                  <td style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', fontWeight: 900, color: '#d97706' }}>
                                      {row.hora_inicio.slice(0,5)} às {row.hora_fim.slice(0,5)}
                                  </td>
                                  <td style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', fontWeight: 900, textTransform: 'uppercase', color: '#1e293b' }}>
                                      {row.ambientes?.nome}
                                  </td>
                                  <td style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px' }}>
                                      <div style={{ fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', marginBottom: '6px', fontSize: '16px' }}>{row.titulo_evento}</div>
                                      <div style={{ fontWeight: 800, color: '#4f46e5', fontSize: '13px', textTransform: 'uppercase' }}>RESPONSÁVEL: {row.user_name}</div>
                                      {row.observacao && <div style={{ color: '#64748b', fontSize: '13px', marginTop: '6px', fontStyle: 'italic', fontWeight: 600 }}>Obs: {row.observacao}</div>}
                                  </td>
                                  <td style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', textAlign: 'center', fontWeight: 900, color: '#059669' }}>
                                      {row.quantidade_pessoas} pessoas
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
                </div>
              );
            })
          )}

          <div style={{ marginTop: '70px', paddingTop: '30px', borderTop: '3px solid #f1f5f9', textAlign: 'center' }}>
              <p style={{ fontSize: '14px', fontWeight: 900, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '5px' }}>SGE-GSU INTELLIGENCE • DOCUMENTO OFICIAL</p>
          </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-xl shadow-indigo-200">
            <Building2 size={36} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Ambientes V2</h1>
            <p className="text-slate-500 font-medium mt-1">Gestão Inteligente de Salas da Regional</p>
          </div>
        </div>

        <div className="flex gap-2 p-2 bg-slate-100 rounded-[1.5rem] border border-slate-200">
          <TabButton active={activeTab === 'calendario'} onClick={() => setActiveTab('calendario')} icon={<Calendar size={16}/>} label="Calendário" />
          <TabButton active={activeTab === 'agendar'} onClick={() => setActiveTab('agendar')} icon={<Plus size={16}/>} label="Agendar" />
          {userRole === 'regional_admin' && (
            <TabButton active={activeTab === 'gerenciar'} onClick={() => setActiveTab('gerenciar')} icon={<Settings size={16}/>} label="Gerenciar" />
          )}
        </div>
      </div>

      {activeTab === 'calendario' && (
        <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 h-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 pb-6 border-b border-slate-100 gap-4">
            
            <div className="flex items-center gap-4">
               <button onClick={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() - 1)))} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"><ChevronLeft size={20}/></button>
               <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight w-48 text-center">
                  {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
               </h2>
               <button onClick={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() + 1)))} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"><ChevronRight size={20}/></button>
            </div>
            
            <div className="flex items-center gap-3">
               <button onClick={() => setSelectedDate(new Date())} className="px-5 py-2.5 bg-indigo-50 text-indigo-600 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-indigo-100 transition-all">Hoje</button>
               
               <button 
                  onClick={() => setShowPdfModal(true)}
                  className="bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95"
               >
                  <FileDown size={16} />
                  PDF da Semana
               </button>
            </div>
          </div>

          <div className="space-y-4 min-h-[400px]">
            {dateBookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <Calendar size={48} className="mb-4 opacity-50" />
                <p className="font-bold">Nenhum ambiente reservado para este dia.</p>
              </div>
            ) : (
              dateBookings.map(b => (
                <div key={b.id} className="p-6 bg-slate-50 border border-slate-100 rounded-3xl flex items-center justify-between hover:shadow-md transition-all">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
                      <MapPin size={24} />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-800 uppercase text-lg">{b.titulo_evento}</h3>
                      <div className="flex flex-wrap items-center gap-4 mt-2 text-sm font-bold text-slate-500">
                        <span className="flex items-center gap-1.5"><Building2 size={14} className="text-indigo-500"/> {b.ambientes?.nome}</span>
                        <span className="flex items-center gap-1.5"><Clock size={14} className="text-amber-500"/> {b.hora_inicio.slice(0,5)} às {b.hora_fim.slice(0,5)}</span>
                        <span className="flex items-center gap-1.5"><Users size={14} className="text-emerald-500"/> {b.quantidade_pessoas} pessoas</span>
                      </div>
                      {b.observacao && <p className="text-xs text-slate-400 mt-2 flex items-center gap-1"><Info size={12}/> {b.observacao}</p>}
                    </div>
                  </div>
                  <div className="text-right bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm shrink-0 hidden sm:block">
                    <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">Responsável</p>
                    <p className="text-sm font-bold text-indigo-700">{b.user_name}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'agendar' && (
        <div className="max-w-3xl mx-auto bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100">
          <div className="mb-8">
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Novo Agendamento</h2>
            <p className="text-sm font-bold text-slate-400 mt-1">Os horários foram preenchidos com o momento atual. Fique à vontade para ajustá-los!</p>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-2xl flex items-center gap-3 font-bold text-sm">
              <AlertTriangle size={20} /> {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-2xl flex items-center gap-3 font-bold text-sm">
              <CheckCircle2 size={20} /> {successMsg}
            </div>
          )}

          <form onSubmit={handleAgendar} className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-slate-50 border border-slate-100 rounded-3xl">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Data do Evento *</label>
                <input 
                  type="date" required
                  value={agendamentoForm.data_agendamento}
                  onChange={e => setAgendamentoForm({...agendamentoForm, data_agendamento: e.target.value})}
                  className="w-full bg-white border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Hora de Início *</label>
                <input 
                  type="time" required
                  value={agendamentoForm.hora_inicio}
                  onChange={e => setAgendamentoForm({...agendamentoForm, hora_inicio: e.target.value})}
                  className="w-full bg-white border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Hora de Término *</label>
                <input 
                  type="time" required
                  value={agendamentoForm.hora_fim}
                  onChange={e => setAgendamentoForm({...agendamentoForm, hora_fim: e.target.value})}
                  className="w-full bg-white border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Ambiente Disponível *</label>
                <select 
                  required
                  value={agendamentoForm.ambiente_id}
                  onChange={e => setAgendamentoForm({...agendamentoForm, ambiente_id: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-60 transition-all"
                  disabled={!agendamentoForm.data_agendamento || !agendamentoForm.hora_inicio || !agendamentoForm.hora_fim}
                >
                  <option value="">
                    {(!agendamentoForm.data_agendamento || !agendamentoForm.hora_inicio || !agendamentoForm.hora_fim) 
                      ? 'Preencha a data e hora acima primeiro' 
                      : 'Selecione a sala livre'}
                  </option>
                  {ambientes.map(a => {
                    const status = obterStatusAmbiente(a.id);
                    return (
                      <option key={a.id} value={a.id} disabled={status === 'ocupado'} className={status === 'ocupado' ? 'text-red-500 bg-red-50' : ''}>
                        {a.nome} (Até {a.capacidade} pess.) {status === 'ocupado' ? ' - ⚠️ OCUPADO' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Título do Evento *</label>
                <input 
                  type="text" required
                  value={agendamentoForm.titulo_evento}
                  onChange={e => setAgendamentoForm({...agendamentoForm, titulo_evento: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: Reunião de Planejamento"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-4">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Qtd. de Pessoas *</label>
                <input 
                  type="number" min="1" required
                  value={agendamentoForm.quantidade_pessoas}
                  onChange={e => setAgendamentoForm({...agendamentoForm, quantidade_pessoas: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: 15"
                />
              </div>
              <div className="md:col-span-8">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Observação (Opcional)</label>
                <input 
                  type="text"
                  value={agendamentoForm.observacao}
                  onChange={e => setAgendamentoForm({...agendamentoForm, observacao: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: Necessário projetor e caixa de som."
                />
              </div>
            </div>

            <button 
              type="submit" disabled={loading || !agendamentoForm.ambiente_id}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-all disabled:opacity-50 mt-4"
            >
              {loading ? 'Processando...' : 'Confirmar Agendamento'}
            </button>
          </form>

          {agendamentoForm.data_agendamento && (
            <div className="mt-10 p-6 bg-slate-50 border border-slate-200 rounded-[2rem] animate-in slide-in-from-bottom-2">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Calendar size={18} className="text-indigo-500"/>
                Agendamentos da Regional no dia {agendamentoForm.data_agendamento.split('-').reverse().join('/')}
              </h3>
              
              {agendamentosDoDiaSelecionado.length > 0 ? (
                <div className="space-y-3">
                  {agendamentosDoDiaSelecionado.map(ag => (
                    <div key={ag.id} className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-sm font-bold text-slate-600">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1 rounded-lg">
                          <Clock size={14} />
                          <span>{ag.hora_inicio.slice(0,5)} às {ag.hora_fim.slice(0,5)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className="text-indigo-400" />
                          <span className="uppercase text-indigo-700">{ag.ambientes?.nome}</span>
                        </div>
                      </div>
                      <span className="text-slate-400 truncate max-w-[150px] sm:max-w-[200px] text-xs uppercase hidden sm:block">
                        {ag.titulo_evento}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400">
                  <CheckCircle2 size={32} className="mx-auto mb-2 opacity-50 text-emerald-500" />
                  <p className="text-sm font-bold">Nenhum ambiente reservado para esta data ainda.</p>
                  <p className="text-xs mt-1">Todas as salas estão livres.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TELA 3: GERENCIAR (ADMIN) */}
      {activeTab === 'gerenciar' && userRole === 'regional_admin' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 relative">
            
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-6">Cadastrar Novo Ambiente</h2>
            <form onSubmit={handleCriarAmbiente} className="space-y-6">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Nome do Ambiente *</label>
                <input 
                  type="text" required
                  value={nomeAmbiente} onChange={e => setNomeAmbiente(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: Auditório Principal"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Capacidade Máxima *</label>
                <input 
                  type="number" required min="1"
                  value={capacidadeAmbiente} onChange={e => setCapacidadeAmbiente(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: 50"
                />
              </div>
              <button type="submit" disabled={loading} className="w-full py-3 bg-slate-900 hover:bg-black text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all">
                Cadastrar Ambiente
              </button>
            </form>
          </div>
          
          <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 flex flex-col">
            <div className="flex items-center justify-between mb-6">
               <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Ambientes Ativos</h2>
               
               <button 
                  onClick={handleSyncSheet}
                  disabled={syncing}
                  className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 rounded-xl transition-all shadow-sm flex items-center gap-2 font-bold text-xs uppercase tracking-widest disabled:opacity-50"
                  title="Força a sincronização de todos os agendamentos para a Planilha do Google"
               >
                  {syncing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} 
                  {syncing ? 'Enviando...' : 'Sincronizar Planilha'}
               </button>
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
              {ambientes.map(a => (
                <div key={a.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:border-slate-300">
                  <div>
                    <p className="font-black text-slate-800 uppercase">{a.nome}</p>
                    <p className="text-xs font-bold text-slate-400">Capacidade: {a.capacidade} pessoas</p>
                  </div>
                  <button onClick={() => handleDeletarAmbiente(a.id)} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors" title="Remover Ambiente">
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function TabButton({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={`px-6 py-3 flex items-center gap-2 rounded-[1.2rem] text-xs font-black uppercase tracking-widest transition-all ${active ? 'bg-white text-indigo-600 shadow-xl shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}>
      {icon} {label}
    </button>
  );
}

export default AgendamentoNovo;