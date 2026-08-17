import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  FileSignature, Plus, X, Loader2, Upload, FileText, Download,
  CheckCircle2, Circle, Clock, ExternalLink, Search,
} from 'lucide-react';

const CREATOR_ROLES = ['regional_admin', 'dirigente'];

const ROLE_LABELS: Record<string, string> = {
  regional_admin: 'Administrador',
  chefe_departamento: 'Chefe de Departamento',
  supervisor: 'Supervisor',
  dirigente: 'Dirigente',
  ure_servico: 'Serviços URE',
  ure_ecc: 'Especialista',
  school_manager: 'Gestor Unidade',
};

interface Me {
  id: string;
  full_name: string;
  role: string;
}

interface Profile {
  id: string;
  full_name: string;
  role: string;
}

interface SignatureSigner {
  id: string;
  document_id: string;
  profile_id: string;
  status: 'pendente' | 'assinado';
  signed_at: string | null;
  verification_code: string | null;
  profiles?: { full_name: string; role: string } | null;
}

interface SignatureDocument {
  id: string;
  titulo: string;
  original_path: string;
  signed_path: string | null;
  status: 'pendente' | 'concluido' | 'cancelado';
  created_by: string;
  created_at: string;
  concluded_at: string | null;
}

const FORM_INITIAL = { titulo: '', file: null as File | null, selectedIds: new Set<string>(), busca: '' };

function formatarData(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('pt-BR') : '—';
}

