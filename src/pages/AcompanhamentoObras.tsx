import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchAcompanhamentoCSV, type AcompanhamentoRow } from '../lib/acompanhamentoObras';
import { supabase } from '../lib/supabase';
import { fetchObrasSheet, normalizeStatus, normalizeForMatch, type SheetSchool, type SheetWork } from '../lib/obrasSheet';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { addTimbradoAllPages } from '../lib/pdfTimbrado';
import {
  Loader2, HardHat, Search, X, RefreshCw, ExternalLink, CalendarDays,
  School, Star, AlertTriangle, ImageIcon, TrendingUp, BarChart3, Clock,
  Eye, ChevronLeft, ChevronRight, FileDown, ClipboardList,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';

const VIEW_URL = import.meta.env.VITE_ACOMPANHAMENTO_OBRAS_VIEW_URL as string;

const RATING_COLORS: Record<number, string> = {
  1: '#ef4444', 2: '#f97316', 3: '#f59e0b', 4: '#84cc16', 5: '#10b981',
};

// Extrai o ID do arquivo de um link do Google Drive (aceita tanto
// "drive.google.com/open?id=..." quanto "drive.google.com/file/d/.../view").
function getDriveFileId(url: string): string | null {
  const m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// Converte o link para o formato de pré-visualização embutível do Drive
// (funciona para imagem, PDF e outros tipos que o Drive sabe pré-visualizar).
function getDrivePreviewUrl(url: string): string {
  const id = getDriveFileId(url);
  return id ? `https://drive.google.com/file/d/${id}/preview` : url;
}

function schoolMatches(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export default function AcompanhamentoObras() {
  const [rows, setRows] = useState<AcompanhamentoRow[]>([]);
  const [obrasAtivas, setObrasAtivas] = useState<{ nome: string }[]>([]);
  // Lista completa da planilha de Obras e Reformas (todos os status, não só "Em
  // Andamento") — usada só pelo Relatório Mensal, para o gráfico de situação atual.
  const [todasObras, setTodasObras] = useState<SheetWork[]>([]);
  const [loading, setLoading] = useState(true);
  // Id (mesmo formato usado no row.id, "carimbo-escola") -> se o alerta
  // semanal por e-mail (nota < 4) já foi disparado pra GSU. Alimentado pela
  // Edge Function obras-alerta-semanal (cron de toda segunda-feira).
  const [emailEnviadoPorId, setEmailEnviadoPorId] = useState<Record<string, boolean>>({});

  const [searchTerm, setSearchTerm] = useState('');
  const [onlyAtencao, setOnlyAtencao] = useState(false);
  const [escolaEvolucao, setEscolaEvolucao] = useState('');
  const [visualizacao, setVisualizacao] = useState<{ urls: string[]; index: number } | null>(null);

  // ── Relatório Mensal (PDF) ────────────────────────────────────────────
  const [showRelatorioModal, setShowRelatorioModal] = useState(false);
  const [relatorioMes, setRelatorioMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [gerandoRelatorioPdf, setGerandoRelatorioPdf] = useState(false);
  const relatorioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      // school_manager só pode ver os registros da própria escola — os dados
      // vêm de uma planilha pública sem nenhum controle de acesso embutido,
      // então o filtro precisa ser feito aqui, cruzando o school_id do
      // perfil logado com o nome da escola na planilha (fuzzy match, mesma
      // lógica de schoolMatches usada no restante da tela).
      const { data: { user } } = await supabase.auth.getUser();
      const profilePromise = user
        ? (supabase as any).from('profiles').select('role, school_id').eq('id', user.id).single()
        : Promise.resolve({ data: null });

      const [csvResult, schoolsResult, alertasResult, profileResult] = await Promise.allSettled([
        fetchAcompanhamentoCSV(),
        (supabase as any).from('schools').select('id, name').order('name'),
        (supabase as any).from('obra_avaliacao_alertas').select('id, email_enviado'),
        profilePromise,
      ]);

      const schools: SheetSchool[] = schoolsResult.status === 'fulfilled' ? (schoolsResult.value?.data || []) : [];

      let minhaEscolaNome: string | null = null;
      if (profileResult.status === 'fulfilled') {
        const profile = profileResult.value?.data;
        if (profile?.role === 'school_manager' && profile.school_id) {
          minhaEscolaNome = schools.find(s => s.id === profile.school_id)?.name || null;
        }
      } else {
        console.error('Erro ao buscar perfil do usuário:', profileResult.reason);
      }

      if (csvResult.status === 'fulfilled') {
        const todasAsLinhas = csvResult.value;
        setRows(minhaEscolaNome ? todasAsLinhas.filter(r => schoolMatches(r.escola, minhaEscolaNome!)) : todasAsLinhas);
      } else {
        console.error('Erro ao buscar respostas do formulário:', csvResult.reason);
      }

      if (alertasResult.status === 'fulfilled') {
        const alertas: { id: string; email_enviado: boolean }[] = alertasResult.value?.data || [];
        setEmailEnviadoPorId(Object.fromEntries(alertas.map(a => [a.id, a.email_enviado])));
      } else {
        console.error('Erro ao buscar status de alerta por e-mail:', alertasResult.reason);
      }

      if (schoolsResult.status === 'fulfilled') {
        try {
          const obras = await fetchObrasSheet(schools);
          const emAndamento = obras.filter(o => normalizeStatus(o.status) === 'EM ANDAMENTO');
          const uniqueNames = new Map<string, string>();
          emAndamento.forEach(o => {
            const display = o.matchedSchoolName || o.escola;
            if (minhaEscolaNome && !schoolMatches(display, minhaEscolaNome)) return;
            uniqueNames.set(normalizeForMatch(display), display);
          });
          setObrasAtivas(Array.from(uniqueNames.values()).map(nome => ({ nome })));
          setTodasObras(minhaEscolaNome
            ? obras.filter(o => schoolMatches(o.matchedSchoolName || o.escola, minhaEscolaNome!))
            : obras);
        } catch (e) {
          console.error('Erro ao buscar planilha de obras para cruzamento:', e);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const now = new Date();
  const sevenDaysAgoISO = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];

  const registrosNaSemana = useMemo(
    () => rows.filter(r => r.dataISO && r.dataISO >= sevenDaysAgoISO),
    [rows, sevenDaysAgoISO],
  );

  const escolasAcompanhadas = useMemo(
    () => new Set(rows.map(r => normalizeForMatch(r.escola)).filter(Boolean)).size,
    [rows],
  );

  const avaliacaoMedia = useMemo(() => {
    const validas = rows.filter(r => r.avaliacao !== null);
    if (!validas.length) return null;
    return validas.reduce((s, r) => s + (r.avaliacao || 0), 0) / validas.length;
  }, [rows]);

  const registrosAtencao = useMemo(
    () => rows.filter(r => r.temOcorrencia || (r.avaliacao !== null && r.avaliacao <= 2)),
    [rows],
  );

  // Obras em andamento (planilha de Obras) sem nenhum registro de acompanhamento
  // nos últimos 7 dias — sinaliza que a escola pode não estar respondendo o formulário semanal.
  const obrasSemAtualizacao = useMemo(() => {
    return obrasAtivas
      .map(o => {
        const registrosDaEscola = rows.filter(r => schoolMatches(r.escola, o.nome));
        const ultima = registrosDaEscola.reduce<string | null>((max, r) => {
          if (!r.dataISO) return max;
          return !max || r.dataISO > max ? r.dataISO : max;
        }, null);
        const dias = ultima
          ? Math.floor((now.getTime() - new Date(`${ultima}T00:00:00`).getTime()) / 86400000)
          : null;
        return { nome: o.nome, ultima, dias };
      })
      .filter(o => o.dias === null || o.dias > 7)
      .sort((a, b) => {
        if (a.dias === null && b.dias === null) return a.nome.localeCompare(b.nome);
        if (a.dias === null) return -1;
        if (b.dias === null) return 1;
        return b.dias - a.dias;
      });
  }, [obrasAtivas, rows]);

  const chartByWeek = useMemo(() => {
    const weeks: { label: string; startISO: string; total: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const ref = new Date(now);
      ref.setDate(ref.getDate() - i * 7);
      const day = ref.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(ref);
      monday.setDate(ref.getDate() + diffToMonday);
      const startISO = monday.toISOString().split('T')[0];
      const label = monday.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      weeks.push({ label, startISO, total: 0 });
    }
    rows.forEach(r => {
      if (!r.dataISO) return;
      for (let i = weeks.length - 1; i >= 0; i--) {
        if (r.dataISO >= weeks[i].startISO) {
          weeks[i].total++;
          break;
        }
      }
    });
    return weeks;
  }, [rows]);

  const chartByAvaliacao = useMemo(() => {
    const counts = [1, 2, 3, 4, 5].map(nota => ({
      nota: `Nota ${nota}`,
      total: rows.filter(r => r.avaliacao === nota).length,
      fill: RATING_COLORS[nota],
    }));
    return counts;
  }, [rows]);

  // Limites (segunda a domingo) das últimas 8 semanas, usados na evolução da avaliação.
  const weekBounds = useMemo(() => {
    const weeks: { label: string; startISO: string; endISO: string }[] = [];
    for (let i = 7; i >= 0; i--) {
      const ref = new Date(now);
      ref.setDate(ref.getDate() - i * 7);
      const day = ref.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(ref);
      monday.setDate(ref.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      weeks.push({
        label: monday.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        startISO: monday.toISOString().split('T')[0],
        endISO: sunday.toISOString().split('T')[0],
      });
    }
    return weeks;
  }, [rows]);

  // Nota semanal de cada escola com obra em andamento: média das respostas da semana,
  // ou nota máxima (5) quando a escola não respondeu o formulário naquela semana —
  // entende-se que, sem resposta, não houve ocorrência a relatar.
  const evolucaoPorEscola = useMemo(() => {
    const NOTA_MAXIMA = 5;
    return obrasAtivas.map(o => ({
      nome: o.nome,
      semanas: weekBounds.map(w => {
        const respostas = rows.filter(
          r => schoolMatches(r.escola, o.nome) && r.dataISO >= w.startISO && r.dataISO <= w.endISO && r.avaliacao !== null,
        );
        const valor = respostas.length > 0
          ? respostas.reduce((s, r) => s + (r.avaliacao || 0), 0) / respostas.length
          : NOTA_MAXIMA;
        return { label: w.label, valor };
      }),
    }));
  }, [obrasAtivas, rows, weekBounds]);

  // Dados do gráfico de evolução: média geral da rede, ou de uma escola específica se selecionada.
  const chartEvolucao = useMemo(() => {
    if (escolaEvolucao) {
      const escola = evolucaoPorEscola.find(e => e.nome === escolaEvolucao);
      return escola ? escola.semanas.map(s => ({ label: s.label, media: Math.round(s.valor * 10) / 10 })) : [];
    }
    if (evolucaoPorEscola.length === 0) return [];
    return weekBounds.map((w, i) => {
      const valores = evolucaoPorEscola.map(e => e.semanas[i].valor);
      const media = valores.reduce((a, b) => a + b, 0) / valores.length;
      return { label: w.label, media: Math.round(media * 10) / 10 };
    });
  }, [evolucaoPorEscola, weekBounds, escolaEvolucao]);

  // ── Relatório Mensal ────────────────────────────────────────────────────
  // Situação atual das obras (planilha de Obras e Reformas) — fotografia do
  // momento, não depende do mês escolhido, já que a planilha não guarda data de
  // quando cada obra mudou de status.
  const STATUS_ORDER = ['EM ANDAMENTO', 'CONCLUÍDO', 'PARALISADO', 'OUTRO'] as const;
  const STATUS_LABELS_OBRA: Record<typeof STATUS_ORDER[number], string> = {
    'EM ANDAMENTO': 'Em Andamento', 'CONCLUÍDO': 'Concluído', 'PARALISADO': 'Paralisado', 'OUTRO': 'Outro/Pré-execução',
  };
  const STATUS_COLORS_OBRA: Record<typeof STATUS_ORDER[number], string> = {
    'EM ANDAMENTO': '#3b82f6', 'CONCLUÍDO': '#10b981', 'PARALISADO': '#ef4444', 'OUTRO': '#94a3b8',
  };
  const statusObrasChartData = useMemo(() => STATUS_ORDER.map(s => ({
    name: STATUS_LABELS_OBRA[s],
    quantidade: todasObras.filter(o => normalizeStatus(o.status) === s).length,
    color: STATUS_COLORS_OBRA[s],
  })).filter(d => d.quantidade > 0), [todasObras]);

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

  const mesLabel = (mesStr: string) => {
    const [ano, mesNum] = mesStr.split('-').map(Number);
    if (!ano || !mesNum) return mesStr;
    return new Date(ano, mesNum - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  // Semanas (segunda a domingo) que cobrem o mês escolhido — mesma lógica de
  // weekBounds, mas restrita a um mês específico em vez das últimas 8 semanas.
  const semanasDoMesRelatorio = useMemo(() => {
    const [ano, mesNum] = relatorioMes.split('-').map(Number);
    if (!ano || !mesNum) return [];
    const primeiroDia = new Date(ano, mesNum - 1, 1);
    const ultimoDia = new Date(ano, mesNum, 0);
    const semanas: { label: string; startISO: string; endISO: string }[] = [];
    const cursor = new Date(primeiroDia);
    const diffToMonday = cursor.getDay() === 0 ? -6 : 1 - cursor.getDay();
    cursor.setDate(cursor.getDate() + diffToMonday);
    while (cursor <= ultimoDia) {
      const monday = new Date(cursor);
      const sunday = new Date(cursor);
      sunday.setDate(sunday.getDate() + 6);
      semanas.push({
        label: `${String(monday.getDate()).padStart(2, '0')}/${String(monday.getMonth() + 1).padStart(2, '0')}`,
        startISO: monday.toISOString().split('T')[0],
        endISO: sunday.toISOString().split('T')[0],
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    return semanas;
  }, [relatorioMes]);

  // Evolução semana a semana DENTRO do mês escolhido: registros do formulário e
  // avaliação média — só conta respostas cuja data cai efetivamente no mês (uma
  // semana no limite do mês pode ter dias do mês anterior/seguinte).
  const evolucaoDoMes = useMemo(() => {
    return semanasDoMesRelatorio.map(w => {
      const regs = rows.filter(r => r.dataISO && r.dataISO >= w.startISO && r.dataISO <= w.endISO && r.dataISO.startsWith(relatorioMes));
      const comNota = regs.filter(r => r.avaliacao !== null);
      const media = comNota.length > 0 ? comNota.reduce((s, r) => s + (r.avaliacao || 0), 0) / comNota.length : null;
      return { semana: w.label, Registros: regs.length, Avaliação: media !== null ? Math.round(media * 10) / 10 : null };
    });
  }, [semanasDoMesRelatorio, rows, relatorioMes]);

  const relatorioMetrics = useMemo(() => {
    const registrosDoMes = rows.filter(r => r.dataISO?.startsWith(relatorioMes));
    const ocorrenciasNoMes = registrosDoMes.filter(r => r.temOcorrencia).length;
    const comNota = registrosDoMes.filter(r => r.avaliacao !== null);
    const avaliacaoMediaNoMes = comNota.length > 0
      ? comNota.reduce((s, r) => s + (r.avaliacao || 0), 0) / comNota.length
      : null;
    return {
      registrosNoMes: registrosDoMes.length,
      ocorrenciasNoMes,
      avaliacaoMediaNoMes,
    };
  }, [rows, relatorioMes]);

  // Relatório Mensal em PDF: mesma técnica já usada em Atendimento Patrimônio/
  // Furtos/Chamados (html2canvas do bloco de cards + gráficos Recharts + addImage).
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
      doc.save(`Relatorio_Mensal_Acompanhamento_Obras_${relatorioMes}.pdf`);
      setShowRelatorioModal(false);
    } catch (err) {
      console.error(err);
      alert('Houve um erro ao gerar o PDF. Tente novamente.');
    } finally {
      setGerandoRelatorioPdf(false);
    }
  };

  const filtered = useMemo(() => {
    return rows.filter(r => {
      const q = searchTerm.toLowerCase();
      const matchSearch =
        !searchTerm ||
        r.escola.toLowerCase().includes(q) ||
        r.empresa.toLowerCase().includes(q) ||
        r.fiscal.toLowerCase().includes(q) ||
        r.responsavel.toLowerCase().includes(q);
      const matchAtencao = !onlyAtencao || r.temOcorrencia || (r.avaliacao !== null && r.avaliacao <= 2);
      return matchSearch && matchAtencao;
    });
  }, [rows, searchTerm, onlyAtencao]);

  const formatDate = (iso: string) => {
    if (!iso) return '-';
    const p = iso.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
  };

  const ratingBadge = (nota: number | null) => {
    if (nota === null) return 'bg-slate-50 text-slate-400 border-slate-200';
    if (nota <= 2) return 'bg-red-50 text-red-700 border-red-200';
    if (nota === 3) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  };

  // Nota < 4 dispara o alerta semanal por e-mail pra GSU (toda segunda,
  // via obras-alerta-semanal) — mostra se aquele registro específico já foi
  // notificado ou ainda vai entrar no próximo disparo.
  const emailAlertaBadge = (row: AcompanhamentoRow) => {
    if (row.avaliacao === null || row.avaliacao >= 4) return null;
    const enviado = !!emailEnviadoPorId[row.id];
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${
          enviado ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'
        }`}
      >
        {enviado ? 'E-mail Enviado' : 'E-mail Não Enviado'}
      </span>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <HardHat className="text-orange-500" size={28} />
            Acompanhamento Semanal de Obras
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Respostas do formulário semanal preenchido pelas escolas com obras em andamento
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={fetchAll}
            className="flex items-center gap-2 px-3 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm"
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
          <button
            onClick={() => setShowRelatorioModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-teal-700 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors text-sm font-medium"
          >
            <ClipboardList size={16} />
            Relatório Mensal
          </button>
          {VIEW_URL && (
            <a
              href={VIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-medium"
            >
              <ExternalLink size={16} />
              Abrir Respostas
            </a>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Total de Registros',
            value: rows.length,
            icon: <BarChart3 size={20} className="text-blue-600" />,
            bg: 'bg-blue-50',
          },
          {
            label: 'Registros (7 dias)',
            value: registrosNaSemana.length,
            icon: <CalendarDays size={20} className="text-emerald-600" />,
            bg: 'bg-emerald-50',
          },
          {
            label: 'Escolas Acompanhadas',
            value: escolasAcompanhadas,
            icon: <School size={20} className="text-violet-600" />,
            bg: 'bg-violet-50',
          },
          {
            label: 'Avaliação Média',
            value: avaliacaoMedia !== null ? avaliacaoMedia.toFixed(1) : '-',
            icon: <Star size={20} className="text-amber-600" />,
            bg: 'bg-amber-50',
          },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                {card.icon}
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">{card.label}</p>
                <p className="text-2xl font-bold text-slate-800">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Obras sem atualização recente */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
          <Clock size={16} className="text-red-500" />
          Obras em Andamento sem Atualização Recente
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Cruza a planilha de Obras e Reformas (status "Em Andamento") com as respostas do formulário semanal.
        </p>
        {loading ? (
          <div className="flex justify-center items-center py-10">
            <Loader2 size={24} className="animate-spin text-orange-500" />
          </div>
        ) : obrasSemAtualizacao.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            Todas as obras em andamento têm registro nos últimos 7 dias.
          </p>
        ) : (
          <div className="divide-y divide-slate-50">
            {obrasSemAtualizacao.slice(0, 8).map(o => (
              <div key={o.nome} className="flex items-center justify-between gap-3 py-2.5">
                <p className="text-sm font-medium text-slate-800 truncate">{o.nome}</p>
                <p className="text-xs text-red-500 shrink-0">
                  {o.dias === null ? 'Nunca respondeu' : `${o.dias} dia(s) sem atualização`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-500" />
            Registros por Semana (últimas 8 semanas)
          </h2>
          {loading ? (
            <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartByWeek} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [v, 'Registros']} labelFormatter={l => `Semana de ${l}`} />
                <Bar dataKey="total" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Star size={16} className="text-amber-500" />
            Distribuição da Avaliação do Andamento
          </h2>
          {loading ? (
            <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartByAvaliacao} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="nota" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [v, 'Registros']} />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {chartByAvaliacao.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Evolução da Avaliação */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <TrendingUp size={16} className="text-teal-500" />
            Evolução da Avaliação (últimas 8 semanas)
          </h2>
          <select
            value={escolaEvolucao}
            onChange={e => setEscolaEvolucao(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">Todas as Escolas (média)</option>
            {obrasAtivas
              .map(o => o.nome)
              .sort((a, b) => a.localeCompare(b))
              .map(nome => (
                <option key={nome} value={nome}>{nome}</option>
              ))}
          </select>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Semanas em que a escola não respondeu o formulário entram com nota máxima (5), pois entende-se que não houve ocorrência.
        </p>
        {loading ? (
          <div className="flex items-center justify-center h-[240px] text-slate-400 text-sm">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : chartEvolucao.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">
            Nenhuma obra em andamento encontrada para calcular a evolução.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartEvolucao} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(v) => [v, 'Avaliação']} labelFormatter={l => `Semana de ${l}`} />
              <Line type="monotone" dataKey="media" name="Avaliação" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Registros que precisam de atenção */}
      {registrosAtencao.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            Registros que Precisam de Atenção
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Ocorrências relatadas ou avaliação de andamento baixa (nota 1 ou 2).
          </p>
          <div className="divide-y divide-slate-50">
            {registrosAtencao.slice(0, 8).map(r => (
              <div key={r.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-800 truncate">{r.escola}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.avaliacao !== null && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ratingBadge(r.avaliacao)}`}>
                        Nota {r.avaliacao}
                      </span>
                    )}
                    {emailAlertaBadge(r)}
                    <span className="text-xs text-slate-400">{formatDate(r.dataISO)}</span>
                  </div>
                </div>
                {r.temOcorrencia && (
                  <p className="text-xs text-slate-500 mt-1 truncate">{r.ocorrencia}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters + Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar escola, empresa, fiscal ou responsável..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyAtencao}
              onChange={e => setOnlyAtencao(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Somente com atenção
          </label>
          {(searchTerm || onlyAtencao) && (
            <button
              onClick={() => { setSearchTerm(''); setOnlyAtencao(false); }}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-red-500 transition-colors"
            >
              <X size={14} /> Limpar
            </button>
          )}
          <span className="text-xs text-slate-400 ml-auto">{filtered.length} registro(s)</span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 size={32} className="animate-spin text-orange-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <HardHat size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {rows.length === 0
                  ? 'Nenhum registro encontrado. Verifique se o formulário já recebeu respostas.'
                  : 'Nenhum registro encontrado com os filtros aplicados'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  {['Data', 'Escola', 'Tipo de Obra', 'Empresa', 'Fiscal', 'Serviços Executados (7 dias)', 'Avaliação', 'Fotos', 'Responsável'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r, i) => (
                  <tr key={r.id || i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDate(r.dataISO)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.escola}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate" title={r.tipoObra}>{r.tipoObra || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.empresa || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.fiscal || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate" title={r.servicosExecutados}>{r.servicosExecutados || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.avaliacao !== null ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${ratingBadge(r.avaliacao)}`}>
                            {r.avaliacao}
                          </span>
                          {emailAlertaBadge(r)}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.fotosUrls.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setVisualizacao({ urls: r.fotosUrls, index: 0 })}
                          className="inline-flex items-center gap-1 text-xs text-teal-700 hover:underline"
                        >
                          <ImageIcon size={13} /> {r.fotosUrls.length}
                          <Eye size={13} />
                        </button>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.responsavel || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal: Relatório Mensal (PDF) — registros cadastrados no mês, ocorrências,
          avaliação média, situação atual das obras e evolução semana a semana
          dentro do mês escolhido. */}
      {showRelatorioModal && (
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
              <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5"><CalendarDays size={15} /> Mês de referência:</label>
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
                  <h3 className="text-base font-bold text-slate-800">Relatório Mensal — Acompanhamento Semanal de Obras</h3>
                  <p className="text-xs text-slate-500">Referência: {mesLabel(relatorioMes)} • Gerado em {new Date().toLocaleString('pt-BR')}</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="border border-slate-100 rounded-xl p-3">
                    <p className="text-xs text-slate-500 font-medium">Registros Cadastrados no Mês</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1">{relatorioMetrics.registrosNoMes}</p>
                  </div>
                  <div className="border border-slate-100 rounded-xl p-3">
                    <p className="text-xs text-slate-500 font-medium">Ocorrências Relatadas no Mês</p>
                    <p className="text-2xl font-bold text-red-600 mt-1">{relatorioMetrics.ocorrenciasNoMes}</p>
                  </div>
                  <div className="border border-slate-100 rounded-xl p-3">
                    <p className="text-xs text-slate-500 font-medium">Avaliação Média no Mês</p>
                    <p className="text-2xl font-bold text-amber-600 mt-1">{relatorioMetrics.avaliacaoMediaNoMes !== null ? relatorioMetrics.avaliacaoMediaNoMes.toFixed(1) : '-'}</p>
                  </div>
                  <div className="border border-slate-100 rounded-xl p-3 bg-slate-50">
                    <p className="text-xs text-slate-500 font-medium">Obras em Andamento (hoje)</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1">{obrasAtivas.length}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-500 mb-2">Evolução no Mês Escolhido (registros e avaliação por semana)</h4>
                  {evolucaoDoMes.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8 border border-slate-100 rounded-xl">Nenhum registro no mês selecionado.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={evolucaoDoMes} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 10 }} allowDecimals={false} />
                        <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar yAxisId="left" dataKey="Registros" fill="#0d9488" radius={[4, 4, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="Avaliação" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-500 mb-2">Situação Atual das Obras (Planilha de Obras e Reformas)</h4>
                  {statusObrasChartData.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8 border border-slate-100 rounded-xl">Nenhuma obra encontrada na planilha.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={statusObrasChartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide allowDecimals={false} />
                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: '#64748b' }} width={130} />
                        <Tooltip />
                        <Bar dataKey="quantidade" radius={[0, 6, 6, 0]} barSize={18}>
                          {statusObrasChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
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

      {/* Modal de visualização de anexos (fotos/PDFs) */}
      {visualizacao && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/70 flex items-center justify-center p-4"
          onClick={() => setVisualizacao(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-700">
                Anexo {visualizacao.index + 1} de {visualizacao.urls.length}
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={visualizacao.urls[visualizacao.index]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-teal-700 hover:underline"
                >
                  <ExternalLink size={13} /> Abrir em nova aba
                </a>
                <button
                  onClick={() => setVisualizacao(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="relative bg-slate-50">
              <iframe
                src={getDrivePreviewUrl(visualizacao.urls[visualizacao.index])}
                className="w-full h-[70vh] border-0"
                allow="autoplay"
                title="Pré-visualização do anexo"
              />
              {visualizacao.urls.length > 1 && (
                <>
                  <button
                    onClick={() => setVisualizacao(v => v && { ...v, index: (v.index - 1 + v.urls.length) % v.urls.length })}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/90 hover:bg-white shadow rounded-full text-slate-600"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    onClick={() => setVisualizacao(v => v && { ...v, index: (v.index + 1) % v.urls.length })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/90 hover:bg-white shadow rounded-full text-slate-600"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
