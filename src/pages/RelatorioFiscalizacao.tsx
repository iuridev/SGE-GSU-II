// Importa hooks fundamentais do React para gerenciar estado, ciclo de vida e referências do DOM
import { useState, useEffect, useRef } from 'react';
// Importa o cliente do Supabase para fazer consultas ao banco de dados
import { supabase } from '../lib/supabase';
// Importa funções de data do date-fns para manipulação e formatação
import { format, parseISO } from 'date-fns';
// Importa o locale ptBR para formatar datas no padrão brasileiro
import { ptBR } from 'date-fns/locale';
// Importa o jsPDF para gerar o documento PDF final
import jsPDF from 'jspdf';
// Importa o html2canvas para capturar a tela (inclusive gráficos) e transformar em imagem para o PDF
import html2canvas from 'html2canvas';
// Importa componentes visuais (gráficos) da biblioteca Recharts, que são modernos e responsivos
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
// Importa ícones da biblioteca Lucide React para melhorar a interface visual
import { 
  Download, ShieldCheck, Clock, CheckCircle, 
  XCircle, Droplets, Shield, School
} from 'lucide-react';
// Importa o toast para dar feedback visual (notificações) ao usuário
import toast from 'react-hot-toast';

// Define a interface para tipar os dados da Escola
interface Escola {
  id: string;
  name: string; 
}

// Define a interface para tipar os dados do Evento (a Fiscalização criada)
interface MonitoringEvent {
  id: string;
  date: string;
  service_type: string; // Geralmente 'LIMPEZA' ou 'VIGILANTE'
}

// Define a interface para tipar as Submissões (a resposta das escolas)
interface MonitoringSubmission {
  id: string;
  event_id: string;
  school_id: string;
  is_completed: boolean;
  is_dispensed: boolean;
  rating: number | null;
  updated_at: string;
  // Propriedades aninhadas vindas do Join (relacionamento) com o Supabase
  monitoring_events: MonitoringEvent;
  schools: Escola;
}

