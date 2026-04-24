import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Search, Loader2, ShieldAlert, RefreshCw, ArrowUpRight, Lock, AlertCircle, CheckCircle2
} from 'lucide-react';

// --- Interfaces ---
interface SchoolScore {
  name: string;
  score: number;
}

interface SheetConfig {
  id?: string;
  spreadsheet_id: string;
  aba_nome: string;
  coluna_escola: string;
  coluna_pontuacao: string;
}

export function EscolasPrioritarias() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'painel' | 'config'>('painel');
  const [searchTerm, setSearchTerm] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  
  const [rankedSchools, setRankedSchools] = useState<SchoolScore[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [config, setConfig] = useState<SheetConfig>({
    spreadsheet_id: '14YgaK4ArsWkeAdQdl2ttAhyz0-gkFWR_scyPOFLk8E8',
    aba_nome: 'RESUMO',
    coluna_escola: 'A',
    coluna_pontuacao: 'H'
  });

  // --- Inicialização ---
  useEffect(() => {
    checkAccessAndLoad();
  }, []);

  async function checkAccessAndLoad() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      setUserRole(profile?.role || '');
      
      if (profile?.role === 'regional_admin') {
        const { data: dbParams } = await supabase.from('ranking_parameters').select('*').limit(1).single();
        if (dbParams) {
          const newConfig = {
            id: dbParams.id,
            spreadsheet_id: dbParams.spreadsheet_id,
            aba_nome: dbParams.aba_nome,
            coluna_escola: dbParams.coluna_escola,
            coluna_pontuacao: dbParams.coluna_pontuacao
          };
          setConfig(newConfig);
          await loadRankingFromSheet(newConfig);
        } else {
          await loadRankingFromSheet(config);
        }
      }
    }
    setLoading(false);
  }

  const getColIndex = (col: string) => {
    const name = col.trim().toUpperCase();
    let index = 0;
    for (let i = 0; i < name.length; i++) {
      index = index * 26 + (name.charCodeAt(i) - 64);
    }
    return index - 1;
  };

  async function loadRankingFromSheet(currentConfig: SheetConfig) {
    setRefreshing(true);
    setTestError(null);
    try {
      const url = `https://docs.google.com/spreadsheets/d/${currentConfig.spreadsheet_id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(currentConfig.aba_nome)}`;
      const res = await fetch(url);
      
      if (!res.ok) throw new Error("Erro de acesso à planilha. Verifique o link e o nome da aba.");
      const csv = await res.text();
      
      if (csv.trim().startsWith('<')) throw new Error("Aba não encontrada ou restrita.");

      const rows: string[][] = [];
      let quote = false;
      for (let row = 0, col = 0, c = 0; c < csv.length; c++) {
        let cc = csv[c], nc = csv[c+1];
        rows[row] = rows[row] || [];
        rows[row][col] = rows[row][col] || '';
        if (cc === '"' && quote && nc === '"') { rows[row][col] += cc; ++c; continue; }
        if (cc === '"') { quote = !quote; continue; }
        if (cc === ',' && !quote) { ++col; continue; }
        if (cc === '\n' && !quote) { ++row; col = 0; continue; }
        if (cc !== '\r') rows[row][col] += cc;
      }
      
      const colEscola = getColIndex(currentConfig.coluna_escola);
      const colNota = getColIndex(currentConfig.coluna_pontuacao);
      const parsedSchools: SchoolScore[] = [];

      rows.forEach((row, idx) => {
        if (idx === 0) return;
        const name = row[colEscola]?.replace(/^"|"$/g, '').trim();
        const rawScore = row[colNota]?.replace(/^"|"$/g, '').trim();

        if (name && name.length > 3) {
          const score = parseFloat(rawScore?.replace(/\./g, '').replace(',', '.') || '0');
          parsedSchools.push({ name: name.toUpperCase(), score });
        }
      });

      // ORDENAÇÃO CRESCENTE: Menores notas (mais prioritárias) no topo
      parsedSchools.sort((a, b) => a.score - b.score);

      setRankedSchools(parsedSchools);
      setLastUpdate(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    } catch (err: any) {
      console.error(err);
      setTestError(err.message || "Falha ao processar a planilha.");
    }
    setRefreshing(false);
  }

  const saveConfig = async () => {
    setRefreshing(true);
    setTestError(null);
    setSaveSuccess(false);
    try {
      await supabase.from('ranking_parameters').delete().neq('id', '0');
      const { data, error } = await supabase.from('ranking_parameters').insert([{
        nome_parametro: 'Planilha Unificada',
        spreadsheet_id: config.spreadsheet_id,
        aba_nome: config.aba_nome,
        coluna_escola: config.coluna_escola,
        coluna_pontuacao: config.coluna_pontuacao,
        peso: 100
      }]).select().single();

      if (error) throw error;
      setConfig(prev => ({ ...prev, id: data.id }));
      await loadRankingFromSheet(config);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error(err);
      setTestError("Erro ao salvar configurações no banco de dados.");
    }
    setRefreshing(false);
  }

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-amber-500" size={48} /></div>;
  if (userRole !== 'regional_admin') return <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 text-center"><div className="w-24 h-24 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mb-6"><Lock size={48} /></div><h2 className="text-2xl font-black uppercase text-slate-800">Acesso Restrito</h2></div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 pb-24 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-amber-500 rounded-3xl text-white shadow-xl"><ShieldAlert size={32} /></div>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900 leading-none">Ranking de Prioridade</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest italic">Critério: Menor pontuação = Maior urgência</p>
          </div>
        </div>
        <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1 border">
          <button onClick={() => setActiveTab('painel')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'painel' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-400'}`}>Ranking</button>
          <button onClick={() => setActiveTab('config')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'config' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-400'}`}>Ajustar Fonte</button>
        </div>
      </div>

      {testError && activeTab === 'painel' && (
        <div className="p-4 bg-red-50 text-red-600 rounded-2xl flex items-center gap-3 border border-red-100">
          <AlertCircle size={20} className="shrink-0" />
          <p className="text-xs font-bold uppercase">{testError}</p>
        </div>
      )}

      {activeTab === 'painel' ? (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm flex-1">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Unidades Mapeadas</p>
              <h2 className="text-4xl font-black text-slate-800">{rankedSchools.length}</h2>
            </div>
            <button onClick={() => loadRankingFromSheet(config)} disabled={refreshing} className="bg-slate-900 p-8 rounded-[2.5rem] text-white flex-1 flex items-center justify-between hover:bg-black transition-all group disabled:opacity-50">
              <div className="text-left">
                <p className="text-[10px] font-black text-amber-400 uppercase mb-1">Última leitura: {lastUpdate || '--:--'}</p>
                <h2 className="text-xl font-black uppercase">{refreshing ? 'Sincronizando...' : 'Sincronizar Planilha'}</h2>
              </div>
              <RefreshCw size={32} className={`${refreshing ? 'animate-spin' : ''} opacity-30 group-hover:opacity-100 transition-all`} />
            </button>
          </div>

          <div className="bg-white rounded-[3rem] p-6 sm:p-10 border shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-10 gap-4">
              <h3 className="text-xl font-black uppercase text-slate-800">Fila de Fiscalização</h3>
              <div className="bg-slate-50 border rounded-2xl px-4 py-2 flex items-center gap-3 w-full sm:w-72">
                <Search size={16} className="text-slate-400" />
                <input type="text" placeholder="BUSCAR ESCOLA..." className="bg-transparent border-none outline-none text-[10px] font-bold uppercase w-full" onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
            </div>

            <div className="space-y-3">
              {rankedSchools.length === 0 && !refreshing && !testError && (
                <p className="text-center text-slate-400 py-10 font-bold uppercase text-xs">Nenhuma escola lida. Verifique a configuração da planilha.</p>
              )}
              
              {rankedSchools.filter(s => s.name.includes(searchTerm.toUpperCase())).map((school, idx) => (
                <div key={idx} className={`group flex flex-col sm:flex-row items-center justify-between p-5 rounded-3xl border transition-all gap-4 ${
                  idx < 10 ? 'bg-red-50/50 border-red-100 hover:border-red-400 shadow-sm' : 'bg-slate-50 border-transparent hover:border-amber-200'
                }`}>
                  <div className="flex items-center gap-5 w-full sm:w-auto">
                    <div className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl ${
                      idx < 3 ? 'bg-red-600 text-white shadow-lg' : 'bg-white border text-slate-400'
                    }`}>
                      {idx + 1}º
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black uppercase text-sm text-slate-800 truncate" title={school.name}>{school.name}</h4>
                      {idx < 10 && <span className="inline-block mt-1 px-2 py-0.5 bg-red-600 text-white text-[8px] font-black rounded-full uppercase tracking-widest">Prioridade Máxima</span>}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-6 w-full sm:w-auto pt-4 sm:pt-0 border-t sm:border-t-0 border-slate-200">
                    <div className="text-right">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pontuação Final</p>
                      <p className="text-3xl font-black text-slate-900 tabular-nums">{school.score.toFixed(2)}</p>
                    </div>
                    <ArrowUpRight className="text-slate-300" size={20} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[3rem] p-8 sm:p-12 border shadow-sm animate-in zoom-in-95 max-w-4xl mx-auto">
          <div className="mb-10 text-center">
            <h3 className="text-2xl font-black uppercase text-slate-800">Conexão com Google Sheets</h3>
            <p className="text-xs font-bold text-slate-400 uppercase mt-2 tracking-widest">Configure a aba e as colunas da planilha resumo</p>
          </div>

          {testError && (
            <div className="mb-8 p-4 bg-red-50 text-red-600 rounded-2xl flex items-center gap-3 border border-red-100">
              <AlertCircle size={20} className="shrink-0" />
              <p className="text-xs font-bold uppercase">{testError}</p>
            </div>
          )}

          {saveSuccess && (
            <div className="mb-8 p-4 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center gap-3 border border-emerald-100">
              <CheckCircle2 size={20} className="shrink-0" />
              <p className="text-xs font-bold uppercase">Configuração salva e ranking atualizado com sucesso!</p>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Link ou ID da Planilha</label>
              <input type="text" value={config.spreadsheet_id} onChange={(e) => {
                let val = e.target.value;
                if (val.includes('/d/')) val = val.split('/d/')[1].split('/')[0];
                setConfig({...config, spreadsheet_id: val});
              }} className="w-full bg-slate-50 border p-4 rounded-2xl text-sm font-bold outline-amber-500" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Nome da Aba</label>
                <input type="text" value={config.aba_nome} onChange={(e) => setConfig({...config, aba_nome: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-2xl text-sm font-bold" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Coluna Escola</label>
                <input type="text" value={config.coluna_escola} onChange={(e) => setConfig({...config, coluna_escola: e.target.value.toUpperCase()})} className="w-full bg-slate-50 border p-4 rounded-2xl text-sm font-bold text-center uppercase" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Coluna Pontuação (H)</label>
                <input type="text" value={config.coluna_pontuacao} onChange={(e) => setConfig({...config, coluna_pontuacao: e.target.value.toUpperCase()})} className="w-full bg-slate-50 border p-4 rounded-2xl text-sm font-bold text-center uppercase" />
              </div>
            </div>

            <div className="pt-8 flex justify-end">
              <button onClick={saveConfig} disabled={refreshing} className="px-10 py-5 bg-amber-500 text-white rounded-2xl font-black uppercase text-xs hover:bg-amber-600 transition-all shadow-lg shadow-amber-200 flex items-center gap-3 disabled:opacity-50">
                {refreshing ? <Loader2 className="animate-spin" size={18} /> : 'Salvar Configuração'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EscolasPrioritarias;