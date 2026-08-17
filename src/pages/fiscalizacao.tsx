import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole, isReadOnlyRole } from '../lib/roles';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  ClipboardCheck, Plus, FileDown, FileText, Loader2, ListChecks, History,
  AlertCircle, AlertTriangle, CheckCircle2, Paperclip, X, Lock, ChevronDown,
  Star, CalendarClock, ShieldAlert, Send, Megaphone,
} from 'lucide-react';
import { EnviarAlertaModal } from '../components/EnviarAlertaModal';
import { IsencaoServicoModal } from '../components/IsencaoServicoModal';
import { RelatorioTecnicoModal } from '../components/RelatorioTecnicoModal';
import {
  type ServiceType, type ChecklistItem, type Occurrence, type ChecklistCompletion,
  type ChecklistDueStatus, type SatisfactionRating, type VisitRequest, type Granularidade,
  type ServiceExemption, type OccurrenceImpactReview, type GrauImpacto, type TechnicalReport,
  OCCURRENCE_CATEGORIES, SITUACOES, FREQUENCIAS, IMPACTO_OPTIONS,
  isAtivo, isFrequenciaObrigatoria, isSchoolExempt, getChecklistDueInfo, getUltimaDataChecklist,
  validateOccurrenceForm, rowsToCsv, downloadCsv,
  aggregateSatisfactionByPeriod, getSchoolsNeedingAttention, summarizeChecklistAlertsBySchool,
  getMesesPendentesDeAvaliacao, countOccurrencesBySchool,
} from '../lib/fiscalizacaoTerceirizados';

const FUNCTION_NAME = 'google-sheets-fiscalizacao-terceirizados';
const BUCKET_NAME = 'fiscalizacao-terceirizados-evidencias';

// Papéis regionais/URE enxergam e atuam em qualquer escola; school_manager
// fica travado na própria escola (profiles.school_id).
const ADMIN_LIKE_ROLES = ['regional_admin', 'supervisor', 'dirigente', 'ure_servico'];

interface School { id: string; name: string; }

interface CurrentUser {
  id: string;
  full_name: string;
  role: string;
  readOnly: boolean;
  school_id: string | null;
}

type View = 'ocorrencia' | 'checklist' | 'historico' | 'satisfacao' | 'visita';

const OCORRENCIA_FORM_INICIAL = {
  data: new Date().toISOString().split('T')[0],
  escolaId: '',
  serviceTypeId: '',
  ambiente: '',
  categoriaOcorrencia: OCCURRENCE_CATEGORIES[0] as string,
  descricaoOcorrencia: '',
  providenciaAdotada: '',
  retornoDaEmpresa: '',
  situacao: 'pendente' as string,
};

const DUE_BADGE: Record<string, { label: string; className: string }> = {
  diaria: { label: 'Diário', className: 'bg-slate-100 text-slate-600' },
  'nunca-preenchido': { label: 'Nunca preenchido', className: 'bg-red-100 text-red-700' },
  atrasado: { label: 'Atrasado', className: 'bg-red-100 text-red-700' },
  vencendo: { label: 'Vence em breve', className: 'bg-amber-100 text-amber-700' },
  'em-dia': { label: 'Em dia', className: 'bg-emerald-100 text-emerald-700' },
};

