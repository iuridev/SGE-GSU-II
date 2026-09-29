import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';
import {
  Phone, Plus, X, Loader2, Search, RefreshCw, CalendarDays,
  BarChart3, ClipboardList, MessageSquare, CheckCircle2, AlertTriangle,
  Building2, FileDown, Send, Pencil, ListChecks,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';

// Chamados abertos por telefone direto com o órgão responsável (SEOM/SEFISC/
// outros), sem passar pelo Helpdesk do sistema — a escola só recebe um número
// de protocolo por telefone e repassa essa informação para a URE acompanhar.
// A URE também pode cadastrar protocolos e atualizar o andamento. Ver
// supabase/migrations/20260928000000_chamados_telefonicos.sql.

type Status = 'ABERTO' | 'EM_ANDAMENTO' | 'CONCLUIDO';
type Tab = 'protocolos' | 'indicadores';

interface EscolaOption {
  id: string;
  name: string;
}

interface ChamadoTelefonico {
  id: string;
  escola_id: string;
  escola_nome: string;
  protocolo: string;
  descricao: string;
  data_ocorrencia: string;
  atendido: 'SIM' | 'NAO';
  status: Status;
  origem_cadastro: 'escola' | 'ure';
  autor_nome: string;
  data_registro: string;
  data_conclusao: string | null;
  updated_at: string;
}

interface Comentario {
  id: string;
  chamado_id: string;
  comentario: string;
  autor_nome: string;
  data_registro: string;
}

const STATUS_LABELS: Record<Status, string> = {
  ABERTO: 'Aberto', EM_ANDAMENTO: 'Em Andamento', CONCLUIDO: 'Concluído',
};
const STATUS_COLORS: Record<Status, string> = {
  ABERTO: '#3b82f6', EM_ANDAMENTO: '#f59e0b', CONCLUIDO: '#10b981',
};
const STATUS_BADGE: Record<Status, string> = {
  ABERTO: 'bg-blue-50 text-blue-700 border-blue-200',
  EM_ANDAMENTO: 'bg-amber-50 text-amber-700 border-amber-200',
  CONCLUIDO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const FORM_INITIAL = {
  escola_id: '',
  protocolo: '',
  descricao: '',
  data_ocorrencia: new Date().toISOString().split('T')[0],
  atendido: 'NAO' as 'SIM' | 'NAO',
  status: 'ABERTO' as Status,
};

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'protocolos', label: 'Protocolos', icon: <ListChecks size={16} /> },
  { id: 'indicadores', label: 'Indicadores', icon: <BarChart3 size={16} /> },
];

function formatDate(d?: string | null): string {
  if (!d) return '-';
  const p = d.split('-');
  if (p.length === 3 && p[0].length === 4) return `${p[2].slice(0, 2)}/${p[1]}/${p[0]}`;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString('pt-BR');
}

function formatDateTime(d?: string | null): string {
  if (!d) return '-';
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? d : parsed.toLocaleString('pt-BR');
}

