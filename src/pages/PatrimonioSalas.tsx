import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import {
  Package, Search, DoorOpen, ArrowRightLeft, History, Plus, X,
  Loader2, RefreshCw, ExternalLink, CheckCircle2, Undo2, AlertCircle,
  Building2, Trash2, HelpCircle, Info, FileDown,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addTimbradoAllPages, TIMBRADO_HEADER_H, TIMBRADO_FOOTER_H } from '../lib/pdfTimbrado';

const SHEET_URL = import.meta.env.VITE_VISITAS_SHEET_URL as string;

interface ItemPatrimonio {
  chapa: string;
  descricao: string;
  grupo: string;
  estadoConservacao: string;
  alocado: boolean;
  salaId: string | null;
  salaNome: string | null;
  alocadoPorNome: string | null;
  alocadoEm: string | null;
  naoEncontrado?: boolean;
}

interface Sala {
  id: string;
  nome: string;
  descricao?: string;
  ativa: boolean;
}

interface HistoricoEntry {
  id: string;
  chapa: string;
  descricaoItem: string;
  tipoEvento: 'ALOCACAO' | 'DEVOLUCAO';
  salaId: string;
  salaNome: string;
  usuarioNome: string;
  dataEvento: string;
  observacao?: string;
}

type TabId = 'minha-sala' | 'disponiveis' | 'salas' | 'historico';

