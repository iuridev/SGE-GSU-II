import { useState, useEffect, useMemo, useRef } from 'react';
// Usando importação via CDN para funcionar no ambiente de preview. 
// No seu projeto local, use: import { createClient } from '@supabase/supabase-js';
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore
import jsPDF from 'https://esm.sh/jspdf@2.5.1';
// @ts-ignore
import autoTable from 'https://esm.sh/jspdf-autotable@3.5.29';

import { 
  Ticket, Plus, X, 
  CheckCircle, Clock, ArrowRightLeft, Paperclip, 
  Send, Building2,
  PieChart, ListOrdered, CheckCircle2, MessageCircle, AlertTriangle, FileText, Download, Activity
} from 'lucide-react';

// --- CONFIGURAÇÃO SUPABASE ---

// Função auxiliar para buscar variáveis de ambiente de forma segura
const getEnv = (key: string) => {
  // @ts-ignore
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    // @ts-ignore
    return process.env[key];
  }
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
        // @ts-ignore
        return import.meta.env[key];
    }
  } catch (e) {
    // Ignora erro se import.meta não existir
  }
  return '';
};

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
const supabaseKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || getEnv('VITE_SUPABASE_ANON_KEY');

// Inicialização segura: se não houver URL, definimos como null para tratar na UI
const supabase = supabaseUrl ? createClient(supabaseUrl, supabaseKey) : null;

// Tipos
interface TicketData {
  id: string;
  protocol: string;
  school_id: string;
  title: string;
  category: string;
  department: 'SEOM' | 'SEFISC';
  description: string;
  drive_link?: string;
  status: 'ABERTO' | 'EM_ANDAMENTO' | 'AGUARDANDO_ESCOLA' | 'CONCLUIDO';
  created_at: string;
  schools?: { name: string };
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  type: string;
  created_at: string;
  profiles?: { full_name: string; role: string };
}

interface SchoolOption {
  id: string;
  name: string;
}

const CATEGORIES = [
  'SISTEMA', 'OBRAS', 'MANUTENÇÕES', 'VISTORIA', 'ZELADORIA', 
  'PATRIMÔNIO', 'FISCALIZAÇÃO LIMPEZA', 'FISCALIZAÇÃO VIGILÂNCIA', 
  'CONSUMO DE ÁGUA', 'SERVIÇO DE ENERGIA', 'OUTROS'
];

// --- COMPONENTE DE GRÁFICO SVG NATIVO (Visualização em Tela) ---
function CustomLineChart({ data }: { data: any[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const height = 300;
  const padding = 40;

  useEffect(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.offsetWidth);
    }
    const handleResize = () => {
        if(containerRef.current) setWidth(containerRef.current.offsetWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (data.length === 0) return null;

  // Cálculos de Escala
  const maxValue = Math.max(...data.map(d => Math.max(d.WhatsApp, d.Chamados, d.Media))) || 10; // Evita divisão por zero
  const effectiveHeight = height - padding * 2;
  const effectiveWidth = width - padding * 2;
  const xStep = effectiveWidth / (data.length - 1 || 1);
  const yScale = effectiveHeight / maxValue;

  // Geradores de Coordenadas
  const getX = (index: number) => padding + index * xStep;
  const getY = (value: number) => height - padding - (value * yScale);

  // Geradores de Caminho (Path d)
  const createPath = (key: string) => {
    return data.map((d, i) => 
      `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d[key])}`
    ).join(' ');
  };

  const pathWhatsApp = createPath('WhatsApp');
  const pathChamados = createPath('Chamados');
  const pathMedia = createPath('Media');

  return (
    <div ref={containerRef} className="w-full h-[300px] relative select-none">
      <svg width={width} height={height} className="overflow-visible">
        {/* Grid Lines Horizontal */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = height - padding - (t * effectiveHeight);
            const val = Math.round(t * maxValue);
            return (
                <g key={t}>
                    <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />
                    <text x={padding - 10} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{val}</text>
                </g>
            )
        })}

        {/* Eixo X - Labels */}
        {data.map((d, i) => (
            <text key={i} x={getX(i)} y={height - 10} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#94a3b8">
                {d.name}
            </text>
        ))}

        {/* Linhas do Gráfico */}
        <path d={pathMedia} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="5 5" />
        <path d={pathChamados} fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathWhatsApp} fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {/* Pontos Interativos e Hover */}
        {data.map((d, i) => (
            <g key={i}>
                <circle cx={getX(i)} cy={getY(d.WhatsApp)} r="4" fill="#22c55e" className="transition-all" />
                <circle cx={getX(i)} cy={getY(d.Chamados)} r="4" fill="#6366f1" className="transition-all" />
                <rect 
                    x={getX(i) - xStep / 2} 
                    y={0} 
                    width={xStep} 
                    height={height} 
                    fill="transparent" 
                    onMouseEnter={() => setHoverIndex(i)}
                    onMouseLeave={() => setHoverIndex(null)}
                    className="cursor-crosshair"
                />
            </g>
        ))}

        {/* Indicador de Hover (Linha Vertical) */}
        {hoverIndex !== null && (
            <line 
                x1={getX(hoverIndex)} 
                y1={padding} 
                x2={getX(hoverIndex)} 
                y2={height - padding} 
                stroke="#94a3b8" 
                strokeWidth="1" 
                strokeDasharray="4 4"
            />
        )}
      </svg>

      {/* Tooltip HTML Overlay */}
      {hoverIndex !== null && (
        <div 
            className="absolute bg-white p-3 rounded-xl shadow-xl border border-slate-100 z-10 pointer-events-none transition-all"
            style={{ 
                left: getX(hoverIndex), 
                top: 0,
                transform: 'translate(-50%, -100%) translateY(80px)' // Posiciona acima ou próximo
            }}
        >
            <p className="text-xs font-black text-slate-700 mb-2">{data[hoverIndex].name}</p>
            <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-slate-500">WhatsApp:</span>
                    <span className="font-bold text-slate-800">{data[hoverIndex].WhatsApp}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                    <span className="text-slate-500">Chamados:</span>
                    <span className="font-bold text-slate-800">{data[hoverIndex].Chamados}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    <span className="text-slate-500">Média:</span>
                    <span className="font-bold text-slate-800">{data[hoverIndex].Media}</span>
                </div>
            </div>
        </div>
      )}

      {/* Legenda Fixa */}
      <div className="absolute top-0 right-0 flex gap-4 bg-white/80 p-2 rounded-lg backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-[10px] font-bold text-slate-600">WhatsApp</span>
          </div>
          <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
              <span className="text-[10px] font-bold text-slate-600">Chamados</span>
          </div>
          <div className="flex items-center gap-1.5">
              <div className="w-3 h-1 bg-amber-500 rounded-full"></div>
              <span className="text-[10px] font-bold text-slate-600">Média</span>
          </div>
      </div>
    </div>
  );
}

