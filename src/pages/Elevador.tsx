import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Building2, 
  ArrowUpCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Loader2, 
  Settings2,
  Info,
  Power,
  PowerOff,
  Wrench,
  MapPin
} from 'lucide-react';

interface SchoolElevator {
  id: string;
  name: string;
  address: string | null;
  has_elevator: boolean;
  is_elevator_operational: boolean;
  last_elevator_maintenance: string | null;
}

export function Elevador() {
  const [schools, setSchools] = useState<SchoolElevator[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'operational' | 'stopped'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        setUserRole(profile?.role || '');
      }
      await fetchSchools();
    } catch (error) {
      console.error("Erro ao carregar dados iniciais:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSchools() {
    try {
      const { data, error } = await (supabase as any)
        .from('schools')
        .select('id, name, address, has_elevator, is_elevator_operational, last_elevator_maintenance')
        .eq('has_elevator', true)
        .order('name');
      
      if (error) throw error;
      setSchools(data || []);
    } catch (err) {
      console.error("Erro ao buscar escolas com elevador:", err);
    }
  }

  const isAdmin = userRole === 'regional_admin';

  const filteredSchools = useMemo(() => {
    return schools.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = 
        filter === 'all' ? true :
        filter === 'operational' ? s.is_elevator_operational :
        !s.is_elevator_operational;
      return matchesSearch && matchesFilter;
    });
  }, [schools, searchTerm, filter]);

  const stats = useMemo(() => {
    const total = schools.length;
    const operational = schools.filter(s => s.is_elevator_operational).length;
    const stopped = total - operational;
    return { total, operational, stopped };
  }, [schools]);

  async function toggleElevatorStatus(school: SchoolElevator) {
    if (!isAdmin) return;
    setActionLoading(school.id);
    try {
      const newStatus = !school.is_elevator_operational;
      const { error } = await (supabase as any)
        .from('schools')
        .update({ 
          is_elevator_operational: newStatus,
          last_elevator_maintenance: new Date().toISOString() 
        })
        .eq('id', school.id);

      if (error) throw error;
      
      setSchools(prev => prev.map(s => 
        s.id === school.id ? { ...s, is_elevator_operational: newStatus, last_elevator_maintenance: new Date().toISOString() } : s
      ));
    } catch (error: any) {
      alert("Erro ao atualizar o estado: " + error.message);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
        <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Mapeando Elevadores da Rede...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-32 bg-[#f8fafc] min-h-screen">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-2xl shadow-indigo-100">
            <ArrowUpCircle size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Gestão de Elevadores</h1>
            <p className="text-slate-500 font-medium mt-1 uppercase text-xs tracking-widest italic">Monitoramento de Acessibilidade Regional</p>
          </div>
        </div>

        <div className="flex gap-2 p-2 bg-slate-100 rounded-2xl border border-slate-200">
          <button 
            onClick={() => setFilter('all')}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Todos
          </button>
          <button 
            onClick={() => setFilter('operational')}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'operational' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Operantes
          </button>
          <button 
            onClick={() => setFilter('stopped')}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'stopped' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Parados
          </button>
        </div>
      </div>

      {/* Indicadores de Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl flex items-center gap-6 group hover:border-indigo-200 transition-all">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm border border-indigo-100">
            <Building2 size={32} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Unidades com Elevador</p>
            <h3 className="text-3xl font-black text-slate-800">{stats.total}</h3>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl flex items-center gap-6 group hover:border-emerald-200 transition-all">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm border border-emerald-100">
            <CheckCircle2 size={32} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Estado Operante</p>
            <h3 className="text-3xl font-black text-emerald-600">{stats.operational}</h3>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl flex items-center gap-6 group hover:border-red-200 transition-all">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm border border-red-100">
            <AlertTriangle size={32} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Em Manutenção / Parados</p>
            <h3 className="text-3xl font-black text-red-600">{stats.stopped}</h3>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Filtrar por unidade escolar ou endereço..." 
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700 outline-none transition-all"
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {filteredSchools.length === 0 ? (
          <div className="col-span-full py-32 bg-white rounded-[4rem] border-2 border-dashed border-slate-100 text-center flex flex-col items-center justify-center">
            <Wrench size={48} className="text-slate-100 mb-4"/>
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Nenhuma escola encontrada com estes filtros</h3>
          </div>
        ) : (
          filteredSchools.map((school) => (
            <div key={school.id} className={`bg-white p-8 rounded-[3.5rem] border-2 transition-all flex flex-col justify-between relative overflow-hidden group shadow-xl ${school.is_elevator_operational ? 'border-slate-50 hover:border-emerald-300' : 'border-red-100 hover:border-red-400 shadow-red-50'}`}>
              
              <div className="flex items-start justify-between mb-8">
                <div className={`p-4 rounded-2xl shadow-lg transition-all ${school.is_elevator_operational ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                  <ArrowUpCircle size={32} className={school.is_elevator_operational ? "" : "opacity-40"} />
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estado Atual</p>
                  <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${school.is_elevator_operational ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700 animate-pulse'}`}>
                    {school.is_elevator_operational ? 'Operante' : 'Parado'}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight leading-tight group-hover:text-indigo-600 transition-colors line-clamp-2">{school.name}</h3>
                <div className="flex items-center gap-2 mt-4 text-slate-400">
                  <MapPin size={14} className="shrink-0"/>
                  <p className="text-[11px] font-bold uppercase truncate">{school.address || 'Endereço não registrado'}</p>
                </div>
                {school.last_elevator_maintenance && (
                   <div className="mt-4 p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3 shadow-inner">
                      <Settings2 size={14} className="text-indigo-400"/>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Atualizado em: {new Date(school.last_elevator_maintenance).toLocaleDateString('pt-BR')}</p>
                   </div>
                )}
              </div>

              <div className="mt-8 pt-8 border-t border-slate-50">
                {isAdmin ? (
                  <button 
                    onClick={() => toggleElevatorStatus(school)}
                    disabled={actionLoading === school.id}
                    className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg transition-all active:scale-95 disabled:opacity-50 ${school.is_elevator_operational ? 'bg-slate-900 text-white hover:bg-red-600' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                  >
                    {actionLoading === school.id ? (
                      <Loader2 className="animate-spin" size={18}/>
                    ) : school.is_elevator_operational ? (
                      <><PowerOff size={18}/> Marcar como Parado</>
                    ) : (
                      <><Power size={18}/> Marcar como Operante</>
                    )}
                  </button>
                ) : (
                  <div className="bg-slate-50 p-4 rounded-2xl flex items-center gap-3 border border-slate-100">
                     <Info size={18} className="text-indigo-400"/>
                     <p className="text-[10px] text-slate-500 font-bold uppercase italic tracking-tighter">Acesso de leitura exclusivo para a Regional.</p>
                  </div>
                )}
              </div>

              <div className="absolute -bottom-6 -right-6 p-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
                <ArrowUpCircle size={100} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Nota Informativa */}
      <div className="bg-slate-900 p-10 rounded-[4rem] text-white shadow-2xl relative overflow-hidden group">
         <Info className="absolute -right-6 -bottom-6 text-white/5 group-hover:scale-110 transition-transform" size={180} />
         <div className="flex items-start gap-8 relative z-10">
            <div className="p-5 bg-white/10 rounded-[1.8rem] backdrop-blur-md border border-white/5 shadow-xl"><ArrowUpCircle size={32} className="text-indigo-400"/></div>
            <div>
               <h4 className="text-lg font-black uppercase tracking-tight mb-3">Acessibilidade e Segurança</h4>
               <p className="text-sm text-white/60 leading-relaxed font-medium uppercase italic max-w-3xl">
                  A sinalização do estado operativo é vital para a <strong className="text-indigo-400">Agenda de Manutenção</strong> e segurança. 
                  Ao sinalizar um elevador como <strong className="text-red-400">Parado</strong>, o sistema gera um registro histórico para auditoria posterior de intervenções técnicas.
               </p>
            </div>
         </div>
      </div>
    </div>
  );
}

export default Elevador;