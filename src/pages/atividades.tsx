import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase'; 
import { 
  Calendar, CalendarDays, Plus, 
  FileDown, Loader2, ClipboardList, CheckSquare, X
} from 'lucide-react';

interface Atividade {
  data: string;
  atividade: string;
  responsavel: string;
  status: string;
}

export default function RelatorioAtividades() {
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [userName, setUserName] = useState<string>('Carregando usuário...');

  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // Formato 'YYYY-MM'

  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzVrSkRmH8WLN1N49ZXf-JqbHt1mskGsjyxOUgdngwUp94vMn_TnW3RyCYAdygHlxIA/exec";

  const [formData, setFormData] = useState({
    data: new Date().toISOString().split('T')[0],
    atividade: '',
    responsavel: '',
    status: 'Concluído'
  });

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('pt-BR');
  };

  const getMonthYearString = (dateString: string) => {
    if (!dateString) return "";
    if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length >= 3) {
        const month = parts[1].padStart(2, '0');
        const year = parts[2].substring(0, 4);
        return `${year}-${month}`;
      }
    }
    const d = new Date(dateString);
    if (!isNaN(d.getTime())) {
       const month = String(d.getMonth() + 1).padStart(2, '0');
       const year = String(d.getFullYear());
       return `${year}-${month}`;
    }
    return "";
  };

  // --- NOVA FUNÇÃO PARA ORDENAÇÃO DE DATAS ---
  // Transforma "27/02/2026" em um valor numérico de tempo para o sistema conseguir ordenar
  const parseDateForSort = (dateStr: string) => {
    if (!dateStr) return 0;
    if (dateStr.includes('/')) {
      const [day, month, year] = dateStr.split('/');
      return new Date(`${year}-${month}-${day}T00:00:00`).getTime();
    }
    return new Date(dateStr).getTime();
  };

  useEffect(() => {
    fetchUser();
    fetchAtividades();
  }, []);

  const fetchUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('*') 
          .eq('id', user.id)
          .single();

        const nomeUsuario = profile?.nome || profile?.full_name || profile?.name || user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Usuário Desconhecido';
        
        setUserName(nomeUsuario);
        setFormData(prev => ({ ...prev, responsavel: nomeUsuario }));
      } else {
        setUserName('Iuri Barreto');
        setFormData(prev => ({ ...prev, responsavel: 'Iuri Barreto' }));
      }
    } catch (error) {
      console.error("Erro ao buscar usuário logado:", error);
      setUserName('Iuri Barreto');
      setFormData(prev => ({ ...prev, responsavel: 'Iuri Barreto' }));
    }
  };

  const fetchAtividades = async () => {
    setLoading(true);
    try {
      const response = await fetch(SCRIPT_URL);
      const data = await response.json();
      
      if (Array.isArray(data)) {
        setAtividades(data);
      }
    } catch (error) {
      console.error("Erro ao buscar dados da planilha:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      setFormData({ ...formData, atividade: '' }); 
      
      setTimeout(() => {
        fetchAtividades();
      }, 1500);

    } catch (error) {
      console.error("Erro ao salvar:", error);
      alert("Houve um erro ao registrar a atividade.");
    } finally {
      setSaving(false);
    }
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const loadScript = (src: string) => {
        return new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
          const script = document.createElement('script');
          script.src = src;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      };

      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');

      const element = document.getElementById('relatorio-mensal-template');
      if (!element) throw new Error("Template não encontrado.");

      element.style.display = 'block';

      const opt = {
        margin: [15, 15, 15, 15], 
        filename: `Relatorio_Atividades_${selectedMonth}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      await (window as any).html2pdf().set(opt).from(element).save();
      element.style.display = 'none';
      setExporting(false);
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar o PDF.");
      setExporting(false);
    }
  };

  // --- FILTROS COM ORDENAÇÃO DE DATA (MAIS RECENTE PRIMEIRO) ---
  
  const atividadesFiltradasPDF = atividades
    .filter(item => getMonthYearString(item.data) === selectedMonth)
    .sort((a, b) => parseDateForSort(b.data) - parseDateForSort(a.data)); // Ordena para o PDF

  const currentMonthYear = new Date().toISOString().slice(0, 7);
  
  const atividadesMesAtual = atividades
    .filter(item => getMonthYearString(item.data) === currentMonthYear)
    .sort((a, b) => parseDateForSort(b.data) - parseDateForSort(a.data)); // Ordena para a tela

  const [selYear, selMonth] = selectedMonth.split('-');
  const dataReferenciaPDF = new Date(Number(selYear), Number(selMonth) - 1, 1);
  const mesExtensoPDF = dataReferenciaPDF.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

  return (
    <div className="space-y-6 pb-20 relative">
      
      {isPdfModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden border border-slate-100">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <FileDown size={20} className="text-indigo-600"/> Exportar Relatório
              </h3>
              <button onClick={() => setIsPdfModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                <X size={20}/>
              </button>
            </div>
            
            <div className="p-6 space-y-4 bg-slate-50/50">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Mês de Referência</label>
              <input 
                type="month" 
                className="w-full p-4 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-700 focus:border-indigo-500 outline-none transition-all shadow-sm"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
              />
              
              <div className="mt-4 flex items-center justify-between bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                <span className="text-xs font-bold text-indigo-800 uppercase">Atividades neste mês:</span>
                <span className="text-lg font-black text-indigo-600">{atividadesFiltradasPDF.length}</span>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-white">
              <button 
                onClick={() => setIsPdfModalOpen(false)} 
                className="px-6 py-2.5 text-[11px] font-black text-slate-500 uppercase tracking-widest hover:text-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  setIsPdfModalOpen(false);
                  handleExportPDF();
                }}
                disabled={exporting || atividadesFiltradasPDF.length === 0}
                className="px-8 py-2.5 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 disabled:opacity-50 flex items-center gap-2 transition-all active:scale-95"
              >
                {exporting ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                Gerar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template PDF */}
      <div id="relatorio-mensal-template" style={{ display: 'none', background: 'white', width: '100%', padding: '30px' }}>
        <div style={{ borderBottom: '2px solid #1e293b', paddingBottom: '20px', marginBottom: '30px', textAlign: 'center' }}>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' }}>Governo do Estado de São Paulo</h1>
            <h2 style={{ margin: '5px 0 0', fontSize: '16px', fontWeight: 700, color: '#334155' }}>Relatório Mensal de Atividades - SGE/GSU</h2>
            <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 800 }}>Referência: {mesExtensoPDF}</p>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
            <thead>
                <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '11px', textAlign: 'left', width: '100px' }}>DATA</th>
                    <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '11px', textAlign: 'left' }}>DESCRIÇÃO DA ATIVIDADE</th>
                    <th style={{ padding: '12px', border: '1px solid #cbd5e1', fontSize: '11px', textAlign: 'center', width: '110px' }}>STATUS</th>
                </tr>
            </thead>
            <tbody>
                {atividadesFiltradasPDF.map((item, idx) => (
                    <tr key={idx}>
                        <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '10px', fontWeight: 700, textAlign: 'center' }}>{formatDate(item.data)}</td>
                        <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '11px' }}>{item.atividade}</td>
                        <td style={{ padding: '10px', border: '1px solid #cbd5e1', fontSize: '10px', textAlign: 'center' }}>{item.status}</td>
                    </tr>
                ))}
            </tbody>
        </table>

        <div style={{ marginTop: '80px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', width: '300px' }}>
                <div style={{ borderBottom: '1px solid #000', marginBottom: '10px' }}></div>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 800 }}>{userName}</p>
                <p style={{ margin: '2px 0 0', fontSize: '10px', color: '#475569', textTransform: 'uppercase' }}>Chefe de Seção</p>
                <p style={{ margin: '2px 0 0', fontSize: '9px', color: '#94a3b8' }}>Agente de Organização Escolar</p>
            </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
            <ClipboardList size={24}/>
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Diário de Atividades</h1>
            <p className="text-slate-500 text-sm font-medium">Registro operacional e geração de relatórios gerenciais.</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => setIsPdfModalOpen(true)}
            disabled={atividades.length === 0}
            className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
          >
            <FileDown size={18} />
            GERAR RELATÓRIO (PDF)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-6 flex items-center gap-2">
              <Plus size={18} className="text-indigo-600" /> Novo Registro
            </h3>
            
            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Data da Atividade</label>
                <input 
                  type="date" 
                  required
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold transition-all focus:border-indigo-500 focus:bg-white outline-none text-slate-700 text-sm"
                  value={formData.data}
                  onChange={e => setFormData({...formData, data: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Responsável</label>
                <input 
                  type="text" 
                  disabled
                  className="w-full p-3 bg-slate-100 border-2 border-slate-100 rounded-2xl font-bold text-slate-400 text-sm cursor-not-allowed"
                  value={userName}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Descrição / Ação Realizada</label>
                <textarea 
                  required
                  rows={4}
                  placeholder="Ex: Análise de processos SEI, atendimento a diretores..."
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-medium transition-all focus:border-indigo-500 focus:bg-white outline-none text-slate-700 text-sm resize-none"
                  value={formData.atividade}
                  onChange={e => setFormData({...formData, atividade: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Status</label>
                <select 
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold transition-all focus:border-indigo-500 focus:bg-white outline-none text-slate-700 text-sm"
                  value={formData.status}
                  onChange={e => setFormData({...formData, status: e.target.value})}
                >
                  <option value="Concluído">Concluído</option>
                  <option value="Em Andamento">Em Andamento</option>
                  <option value="Aguardando Retorno">Aguardando Retorno</option>
                </select>
              </div>

              <button 
                type="submit" 
                disabled={saving}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-200 hover:bg-indigo-700 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest text-[11px]"
              >
                {saving ? <Loader2 className="animate-spin" size={18}/> : <CheckSquare size={18}/>}
                Registrar Atividade
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 h-full">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-8 flex items-center gap-2">
              <CalendarDays size={18} className="text-indigo-600" /> Registros do Mês Atual
            </h3>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="animate-spin text-indigo-600" size={32}/>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sincronizando com a planilha...</span>
              </div>
            ) : atividadesMesAtual.length === 0 ? (
              <div className="text-center py-20 text-slate-400 font-medium text-sm">
                Nenhuma atividade registrada neste mês.
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-[1.25rem] top-4 bottom-4 w-0.5 bg-gradient-to-b from-indigo-200 via-indigo-100 to-transparent rounded-full"></div>
                
                <div className="space-y-6">
                  {atividadesMesAtual.map((item, idx) => (
                    <div key={idx} className="relative pl-12 group">
                      <div className="absolute left-[0.8rem] top-1.5 w-4 h-4 rounded-full border-4 border-white bg-indigo-500 shadow-md transition-transform group-hover:scale-125 z-10"></div>
                      
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100/60 hover:border-indigo-100 hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-2">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-100/50 px-2 py-1 rounded-md">
                            <Calendar size={12}/> {formatDate(item.data)}
                          </span>
                          <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md ${
                            item.status === 'Concluído' ? 'bg-emerald-100 text-emerald-700' : 
                            item.status === 'Em Andamento' ? 'bg-amber-100 text-amber-700' : 
                            'bg-slate-200 text-slate-600'
                          }`}>
                            {item.status}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 font-medium leading-relaxed">
                          {item.atividade}
                        </p>
                        <div className="mt-3 text-[10px] font-bold text-slate-400 uppercase">
                          Registrado por: {item.responsavel}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}