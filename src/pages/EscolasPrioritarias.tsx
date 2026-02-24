import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Star, Search, LayoutGrid, Loader2, Target, 
  ShieldAlert, ArrowUpRight, RefreshCw, BarChart3, 
  Lock, Plus, Settings, CheckCircle2, AlertCircle, X, SlidersHorizontal
} from 'lucide-react';

// --- Interfaces ---
interface RankingParam {
  id: string;
  nome_parametro: string;
  spreadsheet_id: string;
  aba_nome: string;
  coluna_escola: string;
  coluna_pontuacao: string;
  peso: number;
}

interface SchoolScore {
  name: string;
  finalScore: number;
  details: { [key: string]: number };
}

interface WeightItem {
  id: string | 'new';
  nome: string;
  peso: number;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function EscolasPrioritarias() {
  // 1. ESTADOS
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'painel' | 'config'>('painel');
  const [searchTerm, setSearchTerm] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<SchoolScore | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  // Estados de Dados
  const [params, setParams] = useState<RankingParam[]>([]);
  const [rankedSchools, setRankedSchools] = useState<SchoolScore[]>([]);

  // Estados dos Modais
  const [showModal, setShowModal] = useState(false); // Modal de Novo Parâmetro
  const [showWeightModal, setShowWeightModal] = useState(false); // Modal de Ajuste de Pesos
  const [step, setStep] = useState(1);
  const [newParam, setNewParam] = useState<Partial<RankingParam>>({
    nome_parametro: '',
    spreadsheet_id: '',
    aba_nome: '',
    coluna_escola: '',
    coluna_pontuacao: '',
    peso: 0
  });
  const [testStatus, setTestStatus] = useState<{ loading: boolean; error?: string }>({ loading: false });
  const [tempWeights, setTempWeights] = useState<WeightItem[]>([]);

  // --- Lógica de Inicialização ---
  useEffect(() => {
    checkAccessAndFetchData();
  }, []);

  async function checkAccessAndFetchData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any).from('profiles').select('role').eq('id', user.id).single();
        setUserRole(profile?.role || '');
        if (profile?.role === 'regional_admin') {
            await loadParamsAndCalculate();
        }
      }
    } catch (error) {
      console.error("Erro de acesso:", error);
    } finally {
      setLoading(false);
    }
  }

  // --- Processamento de Dados ---
  const normalizeName = (name: string) => {
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  };

  async function loadParamsAndCalculate() {
    setRefreshing(true);
    
    // Busca as escolas cadastradas no Supabase para validação
    const { data: dbSchools } = await supabase.from('schools').select('name');
    const validSchools = dbSchools || [];

    // Busca os parâmetros
    const { data: dbParams } = await supabase.from('ranking_parameters').select('*');
    
    if (dbParams) {
      setParams(dbParams as RankingParam[]);
      await calculateRanking(dbParams as RankingParam[], validSchools);
      const agora = new Date();
      setLastUpdate(`${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    }
    setRefreshing(false);
  }

  async function fetchSheetData(p: Partial<RankingParam>) {
    const url = `https://docs.google.com/spreadsheets/d/${p.spreadsheet_id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(p.aba_nome || '')}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Erro na conexão");
    const csvText = await response.text();
    return csvText.split('\n').map(row => {
      const matches = row.match(/(".*?"|[^",\r\n]+)(?=\s*,|\s*$)/g);
      return matches ? matches.map(m => m.replace(/^"|"$/g, '').trim()) : [];
    });
  }

  async function calculateRanking(currentParams: RankingParam[], validSchools: any[]) {
    const schoolMap: { [name: string]: { total: number; details: { [key: string]: number } } } = {};
    
    for (const p of currentParams) {
      try {
        const rows = await fetchSheetData(p);
        const colEscolaIdx = p.coluna_escola.toUpperCase().charCodeAt(0) - 65;
        const colNotaIdx = p.coluna_pontuacao.toUpperCase().charCodeAt(0) - 65;

        rows.forEach(row => {
          const rawName = row[colEscolaIdx];
          const score = parseFloat(row[colNotaIdx]?.replace(',', '.') || '0');
          
          if (rawName && rawName.length > 3 && !isNaN(score)) {
            const normalizedRawName = normalizeName(rawName);
            
            // Valida se a escola existe no banco
            const matchedDbSchool = validSchools.find(s => normalizeName(s.name) === normalizedRawName);
            
            if (matchedDbSchool) {
              const exactName = matchedDbSchool.name;
              if (!schoolMap[exactName]) schoolMap[exactName] = { total: 0, details: {} };
              schoolMap[exactName].details[p.nome_parametro] = score;
              schoolMap[exactName].total += (score * (p.peso / 100));
            }
          }
        });
      } catch (e) { console.error(`Erro ao processar parâmetro ${p.nome_parametro}:`, e); }
    }
    
    setRankedSchools(Object.entries(schoolMap).map(([name, data]) => ({
      name, finalScore: data.total, details: data.details
    })).sort((a, b) => a.finalScore - b.finalScore));
  }

  // --- Lógica de Pesos Dinâmicos ---
  const handleWeightChange = (id: string | 'new', newValue: number) => {
    let updated = tempWeights.map(w => w.id === id ? { ...w, peso: newValue } : w);
    const otherItems = updated.filter(w => w.id !== id);
    const totalOther = otherItems.reduce((acc, w) => acc + w.peso, 0);
    const remaining = 100 - newValue;

    if (totalOther > 0) {
      updated = updated.map(w => {
        if (w.id === id) return w;
        return { ...w, peso: Math.round((w.peso / totalOther) * remaining) };
      });
    } else if (otherItems.length > 0) {
      const split = Math.floor(remaining / otherItems.length);
      updated = updated.map(w => w.id === id ? w : { ...w, peso: split });
    }

    const sum = updated.reduce((acc, w) => acc + w.peso, 0);
    if (sum !== 100 && updated.length > 0) {
        updated[0].peso += (100 - sum);
    }
    setTempWeights(updated);
  };

  const handleTestAndNext = async () => {
    setTestStatus({ loading: true });
    try {
      await fetchSheetData(newParam);
      setTestStatus({ loading: false });
      setTempWeights([
        ...params.map(p => ({ id: p.id, nome: p.nome_parametro, peso: p.peso })),
        { id: 'new', nome: newParam.nome_parametro || '', peso: 0 }
      ]);
      setStep(2);
    } catch (e) {
      setTestStatus({ loading: false, error: "Falha na conexão. Verifique o link e a aba." });
    }
  };

  const saveAll = async () => {
    setRefreshing(true);
    try {
      const newWeight = tempWeights.find(w => w.id === 'new')?.peso || 0;
      const { error: insertError } = await (supabase as any)
        .from('ranking_parameters')
        .insert([{ ...newParam, peso: newWeight }]);
      
      if (insertError) throw insertError;
      
      const updates = tempWeights.filter(w => w.id !== 'new').map(w => 
        (supabase as any).from('ranking_parameters').update({ peso: w.peso }).eq('id', w.id)
      );
      await Promise.all(updates);
      
      setShowModal(false);
      setNewParam({ nome_parametro: '', spreadsheet_id: '', aba_nome: '', coluna_escola: '', coluna_pontuacao: '', peso: 0 });
      setStep(1);
      await loadParamsAndCalculate();
    } catch (error: any) { 
        console.error("Erro na operação:", error);
        alert("Erro ao salvar dados.");
    } finally {
        setRefreshing(false);
    }
  };

  const updateWeights = async () => {
    setRefreshing(true);
    try {
      const updates = tempWeights.map(w => 
        (supabase as any).from('ranking_parameters').update({ peso: w.peso }).eq('id', w.id)
      );
      await Promise.all(updates);
      
      setShowWeightModal(false);
      await loadParamsAndCalculate();
    } catch (error: any) { 
        console.error("Erro na operação:", error);
        alert("Erro ao atualizar pesos.");
    } finally {
        setRefreshing(false);
    }
  };

  // --- Renderizações ---
  const renderDetailsModal = () => {
    if (!selectedSchool) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-2xl rounded-[3rem] p-10 shadow-2xl relative animate-in zoom-in-95">
          <button onClick={() => setSelectedSchool(null)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-800 transition-colors">
            <X size={28} />
          </button>
          
          <div className="mb-8 pr-12">
            <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-2">Detalhamento de Performance</p>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{selectedSchool.name}</h2>
          </div>

          <div className="space-y-4 mb-8 max-h-[50vh] overflow-y-auto pr-2">
            {params.map(p => {
               const rawScore = selectedSchool.details[p.nome_parametro] || 0;
               const weightedContribution = (rawScore * (p.peso / 100));
               return (
                  <div key={p.id} className="bg-slate-50 p-6 rounded-[2rem] flex justify-between items-center border border-slate-100 group hover:border-amber-200 transition-all">
                    <div className="flex-1 pr-4">
                      <p className="text-[10px] font-black uppercase text-slate-800 flex items-center gap-2">
                        {p.nome_parametro} 
                        <span className="text-[9px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-100">Peso {p.peso}%</span>
                      </p>
                      <div className="w-full h-1.5 bg-slate-200 rounded-full mt-3 overflow-hidden">
                        <div className="h-full bg-amber-500 transition-all duration-1000" style={{ width: `${rawScore}%` }}></div>
                      </div>
                    </div>
                    <div className="text-right border-l border-slate-200 pl-4">
                      <p className="text-[9px] font-black text-slate-400 uppercase">Contribuição</p>
                      <p className="text-xl font-black text-slate-800">+{weightedContribution.toFixed(2)}</p>
                      <p className="text-[9px] font-bold text-slate-400">Bruta: {rawScore.toFixed(1)}</p>
                    </div>
                  </div>
               );
            })}
          </div>
          
          <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white flex justify-between items-center shadow-xl">
            <div>
              <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Índice Final GSU</p>
              <h3 className="text-4xl font-black">{selectedSchool.finalScore.toFixed(2)}</h3>
            </div>
            <Target size={48} className="text-white/20" />
          </div>
        </div>
      </div>
    );
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-amber-500" size={48} /></div>;
  if (userRole !== 'regional_admin') return <AccessDenied />;

  return (
    <div className="min-h-screen space-y-8 pb-32 bg-[#f8fafc] p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="p-4 bg-amber-500 rounded-[2rem] text-white shadow-2xl"><Star size={36} fill="currentColor" /></div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight leading-none">Ranking Prioritário</h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest italic mt-1">
              {lastUpdate ? `Última sincronização: ${lastUpdate}` : 'Aguardando atualização inicial...'}
            </p>
          </div>
        </div>
        <div className="flex gap-2 p-2 bg-slate-100 rounded-[2rem] border border-slate-200">
          <TabButton active={activeTab === 'painel'} onClick={() => setActiveTab('painel')} icon={<LayoutGrid size={18}/>} label="Dashboard" />
          <TabButton active={activeTab === 'config'} onClick={() => setActiveTab('config')} icon={<Settings size={18}/>} label="Parâmetros" />
        </div>
      </div>

      {activeTab === 'painel' ? (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center"><RefreshCw className={refreshing ? 'animate-spin' : ''} size={24} /></div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{refreshing ? 'Sincronizando planilhas...' : 'Dados em tempo real'}</p>
            </div>
            <button onClick={loadParamsAndCalculate} disabled={refreshing} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50">
                {refreshing ? 'Processando...' : 'Atualizar Ranking Agora'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <Card icon={<ShieldAlert size={32}/>} label="Escolas Mapeadas" value={rankedSchools.length} color="red" />
             <Card icon={<BarChart3 size={32}/>} label="Parâmetros Ativos" value={params.length} color="indigo" />
             <div className="bg-amber-500 p-8 rounded-[3rem] text-white shadow-xl flex flex-col justify-center">
                 <p className="text-[10px] font-black uppercase opacity-80 mb-1">Algoritmo GSU</p>
                 <h3 className="text-xl font-black uppercase tracking-tight">Cálculo Ponderado</h3>
             </div>
          </div>

          <div className="bg-white p-8 rounded-[3.5rem] shadow-xl border border-slate-100">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-black uppercase tracking-tight">Fila de Prioridades</h2>
              <div className="bg-slate-50 px-4 py-2 rounded-2xl flex items-center gap-3 border w-64">
                <Search size={16} className="text-slate-400"/><input type="text" placeholder="BUSCAR UE..." className="bg-transparent border-none outline-none text-[10px] font-bold uppercase w-full" onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
            </div>
            <div className="space-y-4">
              {rankedSchools.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map((school, idx) => (
                <div key={idx} onClick={() => setSelectedSchool(school)} className="flex flex-col sm:flex-row items-center justify-between p-6 bg-slate-50 rounded-[2.5rem] hover:bg-white hover:shadow-xl transition-all border border-transparent hover:border-amber-400 cursor-pointer group">
                  <div className="flex items-center gap-6 flex-1 min-w-0">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner shrink-0 ${
                        idx === 0 ? 'bg-red-600 text-white' : 
                        idx === 1 ? 'bg-orange-500 text-white' : 
                        idx === 2 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'
                    }`}>{idx + 1}º</div>
                    <div className="min-w-0">
                      <h4 className="font-black text-slate-800 uppercase text-sm group-hover:text-amber-600 transition-colors truncate" title={school.name}>{school.name}</h4>
                      <p className="text-[9px] text-slate-400 font-bold uppercase italic mt-1">Clique para ver detalhes do cálculo</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 shrink-0 border-t sm:border-t-0 sm:border-l border-slate-200 pt-4 sm:pt-0 sm:pl-8 w-full sm:w-auto mt-4 sm:mt-0">
                    <div className="text-center sm:text-right flex-1 sm:flex-none">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Índice</p>
                      <p className="text-2xl font-black text-slate-900 tabular-nums">{school.finalScore.toFixed(2)}</p>
                    </div>
                    <div className="p-3 bg-white text-slate-300 rounded-xl group-hover:bg-amber-500 group-hover:text-white transition-all shadow-sm">
                      <ArrowUpRight size={20}/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Aba Configurações */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in zoom-in-95 duration-500">
          <div className="bg-white p-10 rounded-[3.5rem] shadow-xl border border-slate-100">
            <div className="flex justify-between items-center mb-8">
                <h3 className="font-black uppercase tracking-widest text-slate-800">Parâmetros Ativos</h3>
                <div className="flex gap-3">
                  <button onClick={() => {
                    setTempWeights(params.map(p => ({ id: p.id, nome: p.nome_parametro, peso: p.peso })));
                    setShowWeightModal(true);
                  }} className="px-6 py-3 bg-slate-900 text-white rounded-2xl flex items-center gap-2 hover:bg-black transition-all shadow-lg font-black text-[10px] uppercase">
                      <SlidersHorizontal size={16} /> Ajustar Pesos
                  </button>
                  <button onClick={() => {setShowModal(true); setStep(1);}} className="p-3 bg-amber-500 text-white rounded-2xl hover:scale-110 transition-all shadow-lg">
                      <Plus size={24} />
                  </button>
                </div>
            </div>
            <div className="space-y-4">
              {params.length === 0 && (
                <p className="text-slate-400 text-xs font-bold uppercase text-center py-8">Nenhum parâmetro cadastrado.</p>
              )}
              {params.map(p => (
                <div key={p.id} className="p-5 border border-slate-50 bg-slate-50/50 rounded-2xl flex justify-between items-center group hover:bg-white hover:shadow-md transition-all">
                  <div>
                    <p className="font-black text-sm uppercase text-slate-800">{p.nome_parametro}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">
                        Aba: {p.aba_nome} | Coluna Escola: {p.coluna_escola} | Coluna Nota: {p.coluna_pontuacao}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                      <span className="text-xs font-black text-amber-600">{p.peso}%</span>
                      <div className="h-1.5 w-24 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: `${p.peso}%` }}></div>
                      </div>
                  </div>
                </div>
              ))}
              {params.length > 0 && (
                <div className="pt-6 border-t border-slate-100 mt-6 flex justify-between items-center text-slate-500 font-black text-xs uppercase">
                  <span>TOTAL DISTRIBUÍDO:</span>
                  <span className={params.reduce((a, b) => a + b.peso, 0) > 100 ? 'text-red-500' : 'text-emerald-500'}>
                    {params.reduce((a, b) => a + b.peso, 0)}% / 100%
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-8">
            <div className="bg-amber-600 p-10 rounded-[3.5rem] text-white shadow-2xl flex flex-col justify-center relative overflow-hidden group">
              <Target size={120} className="absolute -right-8 -bottom-8 text-white/5 group-hover:scale-110 transition-transform" />
              <h3 className="text-2xl font-black uppercase mb-4">Como funciona o cálculo?</h3>
              <p className="text-sm font-medium opacity-90 leading-relaxed uppercase italic">
                O sistema acessa os links do Google Sheets cadastrados, busca as notas (0-100) da coluna informada e aplica o peso definido. 
                O ranking final é a soma ponderada de todos os parâmetros. 
                Ex: Uma escola com nota 50 em um parâmetro de peso 20% recebe 10 pontos na média final.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal Wizard de Configuração de Parâmetro */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95 relative">
            <h2 className="text-2xl font-black uppercase mb-2 tracking-tight">Novo Parâmetro</h2>
            <p className="text-slate-400 text-[10px] font-black uppercase mb-8 tracking-widest">Passo {step} de 2</p>

            {step === 1 ? (
              <div className="space-y-4">
                <Field label="Nome do Parâmetro" value={newParam.nome_parametro || ''} onChange={(v: string) => setNewParam({...newParam, nome_parametro: v})} placeholder="Ex: Evasão Escolar" />
                <Field label="ID da Planilha (URL)" value={newParam.spreadsheet_id || ''} onChange={(v: string) => {
                  const id = v.includes('d/') ? v.split('d/')[1].split('/')[0] : v;
                  setNewParam({...newParam, spreadsheet_id: id});
                }} placeholder="Cole o link completo da planilha aqui" />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Nome da Aba" value={newParam.aba_nome || ''} onChange={(v: string) => setNewParam({...newParam, aba_nome: v})} placeholder="Ex: Página1" />
                  <Field label="Coluna Escola" value={newParam.coluna_escola || ''} onChange={(v: string) => setNewParam({...newParam, coluna_escola: v})} placeholder="Ex: A" />
                </div>
                <Field label="Coluna Pontuação (0-100)" value={newParam.coluna_pontuacao || ''} onChange={(v: string) => setNewParam({...newParam, coluna_pontuacao: v})} placeholder="Ex: F" />
                
                {testStatus.error && (
                  <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3">
                    <AlertCircle size={20} className="shrink-0"/> 
                    <p className="text-[10px] font-bold uppercase leading-tight">{testStatus.error}</p>
                  </div>
                )}
                <button onClick={handleTestAndNext} disabled={testStatus.loading || !newParam.nome_parametro || !newParam.spreadsheet_id || !newParam.coluna_escola || !newParam.coluna_pontuacao} className="w-full mt-4 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all disabled:opacity-50">
                  {testStatus.loading ? <Loader2 className="animate-spin inline mr-2" size={18}/> : "Testar Conexão e Continuar"}
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center p-3 bg-emerald-50 text-emerald-600 rounded-2xl mb-4">
                    <CheckCircle2 size={32}/>
                  </div>
                  <h3 className="font-black uppercase text-slate-800">Conexão Estabelecida!</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Ajuste os Pesos (Total 100%)</p>
                </div>
                <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
                  {tempWeights.map(tw => (
                    <div key={tw.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm transition-all hover:border-amber-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-black uppercase text-slate-700">
                          {tw.nome} {tw.id === 'new' && <span className="ml-2 text-amber-500">★ NOVO</span>}
                        </span>
                        <span className="text-sm font-black text-amber-600">{tw.peso}%</span>
                      </div>
                      <input type="range" min="0" max="100" value={tw.peso} onChange={e => handleWeightChange(tw.id, parseInt(e.target.value))} className="w-full accent-amber-500" />
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 pt-4">
                   <button onClick={() => setStep(1)} className="flex-1 py-4 border-2 border-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all">Voltar</button>
                   <button onClick={saveAll} disabled={refreshing} className="flex-[2] py-4 bg-amber-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-amber-200 flex items-center justify-center gap-2 hover:bg-amber-600 transition-all disabled:opacity-50">
                      {refreshing ? <Loader2 className="animate-spin" size={16}/> : 'Finalizar e Salvar'}
                   </button>
                </div>
              </div>
            )}
            <button onClick={() => {setShowModal(false); setStep(1); setTestStatus({ loading: false });}} className="absolute top-6 right-6 text-slate-400 hover:text-red-500 transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>
      )}

      {/* Modal Ajuste Rápido de Pesos */}
      {showWeightModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95 relative">
            <h2 className="text-2xl font-black uppercase mb-2 tracking-tight">Ajustar Pesos</h2>
            <div className="space-y-6">
              <div className="text-center mb-6">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Distribua a importância de cada parâmetro</p>
              </div>
              <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
                {tempWeights.map(tw => (
                  <div key={tw.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm transition-all hover:border-amber-200">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black uppercase text-slate-700">
                        {tw.nome}
                      </span>
                      <span className="text-sm font-black text-amber-600">{tw.peso}%</span>
                    </div>
                    <input type="range" min="0" max="100" value={tw.peso} onChange={e => handleWeightChange(tw.id, parseInt(e.target.value))} className="w-full accent-amber-500" />
                  </div>
                ))}
              </div>
              <div className="flex gap-4 pt-4">
                 <button onClick={() => setShowWeightModal(false)} className="flex-1 py-4 border-2 border-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all">Cancelar</button>
                 <button onClick={updateWeights} disabled={refreshing} className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg flex items-center justify-center gap-2 hover:bg-black transition-all disabled:opacity-50">
                    {refreshing ? <Loader2 className="animate-spin" size={16}/> : 'Salvar Alterações'}
                 </button>
              </div>
            </div>
            <button onClick={() => setShowWeightModal(false)} className="absolute top-6 right-6 text-slate-400 hover:text-red-500 transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>
      )}

      {/* AQUI ESTÁ A CHAMADA DO MODAL DE DETALHES DA PONTUAÇÃO */}
      {renderDetailsModal()}

    </div>
  );
}

// --- Componentes Reutilizáveis ---
function Field({ label, value, onChange, placeholder }: FieldProps) {
  return (
    <div>
      <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">{label}</label>
      <input 
        type="text" 
        value={value} 
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} 
        placeholder={placeholder} 
        className="w-full bg-slate-50 border border-slate-100 p-3 rounded-xl text-xs font-bold uppercase outline-amber-500 transition-all focus:bg-white focus:shadow-md" 
      />
    </div>
  );
}

function Card({ icon, label, value, color }: {icon: React.ReactNode, label: string, value: number, color: string}) {
  const c = color === 'red' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600';
  return (
    <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl flex items-center gap-6">
      <div className={`w-16 h-16 ${c} rounded-[1.5rem] flex items-center justify-center`}>{icon}</div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest leading-none">{label}</p>
        <h3 className="text-3xl font-black text-slate-800">{value}</h3>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: {active: boolean, onClick: () => void, icon: React.ReactNode, label: string}) {
  return (
    <button onClick={onClick} className={`px-8 py-3.5 rounded-[1.5rem] text-[11px] font-black uppercase flex items-center gap-3 transition-all ${active ? 'bg-white text-amber-600 shadow-xl border border-amber-100' : 'text-slate-400 hover:text-slate-600'}`}>{icon}{label}</button>
  );
}

function AccessDenied() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
      <div className="w-24 h-24 bg-red-50 text-red-600 rounded-[2.5rem] flex items-center justify-center mb-6 shadow-xl border border-red-100"><Lock size={48} /></div>
      <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Acesso Restrito</h2>
      <p className="text-slate-500 font-medium mt-2 max-w-md uppercase text-xs tracking-widest leading-relaxed">
        Apenas a Direção Regional pode configurar parâmetros de priorização.
      </p>
      <button onClick={() => window.location.href = '/'} className="mt-8 px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all">
        Voltar ao Painel Geral
      </button>
    </div>
  );
}

export default EscolasPrioritarias;