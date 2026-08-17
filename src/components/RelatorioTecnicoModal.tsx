import { useState } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';
import { X, FileText, Loader2, Plus, Pencil, ArrowLeft } from 'lucide-react';
import {
  type Occurrence, type OccurrenceImpactReview, type TechnicalReport,
  IMPACTO_OPTIONS, groupOccurrencesBySchoolChronological,
} from '../lib/fiscalizacaoTerceirizados';

const FUNCTION_NAME = 'google-sheets-fiscalizacao-terceirizados';

interface Escola { id: string; name: string; }

interface Props {
  schools: Escola[];
  occurrences: Occurrence[];
  impactReviews: OccurrenceImpactReview[];
  reports: TechnicalReport[];
  currentUserName: string;
  onClose: () => void;
  onChanged: () => void;
}

const FORM_INICIAL = { titulo: 'Relatório Técnico de Fiscalização', periodoInicio: '', periodoFim: '', textoAdmin: '' };

// Converte a URL pública de uma imagem em data URL base64, pra poder ser
// embutida de verdade numa página do PDF via doc.addImage. Retorna null em
// caso de falha (rede, CORS) — quem chama decide o que fazer, não quebra o
// relatório inteiro por causa de uma foto.
async function urlParaBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Renderiza o anexo de uma ocorrência no PDF: foto embutida de verdade;
// PDF vira um link clicável (jsPDF não cola páginas de outro PDF dentro do
// gerado). Retorna o novo cursor Y.
async function adicionarAnexo(doc: jsPDF, url: string, x: number, y: number, larguraMax: number, alturaPagina: number): Promise<number> {
  const ehPdf = /\.pdf(\?|$)/i.test(url);
  const ehImagem = /\.(jpe?g|png|webp)(\?|$)/i.test(url);

  if (ehPdf || !ehImagem) {
    doc.setFontSize(8.5);
    doc.setTextColor(37, 99, 235);
    doc.textWithLink(ehPdf ? '📎 Abrir anexo (PDF)' : '📎 Abrir anexo', x, y, { url });
    doc.setTextColor(0, 0, 0);
    return y + 6;
  }

  const base64 = await urlParaBase64(url);
  if (!base64) {
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('(não foi possível carregar a foto anexada)', x, y);
    doc.setTextColor(0, 0, 0);
    return y + 6;
  }

  try {
    const props = doc.getImageProperties(base64);
    const largura = Math.min(larguraMax, 80);
    const altura = (props.height * largura) / props.width;
    if (y + altura > alturaPagina - 20) { doc.addPage(); y = 34; }
    doc.addImage(base64, props.fileType || 'JPEG', x, y, largura, altura);
    return y + altura + 6;
  } catch (err) {
    console.error('Erro ao embutir foto no relatório técnico:', err);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('(não foi possível embutir a foto anexada)', x, y);
    doc.setTextColor(0, 0, 0);
    return y + 6;
  }
}

