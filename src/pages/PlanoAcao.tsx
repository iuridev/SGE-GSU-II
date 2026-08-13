import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import {
  Plus, X, Loader2, Target, Paperclip, ChevronLeft,
  FileDown, Lock, Upload, FileText, Image as ImageIcon,
} from 'lucide-react';
import jsPDF from 'jspdf';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';
import autoTable from 'jspdf-autotable';

const DIMENSOES = [
  'Apoio e Orientação Pedagógica',
  'Gestão Administrativo-Financeira',
  'Clima Organizacional e Comunicação',
];

const STATUS_OPTIONS = ['Não iniciada', 'Em andamento', 'Concluída', 'Atrasada'] as const;
type EtapaStatus = typeof STATUS_OPTIONS[number];

const ALLOWED_ROLES = ['regional_admin', 'supervisor', 'dirigente', 'ure_servico', 'ure_ecc'];

const STATUS_BADGE: Record<string, string> = {
  'Não iniciada': 'bg-slate-100 text-slate-500',
  'Em andamento': 'bg-amber-100 text-amber-700',
  'Concluída': 'bg-emerald-100 text-emerald-700',
  'Atrasada': 'bg-red-100 text-red-700',
};

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

interface Meta {
  id: string;
  dimensao: string;
  meta: string;
  acao_estrategia: string;
  responsavel_id: string;
  responsavel_nome: string;
  criado_por: string;
  criado_em: string;
}

interface Etapa {
  id: string;
  meta_id: string;
  ordem: string;
  descricao: string;
  responsavel_id: string;
  responsavel_nome: string;
  prazo_previsto: string;
  status: string;
  data_conclusao: string;
  criado_em: string;
}

interface Evidencia {
  id: string;
  etapa_id: string;
  arquivo_url: string;
  arquivo_nome: string;
  observacao: string;
  autor_id: string;
  autor_nome: string;
  criado_em: string;
}

interface Profile {
  id: string;
  full_name: string;
}

const META_FORM_INITIAL = { dimensao: DIMENSOES[0], meta: '', acao_estrategia: '', responsavel_id: '' };