export default function Assinaturas() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [documents, setDocuments] = useState<SignatureDocument[]>([]);
  const [signersByDoc, setSignersByDoc] = useState<Record<string, SignatureSigner[]>>({});

  const [showNewModal, setShowNewModal] = useState(false);
  const [form, setForm] = useState(FORM_INITIAL);
  const [creating, setCreating] = useState(false);

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => { init(); }, []);

  async function init() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await (supabase as any)
        .from('profiles').select('id, full_name, role').eq('id', user.id).single();
      setMe({ id: user.id, full_name: profile?.full_name || user.email || 'Usuário', role: profile?.role || '' });

      const { data: profilesData } = await (supabase as any)
        .from('profiles').select('id, full_name, role').neq('role', 'chefe_departamento').order('full_name');
      setProfiles(profilesData || []);

      await fetchDocuments();
    } finally {
      setLoading(false);
    }
  }

  async function fetchDocuments() {
    const { data: docs, error } = await (supabase as any)
      .from('signature_documents').select('*').order('created_at', { ascending: false });
    if (error) { console.error('Erro ao buscar documentos:', error); toast.error('Não foi possível carregar os documentos.'); return; }
    setDocuments(docs || []);

    const ids = (docs || []).map((d: SignatureDocument) => d.id);
    if (ids.length === 0) { setSignersByDoc({}); return; }

    const { data: signers, error: signersError } = await (supabase as any)
      .from('signature_signers').select('*, profiles(full_name, role)').in('document_id', ids);
    if (signersError) { console.error('Erro ao buscar signatários:', signersError); return; }

    const grouped: Record<string, SignatureSigner[]> = {};
    (signers || []).forEach((s: SignatureSigner) => {
      if (!grouped[s.document_id]) grouped[s.document_id] = [];
      grouped[s.document_id].push(s);
    });
    setSignersByDoc(grouped);
  }

  const canCreate = !!me && CREATOR_ROLES.includes(me.role);

  const minhasPendencias = documents.filter(d =>
    (signersByDoc[d.id] || []).some(s => s.profile_id === me?.id && s.status === 'pendente')
  );

  // ── Criar documento ───────────────────────────────────────────────────
  const toggleSigner = (id: string) => {
    setForm(prev => {
      const next = new Set(prev.selectedIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...prev, selectedIds: next };
    });
  };

  const handleCreateDocument = async () => {
    if (!me) return;
    if (!form.titulo.trim()) { toast.error('Informe um título para o documento.'); return; }
    if (!form.file) { toast.error('Selecione o arquivo PDF.'); return; }
    if (form.file.type !== 'application/pdf') { toast.error('O arquivo precisa ser um PDF.'); return; }
    if (form.selectedIds.size === 0) { toast.error('Selecione ao menos um signatário.'); return; }

    setCreating(true);
    const docId = crypto.randomUUID();
    const originalPath = `${docId}/original.pdf`;
    try {
      const { error: docError } = await (supabase as any)
        .from('signature_documents')
        .insert({ id: docId, titulo: form.titulo.trim(), original_path: originalPath, created_by: me.id });
      if (docError) throw docError;

      const { error: uploadError } = await supabase.storage
        .from('assinaturas').upload(originalPath, form.file, { contentType: 'application/pdf' });
      if (uploadError) throw uploadError;

      const signersRows = Array.from(form.selectedIds).map(profileId => ({ document_id: docId, profile_id: profileId }));
      const { error: signersError } = await (supabase as any).from('signature_signers').insert(signersRows);
      if (signersError) throw signersError;

      toast.success('Documento enviado para assinatura!');
      setShowNewModal(false);
      setForm(FORM_INITIAL);
      fetchDocuments();
    } catch (err) {
      console.error('Erro ao criar documento de assinatura:', err);
      await (supabase as any).from('signature_documents').delete().eq('id', docId);
      toast.error('Não foi possível criar o documento. Tente novamente.');
    } finally {
      setCreating(false);
    }
  };

  // ── Assinar ────────────────────────────────────────────────────────────
  const handleSign = async (doc: SignatureDocument, signer: SignatureSigner) => {
    setSigningId(signer.id);
    try {
      const code = crypto.randomUUID().slice(0, 8).toUpperCase();
      const { error } = await (supabase as any)
        .from('signature_signers')
        .update({ status: 'assinado', signed_at: new Date().toISOString(), verification_code: code })
        .eq('id', signer.id);
      if (error) throw error;

      const { data: allSigners, error: fetchError } = await (supabase as any)
        .from('signature_signers').select('*, profiles(full_name, role)').eq('document_id', doc.id);
      if (fetchError) throw fetchError;

      const aindaPendente = (allSigners || []).some((s: SignatureSigner) => s.status !== 'assinado');
      if (!aindaPendente) {
        await finalizarDocumento(doc, allSigners);
        toast.success('Assinatura registrada — documento concluído!');
      } else {
        toast.success('Assinatura registrada!');
      }
      fetchDocuments();
    } catch (err) {
      console.error('Erro ao assinar documento:', err);
      toast.error('Não foi possível registrar sua assinatura. Tente novamente.');
    } finally {
      setSigningId(null);
    }
  };

  const finalizarDocumento = async (doc: SignatureDocument, signers: SignatureSigner[]) => {
    const { data: urlData, error: urlError } = await supabase.storage
      .from('assinaturas').createSignedUrl(doc.original_path, 120);
    if (urlError || !urlData?.signedUrl) throw urlError || new Error('Não foi possível obter o PDF original.');

    const res = await fetch(urlData.signedUrl);
    if (!res.ok) throw new Error('Falha ao baixar o PDF original.');
    const bytes = new Uint8Array(await res.arrayBuffer());
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const linhas = signers
      .slice()
      .sort((a, b) => (a.signed_at || '').localeCompare(b.signed_at || ''))
      .map(s => {
        const nome = s.profiles?.full_name || 'Signatário';
        const cargo = ROLE_LABELS[s.profiles?.role || ''] || s.profiles?.role || '';
        const data = formatarData(s.signed_at);
        const codigo = s.verification_code || '';
        return `Assinado eletronicamente por ${nome} (${cargo}) em ${data} — Cód. verificação: ${codigo}`.slice(0, 140);
      });

    const bandHeight = 16 + linhas.length * 9;
    pdfDoc.getPages().forEach(page => {
      const { width } = page.getSize();
      page.drawRectangle({ x: 0, y: 0, width, height: bandHeight, color: rgb(1, 1, 1), opacity: 0.9 });
      page.drawLine({ start: { x: 20, y: bandHeight }, end: { x: width - 20, y: bandHeight }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
      let y = bandHeight - 11;
      page.drawText('CERTIFICADO DE ASSINATURA ELETRÔNICA', { x: 20, y, size: 6, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      y -= 9;
      linhas.forEach(linha => {
        page.drawText(linha, { x: 20, y, size: 6, font: fontRegular, color: rgb(0.25, 0.25, 0.25) });
        y -= 9;
      });
    });

    const finalBytes = await pdfDoc.save();
    const signedPath = `${doc.id}/assinado.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('assinaturas')
      .upload(signedPath, new Blob([finalBytes as BlobPart], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw uploadError;

    const { error: rpcError } = await (supabase as any).rpc('finalize_signature_document', {
      p_document_id: doc.id, p_signed_path: signedPath,
    });
    if (rpcError) throw rpcError;
  };

  // ── Visualizar / baixar ───────────────────────────────────────────────
  const handleVerOriginal = async (doc: SignatureDocument) => {
    const { data, error } = await supabase.storage.from('assinaturas').createSignedUrl(doc.original_path, 120);
    if (error || !data?.signedUrl) { toast.error('Não foi possível abrir o PDF.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadSigned = async (doc: SignatureDocument) => {
    if (!doc.signed_path) return;
    setDownloadingId(doc.id);
    try {
      const { data, error } = await supabase.storage.from('assinaturas').createSignedUrl(doc.signed_path, 120);
      if (error || !data?.signedUrl) throw error || new Error('URL indisponível.');
      const res = await fetch(data.signedUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.titulo.replace(/[^\w\-]+/g, '_')}-assinado.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao baixar documento assinado:', err);
      toast.error('Não foi possível baixar o documento.');
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={32} /></div>;
  }

  const profilesFiltrados = profiles.filter(p =>
    p.full_name.toLowerCase().includes(form.busca.toLowerCase())
  );

  const selectedDoc = documents.find(d => d.id === selectedDocId) || null;
  const selectedSigners = selectedDoc ? (signersByDoc[selectedDoc.id] || []) : [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600 rounded-2xl text-white shrink-0"><FileSignature size={24} /></div>
          <div>
            <h1 className="text-xl font-black text-slate-900">Assinatura de Documentos</h1>
            <p className="text-sm text-slate-400">Envie um PDF para assinatura eletrônica e acompanhe quem já assinou.</p>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-colors"
          >
            <Plus size={18} /> Novo Documento
          </button>
        )}
      </div>

      {minhasPendencias.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-black text-amber-600 uppercase tracking-widest flex items-center gap-2">
            <Clock size={14} /> Pendentes para sua assinatura
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {minhasPendencias.map(doc => {
              const meuSigner = (signersByDoc[doc.id] || []).find(s => s.profile_id === me?.id);
              return (
                <div key={doc.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                  <p className="font-bold text-slate-800 truncate">{doc.titulo}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => handleVerOriginal(doc)} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900">
                      <ExternalLink size={14} /> Ver PDF
                    </button>
                    <button
                      onClick={() => meuSigner && handleSign(doc, meuSigner)}
                      disabled={signingId === meuSigner?.id}
                      className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold disabled:opacity-60"
                    >
                      {signingId === meuSigner?.id ? <Loader2 className="animate-spin" size={14} /> : <FileSignature size={14} />} Assinar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Documentos</h2>
        {documents.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <FileText size={32} className="mx-auto mb-3 text-slate-200" />
            <p className="text-sm font-medium">Nenhum documento de assinatura por aqui ainda.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
            {documents.map(doc => {
              const signers = signersByDoc[doc.id] || [];
              const assinados = signers.filter(s => s.status === 'assinado').length;
              return (
                <button
                  key={doc.id}
                  onClick={() => setSelectedDocId(doc.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="p-2.5 bg-slate-100 rounded-xl text-slate-500 shrink-0"><FileText size={18} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 truncate">{doc.titulo}</p>
                    <p className="text-xs text-slate-400">{formatarData(doc.created_at)} · {assinados}/{signers.length} assinaram</p>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shrink-0 ${
                    doc.status === 'concluido' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {doc.status === 'concluido' ? 'Concluído' : 'Pendente'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: NOVO DOCUMENTO */}
      {showNewModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4" onClick={() => setShowNewModal(false)}>
          <div
            className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4">
              <h2 className="font-black text-slate-900 text-lg">Novo Documento para Assinatura</h2>
              <button onClick={() => setShowNewModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={22} /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Título</label>
                <input
                  type="text"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-indigo-500"
                  placeholder="Ex.: Ata de reunião — Fevereiro/2026"
                  value={form.titulo}
                  onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Arquivo PDF</label>
                <label className="flex items-center gap-3 p-4 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-indigo-400 transition-colors">
                  <Upload size={20} className="text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-500 truncate">{form.file ? form.file.name : 'Selecionar arquivo PDF'}</span>
                  <input
                    type="file" accept="application/pdf" className="hidden"
                    onChange={e => setForm(f => ({ ...f, file: e.target.files?.[0] || null }))}
                  />
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    Signatários ({form.selectedIds.size} selecionado{form.selectedIds.size !== 1 ? 's' : ''})
                  </label>
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="text" placeholder="Buscar usuário..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500"
                    value={form.busca} onChange={e => setForm(f => ({ ...f, busca: e.target.value }))}
                  />
                </div>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {profilesFiltrados.map(p => (
                    <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" className="accent-indigo-600" checked={form.selectedIds.has(p.id)} onChange={() => toggleSigner(p.id)} />
                      <span className="flex-1 truncate">{p.full_name}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0">{ROLE_LABELS[p.role] || p.role}</span>
                    </label>
                  ))}
                  {profilesFiltrados.length === 0 && (
                    <p className="px-3 py-4 text-sm text-slate-400 text-center">Nenhum usuário encontrado.</p>
                  )}
                </div>
              </div>

              <button
                onClick={handleCreateDocument} disabled={creating}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {creating ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />} Enviar para Assinatura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETALHE DO DOCUMENTO */}
      {selectedDoc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4" onClick={() => setSelectedDocId(null)}>
          <div
            className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-black text-slate-900 text-lg truncate">{selectedDoc.titulo}</h2>
                <p className="text-xs text-slate-400 mt-1">Criado em {formatarData(selectedDoc.created_at)}</p>
              </div>
              <button onClick={() => setSelectedDocId(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 shrink-0"><X size={22} /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              <button onClick={() => handleVerOriginal(selectedDoc)} className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:underline">
                <ExternalLink size={16} /> Ver PDF original
              </button>

              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase">Signatários</p>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {selectedSigners.map(s => {
                    const souEu = s.profile_id === me?.id;
                    return (
                      <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                        {s.status === 'assinado'
                          ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                          : <Circle size={18} className="text-slate-300 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-700 truncate">{s.profiles?.full_name || '—'}</p>
                          <p className="text-xs text-slate-400">
                            {s.status === 'assinado' ? `Assinado em ${formatarData(s.signed_at)}` : 'Aguardando assinatura'}
                          </p>
                        </div>
                        {souEu && s.status === 'pendente' && (
                          <button
                            onClick={() => handleSign(selectedDoc, s)}
                            disabled={signingId === s.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shrink-0 disabled:opacity-60"
                          >
                            {signingId === s.id ? <Loader2 className="animate-spin" size={14} /> : <FileSignature size={14} />} Assinar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedDoc.status === 'concluido' ? (
                <button
                  onClick={() => handleDownloadSigned(selectedDoc)} disabled={downloadingId === selectedDoc.id}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {downloadingId === selectedDoc.id ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />} Baixar Documento Assinado
                </button>
              ) : (
                <p className="text-sm text-slate-400 text-center py-2">O download ficará disponível quando todos assinarem.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
