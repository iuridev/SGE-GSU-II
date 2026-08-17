import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import {
  Plus, X, Loader2, Target, Paperclip, ChevronLeft,
  FileDown, Lock, Upload, FileText, Image as ImageIcon,
  Trash2, History, Pencil, Check, FileStack,
} from 'lucide-react';
import jsPDF from 'jspdf';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';
import autoTable from 'jspdf-autotable';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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

// Quebra um texto em linhas de até maxChars, pra desenhar com pdf-lib (que
// não tem word-wrap nativo como o jsPDF).
function quebrarLinha(texto: string, maxChars: number): string[] {
  const palavras = (texto || '—').split(/\s+/);
  const linhas: string[] = [];
  let atual = '';
  palavras.forEach(p => {
    if ((atual + ' ' + p).trim().length > maxChars) {
      if (atual) linhas.push(atual.trim());
      atual = p;
    } else {
      atual = (atual + ' ' + p).trim();
    }
  });
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : ['—'];
}

// Decodifica a imagem (jpg/png/webp/gif) via canvas e reexporta como PNG,
// já que o pdf-lib só embute PNG/JPEG diretamente.
async function imagemParaPngBytes(blob: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível neste navegador.');
  ctx.drawImage(bitmap, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface Meta {
  id: string;
  dimensao: string;
  meta: string;
  acao_estrategia: string;
  responsavel_id: string;
  responsavel_nome: string;
  corresponsavel_id: string;
  corresponsavel_nome: string;
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

interface EtapaExcluida {
  id: string;
  etapa_id: string;
  meta_id: string;
  ordem: string;
  descricao: string;
  responsavel_id: string;
  responsavel_nome: string;
  prazo_previsto: string;
  status: string;
  motivo_exclusao: string;
  excluido_por: string;
  excluido_por_nome: string;
  excluido_em: string;
}

interface Profile {
  id: string;
  full_name: string;
}

const META_FORM_INITIAL = { dimensao: DIMENSOES[0], meta: '', acao_estrategia: '', responsavel_id: '', corresponsavel_id: '' };

export default function PlanoAcao() {
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);

  const [metas, setMetas] = useState<Meta[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [etapasExcluidas, setEtapasExcluidas] = useState<EtapaExcluida[]>([]);
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
  const [gerandoEvidencias, setGerandoEvidencias] = useState(false);

  const [etapaParaExcluir, setEtapaParaExcluir] = useState<Etapa | null>(null);
  const [excluindoEtapa, setExcluindoEtapa] = useState(false);

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
    setEtapasExcluidas(Array.isArray(data?.etapasExcluidas) ? data.etapasExcluidas : []);
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
      corresponsavel_id: meta.corresponsavel_id || '',
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
      const corresponsavelNome = profiles.find(p => p.id === metaForm.corresponsavel_id)?.full_name || '';
      if (editingMeta) {
        const { error } = await supabase.functions.invoke('google-sheets-plano-acao', {
          body: {
            entity: 'meta', action: 'update', id: editingMeta.id,
            data: { ...metaForm, responsavel_nome: responsavelNome, corresponsavel_nome: corresponsavelNome },
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
              corresponsavel_nome: corresponsavelNome,
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

  const handleConfirmarExclusaoEtapa = async (motivo: string) => {
    if (!etapaParaExcluir) return;
    setExcluindoEtapa(true);
    try {
      const { error } = await supabase.functions.invoke('google-sheets-plano-acao', {
        body: {
          entity: 'etapa', action: 'delete', id: etapaParaExcluir.id,
          data: {
            motivo_exclusao: motivo,
            excluido_por: currentUser?.id || '',
            excluido_por_nome: currentUser?.full_name || '',
            excluido_em: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;
      setEtapas(prev => prev.filter(e => e.id !== etapaParaExcluir.id));
      setEtapaParaExcluir(null);
      refreshSoon();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir etapa. Tente novamente.');
    } finally {
      setExcluindoEtapa(false);
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

  const handleAtualizarEvidencia = async (evidencia: Evidencia, observacao: string) => {
    setEvidencias(prev => prev.map(ev => ev.id === evidencia.id ? { ...ev, observacao } : ev));
    try {
      const { error } = await supabase.functions.invoke('google-sheets-plano-acao', {
        body: { entity: 'evidencia', action: 'update', id: evidencia.id, data: { observacao } },
      });
      if (error) throw error;
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar observação da evidência. Recarregando dados...');
      fetchAll();
    }
  };

  // ── Derivados ──────────────────────────────────────────────────────────
  const etapasDaMeta = (metaId: string) =>
    etapas.filter(e => e.meta_id === metaId).sort((a, b) => Number(a.ordem) - Number(b.ordem));

  const evidenciasDaEtapa = (etapaId: string) =>
    evidencias.filter(ev => ev.etapa_id === etapaId).sort((a, b) => a.criado_em.localeCompare(b.criado_em));

  const etapasExcluidasDaMeta = (metaId: string) =>
    etapasExcluidas.filter(e => e.meta_id === metaId).sort((a, b) => b.excluido_em.localeCompare(a.excluido_em));

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

  // Junta todas as fotos e PDFs de evidência num único arquivo PDF (fotos
  // viram páginas de imagem, PDFs têm suas páginas copiadas de verdade —
  // não é só uma lista de links). Cada evidência ganha uma página de legenda
  // antes, pra dar contexto de qual etapa/meta ela comprova.
  const gerarArquivoEvidencias = async (metasParaExportar: Meta[]) => {
    const itens: { meta: Meta; etapa: Etapa; evidencia: Evidencia }[] = [];
    metasParaExportar.forEach(meta => {
      etapasDaMeta(meta.id).forEach(etapa => {
        evidenciasDaEtapa(etapa.id).forEach(evidencia => itens.push({ meta, etapa, evidencia }));
      });
    });
    if (itens.length === 0) {
      alert('Nenhuma evidência para exportar.');
      return;
    }

    setGerandoEvidencias(true);
    try {
      const finalDoc = await PDFDocument.create();
      const fontBold = await finalDoc.embedFont(StandardFonts.HelveticaBold);
      const fontRegular = await finalDoc.embedFont(StandardFonts.Helvetica);
      const A4: [number, number] = [595.28, 841.89];
      const roxo = rgb(0.31, 0.27, 0.9);
      const cinza = rgb(0.4, 0.4, 0.4);
      const escuro = rgb(0.2, 0.2, 0.2);

      const capa = finalDoc.addPage(A4);
      capa.drawText('Evidências — Plano de Ação', { x: 40, y: 780, size: 18, font: fontBold, color: roxo });
      capa.drawText(`Gerado em ${new Date().toLocaleString('pt-BR')}`, { x: 40, y: 758, size: 10, font: fontRegular, color: cinza });
      metasParaExportar.forEach((m, i) => {
        if (i < 30) capa.drawText(`• ${m.meta}`.slice(0, 110), { x: 40, y: 720 - i * 16, size: 9, font: fontRegular, color: escuro });
      });

      let falhas = 0;
      for (const { meta, etapa, evidencia } of itens) {
        const legenda = finalDoc.addPage(A4);
        let y = 780;
        legenda.drawText('Evidência', { x: 40, y, size: 14, font: fontBold, color: roxo });
        y -= 30;
        const campos: [string, string][] = [
          ['Meta:', meta.meta],
          [`Etapa ${etapa.ordem}:`, etapa.descricao || '(sem descrição)'],
          ['Arquivo:', evidencia.arquivo_nome],
          ['Observação:', evidencia.observacao || '—'],
          ['Autor:', evidencia.autor_nome || '—'],
          ['Data:', evidencia.criado_em ? new Date(evidencia.criado_em).toLocaleString('pt-BR') : '—'],
        ];
        campos.forEach(([label, valor]) => {
          legenda.drawText(label, { x: 40, y, size: 9, font: fontBold, color: cinza });
          const linhas = quebrarLinha(valor, 85);
          linhas.forEach((linha, idx) => {
            legenda.drawText(linha, { x: 150, y: y - idx * 12, size: 9, font: fontRegular, color: escuro });
          });
          y -= 12 * linhas.length + 8;
        });

        try {
          const res = await fetch(evidencia.arquivo_url);
          if (!res.ok) throw new Error(`download falhou (${res.status})`);
          const blob = await res.blob();
          const ext = (evidencia.arquivo_nome.split('.').pop() || '').toLowerCase();
          const isPdf = ext === 'pdf' || blob.type === 'application/pdf';

          if (isPdf) {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
            const paginas = await finalDoc.copyPages(srcDoc, srcDoc.getPageIndices());
            paginas.forEach(p => finalDoc.addPage(p));
          } else {
            const pngBytes = await imagemParaPngBytes(blob);
            const img = await finalDoc.embedPng(pngBytes);
            const maxW = A4[0] - 80, maxH = A4[1] - 80;
            const escala = Math.min(maxW / img.width, maxH / img.height, 1);
            const w = img.width * escala, h = img.height * escala;
            const pagina = finalDoc.addPage(A4);
            pagina.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h });
          }
        } catch (err) {
          console.error('Erro ao anexar evidência', evidencia.arquivo_nome, err);
          falhas++;
          legenda.drawText('⚠ Não foi possível carregar o arquivo original (link indisponível ou expirado).', { x: 40, y: y - 4, size: 9, font: fontRegular, color: rgb(0.8, 0.2, 0.2) });
        }
      }

      const bytes = await finalDoc.save();
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evidencias-plano-de-acao-${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      if (falhas > 0) alert(`${falhas} evidência(s) não puderam ser incluídas (arquivo indisponível). As demais foram exportadas normalmente.`);
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar arquivo de evidências. Tente novamente.');
    } finally {
      setGerandoEvidencias(false);
    }
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
            onGerarArquivoEvidencias={() => gerarArquivoEvidencias(metasFiltradas)}
            gerandoEvidencias={gerandoEvidencias}
          />
        ) : selectedMeta ? (
          <DetalheMeta
            meta={selectedMeta}
            etapas={etapasDaMeta(selectedMeta.id)}
            etapasExcluidas={etapasExcluidasDaMeta(selectedMeta.id)}
            evidenciasDaEtapa={evidenciasDaEtapa}
            profiles={profiles}
            uploadingEtapaId={uploadingEtapaId}
            evidenciaObs={evidenciaObs}
            setEvidenciaObs={setEvidenciaObs}
            onVoltar={() => { setView('lista'); setSelectedMetaId(null); }}
            onEditarMeta={() => openEditarMeta(selectedMeta)}
            onAdicionarEtapa={() => handleAdicionarEtapa(selectedMeta.id)}
            onAtualizarEtapa={handleAtualizarEtapa}
            onExcluirEtapa={setEtapaParaExcluir}
            onUploadEvidencia={handleUploadEvidencia}
            onEditarEvidencia={handleAtualizarEvidencia}
            onGerarArquivo={() => gerarArquivo([selectedMeta])}
            onGerarArquivoEvidencias={() => gerarArquivoEvidencias([selectedMeta])}
            gerandoEvidencias={gerandoEvidencias}
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

      {etapaParaExcluir && (
        <ExcluirEtapaModal
          etapa={etapaParaExcluir}
          excluindo={excluindoEtapa}
          onClose={() => setEtapaParaExcluir(null)}
          onConfirmar={handleConfirmarExclusaoEtapa}
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
  onGerarArquivoEvidencias, gerandoEvidencias,
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
  onGerarArquivoEvidencias: () => void;
  gerandoEvidencias: boolean;
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
        <div className="flex gap-2 flex-wrap">
          <button onClick={onGerarArquivo} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
            <FileDown size={16} /> Gerar arquivo
          </button>
          <button
            onClick={onGerarArquivoEvidencias}
            disabled={gerandoEvidencias}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-60"
          >
            {gerandoEvidencias ? <Loader2 size={16} className="animate-spin" /> : <FileStack size={16} />}
            {gerandoEvidencias ? 'Gerando...' : 'Gerar arquivo de evidências'}
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
  meta, etapas, etapasExcluidas, evidenciasDaEtapa, profiles, uploadingEtapaId, evidenciaObs, setEvidenciaObs,
  onVoltar, onEditarMeta, onAdicionarEtapa, onAtualizarEtapa, onExcluirEtapa, onUploadEvidencia, onEditarEvidencia,
  onGerarArquivo, onGerarArquivoEvidencias, gerandoEvidencias,
}: {
  meta: Meta;
  etapas: Etapa[];
  etapasExcluidas: EtapaExcluida[];
  evidenciasDaEtapa: (etapaId: string) => Evidencia[];
  profiles: Profile[];
  uploadingEtapaId: string | null;
  evidenciaObs: Record<string, string>;
  setEvidenciaObs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onVoltar: () => void;
  onEditarMeta: () => void;
  onAdicionarEtapa: () => void;
  onAtualizarEtapa: (etapa: Etapa, changes: Partial<Etapa>) => void;
  onExcluirEtapa: (etapa: Etapa) => void;
  onUploadEvidencia: (etapaId: string, file: File) => void;
  onEditarEvidencia: (evidencia: Evidencia, observacao: string) => void;
  onGerarArquivo: () => void;
  onGerarArquivoEvidencias: () => void;
  gerandoEvidencias: boolean;
}) {
  return (
    <>
      <button onClick={onVoltar} className="flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-indigo-600 mb-4 transition-all">
        <ChevronLeft size={16} /> Voltar para listagem
      </button>

      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <span className="text-[9px] font-black text-indigo-600 uppercase bg-indigo-50 px-2 py-1 rounded-lg">{meta.dimensao}</span>
          <div className="flex gap-2 shrink-0 flex-wrap justify-end">
            <button onClick={onEditarMeta} className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all">Editar</button>
            <button onClick={onGerarArquivo} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all">
              <FileDown size={14} /> Gerar arquivo
            </button>
            <button
              onClick={onGerarArquivoEvidencias}
              disabled={gerandoEvidencias}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all disabled:opacity-60"
            >
              {gerandoEvidencias ? <Loader2 size={14} className="animate-spin" /> : <FileStack size={14} />}
              {gerandoEvidencias ? 'Gerando...' : 'Gerar arquivo de evidências'}
            </button>
          </div>
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Meta</p>
        <p className="text-sm font-bold text-slate-800 mb-4">{meta.meta}</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Qual ação/estratégia?</p>
        <p className="text-sm text-slate-600 mb-4">{meta.acao_estrategia}</p>
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Responsável geral</p>
            <p className="text-sm font-bold text-slate-700">{meta.responsavel_nome || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Corresponsável</p>
            <p className="text-sm font-bold text-slate-700">{meta.corresponsavel_nome || '—'}</p>
          </div>
        </div>
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
            onExcluir={() => onExcluirEtapa(etapa)}
            onUpload={(file) => onUploadEvidencia(etapa.id, file)}
            onEditarEvidencia={onEditarEvidencia}
          />
        ))}
      </div>

      {etapasExcluidas.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-tight flex items-center gap-1.5 mb-3">
            <History size={16} className="text-slate-400" /> Histórico de exclusões
          </h2>
          <div className="space-y-2">
            {etapasExcluidas.map(h => (
              <div key={h.id} className="bg-white p-4 rounded-2xl border border-slate-100 text-xs">
                <p className="font-bold text-slate-700 mb-1">
                  Etapa {h.ordem}: {h.descricao || '(sem descrição)'}
                </p>
                <p className="text-slate-500 mb-1"><span className="font-bold">Motivo:</span> {h.motivo_exclusao || '—'}</p>
                <p className="text-slate-400">
                  Excluída por {h.excluido_por_nome || '—'} em {h.excluido_em ? new Date(h.excluido_em).toLocaleString('pt-BR') : '—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function EtapaCard({
  etapa, evidencias, profiles, uploading, observacao, setObservacao, onAtualizar, onExcluir, onUpload, onEditarEvidencia,
}: {
  etapa: Etapa;
  evidencias: Evidencia[];
  profiles: Profile[];
  uploading: boolean;
  observacao: string;
  setObservacao: (v: string) => void;
  onAtualizar: (changes: Partial<Etapa>) => void;
  onExcluir: () => void;
  onUpload: (file: File) => void;
  onEditarEvidencia: (evidencia: Evidencia, observacao: string) => void;
}) {
  const [descricao, setDescricao] = useState(etapa.descricao);
  const [editandoEvidenciaId, setEditandoEvidenciaId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState('');

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
        <button
          type="button"
          onClick={onExcluir}
          title="Excluir etapa"
          className="shrink-0 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
        >
          <Trash2 size={16} />
        </button>
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
              const editando = editandoEvidenciaId === ev.id;
              return (
                <li key={ev.id} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg p-2">
                  {isImage ? <ImageIcon size={14} className="text-indigo-400 shrink-0" /> : <FileText size={14} className="text-slate-400 shrink-0" />}
                  <a href={ev.arquivo_url} target="_blank" rel="noopener noreferrer" className="font-bold text-indigo-600 hover:underline truncate shrink-0 max-w-[40%]">{ev.arquivo_nome}</a>
                  {editando ? (
                    <>
                      <input
                        type="text"
                        autoFocus
                        className="flex-1 p-1 bg-white border border-indigo-300 rounded text-xs outline-none"
                        placeholder="O que essa evidência comprova?"
                        value={textoEdicao}
                        onChange={e => setTextoEdicao(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { onEditarEvidencia(ev, textoEdicao.trim()); setEditandoEvidenciaId(null); }
                          if (e.key === 'Escape') setEditandoEvidenciaId(null);
                        }}
                      />
                      <button
                        type="button"
                        title="Salvar"
                        onClick={() => { onEditarEvidencia(ev, textoEdicao.trim()); setEditandoEvidenciaId(null); }}
                        className="shrink-0 p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        title="Cancelar"
                        onClick={() => setEditandoEvidenciaId(null)}
                        className="shrink-0 p-1 text-slate-400 hover:bg-slate-100 rounded transition-all"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`truncate flex-1 ${ev.observacao ? 'text-slate-400' : 'text-slate-300 italic'}`}>{ev.observacao || 'sem observação'}</span>
                      <button
                        type="button"
                        title="Editar observação"
                        onClick={() => { setEditandoEvidenciaId(ev.id); setTextoEdicao(ev.observacao || ''); }}
                        className="shrink-0 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all"
                      >
                        <Pencil size={12} />
                      </button>
                      <span className="text-slate-400 shrink-0">{ev.criado_em ? new Date(ev.criado_em).toLocaleDateString('pt-BR') : ''} · {ev.autor_nome}</span>
                    </>
                  )}
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
          <div>
            <label className={labelClass}>Corresponsável pela meta</label>
            <select className={selectClass} value={form.corresponsavel_id} onChange={e => setForm(f => ({ ...f, corresponsavel_id: e.target.value }))}>
              <option value="">Nenhum</option>
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

function ExcluirEtapaModal({
  etapa, excluindo, onClose, onConfirmar,
}: {
  etapa: Etapa;
  excluindo: boolean;
  onClose: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) {
      alert('Informe o motivo da exclusão.');
      return;
    }
    onConfirmar(motivo.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Excluir Etapa</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-slate-600">
            Tem certeza que deseja excluir a etapa <span className="font-bold">{etapa.ordem}. {etapa.descricao || '(sem descrição)'}</span>?
            Essa ação ficará registrada no histórico de exclusões da meta.
          </p>
          <div>
            <label className={labelClass}>Motivo da exclusão</label>
            <textarea
              className={selectClass}
              rows={3}
              placeholder="Explique por que essa etapa está sendo excluída..."
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 bg-slate-100 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-all">Cancelar</button>
            <button type="submit" disabled={excluindo} className="flex items-center gap-2 px-4 py-2.5 bg-red-600 rounded-xl text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60 transition-all">
              {excluindo && <Loader2 size={14} className="animate-spin" />} Excluir
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