export default function PlanoAcao() {
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);

  const [metas, setMetas] = useState<Meta[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [view, setView] = useState<'lista' | 'detalhe'>('lista');
  const [selectedMetaId, setSelectedMetaId] = useState<string | null>(null);

  const [filterDimensao, setFilterDimensao] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showMetaModal, setShowMetaModal] = useState(false);
  const [editingMeta, setEditingMeta] = useState<Meta | null>(null);
  const [metaForm, setMetaForm] = useState(META_FORM_INITIAL);
  const [savingMeta, setSavingMeta] = useState(false);

  const [uploadingEtapaId, setUploadingEtapaId] = useState<string | null>(null);
  const [evidenciaObs, setEvidenciaObs] = useState<Record<string, string>>({});

  useEffect(() => {
    init();
  }, []);

  async function init() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles').select('full_name, role').eq('id', user.id).single();
        setUserRole(resolveViewRole(profile?.role || ''));
        setCurrentUser({ id: user.id, full_name: profile?.full_name || user.email || 'Usuário' });
      }
      const { data: profilesData } = await (supabase as any)
        .from('profiles').select('id, full_name').order('full_name');
      setProfiles(profilesData || []);

      await fetchAll();
    } finally {
      setLoading(false);
    }
  }

  async function fetchAll() {
    const { data, error } = await supabase.functions.invoke('google-sheets-plano-acao', { method: 'GET' });
    if (error) { console.error('Erro ao buscar plano de ação:', error); return; }
    setMetas(Array.isArray(data?.metas) ? data.metas : []);
    setEtapas(Array.isArray(data?.etapas) ? data.etapas : []);
    setEvidencias(Array.isArray(data?.evidencias) ? data.evidencias : []);
  }

  const refreshSoon = () => setTimeout(fetchAll, 1500);

  // ── Metas ──────────────────────────────────────────────────────────────
  const openNovaMeta = () => {
    setEditingMeta(null);
    setMetaForm(META_FORM_INITIAL);
    setShowMetaModal(true);
  };

  const openEditarMeta = (meta: Meta) => {
    setEditingMeta(meta);
    setMetaForm({
      dimensao: meta.dimensao || DIMENSOES[0],
      meta: meta.meta,
      acao_estrategia: meta.acao_estrategia,
      responsavel_id: meta.responsavel_id,
    });
    setShowMetaModal(true);
  };

  const handleSalvarMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metaForm.meta.trim() || !metaForm.acao_estrategia.trim() || !metaForm.responsavel_id) {
      alert('Preencha meta, ação/estratégia e responsável.');
      return;
    }
    setSavingMeta(true);
    try {
      const responsavelNome = profiles.find(p => p.id === metaForm.responsavel_id)?.full_name || '';
      if (editingMeta) {
        const { error } = await supabase.functions.invoke('google-sheets-plano-acao', {
          body: {
            entity: 'meta', action: 'update', id: editingMeta.id,
            data: { ...metaForm, responsavel_nome: responsavelNome },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.functions.invoke('google-sheets-plano-acao', {
          body: {
            entity: 'meta', action: 'create',
            data: {
              id: `meta-${Date.now()}`,
              ...metaForm,
              responsavel_nome: responsavelNome,
              criado_por: currentUser?.full_name || '',
              criado_em: new Date().toISOString(),
            },
          },
        });
        if (error) throw error;
      }
      setShowMetaModal(false);
      refreshSoon();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar meta. Tente novamente.');
    } finally {
      setSavingMeta(false);
    }
  };

  // ── Etapas ─────────────────────────────────────────────────────────────
  const handleAdicionarEtapa = async (metaId: string) => {
    const ordem = etapas.filter(e => e.meta_id === metaId).length + 1;
    try {
      const { error } = await supabase.functions.invoke('google-sheets-plano-acao', {
        body: {
          entity: 'etapa', action: 'create',
          data: {
            id: `etapa-${Date.now()}`,
            meta_id: metaId,
            ordem: String(ordem),
            descricao: '',
            responsavel_id: '',
            responsavel_nome: '',
            prazo_previsto: '',
            status: 'Não iniciada',
            data_conclusao: '',
            criado_em: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;
      refreshSoon();
    } catch (err) {
      console.error(err);
      alert('Erro ao adicionar etapa.');
    }
  };

  const handleAtualizarEtapa = async (etapa: Etapa, changes: Partial<Etapa>) => {
    const merged = { ...etapa, ...changes };
    if (changes.status === 'Concluída' && !merged.data_conclusao) {
      merged.data_conclusao = new Date().toISOString().split('T')[0];
    }
    setEtapas(prev => prev.map(e => e.id === etapa.id ? merged : e));
    try {
      const { error } = await supabase.functions.invoke('google-sheets-plano-acao', {
        body: {
          entity: 'etapa', action: 'update', id: etapa.id,
          data: {
            descricao: merged.descricao,
            responsavel_id: merged.responsavel_id,
            responsavel_nome: merged.responsavel_nome,
            prazo_previsto: merged.prazo_previsto,
            status: merged.status,
            data_conclusao: merged.data_conclusao,
          },
        },
      });
      if (error) throw error;
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar etapa. Recarregando dados...');
      fetchAll();
    }
  };

  // ── Evidências ─────────────────────────────────────────────────────────
  const handleUploadEvidencia = async (etapaId: string, file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      alert('Só é possível anexar imagens ou arquivos PDF.');
      return;
    }
    setUploadingEtapaId(etapaId);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `etapas/${etapaId}/${Date.now()}_${Math.round(Math.random() * 1e6)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('plano-acao-evidencias').upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('plano-acao-evidencias').getPublicUrl(path);

      const { error } = await supabase.functions.invoke('google-sheets-plano-acao', {
        body: {
          entity: 'evidencia', action: 'create',
          data: {
            id: `ev-${Date.now()}`,
            etapa_id: etapaId,
            arquivo_url: publicUrl,
            arquivo_nome: file.name,
            observacao: evidenciaObs[etapaId] || '',
            autor_id: currentUser?.id || '',
            autor_nome: currentUser?.full_name || '',
            criado_em: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;

      setEvidenciaObs(prev => ({ ...prev, [etapaId]: '' }));
      refreshSoon();
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar evidência. Tente novamente.');
    } finally {
      setUploadingEtapaId(null);
    }
  };

  // ── Derivados ──────────────────────────────────────────────────────────
  const etapasDaMeta = (metaId: string) =>
    etapas.filter(e => e.meta_id === metaId).sort((a, b) => Number(a.ordem) - Number(b.ordem));

  const evidenciasDaEtapa = (etapaId: string) =>
    evidencias.filter(ev => ev.etapa_id === etapaId).sort((a, b) => a.criado_em.localeCompare(b.criado_em));

  const progressoDaMeta = (metaId: string) => {
    const lista = etapasDaMeta(metaId);
    if (lista.length === 0) return 0;
    const concluidas = lista.filter(e => e.status === 'Concluída').length;
    return Math.round((concluidas / lista.length) * 100);
  };

  const statusDaMeta = (metaId: string): EtapaStatus | 'Não iniciada' => {
    const lista = etapasDaMeta(metaId);
    if (lista.length === 0) return 'Não iniciada';
    if (lista.every(e => e.status === 'Concluída')) return 'Concluída';
    if (lista.some(e => e.status === 'Atrasada')) return 'Atrasada';
    if (lista.some(e => e.status === 'Em andamento')) return 'Em andamento';
    return 'Não iniciada';
  };

  const metasFiltradas = useMemo(() => {
    return metas.filter(m => {
      if (filterDimensao && m.dimensao !== filterDimensao) return false;
      if (filterStatus && statusDaMeta(m.id) !== filterStatus) return false;
      return true;
    });
  }, [metas, etapas, filterDimensao, filterStatus]);

  const selectedMeta = metas.find(m => m.id === selectedMetaId) || null;

  // ── PDF ────────────────────────────────────────────────────────────────
  const gerarArquivo = (metasParaExportar: Meta[]) => {
    if (metasParaExportar.length === 0) {
      alert('Nenhuma meta para exportar.');
      return;
    }
    const doc = new jsPDF('landscape');
    const margin = 14;

    doc.setFontSize(14);
    doc.setTextColor(79, 70, 229);
    doc.text('Plano de Ação – Cadastro e Monitoramento de Metas', margin, 36);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, margin, 42);

    const rows = metasParaExportar.map(meta => {
      const lista = etapasDaMeta(meta.id);
      const etapasTxt = lista.length
        ? lista.map(e => `${e.ordem}. ${e.descricao || '(sem descrição)'} [${e.status}]`).join('\n')
        : '—';
      const responsaveisTxt = [
        `Geral: ${meta.responsavel_nome || '—'}`,
        ...lista.map(e => `${e.ordem}. ${e.responsavel_nome || '—'}`),
      ].join('\n');
      const cronogramaTxt = lista.length
        ? lista.map(e => {
            const prazo = e.prazo_previsto ? new Date(e.prazo_previsto + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
            const concluido = e.data_conclusao ? ` (concluída em ${new Date(e.data_conclusao + 'T12:00:00').toLocaleDateString('pt-BR')})` : '';
            return `${e.ordem}. ${prazo}${concluido}`;
          }).join('\n')
        : '—';

      return [meta.meta, meta.acao_estrategia, etapasTxt, responsaveisTxt, cronogramaTxt];
    });

    autoTable(doc, {
      startY: 48,
      margin: { left: margin, right: margin, top: 34, bottom: 16 },
      head: [['Meta', 'Qual ação/estratégia?', 'Quais são as etapas?', 'Quem são os responsáveis?', 'Qual é o cronograma?']],
      body: rows,
      styles: { fontSize: 7.5, cellPadding: 2, valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 55 }, 1: { cellWidth: 55 }, 2: { cellWidth: 60 }, 3: { cellWidth: 45 }, 4: { cellWidth: 45 },
      },
    });

    // Evidências anexadas por etapa, por meta
    let y = (doc as any).lastAutoTable.finalY + 10;
    const pageH = doc.internal.pageSize.getHeight();

    metasParaExportar.forEach(meta => {
      const lista = etapasDaMeta(meta.id);
      const etapasComEvidencia = lista.filter(e => evidenciasDaEtapa(e.id).length > 0);
      if (etapasComEvidencia.length === 0) return;

      if (y > pageH - 40) { doc.addPage(); y = 34; }
      doc.setFontSize(9);
      doc.setTextColor(79, 70, 229);
      doc.text(`Evidências — ${meta.meta.slice(0, 90)}`, margin, y);
      y += 5;

      doc.setFontSize(7.5);
      doc.setTextColor(60);
      etapasComEvidencia.forEach(etapa => {
        if (y > pageH - 20) { doc.addPage(); y = 34; }
        doc.text(`Etapa ${etapa.ordem}: ${etapa.descricao || '(sem descrição)'}`, margin, y);
        y += 4;
        evidenciasDaEtapa(etapa.id).forEach(ev => {
          if (y > pageH - 20) { doc.addPage(); y = 34; }
          const data = ev.criado_em ? new Date(ev.criado_em).toLocaleDateString('pt-BR') : '';
          doc.text(`  • ${ev.arquivo_nome} — ${ev.observacao || 'sem observação'} (${data}, ${ev.autor_nome})`, margin, y);
          y += 4;
        });
        y += 2;
      });
      y += 4;
    });

    addTimbradoAllPages(doc);
    doc.save(`plano-de-acao-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // ── Guard de acesso ────────────────────────────────────────────────────
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={32} /></div>;
  }

  if (!ALLOWED_ROLES.includes(userRole)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Lock className="w-16 h-16 text-red-400 mb-4" />
        <h1 className="text-xl font-black text-slate-800 mb-2">Acesso Restrito</h1>
        <p className="text-slate-500 text-center max-w-md text-sm">
          Esta página é de uso exclusivo da gestão regional (URE) para acompanhamento do Plano de Ação.
        </p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {view === 'lista' ? (
          <ListaMetas
            metas={metasFiltradas}
            filterDimensao={filterDimensao} setFilterDimensao={setFilterDimensao}
            filterStatus={filterStatus} setFilterStatus={setFilterStatus}
            statusDaMeta={statusDaMeta}
            progressoDaMeta={progressoDaMeta}
            etapasDaMeta={etapasDaMeta}
            onNovaMeta={openNovaMeta}
            onAbrirMeta={(id) => { setSelectedMetaId(id); setView('detalhe'); }}
            onGerarArquivo={() => gerarArquivo(metasFiltradas)}
          />
        ) : selectedMeta ? (
          <DetalheMeta
            meta={selectedMeta}
            etapas={etapasDaMeta(selectedMeta.id)}
            evidenciasDaEtapa={evidenciasDaEtapa}
            profiles={profiles}
            uploadingEtapaId={uploadingEtapaId}
            evidenciaObs={evidenciaObs}
            setEvidenciaObs={setEvidenciaObs}
            onVoltar={() => { setView('lista'); setSelectedMetaId(null); }}
            onEditarMeta={() => openEditarMeta(selectedMeta)}
            onAdicionarEtapa={() => handleAdicionarEtapa(selectedMeta.id)}
            onAtualizarEtapa={handleAtualizarEtapa}
            onUploadEvidencia={handleUploadEvidencia}
            onGerarArquivo={() => gerarArquivo([selectedMeta])}
          />
        ) : null}
      </div>

      {showMetaModal && (
        <MetaModal
          form={metaForm}
          setForm={setMetaForm}
          profiles={profiles}
          saving={savingMeta}
          isEditing={!!editingMeta}
          onClose={() => setShowMetaModal(false)}
          onSubmit={handleSalvarMeta}
        />
      )}
    </div>
  );
}

// ============================== SUBCOMPONENTES ==============================

const selectClass = "w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all";
const labelClass = "text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block";

function ListaMetas({
  metas, filterDimensao, setFilterDimensao, filterStatus, setFilterStatus,
  statusDaMeta, progressoDaMeta, etapasDaMeta, onNovaMeta, onAbrirMeta, onGerarArquivo,
}: {
  metas: Meta[];
  filterDimensao: string; setFilterDimensao: (v: string) => void;
  filterStatus: string; setFilterStatus: (v: string) => void;
  statusDaMeta: (id: string) => string;
  progressoDaMeta: (id: string) => number;
  etapasDaMeta: (id: string) => Etapa[];
  onNovaMeta: () => void;
  onAbrirMeta: (id: string) => void;
  onGerarArquivo: () => void;
}) {
  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-100 rounded-xl"><Target size={22} className="text-indigo-600" /></div>
          <div>
            <h1 className="text-lg font-black text-slate-800">Plano de Ação</h1>
            <p className="text-xs text-slate-400 font-medium">Cadastro e Monitoramento de Metas</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onGerarArquivo} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
            <FileDown size={16} /> Gerar arquivo
          </button>
          <button onClick={onNovaMeta} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 rounded-xl text-sm font-bold text-white hover:bg-indigo-700 transition-all shadow-sm">
            <Plus size={16} /> Nova Meta
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <select className={selectClass} value={filterDimensao} onChange={e => setFilterDimensao(e.target.value)}>
          <option value="">Todas as dimensões</option>
          {DIMENSOES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className={selectClass} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {metas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 text-sm font-medium">
          Nenhuma meta cadastrada com os filtros atuais.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metas.map(meta => {
            const progresso = progressoDaMeta(meta.id);
            const status = statusDaMeta(meta.id);
            const totalEtapas = etapasDaMeta(meta.id).length;
            return (
              <button
                key={meta.id}
                onClick={() => onAbrirMeta(meta.id)}
                className="text-left bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:border-indigo-200 transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[9px] font-black text-indigo-600 uppercase bg-indigo-50 px-2 py-1 rounded-lg">{meta.dimensao}</span>
                  <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg shrink-0 ${STATUS_BADGE[status] || STATUS_BADGE['Não iniciada']}`}>{status}</span>
                </div>
                <p className="text-sm font-bold text-slate-800 leading-snug mb-1 line-clamp-3">{meta.meta}</p>
                <p className="text-[11px] text-slate-400 font-medium mb-3">Responsável: {meta.responsavel_nome || '—'}</p>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-1">
                  <div
                    className={`h-full transition-all duration-700 ${progresso >= 90 ? 'bg-emerald-500' : progresso >= 50 ? 'bg-amber-500' : progresso > 0 ? 'bg-amber-500' : 'bg-slate-300'}`}
                    style={{ width: `${progresso}%` }}
                  />
                </div>
                <p className="text-[10px] font-bold text-slate-400">{progresso}% concluído · {totalEtapas} etapa(s)</p>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function DetalheMeta({
  meta, etapas, evidenciasDaEtapa, profiles, uploadingEtapaId, evidenciaObs, setEvidenciaObs,
  onVoltar, onEditarMeta, onAdicionarEtapa, onAtualizarEtapa, onUploadEvidencia, onGerarArquivo,
}: {
  meta: Meta;
  etapas: Etapa[];
  evidenciasDaEtapa: (etapaId: string) => Evidencia[];
  profiles: Profile[];
  uploadingEtapaId: string | null;
  evidenciaObs: Record<string, string>;
  setEvidenciaObs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onVoltar: () => void;
  onEditarMeta: () => void;
  onAdicionarEtapa: () => void;
  onAtualizarEtapa: (etapa: Etapa, changes: Partial<Etapa>) => void;
  onUploadEvidencia: (etapaId: string, file: File) => void;
  onGerarArquivo: () => void;
}) {
  return (
    <>
      <button onClick={onVoltar} className="flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-indigo-600 mb-4 transition-all">
        <ChevronLeft size={16} /> Voltar para listagem
      </button>

      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <span className="text-[9px] font-black text-indigo-600 uppercase bg-indigo-50 px-2 py-1 rounded-lg">{meta.dimensao}</span>
          <div className="flex gap-2 shrink-0">
            <button onClick={onEditarMeta} className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all">Editar</button>
            <button onClick={onGerarArquivo} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all">
              <FileDown size={14} /> Gerar arquivo
            </button>
          </div>
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Meta</p>
        <p className="text-sm font-bold text-slate-800 mb-4">{meta.meta}</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Qual ação/estratégia?</p>
        <p className="text-sm text-slate-600 mb-4">{meta.acao_estrategia}</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Responsável geral</p>
        <p className="text-sm font-bold text-slate-700">{meta.responsavel_nome || '—'}</p>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-black text-slate-700 uppercase tracking-tight">Etapas</h2>
        <button onClick={onAdicionarEtapa} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 rounded-lg text-xs font-bold text-white hover:bg-indigo-700 transition-all">
          <Plus size={14} /> Adicionar etapa
        </button>
      </div>

      <div className="space-y-3">
        {etapas.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-sm font-medium">
            Nenhuma etapa cadastrada ainda.
          </div>
        )}
        {etapas.map(etapa => (
          <EtapaCard
            key={etapa.id}
            etapa={etapa}
            evidencias={evidenciasDaEtapa(etapa.id)}
            profiles={profiles}
            uploading={uploadingEtapaId === etapa.id}
            observacao={evidenciaObs[etapa.id] || ''}
            setObservacao={(v) => setEvidenciaObs(prev => ({ ...prev, [etapa.id]: v }))}
            onAtualizar={(changes) => onAtualizarEtapa(etapa, changes)}
            onUpload={(file) => onUploadEvidencia(etapa.id, file)}
          />
        ))}
      </div>
    </>
  );
}

function EtapaCard({
  etapa, evidencias, profiles, uploading, observacao, setObservacao, onAtualizar, onUpload,
}: {
  etapa: Etapa;
  evidencias: Evidencia[];
  profiles: Profile[];
  uploading: boolean;
  observacao: string;
  setObservacao: (v: string) => void;
  onAtualizar: (changes: Partial<Etapa>) => void;
  onUpload: (file: File) => void;
}) {
  const [descricao, setDescricao] = useState(etapa.descricao);

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex items-start gap-3 mb-3">
        <span className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs font-black">{etapa.ordem}</span>
        <textarea
          className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:border-indigo-400 resize-none"
          rows={2}
          placeholder="Descrição da etapa..."
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          onBlur={() => { if (descricao !== etapa.descricao) onAtualizar({ descricao }); }}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <div>
          <label className={labelClass}>Responsável</label>
          <select className={selectClass} value={etapa.responsavel_id} onChange={e => {
            const p = profiles.find(pr => pr.id === e.target.value);
            onAtualizar({ responsavel_id: e.target.value, responsavel_nome: p?.full_name || '' });
          }}>
            <option value="">Selecione...</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Prazo previsto</label>
          <input type="date" className={selectClass} value={etapa.prazo_previsto || ''} onChange={e => onAtualizar({ prazo_previsto: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <select className={selectClass} value={etapa.status} onChange={e => onAtualizar({ status: e.target.value })}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Concluída em</label>
          <input type="date" className={selectClass} value={etapa.data_conclusao || ''} onChange={e => onAtualizar({ data_conclusao: e.target.value })} disabled={etapa.status !== 'Concluída'} />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5"><Paperclip size={12} /> Evidências</p>

        {evidencias.length > 0 && (
          <ul className="space-y-1.5 mb-3">
            {evidencias.map(ev => {
              const isImage = IMAGE_EXT.includes((ev.arquivo_nome.split('.').pop() || '').toLowerCase());
              return (
                <li key={ev.id} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg p-2">
                  {isImage ? <ImageIcon size={14} className="text-indigo-400 shrink-0" /> : <FileText size={14} className="text-slate-400 shrink-0" />}
                  <a href={ev.arquivo_url} target="_blank" rel="noopener noreferrer" className="font-bold text-indigo-600 hover:underline truncate">{ev.arquivo_nome}</a>
                  <span className="text-slate-400 truncate flex-1">{ev.observacao}</span>
                  <span className="text-slate-400 shrink-0">{ev.criado_em ? new Date(ev.criado_em).toLocaleDateString('pt-BR') : ''} · {ev.autor_nome}</span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="O que essa evidência comprova? (opcional)"
            className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
          />
          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-600 cursor-pointer transition-all shrink-0">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? 'Enviando...' : 'Anexar arquivo'}
            <input type="file" accept="image/*,application/pdf" className="hidden" disabled={uploading} onChange={e => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = '';
            }} />
          </label>
        </div>
      </div>
    </div>
  );
}

function MetaModal({
  form, setForm, profiles, saving, isEditing, onClose, onSubmit,
}: {
  form: typeof META_FORM_INITIAL;
  setForm: React.Dispatch<React.SetStateAction<typeof META_FORM_INITIAL>>;
  profiles: Profile[];
  saving: boolean;
  isEditing: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">{isEditing ? 'Editar Meta' : 'Nova Meta'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div>
            <label className={labelClass}>Dimensão</label>
            <select className={selectClass} value={form.dimensao} onChange={e => setForm(f => ({ ...f, dimensao: e.target.value }))}>
              {DIMENSOES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Meta</label>
            <textarea className={selectClass} rows={3} placeholder="Descrição da meta, com valor/indicador alvo e prazo final..." value={form.meta} onChange={e => setForm(f => ({ ...f, meta: e.target.value }))} required />
          </div>
          <div>
            <label className={labelClass}>Qual ação/estratégia?</label>
            <textarea className={selectClass} rows={3} value={form.acao_estrategia} onChange={e => setForm(f => ({ ...f, acao_estrategia: e.target.value }))} required />
          </div>
          <div>
            <label className={labelClass}>Responsável geral pela meta</label>
            <select className={selectClass} value={form.responsavel_id} onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))} required>
              <option value="">Selecione...</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 bg-slate-100 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-all">Cancelar</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 rounded-xl text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60 transition-all">
              {saving && <Loader2 size={14} className="animate-spin" />} Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
