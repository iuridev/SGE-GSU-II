import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import {
  Plus, Search, X, Loader2, CalendarDays, Video,
  MapPin, BarChart3, TrendingUp, RefreshCw, ExternalLink,
  ClipboardList, ArrowRightLeft, Package, Check, Mail, History, Pencil,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

const SHEET_URL = import.meta.env.VITE_VISITAS_SHEET_URL as string;

const CHART_COLORS = [
  '#0d9488', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4',
];

const PAUTAS = [
  'Orientação Educação Patrimonial',
  'Dúvidas sobre Processo',
  'Cadastro/Baixa de Item',
  'Remanejamento',
  'Furto/Sinistro',
  'Outros',
];

const CANAIS = ['Teams', 'E-mail'] as const;
type Canal = typeof CANAIS[number];

type Tab = 'atendimentos' | 'acoes' | 'remanejamentos';

interface EscolaOption {
  id: string;
  name: string;
  fde_code?: string;
}

interface Atendimento {
  id: string;
  data_atendimento: string;
  escola_id: string;
  escola_nome: string;
  fde_code: string;
  atendente_nome: string;
  canal: string;
  pauta: string;
  processo_identificador: string;
  duracao_minutos: string;
  observacoes: string;
  data_registro: string;
}

interface Observacao {
  id: string;
  processo_origem: string;
  processo_id: string;
  processo_identificador: string;
  tipo_processo: string;
  escola_id: string;
  escola_nome: string;
  etapa_atual: string;
  observacao: string;
  autor_nome: string;
  data_registro: string;
}

interface Remanejamento {
  id: string;
  escola_origem_id: string;
  escola_origem_nome: string;
  escola_destino_id: string;
  escola_destino_nome: string;
  numero_patrimonial: string;
  descricao: string;
  numero_documento: string;
  cadastrado_sam: string;
  autor_nome: string;
  data_registro: string;
}

interface ProcessoOption {
  origem: 'asset_process' | 'processo_furto' | 'atendimento' | 'remanejamento';
  id: string;
  identificador: string;
  tipoLabel: string;
  escolaId: string;
  escolaNome: string;
  situacaoLabel: string;
}

const ATENDIMENTO_INITIAL = {
  escola_id: '', escola_nome: '', fde_code: '',
  data_atendimento: new Date().toISOString().split('T')[0],
  canal: 'Teams' as Canal,
  pauta: '', duracao_minutos: '', observacoes: '',
};

const REMANEJAMENTO_INITIAL = {
  escola_origem_id: '', escola_origem_nome: '',
  escola_destino_id: '', escola_destino_nome: '',
  numero_patrimonial: '', descricao: '', numero_documento: '',
  cadastrado_sam: false,
};

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'atendimentos', label: 'Atendimentos (Teams / E-mail)', icon: <Video size={16} /> },
  { id: 'acoes', label: 'Ações / Observações em Processos', icon: <ClipboardList size={16} /> },
  { id: 'remanejamentos', label: 'Remanejamentos', icon: <ArrowRightLeft size={16} /> },
];

