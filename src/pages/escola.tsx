import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import {
  MapPin, Phone,
  Search, Plus, GraduationCap,
  Trash2, Edit, X, Save, UserCog, ShieldCheck,
  Building2, Zap, Droplets, Hash,
  Calendar, Layers, Clock, DoorOpen, Compass, ArrowUpCircle,
  Loader2, User, Users, UsersRound, LayoutGrid,
  Info, Ticket, HardHat,
  HelpCircle, FileDown, ChevronDown
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { fetchObrasSheet, normalizeStatus } from '../lib/obrasSheet';

// Tipos atualizados
interface School {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  zip_code: string | null;
  director_name: string | null;
  manager_name: string | null;
  cie_code: string | null;
  fde_code: string | null;
  sgi_code: string | null;
  ua_code: string | null;
  building_year: number | null;
  sector_number: string | null;
  teaching_types: string[] | null;   
  periods: string[] | null;          
  room_count: number | null;
  property_registration: string | null;
  has_elevator: boolean;
  latitude: number | null;
  longitude: number | null;
  edp_installation_id: string | null;
  sabesp_supply_id: string | null;
  student_count: number | null;
  teacher_count: number | null;
}

interface Fiscal {
  id?: string;
  school_id: string;
  contract_type: 'LIMPEZA' | 'CUIDADOR' | 'MERENDA' | 'TELEFONE' | 'AGUA' | 'VIGILANTE';
  fiscal_name: string;
  contact_info: string;
  created_at?: string;
}

const SERVICE_TYPES = ['LIMPEZA', 'CUIDADOR', 'MERENDA', 'TELEFONE', 'AGUA', 'VIGILANTE'];
const TEACHING_OPTIONS = ['Fundamental I', 'Fundamental II', 'Ensino Médio'];
const PERIOD_OPTIONS = ['Manhã', 'Tarde', 'Noite', 'Integral 9h', 'Integral 7h'];

type TabType = 'identificacao' | 'localizacao' | 'infraestrutura' | 'ensino';

// Passo a passo ilustrado exibido no topo da aba Infraestrutura e no PDF gerado
const MATRICULA_TUTORIAL_STEPS: { titulo: string; texto: string }[] = [
  { titulo: 'Acesse o sistema', texto: 'Entre no SGE-GSU com o login da sua unidade escolar.' },
  { titulo: 'Abra o menu "Escolas"', texto: 'No menu lateral, clique em "Escolas" (Unidades Escolares).' },
  { titulo: 'Clique em "Ver Detalhes"', texto: 'No card da sua escola, clique no botão com ícone de grade, no canto superior do card.' },
  { titulo: 'Abra a aba "Infraestrutura"', texto: 'Dentro da Ficha da Unidade, clique na aba "Infraestrutura", no topo da janela.' },
  { titulo: 'Leia o campo "Matrícula"', texto: 'No bloco "Prédio e Património", o número mostrado no campo "Matrícula" é a matrícula imobiliária do imóvel.' },
];

const MATRICULA_TUTORIAL_NOTA =
  'Campo vazio ou número desatualizado? Entre em contato com a URE — Serviço de Obras e Manutenção Escolar (SEOM) para regularização.';

// Ilustração (mockup) de cada passo — usada na tela e capturada para o PDF
function PassoArte({ n }: { n: number }) {
  const svg = { viewBox: '0 0 340 160', width: '100%', style: { display: 'block' } };
  const frame = (
    <rect x={8} y={8} width={324} height={144} rx={16} fill="#ffffff" stroke="#e2e8f0" strokeWidth={2} />
  );

  if (n === 0) {
    return (
      <svg {...svg}>
        {frame}
        <rect x={120} y={26} width={100} height={104} rx={12} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={2} />
        <circle cx={170} cy={48} r={9} fill="#6366f1" />
        <rect x={136} y={66} width={68} height={11} rx={4} fill="#e2e8f0" />
        <rect x={136} y={83} width={68} height={11} rx={4} fill="#e2e8f0" />
        <rect x={136} y={103} width={68} height={15} rx={5} fill="#6366f1" />
        <text x={170} y={114} fontSize={7} fontWeight={700} fill="#ffffff" textAnchor="middle">ENTRAR</text>
      </svg>
    );
  }

  if (n === 1) {
    return (
      <svg {...svg}>
        {frame}
        <rect x={24} y={20} width={96} height={120} rx={12} fill="#0f172a" />
        <rect x={38} y={32} width={44} height={8} rx={4} fill="#475569" />
        <rect x={36} y={54} width={72} height={9} rx={4} fill="#334155" />
        <rect x={30} y={72} width={84} height={22} rx={8} fill="#6366f1" />
        <text x={44} y={87} fontSize={10} fontWeight={700} fill="#ffffff">Escolas</text>
        <rect x={36} y={104} width={64} height={9} rx={4} fill="#334155" />
        <rect x={36} y={120} width={72} height={9} rx={4} fill="#334155" />
        <line x1={172} y1={83} x2={128} y2={83} stroke="#f97316" strokeWidth={3} />
        <polygon points="130,77 130,89 119,83" fill="#f97316" />
      </svg>
    );
  }

  if (n === 2) {
    return (
      <svg {...svg}>
        {frame}
        <rect x={64} y={30} width={208} height={100} rx={14} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={2} />
        <rect x={80} y={44} width={30} height={30} rx={9} fill="#6366f1" />
        <rect x={120} y={48} width={80} height={9} rx={4} fill="#cbd5e1" />
        <rect x={120} y={62} width={52} height={7} rx={3} fill="#e2e8f0" />
        <rect x={80} y={90} width={150} height={7} rx={3} fill="#e2e8f0" />
        <rect x={80} y={104} width={110} height={7} rx={3} fill="#e2e8f0" />
        <rect x={226} y={36} width={30} height={30} rx={9} fill="#eef2ff" stroke="#6366f1" strokeWidth={2.5} />
        <rect x={233} y={43} width={6} height={6} rx={1} fill="#6366f1" />
        <rect x={243} y={43} width={6} height={6} rx={1} fill="#6366f1" />
        <rect x={233} y={53} width={6} height={6} rx={1} fill="#6366f1" />
        <rect x={243} y={53} width={6} height={6} rx={1} fill="#6366f1" />
        <line x1={300} y1={16} x2={262} y2={40} stroke="#f97316" strokeWidth={3} />
        <polygon points="256,36 268,34 262,46" fill="#f97316" />
        <text x={182} y={126} fontSize={9} fontWeight={700} fill="#f97316">Ver Detalhes</text>
      </svg>
    );
  }

  if (n === 3) {
    return (
      <svg {...svg}>
        {frame}
        <rect x={30} y={26} width={280} height={108} rx={14} fill="#ffffff" stroke="#e2e8f0" strokeWidth={2} />
        <path d="M30 42 a14 14 0 0 1 14 -16 h252 a14 14 0 0 1 14 16 v14 h-280 z" fill="#f8fafc" />
        <text x={44} y={45} fontSize={8} fill="#94a3b8">Identificação</text>
        <text x={112} y={45} fontSize={8} fill="#94a3b8">Localização</text>
        <text x={174} y={45} fontSize={8} fontWeight={800} fill="#6366f1">Infraestrutura</text>
        <text x={256} y={45} fontSize={8} fill="#94a3b8">Ensino</text>
        <rect x={172} y={50} width={72} height={3} rx={2} fill="#6366f1" />
        <rect x={48} y={74} width={90} height={11} rx={4} fill="#f1f5f9" />
        <rect x={48} y={94} width={224} height={11} rx={4} fill="#f1f5f9" />
        <line x1={208} y1={86} x2={208} y2={60} stroke="#f97316" strokeWidth={3} />
        <polygon points="202,62 214,62 208,52" fill="#f97316" />
      </svg>
    );
  }

  return (
    <svg {...svg}>
      {frame}
      <text x={22} y={28} fontSize={8} fontWeight={800} letterSpacing={1} fill="#94a3b8">PRÉDIO E PATRIMÓNIO</text>
      <text x={24} y={46} fontSize={7} fill="#94a3b8">ANO</text>
      <rect x={20} y={50} width={62} height={34} rx={8} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={2} />
      <text x={94} y={46} fontSize={7} fill="#94a3b8">SETOR</text>
      <rect x={90} y={50} width={62} height={34} rx={8} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={2} />
      <text x={164} y={46} fontSize={7} fill="#94a3b8">SALAS</text>
      <rect x={160} y={50} width={62} height={34} rx={8} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={2} />
      <text x={232} y={46} fontSize={7} fontWeight={800} fill="#6366f1">MATRÍCULA</text>
      <rect x={230} y={50} width={90} height={34} rx={8} fill="#eef2ff" stroke="#6366f1" strokeWidth={2.5} />
      <text x={237} y={71} fontSize={8} fontWeight={700} fill="#4338ca">000.00.00.0000.00</text>
      <line x1={275} y1={126} x2={275} y2={92} stroke="#f97316" strokeWidth={3} />
      <polygon points="269,94 281,94 275,84" fill="#f97316" />
      <text x={116} y={140} fontSize={9} fontWeight={700} fill="#f97316">Número da matrícula imobiliária</text>
    </svg>
  );
}

// Lista de passos ilustrados — estilos inline (hex) p/ renderizar igual na tela e no PDF
function TutorialMatriculaSteps() {
  return (
    <div>
      {MATRICULA_TUTORIAL_STEPS.map((s, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: '14px',
            alignItems: 'flex-start',
            padding: '14px 0',
            borderTop: i > 0 ? '1px solid #eef2ff' : 'none',
          }}
        >
          <div
            style={{
              flexShrink: 0,
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: '#4f46e5',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {i + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{s.titulo}</div>
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px', lineHeight: 1.5 }}>{s.texto}</div>
            <div
              style={{
                marginTop: '10px',
                maxWidth: '360px',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                overflow: 'hidden',
                background: '#f8fafc',
              }}
            >
              <PassoArte n={i} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface SchoolIndicators {
  openTickets: number;
  waterAlert: boolean;
  activeWork: boolean;
}

export function Escola() {
  const [escolas, setEscolas] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [indicators, setIndicators] = useState<Record<string, SchoolIndicators>>({});
  
  const [isSchoolModalOpen, setIsSchoolModalOpen] = useState(false);
  const [isFiscalModalOpen, setIsFiscalModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('identificacao');
  const [showMatriculaHelp, setShowMatriculaHelp] = useState(true);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const tutorialPdfRef = useRef<HTMLDivElement>(null);
  
  const [formData, setFormData] = useState<Partial<School>>({
    teaching_types: [],
    periods: [],
    has_elevator: false
  });

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      const profile = await fetchProfile();
      if (profile) {
        await fetchEscolas(profile.role, profile.school_id, profile.supervisor_schools);
      } else {
        setLoading(false);
      }
    };
    initialize();
  }, []);

  async function fetchProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('role, school_id, supervisor_schools')
          .eq('id', user.id)
          .single();

        if (error) throw error;

        const profile = data as any;
        const effectiveRole = resolveViewRole(profile?.role || '');
        setUserRole(effectiveRole);
        setUserSchoolId(profile?.school_id || null);
        return { ...profile, role: effectiveRole };
      }
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);
    }
    return null;
  }

  async function fetchEscolas(role?: string, sId?: string | null, supervisorSchools?: string[] | null) {
    const activeRole = role || userRole;
    const activeSchoolId = sId !== undefined ? sId : userSchoolId;

    try {
      let query = (supabase as any).from('schools').select('*');

      if (activeRole === 'school_manager') {
        if (activeSchoolId) {
          query = query.eq('id', activeSchoolId);
        } else {
          setEscolas([]);
          return;
        }
      } else if (activeRole === 'supervisor') {
        const ids = supervisorSchools || [];
        if (ids.length > 0) {
          query = query.in('id', ids);
        } else {
          setEscolas([]);
          return;
        }
      }

      const { data, error } = await query.order('name');
      if (error) throw error;
      const list: School[] = data || [];
      setEscolas(list);

      if (activeRole === 'supervisor' && list.length > 0) {
        fetchIndicators(list.map(s => s.id), list.map(s => ({ id: s.id, name: s.name })));
      }
    } catch (error) {
      console.error('Erro ao buscar escolas:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchIndicators(schoolIds: string[], schoolsForMatch: { id: string, name: string }[]) {
    try {
      const firstDayMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      const [{ data: tickets }, { data: consumo }] = await Promise.all([
        (supabase as any).from('internal_tickets').select('school_id, status').in('school_id', schoolIds),
        (supabase as any).from('consumo_agua').select('school_id, limit_exceeded').in('school_id', schoolIds).gte('date', firstDayMonth),
      ]);

      let obrasBySchool: Record<string, boolean> = {};
      try {
        const sheetRows = await fetchObrasSheet(schoolsForMatch);
        sheetRows.forEach(r => {
          if (r.matchedSchoolId && normalizeStatus(r.status) === 'EM ANDAMENTO') {
            obrasBySchool[r.matchedSchoolId] = true;
          }
        });
      } catch { /* planilha pode estar indisponível */ }

      const next: Record<string, SchoolIndicators> = {};
      schoolIds.forEach(id => {
        const openTickets = (tickets || []).filter((t: any) => t.school_id === id && !['RESOLVIDO', 'FECHADO', 'CONCLUÍDO'].includes(t.status)).length;
        const waterAlert = (consumo || []).some((c: any) => c.school_id === id && c.limit_exceeded);
        next[id] = { openTickets, waterAlert, activeWork: !!obrasBySchool[id] };
      });
      setIndicators(next);
    } catch (error) {
      console.error('Erro ao buscar indicadores das escolas:', error);
    }
  }

  function handleNewSchool() {
    setEditingSchool(null);
    setFormData({
      teaching_types: [],
      periods: [],
      has_elevator: false,
      director_name: '',
      manager_name: '',
      student_count: 0,
      teacher_count: 0,
      latitude: null,
      longitude: null,
      sabesp_supply_id: '',
      edp_installation_id: ''
    });
    setActiveTab('identificacao');
    setIsSchoolModalOpen(true);
  }

  function handleEditSchool(school: School) {
    setEditingSchool(school);
    setFormData({
      ...school,
      teaching_types: school.teaching_types || [],
      periods: school.periods || []
    });
    setActiveTab('identificacao');
    setIsSchoolModalOpen(true);
  }

  async function handleDeleteSchool(id: string) {
    if (userRole !== 'regional_admin') return;
    if (!confirm("Tem certeza que deseja excluir esta escola?")) return;
    try {
      const { error } = await (supabase as any).from('schools').delete().eq('id', id);
      if (error) throw error;
      fetchEscolas();
    } catch (error) {
      alert('Erro ao excluir escola.');
    }
  }

  async function saveSchool(e: React.FormEvent) {
    e.preventDefault();
    
    if (userRole !== 'regional_admin') {
      alert("Acesso negado. Apenas o administrador regional pode alterar dados cadastrais.");
      return;
    }
    
    try {
      if (editingSchool?.id) {
        const { error } = await (supabase as any).from('schools').update(formData).eq('id', editingSchool.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('schools').insert([formData]);
        if (error) throw error;
      }
      setIsSchoolModalOpen(false);
      fetchEscolas();
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar dados da escola.');
    }
  }

  const toggleArrayItem = (field: 'teaching_types' | 'periods', value: string) => {
    if (userRole !== 'regional_admin') return; 
    const current = (formData[field] as string[]) || [];
    const updated = current.includes(value) 
      ? current.filter(item => item !== value)
      : [...current, value];
    setFormData({ ...formData, [field]: updated });
  };

  async function baixarTutorialMatriculaPDF() {
    const alvo = tutorialPdfRef.current;
    if (!alvo || gerandoPdf) return;
    setGerandoPdf(true);
    try {
      const canvas = await html2canvas(alvo, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;

      let heightLeft = imgH;
      let position = margin;
      pdf.addImage(imgData, 'PNG', margin, position, imgW, imgH);
      heightLeft -= pageH - margin * 2;

      while (heightLeft > 0) {
        position = margin - (imgH - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgW, imgH);
        heightLeft -= pageH - margin * 2;
      }

      pdf.save('tutorial-matricula-imobiliaria.pdf');
    } catch (e) {
      console.error('Erro ao gerar PDF do tutorial:', e);
      alert('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setGerandoPdf(false);
    }
  }

  const filteredEscolas = escolas.filter(e =>
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.cie_code?.includes(searchTerm) ||
    e.fde_code?.includes(searchTerm) ||
    e.ua_code?.includes(searchTerm)
  );

  const isAdmin = userRole === 'regional_admin';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Unidades Escolares</h1>
          <p className="text-slate-500 font-medium">
            {userRole === 'school_manager'
              ? 'Informações detalhadas da sua unidade.'
              : userRole === 'supervisor'
              ? 'Escolas sob sua supervisão e principais indicadores.'
              : 'Gestão e infraestrutura da rede regional.'}
          </p>
        </div>

        {isAdmin && (
          <button 
            onClick={handleNewSchool}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-xl shadow-indigo-100 transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Cadastrar Escola
          </button>
        )}
      </div>

      {isAdmin && (
        <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por nome, códigos ou endereço..." 
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
           <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredEscolas.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
               <Building2 size={48} className="mx-auto text-slate-200 mb-4"/>
               <p className="text-slate-400 font-black uppercase text-xs tracking-widest">Nenhuma unidade escolar disponível para seu acesso.</p>
            </div>
          ) : filteredEscolas.map((escola) => (
            <div key={escola.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110 z-0"></div>
              
              <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                <button 
                  onClick={() => { setEditingSchool(escola); setIsFiscalModalOpen(true); }} 
                  className="p-2.5 bg-white shadow-lg text-slate-500 hover:text-indigo-600 rounded-xl transition-all border border-slate-100"
                  title="Visualizar Fiscais"
                >
                  <UserCog className="w-4 h-4" />
                </button>
                
                {isAdmin && (
                  <>
                    <button onClick={() => handleEditSchool(escola)} className="p-2.5 bg-white shadow-lg text-slate-500 hover:text-amber-600 rounded-xl transition-all border border-slate-100"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => handleDeleteSchool(escola.id)} className="p-2.5 bg-white shadow-lg text-slate-500 hover:text-red-600 rounded-xl transition-all border border-slate-100"><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
                {!isAdmin && (
                  <button 
                    onClick={() => handleEditSchool(escola)} 
                    className="p-2.5 bg-white shadow-lg text-slate-500 hover:text-indigo-600 rounded-xl transition-all border border-slate-100"
                    title="Ver Detalhes"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="relative z-20 flex items-start gap-5 mb-6">
                <div className="p-4 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100 shrink-0">
                  <GraduationCap className="w-8 h-8" />
                </div>
                <div className="flex flex-col gap-1.5 mt-1">
                   <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      <Users size={12} className="text-indigo-500"/> {escola.student_count || 0} Alunos
                   </div>
                   <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      <UsersRound size={12} className="text-indigo-500"/> {escola.teacher_count || 0} Professores
                   </div>
                </div>
              </div>
              
              <h3 className="font-black text-slate-900 text-xl mb-1 line-clamp-1 pr-10 uppercase tracking-tight relative z-10" title={escola.name}>{escola.name}</h3>
              <div className="flex flex-wrap gap-1.5 mb-6 relative z-10">
                <span className="bg-slate-100 px-2 py-0.5 rounded-lg text-[9px] font-black text-slate-500 uppercase tracking-widest border border-slate-200">CIE: {escola.cie_code || '---'}</span>
                <span className="bg-blue-50 px-2 py-0.5 rounded-lg text-[9px] font-black text-blue-600 uppercase tracking-widest border border-blue-100">SGI: {escola.sgi_code || '---'}</span>
                <span className="bg-indigo-50 px-2 py-0.5 rounded-lg text-[9px] font-black text-indigo-600 uppercase tracking-widest border border-indigo-100">FDE: {escola.fde_code || '---'}</span>
                <span className="bg-emerald-50 px-2 py-0.5 rounded-lg text-[9px] font-black text-emerald-600 uppercase tracking-widest border border-emerald-100">UA: {escola.ua_code || '---'}</span>
              </div>
              
              <div className="space-y-4 text-sm text-slate-600 mb-6 relative z-10">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-indigo-400 shrink-0" />
                  <span className="font-bold text-xs uppercase">{escola.director_name || 'Diretor não informado'}</span>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
                  <span className="font-medium text-xs leading-relaxed">{escola.address || 'Endereço não cadastrado'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-indigo-400 shrink-0" />
                  <span className="font-bold text-xs">{escola.phone || '(00) 0000-0000'}</span>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-50 grid grid-cols-2 gap-4 relative z-10">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400" title="Instalação EDP">
                    <div className="p-1.5 bg-amber-50 rounded-lg text-amber-500"><Zap size={14} /></div>
                    <span className="truncate">{escola.edp_installation_id || '---'}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400" title="Fornecimento SABESP">
                    <div className="p-1.5 bg-blue-50 rounded-lg text-blue-500"><Droplets size={14} /></div>
                    <span className="truncate">{escola.sabesp_supply_id || '---'}</span>
                </div>
              </div>

              {userRole === 'supervisor' && (
                <div className="pt-6 mt-6 border-t border-slate-50 flex flex-col gap-2 relative z-10">
                  {(() => {
                    const ind = indicators[escola.id];
                    const hasTickets = (ind?.openTickets || 0) > 0;
                    return (
                      <IndicatorBadge
                        icon={<Ticket size={14} />}
                        label={hasTickets ? `${ind!.openTickets} chamado(s) aberto(s)` : 'Sem chamados abertos'}
                        alert={hasTickets}
                      />
                    );
                  })()}
                  <IndicatorBadge
                    icon={<Droplets size={14} />}
                    label={indicators[escola.id]?.waterAlert ? 'Consumo de água excedido' : 'Consumo de água normal'}
                    alert={!!indicators[escola.id]?.waterAlert}
                  />
                  <IndicatorBadge
                    icon={<HardHat size={14} />}
                    label={indicators[escola.id]?.activeWork ? 'Obra em andamento' : 'Sem obra ativa'}
                    alert={false}
                    highlight={!!indicators[escola.id]?.activeWork}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MODAL DE CADASTRO/EDIÇÃO COM ABAS */}
      {isSchoolModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-hidden">
          <div className="bg-white rounded-[3rem] w-full max-w-4xl max-h-[95vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden border border-white">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl shadow-indigo-100"><Building2 size={28}/></div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                    {isAdmin ? (editingSchool ? 'Editar Unidade' : 'Nova Unidade') : 'Ficha da Unidade'}
                  </h2>
                  <p className="text-xs text-indigo-600 font-black uppercase tracking-[0.2em] mt-1">SGE-GSU Intelligence System</p>
                </div>
              </div>
              <button onClick={() => setIsSchoolModalOpen(false)} className="hover:bg-white p-3 rounded-full transition-all text-slate-400 shadow-sm border border-transparent hover:border-slate-100"><X size={24} /></button>
            </div>

            <div className="px-8 pt-4 bg-slate-50/50 flex gap-2 border-b border-slate-100">
               <TabButton active={activeTab === 'identificacao'} onClick={() => setActiveTab('identificacao')} icon={<Hash size={14}/>} label="Identificação" />
               <TabButton active={activeTab === 'localizacao'} onClick={() => setActiveTab('localizacao')} icon={<MapPin size={14}/>} label="Localização" />
               <TabButton active={activeTab === 'infraestrutura'} onClick={() => setActiveTab('infraestrutura')} icon={<Building2 size={14}/>} label="Infraestrutura" />
               <TabButton active={activeTab === 'ensino'} onClick={() => setActiveTab('ensino')} icon={<GraduationCap size={14}/>} label="Ensino" />
            </div>
            
            <form onSubmit={saveSchool} className="p-8 overflow-y-auto custom-scrollbar bg-white flex-1">
              
              {activeTab === 'identificacao' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">Dados Principais</h3>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nome da Unidade Escolar</label>
                        <input disabled={!isAdmin} required placeholder="Ex: EE PROFESSOR JOÃO DA SILVA" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Hash size={12}/> CIE</label>
                          <input disabled={!isAdmin} placeholder="000000" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.cie_code || ''} onChange={e => setFormData({...formData, cie_code: e.target.value})} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Hash size={12}/> SGI</label>
                          <input disabled={!isAdmin} placeholder="0000" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.sgi_code || ''} onChange={e => setFormData({...formData, sgi_code: e.target.value})} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Hash size={12}/> FDE</label>
                          <input disabled={!isAdmin} placeholder="0000" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.fde_code || ''} onChange={e => setFormData({...formData, fde_code: e.target.value})} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Hash size={12}/> UA</label>
                          <input disabled={!isAdmin} placeholder="0000" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.ua_code || ''} onChange={e => setFormData({...formData, ua_code: e.target.value})} />
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                       <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">Gestão</h3>
                       <div className="space-y-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Diretor(a)</label>
                            <input disabled={!isAdmin} placeholder="Nome completo" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.director_name || ''} onChange={e => setFormData({...formData, director_name: e.target.value})} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Vice-Diretor / GOE</label>
                            <input disabled={!isAdmin} placeholder="Nome completo" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.manager_name || ''} onChange={e => setFormData({...formData, manager_name: e.target.value})} />
                          </div>
                       </div>
                    </div>
                    <div className="space-y-6">
                       <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">Censo</h3>
                       <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Users size={12}/> Alunos</label>
                            <input disabled={!isAdmin} type="number" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.student_count || ''} onChange={e => setFormData({...formData, student_count: Number(e.target.value)})} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><UsersRound size={12}/> Professores</label>
                            <input disabled={!isAdmin} type="number" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.teacher_count || ''} onChange={e => setFormData({...formData, teacher_count: Number(e.target.value)})} />
                          </div>
                       </div>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'localizacao' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">Endereço e Contato</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Logradouro Completo</label>
                        <input disabled={!isAdmin} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">CEP</label>
                        <input disabled={!isAdmin} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.zip_code || ''} onChange={e => setFormData({...formData, zip_code: e.target.value})} />
                      </div>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">E-mail Institucional</label>
                        <input disabled={!isAdmin} type="email" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Telefone</label>
                        <input disabled={!isAdmin} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">Geolocalização (Mapa)</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Compass size={12}/> Latitude</label>
                        <input disabled={!isAdmin} type="number" step="any" placeholder="-23.0000" className="w-full p-4 bg-indigo-50/50 border-2 border-indigo-100 rounded-2xl font-mono font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.latitude || ''} onChange={e => setFormData({...formData, latitude: Number(e.target.value)})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Compass size={12}/> Longitude</label>
                        <input disabled={!isAdmin} type="number" step="any" placeholder="-46.0000" className="w-full p-4 bg-indigo-50/50 border-2 border-indigo-100 rounded-2xl font-mono font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.longitude || ''} onChange={e => setFormData({...formData, longitude: Number(e.target.value)})} />
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'infraestrutura' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="rounded-[2rem] border-2 border-indigo-100 bg-indigo-50/40 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowMatriculaHelp(v => !v)}
                      className="w-full flex items-center gap-3 p-5 text-left"
                    >
                      <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100 shrink-0">
                        <HelpCircle size={18} />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] leading-none">Tutorial</p>
                        <p className="text-sm font-black text-slate-800 mt-1">Como encontrar o número de Matrícula Imobiliária</p>
                      </div>
                      <ChevronDown size={18} className={`text-indigo-400 transition-transform ${showMatriculaHelp ? 'rotate-180' : ''}`} />
                    </button>

                    {showMatriculaHelp && (
                      <div className="px-5 pb-5 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                        <p className="text-xs text-slate-600 leading-relaxed">
                          A <strong>matrícula imobiliária</strong> é o número de registro do imóvel da unidade escolar. Ela já está cadastrada no próprio sistema e pode ser consultada a qualquer momento seguindo os passos abaixo.
                        </p>

                        <div className="bg-white rounded-2xl border border-indigo-100 px-4">
                          <TutorialMatriculaSteps />
                        </div>

                        <div className="flex gap-2.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
                          <Info size={14} className="shrink-0 mt-0.5 text-amber-500" />
                          <span>{MATRICULA_TUTORIAL_NOTA}</span>
                        </div>

                        <button
                          type="button"
                          onClick={baixarTutorialMatriculaPDF}
                          disabled={gerandoPdf}
                          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl font-black text-[11px] uppercase tracking-wider transition-all active:scale-95 disabled:opacity-60"
                        >
                          {gerandoPdf ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                          {gerandoPdf ? 'Gerando PDF...' : 'Baixar tutorial em PDF'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Container oculto capturado para o PDF do tutorial */}
                  <div aria-hidden style={{ position: 'fixed', left: '-10000px', top: 0, pointerEvents: 'none' }}>
                    <div
                      ref={tutorialPdfRef}
                      style={{ width: '760px', background: '#ffffff', padding: '36px', fontFamily: 'Arial, Helvetica, sans-serif' }}
                    >
                      <div style={{ borderBottom: '3px solid #4f46e5', paddingBottom: '12px', marginBottom: '18px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', color: '#4f46e5', textTransform: 'uppercase' }}>
                          SGE-GSU · Tutorial
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                          Como localizar a Matrícula Imobiliária da sua escola
                        </div>
                      </div>
                      <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.6, margin: '0 0 12px' }}>
                        A matrícula imobiliária é o número de registro do imóvel da unidade escolar. Ela já está
                        cadastrada no próprio sistema SGE-GSU e pode ser consultada a qualquer momento pela escola,
                        seguindo os passos abaixo.
                      </p>
                      <TutorialMatriculaSteps />
                      <div style={{ marginTop: '16px', padding: '12px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', fontSize: '12px', color: '#9a3412', lineHeight: 1.5 }}>
                        {MATRICULA_TUTORIAL_NOTA}
                      </div>
                      <div style={{ marginTop: '20px', fontSize: '10px', color: '#94a3b8', textAlign: 'center' }}>
                        Documento gerado pelo SGE-GSU em {new Date().toLocaleDateString('pt-BR')}.
                      </div>
                    </div>
                  </div>

                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">Prédio e Património</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1"><Calendar size={12}/> Ano</label>
                        <input disabled={!isAdmin} type="number" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.building_year || ''} onChange={e => setFormData({...formData, building_year: Number(e.target.value)})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1"><Layers size={12}/> Setor</label>
                        <input disabled={!isAdmin} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.sector_number || ''} onChange={e => setFormData({...formData, sector_number: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1"><DoorOpen size={12}/> Salas</label>
                        <input disabled={!isAdmin} type="number" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.room_count || ''} onChange={e => setFormData({...formData, room_count: Number(e.target.value)})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1"><Hash size={12}/> Matrícula</label>
                        <input disabled={!isAdmin} className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all disabled:opacity-70" value={formData.property_registration || ''} onChange={e => setFormData({...formData, property_registration: e.target.value})} />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">Contas de Consumo</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-2 text-blue-600"><Droplets size={12}/> Código SABESP</label>
                        <input disabled={!isAdmin} placeholder="Nº Fornecimento" className="w-full p-4 bg-blue-50/30 border-2 border-blue-100 rounded-2xl font-bold text-blue-700 focus:border-blue-500 outline-none transition-all disabled:opacity-70" value={formData.sabesp_supply_id || ''} onChange={e => setFormData({...formData, sabesp_supply_id: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-2 text-amber-600"><Zap size={12}/> Instalação EDP</label>
                        <input disabled={!isAdmin} placeholder="Nº Instalação" className="w-full p-4 bg-amber-50/30 border-2 border-amber-100 rounded-2xl font-bold text-amber-700 focus:border-amber-500 outline-none transition-all disabled:opacity-70" value={formData.edp_installation_id || ''} onChange={e => setFormData({...formData, edp_installation_id: e.target.value})} />
                      </div>
                    </div>
                  </section>

                  <div className={`flex items-center gap-4 p-5 bg-slate-50 border-2 border-slate-100 rounded-[2rem] group transition-all ${!isAdmin ? 'opacity-70' : 'hover:bg-white hover:border-indigo-100'}`}>
                    <div className={`p-4 rounded-xl transition-all ${formData.has_elevator ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white text-slate-300'}`}>
                      <ArrowUpCircle size={24} />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-black text-slate-500 uppercase leading-none">Acessibilidade</p>
                      <p className="text-xs font-bold text-slate-400 mt-1">A unidade possui elevador funcional?</p>
                    </div>
                    <button 
                      type="button" 
                      disabled={!isAdmin}
                      onClick={() => setFormData({...formData, has_elevator: !formData.has_elevator})} 
                      className={`w-14 h-8 rounded-full relative transition-all ${formData.has_elevator ? 'bg-indigo-600' : 'bg-slate-200'} ${!isAdmin && 'cursor-not-allowed'}`}
                    >
                      <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${formData.has_elevator ? 'left-7' : 'left-1'}`}></div>
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'ensino' && (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">Níveis de Ensino</h3>
                    <div className="flex flex-wrap gap-3">
                      {TEACHING_OPTIONS.map(opt => (
                        <button 
                          key={opt} 
                          type="button" 
                          disabled={!isAdmin}
                          onClick={() => toggleArrayItem('teaching_types', opt)} 
                          className={`px-6 py-4 rounded-2xl text-xs font-black transition-all border-2 ${formData.teaching_types?.includes(opt) ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100 scale-[1.02]' : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-200'} ${!isAdmin && 'cursor-not-allowed opacity-70'}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">Períodos de Funcionamento</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {PERIOD_OPTIONS.map(opt => (
                        <button 
                          key={opt} 
                          type="button" 
                          disabled={!isAdmin}
                          onClick={() => toggleArrayItem('periods', opt)} 
                          className={`p-4 rounded-2xl text-[11px] font-black transition-all border-2 text-center flex items-center justify-center gap-2 ${formData.periods?.includes(opt) ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white border-slate-100 text-slate-400 hover:border-blue-200'} ${!isAdmin && 'cursor-not-allowed opacity-70'}`}
                        >
                          <Clock size={14}/> {opt}
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              <div className="pt-8 flex justify-end gap-4 border-t border-slate-100 mt-12">
                <button type="button" onClick={() => setIsSchoolModalOpen(false)} className="px-8 py-3 text-slate-400 font-black hover:text-slate-600 transition-all uppercase tracking-widest text-[10px]">
                  {isAdmin ? 'Cancelar' : 'Fechar'}
                </button>
                {isAdmin && (
                  <button type="submit" className="px-12 py-3 bg-indigo-600 text-white rounded-2xl font-black shadow-2xl shadow-indigo-200 hover:bg-indigo-700 flex items-center gap-2 active:scale-95 transition-all uppercase tracking-widest text-[10px]">
                    <Save size={18} /> {editingSchool ? 'Guardar Alterações' : 'Concluir Cadastro'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {isFiscalModalOpen && editingSchool && (
        <FiscalManagerModal 
          school={editingSchool} 
          userRole={userRole}
          onClose={() => setIsFiscalModalOpen(false)} 
        />
      )}

    </div>
  );
}

function IndicatorBadge({ icon, label, alert, highlight }: { icon: React.ReactNode, label: string, alert: boolean, highlight?: boolean }) {
  const colorClass = alert
    ? 'bg-red-50 text-red-600 border-red-100'
    : highlight
    ? 'bg-blue-50 text-blue-600 border-blue-100'
    : 'bg-emerald-50 text-emerald-600 border-emerald-100';
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${colorClass}`}>
      <div className="shrink-0">{icon}</div>
      <span className="text-[10px] font-black uppercase leading-tight break-words">{label}</span>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      type="button"
      onClick={onClick}
      className={`px-6 py-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${active ? 'text-indigo-600 border-indigo-600' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
    >
      {icon}
      {label}
    </button>
  );
}

function FiscalManagerModal({ school, userRole, onClose }: { school: School, userRole: string, onClose: () => void }) {
  const [fiscals, setFiscals] = useState<Fiscal[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFiscal, setNewFiscal] = useState<Partial<Fiscal>>({ contract_type: 'LIMPEZA' });

  const isAdmin = userRole === 'regional_admin';

  useEffect(() => {
    fetchFiscals();
  }, [school.id]);

  async function fetchFiscals() {
    setLoading(true);
    const { data } = await (supabase as any).from('school_fiscals').select('*').eq('school_id', school.id).order('created_at', { ascending: false });
    setFiscals(data || []);
    setLoading(false);
  }

  async function handleAddFiscal() {
    if (!isAdmin) return;
    if (!newFiscal.fiscal_name || !newFiscal.contact_info) return alert("Preencha nome e contato do fiscal");
    
    try {
        const { error } = await (supabase as any).from('school_fiscals').insert([{
          school_id: school.id,
          contract_type: newFiscal.contract_type,
          fiscal_name: newFiscal.fiscal_name,
          contact_info: newFiscal.contact_info
        }]);

        if (error) throw error;
        setNewFiscal({ contract_type: 'LIMPEZA', fiscal_name: '', contact_info: '' });
        fetchFiscals();
    } catch (error: any) {
        alert("Erro ao salvar fiscal: " + error.message);
    }
  }

  async function handleDeleteFiscal(id: string) {
    if (!isAdmin) return;
    if(!confirm('Remover este fiscal?')) return;
    try {
        await (supabase as any).from('school_fiscals').delete().eq('id', id);
        fetchFiscals();
    } catch (error) { console.error(error); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2.5rem] w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-white">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                <ShieldCheck className="text-indigo-600"/> Gestão de Fiscais
            </h2>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1 line-clamp-1">{school.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-all text-slate-400"><X size={24}/></button>
        </div>

        <div className="p-8 overflow-y-auto flex-1 space-y-8 custom-scrollbar bg-white">
          {isAdmin ? (
            <div className="bg-indigo-50/50 p-6 rounded-3xl space-y-4 border-2 border-indigo-100 shadow-sm">
              <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2 flex items-center gap-2"><Plus size={14}/> Novo Credenciamento</h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Contrato</label>
                    <select className="w-full p-3 bg-white border-2 border-slate-100 rounded-xl font-bold text-sm" value={newFiscal.contract_type} onChange={e => setNewFiscal({...newFiscal, contract_type: e.target.value as any})}>
                      {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Nome Completo</label>
                    <input placeholder="Ex: Maria Oliveira" className="w-full p-3 bg-white border-2 border-slate-100 rounded-xl font-bold text-sm" value={newFiscal.fiscal_name || ''} onChange={e => setNewFiscal({...newFiscal, fiscal_name: e.target.value})} />
                </div>
                <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Contato</label>
                    <input placeholder="(11) 9...." className="w-full p-3 bg-white border-2 border-slate-100 rounded-xl font-bold text-sm" value={newFiscal.contact_info || ''} onChange={e => setNewFiscal({...newFiscal, contact_info: e.target.value})} />
                </div>
              </div>
              <button onClick={handleAddFiscal} className="w-full py-4 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 transition-all uppercase tracking-widest shadow-lg shadow-indigo-100">Adicionar Fiscal</button>
            </div>
          ) : (
            <div className="bg-slate-50 p-4 rounded-2xl flex items-start gap-3 border border-slate-100">
               <Info size={18} className="text-slate-400 shrink-0 mt-0.5" />
               <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                  A gestão de fiscais é centralizada na Administração Regional. Entre em contato com o setor responsável para atualizações.
               </p>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-3">Fiscais Ativos ({fiscals.length})</h3>
            {loading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"/></div>
            ) : (
              fiscals.length === 0 ? <p className="text-center text-slate-400 text-xs py-10 font-bold uppercase tracking-tighter">Nenhum fiscal cadastrado.</p> :
              <div className="grid gap-3">
                  {fiscals.map(fiscal => (
                    <div key={fiscal.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-white hover:shadow-xl hover:shadow-slate-100 transition-all group border border-transparent hover:border-indigo-100">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shadow-sm ${fiscal.contract_type === 'LIMPEZA' ? 'bg-blue-600 text-white' : fiscal.contract_type === 'VIGILANTE' ? 'bg-slate-900 text-white' : 'bg-amber-500 text-white'}`}>
                          {fiscal.fiscal_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-black text-slate-800 text-xs uppercase">{fiscal.fiscal_name}</p>
                          <div className="flex gap-2 mt-1">
                             <span className="text-[8px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">{fiscal.contract_type}</span>
                             <span className="text-[9px] font-bold text-slate-400">{fiscal.contact_info}</span>
                          </div>
                        </div>
                      </div>
                      {isAdmin && (
                        <button onClick={() => handleDeleteFiscal(fiscal.id!)} className="p-2 text-slate-200 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}