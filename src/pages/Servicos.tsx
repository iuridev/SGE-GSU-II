import React, { useState, useEffect, useMemo } from 'react';
import { 
  HardHat, FileText, AlertCircle, Clock, CheckCircle, 
  Search, Pencil, Save, X, FileDown, Lock,
  TrendingUp, BarChart3, AlertTriangle, FileSpreadsheet, Plus,
  DollarSign, XCircle, PlayCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// --- Tipos e Constantes ---
const STATUS_WORKFLOW = [
  "Aguardando Orçamentos",
  "Solicitação de Suplementação Financeira",
  "Empenho Financeiro Autorizado",
  "Não Autorizado e Concluído",
  "Início de Serviço",
  "Concluído"
];

interface Escola {
  id: string;
  name: string;
}

interface Servico {
  id: string;
  escola_id: string;
  escolaNome: string;
  descricao: string;
  empresa?: string;
  valor?: number;
  status: string;
  data_inicio?: string;
  data_previsao_termino?: string;
  created_at: string;
  updated_at: string;
}

const FORM_INITIAL_STATE = {
  escola_id: '',
  descricao: '',
  empresa: '',
  valor: '',
  status: 'Aguardando Orçamentos',
  data_inicio: '',
  data_previsao_termino: ''
};

export default function Servicos() {
  // --- Estados Principais ---
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [escolas, setEscolas] = useState<Escola[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  
  // --- Estados do Formulário ---
  const [formData, setFormData] = useState(FORM_INITIAL_STATE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // --- Estados de Filtro ---
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEscola, setFilterEscola] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // --- Estados do Modal de Exportação ---
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState<'excel' | 'pdf'>('excel');
  const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1);
  const [exportYear, setExportYear] = useState(new Date().getFullYear());

  // --- Efeito Inicial: Verificar Permissão e Carregar Dados ---
  useEffect(() => {
    async function loadData() {
      try {
        // 1. Verificar Autenticação e Regra (Admin)
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        // Tipagem explícita para contornar o erro 'never' do TypeScript
        const allowedRoles = ['manage_admin', 'admin', 'regional_admin'];
        const userIsAdmin = allowedRoles.includes((profile as any)?.role);
        setIsAdmin(userIsAdmin);

        // Se não for admin, nem tenta carregar os dados
        if (!userIsAdmin) {
          setIsLoading(false);
          return;
        }

        // 2. Carregar Escolas
        const { data: schoolsData } = await supabase
          .from('schools')
          .select('id, name')
          .order('name');
        if (schoolsData) setEscolas(schoolsData);

        // 3. Carregar Serviços
        await fetchServicos();

      } catch (error) {
        console.error("Erro ao inicializar:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const fetchServicos = async () => {
    // Adicionamos 'as any' para contornar a falta da tabela nos tipos gerados
    const { data, error } = await (supabase as any)
      .from('servicos_manutencao')
      .select(`
        *,
        schools ( name )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Erro ao buscar serviços:", error);
      return;
    }

    if (data) {
      const formatados = (data as any[]).map((item: any) => ({
        ...item,
        escolaNome: item.schools?.name || 'Escola Desconhecida'
      }));
      setServicos(formatados);
    }
  };

  // --- Manipulação de Formulário ---
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEdit = (servico: Servico) => {
    setEditingId(servico.id);
    setFormData({
      escola_id: servico.escola_id || '',
      descricao: servico.descricao || '',
      empresa: servico.empresa || '',
      valor: servico.valor ? servico.valor.toString() : '',
      status: servico.status || 'Aguardando Orçamentos',
      data_inicio: servico.data_inicio || '',
      data_previsao_termino: servico.data_previsao_termino || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData(FORM_INITIAL_STATE);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const payload = {
        escola_id: formData.escola_id,
        descricao: formData.descricao,
        empresa: formData.empresa,
        valor: formData.valor ? parseFloat(formData.valor) : null,
        status: formData.status,
        data_inicio: formData.data_inicio || null,
        data_previsao_termino: formData.data_previsao_termino || null,
        updated_at: new Date().toISOString()
      };

      if (editingId) {
        // Adicionamos 'as any' para que o TS não exija o mapeamento da tabela para atualizar o payload
        await (supabase as any).from('servicos_manutencao').update(payload).eq('id', editingId);
        alert("Serviço atualizado com sucesso!");
      } else {
        // Adicionamos 'as any' para a inserção
        await (supabase as any).from('servicos_manutencao').insert([payload]);
        alert("Serviço cadastrado com sucesso!");
      }

      await fetchServicos();
      cancelEdit();
    } catch (error) {
      console.error("Erro ao salvar:", error);
      alert("Erro ao salvar serviço.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- Cálculos de Prazos e Status Visual ---
  const getPrazoInfo = (dataPrevisao?: string, status?: string) => {
    if (!dataPrevisao || status === 'Concluído' || status === 'Não Autorizado e Concluído') {
      return { status: 'normal', text: 'Sem pendência de prazo', days: Infinity };
    }

    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    const previsao = new Date(dataPrevisao);
    
    // Fuso horário ajuste simples
    previsao.setMinutes(previsao.getMinutes() + previsao.getTimezoneOffset());

    const diffTime = previsao.getTime() - hoje.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { status: 'danger', text: `Atrasado há ${Math.abs(diffDays)} dias`, days: diffDays };
    } else if (diffDays <= 7) {
      return { status: 'warning', text: `Vence em ${diffDays} dias`, days: diffDays };
    } else {
      return { status: 'safe', text: `No prazo (${diffDays} dias restam)`, days: diffDays };
    }
  };

  // --- Alertas de Prazo para o Topo da Página ---
  const alertasPrazo = useMemo(() => {
    return servicos
      .filter(s => s.status !== 'Concluído' && s.status !== 'Não Autorizado e Concluído' && s.data_previsao_termino)
      .map(s => {
        const info = getPrazoInfo(s.data_previsao_termino, s.status);
        return { ...s, prazoInfo: info };
      })
      .filter(s => s.prazoInfo.days <= 7) // Atrasados (dias negativos) ou a vencer em 7 dias
      .sort((a, b) => a.prazoInfo.days - b.prazoInfo.days); // Ordena os mais atrasados primeiro
  }, [servicos]);

  // --- Dashboards e Filtros ---
  const servicosFiltrados = useMemo(() => {
    return servicos.filter(s => {
      const matchSearch = searchTerm === '' || s.escolaNome.toLowerCase().includes(searchTerm.toLowerCase()) || s.descricao.toLowerCase().includes(searchTerm.toLowerCase());
      const matchEscola = filterEscola === '' || s.escola_id === filterEscola;
      const matchStatus = filterStatus === '' || s.status === filterStatus;
      return matchSearch && matchEscola && matchStatus;
    });
  }, [servicos, searchTerm, filterEscola, filterStatus]);

  // Cálculos do Dashboard (Gráficos e Ranking) + Contagem de Status (12 meses)
  const { chartData, top5Escolas, statusCounts } = useMemo(() => {
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const ultimos12MesesData: { name: string, count: number }[] = [];
    
    // Gerar rótulos dos últimos 12 meses
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      ultimos12MesesData.push({ name: `${meses[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`, count: 0 });
    }

    const contagemEscolas: Record<string, number> = {};
    const contagemStatus: Record<string, number> = {};
    
    // Inicializar os contadores de status com zero
    STATUS_WORKFLOW.forEach(status => contagemStatus[status] = 0);

    servicos.forEach(s => {
      const dataCriacao = new Date(s.created_at);
      
      // Preencher Gráfico Mensal
      const label = `${meses[dataCriacao.getMonth()]} ${dataCriacao.getFullYear().toString().substring(2)}`;
      const chartItem = ultimos12MesesData.find(item => item.name === label);
      if (chartItem) chartItem.count += 1;

      // Considerando os últimos 12 meses para o ranking e cards de status
      const umAnoAtras = new Date();
      umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
      
      if (dataCriacao >= umAnoAtras) {
        contagemEscolas[s.escolaNome] = (contagemEscolas[s.escolaNome] || 0) + 1;
        
        if (contagemStatus[s.status] !== undefined) {
          contagemStatus[s.status] += 1;
        }
      }
    });

    const top5 = Object.entries(contagemEscolas)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { chartData: ultimos12MesesData, top5Escolas: top5, statusCounts: contagemStatus };
  }, [servicos]);

  const maxChartValue = Math.max(...chartData.map(d => d.count), 1); // Evitar divisão por zero

  // --- Estilos Específicos para os Cards de Status ---
  const getStatusCardStyle = (status: string) => {
    switch(status) {
      case "Aguardando Orçamentos": 
        return { icon: <Clock className="w-6 h-6 text-slate-500" />, bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700" };
      case "Solicitação de Suplementação Financeira": 
        return { icon: <DollarSign className="w-6 h-6 text-amber-500" />, bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" };
      case "Empenho Financeiro Autorizado": 
        return { icon: <CheckCircle className="w-6 h-6 text-emerald-500" />, bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" };
      case "Não Autorizado e Concluído": 
        return { icon: <XCircle className="w-6 h-6 text-red-500" />, bg: "bg-red-50", border: "border-red-200", text: "text-red-700" };
      case "Início de Serviço": 
        return { icon: <PlayCircle className="w-6 h-6 text-blue-500" />, bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" };
      case "Concluído": 
        return { icon: <CheckCircle className="w-6 h-6 text-green-600" />, bg: "bg-green-50", border: "border-green-200", text: "text-green-700" };
      default: 
        return { icon: <FileText className="w-6 h-6 text-gray-500" />, bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700" };
    }
  };

  // --- Funções de Exportação ---
  const handleExport = () => {
    const dadosFiltrados = servicos.filter(s => {
      const data = new Date(s.created_at);
      return data.getMonth() + 1 === exportMonth && data.getFullYear() === exportYear;
    });

    if (dadosFiltrados.length === 0) {
      alert("Nenhum dado encontrado para o período selecionado.");
      return;
    }

    if (exportType === 'excel') {
      const cabecalho = ['Escola', 'Descricao', 'Empresa', 'Valor R$', 'Status', 'Data Inicio', 'Previsao Termino', 'Data Registro'];
      const linhas = dadosFiltrados.map(s => [
        `"${s.escolaNome}"`,
        `"${s.descricao}"`,
        `"${s.empresa || ''}"`,
        s.valor || 0,
        `"${s.status}"`,
        s.data_inicio ? new Date(s.data_inicio).toLocaleDateString('pt-BR') : '',
        s.data_previsao_termino ? new Date(s.data_previsao_termino).toLocaleDateString('pt-BR') : '',
        new Date(s.created_at).toLocaleDateString('pt-BR')
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [cabecalho.join(';'), ...linhas.map(l => l.join(';'))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `servicos_${exportMonth}_${exportYear}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      setShowExportModal(false);
      setTimeout(() => {
        window.print();
      }, 500);
    }
    
    setShowExportModal(false);
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">A carregar...</div>;
  
  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <Lock className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Acesso Restrito</h1>
        <p className="text-gray-600 text-center max-w-md">
          Esta página é de uso exclusivo da administração para controle de Obras e Manutenções contratadas. 
          Você não tem permissão para aceder a este módulo.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      
      {/* HEADER E AÇÕES GLOBAIS */}
      <header className="bg-slate-900 text-white p-5 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <HardHat className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gestão de Serviços e Obras</h1>
            <p className="text-slate-400 text-sm">Controle de contratos e manutenções da Regional</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => { setExportType('excel'); setShowExportModal(true); }}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
          </button>
          <button 
            onClick={() => { setExportType('pdf'); setShowExportModal(true); }}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <FileDown className="w-4 h-4" /> Imprimir Relatório PDF
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">

        {/* ================= TÍTULO APENAS PARA PDF ================= */}
        <div className="hidden print:block mb-4 text-center border-b pb-4">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-2">
            <HardHat className="w-6 h-6" /> Gestão de Serviços e Obras
          </h1>
          <p className="text-gray-500 text-sm mt-1">Relatório Serviços Solicitados pela URE Guarulhos Sul(Últimos 12 Meses)</p>
            <p className="text-gray-500 text-sm mt-1">Serviço de Obras e Manuntenção Escolar - SEOM</p>

        </div>

        {/* ================= CARDS DE STATUS ================= */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 print:grid print:grid-cols-3 print:gap-4 print:mb-8">
          {STATUS_WORKFLOW.map(status => {
            const style = getStatusCardStyle(status);
            return (
              <div 
                key={status} 
                className={`p-4 rounded-2xl border ${style.border} bg-white shadow-sm flex flex-col relative overflow-hidden transition-all hover:shadow-md cursor-default`}
                title={`Total de serviços "${status}" nos últimos 12 meses`}
              >
                {/* Ícone de fundo suave */}
                <div className={`absolute -right-4 -top-4 opacity-[0.04] scale-150 pointer-events-none ${style.text} print:hidden`}>
                  {style.icon}
                </div>
                
                <div className="flex items-center gap-3 mb-3 relative z-10">
                  <div className={`p-2.5 rounded-xl ${style.bg}`}>
                    {style.icon}
                  </div>
                  <span className="text-3xl font-black text-gray-800 tracking-tight">
                    {statusCounts[status]}
                  </span>
                </div>
                
                <h4 className="text-[11px] sm:text-xs font-bold text-gray-500 leading-tight uppercase relative z-10 pr-2 print:text-[10px]">
                  {status}
                </h4>
              </div>
            )
          })}
        </section>

        {/* ================= ALERTA DE PRAZOS ================= */}
        {alertasPrazo.length > 0 && (
          <section className="bg-red-50 border-l-4 border-red-500 rounded-xl p-5 shadow-sm print:hidden animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg text-red-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-red-800 font-bold text-lg">Atenção: Prazos Críticos</h3>
                <p className="text-red-600 text-sm">Existem {alertasPrazo.length} serviços atrasados ou próximos do vencimento (7 dias ou menos).</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {alertasPrazo.map((servico) => (
                <div key={`alert-${servico.id}`} className="bg-white border border-red-100 rounded-lg p-3 flex justify-between items-center shadow-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-gray-800 truncate">{servico.escolaNome}</p>
                    <p className="text-xs text-gray-500 truncate" title={servico.descricao}>{servico.descricao}</p>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <span className={`inline-block font-bold px-2 py-1 rounded text-xs ${servico.prazoInfo.status === 'danger' ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-orange-100 text-orange-700'}`}>
                      {servico.prazoInfo.text}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ================= DASHBOARD ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:hidden">
          
          {/* Gráfico Mensal */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-500" /> Cadastros nos Últimos 12 Meses
            </h3>
            <div className="h-64 flex items-end gap-2 justify-between">
              {chartData.map((d, i) => {
                const heightPercentage = maxChartValue > 0 ? (d.count / maxChartValue) * 100 : 0;
                return (
                  <div key={i} className="flex flex-col items-center flex-1 group">
                    <div className="relative w-full flex justify-center h-48 items-end">
                      <div 
                        className="w-full max-w-[40px] bg-blue-100 group-hover:bg-blue-200 rounded-t-md transition-all duration-500 relative flex justify-center"
                        style={{ height: `${heightPercentage}%`, minHeight: d.count > 0 ? '4px' : '0' }}
                      >
                        {d.count > 0 && (
                          <span className="absolute -top-6 text-xs font-bold text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            {d.count}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] sm:text-xs text-gray-500 mt-2 truncate max-w-full text-center" title={d.name}>
                      {d.name.split(' ')[0]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Ranking Top 5 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-500" /> Top 5 Escolas (12 meses)
            </h3>
            <div className="space-y-4">
              {top5Escolas.length > 0 ? top5Escolas.map((escola, index) => {
                const max = top5Escolas[0].count;
                const pct = Math.round((escola.count / max) * 100);
                return (
                  <div key={index}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700 truncate pr-2">{index + 1}. {escola.name}</span>
                      <span className="text-gray-500 font-bold">{escola.count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-amber-400 h-2 rounded-full" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                )
              }) : (
                <p className="text-sm text-gray-500 text-center py-8">Sem dados suficientes para o ranking.</p>
              )}
            </div>
          </div>
        </div>

        {/* ================= FORMULÁRIO DE CADASTRO ================= */}
        <section className={`rounded-2xl shadow-lg border p-1 transition-colors duration-300 print:hidden ${editingId ? 'bg-amber-400 border-amber-300' : 'bg-slate-800 border-slate-700'}`}>
          <div className="bg-white rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6 border-b pb-4">
              {editingId ? <Pencil className="w-6 h-6 text-amber-500" /> : <Plus className="w-6 h-6 text-slate-800" />}
              <h2 className="text-xl font-bold text-gray-800">
                {editingId ? 'Editar Serviço' : 'Cadastrar Novo Serviço / Manutenção'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* Escola */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Unidade Escolar *</label>
                  <select 
                    name="escola_id" required value={formData.escola_id} onChange={handleInputChange}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    <option value="" disabled>Selecione a escola...</option>
                    {escolas.map(esc => <option key={esc.id} value={esc.id}>{esc.name}</option>)}
                  </select>
                </div>

                {/* Descrição */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Descrição do Serviço / Objeto *</label>
                  <textarea 
                    name="descricao" required rows={3} value={formData.descricao} onChange={handleInputChange}
                    placeholder="Ex: Reforma do telhado do bloco B e adequação elétrica..."
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  />
                </div>

                {/* Empresa */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Empresa Contratada (Se já definida)</label>
                  <input 
                    type="text" name="empresa" value={formData.empresa} onChange={handleInputChange}
                    placeholder="Nome da empresa / CNPJ"
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Valor */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Valor Estimado / Contratado (R$)</label>
                  <input 
                    type="number" step="0.01" min="0" name="valor" value={formData.valor} onChange={handleInputChange}
                    placeholder="0.00"
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Status */}
                <div className="md:col-span-2 bg-blue-50 p-4 rounded-xl border border-blue-100">
                  <label className="block text-sm font-bold text-blue-900 mb-2">Fase Atual do Fluxo *</label>
                  <select 
                    name="status" required value={formData.status} onChange={handleInputChange}
                    className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-blue-800"
                  >
                    {STATUS_WORKFLOW.map(status => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>

                {/* Datas (Obrigatório se for Início de Serviço) */}
                {(formData.status === 'Início de Serviço' || formData.status === 'Concluído' || formData.data_inicio) && (
                  <>
                    <div className="animate-in fade-in slide-in-from-top-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Data de Início do Serviço {formData.status === 'Início de Serviço' && <span className="text-red-500">*</span>}
                      </label>
                      <input 
                        type="date" name="data_inicio" value={formData.data_inicio} onChange={handleInputChange}
                        required={formData.status === 'Início de Serviço'}
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="animate-in fade-in slide-in-from-top-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Prazo Final (Previsão) {formData.status === 'Início de Serviço' && <span className="text-red-500">*</span>}
                      </label>
                      <input 
                        type="date" name="data_previsao_termino" value={formData.data_previsao_termino} onChange={handleInputChange}
                        required={formData.status === 'Início de Serviço'}
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                {editingId && (
                  <button type="button" onClick={cancelEdit} className="px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={isSaving} className={`px-6 py-2.5 text-white font-medium rounded-lg transition-colors flex items-center gap-2 ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-900 hover:bg-slate-800'}`}>
                  <Save className="w-5 h-5" /> {isSaving ? 'A guardar...' : editingId ? 'Atualizar Contrato' : 'Cadastrar Serviço'}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* ================= TABELA DE SERVIÇOS ================= */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          
          {/* Filtros da Tabela */}
          <div className="p-5 border-b border-gray-200 bg-gray-50 flex flex-col lg:flex-row gap-4 justify-between items-center print:hidden">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 w-full lg:w-auto">
              <FileText className="w-5 h-5 text-gray-500" /> Lista de Serviços
            </h3>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <select 
                value={filterEscola} onChange={(e) => setFilterEscola(e.target.value)}
                className="w-full sm:w-48 p-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="">Todas as Escolas</option>
                {escolas.map(esc => <option key={esc.id} value={esc.id}>{esc.name}</option>)}
              </select>

              <select 
                value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full sm:w-48 p-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="">Todos os Status</option>
                {STATUS_WORKFLOW.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                <input 
                  type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar serviço ou escola..." 
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600 print:text-xs">
              <thead className="bg-gray-100 text-gray-700 font-semibold uppercase text-xs">
                <tr>
                  <th className="px-5 py-4">Escola / Serviço</th>
                  <th className="px-5 py-4">Status / Fase</th>
                  <th className="px-5 py-4 hidden md:table-cell">Empresa & Valor</th>
                  <th className="px-5 py-4">Prazo / Alertas</th>
                  <th className="px-5 py-4 text-center print:hidden">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {servicosFiltrados.length > 0 ? servicosFiltrados.map((servico) => {
                  const prazoInfo = getPrazoInfo(servico.data_previsao_termino, servico.status);
                  
                  return (
                    <tr key={servico.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-bold text-gray-800 line-clamp-1">{servico.escolaNome}</p>
                        <p className="text-gray-500 text-xs mt-1 line-clamp-2" title={servico.descricao}>{servico.descricao}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold
                          ${servico.status === 'Concluído' ? 'bg-green-100 text-green-700' : 
                            servico.status === 'Não Autorizado e Concluído' ? 'bg-gray-200 text-gray-700' : 
                            servico.status === 'Início de Serviço' ? 'bg-blue-100 text-blue-700' : 
                            'bg-amber-100 text-amber-700'}`}
                        >
                          {servico.status === 'Concluído' ? <CheckCircle className="w-3.5 h-3.5" /> : 
                           servico.status === 'Início de Serviço' ? <HardHat className="w-3.5 h-3.5" /> : 
                           <AlertCircle className="w-3.5 h-3.5" />}
                          {servico.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <p className="font-medium text-gray-700">{servico.empresa || '-'}</p>
                        <p className="text-gray-500 text-xs">
                          {servico.valor ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(servico.valor) : 'Sem valor'}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        {servico.status === 'Início de Serviço' && servico.data_previsao_termino ? (
                          <div className={`flex items-center gap-2 p-2 rounded-lg border
                            ${prazoInfo.status === 'danger' ? 'bg-red-50 border-red-200 text-red-700 animate-pulse' : 
                              prazoInfo.status === 'warning' ? 'bg-orange-50 border-orange-200 text-orange-700' : 
                              'bg-green-50 border-green-200 text-green-700'}
                          `}>
                            {prazoInfo.status === 'danger' ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                            <div>
                              <p className="text-xs font-bold">{prazoInfo.text}</p>
                              <p className="text-[10px] opacity-80">Ref: {new Date(servico.data_previsao_termino).toLocaleDateString('pt-BR')}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center print:hidden">
                        <button 
                          onClick={() => handleEdit(servico)} 
                          className="p-2 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-gray-500">
                      Nenhum serviço encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

      </main>

      {/* ================= MODAL DE EXPORTAÇÃO ================= */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className={`p-4 text-white flex justify-between items-center ${exportType === 'excel' ? 'bg-green-600' : 'bg-red-600'}`}>
              <h3 className="font-bold flex items-center gap-2">
                {exportType === 'excel' ? <FileSpreadsheet className="w-5 h-5" /> : <FileDown className="w-5 h-5" />}
                Exportar Relatório Mensal
              </h3>
              <button onClick={() => setShowExportModal(false)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">Selecione o mês e o ano para gerar o relatório de serviços cadastrados neste período.</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Mês</label>
                  <select 
                    value={exportMonth} onChange={e => setExportMonth(Number(e.target.value))}
                    className="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                      <option key={m} value={m}>{new Date(2000, m-1, 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Ano</label>
                  <input 
                    type="number" value={exportYear} onChange={e => setExportYear(Number(e.target.value))}
                    className="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button 
                onClick={handleExport}
                className={`w-full py-3 mt-4 rounded-lg font-bold text-white transition-colors ${exportType === 'excel' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                Confirmar e Gerar {exportType === 'excel' ? 'Excel (CSV)' : 'PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}