export default function ChamadosTelefonicos() {
  const [userRole, setUserRole] = useState('');
  const [userName, setUserName] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [supervisorSchools, setSupervisorSchools] = useState<string[]>([]);

  const [escolas, setEscolas] = useState<EscolaOption[]>([]);
  const [chamados, setChamados] = useState<ChamadoTelefonico[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>('protocolos');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_INITIAL);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [selectedChamado, setSelectedChamado] = useState<ChamadoTelefonico | null>(null);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [loadingComentarios, setLoadingComentarios] = useState(false);
  const [novoComentario, setNovoComentario] = useState('');
  const [savingComentario, setSavingComentario] = useState(false);

  // ── Relatório Mensal (PDF) ────────────────────────────────────────────
  const [showRelatorioModal, setShowRelatorioModal] = useState(false);
  const [relatorioMes, setRelatorioMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [todosComentarios, setTodosComentarios] = useState<Comentario[]>([]);
  const [loadingRelatorio, setLoadingRelatorio] = useState(false);
  const [gerandoRelatorioPdf, setGerandoRelatorioPdf] = useState(false);
  const relatorioRef = useRef<HTMLDivElement>(null);

  const isSchoolManager = userRole === 'school_manager';
  const isUre = userRole === 'regional_admin' || userRole === 'dirigente';
  const isSupervisor = userRole === 'supervisor';
  const canWrite = isSchoolManager || isUre;
  const hasAccess = isSchoolManager || isUre || isSupervisor;

  useEffect(() => {
    fetchUser();
    fetchEscolas();
  }, []);

  useEffect(() => {
    if (!userRole) return;
    fetchChamados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole]);

  const fetchUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('full_name, role, school_id, supervisor_schools')
          .eq('id', user.id)
          .single();
        setUserName(profile?.full_name || user.email || 'Usuário');
        setUserRole(resolveViewRole(profile?.role || ''));
        setUserSchoolId(profile?.school_id || null);
        setSupervisorSchools(profile?.supervisor_schools || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchEscolas = async () => {
    try {
      const { data } = await supabase.from('schools').select('id, name').order('name');
      if (data) setEscolas(data as EscolaOption[]);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchChamados = async () => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('chamados_telefonicos')
        .select('*')
        .order('data_registro', { ascending: false });
      if (userRole === 'school_manager' && userSchoolId) {
        query = query.eq('escola_id', userSchoolId);
      }
      const { data, error } = await query;
      if (error) throw error;
      let rows: ChamadoTelefonico[] = data || [];
      if (userRole === 'supervisor') {
        const meus = new Set(supervisorSchools);
        rows = rows.filter(r => meus.has(r.escola_id));
      }
      setChamados(rows);
    } catch (e) {
      console.error('Erro ao carregar chamados telefônicos:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchComentarios = async (chamadoId: string) => {
    setLoadingComentarios(true);
    try {
      const { data, error } = await (supabase as any)
        .from('chamados_telefonicos_comentarios')
        .select('*')
        .eq('chamado_id', chamadoId)
        .order('data_registro', { ascending: false });
      if (error) throw error;
      setComentarios(data || []);
    } catch (e) {
      console.error('Erro ao carregar comentários:', e);
      setComentarios([]);
    } finally {
      setLoadingComentarios(false);
    }
  };

  const openDetail = (chamado: ChamadoTelefonico) => {
    setSelectedChamado(chamado);
    setNovoComentario('');
    fetchComentarios(chamado.id);
  };

  const openNovoForm = () => {
    setEditingId(null);
    setForm({
      ...FORM_INITIAL,
      escola_id: isSchoolManager ? (userSchoolId || '') : '',
    });
    setShowForm(true);
  };

  const openEditForm = (chamado: ChamadoTelefonico) => {
    setEditingId(chamado.id);
    setForm({
      escola_id: chamado.escola_id,
      protocolo: chamado.protocolo,
      descricao: chamado.descricao,
      data_ocorrencia: chamado.data_ocorrencia,
      atendido: chamado.atendido,
      status: chamado.status,
    });
    setSelectedChamado(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEscolaId = isSchoolManager ? userSchoolId : form.escola_id;
    if (!targetEscolaId) {
      alert('Selecione a escola.');
      return;
    }
    if (!form.protocolo.trim() || !form.descricao.trim() || !form.data_ocorrencia) {
      alert('Protocolo, descrição e data da ocorrência são obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      const escola = escolas.find(e => e.id === targetEscolaId);
      const agoraIso = new Date().toISOString();
      const payload: Record<string, unknown> = {
        escola_id: targetEscolaId,
        escola_nome: escola?.name || '',
        protocolo: form.protocolo.trim(),
        descricao: form.descricao.trim(),
        data_ocorrencia: form.data_ocorrencia,
        atendido: form.atendido,
        status: form.status,
        updated_at: agoraIso,
      };

      if (editingId) {
        // data_conclusao só é gravada na transição de status (diferente de
        // updated_at, tocado em toda edição) — sem isso o Relatório Mensal não
        // consegue saber QUANDO um chamado foi de fato concluído.
        const anterior = chamados.find(c => c.id === editingId);
        const eraConcluido = anterior?.status === 'CONCLUIDO';
        const ficaConcluido = form.status === 'CONCLUIDO';
        if (!eraConcluido && ficaConcluido) payload.data_conclusao = agoraIso;
        else if (eraConcluido && !ficaConcluido) payload.data_conclusao = null;

        const { error } = await (supabase as any).from('chamados_telefonicos').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await (supabase as any).from('chamados_telefonicos').insert([{
          ...payload,
          origem_cadastro: isSchoolManager ? 'escola' : 'ure',
          autor_id: user?.id,
          autor_nome: userName,
          data_registro: agoraIso,
          data_conclusao: form.status === 'CONCLUIDO' ? agoraIso : null,
        }]);
        if (error) throw error;
      }

      setShowForm(false);
      setForm(FORM_INITIAL);
      setEditingId(null);
      await fetchChamados();
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar o protocolo. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddComentario = async () => {
    if (!novoComentario.trim() || !selectedChamado) return;
    setSavingComentario(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from('chamados_telefonicos_comentarios').insert([{
        chamado_id: selectedChamado.id,
        comentario: novoComentario.trim(),
        autor_id: user?.id,
        autor_nome: userName,
      }]);
      if (error) throw error;
      setNovoComentario('');
      await fetchComentarios(selectedChamado.id);
    } catch (e) {
      console.error(e);
      alert('Erro ao registrar o comentário.');
    } finally {
      setSavingComentario(false);
    }
  };

  // ── Derivados ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return chamados.filter(c => {
      const matchSearch = !q ||
        c.protocolo?.toLowerCase().includes(q) ||
        c.escola_nome?.toLowerCase().includes(q) ||
        c.descricao?.toLowerCase().includes(q);
      const matchStatus = !filterStatus || c.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [chamados, searchTerm, filterStatus]);

  const stats = useMemo(() => ({
    total: chamados.length,
    abertos: chamados.filter(c => c.status === 'ABERTO').length,
    emAndamento: chamados.filter(c => c.status === 'EM_ANDAMENTO').length,
    concluidos: chamados.filter(c => c.status === 'CONCLUIDO').length,
    naoAtendidos: chamados.filter(c => c.atendido === 'NAO' && c.status !== 'CONCLUIDO').length,
  }), [chamados]);

  const statusChartData = useMemo(() => (['ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO'] as const).map(s => ({
    name: STATUS_LABELS[s], quantidade: chamados.filter(c => c.status === s).length, color: STATUS_COLORS[s],
  })).filter(d => d.quantidade > 0), [chamados]);

  const chartByEscola = useMemo(() => {
    const map = new Map<string, number>();
    chamados.forEach(c => { if (c.escola_nome) map.set(c.escola_nome, (map.get(c.escola_nome) || 0) + 1); });
    return Array.from(map.entries())
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [chamados]);

  const chartByMonth = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      const abertos = chamados.filter(c => c.data_registro?.startsWith(key)).length;
      const concluidos = chamados.filter(c => c.data_conclusao?.startsWith(key)).length;
      months.push({ mes: label, Abertos: abertos, Concluídos: concluidos });
    }
    return months;
  }, [chamados]);

  // ── Relatório Mensal ────────────────────────────────────────────────────
  const opcoesMesRelatorio = useMemo(() => {
    const opts: { key: string; label: string }[] = [];
    const base = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      opts.push({ key, label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) });
    }
    return opts;
  }, []);

  const mesLabelRelatorio = (mesStr: string) => {
    const [ano, mesNum] = mesStr.split('-').map(Number);
    if (!ano || !mesNum) return mesStr;
    return new Date(ano, mesNum - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const abrirRelatorioMensal = async () => {
    setShowRelatorioModal(true);
    setLoadingRelatorio(true);
    try {
      const { data, error } = await (supabase as any)
        .from('chamados_telefonicos_comentarios')
        .select('id, chamado_id, comentario, autor_nome, data_registro');
      if (error) throw error;
      setTodosComentarios(data || []);
    } catch (e) {
      console.error('Erro ao carregar atualizações para o relatório:', e);
    } finally {
      setLoadingRelatorio(false);
    }
  };

  const relatorioMetrics = useMemo(() => {
    const mes = relatorioMes;
    const abertosNoMes = chamados.filter(c => c.data_registro?.startsWith(mes)).length;
    const concluidosNoMes = chamados.filter(c => c.data_conclusao?.startsWith(mes)).length;
    const comentariosNoMes = todosComentarios.filter(c => c.data_registro?.startsWith(mes));
    const chamadosAtualizadosNoMes = new Set(comentariosNoMes.map(c => c.chamado_id)).size;

    const [anoSel, mesSelNum] = mes.split('-').map(Number);
    const tendencia = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(anoSel, (mesSelNum - 1) - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      const abertos = chamados.filter(c => c.data_registro?.startsWith(key)).length;
      const concluidos = chamados.filter(c => c.data_conclusao?.startsWith(key)).length;
      tendencia.push({ mes: label, Abertos: abertos, Concluídos: concluidos });
    }

    return {
      abertosNoMes, concluidosNoMes,
      atualizacoesNoMes: comentariosNoMes.length,
      chamadosAtualizadosNoMes,
      tendencia,
    };
  }, [relatorioMes, chamados, todosComentarios]);

  const gerarRelatorioMensalPdf = async () => {
    if (!relatorioRef.current) return;
    setGerandoRelatorioPdf(true);
    try {
      await new Promise(r => setTimeout(r, 400));
      const canvas = await html2canvas(relatorioRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/png');

      const doc = new jsPDF();
      const pdfWidth = doc.internal.pageSize.getWidth();
      const pdfHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const currentY = 40;

      let printWidth = pdfWidth - margin * 2;
      let printHeight = (canvas.height * printWidth) / canvas.width;
      const maxHeight = pdfHeight - currentY - margin;
      if (printHeight > maxHeight) {
        const ratio = maxHeight / printHeight;
        printHeight = maxHeight;
        printWidth *= ratio;
      }
      doc.addImage(imgData, 'PNG', margin, currentY, printWidth, printHeight);

      addTimbradoAllPages(doc);
      doc.save(`Relatorio_Mensal_Chamados_Telefonicos_${relatorioMes}.pdf`);
      setShowRelatorioModal(false);
    } catch (err) {
      console.error(err);
      alert('Houve um erro ao gerar o PDF. Tente novamente.');
    } finally {
      setGerandoRelatorioPdf(false);
    }
  };

  if (!hasAccess) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-center text-slate-400 text-sm">
          <Phone size={36} className="mx-auto mb-2 opacity-30" />
          Seu perfil não tem acesso a este módulo.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Phone className="text-pink-500" size={28} />
            Chamados por Telefone
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Protocolos abertos por ligação direta com o órgão responsável, repassados pela escola para acompanhamento da URE
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={fetchChamados}
            className="flex items-center gap-2 px-3 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm"
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
          {isUre && (
            <button
              onClick={abrirRelatorioMensal}
              className="flex items-center gap-2 px-3 py-2 text-teal-700 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors text-sm font-medium"
            >
              <ClipboardList size={16} />
              Relatório Mensal
            </button>
          )}
          {canWrite && (
            <button
              onClick={openNovoForm}
              className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors text-sm font-medium"
            >
              <Plus size={18} />
              Novo Protocolo
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total de Protocolos', value: stats.total, icon: <BarChart3 size={20} className="text-blue-600" />, bg: 'bg-blue-50' },
          { label: 'Abertos', value: stats.abertos, icon: <AlertTriangle size={20} className="text-blue-600" />, bg: 'bg-blue-50' },
          { label: 'Em Andamento', value: stats.emAndamento, icon: <RefreshCw size={20} className="text-amber-600" />, bg: 'bg-amber-50' },
          { label: 'Concluídos', value: stats.concluidos, icon: <CheckCircle2 size={20} className="text-emerald-600" />, bg: 'bg-emerald-50' },
          { label: 'Não Atendidos (ativos)', value: stats.naoAtendidos, icon: <AlertTriangle size={20} className="text-red-600" />, bg: 'bg-red-50' },
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === t.id ? 'border-pink-600 text-pink-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Aba: Protocolos */}
      {activeTab === 'protocolos' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar protocolo, escola ou descrição..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white"
            >
              <option value="">Todos os status</option>
              {(['ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO'] as const).map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <span className="text-xs text-slate-400 ml-auto">{filtered.length} registro(s)</span>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex justify-center items-center py-16">
                <Loader2 size={32} className="animate-spin text-pink-500" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Phone size={48} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum protocolo encontrado.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    {['Protocolo', 'Escola', 'Data Ocorrência', 'Descrição', 'Atendido?', 'Status', ''].map((h, i) => (
                      <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openDetail(c)}>
                      <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700 whitespace-nowrap">{c.protocolo}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{c.escola_nome}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(c.data_ocorrencia)}</td>
                      <td className="px-4 py-3 text-slate-500 max-w-xs truncate" title={c.descricao}>{c.descricao}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.atendido === 'SIM' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {c.atendido === 'SIM' ? 'Sim' : 'Não'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[c.status]}`}>
                          {STATUS_LABELS[c.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-pink-600">
                          <MessageSquare size={14} /> Detalhes
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Aba: Indicadores */}
      {activeTab === 'indicadores' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <BarChart3 size={16} className="text-blue-500" />
                Situação Atual dos Protocolos
              </h2>
              {statusChartData.length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">Nenhum dado disponível</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={statusChartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v) => [v, 'Protocolos']} />
                    <Bar dataKey="quantidade" radius={[4, 4, 0, 0]}>
                      {statusChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <RefreshCw size={16} className="text-emerald-500" />
                Protocolos nos Últimos 6 Meses
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartByMonth} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Abertos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Concluídos" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {!isSchoolManager && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Building2 size={16} className="text-violet-500" />
                Top 8 Escolas — Quantidade de Protocolos
              </h2>
              {chartByEscola.length === 0 ? (
                <div className="flex items-center justify-center h-[180px] text-slate-400 text-sm">Nenhum dado disponível</div>
              ) : (
                <ResponsiveContainer width="100%" height={180 + chartByEscola.length * 10}>
                  <BarChart data={chartByEscola} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis dataKey="nome" type="category" tick={{ fontSize: 11 }} width={160} />
                    <Tooltip formatter={(v) => [v, 'Protocolos']} />
                    <Bar dataKey="total" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal: Novo Protocolo / Editar */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Phone size={20} className="text-pink-600" />
                {editingId ? 'Editar Protocolo' : 'Novo Protocolo por Telefone'}
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
                  disabled={isSchoolManager}
                  value={form.escola_id}
                  onChange={e => setForm(prev => ({ ...prev, escola_id: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="">Selecione a escola...</option>
                  {escolas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nº do Protocolo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text" required
                  value={form.protocolo}
                  onChange={e => setForm(prev => ({ ...prev, protocolo: e.target.value }))}
                  placeholder="Ex: 2026123456"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Data da Ocorrência <span className="text-red-500">*</span>
                </label>
                <input
                  type="date" required
                  value={form.data_ocorrencia}
                  onChange={e => setForm(prev => ({ ...prev, data_ocorrencia: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Descrição do Problema <span className="text-red-500">*</span>
                </label>
                <textarea
                  required rows={3}
                  value={form.descricao}
                  onChange={e => setForm(prev => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Descreva o problema relatado na ligação..."
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Foi atendido?</label>
                  <select
                    value={form.atendido}
                    onChange={e => setForm(prev => ({ ...prev, atendido: e.target.value as 'SIM' | 'NAO' }))}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white"
                  >
                    <option value="NAO">Não</option>
                    <option value="SIM">Sim</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Status (acompanhamento)</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(prev => ({ ...prev, status: e.target.value as Status }))}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 bg-white"
                  >
                    {(['ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO'] as const).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
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
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-pink-600 rounded-lg hover:bg-pink-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : 'Salvar Protocolo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Detalhe do protocolo + comentários de acompanhamento */}
      {selectedChamado && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Phone size={20} className="text-pink-600" />
                  Protocolo {selectedChamado.protocolo}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">{selectedChamado.escola_nome}</p>
              </div>
              <button onClick={() => setSelectedChamado(null)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[selectedChamado.status]}`}>
                    {STATUS_LABELS[selectedChamado.status]}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    selectedChamado.atendido === 'SIM' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  }`}>
                    Atendido: {selectedChamado.atendido === 'SIM' ? 'Sim' : 'Não'}
                  </span>
                  <span className="text-xs text-slate-400">
                    Ocorrência em {formatDate(selectedChamado.data_ocorrencia)}
                  </span>
                </div>
                <p className="text-sm text-slate-700">{selectedChamado.descricao}</p>
                <p className="text-xs text-slate-400">
                  Cadastrado por {selectedChamado.autor_nome} ({selectedChamado.origem_cadastro === 'escola' ? 'escola' : 'URE'}) em {formatDateTime(selectedChamado.data_registro)}
                  {selectedChamado.data_conclusao && <> · Concluído em {formatDateTime(selectedChamado.data_conclusao)}</>}
                </p>
                {canWrite && (
                  <button
                    onClick={() => openEditForm(selectedChamado)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-pink-600 hover:text-pink-800 mt-1"
                  >
                    <Pencil size={13} /> Editar dados do protocolo
                  </button>
                )}
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <MessageSquare size={13} /> Comentários de Acompanhamento
                </h3>
                {loadingComentarios ? (
                  <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-pink-500" /></div>
                ) : comentarios.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">Nenhum comentário registrado ainda.</p>
                ) : (
                  <ol className="space-y-3">
                    {comentarios.map(c => (
                      <li key={c.id} className="border-l-2 border-pink-200 pl-3">
                        <p className="text-xs text-slate-400">{formatDateTime(c.data_registro)} · {c.autor_nome}</p>
                        <p className="text-sm text-slate-700 mt-0.5">{c.comentario}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            {canWrite && (
              <div className="p-4 border-t border-slate-100 flex gap-2">
                <input
                  type="text"
                  value={novoComentario}
                  onChange={e => setNovoComentario(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddComentario()}
                  placeholder="Adicionar comentário de acompanhamento..."
                  className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
                <button
                  onClick={handleAddComentario}
                  disabled={savingComentario || !novoComentario.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 transition-colors text-sm font-medium"
                >
                  {savingComentario ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Relatório Mensal (PDF) */}
      {isUre && showRelatorioModal && (
        <div className="fixed inset-0 z-[110] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ClipboardList size={20} className="text-teal-600" /> Relatório Mensal
              </h2>
              <button onClick={() => setShowRelatorioModal(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
              <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5"><CalendarDays size={15} /> Mês de referência:</label>
              <select
                value={relatorioMes}
                onChange={e => setRelatorioMes(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {opcoesMesRelatorio.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>

            <div className="overflow-y-auto flex-1 p-5">
              {loadingRelatorio ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="animate-spin text-teal-600" size={32} />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando atualizações...</span>
                </div>
              ) : (
                <div ref={relatorioRef} className="space-y-5 bg-white p-1">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Relatório Mensal — Chamados por Telefone</h3>
                    <p className="text-xs text-slate-500">Referência: {mesLabelRelatorio(relatorioMes)} • Gerado em {new Date().toLocaleString('pt-BR')}</p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="border border-slate-100 rounded-xl p-3">
                      <p className="text-xs text-slate-500 font-medium">Protocolos Abertos no Mês</p>
                      <p className="text-2xl font-bold text-slate-800 mt-1">{relatorioMetrics.abertosNoMes}</p>
                    </div>
                    <div className="border border-slate-100 rounded-xl p-3">
                      <p className="text-xs text-slate-500 font-medium">Concluídos no Mês</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">{relatorioMetrics.concluidosNoMes}</p>
                    </div>
                    <div className="border border-slate-100 rounded-xl p-3">
                      <p className="text-xs text-slate-500 font-medium">Atualizações no Mês</p>
                      <p className="text-2xl font-bold text-blue-600 mt-1">{relatorioMetrics.atualizacoesNoMes}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{relatorioMetrics.chamadosAtualizadosNoMes} protocolo(s) com acompanhamento</p>
                    </div>
                    <div className="border border-slate-100 rounded-xl p-3 bg-slate-50">
                      <p className="text-xs text-slate-500 font-medium">Total de Protocolos</p>
                      <p className="text-2xl font-bold text-slate-800 mt-1">{stats.total}</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 mb-2">Abertos x Concluídos (últimos 6 meses)</h4>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={relatorioMetrics.tendencia} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Abertos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Concluídos" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 mb-2">Situação Atual dos Protocolos</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={statusChartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip formatter={(v) => [v, 'Protocolos']} />
                        <Bar dataKey="quantidade" radius={[4, 4, 0, 0]}>
                          {statusChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setShowRelatorioModal(false)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={gerarRelatorioMensalPdf}
                disabled={gerandoRelatorioPdf || loadingRelatorio}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-60 transition-colors"
              >
                {gerandoRelatorioPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                {gerandoRelatorioPdf ? 'Gerando PDF...' : 'Baixar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
