import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { 
  LayoutDashboard, Waves, ShieldCheck, ArrowRightLeft, 
  Building2, UserCog, LogOut, Menu,  
  BookOpen, ClipboardCheck, Calendar, Car, Building,
  AlertTriangle, Scan, ShoppingBag, Trophy, Package,
  Star, ArrowUpCircle, HardHat, TreeDeciduous, Ticket,
  School, Map, ShieldAlert, ChevronLeft, Flame, ChevronDown,
  Bell, MessageSquare, CheckCircle
} from 'lucide-react';

import { Dashboard } from './pages/Dashboard';
import { ConsumoAgua } from './pages/ConsumoAgua';
import { Zeladoria } from './pages/Zeladoria';
import { Remanejamento } from './pages/Remanejamento';
import { Escola } from './pages/escola';
import { Usuario } from './pages/Usuario';
import { Login } from './pages/Login';
import { Fiscalizacao } from './pages/fiscalizacao';
import { Tutoriais } from './pages/Tutoriais';
import { Reunioes } from './pages/Reunioes';
import { AgendamentoCarros } from './pages/AgendamentoCarros';
import { AgendamentoAmbientes } from './pages/AgendamentoAmbientes';
import { Demanda } from './pages/Demanda';
import { RaioXEscola } from './pages/RaioXEscola';
import { Aquisicao } from './pages/Aquisicao';
import { RankingEscolas } from './pages/RankingEscolas';
import { PatrimonioProcessos } from './pages/PatrimonioProcessos';
import { EscolasPrioritarias } from './pages/EscolasPrioritarias';
import { Elevador } from './pages/Elevador';
import { Obras } from './pages/Obras';
import ManejoArboreo from './pages/ManejoArboreo'; 
import { Chamados } from './pages/Chamados'; 
import ListaEscolas from './pages/escolasbombril';
import EducacaoPatrimonial from './pages/EducacaoPatrimonial';
import CadastroFurtos from './pages/Furtos'; 
import Plantas from './pages/Plantas'; 
import Servicos from './pages/Servicos';
import FiscalizacaoURE from './pages/FiscalizacaoURE';
import ListagemPatrimonio from './pages/ListagemPatrimonio';
import Avcb from './pages/avcb';
import RelatorioAtividades from './pages/atividades';
import VincularSetores from './pages/VincularSetores';
import Chat from './pages/chat';
import { AgendamentoNovo } from './pages/AgendamentoNovo';
import Portaria from './pages/Portaria';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  roles: string[];
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

