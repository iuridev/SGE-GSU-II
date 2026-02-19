import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { 
  LayoutDashboard, Waves, ShieldCheck, ArrowRightLeft, 
  Building2, UserCog, LogOut, Menu, X, 
  BookOpen, ClipboardCheck, Calendar, Car, Building,
  AlertTriangle, Scan, ShoppingBag, Trophy, Package,
  Star, ArrowUpCircle, HardHat, TreeDeciduous, Ticket,
  School,
  ShieldAlert
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
import ListaEscolas from './pages/listaescolas';
import EducacaoPatrimonial from './pages/EducacaoPatrimonial';

//atualizado

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);

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
      console.error("Erro ao carregar papel do usuário:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

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
      default: return <Dashboard />;
    }
  };

  const menuItems = [
    { id: 'dashboard', label: 'Painel Geral', icon: <LayoutDashboard size={20} />, roles: ['regional_admin', 'school_manager'] },
    { id: 'lista-escolas', label: 'Lista de Escolas', icon: <School size={20} />, roles: ['regional_admin'] },
    { id: 'educacao-patrimonial', label: 'Educação Patrimonial', icon: <ShieldAlert size={20} className="text-orange-500" />, roles: ['regional_admin', 'school_manager'] },
    { id: 'chamados', label: 'Central de Chamados', icon: <Ticket size={20} className="text-pink-500" />, roles: ['regional_admin', 'school_manager'] },
    { id: 'prioritarias', label: 'Escolas Prioritárias', icon: <Star size={20} className="text-amber-500" />, roles: ['regional_admin'] },
    { id: 'ranking', label: 'Ranking de Escolas', icon: <Trophy size={20} className="text-amber-500" />, roles: ['regional_admin', 'school_manager'] },
    { id: 'raiox', label: 'Raio-X / Vistoria', icon: <Scan size={20} className="text-indigo-500" />, roles: ['regional_admin'] },
    { id: 'obras', label: 'Obras e Reformas', icon: <HardHat size={20} className="text-orange-500" />, roles: ['regional_admin'] },
    { id: 'manejo', label: 'Manejo Arbóreo', icon: <TreeDeciduous size={20} className="text-emerald-500" />, roles: ['regional_admin', 'school_manager'] },
    { id: 'elevadores', label: 'Gestão de Elevadores', icon: <ArrowUpCircle size={20} className="text-blue-500" />, roles: ['regional_admin'] },
    { id: 'demandas', label: 'Demandas / E-mails', icon: <AlertTriangle size={20} className="text-red-500" />, roles: ['regional_admin', 'school_manager'] },
    { id: 'aquisicao', label: 'Aquisição de Itens', icon: <ShoppingBag size={20} className="text-emerald-500" />, roles: ['regional_admin', 'school_manager'] },
    { id: 'patrimonio', label: 'Processos Patrimônio', icon: <Package size={20} className="text-blue-500" />, roles: ['regional_admin', 'school_manager'] },
    { id: 'reunioes', label: 'Agenda de Reuniões', icon: <Calendar size={20} />, roles: ['regional_admin', 'school_manager'] },
    { id: 'carros', label: 'Carros Oficiais', icon: <Car size={20} />, roles: ['regional_admin'] },
    { id: 'ambientes', label: 'Reservas Ambiente', icon: <Building size={20} />, roles: ['regional_admin'] },
    { id: 'tutoriais', label: 'Manuais e Tutoriais', icon: <BookOpen size={20} />, roles: ['regional_admin', 'school_manager'] },
    { id: 'fiscalizacao', label: 'Fiscalização', icon: <ClipboardCheck size={20} />, roles: ['regional_admin', 'school_manager'] },
    { id: 'consumo', label: 'Consumo de Água', icon: <Waves size={20} />, roles: ['regional_admin', 'school_manager'] },
    { id: 'zeladoria', label: 'Zeladoria', icon: <ShieldCheck size={20} />, roles: ['regional_admin', 'school_manager'] },
    { id: 'remanejamento', label: 'Remanejamento', icon: <ArrowRightLeft size={20} />, roles: ['regional_admin', 'school_manager'] },
    { id: 'escolas', label: 'Escolas (Detalhes)', icon: <Building2 size={20} />, roles: ['regional_admin', 'school_manager'] },
    { id: 'usuarios', label: 'Gestão de Usuários', icon: <UserCog size={20} />, roles: ['regional_admin'] },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] flex font-sans text-slate-900 print:bg-white print:block">
      {/* Sidebar Lateral - Classe print:hidden garante que suma na impressão */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 print:hidden`}>
        <div className="h-full flex flex-col p-6">
          <div className="flex items-center gap-3 px-2 mb-10">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
              <Building2 size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight leading-none">SGE-GSU</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Intelligence II</p>
            </div>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto pr-2 custom-scrollbar">
            {menuItems
              .filter(item => item.roles.includes(userRole))
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentPage(item.id);
                    if (window.innerWidth < 1024) setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl font-bold text-sm transition-all ${
                    currentPage === item.id 
                      ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' 
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
          </nav>

          <div className="pt-6 border-t border-white/10 mt-4">
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl font-bold text-sm text-red-400 hover:bg-red-50/10 transition-all"
            >
              <LogOut size={20} />
              Sair do Sistema
            </button>
          </div>
        </div>
      </aside>

      {/* Área de Conteúdo Principal */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden h-screen print:h-auto print:overflow-visible print:w-full print:block">
        {/* Header Superior - Classe print:hidden garante que suma na impressão */}
        <header className="h-20 bg-white border-b border-slate-100 flex items-center justify-between px-8 shrink-0 print:hidden">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-50 rounded-xl text-slate-500 lg:hidden"
            >
              {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">
              {menuItems.find(i => i.id === currentPage)?.label || 'Painel'}
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

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#f8fafc] print:p-0 print:bg-white print:overflow-visible print:w-full">
          <div className="max-w-7xl mx-auto print:max-w-none print:w-full">
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  );
}