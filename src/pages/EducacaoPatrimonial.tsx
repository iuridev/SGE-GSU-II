import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import { TimbradoHeader, TimbradoFooter } from '../components/TimbradoPDF';
import {
  ShieldAlert, Plus, FileText,
  AlertTriangle, School,
  Search, Loader2, X,
  Download, BarChart3, Filter, ArrowUpRight, ArrowDownRight, MoreHorizontal,
  Lightbulb, Star, Users, Paperclip, Trash2, Edit3,
  Upload, Sparkles, Building2, CheckCircle2, Share2, ExternalLink
} from 'lucide-react';

// Declaração para evitar erro de TS com biblioteca global html2pdf via CDN
declare const html2pdf: any;

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const BP_BUCKET = 'patrimonial-boas-praticas';

// --- TIPOS ---
interface SchoolData {
  id: string;
  name: string;
}

interface UserProfile {
  full_name: string | null;
  role: string;
  school_id: string | null;
}

interface Ocorrencia {
  id: string;
  school_id: string;
  schools?: { name: string };
  date: string;
  type: string;
  description: string;
  status: string;
  photo_url?: string;
}

interface Attachment {
  url: string;
  name: string;
  type: string;
}

interface BestPractice {
  id: string;
  created_at: string;
  updated_at: string;
  school_id: string;
  schools?: { name: string };
  author_id: string | null;
  author_name: string | null;
  title: string;
  description: string;
  category: string | null;
  attachments: Attachment[];
  is_featured: boolean;
}

interface Replication {
  id: string;
  practice_id: string;
  school_id: string;
  schools?: { name: string };
  user_name: string | null;
  created_at: string;
}

interface OccFormData {
  school_id: string;
  date: string;
  type: string;
  description: string;
  status: string;
  photo_url: string;
}

interface BpFormData {
  id: string | null;
  school_id: string;
  title: string;
  category: string;
  description: string;
  attachments: Attachment[];
}

// --- CATEGORIAS DE BOAS PRÁTICAS ---
const BP_CATEGORIES = [
  { id: 'Controle de entrada e saída', color: 'bg-blue-50 text-blue-600 border-blue-200', accent: 'bg-blue-500' },
  { id: 'Inventário e tombamento', color: 'bg-indigo-50 text-indigo-600 border-indigo-200', accent: 'bg-indigo-500' },
  { id: 'Etiquetagem e identificação', color: 'bg-violet-50 text-violet-600 border-violet-200', accent: 'bg-violet-500' },
  { id: 'Conservação de mobiliário', color: 'bg-emerald-50 text-emerald-600 border-emerald-200', accent: 'bg-emerald-500' },
  { id: 'Organização de almoxarifado', color: 'bg-amber-50 text-amber-600 border-amber-200', accent: 'bg-amber-500' },
  { id: 'Engajamento da comunidade escolar', color: 'bg-rose-50 text-rose-600 border-rose-200', accent: 'bg-rose-500' },
  { id: 'Outros', color: 'bg-slate-50 text-slate-600 border-slate-200', accent: 'bg-slate-400' },
];

const catInfo = (cat: string | null) =>
  BP_CATEGORIES.find(c => c.id === cat) || BP_CATEGORIES[BP_CATEGORIES.length - 1];

const isImageUrl = (name: string) =>
  IMAGE_EXT.includes((name.split('.').pop() || '').toLowerCase().split('?')[0]);

// --- COMPONENTES VISUAIS ---

const KpiCard = ({ title, value, icon: Icon, color, trend }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 group">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl ${color} bg-opacity-10 group-hover:scale-110 transition-transform duration-300`}>
        <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
      </div>
      {trend !== undefined && trend !== null && (
        <span className={`flex items-center text-xs font-bold ${trend >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'} px-2 py-1 rounded-lg border border-transparent`}>
          {trend >= 0 ? <ArrowUpRight size={14} className="mr-1" /> : <ArrowDownRight size={14} className="mr-1" />}
          {Math.abs(trend)}%
        </span>
      )}
    </div>
    <h3 className="text-3xl font-black text-slate-800 tracking-tight mb-1">{value}</h3>
    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    'Pendente': 'bg-rose-50 text-rose-600 border-rose-100',
    'Em Análise': 'bg-amber-50 text-amber-600 border-amber-100',
    'Resolvido': 'bg-emerald-100 text-emerald-700 border-emerald-100',
  };
  const style = styles[status] || 'bg-slate-50 text-slate-600 border-slate-100';
  return (
    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${style} shadow-sm inline-flex items-center gap-1.5`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.replace('bg-', 'bg-opacity-100 bg-').split(' ')[1]}`}></span>
      {status}
    </span>
  );
};

