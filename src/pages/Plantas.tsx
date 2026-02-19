import React, { useState, useEffect } from 'react';
import { 
  Map, Plus, ExternalLink, Building2, 
  Loader2, X, Trash2, Edit2, Search, AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface School {
  id: string;
  name: string;
}

interface Plan {
  id: string;
  school_id: string;
  plan_url: string;
  description: string;
  created_at: string;
  schools?: { name: string };
}

export default function Plantas() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // User Profile states
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Delete confirm state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    school_id: '',
    plan_url: '',
    description: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Identificar o usuário atual e seu papel
      const { data: { session } } = await supabase.auth.getSession();
      
      let role = null;
      let schoolId = null;

      if (session) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('role, school_id')
          .eq('id', session.user.id)
          .single();
          
        if (profile) {
          role = profile.role;
          schoolId = profile.school_id;
          setUserRole(role);
          setUserSchoolId(schoolId);
        }
      }

      // 2. Buscar escolas para o select (com filtro de role)
      let schoolsQuery = supabase.from('schools').select('id, name').order('name');
      
      if (role === 'school_manager' && schoolId) {
        schoolsQuery = schoolsQuery.eq('id', schoolId);
      }
      
      const { data: schoolsData, error: schoolsError } = await schoolsQuery;
      if (schoolsError) throw schoolsError;
      setSchools(schoolsData || []);

      // 3. Buscar plantas prediais (com filtro de role)
      let plansQuery = supabase.from('school_plans').select('*, schools(name)').order('created_at', { ascending: false });
      
      if (role === 'school_manager' && schoolId) {
        plansQuery = plansQuery.eq('school_id', schoolId);
      }

      const { data: plansData, error: plansError } = await plansQuery;
      if (plansError) throw plansError;
      setPlans(plansData || []);
      
    } catch (err: any) {
      console.error('Erro ao buscar dados:', err);
      setError('Não foi possível carregar as plantas prediais.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (plan?: Plan) => {
    setError(null);
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        school_id: plan.school_id,
        plan_url: plan.plan_url,
        description: plan.description
      });
    } else {
      setEditingPlan(null);
      setFormData({
        // Se for school_manager, já preenche o school_id com o ID da escola dele
        school_id: (userRole === 'school_manager' && userSchoolId) ? userSchoolId : '',
        plan_url: '',
        description: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPlan(null);
    setFormData({ school_id: '', plan_url: '', description: '' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      if (editingPlan) {
        const { error } = await (supabase as any)
          .from('school_plans')
          .update({
            school_id: formData.school_id,
            plan_url: formData.plan_url,
            description: formData.description
          })
          .eq('id', editingPlan.id);

        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('school_plans')
          .insert([{
            school_id: formData.school_id,
            plan_url: formData.plan_url,
            description: formData.description
          }]);

        if (error) throw error;
      }

      await fetchData();
      handleCloseModal();
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      setError('Ocorreu um erro ao salvar a planta. Verifique os dados e tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from('school_plans')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setPlans(plans.filter(p => p.id !== id));
      setConfirmDeleteId(null);
    } catch (err: any) {
      console.error('Erro ao deletar:', err);
      setError('Não foi possível excluir a planta predial.');
    }
  };

  const filteredPlans = plans.filter(plan => 
    plan.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (plan.schools?.name && plan.schools.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Map className="w-6 h-6 text-blue-600" />
            Plantas Prediais
          </h1>
          <p className="text-gray-500 mt-1">
            Gerencie as plantas arquitetônicas e mapas das escolas
          </p>
        </div>
        {userRole !== 'school_manager' && (
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span>Nova Planta</span>
          </button>
        )}
      </div>

      {error && !isModalOpen && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
        <Search className="w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por escola ou descrição..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-transparent border-none focus:outline-none text-gray-700 placeholder-gray-400"
        />
      </div>

      {/* Grid of Plans */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
          <p>Carregando plantas prediais...</p>
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200 border-dashed">
          <Map className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">Nenhuma planta encontrada</h3>
          <p className="text-gray-500 mt-1">
            {searchTerm ? 'Tente buscar com outros termos.' : 'Adicione a primeira planta predial clicando no botão acima.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPlans.map((plan) => (
            <div key={plan.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow group flex flex-col">
              <div className="p-5 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-blue-50 text-blue-700 p-2 rounded-lg">
                    <Building2 className="w-5 h-5" />
                  </div>
                  {userRole !== 'school_manager' && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleOpenModal(plan)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setConfirmDeleteId(plan.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                
                <h3 className="font-semibold text-gray-900 text-lg mb-1 truncate" title={plan.schools?.name}>
                  {plan.schools?.name || 'Escola não informada'}
                </h3>
                <p className="text-gray-500 text-sm line-clamp-2 mb-4">
                  {plan.description}
                </p>
                
                {confirmDeleteId === plan.id && (
                  <div className="bg-red-50 p-3 rounded-lg border border-red-100 mb-4">
                    <p className="text-sm text-red-800 mb-2 font-medium">Confirmar exclusão?</p>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleDelete(plan.id)}
                        className="flex-1 bg-red-600 text-white text-xs py-1.5 rounded hover:bg-red-700 transition-colors"
                      >
                        Sim, excluir
                      </button>
                      <button 
                        onClick={() => setConfirmDeleteId(null)}
                        className="flex-1 bg-white text-gray-700 text-xs py-1.5 rounded border border-gray-300 hover:bg-gray-50 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="border-t border-gray-100 bg-gray-50 p-4">
                <a 
                  href={plan.plan_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-white border border-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  Visualizar Planta
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingPlan ? 'Editar Planta' : 'Nova Planta Predial'}
              </h2>
              <button 
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm border border-red-200">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Escola
                </label>
                <select
                  required
                  value={formData.school_id}
                  onChange={(e) => setFormData({...formData, school_id: e.target.value})}
                  disabled={userRole === 'school_manager'}
                  className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${userRole === 'school_manager' ? 'bg-gray-100 cursor-not-allowed opacity-80' : 'bg-white'}`}
                >
                  <option value="" disabled>Selecione uma escola</option>
                  {schools.map(school => (
                    <option key={school.id} value={school.id}>{school.name}</option>
                  ))}
                </select>
                {userRole === 'school_manager' && (
                  <p className="text-xs text-amber-600 mt-1">
                    Você só pode adicionar plantas para a sua própria escola.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Descrição / Título
                </label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Planta do Térreo, Mapa de Evacuação..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  URL da Planta (Link)
                </label>
                <input
                  required
                  type="url"
                  placeholder="https://..."
                  value={formData.plan_url}
                  onChange={(e) => setFormData({...formData, plan_url: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500">Insira o link para o PDF, imagem ou visualizador da planta.</p>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSaving ? 'Salvando...' : 'Salvar Planta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}