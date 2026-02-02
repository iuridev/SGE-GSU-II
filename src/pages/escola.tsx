import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  MapPin, Phone, Mail, 
  Search, Plus, GraduationCap, 
  Trash2, Edit, X, Save, UserCog, ShieldCheck,
  Building2, Zap, Droplets, Info, Hash,
  Calendar, Layers, Clock, DoorOpen, Compass, ArrowUpCircle,
  Loader2
} from 'lucide-react';

// Tipos atualizados com CIE, SGI e FDE
interface School {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  zip_code: string | null;
  director_name: string | null;
  manager_name: string | null;
  cie_code: string | null;           // Novo campo específico para CIE
  fde_code: string | null;           // Agora usado especificamente para FDE
  sgi_code: string | null;           // SGI
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

export function Escola() {
  const [escolas, setEscolas] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isSchoolModalOpen, setIsSchoolModalOpen] = useState(false);
  const [isFiscalModalOpen, setIsFiscalModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  
  const [formData, setFormData] = useState<Partial<School>>({
    teaching_types: [],
    periods: [],
    has_elevator: false
  });

  useEffect(() => {
    fetchProfile();
    fetchEscolas();
  }, []);

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      setUserRole((data as any)?.role || '');
    }
  }

  async function fetchEscolas() {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).from('schools').select('*').order('name');
      if (error) throw error;
      setEscolas(data || []);
    } catch (error) {
      console.error('Erro ao buscar escolas:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleNewSchool() {
    setEditingSchool(null);
    setFormData({
      teaching_types: [],
      periods: [],
      has_elevator: false
    });
    setIsSchoolModalOpen(true);
  }

  function handleEditSchool(school: School) {
    setEditingSchool(school);
    setFormData({
      ...school,
      teaching_types: school.teaching_types || [],
      periods: school.periods || []
    });
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
    if (userRole !== 'regional_admin') return;
    
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
    const current = (formData[field] as string[]) || [];
    const updated = current.includes(value) 
      ? current.filter(item => item !== value)
      : [...current, value];
    setFormData({ ...formData, [field]: updated });
  };

  const filteredEscolas = escolas.filter(e => 
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.cie_code?.includes(searchTerm) ||
    e.fde_code?.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Unidades Escolares</h1>
          <p className="text-slate-500 font-medium">Gestão e infraestrutura da rede regional.</p>
        </div>
        
        {userRole === 'regional_admin' && (
          <button 
            onClick={handleNewSchool}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-xl shadow-indigo-100 transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Cadastrar Escola
          </button>
        )}
      </div>

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

      {loading ? (
        <div className="flex items-center justify-center h-64">
           <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredEscolas.map((escola) => (
            <div key={escola.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
              
              <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button onClick={() => { setEditingSchool(escola); setIsFiscalModalOpen(true); }} className="p-2.5 bg-white shadow-lg text-slate-500 hover:text-indigo-600 rounded-xl transition-all border border-slate-100"><UserCog className="w-4 h-4" /></button>
                {userRole === 'regional_admin' && (
                  <>
                    <button onClick={() => handleEditSchool(escola)} className="p-2.5 bg-white shadow-lg text-slate-500 hover:text-amber-600 rounded-xl transition-all border border-slate-100"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => handleDeleteSchool(escola.id)} className="p-2.5 bg-white shadow-lg text-slate-500 hover:text-red-600 rounded-xl transition-all border border-slate-100"><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </div>

              <div className="flex items-start justify-between mb-6">
                <div className="p-4 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
                  <GraduationCap className="w-8 h-8" />
                </div>
              </div>
              
              <h3 className="font-black text-slate-900 text-xl mb-1 line-clamp-1 pr-10 uppercase tracking-tight" title={escola.name}>{escola.name}</h3>
              <div className="flex flex-wrap gap-1.5 mb-6">
                <span className="bg-slate-100 px-2 py-0.5 rounded-lg text-[9px] font-black text-slate-500 uppercase tracking-widest border border-slate-200">CIE: {escola.cie_code || '---'}</span>
                <span className="bg-blue-50 px-2 py-0.5 rounded-lg text-[9px] font-black text-blue-600 uppercase tracking-widest border border-blue-100">SGI: {escola.sgi_code || '---'}</span>
                <span className="bg-indigo-50 px-2 py-0.5 rounded-lg text-[9px] font-black text-indigo-600 uppercase tracking-widest border border-indigo-100">FDE: {escola.fde_code || '---'}</span>
              </div>
              
              <div className="space-y-4 text-sm text-slate-600 mb-6">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
                  <span className="font-medium text-xs leading-relaxed">{escola.address || 'Endereço não cadastrado'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-indigo-400 shrink-0" />
                  <span className="font-bold text-xs">{escola.phone || '(00) 0000-0000'}</span>
                </div>
                 <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-indigo-400 shrink-0" />
                  <span className="font-medium text-xs truncate">{escola.email || 'sem@email.com'}</span>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-50 grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400" title="Instalação EDP">
                    <div className="p-1.5 bg-amber-50 rounded-lg text-amber-500"><Zap size={14} /></div>
                    <span className="truncate">{escola.edp_installation_id || '---'}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400" title="Fornecimento SABESP">
                    <div className="p-1.5 bg-blue-50 rounded-lg text-blue-500"><Droplets size={14} /></div>
                    <span className="truncate">{escola.sabesp_supply_id || '---'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isSchoolModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-hidden">
          <div className="bg-white rounded-[3rem] w-full max-w-5xl max-h-[95vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden border border-white">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-600 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl shadow-indigo-100"><Building2 size={28}/></div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                    {editingSchool ? 'Ficha da Unidade' : 'Nova Unidade'}
                  </h2>
                  <p className="text-xs text-indigo-600 font-black uppercase tracking-[0.2em] mt-1">SGE-GSU Intelligence System</p>
                </div>
              </div>
              <button onClick={() => setIsSchoolModalOpen(false)} className="hover:bg-white p-3 rounded-full transition-all text-slate-400 shadow-sm border border-transparent hover:border-slate-100"><X size={24} /></button>
            </div>
            
            <form onSubmit={saveSchool} className="p-10 overflow-y-auto custom-scrollbar bg-white">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                
                {/* LADO ESQUERDO: IDENTIFICAÇÃO E CONTATO */}
                <div className="space-y-10">
                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                      <div className="w-8 h-px bg-slate-100"></div> Identificação Primária
                    </h3>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nome da Unidade Escolar</label>
                        <input required placeholder="Ex: EE PROFESSOR JOÃO DA SILVA" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Hash size={12}/> CIE</label>
                          <input placeholder="000000" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono font-bold focus:border-indigo-500 outline-none transition-all" value={formData.cie_code || ''} onChange={e => setFormData({...formData, cie_code: e.target.value})} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Hash size={12}/> SGI</label>
                          <input placeholder="0000" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono font-bold focus:border-indigo-500 outline-none transition-all" value={formData.sgi_code || ''} onChange={e => setFormData({...formData, sgi_code: e.target.value})} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Hash size={12}/> FDE</label>
                          <input placeholder="0000" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono font-bold focus:border-indigo-500 outline-none transition-all" value={formData.fde_code || ''} onChange={e => setFormData({...formData, fde_code: e.target.value})} />
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                      <div className="w-8 h-px bg-slate-100"></div> Localização e Contato
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Endereço Completo</label>
                        <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">CEP</label>
                        <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" value={formData.zip_code || ''} onChange={e => setFormData({...formData, zip_code: e.target.value})} />
                      </div>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">E-mail Institucional</label>
                        <input type="email" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Telefone</label>
                        <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                      <div className="w-8 h-px bg-slate-100"></div> Dados Administrativos
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Instalação EDP</label>
                        <input className="w-full p-4 bg-amber-50/30 border-2 border-amber-100/50 rounded-2xl font-bold text-amber-700 focus:border-amber-500 outline-none transition-all" value={formData.edp_installation_id || ''} onChange={e => setFormData({...formData, edp_installation_id: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Fornecimento SABESP</label>
                        <input className="w-full p-4 bg-blue-50/30 border-2 border-blue-100/50 rounded-2xl font-bold text-blue-700 focus:border-blue-500 outline-none transition-all" value={formData.sabesp_supply_id || ''} onChange={e => setFormData({...formData, sabesp_supply_id: e.target.value})} />
                      </div>
                    </div>
                  </section>
                </div>

                {/* LADO DIREITO: INFRAESTRUTURA */}
                <div className="space-y-10">
                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                      <div className="w-8 h-px bg-slate-100"></div> Infraestrutura do Prédio
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Calendar size={12}/> Ano do Prédio</label>
                        <input type="number" placeholder="Ex: 1985" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" value={formData.building_year || ''} onChange={e => setFormData({...formData, building_year: Number(e.target.value)})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Layers size={12}/> Número Setor</label>
                        <input placeholder="Setor A" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" value={formData.sector_number || ''} onChange={e => setFormData({...formData, sector_number: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><DoorOpen size={12}/> Qtd. de Salas</label>
                        <input type="number" placeholder="0" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" value={formData.room_count || ''} onChange={e => setFormData({...formData, room_count: Number(e.target.value)})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Hash size={12}/> Inscrição Imobiliária</label>
                        <input placeholder="Matrícula" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" value={formData.property_registration || ''} onChange={e => setFormData({...formData, property_registration: e.target.value})} />
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl group transition-all hover:bg-white hover:border-indigo-100">
                      <div className={`p-3 rounded-xl transition-all ${formData.has_elevator ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white text-slate-300'}`}>
                        <ArrowUpCircle size={20} />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-black text-slate-500 uppercase leading-none">Acessibilidade</p>
                        <p className="text-xs font-bold text-slate-400 mt-1">A unidade possui elevador funcional?</p>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setFormData({...formData, has_elevator: !formData.has_elevator})}
                        className={`w-14 h-8 rounded-full relative transition-all ${formData.has_elevator ? 'bg-indigo-600' : 'bg-slate-200'}`}
                      >
                        <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${formData.has_elevator ? 'left-7' : 'left-1'}`}></div>
                      </button>
                    </div>
                  </section>

                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                      <div className="w-8 h-px bg-slate-100"></div> Oferta de Ensino
                    </h3>
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5">Tipos de Ensino</label>
                        <div className="flex flex-wrap gap-2">
                          {TEACHING_OPTIONS.map(opt => (
                            <button key={opt} type="button" onClick={() => toggleArrayItem('teaching_types', opt)} className={`px-4 py-2.5 rounded-xl text-[11px] font-black transition-all border-2 ${formData.teaching_types?.includes(opt) ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-200'}`}>
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Clock size={12}/> Período de Atendimento</label>
                        <div className="flex flex-wrap gap-2">
                          {PERIOD_OPTIONS.map(opt => (
                            <button key={opt} type="button" onClick={() => toggleArrayItem('periods', opt)} className={`px-4 py-2.5 rounded-xl text-[11px] font-black transition-all border-2 ${formData.periods?.includes(opt) ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white border-slate-100 text-slate-400 hover:border-blue-200'}`}>
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                      <div className="w-8 h-px bg-slate-100"></div> Geolocalização
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Compass size={12}/> Latitude</label>
                        <input type="number" step="any" placeholder="-23.0000" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono font-bold focus:border-indigo-500 outline-none transition-all" value={formData.latitude || ''} onChange={e => setFormData({...formData, latitude: Number(e.target.value)})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-1.5"><Compass size={12}/> Longitude</label>
                        <input type="number" step="any" placeholder="-46.0000" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono font-bold focus:border-indigo-500 outline-none transition-all" value={formData.longitude || ''} onChange={e => setFormData({...formData, longitude: Number(e.target.value)})} />
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              <div className="pt-12 flex justify-end gap-4 sticky bottom-0 bg-white border-t border-slate-100 mt-12 pb-4">
                <button type="button" onClick={() => setIsSchoolModalOpen(false)} className="px-8 py-4 text-slate-400 font-black hover:text-slate-600 transition-all uppercase tracking-widest text-xs">Cancelar</button>
                <button type="submit" className="px-14 py-4 bg-indigo-600 text-white rounded-3xl font-black shadow-2xl shadow-indigo-200 hover:bg-indigo-700 flex items-center gap-3 active:scale-95 transition-all uppercase tracking-widest text-xs">
                  <Save size={20} /> Finalizar Cadastro
                </button>
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

function FiscalManagerModal({ school, userRole, onClose }: { school: School, userRole: string, onClose: () => void }) {
  const [fiscals, setFiscals] = useState<Fiscal[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFiscal, setNewFiscal] = useState<Partial<Fiscal>>({ contract_type: 'LIMPEZA' });

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
    if (userRole !== 'regional_admin') return;
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
    if (userRole !== 'regional_admin') return;
    if(!confirm('Remover este fiscal?')) return;
    try {
        await (supabase as any).from('school_fiscals').delete().eq('id', id);
        fetchFiscals();
    } catch (error) { console.error(error); }
  }

  const isAdmin = userRole === 'regional_admin';

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
          {isAdmin && (
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