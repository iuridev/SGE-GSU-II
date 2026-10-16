import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { addTimbradoAllPages, TIMBRADO_HEADER_H, TIMBRADO_FOOTER_H } from '../lib/pdfTimbrado';
import {
  Wrench, Clock, RefreshCw, Save, CheckCircle2, AlertTriangle, History,
  FileDown, FileSpreadsheet, Image as ImageIcon, Upload, Truck, Calendar,
  Users, X, Loader2, Search, ExternalLink, FileCheck, ClipboardList, Send,
  ThumbsUp, Ban, Undo2, Package, Pencil,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';

// A URE deste sistema atende só a diretoria de Guarulhos Sul (não há campo
// "diretoria" na tabela schools) — mesmo valor fixo usado no timbrado (ver
// src/lib/pdfTimbrado.ts).
const DIRETORIA = 'GUARULHOS SUL';

// Reaproveita o bucket público "inventory" (já usado em Remanejamento.tsx)
// para não precisar criar bucket/política novos só para estas 2 imagens.
const REFORMA_BUCKET = 'inventory';
const CJA05_IMAGE_PATH = 'reforma-funap/cja-05.jpg';
const CJA06_IMAGE_PATH = 'reforma-funap/cja-06.jpg';

interface Janela {
  id: string;
  data_inicio: string;
  data_fim: string;
  ativo: string;
  autor_nome: string;
  data_registro: string;
}

interface Resposta {
  id: string;
  escola_id: string;
  escola_nome: string;
  cie_code: string;
  cja05_carteiras: string;
  cja05_cadeiras: string;
  cja06_carteiras: string;
  cja06_cadeiras: string;
  transporte: string;
  data_prevista_transporte: string;
  quantidade_viagens: string;
  respondente_nome: string;
  data_resposta: string;
  data_ultima_edicao: string;
  editado_por_nome: string;
  logistica_atualizada_por: string;
  logistica_atualizada_em: string;
  confirmado: string;
  confirmado_por: string;
  confirmado_em: string;
  termo_texto: string;
  atendimento: string;
  atendimento_motivo: string;
  atendimento_por: string;
  atendimento_em: string;
  atend_cja05_carteiras: string;
  atend_cja05_cadeiras: string;
  atend_cja06_carteiras: string;
  atend_cja06_cadeiras: string;
  secomse_enviado_em: string;
  secomse_registrado_por: string;
}

interface HistoricoItem {
  id: string;
  resposta_id: string;
  escola_id: string;
  escola_nome: string;
  acao: string;
  dados_antes: string;
  dados_depois: string;
  autor_nome: string;
  data_hora: string;
}

interface Capacidade {
  id: string;
  cja05_carteiras: string;
  cja05_cadeiras: string;
  cja06_carteiras: string;
  cja06_cadeiras: string;
  observacao: string;
  autor_nome: string;
  data_registro: string;
}

interface EscolaOption {
  id: string;
  name: string;
  cie_code: string | null;
  address: string | null;
}

type Tab = 'preencher' | 'respostas' | 'janela' | 'relatorio';
type FiltroAtendimento = 'todos' | 'ATENDIDA' | 'NAO_ATENDIDA' | 'A_DECIDIR';

type CampoQtd = 'cja05_carteiras' | 'cja05_cadeiras' | 'cja06_carteiras' | 'cja06_cadeiras';
const CAMPOS_QTD: CampoQtd[] = ['cja05_carteiras', 'cja05_cadeiras', 'cja06_carteiras', 'cja06_cadeiras'];

// Total de itens (carteiras + cadeiras, CJA-05 + CJA-06) informados pela escola.
const totalItens = (r: Resposta) =>
  Number(r.cja05_carteiras || 0) + Number(r.cja05_cadeiras || 0) +
  Number(r.cja06_carteiras || 0) + Number(r.cja06_cadeiras || 0);

// Total que a FUNAP vai atender (pode ser menor que o solicitado = parcial).
const totalAtendido = (r: Resposta) => CAMPOS_QTD.reduce((acc, c) => acc + Number(r[`atend_${c}`] || 0), 0);

// Quantidade que a Regional informou que a FUNAP vai atender, por item.
const qtdAtendida = (r: Resposta, campo: CampoQtd) => Number(r[`atend_${campo}`] || 0);

type AtendimentoModal = {
  resposta: Resposta;
  tipo: 'ATENDIDA' | 'NAO_ATENDIDA';
  motivo: string;
  qtd: Record<CampoQtd, string>;
};

const CAMPO_LABEL: Record<string, string> = {
  cja05_carteiras: 'Carteiras CJA-05',
  cja05_cadeiras: 'Cadeiras CJA-05',
  cja06_carteiras: 'Carteiras CJA-06',
  cja06_cadeiras: 'Cadeiras CJA-06',
  transporte: 'Transporte',
  data_prevista_transporte: 'Data Prevista do Transporte',
  quantidade_viagens: 'Qtd. Viagens',
  atendimento: 'Atendimento',
  atendimento_motivo: 'Motivo',
};

const ATENDIMENTO_LABEL: Record<string, string> = {
  ATENDIDA: 'Será atendida',
  NAO_ATENDIDA: 'Não será atendida',
  '': 'A decidir',
};

const FORM_INITIAL = { cja05_carteiras: '', cja05_cadeiras: '', cja06_carteiras: '', cja06_cadeiras: '' };

const TABS: { id: Tab; label: string; icon: React.ReactNode; roles: string[] }[] = [
  { id: 'preencher', label: 'Preencher', icon: <Wrench size={16} />, roles: ['school_manager'] },
  { id: 'respostas', label: 'Respostas', icon: <Users size={16} />, roles: ['regional_admin', 'supervisor', 'dirigente'] },
  { id: 'janela', label: 'Prazo de Preenchimento', icon: <Calendar size={16} />, roles: ['regional_admin'] },
  { id: 'relatorio', label: 'Relatório FUNAP', icon: <FileDown size={16} />, roles: ['regional_admin'] },
];

function toDatetimeLocal(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(d?: string | null): string {
  if (!d) return '-';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString('pt-BR');
}

function formatDateTime(d?: string | null): string {
  if (!d) return '-';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return d;
  return parsed.toLocaleString('pt-BR');
}

// O cadastro de escolas nem sempre inclui a cidade no endereço (todas as
// escolas são de Guarulhos, única URE atendida por este sistema) — completa
// só quando ainda não está escrito, pra não duplicar.
function formatEndereco(address?: string | null): string {
  if (!address) return '-';
  // schools.address vem separado por tabulação (logradouro⇥número⇥bairro). O
  // jsPDF não quebra linha em \t e cortava o endereço no PDF — vira texto normal.
  const partes = address.split(/\t+/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const texto = partes.length === 3
    ? `${partes[0]}, ${partes[1]} - ${partes[2]}`
    : partes.join(', ');
  return /guarulhos/i.test(texto) ? texto : `${texto}, Guarulhos - SP`;
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', 'dez', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

// Conversor de número para extenso em português — cobre a faixa usada num
// levantamento de mobiliário por escola (até milhares), sem pretender ser
// gramaticalmente perfeito em todos os casos extremos.
function numeroPorExtenso(n: number): string {
  if (n === 0) return 'zero';

  const tresDigitos = (num: number): string => {
    if (num === 0) return '';
    if (num === 100) return 'cem';
    const c = Math.floor(num / 100);
    const resto = num % 100;
    const partes: string[] = [];
    if (c > 0) partes.push(CENTENAS[c]);
    if (resto > 0) {
      if (resto < 10) partes.push(UNIDADES[resto]);
      else if (resto < 20) partes.push(DEZ_A_DEZENOVE[resto - 10]);
      else {
        const d = Math.floor(resto / 10);
        const u = resto % 10;
        partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
      }
    }
    return partes.join(' e ');
  };

  const milhar = Math.floor(n / 1000);
  const resto = n % 1000;
  const parteMil = milhar > 0 ? (milhar === 1 ? 'mil' : `${tresDigitos(milhar)} mil`) : '';
  const parteResto = resto > 0 ? tresDigitos(resto) : '';

  if (!parteMil) return parteResto;
  if (!parteResto) return parteMil;
  const juntarComE = resto < 100 || resto % 100 === 0;
  return juntarComE ? `${parteMil} e ${parteResto}` : `${parteMil} ${parteResto}`;
}

function montarTextoTermo(params: {
  quantidade: number;
  escolaNome: string;
  cieCode: string;
  nomeDiretor: string;
  data: Date;
}): string {
  const { quantidade, escolaNome, cieCode, nomeDiretor, data } = params;
  const quantidadeExtenso = numeroPorExtenso(quantidade);
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = MESES[data.getMonth()];
  const ano = data.getFullYear();

  return `TERMO DE CONFERÊNCIA DE MOBILIÁRIO ESCOLAR

Escola: ${escolaNome}   |   CIE: ${cieCode || '-'}

A direção da unidade escolar acima identificada, no âmbito do preenchimento do formulário da Fundação de Amparo ao Trabalhador Preso (FUNAP) referente à reforma de conjuntos de aluno (mesa e cadeira), DECLARA, para os devidos fins, que:

1. Foi realizada a conferência física, item a item, de todos os conjuntos de aluno relacionados para reforma;

2. A quantidade total informada no formulário — Quantidade de conjuntos para reforma: ${quantidade} (${quantidadeExtenso}) unidades. — corresponde à quantidade real e necessária de conjuntos que efetivamente demandam reforma, não havendo divergência entre o quantitativo declarado e o quantitativo fisicamente conferido;

3. Foram desconsiderados e excluídos da relação todos os itens cuja ferragem (estrutura metálica, pés, parafusos, dobradiças e demais componentes metálicos) apresente dano, quebra, deformação ou sinais de ferrugem/oxidação, de modo que os conjuntos relacionados para reforma não possuem ferragem danificada ou enferrujada;

4. A escola está ciente de que a quantidade de conjuntos ora conferida e declarada deverá permanecer separada e identificada em local apropriado, aguardando a retirada pela FUNAP (ou empresa/setor responsável) para fins de reforma, responsabilizando-se pela guarda e integridade dos itens até a efetiva retirada.

Por ser verdade, firma-se o presente Termo de Conferência, para que produza os efeitos legais e administrativos junto à FUNAP.

Guarulhos, ${dia} de ${mes} de ${ano}.


${nomeDiretor}
Diretor(a) — ${escolaNome}`;
}

export default function ReformaFunap() {
  const [userRole, setUserRole] = useState('');
  const [userName, setUserName] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);

  const [escolas, setEscolas] = useState<EscolaOption[]>([]);
  const [janela, setJanela] = useState<Janela | null>(null);
  const [janelas, setJanelas] = useState<Janela[]>([]);
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(new Date());

  const [activeTab, setActiveTab] = useState<Tab>('preencher');
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroAtendimento, setFiltroAtendimento] = useState<FiltroAtendimento>('todos');
  const [savingAtendimentoId, setSavingAtendimentoId] = useState<string | null>(null);
  const [atendimentoModal, setAtendimentoModal] = useState<AtendimentoModal | null>(null);
  const [capacidade, setCapacidade] = useState<Capacidade | null>(null);
  const [capacidadeHistorico, setCapacidadeHistorico] = useState<Capacidade[]>([]);
  const [capacidadeModal, setCapacidadeModal] = useState<{ qtd: Record<CampoQtd, string>; observacao: string } | null>(null);
  const [savingCapacidade, setSavingCapacidade] = useState(false);

  const [form, setForm] = useState(FORM_INITIAL);
  const [janelaForm, setJanelaForm] = useState({ data_inicio: '', data_fim: '', ativo: true });

  const [selectedEscolaId, setSelectedEscolaId] = useState<string | null>(null);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  const [logisticaEdits, setLogisticaEdits] = useState<Record<string, { transporte: string; data_prevista_transporte: string; quantidade_viagens: string }>>({});
  const [savingLogisticaId, setSavingLogisticaId] = useState<string | null>(null);
  // Escola com o campo de data/hora de envio à SECOMSE aberto para edição.
  const [envioSecomseEdit, setEnvioSecomseEdit] = useState<{ id: string; valor: string } | null>(null);
  const [savingEnvioId, setSavingEnvioId] = useState<string | null>(null);

  const [cja05ImgOk, setCja05ImgOk] = useState(true);
  const [cja06ImgOk, setCja06ImgOk] = useState(true);
  const [uploadingImg, setUploadingImg] = useState<'cja05' | 'cja06' | null>(null);
  const [imgVersion, setImgVersion] = useState(Date.now());

  const [exportingPdf, setExportingPdf] = useState(false);
  const [planilhaUrl, setPlanilhaUrl] = useState<string | null>(null);
  const [showTermoModal, setShowTermoModal] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // ── Relatório Mensal (PDF) ────────────────────────────────────────────
  const [showRelatorioModal, setShowRelatorioModal] = useState(false);
  const [relatorioMes, setRelatorioMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [gerandoRelatorioPdf, setGerandoRelatorioPdf] = useState(false);
  const relatorioRef = useRef<HTMLDivElement>(null);

  const isAdmin = userRole === 'regional_admin';
  const isSchoolManager = userRole === 'school_manager';
  const isReadOnlyViewer = ['supervisor', 'dirigente'].includes(userRole);
  const hasAccess = isAdmin || isSchoolManager || isReadOnlyViewer;

  const cja05Url = `${supabase.storage.from(REFORMA_BUCKET).getPublicUrl(CJA05_IMAGE_PATH).data.publicUrl}?v=${imgVersion}`;
  const cja06Url = `${supabase.storage.from(REFORMA_BUCKET).getPublicUrl(CJA06_IMAGE_PATH).data.publicUrl}?v=${imgVersion}`;

  const visibleTabs = useMemo(() => TABS.filter(t => t.roles.includes(userRole)), [userRole]);

  useEffect(() => {
    fetchUser();
    fetchEscolas();
  }, []);

  useEffect(() => {
    if (!userRole) return;
    fetchJanela();
    fetchRespostas();
    if (isAdmin) { fetchJanelas(); fetchLinkPlanilha(); }
    if (isAdmin || isReadOnlyViewer) fetchCapacidade();
    if (isSchoolManager) setActiveTab('preencher');
    else if (isAdmin || isReadOnlyViewer) setActiveTab('respostas');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!userRole) return;
    const interval = setInterval(fetchJanela, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole]);

  useEffect(() => {
    if (!janela) return;
    setJanelaForm({
      data_inicio: toDatetimeLocal(janela.data_inicio),
      data_fim: toDatetimeLocal(janela.data_fim),
      ativo: janela.ativo === 'TRUE',
    });
  }, [janela]);

  useEffect(() => {
    if (!userSchoolId) return;
    const minhaResposta = respostas.find(r => r.escola_id === userSchoolId);
    if (minhaResposta) {
      setForm({
        cja05_carteiras: minhaResposta.cja05_carteiras || '',
        cja05_cadeiras: minhaResposta.cja05_cadeiras || '',
        cja06_carteiras: minhaResposta.cja06_carteiras || '',
        cja06_cadeiras: minhaResposta.cja06_cadeiras || '',
      });
    }
  }, [respostas, userSchoolId]);

  async function invoke(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke('reforma-funap', {
      body: { action, ...payload },
    });
    if (error) {
      let message = error.message;
      const context = (error as any).context;
      if (context && typeof context.json === 'function') {
        try {
          const body = await context.clone().json();
          if (body?.error) message = body.error;
        } catch { /* corpo não é JSON, mantém mensagem padrão */ }
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  const fetchUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('full_name, role, school_id')
          .eq('id', user.id)
          .single();
        setUserName(profile?.full_name || user.email || 'Usuário');
        setUserRole(resolveViewRole(profile?.role || ''));
        setUserSchoolId(profile?.school_id || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchEscolas = async () => {
    try {
      const { data } = await supabase.from('schools').select('id, name, cie_code, address').order('name');
      if (data) setEscolas(data as EscolaOption[]);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchJanela = async () => {
    try {
      const data = await invoke('obter_janela');
      setJanela(data?.janela || null);
    } catch (e) {
      console.error('Erro ao carregar prazo:', e);
    }
  };

  const fetchJanelas = async () => {
    try {
      const data = await invoke('listar_janelas');
      setJanelas(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Erro ao carregar histórico de prazos:', e);
    }
  };

  const fetchLinkPlanilha = async () => {
    try {
      const data = await invoke('obter_link_planilha');
      setPlanilhaUrl(data?.url || null);
    } catch (e) {
      console.error('Erro ao obter link da planilha:', e);
    }
  };

  const fetchCapacidade = async () => {
    try {
      const data = await invoke('obter_capacidade');
      setCapacidade(data?.capacidade || null);
      setCapacidadeHistorico(Array.isArray(data?.historico) ? data.historico : []);
    } catch (e) {
      console.error('Erro ao carregar capacidade FUNAP:', e);
    }
  };

  const abrirModalCapacidade = () => {
    setCapacidadeModal({
      qtd: Object.fromEntries(CAMPOS_QTD.map(c => [c, capacidade?.[c] || ''])) as Record<CampoQtd, string>,
      observacao: '',
    });
  };

  const handleSalvarCapacidade = async () => {
    if (!capacidadeModal) return;
    setSavingCapacidade(true);
    try {
      await invoke('definir_capacidade', {
        ...Object.fromEntries(CAMPOS_QTD.map(c => [c, Number(capacidadeModal.qtd[c] || 0)])),
        observacao: capacidadeModal.observacao,
      });
      await fetchCapacidade();
      setCapacidadeModal(null);
    } catch (e: any) {
      alert('Erro ao salvar capacidade: ' + e.message);
    } finally {
      setSavingCapacidade(false);
    }
  };

  const fetchRespostas = async () => {
    try {
      const data = await invoke('listar_respostas');
      setRespostas(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Erro ao carregar respostas:', e);
    }
  };

  const fetchHistorico = async (escolaId: string) => {
    setLoadingHistorico(true);
    try {
      const data = await invoke('listar_historico', { escola_id: escolaId });
      setHistorico(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Erro ao carregar histórico:', e);
      setHistorico([]);
    } finally {
      setLoadingHistorico(false);
    }
  };

  const statusJanela = useMemo(() => {
    if (!janela) return { fase: 'sem_janela' as const };
    if (janela.ativo !== 'TRUE') return { fase: 'inativo' as const };
    const inicio = new Date(janela.data_inicio);
    const fim = new Date(janela.data_fim);
    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return { fase: 'sem_janela' as const };
    if (now < inicio) return { fase: 'aguardando' as const, alvo: inicio };
    if (now > fim) return { fase: 'encerrado' as const, alvo: fim };
    return { fase: 'aberto' as const, alvo: fim };
  }, [janela, now]);

  const formatCountdown = (target: Date) => {
    const diffMs = Math.max(0, target.getTime() - now.getTime());
    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return days > 0 ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const handleSalvarResposta = async () => {
    setSaving(true);
    try {
      await invoke('salvar_resposta', {
        cja05_carteiras: Number(form.cja05_carteiras || 0),
        cja05_cadeiras: Number(form.cja05_cadeiras || 0),
        cja06_carteiras: Number(form.cja06_carteiras || 0),
        cja06_cadeiras: Number(form.cja06_cadeiras || 0),
      });
      await fetchRespostas();
      alert('Resposta salva com sucesso!');
    } catch (e: any) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmarResposta = async (termoTexto: string) => {
    setConfirming(true);
    try {
      await invoke('confirmar_resposta', { termo_texto: termoTexto });
      await fetchRespostas();
      setShowTermoModal(false);
      alert('Quantidade confirmada com sucesso! Não é mais possível alterá-la.');
    } catch (e: any) {
      alert('Erro ao confirmar: ' + e.message);
    } finally {
      setConfirming(false);
    }
  };

  const handleDefinirJanela = async () => {
    if (!janelaForm.data_inicio || !janelaForm.data_fim) {
      alert('Informe as datas de início e fim.');
      return;
    }
    setSaving(true);
    try {
      await invoke('definir_janela', {
        data_inicio: new Date(janelaForm.data_inicio).toISOString(),
        data_fim: new Date(janelaForm.data_fim).toISOString(),
        ativo: janelaForm.ativo,
      });
      await Promise.all([fetchJanela(), fetchJanelas()]);
      alert('Prazo de preenchimento configurado com sucesso!');
    } catch (e: any) {
      alert('Erro ao configurar prazo: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const getLogisticaEdit = (resposta: Resposta) => logisticaEdits[resposta.id] || {
    transporte: resposta.transporte,
    data_prevista_transporte: resposta.data_prevista_transporte,
    quantidade_viagens: resposta.quantidade_viagens,
  };

  const setLogisticaField = (resposta: Resposta, field: 'transporte' | 'data_prevista_transporte' | 'quantidade_viagens', value: string) => {
    setLogisticaEdits(prev => ({ ...prev, [resposta.id]: { ...getLogisticaEdit(resposta), [field]: value } }));
  };

  const handleDefinirEnvioSecomse = async (resposta: Resposta, enviadoEmLocal: string) => {
    setSavingEnvioId(resposta.id);
    try {
      await invoke('definir_envio_secomse', {
        id: resposta.id,
        enviado_em: enviadoEmLocal ? new Date(enviadoEmLocal).toISOString() : '',
      });
      await fetchRespostas();
      setEnvioSecomseEdit(null);
    } catch (e: any) {
      alert('Erro ao registrar envio à SECOMSE: ' + e.message);
    } finally {
      setSavingEnvioId(null);
    }
  };

  const handleSalvarLogistica = async (resposta: Resposta) => {
    const edit = getLogisticaEdit(resposta);
    setSavingLogisticaId(resposta.id);
    try {
      await invoke('atualizar_logistica', {
        id: resposta.id,
        transporte: edit.transporte === 'SIM',
        data_prevista_transporte: edit.data_prevista_transporte,
        quantidade_viagens: edit.quantidade_viagens,
      });
      await fetchRespostas();
    } catch (e: any) {
      alert('Erro ao salvar logística: ' + e.message);
    } finally {
      setSavingLogisticaId(null);
    }
  };

  const abrirModalAtendimento = (resposta: Resposta, tipo: 'ATENDIDA' | 'NAO_ATENDIDA') => {
    const jaAtendida = resposta.atendimento === 'ATENDIDA';
    // Novo atendimento já sugere o máximo possível: o solicitado, limitado ao saldo.
    const qtd = Object.fromEntries(CAMPOS_QTD.map(c => [
      c, jaAtendida ? (resposta[`atend_${c}`] || '0') : String(maximoAtendivel(resposta, c)),
    ])) as Record<CampoQtd, string>;
    setAtendimentoModal({
      resposta,
      tipo,
      motivo: resposta.atendimento === tipo ? resposta.atendimento_motivo || '' : '',
      qtd,
    });
  };

  const handleDefinirAtendimento = async (
    resposta: Resposta,
    atendimento: 'ATENDIDA' | 'NAO_ATENDIDA' | '',
    motivo = '',
    quantidades?: Record<CampoQtd, number>,
  ) => {
    setSavingAtendimentoId(resposta.id);
    try {
      await invoke('definir_atendimento', { id: resposta.id, atendimento, motivo, quantidades });
      await fetchRespostas();
      setAtendimentoModal(null);
    } catch (e: any) {
      alert('Erro ao registrar atendimento: ' + e.message);
    } finally {
      setSavingAtendimentoId(null);
    }
  };

  const compressImage = (file: File): Promise<Blob> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 900;
        let width = img.width;
        let height = img.height;
        if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } }
        else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Falha ao processar imagem')), 'image/jpeg', 0.8);
      };
    };
  });

  const handleUploadImagem = async (e: React.ChangeEvent<HTMLInputElement>, conjunto: 'cja05' | 'cja06') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(conjunto);
    try {
      const blob = await compressImage(file);
      const path = conjunto === 'cja05' ? CJA05_IMAGE_PATH : CJA06_IMAGE_PATH;
      const { error } = await supabase.storage.from(REFORMA_BUCKET).upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
      if (conjunto === 'cja05') setCja05ImgOk(true); else setCja06ImgOk(true);
      setImgVersion(Date.now());
    } catch (err: any) {
      alert('Erro no upload: ' + err.message);
    } finally {
      setUploadingImg(null);
      e.target.value = '';
    }
  };

  const respostasPorEscola = useMemo(() => {
    const map = new Map(respostas.map(r => [r.escola_id, r]));
    return escolas.map(e => ({ escola: e, resposta: map.get(e.id) || null }));
  }, [escolas, respostas]);

  const escolaById = useMemo(() => new Map(escolas.map(e => [e.id, e])), [escolas]);

  const respostasFiltradas = useMemo(
    () => respostasPorEscola.filter(({ escola, resposta }) => {
      if (!escola.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filtroAtendimento === 'todos') return true;
      // Só entram no filtro de atendimento as escolas com algo a reformar.
      if (!resposta || totalItens(resposta) === 0) return false;
      if (filtroAtendimento === 'A_DECIDIR') return !resposta.atendimento;
      return resposta.atendimento === filtroAtendimento;
    }),
    [respostasPorEscola, searchTerm, filtroAtendimento]
  );

  const totalRespondido = respostas.length;
  const totalPendente = Math.max(0, escolas.length - totalRespondido);

  // Saldo da capacidade FUNAP por item: capacidade − soma do atendido nas escolas.
  const saldoFunap = useMemo(() => {
    if (!capacidade) return null;
    return Object.fromEntries(CAMPOS_QTD.map(c => {
      const total = Number(capacidade[c] || 0);
      const atendido = respostas
        .filter(r => r.atendimento === 'ATENDIDA')
        .reduce((acc, r) => acc + Number(r[`atend_${c}`] || 0), 0);
      return [c, { capacidade: total, atendido, saldo: total - atendido }];
    })) as Record<CampoQtd, { capacidade: number; atendido: number; saldo: number }>;
  }, [capacidade, respostas]);

  // Saldo disponível para esta escola: o saldo geral + o que ela mesma já ocupa
  // (ao editar, a quantidade atual dela volta para o saldo).
  const saldoDisponivelPara = (resposta: Resposta, campo: CampoQtd) => {
    if (!saldoFunap) return Infinity;
    const proprio = resposta.atendimento === 'ATENDIDA' ? Number(resposta[`atend_${campo}`] || 0) : 0;
    return Math.max(0, saldoFunap[campo].saldo + proprio);
  };

  const maximoAtendivel = (resposta: Resposta, campo: CampoQtd) =>
    Math.min(Number(resposta[campo] || 0), saldoDisponivelPara(resposta, campo));

  const contagemAtendimento = useMemo(() => {
    const comItens = respostas.filter(r => totalItens(r) > 0);
    return {
      atendidas: comItens.filter(r => r.atendimento === 'ATENDIDA').length,
      naoAtendidas: comItens.filter(r => r.atendimento === 'NAO_ATENDIDA').length,
      aDecidir: comItens.filter(r => !r.atendimento).length,
    };
  }, [respostas]);

  // Logística e relatório FUNAP só com as escolas que a Regional marcou como
  // atendidas — "a decidir" e "não será atendida" ficam de fora.
  const respostasAtendidas = useMemo(
    () => respostas.filter(r => r.atendimento === 'ATENDIDA' && totalAtendido(r) > 0),
    [respostas]
  );

  const linhasRelatorio = useMemo(() => {
    type Linha = {
      diretoria: string; cie: string; escola: string; endereco: string; codigoBem: string;
      carteiras: string; cadeiras: string; transporte: string;
      dataPrevista: string; quantidadeViagens: string;
    };
    const linhas: Linha[] = [];
    respostasAtendidas.forEach(r => {
      const transporteLabel = r.transporte === 'SIM' ? 'SIM' : r.transporte === 'NAO' ? 'NÃO' : '-';
      const dataPrevista = r.data_prevista_transporte ? formatDate(r.data_prevista_transporte) : '-';
      const viagens = r.quantidade_viagens || '-';
      const endereco = formatEndereco(escolaById.get(r.escola_id)?.address);
      const cja05Carteiras = qtdAtendida(r, 'cja05_carteiras');
      const cja05Cadeiras = qtdAtendida(r, 'cja05_cadeiras');
      if (cja05Carteiras > 0 || cja05Cadeiras > 0) {
        linhas.push({
          diretoria: DIRETORIA, cie: r.cie_code || '-', escola: r.escola_nome, endereco, codigoBem: 'CJA-05',
          carteiras: String(cja05Carteiras), cadeiras: String(cja05Cadeiras),
          transporte: transporteLabel, dataPrevista, quantidadeViagens: viagens,
        });
      }
      const cja06Carteiras = qtdAtendida(r, 'cja06_carteiras');
      const cja06Cadeiras = qtdAtendida(r, 'cja06_cadeiras');
      if (cja06Carteiras > 0 || cja06Cadeiras > 0) {
        linhas.push({
          diretoria: DIRETORIA, cie: r.cie_code || '-', escola: r.escola_nome, endereco, codigoBem: 'CJA-06',
          carteiras: String(cja06Carteiras), cadeiras: String(cja06Cadeiras),
          transporte: transporteLabel, dataPrevista, quantidadeViagens: viagens,
        });
      }
    });
    return linhas.sort((a, b) => a.escola.localeCompare(b.escola));
  }, [respostas, escolaById]);

  // ── Relatório Mensal ────────────────────────────────────────────────────
  // Formulário de levantamento (não é um processo com etapas): "no mês" mede
  // quando a escola respondeu (data_resposta) e quando confirmou o Termo de
  // Conferência (confirmado_em — a resposta vira definitiva/travada nesse
  // momento, o equivalente mais próximo de uma "conclusão"). O restante é
  // sempre a fotografia atual (respondido/confirmado/pendente).
  const opcoesMesRelatorio = useMemo(() => {
    const opts: { key: string; label: string }[] = [];
    const base = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      opts.push({ key, label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) });
    }
    return opts;
  }, []);

  const mesLabelRelatorio = (mesStr: string) => {
    const [ano, mesNum] = mesStr.split('-').map(Number);
    if (!ano || !mesNum) return mesStr;
    return new Date(ano, mesNum - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const totalConfirmado = useMemo(() => respostas.filter(r => r.confirmado === 'TRUE').length, [respostas]);
  const totalRespondidoNaoConfirmado = totalRespondido - totalConfirmado;

  const situacaoChartData = useMemo(() => [
    { name: 'Confirmado', quantidade: totalConfirmado, color: '#10b981' },
    { name: 'Respondido (não confirmado)', quantidade: totalRespondidoNaoConfirmado, color: '#3b82f6' },
    { name: 'Pendente', quantidade: totalPendente, color: '#f59e0b' },
  ].filter(d => d.quantidade > 0), [totalConfirmado, totalRespondidoNaoConfirmado, totalPendente]);

  const totaisMobiliario = useMemo(() => respostas.reduce((acc, r) => {
    acc.carteiras += Number(r.cja05_carteiras || 0) + Number(r.cja06_carteiras || 0);
    acc.cadeiras += Number(r.cja05_cadeiras || 0) + Number(r.cja06_cadeiras || 0);
    return acc;
  }, { carteiras: 0, cadeiras: 0 }), [respostas]);

  const relatorioMetrics = useMemo(() => {
    const mes = relatorioMes;
    const respostasNoMes = respostas.filter(r => r.data_resposta?.startsWith(mes)).length;
    const confirmacoesNoMes = respostas.filter(r => r.confirmado === 'TRUE' && r.confirmado_em?.startsWith(mes)).length;

    const [anoSel, mesSelNum] = mes.split('-').map(Number);
    const tendencia = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(anoSel, (mesSelNum - 1) - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      const recebidas = respostas.filter(r => r.data_resposta?.startsWith(key)).length;
      const confirmadas = respostas.filter(r => r.confirmado === 'TRUE' && r.confirmado_em?.startsWith(key)).length;
      tendencia.push({ mes: label, Respostas: recebidas, Confirmações: confirmadas });
    }

    return { respostasNoMes, confirmacoesNoMes, tendencia };
  }, [relatorioMes, respostas]);

  // Relatório Mensal em PDF: mesma técnica já usada nas demais páginas
  // (html2canvas do bloco de cards + gráficos Recharts renderizado no modal + addImage).
  const gerarRelatorioMensalPdf = async () => {
    if (!relatorioRef.current) return;
    setGerandoRelatorioPdf(true);
    try {
      await new Promise(r => setTimeout(r, 400));
      const canvas = await html2canvas(relatorioRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/png');

      const doc = new jsPDF();
      const pdfWidth = doc.internal.pageSize.getWidth();
      const pdfHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const currentY = 40;

      let printWidth = pdfWidth - margin * 2;
      let printHeight = (canvas.height * printWidth) / canvas.width;
      const maxHeight = pdfHeight - currentY - margin;
      if (printHeight > maxHeight) {
        const ratio = maxHeight / printHeight;
        printHeight = maxHeight;
        printWidth *= ratio;
      }
      doc.addImage(imgData, 'PNG', margin, currentY, printWidth, printHeight);

      addTimbradoAllPages(doc);
      doc.save(`Relatorio_Mensal_Reforma_FUNAP_${relatorioMes}.pdf`);
      setShowRelatorioModal(false);
    } catch (err) {
      console.error(err);
      alert('Houve um erro ao gerar o PDF. Tente novamente.');
    } finally {
      setGerandoRelatorioPdf(false);
    }
  };

  const handleExportarPdf = () => {
    setExportingPdf(true);
    try {
      const doc = new jsPDF('landscape');
      let currentY = TIMBRADO_HEADER_H + 6;
      doc.setFontSize(13);
      doc.setTextColor(15, 118, 110);
      doc.text('Levantamento de Reforma FUNAP — Carteiras e Cadeiras (CJA-05 / CJA-06)', 14, currentY);
      currentY += 6;
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, currentY);
      currentY += 6;

      autoTable(doc, {
        startY: currentY,
        head: [['Diretoria', 'CIE', 'Escola', 'Endereço', 'Código do Bem', 'Carteiras', 'Cadeiras', 'Transporte', 'Data Prevista', 'Qtd. Viagens']],
        body: linhasRelatorio.map(l => [l.diretoria, l.cie, l.escola, l.endereco, l.codigoBem, l.carteiras, l.cadeiras, l.transporte, l.dataPrevista, l.quantidadeViagens]),
        theme: 'grid',
        headStyles: { fillColor: [13, 148, 136], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        columnStyles: { 3: { cellWidth: 65 } },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { top: TIMBRADO_HEADER_H + 6, bottom: TIMBRADO_FOOTER_H + 6 },
      });

      addTimbradoAllPages(doc);
      doc.save(`Reforma_FUNAP_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar o PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportarExcel = () => {
    const ws = XLSX.utils.json_to_sheet(linhasRelatorio.map(l => ({
      'DIRETORIA': l.diretoria,
      'CIE': l.cie,
      'ESCOLA': l.escola,
      'ENDEREÇO': l.endereco,
      'CÓDIGO DO BEM': l.codigoBem,
      'CARTEIRAS': l.carteiras,
      'CADEIRAS': l.cadeiras,
      'TRANSPORTE': l.transporte,
      'DATA PREVISTA PARA TRANSPORTE': l.dataPrevista,
      'QUANTIDADE VIAGENS': l.quantidadeViagens,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reforma FUNAP');
    XLSX.writeFile(wb, `Reforma_FUNAP_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleBaixarTermoPdf = (texto: string, escolaNome: string) => {
    const doc = new jsPDF('portrait');
    const margin = 16;
    const pageW = doc.internal.pageSize.getWidth();
    let y = TIMBRADO_HEADER_H + 10;
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    const linhas = texto.split('\n');
    linhas.forEach(linha => {
      const wrapped = doc.splitTextToSize(linha || ' ', pageW - margin * 2);
      wrapped.forEach((w: string) => {
        if (y > doc.internal.pageSize.getHeight() - TIMBRADO_FOOTER_H - 10) {
          doc.addPage();
          y = TIMBRADO_HEADER_H + 10;
        }
        doc.text(w, margin, y);
        y += 5.5;
      });
    });
    addTimbradoAllPages(doc);
    doc.save(`Termo_Conferencia_FUNAP_${escolaNome.replace(/\s+/g, '_')}.pdf`);
  };

  const renderHistoricoItem = (item: HistoricoItem) => {
    let antes: Record<string, string> = {};
    let depois: Record<string, string> = {};
    try { antes = JSON.parse(item.dados_antes || '{}'); } catch { /* ignora */ }
    try { depois = JSON.parse(item.dados_depois || '{}'); } catch { /* ignora */ }

    if (item.acao === 'criacao') {
      const resumo = Object.entries(depois).map(([k, v]) => `${CAMPO_LABEL[k] || k}: ${v}`).join(', ');
      return `Preencheu pela primeira vez — ${resumo}`;
    }
    if (item.acao === 'secomse') {
      return depois.secomse_enviado_em
        ? `Registrou o envio à SECOMSE (contratação do transporte) em ${formatDateTime(depois.secomse_enviado_em)}`
        : 'Desfez o registro de envio à SECOMSE';
    }
    if (item.acao === 'atendimento') {
      const situacao = ATENDIMENTO_LABEL[depois.atendimento ?? ''] ?? depois.atendimento;
      if (depois.atendimento === 'NAO_ATENDIDA') {
        return `Marcou como "${situacao}" — motivo: ${depois.atendimento_motivo || '-'}`;
      }
      if (depois.atendimento === 'ATENDIDA') {
        const qtds = `CJA-05: ${depois.atend_cja05_carteiras || 0} cart. / ${depois.atend_cja05_cadeiras || 0} cad.; `
          + `CJA-06: ${depois.atend_cja06_carteiras || 0} cart. / ${depois.atend_cja06_cadeiras || 0} cad.`;
        return `Marcou como "${situacao}" — ${qtds}${depois.atendimento_motivo ? ` — obs.: ${depois.atendimento_motivo}` : ''}`;
      }
      return `Marcou como "${situacao}"`;
    }
    if (item.acao === 'confirmacao') {
      return 'Confirmou o Termo de Conferência — a quantidade informada não pode mais ser alterada.';
    }
    const mudancas = Object.keys(depois)
      .filter(k => antes[k] !== depois[k])
      .map(k => `${CAMPO_LABEL[k] || k}: ${antes[k] ?? '-'} → ${depois[k] ?? '-'}`);
    const prefixo = item.acao === 'logistica' ? 'Atualizou a logística' : 'Editou a resposta';
    return mudancas.length > 0 ? `${prefixo} — ${mudancas.join('; ')}` : `${prefixo} sem alterar os valores.`;
  };

  const minhaResposta = respostas.find(r => r.escola_id === userSchoolId) || null;
  const confirmado = minhaResposta?.confirmado === 'TRUE';
  const quantidadeTotalMinhaResposta = minhaResposta
    ? Number(minhaResposta.cja05_carteiras || 0) + Number(minhaResposta.cja05_cadeiras || 0)
      + Number(minhaResposta.cja06_carteiras || 0) + Number(minhaResposta.cja06_cadeiras || 0)
    : 0;

  const abrirModalConfirmacao = () => setShowTermoModal(true);

  const textoTermoPreview = minhaResposta && !confirmado
    ? montarTextoTermo({
        quantidade: quantidadeTotalMinhaResposta,
        escolaNome: minhaResposta.escola_nome,
        cieCode: minhaResposta.cie_code,
        nomeDiretor: userName,
        data: new Date(),
      })
    : '';

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="animate-spin text-teal-600" size={28} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Wrench className="text-teal-600" size={28} />
            Reforma FUNAP — Carteiras e Cadeiras
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Levantamento de itens dos conjuntos de aluno CJA-05 (verde) e CJA-06 (azul) que precisam de reforma
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              fetchJanela(); fetchRespostas();
              if (isAdmin) { fetchJanelas(); fetchLinkPlanilha(); }
              if (isAdmin || isReadOnlyViewer) fetchCapacidade();
            }}
            className="flex items-center gap-2 px-3 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm"
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
          {isAdmin && planilhaUrl && (
            <a
              href={planilhaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-medium"
            >
              <ExternalLink size={16} />
              Abrir Planilha
            </a>
          )}
        </div>
      </div>

      {!hasAccess && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-center text-slate-400 text-sm">
          <Wrench size={36} className="mx-auto mb-2 opacity-30" />
          Seu perfil não tem acesso a este módulo.
        </div>
      )}

      {hasAccess && (
        <>
          {/* Cronômetro / status do prazo */}
          <div className={`rounded-xl border shadow-sm p-4 flex items-center justify-between flex-wrap gap-3 ${
            statusJanela.fase === 'aberto' ? 'bg-teal-50 border-teal-200'
              : statusJanela.fase === 'encerrado' ? 'bg-slate-100 border-slate-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center gap-3">
              <Clock className={
                statusJanela.fase === 'aberto' ? 'text-teal-600' : statusJanela.fase === 'encerrado' ? 'text-slate-400' : 'text-amber-600'
              } size={24} />
              <div>
                {statusJanela.fase === 'sem_janela' && (
                  <p className="text-sm font-semibold text-slate-600">Nenhum prazo de preenchimento configurado ainda.</p>
                )}
                {statusJanela.fase === 'inativo' && (
                  <p className="text-sm font-semibold text-slate-600">O prazo de preenchimento está desativado no momento.</p>
                )}
                {statusJanela.fase === 'aguardando' && (
                  <>
                    <p className="text-sm font-semibold text-amber-700">Formulário abre em {formatCountdown(statusJanela.alvo!)}</p>
                    <p className="text-xs text-amber-600">Abertura: {formatDateTime(janela?.data_inicio)}</p>
                  </>
                )}
                {statusJanela.fase === 'aberto' && (
                  <>
                    <p className="text-sm font-semibold text-teal-700">Tempo restante para responder: {formatCountdown(statusJanela.alvo!)}</p>
                    <p className="text-xs text-teal-600">Encerra em: {formatDateTime(janela?.data_fim)}</p>
                  </>
                )}
                {statusJanela.fase === 'encerrado' && (
                  <>
                    <p className="text-sm font-semibold text-slate-600">Formulário encerrado</p>
                    <p className="text-xs text-slate-500">Prazo terminou em: {formatDateTime(janela?.data_fim)}</p>
                  </>
                )}
              </div>
            </div>
            {isAdmin && statusJanela.fase !== 'aberto' && (
              <button
                onClick={() => setActiveTab('janela')}
                className="text-xs font-medium text-teal-700 border border-teal-200 bg-white px-3 py-1.5 rounded-lg hover:bg-teal-50"
              >
                Configurar prazo
              </button>
            )}
          </div>

          {/* Cartões de referência visual */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              { id: 'cja05' as const, label: 'CJA-05 (Verde)', color: 'border-emerald-300 bg-emerald-50', url: cja05Url, ok: cja05ImgOk, setOk: setCja05ImgOk },
              { id: 'cja06' as const, label: 'CJA-06 (Azul)', color: 'border-blue-300 bg-blue-50', url: cja06Url, ok: cja06ImgOk, setOk: setCja06ImgOk },
            ]).map(card => (
              <div key={card.id} className={`rounded-xl border-2 ${card.color} p-4 flex items-center gap-4`}>
                <div className="w-24 h-24 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                  {card.ok ? (
                    <img
                      src={card.url}
                      alt={card.label}
                      className="w-full h-full object-contain"
                      onError={() => card.setOk(false)}
                    />
                  ) : (
                    <ImageIcon className="text-slate-300" size={32} />
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800">{card.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Conjunto de aluno — carteira e cadeira</p>
                  {isAdmin && (
                    <label className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-slate-600 border border-slate-300 bg-white px-2.5 py-1 rounded-lg cursor-pointer hover:bg-slate-50">
                      {uploadingImg === card.id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                      {uploadingImg === card.id ? 'Enviando...' : 'Trocar imagem'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingImg !== null}
                        onChange={(e) => handleUploadImagem(e, card.id)}
                      />
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
            {visibleTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === t.id ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Aba: Preencher */}
          {activeTab === 'preencher' && isSchoolManager && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-5">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>
                  <strong>Atenção:</strong> a FUNAP não realiza reforma de conjuntos com a ferragem danificada ou enferrujada.
                  Se a ferragem da carteira ou da cadeira estiver nessa condição, <strong>não inclua esse item na contagem abaixo</strong> —
                  separe-o para cadastro como inservível.
                </span>
              </div>

              {minhaResposta && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-teal-600 shrink-0" />
                  Respondido por <strong>{minhaResposta.respondente_nome}</strong> em {formatDateTime(minhaResposta.data_resposta)}.
                  {minhaResposta.data_ultima_edicao && minhaResposta.data_ultima_edicao !== minhaResposta.data_resposta && (
                    <> Última edição por <strong>{minhaResposta.editado_por_nome}</strong> em {formatDateTime(minhaResposta.data_ultima_edicao)}.</>
                  )}
                </div>
              )}

              {confirmado && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 size={16} className="shrink-0" />
                  Quantidade confirmada por <strong>{minhaResposta?.confirmado_por}</strong> em {formatDateTime(minhaResposta?.confirmado_em)} —
                  não é mais possível alterar os valores informados.
                </div>
              )}

              {statusJanela.fase !== 'aberto' && !confirmado && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 flex items-center gap-2">
                  <AlertTriangle size={16} className="shrink-0" />
                  {statusJanela.fase === 'aguardando' && 'O formulário ainda não está aberto para preenchimento.'}
                  {statusJanela.fase === 'encerrado' && 'O prazo de preenchimento já foi encerrado.'}
                  {(statusJanela.fase === 'sem_janela' || statusJanela.fase === 'inativo') && 'Não há um prazo de preenchimento ativo no momento.'}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="border-2 border-emerald-200 bg-emerald-50/50 rounded-xl p-4 space-y-3">
                  <p className="font-bold text-emerald-800 text-sm">CJA-05 (Verde)</p>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Quantidade de Carteiras</label>
                    <input
                      type="number" min={0} disabled={statusJanela.fase !== 'aberto' || confirmado}
                      value={form.cja05_carteiras}
                      onChange={e => setForm({ ...form, cja05_carteiras: e.target.value })}
                      className="w-full mt-1 p-2.5 border border-slate-200 rounded-lg text-sm disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Quantidade de Cadeiras</label>
                    <input
                      type="number" min={0} disabled={statusJanela.fase !== 'aberto' || confirmado}
                      value={form.cja05_cadeiras}
                      onChange={e => setForm({ ...form, cja05_cadeiras: e.target.value })}
                      className="w-full mt-1 p-2.5 border border-slate-200 rounded-lg text-sm disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                </div>

                <div className="border-2 border-blue-200 bg-blue-50/50 rounded-xl p-4 space-y-3">
                  <p className="font-bold text-blue-800 text-sm">CJA-06 (Azul)</p>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Quantidade de Carteiras</label>
                    <input
                      type="number" min={0} disabled={statusJanela.fase !== 'aberto' || confirmado}
                      value={form.cja06_carteiras}
                      onChange={e => setForm({ ...form, cja06_carteiras: e.target.value })}
                      className="w-full mt-1 p-2.5 border border-slate-200 rounded-lg text-sm disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Quantidade de Cadeiras</label>
                    <input
                      type="number" min={0} disabled={statusJanela.fase !== 'aberto' || confirmado}
                      value={form.cja06_cadeiras}
                      onChange={e => setForm({ ...form, cja06_cadeiras: e.target.value })}
                      className="w-full mt-1 p-2.5 border border-slate-200 rounded-lg text-sm disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                {!confirmado && (
                  <button
                    onClick={handleSalvarResposta}
                    disabled={saving || statusJanela.fase !== 'aberto'}
                    className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg font-medium text-sm hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {minhaResposta ? 'Salvar edição' : 'Enviar resposta'}
                  </button>
                )}
                {minhaResposta && !confirmado && (
                  <button
                    onClick={abrirModalConfirmacao}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700"
                  >
                    <FileCheck size={16} />
                    Confirmar quantidade informada
                  </button>
                )}
                {confirmado && (
                  <button
                    onClick={abrirModalConfirmacao}
                    className="flex items-center gap-2 px-4 py-2.5 text-slate-600 border border-slate-200 rounded-lg font-medium text-sm hover:bg-slate-50"
                  >
                    <FileCheck size={16} />
                    Ver Termo de Conferência
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Aba: Respostas */}
          {activeTab === 'respostas' && (isAdmin || isReadOnlyViewer) && (
            <div className="space-y-4">
              {/* Capacidade FUNAP e saldo */}
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
                  <div>
                    <p className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Package size={16} className="text-teal-600" /> Capacidade de atendimento FUNAP
                    </p>
                    {capacidade ? (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Cadastrada por {capacidade.autor_nome} em {formatDateTime(capacidade.data_registro)}
                        {capacidade.observacao && ` — ${capacidade.observacao}`}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Ainda não cadastrada — sem ela não há controle de saldo ao atender as escolas.
                      </p>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={abrirModalCapacidade}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100"
                    >
                      <Pencil size={13} /> {capacidade ? 'Editar capacidade' : 'Cadastrar capacidade'}
                    </button>
                  )}
                </div>
                {saldoFunap && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {CAMPOS_QTD.map(c => {
                      const s = saldoFunap[c];
                      const pct = s.capacidade > 0 ? Math.min(100, (s.atendido / s.capacidade) * 100) : 0;
                      return (
                        <div key={c} className={`rounded-lg border p-3 ${c.startsWith('cja05') ? 'border-emerald-200' : 'border-blue-200'}`}>
                          <p className="text-xs font-semibold text-slate-600">{CAMPO_LABEL[c]}</p>
                          <p className={`text-2xl font-bold mt-1 ${s.saldo < 0 ? 'text-red-600' : s.saldo === 0 ? 'text-slate-400' : 'text-teal-600'}`}>
                            {s.saldo}
                            <span className="text-xs font-normal text-slate-400"> de saldo</span>
                          </p>
                          <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                            <div
                              className={`h-full ${s.saldo < 0 ? 'bg-red-500' : c.startsWith('cja05') ? 'bg-emerald-500' : 'bg-blue-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            {s.atendido} atendido(s) de {s.capacidade}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
                {saldoFunap && CAMPOS_QTD.some(c => saldoFunap[c].saldo < 0) && (
                  <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                    <AlertTriangle size={13} /> O atendido passou da capacidade em algum item — reduza a quantidade de alguma escola ou revise a capacidade.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: 'Total de Escolas', value: escolas.length, bg: 'bg-blue-50', text: 'text-blue-600' },
                  { label: 'Respondido', value: totalRespondido, bg: 'bg-emerald-50', text: 'text-emerald-600' },
                  { label: 'Pendente', value: totalPendente, bg: 'bg-amber-50', text: 'text-amber-600' },
                  { label: 'Serão atendidas', value: contagemAtendimento.atendidas, bg: 'bg-teal-50', text: 'text-teal-600' },
                  { label: 'Não serão atendidas', value: contagemAtendimento.naoAtendidas, bg: 'bg-red-50', text: 'text-red-600' },
                  { label: 'Atendimento a decidir', value: contagemAtendimento.aDecidir, bg: 'bg-slate-50', text: 'text-slate-600' },
                ].map(card => (
                  <div key={card.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                    <p className="text-xs text-slate-500 font-medium">{card.label}</p>
                    <p className={`text-2xl font-bold ${card.text}`}>{card.value}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col md:flex-row gap-2">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Buscar escola..."
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <select
                  value={filtroAtendimento}
                  onChange={e => setFiltroAtendimento(e.target.value as FiltroAtendimento)}
                  className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white"
                >
                  <option value="todos">Todas as escolas</option>
                  <option value="ATENDIDA">Serão atendidas</option>
                  <option value="NAO_ATENDIDA">Não serão atendidas</option>
                  <option value="A_DECIDIR">Atendimento a decidir</option>
                </select>
              </div>

              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                    <tr>
                      <th className="text-left p-3">Escola</th>
                      <th className="text-left p-3">CIE</th>
                      <th className="text-center p-3">CJA-05 (Cart./Cad.)</th>
                      <th className="text-center p-3">CJA-06 (Cart./Cad.)</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Atendimento FUNAP</th>
                      <th className="text-left p-3">Última edição</th>
                      <th className="text-left p-3">Histórico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {respostasFiltradas.map(({ escola, resposta }) => (
                      <tr key={escola.id} className="border-t border-slate-100">
                        <td className="p-3 font-medium text-slate-700">{escola.name}</td>
                        <td className="p-3 text-slate-500">{escola.cie_code || '-'}</td>
                        <td className="p-3 text-center text-slate-600">
                          {resposta ? `${resposta.cja05_carteiras || 0} / ${resposta.cja05_cadeiras || 0}` : '-'}
                        </td>
                        <td className="p-3 text-center text-slate-600">
                          {resposta ? `${resposta.cja06_carteiras || 0} / ${resposta.cja06_cadeiras || 0}` : '-'}
                        </td>
                        <td className="p-3">
                          {resposta?.confirmado === 'TRUE' ? (
                            <span className="inline-flex items-center gap-1 text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full text-xs font-medium">
                              <FileCheck size={12} /> Confirmado
                            </span>
                          ) : resposta ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-xs font-medium">
                              <CheckCircle2 size={12} /> Respondido
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-xs font-medium">
                              <AlertTriangle size={12} /> Pendente
                            </span>
                          )}
                        </td>
                        <td className="p-3 min-w-[190px]">
                          {!resposta ? (
                            <span className="text-slate-300">-</span>
                          ) : totalItens(resposta) === 0 ? (
                            <span className="text-xs text-slate-400">Nada a reformar</span>
                          ) : (
                            <div className="space-y-1">
                              {resposta.atendimento === 'ATENDIDA' && (() => {
                                const atendido = totalAtendido(resposta);
                                const solicitado = totalItens(resposta);
                                const parcial = atendido < solicitado;
                                return (
                                  <>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                                      parcial ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-teal-700 bg-teal-50 border-teal-200'
                                    }`}>
                                      <ThumbsUp size={12} /> {parcial ? 'Atendida parcialmente' : 'Será atendida'}
                                    </span>
                                    <p className="text-xs text-slate-600">
                                      <strong>{atendido}</strong> de {solicitado} itens
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                      CJA-05: {resposta.atend_cja05_carteiras || 0}/{resposta.atend_cja05_cadeiras || 0} · CJA-06: {resposta.atend_cja06_carteiras || 0}/{resposta.atend_cja06_cadeiras || 0}
                                    </p>
                                    {resposta.atendimento_motivo && (
                                      <p className="text-xs text-slate-500 max-w-[220px]" title={resposta.atendimento_motivo}>
                                        {resposta.atendimento_motivo}
                                      </p>
                                    )}
                                  </>
                                );
                              })()}
                              {resposta.atendimento === 'NAO_ATENDIDA' && (
                                <>
                                  <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full text-xs font-medium">
                                    <Ban size={12} /> Não será atendida
                                  </span>
                                  <p className="text-xs text-slate-500 max-w-[220px]" title={resposta.atendimento_motivo}>
                                    {resposta.atendimento_motivo}
                                  </p>
                                </>
                              )}
                              {!resposta.atendimento && !isAdmin && (
                                <span className="text-xs text-slate-400">A decidir</span>
                              )}
                              {resposta.atendimento && (
                                <p className="text-[11px] text-slate-400">
                                  {resposta.atendimento_por} · {formatDateTime(resposta.atendimento_em)}
                                </p>
                              )}
                              {isAdmin && (
                                savingAtendimentoId === resposta.id ? (
                                  <Loader2 size={14} className="animate-spin text-teal-600" />
                                ) : (
                                  <div className="flex gap-1 flex-wrap">
                                    <button
                                      onClick={() => abrirModalAtendimento(resposta, 'ATENDIDA')}
                                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50"
                                    >
                                      <ThumbsUp size={12} /> {resposta.atendimento === 'ATENDIDA' ? 'Alterar qtd.' : 'Atender'}
                                    </button>
                                    {resposta.atendimento !== 'NAO_ATENDIDA' && (
                                      <button
                                        onClick={() => abrirModalAtendimento(resposta, 'NAO_ATENDIDA')}
                                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
                                      >
                                        <Ban size={12} /> Não atender
                                      </button>
                                    )}
                                    {resposta.atendimento && (
                                      <button
                                        onClick={() => {
                                          if (confirm(`Voltar "${escola.name}" para "A decidir"?`)) handleDefinirAtendimento(resposta, '');
                                        }}
                                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50"
                                      >
                                        <Undo2 size={12} /> Desfazer
                                      </button>
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-xs text-slate-500">
                          {resposta ? `${formatDateTime(resposta.data_ultima_edicao)} · ${resposta.editado_por_nome}` : '-'}
                        </td>
                        <td className="p-3">
                          {resposta && (
                            <button
                              onClick={() => { setSelectedEscolaId(escola.id); fetchHistorico(escola.id); }}
                              className="flex items-center gap-1 text-teal-600 hover:text-teal-800 text-xs font-medium"
                            >
                              <History size={14} /> Ver
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {respostasFiltradas.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-400 text-sm">Nenhuma escola encontrada.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Aba: Janela */}
          {activeTab === 'janela' && isAdmin && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
                <p className="font-bold text-slate-800 text-sm">Definir novo prazo de preenchimento</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Início</label>
                    <input
                      type="datetime-local"
                      value={janelaForm.data_inicio}
                      onChange={e => setJanelaForm({ ...janelaForm, data_inicio: e.target.value })}
                      className="w-full mt-1 p-2.5 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Fim</label>
                    <input
                      type="datetime-local"
                      value={janelaForm.data_fim}
                      onChange={e => setJanelaForm({ ...janelaForm, data_fim: e.target.value })}
                      className="w-full mt-1 p-2.5 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={janelaForm.ativo}
                    onChange={e => setJanelaForm({ ...janelaForm, ativo: e.target.checked })}
                  />
                  Prazo ativo
                </label>
                <button
                  onClick={handleDefinirJanela}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg font-medium text-sm hover:bg-teal-700 disabled:bg-slate-300"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Salvar prazo
                </button>
              </div>

              {janelas.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
                  <p className="p-4 pb-0 font-bold text-slate-800 text-sm">Histórico de prazos configurados</p>
                  <table className="w-full text-sm mt-2">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                      <tr>
                        <th className="text-left p-3">Início</th>
                        <th className="text-left p-3">Fim</th>
                        <th className="text-left p-3">Ativo</th>
                        <th className="text-left p-3">Definido por</th>
                        <th className="text-left p-3">Em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {janelas.map(j => (
                        <tr key={j.id} className="border-t border-slate-100">
                          <td className="p-3">{formatDateTime(j.data_inicio)}</td>
                          <td className="p-3">{formatDateTime(j.data_fim)}</td>
                          <td className="p-3">{j.ativo === 'TRUE' ? 'Sim' : 'Não'}</td>
                          <td className="p-3">{j.autor_nome}</td>
                          <td className="p-3 text-xs text-slate-500">{formatDateTime(j.data_registro)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Aba: Relatório */}
          {activeTab === 'relatorio' && isAdmin && (
            <div className="space-y-4">
              {statusJanela.fase === 'aberto' && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 flex items-center gap-2">
                  <AlertTriangle size={16} className="shrink-0" />
                  O prazo de preenchimento ainda está aberto — as respostas podem mudar até o fechamento.
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setShowRelatorioModal(true)}
                  className="flex items-center gap-2 px-3 py-2 text-teal-700 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors text-sm font-medium"
                >
                  <ClipboardList size={16} />
                  Relatório Mensal
                </button>
                <button
                  onClick={handleExportarPdf}
                  disabled={exportingPdf || linhasRelatorio.length === 0}
                  className="flex items-center gap-2 px-3 py-2 text-red-700 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {exportingPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                  Exportar PDF
                </button>
                <button
                  onClick={handleExportarExcel}
                  disabled={linhasRelatorio.length === 0}
                  className="flex items-center gap-2 px-3 py-2 text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <FileSpreadsheet size={16} />
                  Exportar Excel
                </button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 flex items-start gap-2">
                <Send size={16} className="shrink-0 mt-0.5" />
                <span>
                  As respostas coletadas neste levantamento foram encaminhadas à <strong>SECOMSE</strong> para o estudo
                  da logística de transporte e da reforma dos conjuntos de aluno junto à <strong>FUNAP</strong>.
                </span>
              </div>

              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <p className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-2">
                  <Truck size={16} className="text-slate-400" /> Logística de transporte
                </p>
                <p className="text-xs text-slate-500 mb-3">
                  Preencha o transporte, a data prevista e o nº de viagens de cada escola antes de exportar.
                  {' '}Aparecem aqui só as escolas marcadas como atendidas na aba Respostas, com a quantidade que a FUNAP vai atender.
                  {contagemAtendimento.aDecidir > 0 && ` Ainda há ${contagemAtendimento.aDecidir} escola(s) com atendimento a decidir.`}
                </p>
                {respostasAtendidas.length > 0 && (() => {
                  const enviadas = respostasAtendidas.filter(r => r.secomse_enviado_em).length;
                  const faltam = respostasAtendidas.length - enviadas;
                  return (
                    <div className={`mb-3 text-xs rounded-lg border px-3 py-2 flex items-center gap-2 ${
                      faltam === 0 ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-amber-50 border-amber-200 text-amber-700'
                    }`}>
                      <Send size={14} className="shrink-0" />
                      <span>
                        Enviadas à SECOMSE para contratar o transporte: <strong>{enviadas} de {respostasAtendidas.length}</strong>
                        {faltam > 0 && ` — faltam ${faltam}.`}
                      </span>
                    </div>
                  );
                })()}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                      <tr>
                        <th className="text-left p-2">Escola</th>
                        <th className="text-left p-2">Endereço</th>
                        <th className="text-center p-2">Qtd. atendida</th>
                        <th className="text-left p-2">Transporte</th>
                        <th className="text-left p-2">Data Prevista</th>
                        <th className="text-left p-2">Qtd. Viagens</th>
                        <th className="text-left p-2">Atualizado por</th>
                        <th className="text-left p-2"></th>
                        <th className="text-left p-2">Envio SECOMSE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {respostasAtendidas.map(resposta => {
                        const edit = getLogisticaEdit(resposta);
                        const parcial = totalAtendido(resposta) < totalItens(resposta);
                        return (
                          <tr key={resposta.id} className="border-t border-slate-100">
                            <td className="p-2 font-medium text-slate-700">{resposta.escola_nome}</td>
                            <td className="p-2 text-xs text-slate-500 max-w-xs">{formatEndereco(escolaById.get(resposta.escola_id)?.address)}</td>
                            <td className="p-2 text-center whitespace-nowrap">
                              <p className="text-sm font-bold text-slate-700">
                                {totalAtendido(resposta)}
                                {parcial && <span className="text-xs font-normal text-slate-400"> de {totalItens(resposta)}</span>}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                CJA-05: {resposta.atend_cja05_carteiras || 0} cart. / {resposta.atend_cja05_cadeiras || 0} cad.
                              </p>
                              <p className="text-[11px] text-slate-500">
                                CJA-06: {resposta.atend_cja06_carteiras || 0} cart. / {resposta.atend_cja06_cadeiras || 0} cad.
                              </p>
                            </td>
                            <td className="p-2">
                              <select
                                value={edit.transporte || ''}
                                onChange={e => setLogisticaField(resposta, 'transporte', e.target.value)}
                                className="p-1.5 border border-slate-200 rounded-lg text-xs"
                              >
                                <option value="">-</option>
                                <option value="SIM">SIM</option>
                                <option value="NAO">NÃO</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <input
                                type="date"
                                value={edit.data_prevista_transporte ? edit.data_prevista_transporte.split('T')[0] : ''}
                                onChange={e => setLogisticaField(resposta, 'data_prevista_transporte', e.target.value)}
                                className="p-1.5 border border-slate-200 rounded-lg text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number" min={0}
                                value={edit.quantidade_viagens || ''}
                                onChange={e => setLogisticaField(resposta, 'quantidade_viagens', e.target.value)}
                                className="w-20 p-1.5 border border-slate-200 rounded-lg text-xs"
                              />
                            </td>
                            <td className="p-2 text-xs text-slate-500">
                              {resposta.logistica_atualizada_por
                                ? `${resposta.logistica_atualizada_por} · ${formatDateTime(resposta.logistica_atualizada_em)}`
                                : '-'}
                            </td>
                            <td className="p-2">
                              <button
                                onClick={() => handleSalvarLogistica(resposta)}
                                disabled={savingLogisticaId === resposta.id}
                                className="flex items-center gap-1 text-teal-600 hover:text-teal-800 text-xs font-medium"
                              >
                                {savingLogisticaId === resposta.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                Salvar
                              </button>
                            </td>
                            <td className="p-2 min-w-[200px]">
                              {savingEnvioId === resposta.id ? (
                                <Loader2 size={14} className="animate-spin text-teal-600" />
                              ) : envioSecomseEdit?.id === resposta.id ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="datetime-local"
                                    value={envioSecomseEdit.valor}
                                    onChange={e => setEnvioSecomseEdit({ id: resposta.id, valor: e.target.value })}
                                    className="p-1.5 border border-slate-200 rounded-lg text-xs"
                                  />
                                  <button
                                    onClick={() => handleDefinirEnvioSecomse(resposta, envioSecomseEdit.valor)}
                                    disabled={!envioSecomseEdit.valor}
                                    title="Salvar"
                                    className="p-1 text-teal-600 hover:text-teal-800 disabled:text-slate-300"
                                  >
                                    <Save size={14} />
                                  </button>
                                  <button
                                    onClick={() => setEnvioSecomseEdit(null)}
                                    title="Cancelar"
                                    className="p-1 text-slate-400 hover:text-slate-600"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : resposta.secomse_enviado_em ? (
                                <div>
                                  <span className="inline-flex items-center gap-1 text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full text-xs font-medium">
                                    <Send size={11} /> Enviado
                                  </span>
                                  <p className="text-xs text-slate-600 mt-0.5">{formatDateTime(resposta.secomse_enviado_em)}</p>
                                  <p className="text-[11px] text-slate-400">por {resposta.secomse_registrado_por}</p>
                                  <div className="flex gap-2 mt-0.5">
                                    <button
                                      onClick={() => setEnvioSecomseEdit({ id: resposta.id, valor: toDatetimeLocal(resposta.secomse_enviado_em) })}
                                      className="text-[11px] text-teal-600 hover:underline"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (confirm(`Desfazer o envio à SECOMSE de "${resposta.escola_nome}"?`)) handleDefinirEnvioSecomse(resposta, '');
                                      }}
                                      className="text-[11px] text-slate-500 hover:underline"
                                    >
                                      Desfazer
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setEnvioSecomseEdit({ id: resposta.id, valor: toDatetimeLocal(new Date().toISOString()) })}
                                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 border border-amber-200 bg-amber-50 rounded-lg hover:bg-amber-100"
                                >
                                  <Send size={12} /> Marcar como enviado
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {respostasAtendidas.length === 0 && (
                        <tr>
                          <td colSpan={9} className="p-6 text-center text-slate-400 text-sm">Nenhuma escola marcada como atendida ainda.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
                <p className="p-4 pb-0 font-bold text-slate-800 text-sm">Prévia do relatório (modelo FUNAP)</p>
                <table className="w-full text-sm mt-2">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                    <tr>
                      <th className="text-left p-2">Diretoria</th>
                      <th className="text-left p-2">CIE</th>
                      <th className="text-left p-2">Escola</th>
                      <th className="text-left p-2">Endereço</th>
                      <th className="text-left p-2">Código do Bem</th>
                      <th className="text-center p-2">Carteiras</th>
                      <th className="text-center p-2">Cadeiras</th>
                      <th className="text-center p-2">Transporte</th>
                      <th className="text-left p-2">Data Prevista</th>
                      <th className="text-center p-2">Qtd. Viagens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasRelatorio.map((l, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="p-2">{l.diretoria}</td>
                        <td className="p-2">{l.cie}</td>
                        <td className="p-2">{l.escola}</td>
                        <td className="p-2 text-xs text-slate-500">{l.endereco}</td>
                        <td className="p-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${l.codigoBem === 'CJA-05' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                            {l.codigoBem}
                          </span>
                        </td>
                        <td className="p-2 text-center">{l.carteiras}</td>
                        <td className="p-2 text-center">{l.cadeiras}</td>
                        <td className="p-2 text-center">{l.transporte}</td>
                        <td className="p-2">{l.dataPrevista}</td>
                        <td className="p-2 text-center">{l.quantidadeViagens}</td>
                      </tr>
                    ))}
                    {linhasRelatorio.length === 0 && (
                      <tr>
                        <td colSpan={10} className="p-6 text-center text-slate-400 text-sm">Nenhuma escola marcada como atendida ainda.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal: Relatório Mensal (PDF) */}
      {isAdmin && showRelatorioModal && (
        <div className="fixed inset-0 z-[110] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ClipboardList size={20} className="text-teal-600" /> Relatório Mensal
              </h2>
              <button onClick={() => setShowRelatorioModal(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
              <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5"><Calendar size={15} /> Mês de referência:</label>
              <select
                value={relatorioMes}
                onChange={e => setRelatorioMes(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {opcoesMesRelatorio.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>

            <div className="overflow-y-auto flex-1 p-5">
              <div ref={relatorioRef} className="space-y-5 bg-white p-1">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Relatório Mensal — Reforma FUNAP (Carteiras/Cadeiras)</h3>
                  <p className="text-xs text-slate-500">Referência: {mesLabelRelatorio(relatorioMes)} • Gerado em {new Date().toLocaleString('pt-BR')}</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 flex items-start gap-2">
                  <Send size={16} className="shrink-0 mt-0.5" />
                  <span>
                    As respostas coletadas neste levantamento foram encaminhadas à <strong>SECOMSE</strong> para o estudo
                    da logística de transporte e da reforma dos conjuntos de aluno junto à <strong>FUNAP</strong>.
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="border border-slate-100 rounded-xl p-3">
                    <p className="text-xs text-slate-500 font-medium">Respostas Recebidas no Mês</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1">{relatorioMetrics.respostasNoMes}</p>
                  </div>
                  <div className="border border-slate-100 rounded-xl p-3">
                    <p className="text-xs text-slate-500 font-medium">Confirmações no Mês</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">{relatorioMetrics.confirmacoesNoMes}</p>
                  </div>
                  <div className="border border-slate-100 rounded-xl p-3">
                    <p className="text-xs text-slate-500 font-medium">Pendentes (hoje)</p>
                    <p className="text-2xl font-bold text-amber-600 mt-1">{totalPendente}</p>
                  </div>
                  <div className="border border-slate-100 rounded-xl p-3 bg-slate-50">
                    <p className="text-xs text-slate-500 font-medium">Carteiras / Cadeiras a Reformar</p>
                    <p className="text-lg font-bold text-slate-800 mt-1">{totaisMobiliario.carteiras} / {totaisMobiliario.cadeiras}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-500 mb-2">Respostas x Confirmações (últimos 6 meses)</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={relatorioMetrics.tendencia} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Respostas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Confirmações" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-500 mb-2">Situação Atual das Respostas</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={situacaoChartData} dataKey="quantidade" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3} stroke="#fff" strokeWidth={2}>
                        {situacaoChartData.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v, n]} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={(value: string) => <span className="text-[11px] font-medium text-slate-600">{value}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setShowRelatorioModal(false)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={gerarRelatorioMensalPdf}
                disabled={gerandoRelatorioPdf}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-60 transition-colors"
              >
                {gerandoRelatorioPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                {gerandoRelatorioPdf ? 'Gerando PDF...' : 'Baixar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Capacidade FUNAP (cadastrar/editar) */}
      {isAdmin && capacidadeModal && (() => {
        const cm = capacidadeModal;
        const invalido = CAMPOS_QTD.some(c => !/^\d*$/.test(cm.qtd[c]));
        return (
          <div className="fixed inset-0 z-[110] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Package size={20} className="text-teal-600" /> Capacidade de atendimento FUNAP
                </h2>
                <button onClick={() => setCapacidadeModal(null)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                  <X size={18} className="text-slate-500" />
                </button>
              </div>
              <div className="p-5 space-y-4 overflow-y-auto">
                <p className="text-sm text-slate-600">
                  Informe quantos itens a FUNAP consegue reformar. O saldo é a capacidade menos o que já foi atendido nas escolas.
                </p>
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="text-left py-1.5">Item</th>
                      <th className="text-center py-1.5">Já atendido</th>
                      <th className="text-center py-1.5">Capacidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CAMPOS_QTD.map(c => {
                      const atendido = saldoFunap?.[c].atendido
                        ?? respostas.filter(r => r.atendimento === 'ATENDIDA').reduce((acc, r) => acc + Number(r[`atend_${c}`] || 0), 0);
                      const abaixo = cm.qtd[c] !== '' && Number(cm.qtd[c]) < atendido;
                      return (
                        <tr key={c} className="border-t border-slate-100">
                          <td className="py-2 text-slate-700">{CAMPO_LABEL[c]}</td>
                          <td className="py-2 text-center text-slate-500">{atendido}</td>
                          <td className="py-2 text-center">
                            <input
                              type="number"
                              min={0}
                              value={cm.qtd[c]}
                              onChange={e => setCapacidadeModal({ ...cm, qtd: { ...cm.qtd, [c]: e.target.value } })}
                              className={`w-24 p-1.5 border rounded-lg text-sm text-center ${abaixo ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {CAMPOS_QTD.some(c => cm.qtd[c] !== '' && Number(cm.qtd[c]) < (saldoFunap?.[c].atendido ?? 0)) && (
                  <p className="text-xs text-amber-700 flex items-center gap-1">
                    <AlertTriangle size={13} /> Capacidade menor do que já foi atendido — o saldo ficará negativo até você reduzir alguma escola.
                  </p>
                )}
                <div>
                  <label className="text-xs font-semibold text-slate-500">Observação (opcional)</label>
                  <input
                    value={cm.observacao}
                    onChange={e => setCapacidadeModal({ ...cm, observacao: e.target.value })}
                    placeholder="Ex.: ofício FUNAP nº ..., capacidade revista em reunião..."
                    className="w-full mt-1 p-2.5 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                {capacidadeHistorico.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">Histórico de alterações</p>
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {capacidadeHistorico.map(h => (
                        <div key={h.id} className="text-[11px] text-slate-500 border-l-2 border-slate-200 pl-2">
                          <strong>{formatDateTime(h.data_registro)}</strong> · {h.autor_nome} — CJA-05: {h.cja05_carteiras} cart. / {h.cja05_cadeiras} cad.;
                          {' '}CJA-06: {h.cja06_carteiras} cart. / {h.cja06_cadeiras} cad.
                          {h.observacao && ` — ${h.observacao}`}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
                <button
                  onClick={() => setCapacidadeModal(null)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSalvarCapacidade}
                  disabled={invalido || savingCapacidade}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:bg-slate-300"
                >
                  {savingCapacidade ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Atender (quantidade atendida) / Não atender (motivo obrigatório) */}
      {isAdmin && atendimentoModal && (() => {
        const m = atendimentoModal;
        const atender = m.tipo === 'ATENDIDA';
        const excedidos = CAMPOS_QTD.filter(c => Number(m.qtd[c] || 0) > Number(m.resposta[c] || 0));
        const semSaldo = CAMPOS_QTD.filter(c => !excedidos.includes(c) && Number(m.qtd[c] || 0) > saldoDisponivelPara(m.resposta, c));
        const invalidos = CAMPOS_QTD.filter(c => !/^\d*$/.test(m.qtd[c]));
        const totalModal = CAMPOS_QTD.reduce((acc, c) => acc + Number(m.qtd[c] || 0), 0);
        const podeSalvar = atender
          ? excedidos.length === 0 && semSaldo.length === 0 && invalidos.length === 0 && totalModal > 0
          : m.motivo.trim().length > 0;
        const salvar = () => {
          if (atender) {
            const quantidades = Object.fromEntries(CAMPOS_QTD.map(c => [c, Number(m.qtd[c] || 0)])) as Record<CampoQtd, number>;
            handleDefinirAtendimento(m.resposta, 'ATENDIDA', m.motivo.trim(), quantidades);
          } else {
            handleDefinirAtendimento(m.resposta, 'NAO_ATENDIDA', m.motivo.trim());
          }
        };
        return (
          <div className="fixed inset-0 z-[110] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  {atender
                    ? <><ThumbsUp size={20} className="text-teal-600" /> Quantidade a atender</>
                    : <><Ban size={20} className="text-red-600" /> Não será atendida</>}
                </h2>
                <button onClick={() => setAtendimentoModal(null)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                  <X size={18} className="text-slate-500" />
                </button>
              </div>
              <div className="p-5 space-y-4 overflow-y-auto">
                <p className="text-sm text-slate-600">
                  <strong>{m.resposta.escola_nome}</strong> — {totalItens(m.resposta)} item(ns) solicitados.
                  {atender
                    ? ' Informe quanto a FUNAP consegue atender de cada item; é essa quantidade que vai para a logística e o relatório.'
                    : ' A escola sairá da logística e do relatório enviado à FUNAP.'}
                </p>

                {atender && (
                  <>
                    <table className="w-full text-sm">
                      <thead className="text-xs text-slate-500 uppercase">
                        <tr>
                          <th className="text-left py-1.5">Item</th>
                          <th className="text-center py-1.5">Solicitado</th>
                          {saldoFunap && <th className="text-center py-1.5">Saldo FUNAP</th>}
                          <th className="text-center py-1.5">Atender</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CAMPOS_QTD.map(c => {
                          const solicitado = Number(m.resposta[c] || 0);
                          const excedido = excedidos.includes(c) || semSaldo.includes(c);
                          return (
                            <tr key={c} className="border-t border-slate-100">
                              <td className="py-2 text-slate-700">{CAMPO_LABEL[c]}</td>
                              <td className="py-2 text-center text-slate-500">{solicitado}</td>
                              {saldoFunap && (
                                <td className={`py-2 text-center ${semSaldo.includes(c) ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                                  {saldoDisponivelPara(m.resposta, c)}
                                </td>
                              )}
                              <td className="py-2 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={maximoAtendivel(m.resposta, c)}
                                  value={m.qtd[c]}
                                  disabled={solicitado === 0}
                                  onChange={e => setAtendimentoModal({ ...m, qtd: { ...m.qtd, [c]: e.target.value } })}
                                  className={`w-24 p-1.5 border rounded-lg text-sm text-center disabled:bg-slate-50 disabled:text-slate-300 ${
                                    excedido ? 'border-red-400 bg-red-50' : 'border-slate-200'
                                  }`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="flex items-center justify-between text-xs">
                      <span className={excedidos.length > 0 || semSaldo.length > 0 ? 'text-red-600' : 'text-slate-500'}>
                        {excedidos.length > 0
                          ? 'A quantidade atendida não pode passar da solicitada.'
                          : semSaldo.length > 0
                            ? 'A quantidade passa do saldo disponível da FUNAP.'
                            : `Total a atender: ${totalModal} de ${totalItens(m.resposta)}`}
                      </span>
                      <button
                        onClick={() => setAtendimentoModal({
                          ...m,
                          qtd: Object.fromEntries(CAMPOS_QTD.map(c => [c, String(maximoAtendivel(m.resposta, c))])) as Record<CampoQtd, string>,
                        })}
                        className="text-teal-700 font-medium hover:underline"
                      >
                        {saldoFunap ? 'Máximo possível' : 'Atender tudo'}
                      </button>
                    </div>
                  </>
                )}

                <div>
                  <label className="text-xs font-semibold text-slate-500">
                    {atender ? 'Observação (opcional)' : 'Motivo *'}
                  </label>
                  <textarea
                    value={m.motivo}
                    onChange={e => setAtendimentoModal({ ...m, motivo: e.target.value })}
                    rows={3}
                    autoFocus={!atender}
                    placeholder={atender
                      ? 'Ex.: atendimento parcial por limite de capacidade deste lote...'
                      : 'Ex.: capacidade da FUNAP esgotada neste lote, inviabilidade de transporte...'}
                    className="w-full mt-1 p-2.5 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
                <button
                  onClick={() => setAtendimentoModal(null)}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={salvar}
                  disabled={!podeSalvar || savingAtendimentoId !== null}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:bg-slate-300 ${
                    atender ? 'bg-teal-600 hover:bg-teal-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {savingAtendimentoId ? <Loader2 size={16} className="animate-spin" /> : atender ? <ThumbsUp size={16} /> : <Ban size={16} />}
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Termo de Conferência de Mobiliário Escolar */}
      {showTermoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => !confirming && setShowTermoModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <p className="font-bold text-slate-800 flex items-center gap-2">
                <FileCheck size={18} className="text-emerald-600" /> Termo de Conferência de Mobiliário Escolar
              </p>
              <button onClick={() => setShowTermoModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              {!confirmado && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mb-4 flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  Leia com atenção. Ao confirmar, a quantidade informada não poderá mais ser alterada por esta escola.
                </div>
              )}
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-4">
                {confirmado ? (minhaResposta?.termo_texto || '') : textoTermoPreview}
              </pre>
            </div>

            <div className="flex gap-2 justify-end p-4 border-t border-slate-100">
              {!confirmado ? (
                <>
                  <button
                    onClick={() => setShowTermoModal(false)}
                    disabled={confirming}
                    className="px-4 py-2.5 text-slate-600 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleConfirmarResposta(textoTermoPreview)}
                    disabled={confirming}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:bg-slate-300"
                  >
                    {confirming ? <Loader2 size={16} className="animate-spin" /> : <FileCheck size={16} />}
                    Confirmar e assinar
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setShowTermoModal(false)}
                    className="px-4 py-2.5 text-slate-600 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50"
                  >
                    Fechar
                  </button>
                  <button
                    onClick={() => handleBaixarTermoPdf(minhaResposta?.termo_texto || '', minhaResposta?.escola_nome || 'Escola')}
                    className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700"
                  >
                    <FileDown size={16} />
                    Baixar PDF
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Painel de histórico (antes/depois) */}
      {selectedEscolaId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSelectedEscolaId(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div>
                <p className="font-bold text-slate-800 flex items-center gap-2">
                  <History size={18} className="text-teal-600" /> Histórico de edições
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {escolas.find(e => e.id === selectedEscolaId)?.name || ''}
                </p>
              </div>
              <button onClick={() => setSelectedEscolaId(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {loadingHistorico && (
                <div className="flex justify-center p-4"><Loader2 className="animate-spin text-teal-600" size={24} /></div>
              )}
              {!loadingHistorico && historico.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Nenhum registro de histórico encontrado.</p>
              )}
              {!loadingHistorico && historico.map(item => (
                <div key={item.id} className="border-l-2 border-teal-200 pl-3 py-1">
                  <p className="text-xs text-slate-400">{formatDateTime(item.data_hora)} · {item.autor_nome}</p>
                  <p className="text-sm text-slate-700 mt-0.5">{renderHistoricoItem(item)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
