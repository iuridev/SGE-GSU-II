import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Building2, Calendar, Clock, MapPin, Users, Plus, 
  Settings, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight,
  Trash2, FileDown, Loader2, X, RefreshCw, Check, XCircle, Edit3, History
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
  user_id: string;
  titulo_evento: string;
  data_agendamento: string;
  hora_inicio: string;
  hora_fim: string;
  quantidade_pessoas: number;
  observacao: string;
  status: 'pendente' | 'aprovado' | 'reprovado' | 'cancelado';
  motivo_reprovacao?: string;
  historico_edicao?: string;
  ambientes?: Ambiente;
}

const getFormDefaults = () => {
  const now = new Date();
  const data_agendamento = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  const hora_inicio = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  
  return {
    data_agendamento,
    hora_inicio,
    hora_fim: '18:00',
    ambiente_id: '',
    titulo_evento: '',
    quantidade_pessoas: '',
    observacao: ''
  };
};

export function AgendamentoNovo() {
  const [activeTab, setActiveTab] = useState<'calendario' | 'agendar' | 'gerenciar'>('calendario');
  const [viewMode, setViewMode] = useState<'dia' | 'mes'>('dia');
  
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

  const [agendamentoForm, setAgendamentoForm] = useState(getFormDefaults());

  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfDateStr, setPdfDateStr] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()));
  
  const [agendamentoEditando, setAgendamentoEditando] = useState<Agendamento | null>(null);
  const [historicoModal, setHistoricoModal] = useState<Agendamento | null>(null);

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

  const obterStatusAmbiente = (ambienteId: string, ignorarAgendamentoId?: string) => {
    if (!agendamentoForm.data_agendamento || !agendamentoForm.hora_inicio || !agendamentoForm.hora_fim) return 'livre';

    const formInicio = new Date(`1970-01-01T${agendamentoForm.hora_inicio}`);
    const formFim = new Date(`1970-01-01T${agendamentoForm.hora_fim}`);

    const conflito = agendamentos.some(ag => {
      if (ag.status === 'reprovado' || ag.status === 'cancelado') return false; 
      if (ignorarAgendamentoId && ag.id === ignorarAgendamentoId) return false;
      if (ag.ambiente_id !== ambienteId || ag.data_agendamento !== agendamentoForm.data_agendamento) return false;
      
      const agInicio = new Date(`1970-01-01T${ag.hora_inicio}`);
      const agFim = new Date(`1970-01-01T${ag.hora_fim}`);
      return (formInicio < agFim && formFim > agInicio);
    });

    return conflito ? 'ocupado' : 'livre';
  };

  useEffect(() => {
    if (!agendamentoEditando && agendamentoForm.ambiente_id && obterStatusAmbiente(agendamentoForm.ambiente_id) === 'ocupado') {
      setAgendamentoForm(prev => ({ ...prev, ambiente_id: '' }));
      setErrorMsg('O horário foi alterado e o ambiente selecionado não está mais disponível.');
    } else {
      setErrorMsg(''); 
    }
  }, [agendamentoForm.data_agendamento, agendamentoForm.hora_inicio, agendamentoForm.hora_fim]);

  const agendamentosDoDiaSelecionado = useMemo(() => {
    if (!agendamentoForm.data_agendamento) return [];
    return agendamentos
      .filter(a => a.data_agendamento === agendamentoForm.data_agendamento && a.status !== 'reprovado' && a.status !== 'cancelado')
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  }, [agendamentos, agendamentoForm.data_agendamento]);

  const alterarStatus = async (id: string, novoStatus: 'aprovado' | 'reprovado' | 'cancelado') => {
    let motivo = '';
    if (novoStatus === 'reprovado') {
      motivo = prompt('Qual o motivo da reprovação? (Opcional)') || 'Não informado';
    }

    try {
      const { error } = await (supabase as any).from('agendamentos_ambientes')
        .update({ status: novoStatus, motivo_reprovacao: motivo })
        .eq('id', id);
      
      if (error) throw error; 
      
      alert(`Agendamento ${novoStatus} com sucesso!`);
      fetchAgendamentos();
    } catch (err: any) {
      console.error(err);
      alert('Erro ao alterar status. Verifique as permissões do banco.');
    }
  };

  const cancelarMeuAgendamento = async (ag: Agendamento) => {
    if (!confirm('Deseja realmente cancelar o seu agendamento? Esta ação não pode ser desfeita.')) return;
    try {
      const { error } = await (supabase as any).from('agendamentos_ambientes')
        .update({ status: 'cancelado' })
        .eq('id', ag.id);
      
      if (error) throw error;
      alert('Agendamento cancelado com sucesso!');
      fetchAgendamentos();
    } catch (err) {
      console.error(err);
      alert('Erro ao cancelar o agendamento.');
    }
  };

  const abrirModalEdicao = (ag: Agendamento) => {
    setAgendamentoEditando(ag);
    setAgendamentoForm({
      data_agendamento: ag.data_agendamento,
      hora_inicio: ag.hora_inicio,
      hora_fim: ag.hora_fim,
      ambiente_id: ag.ambiente_id,
      titulo_evento: ag.titulo_evento,
      quantidade_pessoas: ag.quantidade_pessoas.toString(),
      observacao: ag.observacao || ''
    });
  };

  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agendamentoEditando) return;

    if (obterStatusAmbiente(agendamentoForm.ambiente_id, agendamentoEditando.id) === 'ocupado') {
      alert('⚠️ Este horário já está ocupado por outro agendamento!');
      return;
    }

    try {
      setLoading(true);
      
      const mudancas = [];
      if (agendamentoEditando.data_agendamento !== agendamentoForm.data_agendamento) mudancas.push(`Data: ${agendamentoEditando.data_agendamento} -> ${agendamentoForm.data_agendamento}`);
      if (agendamentoEditando.hora_inicio !== agendamentoForm.hora_inicio) mudancas.push(`Início: ${agendamentoEditando.hora_inicio} -> ${agendamentoForm.hora_inicio}`);
      if (agendamentoEditando.hora_fim !== agendamentoForm.hora_fim) mudancas.push(`Fim: ${agendamentoEditando.hora_fim} -> ${agendamentoForm.hora_fim}`);
      if (agendamentoEditando.ambiente_id !== agendamentoForm.ambiente_id) mudancas.push(`Sala alterada`);
      if (agendamentoEditando.titulo_evento !== agendamentoForm.titulo_evento) mudancas.push(`Título: ${agendamentoEditando.titulo_evento} -> ${agendamentoForm.titulo_evento}`);
      
      let novoHistorico = agendamentoEditando.historico_edicao || '';
      if (mudancas.length > 0) {
        const dataAtual = new Date().toLocaleString('pt-BR');
        const registro = `[${dataAtual}] Alterações: ${mudancas.join(' | ')}`;
        novoHistorico = novoHistorico ? `${novoHistorico}\n${registro}` : registro;
      }

      const { error } = await (supabase as any).from('agendamentos_ambientes').update({
        ...agendamentoForm,
        quantidade_pessoas: Number(agendamentoForm.quantidade_pessoas),
        historico_edicao: novoHistorico
      }).eq('id', agendamentoEditando.id);

      if (error) throw error;

      alert('Agendamento editado com sucesso!');
      setAgendamentoEditando(null);
      setAgendamentoForm(getFormDefaults());
      fetchAgendamentos();
    } catch (err: any) {
      console.error(err);
      alert('Erro ao editar agendamento. Verifique as permissões do banco.');
    } finally {
      setLoading(false);
    }
  };

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
        user_name: userName,
        status: 'pendente' 
      }]);

      if (error) throw error;

      setSuccessMsg('Agendamento solicitado com sucesso! Aguarde a aprovação.');
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
        status: ag.status.toUpperCase(),
        motivo_reprovacao: ag.motivo_reprovacao || "",
        historico_edicao: ag.historico_edicao || "",
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

  const agendamentosPendentesGeral = useMemo(() => {
    return agendamentos.filter(a => a.status === 'pendente').length;
  }, [agendamentos]);

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

      const template = document.getElementById('weekly-report-template');
      if (!template) throw new Error("Template de relatório não encontrado.");

      // ESTRATÉGIA BLINDADA: Em vez de manipular DOM, pegamos o HTML puro
      // como texto. A biblioteca html2pdf vai desenhar isso numa aba fantasma
      // completamente fora da sua tela, ignorando os limites do monitor.
      const htmlContent = template.innerHTML;

      const opt = {
        margin: [10, 10, 10, 10],
        filename: `Agenda_Semanal_${pdfStartStr.replace(/-/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          letterRendering: true
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['css', 'legacy'] }
      };

      // Mandando imprimir a string HTML direto
      await (window as any).html2pdf().set(opt).from(htmlContent).save();
      
      setExporting(false);
      setShowPdfModal(false);

    } catch (err) {
      console.error(err);
      alert("Erro ao gerar o PDF.");
      setExporting(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    if (status === 'aprovado') return <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-[10px] font-black uppercase flex items-center gap-1"><CheckCircle2 size={12}/> Aprovado</span>;
    if (status === 'reprovado') return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-md text-[10px] font-black uppercase flex items-center gap-1"><XCircle size={12}/> Reprovado</span>;
    if (status === 'cancelado') return <span className="px-2 py-1 bg-slate-200 text-slate-600 rounded-md text-[10px] font-black uppercase flex items-center gap-1"><X size={12}/> Cancelado</span>;
    return <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-[10px] font-black uppercase flex items-center gap-1"><Clock size={12}/> Pendente</span>;
  };

  const renderCalendarioMes = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const blanks = Array(firstDay).fill(null);
    const days = Array.from({length: daysInMonth}, (_, i) => i + 1);
    const slots = [...blanks, ...days];

    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    return (
      <div className="animate-in fade-in duration-300">
        <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
          {weekDays.map(wd => <div key={wd} className="text-center text-[10px] md:text-xs font-black text-slate-400 uppercase">{wd}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {slots.map((day, idx) => {
            if (!day) return <div key={`blank-${idx}`} className="h-16 md:h-28 bg-slate-50/50 rounded-xl border border-slate-100/50"></div>;
            
            const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(year, month, day));
            const dayEvents = agendamentos.filter(a => a.data_agendamento === dateStr && a.status !== 'reprovado' && a.status !== 'cancelado');
            const isToday = dateStr === new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

            return (
              <div 
                key={day} 
                onClick={() => { setSelectedDate(new Date(year, month, day)); setViewMode('dia'); }}
                className={`h-16 md:h-28 p-1 md:p-2 rounded-xl border cursor-pointer transition-all flex flex-col hover:border-indigo-400 hover:shadow-md ${isToday ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'} ${dayEvents.length > 0 ? 'border-l-4 border-l-indigo-500' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <span className={`text-xs md:text-sm font-black ${isToday ? 'text-indigo-600' : 'text-slate-700'}`}>{day}</span>
                  {dayEvents.length > 0 && (
                    <span className="bg-indigo-100 text-indigo-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full md:hidden">
                      {dayEvents.length}
                    </span>
                  )}
                </div>
                
                <div className="flex-1 overflow-y-auto mt-1 space-y-1 custom-scrollbar hidden md:block">
                  {dayEvents.slice(0, 3).map(ev => (
                    <div key={ev.id} className={`text-[9px] font-bold px-1.5 py-0.5 rounded truncate ${ev.status === 'aprovado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {ev.hora_inicio.slice(0,5)} - {ev.titulo_evento}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                     <div className="text-[9px] text-slate-400 font-bold px-1 text-center">+{dayEvents.length - 3} eventos</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500 relative">
      
      {historicoModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <History size={24} className="text-indigo-600"/> Histórico de Edições
              </h3>
              <button onClick={() => setHistoricoModal(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
                <X size={24}/>
              </button>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto space-y-3 custom-scrollbar pr-2">
              {historicoModal.historico_edicao ? (
                historicoModal.historico_edicao.split('\n').map((linha, index) => (
                  <div key={index} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700">
                    {linha}
                  </div>
                ))
              ) : (
                <p className="text-center text-slate-400 font-bold py-4">Nenhuma edição registrada.</p>
              )}
            </div>

            <button onClick={() => setHistoricoModal(null)} className="w-full mt-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
              Fechar
            </button>
          </div>
        </div>
      )}

      {agendamentoEditando && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2"><Edit3 size={24} className="text-indigo-600"/> Editar Agendamento</h3>
              <button onClick={() => { setAgendamentoEditando(null); setAgendamentoForm(getFormDefaults()); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
                <X size={24}/>
              </button>
            </div>
            
            <form onSubmit={salvarEdicao} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Data</label>
                  <input type="date" required value={agendamentoForm.data_agendamento} onChange={e => setAgendamentoForm({...agendamentoForm, data_agendamento: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Início</label>
                  <input type="time" required value={agendamentoForm.hora_inicio} onChange={e => setAgendamentoForm({...agendamentoForm, hora_inicio: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Término</label>
                  <input type="time" required value={agendamentoForm.hora_fim} onChange={e => setAgendamentoForm({...agendamentoForm, hora_fim: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Ambiente</label>
                  <select required value={agendamentoForm.ambiente_id} onChange={e => setAgendamentoForm({...agendamentoForm, ambiente_id: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold">
                    {ambientes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Título do Evento</label>
                  <input type="text" required value={agendamentoForm.titulo_evento} onChange={e => setAgendamentoForm({...agendamentoForm, titulo_evento: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold" />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => { setAgendamentoEditando(null); setAgendamentoForm(getFormDefaults()); }} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-xs uppercase tracking-widest">Cancelar</button>
                <button type="submit" disabled={loading} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-widest">{loading ? 'Salvando...' : 'Salvar Alterações'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

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

      {/* TEMPLATE DO PDF OCULTO (Agora 100% blindado para a leitura via string) */}
      <div id="weekly-report-template" style={{ display: 'none' }}>
         <div style={{ background: 'white', width: '1080px', padding: '40px', boxSizing: 'border-box', color: 'black', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
           <div style={{ borderBottom: '6px solid #4f46e5', paddingBottom: '25px', marginBottom: '40px', pageBreakInside: 'avoid' }}>
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
                           <tr style={{ background: '#f8fafc', pageBreakInside: 'avoid' }}>
                               <th style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', textAlign: 'left', color: '#334155', width: '12%', fontWeight: 900 }}>HORÁRIO</th>
                               <th style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', textAlign: 'left', color: '#334155', width: '23%', fontWeight: 900 }}>AMBIENTE</th>
                               <th style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', textAlign: 'left', color: '#334155', width: '50%', fontWeight: 900 }}>EVENTO / OBSERVAÇÃO</th>
                               <th style={{ padding: '16px', border: '2px solid #cbd5e1', fontSize: '15px', textAlign: 'center', color: '#334155', width: '15%', fontWeight: 900 }}>LOTAÇÃO</th>
                           </tr>
                       </thead>
                       <tbody>
                           {groupedPdfBookings[dataStr].map(row => (
                               <tr key={row.id} style={{ pageBreakInside: 'avoid' }}>
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

           <div style={{ marginTop: '70px', paddingTop: '30px', borderTop: '3px solid #f1f5f9', textAlign: 'center', pageBreakInside: 'avoid' }}>
               <p style={{ fontSize: '14px', fontWeight: 900, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '5px' }}>SGE-GSU INTELLIGENCE • DOCUMENTO OFICIAL</p>
           </div>
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

      {userRole === 'regional_admin' && agendamentosPendentesGeral > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-6 py-5 rounded-[2rem] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-full shrink-0">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h4 className="font-black uppercase tracking-tight">Ação Necessária</h4>
              <p className="text-sm font-medium mt-1">
                Você tem <strong className="text-amber-600 bg-amber-100 px-2 py-0.5 rounded-md">{agendamentosPendentesGeral} agendamento(s)</strong> pendente(s) no sistema aguardando aprovação. Navegue pelas datas do calendário para avaliá-los.
              </p>
            </div>
          </div>
          <button 
            onClick={() => setActiveTab('calendario')} 
            className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md shrink-0"
          >
            Acessar Calendário
          </button>
        </div>
      )}

      {activeTab === 'calendario' && (
        <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 h-full">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 pb-6 border-b border-slate-100 gap-4">
            <div className="flex items-center gap-4">
               <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - (viewMode === 'mes' ? 1 : 0), selectedDate.getDate() - (viewMode === 'dia' ? 1 : 0)))} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"><ChevronLeft size={20}/></button>
               <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight w-48 text-center">
                 {viewMode === 'dia' 
                    ? selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
                    : selectedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                 }
               </h2>
               <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + (viewMode === 'mes' ? 1 : 0), selectedDate.getDate() + (viewMode === 'dia' ? 1 : 0)))} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"><ChevronRight size={20}/></button>
            </div>
            
            <div className="flex items-center gap-3">
               
               <div className="flex bg-slate-100 p-1 rounded-xl mr-2">
                 <button onClick={() => setViewMode('dia')} className={`px-4 py-1.5 text-xs font-black rounded-lg uppercase tracking-widest transition-all ${viewMode === 'dia' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Dia</button>
                 <button onClick={() => setViewMode('mes')} className={`px-4 py-1.5 text-xs font-black rounded-lg uppercase tracking-widest transition-all flex items-center gap-1 ${viewMode === 'mes' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                   Mês
                 </button>
               </div>

               <button onClick={() => { setSelectedDate(new Date()); setViewMode('dia'); }} className="px-5 py-2.5 bg-indigo-50 text-indigo-600 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-indigo-100 transition-all">Hoje</button>
               
               <button 
                  onClick={() => setShowPdfModal(true)}
                  className="bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95"
               >
                  <FileDown size={16} />
                  PDF
               </button>
            </div>
          </div>

          <div className="space-y-4 min-h-[400px]">
            {viewMode === 'mes' ? (
              renderCalendarioMes()
            ) : (
              dateBookings.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <Calendar size={48} className="mb-4 opacity-50" />
                  <p className="font-bold">Nenhum ambiente reservado para este dia.</p>
                </div>
              ) : (
                dateBookings.map(b => (
                  <div key={b.id} className={`p-6 bg-slate-50 border rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${b.status === 'reprovado' || b.status === 'cancelado' ? 'border-red-200 opacity-60' : 'border-slate-100 hover:shadow-md'}`}>
                    <div className="flex items-start gap-5">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${b.status === 'aprovado' ? 'bg-emerald-100 text-emerald-600' : b.status === 'reprovado' ? 'bg-red-100 text-red-600' : b.status === 'cancelado' ? 'bg-slate-200 text-slate-500' : 'bg-amber-100 text-amber-600'}`}>
                        <MapPin size={24} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-3 mb-1">
                          <h3 className={`font-black uppercase text-lg ${b.status === 'reprovado' || b.status === 'cancelado' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{b.titulo_evento}</h3>
                          {renderStatusBadge(b.status || 'pendente')}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm font-bold text-slate-500">
                          <span className="flex items-center gap-1.5"><Building2 size={14} className="text-indigo-500"/> {b.ambientes?.nome}</span>
                          <span className="flex items-center gap-1.5"><Clock size={14} className="text-indigo-500"/> {b.hora_inicio.slice(0,5)} às {b.hora_fim.slice(0,5)}</span>
                          <span className="flex items-center gap-1.5"><Users size={14} className="text-indigo-500"/> {b.quantidade_pessoas} pess.</span>
                        </div>
                        
                        {b.status === 'reprovado' && b.motivo_reprovacao && (
                          <p className="text-xs text-red-500 mt-2 font-bold bg-red-50 p-2 rounded-lg inline-block">Motivo: {b.motivo_reprovacao}</p>
                        )}
                        
                        {b.historico_edicao && (
                          <button 
                            onClick={() => setHistoricoModal(b)} 
                            className="mt-3 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 hover:text-indigo-700 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 rounded-lg transition-all"
                          >
                            <History size={12}/> Ver Histórico de Edição
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      <div className="text-right bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm w-full md:w-auto">
                        <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">Responsável</p>
                        <p className="text-sm font-bold text-indigo-700">{b.user_name}</p>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2 w-full md:w-auto">
                        {currentUser?.id === b.user_id && b.status !== 'cancelado' && (
                           <button onClick={() => cancelarMeuAgendamento(b)} className="px-3 py-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all">
                              Cancelar Meu Agendamento
                           </button>
                        )}

                        {userRole === 'regional_admin' && (
                          <div className="flex items-center gap-2">
                            {b.status === 'pendente' && (
                              <>
                                <button onClick={() => alterarStatus(b.id, 'aprovado')} className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg transition-all" title="Aprovar"><Check size={18}/></button>
                                <button onClick={() => alterarStatus(b.id, 'reprovado')} className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-all" title="Reprovar"><X size={18}/></button>
                              </>
                            )}
                            <button onClick={() => abrirModalEdicao(b)} className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-lg transition-all" title="Editar Agendamento"><Edit3 size={18}/></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      )}

      {activeTab === 'agendar' && (
        <div className="max-w-3xl mx-auto bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100">
          <div className="mb-8">
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Novo Agendamento</h2>
            <p className="text-sm font-bold text-slate-400 mt-1">Seu pedido passará por aprovação da administração.</p>
          </div>

          {errorMsg && (
             <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-2xl flex items-center gap-3 font-bold text-sm">
               <AlertTriangle size={20} /> {errorMsg}
             </div>
          )}
          {successMsg && (
             <div className="mb-6 p-4 bg-amber-50 text-amber-700 border border-amber-200 rounded-2xl flex items-center gap-3 font-bold text-sm">
               <Clock size={20} /> {successMsg}
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
              className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-all disabled:opacity-50 mt-4"
            >
              {loading ? 'Processando...' : 'Solicitar Agendamento'}
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