export function RelatorioTecnicoModal({ schools, occurrences, impactReviews, reports, currentUserName, onClose, onChanged }: Props) {
  const [view, setView] = useState<'lista' | 'editor'>(reports.length > 0 ? 'lista' : 'editor');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [salvando, setSalvando] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  const abrirNovo = () => {
    setEditingId(null);
    setForm(FORM_INICIAL);
    setView('editor');
  };

  const abrirEdicao = (r: TechnicalReport) => {
    setEditingId(r.id);
    setForm({ titulo: r.titulo, periodoInicio: r.periodoInicio, periodoFim: r.periodoFim, textoAdmin: r.textoAdmin });
    setView('editor');
  };

  const handleSalvar = async () => {
    if (!form.periodoInicio || !form.periodoFim) { toast.error('Informe o período (início e fim).'); return; }
    setSalvando(true);
    try {
      if (editingId) {
        const { error } = await supabase.functions.invoke(FUNCTION_NAME, {
          body: {
            entity: 'technicalReport', action: 'update', id: editingId,
            data: { ...form, atualizadoEm: new Date().toISOString() },
          },
        });
        if (error) throw error;
        toast.success('Relatório atualizado!');
      } else {
        const { error } = await supabase.functions.invoke(FUNCTION_NAME, {
          body: {
            entity: 'technicalReport', action: 'create',
            data: {
              id: `rel-${Date.now()}`, ...form,
              criadoPor: currentUserName,
              criadoEm: new Date().toISOString(),
              atualizadoEm: new Date().toISOString(),
            },
          },
        });
        if (error) throw error;
        toast.success('Relatório salvo!');
      }
      onChanged();
      setView('lista');
    } catch (err) {
      console.error('Erro ao salvar relatório técnico:', err);
      toast.error('Não foi possível salvar, tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const handleGerarPdf = async () => {
    if (!form.periodoInicio || !form.periodoFim) { toast.error('Informe o período (início e fim).'); return; }
    const grupos = groupOccurrencesBySchoolChronological(occurrences, schools, form.periodoInicio, form.periodoFim);
    if (grupos.length === 0) { toast.error('Nenhuma ocorrência encontrada nesse período.'); return; }

    setGerandoPdf(true);
    try {
      const doc = new jsPDF();
      const margin = 14;
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      doc.setFontSize(14); doc.setTextColor(30, 41, 59);
      doc.text(form.titulo || 'Relatório Técnico de Fiscalização', margin, 40);
      doc.setFontSize(9); doc.setTextColor(100);
      doc.text(`Período: ${form.periodoInicio} a ${form.periodoFim}`, margin, 46);
      doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, 51);

      let y = 60;
      if (form.textoAdmin.trim()) {
        doc.setFontSize(10); doc.setTextColor(0, 0, 0);
        const linhas = doc.splitTextToSize(form.textoAdmin, pageW - margin * 2);
        doc.text(linhas, margin, y);
        y += linhas.length * 4.5 + 10;
      }

      for (const grupo of grupos) {
        if (y > pageH - 40) { doc.addPage(); y = 34; }
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, y, pageW - margin * 2, 8, 'F');
        doc.setFontSize(11); doc.setTextColor(255, 255, 255);
        doc.text(grupo.escolaNome, margin + 2, y + 6);
        y += 13;
        doc.setTextColor(0, 0, 0);

        const impactosDaEscola = impactReviews.filter(r =>
          r.escolaId === grupo.escolaId &&
          r.mesReferencia >= form.periodoInicio.slice(0, 7) &&
          r.mesReferencia <= form.periodoFim.slice(0, 7),
        );
        if (impactosDaEscola.length > 0) {
          doc.setFontSize(8.5); doc.setTextColor(100, 100, 100);
          const texto = `Impacto reportado pela escola: ${impactosDaEscola
            .map(r => `${r.mesReferencia} — ${IMPACTO_OPTIONS.find(o => o.valor === r.grauImpacto)?.label || r.grauImpacto}`)
            .join('; ')}`;
          const linhas = doc.splitTextToSize(texto, pageW - margin * 2);
          doc.text(linhas, margin, y);
          y += linhas.length * 4.2 + 4;
          doc.setTextColor(0, 0, 0);
        }

        for (const o of grupo.occurrences) {
          if (y > pageH - 50) { doc.addPage(); y = 34; }
          doc.setFontSize(9.5); doc.setFont('helvetica', 'bold');
          doc.text(`${new Date(o.data + 'T12:00:00').toLocaleDateString('pt-BR')} — ${o.ambiente} — ${o.categoriaOcorrencia}`, margin, y);
          y += 5;

          doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
          const linhasDescricao = doc.splitTextToSize(`Descrição: ${o.descricaoOcorrencia}`, pageW - margin * 2);
          doc.text(linhasDescricao, margin, y);
          y += linhasDescricao.length * 4.2;

          if (o.providenciaAdotada) {
            const linhas = doc.splitTextToSize(`Providência adotada: ${o.providenciaAdotada}`, pageW - margin * 2);
            doc.text(linhas, margin, y);
            y += linhas.length * 4.2;
          }
          if (o.retornoDaEmpresa) {
            const linhas = doc.splitTextToSize(`Retorno da empresa: ${o.retornoDaEmpresa}`, pageW - margin * 2);
            doc.text(linhas, margin, y);
            y += linhas.length * 4.2;
          }

          doc.setFontSize(8.5); doc.setTextColor(100, 100, 100);
          doc.text(`Situação: ${o.situacao === 'resolvido' ? 'Resolvido' : 'Pendente'}`, margin, y);
          doc.setTextColor(0, 0, 0);
          y += 6;

          if (o.anexos) {
            y = await adicionarAnexo(doc, o.anexos, margin, y, pageW - margin * 2, pageH);
          }

          if (y > pageH - 20) { doc.addPage(); y = 34; }
          doc.setDrawColor(226, 232, 240);
          doc.line(margin, y, pageW - margin, y);
          y += 6;
        }
        y += 6;
      }

      addTimbradoAllPages(doc);
      doc.save(`relatorio-tecnico_${form.periodoInicio}_a_${form.periodoFim}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar relatório técnico:', err);
      toast.error('Não foi possível gerar o PDF.');
    } finally {
      setGerandoPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {view === 'editor' && reports.length > 0 && (
              <button onClick={() => setView('lista')} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><ArrowLeft size={20} /></button>
            )}
            <div className="p-2.5 bg-slate-800 rounded-2xl text-white shrink-0"><FileText size={22} /></div>
            <div>
              <h2 className="font-black text-slate-900 text-lg leading-none">Relatório Técnico de Fiscalização</h2>
              <p className="text-xs text-slate-400 mt-1">Fotos anexadas aparecem no relatório; PDFs anexados viram link</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={22} /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {view === 'lista' ? (
            <div className="space-y-3">
              <button
                onClick={abrirNovo}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-900 hover:bg-black text-white rounded-xl font-bold"
              >
                <Plus size={18} /> Novo Relatório
              </button>
              {reports.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Nenhum relatório salvo ainda.</p>
              ) : [...reports].sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)).map(r => (
                <div key={r.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{r.titulo}</p>
                    <p className="text-xs text-slate-400">{r.periodoInicio} a {r.periodoFim} · atualizado em {new Date(r.atualizadoEm).toLocaleString('pt-BR')}</p>
                  </div>
                  <button onClick={() => abrirEdicao(r)} className="shrink-0 p-2 text-slate-500 hover:bg-slate-100 rounded-lg" title="Editar">
                    <Pencil size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Título</label>
                <input
                  type="text"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500"
                  value={form.titulo}
                  onChange={e => setForm({ ...form, titulo: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Período — início</label>
                  <input type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500" value={form.periodoInicio} onChange={e => setForm({ ...form, periodoInicio: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Período — fim</label>
                  <input type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500" value={form.periodoFim} onChange={e => setForm({ ...form, periodoFim: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Texto do relatório</label>
                <textarea
                  rows={8} placeholder="Análise técnica, considerações, recomendações..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500 resize-none"
                  value={form.textoAdmin}
                  onChange={e => setForm({ ...form, textoAdmin: e.target.value })}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleSalvar} disabled={salvando}
                  className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {salvando ? <Loader2 className="animate-spin" size={18} /> : null} Salvar
                </button>
                <button
                  onClick={handleGerarPdf} disabled={gerandoPdf}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {gerandoPdf ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />} Gerar PDF
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RelatorioTecnicoModal;