export default function PatrimonioSalas() {
  const [userRole, setUserRole] = useState('');
  const [userSalasTrabalho, setUserSalasTrabalho] = useState<string[]>([]);

  const [itens, setItens] = useState<ItemPatrimonio[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [historico, setHistorico] = useState<HistoricoEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>('minha-sala');
  const [searchTerm, setSearchTerm] = useState('');
  const [salaFiltro, setSalaFiltro] = useState('');
  const [salaDestinoPorChapa, setSalaDestinoPorChapa] = useState<Record<string, string>>({});

  const [showSalaModal, setShowSalaModal] = useState(false);
  const [salaForm, setSalaForm] = useState({ nome: '', descricao: '' });
  const [savingSala, setSavingSala] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  const isAdmin = userRole === 'regional_admin';

  useEffect(() => {
    init();
  }, []);

  async function init() {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('role, salas_trabalho')
          .eq('id', user.id)
          .single();
        setUserRole(resolveViewRole(profile?.role || ''));
        setUserSalasTrabalho(profile?.salas_trabalho || []);
      }
      await Promise.all([fetchItens(), fetchSalas()]);
    } catch (e) {
      console.error(e);
      setLoadError(e instanceof Error ? e.message : 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }

  // supabase.functions.invoke() joga um FunctionsHttpError genérico quando a function
  // responde com status != 2xx — a mensagem real (JSON { error }) vem em error.context.
  async function invoke(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke('patrimonio-salas', {
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

  async function fetchItens() {
    const data = await invoke('listar_itens');
    setItens(data.itens || []);
  }

  async function fetchSalas() {
    const data = await invoke('listar_salas');
    setSalas(data.salas || []);
  }

  async function fetchHistorico(salaId?: string) {
    setHistoricoLoading(true);
    try {
      const data = await invoke('listar_historico', salaId ? { sala_id: salaId } : {});
      setHistorico(data.historico || []);
    } catch (e) {
      console.error(e);
    } finally {
      setHistoricoLoading(false);
    }
  }

  const salasAtivas = useMemo(() => salas.filter(s => s.ativa), [salas]);
  const allowedSalas = useMemo(
    () => isAdmin ? salasAtivas : salasAtivas.filter(s => userSalasTrabalho.includes(s.id)),
    [isAdmin, salasAtivas, userSalasTrabalho]
  );
  // Se o usuário só tem acesso a uma sala, ela é usada automaticamente (sem precisar escolher).
  const salaEfetiva = salaFiltro || (allowedSalas.length === 1 ? allowedSalas[0].id : '');

  useEffect(() => {
    if (activeTab === 'historico') fetchHistorico(salaEfetiva || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const itensDaSala = useMemo(
    () => itens.filter(i => i.alocado && i.salaId === salaEfetiva),
    [itens, salaEfetiva]
  );

  const itensDisponiveis = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return itens.filter(i => !i.alocado && (
      !q || i.chapa.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q)
    ));
  }, [itens, searchTerm]);

  async function handleAlocar(chapa: string) {
    if (allowedSalas.length === 0) {
      alert(isAdmin
        ? 'Cadastre uma sala antes de alocar itens.'
        : 'Você ainda não possui nenhuma sala de trabalho vinculada. Solicite ao administrador regional.');
      return;
    }
    const salaId = allowedSalas.length === 1 ? allowedSalas[0].id : salaDestinoPorChapa[chapa];
    if (!salaId) {
      alert('Selecione a sala de destino antes de alocar.');
      return;
    }
    setActionLoading(chapa);
    try {
      await invoke('alocar_item', { chapa, sala_id: salaId });
      await fetchItens();
    } catch (e: any) {
      alert(e.message || 'Erro ao alocar item.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDevolver(chapa: string) {
    if (!confirm('Devolver este item para a lista geral?')) return;
    setActionLoading(chapa);
    try {
      await invoke('devolver_item', { chapa });
      await fetchItens();
    } catch (e: any) {
      alert(e.message || 'Erro ao devolver item.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCriarSala(e: React.FormEvent) {
    e.preventDefault();
    if (!salaForm.nome.trim()) return;
    setSavingSala(true);
    try {
      await invoke('criar_sala', salaForm);
      setShowSalaModal(false);
      setSalaForm({ nome: '', descricao: '' });
      await fetchSalas();
    } catch (e: any) {
      alert(e.message || 'Erro ao criar sala.');
    } finally {
      setSavingSala(false);
    }
  }

  async function handleDesativarSala(sala: Sala) {
    if (!confirm(`Desativar a sala "${sala.nome}"?`)) return;
    try {
      await invoke('remover_sala', { id: sala.id });
      await fetchSalas();
    } catch (e: any) {
      alert(e.message || 'Erro ao desativar sala.');
    }
  }

  const formatDate = (d?: string | null) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleString('pt-BR'); } catch { return d; }
  };

  async function handleGerarPdf() {
    const salaNome = salas.find(s => s.id === salaEfetiva)?.nome || 'Sala';
    setGerandoPdf(true);
    try {
      const doc = new jsPDF('portrait');
      const margin = 14;
      let currentY = 36;

      doc.setFontSize(14);
      doc.setTextColor(37, 99, 235);
      doc.text('Relatório de Itens Patrimoniais por Sala — SGE-GSU-II', margin, currentY);

      currentY += 8;
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Sala: ${salaNome}`, margin, currentY);
      currentY += 6;
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, margin, currentY);
      currentY += 6;
      doc.text(`Total de itens: ${itensDaSala.length}`, margin, currentY);
      currentY += 10;

      const tableData = itensDaSala.map(item => [
        item.chapa,
        item.descricao,
        item.alocadoPorNome || '-',
        formatDate(item.alocadoEm),
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Chapa', 'Descrição do Item', 'Alocado por', 'Data de Alocação']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        // Reserva espaço em toda página de continuação para o timbrado não cobrir
        // as primeiras/últimas linhas quando a tabela quebra para a página seguinte.
        margin: { top: TIMBRADO_HEADER_H + 6, bottom: TIMBRADO_FOOTER_H + 6 },
      });

      addTimbradoAllPages(doc);
      doc.save(`Patrimonio_${salaNome.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar o PDF.');
    } finally {
      setGerandoPdf(false);
    }
  }

  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    { id: 'minha-sala', label: isAdmin ? 'Sala Selecionada' : (allowedSalas.length > 1 ? 'Minhas Salas' : 'Minha Sala'), icon: <DoorOpen size={15} /> },
    { id: 'disponiveis', label: 'Itens Disponíveis', icon: <Package size={15} /> },
    ...(isAdmin ? [{ id: 'salas' as TabId, label: 'Salas', icon: <Building2 size={15} /> }] : []),
    { id: 'historico', label: 'Histórico', icon: <History size={15} /> },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="animate-spin text-blue-600" size={36} />
        <p className="text-sm font-medium text-slate-400">Carregando patrimônio...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="text-blue-600" size={28} />
            Salas de Trabalho — Patrimônio
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Controle de itens patrimoniais alocados em cada sala da URE
          </p>
        </div>
        <div className="flex gap-2 flex-wrap w-full sm:w-auto">
          <button
            onClick={() => setShowTutorialModal(true)}
            className="flex items-center justify-center gap-2 px-3 py-2.5 flex-1 sm:flex-none text-blue-700 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
          >
            <HelpCircle size={16} /> Como Usar
          </button>
          <button
            onClick={init}
            className="flex items-center justify-center gap-2 px-3 py-2.5 flex-1 sm:flex-none text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm"
          >
            <RefreshCw size={16} /> Atualizar
          </button>
          {isAdmin && SHEET_URL && (
            <a
              href={SHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-3 py-2.5 flex-1 sm:flex-none text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-medium"
            >
              <ExternalLink size={16} /> Abrir Planilha
            </a>
          )}
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border-2 border-red-100 p-5 rounded-2xl flex items-start gap-4">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={22} />
          <div>
            <h2 className="text-sm font-bold text-red-800">Erro ao carregar dados do patrimônio</h2>
            <p className="text-xs text-red-700 mt-1">{loadError}</p>
          </div>
        </div>
      )}

      {!isAdmin && userSalasTrabalho.length === 0 && (
        <div className="bg-amber-50 border-2 border-amber-100 p-5 rounded-2xl flex items-start gap-4">
          <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={22} />
          <div>
            <h2 className="text-sm font-bold text-amber-800">Nenhuma sala de trabalho vinculada</h2>
            <p className="text-xs text-amber-700 mt-1">
              Seu usuário ainda não possui nenhuma sala de trabalho vinculada. Solicite ao administrador
              regional que configure isso na tela de Gestão de Usuários.
            </p>
          </div>
        </div>
      )}

      <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1 w-full flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all ${
              activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-blue-500'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {allowedSalas.length > 1 && (activeTab === 'minha-sala' || activeTab === 'historico') && (
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
          <DoorOpen size={18} className="text-slate-400 shrink-0" />
          <select
            className="flex-1 p-2.5 border border-slate-200 rounded-xl text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500"
            value={salaFiltro}
            onChange={e => {
              setSalaFiltro(e.target.value);
              if (activeTab === 'historico') fetchHistorico(e.target.value || undefined);
            }}
          >
            <option value="">{activeTab === 'historico' ? 'Todas as minhas salas' : 'Selecione uma sala...'}</option>
            {allowedSalas.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
      )}

      {activeTab === 'minha-sala' && (
        allowedSalas.length === 0 ? (
          isAdmin ? (
            <div className="text-center py-16 text-slate-400">
              <Building2 size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma sala cadastrada ainda. Crie uma na aba "Salas".</p>
            </div>
          ) : null
        ) : !salaEfetiva ? (
          <div className="text-center py-16 text-slate-400">
            <DoorOpen size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Selecione uma sala acima para ver os itens alocados.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-slate-700">{itensDaSala.length} item(ns) nesta sala</span>
              <button
                onClick={handleGerarPdf}
                disabled={gerandoPdf || itensDaSala.length === 0}
                className="flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-black text-white rounded-lg font-bold text-[11px] uppercase transition-colors disabled:opacity-40 shrink-0"
              >
                {gerandoPdf ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                Gerar PDF
              </button>
            </div>
            {itensDaSala.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Package size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum item alocado nesta sala ainda.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {itensDaSala.map(item => (
                  <div key={item.chapa} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs text-slate-500">Chapa {item.chapa}</span>
                        {item.naoEncontrado && (
                          <span className="text-[9px] font-bold uppercase bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                            Não encontrado no inventário
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-slate-800 break-words">{item.descricao}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Alocado por {item.alocadoPorNome} em {formatDate(item.alocadoEm)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDevolver(item.chapa)}
                      disabled={actionLoading === item.chapa}
                      className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 w-full sm:w-auto bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-xl font-bold text-[11px] uppercase transition-colors shrink-0"
                    >
                      {actionLoading === item.chapa ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
                      Devolver
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {activeTab === 'disponiveis' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por chapa ou descrição..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <span className="text-xs text-slate-400">{itensDisponiveis.length} item(ns) disponível(is)</span>
          </div>
          {itensDisponiveis.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum item encontrado com os filtros aplicados.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
              {itensDisponiveis.map(item => (
                <div key={item.chapa} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-xs text-slate-500">Chapa {item.chapa}</span>
                    <p className="font-medium text-slate-800 break-words">{item.descricao}</p>
                    {item.estadoConservacao && (
                      <span className="text-[10px] font-bold uppercase text-emerald-600">{item.estadoConservacao}</span>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
                    {allowedSalas.length > 1 && (
                      <select
                        className="p-2.5 sm:p-2 border border-slate-200 rounded-lg text-xs font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto"
                        value={salaDestinoPorChapa[item.chapa] || ''}
                        onChange={e => setSalaDestinoPorChapa(prev => ({ ...prev, [item.chapa]: e.target.value }))}
                      >
                        <option value="">Sala destino...</option>
                        {allowedSalas.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                      </select>
                    )}
                    <button
                      onClick={() => handleAlocar(item.chapa)}
                      disabled={actionLoading === item.chapa || allowedSalas.length === 0}
                      className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[11px] uppercase transition-colors disabled:opacity-50"
                    >
                      {actionLoading === item.chapa ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
                      Alocar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'salas' && isAdmin && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-700">{salas.length} sala(s) cadastrada(s)</span>
            <button
              onClick={() => setShowSalaModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Plus size={16} /> Nova Sala
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {salas.map(sala => (
              <div key={sala.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate">{sala.nome}</p>
                  {sala.descricao && <p className="text-xs text-slate-400 truncate">{sala.descricao}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${sala.ativa ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                    {sala.ativa ? 'Ativa' : 'Inativa'}
                  </span>
                  {sala.ativa && (
                    <button
                      onClick={() => handleDesativarSala(sala)}
                      className="p-2.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                      title="Desativar sala"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {salas.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <Building2 size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhuma sala cadastrada ainda.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'historico' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {historicoLoading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 size={32} className="animate-spin text-blue-500" />
            </div>
          ) : historico.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <History size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma movimentação registrada ainda.</p>
            </div>
          ) : (
            <>
              {/* Cartões — telas pequenas (evita scroll horizontal de tabela) */}
              <div className="sm:hidden divide-y divide-slate-50">
                {historico.map(h => (
                  <div key={h.id} className="p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                        h.tipoEvento === 'ALOCACAO' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {h.tipoEvento === 'ALOCACAO' ? <ArrowRightLeft size={11} /> : <Undo2 size={11} />}
                        {h.tipoEvento === 'ALOCACAO' ? 'Alocação' : 'Devolução'}
                      </span>
                      <span className="text-xs text-slate-400 whitespace-nowrap">{formatDate(h.dataEvento)}</span>
                    </div>
                    <p className="font-medium text-slate-800 break-words">{h.descricaoItem}</p>
                    <p className="text-xs text-slate-500">
                      <span className="font-mono">{h.chapa}</span> · {h.salaNome}
                    </p>
                    <p className="text-xs text-slate-400">Por {h.usuarioNome}</p>
                  </div>
                ))}
              </div>

              {/* Tabela — telas médias/grandes */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Data', 'Chapa', 'Item', 'Evento', 'Sala', 'Usuário'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {historico.map(h => (
                      <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDate(h.dataEvento)}</td>
                        <td className="px-4 py-3 font-mono text-slate-600">{h.chapa}</td>
                        <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{h.descricaoItem}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            h.tipoEvento === 'ALOCACAO' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {h.tipoEvento === 'ALOCACAO' ? <ArrowRightLeft size={11} /> : <Undo2 size={11} />}
                            {h.tipoEvento === 'ALOCACAO' ? 'Alocação' : 'Devolução'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{h.salaNome}</td>
                        <td className="px-4 py-3 text-slate-600">{h.usuarioNome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {showSalaModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <DoorOpen size={20} className="text-blue-600" /> Nova Sala
              </h2>
              <button onClick={() => setShowSalaModal(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleCriarSala} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome da Sala *</label>
                <input
                  required
                  value={salaForm.nome}
                  onChange={e => setSalaForm(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex: Sala de Materiais - Bloco A"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Descrição</label>
                <textarea
                  rows={2}
                  value={salaForm.descricao}
                  onChange={e => setSalaForm(prev => ({ ...prev, descricao: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowSalaModal(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingSala} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                  {savingSala ? (<><Loader2 size={16} className="animate-spin" /> Salvando...</>) : (<><CheckCircle2 size={16} /> Criar Sala</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTutorialModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <HelpCircle size={20} className="text-blue-600" /> Como Usar — Salas de Trabalho
              </h2>
              <button onClick={() => setShowTutorialModal(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto text-sm text-slate-700 leading-relaxed">
              <p>
                Aqui você indica quais itens do patrimônio (móveis, computadores, equipamentos etc.)
                estão fisicamente na sua sala de trabalho.
              </p>

              {!isAdmin && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start gap-3">
                  <Info size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    Se aparecer o aviso <strong>"Nenhuma sala de trabalho vinculada"</strong>, o
                    administrador regional ainda não associou nenhuma sala ao seu usuário. Peça para
                    ele configurar isso em <strong>Gestão de Usuários</strong>.
                  </p>
                </div>
              )}

              <div>
                <h3 className="font-bold text-slate-800 mb-1.5">Conhecendo as abas</h3>
                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                  <li><strong>Minha Sala</strong> (ou "Minhas Salas", se você tiver mais de uma) — itens já alocados na sua sala.</li>
                  <li><strong>Itens Disponíveis</strong> — itens do inventário que ainda não estão em nenhuma sala.</li>
                  <li><strong>Histórico</strong> — todas as alocações e devoluções feitas na sua sala.</li>
                </ul>
                <p className="text-xs text-slate-400 mt-2">
                  Se você tem mais de uma sala vinculada, um seletor aparece no topo para escolher qual
                  está visualizando. Com apenas uma sala, ela já vem selecionada automaticamente.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-slate-800 mb-1.5">Como alocar um item na sua sala</h3>
                <ol className="list-decimal pl-5 space-y-1 text-slate-600">
                  <li>Abra a aba <strong>"Itens Disponíveis"</strong>.</li>
                  <li>Busque pelo número da chapa patrimonial ou parte da descrição do item.</li>
                  <li>Se tiver mais de uma sala, escolha a sala destino ao lado do item.</li>
                  <li>Clique em <strong>"Alocar"</strong>.</li>
                </ol>
                <p className="text-xs text-slate-400 mt-2">
                  O item some da lista de disponíveis e passa a aparecer em "Minha Sala". Um item só
                  pode estar em uma sala por vez — se já estiver alocado em outra, o sistema recusa.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-slate-800 mb-1.5">Como devolver um item</h3>
                <ol className="list-decimal pl-5 space-y-1 text-slate-600">
                  <li>Abra a aba <strong>"Minha Sala"</strong>.</li>
                  <li>Encontre o item e clique em <strong>"Devolver"</strong>.</li>
                  <li>Confirme a ação.</li>
                </ol>
                <p className="text-xs text-slate-400 mt-2">
                  O item volta para "Itens Disponíveis", liberado para ser alocado em qualquer sala.
                </p>
              </div>

              <div>
                <h3 className="font-bold text-slate-800 mb-1.5">Dicas rápidas</h3>
                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                  <li>O botão <strong>"Atualizar"</strong> recarrega os dados mais recentes da planilha.</li>
                  <li>Um item marcado como <strong>"Não encontrado no inventário"</strong> foi removido do inventário oficial, mas ainda consta como alocado — avise o administrador regional.</li>
                  <li>Dúvidas sobre qual sala você está vinculado? Pergunte ao administrador regional.</li>
                </ul>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end shrink-0">
              <button
                onClick={() => setShowTutorialModal(false)}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
