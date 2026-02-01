import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  MapPin, Phone, Mail, 
  Search, Plus, GraduationCap, 
  Trash2, Edit, X, Save, UserCog, ShieldCheck,
  Building2, Zap, Droplets, Info
} from 'lucide-react';

// Tipos baseados no seu CSV e descrição do banco
interface School {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  zip_code: string | null;
  director_name: string | null;
  manager_name: string | null;
  fde_code: string | null;           // Código CIE/FDE
  edp_installation_id: string | null; // Instalação Energia
  sabesp_supply_id: string | null;    // Fornecimento Água
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

const SERVICE_TYPES = [
  'LIMPEZA', 
  'CUIDADOR', 
  'MERENDA', 
  'TELEFONE', 
  'AGUA', 
  'VIGILANTE'
];

export function Escola() {
  const [escolas, setEscolas] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');
  
  // Estados para Modais
  const [isSchoolModalOpen, setIsSchoolModalOpen] = useState(false);
  const [isFiscalModalOpen, setIsFiscalModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  
  // Estado para o formulário de escola
  const [formData, setFormData] = useState<Partial<School>>({});

  useEffect(() => {
    fetchProfile();
    fetchEscolas();
  }, []);

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      const profile = data as any;
      setUserRole(profile?.role || '');
    }
  }