// Card de Boa Prática
const BestPracticeCard = ({
  practice, replicationCount, canEdit, onOpen, onEdit, onDelete, onToggleFeatured, canModerate,
}: {
  practice: BestPractice;
  replicationCount: number;
  canEdit: boolean;
  canModerate: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFeatured: () => void;
}) => {
  const cat = catInfo(practice.category);
  const cover = practice.attachments.find(a => isImageUrl(a.name || a.url));
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden group flex flex-col hover:shadow-md hover:border-indigo-200 transition-all hover:-translate-y-0.5 duration-200">
      <div className={`h-1 ${practice.is_featured ? 'bg-amber-400' : cat.accent}`} />
      {cover && (
        <button onClick={onOpen} className="block w-full h-36 overflow-hidden bg-slate-100">
          <img src={cover.url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </button>
      )}
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${cat.color}`}>
            {practice.is_featured && <Star size={11} className="fill-amber-400 text-amber-400" />}
            <span className="line-clamp-1">{practice.category || 'Outros'}</span>
          </div>
          {(canEdit || canModerate) && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {canModerate && (
                <button onClick={onToggleFeatured} title="Destacar" className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-all">
                  <Star size={14} className={practice.is_featured ? 'fill-amber-400 text-amber-400' : ''} />
                </button>
              )}
              {canEdit && <>
                <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit3 size={14} /></button>
                <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={14} /></button>
              </>}
            </div>
          )}
        </div>

        <div className="flex-1">
          <h3 className="text-[15px] font-black text-slate-800 leading-snug group-hover:text-indigo-700 transition-colors line-clamp-2">
            {practice.title}
          </h3>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mt-1.5 flex items-center gap-1.5">
            <Building2 size={12} /> {practice.schools?.name || 'Escola'}
          </p>
          <p className="text-sm text-slate-500 mt-2.5 line-clamp-2 leading-relaxed">
            {practice.description}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
            <CheckCircle2 size={14} /> {replicationCount} {replicationCount === 1 ? 'escola replicou' : 'escolas replicaram'}
          </span>
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
            {practice.attachments.length > 0 && (
              <span className="flex items-center gap-1"><Paperclip size={12} /> {practice.attachments.length}</span>
            )}
          </div>
        </div>

        <button
          onClick={onOpen}
          className="mt-3 w-full py-2.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          Ver boa prática
        </button>
      </div>
    </div>
  );
};

export default function EducacaoPatrimonial() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ocorrencias' | 'boas-praticas'>('boas-praticas');

  const [schools, setSchools] = useState<SchoolData[]>([]);
  const [occurrences, setOccurrences] = useState<Ocorrencia[]>([]);
  const [practices, setPractices] = useState<BestPractice[]>([]);
  const [replications, setReplications] = useState<Replication[]>([]);

  // Perfil
  const [userRole, setUserRole] = useState<string>('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');

  // UI ocorrências
  const [showOccModal, setShowOccModal] = useState(false);
  const [isEditingOcc, setIsEditingOcc] = useState(false);
  const [editingOccId, setEditingOccId] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isPrintingMode, setIsPrintingMode] = useState(false);

  // UI boas práticas
  const [bpSearch, setBpSearch] = useState('');
  const [bpCategory, setBpCategory] = useState<string | null>(null);
  const [showBpModal, setShowBpModal] = useState(false);
  const [savingBp, setSavingBp] = useState(false);
  const [uploadingBp, setUploadingBp] = useState(false);
  const [detailPractice, setDetailPractice] = useState<BestPractice | null>(null);
  const [replicating, setReplicating] = useState(false);
  const [bpError, setBpError] = useState<string | null>(null);

  const initialOccForm: OccFormData = {
    school_id: '',
    date: new Date().toLocaleDateString('en-CA'),
    type: 'Mobiliário',
    description: '',
    status: 'Pendente',
    photo_url: '',
  };
  const [occForm, setOccForm] = useState<OccFormData>(initialOccForm);

  const initialBpForm: BpFormData = {
    id: null, school_id: '', title: '', category: BP_CATEGORIES[0].id, description: '', attachments: [],
  };
  const [bpForm, setBpForm] = useState<BpFormData>(initialBpForm);

  // Papéis
  const isRegional = ['regional_admin', 'supervisor', 'dirigente'].includes(userRole);
  const canPublishBp = isRegional || userRole === 'school_manager';
  const canModerateBp = isRegional;
  const canEditPractice = (p: BestPractice) =>
    canModerateBp || (userRole === 'school_manager' && p.school_id === userSchoolId);

  // Inicialização
  useEffect(() => {
    const initializePage = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setUserId(session.user.id);
          const { data: profileData, error } = await supabase
            .from('profiles')
            .select('full_name, role, school_id')
            .eq('id', session.user.id)
            .single();

          if (profileData && !error) {
            const profile = profileData as UserProfile;
            const effectiveRole = resolveViewRole(profile.role);
            setUserRole(effectiveRole);
            setUserSchoolId(profile.school_id);
            setUserName(profile.full_name || session.user.email?.split('@')[0] || 'Usuário');
            await loadAllData(effectiveRole, profile.school_id);
          }
        }
      } catch (error) {
        console.error('Erro na inicialização:', error);
      } finally {
        setLoading(false);
      }
    };
    initializePage();
  }, []);

  const loadAllData = async (role: string, schoolId: string | null) => {
    try {
      let schoolsQuery = supabase.from('schools').select('id, name').order('name');
      let occQuery = (supabase as any).from('patrimonial_occurrences').select('*, schools(name)');

      // Ocorrências: school_manager só vê a própria escola. Boas práticas: todos veem tudo.
      if (role === 'school_manager' && schoolId) {
        occQuery = occQuery.eq('school_id', schoolId);
      }

      const [{ data: sData }, { data: oData }, { data: pData }, { data: rData }] = await Promise.all([
        schoolsQuery,
        occQuery.order('date', { ascending: false }),
        (supabase as any).from('patrimonial_best_practices').select('*, schools(name)').order('created_at', { ascending: false }),
        (supabase as any).from('patrimonial_best_practice_replications').select('*, schools(name)').order('created_at', { ascending: false }),
      ]);

      if (sData) setSchools(sData);
      if (oData) setOccurrences(oData);
      if (pData) setPractices((pData as any[]).map(p => ({ ...p, attachments: Array.isArray(p.attachments) ? p.attachments : [] })));
      if (rData) setReplications(rData);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const reloadPractices = async () => {
    const [{ data: pData }, { data: rData }] = await Promise.all([
      (supabase as any).from('patrimonial_best_practices').select('*, schools(name)').order('created_at', { ascending: false }),
      (supabase as any).from('patrimonial_best_practice_replications').select('*, schools(name)').order('created_at', { ascending: false }),
    ]);
    if (pData) setPractices((pData as any[]).map(p => ({ ...p, attachments: Array.isArray(p.attachments) ? p.attachments : [] })));
    if (rData) setReplications(rData);
    return { pData, rData } as { pData: BestPractice[] | null; rData: Replication[] | null };
  };

  // ─────────────────────────── OCORRÊNCIAS ───────────────────────────

  const handleExportExcel = () => {
    if (activeTab === 'boas-praticas') {
      const headers = ['Data', 'Escola', 'Categoria', 'Título', 'Descrição', 'Escolas que replicaram'];
      const rows = [headers.join(';')];
      practices.forEach(p => {
        rows.push([
          new Date(p.created_at).toLocaleDateString('pt-BR'),
          p.schools?.name || 'N/A',
          p.category || '',
          (p.title || '').replace(/;/g, ' '),
          (p.description || '').replace(/[;\n]/g, ' '),
          String(replications.filter(r => r.practice_id === p.id).length),
        ].join(';'));
      });
      downloadCsv(rows, `boas_praticas_patrimoniais`);
      return;
    }
    const headers = ['Data', 'Escola', 'Tipo', 'Descrição', 'Status'];
    const rows = [headers.join(';')];
    occurrences.forEach(o => {
      rows.push([
        new Date(o.date).toLocaleDateString('pt-BR'),
        o.schools?.name || 'N/A',
        o.type,
        (o.description || '').replace(/[;\n]/g, ' '),
        o.status,
      ].join(';'));
    });
    downloadCsv(rows, `ocorrencias_patrimoniais`);
  };

  const downloadCsv = (rows: string[], prefix: string) => {
    const csvContent = '﻿' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${prefix}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '_')}.csv`;
    link.click();
  };

  const handleDownloadPDF = () => {
    setIsPrintingMode(true);
    setTimeout(() => {
      const element = document.getElementById('educacao-patrimonial-content');
      const opt = {
        margin: [5, 5],
        filename: activeTab === 'boas-praticas' ? 'boas_praticas_patrimoniais.pdf' : 'relatorio_patrimonial.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      };
      if (typeof html2pdf !== 'undefined') {
        html2pdf().set(opt).from(element).save().then(() => setIsPrintingMode(false));
      } else {
        window.print();
        setIsPrintingMode(false);
      }
    }, 500);
  };

  const calculateTrend = (data: any[], dateField: string = 'date') => {
    const now = new Date();
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const currentCount = data.filter(item => {
      const d = new Date(item[dateField]);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const prevCount = data.filter(item => {
      const d = new Date(item[dateField]);
      return d.getMonth() === prevDate.getMonth() && d.getFullYear() === prevDate.getFullYear();
    }).length;
    if (prevCount === 0) return currentCount > 0 ? 100 : 0;
    return Math.round(((currentCount - prevCount) / prevCount) * 100);
  };

  const occurrenceTrend = useMemo(() => calculateTrend(occurrences), [occurrences]);

  const chartData = useMemo(() => {
    const months = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({
        dateStr: d.toISOString().slice(0, 7),
        label: d.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase(),
      });
    }
    return months.map(m => ({
      ...m,
      total: occurrences.filter(o => o.date.startsWith(m.dateStr)).length,
    }));
  }, [occurrences]);

  const maxChartValue = Math.max(...chartData.map(d => d.total), 5);

  const handleOccSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const finalSchoolId = userRole === 'school_manager' ? userSchoolId : occForm.school_id;
      const payload: any = {
        school_id: finalSchoolId,
        date: occForm.date,
        type: occForm.type,
        description: occForm.description,
        status: occForm.status,
        photo_url: occForm.photo_url || null,
      };
      if (isEditingOcc && editingOccId) {
        await (supabase as any).from('patrimonial_occurrences').update(payload).eq('id', editingOccId);
      } else {
        await (supabase as any).from('patrimonial_occurrences').insert([payload]);
      }
      setShowOccModal(false);
      await loadAllData(userRole, userSchoolId);
      resetOccForm();
    } catch (error) {
      alert('Erro ao salvar ocorrência.');
    }
  };

  const resetOccForm = () => {
    setOccForm({ ...initialOccForm, school_id: userRole === 'school_manager' ? (userSchoolId || '') : '' });
    setIsEditingOcc(false);
    setEditingOccId(null);
  };

  const handleEditOcc = (item: Ocorrencia) => {
    setIsEditingOcc(true);
    setEditingOccId(item.id);
    setOccForm({
      school_id: item.school_id,
      date: item.date,
      type: item.type || 'Mobiliário',
      description: item.description || '',
      status: item.status || 'Pendente',
      photo_url: item.photo_url || '',
    });
    setShowOccModal(true);
  };

  const criticalSchools = useMemo(() => {
    if (occurrences.length === 0) return [];
    const counts = occurrences.reduce((acc: any, curr) => {
      const name = curr.schools?.name || 'Desconhecida';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).sort((a: any, b: any) => b[1] - a[1]).slice(0, 3);
  }, [occurrences]);

  // ─────────────────────────── BOAS PRÁTICAS ───────────────────────────

  const replicationsOf = (practiceId: string) => replications.filter(r => r.practice_id === practiceId);

  const filteredPractices = useMemo(() => {
    const term = bpSearch.trim().toLowerCase();
    return practices.filter(p => {
      if (bpCategory && p.category !== bpCategory) return false;
      if (!term) return true;
      return (
        p.title.toLowerCase().includes(term) ||
        (p.description || '').toLowerCase().includes(term) ||
        (p.schools?.name || '').toLowerCase().includes(term)
      );
    });
  }, [practices, bpSearch, bpCategory]);

  const bpIndicators = useMemo(() => {
    const mostReplicated = [...practices]
      .map(p => ({ p, n: replications.filter(r => r.practice_id === p.id).length }))
      .sort((a, b) => b.n - a.n)[0];
    const bySchool = practices.reduce((acc: Record<string, number>, p) => {
      const n = p.schools?.name || '—';
      acc[n] = (acc[n] || 0) + 1;
      return acc;
    }, {});
    const topSchool = Object.entries(bySchool).sort((a, b) => b[1] - a[1])[0];
    return {
      total: practices.length,
      replications: replications.length,
      mostReplicated,
      topSchool,
    };
  }, [practices, replications]);

  const openNewBp = () => {
    setBpError(null);
    setBpForm({
      ...initialBpForm,
      school_id: userRole === 'school_manager' ? (userSchoolId || '') : '',
    });
    setShowBpModal(true);
  };

  const openEditBp = (p: BestPractice) => {
    setBpError(null);
    setBpForm({
      id: p.id,
      school_id: p.school_id,
      title: p.title,
      category: p.category || BP_CATEGORIES[0].id,
      description: p.description,
      attachments: p.attachments,
    });
    setShowBpModal(true);
  };

  const handleBpFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingBp(true);
    setBpError(null);
    try {
      const uploaded: Attachment[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
          setBpError('Só é possível anexar imagens ou arquivos PDF.');
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          setBpError('Arquivo muito grande. Use até 10 MB.');
          continue;
        }
        const ext = file.name.split('.').pop() || 'bin';
        const path = `boas-praticas/${Date.now()}_${Math.round(Math.random() * 1e6)}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BP_BUCKET).upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from(BP_BUCKET).getPublicUrl(path);
        uploaded.push({ url: publicUrl, name: file.name, type: file.type });
      }
      setBpForm(prev => ({ ...prev, attachments: [...prev.attachments, ...uploaded] }));
    } catch (err) {
      console.error(err);
      setBpError('Erro ao enviar anexo. Tente novamente.');
    } finally {
      setUploadingBp(false);
    }
  };

  const removeBpAttachment = async (idx: number) => {
    const att = bpForm.attachments[idx];
    setBpForm(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== idx) }));
    try {
      const path = att.url.split(`/object/public/${BP_BUCKET}/`)[1];
      if (path) await supabase.storage.from(BP_BUCKET).remove([path]);
    } catch (err) {
      console.error('Falha ao remover arquivo do storage:', err);
    }
  };

  const handleBpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBpError(null);
    const schoolId = userRole === 'school_manager' ? userSchoolId : bpForm.school_id;
    if (!schoolId) {
      setBpError('Selecione a escola autora da boa prática.');
      return;
    }
    setSavingBp(true);
    try {
      if (bpForm.id) {
        const payload: any = {
          title: bpForm.title,
          category: bpForm.category,
          description: bpForm.description,
          attachments: bpForm.attachments,
          updated_at: new Date().toISOString(),
        };
        if (canModerateBp) payload.school_id = bpForm.school_id;
        await (supabase as any).from('patrimonial_best_practices').update(payload).eq('id', bpForm.id);
      } else {
        await (supabase as any).from('patrimonial_best_practices').insert([{
          school_id: schoolId,
          author_id: userId,
          author_name: userName,
          title: bpForm.title,
          category: bpForm.category,
          description: bpForm.description,
          attachments: bpForm.attachments,
        }]);
      }
      setShowBpModal(false);
      setBpForm(initialBpForm);
      await reloadPractices();
    } catch (err) {
      console.error(err);
      setBpError('Erro ao salvar a boa prática.');
    } finally {
      setSavingBp(false);
    }
  };

  const handleDeleteBp = async (p: BestPractice) => {
    if (!window.confirm(`Excluir a boa prática "${p.title}"? As replicações registradas também serão removidas.`)) return;
    try {
      await (supabase as any).from('patrimonial_best_practices').delete().eq('id', p.id);
      if (detailPractice?.id === p.id) setDetailPractice(null);
      await reloadPractices();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir.');
    }
  };

  const handleToggleFeatured = async (p: BestPractice) => {
    try {
      await (supabase as any).from('patrimonial_best_practices').update({ is_featured: !p.is_featured }).eq('id', p.id);
      const { pData } = await reloadPractices();
      if (detailPractice?.id === p.id && pData) {
        setDetailPractice(pData.find(x => x.id === p.id) || null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReplicate = async (p: BestPractice) => {
    if (!userSchoolId) {
      alert('Seu perfil não está vinculado a uma escola, então não é possível registrar replicação.');
      return;
    }
    if (p.school_id === userSchoolId) return;
    setReplicating(true);
    try {
      const existing = replications.find(r => r.practice_id === p.id && r.school_id === userSchoolId);
      if (existing) {
        await (supabase as any).from('patrimonial_best_practice_replications').delete().eq('id', existing.id);
      } else {
        await (supabase as any).from('patrimonial_best_practice_replications').insert([{
          practice_id: p.id,
          school_id: userSchoolId,
          user_id: userId,
          user_name: userName,
        }]);
      }
      await reloadPractices();
    } catch (err) {
      console.error(err);
      alert('Erro ao registrar replicação.');
    } finally {
      setReplicating(false);
    }
  };

  const dataGeracao = new Date().toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const alreadyReplicated = detailPractice && userSchoolId
    ? replications.some(r => r.practice_id === detailPractice.id && r.school_id === userSchoolId)
    : false;

  return (
    <div id="educacao-patrimonial-content" className="p-8 max-w-[1600px] mx-auto min-h-screen bg-slate-50/50">
      <TimbradoHeader />

      {/* Header da Página */}
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <ShieldAlert className="text-indigo-600 w-8 h-8" />
            Educação Patrimonial
          </h1>
          <p className="text-slate-500 font-medium mt-2">
            {activeTab === 'boas-praticas'
              ? 'Biblioteca de boas práticas de controle de mobiliário patrimonial — compartilhe o que funcionou e replique o que outras escolas fizeram.'
              : 'Monitoramento de ocorrências patrimoniais e vandalismo nas unidades escolares.'}
          </p>
          {isPrintingMode && <p className="text-xs text-slate-400 mt-1">Relatório gerado em {dataGeracao}</p>}
        </div>

        {!isPrintingMode && (
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={handleExportExcel} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-4 py-3 rounded-xl font-bold text-xs flex items-center gap-2 transition-all">
              <Download size={16} /> EXCEL
            </button>
            <button onClick={handleDownloadPDF} className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-3 rounded-xl font-bold text-xs flex items-center gap-2 transition-all mr-2">
              <FileText size={16} /> PDF
            </button>

            {activeTab === 'boas-praticas' ? (
              canPublishBp && (
                <button
                  onClick={openNewBp}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-indigo-200 hover:-translate-y-1"
                >
                  <Plus size={18} strokeWidth={3} />
                  NOVA BOA PRÁTICA
                </button>
              )
            ) : (
              <button
                onClick={() => { resetOccForm(); setShowOccModal(true); }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-indigo-200 hover:-translate-y-1"
              >
                <Plus size={18} strokeWidth={3} />
                NOVA OCORRÊNCIA
              </button>
            )}
          </div>
        )}
      </header>

      {/* Abas */}
      {!isPrintingMode && (
        <div className="flex gap-1 mb-8 border-b border-slate-200">
          {[
            { id: 'boas-praticas' as const, label: 'Boas Práticas', icon: <Lightbulb size={16} /> },
            { id: 'ocorrencias' as const, label: 'Ocorrências', icon: <AlertTriangle size={16} /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 font-bold text-sm border-b-2 -mb-px transition-all ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        </div>
      ) : activeTab === 'boas-praticas' ? (
        /* ═══════════════ ABA BOAS PRÁTICAS ═══════════════ */
        <>
          {/* Indicadores */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <KpiCard title="Boas Práticas" value={bpIndicators.total} icon={Lightbulb} color="bg-indigo-500" />
            <KpiCard title="Replicações na Rede" value={bpIndicators.replications} icon={Share2} color="bg-emerald-500" />
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Star size={12} /> Mais replicada</p>
              <h3 className="text-sm font-black text-slate-800 line-clamp-2 leading-snug">{bpIndicators.mostReplicated?.n ? bpIndicators.mostReplicated.p.title : '—'}</h3>
              {!!bpIndicators.mostReplicated?.n && <p className="text-xs font-bold text-emerald-600 mt-1">{bpIndicators.mostReplicated.n} escolas</p>}
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Building2 size={12} /> Escola que mais compartilha</p>
              <h3 className="text-sm font-black text-slate-800 line-clamp-2 leading-snug uppercase">{bpIndicators.topSchool?.[0] || '—'}</h3>
              {!!bpIndicators.topSchool && <p className="text-xs font-bold text-indigo-600 mt-1">{bpIndicators.topSchool[1]} práticas</p>}
            </div>
          </div>

          {/* Busca + filtros */}
          {!isPrintingMode && (
            <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Buscar por título, escola ou conteúdo..."
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-500 transition-all"
                  value={bpSearch}
                  onChange={(e) => setBpSearch(e.target.value)}
                />
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setBpCategory(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${bpCategory === null ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}
                >
                  Todas
                </button>
                {BP_CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setBpCategory(bpCategory === c.id ? null : c.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${bpCategory === c.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}
                  >
                    {c.id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grade */}
          {filteredPractices.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-16 text-center">
              <Lightbulb className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-black text-slate-700">Nenhuma boa prática por aqui ainda</h3>
              <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
                {practices.length === 0
                  ? 'Seja a primeira escola a compartilhar algo que deu certo no controle do mobiliário patrimonial.'
                  : 'Ajuste a busca ou o filtro de categoria.'}
              </p>
              {canPublishBp && practices.length === 0 && (
                <button onClick={openNewBp} className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold text-sm inline-flex items-center gap-2">
                  <Plus size={16} /> Compartilhar boa prática
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPractices.map(p => (
                <BestPracticeCard
                  key={p.id}
                  practice={p}
                  replicationCount={replicationsOf(p.id).length}
                  canEdit={canEditPractice(p)}
                  canModerate={canModerateBp}
                  onOpen={() => setDetailPractice(p)}
                  onEdit={() => openEditBp(p)}
                  onDelete={() => handleDeleteBp(p)}
                  onToggleFeatured={() => handleToggleFeatured(p)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        /* ═══════════════ ABA OCORRÊNCIAS ═══════════════ */
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            <KpiCard title="Total Ocorrências" value={occurrences.length} icon={AlertTriangle} color="bg-rose-500" trend={occurrenceTrend} />
            <KpiCard title="Em Aberto" value={occurrences.filter(o => o.status !== 'Resolvido').length} icon={Loader2} color="bg-amber-500" />
            <KpiCard title="Escolas c/ Ocorrência" value={new Set(occurrences.map(o => o.school_id)).size} icon={School} color="bg-slate-500" />
            <KpiCard
              title="Taxa de Resolução"
              value={`${occurrences.length ? Math.round((occurrences.filter(o => o.status === 'Resolvido').length / occurrences.length) * 100) : 0}%`}
              icon={BarChart3}
              color="bg-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div className="xl:col-span-2 space-y-8">
              {/* Gráfico */}
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Evolução de Ocorrências</h3>
                    <p className="text-sm text-slate-400 font-medium mt-1">Comparativo mensal de incidentes registrados</p>
                  </div>
                  {!isPrintingMode && (
                    <div className="flex gap-2">
                      <button className="p-2 text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 rounded-lg hover:bg-indigo-50"><Filter size={18} /></button>
                    </div>
                  )}
                </div>

                <div className="h-[300px] w-full relative flex items-end justify-between gap-4 px-4 select-none">
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none z-0">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="border-b border-dashed border-slate-100 w-full h-full last:border-0 relative">
                        <span className="absolute -left-8 -top-2 text-[10px] font-bold text-slate-300">
                          {Math.round(maxChartValue * (1 - i / 4))}
                        </span>
                      </div>
                    ))}
                  </div>

                  {chartData.map((data, index) => {
                    const heightPercent = (data.total / maxChartValue) * 100;
                    return (
                      <div
                        key={index}
                        className="relative flex-1 h-full flex items-end group z-10"
                        onMouseEnter={() => setHoveredBar(index)}
                        onMouseLeave={() => setHoveredBar(null)}
                      >
                        <div
                          className={`w-full mx-2 rounded-t-xl transition-all duration-300 ease-out relative ${hoveredBar === index ? 'bg-indigo-600 shadow-lg shadow-indigo-200 translate-y-[-4px]' : 'bg-slate-200'}`}
                          style={{ height: `${heightPercent || 2}%` }}
                        >
                          <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-slate-800 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap transition-all duration-200 ${hoveredBar === index ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                            {data.total} Ocorrências
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                          </div>
                        </div>
                        <div className={`absolute -bottom-8 left-0 right-0 text-center text-[10px] font-bold uppercase tracking-wider transition-colors ${hoveredBar === index ? 'text-indigo-600' : 'text-slate-400'}`}>
                          {data.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Lista */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden transition-shadow hover:shadow-md">
                <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <FileText size={18} className="text-slate-400" />
                    Registros Recentes
                  </h3>
                  {!isPrintingMode && (
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Buscar por escola..."
                        className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 w-48 transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-50">
                      <tr>
                        <th className="p-5 pl-8">Data</th>
                        <th className="p-5">Escola</th>
                        <th className="p-5">Tipo</th>
                        <th className="p-5 text-center">Status</th>
                        {!isPrintingMode && <th className="p-5 text-right pr-8">Ações</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {occurrences
                        .filter(o => (o.schools?.name || '').toLowerCase().includes(searchTerm.toLowerCase()))
                        .slice(0, 8)
                        .map((occ) => (
                          <tr key={occ.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="p-5 pl-8 font-medium text-slate-600 whitespace-nowrap">
                              {new Date(occ.date).toLocaleDateString('pt-BR')}
                            </td>
                            <td className="p-5 font-bold text-slate-800 uppercase text-xs">{occ.schools?.name}</td>
                            <td className="p-5"><span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">{occ.type}</span></td>
                            <td className="p-5 text-center"><StatusBadge status={occ.status} /></td>
                            {!isPrintingMode && (
                              <td className="p-5 text-right pr-8">
                                <button
                                  onClick={() => handleEditOcc(occ)}
                                  className="transition-colors p-2 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                  title="Editar"
                                >
                                  <MoreHorizontal size={18} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Coluna direita */}
            <div className="space-y-8">
              {/* Chamada p/ boas práticas */}
              <div className="bg-indigo-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-32 bg-indigo-800 rounded-full blur-3xl opacity-20 -mr-16 -mt-16"></div>
                <div className="relative z-10">
                  <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm w-fit mb-5">
                    <Sparkles className="text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">Boa prática que deu certo?</h3>
                  <p className="text-indigo-200 text-sm font-medium mb-6">
                    Registre o que funcionou no controle do mobiliário da sua escola para que outras unidades possam replicar.
                  </p>
                  {!isPrintingMode && (
                    <button
                      onClick={() => setActiveTab('boas-praticas')}
                      className="w-full bg-white text-indigo-900 py-3.5 rounded-xl font-bold text-sm hover:bg-indigo-50 transition-colors shadow-lg"
                    >
                      Ir para Boas Práticas
                    </button>
                  )}
                </div>
              </div>

              {/* Unidades críticas */}
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm transition-shadow hover:shadow-md">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <School size={18} className="text-slate-400" />
                  Unidades Críticas
                </h3>
                <div className="space-y-3">
                  {(criticalSchools.length > 0 ? criticalSchools : [['Nenhuma ocorrência', 0]]).map(([name, count]: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${idx === 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{idx + 1}</span>
                        <span className="text-xs font-bold text-slate-700 uppercase truncate max-w-[150px]">{name}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-400">{count} regs</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════ MODAL OCORRÊNCIA ═══════════ */}
      {showOccModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border-4 border-white/50">
            <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-800 tracking-tight">
                {isEditingOcc ? 'Editar Ocorrência' : 'Nova Ocorrência'}
              </h3>
              <button onClick={() => setShowOccModal(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-rose-500 transition-colors shadow-sm">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleOccSubmit} className="p-8 space-y-5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Unidade Escolar</label>
                <select
                  required
                  disabled={userRole === 'school_manager' || (isEditingOcc && !isRegional)}
                  value={occForm.school_id}
                  onChange={(e) => setOccForm(prev => ({ ...prev, school_id: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                >
                  <option value="">Selecione a escola...</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Data</label>
                  <input
                    type="date"
                    required
                    value={occForm.date}
                    onChange={(e) => setOccForm(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Tipo</label>
                  <select
                    value={occForm.type}
                    onChange={(e) => setOccForm(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  >
                    <option>Mobiliário</option><option>Vidros</option><option>Equipamento</option><option>Predial</option><option>Outros</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Status</label>
                <select
                  value={occForm.status}
                  onChange={(e) => setOccForm(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                >
                  <option>Pendente</option><option>Em Análise</option><option>Resolvido</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Descrição</label>
                <textarea
                  rows={3}
                  required
                  value={occForm.description}
                  onChange={(e) => setOccForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Detalhes do ocorrido..."
                  className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowOccModal(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3.5 rounded-xl font-bold uppercase text-xs tracking-widest transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-xl font-bold uppercase text-xs tracking-widest transition-all shadow-lg shadow-indigo-200 hover:-translate-y-1">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════ MODAL NOVA/EDITAR BOA PRÁTICA ═══════════ */}
      {showBpModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-800 tracking-tight">
                {bpForm.id ? 'Editar Boa Prática' : 'Nova Boa Prática'}
              </h3>
              <button onClick={() => setShowBpModal(false)} className="p-2 bg-white rounded-full text-slate-400 hover:text-rose-500 transition-colors shadow-sm">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleBpSubmit} className="p-8 space-y-5 overflow-y-auto">
              {bpError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={18} />
                  <p className="text-xs font-bold text-rose-700">{bpError}</p>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Escola autora</label>
                <select
                  required
                  disabled={userRole === 'school_manager' || (!!bpForm.id && !canModerateBp)}
                  value={userRole === 'school_manager' ? (userSchoolId || '') : bpForm.school_id}
                  onChange={(e) => setBpForm(prev => ({ ...prev, school_id: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-70"
                >
                  <option value="">Selecione a escola...</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Título</label>
                  <input
                    type="text"
                    required
                    value={bpForm.title}
                    onChange={(e) => setBpForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Ex: Conferência de bens por sala a cada bimestre"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Categoria</label>
                  <select
                    value={bpForm.category}
                    onChange={(e) => setBpForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  >
                    {BP_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Como funcionou</label>
                <textarea
                  rows={6}
                  required
                  value={bpForm.description}
                  onChange={(e) => setBpForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descreva o que a escola fez, como colocou em prática, quem participou e qual foi o resultado. Quanto mais concreto, mais fácil outra escola replicar."
                  className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                />
              </div>

              {/* Anexos */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Fotos e PDFs</label>
                {bpForm.attachments.length > 0 && (
                  <ul className="space-y-2">
                    {bpForm.attachments.map((att, idx) => (
                      <li key={idx} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                        {isImageUrl(att.name || att.url)
                          ? <img src={att.url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                          : <span className="w-10 h-10 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center"><FileText size={18} /></span>}
                        <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-xs font-bold text-slate-600 hover:text-indigo-600 truncate">
                          {att.name}
                        </a>
                        <button type="button" onClick={() => removeBpAttachment(idx)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg">
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <label className={`flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-4 text-xs font-bold text-slate-500 cursor-pointer hover:border-indigo-400 hover:text-indigo-600 transition-all ${uploadingBp ? 'opacity-60 pointer-events-none' : ''}`}>
                  {uploadingBp ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {uploadingBp ? 'Enviando...' : 'Adicionar imagem ou PDF'}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => { handleBpFiles(e.target.files); e.target.value = ''; }}
                  />
                </label>
              </div>

              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setShowBpModal(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3.5 rounded-xl font-bold uppercase text-xs tracking-widest transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingBp || uploadingBp} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-3.5 rounded-xl font-bold uppercase text-xs tracking-widest transition-all shadow-lg shadow-indigo-200 hover:-translate-y-1 flex items-center justify-center gap-2">
                  {savingBp && <Loader2 size={14} className="animate-spin" />}
                  {bpForm.id ? 'Salvar alterações' : 'Publicar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════ MODAL DETALHE DA BOA PRÁTICA ═══════════ */}
      {detailPractice && (() => {
        const reps = replicationsOf(detailPractice.id);
        const cat = catInfo(detailPractice.category);
        const isOwnSchool = detailPractice.school_id === userSchoolId;
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setDetailPractice(null)}>
            <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className={`h-1.5 ${detailPractice.is_featured ? 'bg-amber-400' : cat.accent}`} />
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${cat.color}`}>{detailPractice.category || 'Outros'}</span>
                    {detailPractice.is_featured && (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border bg-amber-50 text-amber-600 border-amber-200 flex items-center gap-1">
                        <Star size={11} className="fill-amber-400 text-amber-400" /> Destaque
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight leading-snug">{detailPractice.title}</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <Building2 size={12} /> {detailPractice.schools?.name}
                    <span className="text-slate-300">•</span>
                    {detailPractice.author_name || 'Autor não informado'}
                    <span className="text-slate-300">•</span>
                    {new Date(detailPractice.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <button onClick={() => setDetailPractice(null)} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-rose-500 transition-colors shrink-0">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6 overflow-y-auto">
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{detailPractice.description}</p>

                {detailPractice.attachments.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Paperclip size={12} /> Anexos</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {detailPractice.attachments.map((att, idx) => (
                        isImageUrl(att.name || att.url) ? (
                          <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 group">
                            <img src={att.url} alt={att.name} className="w-full h-28 object-cover group-hover:scale-105 transition-transform" />
                          </a>
                        ) : (
                          <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 h-28 p-3 text-center hover:border-indigo-300 hover:bg-indigo-50/40 transition-all">
                            <FileText size={22} className="text-rose-500" />
                            <span className="text-[10px] font-bold text-slate-500 line-clamp-2">{att.name}</span>
                            <span className="text-[9px] font-black uppercase text-slate-400 flex items-center gap-1"><ExternalLink size={9} /> Abrir</span>
                          </a>
                        )
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                    <Users size={13} /> {reps.length} {reps.length === 1 ? 'escola replicou' : 'escolas replicaram'}
                  </h4>
                  {reps.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {reps.map(r => (
                        <span key={r.id} className="text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1 uppercase">
                          {r.schools?.name || 'Escola'}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 font-medium">Nenhuma escola replicou ainda. Seja a primeira.</p>
                  )}
                </div>
              </div>

              <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                  {canEditPractice(detailPractice) && (
                    <button onClick={() => { openEditBp(detailPractice); setDetailPractice(null); }} className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:border-indigo-300 hover:text-indigo-600 transition-all flex items-center gap-1.5">
                      <Edit3 size={14} /> Editar
                    </button>
                  )}
                  {canModerateBp && (
                    <button onClick={() => handleToggleFeatured(detailPractice)} className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:border-amber-300 hover:text-amber-600 transition-all flex items-center gap-1.5">
                      <Star size={14} className={detailPractice.is_featured ? 'fill-amber-400 text-amber-400' : ''} /> {detailPractice.is_featured ? 'Remover destaque' : 'Destacar'}
                    </button>
                  )}
                </div>

                {isOwnSchool ? (
                  <span className="text-xs font-bold text-slate-400 italic">Boa prática da sua escola</span>
                ) : userSchoolId ? (
                  <button
                    onClick={() => handleReplicate(detailPractice)}
                    disabled={replicating}
                    className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all flex items-center gap-2 disabled:opacity-60 ${
                      alreadyReplicated
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-rose-50 hover:text-rose-600'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200'
                    }`}
                  >
                    {replicating ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    {alreadyReplicated ? 'Replicado — desfazer' : 'Replicamos isso'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })()}

      <TimbradoFooter />
    </div>
  );
}
