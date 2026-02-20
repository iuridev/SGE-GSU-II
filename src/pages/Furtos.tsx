import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, Trash2, Save, FileText, AlertTriangle, ShieldAlert, Building2, 
  Calculator, BarChart3, TrendingUp, Clock, CheckCircle, Search, Pencil, X, CalendarClock
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const TIPOS_OCORRENCIA = ["FURTO", "ROUBO", "EXTRAVIO", "INCÊNCIO", "VANDALISMO"];
const SITUACOES = ["Em Análise", "Em Apuração", "Concluído"];
const AUTORIAS = ["CONHECIDA", "NÃO CONHECIDA"];
const STATUS_OPCOES = [
  "NÃO INSTAURADO",
  "EM ANDAMENTO",
  "ENCERRADO COMO CONCLUIDO PELA RESPONSÁBILIDADE",
  "ENCERRADO COMO CONCLUIDO PELA NÃO RESPONSÁBILIDADE"
];

// Definição de Tipos (Interfaces)
interface Escola {
  id: string;
  name: string;
}

interface UserProfile {
  full_name: string;
  role: string;
}

interface Item {
  id: number;
  descricao: string;
  patrimonio: string;
  valorUnitario: string;
}

interface ProcessoHistorico {
  id: string;
  numero_sei: string;
  escola_id: string;
  escolaNome: string; 
  data_ocorrencia: string;
  tipo_ocorrencia: string;
  situacao: string;
  numero_bo?: string;
  autoria?: string;
  status?: string;
  nl_baixa?: string;
  itens?: Item[];
  valor_total: number;
  updated_at?: string; // Nova propriedade adicionada
}

const FORM_INITIAL_STATE = {
  numeroSEI: '',
  escola: '',
  situacao: 'Em Análise',
  nlBaixa: 'Aguardando',
  tipoOcorrencia: 'FURTO',
  dataOcorrencia: '',
  numeroBO: '',
  autoria: 'NÃO CONHECIDA',
  status: 'NÃO INSTAURADO',
};