export function Chamados() {
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [userId, setUserId] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  
  // Lista de escolas para o dropdown do Admin
  const [schoolsList, setSchoolsList] = useState<SchoolOption[]>([]);

  // Filtros de Admin
  const [adminDeptFilter, setAdminDeptFilter] = useState<'SEOM' | 'SEFISC'>('SEOM');

  // Modal Criar (Gestor)
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTicket, setNewTicket] = useState({
    title: '',
    category: 'MANUTENÇÕES',
    department: 'SEOM' as 'SEOM' | 'SEFISC',
    description: '',
    drive_link: ''
  });

  // Modal Registrar WhatsApp (Admin)
  const [isWhatsappOpen, setIsWhatsappOpen] = useState(false);
  const [whatsappTicket, setWhatsappTicket] = useState({
    date: new Date().toISOString().slice(0, 16), // Data atual formato datetime-local
    school_id: '',
    phone: '',
    title: '',
    category: 'MANUTENÇÕES',
    department: 'SEOM' as 'SEOM' | 'SEFISC',
    description: ''
  });

  // Modal Relatório (Admin)
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportDate, setReportDate] = useState({
    month: new Date().getMonth() + 1, // 1-12
    year: new Date().getFullYear()
  });

  // Modal Detalhes
  const [selectedTicket, setSelectedTicket] = useState<TicketData | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    if (!supabase) {
        setConfigError(true);
        setLoading(false);
        return;
    }
    fetchUserAndTickets();
  }, [adminDeptFilter]); 

  async function fetchUserAndTickets() {
    if (!supabase) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Buscar perfil
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('role, school_id')
        .eq('id', user.id)
        .single();
      
      setUserRole(profile?.role || '');
      setUserSchoolId(profile?.school_id || null);

      // Se for Admin, buscar lista de escolas para o dropdown
      if (profile?.role === 'regional_admin') {
        const { data: schools } = await (supabase as any)
            .from('schools')
            .select('id, name')
            .order('name');
        setSchoolsList(schools || []);
      }

      // Buscar Chamados
      let query = (supabase as any)
        .from('internal_tickets')
        .select('*, schools(name)')
        .order('created_at', { ascending: false });

      if (profile?.role === 'school_manager') {
        query = query.eq('school_id', profile.school_id);
      } 
      // Admin vê todos para o dashboard, mas a lista pode ser filtrada visualmente

      const { data, error } = await query;
      if (error) throw error;
      setTickets(data || []);

    } catch (error) {
      console.error("Erro ao buscar chamados:", error);
    } finally {
      setLoading(false);
    }
  }

  // Gerar Protocolo: GSE-ANO-SEQUENCIA
  async function generateProtocol() {
    if (!supabase) return 'ERR-CONFIG';
    const year = new Date().getFullYear();
    const { count } = await (supabase as any).from('internal_tickets').select('*', { count: 'exact', head: true });
    const sequence = String((count || 0) + 1).padStart(7, '0');
    return `GSE-${year}-${sequence}`;
  }

  // --- Métricas do Dashboard ---
  const metrics = useMemo(() => {
    const total = tickets.length;
    const seomCount = tickets.filter(t => t.department === 'SEOM').length;
    const sefiscCount = tickets.filter(t => t.department === 'SEFISC').length;
    const concludedCount = tickets.filter(t => t.status === 'CONCLUIDO').length;
    const openCount = tickets.filter(t => t.status !== 'CONCLUIDO').length;
    
    // Contagem de WhatsApp (Verifica a tag na descrição)
    const whatsappCount = tickets.filter(t => t.description && t.description.includes('[ATENDIMENTO WHATSAPP]')).length;

    // Agrupar por categoria para o Top 5
    const categoryMap: Record<string, number> = {};
    tickets.forEach(t => {
      categoryMap[t.category] = (categoryMap[t.category] || 0) + 1;
    });

    const topCategories = Object.entries(categoryMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return {
      total,
      seomCount,
      sefiscCount,
      concludedCount,
      openCount,
      whatsappCount,
      topCategories
    };
  }, [tickets]);

  // --- Dados do Gráfico (Últimos 12 Meses) ---
  const chartData = useMemo(() => {
    const today = new Date();
    const last12Months: { key: string; name: string; whatsapp: number; chamados: number; WhatsApp: number; Chamados: number; Media: number }[] = [];
    
    // 1. Gerar chaves para os últimos 12 meses
    for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = d.toISOString().slice(0, 7); // YYYY-MM
        const monthName = d.toLocaleString('pt-BR', { month: 'short' }).toUpperCase().replace('.', '');
        last12Months.push({
            key,
            name: monthName,
            whatsapp: 0,
            chamados: 0,
            WhatsApp: 0,
            Chamados: 0,
            Media: 0
        });
    }

    // 2. Preencher contagens
    tickets.forEach(ticket => {
        const ticketMonth = ticket.created_at.slice(0, 7); // YYYY-MM
        const monthData = last12Months.find(m => m.key === ticketMonth);
        
        if (monthData) {
            const isWhatsapp = ticket.description && ticket.description.includes('[ATENDIMENTO WHATSAPP]');
            if (isWhatsapp) {
                monthData.whatsapp++;
            } else {
                monthData.chamados++;
            }
        }
    });

    // 3. Formatar para o gráfico
    return last12Months.map(m => ({
        ...m,
        WhatsApp: m.whatsapp,
        Chamados: m.chamados,
        Media: Number(((m.whatsapp + m.chamados) / 2).toFixed(1))
    }));
  }, [tickets]);

  // Lista Filtrada para Admin (Mesa SEOM vs SEFISC)
  const filteredListTickets = useMemo(() => {
    if (userRole === 'regional_admin') {
      return tickets.filter(t => t.department === adminDeptFilter);
    }
    return tickets;
  }, [tickets, userRole, adminDeptFilter]);

  // Funções de PDF
  async function handleGenerateReport() {
    if (!supabase) return;
    setIsGeneratingReport(true);

    try {
      // 1. Definir intervalo de datas para a tabela
      const startDate = new Date(reportDate.year, reportDate.month - 1, 1).toISOString();
      const endDate = new Date(reportDate.year, reportDate.month, 0, 23, 59, 59).toISOString();

      // 2. Buscar dados do período
      const { data: reportTickets, error } = await (supabase as any)
        .from('internal_tickets')
        .select('*, schools(name)')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!reportTickets || reportTickets.length === 0) {
        alert('Nenhum chamado encontrado para este período.');
        setIsGeneratingReport(false);
        return;
      }

      // 3. Instanciar jsPDF com suporte a autoTable
      const doc = new jsPDF();
      
      const monthName = new Date(reportDate.year, reportDate.month - 1, 1).toLocaleString('pt-BR', { month: 'long' });
      
      // Cabeçalho
      doc.setFontSize(18);
      doc.text('Relatório Mensal de Ocorrências', 14, 22);
      doc.setFontSize(11);
      doc.text(`Período: ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${reportDate.year}`, 14, 30);
      doc.text(`Gerado em: ${new Date().toLocaleDateString()}`, 14, 36);

      // Resumo Estatístico
      const total = reportTickets.length;
      const seom = reportTickets.filter((t: TicketData) => t.department === 'SEOM').length;
      const sefisc = reportTickets.filter((t: TicketData) => t.department === 'SEFISC').length;
      const whatsapp = reportTickets.filter((t: TicketData) => t.description && t.description.includes('[ATENDIMENTO WHATSAPP]')).length;
      const concluded = reportTickets.filter((t: TicketData) => t.status === 'CONCLUIDO').length;

      doc.setFillColor(245, 247, 250);
      doc.roundedRect(14, 42, 180, 25, 3, 3, 'F');
      
      doc.setFontSize(10);
      doc.text(`Total: ${total}`, 20, 52);
      doc.text(`SEOM: ${seom}`, 60, 52);
      doc.text(`SEFISC: ${sefisc}`, 100, 52);
      
      doc.text(`WhatsApp: ${whatsapp}`, 20, 60);
      doc.text(`Concluídos: ${concluded}`, 60, 60);
      doc.text(`Em Aberto: ${total - concluded}`, 100, 60);

      // --- Desenhar Gráfico no PDF (Contexto de 12 Meses) ---
      // Usamos 'chartData' que já contém os dados dos últimos 12 meses
      let nextY = 75;
      if (chartData && chartData.length > 0) {
          nextY = drawPdfChart(doc, chartData, 75);
      }

      // Tabela Detalhada
      const tableRows = reportTickets.map((t: TicketData) => [
        t.protocol,
        new Date(t.created_at).toLocaleDateString(),
        t.schools?.name || 'N/A',
        t.category,
        t.department,
        t.status.replace('_', ' ')
      ]);

      autoTable(doc, {
        startY: nextY + 10,
        head: [['Protocolo', 'Data', 'Escola', 'Categoria', 'Depto', 'Status']],
        body: tableRows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [79, 70, 229] } // Indigo 600
      });

      doc.save(`Relatorio_Chamados_${reportDate.month}_${reportDate.year}.pdf`);
      setIsReportOpen(false);

    } catch (error: any) {
      console.error(error);
      alert('Erro ao gerar relatório: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
  }

  // --- Função auxiliar para desenhar o gráfico no PDF ---
  const drawPdfChart = (doc: any, data: any[], startY: number) => {
    const chartHeight = 50;
    const chartWidth = 180;
    const startX = 14;
    const endY = startY + chartHeight;

    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text("Histórico de Atendimentos (Últimos 12 Meses)", startX, startY - 5);

    const maxVal = Math.max(...data.map(d => Math.max(d.WhatsApp, d.Chamados, d.Media))) || 10;
    const stepX = chartWidth / (data.length - 1);
    const scaleY = chartHeight / maxVal;

    const getPX = (i: number) => startX + (i * stepX);
    const getPY = (val: number) => endY - (val * scaleY);

    doc.setDrawColor(220);
    doc.setLineWidth(0.1);

    // Eixo X Labels
    doc.setFontSize(6);
    doc.setTextColor(150);
    data.forEach((d, i) => {
        doc.text(d.name, getPX(i), endY + 4, { align: 'center' });
    });

    // Função para desenhar linha
    const drawLine = (key: string, r: number, g: number, b: number) => {
        doc.setDrawColor(r, g, b);
        doc.setLineWidth(0.5);
        for (let i = 0; i < data.length - 1; i++) {
            doc.line(getPX(i), getPY(data[i][key]), getPX(i+1), getPY(data[i+1][key]));
        }
    };

    // Linhas
    drawLine('Media', 245, 158, 11); // Laranja
    drawLine('Chamados', 99, 102, 241); // Roxo
    drawLine('WhatsApp', 34, 197, 94); // Verde

    // Legenda simples
    doc.setFontSize(7);
    const legY = endY + 10;
    doc.setTextColor(34, 197, 94); doc.text('WhatsApp', startX, legY);
    doc.setTextColor(99, 102, 241); doc.text('Chamados', startX + 20, legY);
    doc.setTextColor(245, 158, 11); doc.text('Média', startX + 40, legY);
    doc.setTextColor(0); // Reset

    return legY + 5; // Retorna nova posição Y
  };

  // Criar Chamado (Gestor Escolar)
  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return alert('Sistema não configurado.');
    if (!userSchoolId && userRole !== 'regional_admin') return alert('Erro: Escola não identificada.');

    try {
      const protocol = await generateProtocol();
      const payload = {
        protocol,
        school_id: userSchoolId, 
        created_by: userId,
        title: newTicket.title,
        category: newTicket.category,
        department: newTicket.department,
        description: newTicket.description,
        drive_link: newTicket.drive_link,
        status: 'ABERTO'
      };

      const { error } = await (supabase as any).from('internal_tickets').insert([payload]);
      if (error) throw error;

      alert(`Chamado ${protocol} criado com sucesso!`);
      setIsCreateOpen(false);
      setNewTicket({ title: '', category: 'MANUTENÇÕES', department: 'SEOM', description: '', drive_link: '' });
      fetchUserAndTickets();
    } catch (error: any) {
      alert('Erro ao criar chamado: ' + error.message);
    }
  }

  // Criar Chamado Manualmente (Admin / WhatsApp)
  async function handleRegisterWhatsApp(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return alert('Sistema não configurado.');
    if (!whatsappTicket.school_id) return alert('Selecione uma escola.');

    try {
      const protocol = await generateProtocol();
      
      // Formatando a descrição para incluir os dados do WhatsApp
      const enhancedDescription = `[ATENDIMENTO WHATSAPP]\nNúmero/Contato: ${whatsappTicket.phone}\nData Original: ${new Date(whatsappTicket.date).toLocaleString()}\n\nDescrição:\n${whatsappTicket.description}`;

      const payload = {
        protocol,
        school_id: whatsappTicket.school_id,
        created_by: userId,
        title: whatsappTicket.title,
        category: whatsappTicket.category,
        department: whatsappTicket.department,
        description: enhancedDescription,
        status: 'CONCLUIDO', // Definindo como CONCLUIDO automaticamente
        created_at: new Date(whatsappTicket.date).toISOString() // Força a data selecionada
      };

      const { error } = await (supabase as any).from('internal_tickets').insert([payload]);
      if (error) throw error;

      alert(`Atendimento WhatsApp registrado: ${protocol}`);
      setIsWhatsappOpen(false);
      // Resetar form
      setWhatsappTicket({
        date: new Date().toISOString().slice(0, 16),
        school_id: '',
        phone: '',
        title: '',
        category: 'MANUTENÇÕES',
        department: 'SEOM',
        description: ''
      });
      fetchUserAndTickets();
    } catch (error: any) {
      alert('Erro ao registrar: ' + error.message);
    }
  }

  async function openTicketDetails(ticket: TicketData) {
    if (!supabase) return;
    setSelectedTicket(ticket);
    const { data } = await (supabase as any)
      .from('ticket_messages')
      .select('*, profiles(full_name, role)') 
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  }

  async function handleSendMessage(type: 'RESPONSE' | 'CONCLUSION' = 'RESPONSE') {
    if (!newMessage.trim()) return;
    if (!selectedTicket || !supabase) return;

    try {
      const msgPayload = {
        ticket_id: selectedTicket.id,
        user_id: userId,
        message: newMessage,
        type: type === 'CONCLUSION' ? 'STATUS_CHANGE' : 'RESPONSE'
      };
      await (supabase as any).from('ticket_messages').insert([msgPayload]);

      let newStatus = selectedTicket.status;
      
      if (type === 'CONCLUSION') {
        newStatus = 'CONCLUIDO';
      } else {
        if (userRole === 'regional_admin') {
           newStatus = 'AGUARDANDO_ESCOLA'; 
        } else {
           newStatus = 'EM_ANDAMENTO';
        }
      }

      await (supabase as any)
        .from('internal_tickets')
        .update({ status: newStatus })
        .eq('id', selectedTicket.id);

      setNewMessage('');
      setSelectedTicket({ ...selectedTicket, status: newStatus });
      
      const { data } = await (supabase as any)
        .from('ticket_messages')
        .select('*, profiles(full_name, role)')
        .eq('ticket_id', selectedTicket.id)
        .order('created_at', { ascending: true });
      setMessages(data || []);
      
      fetchUserAndTickets();

    } catch (error) {
      console.error(error);
    }
  }

  async function handleForwardTicket() {
    if (!selectedTicket || !supabase) return;
    const newDept = selectedTicket.department === 'SEOM' ? 'SEFISC' : 'SEOM';
    const confirm = window.confirm(`Deseja encaminhar este chamado para ${newDept}?`);
    
    if (confirm) {
        try {
            await (supabase as any)
                .from('internal_tickets')
                .update({ department: newDept })
                .eq('id', selectedTicket.id);
            
            const forwardMessage = `Chamado encaminhado para ${newDept}`;

            await (supabase as any).from('ticket_messages').insert([{
                ticket_id: selectedTicket.id,
                user_id: userId,
                message: forwardMessage,
                type: 'FORWARD'
            }]);

            alert(forwardMessage);
            setSelectedTicket(null);
            fetchUserAndTickets();
        } catch (error) {
            console.error(error);
        }
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ABERTO': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'EM_ANDAMENTO': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'AGUARDANDO_ESCOLA': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'CONCLUIDO': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  if (configError) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
            <div className="bg-red-50 p-6 rounded-full mb-4">
                <AlertTriangle size={48} className="text-red-500" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 mb-2">Configuração Ausente</h1>
            <p className="text-slate-500 max-w-md mb-8">
                Não foi possível conectar ao Supabase. Verifique se as variáveis de ambiente <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> estão configuradas corretamente no seu arquivo .env.
            </p>
        </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
             <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-100 text-white"><Ticket size={24} /></div>
             <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight text-indigo-600">Central de Chamados</h1>
                <p className="text-slate-500 text-sm font-medium">Gestão de ocorrências SEOM e SEFISC.</p>
             </div>
          </div>
        </div>
        
        {/* Botão para Gestor Escolar */}
        {userRole === 'school_manager' && (
            <button 
                onClick={() => setIsCreateOpen(true)}
                className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl hover:bg-slate-800 transition-all active:scale-95"
            >
                <Plus size={18} /> ABRIR CHAMADO
            </button>
        )}

        {/* Botões para Admin */}
        {userRole === 'regional_admin' && (
            <div className="flex gap-2">
                <button 
                    onClick={() => setIsReportOpen(true)}
                    className="bg-white border-2 border-slate-200 text-slate-600 px-4 py-3 rounded-2xl font-black flex items-center justify-center gap-2 shadow-sm hover:border-indigo-300 hover:text-indigo-600 transition-all active:scale-95"
                >
                    <FileText size={18} /> RELATÓRIO PDF
                </button>
                <button 
                    onClick={() => setIsWhatsappOpen(true)}
                    className="bg-green-600 text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl hover:bg-green-700 transition-all active:scale-95"
                >
                    <MessageCircle size={18} /> REGISTRAR WHATSAPP
                </button>
            </div>
        )}
      </div>

      {/* DASHBOARD DE MÉTRICAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Card 1: Volume por Departamento */}
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-lg flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between mb-4 z-10">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><PieChart size={20} /></div>
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Registrado</span>
              </div>
              <div className="z-10">
                  <h3 className="text-3xl font-black text-slate-800">{metrics.total}</h3>
                  <div className="flex gap-4 mt-2">
                      <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase block">SEOM</span>
                          <span className="text-sm font-bold text-indigo-600">{metrics.seomCount}</span>
                      </div>
                      <div className="w-px h-8 bg-slate-100"></div>
                      <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase block">SEFISC</span>
                          <span className="text-sm font-bold text-indigo-600">{metrics.sefiscCount}</span>
                      </div>
                  </div>
              </div>
              <Ticket className="absolute -bottom-4 -right-4 text-indigo-50 w-32 h-32" />
          </div>

          {/* Card 2: Status de Resolução */}
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-lg flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between mb-4 z-10">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><CheckCircle2 size={20} /></div>
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Resolutividade</span>
              </div>
              <div className="z-10">
                  <div className="flex items-end gap-2">
                      <h3 className="text-3xl font-black text-slate-800">{metrics.concludedCount}</h3>
                      <span className="text-xs font-bold text-emerald-500 mb-1.5 uppercase">Concluídos</span>
                  </div>
                  <div className="mt-3 bg-slate-50 p-2 rounded-xl border border-slate-100 inline-flex items-center gap-2">
                      <Clock size={12} className="text-amber-500" />
                      <span className="text-xs font-bold text-slate-600">{metrics.openCount} em atendimento</span>
                  </div>
              </div>
              <CheckCircle className="absolute -bottom-4 -right-4 text-emerald-50 w-32 h-32" />
          </div>

          {/* Card 3: WhatsApp (NOVO) */}
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-lg flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between mb-4 z-10">
                  <div className="p-3 bg-green-50 text-green-600 rounded-xl"><MessageCircle size={20} /></div>
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">WhatsApp</span>
              </div>
              <div className="z-10">
                  <h3 className="text-3xl font-black text-slate-800">{metrics.whatsappCount}</h3>
                  <span className="text-xs font-bold text-slate-400 uppercase">Atendimentos Rápidos</span>
              </div>
              <MessageCircle className="absolute -bottom-4 -right-4 text-green-50 w-32 h-32" />
          </div>

          {/* Card 4: Top 5 Categorias */}
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-lg relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><ListOrdered size={16} /></div>
                  <h4 className="text-xs font-black uppercase text-slate-500 tracking-widest">Top 5 Categorias</h4>
              </div>
              <div className="space-y-2">
                  {metrics.topCategories.length > 0 ? (
                      metrics.topCategories.map((cat, idx) => (
                          <div key={cat.name} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-bold text-slate-300 w-4">{idx + 1}.</span>
                                  <span className="text-[10px] font-bold text-slate-700 truncate max-w-[120px]">{cat.name}</span>
                              </div>
                              <div className="flex-1 mx-2 h-1.5 bg-slate-50 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-indigo-500 rounded-full" 
                                    style={{ width: `${(cat.count / metrics.total) * 100}%` }}
                                  ></div>
                              </div>
                              <span className="text-[9px] font-bold text-slate-400">{cat.count}</span>
                          </div>
                      ))
                  ) : (
                      <p className="text-[10px] text-slate-300 italic">Sem dados suficientes.</p>
                  )}
              </div>
          </div>
      </div>

      {/* Gráfico de Evolução (SVG NATIVO) */}
      <div className="col-span-full bg-white p-6 rounded-[2rem] border border-slate-100 shadow-lg">
          <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Activity size={18} /></div>
                  <h3 className="font-black text-slate-800 text-lg">Evolução de Atendimentos (12 Meses)</h3>
              </div>
          </div>
          <CustomLineChart data={chartData} />
      </div>

      {/* Admin Tabs */}
      {userRole === 'regional_admin' && (
          <div className="bg-white p-2 rounded-2xl inline-flex border-2 border-slate-100">
              <button 
                onClick={() => setAdminDeptFilter('SEOM')}
                className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${adminDeptFilter === 'SEOM' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                MESA SEOM
              </button>
              <button 
                onClick={() => setAdminDeptFilter('SEFISC')}
                className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${adminDeptFilter === 'SEFISC' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                MESA SEFISC
              </button>
          </div>
      )}

      {/* Lista de Chamados */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredListTickets.map(ticket => (
              <div key={ticket.id} onClick={() => openTicketDetails(ticket)} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl hover:border-indigo-200 transition-all cursor-pointer group relative overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                      <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-3 py-1 rounded-full">{ticket.protocol}</span>
                      <span className={`text-[9px] font-black px-3 py-1 rounded-full border ${getStatusColor(ticket.status)}`}>{ticket.status.replace('_', ' ')}</span>
                  </div>
                  
                  <div className="mb-4">
                      <h3 className="font-black text-slate-800 text-lg leading-tight mb-1 line-clamp-2">{ticket.title}</h3>
                      <p className="text-xs font-bold text-indigo-500 uppercase tracking-wide">{ticket.category}</p>
                  </div>

                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-50">
                      <div className="flex items-center gap-2 text-slate-400">
                          <Building2 size={14} />
                          <span className="text-[10px] font-bold uppercase truncate max-w-[150px]">{ticket.schools?.name || 'Minha Unidade'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                          <Clock size={14} />
                          <span className="text-[10px] font-bold">{new Date(ticket.created_at).toLocaleDateString()}</span>
                      </div>
                  </div>
                  <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRightLeft className="text-indigo-200" />
                  </div>
              </div>
          ))}
          {filteredListTickets.length === 0 && (
              <div className="col-span-full py-20 text-center text-slate-300 font-black text-xl uppercase">Nenhum chamado encontrado nesta mesa.</div>
          )}
      </div>

      {/* MODAL CRIAR CHAMADO (GESTOR) */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl animate-in zoom-in-95 overflow-hidden">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="text-xl font-black text-slate-800">Novo Chamado</h2>
                    <button onClick={() => setIsCreateOpen(false)}><X className="text-slate-400 hover:text-slate-600" /></button>
                </div>
                <form onSubmit={handleCreateTicket} className="p-8 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Título da Ocorrência</label>
                        <input required type="text" className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-500" 
                            value={newTicket.title} onChange={e => setNewTicket({...newTicket, title: e.target.value})} placeholder="Resumo do problema" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Departamento</label>
                            <select className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-500"
                                value={newTicket.department} onChange={e => setNewTicket({...newTicket, department: e.target.value as any})}>
                                <option value="SEOM">SEOM (Obras/Manutenção)</option>
                                <option value="SEFISC">SEFISC (Fiscalização/Limpeza)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Categoria</label>
                            <select className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-500"
                                value={newTicket.category} onChange={e => setNewTicket({...newTicket, category: e.target.value})}>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Descrição Detalhada</label>
                        <textarea required rows={4} className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-medium text-slate-700 outline-none focus:border-indigo-500" 
                            value={newTicket.description} onChange={e => setNewTicket({...newTicket, description: e.target.value})} placeholder="Descreva o problema com detalhes..." />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Link para Arquivos (Drive/Fotos)</label>
                        <div className="flex items-center gap-2 p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl">
                            <Paperclip size={20} className="text-slate-400" />
                            <input type="url" className="w-full bg-transparent font-medium text-slate-700 outline-none" 
                                value={newTicket.drive_link} onChange={e => setNewTicket({...newTicket, drive_link: e.target.value})} placeholder="Cole aqui o link compartilhado do Google Drive ou OneDrive" />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 ml-1">Para economizar espaço, armazene as fotos no seu Google Drive e cole o link aqui.</p>
                    </div>

                    <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 active:scale-95 transition-all">
                        REGISTRAR OCORRÊNCIA
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* MODAL RELATÓRIO PDF */}
      {isReportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl animate-in zoom-in-95 overflow-hidden">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-2">
                        <FileText size={24} className="text-indigo-600" />
                        <h2 className="text-xl font-black text-slate-800">Exportar Relatório</h2>
                    </div>
                    <button onClick={() => setIsReportOpen(false)}><X className="text-slate-400 hover:text-slate-600" /></button>
                </div>
                
                <div className="p-8 space-y-6">
                    <p className="text-sm text-slate-500 font-medium">Selecione o período para gerar o relatório consolidado em PDF para apresentação.</p>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Mês</label>
                            <select 
                                className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-500"
                                value={reportDate.month}
                                onChange={e => setReportDate({...reportDate, month: parseInt(e.target.value)})}
                            >
                                {Array.from({ length: 12 }, (_, i) => (
                                    <option key={i + 1} value={i + 1}>
                                        {new Date(0, i).toLocaleString('pt-BR', { month: 'long' }).toUpperCase()}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Ano</label>
                            <select 
                                className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:border-indigo-500"
                                value={reportDate.year}
                                onChange={e => setReportDate({...reportDate, year: parseInt(e.target.value)})}
                            >
                                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <button 
                        onClick={handleGenerateReport}
                        disabled={isGeneratingReport}
                        className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isGeneratingReport ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                            <Download size={20} />
                        )}
                        {isGeneratingReport ? 'GERANDO PDF...' : 'BAIXAR RELATÓRIO'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* MODAL REGISTRAR WHATSAPP (ADMIN) */}
      {isWhatsappOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl animate-in zoom-in-95 overflow-hidden border-4 border-green-500">
                <div className="p-8 border-b border-green-100 flex justify-between items-center bg-green-50">
                    <div className="flex items-center gap-2">
                        <MessageCircle size={24} className="text-green-600" />
                        <h2 className="text-xl font-black text-green-800">Registrar WhatsApp</h2>
                    </div>
                    <button onClick={() => setIsWhatsappOpen(false)}><X className="text-green-400 hover:text-green-600" /></button>
                </div>
                <form onSubmit={handleRegisterWhatsApp} className="p-8 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Data do Atendimento</label>
                            <input required type="datetime-local" className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:border-green-500" 
                                value={whatsappTicket.date} onChange={e => setWhatsappTicket({...whatsappTicket, date: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Número/Contato</label>
                            <input required type="text" className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:border-green-500" 
                                value={whatsappTicket.phone} onChange={e => setWhatsappTicket({...whatsappTicket, phone: e.target.value})} placeholder="(11) 99999-9999" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Escola Solicitante</label>
                        <select required className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:border-green-500"
                            value={whatsappTicket.school_id} onChange={e => setWhatsappTicket({...whatsappTicket, school_id: e.target.value})}>
                            <option value="">Selecione uma escola...</option>
                            {schoolsList.map(school => (
                                <option key={school.id} value={school.id}>{school.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Assunto</label>
                        <input required type="text" className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:border-green-500" 
                            value={whatsappTicket.title} onChange={e => setWhatsappTicket({...whatsappTicket, title: e.target.value})} placeholder="Resumo da solicitação" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Departamento</label>
                            <select className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:border-green-500"
                                value={whatsappTicket.department} onChange={e => setWhatsappTicket({...whatsappTicket, department: e.target.value as any})}>
                                <option value="SEOM">SEOM</option>
                                <option value="SEFISC">SEFISC</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Categoria</label>
                            <select className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:border-green-500"
                                value={whatsappTicket.category} onChange={e => setWhatsappTicket({...whatsappTicket, category: e.target.value})}>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Descrição da Conversa</label>
                        <textarea required rows={4} className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-medium text-slate-700 outline-none focus:border-green-500" 
                            value={whatsappTicket.description} onChange={e => setWhatsappTicket({...whatsappTicket, description: e.target.value})} placeholder="Cole ou descreva o que foi tratado..." />
                    </div>

                    <button type="submit" className="w-full py-4 bg-green-600 text-white rounded-2xl font-black shadow-xl hover:bg-green-700 active:scale-95 transition-all flex items-center justify-center gap-2">
                        <MessageCircle size={20} /> SALVAR ATENDIMENTO
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* MODAL DETALHES E CHAT */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div className="bg-white rounded-[3rem] w-full max-w-4xl h-[85vh] shadow-2xl animate-in zoom-in-95 flex overflow-hidden">
                {/* Lado Esquerdo: Detalhes */}
                <div className="w-1/3 bg-slate-50 p-8 border-r border-slate-200 overflow-y-auto hidden md:block custom-scrollbar">
                    <div className="mb-6">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Protocolo</span>
                        <h2 className="text-2xl font-black text-slate-800">{selectedTicket.protocol}</h2>
                    </div>
                    <div className="space-y-6">
                        <div>
                            <label className="text-[9px] font-black text-indigo-500 uppercase">Status Atual</label>
                            <div className={`mt-1 inline-block px-3 py-1 rounded-lg text-xs font-bold border ${getStatusColor(selectedTicket.status)}`}>
                                {selectedTicket.status.replace('_', ' ')}
                            </div>
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-indigo-500 uppercase">Departamento</label>
                            <p className="font-bold text-slate-700">{selectedTicket.department}</p>
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-indigo-500 uppercase">Categoria</label>
                            <p className="font-bold text-slate-700">{selectedTicket.category}</p>
                        </div>
                        <div>
                            <label className="text-[9px] font-black text-indigo-500 uppercase">Descrição</label>
                            <p className="text-sm text-slate-600 mt-1 leading-relaxed bg-white p-3 rounded-xl border border-slate-200 whitespace-pre-wrap">{selectedTicket.description}</p>
                        </div>
                        {selectedTicket.drive_link && (
                            <div>
                                <label className="text-[9px] font-black text-indigo-500 uppercase">Anexos</label>
                                <a href={selectedTicket.drive_link} target="_blank" rel="noreferrer" className="flex items-center gap-2 mt-1 text-xs font-bold text-indigo-600 hover:underline bg-indigo-50 p-3 rounded-xl">
                                    <Paperclip size={14} /> Abrir Arquivos no Drive
                                </a>
                            </div>
                        )}

                        {/* Ações de Admin */}
                        {userRole === 'regional_admin' && (
                            <div className="pt-6 border-t border-slate-200 space-y-3">
                                <p className="text-[10px] font-black text-slate-400 uppercase">Ações Administrativas</p>
                                <button onClick={handleForwardTicket} className="w-full py-3 bg-white border-2 border-slate-200 hover:border-indigo-200 text-slate-600 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all">
                                    <ArrowRightLeft size={14} /> Encaminhar p/ {selectedTicket.department === 'SEOM' ? 'SEFISC' : 'SEOM'}
                                </button>
                                {selectedTicket.status !== 'CONCLUIDO' && (
                                    <button onClick={() => handleSendMessage('CONCLUSION')} className="w-full py-3 bg-emerald-50 border-2 border-emerald-100 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all">
                                        <CheckCircle size={14} /> Concluir Chamado
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Lado Direito: Chat */}
                <div className="flex-1 flex flex-col bg-white">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <div>
                            <h3 className="font-black text-slate-800 text-lg">{selectedTicket.title}</h3>
                            <p className="text-xs text-slate-400 font-bold">{selectedTicket.schools?.name}</p>
                        </div>
                        <button onClick={() => setSelectedTicket(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} className="text-slate-400" /></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50 custom-scrollbar">
                        {messages.length === 0 && <p className="text-center text-slate-300 text-sm py-10">Nenhuma movimentação registrada.</p>}
                        {messages.map(msg => {
                            const isMe = msg.user_id === userId;
                            const isSystem = msg.type !== 'RESPONSE';
                            const senderName = isMe ? 'Eu' : (msg.profiles?.full_name || 'Usuário');
                            
                            return (
                                <div key={msg.id} className={`flex flex-col ${isSystem ? 'items-center' : (isMe ? 'items-end' : 'items-start')}`}>
                                    {isSystem ? (
                                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-wider my-2">{msg.message}</span>
                                    ) : (
                                        <>
                                            <span className="text-[9px] text-slate-400 font-bold mb-1 px-1">{senderName}</span>
                                            <div className={`max-w-[80%] p-4 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'}`}>
                                                <p>{msg.message}</p>
                                                <span className={`text-[9px] block mt-2 opacity-60 ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>{new Date(msg.created_at).toLocaleString()}</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {selectedTicket.status !== 'CONCLUIDO' && (
                        <div className="p-4 border-t border-slate-100 bg-white">
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-indigo-500 font-medium text-slate-700 transition-all"
                                    placeholder="Digite uma resposta ou solicitação..."
                                    value={newMessage}
                                    onChange={e => setNewMessage(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                />
                                <button onClick={() => handleSendMessage()} className="p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all active:scale-95">
                                    <Send size={20} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}