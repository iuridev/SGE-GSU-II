import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { 
  LayoutDashboard, Waves, ShieldCheck, ArrowRightLeft, 
  Building2, UserCog, LogOut, Menu,  
  BookOpen, ClipboardCheck, Calendar, Car, Building,
  AlertTriangle, Scan, ShoppingBag, Trophy, Package,
  Star, ArrowUpCircle, HardHat, TreeDeciduous, Ticket,
  School, Map, ShieldAlert, ChevronLeft, ChevronDown
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
import AdicionarItemAoPatrimonio from './pages/patrimoniochapa';
import ListagemPatrimonio from './pages/ListagemPatrimonio';

// ========================================================================
// CONFIGURAÇÃO DO MENU AGRUPADO (Movido para fora do componente)
// ========================================================================
const MENU_GROUPS = [
  {
    title: 'Principal',
    items: [
      { id: 'dashboard', label: 'Painel Geral', icon: <LayoutDashboard size={20} />, roles: ['regional_admin', 'school_manager'] }
    ]
  },
  {
    title: 'Atendimento',
    items: [
      { id: 'chamados', label: 'Central de Chamados', icon: <Ticket size={20} className="text-pink-500" />, roles: ['regional_admin', 'school_manager'] },
      { id: 'demandas', label: 'Demandas / E-mails', icon: <AlertTriangle size={20} className="text-red-500" />, roles: ['regional_admin', 'school_manager'] },
    ]
  },
  {
    title: 'Fiscalização',
    items: [
      { id: 'consumo', label: 'Consumo de Água', icon: <Waves size={20} />, roles: ['regional_admin', 'school_manager'] },
      { id: 'fiscalizacao', label: 'Contratos Gov', icon: <ClipboardCheck size={20} />, roles: ['regional_admin', 'school_manager'] },
      { id: 'fiscalizacaoURE', label: 'Limpeza URE', icon: <Map size={20} />, roles: ['regional_admin'] },
    ]
  },
  {
    title: 'Vistoria',
    items: [
      { id: 'raiox', label: 'Raio-X / Vistoria', icon: <Scan size={20} className="text-indigo-500" />, roles: ['regional_admin'] },
    ]
  },
  
  {
    title: 'Infraestrutura',
    items: [
      { id: 'obras', label: 'Obras e Reformas', icon: <HardHat size={20} className="text-orange-500" />, roles: ['regional_admin'] },
      { id: 'servicos', label: 'Intervenção URE', icon: <Map size={20} />, roles: ['regional_admin'] },
      { id: 'manejo', label: 'Manejo Arbóreo', icon: <TreeDeciduous size={20} className="text-emerald-500" />, roles: ['regional_admin', 'school_manager'] },
      { id: 'elevadores', label: 'Gestão de Elevadores', icon: <ArrowUpCircle size={20} className="text-blue-500" />, roles: ['regional_admin'] },
      { id: 'plantas', label: 'Plantas Prediais', icon: <Map size={20} />, roles: ['regional_admin', 'school_manager'] },
    ]
  },
  {
    title: 'Patrimônio',
    items: [
      { id: 'educacao-patrimonial', label: 'Educação Patrimonial', icon: <ShieldAlert size={20} className="text-orange-500" />, roles: ['regional_admin', 'school_manager'] },
      { id: 'patrimonio', label: 'Processos Patrimônio', icon: <Package size={20} className="text-blue-500" />, roles: ['regional_admin', 'school_manager'] },
      { id: 'aquisicao', label: 'Aquisição de Itens', icon: <ShoppingBag size={20} className="text-emerald-500" />, roles: ['regional_admin', 'school_manager'] },
      { id: 'remanejamento', label: 'Remanejamento', icon: <ArrowRightLeft size={20} />, roles: ['regional_admin', 'school_manager'] },
      { id: 'furtos', label: 'Cadastro de Furtos', icon: <ShieldAlert size={20} className="text-red-500" />, roles: ['regional_admin'] },
      { id: 'Chapa', label: 'Chapa Patrimonial', icon: <ShieldAlert size={20} className="text-red-500" />, roles: ['regional_admin'] },
      { id: 'listchapa', label: 'listar Patrimônio', icon: <ShieldAlert size={20} className="text-red-500" />, roles: ['regional_admin'] },
    ]
  },
 
  {
    title: 'Gestão da URE',
    items: [
      { id: 'ambientes', label: 'Reservas Ambiente', icon: <Building size={20} />, roles: ['regional_admin'] },
      { id: 'carros', label: 'Carros Oficiais', icon: <Car size={20} />, roles: ['regional_admin'] },
      { id: 'reunioes', label: 'Calendário', icon: <Calendar size={20} />, roles: ['regional_admin', 'school_manager'] },
    ]
  },
  
  
   {
    title: 'Zeladoria',
    items: [
      { id: 'zeladoria', label: 'Zeladoria', icon: <ShieldCheck size={20} />, roles: ['regional_admin', 'school_manager'] },
      ]
  },
   {
    title: 'Gamificação',
    items: [
      { id: 'prioritarias', label: 'Escolas Prioritárias', icon: <Star size={20} className="text-amber-500" />, roles: ['regional_admin'] },
      { id: 'ranking', label: 'Ranking de Escolas', icon: <Trophy size={20} className="text-amber-500" />, roles: ['regional_admin', 'school_manager'] },
    ]
  },
  {
    title: 'Sistema',
    items: [
      { id: 'escolas', label: 'Escolas (Detalhes)', icon: <Building2 size={20} />, roles: ['regional_admin', 'school_manager'] },
      { id: 'lista-escolas', label: 'Lista de Escolas', icon: <School size={20} />, roles: ['regional_admin'] },
      { id: 'usuarios', label: 'Gestão de Usuários', icon: <UserCog size={20} />, roles: ['regional_admin'] },
      { id: 'tutoriais', label: 'Manuais e Tutoriais', icon: <BookOpen size={20} />, roles: ['regional_admin', 'school_manager'] },
      ]
  },
];

export default function App() {
  // 1. TODOS os Hooks (useState, useEffect) ficam estritamente no topo
  const [session, setSession] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['Principal']);

  // Efeito de Autenticação
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

  // Efeito de Menu Sanfona (Garante que a aba atual se abre sozinha)
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

  // 2. Funções auxiliares
  async function fetchUserRole(userId: string) {
    try {
      const { data } = await (supabase as any)
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      
      if (data && data.role) {
        setUserRole(data.role);
      }
    } catch (error) {
      console.error("Erro ao carregar papel do utilizador:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev => 
      prev.includes(title) 
        ? prev.filter(g => g !== title) 
        : [...prev, title]
    );
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
      case 'Chapa': return <AdicionarItemAoPatrimonio />;
      case 'listchapa': return <ListagemPatrimonio />;
      default: return <Dashboard />;
    }
  };

  // 3. Verificações Condicionais (Return cedo) - NENHUM HOOK PODE FICAR ABAIXO DAQUI
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  // 4. Renderização Principal do Componente
  return (
    <div className="min-h-screen bg-[#f8fafc] flex font-sans text-slate-900 print:bg-white print:block">
      
      {/* Sidebar Lateral */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 bg-[#0B1120] text-white transform transition-all duration-300 ease-in-out flex flex-col shadow-2xl
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
          lg:relative lg:translate-x-0 print:hidden
          ${isCollapsed ? 'w-20' : 'w-72'}
        `}
      >
        {/* Cabeçalho Sidebar */}
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
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors hidden lg:block ${isCollapsed ? 'mx-auto mt-2' : ''}`}
          >
            {isCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>

        {/* Corpo do Menu com Categorias Sanfonadas */}
        <nav className="flex-1 py-4 flex flex-col px-3 overflow-y-auto custom-scrollbar pb-20">
          {MENU_GROUPS.map((group, groupIndex) => {
            const visibleItems = group.items.filter(item => item.roles.includes(userRole));
            if (visibleItems.length === 0) return null;

            const isOpen = expandedGroups.includes(group.title);

            return (
              <div key={groupIndex} className="mb-1">
                {/* Título da Categoria - Botão de Expandir/Recolher */}
                {!isCollapsed ? (
                  <button 
                    onClick={() => toggleGroup(group.title)}
                    className="w-full flex items-center justify-between px-3 py-2 mt-2 rounded-lg hover:bg-slate-800/30 transition-colors group"
                  >
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-slate-300 transition-colors">
                      {group.title}
                    </p>
                    <ChevronDown size={14} className={`text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                ) : (
                  <div className="h-px bg-slate-800 my-4 mx-2"></div>
                )}

                {/* Itens do Grupo com Efeito Sanfona */}
                <div 
                  className={`
                    flex flex-col gap-1 overflow-hidden transition-all duration-300 ease-in-out
                    ${!isCollapsed && !isOpen ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100 mt-1'}
                  `}
                >
                  {visibleItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setCurrentPage(item.id);
                        if (window.innerWidth < 1024) setIsSidebarOpen(false);
                      }}
                      title={isCollapsed ? item.label : undefined}
                      className={`
                        w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} 
                        px-3 py-2.5 rounded-lg transition-all duration-200 group
                        ${currentPage === item.id 
                          ? 'bg-blue-600 text-white shadow-md' 
                          : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                        }
                      `}
                    >
                      <div className={`${currentPage === item.id ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'} transition-colors flex-shrink-0`}>
                        {item.icon}
                      </div>
                      {!isCollapsed && <span className="font-medium whitespace-nowrap text-sm text-left truncate">{item.label}</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Rodapé Sair */}
        <div className="p-4 border-t border-slate-800/50 shrink-0 bg-[#0B1120]">
          <button 
            onClick={handleLogout}
            className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} w-full text-slate-400 hover:text-red-400 hover:bg-slate-800/50 p-2.5 rounded-lg transition-colors font-medium`}
            title="Encerrar Sessão"
          >
            <LogOut size={20} />
            {!isCollapsed && <span>Sair do Sistema</span>}
          </button>
        </div>
      </aside>

      {/* OVERLAY PARA MOBILE */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ÁREA DE CONTEÚDO PRINCIPAL */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden h-screen print:h-auto print:overflow-visible print:w-full print:block">
        {/* Header Superior - Classe print:hidden garante que suma na impressão */}
        <header className="h-20 bg-white border-b border-slate-100 flex items-center justify-between px-8 shrink-0 print:hidden">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-50 rounded-xl text-slate-500 lg:hidden"
            >
              <Menu size={24} />
            </button>
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">
              {MENU_GROUPS.flatMap(g => g.items).find(i => i.id === currentPage)?.label || 'Painel'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
             <div className="text-right hidden sm:block">
               <p className="text-xs font-black text-slate-900 uppercase">{session.user.email?.split('@')[0]}</p>
               <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                {userRole === 'regional_admin' ? 'Administrador Regional' : 'Gestor Unidade'}
               </p>
             </div>
             <div className="w-10 h-10 bg-slate-100 rounded-full border-2 border-white shadow-sm flex items-center justify-center font-black text-blue-600">
               {session.user.email?.charAt(0).toUpperCase()}
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