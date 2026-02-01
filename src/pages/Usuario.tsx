import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js'; 
import { supabase } from '../lib/supabase';
import { 
  Search, UserPlus, X, 
  Trash2, Edit, Save, Building2, 
  Loader2,
  AlertCircle
} from 'lucide-react';

interface Profile {
  id: string;
  full_name: string;
  role: 'regional_admin' | 'school_manager';
  school_id: string | null;
  created_at: string;
}

interface School {
  id: string;
  name: string;
}

export function Usuario() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'school_manager' as 'regional_admin' | 'school_manager',
    school_id: ''
  });

  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: profilesData, error: profilesError } = await (supabase as any)
        .from('profiles')
        .select('*')
        .order('full_name');
      
      if (profilesError) throw profilesError;

      const { data: schoolsData, error: schoolsError } = await (supabase as any)
        .from('schools')
        .select('id, name')
        .order('name');

      if (schoolsError) throw schoolsError;

      setUsers(profilesData || []);
      setSchools(schoolsData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  function validateForm() {
    const newErrors: string[] = [];

    if (formData.full_name.trim().split(' ').length < 2) {
      newErrors.push("Informe o nome completo (nome e sobrenome).");
    }

    if (!editingUser) {
      if (!formData.email.includes('@')) {
        newErrors.push("Informe um e-mail de acesso válido.");
      }
      if (formData.password.length < 6) {
        newErrors.push("A senha inicial deve ter pelo menos 6 caracteres.");
      }
    }

    if (formData.role === 'school_manager' && !formData.school_id) {
      newErrors.push("Gestores escolares obrigatoriamente devem estar vinculados a uma unidade.");
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  }

  function handleOpenModal(user: Profile | null = null) {
    setErrors([]);
    if (user) {
      setEditingUser(user);
      setFormData({
        full_name: user.full_name,
        email: '', 
        password: '', 
        role: user.role,
        school_id: user.school_id || ''
      });
    } else {
      setEditingUser(null);
      setFormData({
        full_name: '',
        email: '',
        password: '',
        role: 'school_manager',
        school_id: ''
      });
    }
    setIsModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    setSaveLoading(true);
    setErrors([]);

    try {
      if (editingUser) {
        const { error } = await (supabase as any)
          .from('profiles')
          .update({
            full_name: formData.full_name,
            role: formData.role,
            school_id: formData.role === 'school_manager' ? formData.school_id : null
          })
          .eq('id', editingUser.id);

        if (error) throw error;
      } else {
        const tempSupabase = createClient(
          (supabase as any).supabaseUrl,
          (supabase as any).supabaseKey,
          { auth: { persistSession: false } }
        );

        const { data: authData, error: authError } = await tempSupabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.full_name,
              role: formData.role,
            }
          }
        });

        if (authError) throw authError;

        if (authData.user) {
          const { error: profileError } = await (supabase as any)
            .from('profiles')
            .upsert({
              id: authData.user.id,
              full_name: formData.full_name,
              role: formData.role,
              school_id: formData.role === 'school_manager' ? formData.school_id : null,
              created_at: new Date().toISOString()
            });
          
          if (profileError) throw profileError;
        }
      }

      setIsModalOpen(false);
      fetchData();
      
      if (!editingUser) {
        alert("Conta criada com sucesso! O administrador permanece logado.");
      }

    } catch (error: any) {
      console.error('Erro detalhado:', error);
      setErrors([error.message || "Erro ao processar solicitação."]);
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este acesso permanentemente?')) return;

    try {
      const { error } = await (supabase as any).from('profiles').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error(error);
      alert('Erro ao remover perfil do utilizador.');
    }
  }

  const filteredUsers = users.filter(u => 
    u.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestão de Utilizadores</h1>
          <p className="text-slate-500">Administre permissões regionais e escolares através do código.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-blue-100 transition-all active:scale-95"
        >
          <UserPlus className="w-5 h-5" />
          Novo Utilizador
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Filtrar por nome..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">Nome Completo</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">Cargo / Nível</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px]">Unidade</th>
                <th className="px-6 py-4 font-bold text-slate-500 uppercase text-[10px] text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <Loader2 className="animate-spin inline mr-2 text-blue-600" /> Carregando base...
                  </td>
                </tr>
              ) : filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                        user.role === 'regional_admin' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
                      }`}>
                        {user.full_name.substring(0,2).toUpperCase()}
                      </div>
                      <div className="font-bold text-slate-900">{user.full_name}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border ${
                      user.role === 'regional_admin' 
                        ? 'bg-blue-50 text-blue-700 border-blue-100' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                    }`}>
                      {user.role === 'regional_admin' ? 'Admin Regional' : 'Gestor Unidade'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {user.role === 'school_manager' ? (
                      <div className="flex items-center gap-2">
                        <Building2 size={14} />
                        <span className="text-xs">{schools.find(s => s.id === user.school_id)?.name || 'Sem vínculo'}</span>
                      </div>
                    ) : 'Gestão Global'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleOpenModal(user)} className="p-2 hover:bg-amber-50 text-slate-400 hover:text-amber-600 rounded-lg"><Edit size={16} /></button>
                      <button onClick={() => handleDelete(user.id)} className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><UserPlus size={20}/></div>
                <h2 className="text-lg font-bold text-slate-800">{editingUser ? 'Editar Perfil' : 'Novo Cadastro'}</h2>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full"><X size={20} className="text-slate-500" /></button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 p-3 rounded-xl space-y-1">
                  {errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 text-red-700 text-[11px] font-bold"><AlertCircle size={14} className="shrink-0" />{err}</div>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome Completo</label>
                  <input required className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} />
                </div>

                {!editingUser && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">E-mail</label>
                      <input required type="email" className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Senha</label>
                      <input required type="password" placeholder="Mín. 6 caracteres" className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nível de Acesso</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setFormData({...formData, role: 'school_manager'})} className={`p-3 border rounded-xl text-sm font-bold ${formData.role === 'school_manager' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white text-slate-500'}`}>Gestor</button>
                    <button type="button" onClick={() => setFormData({...formData, role: 'regional_admin'})} className={`p-3 border rounded-xl text-sm font-bold ${formData.role === 'regional_admin' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white text-slate-500'}`}>Regional</button>
                  </div>
                </div>

                {formData.role === 'school_manager' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Unidade Vinculada</label>
                    <select required className="w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={formData.school_id} onChange={e => setFormData({...formData, school_id: e.target.value})}>
                      <option value="">Selecione...</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancelar</button>
                <button type="submit" disabled={saveLoading} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold shadow-lg flex items-center gap-2 disabled:opacity-50">
                  {saveLoading ? <Loader2 className="animate-spin" size={18} /> : <><Save size={18} /> {editingUser ? 'Salvar' : 'Criar'}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}