export default function CadastroFurtos() {
  // Estado principal do formulário e controlo de edição
  const [formData, setFormData] = useState(FORM_INITIAL_STATE);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Estados para dados do Supabase e Utilizador
  const [escolas, setEscolas] = useState<Escola[]>([]);
  const [isLoadingEscolas, setIsLoadingEscolas] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Estado para o histórico (tabela e dashboards)
  const [historico, setHistorico] = useState<ProcessoHistorico[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Efeito para buscar utilizador logado, lista de escolas e histórico real do banco
  useEffect(() => {
    async function loadData() {
      try {
        // 1. Buscar utilizador logado
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, role')
            .eq('id', user.id)
            .single();
          if (profile) setUserProfile(profile as UserProfile);
        }

        // 2. Buscar Escolas
        const { data: schoolsData, error: schoolsError } = await supabase
          .from('schools')
          .select('id, name')
          .order('name');
          
        if (schoolsError) throw schoolsError;
        if (schoolsData) setEscolas(schoolsData as Escola[]);

        // 3. Buscar Histórico Real da tabela processos_furtos
        const { data: processosData, error: processosError } = await (supabase as any)
          .from('processos_furtos')
          .select(`
            id,
            numero_sei,
            escola_id,
            data_ocorrencia,
            tipo_ocorrencia,
            numero_bo,
            autoria,
            status,
            nl_baixa,
            itens,
            situacao,
            valor_total,
            updated_at,
            created_at,
            schools ( name )
          `)
          .order('updated_at', { ascending: false }); // Ordena pelos mais recentemente atualizados no geral

        if (processosError) throw processosError;

        if (processosData) {
          const historicoFormatado = processosData.map((proc: any) => ({
            id: proc.id,
            numero_sei: proc.numero_sei,
            escola_id: proc.escola_id,
            escolaNome: proc.schools?.name || 'Escola Desconhecida',
            data_ocorrencia: proc.data_ocorrencia,
            tipo_ocorrencia: proc.tipo_ocorrencia,
            situacao: proc.situacao,
            numero_bo: proc.numero_bo,
            autoria: proc.autoria,
            status: proc.status,
            nl_baixa: proc.nl_baixa,
            itens: proc.itens,
            valor_total: Number(proc.valor_total) || 0,
            updated_at: proc.updated_at || proc.created_at // Fallback para created_at se updated_at for nulo
          }));
          setHistorico(historicoFormatado);
        }

      } catch (error) {
        console.error("Erro ao carregar dados do banco:", error instanceof Error ? error.message : String(error));
      } finally {
        setIsLoadingEscolas(false);
      }
    }
    
    loadData();
  }, []);

  // Estado dinâmico para os itens
  const [itens, setItens] = useState<Item[]>([
    { id: 1, descricao: '', patrimonio: '', valorUnitario: '' }
  ]);

  // Manipuladores do Formulário
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (id: number, field: string, value: string) => {
    setItens((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const addItem = () => {
    setItens((prev) => [...prev, { id: Date.now(), descricao: '', patrimonio: '', valorUnitario: '' }]);
  };

  const removeItem = (id: number) => {
    if (itens.length > 1) {
      setItens((prev) => prev.filter((item) => item.id !== id));
    }
  };

  // Funções de Edição e Exclusão
  const handleEdit = (processo: ProcessoHistorico) => {
    setEditingId(processo.id);
    setFormData({
      numeroSEI: processo.numero_sei || '',
      escola: processo.escola_id || '',
      situacao: processo.situacao || 'Em Análise',
      nlBaixa: processo.nl_baixa || 'Aguardando',
      tipoOcorrencia: processo.tipo_ocorrencia || 'FURTO',
      dataOcorrencia: processo.data_ocorrencia || '',
      numeroBO: processo.numero_bo || '',
      autoria: processo.autoria || 'NÃO CONHECIDA',
      status: processo.status || 'NÃO INSTAURADO',
    });
    setItens(processo.itens && processo.itens.length > 0 ? processo.itens : [{ id: 1, descricao: '', patrimonio: '', valorUnitario: '' }]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData(FORM_INITIAL_STATE);
    setItens([{ id: 1, descricao: '', patrimonio: '', valorUnitario: '' }]);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Tem certeza que deseja excluir permanentemente este processo?")) {
      return;
    }

    try {
      const { error } = await supabase.from('processos_furtos').delete().eq('id', id);
      if (error) throw error;

      setHistorico(prev => prev.filter(proc => proc.id !== id));
      if (editingId === id) cancelEdit();

      alert("Processo excluído com sucesso!");
    } catch (error) {
      console.error("Erro ao excluir processo:", error);
      alert("Erro ao excluir o processo. Tente novamente.");
    }
  };

  // Cálculos Financeiros
  const valorTotal = useMemo(() => {
    return itens.reduce((acc, item) => {
      const valor = parseFloat(item.valorUnitario);
      return acc + (isNaN(valor) ? 0 : valor);
    }, 0);
  }, [itens]);

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  };

  // Funções Utilitárias para Datas
  const calcularDiasAtraso = (dataIso?: string) => {
    if (!dataIso) return 0;
    const dataAtual = new Date();
    const dataAtualizacao = new Date(dataIso);
    const diffTime = Math.abs(dataAtual.getTime() - dataAtualizacao.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  // Cálculos para o Dashboard e Alertas
  const { stats, processosDesatualizados } = useMemo(() => {
    const totalOcorrencias = historico.length;
    const prejuizoTotal = historico.reduce((acc, curr) => acc + curr.valor_total, 0);
    const emApuracao = historico.filter(h => h.situacao === 'Em Apuração').length;
    const concluidos = historico.filter(h => h.situacao === 'Concluído').length;

    // Calcular Top 5 Escolas
    const contagemEscolas = historico.reduce((acc, curr) => {
      acc[curr.escolaNome] = (acc[curr.escolaNome] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const top5 = Object.entries(contagemEscolas)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calcular Processos Pendentes sem atualização há > 7 dias
    const desatualizados = historico
      .filter(h => h.situacao !== 'Concluído') // Apenas os não concluídos
      .filter(h => calcularDiasAtraso(h.updated_at) > 7) // Mais de 7 dias
      .sort((a, b) => {
        // Ordenar do mais antigo (maior atraso) para o mais recente
        const dataA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const dataB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return dataA - dataB;
      });

    return { 
      stats: { totalOcorrencias, prejuizoTotal, emApuracao, concluidos, top5 },
      processosDesatualizados: desatualizados
    };
  }, [historico]);

  // Salvando/Atualizando dados no Supabase
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.escola) {
      alert("Por favor, selecione uma escola.");
      return;
    }

    setIsSaving(true);
    const agoraIso = new Date().toISOString();
    
    try {
      const payload = {
        numero_sei: formData.numeroSEI,
        escola_id: formData.escola,
        data_ocorrencia: formData.dataOcorrencia,
        tipo_ocorrencia: formData.tipoOcorrencia,
        numero_bo: formData.numeroBO,
        autoria: formData.autoria,
        situacao: formData.situacao,
        status: formData.status,
        nl_baixa: formData.nlBaixa,
        valor_total: valorTotal,
        itens: itens,
        updated_at: agoraIso // Captura a data exata da atualização
      };

      let query;

      if (editingId) {
        query = (supabase as any)
          .from('processos_furtos')
          .update(payload)
          .eq('id', editingId);
      } else {
        query = (supabase as any)
          .from('processos_furtos')
          .insert([payload]);
      }

      const { data: registroSalvo, error } = await query
        .select(`
          id,
          numero_sei,
          escola_id,
          data_ocorrencia,
          tipo_ocorrencia,
          numero_bo,
          autoria,
          status,
          nl_baixa,
          itens,
          situacao,
          valor_total,
          updated_at,
          schools ( name )
        `)
        .single();

      if (error) throw error;

      if (registroSalvo) {
        const processoFormatado: ProcessoHistorico = {
          id: registroSalvo.id,
          numero_sei: registroSalvo.numero_sei,
          escola_id: registroSalvo.escola_id,
          escolaNome: registroSalvo.schools?.name || 'Escola Desconhecida',
          data_ocorrencia: registroSalvo.data_ocorrencia,
          tipo_ocorrencia: registroSalvo.tipo_ocorrencia,
          situacao: registroSalvo.situacao,
          numero_bo: registroSalvo.numero_bo,
          autoria: registroSalvo.autoria,
          status: registroSalvo.status,
          nl_baixa: registroSalvo.nl_baixa,
          itens: registroSalvo.itens,
          valor_total: Number(registroSalvo.valor_total) || 0,
          updated_at: registroSalvo.updated_at
        };

        if (editingId) {
          // Substitui e reordena colocando o atualizado no topo
          setHistorico(prev => {
            const novaLista = prev.filter(p => p.id !== editingId);
            return [processoFormatado, ...novaLista];
          });
          alert("Processo atualizado com sucesso!");
        } else {
          setHistorico([processoFormatado, ...historico]);
          alert("Processo cadastrado com sucesso!");
        }
        
        cancelEdit();
      }

    } catch (error) {
      console.error("Erro ao salvar processo:", error);
      alert("Erro ao salvar o processo. Verifique a sua ligação.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Barra superior de Administração */}
      <header className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-md print:hidden">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-blue-400" />
          <h1 className="text-xl font-bold tracking-tight">GSE-GSU-II <span className="text-slate-400 font-normal text-sm ml-2 hidden sm:inline">Módulo de Património e Segurança</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-blue-600 px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider">
            {userProfile?.role || 'manage_admin'}
          </span>
          <div 
            className="w-8 h-8 rounded-full bg-slate-700 border-2 border-slate-600 flex items-center justify-center font-bold text-sm"
            title={userProfile?.full_name || 'Utilizador Logado'}
          >
            {userProfile?.full_name ? userProfile.full_name.substring(0, 2).toUpperCase() : 'US'}
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-8">
        
        {/* ==================== ALERTA DE PROCESSOS DESATUALIZADOS ==================== */}
        {processosDesatualizados.length > 0 && (
          <section className="bg-red-50 border-l-4 border-red-500 rounded-xl p-5 shadow-sm animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg text-red-600">
                <CalendarClock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-red-800 font-bold text-lg">Atenção: Processos Sem Atualização</h3>
                <p className="text-red-600 text-sm">Existem {processosDesatualizados.length} processos não concluídos parados há mais de 7 dias (Ordenados do mais antigo).</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {processosDesatualizados.map((proc) => {
                const dias = calcularDiasAtraso(proc.updated_at);
                return (
                  <div key={`alert-${proc.id}`} className="bg-white border border-red-100 rounded-lg p-3 flex justify-between items-center shadow-sm">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-gray-800 truncate">{proc.numero_sei}</p>
                      <p className="text-xs text-gray-500 truncate">{proc.escolaNome}</p>
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      <span className="inline-block bg-red-100 text-red-700 font-bold px-2 py-1 rounded text-xs">
                        {dias} dias
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ==================== DASHBOARD SECTION ==================== */}
        <section>
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-blue-600" />
              Painel de Ocorrências (Últimos 12 meses)
            </h2>
          </div>

          {/* Cards de KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><AlertTriangle className="w-6 h-6" /></div>
              <div>
                <p className="text-sm font-medium text-gray-500">Total Ocorrências</p>
                <p className="text-2xl font-bold text-gray-800">{stats.totalOcorrencias}</p>
              </div>
            </div>
            
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-red-50 text-red-600 rounded-lg"><TrendingUp className="w-6 h-6" /></div>
              <div>
                <p className="text-sm font-medium text-gray-500">Prejuízo Estimado</p>
                <p className="text-2xl font-bold text-gray-800">{formatarMoeda(stats.prejuizoTotal)}</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-lg"><Clock className="w-6 h-6" /></div>
              <div>
                <p className="text-sm font-medium text-gray-500">Em Apuração</p>
                <p className="text-2xl font-bold text-gray-800">{stats.emApuracao}</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-green-50 text-green-600 rounded-lg"><CheckCircle className="w-6 h-6" /></div>
              <div>
                <p className="text-sm font-medium text-gray-500">Concluídos</p>
                <p className="text-2xl font-bold text-gray-800">{stats.concluidos}</p>
              </div>
            </div>
          </div>

          {/* Ranking Top 5 Escolas */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-5 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gray-400" />
              Top 5 Unidades com mais Ocorrências
            </h3>
            
            <div className="space-y-4">
              {stats.top5.length > 0 ? stats.top5.map((escola, index) => {
                const maxCount = stats.top5[0].count;
                const percentage = Math.round((escola.count / maxCount) * 100);
                
                return (
                  <div key={escola.name} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="w-full sm:w-1/3 text-sm font-medium text-gray-700 truncate" title={escola.name}>
                      {index + 1}. {escola.name}
                    </div>
                    <div className="flex-1 flex items-center gap-3">
                      <div className="h-4 bg-gray-100 rounded-full w-full overflow-hidden flex-1">
                        <div 
                          className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-bold text-gray-600 w-12 text-right">{escola.count} reg.</span>
                    </div>
                  </div>
                )
              }) : (
                <p className="text-sm text-gray-500 text-center py-4">Nenhum dado registado para gerar o ranking.</p>
              )}
            </div>
          </div>
        </section>

        {/* ==================== FORMULÁRIO DE CADASTRO ==================== */}
        <section className={`p-1 rounded-2xl shadow-lg transition-colors duration-300 ${editingId ? 'bg-amber-400' : 'bg-slate-900'}`}>
          <div className="bg-white p-6 rounded-xl">
            <div className="mb-6 border-b pb-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                {editingId ? <Pencil className="w-6 h-6 text-amber-500" /> : <Plus className="w-6 h-6 text-blue-600" />}
                {editingId ? 'Editar Registo de Ocorrência' : 'Novo Registo de Ocorrência'}
              </h2>
              {editingId && (
                <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold animate-pulse">
                  Modo de Edição
                </span>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nº do SEI <span className="text-red-500">*</span></label>
                  <input type="text" name="numeroSEI" required placeholder="Ex: 00000.00000/0000-00" value={formData.numeroSEI} onChange={handleInputChange} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                    <Building2 className="w-4 h-4 text-gray-400" /> Escola <span className="text-red-500">*</span>
                  </label>
                  <select name="escola" required value={formData.escola} onChange={handleInputChange} disabled={isLoadingEscolas} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white disabled:bg-gray-100">
                    <option value="" disabled>{isLoadingEscolas ? "A carregar escolas..." : "Selecione uma escola..."}</option>
                    {escolas.map(esc => <option key={esc.id} value={esc.id}>{esc.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data da Ocorrência <span className="text-red-500">*</span></label>
                  <input type="date" name="dataOcorrencia" required value={formData.dataOcorrencia} onChange={handleInputChange} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Ocorrência</label>
                  <select name="tipoOcorrencia" value={formData.tipoOcorrencia} onChange={handleInputChange} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                    {TIPOS_OCORRENCIA.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nº do B.O.</label>
                  <input type="text" name="numeroBO" placeholder="Boletim Opcional" value={formData.numeroBO} onChange={handleInputChange} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Autoria</label>
                  <select name="autoria" value={formData.autoria} onChange={handleInputChange} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                    {AUTORIAS.map(aut => <option key={aut} value={aut}>{aut}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Situação (Triagem)</label>
                  <select name="situacao" value={formData.situacao} onChange={handleInputChange} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                    {SITUACOES.map(sit => <option key={sit} value={sit}>{sit}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status Final do Processo</label>
                  <select name="status" value={formData.status} onChange={handleInputChange} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm">
                    {STATUS_OPCOES.map(stat => <option key={stat} value={stat}>{stat}</option>)}
                  </select>
                </div>
              </div>

              {/* SEÇÃO 2: Itens Atingidos */}
              <div className="pt-4 border-t border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-md font-semibold text-gray-700 flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-green-600" />
                    Itens Subtraídos/Danificados
                  </h3>
                  <button type="button" onClick={addItem} className="flex items-center gap-1 bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-green-200">
                    <Plus className="w-4 h-4" /> Add Item
                  </button>
                </div>

                <div className="space-y-3">
                  {itens.map((item) => (
                    <div key={item.id} className="flex flex-col md:flex-row gap-3 items-start md:items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div className="w-full md:w-5/12">
                        <input type="text" required placeholder="Descrição do Item" value={item.descricao} onChange={(e) => handleItemChange(item.id, 'descricao', e.target.value)} className="w-full p-2 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-green-500 outline-none text-sm" />
                      </div>
                      <div className="w-full md:w-3/12">
                        <input type="text" placeholder="Nº Património (Opcional)" value={item.patrimonio} onChange={(e) => handleItemChange(item.id, 'patrimonio', e.target.value)} className="w-full p-2 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-green-500 outline-none text-sm" />
                      </div>
                      <div className="w-full md:w-3/12">
                        <input type="number" step="0.01" min="0" placeholder="Valor Un. R$ (Opcional)" value={item.valorUnitario} onChange={(e) => handleItemChange(item.id, 'valorUnitario', e.target.value)} className="w-full p-2 border border-gray-300 rounded bg-white focus:ring-2 focus:ring-green-500 outline-none text-sm" />
                      </div>
                      <div className="w-full md:w-1/12 flex justify-end">
                        <button type="button" onClick={() => removeItem(item.id)} disabled={itens.length === 1} className={`p-2 rounded-lg ${itens.length === 1 ? 'text-gray-300' : 'text-red-500 hover:bg-red-50'}`}><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-col sm:flex-row items-center justify-between bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                  <div className="text-right w-full flex justify-between items-center">
                    <span className="text-sm text-gray-600 font-medium">Valor Total Estimado:</span>
                    <span className="text-2xl font-bold text-blue-700">{formatarMoeda(valorTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Ações do Formulário */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                {editingId && (
                  <button type="button" onClick={cancelEdit} disabled={isSaving} className="px-6 py-3 text-gray-600 bg-gray-100 font-medium rounded-lg transition-colors hover:bg-gray-200 flex items-center gap-2">
                    <X className="w-5 h-5" /> Cancelar
                  </button>
                )}
                <button type="submit" disabled={isSaving} className={`px-8 py-3 text-white font-medium rounded-lg transition-colors flex items-center gap-2 shadow-md justify-center ${isSaving ? 'bg-slate-600 cursor-not-allowed' : editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-900 hover:bg-slate-800'}`}>
                  <Save className="w-5 h-5" /> {isSaving ? 'A Guardar...' : editingId ? 'Atualizar Processo' : 'Guardar Processo'}
                </button>
              </div>

            </form>
          </div>
        </section>

        {/* ==================== HISTÓRICO / TABELA ==================== */}
        <section className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-500" />
                Processos Registados
              </h3>
            </div>
            
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input type="text" placeholder="Pesquisar SEI ou Escola..." className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-gray-700 font-semibold border-y border-gray-200 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Nº SEI</th>
                  <th className="px-4 py-3">Escola</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3 text-right">Valor R$</th>
                  <th className="px-4 py-3">Última Atualização</th>
                  <th className="px-4 py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historico.length > 0 ? historico.map((proc) => {
                  const dataAtualizacao = proc.updated_at ? new Date(proc.updated_at) : null;
                  return (
                    <tr key={proc.id} className={`transition-colors ${editingId === proc.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-4 py-3 font-medium text-blue-600">{proc.numero_sei}</td>
                      <td className="px-4 py-3 truncate max-w-[200px]" title={proc.escolaNome}>{proc.escolaNome}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${proc.situacao === 'Concluído' ? 'bg-green-100 text-green-700' : proc.situacao === 'Em Apuração' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {proc.situacao}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatarMoeda(proc.valor_total)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {dataAtualizacao ? (
                          <>
                            <span className="block text-gray-800 font-medium">{dataAtualizacao.toLocaleDateString('pt-BR')}</span>
                            <span className="block text-gray-400">{dataAtualizacao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute:'2-digit' })}</span>
                          </>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handleEdit(proc)} className={`p-1.5 rounded-md transition-colors ${editingId === proc.id ? 'bg-amber-200 text-amber-800' : 'text-blue-600 hover:bg-blue-50'}`} title="Editar Processo">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(proc.id)} className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors" title="Excluir Processo">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      Nenhum processo encontrado. Os dados aparecerão aqui após o primeiro registo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

      </main>
    </div>
  );
}