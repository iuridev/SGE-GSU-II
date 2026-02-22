import { useState } from 'react';
import { 
  LogOut, ChevronLeft, Menu, Users,
  LayoutDashboard, Headset, Droplets, Mail, 
  BookOpen, Star, Trophy, CalendarDays, 
  Car, HardHat, Map, TreePine, ScanSearch, 
  ArrowUpCircle, Building, Archive, ShoppingCart, 
  ArrowRightLeft, AlertOctagon, Wrench, ClipboardCheck, 
  Presentation, GraduationCap, School, ClipboardList
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface SidebarProps {
  userRole: string;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  to: string;
  active?: boolean;
}

export function Sidebar({ userRole }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/');
  }

  // Verifica se a rota atual corresponde ao link (inclui verificação de sub-rotas se necessário)
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  // Controle de permissão de acesso
  const isAdmin = ['regional_admin', 'manage_admin', 'admin'].includes(userRole);

  // ========================================================================
  // CONFIGURAÇÃO DO MENU AGRUPADO
  // Todas as páginas do seu projeto organizadas por categorias lógicas
  // ATENÇÃO: As propriedades 'to' devem corresponder aos 'path' do seu App.tsx
  // ========================================================================
  const menuGroups = [
    {
      title: 'Principal',
      items: [
        { label: 'Painel Geral', to: '/dashboard', icon: <LayoutDashboard size={20} />, show: true }
      ]
    },
    {
      title: 'Atendimento',
      items: [
        { label: 'Central de Chamados', to: '/chamados', icon: <Headset size={20} />, show: true },
        { label: 'Demandas / E-mails', to: '/demandas', icon: <Mail size={20} />, show: true },
      ]
    },
    {
      title: 'Gestão Escolar',
      items: [
        { label: 'Visão Geral', to: '/escolas', icon: <GraduationCap size={20} />, show: true },
        { label: 'Lista de Escolas', to: '/lista-escolas', icon: <School size={20} />, show: true },
        { label: 'Escolas Prioritárias', to: '/prioritarias', icon: <Star size={20} />, show: true },
        { label: 'Ranking de Escolas', to: '/ranking', icon: <Trophy size={20} />, show: true },
        { label: 'Educação Patrimonial', to: '/educacao-patrimonial', icon: <BookOpen size={20} />, show: true },
        { label: 'Raio-X / Vistoria', to: '/raiox', icon: <ScanSearch size={20} />, show: true },
      ]
    },
    {
      title: 'Administrativo',
      items: [
        { label: 'Agendar Ambientes', to: '/ambientes', icon: <CalendarDays size={20} />, show: true },
        { label: 'Agendar Carros', to: '/carros', icon: <Car size={20} />, show: true },
        { label: 'Reuniões', to: '/reunioes', icon: <Presentation size={20} />, show: true },
        { label: 'Patrimônio e Processos', to: '/patrimonio', icon: <Archive size={20} />, show: isAdmin },
        { label: 'Aquisições', to: '/aquisicao', icon: <ShoppingCart size={20} />, show: isAdmin },
        { label: 'Remanejamento', to: '/remanejamento', icon: <ArrowRightLeft size={20} />, show: isAdmin },
      ]
    },
    {
      title: 'Infraestrutura e Zeladoria',
      items: [
        { label: 'Consumo de Água', to: '/consumo', icon: <Droplets size={20} />, show: true },
        { label: 'Zeladoria', to: '/zeladoria', icon: <ClipboardList size={20} />, show: true },
        { label: 'Obras', to: '/obras', icon: <HardHat size={20} />, show: isAdmin },
        { label: 'Serviços Terceirizados', to: '/servicos', icon: <Wrench size={20} />, show: isAdmin },
        { label: 'Manejo Arbóreo', to: '/manejo', icon: <TreePine size={20} />, show: true },
        { label: 'Gestão de Elevadores', to: '/elevadores', icon: <ArrowUpCircle size={20} />, show: true },
        { label: 'Plantas Prediais', to: '/plantas', icon: <Building size={20} />, show: isAdmin },
        { label: 'Cadastro de Furtos', to: '/furtos', icon: <AlertOctagon size={20} />, show: true },
        { label: 'Fiscalização Escolar', to: '/fiscalizacao', icon: <Map size={20} />, show: isAdmin },
        { label: 'Fiscalização URE', to: '/fiscalizacaoURE', icon: <ClipboardCheck size={20} />, show: isAdmin },
      ]
    },
    {
      title: 'Sistema',
      items: [
        { label: 'Manuais e Tutoriais', to: '/tutoriais', icon: <BookOpen size={20} />, show: true },
        { label: 'Gestão de Usuários', to: '/usuarios', icon: <Users size={20} />, show: isAdmin },
      ]
    }
  ];

  return (
    <aside 
      className={`${isCollapsed ? 'w-20' : 'w-72'} bg-[#0B1120] text-white transition-all duration-300 flex flex-col h-screen shadow-xl z-20 flex-shrink-0 fixed left-0 top-0`}
    >
      {/* CABEÇALHO DO MENU */}
      <div className="h-20 flex items-center justify-between px-4 border-b border-slate-800/50 shrink-0">
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Building size={20} className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-lg tracking-tight text-white leading-none">SGE-GSU</span>
              <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Intelligence II</span>
            </div>
          </div>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors ${isCollapsed ? 'mx-auto mt-2' : ''}`}
          title={isCollapsed ? "Expandir menu" : "Recolher menu"}
        >
          {isCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* CORPO DO MENU (Scrollável) */}
      <nav className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto custom-scrollbar pb-20">
        {menuGroups.map((group, groupIndex) => {
          // Filtra os itens que o utilizador atual tem permissão para ver
          const visibleItems = group.items.filter(item => item.show);
          
          if (visibleItems.length === 0) return null;

          return (
            <div key={groupIndex} className="mb-3">
              {/* Título da Categoria */}
              {!isCollapsed ? (
                <div className="px-3 py-2 mt-1">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    {group.title}
                  </p>
                </div>
              ) : (
                <div className="h-px bg-slate-800 my-4 mx-2"></div>
              )}

              {/* Links do Grupo */}
              <div className="flex flex-col gap-1">
                {visibleItems.map((item, itemIndex) => (
                  <NavItem 
                    key={itemIndex}
                    to={item.to} 
                    icon={item.icon} 
                    label={item.label} 
                    collapsed={isCollapsed} 
                    active={isActive(item.to)} 
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* RODAPÉ DO MENU (Sair) */}
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
  );
}

function NavItem({ icon, label, collapsed, to, active = false }: NavItemProps) {
  return (
    <Link 
      to={to} 
      title={collapsed ? label : undefined}
      className={`
        flex items-center ${collapsed ? 'justify-center' : 'gap-3'} 
        px-3 py-2.5 rounded-lg transition-all duration-200 group
        ${active 
          ? 'bg-blue-600 text-white shadow-md' 
          : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
        }
      `}
    >
      <div className={`${active ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'} transition-colors`}>
        {icon}
      </div>
      {!collapsed && <span className="font-medium whitespace-nowrap text-sm">{label}</span>}
    </Link>
  );
}