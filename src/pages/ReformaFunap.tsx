import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { addTimbradoAllPages, TIMBRADO_HEADER_H, TIMBRADO_FOOTER_H } from '../lib/pdfTimbrado';
import {
  Wrench, Clock, RefreshCw, Save, CheckCircle2, AlertTriangle, History,
  FileDown, FileSpreadsheet, Image as ImageIcon, Upload, Truck, Calendar,
  Users, X, Loader2, Search, ExternalLink, FileCheck,
} from 'lucide-react';

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

interface EscolaOption {
  id: string;
  name: string;
  cie_code: string | null;
  address: string | null;
}

type Tab = 'preencher' | 'respostas' | 'janela' | 'relatorio';

const CAMPO_LABEL: Record<string, string> = {
  cja05_carteiras: 'Carteiras CJA-05',
  cja05_cadeiras: 'Cadeiras CJA-05',
  cja06_carteiras: 'Carteiras CJA-06',
  cja06_cadeiras: 'Cadeiras CJA-06',
  transporte: 'Transporte',
  data_prevista_transporte: 'Data Prevista do Transporte',
  quantidade_viagens: 'Qtd. Viagens',
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
  return /guarulhos/i.test(address) ? address : `${address}, Guarulhos - SP`;
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

  const [form, setForm] = useState(FORM_INITIAL);
  const [janelaForm, setJanelaForm] = useState({ data_inicio: '', data_fim: '', ativo: true });

  const [selectedEscolaId, setSelectedEscolaId] = useState<string | null>(null);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  const [logisticaEdits, setLogisticaEdits] = useState<Record<string, { transporte: string; data_prevista_transporte: string; quantidade_viagens: string }>>({});
  const [savingLogisticaId, setSavingLogisticaId] = useState<string | null>(null);

  const [cja05ImgOk, setCja05ImgOk] = useState(true);
  const [cja06ImgOk, setCja06ImgOk] = useState(true);
  const [uploadingImg, setUploadingImg] = useState<'cja05' | 'cja06' | null>(null);
  const [imgVersion, setImgVersion] = useState(Date.now());

  const [exportingPdf, setExportingPdf] = useState(false);
  const [planilhaUrl, setPlanilhaUrl] = useState<string | null>(null);
  const [showTermoModal, setShowTermoModal] = useState(false);
  const [confirming, setConfirming] = useState(false);

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
    () => respostasPorEscola.filter(item => item.escola.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [respostasPorEscola, searchTerm]
  );

  const totalRespondido = respostas.length;
  const totalPendente = Math.max(0, escolas.length - totalRespondido);

  const linhasRelatorio = useMemo(() => {
    type Linha = {
      diretoria: string; cie: string; escola: string; endereco: string; codigoBem: string;
      carteiras: string; cadeiras: string; transporte: string;
      dataPrevista: string; quantidadeViagens: string;
    };
    const linhas: Linha[] = [];
    respostas.forEach(r => {
      const transporteLabel = r.transporte === 'SIM' ? 'SIM' : r.transporte === 'NAO' ? 'NÃO' : '-';
      const dataPrevista = r.data_prevista_transporte ? formatDate(r.data_prevista_transporte) : '-';
      const viagens = r.quantidade_viagens || '-';
      const endereco = formatEndereco(escolaById.get(r.escola_id)?.address);
      const cja05Carteiras = Number(r.cja05_carteiras || 0);
      const cja05Cadeiras = Number(r.cja05_cadeiras || 0);
      if (cja05Carteiras > 0 || cja05Cadeiras > 0) {
        linhas.push({
          diretoria: DIRETORIA, cie: r.cie_code || '-', escola: r.escola_nome, endereco, codigoBem: 'CJA-05',
          carteiras: String(cja05Carteiras), cadeiras: String(cja05Cadeiras),
          transporte: transporteLabel, dataPrevista, quantidadeViagens: viagens,
        });
      }
      const cja06Carteiras = Number(r.cja06_carteiras || 0);
      const cja06Cadeiras = Number(r.cja06_cadeiras || 0);
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
        columnStyles: { 3: { cellWidth: 55 } },
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
            onClick={() => { fetchJanela(); fetchRespostas(); if (isAdmin) { fetchJanelas(); fetchLinkPlanilha(); } }}
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total de Escolas', value: escolas.length, bg: 'bg-blue-50', text: 'text-blue-600' },
                  { label: 'Respondido', value: totalRespondido, bg: 'bg-emerald-50', text: 'text-emerald-600' },
                  { label: 'Pendente', value: totalPendente, bg: 'bg-amber-50', text: 'text-amber-600' },
                ].map(card => (
                  <div key={card.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                    <p className="text-xs text-slate-500 font-medium">{card.label}</p>
                    <p className={`text-2xl font-bold ${card.text}`}>{card.value}</p>
                  </div>
                ))}
              </div>

              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar escola..."
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm"
                />
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
                        <td colSpan={7} className="p-6 text-center text-slate-400 text-sm">Nenhuma escola encontrada.</td>
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

              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <p className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-2">
                  <Truck size={16} className="text-slate-400" /> Logística de transporte
                </p>
                <p className="text-xs text-slate-500 mb-3">Preencha o transporte, a data prevista e o nº de viagens de cada escola antes de exportar.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                      <tr>
                        <th className="text-left p-2">Escola</th>
                        <th className="text-left p-2">Endereço</th>
                        <th className="text-left p-2">Transporte</th>
                        <th className="text-left p-2">Data Prevista</th>
                        <th className="text-left p-2">Qtd. Viagens</th>
                        <th className="text-left p-2">Atualizado por</th>
                        <th className="text-left p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {respostas.map(resposta => {
                        const edit = getLogisticaEdit(resposta);
                        return (
                          <tr key={resposta.id} className="border-t border-slate-100">
                            <td className="p-2 font-medium text-slate-700">{resposta.escola_nome}</td>
                            <td className="p-2 text-xs text-slate-500 max-w-xs">{formatEndereco(escolaById.get(resposta.escola_id)?.address)}</td>
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
                          </tr>
                        );
                      })}
                      {respostas.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-slate-400 text-sm">Nenhuma resposta recebida ainda.</td>
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
                        <td colSpan={10} className="p-6 text-center text-slate-400 text-sm">Nenhuma quantidade informada ainda.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

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
