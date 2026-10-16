import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { resolveViewRole } from '../lib/roles';
import { DefesoEleitoralBanner } from '../components/DefesoEleitoralBanner';
import { FurtoProcessoModal, FURTO_SELECT, furtoPendenteBaixaSam, furtoTemNl, type ProcessoFurto } from '../components/FurtoProcessoModal';
import {
  Package, Plus, Search, FileText,
  Trash2, Edit, X, Save, Loader2,
  Building2, Info, CheckCircle2,
  Calendar, Eye,
  AlertCircle, History, Flag, ShieldAlert, Gift,
  ClipboardList, DollarSign, ListPlus, Calculator,
  LayoutGrid, CheckCircle, Download, BarChart2, TrendingUp,
  FileDown, ListOrdered, Undo2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import jsPDF from 'jspdf';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

// Status gravado quando a Regional devolve o processo à escola para correção.
// O valor no banco continua 'CORREÇÃO' (dados existentes); na tela aparece
// como "Devolvido à escola".
const STATUS_CORRECAO = 'CORREÇÃO';
const STATUS_LABELS: Record<string, string> = { [STATUS_CORRECAO]: 'DEVOLVIDO À ESCOLA' };
const statusLabel = (s: string) => STATUS_LABELS[s] || s;

function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

// Itens com o mesmo nome compartilham o código BEC (tabela patrimonio_codigos_bec).
// A chave ignora caixa, acentos e espaços extras para "Cadeira  escolar" e
// "CADEIRA ESCOLAR" caírem no mesmo código.
function chaveBec(descricao: string): string {
  return descricao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Nº patrimonial (chapa) dos itens a incorporar: gravado na planilha como
// lista separada por vírgula (formato já usado em Atendimento Patrimônio).
// Item com várias unidades recebe um intervalo de chapas consecutivas, que é
// expandido aqui (mantendo os zeros à esquerda da chapa inicial).
function separarChapas(valor: string): string[] {
  return (valor || '').split(',').map(n => n.trim()).filter(Boolean);
}

function expandirIntervaloChapas(inicial: string, final: string): string[] | string {
  const ini = inicial.trim();
  const fim = final.trim();
  if (!/^\d+$/.test(ini) || !/^\d+$/.test(fim)) return 'Para intervalo, use só números na chapa inicial e final.';
  const a = Number(ini);
  const b = Number(fim);
  if (b < a) return 'A chapa final deve ser maior ou igual à inicial.';
  if (b - a + 1 > 5000) return 'Intervalo grande demais (máx. 5000 chapas).';
  const largura = ini.length;
  const lista: string[] = [];
  for (let n = a; n <= b; n++) lista.push(String(n).padStart(largura, '0'));
  return lista;
}

// "100, 101, 102" → "100 a 102"; listas não consecutivas ficam como estão.
function resumirChapas(valor: string): string {
  const lista = separarChapas(valor);
  if (lista.length <= 1) return lista[0] || '';
  const consecutivas = lista.every(n => /^\d+$/.test(n))
    && lista.every((n, i) => i === 0 || Number(n) === Number(lista[i - 1]) + 1);
  return consecutivas ? `${lista[0]} a ${lista[lista.length - 1]}` : lista.join(', ');
}

// Nº da nota fiscal por item a incorporar (tabela patrimonio_itens_nota_fiscal,
// chave = id do item na planilha).
async function carregarNotasFiscais(): Promise<Record<string, string>> {
  const { data, error } = await (supabase as any).from('patrimonio_itens_nota_fiscal').select('item_id, numero_nota_fiscal');
  if (error) throw error;
  const map: Record<string, string> = {};
  (data || []).forEach((r: { item_id: string; numero_nota_fiscal: string }) => { map[r.item_id] = r.numero_nota_fiscal; });
  return map;
}

async function carregarCodigosBec(): Promise<Record<string, string>> {
  const { data, error } = await (supabase as any).from('patrimonio_codigos_bec').select('descricao_chave, codigo_bec');
  if (error) throw error;
  const map: Record<string, string> = {};
  (data || []).forEach((r: { descricao_chave: string; codigo_bec: string }) => { map[r.descricao_chave] = r.codigo_bec; });
  return map;
}

function correcaoHa(iso: string | null | undefined): string {
  const d = diasDesde(iso);
  return d === null ? '' : ` há ${d} dia${d !== 1 ? 's' : ''}`;
}

interface PatrimonioItem {
  name: string;
  asset_number: string;
  unit_value: number;
}

// Linha da aba "Itens a Incorporar" (planilha, via edge function patrimonio-atendimento).
interface ItemIncorporar {
  id: string;
  escola_id: string;
  descricao: string;
  quantidade: string;
  status: string;
  numero_patrimonial: string;
  origem_aquisicao: string;
  orgao_entrega: string;
  data_aquisicao: string;
  valor_item: string;
  processo_incorporacao_id: string;
  processo_sei: string;
}

interface PatrimonioProcess {
  id: string;
  school_id: string;
  type: string;
  sei_number: string;
  process_date: string;
  current_step: string;
  status: string;
  occurrence_date?: string;
  bulletin_number?: string;
  is_nl_low?: boolean;
  authorship?: string;
  conclusion?: string;
  subtype?: string;
  items_json?: string;
  doe_date?: string;
  correcao_motivo?: string | null;
  correcao_em?: string | null;
  created_at: string;
  schools?: { name: string };
}

interface School {
  id: string;
  name: string;
}

const formatarMoeda = (v: string) => {
  const n = Number(v);
  if (!v || Number.isNaN(n)) return '';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
};

const PROCESS_TYPES = [
  { id: 'DOACAO_MAT_PERMANENTE', label: 'Doação de Material Permanente', category: 'doacao', color: 'text-emerald-600 bg-emerald-50' },
  { id: 'DOACAO_PDDE', label: 'Doação PDDE', category: 'doacao', color: 'text-emerald-600 bg-emerald-50' },
  { id: 'DOACAO_APM', label: 'Doação APM', category: 'doacao', color: 'text-emerald-600 bg-emerald-50' },
  { id: 'DOACAO_TERCEIROS', label: 'Doação Terceiros', category: 'doacao', color: 'text-emerald-600 bg-emerald-50' },
  { id: 'INSERVIVEIS', label: 'Inservíveis', category: 'inserviveis', color: 'text-amber-600 bg-amber-50' },
  { id: 'BANDEIRAS', label: 'Bandeiras', category: 'bandeiras', color: 'text-blue-600 bg-blue-50' },
  { id: 'FURTOS', label: 'Sinistros (Furtos/Roubos)', category: 'furtos', color: 'text-red-600 bg-red-50' },
];

// Tipos que não aceitam novo lançamento aqui (continuam existindo para exibir
// processos antigos): sinistros vêm da página de Furtos e os "Doação PDDE"
// eram, na verdade, Doação de Material Permanente.
const TIPOS_SEM_NOVO_LANCAMENTO = ['FURTOS', 'DOACAO_PDDE'];

const WORKFLOWS: Record<string, string[]> = {
  'DOACAO_MAT_PERMANENTE': ["FILA DE ATENDIMENTO", "ANÁLISE SEFISC", "AUTORIZAÇÃO SEOM", "DESPACHO DO COORDENADOR GERAL - DIRIGENTE", "SIAFEM CONTÁBIL", "INCORPORAÇÃO SAM PATRIMÔNIO", "CONCLUÍDO"],
  'DOACAO_PDDE': ["RECEBIDO NO SEI", "ANÁLISE DO SEFISC", "DEVOLVIDO PARA CORREÇÃO", "DOE", "REGISTRO NO SAM", "REGISTRO NÚMERO PATRIMÔNIO"],
  'DOACAO_APM': ["RECEBIDO NO SEI", "ANÁLISE DO SEFISC", "DEVOLVIDO PARA CORREÇÃO", "DOE", "REGISTRO NO SAM", "REGISTRO NÚMERO PATRIMÔNIO"],
  'DOACAO_TERCEIROS': ["RECEBIDO NO SEI", "ANÁLISE DO SEFISC", "DEVOLVIDO PARA CORREÇÃO", "DOE", "REGISTRO NO SAM", "REGISTRO NÚMERO PATRIMÔNIO"],
  'INSERVIVEIS': ["RECEBIDO NO SEI", "ANÁLISE DO SEFISC", "DEVOLVIDO PARA CORREÇÃO", "ENCAMINHAMENTO EAMEX", "BAIXA DE NL NO SAM", "REPROVADO / DEVOLVIDO"],
  'FURTOS': ["RECEBIDO NO SEI", "ANÁLISE SEFISC", "DEVOLVIDO PARA CORREÇÃO", "ENCAMINHADO PARA ASURE", "CONCLUÍDO"],
  'BANDEIRAS': ["RECEBIDO", "ANÁLISE SEFISC", "DEVOLVIDO PARA CORREÇÃO", "ENTREGA NO TIRO DE GUERRA", "BAIXA NO SAM"],
};

export function PatrimonioProcessos() {
  const [processes, setProcesses] = useState<PatrimonioProcess[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportTargetSchool, setExportTargetSchool] = useState('');

  const [showItensPdfModal, setShowItensPdfModal] = useState(false);
  const [itensPdfSei, setItensPdfSei] = useState('');
  const [itensPdfLoading, setItensPdfLoading] = useState(false);
  const [itensPdfError, setItensPdfError] = useState<string | null>(null);

  const [userRole, setUserRole] = useState('');
  const [userSchoolId, setUserSchoolId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const dashboardRef = useRef<HTMLDivElement>(null);

  const [activeMainTab, setActiveMainTab] = useState<'doacao' | 'furtos' | 'inserviveis' | 'bandeiras'>('doacao');
  const [activeSubTab, setActiveSubTab] = useState<'pendente' | 'concluido'>('pendente');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState<PatrimonioProcess | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sinistroItems, setSinistroItems] = useState<PatrimonioItem[]>([]);

  // Itens a incorporar (planilha, via edge function patrimonio-atendimento) ligados a
  // um processo de "Doação de Material Permanente" — carregados só quando o modal abre
  // para um processo desse tipo. Um processo atende vários itens.
  const [incVinculados, setIncVinculados] = useState<ItemIncorporar[]>([]);
  const [incPendentesEscola, setIncPendentesEscola] = useState<ItemIncorporar[]>([]);
  const [incLoading, setIncLoading] = useState(false);
  const [incSaving, setIncSaving] = useState(false);
  const [incSelecionados, setIncSelecionados] = useState<string[]>([]);
  // Processos da página de Furtos (tabela processos_furtos) — fonte dos
  // sinistros; exibidos e atualizáveis aqui pelo FurtoProcessoModal.
  const [furtos, setFurtos] = useState<ProcessoFurto[]>([]);
  const [editingFurto, setEditingFurto] = useState<ProcessoFurto | null>(null);
  // Código BEC por descrição normalizada (chaveBec) + rascunho em edição.
  const [becMap, setBecMap] = useState<Record<string, string>>({});
  const [becDrafts, setBecDrafts] = useState<Record<string, string>>({});
  const [becSaving, setBecSaving] = useState<string | null>(null);
  // Rascunho da chapa (ou intervalo) por item a incorporar.
  const [chapaDrafts, setChapaDrafts] = useState<Record<string, { ini: string; fim: string }>>({});
  const [chapaSaving, setChapaSaving] = useState<string | null>(null);
  const [pdfProcessoLoading, setPdfProcessoLoading] = useState<string | null>(null);
  const [nfMap, setNfMap] = useState<Record<string, string>>({});
  const [nfDrafts, setNfDrafts] = useState<Record<string, string>>({});
  const [nfSaving, setNfSaving] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    school_id: '',
    type: 'DOACAO_MAT_PERMANENTE',
    sei_number: '',
    process_date: new Date().toISOString().split('T')[0],
    current_step: '',
    status: 'RECEBIDO',
    occurrence_date: '',
    bulletin_number: '',
    is_nl_low: false,
    authorship: 'Não conhecida',
    conclusion: 'EM ANDAMENTO',
    subtype: 'Furto',
    doe_date: '',
    correcao_motivo: ''
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!editingProcess && formData.type) {
      const defaultStep = WORKFLOWS[formData.type][0];
      setFormData(prev => ({ ...prev, current_step: defaultStep }));
    }
  }, [formData.type, editingProcess]);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let role = '';
      let schoolId = null;

      if (user) {
        const { data: profile } = await (supabase as any).from('profiles').select('role, school_id').eq('id', user.id).single();
        role = resolveViewRole(profile?.role || '');
        schoolId = profile?.school_id || null;
        setUserRole(role);
        setUserSchoolId(schoolId);
      }

      const { data: schoolsData } = await (supabase as any).from('schools').select('id, name').order('name');
      setSchools(schoolsData || []);

      await fetchProcesses(role, schoolId);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }

  async function fetchProcesses(role?: string, sId?: string | null) {
    const activeRole = role || userRole;
    const activeSchoolId = sId !== undefined ? sId : userSchoolId;

    let query = (supabase as any).from('asset_processes').select('*, schools(name)');

    if (activeRole === 'school_manager' && activeSchoolId) {
      query = query.eq('school_id', activeSchoolId);
    }

    let furtosQuery = (supabase as any).from('processos_furtos').select(FURTO_SELECT);
    if (activeRole === 'school_manager' && activeSchoolId) {
      furtosQuery = furtosQuery.eq('escola_id', activeSchoolId);
    }

    const [{ data, error }, { data: furtosData, error: furtosError }] = await Promise.all([
      query.order('process_date', { ascending: false }),
      furtosQuery.order('data_ocorrencia', { ascending: false }),
    ]);
    if (!error) setProcesses(data || []);
    if (furtosError) console.error('Erro ao carregar processos de furtos:', furtosError);
    else setFurtos(furtosData || []);
  }

  // Chama a edge function patrimonio-atendimento e desembrulha a mensagem de erro
  // real (que a supabase-js esconde num FunctionsHttpError genérico).
  async function invokePatrimonio(action: string, payload: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke('patrimonio-atendimento', {
      body: { action, ...payload },
    });
    if (error) {
      let message = error.message;
      const context = (error as { context?: { clone: () => { json: () => Promise<{ error?: string }> } } }).context;
      if (context && typeof context.clone === 'function') {
        try {
          const b = await context.clone().json();
          if (b?.error) message = b.error;
        } catch { /* corpo não é JSON */ }
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function carregarIncorporacoesDoProcesso(proc: PatrimonioProcess) {
    setIncLoading(true);
    setIncSelecionados([]);
    setBecDrafts({});
    setChapaDrafts({});
    setNfDrafts({});
    carregarNotasFiscais().then(setNfMap).catch(e => console.error('Erro ao carregar notas fiscais:', e));
    carregarCodigosBec().then(setBecMap).catch(e => console.error('Erro ao carregar códigos BEC:', e));
    try {
      const data = await invokePatrimonio('listar_incorporacoes');
      const lista: ItemIncorporar[] = Array.isArray(data) ? data : [];
      const porDescricao = (a: ItemIncorporar, b: ItemIncorporar) =>
        a.descricao.localeCompare(b.descricao, 'pt-BR', { sensitivity: 'base' });
      setIncVinculados(lista.filter(i => i.processo_incorporacao_id === proc.id).sort(porDescricao));
      setIncPendentesEscola(lista.filter(i =>
        i.escola_id === proc.school_id && !i.processo_incorporacao_id && i.status !== 'Incorporado').sort(porDescricao));
    } catch (e) {
      console.error('Erro ao carregar itens a incorporar do processo:', e);
      setIncVinculados([]);
      setIncPendentesEscola([]);
    } finally {
      setIncLoading(false);
    }
  }

  async function salvarCodigoBec(descricao: string) {
    const chave = chaveBec(descricao);
    const rascunho = becDrafts[chave];
    if (rascunho === undefined) return;
    const codigo = rascunho.trim();
    if (codigo === (becMap[chave] || '')) {
      setBecDrafts(d => { const n = { ...d }; delete n[chave]; return n; });
      return;
    }
    setBecSaving(chave);
    try {
      if (codigo) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await (supabase as any).from('patrimonio_codigos_bec').upsert({
          descricao_chave: chave, descricao: descricao.trim(), codigo_bec: codigo,
          updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
        });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('patrimonio_codigos_bec').delete().eq('descricao_chave', chave);
        if (error) throw error;
      }
      setBecMap(m => {
        const n = { ...m };
        if (codigo) n[chave] = codigo; else delete n[chave];
        return n;
      });
      setBecDrafts(d => { const n = { ...d }; delete n[chave]; return n; });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar o código BEC.');
    } finally {
      setBecSaving(null);
    }
  }

  async function salvarNotaFiscal(itemId: string) {
    const rascunho = nfDrafts[itemId];
    if (rascunho === undefined) return;
    const numero = rascunho.trim();
    if (numero === (nfMap[itemId] || '')) {
      setNfDrafts(d => { const n = { ...d }; delete n[itemId]; return n; });
      return;
    }
    setNfSaving(itemId);
    try {
      if (numero) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await (supabase as any).from('patrimonio_itens_nota_fiscal').upsert({
          item_id: itemId, numero_nota_fiscal: numero,
          updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
        });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('patrimonio_itens_nota_fiscal').delete().eq('item_id', itemId);
        if (error) throw error;
      }
      setNfMap(m => {
        const n = { ...m };
        if (numero) n[itemId] = numero; else delete n[itemId];
        return n;
      });
      setNfDrafts(d => { const n = { ...d }; delete n[itemId]; return n; });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar o nº da nota fiscal.');
    } finally {
      setNfSaving(null);
    }
  }

  function chapaDraftDe(i: ItemIncorporar) {
    if (chapaDrafts[i.id]) return chapaDrafts[i.id];
    const lista = separarChapas(i.numero_patrimonial);
    return { ini: lista[0] || '', fim: lista.length > 1 ? lista[lista.length - 1] : '' };
  }

  function alterarChapaInicial(i: ItemIncorporar, ini: string) {
    const qtd = parseInt(i.quantidade, 10) || 1;
    const atual = chapaDraftDe(i);
    // Preenche a final automaticamente (inicial + qtd - 1) enquanto ela não
    // foi digitada à mão — ou seja, enquanto ainda é a sugestão anterior.
    const sugestaoAnterior = expandirIntervaloChapas(atual.ini, atual.fim);
    const finalEraSugestao = !atual.fim || (Array.isArray(sugestaoAnterior) && sugestaoAnterior.length === qtd);
    let fim = atual.fim;
    if (qtd > 1 && finalEraSugestao) {
      fim = /^\d+$/.test(ini.trim())
        ? String(Number(ini.trim()) + qtd - 1).padStart(ini.trim().length, '0')
        : '';
    }
    setChapaDrafts(d => ({ ...d, [i.id]: { ini, fim } }));
  }

  async function salvarChapas(i: ItemIncorporar) {
    const qtd = parseInt(i.quantidade, 10) || 1;
    const { ini, fim } = chapaDraftDe(i);
    if (!ini.trim()) { alert('Informe o nº patrimonial (chapa).'); return; }

    let numeros: string[];
    if (qtd > 1) {
      const r = expandirIntervaloChapas(ini, fim || ini);
      if (typeof r === 'string') { alert(r); return; }
      if (r.length !== qtd) {
        alert(`O intervalo ${ini.trim()} a ${(fim || ini).trim()} tem ${r.length} chapa(s), mas o item tem quantidade ${qtd}.`);
        return;
      }
      numeros = r;
    } else {
      numeros = [ini.trim()];
    }

    setChapaSaving(i.id);
    try {
      await invokePatrimonio('marcar_incorporado', { id: i.id, numero_patrimonial: numeros.join(', ') });
      setChapaDrafts(d => { const n = { ...d }; delete n[i.id]; return n; });
      if (editingProcess) await carregarIncorporacoesDoProcesso(editingProcess);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar o nº patrimonial.');
    } finally {
      setChapaSaving(null);
    }
  }

  async function vincularIncorporacoes(ids: string[], processoId: string, sei: string) {
    if (ids.length === 0) return;
    setIncSaving(true);
    try {
      await invokePatrimonio('vincular_incorporacao_processo', {
        ids, processo_id: processoId, processo_sei: sei,
      });
      if (editingProcess) await carregarIncorporacoesDoProcesso(editingProcess);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao vincular itens ao processo.');
    } finally {
      setIncSaving(false);
    }
  }

  // PDF completo de um processo de Doação de Material Permanente, para entregar
  // à escola ao final: dados do processo, etapas do fluxo, itens incorporados
  // (código BEC, chapas, valores) e campo de recebimento.
  async function gerarPdfProcessoDoacao(proc: PatrimonioProcess) {
    setPdfProcessoLoading(proc.id);
    try {
      const [data, codigosBec, notasFiscais] = await Promise.all([
        invokePatrimonio('listar_incorporacoes'),
        carregarCodigosBec().catch(() => ({} as Record<string, string>)),
        carregarNotasFiscais().catch(() => ({} as Record<string, string>)),
      ]);
      const lista: ItemIncorporar[] = Array.isArray(data) ? data : [];
      const itens = lista
        .filter(i => i.processo_incorporacao_id === proc.id)
        .sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR', { sensitivity: 'base' }));

      const doc = new jsPDF('portrait');
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 14;
      const dataBr = (d?: string | null) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '-';
      const moeda = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
      let y = 36;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59);
      doc.text('PROCESSO DE DOAÇÃO DE MATERIAL PERMANENTE', pageW / 2, y, { align: 'center' });
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text('Relatório de incorporação patrimonial', pageW / 2, y, { align: 'center' });
      y += 6;

      autoTable(doc, {
        startY: y,
        theme: 'grid',
        body: [
          ['Unidade Escolar', proc.schools?.name || 'Não informada'],
          ['Nº do Processo SEI', proc.sei_number],
          ['Data do Processo', dataBr(proc.process_date)],
          ['Publicação no DOE', dataBr(proc.doe_date)],
          ['Etapa Atual', proc.current_step || '-'],
          ['Status', statusLabel(proc.status)],
        ],
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 0: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 50 } },
        margin: { left: margin, right: margin, top: 36, bottom: 30 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      // Etapas do fluxo
      const fluxo = WORKFLOWS[proc.type] || [];
      const idxAtual = fluxo.indexOf(proc.current_step);
      const concluido = proc.status === 'CONCLUÍDO';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text('Etapas do Fluxo', margin, y);
      y += 2;
      autoTable(doc, {
        startY: y,
        theme: 'grid',
        head: [['#', 'Etapa', 'Situação']],
        body: fluxo.map((etapa, idx) => [
          String(idx + 1),
          etapa,
          concluido || idx < idxAtual ? 'Concluída' : idx === idxAtual ? 'Em andamento' : 'Pendente',
        ]),
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8.5, cellPadding: 2.2 },
        columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 35 } },
        margin: { left: margin, right: margin, top: 36, bottom: 30 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      // Itens incorporados
      let totalUnidades = 0;
      let valorTotal = 0;
      const linhasItens = itens.map(i => {
        const qtd = parseInt(i.quantidade, 10) || 0;
        const unit = Number(i.valor_item) || 0;
        totalUnidades += qtd;
        valorTotal += qtd * unit;
        return [
          i.descricao,
          codigosBec[chaveBec(i.descricao)] || '-',
          notasFiscais[i.id] || '-',
          resumirChapas(i.numero_patrimonial) || 'Não informado',
          String(i.quantidade || '-'),
          unit ? moeda(unit) : '-',
          unit && qtd ? moeda(unit * qtd) : '-',
        ];
      });

      if (y > pageH - 60) { doc.addPage(); y = 36; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text('Itens Incorporados', margin, y);
      y += 2;
      autoTable(doc, {
        startY: y,
        theme: 'grid',
        head: [['Descrição', 'Código BEC', 'Nº NF', 'Nº Patrimonial (chapas)', 'Qtd', 'Valor Unit.', 'Valor Total']],
        body: linhasItens.length ? linhasItens : [['Nenhum item vinculado a este processo.', '', '', '', '', '', '']],
        foot: linhasItens.length ? [['Total', '', '', '', String(totalUnidades), '', moeda(valorTotal)]] : undefined,
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2.2 },
        columnStyles: {
          1: { cellWidth: 20 },
          2: { cellWidth: 20 },
          3: { cellWidth: 32 },
          4: { cellWidth: 11, halign: 'center' },
          5: { cellWidth: 22, halign: 'right' },
          6: { cellWidth: 24, halign: 'right' },
        },
        margin: { left: margin, right: margin, top: 36, bottom: 30 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      // Recebimento pela escola
      if (y > pageH - 70) { doc.addPage(); y = 36; }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(60);
      const texto = doc.splitTextToSize(
        `Declaro ter recebido este relatório referente ao processo SEI ${proc.sei_number}, com a relação dos itens incorporados ao patrimônio da unidade escolar, suas notas fiscais e respectivos números patrimoniais.`,
        pageW - margin * 2,
      );
      doc.text(texto, margin, y);
      y += texto.length * 4.5 + 16;
      const larg = (pageW - margin * 2 - 16) / 2;
      doc.setDrawColor(150);
      doc.line(margin, y, margin + larg, y);
      doc.line(margin + larg + 16, y, pageW - margin, y);
      y += 4.5;
      doc.setFontSize(8);
      doc.text('Responsável pela Unidade Escolar (nome e assinatura)', margin + larg / 2, y, { align: 'center' });
      doc.text('Data de recebimento', margin + larg + 16 + larg / 2, y, { align: 'center' });
      y += 10;
      doc.setTextColor(130);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} — SGE-GSU-II`, margin, y);

      addTimbradoAllPages(doc);
      doc.save(`Processo_Doacao_SEI_${proc.sei_number.replace(/[^\w-]+/g, '_')}.pdf`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao gerar o PDF do processo.');
    } finally {
      setPdfProcessoLoading(null);
    }
  }

  async function gerarPdfItensProcesso() {
    const sei = itensPdfSei.trim();
    if (!sei) {
      setItensPdfError('Informe o número do processo SEI.');
      return;
    }

    const proc = processes.find(p => p.sei_number.trim() === sei && p.type === 'DOACAO_MAT_PERMANENTE');
    if (!proc) {
      setItensPdfError('Nenhum processo de Doação de Material Permanente encontrado com esse nº SEI.');
      return;
    }

    setItensPdfError(null);
    setItensPdfLoading(true);
    try {
      const [data, codigosBec, notasFiscais] = await Promise.all([
        invokePatrimonio('listar_incorporacoes'),
        carregarCodigosBec().catch(() => ({} as Record<string, string>)),
        carregarNotasFiscais().catch(() => ({} as Record<string, string>)),
      ]);
      const lista: ItemIncorporar[] = Array.isArray(data) ? data : [];
      const itens = lista
        .filter(i => i.processo_incorporacao_id === proc.id)
        .sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR', { sensitivity: 'base' }));

      if (itens.length === 0) {
        setItensPdfError('Nenhum item vinculado a este processo.');
        return;
      }

      const doc = new jsPDF('portrait');
      const margin = 14;
      let currentY = 36;

      doc.setFontSize(14);
      doc.setTextColor(79, 70, 229);
      doc.text('Itens Vinculados ao Processo — Doação de Material Permanente', margin, currentY);

      currentY += 8;
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Nº SEI: ${proc.sei_number}`, margin, currentY);
      currentY += 6;
      doc.text(`Unidade Escolar: ${proc.schools?.name || 'Não informada'}`, margin, currentY);
      currentY += 6;
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, margin, currentY);
      currentY += 10;

      const tableData = itens.map(i => [
        i.orgao_entrega ? `${i.origem_aquisicao} (${i.orgao_entrega})` : (i.origem_aquisicao || '-'),
        i.descricao,
        codigosBec[chaveBec(i.descricao)] || '-',
        notasFiscais[i.id] || '-',
        resumirChapas(i.numero_patrimonial) || '-',
        i.quantidade,
        i.data_aquisicao ? new Date(i.data_aquisicao + 'T12:00:00').toLocaleDateString('pt-BR') : '-',
        formatarMoeda(i.valor_item) || '-',
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Origem', 'Descrição', 'Código BEC', 'Nº NF', 'Nº Patrimonial', 'Qtd', 'Data Aquisição', 'Valor Unitário']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 3 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      addTimbradoAllPages(doc);
      doc.save(`Itens_Processo_SEI_${sei.replace(/[^\w-]+/g, '_')}.pdf`);
      setShowItensPdfModal(false);
      setItensPdfSei('');
    } catch (e) {
      setItensPdfError(e instanceof Error ? e.message : 'Erro ao gerar o PDF.');
    } finally {
      setItensPdfLoading(false);
    }
  }

  const isAdmin = userRole === 'regional_admin';
  const isReadOnly = !!editingProcess && !isAdmin;

  // Fila de priorização: processos pendentes ordenados do mais antigo para o
  // mais recente. Ao ser concluído ou devolvido à escola para correção, o
  // processo some da fila; quando a escola responde e o status volta a
  // andamento, ele retorna à posição original (ordem por process_date). Oculta para school_manager por decisão de
  // produto — a fila é uma ferramenta de gestão regional, não da escola.
  const showQueue = userRole !== '' && userRole !== 'school_manager';

  const pendingQueue = useMemo(() => {
    return processes
      .filter(p => p.status !== 'CONCLUÍDO' && p.status !== STATUS_CORRECAO)
      .slice()
      .sort((a, b) => {
        if (a.process_date !== b.process_date) return a.process_date.localeCompare(b.process_date);
        return a.created_at.localeCompare(b.created_at);
      });
  }, [processes]);

  // Devolvidos à escola, do que espera há mais tempo para o mais recente.
  const aguardandoEscola = useMemo(() => {
    return processes
      .filter(p => p.status === STATUS_CORRECAO)
      .slice()
      .sort((a, b) => (a.correcao_em || a.created_at).localeCompare(b.correcao_em || b.created_at));
  }, [processes]);

  // Uma fila por tipo de processo (cada tipo é atendido em sua própria ordem
  // de antiguidade). Tipos sem processo pendente não aparecem.
  const queuesByType = useMemo(() => {
    return PROCESS_TYPES
      .map(type => ({ type, items: pendingQueue.filter(p => p.type === type.id) }))
      .filter(q => q.items.length > 0);
  }, [pendingQueue]);

  // Furtos concluídos aguardando a baixa no SAM Patrimônio, do que foi
  // concluído há mais tempo para o mais recente.
  const filaBaixaSam = useMemo(() => {
    const ref = (f: ProcessoFurto) => f.data_conclusao || f.updated_at || f.created_at || '';
    return furtos.filter(furtoPendenteBaixaSam).slice().sort((a, b) => ref(a).localeCompare(ref(b)));
  }, [furtos]);

  const filaBaixaSamPosicao = useMemo(() => {
    const map = new Map<string, number>();
    filaBaixaSam.forEach((f, idx) => map.set(f.id, idx + 1));
    return map;
  }, [filaBaixaSam]);

  // Posição do processo dentro da fila do seu tipo.
  const queuePositionMap = useMemo(() => {
    const map = new Map<string, number>();
    queuesByType.forEach(q => q.items.forEach((p, idx) => map.set(p.id, idx + 1)));
    return map;
  }, [queuesByType]);

  // Furtos da página de Furtos no formato de processo, só para indicadores,
  // gráficos e relatório (contam como Sinistros).
  const furtosComoProcessos = useMemo<PatrimonioProcess[]>(() => furtos.map(f => ({
    id: `furto:${f.id}`,
    school_id: f.escola_id,
    type: 'FURTOS',
    sei_number: f.numero_sei,
    process_date: f.data_ocorrencia || (f.created_at || '').slice(0, 10),
    current_step: f.situacao || '',
    status: f.situacao === 'Concluído' ? 'CONCLUÍDO' : 'EM APURAÇÃO',
    subtype: f.tipo_ocorrencia || undefined,
    created_at: f.created_at || '',
    schools: f.schools ? { name: f.schools.name } : undefined,
  })), [furtos]);

  const activeProcesses = useMemo(() => {
    const todos = [...processes, ...furtosComoProcessos];
    if (isExporting && exportTargetSchool !== '') {
      return todos.filter(p => p.school_id === exportTargetSchool);
    }
    return todos;
  }, [processes, furtosComoProcessos, isExporting, exportTargetSchool]);

  const dashboardMetrics = useMemo(() => {
    const total = activeProcesses.length;
    const concluidos = activeProcesses.filter(p => p.status === 'CONCLUÍDO').length;
    const aguardandoEscola = activeProcesses.filter(p => p.status === STATUS_CORRECAO).length;
    const pendentes = total - concluidos - aguardandoEscola;
    const taxaConclusao = total > 0 ? Math.round((concluidos / total) * 100) : 0;

    const chartData = PROCESS_TYPES.map(type => {
      const typeProcesses = activeProcesses.filter(p => p.type === type.id);
      let xAxisName = type.label;
      if (type.id === 'FURTOS') xAxisName = 'Sinistros';

      return {
        name: xAxisName,
        Total: typeProcesses.length,
        Concluídos: typeProcesses.filter(p => p.status === 'CONCLUÍDO').length,
        Pendentes: typeProcesses.filter(p => p.status !== 'CONCLUÍDO' && p.status !== STATUS_CORRECAO).length,
        'Aguardando Escola': typeProcesses.filter(p => p.status === STATUS_CORRECAO).length,
      };
    });

    const schoolCounts: Record<string, { name: string, Processos: number }> = {};
    activeProcesses.forEach(p => {
      const fullName = p.schools?.name || 'Não informada';
      if (!schoolCounts[fullName]) schoolCounts[fullName] = { name: fullName, Processos: 0 };
      schoolCounts[fullName].Processos += 1;
    });

    const schoolRankingData = Object.values(schoolCounts)
      .sort((a, b) => b.Processos - a.Processos)
      .slice(0, 10);

    return { total, concluidos, pendentes, aguardandoEscola, taxaConclusao, chartData, schoolRankingData };
  }, [activeProcesses]);

  useEffect(() => {
    if (!isExporting) return;

    const generatePDF = async () => {
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        const doc = new jsPDF('landscape');
        const pdfWidth = doc.internal.pageSize.getWidth();
        const margin = 14;
        let currentY = 36;

        doc.setFontSize(14);
        doc.setTextColor(79, 70, 229);
        doc.text('Relatório de Processos de Patrimônio — SGE-GSU-II', margin, currentY);

        currentY += 8;
        doc.setFontSize(10);
        doc.setTextColor(100);

        const schoolName = exportTargetSchool
          ? schools.find(s => s.id === exportTargetSchool)?.name
          : 'Todas as Unidades Escolares';

        doc.text(`Filtro Aplicado: ${schoolName}`, margin, currentY);
        currentY += 6;
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, margin, currentY);
        currentY += 6;
        doc.text(`Total: ${dashboardMetrics.total} processos | Concluídos: ${dashboardMetrics.concluidos} | Em Andamento: ${dashboardMetrics.pendentes} | Aguardando Escola: ${dashboardMetrics.aguardandoEscola} | Taxa de Conclusão: ${dashboardMetrics.taxaConclusao}%`, margin, currentY);

        currentY += 10;

        if (dashboardRef.current) {
          const canvas = await html2canvas(dashboardRef.current, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
          });
          const imgData = canvas.toDataURL('image/png');

          let printWidth = pdfWidth - (margin * 2);
          let printHeight = (canvas.height * printWidth) / canvas.width;

          const maxAvailableHeight = doc.internal.pageSize.getHeight() - currentY - margin;
          if (printHeight > maxAvailableHeight) {
            const ratio = maxAvailableHeight / printHeight;
            printHeight = maxAvailableHeight;
            printWidth = printWidth * ratio;
          }

          const xOffset = (pdfWidth - printWidth) / 2;
          doc.addImage(imgData, 'PNG', xOffset, currentY, printWidth, printHeight);
          currentY += printHeight + 10;
        }

        if (currentY > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          currentY = margin;
        }

        const tableData = activeProcesses.map(p => [
          p.sei_number,
          p.schools?.name || 'Não informada',
          PROCESS_TYPES.find(t => t.id === p.type)?.label || p.type,
          statusLabel(p.status),
          new Date(p.process_date + 'T12:00:00').toLocaleDateString('pt-BR'),
          p.current_step
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [['Nº SEI', 'Unidade Escolar', 'Tipo de Fluxo', 'Status', 'Data', 'Etapa Atual']],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 3 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });

        addTimbradoAllPages(doc);
        doc.save(`Relatorio_Patrimonio_${new Date().toISOString().split('T')[0]}.pdf`);
      } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        alert("Ocorreu um erro ao gerar o relatório.");
      } finally {
        setIsExporting(false);
        setShowExportModal(false);
      }
    };

    generatePDF();
  }, [isExporting, activeProcesses, exportTargetSchool, schools]);

  const filteredProcesses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return processes.filter(p => {
      // Busca ativa: procura em TODAS as categorias e status. Achar um Nº SEI
      // específico não pode depender de qual aba está aberta nem de o processo
      // estar concluído. O casamento por dígitos ignora diferença de pontuação/
      // espaço entre o que foi digitado e o que está gravado.
      if (q) {
        const sei = (p.sei_number || '').toLowerCase();
        const seiDigits = sei.replace(/\D/g, '');
        return sei.includes(q)
          || (qDigits.length >= 4 && seiDigits.includes(qDigits))
          || (p.schools?.name || '').toLowerCase().includes(q);
      }
      const typeInfo = PROCESS_TYPES.find(t => t.id === p.type);
      const matchesMainTab = typeInfo?.category === activeMainTab;
      const isConcluido = p.status === 'CONCLUÍDO';
      const matchesSubTab = activeSubTab === 'concluido' ? isConcluido : !isConcluido;
      return matchesMainTab && matchesSubTab;
    });
  }, [processes, searchTerm, activeMainTab, activeSubTab]);

  const filteredFurtos = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return furtos.filter(f => {
      if (q) {
        const sei = (f.numero_sei || '').toLowerCase();
        return sei.includes(q)
          || (qDigits.length >= 4 && sei.replace(/\D/g, '').includes(qDigits))
          || (f.schools?.name || '').toLowerCase().includes(q);
      }
      if (activeMainTab !== 'furtos') return false;
      const concluido = f.situacao === 'Concluído';
      return activeSubTab === 'concluido' ? concluido : !concluido;
    });
  }, [furtos, searchTerm, activeMainTab, activeSubTab]);

  const totalSinistroValue = useMemo(() => {
    return sinistroItems.reduce((acc, curr) => acc + (curr.unit_value || 0), 0);
  }, [sinistroItems]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (editingProcess && !isAdmin) {
      setFormError("Apenas usuários com perfil Regional podem atualizar processos.");
      return;
    }

    if (!editingProcess && formData.type === 'FURTOS') {
      setFormError('Novos sinistros (furtos/roubos) devem ser lançados na página de Furtos — eles aparecem aqui automaticamente.');
      return;
    }

    const emCorrecao = formData.status === STATUS_CORRECAO;
    if (emCorrecao && !formData.correcao_motivo.trim()) {
      setFormError('Informe o que a escola precisa corrigir antes de devolver o processo.');
      return;
    }

    setSaveLoading(true);
    setFormError(null);

    // correcao_em marca o início da devolução atual: mantém a data original se
    // o processo já estava em correção e zera quando a escola responde.
    const jaEstavaEmCorrecao = editingProcess?.status === STATUS_CORRECAO;
    const payload = {
      ...formData,
      occurrence_date: formData.occurrence_date ? formData.occurrence_date : null,
      doe_date: formData.doe_date ? formData.doe_date : null,
      items_json: formData.type === 'FURTOS' ? JSON.stringify(sinistroItems) : null,
      correcao_motivo: emCorrecao ? formData.correcao_motivo.trim() : null,
      correcao_em: emCorrecao
        ? (jaEstavaEmCorrecao && editingProcess?.correcao_em ? editingProcess.correcao_em : new Date().toISOString())
        : null
    };

    try {
      const { data: existingProcess } = await (supabase as any)
        .from('asset_processes')
        .select('id, sei_number')
        .eq('sei_number', formData.sei_number.trim())
        .maybeSingle();

      if (existingProcess && (!editingProcess || existingProcess.id !== editingProcess.id)) {
        throw new Error(`Este número de processo SEI (${formData.sei_number}) já se encontra registrado no sistema.`);
      }

      if (editingProcess) {
        const { error } = await (supabase as any).from('asset_processes').update(payload).eq('id', editingProcess.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('asset_processes').insert([payload]);
        if (error) throw error;
      }
      setIsModalOpen(false);
      fetchProcesses();
    } catch (error: any) {
      setFormError(error.message);
    } finally { setSaveLoading(false); }
  }

  async function handleDelete(id: string) {
    if (!isAdmin) {
      alert("Sem permissão para excluir.");
      return;
    }
    if (!confirm("Remover este processo?")) return;
    const proc = processes.find(p => p.id === id);
    await (supabase as any).from('asset_processes').delete().eq('id', id);
    // Sem FK entre a planilha de itens a incorporar e o Postgres: ao excluir um
    // processo de doação, limpa o vínculo dos itens que apontavam pra ele.
    if (proc?.type === 'DOACAO_MAT_PERMANENTE') {
      try {
        await invokePatrimonio('vincular_incorporacao_processo', { clear_processo_id: id });
      } catch (e) {
        console.error('Falha ao limpar vínculos do processo excluído:', e);
      }
    }
    fetchProcesses();
  }

  function openModal(process: PatrimonioProcess | null = null) {
    setFormError(null);
    if (process) {
      setEditingProcess(process);
      setFormData({
        school_id: process.school_id,
        type: process.type,
        sei_number: process.sei_number,
        process_date: process.process_date,
        current_step: process.current_step,
        status: process.status,
        occurrence_date: process.occurrence_date || '',
        bulletin_number: process.bulletin_number || '',
        is_nl_low: process.is_nl_low || false,
        authorship: process.authorship || 'Não conhecida',
        conclusion: process.conclusion || 'EM ANDAMENTO',
        subtype: process.subtype || 'Furto',
        doe_date: process.doe_date || '',
        correcao_motivo: process.correcao_motivo || ''
      });
      setSinistroItems(process.items_json ? JSON.parse(process.items_json) : []);
      setIncVinculados([]);
      setIncPendentesEscola([]);
      setIncSelecionados([]);
      if (process.type === 'DOACAO_MAT_PERMANENTE') carregarIncorporacoesDoProcesso(process);
    } else {
      setEditingProcess(null);
      setIncVinculados([]);
      setIncPendentesEscola([]);
      setIncSelecionados([]);
      setFormData({
        school_id: isAdmin ? '' : (userSchoolId || ''),
        type: 'DOACAO_MAT_PERMANENTE',
        sei_number: '',
        process_date: new Date().toISOString().split('T')[0],
        current_step: WORKFLOWS['DOACAO_MAT_PERMANENTE'][0],
        status: 'RECEBIDO',
        occurrence_date: '',
        bulletin_number: '',
        is_nl_low: false,
        authorship: 'Não conhecida',
        conclusion: 'EM ANDAMENTO',
        subtype: 'Furto',
        doe_date: '',
        correcao_motivo: ''
      });
      setSinistroItems([]);
    }
    setIsModalOpen(true);
  }

  const addSinistroItem = () => {
    setSinistroItems([...sinistroItems, { name: '', asset_number: '', unit_value: 0 }]);
  };

  const removeSinistroItem = (index: number) => {
    setSinistroItems(sinistroItems.filter((_, i) => i !== index));
  };

  const updateSinistroItem = (index: number, field: keyof PatrimonioItem, value: any) => {
    const newItems = [...sinistroItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setSinistroItems(newItems);
  };

  const mainTabs = [
    { id: 'doacao', label: 'Doação', icon: <Gift size={15}/>, activeClass: 'bg-emerald-600 text-white shadow-md shadow-emerald-200' },
    { id: 'furtos', label: 'Sinistros', icon: <ShieldAlert size={15}/>, activeClass: 'bg-red-600 text-white shadow-md shadow-red-200' },
    { id: 'inserviveis', label: 'Inservíveis', icon: <Trash2 size={15}/>, activeClass: 'bg-amber-500 text-white shadow-md shadow-amber-200' },
    { id: 'bandeiras', label: 'Bandeiras', icon: <Flag size={15}/>, activeClass: 'bg-blue-600 text-white shadow-md shadow-blue-200' }
  ] as const;

  const catColorMap = {
    doacao: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-500', icon: 'text-emerald-600' },
    furtos: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', bar: 'bg-red-500', icon: 'text-red-600' },
    inserviveis: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', bar: 'bg-amber-500', icon: 'text-amber-600' },
    bandeiras: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', bar: 'bg-blue-500', icon: 'text-blue-600' },
  };

  return (
    <div className="min-h-screen bg-slate-50/80 pb-16">

      {/* ── PAGE HEADER ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200/80 shadow-sm mb-6">
        <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
              <Package size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight tracking-tight">Processos de Patrimônio</h1>
              <p className="text-xs text-slate-400 font-medium">Monitoramento e Fluxo Regional — SGE-GSU-II</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowExportModal(true)}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-60 shadow-sm active:scale-[0.98]"
            >
              {isExporting ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
              {isExporting ? 'Gerando PDF...' : 'Exportar PDF'}
            </button>
            {isAdmin && (
              <button
                onClick={() => { setItensPdfError(null); setItensPdfSei(''); setShowItensPdfModal(true); }}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm active:scale-[0.98]"
              >
                <ClipboardList size={15} /> Itens por Processo SEI
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => openModal()}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 active:scale-[0.98]"
              >
                <Plus size={15} /> Novo Processo
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 space-y-6">

        <DefesoEleitoralBanner />

        {/* ── FILA DE PRIORIZAÇÃO ──────────────────────────────── */}
        {showQueue && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <ListOrdered size={17} className="text-indigo-500" />
              <h3 className="text-sm font-bold text-slate-800">Fila de Atendimento por Antiguidade</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Uma fila para cada tipo de processo, ordenada do mais antigo para o mais recente. Ao ser concluído, o processo sai da fila automaticamente.
            </p>

            {queuesByType.length === 0 && filaBaixaSam.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Nenhum processo pendente. Fila vazia.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filaBaixaSam.length > 0 && (
                  <div className="rounded-xl border border-slate-100 bg-white">
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-100">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide truncate" title="Furtos concluídos na página de Furtos, aguardando o registro da baixa no SAM Patrimônio">
                        Fila de Sinistros — Baixa no SAM
                      </h4>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 text-red-600 bg-red-50">
                        {filaBaixaSam.length} pendente{filaBaixaSam.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto p-2">
                      {filaBaixaSam.map((f, idx) => {
                        const dias = diasDesde(f.data_conclusao || f.updated_at);
                        const isNext = idx === 0;
                        return (
                          <div
                            key={f.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border ${isNext ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'}`}
                          >
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs ${isNext ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                              {idx + 1}º
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-700 truncate max-w-[10rem]">{f.schools?.name}</span>
                                <span className="text-xs text-slate-400 font-mono">SEI {f.numero_sei}</span>
                                {isNext && (
                                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
                                    Próximo
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {f.tipo_ocorrencia} · {(Number(f.valor_total) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}{dias !== null ? ` · concluído há ${dias} dia${dias !== 1 ? 's' : ''}` : ''}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditingFurto(f)}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all shrink-0"
                              title={isAdmin ? 'Editar / atualizar processo' : 'Visualizar processo'}
                            >
                              {isAdmin ? <Edit size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {queuesByType.map(({ type, items }) => (
                  <div key={type.id} className="rounded-xl border border-slate-100 bg-white">
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-100">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide truncate">
                        Fila de {type.label}{type.id === 'FURTOS' ? ' (lançamentos antigos)' : ''}
                      </h4>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${type.color}`}>
                        {items.length} pendente{items.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto p-2">
                      {items.map((p, idx) => {
                        const daysWaiting = Math.max(0, Math.floor((Date.now() - new Date(p.process_date + 'T00:00:00').getTime()) / 86400000));
                        const isNext = idx === 0;
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border ${isNext ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-100'}`}
                          >
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs ${isNext ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                              {idx + 1}º
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-700 truncate max-w-[10rem]">{p.schools?.name}</span>
                                <span className="text-xs text-slate-400 font-mono">SEI {p.sei_number}</span>
                                {isNext && (
                                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
                                    Próximo
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {p.type === 'FURTOS' ? `${p.subtype} · ` : ''}aguardando há {daysWaiting} dia{daysWaiting !== 1 ? 's' : ''}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => openModal(p)}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all shrink-0"
                              title={isAdmin ? 'Editar / atualizar processo' : 'Visualizar processo'}
                            >
                              {isAdmin ? <Edit size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {aguardandoEscola.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                  <Undo2 size={15} className="text-red-500" />
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Fora da fila — aguardando resposta da escola ({aguardandoEscola.length})
                  </h4>
                </div>
                <p className="text-[11px] text-slate-400 mb-3">
                  Processos devolvidos para correção. Ao mudar o status de volta para andamento, o processo retorna à sua posição original na fila.
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {aguardandoEscola.map(p => {
                    const typeInfo = PROCESS_TYPES.find(t => t.id === p.type);
                    const dias = diasDesde(p.correcao_em);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => openModal(p)}
                        className="w-full text-left flex items-start gap-3 p-3 rounded-xl border bg-red-50/60 border-red-100 hover:border-red-200 transition-all"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-700 truncate max-w-[10rem]">{p.schools?.name}</span>
                            <span className="text-xs text-slate-400 font-mono">SEI {p.sei_number}</span>
                            <span className="text-[11px] text-slate-400">{p.type === 'FURTOS' ? p.subtype : typeInfo?.label}</span>
                          </div>
                          {p.correcao_motivo && (
                            <p className="text-[11px] text-red-700 mt-0.5 line-clamp-2">{p.correcao_motivo}</p>
                          )}
                        </div>
                        <span className="text-[11px] font-bold text-red-600 bg-white border border-red-200 px-2 py-1 rounded-lg shrink-0">
                          {dias === null ? 'sem data' : `há ${dias} dia${dias !== 1 ? 's' : ''}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Para a escola: o que a Regional devolveu e precisa ser corrigido. */}
        {userRole === 'school_manager' && aguardandoEscola.length > 0 && (
          <div className="bg-red-50 rounded-2xl border border-red-200 p-5">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={17} className="text-red-600" />
              <h3 className="text-sm font-bold text-red-800">
                {aguardandoEscola.length === 1 ? '1 processo devolvido' : `${aguardandoEscola.length} processos devolvidos`} pela Regional para correção
              </h3>
            </div>
            <p className="text-xs text-red-700/80 mb-3">
              Faça as correções indicadas abaixo no SEI e avise a Regional para que o processo volte à fila de atendimento.
            </p>
            <div className="space-y-2">
              {aguardandoEscola.map(p => {
                const dias = diasDesde(p.correcao_em);
                return (
                  <div key={p.id} className="bg-white rounded-xl border border-red-100 p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-700 font-mono">SEI {p.sei_number}</span>
                      {dias !== null && <span className="text-[11px] text-slate-400">devolvido há {dias} dia{dias !== 1 ? 's' : ''}</span>}
                    </div>
                    <p className="text-xs text-slate-600 mt-1 whitespace-pre-line">{p.correcao_motivo || 'Motivo não informado — consulte a Regional.'}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── DASHBOARD (capturado para PDF) ────────────────────── */}
        <div ref={dashboardRef} className="space-y-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                <ClipboardList size={22} className="text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-0.5">Total de Processos</p>
                <p className="text-3xl font-bold text-indigo-700 tabular-nums">{dashboardMetrics.total}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-indigo-300">100%</p>
                <div className="w-14 h-1.5 bg-indigo-100 rounded-full mt-1.5">
                  <div className="h-full w-full bg-indigo-500 rounded-full" />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl border border-emerald-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle size={22} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-0.5">Concluídos</p>
                <p className="text-3xl font-bold text-emerald-600 tabular-nums">{dashboardMetrics.concluidos}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-emerald-400">{dashboardMetrics.taxaConclusao}%</p>
                <div className="w-14 h-1.5 bg-emerald-100 rounded-full mt-1.5">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${dashboardMetrics.taxaConclusao}%` }} />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-white rounded-2xl border border-amber-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <History size={22} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-0.5">Em Andamento</p>
                <p className="text-3xl font-bold text-amber-600 tabular-nums">{dashboardMetrics.pendentes}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-amber-400">
                  {dashboardMetrics.total > 0 ? Math.round((dashboardMetrics.pendentes / dashboardMetrics.total) * 100) : 0}%
                </p>
                <div className="w-14 h-1.5 bg-amber-100 rounded-full mt-1.5">
                  <div className="h-full bg-amber-500 rounded-full transition-all duration-700" style={{ width: `${dashboardMetrics.total > 0 ? (dashboardMetrics.pendentes / dashboardMetrics.total) * 100 : 0}%` }} />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-red-50 to-white rounded-2xl border border-red-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Undo2 size={22} className="text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-0.5">Aguardando Escola</p>
                <p className="text-3xl font-bold text-red-600 tabular-nums">{dashboardMetrics.aguardandoEscola}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-red-400">
                  {dashboardMetrics.total > 0 ? Math.round((dashboardMetrics.aguardandoEscola / dashboardMetrics.total) * 100) : 0}%
                </p>
                <div className="w-14 h-1.5 bg-red-100 rounded-full mt-1.5">
                  <div className="h-full bg-red-500 rounded-full transition-all duration-700" style={{ width: `${dashboardMetrics.total > 0 ? (dashboardMetrics.aguardandoEscola / dashboardMetrics.total) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart2 size={17} className="text-indigo-500" />
                  <h3 className="text-sm font-bold text-slate-700">Distribuição por Tipo</h3>
                </div>
                <span className="text-xs text-slate-400 font-medium bg-white px-2.5 py-1 rounded-lg border border-slate-100">Por categoria</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboardMetrics.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} />
                    <RechartsTooltip
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '12px', fontWeight: 600, fontSize: '11px' }} />
                    <Bar dataKey="Pendentes" stackId="a" fill="#fbbf24" radius={[0, 0, 4, 4]} maxBarSize={44} isAnimationActive={!isExporting} />
                    <Bar dataKey="Aguardando Escola" stackId="a" fill="#f87171" maxBarSize={44} isAnimationActive={!isExporting} />
                    <Bar dataKey="Concluídos" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={!isExporting} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp size={17} className="text-blue-500" />
                  <h3 className="text-sm font-bold text-slate-700">Processos por Unidade Escolar</h3>
                </div>
                <span className="text-xs text-slate-400 font-medium bg-white px-2.5 py-1 rounded-lg border border-slate-100">Top 10</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboardMetrics.schoolRankingData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 9, fontWeight: 600 }} width={190} />
                    <RechartsTooltip
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', fontSize: '12px' }}
                    />
                    <Bar dataKey="Processos" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={!isExporting} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* ── FILTERS & TABS ────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 flex flex-col lg:flex-row gap-3 items-start lg:items-center">
          <div className="flex flex-wrap gap-1.5 flex-1">
            {mainTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveMainTab(tab.id); setActiveSubTab('pendente'); }}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeMainTab === tab.id
                    ? tab.activeClass
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={() => setActiveSubTab('pendente')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeSubTab === 'pendente'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              Não Concluídos
            </button>
            <button
              onClick={() => setActiveSubTab('concluido')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeSubTab === 'concluido'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              Concluídos
            </button>
          </div>
        </div>

        {/* ── SEARCH ────────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Pesquisar por Nº SEI ou Unidade Escolar..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm font-medium text-slate-700 outline-none transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {searchTerm.trim() && (
          <p className="text-xs text-slate-400 -mt-3 px-1">
            Busca em <strong>todas as categorias e status</strong> — {filteredProcesses.length} resultado(s).
          </p>
        )}

        {/* ── PROCESS LIST ──────────────────────────────────────── */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 className="animate-spin text-indigo-500" size={36} />
            <p className="text-sm font-medium text-slate-400">Consultando fluxos...</p>
          </div>
        ) : filteredProcesses.length === 0 && filteredFurtos.length === 0 ? (
          <div className="py-20 bg-white rounded-2xl border-2 border-dashed border-slate-200 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 bg-slate-100 text-slate-300 rounded-2xl flex items-center justify-center">
              <ClipboardList size={28} />
            </div>
            <p className="text-sm font-semibold text-slate-400">
              {searchTerm.trim()
                ? `Nenhum processo encontrado para "${searchTerm.trim()}".`
                : `Nenhum processo ${activeSubTab === 'concluido' ? 'concluído' : 'pendente'} nesta categoria.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProcesses.map((p) => {
              const typeInfo = PROCESS_TYPES.find(t => t.id === p.type);
              const workflow = WORKFLOWS[p.type] || [];
              const stepIndex = workflow.indexOf(p.current_step) + 1;
              const progress = (stepIndex / workflow.length) * 100;
              const isCompleted = p.status === 'CONCLUÍDO';
              const catColor = isCompleted
                ? { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-500', icon: 'text-emerald-600' }
                : catColorMap[typeInfo?.category as keyof typeof catColorMap] || catColorMap.doacao;

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all group overflow-hidden"
                >
                  <div className={`h-0.5 w-full ${isCompleted ? 'bg-emerald-500' : catColor.bar}`} />
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Icon */}
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${catColor.bg}`}>
                      {p.type === 'FURTOS'
                        ? <ShieldAlert size={20} className={catColor.icon} />
                        : p.type === 'BANDEIRAS'
                        ? <Flag size={20} className={catColor.icon} />
                        : p.type.includes('DOACAO')
                        ? <Gift size={20} className={catColor.icon} />
                        : <Package size={20} className={catColor.icon} />}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg truncate max-w-xs">
                          {p.schools?.name}
                        </span>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${catColor.bg} ${catColor.text} ${catColor.border}`}>
                          {p.type === 'FURTOS' ? p.subtype : typeInfo?.label}
                        </span>
                        {p.type === 'FURTOS' && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 border border-slate-200 px-2 py-0.5 rounded-full" title="Sinistro lançado nesta página antes do vínculo com a página de Furtos">
                            Lançamento antigo
                          </span>
                        )}
                        <span className="text-xs text-slate-400 flex items-center gap-1 ml-auto sm:ml-0">
                          <Calendar size={12} className="text-indigo-400" />
                          {new Date(p.process_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </span>
                      </div>

                      <p className="text-base font-bold text-slate-800 font-mono tracking-tight">SEI {p.sei_number}</p>

                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 truncate">
                            <History size={12} className="text-indigo-400 shrink-0" />
                            <span className="truncate">{p.current_step}</span>
                          </p>
                          <span className="text-xs font-semibold text-slate-400 ml-2 shrink-0">{Math.round(progress)}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-700 rounded-full ${isCompleted ? 'bg-emerald-500' : catColor.bar}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {p.status === STATUS_CORRECAO && (
                        <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100">
                          <Undo2 size={13} className="text-red-500 mt-0.5 shrink-0" />
                          <p className="text-xs text-red-700">
                            <strong>Devolvido à escola{correcaoHa(p.correcao_em)}:</strong>{' '}
                            {p.correcao_motivo || 'motivo não informado.'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Status + Actions */}
                    <div className="flex items-center gap-3 sm:shrink-0">
                      {showQueue && !isCompleted && queuePositionMap.has(p.id) && (
                        <span
                          className="px-2.5 py-1.5 rounded-lg font-bold text-xs bg-slate-900 text-white shrink-0"
                          title={`Posição na fila de ${typeInfo?.label || 'atendimento'} (por antiguidade)`}
                        >
                          {queuePositionMap.get(p.id)}º na fila
                        </span>
                      )}
                      <span className={`px-3 py-1.5 rounded-lg font-semibold text-xs border ${
                        isCompleted ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        p.status === 'CORREÇÃO' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }`}>
                        {statusLabel(p.status)}
                      </span>

                      <div className="flex gap-1">
                        {p.type === 'DOACAO_MAT_PERMANENTE' && isCompleted && (
                          <button
                            onClick={() => gerarPdfProcessoDoacao(p)}
                            disabled={pdfProcessoLoading === p.id}
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all disabled:opacity-50"
                            title="Gerar PDF do processo para entregar à escola"
                          >
                            {pdfProcessoLoading === p.id ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                          </button>
                        )}
                        <button
                          onClick={() => openModal(p)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title={isAdmin ? 'Editar Processo' : 'Visualizar Processo'}
                        >
                          {isAdmin ? <Edit size={16} /> : <Eye size={16} />}
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Excluir Processo"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredFurtos.map(f => {
              const concluido = f.situacao === 'Concluído';
              const posicao = filaBaixaSamPosicao.get(f.id);
              const baixa = !(Number(f.valor_total) > 0) || !concluido
                ? null
                : furtoTemNl(f)
                ? { label: `NL ${f.nl_baixa}`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                : f.numero_baixa_sam
                ? { label: 'NL pendente no SEAFIN', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
                : { label: 'Baixa SAM pendente', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
              return (
                <div key={`furto-${f.id}`} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-red-100 transition-all overflow-hidden">
                  <div className={`h-0.5 w-full ${concluido ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${concluido ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <ShieldAlert size={20} className={concluido ? 'text-emerald-600' : 'text-red-600'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg truncate max-w-xs">
                          {f.schools?.name}
                        </span>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg border bg-red-50 text-red-700 border-red-200">
                          {f.tipo_ocorrencia || 'Sinistro'}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 border border-slate-200 px-2 py-0.5 rounded-full" title="Processo cadastrado na página de Furtos">
                          Página de Furtos
                        </span>
                        {f.data_ocorrencia && (
                          <span className="text-xs text-slate-400 flex items-center gap-1 ml-auto sm:ml-0">
                            <Calendar size={12} className="text-indigo-400" />
                            {new Date(f.data_ocorrencia + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                      <p className="text-base font-bold text-slate-800 font-mono tracking-tight">SEI {f.numero_sei}</p>
                      <p className="text-xs text-slate-500 mt-1.5">
                        {f.status || 'NÃO INSTAURADO'} · prejuízo {(Number(f.valor_total) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        {f.numero_bo ? ` · B.O. ${f.numero_bo}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                      {showQueue && posicao && (
                        <span className="px-2.5 py-1.5 rounded-lg font-bold text-xs bg-slate-900 text-white shrink-0" title="Posição na fila de baixa no SAM">
                          {posicao}º na fila
                        </span>
                      )}
                      {baixa && (
                        <span className={`px-3 py-1.5 rounded-lg font-semibold text-xs border ${baixa.cls}`}>{baixa.label}</span>
                      )}
                      <span className={`px-3 py-1.5 rounded-lg font-semibold text-xs border ${
                        concluido ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : f.situacao === 'Em Apuração' ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {(f.situacao || 'Em Análise').toUpperCase()}
                      </span>
                      <button
                        onClick={() => setEditingFurto(f)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title={isAdmin ? 'Editar Processo' : 'Visualizar Processo'}
                      >
                        {isAdmin ? <Edit size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── INFO PANEL ────────────────────────────────────────── */}
        <div className="bg-slate-900 rounded-2xl p-6 text-white">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-white/10 rounded-xl shrink-0">
              <Info size={18} className="text-indigo-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wide mb-1.5">Normatização Técnica GSU II</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                Processos de <strong className="text-emerald-400">Doação</strong> dependem da publicação em Diário Oficial (DOE) para validação legal.
                Em <strong className="text-red-400">Sinistros</strong>, o valor total calculado deve coincidir com os registros contábeis para baixa patrimonial via SAM.
                O status <strong className="text-amber-400">Inservíveis</strong> exige laudo técnico da Regional antes do encaminhamento ao EAMEX.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── EXPORT MODAL ──────────────────────────────────────────── */}
      {showExportModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200">
                  <FileDown size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Exportar Relatório em PDF</h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Inclui gráficos e métricas completas</p>
                </div>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 size={13} /> Filtrar por Unidade Escolar
                </label>
                <select
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                  value={exportTargetSchool}
                  onChange={(e) => setExportTargetSchool(e.target.value)}
                >
                  <option value="">Todas as Unidades Escolares</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="bg-indigo-50 rounded-xl p-3 flex items-start gap-2.5 border border-indigo-100">
                <Info size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                  O PDF incluirá os gráficos de distribuição e ranking por escola, métricas de resumo e a tabela completa de processos.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => setIsExporting(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-[0.98]"
              >
                <Download size={15} /> Gerar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ITENS POR PROCESSO SEI (PDF) MODAL ────────────────────── */}
      {showItensPdfModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200">
                  <ClipboardList size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Itens do Processo (PDF)</h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Doação de Material Permanente</p>
                </div>
              </div>
              <button
                onClick={() => setShowItensPdfModal(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={13} /> Nº do Processo SEI
                </label>
                <input
                  type="text"
                  autoFocus
                  value={itensPdfSei}
                  onChange={(e) => { setItensPdfSei(e.target.value); setItensPdfError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !itensPdfLoading) gerarPdfItensProcesso(); }}
                  placeholder="Ex: 1234567/2026"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                />
              </div>

              <div className="bg-indigo-50 rounded-xl p-3 flex items-start gap-2.5 border border-indigo-100">
                <Info size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                  Gera um PDF com todos os itens vinculados a este processo: Origem, Descrição, Qtd, Data de Aquisição e Valor Unitário.
                </p>
              </div>

              {itensPdfError && (
                <div className="bg-red-50 rounded-xl p-3 flex items-start gap-2.5 border border-red-100">
                  <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 font-medium leading-relaxed">{itensPdfError}</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setShowItensPdfModal(false)}
                className="px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => gerarPdfItensProcesso()}
                disabled={itensPdfLoading}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {itensPdfLoading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {itensPdfLoading ? 'Gerando PDF...' : 'Gerar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PROCESS MODAL ─────────────────────────────────────────── */}
      {editingFurto && (
        <FurtoProcessoModal
          furto={editingFurto}
          readOnly={!isAdmin}
          onClose={() => setEditingFurto(null)}
          onSaved={f => {
            setFurtos(prev => prev.map(x => x.id === f.id ? f : x));
            setEditingFurto(null);
          }}
        />
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[95vh] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden border border-slate-100">

            {/* Modal header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200">
                  <Package size={17} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">
                    {editingProcess ? (isReadOnly ? 'Visualizar Processo' : 'Atualizar Processo') : 'Novo Processo de Patrimônio'}
                  </h2>
                  <p className="text-xs text-indigo-500 font-semibold mt-0.5">Detalhamento Patrimonial Regional II</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-6 space-y-7 overflow-y-auto flex-1">

                {formError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2">
                    <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={17} />
                    <div>
                      <h4 className="text-sm font-bold text-red-800">Impossível Salvar</h4>
                      <p className="text-xs text-red-600 font-medium mt-0.5">{formError}</p>
                    </div>
                  </div>
                )}

                {/* Basic info fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 size={12} /> Unidade Escolar
                    </label>
                    <select required disabled={!isAdmin} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 disabled:opacity-50 transition-all" value={formData.school_id} onChange={e => setFormData({ ...formData, school_id: e.target.value })}>
                      <option value="">Selecione a Unidade...</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <ClipboardList size={12} /> Tipo de Fluxo
                    </label>
                    <select required disabled={isReadOnly} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 disabled:opacity-50 transition-all" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                      {PROCESS_TYPES.filter(t => editingProcess || !TIPOS_SEM_NOVO_LANCAMENTO.includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText size={12} /> Nº Processo SEI
                    </label>
                    <input required disabled={isReadOnly} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-semibold text-indigo-600 focus:border-indigo-400 outline-none disabled:opacity-50 transition-all" placeholder="000.000.000/0000-00" value={formData.sei_number} onChange={e => setFormData({ ...formData, sei_number: e.target.value })} />
                  </div>
                </div>

                {/* FURTOS specific section */}
                {formData.type === 'FURTOS' && (
                  <div className="space-y-6 animate-in slide-in-from-top-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-5 bg-red-50 border border-red-100 rounded-2xl">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-red-400 uppercase tracking-wider">Tipo de Ocorrência</label>
                        <select disabled={isReadOnly} className="w-full p-3 bg-white border border-red-100 rounded-xl text-sm font-medium outline-none disabled:opacity-50" value={formData.subtype} onChange={e => setFormData({ ...formData, subtype: e.target.value })}>
                          <option value="Furto">Furto</option><option value="Roubo">Roubo</option><option value="Extravio">Extravio</option><option value="Incêndio">Incêndio</option><option value="Vandalismo">Vandalismo</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-red-400 uppercase tracking-wider">Data Ocorrência</label>
                        <input disabled={isReadOnly} type="date" className="w-full p-3 bg-white border border-red-100 rounded-xl text-sm font-medium outline-none disabled:opacity-50" value={formData.occurrence_date} onChange={e => setFormData({ ...formData, occurrence_date: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-red-400 uppercase tracking-wider">Nº Boletim (B.O.)</label>
                        <input disabled={isReadOnly} placeholder="B.O. 00000/2026" className="w-full p-3 bg-white border border-red-100 rounded-xl text-sm font-medium outline-none disabled:opacity-50" value={formData.bulletin_number} onChange={e => setFormData({ ...formData, bulletin_number: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-red-400 uppercase tracking-wider">Autoria Conhecida?</label>
                        <select disabled={isReadOnly} className="w-full p-3 bg-white border border-red-100 rounded-xl text-sm font-medium outline-none disabled:opacity-50" value={formData.authorship} onChange={e => setFormData({ ...formData, authorship: e.target.value })}>
                          <option value="Não conhecida">Não conhecida</option><option value="Conhecida">Conhecida</option>
                        </select>
                      </div>
                    </div>

                    {/* Items table */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <ListPlus size={16} className="text-red-500" /> Relação de Itens
                        </h3>
                        {!isReadOnly && (
                          <button type="button" onClick={addSinistroItem} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-slate-900 text-white rounded-xl hover:bg-black transition-all">
                            <Plus size={13} /> Adicionar Item
                          </button>
                        )}
                      </div>

                      <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-100">
                              <tr>
                                <th className="p-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Equipamento / Material</th>
                                <th className="p-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">Nº Patrimônio</th>
                                <th className="p-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">Valor (R$)</th>
                                <th className="p-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Ação</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {sinistroItems.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="p-2.5">
                                    <input required disabled={isReadOnly} placeholder="Descreva o item..." className="w-full p-2.5 bg-slate-50 border border-transparent rounded-lg text-xs font-medium outline-none focus:border-red-300 focus:bg-white disabled:opacity-50 transition-all" value={item.name} onChange={e => updateSinistroItem(idx, 'name', e.target.value)} />
                                  </td>
                                  <td className="p-2.5">
                                    <input required disabled={isReadOnly} placeholder="000.000" className="w-full p-2.5 bg-slate-50 border border-transparent rounded-lg font-mono text-center text-xs font-medium outline-none focus:border-red-300 focus:bg-white disabled:opacity-50 transition-all" value={item.asset_number} onChange={e => updateSinistroItem(idx, 'asset_number', e.target.value)} />
                                  </td>
                                  <td className="p-2.5">
                                    <div className="relative">
                                      <DollarSign size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                      <input disabled={isReadOnly} type="number" step="0.01" className="w-full p-2.5 pl-7 bg-slate-50 border border-transparent rounded-lg text-center text-xs font-semibold outline-none focus:border-red-300 focus:bg-white disabled:opacity-50 transition-all" value={item.unit_value || ''} onChange={e => updateSinistroItem(idx, 'unit_value', Number(e.target.value))} />
                                    </div>
                                  </td>
                                  <td className="p-2.5 text-right">
                                    {!isReadOnly && (
                                      <button type="button" onClick={() => removeSinistroItem(idx)} className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                          <div className="flex items-center gap-2 text-white/40 text-xs font-bold uppercase tracking-wider">
                            <Calculator size={15} /> Total do Prejuízo:
                          </div>
                          <span className="text-xl font-bold text-red-400 tabular-nums">
                            R$ {totalSinistroValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Conclusion fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle size={12} /> Conclusão Técnica
                        </label>
                        <select disabled={isReadOnly} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 disabled:opacity-50 transition-all" value={formData.conclusion} onChange={e => setFormData({ ...formData, conclusion: e.target.value })}>
                          <option value="EM ANDAMENTO">EM ANDAMENTO (APURAÇÃO)</option>
                          <option value="ENCERRADO COMO CONCLUIDO PELA RESPONSÁBILIDADE">ENCERRADO PELA RESPONSABILIDADE</option>
                          <option value="ENCERRADO COMO CONCLUIDO PELA NÃO RESPONSÁBILIDADE">ENCERRADO PELA NÃO RESPONSABILIDADE</option>
                          <option value="NÃO INSTAURADO">NÃO INSTAURADO</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <ShieldAlert size={12} /> NL de Baixa Patrimonial
                        </label>
                        <select disabled={isReadOnly} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 disabled:opacity-50 transition-all" value={formData.is_nl_low ? 'Sim' : 'Não'} onChange={e => setFormData({ ...formData, is_nl_low: e.target.value === 'Sim' })}>
                          <option value="Não">Não (Pendente de Registro no SAM)</option>
                          <option value="Sim">Sim (Baixa Efetivada)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Itens a incorporar atendidos por este processo (só Doação de Material Permanente) */}
                {editingProcess && formData.type === 'DOACAO_MAT_PERMANENTE' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-5 bg-indigo-600 rounded-full" />
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Itens a Incorporar Atendidos</h3>
                    </div>
                    <p className="text-xs text-slate-400">
                      Um processo pode atender vários itens. Itens da escola que não estiverem vinculados a nenhum processo aparecem como pendência de documentação em <strong>Atendimento Patrimônio › Itens a Incorporar</strong>.
                    </p>

                    {incLoading ? (
                      <div className="flex justify-center py-6"><Loader2 className="animate-spin text-indigo-500" size={22} /></div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {incVinculados.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">Nenhum item vinculado a este processo ainda.</p>
                          ) : incVinculados.map(i => {
                            const chave = chaveBec(i.descricao);
                            const codigoBec = becDrafts[chave] ?? becMap[chave] ?? '';
                            return (
                            <div key={i.id} className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 space-y-2.5">
                            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
                              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-700 truncate">{i.descricao}</p>
                                <p className="text-[11px] text-slate-400">Qtd {i.quantidade}{formatarMoeda(i.valor_item) ? ` · ${formatarMoeda(i.valor_item)}/un` : ''} · {i.status}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0" title="Itens com o mesmo nome compartilham o código BEC">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">BEC</label>
                                {isAdmin ? (
                                  <input
                                    type="text"
                                    placeholder="Código"
                                    value={codigoBec}
                                    disabled={becSaving === chave}
                                    onChange={e => setBecDrafts(d => ({ ...d, [chave]: e.target.value }))}
                                    onBlur={() => salvarCodigoBec(i.descricao)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                                    className={`w-28 px-2 py-1 text-xs font-mono bg-white border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 disabled:opacity-60 ${codigoBec ? 'border-slate-200' : 'border-amber-300'}`}
                                  />
                                ) : (
                                  <span className={`text-xs font-mono ${codigoBec ? 'text-slate-700' : 'text-slate-400 italic'}`}>{codigoBec || 'não informado'}</span>
                                )}
                                {becSaving === chave && <Loader2 size={12} className="animate-spin text-indigo-500" />}
                              </div>
                              {isAdmin && (
                                <button
                                  type="button"
                                  disabled={incSaving}
                                  onClick={() => vincularIncorporacoes([i.id], '', '')}
                                  className="text-[11px] font-semibold text-red-600 hover:underline disabled:opacity-50 shrink-0"
                                >
                                  desvincular
                                </button>
                              )}
                            </div>
                            {(() => {
                              const qtd = parseInt(i.quantidade, 10) || 1;
                              const draft = chapaDraftDe(i);
                              const salvo = resumirChapas(i.numero_patrimonial);
                              const alterado = !!chapaDrafts[i.id];
                              const inputCls = 'w-28 px-2 py-1 text-xs font-mono bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 disabled:opacity-60';
                              if (!isAdmin) {
                                return (
                                  <p className="text-[11px] text-slate-500 pl-7">
                                    <span className="font-bold uppercase tracking-wide text-slate-500">Nº NF:</span>{' '}
                                    {nfMap[i.id] ? <span className="font-mono text-slate-700">{nfMap[i.id]}</span> : <span className="italic text-slate-400">não informado</span>}
                                    {' · '}
                                    <span className="font-bold uppercase tracking-wide text-slate-500">Nº patrimonial:</span>{' '}
                                    {salvo ? <span className="font-mono text-slate-700">{salvo}</span> : <span className="italic text-slate-400">não informado</span>}
                                  </p>
                                );
                              }
                              return (
                                <div className="flex flex-wrap items-center gap-2 pl-7">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Nº NF</span>
                                  <input
                                    type="text"
                                    placeholder="Nota fiscal"
                                    value={nfDrafts[i.id] ?? nfMap[i.id] ?? ''}
                                    disabled={nfSaving === i.id}
                                    onChange={e => setNfDrafts(d => ({ ...d, [i.id]: e.target.value }))}
                                    onBlur={() => salvarNotaFiscal(i.id)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                                    className={`${inputCls} ${(nfDrafts[i.id] ?? nfMap[i.id]) ? '' : '!border-amber-300'}`}
                                  />
                                  {nfSaving === i.id && <Loader2 size={12} className="animate-spin text-indigo-500" />}
                                  <span className="w-px h-4 bg-emerald-200 mx-1" />
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                                    {qtd > 1 ? `Chapas (${qtd} un.)` : 'Nº patrimonial'}
                                  </span>
                                  <input
                                    type="text"
                                    placeholder={qtd > 1 ? 'Inicial' : 'Chapa'}
                                    value={draft.ini}
                                    disabled={chapaSaving === i.id}
                                    onChange={e => alterarChapaInicial(i, e.target.value)}
                                    className={inputCls}
                                  />
                                  {qtd > 1 && (
                                    <>
                                      <span className="text-xs text-slate-400">a</span>
                                      <input
                                        type="text"
                                        placeholder="Final"
                                        value={draft.fim}
                                        disabled={chapaSaving === i.id}
                                        onChange={e => setChapaDrafts(d => ({ ...d, [i.id]: { ini: draft.ini, fim: e.target.value } }))}
                                        className={inputCls}
                                      />
                                    </>
                                  )}
                                  {alterado && (
                                    <button
                                      type="button"
                                      disabled={chapaSaving === i.id}
                                      onClick={() => salvarChapas(i)}
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                      {chapaSaving === i.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                      Salvar
                                    </button>
                                  )}
                                  {!alterado && salvo && (
                                    <span className="text-[11px] text-emerald-700 font-semibold">✓ {salvo}</span>
                                  )}
                                </div>
                              );
                            })()}
                            </div>
                            );
                          })}
                        </div>
                        {incVinculados.length > 0 && (
                          <p className="text-[11px] text-slate-400">
                            O código BEC é gravado pelo nome do item: ao informá-lo aqui, ele vale para todos os itens com o mesmo nome, em qualquer processo. Ao salvar o nº patrimonial, o item é marcado como Incorporado; para várias unidades, informe a chapa inicial e a final (preenchida automaticamente pela quantidade).
                          </p>
                        )}

                        {isAdmin && incPendentesEscola.length > 0 && (
                          <div className="border border-slate-100 rounded-xl p-3 bg-slate-50 space-y-2">
                            <p className="text-xs font-semibold text-slate-500">Itens pendentes desta escola sem processo</p>
                            {incPendentesEscola.map(i => (
                              <label key={i.id} className="flex items-center gap-2.5 text-xs text-slate-600 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={incSelecionados.includes(i.id)}
                                  onChange={() => setIncSelecionados(s => s.includes(i.id) ? s.filter(x => x !== i.id) : [...s, i.id])}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="truncate">
                                  {i.descricao} <span className="text-slate-400">(qtd {i.quantidade}{formatarMoeda(i.valor_item) ? ` · ${formatarMoeda(i.valor_item)}/un` : ''})</span>
                                </span>
                              </label>
                            ))}
                            <button
                              type="button"
                              disabled={incSelecionados.length === 0 || incSaving}
                              onClick={() => vincularIncorporacoes(incSelecionados, editingProcess.id, editingProcess.sei_number)}
                              className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-indigo-600 text-white rounded-lg disabled:opacity-50 hover:bg-indigo-700 transition-all"
                            >
                              {incSaving ? <Loader2 size={13} className="animate-spin" /> : <Package size={13} />}
                              Vincular a este processo{incSelecionados.length > 0 ? ` (${incSelecionados.length})` : ''}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Workflow steps */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-5 bg-indigo-600 rounded-full" />
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Etapa no Fluxograma</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {WORKFLOWS[formData.type].map((step, idx) => {
                      const active = formData.current_step === step;
                      const past = WORKFLOWS[formData.type].indexOf(formData.current_step) > idx;
                      return (
                        <button
                          key={step}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => setFormData({ ...formData, current_step: step })}
                          className={`p-4 rounded-xl border-2 text-left flex flex-col justify-between h-20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:hover:scale-100 ${
                            active
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200'
                              : past
                              ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
                              : 'bg-slate-50 border-slate-100 text-slate-400 opacity-60'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-xl font-bold opacity-30">{idx + 1}</span>
                            {past && !active && <CheckCircle2 size={14} className="text-indigo-400" />}
                            {active && <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
                          </div>
                          <span className="text-[10px] font-bold uppercase leading-tight tracking-wide">{step}</span>
                        </button>
                      );
                    })}
                  </div>

                  {formData.type === 'DOACAO_MAT_PERMANENTE' &&
                    WORKFLOWS[formData.type].indexOf(formData.current_step) >= WORKFLOWS[formData.type].indexOf('DESPACHO DO COORDENADOR GERAL - DIRIGENTE') && (
                    <div className="space-y-1.5 p-4 bg-indigo-50 border border-indigo-100 rounded-xl max-w-xs">
                      <label className="text-xs font-semibold text-indigo-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar size={12} /> Data de Publicação no DOE
                      </label>
                      <input
                        disabled={isReadOnly}
                        type="date"
                        className="w-full p-3 bg-white border border-indigo-200 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 disabled:opacity-50 transition-all"
                        value={formData.doe_date}
                        onChange={e => setFormData({ ...formData, doe_date: e.target.value })}
                      />
                    </div>
                  )}
                </div>

                {/* Final status */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <LayoutGrid size={12} /> Status Final
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {['RECEBIDO', 'EM APURAÇÃO', 'CONCLUÍDO', STATUS_CORRECAO].map(s => (
                      <button
                        key={s}
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setFormData({ ...formData, status: s })}
                        className={`p-3 rounded-xl text-xs font-semibold uppercase tracking-wider border-2 transition-all disabled:cursor-not-allowed ${
                          formData.status === s
                            ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {statusLabel(s)}
                      </button>
                    ))}
                  </div>

                  {formData.status === STATUS_CORRECAO && (
                    <div className="space-y-1.5 p-4 rounded-xl bg-red-50 border border-red-100">
                      <label className="text-xs font-semibold text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Undo2 size={12} /> O que a escola precisa corrigir *
                      </label>
                      <textarea
                        rows={3}
                        disabled={isReadOnly}
                        className="w-full px-3 py-2 bg-white border border-red-200 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-300 disabled:bg-slate-50 disabled:cursor-not-allowed"
                        placeholder="Ex.: falta o termo de doação assinado; nota fiscal ilegível..."
                        value={formData.correcao_motivo}
                        onChange={e => setFormData({ ...formData, correcao_motivo: e.target.value })}
                      />
                      <p className="text-[11px] text-red-600/80">
                        Enquanto estiver devolvido, o processo fica fora da fila por antiguidade e conta como "Aguardando Escola". Quando a escola responder, volte o status para Recebido ou Em Apuração.
                        {editingProcess?.status === STATUS_CORRECAO && editingProcess.correcao_em && (
                          <> Devolvido em {new Date(editingProcess.correcao_em).toLocaleDateString('pt-BR')}.</>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal footer */}
              <div className="p-5 border-t border-slate-100 bg-slate-50/50 shrink-0 flex flex-wrap justify-end gap-3">
                {editingProcess && editingProcess.type === 'DOACAO_MAT_PERMANENTE' && (
                  <button
                    type="button"
                    onClick={() => gerarPdfProcessoDoacao(editingProcess)}
                    disabled={pdfProcessoLoading === editingProcess.id}
                    className="mr-auto inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-xl transition-all disabled:opacity-60"
                    title="Gera o PDF com os dados salvos do processo"
                  >
                    {pdfProcessoLoading === editingProcess.id ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />}
                    PDF do processo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
                >
                  {isReadOnly ? 'Fechar' : 'Cancelar'}
                </button>
                {!isReadOnly && (
                  <button
                    type="submit"
                    disabled={saveLoading}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-60"
                  >
                    {saveLoading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                    {editingProcess ? 'Atualizar Processo' : 'Lançar Processo'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PatrimonioProcessos;