  async function fetchEscolas() {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).from('schools')
        .select('*')
        .order('name');
      
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
    setFormData({});
    setIsSchoolModalOpen(true);
  }

  function handleEditSchool(school: School) {
    setEditingSchool(school);
    setFormData(school);
    setIsSchoolModalOpen(true);
  }

  async function handleDeleteSchool(id: string) {
    if (userRole !== 'regional_admin') return;
    if (!confirm("Tem certeza que deseja excluir esta escola? Todos os dados vinculados (fiscais, chamados) serão perdidos.")) return;

    try {
      const { error } = await (supabase as any).from('schools').delete().eq('id', id);
      if (error) throw error;
      fetchEscolas();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir escola. Verifique se existem registros vinculados.');
    }
  }

  async function saveSchool(e: React.FormEvent) {
    e.preventDefault();
    if (userRole !== 'regional_admin') return;
    
    try {
      if (editingSchool?.id) {
        const { error } = await (supabase as any).from('schools')
          .update(formData)
          .eq('id', editingSchool.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('schools')
          .insert([formData]);
        if (error) throw error;
      }
      setIsSchoolModalOpen(false);
      fetchEscolas();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar dados da escola.');
    }
  }

  function handleManageFiscals(school: School) {
    setEditingSchool(school);
    setIsFiscalModalOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Unidades Escolares</h1>
          <p className="text-slate-500">Gestão das escolas da rede regional.</p>
        </div>
        
        {userRole === 'regional_admin' && (
          <button 
            onClick={handleNewSchool}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-blue-100 transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Cadastrar Escola
          </button>
        )}
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Buscar escola por nome, CIE, endereço..." 
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
           <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {escolas.map((escola) => (
            <div key={escola.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
              
              <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 backdrop-blur-sm p-1 rounded-lg">
                <button 
                  onClick={() => handleManageFiscals(escola)}
                  title={userRole === 'regional_admin' ? "Gerenciar Fiscais" : "Consultar Fiscais"}
                  className="p-2 bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-600 rounded-lg transition-colors"
                >
                  <UserCog className="w-4 h-4" />
                </button>
                
                {userRole === 'regional_admin' && (
                  <>
                    <button 
                      onClick={() => handleEditSchool(escola)}
                      className="p-2 bg-slate-100 hover:bg-amber-100 text-slate-500 hover:text-amber-600 rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteSchool(escola.id)}
                      className="p-2 bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-50 rounded-xl">
                  <GraduationCap className="w-8 h-8 text-blue-600" />
                </div>
              </div>
              
              <h3 className="font-bold text-slate-900 text-lg mb-1 line-clamp-1 pr-24" title={escola.name}>{escola.name}</h3>
              <p className="text-xs text-slate-500 font-mono mb-4 flex gap-2">
                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">CIE: {escola.fde_code || 'N/A'}</span>
              </p>
              
              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <span className="line-clamp-2 text-xs" title={escola.address || ''}>{escola.address || 'Endereço não cadastrado'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-xs">{escola.phone || '(00) 0000-0000'}</span>
                </div>
                 <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-xs truncate">{escola.email || 'sem@email.com'}</span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-50 grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-xs text-slate-500" title="Instalação EDP">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span className="truncate">{escola.edp_installation_id || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500" title="Fornecimento SABESP">
                    <Droplets className="w-4 h-4 text-blue-500" />
                    <span className="truncate">{escola.sabesp_supply_id || 'N/A'}</span>
                </div>
              </div>
            </div>
          ))}
          
          {userRole === 'regional_admin' && (
            <button 
              onClick={handleNewSchool}
              className="border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600 transition-all gap-3 h-full min-h-[250px]"
            >
              <div className="p-4 bg-slate-50 rounded-full group-hover:bg-white transition-colors">
                <Plus className="w-6 h-6" />
              </div>
              <span className="font-semibold text-sm">Cadastrar Nova Unidade</span>
            </button>
          )}
        </div>
      )}

      {isSchoolModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-hidden">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><Building2 size={20}/></div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    {editingSchool ? 'Editar Escola' : 'Nova Escola'}
                  </h2>
                  <p className="text-xs text-slate-500">Preencha os dados completos da unidade</p>
                </div>
              </div>
              <button onClick={() => setIsSchoolModalOpen(false)} className="hover:bg-slate-200 p-2 rounded-full transition-colors"><X size={20} className="text-slate-500" /></button>
            </div>
            
            <form onSubmit={saveSchool} className="p-6 overflow-y-auto custom-scrollbar">
              <div className="space-y-6">
                <section>
                  <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    Informações Básicas
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Nome Oficial da Escola</label>
                      <input required placeholder="Ex: EE PROFESSOR JOÃO..." className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Código CIE (FDE)</label>
                      <input className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.fde_code || ''} onChange={e => setFormData({...formData, fde_code: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Telefone da Escola</label>
                      <input className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Email Institucional</label>
                      <input type="email" className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} />
                    </div>
                  </div>
                </section>

                <section>
                   <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    Localização
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Endereço Completo</label>
                      <input className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">CEP</label>
                      <input className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.zip_code || ''} onChange={e => setFormData({...formData, zip_code: e.target.value})} />
                    </div>
                  </div>
                </section>

                <section>
                   <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    Dados Técnicos
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Instalação EDP (Energia)</label>
                      <input className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.edp_installation_id || ''} onChange={e => setFormData({...formData, edp_installation_id: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Fornecimento SABESP (Água)</label>
                      <input className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.sabesp_supply_id || ''} onChange={e => setFormData({...formData, sabesp_supply_id: e.target.value})} />
                    </div>
                  </div>
                </section>

                <section>
                   <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Gestão e Pessoas
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Nome do Diretor(a)</label>
                      <input className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.director_name || ''} onChange={e => setFormData({...formData, director_name: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Gerente de Organização</label>
                      <input className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.manager_name || ''} onChange={e => setFormData({...formData, manager_name: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Qtd. Alunos</label>
                      <input type="number" className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.student_count || 0} onChange={e => setFormData({...formData, student_count: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Qtd. Professores</label>
                      <input type="number" className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.teacher_count || 0} onChange={e => setFormData({...formData, teacher_count: Number(e.target.value)})} />
                    </div>
                  </div>
                </section>

              </div>

              <div className="pt-8 flex justify-end gap-3 sticky bottom-0 bg-white border-t border-slate-100 mt-6">
                <button type="button" onClick={() => setIsSchoolModalOpen(false)} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors">Cancelar</button>
                <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2 font-bold shadow-lg shadow-blue-200 transition-all active:scale-95">
                  <Save size={18} /> Salvar Dados
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
    const { data } = await (supabase as any).from('school_fiscals') 
      .select('*')
      .eq('school_id', school.id)
      .order('created_at', { ascending: false });
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
    } catch (error) {
        console.error(error);
    }
  }

  const isAdmin = userRole === 'regional_admin';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="text-blue-600"/> {isAdmin ? 'Gestão de Fiscais' : 'Consulta de Fiscais'}
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-1 line-clamp-1">{school.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="text-slate-500" size={20}/></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
          {isAdmin ? (
            <div className="bg-blue-50/50 p-4 rounded-xl space-y-3 border border-blue-100 shadow-sm">
              <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Novo Cadastro de Fiscal</h3>
              <div className="grid grid-cols-1 gap-3">
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Tipo de Contrato</label>
                    <select 
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                      value={newFiscal.contract_type}
                      onChange={e => setNewFiscal({...newFiscal, contract_type: e.target.value as any})}
                    >
                      {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Nome do Fiscal</label>
                    <input 
                      placeholder="Nome completo do responsável" 
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      value={newFiscal.fiscal_name || ''}
                      onChange={e => setNewFiscal({...newFiscal, fiscal_name: e.target.value})}
                    />
                </div>

                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Contato (Tel/Email)</label>
                    <input 
                      placeholder="(11) 99999-9999 / email@empresa.com" 
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      value={newFiscal.contact_info || ''}
                      onChange={e => setNewFiscal({...newFiscal, contact_info: e.target.value})}
                    />
                </div>
              </div>
              <button 
                onClick={handleAddFiscal}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-all active:scale-95 flex justify-center items-center gap-2"
              >
                <Plus size={16} /> Adicionar Fiscal
              </button>
            </div>
          ) : (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-start gap-3">
              <Info className="text-blue-500 shrink-0 mt-0.5" size={16} />
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                A gestão dos fiscais é realizada exclusivamente pela <strong>Administração Regional</strong>. Em caso de dúvidas ou alterações necessárias, entre em contato com o responsável do setor.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-2">
                Fiscais em Exercício ({fiscals.length})
            </h3>
            
            {loading ? (
                <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
            ) : (
              fiscals.length === 0 ? <p className="text-center text-slate-400 text-sm py-4 italic">Nenhum fiscal vinculado a esta unidade.</p> :
              <div className="grid gap-3">
                  {fiscals.map(fiscal => (
                    <div key={fiscal.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:shadow-md transition-shadow group">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shadow-sm
                            ${fiscal.contract_type === 'LIMPEZA' ? 'bg-blue-100 text-blue-600' : 
                              fiscal.contract_type === 'MERENDA' ? 'bg-orange-100 text-orange-600' :
                              fiscal.contract_type === 'VIGILANTE' ? 'bg-slate-800 text-white' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                          {fiscal.fiscal_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{fiscal.fiscal_name}</p>
                          <div className="flex flex-col">
                             <span className="text-[10px] font-bold uppercase text-slate-400">{fiscal.contract_type}</span>
                             <span className="text-xs text-slate-500">{fiscal.contact_info}</span>
                          </div>
                        </div>
                      </div>
                      
                      {isAdmin && (
                        <button onClick={() => handleDeleteFiscal(fiscal.id!)} className="p-2 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={16} />
                        </button>
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