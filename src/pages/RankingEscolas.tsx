import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Trophy, Medal, Target, Star, 
  TrendingUp, TrendingDown, Settings2,
  ChevronRight, Search, Building2, Loader2,
  Droplets, ClipboardCheck, 
  X, Save, HelpCircle, Clock, BarChart3,
  ArrowUpRight
} from 'lucide-react';

interface SchoolRanking {
  id: string;
  name: string;
  score: number;
  position: number;
  stats: {
    water_compliance: number;
    water_efficiency: number;
    demand_compliance: number;
    fiscal_compliance: number;
    fiscal_quality: number;
  };
}

interface WeightConfig {
  water_reg: number;
  water_limit: number;
  demand_on_time: number;
  fiscal_delivery: number;
  fiscal_quality: number;
}

interface SchoolBase {
  id: string;
  name: string;
}

export function RankingEscolas() {
  const [schools, setSchools] = useState<SchoolRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false); 
  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<SchoolRanking | null>(null);
  
  // Pesos iniciais (serão sobrescritos pelo banco de dados)
  const [weights, setWeights] = useState<WeightConfig>({
    water_reg: 2,
    water_limit: 1,
    demand_on_time: 3,
    fiscal_delivery: 2,
    fiscal_quality: 2
  });

  useEffect(() => {
    initRanking();
  }, []);

  async function initRanking() {
    setLoading(true);
    try {
      // 1. Carregar perfil e permissões
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('role, school_id')
          .eq('id', user.id)
          .single();
        setUserRole(profile?.role || '');
        setUserSchoolId(profile?.school_id || null);
      }

      // 2. Carregar Pesos do Banco de Dados
      const { data: settings } = await (supabase as any)
        .from('ranking_settings')
        .select('*')
        .eq('id', 'default-weights')
        .maybeSingle();

      const activeWeights = settings ? {
        water_reg: settings.water_reg,
        water_limit: settings.water_limit,
        demand_on_time: settings.demand_on_time,
        fiscal_delivery: settings.fiscal_delivery,
        fiscal_quality: settings.fiscal_quality
      } : weights;

      if (settings) setWeights(activeWeights);

      // 3. Processar Dados com os pesos ativos
      await fetchData(activeWeights);
    } catch (err) {
      console.error("Erro na inicialização:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchData(currentWeights: WeightConfig) {
    try {
      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name');
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      
      const [water, demands, fiscal] = await Promise.all([
        (supabase as any).from('consumo_agua').select('*').gte('date', firstDay),
        (supabase as any).from('demands').select('*'),
        (supabase as any).from('monitoring_submissions').select('*, monitoring_events(date)').gte('monitoring_events.date', firstDay)
      ]);

      const allSchools: SchoolBase[] = schoolsData || [];
      const waterLogs = water.data || [];
      const allDemands = demands.data || [];
      const fiscalLogs = fiscal.data || [];
      const currentDay = now.getDate();

      const ranking: SchoolRanking[] = allSchools.map((school: SchoolBase) => {
        // 1. Água - Frequência de Registro
        const schoolWater = waterLogs.filter((w: any) => w.school_id === school.id);
        const waterRegPct = Math.min(1, schoolWater.length / currentDay);
        
        // 2. Água - Eficiência (Dentro do teto)
        const exceededCount = schoolWater.filter((w: any) => w.limit_exceeded).length;
        const waterEffPct = schoolWater.length > 0 ? (1 - exceededCount / schoolWater.length) : 1;

        // 3. Demandas - Prazo
        const schoolDemands = allDemands.filter((d: any) => d.school_id === school.id);
        const onTimeDemands = schoolDemands.filter((d: any) => d.status === 'CONCLUÍDO' && d.completed_at <= d.deadline);
        const demandPct = schoolDemands.length > 0 ? (onTimeDemands.length / schoolDemands.length) : 1;

        // 4. Fiscalização - Entrega e Dispensas
        const schoolFiscal = fiscalLogs.filter((f: any) => f.school_id === school.id);
        const completedOrDispensed = schoolFiscal.filter((f: any) => f.is_completed || f.is_dispensed);
        const fiscalPct = schoolFiscal.length > 0 ? (completedOrDispensed.length / schoolFiscal.length) : 1;
        
        // 5. Fiscalização - Qualidade (Nota 0-10)
        const ratings = schoolFiscal.filter((f: any) => f.is_completed && f.rating !== null);
        const avgRating = ratings.length > 0 
          ? (ratings.reduce((acc: number, curr: any) => acc + curr.rating, 0) / ratings.length) / 10
          : 0.8; 

        const totalWeight = currentWeights.water_reg + currentWeights.water_limit + currentWeights.demand_on_time + currentWeights.fiscal_delivery + currentWeights.fiscal_quality;
        
        let finalScore = (
          (waterRegPct * 10 * currentWeights.water_reg) +
          (waterEffPct * 10 * currentWeights.water_limit) +
          (demandPct * 10 * currentWeights.demand_on_time) +
          (fiscalPct * 10 * currentWeights.fiscal_delivery) +
          (avgRating * 10 * currentWeights.fiscal_quality)
        ) / totalWeight;

        finalScore = Math.max(0.01, Math.min(10, finalScore));

        return {
          id: school.id,
          name: school.name,
          score: finalScore,
          position: 0,
          stats: {
            water_compliance: waterRegPct * 100,
            water_efficiency: waterEffPct * 100,
            demand_compliance: demandPct * 100,
            fiscal_compliance: fiscalPct * 100,
            fiscal_quality: avgRating * 10
          }
        };
      });

      const sortedRanking = ranking
        .sort((a, b) => b.score - a.score)
        .map((item, index) => ({ ...item, position: index + 1 }));

      setSchools(sortedRanking);
    } catch (error) {
      console.error(error);
    }
  }

  // Função para Salvar Pesos no Supabase
  async function handleSaveSettings() {
    setSaveLoading(true);
    try {
      const { error } = await (supabase as any)
        .from('ranking_settings')
        .upsert({
          id: 'default-weights',
          ...weights,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      
      await fetchData(weights);
      setIsSettingsOpen(false);
    } catch (error: any) {
      alert("Erro ao salvar configurações: " + error.message);
    } finally {
      setSaveLoading(false);
    }
  }

  const isAdmin = userRole === 'regional_admin';

  const filteredRanking = useMemo(() => {
    let list = schools;
    if (!isAdmin && userSchoolId) {
      list = schools.filter(s => s.id === userSchoolId);
    }
    return list.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [schools, searchTerm, isAdmin, userSchoolId]);

  return (
    <div className="space-y-8 pb-20">
      {/* Header Gamificado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-indigo-600 rounded-[2rem] text-white shadow-2xl">
            <Trophy size={36} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Ranking Regional</h1>
            <p className="text-slate-500 font-medium mt-1 uppercase text-xs tracking-widest italic">Performance e Conformidade da Rede</p>
          </div>
        </div>

        <div className="flex gap-3">
          {isAdmin && (
            <div className="bg-white p-2 rounded-2xl border-2 border-slate-100 shadow-sm flex items-center gap-3 w-full md:w-64">
              <Search size={18} className="text-slate-400 ml-2" />
              <input 
                type="text" 
                placeholder="Buscar Unidade..." 
                className="w-full bg-transparent border-none outline-none font-bold text-slate-700 text-xs py-2 uppercase"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          )}
          {isAdmin && (
            <button onClick={() => setIsSettingsOpen(true)} className="bg-slate-900 text-white p-4 rounded-2xl shadow-lg hover:bg-black transition-all active:scale-95">
              <Settings2 size={20} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-40 flex flex-col items-center justify-center gap-4">
           <Loader2 className="animate-spin text-indigo-600" size={48} />
           <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Processando métricas de desempenho...</p>
        </div>
      ) : (
        <div className="space-y-8">
          
          {/* DESTAQUE TOP 3 - VISÍVEL APENAS PARA ADMIN */}
          {isAdmin && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {schools.slice(0, 3).map((school, idx) => (
                  <div 
                    key={school.id} 
                    onClick={() => setSelectedSchool(school)}
                    className={`relative p-8 rounded-[3rem] border-2 cursor-pointer transition-all hover:-translate-y-2 flex flex-col items-center text-center shadow-2xl ${
                      idx === 0 ? 'bg-amber-50 border-amber-200 ring-4 ring-amber-400/10' : 
                      idx === 1 ? 'bg-slate-50 border-slate-200' : 'bg-orange-50 border-orange-100'
                    }`}
                  >
                     {idx === 0 && <Medal size={32} className="text-amber-500 absolute -top-4 animate-bounce" />}
                     <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-2xl font-black mb-4 shadow-lg ${
                        idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-slate-300 text-slate-700' : 'bg-orange-400 text-white'
                     }`}>
                        {idx + 1}º
                     </div>
                     <h4 className="font-black text-slate-800 uppercase text-xs line-clamp-2 h-8 leading-tight mb-2">{school.name}</h4>
                     <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100 mt-2">
                        <TrendingUp size={12} className="text-emerald-500" />
                        <span className="text-xl font-black text-slate-900">{school.score.toFixed(2)}</span>
                     </div>
                  </div>
               ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* LADO ESQUERDO: LISTA (FILTRADA POR PERMISSÃO) */}
            <div className="lg:col-span-8 space-y-4">
              <div className="flex items-center gap-3 px-4 mb-2">
                 <Target className="text-indigo-600" size={18} />
                 <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    {isAdmin ? 'Classificação Geral da Rede' : 'Sua Posição no Ranking'}
                 </h3>
              </div>
              {filteredRanking.map((school) => (
                  <div 
                    key={school.id} 
                    onClick={() => setSelectedSchool(school)}
                    className="bg-white p-4 rounded-[2.5rem] border border-slate-100 shadow-xl flex items-center gap-4 group hover:border-indigo-400 cursor-pointer transition-all active:scale-[0.99] overflow-hidden"
                  >
                     <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 border-2 border-slate-50 text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-all">#{school.position}</div>
                        <div className="flex-1 min-w-0 pr-2">
                           <h4 className="font-black text-slate-800 uppercase text-[11px] truncate group-hover:text-indigo-600 transition-colors" title={school.name}>{school.name}</h4>
                           <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                              <SmallStat label="Água" val={school.stats.water_compliance} icon={<Droplets size={10}/>} />
                              <SmallStat label="Fiscal" val={school.stats.fiscal_compliance} icon={<ClipboardCheck size={10}/>} />
                              <SmallStat label="Satis." val={school.stats.fiscal_quality * 10} icon={<Star size={10}/>} />
                           </div>
                        </div>
                     </div>
                     <div className="flex items-center gap-4 shrink-0 border-l border-slate-50 pl-4 w-[120px] justify-end">
                        <div className="text-right">
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Índice</p>
                           <div className={`px-3 py-1.5 rounded-xl font-black text-md shadow-inner transition-all group-hover:scale-105 ${school.score >= 8 ? 'text-emerald-600 bg-emerald-50' : school.score >= 6 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'}`}>
                              {school.score.toFixed(2)}
                           </div>
                        </div>
                        <div className="p-2 bg-slate-50 text-slate-300 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all hidden sm:block">
                          <ChevronRight size={16}/>
                        </div>
                     </div>
                  </div>
              ))}
              {!isAdmin && filteredRanking.length === 0 && (
                <div className="p-10 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100 text-center">
                   <p className="text-slate-400 font-bold uppercase text-xs">Unidade não identificada no ranking.</p>
                </div>
              )}
            </div>

            {/* LADO DIREITO: LEGENDA E STATUS REDE */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-2xl space-y-8">
                 <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2 mb-4">
                       <HelpCircle size={18} className="text-indigo-600"/> Regras do Cálculo
                    </h3>
                    <div className="space-y-4">
                       <RuleInfo icon={<Droplets size={14}/>} title="Registro de Água" desc="Frequência diária de leitura." color="text-blue-500" />
                       <RuleInfo icon={<TrendingDown size={14}/>} title="Consumo" desc="Respeito ao teto regional." color="text-cyan-500" />
                       <RuleInfo icon={<Clock size={14}/>} title="Demandas" desc="Prazos de e-mails e ofícios." color="text-red-500" />
                       <RuleInfo icon={<ClipboardCheck size={14}/>} title="Fiscalização" desc="Entrega dos formulários mensais." color="text-amber-500" />
                       <RuleInfo icon={<Star size={14}/>} title="Satisfação" desc="Qualidade técnica dos serviços." color="text-emerald-500" />
                    </div>
                 </div>

                 {isAdmin && (
                   <div className="pt-8 border-t border-slate-100">
                      <div className="bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100">
                         <div className="flex items-center gap-2 mb-2 text-indigo-600">
                            <BarChart3 size={16}/>
                            <h4 className="text-[10px] font-black uppercase tracking-widest">Média Global GSU</h4>
                         </div>
                         <div className="flex items-end gap-2">
                            <span className="text-3xl font-black text-indigo-900">
                               {(schools.reduce((acc, s) => acc + s.score, 0) / (schools.length || 1)).toFixed(2)}
                            </span>
                            <span className="text-[10px] font-bold text-indigo-400 uppercase mb-1">Pontos</span>
                         </div>
                      </div>
                   </div>
                 )}
              </div>

              <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
                 <Target className="absolute -right-4 -bottom-4 text-white/5 group-hover:scale-110 transition-transform" size={120} />
                 <h4 className="text-sm font-black uppercase tracking-tight mb-2 flex items-center gap-2">
                    <Target size={18} className="text-indigo-400"/> Meta
                 </h4>
                 <p className="text-[11px] text-white/60 leading-relaxed font-bold uppercase italic">
                    Unidades acima de 9.00 garantem o **Selo Diamante de Gestão**.
                 </p>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL DE EXPLICAÇÃO DA NOTA */}
      {selectedSchool && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 overflow-hidden">
           <div className="bg-white rounded-[3.5rem] w-full max-w-2xl max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200 border border-white flex flex-col overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                 <div className="flex items-center gap-5">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl ${selectedSchool.score >= 8 ? 'bg-emerald-500' : 'bg-indigo-600'}`}>
                       <Building2 size={28}/>
                    </div>
                    <div className="pr-4">
                       <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight leading-none truncate max-w-[300px]">{selectedSchool.name}</h2>
                       <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest mt-2">Detalhamento do Cálculo de Performance</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedSchool(null)} className="p-3 hover:bg-white rounded-full transition-all text-slate-400"><X size={28}/></button>
              </div>

              <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
                 <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white flex items-center justify-between shadow-2xl relative overflow-hidden">
                    <Trophy size={100} className="absolute -right-8 -bottom-8 text-white/5 rotate-12" />
                    <div className="relative z-10">
                       <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Nota Consolidada</p>
                       <h3 className="text-5xl font-black mt-1">{selectedSchool.score.toFixed(2)}</h3>
                    </div>
                    <div className="text-right relative z-10">
                       <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Ranking</p>
                       <h3 className="text-3xl font-black text-amber-400 mt-1">{selectedSchool.position}º da Rede</h3>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2 px-2">
                       <BarChart3 size={14}/> Composição da Pontuação (Escala 0-10)
                    </h4>
                    
                    <div className="grid gap-3">
                       <BreakdownItem label="Registro de Água" value={selectedSchool.stats.water_compliance} weight={weights.water_reg} icon={<Droplets size={14} className="text-blue-500"/>} />
                       <BreakdownItem label="Eficiência Hídrica" value={selectedSchool.stats.water_efficiency} weight={weights.water_limit} icon={<TrendingDown size={14} className="text-cyan-500"/>} />
                       <BreakdownItem label="Demandas no Prazo" value={selectedSchool.stats.demand_compliance} weight={weights.demand_on_time} icon={<Clock size={14} className="text-red-500"/>} />
                       <BreakdownItem label="Entrega Fiscalização" value={selectedSchool.stats.fiscal_compliance} weight={weights.fiscal_delivery} icon={<ClipboardCheck size={14} className="text-amber-500"/>} />
                       <BreakdownItem label="Qualidade Percebida" value={selectedSchool.stats.fiscal_quality * 10} weight={weights.fiscal_quality} icon={<Star size={14} className="text-emerald-500"/>} />
                    </div>
                 </div>

                 <div className="p-6 bg-blue-50 border-2 border-blue-100 rounded-[2rem] flex items-start gap-4">
                    <div className="p-3 bg-white rounded-2xl text-blue-600 shadow-sm"><ArrowUpRight size={24}/></div>
                    <div>
                       <h5 className="text-[10px] font-black text-blue-900 uppercase tracking-wider">Como subir de posição:</h5>
                       <p className="text-[11px] text-blue-700 font-medium leading-relaxed mt-1">
                          {selectedSchool.stats.water_compliance < 100 
                            ? "Existem falhas no registro diário de água. Regularize o preenchimento para ganhar pontos imediatos."
                            : selectedSchool.stats.demand_compliance < 100 
                            ? "Atenção às demandas atrasadas! Concluir as tarefas regionais no prazo é o maior peso do ranking."
                            : "Parabéns pela consistência! Continue monitorando a qualidade dos serviços terceirizados para manter o nível."}
                       </p>
                    </div>
                 </div>
              </div>

              <div className="p-8 border-t border-slate-100 bg-white shrink-0 text-center">
                 <button onClick={() => setSelectedSchool(null)} className="px-12 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-black transition-all">Entendido</button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL DE CONFIGURAÇÃO DE PESOS */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-hidden">
          <div className="bg-white rounded-[3rem] w-full max-w-xl max-h-[90vh] shadow-2xl overflow-hidden border border-white animate-in zoom-in-95 duration-200 flex flex-col">
            {/* Header Fixo */}
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white"><Settings2 size={24} /></div>
                <div><h2 className="text-xl font-black uppercase tracking-tight leading-none">Ajuste dos Pesos</h2><p className="text-xs text-indigo-600 font-bold uppercase tracking-widest mt-1">Configure a importância de cada indicador</p></div>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-white rounded-full text-slate-400 transition-all"><X size={24} /></button>
            </div>
            
            {/* Conteúdo com Scroll */}
            <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
               <div className="bg-amber-50 p-4 rounded-2xl flex items-start gap-3 border border-amber-100"><HelpCircle size={20} className="text-amber-500 shrink-0 mt-0.5" /><p className="text-[11px] text-amber-700 font-medium leading-relaxed">Valores maiores aumentam o impacto da categoria na nota final. Pesos variam de 1 a 5.</p></div>
               <div className="space-y-4">
                  <WeightInput label="Registro de Água" val={weights.water_reg} onChange={(v) => setWeights({...weights, water_reg: v})} icon={<Droplets size={14}/>}/>
                  <WeightInput label="Eficiência Hídrica" val={weights.water_limit} onChange={(v) => setWeights({...weights, water_limit: v})} icon={<TrendingDown size={14}/>}/>
                  <WeightInput label="Demandas no Prazo" val={weights.demand_on_time} onChange={(v) => setWeights({...weights, demand_on_time: v})} icon={<Clock size={14}/>}/>
                  <WeightInput label="Entrega Fiscalizações" val={weights.fiscal_delivery} onChange={(v) => setWeights({...weights, fiscal_delivery: v})} icon={<ClipboardCheck size={14}/>}/>
                  <WeightInput label="Qualidade (Notas)" val={weights.fiscal_quality} onChange={(v) => setWeights({...weights, fiscal_quality: v})} icon={<Star size={14}/>}/>
               </div>
            </div>

            {/* Rodapé Fixo com Botão */}
            <div className="p-8 border-t border-slate-100 bg-white shrink-0">
               <button onClick={handleSaveSettings} disabled={saveLoading} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-[11px]">
                  {saveLoading ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                  Salvar e Recalcular Tudo
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SmallStat({ label, val, icon }: { label: string, val: number, icon: React.ReactNode }) {
  const color = val >= 90 ? 'text-emerald-600' : val >= 70 ? 'text-amber-600' : 'text-red-500';
  return (
    <div className="flex items-center gap-1"><span className="text-slate-300 shrink-0">{icon}</span><span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">{label}:</span><span className={`text-[9px] font-black ${color}`}>{Math.round(val)}%</span></div>
  );
}

function RuleInfo({ icon, title, desc, color }: { icon: React.ReactNode, title: string, desc: string, color: string }) {
  return (
    <div className="flex items-start gap-3">
       <div className={`p-2 rounded-lg bg-slate-50 ${color} shadow-sm shrink-0`}>{icon}</div>
       <div>
          <h5 className="text-[10px] font-black text-slate-700 uppercase leading-none mb-1">{title}</h5>
          <p className="text-[9px] text-slate-400 font-medium leading-tight uppercase">{desc}</p>
       </div>
    </div>
  );
}

function BreakdownItem({ label, value, weight, icon }: { label: string, value: number, weight: number, icon: React.ReactNode }) {
  return (
    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 group transition-all hover:bg-white hover:border-indigo-100">
       <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
             {icon}
             <span className="text-[9px] font-black text-slate-600 uppercase tracking-tight">{label}</span>
          </div>
          <div className="flex items-center gap-2">
             <span className="text-[8px] font-bold text-slate-400 uppercase bg-white px-2 py-0.5 rounded border">Peso: {weight}</span>
             <span className="text-xs font-black text-slate-900">{value.toFixed(1)}%</span>
          </div>
       </div>
       <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
          <div className={`h-full transition-all duration-1000 ${value >= 90 ? 'bg-emerald-50' : value >= 70 ? 'bg-amber-50' : 'bg-red-50'}`} style={{ width: `${value}%` }} />
       </div>
    </div>
  );
}

function WeightInput({ label, val, onChange, icon }: { label: string, val: number, onChange: (v: number) => void, icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-all"><div className="flex items-center gap-3"><div className="text-indigo-400">{icon}</div><span className="text-[11px] font-black text-slate-700 uppercase tracking-tight">{label}</span></div><div className="flex items-center gap-4"><input type="range" min="1" max="5" step="1" className="w-24 accent-indigo-600" value={val} onChange={(e) => onChange(Number(e.target.value))} /><span className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-black text-sm shadow-md">{val}</span></div></div>
  );
}

export default RankingEscolas;