interface AppNotification {
  id: string;
  conversa_id: string;
  protocolo: string;
  type: 'conclusion' | 'chat' | 'chamado' | 'chamado_update'; 
  count?: number;
  text: string;
  allMsgIds: string[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    title: 'Principal',
    items: [
      { id: 'ambientes-novo', label: 'Reservas Ambiente NOVO', icon: <Building size={20} className="text-emerald-500" />, roles: ['regional_admin','supervisor', 'dirigente', 'ure_servico', 'ure_eec'] }, // <- NOVO AQUI
      { id: 'entrada', label: 'Entrada no Prêdio', icon: <Building size={20} className="text-emerald-500" />, roles: ['regional_admin', 'dirigente', 'ure_servico'] }, // <- SEINTEC
      { id: 'dashboard', label: 'Painel Geral', icon: <LayoutDashboard size={20} />, roles: ['regional_admin', 'school_manager','supervisor', 'dirigente', 'ure_servico', 'ure_eec'] },
      { id: 'atividades', label: 'Atividades - SEOM/SEFISC', icon: <LayoutDashboard size={20} />, roles: ['regional_admin', 'dirigente'] }
    ]
  },
  {
    title: 'Atendimento',
    items: [
      { id: 'chat', label: 'Chat', icon: <Ticket size={20} className="text-pink-500" />, roles: ['regional_admin', 'school_manager', 'dirigente'] },
      { id: 'chamados', label: 'Central de Chamados', icon: <Ticket size={20} className="text-pink-500" />, roles: ['regional_admin', 'school_manager','supervisor', 'dirigente'] },
      { id: 'demandas', label: 'Demandas / E-mails', icon: <AlertTriangle size={20} className="text-red-500" />, roles: ['regional_admin', 'school_manager', 'dirigente'] },
    ]
  },
  {
    title: 'Fiscalização',
    items: [
      { id: 'consumo', label: 'Consumo de Água', icon: <Waves size={20} />, roles: ['regional_admin', 'school_manager','supervisor', 'dirigente'] },
      { id: 'fiscalizacao', label: 'Contratos Gov', icon: <ClipboardCheck size={20} />, roles: ['regional_admin', 'school_manager'] },
      { id: 'fiscalizacaoURE', label: 'Limpeza URE', icon: <Map size={20} />, roles: ['regional_admin'] },
    ]
  },
  {
    title: 'Vistoria',
    items: [
      { id: 'raiox', label: 'Raio-X / Vistoria', icon: <Scan size={20} className="text-indigo-500" />, roles: ['regional_admin','supervisor', 'dirigente'] },
    ]
  },
  {
    title: 'Infraestrutura',
    items: [
      { id: 'obras', label: 'Obras e Reformas', icon: <HardHat size={20} className="text-orange-500" />, roles: ['regional_admin','supervisor', 'dirigente'] },
      { id: 'servicos', label: 'Intervenção URE', icon: <Map size={20} />, roles: ['regional_admin','supervisor', 'dirigente'] },
      { id: 'manejo', label: 'Manejo Arbóreo', icon: <TreeDeciduous size={20} className="text-emerald-500" />, roles: ['regional_admin', 'school_manager','supervisor', 'dirigente'] },
      { id: 'elevadores', label: 'Gestão de Elevadores', icon: <ArrowUpCircle size={20} className="text-blue-500" />, roles: ['regional_admin','supervisor', 'dirigente'] },
      { id: 'plantas', label: 'Plantas Prediais', icon: <Map size={20} />, roles: ['regional_admin', 'school_manager','supervisor', 'dirigente'] },
      { id: 'avcb', label: 'AVCB', icon: <Flame size={20} className="text-red-500"/>, roles: ['regional_admin','supervisor', 'dirigente'] },
    ]
  },
  {
    title: 'Patrimônio',
    items: [
      { id: 'educacao-patrimonial', label: 'Educação Patrimonial', icon: <ShieldAlert size={20} className="text-orange-500" />, roles: ['regional_admin', 'school_manager','supervisor', 'dirigente'] },
      { id: 'patrimonio', label: 'Processos Patrimônio', icon: <Package size={20} className="text-blue-500" />, roles: ['regional_admin', 'school_manager','supervisor', 'dirigente'] },
      { id: 'aquisicao', label: 'Aquisição de Itens', icon: <ShoppingBag size={20} className="text-emerald-500" />, roles: ['regional_admin', 'school_manager','supervisor', 'dirigente'] },
      { id: 'remanejamento', label: 'Remanejamento', icon: <ArrowRightLeft size={20} />, roles: ['regional_admin', 'school_manager','supervisor', 'dirigente'] },
      { id: 'furtos', label: 'Cadastro de Furtos', icon: <ShieldAlert size={20} className="text-red-500" />, roles: ['regional_admin','supervisor', 'dirigente'] },
      { id: 'listchapa', label: 'listar Patrimônio', icon: <Package size={20} className="text-red-500" />, roles: ['regional_admin','school_manager','supervisor', 'dirigente'] },
    ]
  },
  {
    title: 'Gestão da URE',
    items: [
      { id: 'ambientes', label: 'Reservas Antigo', icon: <Building size={20} />, roles: ['regional_admin','supervisor', 'dirigente'] },
      { id: 'ambientes-novo', label: 'Reservas Ambiente NOVO', icon: <Building size={20} className="text-emerald-500" />, roles: ['regional_admin','supervisor', 'dirigente', 'ure_servico', 'ure_ecc'] }, // <- NOVO AQUI
      { id: 'carros', label: 'Carros Oficiais', icon: <Car size={20} />, roles: ['regional_admin','supervisor', 'dirigente'] },
      { id: 'reunioes', label: 'Calendário', icon: <Calendar size={20} />, roles: ['regional_admin', 'school_manager','supervisor', 'dirigente'] },
    ]
  },
   {
    title: 'Zeladoria',
    items: [
      { id: 'zeladoria', label: 'Zeladoria', icon: <ShieldCheck size={20} />, roles: ['regional_admin', 'school_manager','supervisor', 'dirigente'] },
      ]
  },
   {
    title: 'Gamificação',
    items: [
      { id: 'prioritarias', label: 'Escolas Prioritárias', icon: <Star size={20} className="text-amber-500" />, roles: ['regional_admin', 'dirigente'] },
      { id: 'ranking', label: 'Ranking de Escolas', icon: <Trophy size={20} className="text-amber-500" />, roles: ['regional_admin', 'school_manager', 'supervisor', 'dirigente'] },
    ]
  },
  {
    title: 'Sistema',
    items: [
      { id: 'escolas', label: 'Escolas (Detalhes)', icon: <Building2 size={20} />, roles: ['regional_admin', 'school_manager', 'supervisor', 'dirigente'] },
      { id: 'lista-escolas', label: 'Lista de Escolas', icon: <School size={20} />, roles: ['regional_admin'] },
      { id: 'usuarios', label: 'Gestão de Usuários', icon: <UserCog size={20} />, roles: ['regional_admin'] },
      { id: 'tutoriais', label: 'Manuais e Tutoriais', icon: <BookOpen size={20} />, roles: ['regional_admin', 'school_manager','supervisor', 'dirigente'] },
      { id: 'chefes', label: 'Chefes', icon: <BookOpen size={20} />, roles: ['regional_admin'] },
    ]
  },
];

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['Principal']);
  
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserRole(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserRole(session.user.id);
      else {
        setUserRole('');
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const activeGroup = MENU_GROUPS.find(group => 
      group.items.some(item => item.id === currentPage)
    );
    if (activeGroup) {
      setExpandedGroups(prev => 
        prev.includes(activeGroup.title) ? prev : [...prev, activeGroup.title]
      );
    }
  }, [currentPage]);

  // ==========================================
  // EFEITO DE NOTIFICAÇÕES (CHAT + CHAMADOS)
  // ==========================================
  useEffect(() => {
    if (!session || !userRole) return; 
    
    let userId = session.user.id;

    async function fetchNotifications() {
      try {
        const groupedNotifs: AppNotification[] = [];

        // 1. BUSCA NOTIFICAÇÕES DE CHAT (MENSAGENS) - VERSÃO BLINDADA EM JS
        let queryConvs = supabase.from('conversas').select('id, protocolo, status');
        if (userRole !== 'regional_admin') {
           queryConvs = queryConvs.or(`participante1_id.eq.${userId},participante2_id.eq.${userId}`);
        }
        
        const { data: conversas, error: convError } = await queryConvs as any;
        if (convError) console.error("❌ Erro ao buscar conversas:", convError);
        
        const conversaIds = conversas?.map((c: any) => c.id) || [];

        if (conversaIds.length > 0) {
          
          const { data: msgs, error: msgError } = await (supabase as any)
            .from('messages')
            .select('id, content, is_read, sender_id, conversa_id')
            .in('conversa_id', conversaIds)
            .neq('sender_id', userId);

          if (msgError) console.error("❌ Erro ao buscar mensagens:", msgError);

          // FILTRO BLINDADO EM JAVASCRIPT
          const unreadMsgs = (msgs || []).filter((m: any) => 
             m.is_read === false || m.is_read === null || m.is_read === 'false'
          );

          if (unreadMsgs.length > 0) {
            conversas.forEach((conv: any) => {
              const unreadForConv = unreadMsgs.filter((m: any) => m.conversa_id === conv.id);
              if (unreadForConv.length > 0) {
                const conclusionMsg = unreadForConv.find((m: any) => m.content?.includes('⚠️ Este atendimento foi finalizado'));
                const numeroProtocolo = conv.protocolo || 'Geral';

                if (conclusionMsg) {
                  groupedNotifs.push({
                    id: conclusionMsg.id,
                    conversa_id: conv.id,
                    protocolo: numeroProtocolo,
                    type: 'conclusion',
                    text: `A conversa do protocolo ${numeroProtocolo} foi concluída pelo administrador.`,
                    allMsgIds: unreadForConv.map((m: any) => m.id)
                  });
                } else {
                  groupedNotifs.push({
                    id: unreadForConv[0].id,
                    conversa_id: conv.id,
                    protocolo: numeroProtocolo,
                    type: 'chat',
                    count: unreadForConv.length,
                    text: `Você tem ${unreadForConv.length} nova(s) mensagem(ns) no protocolo ${numeroProtocolo}.`,
                    allMsgIds: unreadForConv.map((m: any) => m.id)
                  });
                }
              }
            });
          }
        }

        // 2. BUSCA NOTIFICAÇÕES DE NOVOS CHAMADOS ABERTOS (APENAS ADMIN)
        if (userRole === 'regional_admin') {
          const { data: chamadosAbertos } = await (supabase as any)
            .from('internal_tickets')
            .select('id, protocol, department')
            .eq('status', 'ABERTO'); 
            
          if (chamadosAbertos && chamadosAbertos.length > 0) {
            chamadosAbertos.forEach((chamado: any) => {
              groupedNotifs.push({
                id: chamado.id,
                conversa_id: chamado.id, 
                protocolo: chamado.protocol,
                type: 'chamado', 
                text: `Novo chamado pendente para a mesa ${chamado.department}.`,
                allMsgIds: [chamado.id]
              });
            });
          }
        }

        // 3. BUSCA NOTIFICAÇÕES DE RESPOSTAS E CONCLUSÕES DE CHAMADOS
        let myTicketsQuery = supabase.from('internal_tickets').select('id, protocol');
        if (userRole !== 'regional_admin') {
            myTicketsQuery = myTicketsQuery.eq('created_by', userId);
        }
        const { data: myTickets } = await myTicketsQuery as any;

        if (myTickets && myTickets.length > 0) {
            const ticketIds = myTickets.map((t: any) => t.id);
            const { data: unreadTicketMsgs } = await (supabase as any)
                .from('ticket_messages')
                .select('*')
                .in('ticket_id', ticketIds)
                .neq('user_id', userId); 

            const unreadTktFiltered = (unreadTicketMsgs || []).filter((m: any) => 
               m.is_read === false || m.is_read === null || m.is_read === 'false'
            );

            if (unreadTktFiltered.length > 0) {
                myTickets.forEach((ticket: any) => {
                    const unreadForThisTicket = unreadTktFiltered.filter((m: any) => m.ticket_id === ticket.id);
                    if (unreadForThisTicket.length > 0) {
                        const isConclusion = unreadForThisTicket.some((m: any) => m.type === 'STATUS_CHANGE');
                        groupedNotifs.push({
                            id: unreadForThisTicket[0].id,
                            conversa_id: ticket.id,
                            protocolo: ticket.protocol,
                            type: 'chamado_update',
                            text: isConclusion
                                ? `O chamado ${ticket.protocol} foi atualizado/concluído.`
                                : `Você tem uma nova mensagem no chamado ${ticket.protocol}.`,
                            allMsgIds: unreadForThisTicket.map((m: any) => m.id)
                        });
                    }
                });
            }
        }

        setNotifications(groupedNotifs);

      } catch (err) {
        console.error("❌ ERRO FATAL no Sino:", err);
      }
    }

    fetchNotifications();

    const channel = supabase
      .channel('app-notifs-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, fetchNotifications)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, fetchNotifications) // NOVO: Escuta a criação de conversas!
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_tickets' }, fetchNotifications)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_messages' }, fetchNotifications)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session, userRole]);

  // ==========================================
  // MARCAR COMO LIDO (CORRIGIDO PARA OTIMIZAÇÃO NO BANCO)
  // ==========================================
  const markAsRead = async (notif: AppNotification) => {
    // 1. Remove instantaneamente a notificação da interface para não ficar travado
    setNotifications(prev => prev.filter(n => n.id !== notif.id));
    
    // 2. Se era a última notificação, fecha o menu inteiro
    if (notifications.length <= 1) {
       setShowDropdown(false);
    }

    try {
      if (notif.type === 'chamado') {
         setCurrentPage('chamados');
         setShowDropdown(false);
         return;
      }

      // Se for Chat, usa a instrução ".in" que é 100% precisa com a Array de IDs
      if (notif.type === 'chat' || notif.type === 'conclusion') {
          await (supabase as any)
            .from('messages')
            .update({ is_read: true })
            .in('id', notif.allMsgIds); // Usa o array de IDs exatos
            
          if (notif.type === 'chat') {
            setCurrentPage('chat');
            setShowDropdown(false);
          }
          return;
      }

      // Se for Chamado (Ticket Update), usa a instrução ".in" também!
      if (notif.type === 'chamado_update') {
          await (supabase as any)
            .from('ticket_messages')
            .update({ is_read: true })
            .in('id', notif.allMsgIds); // Usa o array de IDs exatos
            
          setCurrentPage('chamados');
          setShowDropdown(false);
          return;
      }
    } catch (err) {
      console.error("Erro fatal ao limpar a notificação", err);
    }
  };

  async function fetchUserRole(userId: string) {
    try {
      const { data } = await (supabase as any).from('profiles').select('role').eq('id', userId).single();
      if (data && data.role) {
        setUserRole(data.role);
      } else {
        setUserRole('escola'); 
      }
    } catch (error) {
      setUserRole('escola');
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev => prev.includes(title) ? prev.filter(g => g !== title) : [...prev, title]);
  };

  const renderContent = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard />;
      case 'raiox': return <RaioXEscola />;
      case 'ranking': return <RankingEscolas />;
      case 'reunioes': return <Reunioes />;
      case 'demandas': return <Demanda />;
      case 'aquisicao': return <Aquisicao />;
      case 'patrimonio': return <PatrimonioProcessos />;
      case 'prioritarias': return <EscolasPrioritarias />;
      case 'elevadores': return <Elevador />;
      case 'obras': return <Obras />;
      case 'manejo': return <ManejoArboreo />;
      case 'carros': return <AgendamentoCarros />;
      case 'ambientes': return <AgendamentoAmbientes />;
      case 'tutoriais': return <Tutoriais />;
      case 'fiscalizacao': return <Fiscalizacao />;
      case 'consumo': return <ConsumoAgua />;
      case 'zeladoria': return <Zeladoria />;
      case 'remanejamento': return <Remanejamento />;
      case 'escolas': return <Escola />;
      case 'lista-escolas': return <ListaEscolas />;
      case 'educacao-patrimonial': return <EducacaoPatrimonial />;
      case 'usuarios': return <Usuario />;
      case 'chamados': return <Chamados />;
      case 'plantas': return <Plantas />;
      case 'servicos': return <Servicos />;
      case 'fiscalizacaoURE': return <FiscalizacaoURE />;
      case 'furtos': return <CadastroFurtos />;
      case 'listchapa': return <ListagemPatrimonio />;
      case 'avcb': return <Avcb />;
      case 'atividades': return <RelatorioAtividades />;
      case 'chefes': return <VincularSetores />;
      case 'ambientes-novo': return <AgendamentoNovo />;
      case 'chat': return <Chat />;
      case 'entrada': return <Portaria />;
      default: return <Dashboard />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session) return <Login />;

  const unreadCount = notifications.length;

  return (
    <div className="min-h-screen bg-[#f8fafc] flex font-sans text-slate-900 print:bg-white print:block">
      
      <aside className={`fixed inset-y-0 left-0 z-50 bg-[#0B1120] text-white transform transition-all duration-300 ease-in-out flex flex-col shadow-2xl ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 print:hidden ${isCollapsed ? 'w-20' : 'w-72'}`}>
        <div className="h-20 flex items-center justify-between px-4 border-b border-slate-800/50 shrink-0">
          {!isCollapsed && (
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 text-white flex-shrink-0">
                <Building2 size={22} />
              </div>
              <div className="flex flex-col min-w-0">
                <h1 className="text-lg font-black tracking-tight leading-none truncate">SGE-GSU</h1>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 truncate">Intelligence II</p>
              </div>
            </div>
          )}
          <button onClick={() => setIsCollapsed(!isCollapsed)} className={`p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors hidden lg:block ${isCollapsed ? 'mx-auto mt-2' : ''}`}>
            {isCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>

        <nav className="flex-1 py-4 flex flex-col px-3 overflow-y-auto custom-scrollbar pb-20">
          {MENU_GROUPS.map((group, groupIndex) => {
            const visibleItems = group.items.filter(item => item.roles.includes(userRole));
            if (visibleItems.length === 0) return null;

            const isOpen = expandedGroups.includes(group.title);

            return (
              <div key={groupIndex} className="mb-1">
                {!isCollapsed ? (
                  <button onClick={() => toggleGroup(group.title)} className="w-full flex items-center justify-between px-3 py-2 mt-2 rounded-lg hover:bg-slate-800/30 transition-colors group">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-slate-300 transition-colors">{group.title}</p>
                    <ChevronDown size={14} className={`text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                ) : <div className="h-px bg-slate-800 my-4 mx-2"></div>}

                <div className={`flex flex-col gap-1 overflow-hidden transition-all duration-300 ease-in-out ${!isCollapsed && !isOpen ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100 mt-1'}`}>
                  {visibleItems.map((item) => (
                    <button key={item.id} onClick={() => { setCurrentPage(item.id); if (window.innerWidth < 1024) setIsSidebarOpen(false); }} title={isCollapsed ? item.label : undefined} className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg transition-all duration-200 group ${currentPage === item.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}>
                      <div className={`${currentPage === item.id ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'} transition-colors flex-shrink-0`}>{item.icon}</div>
                      {!isCollapsed && <span className="font-medium whitespace-nowrap text-sm text-left truncate">{item.label}</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/50 shrink-0 bg-[#0B1120]">
          <button onClick={handleLogout} className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} w-full text-slate-400 hover:text-red-400 hover:bg-slate-800/50 p-2.5 rounded-lg transition-colors font-medium`} title="Encerrar Sessão">
            <LogOut size={20} />
            {!isCollapsed && <span>Sair do Sistema</span>}
          </button>
        </div>
      </aside>

      {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />}

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden h-screen print:h-auto print:overflow-visible print:w-full print:block">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-8 shrink-0 relative z-40 print:hidden shadow-sm">
          
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-500 lg:hidden">
              <Menu size={24} />
            </button>
            <h2 className="hidden sm:block text-sm font-black text-slate-400 uppercase tracking-[0.2em]">
              {MENU_GROUPS.flatMap(g => g.items).find(i => i.id === currentPage)?.label || 'Painel'}
            </h2>
          </div>

          <div className="flex items-center gap-4 lg:gap-6">
            
            {/* NOTIFICAÇÕES (O SINO) */}
            <div className="relative">
              <button onClick={() => setShowDropdown(!showDropdown)} className={`relative p-2.5 rounded-xl transition-all ${unreadCount > 0 ? 'bg-blue-50 text-blue-600' : 'hover:bg-slate-100 text-slate-500'}`}>
                <Bell size={22} strokeWidth={2.5} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white ring-2 ring-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* DROPDOWN COM 4 TIPOS DE MENSAGENS */}
              {showDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)}></div>
                  <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 py-3 z-20 animate-in fade-in zoom-in-95 duration-200">
                    <div className="px-4 pb-2 border-b border-slate-50 mb-2">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Central de Avisos</p>
                    </div>
                    
                    {unreadCount > 0 ? (
                      <div className="max-h-80 overflow-y-auto custom-scrollbar">
                        {notifications.map(notif => (
                          <div key={notif.id} className="w-full text-left flex items-start gap-4 px-4 py-4 hover:bg-slate-50 border-b border-slate-50 transition-colors last:border-0">
                            
                            {/* ALERTA 1: NOVO CHAMADO (Aparece apenas para Admin) */}
                            {notif.type === 'chamado' ? (
                              <>
                                <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center shrink-0 mt-1">
                                  <Ticket size={20} />
                                </div>
                                <div className="flex-1 cursor-pointer group" onClick={() => markAsRead(notif)}>
                                  <p className="text-sm font-bold text-slate-800 group-hover:text-orange-600 transition-colors">Novo Chamado ({notif.protocolo})</p>
                                  <p className="text-xs text-slate-500 leading-snug mt-0.5">{notif.text}</p>
                                  <p className="mt-2 text-[10px] font-bold text-orange-500 uppercase tracking-widest group-hover:underline">Acessar Chamados &rarr;</p>
                                </div>
                              </>

                            // ALERTA 2: RESPOSTA/CONCLUSÃO DE CHAMADO PARA QUEM ABRIU
                            ) : notif.type === 'chamado_update' ? (
                              <>
                                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shrink-0 mt-1">
                                  <Ticket size={20} />
                                </div>
                                <div className="flex-1 cursor-pointer group" onClick={() => markAsRead(notif)}>
                                  <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">Atualização de Chamado</p>
                                  <p className="text-xs text-slate-500 leading-snug mt-0.5">{notif.text}</p>
                                  <p className="mt-2 text-[10px] font-bold text-indigo-500 uppercase tracking-widest group-hover:underline">Acessar Chamado &rarr;</p>
                                </div>
                              </>

                            // ALERTA 3: CONCLUSÃO DE CHAT
                            ) : notif.type === 'conclusion' ? (
                              <>
                                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 mt-1">
                                  <CheckCircle size={20} />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-bold text-slate-800">Atendimento Finalizado</p>
                                  <p className="text-xs text-slate-500 leading-snug mt-0.5">{notif.text}</p>
                                  <button onClick={() => markAsRead(notif)} className="mt-3 text-[10px] font-bold uppercase tracking-widest bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-1.5 rounded-lg transition-colors shadow-sm">
                                    Tomar Ciência
                                  </button>
                                </div>
                              </>

                            // ALERTA 4: MENSAGEM COMUM DE CHAT
                            ) : (
                              <>
                                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shrink-0 mt-1">
                                  <MessageSquare size={20} />
                                </div>
                                <div className="flex-1 cursor-pointer group" onClick={() => markAsRead(notif)}>
                                  <p className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">Novas Mensagens</p>
                                  <p className="text-xs text-slate-500 leading-snug mt-0.5">{notif.text}</p>
                                  <p className="mt-2 text-[10px] font-bold text-blue-500 uppercase tracking-widest group-hover:underline">Acessar Chat &rarr;</p>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center">
                        <Bell size={32} className="mx-auto text-slate-200 mb-3" />
                        <p className="text-sm text-slate-400 font-medium">Tudo em dia por aqui!</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* PERFIL DO USUÁRIO */}
            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
               <div className="text-right hidden sm:block">
                 <p className="text-xs font-black text-slate-900 uppercase truncate max-w-[150px]">
                   {session.user.email?.split('@')[0]}
                 </p>
                 <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-0.5">
                   {userRole === 'regional_admin' ? 'Administrador' : 
                    userRole === 'supervisor' ? 'Supervisor' :
                    userRole === 'dirigente' ? 'Dirigente' : 'Gestor Unidade'}
                 </p>
               </div>
               <div className="w-10 h-10 bg-slate-100 rounded-full border-2 border-white shadow-sm flex items-center justify-center font-black text-blue-600">
                 {session.user.email?.charAt(0).toUpperCase()}
               </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-[#f8fafc] print:p-0 print:bg-white print:overflow-visible print:w-full">
          <div className="max-w-7xl mx-auto print:max-w-none print:w-full">
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  );
}