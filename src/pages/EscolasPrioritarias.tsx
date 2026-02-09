import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Star, Search, FileSpreadsheet, LayoutGrid, 
  Loader2, TrendingUp, 
  Target, Info, ExternalLink,
  ClipboardList, ShieldAlert,
  ArrowUpRight, RefreshCw, BarChart3, Lock
} from 'lucide-react';

interface PrioritySchool {
  name: string;
  score: number;      // Coluna F
  status: string;     // Coluna I
}

export function EscolasPrioritarias() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'painel' | 'planilha'>('painel');
  const [searchTerm, setSearchTerm] = useState('');
  const [schoolsData, setSchoolsData] = useState<PrioritySchool[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Identificador da planilha e URL de exportação direta para CSV
  const SPREADSHEET_ID = "1P6NIWUntGR_GNVCJmVEL22wznAV3XLB1vj9MDK6Q8L8";
  const CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?usp=sharing`;

  useEffect(() => {
    checkAccessAndFetchData();
  }, []);

  async function checkAccessAndFetchData() {
    setLoading(true);
    try {
      // 1. Verificar o papel do usuário logado
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        
        const role = profile?.role || '';
        setUserRole(role);

        // 2. Só buscar dados da planilha se for administrador
        if (role === 'regional_admin') {
          await fetchPriorityData(false);
        }
      }
    } catch (error) {
      console.error("Erro na verificação de acesso:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPriorityData(isRefresh = true) {
    if (isRefresh) setRefreshing(true);

    try {
      const response = await fetch(CSV_URL);
      const csvText = await response.text();
      
      const rows = csvText.split('\n').map(row => {
        const matches = row.match(/(".*?"|[^",\r\n]+)(?=\s*,|\s*$)/g);
        return matches ? matches.map(m => m.replace(/^"|"$/g, '').trim()) : [];
      });

      const parsedSchools: PrioritySchool[] = rows
        .map(row => {
          const scoreValue = row[5]?.replace(',', '.') || '';
          const numericScore = parseFloat(scoreValue);
          
          return {
            name: row[0] || '', // Coluna A
            score: numericScore,
            status: row[8] || 'EM ANÁLISE' // Coluna I
          };
        })
        .filter(s => 
          s.name && 
          s.name.length > 5 &&               
          !isNaN(s.score) &&                
          !s.name.includes("MÉDIA") &&      
          !s.name.includes("PRIORIDADE") && 
          !s.name.toUpperCase().includes("PLANILHA") 
        )
        .sort((a, b) => a.score - b.score);

      setSchoolsData(parsedSchools);
    } catch (error) {
      console.error("Erro ao sincronizar com a planilha:", error);
    } finally {
      setRefreshing(false);
    }
  }

  const filteredSchools = useMemo(() => {
    return schoolsData.filter(s => 
      s.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [schoolsData, searchTerm]);

  // Se estiver carregando, mostra o spinner
  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-amber-500" size={48} />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Validando Credenciais...</p>
      </div>
    );
  }

  // Se não for administrador, mostra tela de erro/bloqueio
  if (userRole !== 'regional_admin') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="w-24 h-24 bg-red-50 text-red-600 rounded-[2.5rem] flex items-center justify-center mb-6 shadow-xl shadow-red-100 border border-red-100">
          <Lock size={48} />
        </div>
        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Acesso Restrito</h2>
        <p className="text-slate-500 font-medium mt-2 max-w-md uppercase text-xs tracking-widest leading-relaxed">
          Esta página contém informações estratégicas do setor <strong className="text-red-600">SEOM - SEFISC</strong> e está disponível apenas para a Direção Regional.
        </p>
        <button 
          onClick={() => window.location.href = '/'}
          className="mt-8 px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all active:scale-95"
        >
          Voltar ao Painel Geral
        </button>
      </div>
    );
  }

  // Renderização normal para Administradores
  return (
    <div className="min-h-screen space-y-8 pb-32 bg-[#f8fafc]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-amber-500 rounded-[2rem] text-white shadow-2xl shadow-amber-100">
            <Star size={36} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Escolas Prioritárias</h1>
            <p className="text-slate-500 font-medium mt-1 uppercase text-xs tracking-widest italic">Monitoramento GSU: Integração SEOM - SEFISC</p>
          </div>
        </div>

        <div className="flex gap-2 p-2 bg-slate-100 rounded-[2rem] border border-slate-200 shadow-sm">
          <TabButton active={activeTab === 'painel'} onClick={() => setActiveTab('painel')} icon={<LayoutGrid size={18}/>} label="Dashboard" />
          <TabButton active={activeTab === 'planilha'} onClick={() => setActiveTab('planilha')} icon={<FileSpreadsheet size={18}/>} label="Planilha Espelho" />
        </div>
      </div>

      <div className="animate-in fade-in duration-500 space-y-8">
        
        {activeTab === 'painel' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl flex items-center gap-6 relative overflow-hidden group">
                  <div className="w-16 h-16 bg-red-50 text-red-600 rounded-[1.5rem] flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                      <ShieldAlert size={32}/>
                  </div>
                  <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Escolas Prioritárias</p>
                      <h3 className="text-3xl font-black text-slate-800">
                        {schoolsData.filter(s => s.status === 'Escola Prioritária SEOM - SEFISC').length} 
                        <span className="text-xs font-bold text-slate-300 uppercase ml-2">Unidades</span>
                      </h3>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl flex items-center gap-6 group">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-[1.5rem] flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                      <BarChart3 size={32}/>
                  </div>
                  <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Média Regional</p>
                      <h3 className="text-3xl font-black text-slate-800">
                        {(schoolsData.reduce((acc, curr) => acc + curr.score, 0) / (schoolsData.length || 1)).toFixed(2)}
                      </h3>
                  </div>
                </div>

                <button 
                onClick={() => fetchPriorityData(true)}
                disabled={refreshing}
                className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl text-white flex items-center justify-between group hover:bg-black transition-all"
                >
                  <div className="text-left">
                      <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest leading-none">Dados Atualizados</p>
                      <h3 className="text-xl font-black mt-2 uppercase">Sincronizar Cloud</h3>
                  </div>
                  <div className={`p-4 bg-white/10 rounded-2xl ${refreshing ? 'animate-spin' : 'group-hover:rotate-180'} transition-all`}>
                      <RefreshCw size={24} />
                  </div>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-4 space-y-6">
                  <div className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-xl space-y-8">
                      <div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2 mb-6 border-b border-slate-50 pb-4">
                            <Info size={18} className="text-amber-500"/> Critérios de Gestão
                        </h3>
                        <div className="space-y-6">
                            <RuleInfo title="Ranking Invertido" desc="Notas mais baixas (Coluna F) indicam urgência crítica de intervenção." color="text-red-500" />
                            <RuleInfo title="Intervenção SEFISC" desc="Status exclusivo para unidades com alto índice de irregularidades." color="text-indigo-500" />
                            <RuleInfo title="Acompanhamento" desc="Unidades monitoradas semanalmente pela Regional." color="text-emerald-500" />
                        </div>
                      </div>
                  </div>

                  <div className="bg-amber-600 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
                      <Target className="absolute -right-4 -bottom-4 text-white/5 group-hover:scale-110 transition-transform" size={120} />
                      <h4 className="text-sm font-black uppercase tracking-tight mb-2 flex items-center gap-2">
                        <TrendingUp size={18} className="text-white"/> Inteligência Regional
                      </h4>
                      <p className="text-[10px] text-white/70 leading-relaxed font-bold uppercase italic">
                        Os dados exibidos são espelhados em tempo real da planilha oficial da Regional.
                      </p>
                  </div>
                </div>

                <div className="lg:col-span-8 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4">
                      <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
                        <ClipboardList size={22} className="text-amber-500"/> Fila de Prioridades
                      </h2>
                      <div className="bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3 w-full sm:w-64">
                        <Search size={16} className="text-slate-400"/>
                        <input 
                          type="text" 
                          placeholder="Buscar UE..." 
                          className="bg-transparent border-none outline-none text-xs font-bold text-slate-700 uppercase w-full"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>
                  </div>

                  <div className="space-y-4">
                      {filteredSchools.map((school, idx) => {
                        const isPriority = school.status === 'Escola Prioritária SEOM - SEFISC';
                        
                        return (
                          <div key={idx} className={`bg-white p-6 rounded-[2.5rem] border transition-all cursor-pointer overflow-hidden relative shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6 group hover:border-amber-400 ${isPriority ? 'border-red-200 ring-2 ring-red-50' : 'border-slate-100'}`}>
                            <div className="flex items-center gap-6 flex-1 min-w-0">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner shrink-0 ${
                                  idx === 0 ? 'bg-red-600 text-white' : 
                                  idx === 1 ? 'bg-orange-500 text-white' : 
                                  idx === 2 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'
                                }`}>
                                  {idx + 1}º
                                </div>
                                <div className="min-w-0">
                                  <h4 className="font-black text-slate-800 uppercase text-sm group-hover:text-amber-600 transition-colors truncate" title={school.name}>
                                    {school.name}
                                  </h4>
                                  <div className="flex items-center gap-3 mt-2">
                                      <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest border ${
                                        isPriority ? 'bg-red-600 text-white border-red-600' : 
                                        'bg-slate-50 text-slate-400 border-slate-100'
                                      }`}>
                                        {school.status}
                                      </span>
                                      {isPriority && (
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                                            <span className="text-[9px] font-black text-red-600 uppercase tracking-tighter">Ação Imediata</span>
                                        </div>
                                      )}
                                  </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-6 shrink-0 border-t sm:border-t-0 sm:border-l border-slate-50 pt-4 sm:pt-0 sm:pl-8 w-full sm:w-auto">
                                <div className="text-center sm:text-right flex-1 sm:flex-none">
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Índice GSU</p>
                                  <p className={`text-2xl font-black tabular-nums ${isPriority ? 'text-red-600' : 'text-slate-900'}`}>
                                    {school.score.toFixed(2)}
                                  </p>
                                </div>
                                <div className="p-3 bg-slate-50 text-slate-300 rounded-xl group-hover:bg-amber-500 group-hover:text-white transition-all shadow-sm">
                                  <ArrowUpRight size={20}/>
                                </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
            </div>
          </>
        )}

        {activeTab === 'planilha' && (
          <div className="bg-white p-4 rounded-[4rem] border border-slate-100 shadow-2xl h-[750px] relative overflow-hidden animate-in zoom-in-95 duration-500">
              <div className="absolute top-10 right-10 z-10 flex gap-2">
                <div className="bg-white/90 backdrop-blur px-6 py-2.5 rounded-2xl shadow-2xl border border-slate-100 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Planilha Cloud Ativa</span>
                </div>
                <a href={SHEET_URL} target="_blank" rel="noopener noreferrer" className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl hover:scale-105 transition-all">
                  <ExternalLink size={20}/>
                </a>
              </div>
              <iframe 
              src={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?rm=minimal`} 
              className="w-full h-full rounded-[3.5rem] border-none shadow-inner" 
              title="Google Sheets Priority Ranking"
              loading="lazy"
              />
          </div>
        )}

      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick} 
      className={`px-8 py-3.5 rounded-[1.5rem] text-[11px] font-black uppercase tracking-[0.1em] flex items-center gap-3 transition-all ${
        active 
          ? 'bg-white text-amber-600 shadow-xl shadow-amber-200/20 border border-amber-100' 
          : 'text-slate-400 hover:text-slate-600 border border-transparent'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function RuleInfo({ title, desc, color }: { title: string, desc: string, color: string }) {
  return (
    <div className="flex items-start gap-4 group">
       <div className={`w-1.5 h-10 rounded-full bg-slate-100 group-hover:${color.replace('text-', 'bg-')} transition-all duration-500`}></div>
       <div>
          <h5 className={`text-[11px] font-black uppercase leading-none mb-1 ${color}`}>{title}</h5>
          <p className="text-[10px] text-slate-400 font-bold leading-tight uppercase tracking-tight">{desc}</p>
       </div>
    </div>
  );
}

export default EscolasPrioritarias;