export function Fiscalizacao() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Checklist entra em destaque: é o que precisa de acompanhamento contínuo
  // (semanal/mensal/trimestral obrigatórios), diferente do registro de
  // ocorrência, que é pontual.
  const [view, setView] = useState<View>('checklist');

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [schools, setSchools] = useState<School[]>([]);

  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [completions, setCompletions] = useState<ChecklistCompletion[]>([]);
  const [satisfactionRatings, setSatisfactionRatings] = useState<SatisfactionRating[]>([]);
  const [visitRequests, setVisitRequests] = useState<VisitRequest[]>([]);
  const [serviceExemptions, setServiceExemptions] = useState<ServiceExemption[]>([]);
  const [impactReviews, setImpactReviews] = useState<OccurrenceImpactReview[]>([]);
  const [technicalReports, setTechnicalReports] = useState<TechnicalReport[]>([]);

  // Ocorrência
  const [ocorrenciaForm, setOcorrenciaForm] = useState(OCORRENCIA_FORM_INICIAL);
  const [ocorrenciaErrors, setOcorrenciaErrors] = useState<Record<string, string>>({});
  const [anexoFile, setAnexoFile] = useState<File | null>(null);

  // Checklist
  const [checklistEscolaId, setChecklistEscolaId] = useState('');
  const [checklistServiceTypeId, setChecklistServiceTypeId] = useState('');
  const [checklistRespostas, setChecklistRespostas] = useState<Record<string, { executado: 'sim' | 'nao'; observacao: string; data: string }>>({});
  const [mostrarDiaria, setMostrarDiaria] = useState(false);
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false);
  const [showEnviarAlerta, setShowEnviarAlerta] = useState(false);
  const [showIsencaoModal, setShowIsencaoModal] = useState(false);

  // Histórico
  const [histTipo, setHistTipo] = useState<'ocorrencias' | 'checklist'>('ocorrencias');
  const [histEscolaId, setHistEscolaId] = useState('');
  const [histServiceTypeId, setHistServiceTypeId] = useState('');
  const [histInicio, setHistInicio] = useState('');
  const [histFim, setHistFim] = useState('');
  const [histAmbiente, setHistAmbiente] = useState('');
  const [histSituacao, setHistSituacao] = useState('');

  // Satisfação
  const [satisfacaoForm, setSatisfacaoForm] = useState({ serviceTypeId: '', nota: 8, comentario: '' });
  const [satisfacaoGranularidade, setSatisfacaoGranularidade] = useState<Granularidade>('mensal');
  const [satisfacaoInicio, setSatisfacaoInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  });
  const [satisfacaoFim, setSatisfacaoFim] = useState(new Date().toISOString().split('T')[0]);
  const [satisfacaoFiltroEscolaId, setSatisfacaoFiltroEscolaId] = useState('');
  const [satisfacaoFiltroServiceTypeId, setSatisfacaoFiltroServiceTypeId] = useState('');
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);

  // Visita Técnica
  const [visitaMotivo, setVisitaMotivo] = useState('');
  const [agendamentoForm, setAgendamentoForm] = useState<Record<string, { data: string; observacao: string }>>({});

  const isAdminLike = !!currentUser && ADMIN_LIKE_ROLES.includes(currentUser.role);

  useEffect(() => { init(); }, []);

  async function init() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let schoolId: string | null = null;
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles').select('full_name, role, school_id').eq('id', user.id).single();
        const rawRole = profile?.role || '';
        schoolId = profile?.school_id || null;
        setCurrentUser({
          id: user.id,
          full_name: profile?.full_name || user.email || 'Usuário',
          role: resolveViewRole(rawRole),
          readOnly: isReadOnlyRole(rawRole),
          school_id: schoolId,
        });
      }
      if (schoolId) {
        setOcorrenciaForm(f => ({ ...f, escolaId: schoolId! }));
        setChecklistEscolaId(schoolId);
        setHistEscolaId(schoolId);
      }

      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name').order('name');
      setSchools(schoolsData || []);

      await fetchAll();
    } catch (err) {
      console.error('Erro ao carregar Fiscalização de Serviços Terceirizados:', err);
      toast.error('Não foi possível carregar os dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAll() {
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { method: 'GET' });
    if (error) {
      console.error('Erro ao buscar dados da planilha:', error);
      toast.error('Não foi possível carregar os dados da planilha.');
      return;
    }
    setServiceTypes(Array.isArray(data?.serviceTypes) ? data.serviceTypes : []);
    setChecklistItems(Array.isArray(data?.checklistItems) ? data.checklistItems : []);
    setOccurrences(Array.isArray(data?.occurrences) ? data.occurrences : []);
    setCompletions(Array.isArray(data?.checklistCompletions) ? data.checklistCompletions : []);
    setSatisfactionRatings(Array.isArray(data?.satisfactionRatings) ? data.satisfactionRatings : []);
    setVisitRequests(Array.isArray(data?.visitRequests) ? data.visitRequests : []);
    setServiceExemptions(Array.isArray(data?.serviceExemptions) ? data.serviceExemptions : []);
    setImpactReviews(Array.isArray(data?.occurrenceImpactReviews) ? data.occurrenceImpactReviews : []);
    setTechnicalReports(Array.isArray(data?.technicalReports) ? data.technicalReports : []);
  }

  const refreshSoon = () => setTimeout(fetchAll, 1200);

  const activeServiceTypes = useMemo(() => serviceTypes.filter(s => isAtivo(s.ativo)), [serviceTypes]);
  const schoolName = (id: string) => schools.find(s => s.id === id)?.name || id;
  const serviceTypeName = (id: string) => serviceTypes.find(s => s.id === id)?.nome || id;

  // Escola dispensada de um serviço não deve conseguir registrar ocorrência
  // nem avaliar satisfação daquele serviço — só some da lista de opções
  // quando já dá pra saber a escola (sem escola selecionada, mostra tudo).
  const servicosDisponiveisPara = (escolaId: string) =>
    escolaId
      ? activeServiceTypes.filter(s => !isSchoolExempt(serviceExemptions, escolaId, s.id))
      : activeServiceTypes;

  // ── Registrar Ocorrência ───────────────────────────────────────────────
  const handleSubmitOcorrencia = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateOccurrenceForm(ocorrenciaForm);
    setOcorrenciaErrors(errors);
    if (Object.keys(errors).length > 0) { toast.error('Preencha os campos obrigatórios.'); return; }
    if (!ocorrenciaForm.escolaId) { toast.error('Selecione a escola.'); return; }
    if (!ocorrenciaForm.serviceTypeId) { toast.error('Selecione o serviço.'); return; }
    if (isSchoolExempt(serviceExemptions, ocorrenciaForm.escolaId, ocorrenciaForm.serviceTypeId)) {
      toast.error('Esta escola está dispensada deste serviço.');
      return;
    }

    setSaving(true);
    try {
      let anexoUrl = '';
      if (anexoFile) {
        if (!anexoFile.type.startsWith('image/') && anexoFile.type !== 'application/pdf') {
          toast.error('Só é possível anexar imagens ou arquivos PDF.');
          setSaving(false);
          return;
        }
        const ext = anexoFile.name.split('.').pop() || 'bin';
        const path = `ocorrencias/${Date.now()}_${Math.round(Math.random() * 1e6)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME).upload(path, anexoFile, { contentType: anexoFile.type });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
        anexoUrl = publicUrl;
      }

      const { error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          entity: 'occurrence', action: 'create',
          data: {
            id: `occ-${Date.now()}`,
            ...ocorrenciaForm,
            anexos: anexoUrl,
            registradoPor: currentUser?.full_name || '',
            criadoEm: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;

      toast.success('Ocorrência registrada com sucesso!');
      setOcorrenciaForm({ ...OCORRENCIA_FORM_INICIAL, escolaId: currentUser?.school_id || '' });
      setAnexoFile(null);
      setOcorrenciaErrors({});
      refreshSoon();
    } catch (err) {
      console.error('Erro ao salvar ocorrência:', err);
      toast.error('Não foi possível salvar, tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  // ── Checklist de Rotina ────────────────────────────────────────────────
  const checklistItemsDoServico = useMemo(
    () => checklistItems.filter(i => i.serviceTypeId === checklistServiceTypeId && isAtivo(i.ativo)),
    [checklistItems, checklistServiceTypeId],
  );

  const ultimaDataPreenchida = (itemId: string, escolaId: string): string | null =>
    getUltimaDataChecklist(completions, itemId, escolaId);

  // Alerta de vencimento: varre os itens obrigatórios (semanal/mensal/
  // trimestral) de todas as escolas que o usuário enxerga — a própria, para
  // school_manager; todas, para o fiscal/regional — e sinaliza os que estão
  // vencendo, atrasados ou nunca preenchidos. Aparece no topo da página,
  // independente da aba selecionada, para não depender de alguém ir
  // caçar isso dentro do Checklist de Rotina.
  interface ChecklistAlert {
    escolaId: string; escolaNome: string; serviceTypeNome: string;
    itemId: string; itemDescricao: string; status: ChecklistDueStatus;
  }

  const checklistAlerts = useMemo<ChecklistAlert[]>(() => {
    const escolasAlvo = isAdminLike ? schools : schools.filter(s => s.id === currentUser?.school_id);
    const alerts: ChecklistAlert[] = [];
    for (const escola of escolasAlvo) {
      for (const item of checklistItems) {
        if (!isAtivo(item.ativo) || !isFrequenciaObrigatoria(item.frequencia)) continue;
        const servico = serviceTypes.find(s => s.id === item.serviceTypeId);
        if (!servico || !isAtivo(servico.ativo)) continue;
        if (isSchoolExempt(serviceExemptions, escola.id, item.serviceTypeId)) continue;
        const ultima = ultimaDataPreenchida(item.id, escola.id);
        const due = getChecklistDueInfo(item.frequencia, ultima);
        if (due.status === 'vencendo' || due.status === 'atrasado' || due.status === 'nunca-preenchido') {
          alerts.push({
            escolaId: escola.id, escolaNome: escola.name, serviceTypeNome: servico.nome,
            itemId: item.id, itemDescricao: item.descricaoItem, status: due.status,
          });
        }
      }
    }
    const ordem: Record<string, number> = { atrasado: 0, 'nunca-preenchido': 1, vencendo: 2 };
    return alerts.sort((a, b) => ordem[a.status] - ordem[b.status]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools, checklistItems, serviceTypes, completions, serviceExemptions, isAdminLike, currentUser?.school_id]);

  // Resumo em 1 linha por escola — sem isso, uma escola com dezenas de
  // itens pendentes repetia o próprio nome dezenas de vezes no banner.
  const checklistAlertsPorEscola = useMemo(
    () => summarizeChecklistAlertsBySchool(checklistAlerts),
    [checklistAlerts],
  );

  const marcarItem = (itemId: string, executado: 'sim' | 'nao') => {
    setChecklistRespostas(prev => ({
      ...prev,
      [itemId]: {
        executado,
        observacao: prev[itemId]?.observacao || '',
        // Data de execução: entra com hoje por padrão, mas o usuário pode
        // trocar (ex.: registrando algo executado ontem). Só é preenchida
        // quando o item é marcado como "Executado", que é quando o campo
        // de data aparece.
        data: prev[itemId]?.data || new Date().toISOString().split('T')[0],
      },
    }));
  };

  const observarItem = (itemId: string, observacao: string) => {
    setChecklistRespostas(prev => ({
      ...prev,
      [itemId]: {
        executado: prev[itemId]?.executado || 'sim',
        data: prev[itemId]?.data || new Date().toISOString().split('T')[0],
        observacao,
      },
    }));
  };

  const atualizarDataItem = (itemId: string, data: string) => {
    setChecklistRespostas(prev => ({
      ...prev,
      [itemId]: {
        executado: prev[itemId]?.executado || 'sim',
        observacao: prev[itemId]?.observacao || '',
        data,
      },
    }));
  };

  const handleSalvarChecklist = async () => {
    if (!checklistEscolaId) { toast.error('Selecione a escola.'); return; }
    if (!checklistServiceTypeId) { toast.error('Selecione o serviço.'); return; }
    const respostas = Object.entries(checklistRespostas).filter(([, v]) => v.executado);
    if (respostas.length === 0) { toast.error('Marque ao menos um item antes de salvar.'); return; }

    setSaving(true);
    try {
      const hoje = new Date().toISOString().split('T')[0];
      for (const [itemId, resposta] of respostas) {
        const { error } = await supabase.functions.invoke(FUNCTION_NAME, {
          body: {
            entity: 'checklistCompletion', action: 'create',
            data: {
              id: `chk-${itemId}-${Date.now()}`,
              data: resposta.data || hoje,
              escolaId: checklistEscolaId,
              serviceTypeId: checklistServiceTypeId,
              checklistItemId: itemId,
              executado: resposta.executado,
              observacao: resposta.observacao,
              registradoPor: currentUser?.full_name || '',
              criadoEm: new Date().toISOString(),
            },
          },
        });
        if (error) throw error;
      }
      toast.success('Checklist salvo com sucesso!');
      setChecklistRespostas({});
      refreshSoon();
    } catch (err) {
      console.error('Erro ao salvar checklist:', err);
      toast.error('Não foi possível salvar, tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  // ── Satisfação ─────────────────────────────────────────────────────────
  const minhasNotas = useMemo(
    () => satisfactionRatings.filter(r => r.escolaId === currentUser?.school_id).sort((a, b) => b.data.localeCompare(a.data)),
    [satisfactionRatings, currentUser?.school_id],
  );

  const satisfacaoFiltrada = useMemo(() => {
    return satisfactionRatings.filter(r => {
      if (satisfacaoFiltroEscolaId && r.escolaId !== satisfacaoFiltroEscolaId) return false;
      if (satisfacaoFiltroServiceTypeId && r.serviceTypeId !== satisfacaoFiltroServiceTypeId) return false;
      return true;
    });
  }, [satisfactionRatings, satisfacaoFiltroEscolaId, satisfacaoFiltroServiceTypeId]);

  const satisfacaoChartData = useMemo(
    () => aggregateSatisfactionByPeriod(satisfacaoFiltrada, satisfacaoGranularidade, satisfacaoInicio, satisfacaoFim),
    [satisfacaoFiltrada, satisfacaoGranularidade, satisfacaoInicio, satisfacaoFim],
  );

  // Combina satisfação + ocorrências pendentes + checklist atrasado — os 3
  // sinais que o fiscal (regional_admin) pediu para identificar quem
  // precisa de mais atenção. Só relevante pra papéis admin-like.
  const schoolsNeedingAttention = useMemo(
    () => getSchoolsNeedingAttention(schools, occurrences, satisfactionRatings, checklistItems, completions, {}, serviceExemptions),
    [schools, occurrences, satisfactionRatings, checklistItems, completions, serviceExemptions],
  );

  const handleSubmitSatisfacao = async (e: React.FormEvent) => {
    e.preventDefault();
    const escolaId = currentUser?.school_id || '';
    if (!escolaId) { toast.error('Sua conta não está vinculada a uma escola.'); return; }
    if (!satisfacaoForm.serviceTypeId) { toast.error('Selecione o serviço.'); return; }
    if (isSchoolExempt(serviceExemptions, escolaId, satisfacaoForm.serviceTypeId)) {
      toast.error('Sua escola está dispensada deste serviço.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          entity: 'satisfactionRating', action: 'create',
          data: {
            id: `sat-${Date.now()}`,
            data: new Date().toISOString().split('T')[0],
            escolaId,
            serviceTypeId: satisfacaoForm.serviceTypeId,
            nota: String(satisfacaoForm.nota),
            comentario: satisfacaoForm.comentario,
            registradoPor: currentUser?.full_name || '',
            criadoEm: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;
      toast.success('Avaliação registrada, obrigado!');
      setSatisfacaoForm({ serviceTypeId: '', nota: 8, comentario: '' });
      refreshSoon();
    } catch (err) {
      console.error('Erro ao salvar avaliação de satisfação:', err);
      toast.error('Não foi possível salvar, tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleGerarRelatorioSatisfacao = () => {
    if (satisfacaoChartData.length === 0) { toast.error('Nada para gerar relatório com esses filtros.'); return; }
    setGerandoRelatorio(true);
    try {
      const doc = new jsPDF();
      const margin = 14;
      doc.setFontSize(14); doc.setTextColor(37, 99, 235);
      doc.text('Relatório de Satisfação — Serviços Terceirizados', margin, 40);
      doc.setFontSize(9); doc.setTextColor(100);
      doc.text(`Período: ${satisfacaoInicio} a ${satisfacaoFim} (${satisfacaoGranularidade === 'mensal' ? 'agrupado por mês' : 'agrupado por semana'})`, margin, 46);
      doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, 51);

      const totalAvaliacoes = satisfacaoChartData.reduce((acc, p) => acc + p.quantidade, 0);
      const mediaGeral = totalAvaliacoes > 0
        ? satisfacaoChartData.reduce((acc, p) => acc + p.media * p.quantidade, 0) / totalAvaliacoes
        : 0;

      autoTable(doc, {
        startY: 58,
        margin: { left: margin, right: margin },
        head: [['Período', 'Nota Média', 'Nº de Avaliações']],
        body: satisfacaoChartData.map(p => [p.periodo, p.media.toFixed(1), String(p.quantidade)]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      });

      let y = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(10); doc.setTextColor(0);
      doc.text(`Satisfação média do período: ${mediaGeral.toFixed(1)} / 10 (${totalAvaliacoes} avaliações)`, margin, y);
      y += 8;

      if (schoolsNeedingAttention.length > 0) {
        doc.setFontSize(11); doc.setTextColor(220, 38, 38);
        doc.text('Escolas que precisam de mais atenção', margin, y);
        y += 4;
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['Escola', 'Motivos']],
          body: schoolsNeedingAttention.map(a => [a.escolaNome, a.motivos.join('; ')]),
          styles: { fontSize: 8.5 },
          headStyles: { fillColor: [220, 38, 38], textColor: 255 },
        });
      }

      addTimbradoAllPages(doc);
      doc.save(`satisfacao_${satisfacaoInicio}_a_${satisfacaoFim}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar relatório de satisfação:', err);
      toast.error('Não foi possível gerar o relatório.');
    } finally {
      setGerandoRelatorio(false);
    }
  };

  // ── Impacto das Ocorrências (avaliação mensal + relatório técnico) ──────
  const mesesPendentesImpacto = useMemo(
    () => currentUser?.school_id ? getMesesPendentesDeAvaliacao(occurrences, impactReviews, currentUser.school_id) : [],
    [occurrences, impactReviews, currentUser?.school_id],
  );

  const minhasAvaliacoesImpacto = useMemo(
    () => impactReviews.filter(r => r.escolaId === currentUser?.school_id).sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia)),
    [impactReviews, currentUser?.school_id],
  );

  const [impactoForm, setImpactoForm] = useState<Record<string, { grau: GrauImpacto; comentario: string }>>({});

  const handleSubmitImpactoReview = async (mes: string, quantidade: number) => {
    const escolaId = currentUser?.school_id || '';
    const resposta = impactoForm[mes];
    if (!escolaId) { toast.error('Sua conta não está vinculada a uma escola.'); return; }
    if (!resposta?.grau) { toast.error('Selecione o nível de impacto.'); return; }

    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          entity: 'occurrenceImpactReview', action: 'create',
          data: {
            id: `imp-${escolaId}-${mes}-${Date.now()}`,
            escolaId,
            mesReferencia: mes,
            quantidadeOcorrencias: String(quantidade),
            grauImpacto: resposta.grau,
            comentario: resposta.comentario || '',
            registradoPor: currentUser?.full_name || '',
            criadoEm: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;
      toast.success('Avaliação de impacto registrada!');
      setImpactoForm(prev => { const next = { ...prev }; delete next[mes]; return next; });
      refreshSoon();
    } catch (err) {
      console.error('Erro ao salvar avaliação de impacto:', err);
      toast.error('Não foi possível salvar, tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  // Painel do fiscal: quantidade de ocorrências por escola/total, com
  // período opcional — é a base do botão "Gerar Relatório Técnico".
  const [impactoFiltroInicio, setImpactoFiltroInicio] = useState('');
  const [impactoFiltroFim, setImpactoFiltroFim] = useState('');
  const [showRelatorioTecnico, setShowRelatorioTecnico] = useState(false);

  const contagemOcorrenciasPorEscola = useMemo(
    () => countOccurrencesBySchool(occurrences, schools, impactoFiltroInicio || undefined, impactoFiltroFim || undefined),
    [occurrences, schools, impactoFiltroInicio, impactoFiltroFim],
  );

  const impactoMaisRecentePorEscola = (escolaId: string) =>
    impactReviews.filter(r => r.escolaId === escolaId).sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia))[0];

  // ── Visita Técnica ─────────────────────────────────────────────────────
  const minhasSolicitacoesVisita = useMemo(
    () => visitRequests.filter(v => v.escolaId === currentUser?.school_id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
    [visitRequests, currentUser?.school_id],
  );

  const solicitacoesEmAberto = useMemo(
    () => visitRequests
      .filter(v => v.status === 'pendente' || v.status === 'agendada')
      .sort((a, b) => a.status.localeCompare(b.status) || a.criadoEm.localeCompare(b.criadoEm)),
    [visitRequests],
  );

  const temSolicitacaoEmAberto = minhasSolicitacoesVisita.some(v => v.status === 'pendente' || v.status === 'agendada');

  // Visitas concluídas somem da lista "em aberto" de propósito (ela é só
  // pra quem ainda precisa de ação), mas ficam disponíveis aqui pra não dar
  // a impressão de que o registro desapareceu de vez.
  const visitasConcluidas = useMemo(
    () => visitRequests
      .filter(v => v.status === 'concluida')
      .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)),
    [visitRequests],
  );

  const handleSolicitarVisita = async () => {
    const escolaId = currentUser?.school_id || '';
    if (!escolaId) { toast.error('Sua conta não está vinculada a uma escola.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          entity: 'visitRequest', action: 'create',
          data: {
            id: `visit-${Date.now()}`,
            escolaId,
            motivo: visitaMotivo,
            status: 'pendente',
            dataSolicitacao: new Date().toISOString().split('T')[0],
            dataAgendada: '',
            observacaoFiscal: '',
            solicitadoPor: currentUser?.full_name || '',
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;
      toast.success('Solicitação enviada ao Fiscal Técnico!');
      setVisitaMotivo('');
      refreshSoon();
    } catch (err) {
      console.error('Erro ao solicitar visita técnica:', err);
      toast.error('Não foi possível enviar a solicitação, tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  // Só o fiscal define a data — o backend também recusa isso vindo de quem
  // não for admin-like, então esta tela nem aparece pra escola.
  const handleAgendarVisita = async (request: VisitRequest) => {
    const form = agendamentoForm[request.id];
    if (!form?.data) { toast.error('Escolha uma data para o atendimento.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          entity: 'visitRequest', action: 'update', id: request.id,
          data: {
            status: 'agendada',
            dataAgendada: form.data,
            observacaoFiscal: form.observacao || '',
            atualizadoEm: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;
      toast.success('Visita agendada!');
      refreshSoon();
    } catch (err) {
      console.error('Erro ao agendar visita técnica:', err);
      toast.error('Não foi possível agendar, tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleConcluirVisita = async (request: VisitRequest) => {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          entity: 'visitRequest', action: 'update', id: request.id,
          data: { status: 'concluida', atualizadoEm: new Date().toISOString() },
        },
      });
      if (error) throw error;
      toast.success('Visita marcada como concluída!');
      refreshSoon();
    } catch (err) {
      console.error('Erro ao concluir visita técnica:', err);
      toast.error('Não foi possível concluir, tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  // ── Histórico / Exportar ───────────────────────────────────────────────
  const occurrencesFiltradas = useMemo(() => {
    return occurrences.filter(o => {
      if (histEscolaId && o.escolaId !== histEscolaId) return false;
      if (histServiceTypeId && o.serviceTypeId !== histServiceTypeId) return false;
      if (histAmbiente && !o.ambiente.toLowerCase().includes(histAmbiente.toLowerCase())) return false;
      if (histSituacao && o.situacao !== histSituacao) return false;
      if (histInicio && o.data < histInicio) return false;
      if (histFim && o.data > histFim) return false;
      return true;
    }).sort((a, b) => b.data.localeCompare(a.data));
  }, [occurrences, histEscolaId, histServiceTypeId, histAmbiente, histSituacao, histInicio, histFim]);

  const completionsFiltradas = useMemo(() => {
    return completions.filter(c => {
      if (histEscolaId && c.escolaId !== histEscolaId) return false;
      if (histServiceTypeId && c.serviceTypeId !== histServiceTypeId) return false;
      if (histInicio && c.data < histInicio) return false;
      if (histFim && c.data > histFim) return false;
      return true;
    }).sort((a, b) => b.data.localeCompare(a.data));
  }, [completions, histEscolaId, histServiceTypeId, histInicio, histFim]);

  const handleExportar = () => {
    if (histTipo === 'ocorrencias') {
      if (occurrencesFiltradas.length === 0) { toast.error('Nada para exportar com esses filtros.'); return; }
      const csv = rowsToCsv(
        [
          { key: 'data', label: 'Data' },
          { key: 'escola', label: 'Escola' },
          { key: 'servico', label: 'Serviço' },
          { key: 'ambiente', label: 'Ambiente' },
          { key: 'categoriaOcorrencia', label: 'Categoria' },
          { key: 'descricaoOcorrencia', label: 'Descrição' },
          { key: 'providenciaAdotada', label: 'Providência Adotada' },
          { key: 'retornoDaEmpresa', label: 'Retorno da Empresa' },
          { key: 'situacao', label: 'Situação' },
          { key: 'anexos', label: 'Anexo' },
          { key: 'registradoPor', label: 'Registrado Por' },
        ],
        occurrencesFiltradas.map(o => ({
          ...o,
          escola: schoolName(o.escolaId),
          servico: serviceTypeName(o.serviceTypeId),
        })),
      );
      downloadCsv(`ocorrencias_${Date.now()}.csv`, csv);
    } else {
      if (completionsFiltradas.length === 0) { toast.error('Nada para exportar com esses filtros.'); return; }
      const csv = rowsToCsv(
        [
          { key: 'data', label: 'Data' },
          { key: 'escola', label: 'Escola' },
          { key: 'servico', label: 'Serviço' },
          { key: 'item', label: 'Item do Checklist' },
          { key: 'executado', label: 'Executado' },
          { key: 'observacao', label: 'Observação' },
          { key: 'registradoPor', label: 'Registrado Por' },
        ],
        completionsFiltradas.map(c => ({
          ...c,
          escola: schoolName(c.escolaId),
          servico: serviceTypeName(c.serviceTypeId),
          item: checklistItems.find(i => i.id === c.checklistItemId)?.descricaoItem || c.checklistItemId,
        })),
      );
      downloadCsv(`checklist_${Date.now()}.csv`, csv);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-6">
        <div className="relative flex items-center justify-center">
          <span className="absolute w-24 h-24 rounded-full border-4 border-blue-100" />
          <span className="absolute w-24 h-24 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
          <div className="p-4 bg-blue-600 rounded-2xl text-white shadow-lg animate-pulse">
            <ClipboardCheck size={32} />
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-semibold text-slate-500">Verificando fiscalizações...</p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" />
          </div>
        </div>
      </div>
    );
  }

  const TABS: { id: View; label: string; icon: React.ReactNode }[] = [
    { id: 'checklist', label: 'Checklist de Rotina', icon: <ListChecks size={16} /> },
    { id: 'satisfacao', label: 'Satisfação', icon: <Star size={16} /> },
    { id: 'ocorrencia', label: 'Registrar Ocorrência', icon: <Plus size={16} /> },
    { id: 'visita', label: 'Visita Técnica', icon: <CalendarClock size={16} /> },
    { id: 'historico', label: 'Histórico / Exportar', icon: <History size={16} /> },
  ];

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-center gap-3 bg-amber-400 border-2 border-amber-500 text-amber-950 px-4 py-3 rounded-xl shadow-md">
        <AlertTriangle size={22} className="shrink-0" />
        <p className="text-xs sm:text-sm font-black uppercase tracking-wide">
          Página ainda em processo de homologação com a Comissão Interna da URE
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shrink-0">
            <ClipboardCheck size={28} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Fiscalização de Serviços Terceirizados</h1>
            <p className="text-slate-500 text-xs sm:text-sm font-medium">Ocorrências e checklist de rotina de Limpeza, Transporte e outros serviços</p>
          </div>
        </div>
        {isAdminLike && (
          <button
            onClick={() => setShowIsencaoModal(true)}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold"
          >
            <ShieldAlert size={14} /> Isenções de Serviço
          </button>
        )}
      </div>

      {currentUser?.readOnly && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wide">
          <Lock size={14} /> Modo somente leitura — este perfil não pode registrar ocorrências ou checklists.
        </div>
      )}

      {checklistAlerts.length > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              onClick={() => setView('checklist')}
              className="flex items-center gap-2 text-red-700 font-black text-xs sm:text-sm uppercase tracking-wide text-left"
            >
              <AlertTriangle size={18} className="shrink-0" />
              {checklistAlertsPorEscola.length} escola{checklistAlertsPorEscola.length > 1 ? 's' : ''} com checklist obrigatório vencido ou vencendo ({checklistAlerts.length} ite{checklistAlerts.length > 1 ? 'ns' : 'm'} no total)
            </button>
            {isAdminLike && (
              <button
                onClick={() => setShowEnviarAlerta(true)}
                className="shrink-0 flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold"
              >
                <Megaphone size={14} /> Enviar Alerta
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
            {checklistAlertsPorEscola.map(e => (
              <div key={e.escolaId} className="flex items-center justify-between gap-3 bg-white rounded-xl px-3 py-2.5 border border-red-100 text-xs">
                <span className="min-w-0 truncate font-bold text-slate-700">{e.escolaNome}</span>
                <div className="shrink-0 flex items-center gap-1.5">
                  {e.atrasados > 0 && <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${DUE_BADGE.atrasado.className}`}>{e.atrasados} atrasado{e.atrasados > 1 ? 's' : ''}</span>}
                  {e.nuncaPreenchido > 0 && <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${DUE_BADGE['nunca-preenchido'].className}`}>{e.nuncaPreenchido} nunca preenchido{e.nuncaPreenchido > 1 ? 's' : ''}</span>}
                  {e.vencendo > 0 && <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${DUE_BADGE.vencendo.className}`}>{e.vencendo} vencendo</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showEnviarAlerta && (
        <EnviarAlertaModal
          escolasSugeridas={checklistAlertsPorEscola.map(e => ({ id: e.escolaId, nome: e.escolaNome }))}
          mensagemSugerida={`Você tem ${checklistAlerts.length} ite${checklistAlerts.length > 1 ? 'ns' : 'm'} de checklist obrigatório pendente${checklistAlerts.length > 1 ? 's' : ''} ou atrasado${checklistAlerts.length > 1 ? 's' : ''} na Fiscalização de Serviços Terceirizados. Regularize o quanto antes.`}
          onClose={() => setShowEnviarAlerta(false)}
        />
      )}

      {showIsencaoModal && (
        <IsencaoServicoModal
          schools={schools}
          serviceTypes={serviceTypes}
          exemptions={serviceExemptions}
          currentUserName={currentUser?.full_name || ''}
          onClose={() => setShowIsencaoModal(false)}
          onChanged={refreshSoon}
        />
      )}

      {showRelatorioTecnico && (
        <RelatorioTecnicoModal
          schools={schools}
          occurrences={occurrences}
          impactReviews={impactReviews}
          reports={technicalReports}
          currentUserName={currentUser?.full_name || ''}
          onClose={() => setShowRelatorioTecnico(false)}
          onChanged={refreshSoon}
        />
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${view === tab.id ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {view === 'ocorrencia' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-sm">
          {currentUser?.readOnly ? (
            <p className="text-sm text-slate-400 text-center py-10">Perfil somente leitura — consulte o histórico na aba correspondente.</p>
          ) : (
            <form onSubmit={handleSubmitOcorrencia} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Data *</label>
                  <input
                    type="date" required
                    className={`w-full p-3 bg-slate-50 border rounded-xl font-medium outline-none focus:border-blue-500 ${ocorrenciaErrors.data ? 'border-red-400' : 'border-slate-200'}`}
                    value={ocorrenciaForm.data}
                    onChange={e => setOcorrenciaForm({ ...ocorrenciaForm, data: e.target.value })}
                  />
                  {ocorrenciaErrors.data && <p className="text-xs text-red-500">{ocorrenciaErrors.data}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Escola *</label>
                  {isAdminLike ? (
                    <select
                      required
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500"
                      value={ocorrenciaForm.escolaId}
                      onChange={e => setOcorrenciaForm({ ...ocorrenciaForm, escolaId: e.target.value })}
                    >
                      <option value="">Selecione...</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  ) : (
                    <div className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl font-medium text-slate-600">
                      {schoolName(currentUser?.school_id || '') || 'Escola não vinculada ao seu usuário'}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Serviço *</label>
                  <select
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500"
                    value={ocorrenciaForm.serviceTypeId}
                    onChange={e => setOcorrenciaForm({ ...ocorrenciaForm, serviceTypeId: e.target.value })}
                  >
                    <option value="">Selecione...</option>
                    {servicosDisponiveisPara(ocorrenciaForm.escolaId).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                  {ocorrenciaForm.escolaId && servicosDisponiveisPara(ocorrenciaForm.escolaId).length === 0 && (
                    <p className="text-xs text-amber-600">Esta escola está dispensada de todos os serviços cadastrados.</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Ambiente / Local *</label>
                  <input
                    type="text" required placeholder="Ex.: Pátio, Sanitário Feminino, Sala 5..."
                    className={`w-full p-3 bg-slate-50 border rounded-xl font-medium outline-none focus:border-blue-500 ${ocorrenciaErrors.ambiente ? 'border-red-400' : 'border-slate-200'}`}
                    value={ocorrenciaForm.ambiente}
                    onChange={e => setOcorrenciaForm({ ...ocorrenciaForm, ambiente: e.target.value })}
                  />
                  {ocorrenciaErrors.ambiente && <p className="text-xs text-red-500">{ocorrenciaErrors.ambiente}</p>}
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Categoria da Ocorrência</label>
                  <select
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500"
                    value={ocorrenciaForm.categoriaOcorrencia}
                    onChange={e => setOcorrenciaForm({ ...ocorrenciaForm, categoriaOcorrencia: e.target.value })}
                  >
                    {OCCURRENCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Descrição da Ocorrência *</label>
                  <textarea
                    required rows={3} placeholder="Descreva o que aconteceu..."
                    className={`w-full p-3 bg-slate-50 border rounded-xl font-medium outline-none focus:border-blue-500 resize-none ${ocorrenciaErrors.descricaoOcorrencia ? 'border-red-400' : 'border-slate-200'}`}
                    value={ocorrenciaForm.descricaoOcorrencia}
                    onChange={e => setOcorrenciaForm({ ...ocorrenciaForm, descricaoOcorrencia: e.target.value })}
                  />
                  {ocorrenciaErrors.descricaoOcorrencia && <p className="text-xs text-red-500">{ocorrenciaErrors.descricaoOcorrencia}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Providência Adotada</label>
                  <textarea
                    rows={2} placeholder="Opcional"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500 resize-none"
                    value={ocorrenciaForm.providenciaAdotada}
                    onChange={e => setOcorrenciaForm({ ...ocorrenciaForm, providenciaAdotada: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Retorno da Empresa</label>
                  <textarea
                    rows={2} placeholder="Opcional"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500 resize-none"
                    value={ocorrenciaForm.retornoDaEmpresa}
                    onChange={e => setOcorrenciaForm({ ...ocorrenciaForm, retornoDaEmpresa: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Situação</label>
                  <select
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500"
                    value={ocorrenciaForm.situacao}
                    onChange={e => setOcorrenciaForm({ ...ocorrenciaForm, situacao: e.target.value })}
                  >
                    {SITUACOES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Anexo (imagem ou PDF)</label>
                  <label className="flex items-center gap-2 w-full p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl font-medium text-slate-500 cursor-pointer hover:bg-slate-100">
                    <Paperclip size={16} />
                    <span className="truncate flex-1 text-sm">{anexoFile ? anexoFile.name : 'Selecionar arquivo...'}</span>
                    {anexoFile && (
                      <X size={16} className="text-red-500" onClick={(e) => { e.preventDefault(); setAnexoFile(null); }} />
                    )}
                    <input
                      type="file" accept="image/*,application/pdf" className="hidden"
                      onChange={e => setAnexoFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              </div>

              <button
                type="submit" disabled={saving}
                className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                Registrar Ocorrência
              </button>
            </form>
          )}
        </div>
      )}

      {view === 'checklist' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-sm space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Escola</label>
              {isAdminLike ? (
                <select
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500"
                  value={checklistEscolaId}
                  onChange={e => setChecklistEscolaId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <div className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl font-medium text-slate-600">
                  {schoolName(currentUser?.school_id || '') || 'Escola não vinculada ao seu usuário'}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Serviço</label>
              <select
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500"
                value={checklistServiceTypeId}
                onChange={e => { setChecklistServiceTypeId(e.target.value); setChecklistRespostas({}); }}
              >
                <option value="">Selecione...</option>
                {activeServiceTypes.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          </div>

          {!checklistServiceTypeId ? (
            <p className="text-sm text-slate-400 text-center py-10">Selecione um serviço para ver os itens de checklist.</p>
          ) : isSchoolExempt(serviceExemptions, checklistEscolaId, checklistServiceTypeId) ? (
            <div className="text-center py-10 space-y-1">
              <p className="text-sm font-bold text-slate-500">Esta escola está isenta deste serviço.</p>
              <p className="text-xs text-slate-400">{serviceExemptions.find(e => isAtivo(e.ativo) && e.escolaId === checklistEscolaId && e.serviceTypeId === checklistServiceTypeId)?.motivo || 'Sem motivo registrado.'}</p>
            </div>
          ) : checklistItemsDoServico.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">Nenhum item de checklist cadastrado para este serviço.</p>
          ) : (
            <div className="space-y-6">
              {FREQUENCIAS.map(freq => {
                const itensDaFrequencia = checklistItemsDoServico.filter(i => i.frequencia === freq.key);
                if (itensDaFrequencia.length === 0) return null;
                const obrigatorio = isFrequenciaObrigatoria(freq.key);

                // Diária é só opcional pra escola — o gestor não tem como
                // fiscalizar isso todo dia — então fica recolhida por
                // padrão, sem competir visualmente com o que é obrigatório.
                if (!obrigatorio && !mostrarDiaria) {
                  return (
                    <button
                      key={freq.key} type="button"
                      onClick={() => setMostrarDiaria(true)}
                      className="w-full flex items-center justify-between gap-2 p-3 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs font-bold hover:bg-slate-50"
                    >
                      <span>Itens diários ({itensDaFrequencia.length}) — preenchimento opcional</span>
                      <ChevronDown size={16} />
                    </button>
                  );
                }

                return (
                  <div key={freq.key} className={`space-y-3 ${obrigatorio ? 'p-4 rounded-2xl border-l-4 border-blue-500 bg-blue-50/40' : ''}`}>
                    <div className="flex items-center justify-between">
                      <h3 className={`text-xs font-black uppercase tracking-widest ${obrigatorio ? 'text-blue-700' : 'text-slate-400'}`}>{freq.label}</h3>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase ${obrigatorio ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          {obrigatorio ? 'Obrigatório' : 'Opcional'}
                        </span>
                        {!obrigatorio && (
                          <button type="button" onClick={() => setMostrarDiaria(false)} className="text-slate-400 hover:text-slate-600">
                            <ChevronDown size={16} className="rotate-180" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {itensDaFrequencia.map(item => {
                        const resposta = checklistRespostas[item.id];
                        const due = getChecklistDueInfo(item.frequencia, ultimaDataPreenchida(item.id, checklistEscolaId));
                        const badge = DUE_BADGE[due.status];
                        return (
                          <div key={item.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-700 flex-1">{item.descricaoItem}</p>
                              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase whitespace-nowrap ${badge.className}`}>{badge.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button" disabled={currentUser?.readOnly}
                                onClick={() => marcarItem(item.id, 'sim')}
                                className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border-2 transition-colors disabled:opacity-50 ${resposta?.executado === 'sim' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-400'}`}
                              >
                                <CheckCircle2 size={14} /> Executado
                              </button>
                              <button
                                type="button" disabled={currentUser?.readOnly}
                                onClick={() => marcarItem(item.id, 'nao')}
                                className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 border-2 transition-colors disabled:opacity-50 ${resposta?.executado === 'nao' ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-red-400'}`}
                              >
                                <AlertCircle size={14} /> Não Executado
                              </button>
                            </div>
                            {resposta?.executado === 'sim' && (
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Data de execução</label>
                                <input
                                  type="date" disabled={currentUser?.readOnly}
                                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-medium outline-none focus:border-blue-500 disabled:opacity-50"
                                  value={resposta.data}
                                  onChange={e => atualizarDataItem(item.id, e.target.value)}
                                />
                              </div>
                            )}
                            {resposta && (
                              <input
                                type="text" placeholder="Observação (opcional)"
                                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500"
                                value={resposta.observacao}
                                onChange={e => observarItem(item.id, e.target.value)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {!currentUser?.readOnly && (
                <button
                  onClick={handleSalvarChecklist} disabled={saving}
                  className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                  Salvar Checklist de Hoje
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {view === 'satisfacao' && (
        <div className="space-y-5">
          {!isAdminLike && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-sm">
              {currentUser?.readOnly ? (
                <p className="text-sm text-slate-400 text-center py-10">Perfil somente leitura.</p>
              ) : (
                <form onSubmit={handleSubmitSatisfacao} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase">Serviço *</label>
                      <select
                        required
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500"
                        value={satisfacaoForm.serviceTypeId}
                        onChange={e => setSatisfacaoForm({ ...satisfacaoForm, serviceTypeId: e.target.value })}
                      >
                        <option value="">Selecione...</option>
                        {servicosDisponiveisPara(currentUser?.school_id || '').map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase">Grau de satisfação (0 a 10)</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range" min={0} max={10} step={1} className="flex-1 accent-blue-600"
                          value={satisfacaoForm.nota}
                          onChange={e => setSatisfacaoForm({ ...satisfacaoForm, nota: Number(e.target.value) })}
                        />
                        <span className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center font-black text-lg ${satisfacaoForm.nota >= 8 ? 'bg-emerald-100 text-emerald-700' : satisfacaoForm.nota >= 5 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {satisfacaoForm.nota}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Comentário (opcional)</label>
                      <textarea
                        rows={2} placeholder="Conte um pouco sobre o que motivou a nota..."
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500 resize-none"
                        value={satisfacaoForm.comentario}
                        onChange={e => setSatisfacaoForm({ ...satisfacaoForm, comentario: e.target.value })}
                      />
                    </div>
                  </div>
                  <button
                    type="submit" disabled={saving}
                    className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="animate-spin" size={18} /> : <Star size={18} />}
                    Enviar Avaliação
                  </button>
                </form>
              )}

              {minhasNotas.length > 0 && (
                <div className="mt-8 pt-6 border-t border-slate-100 space-y-2">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Suas avaliações recentes</h3>
                  {minhasNotas.slice(0, 10).map(r => (
                    <div key={r.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2.5 text-xs">
                      <span className="text-slate-600 min-w-0 truncate">{r.data} — {serviceTypeName(r.serviceTypeId)}{r.comentario ? `: ${r.comentario}` : ''}</span>
                      <span className="shrink-0 font-black text-blue-700">{r.nota}/10</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isAdminLike && (mesesPendentesImpacto.length > 0 || minhasAvaliacoesImpacto.length > 0) && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-sm space-y-4">
              <div>
                <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide">Impacto das Ocorrências do Mês</h3>
                <p className="text-xs text-slate-400 mt-1">Ao final de cada mês, avalie o quanto as ocorrências registradas pesaram na qualidade do serviço.</p>
              </div>

              {mesesPendentesImpacto.map(({ mes, quantidade }) => {
                const resposta = impactoForm[mes] || { grau: '' as GrauImpacto, comentario: '' };
                return (
                  <div key={mes} className="p-4 rounded-xl border-2 border-amber-200 bg-amber-50/40 space-y-3">
                    <p className="text-sm font-bold text-slate-700">
                      {new Date(`${mes}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} — {quantidade} ocorrência{quantidade > 1 ? 's' : ''} registrada{quantidade > 1 ? 's' : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {IMPACTO_OPTIONS.map(opt => (
                        <button
                          key={opt.valor} type="button" disabled={currentUser?.readOnly}
                          onClick={() => setImpactoForm(prev => ({ ...prev, [mes]: { grau: opt.valor, comentario: prev[mes]?.comentario || '' } }))}
                          className={`px-4 py-2 rounded-lg text-xs font-bold border-2 transition-colors disabled:opacity-50 ${resposta.grau === opt.valor ? opt.cor + ' border-transparent' : 'bg-white border-slate-200 text-slate-500'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text" placeholder="Comentário (opcional)"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500"
                      value={resposta.comentario}
                      onChange={e => setImpactoForm(prev => ({ ...prev, [mes]: { grau: prev[mes]?.grau || ('' as GrauImpacto), comentario: e.target.value } }))}
                    />
                    {!currentUser?.readOnly && (
                      <button
                        onClick={() => handleSubmitImpactoReview(mes, quantidade)} disabled={saving}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-60"
                      >
                        {saving ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Enviar Avaliação
                      </button>
                    )}
                  </div>
                );
              })}

              {minhasAvaliacoesImpacto.length > 0 && (
                <div className="pt-2 space-y-2">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Avaliações já enviadas</h4>
                  {minhasAvaliacoesImpacto.map(r => {
                    const opt = IMPACTO_OPTIONS.find(o => o.valor === r.grauImpacto);
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2.5 text-xs">
                        <span className="text-slate-600 min-w-0 truncate">
                          {new Date(`${r.mesReferencia}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} — {r.quantidadeOcorrencias} ocorrência(s){r.comentario ? `: ${r.comentario}` : ''}
                        </span>
                        <span className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-full uppercase ${opt?.cor || 'bg-slate-100 text-slate-500'}`}>{opt?.label || r.grauImpacto}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {isAdminLike && (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-sm space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <select
                    className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium"
                    value={satisfacaoGranularidade}
                    onChange={e => setSatisfacaoGranularidade(e.target.value as Granularidade)}
                  >
                    <option value="semanal">Semanal</option>
                    <option value="mensal">Mensal</option>
                  </select>
                  <input type="date" className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium" value={satisfacaoInicio} onChange={e => setSatisfacaoInicio(e.target.value)} />
                  <input type="date" className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium" value={satisfacaoFim} onChange={e => setSatisfacaoFim(e.target.value)} />
                  <select className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium" value={satisfacaoFiltroEscolaId} onChange={e => setSatisfacaoFiltroEscolaId(e.target.value)}>
                    <option value="">Todas as escolas</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium" value={satisfacaoFiltroServiceTypeId} onChange={e => setSatisfacaoFiltroServiceTypeId(e.target.value)}>
                    <option value="">Todos os serviços</option>
                    {serviceTypes.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </div>

                <div className="h-72">
                  {satisfacaoChartData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-slate-400">Sem avaliações no período selecionado.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={satisfacaoChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value: any) => [`${value}/10`, 'Nota média']} labelFormatter={(label: any) => `Período: ${label}`} />
                        <Line type="monotone" dataKey="media" name="Nota média" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <button
                  onClick={handleGerarRelatorioSatisfacao} disabled={gerandoRelatorio}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-60"
                >
                  {gerandoRelatorio ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />} Gerar Relatório PDF
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 bg-red-100 text-red-600 rounded-xl shrink-0"><ShieldAlert size={20} /></div>
                  <div>
                    <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide">Escolas que precisam de mais atenção</h3>
                    <p className="text-xs text-slate-400">Satisfação recente baixa, ocorrências pendentes acumuladas ou checklist obrigatório atrasado</p>
                  </div>
                </div>
                {schoolsNeedingAttention.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">Nenhuma escola sinalizada no momento.</p>
                ) : (
                  <div className="space-y-2">
                    {schoolsNeedingAttention.map(a => (
                      <div key={a.escolaId} className="p-3 rounded-xl border border-red-100 bg-red-50/50">
                        <p className="font-bold text-slate-800 text-sm">{a.escolaNome}</p>
                        <ul className="mt-1 space-y-0.5">
                          {a.motivos.map((m, i) => <li key={i} className="text-xs text-red-600">• {m}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-sm space-y-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide">Ocorrências por Escola</h3>
                    <p className="text-xs text-slate-400 mt-1">Base do Relatório Técnico de Fiscalização</p>
                  </div>
                  <button
                    onClick={() => setShowRelatorioTecnico(true)}
                    className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold flex items-center gap-2"
                  >
                    <FileText size={16} /> Gerar Relatório Técnico
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input type="date" className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium" value={impactoFiltroInicio} onChange={e => setImpactoFiltroInicio(e.target.value)} />
                  <input type="date" className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium" value={impactoFiltroFim} onChange={e => setImpactoFiltroFim(e.target.value)} />
                  <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-lg text-sm font-bold text-blue-700 text-center">
                    Total: {contagemOcorrenciasPorEscola.total} ocorrência{contagemOcorrenciasPorEscola.total !== 1 ? 's' : ''}
                  </div>
                </div>

                {contagemOcorrenciasPorEscola.porEscola.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">Nenhuma ocorrência no período selecionado.</p>
                ) : (
                  <div className="space-y-2">
                    {contagemOcorrenciasPorEscola.porEscola.map(e => {
                      const ultimoImpacto = impactoMaisRecentePorEscola(e.escolaId);
                      const opt = ultimoImpacto ? IMPACTO_OPTIONS.find(o => o.valor === ultimoImpacto.grauImpacto) : null;
                      return (
                        <div key={e.escolaId} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-4 py-3">
                          <span className="text-sm font-semibold text-slate-700 truncate">{e.escolaNome}</span>
                          <div className="shrink-0 flex items-center gap-2">
                            {opt && <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${opt.cor}`}>último impacto: {opt.label}</span>}
                            <span className="text-sm font-black text-slate-800">{e.quantidade}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {view === 'visita' && (
        <div className="space-y-5">
          {!isAdminLike && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-sm space-y-6">
              <div>
                <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide">Solicitar Visita do Fiscal Técnico</h3>
                <p className="text-xs text-slate-400 mt-1">O fiscal técnico responsável analisa o pedido e agenda o atendimento.</p>
              </div>

              {!currentUser?.readOnly && (
                <div className="space-y-3">
                  <textarea
                    rows={2} placeholder="Motivo da visita (opcional)"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:border-blue-500 resize-none disabled:opacity-60"
                    value={visitaMotivo}
                    onChange={e => setVisitaMotivo(e.target.value)}
                    disabled={temSolicitacaoEmAberto}
                  />
                  <button
                    onClick={handleSolicitarVisita} disabled={saving || temSolicitacaoEmAberto}
                    className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                    Solicitar Visita do Fiscal Técnico
                  </button>
                  {temSolicitacaoEmAberto && (
                    <p className="text-xs text-amber-600">Você já tem uma solicitação em aberto — aguarde o atendimento antes de pedir outra.</p>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 space-y-2">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Minhas solicitações</h4>
                {minhasSolicitacoesVisita.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4">Nenhuma solicitação registrada ainda.</p>
                ) : minhasSolicitacoesVisita.map(v => (
                  <div key={v.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500 truncate">Solicitado em {v.dataSolicitacao}{v.motivo ? ` — ${v.motivo}` : ''}</p>
                      {v.observacaoFiscal && <p className="text-xs text-slate-400 mt-0.5 truncate">Obs. do fiscal: {v.observacaoFiscal}</p>}
                    </div>
                    <span className={`shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full uppercase ${v.status === 'concluida' ? 'bg-emerald-100 text-emerald-700' : v.status === 'agendada' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                      {v.status === 'concluida' ? 'Concluída' : v.status === 'agendada' ? 'Agendada' : 'Pendente'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isAdminLike && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8 shadow-sm space-y-3">
              <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide mb-3">Solicitações de Visita Técnica</h3>
              {solicitacoesEmAberto.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">Nenhuma solicitação pendente ou agendada.</p>
              ) : solicitacoesEmAberto.map(v => (
                <div key={v.id} className="p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{schoolName(v.escolaId)}</p>
                      <p className="text-xs text-slate-500 truncate">Solicitado em {v.dataSolicitacao}{v.motivo ? ` — ${v.motivo}` : ''}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full uppercase ${v.status === 'agendada' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                      {v.status === 'agendada' ? `Agendada — ${v.dataAgendada}` : 'Pendente'}
                    </span>
                  </div>

                  {v.status === 'pendente' && !currentUser?.readOnly && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="date"
                        className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium flex-1"
                        value={agendamentoForm[v.id]?.data || ''}
                        onChange={e => setAgendamentoForm(prev => ({ ...prev, [v.id]: { data: e.target.value, observacao: prev[v.id]?.observacao || '' } }))}
                      />
                      <input
                        type="text" placeholder="Observação (opcional)"
                        className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium flex-1"
                        value={agendamentoForm[v.id]?.observacao || ''}
                        onChange={e => setAgendamentoForm(prev => ({ ...prev, [v.id]: { data: prev[v.id]?.data || '', observacao: e.target.value } }))}
                      />
                      <button
                        onClick={() => handleAgendarVisita(v)} disabled={saving}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        <CalendarClock size={14} /> Agendar
                      </button>
                    </div>
                  )}

                  {v.status === 'agendada' && !currentUser?.readOnly && (
                    <button
                      onClick={() => handleConcluirVisita(v)} disabled={saving}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-60"
                    >
                      <CheckCircle2 size={14} /> Marcar como concluída
                    </button>
                  )}
                </div>
              ))}

              <div className="pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMostrarConcluidas(v => !v)}
                  className="w-full flex items-center justify-between gap-2 py-2 text-slate-400 text-xs font-bold hover:text-slate-600"
                >
                  <span>Visitas concluídas ({visitasConcluidas.length})</span>
                  <ChevronDown size={16} className={mostrarConcluidas ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>
                {mostrarConcluidas && (
                  visitasConcluidas.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">Nenhuma visita concluída ainda.</p>
                  ) : (
                    <div className="space-y-2 pt-2">
                      {visitasConcluidas.map(v => (
                        <div key={v.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-700 text-sm truncate">{schoolName(v.escolaId)}</p>
                            <p className="text-xs text-slate-500 truncate">
                              Agendada para {v.dataAgendada || '—'} · concluída em {new Date(v.atualizadoEm).toLocaleDateString('pt-BR')}
                              {v.observacaoFiscal ? ` — ${v.observacaoFiscal}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full uppercase bg-emerald-100 text-emerald-700">Concluída</span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'historico' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => setHistTipo('ocorrencias')}
                className={`px-4 py-2 rounded-lg text-xs font-bold ${histTipo === 'ocorrencias' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}
              >Ocorrências</button>
              <button
                onClick={() => setHistTipo('checklist')}
                className={`px-4 py-2 rounded-lg text-xs font-bold ${histTipo === 'checklist' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}
              >Checklist</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <select
                disabled={!isAdminLike}
                className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium disabled:opacity-60"
                value={histEscolaId} onChange={e => setHistEscolaId(e.target.value)}
              >
                <option value="">Todas as escolas</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select
                className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium"
                value={histServiceTypeId} onChange={e => setHistServiceTypeId(e.target.value)}
              >
                <option value="">Todos os serviços</option>
                {serviceTypes.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <input type="date" className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium" value={histInicio} onChange={e => setHistInicio(e.target.value)} placeholder="Início" />
              <input type="date" className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium" value={histFim} onChange={e => setHistFim(e.target.value)} placeholder="Fim" />
              {histTipo === 'ocorrencias' && (
                <>
                  <input type="text" placeholder="Ambiente" className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium" value={histAmbiente} onChange={e => setHistAmbiente(e.target.value)} />
                  <select className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium" value={histSituacao} onChange={e => setHistSituacao(e.target.value)}>
                    <option value="">Todas as situações</option>
                    {SITUACOES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </>
              )}
            </div>

            <button
              onClick={handleExportar}
              className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold flex items-center gap-2"
            >
              <FileDown size={16} /> Exportar CSV
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            {histTipo === 'ocorrencias' ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-[10px] font-black uppercase text-slate-400">
                    <th className="p-3">Data</th><th className="p-3">Escola</th><th className="p-3">Serviço</th>
                    <th className="p-3">Ambiente</th><th className="p-3">Categoria</th><th className="p-3">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {occurrencesFiltradas.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-400 text-sm">Nenhuma ocorrência encontrada.</td></tr>
                  ) : occurrencesFiltradas.map(o => (
                    <tr key={o.id} className="border-t border-slate-100">
                      <td className="p-3 whitespace-nowrap">{o.data}</td>
                      <td className="p-3">{schoolName(o.escolaId)}</td>
                      <td className="p-3">{serviceTypeName(o.serviceTypeId)}</td>
                      <td className="p-3">{o.ambiente}</td>
                      <td className="p-3">{o.categoriaOcorrencia}</td>
                      <td className="p-3">
                        <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${o.situacao === 'resolvido' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {o.situacao === 'resolvido' ? 'Resolvido' : 'Pendente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-[10px] font-black uppercase text-slate-400">
                    <th className="p-3">Data</th><th className="p-3">Escola</th><th className="p-3">Serviço</th>
                    <th className="p-3">Item</th><th className="p-3">Executado</th>
                  </tr>
                </thead>
                <tbody>
                  {completionsFiltradas.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-400 text-sm">Nenhum preenchimento encontrado.</td></tr>
                  ) : completionsFiltradas.map(c => (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="p-3 whitespace-nowrap">{c.data}</td>
                      <td className="p-3">{schoolName(c.escolaId)}</td>
                      <td className="p-3">{serviceTypeName(c.serviceTypeId)}</td>
                      <td className="p-3">{checklistItems.find(i => i.id === c.checklistItemId)?.descricaoItem || c.checklistItemId}</td>
                      <td className="p-3">
                        <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${c.executado === 'sim' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {c.executado === 'sim' ? 'Sim' : 'Não'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Fiscalizacao;
