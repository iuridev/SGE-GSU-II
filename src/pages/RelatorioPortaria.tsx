// Importa as bibliotecas fundamentais do React para lidar com estados, efeitos e referências
import { useState, useEffect, useRef } from 'react';
// Importa o cliente configurado do Supabase para fazer as consultas no banco de dados
import { supabase } from '../lib/supabase'; 
// Importa funções do date-fns para manipulação e formatação de datas de forma fácil
import { format, startOfYear, endOfYear, parseISO } from 'date-fns';
// Importa a localização em Português do Brasil para traduzir meses e dias no date-fns
import { ptBR } from 'date-fns/locale';
// Importa o jsPDF, que será responsável por criar o arquivo PDF final
import jsPDF from 'jspdf';
// Importa o html2canvas, que tira um "print" da tela (transforma HTML em Imagem) para o PDF
import html2canvas from 'html2canvas';
// Importa os componentes do Recharts para criar gráficos modernos, responsivos e interativos
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area 
} from 'recharts';
// Importa os ícones modernos e limpos da biblioteca Lucide React
import { 
  Download, Users, Building, ShieldCheck, 
  Calendar as CalendarIcon, Clock
} from 'lucide-react';
// Importa a biblioteca de notificações toast para dar feedback visual ao usuário
import toast from 'react-hot-toast'; 

// Define a estrutura (Tipagem) esperada dos dados que vêm do banco de dados (tabela portaria_registros)
interface RegistroPortaria {
  id: string;             // ID único do registro
  created_at: string;     // Data e hora em que a pessoa entrou
  nome: string;           // Nome completo do visitante
  cpf: string;            // Documento do visitante (CPF)
  setor: string;          // Setor de destino na URE
  registrado_por: string; // Usuário do sistema que fez o registro
}

