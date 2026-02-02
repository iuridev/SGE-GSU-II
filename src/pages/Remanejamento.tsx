import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Plus, Search, Package, Image as ImageIcon, 
  Trash2, Upload, Loader2, 
  CheckCircle2, X, Building2, Tag, 
  ArrowRightLeft, Hash, ListOrdered,
  Hand, Check, Ban, AlertCircle, Info, FileDown,
  Clock, History as Archive
} from 'lucide-react';

interface InventoryItem {
  id: string;
  school_id: string;
  batch_id: string;
  item_name: string;
  asset_number: string;
  description: string;
  image_url: string;
  status: string;
  status_notes: string | null;
  interested_school_id: string | null;
  approval_number: number | null;
  approval_year: number | null;
  created_at: string;
  schools?: { name: string };
  interested_school?: { name: string };
}

interface InventoryBatch {
  batch_id: string;
  item_name: string;
  description: string;
  image_url: string;
  status: string;
  status_notes: string | null;
  school_id: string;
  school_name: string;
  interested_school_id: string | null;
  interested_school_name?: string;
  approval_number: number | null;
  approval_year: number | null;
  assets: { id: string, asset_number: string }[];
  created_at: string;
}

export function Remanejamento() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  
  const [rejectNotes, setRejectNotes] = useState('');
  const [batchToReject, setBatchToReject] = useState<InventoryBatch | null>(null);
  const [batchToExport, setBatchToExport] = useState<InventoryBatch | null>(null);

  const [quantity, setQuantity] = useState(1);
  const [assetNumbers, setAssetNumbers] = useState<string[]>(['']);
  const [formData, setFormData] = useState({
    item_name: '',
    description: '',
    image_url: '',
    status: 'DISPONÍVEL'
  });

  const EXPIRATION_DAYS = 15;

  useEffect(() => {
    fetchData();
  }, []);

  async function cleanupExpiredItems(allItems: InventoryItem[]) {
    const now = new Date();
    const expiredItems = allItems.filter(item => {
      if (!item.image_url) return false;
      const createdAt = new Date(item.created_at);
      const diffTime = Math.abs(now.getTime() - createdAt.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > EXPIRATION_DAYS;
    });

    if (expiredItems.length === 0) return;

    for (const item of expiredItems) {
      try {
        const urlParts = item.image_url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        if (fileName) {
          await supabase.storage.from('inventory').remove([`items/${fileName}`]);
        }
        await (supabase as any)
          .from('inventory_items')
          .update({ image_url: null })
          .eq('id', item.id);
      } catch (err) {
        console.error("Falha na limpeza automática:", err);
      }
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any).from('profiles').select('role, school_id').eq('id', user.id).single();
        setUserRole(profile?.role || '');
        setUserSchoolId(profile?.school_id || null);
      }

      const { data } = await (supabase as any)
        .from('inventory_items')
        .select(`
          *,
          schools!inventory_items_school_id_fkey(name),
          interested_school:schools!inventory_items_interested_school_id_fkey(name)
        `)
        .order('created_at', { ascending: false });
      
      const allData = data || [];
      if (allData.length > 0) {
        await cleanupExpiredItems(allData);
      }
      setItems(allData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const groupedBatches = useMemo(() => {
    const batches: Record<string, InventoryBatch> = {};
    items.forEach(item => {
      const bId = item.batch_id || item.id;
      if (!batches[bId]) {
        batches[bId] = {
          batch_id: bId,
          item_name: item.item_name,
          description: item.description,
          image_url: item.image_url,
          status: item.status,
          status_notes: item.status_notes,
          school_id: item.school_id,
          school_name: item.schools?.name || 'Unidade Desconhecida',
          interested_school_id: item.interested_school_id,
          interested_school_name: item.interested_school?.name,
          approval_number: item.approval_number,
          approval_year: item.approval_year,
          assets: [],
          created_at: item.created_at
        };
      }
      batches[bId].assets.push({ id: item.id, asset_number: item.asset_number });
    });

    return Object.values(batches)
      .filter(b => {
        // Lógica de abas
        if (activeTab === 'active') {
          return b.status === 'DISPONÍVEL' || b.status === 'INTERESSE_SOLICITADO';
        } else {
          return b.status === 'REMANEJADO';
        }
      })
      .filter(b => 
        b.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.school_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.assets.some(a => a.asset_number.includes(searchTerm))
      );
  }, [items, searchTerm, activeTab]);

  const formatApprovalId = (num: number | null, year: number | null) => {
    if (!num || !year) return "N/A";
    return `Aprovação ${String(num).padStart(3, '0')}/${year}`;
  };

  const handleInterest = async (batch: InventoryBatch) => {
    if (!userSchoolId) return;
    setActionLoading(batch.batch_id);
    try {
      const { error } = await (supabase as any)
        .from('inventory_items')
        .update({ 
          status: 'INTERESSE_SOLICITADO', 
          interested_school_id: userSchoolId 
        })
        .eq('batch_id', batch.batch_id);
      if (error) throw error;
      fetchData();
    } catch (error: any) {
      alert("Erro ao manifestar interesse: " + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (batch: InventoryBatch) => {
    if (userRole !== 'regional_admin') return;
    setActionLoading(batch.batch_id);
    try {
      const currentYear = new Date().getFullYear();
      const { data: lastApproval } = await (supabase as any)
        .from('inventory_items')
        .select('approval_number')
        .eq('approval_year', currentYear)
        .order('approval_number', { ascending: false })
        .limit(1);

      const nextNumber = (lastApproval?.[0]?.approval_number || 0) + 1;

      const { error } = await (supabase as any)
        .from('inventory_items')
        .update({ 
          status: 'REMANEJADO',
          approval_number: nextNumber,
          approval_year: currentYear
        })
        .eq('batch_id', batch.batch_id);

      if (error) throw error;
      fetchData();
    } catch (error: any) {
      alert("Erro na aprovação: " + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!batchToReject || !rejectNotes.trim()) return;
    setSaveLoading(true);
    try {
      const { error } = await (supabase as any)
        .from('inventory_items')
        .update({ 
          status: 'DISPONÍVEL', 
          interested_school_id: null,
          status_notes: `Interesse recusado pela Regional: ${rejectNotes}`
        })
        .eq('batch_id', batchToReject.batch_id);
      if (error) throw error;
      setIsRejectModalOpen(false);
      setRejectNotes('');
      fetchData();
    } catch (error: any) {
      alert("Erro ao recusar: " + error.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleExportTerm = async (batch: InventoryBatch) => {
    setExporting(true);
    setBatchToExport(batch);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
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
      const element = document.getElementById('remanejamento-term-template');
      if (!element) throw new Error("Template não encontrado.");
      
      element.style.display = 'block';
      const fileNameStr = `Termo_${String(batch.approval_number).padStart(3,'0')}_${batch.approval_year}.pdf`;
      
      const opt = {
        margin: [15, 15, 15, 15],
        filename: fileNameStr,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      await (window as any).html2pdf().set(opt).from(element).save();
      element.style.display = 'none';
      setBatchToExport(null);
      setExporting(false);
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar o documento PDF.");
      setExporting(false);
    }
  };

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 1000;
          let width = img.width;
          let height = img.height;
          if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } }
          else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(), 'image/jpeg', 0.7);
        };
      };
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressedBlob = await compressImage(file);
      const fileName = `items/${Math.random()}_${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('inventory').upload(fileName, compressedBlob);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('inventory').getPublicUrl(fileName);
      setFormData({ ...formData, image_url: publicUrl });
    } catch (error: any) {
      alert("Erro no upload: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleQuantityChange = (val: number) => {
    const newQty = Math.max(1, Math.min(50, val));
    setQuantity(newQty);
    setAssetNumbers(prev => {
      const newAssets = [...prev];
      if (newQty > prev.length) for (let i = prev.length; i < newQty; i++) newAssets.push('');
      else return newAssets.slice(0, newQty);
      return newAssets;
    });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userSchoolId) return;
    setSaveLoading(true);
    const bId = crypto.randomUUID();
    try {
      const itemsToInsert = assetNumbers.map(asset => ({
        ...formData,
        batch_id: bId,
        asset_number: asset.trim(),
        school_id: userSchoolId
      }));
      const { error } = await (supabase as any).from('inventory_items').insert(itemsToInsert);
      if (error) throw error;
      setIsModalOpen(false);
      setFormData({ item_name: '', description: '', image_url: '', status: 'DISPONÍVEL' });
      setQuantity(1); setAssetNumbers(['']);
      fetchData();
    } catch (error: any) {
      alert("Erro: " + error.message);
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleDelete(batchId: string) {
    if (!confirm("Remover este lote do sistema?")) return;
    try {
      await (supabase as any).from('inventory_items').delete().eq('batch_id', batchId);
      fetchData();
    } catch (error) { alert("Erro ao excluir."); }
  }

  const getDaysSinceCreated = (dateStr: string) => {
    const now = new Date();
    const created = new Date(dateStr);
    const diff = Math.abs(now.getTime() - created.getTime());
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="bg-indigo-50 border-2 border-indigo-100 p-6 rounded-[2.5rem] flex items-start gap-5 animate-in slide-in-from-top-4 duration-500 shadow-xl shadow-indigo-100/50">
        <div className="p-3 bg-white rounded-2xl text-indigo-600 shadow-sm"><Info size={28}/></div>
        <div>
          <h2 className="text-sm font-black text-indigo-900 uppercase tracking-tight">Política de Gerenciamento de Espaço</h2>
          <p className="text-xs text-indigo-700/80 font-medium leading-relaxed mt-1">
            Para otimizar o armazenamento regional, as fotos dos itens permanecem ativas por apenas <strong>{EXPIRATION_DAYS} dias</strong>. 
            Após esse prazo, o anúncio permanece no banco de dados, porém a imagem é removida automaticamente.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-indigo-600 rounded-3xl text-white shadow-xl shadow-indigo-100">
            <ArrowRightLeft size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">Remanejamento</h1>
            <p className="text-slate-500 font-medium mt-1">Gestão de excedentes e redistribuição regional.</p>
          </div>
        </div>
        
        {userRole === 'school_manager' && (
          <button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-xl transition-all active:scale-95">
            <Plus size={20} /> DISPONIBILIZAR LOTES
          </button>
        )}
      </div>

      {/* Navegação por Abas */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1 w-full md:w-auto">
          <button 
            onClick={() => setActiveTab('active')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all ${activeTab === 'active' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-indigo-500'}`}
          >
            <Package size={16} /> Lotes Ativos
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all ${activeTab === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-indigo-500'}`}
          >
            <Archive size={16} /> Histórico / Remanejados
          </button>
        </div>

        <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm w-full md:max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Buscar no lote..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium outline-none text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
          <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Sincronizando Banco de Dados...</p>
        </div>
      ) : (
        <>
          {groupedBatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
               <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mb-4"><Package size={40}/></div>
               <h3 className="text-lg font-black text-slate-400 uppercase tracking-tight">Nenhum item encontrado</h3>
               <p className="text-slate-400 text-sm">Não existem registros para exibição nesta aba no momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {groupedBatches.map((batch) => {
                const daysActive = getDaysSinceCreated(batch.created_at);
                const isExpired = daysActive >= EXPIRATION_DAYS;
                
                return (
                  <div key={batch.batch_id} className={`bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden group flex flex-col hover:border-indigo-300 transition-all ${isExpired && !batch.image_url ? 'opacity-75' : ''}`}>
                    <div className="relative h-48 overflow-hidden bg-slate-100">
                      {batch.image_url ? (
                        <img src={batch.image_url} alt={batch.item_name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-slate-50 gap-2">
                          <ImageIcon size={48} />
                          <span className="text-[9px] font-black uppercase text-slate-400">Imagem Expirada</span>
                        </div>
                      )}
                      
                      <div className="absolute top-4 left-4 flex flex-col gap-2">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg ${
                          batch.status === 'DISPONÍVEL' ? 'bg-emerald-500 text-white' : 
                          batch.status === 'REMANEJADO' ? 'bg-blue-600 text-white' : 'bg-amber-500 text-white'
                        }`}>
                          {batch.status.replace('_', ' ')}
                        </span>
                        {batch.status !== 'REMANEJADO' && (
                          <div className="flex items-center gap-1 bg-slate-900/80 backdrop-blur text-white px-3 py-1 rounded-full text-[10px] font-black uppercase">
                            <Clock size={10}/> {daysActive} Dias
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-6 flex-1 flex flex-col">
                      <div className="flex-1">
                        <h3 className="text-lg font-black text-slate-800 leading-tight uppercase line-clamp-1">{batch.item_name}</h3>
                        
                        {batch.status === 'REMANEJADO' && batch.approval_number && (
                          <div className="mt-1 flex items-center gap-1.5 text-blue-600 font-bold text-[10px] uppercase tracking-wider">
                            <CheckCircle2 size={12}/> {formatApprovalId(batch.approval_number, batch.approval_year)}
                          </div>
                        )}

                        <p className="text-xs text-slate-500 font-medium mt-2 line-clamp-2 italic">{batch.description}</p>
                        
                        <div className="mt-4 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Tag size={10}/> Patrimônios ({batch.assets.length}):</p>
                          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto custom-scrollbar">
                              {batch.assets.map(a => (
                                <span key={a.id} className="bg-white border border-slate-200 px-2 py-0.5 rounded text-[10px] font-mono font-bold text-slate-600">{a.asset_number}</span>
                              ))}
                          </div>
                        </div>

                        {batch.status === 'DISPONÍVEL' && batch.status_notes && (
                          <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2">
                            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-red-700 font-medium leading-relaxed">{batch.status_notes}</p>
                          </div>
                        )}
                      </div>

                      <div className="mt-6 pt-4 border-t border-slate-50">
                        <div className="flex items-center gap-2 text-slate-600 mb-4">
                          <Building2 size={14} className="text-slate-400" />
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Origem:</p>
                            <span className="text-[11px] font-bold truncate uppercase block">{batch.school_name}</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {userRole === 'school_manager' && userSchoolId !== batch.school_id && batch.status === 'DISPONÍVEL' && (
                            <button 
                              onClick={() => handleInterest(batch)}
                              disabled={actionLoading === batch.batch_id}
                              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all active:scale-95"
                            >
                              {actionLoading === batch.batch_id ? <Loader2 className="animate-spin" size={16}/> : <Hand size={16} />}
                              Tenho Interesse
                            </button>
                          )}

                          {batch.status === 'INTERESSE_SOLICITADO' && (
                            <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl mb-2">
                              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Escola Interessada:</p>
                              <p className="text-[11px] font-bold text-blue-700 uppercase">{batch.interested_school_name}</p>
                            </div>
                          )}

                          {userRole === 'regional_admin' && batch.status === 'INTERESSE_SOLICITADO' && (
                            <div className="grid grid-cols-2 gap-2">
                              <button 
                                onClick={() => handleApprove(batch)}
                                className="py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase flex items-center justify-center gap-2"
                              >
                                <Check size={14} /> Aprovar
                              </button>
                              <button 
                                onClick={() => { setBatchToReject(batch); setIsRejectModalOpen(true); }}
                                className="py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-black text-[10px] uppercase flex items-center justify-center gap-2"
                              >
                                <Ban size={14} /> Recusar
                              </button>
                            </div>
                          )}

                          {batch.school_id === userSchoolId && batch.status === 'DISPONÍVEL' && (
                            <button onClick={() => handleDelete(batch.batch_id)} className="w-full py-2.5 bg-slate-50 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-xl font-black text-[10px] uppercase flex items-center justify-center gap-2 border border-dashed border-red-200">
                              <Trash2 size={14} /> Retirar Lote
                            </button>
                          )}

                          {batch.status === 'REMANEJADO' && (
                            <button 
                              onClick={() => handleExportTerm(batch)}
                              disabled={exporting}
                              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-[10px] uppercase flex items-center justify-center gap-2 shadow-lg transition-all"
                            >
                              {exporting ? <Loader2 className="animate-spin" size={16}/> : <FileDown size={16} />}
                              Baixar Termo
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal de Cadastro em Lote */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-4xl shadow-2xl overflow-hidden border border-white animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white"><Package size={24} /></div>
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight leading-none">Disponibilizar Lote</h2>
                  <p className="text-xs text-indigo-600 font-bold uppercase tracking-widest mt-1">Anúncio agrupado de itens iguais</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={24} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 overflow-y-auto max-h-[80vh] custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="space-y-6">
                   <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-2"><Package size={14} /> Nome do Equipamento</label>
                    <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all" placeholder="Ex: Armário de Aço Médio" value={formData.item_name} onChange={e => setFormData({...formData, item_name: e.target.value})} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-2"><Hash size={14} /> Quantidade de Itens Iguais</label>
                    <input type="number" min="1" max="50" required className="w-full p-4 bg-white border-2 border-indigo-200 rounded-2xl font-black text-indigo-600 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all" value={quantity} onChange={e => handleQuantityChange(parseInt(e.target.value))} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Descrição do Estado Físico</label>
                    <textarea className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-all min-h-[100px]" placeholder="Ex: Bom estado, sem avarias..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1 flex items-center gap-2"><ImageIcon size={14} /> Foto Única do Lote</label>
                    <div className="relative group border-2 border-dashed border-slate-200 rounded-[2rem] p-6 flex flex-col items-center justify-center transition-all hover:border-indigo-400 bg-slate-50 hover:bg-white overflow-hidden min-h-[160px]">
                      {formData.image_url ? (
                        <div className="relative w-full h-full flex justify-center">
                          <img src={formData.image_url} alt="Preview" className="h-32 w-auto object-contain rounded-2xl shadow-lg border-4 border-white" />
                          <button type="button" onClick={() => setFormData({...formData, image_url: ''})} className="absolute top-0 right-0 bg-red-500 text-white p-2 rounded-full shadow-md"><X size={14} /></button>
                        </div>
                      ) : (
                        <>
                          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-slate-300 shadow-sm mb-2 group-hover:text-indigo-500 transition-all">
                            {uploading ? <Loader2 className="animate-spin" /> : <Upload size={24} />}
                          </div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                            {uploading ? 'Processando imagem...' : 'Subir imagem comprimida'}
                          </p>
                          <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={handleFileUpload} disabled={uploading} />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-[2.5rem] p-8 border border-slate-100 flex flex-col h-full shadow-inner">
                   <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                        <ListOrdered size={16} /> Digitar Patrimônios individuais
                      </div>
                      <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-[10px] font-black">{quantity} UNID.</span>
                   </div>
                   <div className="space-y-3 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                      {assetNumbers.map((asset, index) => (
                        <div key={index} className="flex items-center gap-3 animate-in slide-in-from-right-2 duration-200">
                          <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0">{index + 1}</span>
                          <input 
                            required
                            placeholder="Nº Patrimônio"
                            className="flex-1 p-3 bg-white border-2 border-white rounded-xl font-mono font-bold text-slate-700 focus:border-indigo-500 outline-none shadow-sm transition-all"
                            value={asset}
                            onChange={(e) => {
                               const na = [...assetNumbers];
                               na[index] = e.target.value;
                               setAssetNumbers(na);
                            }}
                          />
                        </div>
                      ))}
                   </div>
                   <div className="mt-auto pt-8">
                      <button 
                        type="submit" 
                        disabled={saveLoading || uploading}
                        className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black shadow-xl shadow-indigo-200 hover:bg-indigo-700 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                      >
                        {saveLoading ? <Loader2 className="animate-spin" size={24} /> : <CheckCircle2 size={24} />}
                        ANUNCIAR NO BANCO REGIONAL
                      </button>
                   </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {isRejectModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden border border-white">
            <div className="p-6 border-b bg-red-50 text-red-600 flex justify-between items-center">
               <div className="flex items-center gap-2 font-black uppercase text-xs tracking-widest"><Ban size={18}/> Justificativa Regional</div>
               <button onClick={() => setIsRejectModalOpen(false)} className="text-red-300 hover:text-red-500"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
               <p className="text-xs text-slate-500 font-medium leading-relaxed">Informe o motivo pelo qual este remanejamento está sendo recusado pela Administração Regional:</p>
               <textarea 
                  required
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-red-400 outline-none font-bold text-sm text-slate-700 transition-all min-h-[120px]"
                  placeholder="Ex: Item reservado para reposição em unidade com sinistro..."
                  value={rejectNotes}
                  onChange={e => setRejectNotes(e.target.value)}
               />
               <button 
                  onClick={handleReject}
                  disabled={saveLoading || !rejectNotes.trim()}
                  className="w-full py-4 bg-red-600 text-white rounded-xl font-black text-xs uppercase shadow-xl shadow-red-100 hover:bg-red-700 transition-all disabled:opacity-50"
               >
                  {saveLoading ? <Loader2 className="animate-spin mx-auto" /> : 'CONFIRMAR RECUSA'}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* --- TEMPLATE PARA PDF (OCULTO) --- */}
      {batchToExport && (
        <div id="remanejamento-term-template" style={{ display: 'none', background: 'white', width: '700px', minHeight: '900px', padding: '40px', fontFamily: 'sans-serif' }}>
          <div style={{ borderBottom: '4px solid #4f46e5', paddingBottom: '15px', marginBottom: '30px' }}>
             <table style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td>
                      <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#1e293b' }}>TERMO DE REMANEJAMENTO DE BENS</h1>
                      <p style={{ margin: '5px 0 0', fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Administração Regional • Gestão de Patrimônio</p>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ background: '#4f46e5', color: 'white', padding: '5px 15px', borderRadius: '8px', fontSize: '12px', fontWeight: 900 }}>
                        {formatApprovalId(batchToExport.approval_number, batchToExport.approval_year)}
                      </div>
                      <p style={{ margin: '5px 0 0', fontSize: '9px', color: '#94a3b8' }}>Protocolo SGE: {batchToExport.batch_id.substring(0,13).toUpperCase()}</p>
                    </td>
                  </tr>
                </tbody>
             </table>
          </div>

          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 10px', marginBottom: '20px' }}>
            <tbody>
              <tr>
                <td style={{ width: '50%', paddingRight: '10px' }}>
                  <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '15px', border: '1px solid #e2e8f0', minHeight: '60px' }}>
                     <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Unidade de Origem</p>
                     <h3 style={{ margin: '5px 0 0', fontSize: '12px', fontWeight: 900, color: '#1e293b' }}>{batchToExport.school_name}</h3>
                  </div>
                </td>
                <td style={{ width: '50%', paddingLeft: '10px' }}>
                  <div style={{ background: '#eff6ff', padding: '15px', borderRadius: '15px', border: '1px solid #bfdbfe', minHeight: '60px' }}>
                     <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, color: '#1e40af', textTransform: 'uppercase' }}>Unidade de Destino</p>
                     <h3 style={{ margin: '5px 0 0', fontSize: '12px', fontWeight: 900, color: '#1e3a8a' }}>{batchToExport.interested_school_name}</h3>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginBottom: '20px', display: 'flex', gap: '20px', background: '#ffffff', borderRadius: '15px', border: '1px solid #e2e8f0', padding: '15px' }}>
             {batchToExport.image_url ? (
               <div style={{ width: '200px', height: '150px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden', flexShrink: 0 }}>
                 <img 
                    src={batchToExport.image_url} 
                    crossOrigin="anonymous" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    alt="Foto do Item"
                  />
               </div>
             ) : (
               <div style={{ width: '200px', height: '150px', background: '#f1f5f9', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                 <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 900 }}>SEM FOTO</span>
               </div>
             )}
             <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 5px 0', fontSize: '11px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase' }}>Descrição Técnica do Lote</h4>
                <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 900, color: '#4f46e5' }}>{batchToExport.item_name}</p>
                <p style={{ margin: 0, fontSize: '10px', color: '#64748b', lineHeight: '1.5' }}>{batchToExport.description}</p>
             </div>
          </div>

          <div style={{ marginBottom: '30px' }}>
             <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase' }}>Relação de Patrimônios ({batchToExport.assets.length} unidades)</h4>
             <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '9px', fontWeight: 900 }}>ITEM</th>
                    <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'left', fontSize: '9px', fontWeight: 900 }}>NÚMERO DE PATRIMÔNIO</th>
                  </tr>
                </thead>
                <tbody>
                  {batchToExport.assets.map((a, idx) => (
                    <tr key={a.id}>
                      <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '10px', fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ padding: '6px', border: '1px solid #cbd5e1', fontSize: '10px', fontWeight: 900, color: '#1e293b', fontFamily: 'monospace' }}>{a.asset_number}</td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '50px' }}>
             <table style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ width: '50%', textAlign: 'center', padding: '0 20px' }}>
                      <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '10px' }}>
                        <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, textTransform: 'uppercase' }}>Responsável - Entrega (Origem)</p>
                        <p style={{ margin: '2px 0 0', fontSize: '8px', color: '#94a3b8' }}>{batchToExport.school_name}</p>
                      </div>
                    </td>
                    <td style={{ width: '50%', textAlign: 'center', padding: '0 20px' }}>
                      <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '10px' }}>
                        <p style={{ margin: 0, fontSize: '9px', fontWeight: 900, textTransform: 'uppercase' }}>Responsável - Recebimento (Destino)</p>
                        <p style={{ margin: '2px 0 0', fontSize: '8px', color: '#94a3b8' }}>{batchToExport.interested_school_name}</p>
                      </div>
                    </td>
                  </tr>
                </tbody>
             </table>
          </div>

          <div style={{ marginTop: '40px', textAlign: 'center', borderTop: '1px dashed #f1f5f9', paddingTop: '15px' }}>
             <p style={{ fontSize: '8px', color: '#cbd5e1', fontWeight: 900, letterSpacing: '2px' }}>DOCUMENTO GERADO PELO SISTEMA SGE-GSU EM {new Date().toLocaleString('pt-BR')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Remanejamento;