export default function AtendimentoPatrimonio() {
  const [activeTab, setActiveTab] = useState<Tab>('atendimentos');
  const [userRole, setUserRole] = useState('');
  const [userName, setUserName] = useState('');
  const [escolas, setEscolas] = useState<EscolaOption[]>([]);

  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [observacoes, setObservacoes] = useState<Observacao[]>([]);
  const [remanejamentos, setRemanejamentos] = useState<Remanejamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCanal, setFilterCanal] = useState('');

  const [showAtendimentoForm, setShowAtendimentoForm] = useState(false);
  const [atendimentoForm, setAtendimentoForm] = useState(ATENDIMENTO_INITIAL);
  const [processoVinculado, setProcessoVinculado] = useState<ProcessoOption | null>(null);
  const [editingAtendimentoId, setEditingAtendimentoId] = useState<string | null>(null);

  const [showRemanejamentoForm, setShowRemanejamentoForm] = useState(false);
  const [remanejamentoForm, setRemanejamentoForm] = useState(REMANEJAMENTO_INITIAL);
  const [editingRemanejamentoId, setEditingRemanejamentoId] = useState<string | null>(null);

  const [processos, setProcessos] = useState<ProcessoOption[]>([]);
  const [loadingProcessos, setLoadingProcessos] = useState(false);
  const [pickerContext, setPickerContext] = useState<null | 'atendimento' | 'observacao'>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  // Só usado quando pickerContext === 'observacao': permite escolher entre vincular a
  // ação a um processo cadastrado, a um atendimento (Teams) ou a um remanejamento já
  // registrado, pelo ID dele.
  const [pickerTab, setPickerTab] = useState<'processos' | 'atendimentos' | 'remanejamentos'>('processos');

  const [selectedProcesso, setSelectedProcesso] = useState<ProcessoOption | null>(null);
  const [showObsForm, setShowObsForm] = useState(false);
  const [obsText, setObsText] = useState('');

  const isAdmin = userRole === 'regional_admin';

  useEffect(() => {
    fetchUser();
    fetchEscolas();
  }, []);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // supabase.functions.invoke() joga um FunctionsHttpError genérico quando a function
  // responde com status != 2xx — a mensagem real (JSON { error }) vem em error.context.
  async function invoke(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke('patrimonio-atendimento', {
      body: { action, ...payload },
    });
    if (error) {
      let message = error.message;
      const context = (error as any).context;
      if (context && typeof context.json === 'function') {
        try {
          const body = await context.clone().json();
          if (body?.error) message = body.error;
        } catch { /* corpo não é JSON, mantém mensagem padrão */ }
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  const fetchUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('full_name, role')
          .eq('id', user.id)
          .single();
        setUserName(profile?.full_name || user.email || 'Usuário');
        setUserRole(resolveViewRole(profile?.role || ''));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchEscolas = async () => {
    try {
      const { data } = await supabase.from('schools').select('id, name, fde_code').order('name');
      if (data) setEscolas(data as EscolaOption[]);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [a, o, r] = await Promise.all([
        invoke('listar_atendimentos'),
        invoke('listar_observacoes'),
        invoke('listar_remanejamentos'),
      ]);
      setAtendimentos(Array.isArray(a) ? a : []);
      setObservacoes(Array.isArray(o) ? o : []);
      setRemanejamentos(Array.isArray(r) ? r : []);
    } catch (e) {
      console.error('Erro ao carregar dados:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchProcessos = async () => {
    setLoadingProcessos(true);
    try {
      const [{ data: assetData }, { data: furtoData }] = await Promise.all([
        (supabase as any).from('asset_processes').select('id, sei_number, type, school_id, current_step, status, schools(name)'),
        (supabase as any).from('processos_furtos').select('id, numero_sei, tipo_ocorrencia, escola_id, situacao, schools(name)'),
      ]);
      const fromAsset: ProcessoOption[] = (assetData || []).map((p: any) => ({
        origem: 'asset_process' as const,
        id: p.id,
        identificador: p.sei_number || '(sem SEI)',
        tipoLabel: p.type,
        escolaId: p.school_id,
        escolaNome: p.schools?.name || '-',
        situacaoLabel: p.current_step || p.status || '',
      }));
      const fromFurto: ProcessoOption[] = (furtoData || []).map((p: any) => ({
        origem: 'processo_furto' as const,
        id: p.id,
        identificador: p.numero_sei || '(sem SEI)',
        tipoLabel: p.tipo_ocorrencia,
        escolaId: p.escola_id,
        escolaNome: p.schools?.name || '-',
        situacaoLabel: p.situacao || '',
      }));
      setProcessos([...fromAsset, ...fromFurto]);
    } catch (e) {
      console.error('Erro ao carregar processos:', e);
    } finally {
      setLoadingProcessos(false);
    }
  };

  const openPicker = (ctx: 'atendimento' | 'observacao') => {
    setPickerSearch('');
    setPickerTab('processos');
    setPickerContext(ctx);
    if (processos.length === 0) fetchProcessos();
  };

  const atendimentoToProcessoOption = (a: Atendimento): ProcessoOption => ({
    origem: 'atendimento',
    id: a.id,
    identificador: a.id,
    tipoLabel: `Atendimento ${a.canal || 'Teams'}`,
    escolaId: a.escola_id,
    escolaNome: a.escola_nome,
    situacaoLabel: `${a.pauta}${a.data_atendimento ? ` • ${formatDate(a.data_atendimento)}` : ''}`,
  });

  const remanejamentoToProcessoOption = (r: Remanejamento): ProcessoOption => ({
    origem: 'remanejamento',
    id: r.id,
    identificador: r.numero_documento || r.numero_patrimonial,
    tipoLabel: 'Remanejamento',
    escolaId: r.escola_destino_id || r.escola_origem_id,
    escolaNome: `${r.escola_origem_nome} → ${r.escola_destino_nome}`,
    situacaoLabel: r.numero_patrimonial ? `Item: ${r.numero_patrimonial}` : '',
  });

  const handlePickerSelect = (p: ProcessoOption) => {
    if (pickerContext === 'atendimento') {
      setProcessoVinculado(p);
    } else if (pickerContext === 'observacao') {
      openDetail(p);
    }
    setPickerContext(null);
  };

  // Abre o modal de detalhe (linha do tempo de ações + formulário de nova ação para
  // admin) de um processo/atendimento específico. Usado tanto pelo seletor "Atualizar
  // Ação" quanto pelos botões "Ver linha do tempo" das tabelas de Atendimentos e Ações.
  const openDetail = (item: ProcessoOption) => {
    setSelectedProcesso(item);
    setObsText('');
    setShowObsForm(true);
  };

  const handleEscolaChange = (escolaId: string) => {
    const escola = escolas.find(e => e.id === escolaId);
    setAtendimentoForm(prev => ({
      ...prev, escola_id: escolaId, escola_nome: escola?.name || '', fde_code: escola?.fde_code || '',
    }));
  };

  const handleSubmitAtendimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!atendimentoForm.escola_id || !atendimentoForm.pauta) {
      alert('Escola e pauta são obrigatórias.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...atendimentoForm,
        processo_origem: processoVinculado?.origem || '',
        processo_id: processoVinculado?.id || '',
        processo_identificador: processoVinculado?.identificador || '',
      };
      if (editingAtendimentoId) {
        await invoke('editar_atendimento', { ...payload, id: editingAtendimentoId });
      } else {
        await invoke('registrar_atendimento', payload);
      }
      setShowAtendimentoForm(false);
      setAtendimentoForm({ ...ATENDIMENTO_INITIAL, data_atendimento: new Date().toISOString().split('T')[0] });
      setProcessoVinculado(null);
      setEditingAtendimentoId(null);
      setTimeout(fetchAll, 1500);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Erro ao registrar atendimento.');
    } finally {
      setSaving(false);
    }
  };

  const openEditAtendimento = (a: Atendimento) => {
    setEditingAtendimentoId(a.id);
    setAtendimentoForm({
      escola_id: a.escola_id, escola_nome: a.escola_nome, fde_code: a.fde_code,
      data_atendimento: a.data_atendimento, canal: (a.canal as Canal) || 'Teams',
      pauta: a.pauta, duracao_minutos: a.duracao_minutos, observacoes: a.observacoes,
    });
    setProcessoVinculado(null);
    setShowAtendimentoForm(true);
  };

  const handleSubmitObservacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProcesso || !obsText.trim()) return;
    setSaving(true);
    try {
      await invoke('registrar_observacao', {
        processo_origem: selectedProcesso.origem,
        processo_id: selectedProcesso.id,
        processo_identificador: selectedProcesso.identificador,
        tipo_processo: selectedProcesso.tipoLabel,
        escola_id: selectedProcesso.escolaId,
        escola_nome: selectedProcesso.escolaNome,
        etapa_atual: selectedProcesso.situacaoLabel,
        observacao: obsText.trim(),
      });
      setShowObsForm(false);
      setSelectedProcesso(null);
      setObsText('');
      setTimeout(fetchAll, 1500);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Erro ao registrar observação.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitRemanejamento = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = remanejamentoForm;
    if (!f.escola_origem_id || !f.escola_destino_id || !f.numero_patrimonial || !f.numero_documento) {
      alert('Escola origem, escola destino, nº patrimonial e nº do documento são obrigatórios.');
      return;
    }
    if (f.escola_origem_id === f.escola_destino_id) {
      alert('A escola de destino deve ser diferente da escola de origem.');
      return;
    }
    setSaving(true);
    try {
      if (editingRemanejamentoId) {
        await invoke('editar_remanejamento', { ...f, id: editingRemanejamentoId });
      } else {
        await invoke('registrar_remanejamento', f);
      }
      setShowRemanejamentoForm(false);
      setRemanejamentoForm(REMANEJAMENTO_INITIAL);
      setEditingRemanejamentoId(null);
      setTimeout(fetchAll, 1500);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Erro ao registrar remanejamento.');
    } finally {
      setSaving(false);
    }
  };

  const openEditRemanejamento = (r: Remanejamento) => {
    setEditingRemanejamentoId(r.id);
    setRemanejamentoForm({
      escola_origem_id: r.escola_origem_id, escola_origem_nome: r.escola_origem_nome,
      escola_destino_id: r.escola_destino_id, escola_destino_nome: r.escola_destino_nome,
      numero_patrimonial: r.numero_patrimonial, descricao: r.descricao,
      numero_documento: r.numero_documento, cadastrado_sam: r.cadastrado_sam === 'TRUE',
    });
    setShowRemanejamentoForm(true);
  };

  // ── Métricas / gráficos (aba Atendimentos) ────────────────────────────
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const atendimentosThisMonth = useMemo(
    () => atendimentos.filter(a => a.data_atendimento?.startsWith(currentMonthStr)),
    [atendimentos, currentMonthStr],
  );
  const uniqueEscolasAtendidas = useMemo(
    () => new Set(atendimentos.map(a => a.escola_nome).filter(Boolean)).size,
    [atendimentos],
  );
  const chartByPauta = useMemo(() => {
    const map = new Map<string, number>();
    atendimentos.forEach(a => { if (a.pauta) map.set(a.pauta, (map.get(a.pauta) || 0) + 1); });
    return Array.from(map.entries()).map(([pauta, total]) => ({ pauta, total })).sort((a, b) => b.total - a.total);
  }, [atendimentos]);
  const chartByMonth = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      const total = atendimentos.filter(a => a.data_atendimento?.startsWith(key)).length;
      months.push({ mes: label, total });
    }
    return months;
  }, [atendimentos]);
  const avgPerMonth = useMemo(() => {
    const active = chartByMonth.filter(m => m.total > 0);
    if (!active.length) return 0;
    return Math.round(active.reduce((s, m) => s + m.total, 0) / active.length);
  }, [chartByMonth]);

  const filteredAtendimentos = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return atendimentos.filter(a => {
      const matchCanal = !filterCanal || a.canal === filterCanal;
      const matchSearch = !q ||
        a.escola_nome?.toLowerCase().includes(q) ||
        a.pauta?.toLowerCase().includes(q) ||
        a.atendente_nome?.toLowerCase().includes(q);
      return matchCanal && matchSearch;
    });
  }, [atendimentos, searchTerm, filterCanal]);

  const filteredObservacoes = useMemo(() => {
    const q = searchTerm.toLowerCase();
    if (!q) return observacoes;
    return observacoes.filter(o =>
      o.escola_nome?.toLowerCase().includes(q) ||
      o.processo_identificador?.toLowerCase().includes(q) ||
      o.observacao?.toLowerCase().includes(q));
  }, [observacoes, searchTerm]);

  const filteredRemanejamentos = useMemo(() => {
    const q = searchTerm.toLowerCase();
    if (!q) return remanejamentos;
    return remanejamentos.filter(r =>
      r.escola_origem_nome?.toLowerCase().includes(q) ||
      r.escola_destino_nome?.toLowerCase().includes(q) ||
      r.numero_patrimonial?.toLowerCase().includes(q) ||
      r.numero_documento?.toLowerCase().includes(q));
  }, [remanejamentos, searchTerm]);

  const filteredProcessos = useMemo(() => {
    const q = pickerSearch.toLowerCase();
    if (!q) return processos;
    return processos.filter(p =>
      p.identificador?.toLowerCase().includes(q) ||
      p.escolaNome?.toLowerCase().includes(q) ||
      p.tipoLabel?.toLowerCase().includes(q));
  }, [processos, pickerSearch]);

  const filteredAtendimentosPicker = useMemo(() => {
    const q = pickerSearch.toLowerCase();
    if (!q) return atendimentos;
    return atendimentos.filter(a =>
      a.id?.toLowerCase().includes(q) ||
      a.escola_nome?.toLowerCase().includes(q) ||
      a.pauta?.toLowerCase().includes(q));
  }, [atendimentos, pickerSearch]);

  const filteredRemanejamentosPicker = useMemo(() => {
    const q = pickerSearch.toLowerCase();
    if (!q) return remanejamentos;
    return remanejamentos.filter(r =>
      r.numero_documento?.toLowerCase().includes(q) ||
      r.numero_patrimonial?.toLowerCase().includes(q) ||
      r.escola_origem_nome?.toLowerCase().includes(q) ||
      r.escola_destino_nome?.toLowerCase().includes(q));
  }, [remanejamentos, pickerSearch]);

  // Linha do tempo (mais recente primeiro) de todas as ações/observações já
  // registradas para o processo/atendimento aberto no modal de detalhe.
  const timelineDoSelecionado = useMemo(() => {
    if (!selectedProcesso) return [];
    return observacoes
      .filter(o => o.processo_origem === selectedProcesso.origem && o.processo_id === selectedProcesso.id)
      .sort((a, b) => (a.data_registro < b.data_registro ? 1 : -1));
  }, [observacoes, selectedProcesso]);

  const observacaoToProcessoOption = (o: Observacao): ProcessoOption => ({
    origem: (o.processo_origem || 'asset_process') as ProcessoOption['origem'],
    id: o.processo_id,
    identificador: o.processo_identificador,
    tipoLabel: o.tipo_processo,
    escolaId: o.escola_id,
    escolaNome: o.escola_nome,
    situacaoLabel: o.etapa_atual,
  });

  const formatDate = (d: string) => {
    if (!d) return '-';
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  };
  const formatDateTime = (d: string) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleString('pt-BR'); } catch { return d; }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Video className="text-teal-600" size={28} />
            Atendimento Patrimônio
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Atendimentos via Teams ou e-mail, observações em processos e remanejamentos de patrimônio
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={fetchAll}
            className="flex items-center gap-2 px-3 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm"
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
          {isAdmin && SHEET_URL && (
            <a
              href={SHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-medium"
            >
              <ExternalLink size={16} />
              Abrir Planilha
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setActiveTab(t.id); setSearchTerm(''); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {!['regional_admin', 'school_manager'].includes(userRole) && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-center text-slate-400 text-sm">
          <Video size={36} className="mx-auto mb-2 opacity-30" />
          Seu perfil não tem acesso a este módulo.
        </div>
      )}

      {['regional_admin', 'school_manager'].includes(userRole) && activeTab === 'atendimentos' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total de Atendimentos', value: atendimentos.length, icon: <BarChart3 size={20} className="text-blue-600" />, bg: 'bg-blue-50' },
              { label: 'Atendimentos no Mês', value: atendimentosThisMonth.length, icon: <CalendarDays size={20} className="text-emerald-600" />, bg: 'bg-emerald-50' },
              { label: 'Escolas Atendidas', value: uniqueEscolasAtendidas, icon: <MapPin size={20} className="text-violet-600" />, bg: 'bg-violet-50' },
              { label: 'Média / Mês', value: avgPerMonth, icon: <TrendingUp size={20} className="text-amber-600" />, bg: 'bg-amber-50' },
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Atendimentos por Pauta</h2>
              {loading || chartByPauta.length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">
                  {loading ? <Loader2 size={24} className="animate-spin" /> : 'Nenhum dado disponível'}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartByPauta} margin={{ top: 0, right: 10, left: -20, bottom: 70 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="pauta" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v) => [v, 'Atendimentos']} />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                      {chartByPauta.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Atendimentos nos Últimos 6 Meses</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartByMonth} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [v, 'Atendimentos']} />
                  <Bar dataKey="total" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text" placeholder="Buscar escola, pauta ou atendente..."
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <select
                value={filterCanal} onChange={e => setFilterCanal(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="">Todos os canais</option>
                {CANAIS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="text-xs text-slate-400">{filteredAtendimentos.length} registro(s)</span>
              {isAdmin && (
                <button
                  onClick={() => { setEditingAtendimentoId(null); setAtendimentoForm({ ...ATENDIMENTO_INITIAL, data_atendimento: new Date().toISOString().split('T')[0] }); setProcessoVinculado(null); setShowAtendimentoForm(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium ml-auto"
                >
                  <Plus size={18} /> Novo Atendimento
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex justify-center items-center py-16"><Loader2 size={32} className="animate-spin text-teal-500" /></div>
              ) : filteredAtendimentos.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <Video size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum atendimento registrado ainda</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Data', 'Canal', 'Escola', 'Pauta', 'Atendente', 'Duração', 'Processo', 'Observações', 'Registrado em', ''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredAtendimentos.map((a, i) => (
                      <tr key={a.id || i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDate(a.data_atendimento)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${a.canal === 'E-mail' ? 'bg-violet-50 text-violet-700' : 'bg-teal-50 text-teal-700'}`}>
                            {a.canal === 'E-mail' ? <Mail size={12} /> : <Video size={12} />} {a.canal || 'Teams'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{a.escola_nome}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">{a.pauta}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{a.atendente_nome}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{a.duracao_minutos ? `${a.duracao_minutos} min` : '-'}</td>
                        <td className="px-4 py-3 text-slate-500">{a.processo_identificador || '-'}</td>
                        <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{a.observacoes || '-'}</td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">{formatDateTime(a.data_registro)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openDetail(atendimentoToProcessoOption(a))}
                              title="Ver linha do tempo de ações"
                              className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                            >
                              <History size={16} />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => openEditAtendimento(a)}
                                title="Editar atendimento"
                                className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                              >
                                <Pencil size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {['regional_admin', 'school_manager'].includes(userRole) && activeTab === 'acoes' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: 'Total de Observações', value: observacoes.length, icon: <ClipboardList size={20} className="text-blue-600" />, bg: 'bg-blue-50' },
              { label: 'Processos com Observação', value: new Set(observacoes.map(o => o.processo_id)).size, icon: <Package size={20} className="text-violet-600" />, bg: 'bg-violet-50' },
              { label: 'No Mês', value: observacoes.filter(o => o.data_registro?.startsWith(currentMonthStr)).length, icon: <CalendarDays size={20} className="text-emerald-600" />, bg: 'bg-emerald-50' },
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

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text" placeholder="Buscar escola, processo ou observação..."
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <span className="text-xs text-slate-400">{filteredObservacoes.length} registro(s)</span>
              {isAdmin && (
                <button
                  onClick={() => openPicker('observacao')}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium ml-auto"
                >
                  <ClipboardList size={18} /> Atualizar Ação
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex justify-center items-center py-16"><Loader2 size={32} className="animate-spin text-teal-500" /></div>
              ) : filteredObservacoes.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <ClipboardList size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhuma observação registrada ainda</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Data', 'Escola', 'Processo', 'Etapa', 'Observação', 'Autor', ''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredObservacoes.map((o, i) => (
                      <tr key={o.id || i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDateTime(o.data_registro)}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{o.escola_nome}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          <span className="text-xs text-slate-400">{o.tipo_processo}</span><br />{o.processo_identificador}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{o.etapa_atual || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 max-w-sm">{o.observacao}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{o.autor_nome}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            onClick={() => openDetail(observacaoToProcessoOption(o))}
                            title="Ver linha do tempo de ações"
                            className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          >
                            <History size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {['regional_admin', 'school_manager'].includes(userRole) && activeTab === 'remanejamentos' && (
        <>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text" placeholder="Buscar escola, nº patrimonial ou documento..."
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <span className="text-xs text-slate-400">{filteredRemanejamentos.length} registro(s)</span>
              {isAdmin && (
                <button
                  onClick={() => { setEditingRemanejamentoId(null); setRemanejamentoForm(REMANEJAMENTO_INITIAL); setShowRemanejamentoForm(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium ml-auto"
                >
                  <Plus size={18} /> Novo Remanejamento
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex justify-center items-center py-16"><Loader2 size={32} className="animate-spin text-teal-500" /></div>
              ) : filteredRemanejamentos.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <ArrowRightLeft size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum remanejamento registrado ainda</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Data', 'Escola Origem', 'Escola Destino', 'Nº Patrimonial', 'Descrição', 'Nº Documento', 'Cadastrado no SAM?', 'Autor', ''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredRemanejamentos.map((r, i) => (
                      <tr key={r.id || i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDateTime(r.data_registro)}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{r.escola_origem_nome}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{r.escola_destino_nome}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.numero_patrimonial}</td>
                        <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{r.descricao || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.numero_documento}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {r.cadastrado_sam === 'TRUE' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                              <Check size={12} /> Sim
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">
                              <X size={12} /> Não
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.autor_nome}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openDetail(remanejamentoToProcessoOption(r))}
                              title="Ver linha do tempo de ações"
                              className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                            >
                              <History size={16} />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => openEditRemanejamento(r)}
                                title="Editar remanejamento"
                                className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                              >
                                <Pencil size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modal: Novo Atendimento */}
      {showAtendimentoForm && (
        <div className="fixed inset-0 z-[110] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                {editingAtendimentoId ? <Pencil size={20} className="text-teal-600" /> : <Video size={20} className="text-teal-600" />}
                {editingAtendimentoId ? 'Editar Atendimento' : 'Registrar Atendimento'}
              </h2>
              <button onClick={() => { setShowAtendimentoForm(false); setProcessoVinculado(null); setEditingAtendimentoId(null); }} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleSubmitAtendimento} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Canal <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {CANAIS.map(c => (
                    <button
                      key={c} type="button"
                      onClick={() => setAtendimentoForm(prev => ({ ...prev, canal: c }))}
                      className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                        atendimentoForm.canal === c
                          ? 'bg-teal-600 border-teal-600 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300'
                      }`}
                    >
                      {c === 'E-mail' ? <Mail size={16} /> : <Video size={16} />} {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Unidade Escolar <span className="text-red-500">*</span></label>
                <select required value={atendimentoForm.escola_id} onChange={e => handleEscolaChange(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
                  <option value="">Selecione a escola...</option>
                  {escolas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Data do Atendimento <span className="text-red-500">*</span></label>
                <input type="date" required value={atendimentoForm.data_atendimento}
                  onChange={e => setAtendimentoForm(prev => ({ ...prev, data_atendimento: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Pauta <span className="text-red-500">*</span></label>
                <select required value={atendimentoForm.pauta} onChange={e => setAtendimentoForm(prev => ({ ...prev, pauta: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
                  <option value="">Selecione a pauta...</option>
                  {PAUTAS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Duração (minutos)</label>
                <input type="number" min={0} value={atendimentoForm.duracao_minutos}
                  onChange={e => setAtendimentoForm(prev => ({ ...prev, duracao_minutos: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Processo relacionado (opcional)</label>
                {processoVinculado ? (
                  <div className="flex items-center justify-between gap-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2.5 text-sm">
                    <span className="text-teal-800 truncate">{processoVinculado.tipoLabel} • {processoVinculado.identificador} • {processoVinculado.escolaNome}</span>
                    <button type="button" onClick={() => setProcessoVinculado(null)} className="text-teal-600 hover:text-teal-800 shrink-0"><X size={16} /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => openPicker('atendimento')}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm border border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-teal-400 hover:text-teal-600 transition-colors">
                    <Package size={16} /> Vincular a um processo cadastrado
                  </button>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Observações</label>
                <textarea rows={3} value={atendimentoForm.observacoes}
                  onChange={e => setAtendimentoForm(prev => ({ ...prev, observacoes: e.target.value }))}
                  placeholder="Observações sobre o atendimento (opcional)..."
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2.5 text-xs text-slate-500">Atendente: <span className="font-medium text-slate-700">{userName || '...'}</span></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowAtendimentoForm(false); setProcessoVinculado(null); setEditingAtendimentoId(null); }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                  {saving ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : editingAtendimentoId ? 'Salvar Alterações' : 'Registrar Atendimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Novo Remanejamento */}
      {showRemanejamentoForm && (
        <div className="fixed inset-0 z-[110] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                {editingRemanejamentoId ? <Pencil size={20} className="text-teal-600" /> : <ArrowRightLeft size={20} className="text-teal-600" />}
                {editingRemanejamentoId ? 'Editar Remanejamento' : 'Registrar Remanejamento'}
              </h2>
              <button onClick={() => { setShowRemanejamentoForm(false); setEditingRemanejamentoId(null); }} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><X size={18} className="text-slate-500" /></button>
            </div>
            <form onSubmit={handleSubmitRemanejamento} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Escola de Origem <span className="text-red-500">*</span></label>
                <select required value={remanejamentoForm.escola_origem_id}
                  onChange={e => {
                    const escola = escolas.find(x => x.id === e.target.value);
                    setRemanejamentoForm(prev => ({ ...prev, escola_origem_id: e.target.value, escola_origem_nome: escola?.name || '' }));
                  }}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
                  <option value="">Selecione a escola de origem...</option>
                  {escolas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Escola de Destino <span className="text-red-500">*</span></label>
                <select required value={remanejamentoForm.escola_destino_id}
                  onChange={e => {
                    const escola = escolas.find(x => x.id === e.target.value);
                    setRemanejamentoForm(prev => ({ ...prev, escola_destino_id: e.target.value, escola_destino_nome: escola?.name || '' }));
                  }}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
                  <option value="">Selecione a escola de destino...</option>
                  {escolas.filter(e => e.id !== remanejamentoForm.escola_origem_id).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nº Patrimonial do Item <span className="text-red-500">*</span></label>
                <input type="text" required value={remanejamentoForm.numero_patrimonial}
                  onChange={e => setRemanejamentoForm(prev => ({ ...prev, numero_patrimonial: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Descrição do Item</label>
                <textarea rows={2} value={remanejamentoForm.descricao}
                  onChange={e => setRemanejamentoForm(prev => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Descrição do item (opcional)..."
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nº do Documento de Remanejamento <span className="text-red-500">*</span></label>
                <input type="text" required value={remanejamentoForm.numero_documento}
                  onChange={e => setRemanejamentoForm(prev => ({ ...prev, numero_documento: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <label className="flex items-center gap-2.5 bg-slate-50 rounded-lg px-3 py-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={remanejamentoForm.cadastrado_sam}
                  onChange={e => setRemanejamentoForm(prev => ({ ...prev, cadastrado_sam: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                <span className="text-sm font-medium text-slate-700">Foi cadastrado no SAM?</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowRemanejamentoForm(false); setEditingRemanejamentoId(null); }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                  {saving ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : editingRemanejamentoId ? 'Salvar Alterações' : 'Registrar Remanejamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Seletor de Processo/Atendimento (usado por "Vincular processo" e "Atualizar Ação") */}
      {pickerContext && (
        <div className="fixed inset-0 z-[120] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Package size={20} className="text-teal-600" /> {pickerTab === 'atendimentos' ? 'Selecionar Atendimento' : pickerTab === 'remanejamentos' ? 'Selecionar Remanejamento' : 'Selecionar Processo'}</h2>
              <button onClick={() => setPickerContext(null)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><X size={18} className="text-slate-500" /></button>
            </div>

            {pickerContext === 'observacao' && (
              <div className="flex gap-1 px-4 pt-3 border-b border-slate-100">
                {([
                  { id: 'processos' as const, label: 'Processos Cadastrados' },
                  { id: 'atendimentos' as const, label: 'Atendimentos (Teams / E-mail)' },
                  { id: 'remanejamentos' as const, label: 'Remanejamentos' },
                ]).map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setPickerTab(t.id); setPickerSearch(''); }}
                    className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
                      pickerTab === t.id ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text" autoFocus
                  placeholder={
                    pickerTab === 'atendimentos' ? 'Buscar por ID, escola ou pauta...'
                      : pickerTab === 'remanejamentos' ? 'Buscar por nº documento, nº patrimonial ou escola...'
                        : 'Buscar por nº SEI/BO, escola ou tipo...'
                  }
                  value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {pickerTab === 'atendimentos' ? (
                filteredAtendimentosPicker.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 text-sm">Nenhum atendimento encontrado</div>
                ) : (
                  <ul className="divide-y divide-slate-50">
                    {filteredAtendimentosPicker.map(a => (
                      <li key={a.id}>
                        <button
                          onClick={() => handlePickerSelect(atendimentoToProcessoOption(a))}
                          className="w-full text-left px-5 py-3 hover:bg-teal-50 transition-colors flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{a.pauta} — {a.escola_nome}</p>
                            <p className="text-xs text-slate-500">{formatDate(a.data_atendimento)} • {a.atendente_nome}</p>
                            <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">ID: {a.id}</p>
                          </div>
                          <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full shrink-0 ${a.canal === 'E-mail' ? 'bg-violet-50 text-violet-700' : 'bg-teal-50 text-teal-700'}`}>{a.canal || 'Teams'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : pickerTab === 'remanejamentos' ? (
                filteredRemanejamentosPicker.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 text-sm">Nenhum remanejamento encontrado</div>
                ) : (
                  <ul className="divide-y divide-slate-50">
                    {filteredRemanejamentosPicker.map(r => (
                      <li key={r.id}>
                        <button
                          onClick={() => handlePickerSelect(remanejamentoToProcessoOption(r))}
                          className="w-full text-left px-5 py-3 hover:bg-teal-50 transition-colors flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{r.escola_origem_nome} → {r.escola_destino_nome}</p>
                            <p className="text-xs text-slate-500">Item: {r.numero_patrimonial} • Doc: {r.numero_documento}</p>
                          </div>
                          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full shrink-0 bg-amber-50 text-amber-700">Remanejamento</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : loadingProcessos ? (
                <div className="flex justify-center items-center py-16"><Loader2 size={32} className="animate-spin text-teal-500" /></div>
              ) : filteredProcessos.length === 0 ? (
                <div className="text-center py-16 text-slate-400 text-sm">Nenhum processo encontrado</div>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {filteredProcessos.map(p => (
                    <li key={`${p.origem}-${p.id}`}>
                      <button
                        onClick={() => handlePickerSelect(p)}
                        className="w-full text-left px-5 py-3 hover:bg-teal-50 transition-colors flex items-center justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-800">{p.tipoLabel} • {p.identificador}</p>
                          <p className="text-xs text-slate-500">{p.escolaNome} {p.situacaoLabel && `— ${p.situacaoLabel}`}</p>
                        </div>
                        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full shrink-0 ${p.origem === 'processo_furto' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                          {p.origem === 'processo_furto' ? 'Furto' : 'Processo'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalhe do Processo/Atendimento — linha do tempo de ações + nova ação (admin) */}
      {showObsForm && selectedProcesso && (
        <div className="fixed inset-0 z-[130] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><History size={20} className="text-teal-600" /> Linha do Tempo de Ações</h2>
              <button onClick={() => { setShowObsForm(false); setSelectedProcesso(null); }} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><X size={18} className="text-slate-500" /></button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto flex-1">
              <div className="bg-slate-50 rounded-lg px-3 py-2.5 text-sm">
                <p className="font-medium text-slate-800">{selectedProcesso.tipoLabel} • {selectedProcesso.identificador}</p>
                <p className="text-xs text-slate-500 mt-0.5">{selectedProcesso.escolaNome} {selectedProcesso.situacaoLabel && `— ${selectedProcesso.situacaoLabel}`}</p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
                  Histórico ({timelineDoSelecionado.length})
                </h3>
                {timelineDoSelecionado.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">Nenhuma ação registrada ainda para este item.</p>
                ) : (
                  <div className="relative border-l-2 border-teal-100 pl-6 space-y-6">
                    {timelineDoSelecionado.map(o => (
                      <div key={o.id} className="relative">
                        <span className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-teal-600 ring-4 ring-white" />
                        <p className="text-xs text-slate-400">{formatDateTime(o.data_registro)} • <span className="font-medium text-slate-500">{o.autor_nome}</span></p>
                        {o.etapa_atual && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-teal-50 text-teal-700 mt-1">{o.etapa_atual}</span>
                        )}
                        <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{o.observacao}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {isAdmin ? (
              <form onSubmit={handleSubmitObservacao} className="p-5 pt-4 border-t border-slate-100 space-y-3 shrink-0">
                <label className="block text-sm font-medium text-slate-700">Adicionar nova ação <span className="text-red-500">*</span></label>
                <textarea rows={3} required value={obsText} onChange={e => setObsText(e.target.value)}
                  placeholder="Descreva a ação/atualização realizada neste processo/atendimento..."
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setShowObsForm(false); setSelectedProcesso(null); }}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Fechar</button>
                  <button type="submit" disabled={saving}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                    {saving ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : <><Check size={16} /> Salvar Ação</>}
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-5 pt-4 border-t border-slate-100 shrink-0">
                <button type="button" onClick={() => { setShowObsForm(false); setSelectedProcesso(null); }}
                  className="w-full px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Fechar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