// Declaração principal do componente do Dashboard
export default function RelatorioPortaria() {
  // Cria um estado para armazenar a lista de registros de acesso vindos do banco
  const [registros, setRegistros] = useState<RegistroPortaria[]>([]);
  // Cria um estado para controlar o carregamento (spinner) enquanto busca os dados
  const [loading, setLoading] = useState(true);
  // Cria um estado para armazenar o momento exato da última atualização/busca dos dados
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  
  // Cria um estado para a data inicial do filtro (Por padrão, o primeiro dia do ano atual)
  const [dataInicio, setDataInicio] = useState(format(startOfYear(new Date()), 'yyyy-MM-dd'));
  // Cria um estado para a data final do filtro (Por padrão, o último dia do ano atual)
  const [dataFim, setDataFim] = useState(format(endOfYear(new Date()), 'yyyy-MM-dd'));

  // Cria uma referência para o elemento HTML que engloba todo o relatório (usado pelo html2canvas)
  const relatorioRef = useRef<HTMLDivElement>(null);

  // useEffect que observa as variáveis dataInicio e dataFim; se mudarem, roda a função fetchRegistros
  useEffect(() => {
    // Chama a função que busca dados no Supabase toda vez que as datas do filtro mudam
    fetchRegistros();
  // Array de dependências do useEffect (variáveis observadas)
  }, [dataInicio, dataFim]);

  // Função assíncrona responsável por buscar os dados na tabela do Supabase
  const fetchRegistros = async () => {
    // Ativa o estado de carregamento para mostrar o spinner na tela
    setLoading(true);
    try {
      // Faz uma requisição SELECT na tabela 'portaria_registros'
      const { data, error } = await supabase
        .from('portaria_registros')
        .select('*') // Pega todas as colunas
        // Filtra para pegar registros com data maior ou igual à data de início (início do dia 00:00:00)
        .gte('created_at', `${dataInicio}T00:00:00.000Z`)
        // Filtra para pegar registros com data menor ou igual à data de fim (final do dia 23:59:59)
        .lte('created_at', `${dataFim}T23:59:59.999Z`)
        // Ordena os resultados pela data de criação, do mais recente para o mais antigo (descrescente)
        .order('created_at', { ascending: false });

      // Se houver algum erro na consulta do Supabase, lança uma exceção para cair no 'catch'
      if (error) throw error;

      // Se a busca der certo, salva os dados no estado 'registros' (ou array vazio se não vier nada)
      setRegistros(data || []);
      // Atualiza a hora da última sincronização para o momento atual
      setLastUpdate(new Date()); 
    } catch (error) {
      // Imprime o erro no console para fins de depuração do desenvolvedor
      console.error('Erro ao buscar registros da portaria:', error);
      // Exibe uma notificação de erro visual (toast vermelho) para o usuário final
      toast.error('Não foi possível carregar os dados.');
    } finally {
      // Independentemente de dar certo ou errado, desliga o estado de carregamento (remove o spinner)
      setLoading(false);
    }
  };

  // Função assíncrona para gerar e baixar o relatório em formato PDF
  const exportarPDF = async () => {
    // Verifica se a referência HTML do relatório existe na tela; se não, interrompe a função
    if (!relatorioRef.current) return;
    // Dispara uma notificação de "carregando" no canto da tela e guarda o ID do toast
    const toastId = toast.loading('Gerando PDF... Aguarde.');
    
    try {
      // O html2canvas "tira uma foto" da div atual. O scale: 2 aumenta a qualidade/resolução da imagem
      const canvas = await html2canvas(relatorioRef.current, { scale: 2, useCORS: true });
      // Converte o canvas (imagem em memória) para uma URL de dados em formato PNG
      const imgData = canvas.toDataURL('image/png');
      
      // Cria um novo documento PDF: 'p' = retrato (portrait), 'mm' = milímetros, 'a4' = tamanho do papel
      const pdf = new jsPDF('p', 'mm', 'a4');
      // Obtém a largura interna disponível da página PDF
      const pdfWidth = pdf.internal.pageSize.getWidth();
      // Calcula a altura proporcional da imagem em relação à largura do PDF para não distorcer
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      // Adiciona a imagem gerada na posição (X:0, Y:0) com a largura e altura calculadas
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      // Salva o arquivo no computador do usuário com um nome dinâmico baseado na data de hoje
      pdf.save(`Relatorio_Acessos_${format(new Date(), 'dd-MM-yyyy')}.pdf`);
      
      // Atualiza a notificação de "carregando" para "sucesso" (toast verde)
      toast.success('PDF gerado com sucesso!', { id: toastId });
    } catch (error) {
      // Se algo der errado na conversão, imprime no console do navegador
      console.error('Erro na exportação:', error);
      // Atualiza a notificação de "carregando" para "erro" (toast vermelho)
      toast.error('Erro ao gerar PDF. Tente novamente.', { id: toastId });
    }
  };

  // ========================================================================= //
  // ================= MÉTRICAS E PROCESSAMENTO DOS DADOS ================== //
  // ========================================================================= //

  // 1. Processa a lista para encontrar os 5 visitantes mais frequentes
  const topVisitantes = Object.values(registros.reduce((acc, curr) => {
    // Se o CPF do visitante ainda não existe no acumulador, cria uma entrada nova para ele
    if (!acc[curr.cpf]) {
      // Inicializa os dados básicos do visitante, com visitas começando em 0
      acc[curr.cpf] = { nome: curr.nome, cpf: curr.cpf, visitas: 0, setor: curr.setor };
    }
    // Incrementa +1 no número de visitas daquele CPF específico
    acc[curr.cpf].visitas += 1;
    // Retorna o objeto atualizado para a próxima iteração do reduce
    return acc;
  // A tipagem do Record diz que a chave é string (CPF) e o valor é o objeto com as informações
  }, {} as Record<string, { nome: string, cpf: string, visitas: number, setor: string }>))
  // Transforma os valores do objeto de volta em um array e ordena de quem tem MAIS para quem tem MENOS visitas
  .sort((a, b) => b.visitas - a.visitas)
  // Corta o array para pegar apenas as 5 primeiras posições (Top 5)
  .slice(0, 5); 

  // 2. Processa os dados para o Gráfico de Barras (Contagem de acessos por Setor)
  const acessosPorSetor = Object.entries(registros.reduce((acc, curr) => {
    // Define o setor; se o registro não tiver setor, usa o texto 'Não Informado'
    const setor = curr.setor || 'Não Informado';
    // Se o setor já existe no acumulador soma +1, senão começa com 1
    acc[setor] = (acc[setor] || 0) + 1;
    // Retorna o acumulador
    return acc;
  // Transforma o objeto { "SEMAT": 10, "Plantão": 5 } em arrays [chave, valor]
  }, {} as Record<string, number>))
  // Mapeia o array [chave, valor] para gerar um array de objetos: { name: 'SEMAT', count: 10 }
  .map(([name, count]) => ({ name, count }))
  // Ordena do setor mais visitado para o menos visitado
  .sort((a, b) => b.count - a.count)
  // Corta para mostrar apenas os 8 setores mais populares (evita que o gráfico de barras fique esmagado)
  .slice(0, 8); 

  // 3. Processa os dados para o Gráfico de Área (Fluxo de acessos ao longo dos meses)
  const acessosPorTempo = Object.entries(registros.reduce((acc, curr) => {
    // Converte a data do registro para um texto formatado: ex: "abr/26" (mês abreviado e ano)
    const mes = format(parseISO(curr.created_at), 'MMM/yy', { locale: ptBR });
    // Soma +1 no mês correspondente
    acc[mes] = (acc[mes] || 0) + 1;
    // Retorna o acumulador
    return acc;
  // Transforma em arrays [mes, total]
  }, {} as Record<string, number>))
  // Mapeia para um array de objetos ideal para o Recharts: { mes: 'abr/26', total: 50 }
  .map(([mes, total]) => ({ mes, total }))
  // Inverte a ordem para ficar cronológico, do mês mais antigo para o mais recente no gráfico
  .reverse(); 

  // 4. Calcula os KPIs (Indicadores-chave de desempenho) para os cards superiores
  // Total geral é simplesmente o tamanho do array de registros que vieram do banco
  const totalAcessos = registros.length;
  // Usa a estrutura matemática 'Set' para remover CPFs duplicados e descobrir o número de pessoas únicas
  const cpfsUnicos = new Set(registros.map(r => r.cpf)).size;
  // Pega o nome do primeiro setor do array ordenado (o mais visitado). Se não houver, mostra 'N/A'
  const setorMaisVisitado = acessosPorSetor[0]?.name || 'N/A';

  // Se a tela estiver carregando E ainda não tiver registros, mostra a animação do Spinner
  if (loading && registros.length === 0) {
    // Retorna uma div centralizada com o Spinner TailwindCSS
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Se terminou de carregar, retorna a estrutura HTML/React do Dashboard completo
  return (
    // Div principal que envolve tudo. A propriedade 'ref' permite que o html2canvas acesse esta div
    // A classe pb-8 adiciona um espaço embaixo para que a borda do PDF não corte nada
    <div className="w-full flex flex-col gap-6 pb-8 bg-slate-50" ref={relatorioRef} id="relatorio-dashboard">
      
      {/* ======================= CABEÇALHO ======================= */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        
        {/* Lado Esquerdo do Cabeçalho: Títulos e Informações em Texto (Aparece no PDF) */}
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            {/* Ícone de escudo/verificação em azul */}
            <ShieldCheck className="text-blue-600" size={28} />
            Relatório Gerencial de Acessos
          </h1>
          {/* Texto de última atualização formatado com date-fns */}
          <p className="text-sm text-slate-500 mt-2 flex items-center gap-2">
            <Clock size={14} /> Atualizado em: <span className="font-bold">{format(lastUpdate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
          </p>
          {/* NOVA LINHA: Exibe o período do filtro de forma clara em formato de texto.
              Isto resolve o bug do texto cortado nos inputs dentro do PDF. */}
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
            <CalendarIcon size={14} /> Período analisado: 
            <span className="font-bold text-blue-600">
              {format(parseISO(dataInicio), 'dd/MM/yyyy')} a {format(parseISO(dataFim), 'dd/MM/yyyy')}
            </span>
          </p>
        </div>

        {/* Lado Direito do Cabeçalho: Controles de Input e Botão. 
            ATENÇÃO: data-html2canvas-ignore="true" esconde este bloco INBOX inteiro no PDF! 
            Isso previne botões estranhos ou caixas de data "bugadas" e cortadas no PDF impresso. */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto" data-html2canvas-ignore="true">
          
          {/* Caixa de input de datas (somente UI web) */}
          <div className="flex items-center bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm">
            <CalendarIcon size={16} className="text-slate-400 mx-2" />
            {/* Input Data Início: Ao mudar, atualiza o estado 'dataInicio' */}
            <input 
              type="date" 
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer"
            />
            <span className="text-slate-300 font-bold mx-2">/</span>
            {/* Input Data Fim: Ao mudar, atualiza o estado 'dataFim' */}
            <input 
              type="date" 
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer"
            />
          </div>
          
          {/* Botão para disparar a função de gerar o PDF */}
          <button 
            onClick={exportarPDF}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-500/30 transition-all flex items-center gap-2"
          >
            <Download size={18} />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* ======================= CARDS DE RESUMO (KPIs) ======================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Card 1: Total Geral (Em destaque azul) */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-6 rounded-2xl shadow-lg shadow-blue-500/20 text-white relative overflow-hidden">
          {/* Ícone grande semi-transparente como marca d'água no fundo do card */}
          <Users className="absolute -right-4 -bottom-4 opacity-20" size={100} />
          <p className="text-blue-100 text-sm font-bold uppercase tracking-widest">Total de Acessos</p>
          <p className="text-5xl font-black mt-2">{totalAcessos}</p>
          <p className="text-xs text-blue-200 mt-2">Visitas registradas no período</p>
        </div>
        
        {/* Card 2: Pessoas/CPFs Únicos */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          {/* Quadrado com ícone verde no canto superior direito */}
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center absolute top-6 right-6">
            <Users size={24} />
          </div>
          <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Visitantes Únicos</p>
          <p className="text-4xl font-black text-slate-800 mt-2">{cpfsUnicos}</p>
          <p className="text-xs text-slate-500 mt-2">CPFs distintos registrados</p>
        </div>

        {/* Card 3: Setor Mais Visitado */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          {/* Quadrado com ícone amarelo/âmbar no canto superior direito */}
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center absolute top-6 right-6">
            <Building size={24} />
          </div>
          <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Setor Mais Visitado</p>
          {/* NOVA CORREÇÃO: Removido o 'truncate'. Adicionado 'break-words', 'w-full' e 'text-xl' 
              para permitir que nomes extensos de setor quebrem linha e não cortem fora do PDF! */}
          <p className="text-xl font-black text-slate-800 mt-2 w-full break-words leading-tight pr-14">
            {setorMaisVisitado}
          </p>
          <p className="text-xs text-slate-500 mt-2">Responsável pelo maior fluxo</p>
        </div>
      </div>

      {/* ======================= SESSÃO DE GRÁFICOS ======================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Gráfico 1: Acessos ao Longo do Tempo (Gráfico de Área) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-6">Volume de Entradas no Tempo</h3>
          {/* Contêiner de altura fixa para forçar o gráfico a não colapsar */}
          <div className="h-72 w-full">
            {/* ResponsiveContainer garante que o gráfico se adapte à largura da div pai */}
            <ResponsiveContainer width="100%" height="100%">
              {/* Chama o componente AreaChart passando o array de meses/totais gerado no topo */}
              <AreaChart data={acessosPorTempo} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                {/* O defs cria um efeito de gradiente de cor azul que desvanece de cima para baixo */}
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                {/* Linhas de grade pontilhadas horizontais no fundo */}
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                {/* Eixo X (Meses no rodapé) - Retirada as linhas sólidas e ajustada a fonte */}
                <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                {/* Eixo Y (Números na lateral) */}
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                {/* Tooltip (balão) que aparece ao passar o mouse por cima do gráfico na web */}
                <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                {/* A área pintada efetivamente, ligada a chave 'total' dos dados, pintada com o gradiente */}
                <Area type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: Distribuição por Setor (Gráfico de Barras Horizontais) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-6">Acessos por Destino (Setor)</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {/* layout="vertical" faz as barras deitarem (ideal para ler nomes compridos de setores) */}
              <BarChart data={acessosPorSetor} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                {/* Grade vertical em vez de horizontal */}
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                {/* O eixo X (base) agora é numerico para definir o comprimento das barras */}
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                {/* O eixo Y (lateral) agora mostra os nomes, com largura ampliada (width 120) para nomes longos */}
                <YAxis dataKey="name" type="category" width={140} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                {/* Tooltip formatado */}
                <RechartsTooltip cursor={{fill: '#f1f5f9'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                {/* Desenha as barras verde-esmeralda vinculadas a chave 'count' com pontas arredondadas à direita */}
                <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* ======================= TABELA TOP VISITANTES ======================= */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Cabeçalho da área da tabela */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Os 5 Maiores Visitantes da URE</h3>
        </div>
        {/* Div overflow-x-auto permite rolar a tabela em celulares se não couber na tela inteira */}
        <div className="overflow-x-auto">
          {/* Tag de tabela nativa do HTML formatada com Tailwind */}
          <table className="w-full text-left border-collapse">
            <thead>
              {/* Linha de cabeçalhos da tabela, com fundo cinza-claro */}
              <tr className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500 font-bold border-b border-slate-100">
                <th className="p-4 pl-6">Nome do Visitante</th>
                <th className="p-4">Documento (CPF)</th>
                <th className="p-4">Setor Destino Comum</th>
                <th className="p-4 text-center pr-6">Total de Visitas</th>
              </tr>
            </thead>
            <tbody>
              {/* Percorre o array topVisitantes (que já só tem 5 posições max) renderizando uma linha <tr> para cada um */}
              {topVisitantes.map((visitante, index) => (
                // Uma linha da tabela com transição de cor quando o mouse passa por cima (hover)
                <tr key={index} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0">
                  {/* Coluna 1: O Nome e um "avatar" gerado automaticamente com a primeira letra do nome */}
                  <td className="p-4 pl-6 font-bold text-slate-800 text-sm flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs shrink-0">
                      {visitante.nome.charAt(0)}
                    </div>
                    {visitante.nome}
                  </td>
                  {/* Coluna 2: O CPF formatado (exibido como está no banco) */}
                  <td className="p-4 text-slate-500 text-sm font-medium">{visitante.cpf}</td>
                  {/* Coluna 3: O Setor. Truncate (cortar com '...') adicionado apenas aqui para preservar design da tabela web */}
                  <td className="p-4 text-slate-500 text-xs font-medium truncate max-w-[200px]">{visitante.setor}</td>
                  {/* Coluna 4: O número de vezes que ele foi, exibido como um "botão/badge" verdinho centralizado */}
                  <td className="p-4 pr-6 text-center">
                    <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-black">
                      {visitante.visitas}x
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}