import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { UploadCloud, Calendar, Building, AlertCircle, Info, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import * as xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// Inicialização do Supabase
// ─────────────────────────────────────────────────────────────────────────────
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Tipagens ---
interface ChartData {
  date: string;
  sortKey?: number;
  [element: string]: any;
}
interface School { id: string; name: string; cie_code: number | string }
interface User { role: string; schoolId?: string | null; }

const SCORE_MAP: Record<string, number> = { 'MB': 5, 'B': 4, 'R': 2, 'MR': 1 };
const META_COLUMNS = new Set(['Data', 'date', 'Data_Vistoria', 'created_at', 'Unidade Regional de Ensino', 'Unidade de Ensino', 'Escola', 'name', 'CIE', 'Cie', 'cie_code', 'CIE_ESCOLA', 'Nota', 'PN Pont', 'PN Texto', 'PP Pont', 'PP Texto', 'id', 'email', 'phone', 'address', 'zip_code', 'director_name']);

function extractCieFromName(schoolName: string | number): number | null {
  if (!schoolName) return null;
  const str = String(schoolName).trim();
  const match = str.match(/(\d+)\D*$/);
  return match ? parseInt(match[1], 10) : null;
}

export default function VistoriasPrediaisDashboard() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [metrics, setMetrics] = useState<ChartData[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<string>('all');
  const [selectedEnv, setSelectedEnv] = useState<string>('all');
  const [schoolsList, setSchoolsList] = useState<School[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadUserProfile() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return; 

      const { data: profile, error: profError } = await supabase
        .from('profiles')
        .select('role, school_id')
        .eq('id', user.id)
        .single();

      if (profError) {
        console.error("Erro ao carregar perfil:", profError.message);
        return;
      }

      if (profile) {
        setCurrentUser({ role: profile.role, schoolId: profile.school_id });
      }
    }
    loadUserProfile();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    fetchLastUpdate();
    if (currentUser.role !== 'school_manager') fetchSchoolsList();
    fetchMetrics(selectedSchool, currentUser);
  }, [currentUser, selectedSchool]);

  const fetchLastUpdate = async () => {
    const { data, error } = await supabase.from('system_metadata').select('updated_at').eq('key', 'last_predial_inspection_update').maybeSingle();
    if (error) console.error("Erro metadata:", error.message);
    if (data) setLastUpdate(new Date(data.updated_at).toLocaleDateString('pt-BR'));
  };

  const fetchSchoolsList = async () => {
    const { data, error } = await supabase.from('schools').select('id, name, cie_code').order('name', { ascending: true }).limit(1000);
    if (error) console.error("Erro escolas:", error.message);
    if (data) setSchoolsList(data);
  };

  const fetchMetrics = async (schoolIdFilter: string, loggedUser: User) => {
    let query = supabase.from('building_inspections').select('inspection_date, element_evaluated, score');
    if (loggedUser.role === 'school_manager') {
      if (!loggedUser.schoolId) { setMetrics([]); return; }
      query = query.eq('school_id', loggedUser.schoolId);
    } 
    else if (schoolIdFilter !== 'all') query = query.eq('school_id', schoolIdFilter);

    const { data, error } = await query;
    if (error) {
      console.error("Erro métricas:", error.message);
      return;
    }
    if (!data) return;

    const groupedData: Record<string, any> = {};
    data.forEach(item => {
      const dateObj = new Date(item.inspection_date);
      const monthYear = `${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}/${dateObj.getUTCFullYear()}`;
      if (!groupedData[monthYear]) groupedData[monthYear] = { date: monthYear, sortKey: new Date(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), 1).getTime(), count: {} };
      const el = item.element_evaluated;
      if (!groupedData[monthYear][el]) { groupedData[monthYear][el] = 0; groupedData[monthYear].count[el] = 0; }
      groupedData[monthYear][el] += item.score;
      groupedData[monthYear].count[el] += 1;
    });

    const chartData: ChartData[] = Object.values(groupedData).sort((a: any, b: any) => a.sortKey - b.sortKey).map((group: any) => {
      const formattedGroup: ChartData = { date: group.date };
      Object.keys(group).forEach(key => {
        if (key !== 'date' && key !== 'count' && key !== 'sortKey') formattedGroup[key] = Number((group[key] / group.count[key]).toFixed(2));
      });
      return formattedGroup;
    });
    setMetrics(chartData);
  };

  const calculateRanking = () => {
    if (metrics.length === 0) return { top: [], bottom: [] };
    const totals: Record<string, { sum: number, count: number }> = {};
    metrics.forEach(month => {
      Object.keys(month).forEach(key => {
        if (key !== 'date' && key !== 'sortKey') {
          if (!totals[key]) totals[key] = { sum: 0, count: 0 };
          totals[key].sum += month[key];
          totals[key].count += 1;
        }
      });
    });
    const result = Object.keys(totals).map(key => ({ name: key, score: Number((totals[key].sum / totals[key].count).toFixed(2)) })).sort((a, b) => b.score - a.score);
    return { top: result.slice(0, 5), bottom: [...result].reverse().slice(0, 5) };
  };

  const { top, bottom } = calculateRanking();

  const getScoreColor = (score: number) => {
    if (score >= 4.5) return 'text-green-600 bg-green-50';
    if (score >= 3.5) return 'text-blue-600 bg-blue-50';
    if (score >= 2.5) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const workbook = xlsx.read(arrayBuffer, { type: 'array', codepage: 65001 });
        const jsonSheet: any[] = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        const normalizedSheet = jsonSheet.map(row => {
          const cleanRow: any = {};
          Object.keys(row).forEach(key => { cleanRow[key.replace(/^\uFEFF/, '').trim()] = row[key]; });
          return cleanRow;
        });
        const allCieCodes = normalizedSheet.map(row => extractCieFromName(row['Unidade de Ensino'])).filter(c => c !== null) as number[];
        
        const { data: schoolsData, error: schoolErr } = await supabase.from('schools').select('id, cie_code').in('cie_code', allCieCodes.map(String));
        if (schoolErr) throw schoolErr;

        const schoolMap = new Map((schoolsData || []).map(s => [Number(s.cie_code), s.id]));

        const payloadToInsert: any[] = [];
        normalizedSheet.forEach(row => {
          const cieCode = extractCieFromName(row['Unidade de Ensino']);
          if (!cieCode || !schoolMap.has(cieCode)) return;
          const inspectionDate = String(row['Data']).split(' ')[0];
          Object.keys(row).forEach(col => {
            if (META_COLUMNS.has(col)) return;
            const numericScore = SCORE_MAP[String(row[col]).trim().toUpperCase()];
            if (numericScore !== undefined) payloadToInsert.push({ school_id: schoolMap.get(cieCode), inspection_date: inspectionDate, element_evaluated: col, score: numericScore });
          });
        });

        if (payloadToInsert.length > 0) {
          const { error: upsertErr } = await supabase.from('building_inspections').upsert(payloadToInsert, { onConflict: 'school_id, inspection_date, element_evaluated', ignoreDuplicates: true });
          if (upsertErr) throw upsertErr;

          await supabase.from('system_metadata').upsert({ key: 'last_predial_inspection_update', updated_at: new Date().toISOString() });
          setUploadSuccess(`${payloadToInsert.length} registros salvos com sucesso.`);
          fetchMetrics(selectedSchool, currentUser);
        } else {
          setUploadError('Nenhum dado válido encontrado no arquivo.');
        }
      } catch (err: any) { 
        setUploadError(err.message); 
      } finally { 
        setIsUploading(false); 
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  const allElements = metrics.length > 0 ? Object.keys(metrics[0]).filter(k => k !== 'date' && k !== 'count' && k !== 'sortKey') : [];
  const chartElements = selectedEnv === 'all' ? allElements : allElements.filter(el => el.startsWith(selectedEnv));

  if (!currentUser) return <div className="p-6 flex items-center justify-center min-h-screen bg-gray-50 text-gray-500">Carregando permissões...</div>;

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 bg-white p-5 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Building className="w-7 h-7 text-blue-600" />Vistorias de Manutenção Predial</h1>
          <p className="text-sm text-gray-500 mt-2 flex items-center gap-1"><Calendar className="w-4 h-4" />Última sincronização: <span className="font-semibold text-gray-700">{lastUpdate || 'Carregando...'}</span></p>
        </div>
        {currentUser.role === 'regional_admin' && (
          <label className={`flex items-center gap-2 text-white px-5 py-2.5 rounded-md shadow-sm transition-all ${isUploading ? 'bg-blue-400 cursor-wait' : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'}`}>
            <UploadCloud className="w-5 h-5" />{isUploading ? 'Processando...' : 'Importar Relatório'}
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={isUploading}/>
          </label>
        )}
      </div>

      {/* FEEDBACK DE UPLOAD */}
      {uploadError && (
        <div className="mb-4 flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}
      {uploadSuccess && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm font-medium">
          ✓ {uploadSuccess}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          LEGENDA DE SIGLAS (Adicionado logo abaixo do Header principal)
          ───────────────────────────────────────────────────────────── */}
      <div className="mb-6 bg-slate-50 p-5 rounded-lg shadow-sm border border-slate-200 text-sm text-slate-700">
        <div className="flex items-center gap-2 mb-3 text-slate-800 font-semibold border-b border-slate-200 pb-2">
          <Info className="w-5 h-5 text-blue-600" />
          Guia de Referência das Avaliações
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Notas */}
          <div>
            <h3 className="font-semibold text-slate-800 mb-1">Conceitos (Notas)</h3>
            <ul className="space-y-1">
              <li><span className="font-medium text-blue-700">MB</span> - Muito Bom (5)</li>
              <li><span className="font-medium text-blue-700">B</span> - Bom (4)</li>
              <li><span className="font-medium text-blue-700">R</span> - Ruim (2)</li>
              <li><span className="font-medium text-blue-700">MR</span> - Muito Ruim (1)</li>
            </ul>
          </div>

          {/* Ambientes */}
          <div>
            <h3 className="font-semibold text-slate-800 mb-1">Cabeçalho (Ambientes)</h3>
            <ul className="space-y-1 grid grid-cols-2 gap-x-2">
              <li><span className="font-medium text-blue-700">A1</span> - Amb. Sala</li>
              <li><span className="font-medium text-blue-700">A2</span> - Amb. Pedagógico</li>
              <li><span className="font-medium text-blue-700">A3F</span> - Banh. Feminino</li>
              <li><span className="font-medium text-blue-700">A3M</span> - Banh. Masculino</li>
              <li><span className="font-medium text-blue-700">A4</span> - Amb. Tecnologias</li>
              <li><span className="font-medium text-blue-700">A5</span> - Amb. Administrativos</li>
              <li><span className="font-medium text-blue-700">A6</span> - Cozinhas e Refeitórios</li>
              <li><span className="font-medium text-blue-700">A7</span> - Áreas Gerais</li>
              <li><span className="font-medium text-blue-700">PN</span> - Pontuação Negativa</li>
              <li><span className="font-medium text-blue-700">PP</span> - Pontuação Positiva</li>
            </ul>
          </div>

          {/* Fatores */}
          <div>
            <h3 className="font-semibold text-slate-800 mb-1">Fatores Avaliados</h3>
            <ul className="space-y-1 grid grid-cols-2 gap-x-2">
              <li><span className="font-medium text-blue-700">Cons</span> - Conservação</li>
              <li><span className="font-medium text-blue-700">Limp</span> - Limpeza</li>
              <li><span className="font-medium text-blue-700">Mob</span> - Mobiliário</li>
              <li><span className="font-medium text-blue-700">Armz</span> - Armazenagem</li>
              <li><span className="font-medium text-blue-700">Equip</span> - Equip. Tecnológicos</li>
              <li><span className="font-medium text-blue-700">Prepa</span> - Prep. Alimentação</li>
              <li><span className="font-medium text-blue-700">Repo</span> - Reposição Produtos</li>
              <li><span className="font-medium text-blue-700">Acessos</span> - Áreas Externas</li>
              <li><span className="font-medium text-blue-700">Manu</span> - Manutenções</li>
              <li><span className="font-medium text-blue-700">Dedet</span> - Dedetizações</li>
            </ul>
          </div>
        </div>
      </div>

      {/* RANKINGS */}
      {metrics.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-5 rounded-lg shadow-sm border border-green-100">
            <h3 className="text-sm font-bold text-green-800 uppercase mb-4 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-500" /> Destaques Positivos (Top 5)</h3>
            <div className="space-y-3">
              {top.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{item.name}</span>
                  <div className="flex items-center gap-3 w-2/3">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{ width: `${(item.score / 5) * 100}%` }}></div></div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${getScoreColor(item.score)}`}>{item.score}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white p-5 rounded-lg shadow-sm border border-orange-100">
            <h3 className="text-sm font-bold text-orange-800 uppercase mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-orange-500" /> Oportunidades de Melhoria</h3>
            <div className="space-y-3">
              {bottom.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{item.name}</span>
                  <div className="flex items-center gap-3 w-2/3">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-orange-400 rounded-full" style={{ width: `${(item.score / 5) * 100}%` }}></div></div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${getScoreColor(item.score)}`}>{item.score}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* FILTROS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {currentUser.role !== 'school_manager' && (
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Unidade Escolar</label>
            <select className="w-full p-2 border rounded bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500" value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)}>
              <option value="all">Média de Todas as Escolas</option>
              {schoolsList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        <div className={`bg-white p-4 rounded-lg shadow-sm border border-gray-200 ${currentUser.role === 'school_manager' ? 'md:col-span-2' : ''}`}>
          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Ambiente Específico</label>
          <select className="w-full p-2 border rounded bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500" value={selectedEnv} onChange={(e) => setSelectedEnv(e.target.value)}>
            <option value="all">Todos os Ambientes</option>
            <option value="A1">A1 - Ambiente Sala</option>
            <option value="A2">A2 - Ambiente Pedagógico</option>
            <option value="A3F">A3F - Banheiro Feminino</option>
            <option value="A3M">A3M - Banheiro Masculino</option>
            <option value="A4">A4 - Ambiente Tecnologias</option>
            <option value="A5">A5 - Ambiente Administrativo</option>
            <option value="A6">A6 - Cozinhas e Refeitórios</option>
            <option value="A7">A7 - Áreas Gerais</option>
          </select>
        </div>
      </div>

      {/* GRÁFICO */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-500" /> Evolução Histórica Anual</h2>
        {metrics.length > 0 ? (
          <div className="h-[450px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} />
                <YAxis 
                  domain={[0, 5]} 
                  ticks={[1, 2, 4, 5]} 
                  axisLine={false} 
                  tickLine={false}
                  tickFormatter={(v: number) => {
                    const labels = { 1: 'MR', 2: 'R', 4: 'B', 5: 'MB' };
                    return labels[v as keyof typeof labels] || '';
                  }} 
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => {
                    const labels = { 1: 'MR', 2: 'R', 4: 'B', 5: 'MB' };
                    const roundedValue = Math.round(value);
                    return [labels[roundedValue as keyof typeof labels] || value, "Avaliação"];
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                {chartElements.map((el, i) => (
                  <Line 
                    key={el} 
                    type="monotone" 
                    dataKey={el} 
                    stroke={['#2563eb', '#16a34a', '#dc2626', '#ca8a04', '#9333ea', '#0891b2', '#ea580c', '#4f46e5', '#db2777'][i % 9]} 
                    strokeWidth={3} 
                    dot={{r: 4, strokeWidth: 2, fill: '#fff'}} 
                    activeDot={{r: 6, strokeWidth: 0}}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-60 flex flex-col items-center justify-center text-gray-400 bg-gray-50 border-2 border-dashed rounded-lg border-gray-200">
            <AlertCircle className="w-8 h-8 mb-2" /><p className="font-medium">Nenhum dado carregado para esta seleção.</p>
          </div>
        )}
      </div>
    </div>
  );
}