// Declaração principal do componente do Relatório de Fiscalização
export default function RelatorioFiscalizacao() {
  // Estado para armazenar a lista de submissões buscadas no banco
  const [submissoes, setSubmissoes] = useState<MonitoringSubmission[]>([]);
  // Estado para armazenar a lista de escolas para o filtro (Select)
  const [escolas, setEscolas] = useState<Escola[]>([]);
  // Estado para armazenar qual escola está selecionada no filtro ('all' = todas)
  const [escolaSelecionada, setEscolaSelecionada] = useState<string>('all');
  // Estado para controlar a exibição da tela de carregamento (spinner)
  const [loading, setLoading] = useState(true);
  // Estado para armazenar a data da última atualização dos dados
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  
  // Referência para o container principal do relatório, usada pelo html2canvas para gerar o PDF
  const relatorioRef = useRef<HTMLDivElement>(null);

  // Paleta de cores moderna para usar nos gráficos de rosca (PieChart)
  // Como removemos as dispensadas, a cor [0] será verde (Concluídas) e [1] vermelha (Pendentes)
  const COLORS = ['#10b981', '#f43f5e', '#f59e0b']; 

  // useEffect que roda apenas uma vez quando o componente é montado na tela
  useEffect(() => {
    // Chama a função que carrega os dados gerais do banco de dados
    fetchDados();
  }, []);

  // Função assíncrona para buscar os dados de escolas e fiscalizações no Supabase
  const fetchDados = async () => {
    // Ativa o estado de carregamento
    setLoading(true);
    try {
      // 1. Busca todas as escolas ativas para preencher o filtro (select)
      const { data: escolasData, error: escolasError } = await supabase
        .from('schools')
        .select('id, name')
        .order('name', { ascending: true }); // Ordena por ordem alfabética

      // Se houver erro ao buscar escolas, lança uma exceção
      if (escolasError) throw escolasError;
      // Atualiza o estado com as escolas encontradas
      setEscolas(escolasData || []);

      // 2. Busca todas as submissões de fiscalização fazendo INNER JOIN (relacionamento) com eventos e escolas
      const { data: submissoesData, error: submissoesError } = await supabase
        .from('monitoring_submissions')
        .select(`
          *,
          monitoring_events (id, date, service_type),
          schools (id, name)
        `)
        // Ordena pela data de atualização, da mais recente para a mais antiga
        .order('updated_at', { ascending: false });

      // Se houver erro ao buscar submissões, lança uma exceção
      if (submissoesError) throw submissoesError;

      // Salva os dados no estado e atualiza o horário da última busca
      setSubmissoes(submissoesData as unknown as MonitoringSubmission[]);
      setLastUpdate(new Date());

    } catch (error) {
      // Mostra o erro no console em caso de falha
      console.error('Erro ao buscar dados:', error);
      // Exibe uma notificação amigável para o usuário indicando o erro
      toast.error('Erro ao carregar dados das fiscalizações.');
    } finally {
      // Independente de sucesso ou erro, remove a tela de carregamento
      setLoading(false);
    }
  };

  // Função para exportar a tela inteira em formato PDF
  const exportarPDF = async () => {
    // Verifica se a referência HTML está ligada a algum elemento, se não, cancela
    if (!relatorioRef.current) return;
    // Dispara uma notificação de carregamento
    const toastId = toast.loading('Gerando PDF com os gráficos... Aguarde.');
    
    try {
      // Captura o elemento HTML em um Canvas (aumento de escala para alta resolução 2x)
      const canvas = await html2canvas(relatorioRef.current, { scale: 2, useCORS: true });
      // Transforma o Canvas gerado em uma imagem PNG em base64
      const imgData = canvas.toDataURL('image/png');
      
      // Instancia o PDF no formato retrato (p), milímetros (mm) e tamanho (a4)
      const pdf = new jsPDF('p', 'mm', 'a4');
      // Obtém a largura da página A4 no PDF
      const pdfWidth = pdf.internal.pageSize.getWidth();
      // Calcula a altura da imagem proporcionalmente à largura do A4
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      // Adiciona a imagem PNG no documento PDF nas coordenadas X=0 e Y=0
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      // Salva e baixa o PDF no dispositivo com nome baseado na data atual
      pdf.save(`Relatorio_Fiscalizacao_${format(new Date(), 'dd-MM-yyyy')}.pdf`);
      
      // Atualiza o toast notificando que deu tudo certo
      toast.success('PDF gerado com sucesso!', { id: toastId });
    } catch (error) {
      // Imprime o erro no console
      console.error('Erro na geração do PDF:', error);
      // Informa ao usuário sobre a falha na geração do PDF
      toast.error('Ocorreu um erro ao gerar o PDF.', { id: toastId });
    }
  };

  // ========================================================================= //
  // ================= PROCESSAMENTO DE DADOS PARA O DASHBOARD =============== //
  // ========================================================================= //

  // Filtra as submissões gerais com base na escola selecionada no Select
  const submissoesFiltradas = escolaSelecionada === 'all' 
    ? submissoes // Se for "all", pega todas
    : submissoes.filter(s => s.school_id === escolaSelecionada); // Se for ID, filtra apenas aquela escola

  // Separa as submissões onde o tipo de serviço no evento relacionado é LIMPEZA
  const submissoesLimpeza = submissoesFiltradas.filter(s => s.monitoring_events?.service_type === 'LIMPEZA');
  // Separa as submissões onde o tipo de serviço no evento relacionado é VIGILANTE (Vigilância)
  const submissoesVigilancia = submissoesFiltradas.filter(s => s.monitoring_events?.service_type === 'VIGILANTE');

  // Função utilitária interna para calcular a média das notas
  const calcularMedia = (lista: MonitoringSubmission[]) => {
    // Filtra apenas submissões concluídas que tenham alguma nota definida
    const validas = lista.filter(s => s.is_completed && s.rating !== null);
    // Se não tiver notas válidas, retorna 0
    if (validas.length === 0) return 0;
    // Soma todas as notas usando reduce
    const soma = validas.reduce((acc, curr) => acc + (curr.rating || 0), 0);
    // Divide a soma pela quantidade para obter a média (com 1 casa decimal)
    return (soma / validas.length).toFixed(1);
  };

  // Calcula a média das avaliações de Limpeza usando a função utilitária
  const mediaLimpeza = calcularMedia(submissoesLimpeza);
  // Calcula a média das avaliações de Vigilância usando a função utilitária
  const mediaVigilancia = calcularMedia(submissoesVigilancia);

  // Calcula contadores de status (Geral) para o gráfico de rosca
  const statusConcluidas = submissoesFiltradas.filter(s => s.is_completed && !s.is_dispensed).length;
  const statusPendentes = submissoesFiltradas.filter(s => !s.is_completed && !s.is_dispensed).length;

  // Monta o array de dados específico para o gráfico de rosca (PieChart)
  // NOTA: 'Dispensadas' foram removidas conforme solicitado para desconsiderar nesta métrica
  const dadosStatus = [
    { name: 'Concluídas', value: statusConcluidas },
    { name: 'Pendentes', value: statusPendentes }
  ];

  // Processa as notas médias ao longo do tempo (Gráfico de Área)
  const tendenciasTemporais = Object.entries(
    // Usa reduce para agrupar as submissões concluídas pelo mês da data do evento
    submissoesFiltradas.filter(s => s.is_completed && s.rating !== null).reduce((acc, curr) => {
      // Formata a data (ex: 'Fev/26')
      const mes = format(parseISO(curr.monitoring_events.date || curr.updated_at), 'MMM/yy', { locale: ptBR });
      // Inicializa o objeto do mês se não existir
      if (!acc[mes]) acc[mes] = { somaLimpeza: 0, countLimpeza: 0, somaVigilancia: 0, countVigilancia: 0 };
      
      // Se for do tipo LIMPEZA, adiciona nota na soma e soma +1 contador
      if (curr.monitoring_events?.service_type === 'LIMPEZA') {
        acc[mes].somaLimpeza += curr.rating!;
        acc[mes].countLimpeza += 1;
      } 
      // Se for do tipo VIGILANTE, adiciona nota na soma e soma +1 contador
      else if (curr.monitoring_events?.service_type === 'VIGILANTE') {
        acc[mes].somaVigilancia += curr.rating!;
        acc[mes].countVigilancia += 1;
      }
      // Retorna o acumulador iterativo
      return acc;
    }, {} as Record<string, any>)
  ).map(([mes, dados]) => ({
    mes, // Nome do mês
    // Calcula as médias no mês, ou 0 se não teve submissões
    Limpeza: dados.countLimpeza > 0 ? Number((dados.somaLimpeza / dados.countLimpeza).toFixed(1)) : 0,
    Vigilância: dados.countVigilancia > 0 ? Number((dados.somaVigilancia / dados.countVigilancia).toFixed(1)) : 0,
  })).reverse(); // Reverte para exibir em ordem cronológica se estiver decrescente

  // Processa ranking/média por escola para o gráfico de barras (Apenas visível se 'all' estiver selecionado)
  const rankingEscolas = Object.entries(
    // Agrupa submissões concluídas por nome de escola
    submissoesFiltradas.filter(s => s.is_completed && s.rating !== null).reduce((acc, curr) => {
      const escolaNome = curr.schools?.name || 'Desconhecida';
      // Inicializa a escola se não existir
      if (!acc[escolaNome]) acc[escolaNome] = { soma: 0, count: 0 };
      // Incrementa os contadores de notas e totais
      acc[escolaNome].soma += curr.rating!;
      acc[escolaNome].count += 1;
      return acc;
    }, {} as Record<string, { soma: number, count: number }>)
  )
  .map(([nome, dados]) => ({
    nome: nome.length > 20 ? nome.substring(0, 20) + '...' : nome, // Abrevia nomes muito longos no gráfico
    Média: Number((dados.soma / dados.count).toFixed(1)) // Converte para número
  }))
  .sort((a, b) => b.Média - a.Média) // Ordena da maior para a menor média
  .slice(0, 10); // Pega apenas o Top 10 escolas

  // ========================================================================= //
  // ======================== RENDERIZAÇÃO DO COMPONENTE ===================== //
  // ========================================================================= //

  // Renderiza um spinner enquanto busca os dados
  if (loading && submissoes.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Retorna a interface completa do Dashboard
  return (
    // Div principal contendo a referência do PDF e cores de fundo leves
    <div className="w-full flex flex-col gap-6 pb-8 bg-slate-50" ref={relatorioRef} id="relatorio-fiscalizacao">
      
      {/* ======================= CABEÇALHO E FILTROS ======================= */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        
        {/* Lado Esquerdo do Cabeçalho (Título e Info) */}
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <ShieldCheck className="text-blue-600" size={28} />
            Dashboard de Fiscalizações
          </h1>
          <p className="text-sm text-slate-500 mt-2 flex items-center gap-2">
            <Clock size={14} />
            Atualizado em: <span className="font-bold">{format(lastUpdate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
          </p>
        </div>

        {/* Lado Direito do Cabeçalho (Filtro Select e Botão PDF) */}
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          <div className="flex flex-col gap-1 w-full md:w-64">
            {/* Rótulo para o filtro de escola */}
            <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
              <School size={12}/> Selecionar Escola
            </label>
            {/* Campo Select (Filtro) - O valor muda o estado 'escolaSelecionada' */}
            <select 
              className="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 outline-none"
              value={escolaSelecionada}
              onChange={(e) => setEscolaSelecionada(e.target.value)}
            >
              <option value="all">Todas as Escolas (Visão Geral)</option>
              {escolas.map((esc) => (
                <option key={esc.id} value={esc.id}>{esc.name}</option>
              ))}
            </select>
          </div>

          {/* Botão de Exportar para PDF */}
          <button 
            onClick={exportarPDF}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-5 rounded-lg transition-colors h-fit mt-auto shadow-sm"
          >
            <Download size={18} />
            <span>Exportar PDF</span>
          </button>
        </div>
      </div>

      {/* ======================= CARDS DE KPIS (INDICADORES) ======================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Geral de Submissões Analisadas */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-1">
          <p className="text-sm font-medium text-slate-500 uppercase tracking-wide flex items-center gap-2">
            <CheckCircle size={16} className="text-slate-400"/> Total Analisado
          </p>
          <p className="text-3xl font-black text-slate-800">{submissoesFiltradas.length}</p>
        </div>

        {/* Card 2: Média Geral Limpeza */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-blue-100 flex flex-col gap-1">
          <p className="text-sm font-medium text-blue-600 uppercase tracking-wide flex items-center gap-2">
            <Droplets size={16} /> Média Limpeza
          </p>
          <p className="text-3xl font-black text-blue-700">{mediaLimpeza} <span className="text-lg text-blue-400 font-medium">/ 10</span></p>
        </div>

        {/* Card 3: Média Geral Vigilância */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-indigo-100 flex flex-col gap-1">
          <p className="text-sm font-medium text-indigo-600 uppercase tracking-wide flex items-center gap-2">
            <Shield size={16} /> Média Vigilância
          </p>
          <p className="text-3xl font-black text-indigo-700">{mediaVigilancia} <span className="text-lg text-indigo-400 font-medium">/ 10</span></p>
        </div>

        {/* Card 4: Submissões Pendentes */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-rose-100 flex flex-col gap-1">
          <p className="text-sm font-medium text-rose-600 uppercase tracking-wide flex items-center gap-2">
            <XCircle size={16} /> Pendentes
          </p>
          <p className="text-3xl font-black text-rose-700">{statusPendentes}</p>
        </div>
      </div>

      {/* ======================= ÁREA DE GRÁFICOS (DASHBOARD) ======================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* GRÁFICO 1: Tendência de Notas por Serviço (Gráfico de Área) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 col-span-1 lg:col-span-2">
          <h2 className="text-lg font-bold text-slate-800 mb-6">Tendência de Desempenho Mensal (Notas)</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tendenciasTemporais} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLimpeza" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorVigilancia" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} domain={[0, 10]} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }}/>
                <Area type="monotone" dataKey="Limpeza" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorLimpeza)" />
                <Area type="monotone" dataKey="Vigilância" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorVigilancia)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GRÁFICO 2: Taxa de Respostas/Status (Gráfico de Rosca/Pizza) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-6">Status Geral das Submissões</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dadosStatus}
                  cx="50%"
                  cy="50%"
                  innerRadius={60} 
                  outerRadius={100}
                  paddingAngle={5} 
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                {dadosStatus.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GRÁFICO 3: Ranking de Média por Escolas (Gráfico de Barras) */}
        {escolaSelecionada === 'all' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-6">Top 10 Escolas (Médias Finais)</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankingEscolas} layout="vertical" margin={{ top: 0, right: 30, left: 30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                  <XAxis type="number" domain={[0, 10]} hide />
                  <YAxis type="category" dataKey="nome" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} width={120} />
                  <RechartsTooltip 
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="Média" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        
        {/* Se uma escola está selecionada, no lugar do gráfico de Ranking mostramos um aviso visual */}
        {escolaSelecionada !== 'all' && (
           <div className="bg-slate-100 p-6 rounded-2xl border border-slate-200 border-dashed flex flex-col items-center justify-center text-center h-full min-h-64">
              <School className="text-slate-300 mb-3" size={48} />
              <h3 className="text-slate-500 font-semibold text-lg">Visão Detalhada Ativa</h3>
              <p className="text-slate-400 text-sm mt-1 max-w-sm">
                Você está visualizando os dados restritos de uma única escola. O gráfico de ranking comparativo fica oculto até que você selecione "Todas as Escolas".
              </p>
           </div>
        )}

      </div>
    </div>
  );
}