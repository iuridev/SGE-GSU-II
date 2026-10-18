import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Landmark, RefreshCw, ExternalLink, FileDown, Loader2, Search, AlertTriangle, ArrowRight,
  Building2, CalendarRange, ClipboardList, Info, TrendingUp, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { supabase } from '../lib/supabase';
import {
  PLANILHA_CSV_URL, PLANILHA_URL, ANO_CICLO_ATUAL, STATUS_ORDEM, STATUS_INFO,
  STATUS_CRI1_ORDEM, STATUS_CRI1_INFO, STATUS_CRI2_ORDEM, STATUS_CRI2_INFO,
  parsePlanilha, resumir, montarSnapshot, compararSnapshots, compararCartorio, ultimoSnapshotPorMes,
  registrosCompartilhados, projetarConclusao,
  type ImovelEscola, type ResumoRegularizacao, type ResumoCartorio, type Snapshot, type StatusImovel,
  type StatusCri1, type StatusCri2,
} from '../lib/regularizacaoImoveis';
import { gerarRelatorioRegularizacaoPdf } from '../lib/regularizacaoImoveisPdf';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const nomeMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`;
const nomeMesCurto = (ym: string) => `${MESES_CURTOS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const sinal = (n: number) => `${n > 0 ? '+' : ''}${n}`;

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mesAnterior(ym: string): string {
  const [a, m] = ym.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

type SnapResumo = Pick<Snapshot, 'data' | 'resumo'>;
type Visao = 'geral' | 'cri1' | 'cri2';
type FiltroCri = { cri: 'cri1'; status: StatusCri1 } | { cri: 'cri2'; status: StatusCri2 } | null;

const ROTULO_VISAO: Record<Visao, string> = { geral: 'Geral', cri1: '1º CRI', cri2: '2º CRI' };

// Cores de destaque de cada cartório (só bordas/ícones; os dados usam a paleta de status).
const COR_CRI = { cri1: '#2a78d6', cri2: '#eb6834' } as const;

// ── Componentes de apresentação ─────────────────────────────────────────

function Badge({ label, cor }: { label: string; cor: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 whitespace-nowrap">
      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: cor }} />
      {label}
    </span>
  );
}

const StatusBadge = ({ status }: { status: StatusImovel }) => <Badge label={STATUS_INFO[status].label} cor={STATUS_INFO[status].cor} />;
const Cri1Badge = ({ status }: { status: StatusCri1 }) => <Badge label={STATUS_CRI1_INFO[status].label} cor={STATUS_CRI1_INFO[status].cor} />;
const Cri2Badge = ({ status }: { status: StatusCri2 }) => <Badge label={STATUS_CRI2_INFO[status].label} cor={STATUS_CRI2_INFO[status].cor} />;

function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`} style={style}>{children}</div>;
}

function CardTitulo({ titulo, sub, acao }: { titulo: string; sub?: string; acao?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
      <div>
        <h2 className="text-sm font-bold text-slate-700">{titulo}</h2>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      {acao}
    </div>
  );
}

function Delta({ valor, sufixo = '' }: { valor: number | null | undefined; sufixo?: string }) {
  if (valor === null || valor === undefined) return <span className="text-slate-400">—</span>;
  return (
    <span className={`tabular-nums font-semibold ${valor === 0 ? 'text-slate-500' : 'text-slate-800'}`}>
      {sinal(valor)}{sufixo}
    </span>
  );
}

// Barra empilhada clicável com legenda — mesma linguagem visual nas três visões.
function BarraSituacao<S extends string>({ ordem, info, contagem, ativo, onSelecionar, excluir }: {
  ordem: S[];
  info: Record<S, { label: string; descricao: string; cor: string }>;
  contagem: Record<S, number>;
  ativo: S | '' | null;
  onSelecionar: (s: S) => void;
  excluir?: S;
}) {
  const itens = ordem.filter(s => s !== excluir);
  const total = itens.reduce((t, s) => t + (contagem[s] || 0), 0);
  return (
    <div>
      <div className="flex h-5 rounded-md overflow-hidden gap-[2px] bg-white">
        {total === 0 && <div className="h-full w-full bg-slate-100" />}
        {itens.filter(s => contagem[s] > 0).map(s => (
          <button key={s} type="button" onClick={() => onSelecionar(s)}
            title={`${info[s].label}: ${contagem[s]} (${pct(contagem[s], total)}%)`}
            style={{ width: `${(contagem[s] / total) * 100}%`, background: info[s].cor }}
            className={`h-full transition-opacity hover:opacity-80 ${ativo && ativo !== s ? 'opacity-40' : ''}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
        {itens.map(s => (
          <button key={s} type="button" onClick={() => onSelecionar(s)}
            className={`text-left ${ativo && ativo !== s ? 'opacity-40' : ''}`} title={info[s].descricao}>
            <Badge label={info[s].label} cor={info[s].cor} />
            <span className="text-xs text-slate-500 ml-1.5 tabular-nums">{contagem[s] || 0}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Funil de avanço: cada etapa é proporcional à primeira.
function Funil({ etapas, cor }: { etapas: { label: string; valor: number; dica?: string }[]; cor: string }) {
  const base = Math.max(1, etapas[0]?.valor || 0);
  return (
    <div className="space-y-2">
      {etapas.map((e, i) => (
        <div key={e.label} title={e.dica}>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-slate-600">{e.label}</span>
            <span className="tabular-nums font-semibold text-slate-800">
              {e.valor}{i > 0 && <span className="text-slate-400 font-normal"> · {pct(e.valor, base)}%</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(e.valor / base) * 100}%`, background: cor, opacity: 1 - i * 0.22 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CartorioCard<S extends string>({ id, titulo, sub, resumo, ordem, info, excluir, etapas, metricas, filtroAtivo, onFiltrar }: {
  id: 'cri1' | 'cri2';
  titulo: string;
  sub: string;
  resumo: ResumoCartorio<S>;
  ordem: S[];
  info: Record<S, { label: string; descricao: string; cor: string }>;
  excluir?: S;
  etapas: { label: string; valor: number; dica?: string }[];
  metricas: { label: string; valor: number; delta?: number | null }[];
  filtroAtivo: S | null;
  onFiltrar: (s: S) => void;
}) {
  return (
    <Card className="p-4 border-t-4" style={{ borderTopColor: COR_CRI[id] }}>
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-lg shrink-0" style={{ background: `${COR_CRI[id]}1a` }}>
          <Building2 size={20} style={{ color: COR_CRI[id] }} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-800">{titulo}</h2>
          <p className="text-xs text-slate-500">{sub}</p>
        </div>
        <div className="ml-auto text-right shrink-0">
          <p className="text-2xl font-bold text-slate-800 tabular-nums">{resumo.unidades}</p>
          <p className="text-[11px] text-slate-500 leading-tight">unidades com<br />demanda</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {metricas.map(m => (
          <div key={m.label} className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-[11px] text-slate-500 leading-tight">{m.label}</p>
            <p className="text-lg font-bold text-slate-800 tabular-nums">{m.valor}</p>
            {m.delta !== undefined && <p className="text-[11px] text-slate-500"><Delta valor={m.delta} /> no mês</p>}
          </div>
        ))}
      </div>

      <p className="text-xs font-semibold text-slate-600 mb-2">Funil de regularização</p>
      <Funil etapas={etapas} cor={COR_CRI[id]} />

      <p className="text-xs font-semibold text-slate-600 mt-4 mb-2">
        Situação das unidades <span className="font-normal text-slate-400">(clique para filtrar a tabela)</span>
      </p>
      <BarraSituacao ordem={ordem} info={info} contagem={resumo.porStatus} ativo={filtroAtivo} onSelecionar={onFiltrar} excluir={excluir} />
    </Card>
  );
}

// ── Página ──────────────────────────────────────────────────────────────

export default function RegularizacaoImoveis() {
  const [imoveis, setImoveis] = useState<ImovelEscola[]>([]);
  const [snapshots, setSnapshots] = useState<SnapResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [avisoHistorico, setAvisoHistorico] = useState('');
  const [lidoEm, setLidoEm] = useState<Date | null>(null);
  const [mesRelatorio, setMesRelatorio] = useState(hojeLocal().slice(0, 7));
  const [fotosMes, setFotosMes] = useState<{ fim: Snapshot | null; inicio: Snapshot | null } | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [visaoEvolucao, setVisaoEvolucao] = useState<Visao>('geral');
  const [filtroStatus, setFiltroStatus] = useState<StatusImovel | ''>('');
  const [filtroCri, setFiltroCri] = useState<FiltroCri>(null);
  const [busca, setBusca] = useState('');
  const [pendenciaAberta, setPendenciaAberta] = useState<string | null>(null);

  const hoje = hojeLocal();
  const mesAtual = hoje.slice(0, 7);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    setAvisoHistorico('');
    try {
      const resp = await fetch(`${PLANILHA_CSV_URL}&_=${Date.now()}`);
      if (!resp.ok) throw new Error(`Planilha respondeu ${resp.status}`);
      const lista = parsePlanilha(await resp.text());
      setImoveis(lista);
      setLidoEm(new Date());

      // Fotografia de hoje: é o que permite montar a evolução mês a mês, já que
      // a planilha não guarda data por movimentação. Falha aqui (ex.: perfil
      // somente-leitura, tabela ainda não criada) não impede ver os dados atuais.
      const snap = montarSnapshot(lista, hojeLocal());
      const { error: errSnap } = await (supabase as any)
        .from('regularizacao_imoveis_snapshots')
        .upsert({ ...snap, updated_at: new Date().toISOString() }, { onConflict: 'data' });
      if (errSnap) console.warn('Não foi possível gravar a fotografia do dia:', errSnap.message);

      const { data, error } = await (supabase as any)
        .from('regularizacao_imoveis_snapshots')
        .select('data, resumo')
        .order('data', { ascending: true });
      if (error) {
        setAvisoHistorico('Histórico de evolução indisponível no momento — exibindo apenas a situação atual.');
        setSnapshots([]);
      } else {
        setSnapshots(data || []);
      }
    } catch (e: any) {
      console.error(e);
      setErro(`Não foi possível ler a planilha: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const resumoAtual = useMemo(() => resumir(imoveis), [imoveis]);

  // Última fotografia de cada mês; o mês corrente sempre usa os dados ao vivo.
  const resumoPorMes = useMemo(() => {
    const m = new Map<string, { data: string; resumo: ResumoRegularizacao }>();
    ultimoSnapshotPorMes(snapshots as Snapshot[]).forEach((s, ym) => m.set(ym, { data: s.data, resumo: s.resumo }));
    if (imoveis.length) m.set(mesAtual, { data: hoje, resumo: resumoAtual });
    return m;
  }, [snapshots, imoveis.length, resumoAtual, mesAtual, hoje]);

  const mesesDisponiveis = useMemo(() => [...resumoPorMes.keys()].sort().reverse(), [resumoPorMes]);
  const mesesOrdenados = useMemo(() => [...resumoPorMes.entries()].sort(([a], [b]) => a.localeCompare(b)), [resumoPorMes]);

  const serieAtualizadas = useMemo(() => mesesOrdenados.map(([ym, { resumo }]) => ({
    ym, atualizadas: resumo.porStatus.atualizada, total: resumo.total,
  })), [mesesOrdenados]);
  const projecao = useMemo(() => projetarConclusao(serieAtualizadas), [serieAtualizadas]);

  const dadosEvolucao = useMemo(() => {
    const ordem: string[] = visaoEvolucao === 'geral' ? STATUS_ORDEM : visaoEvolucao === 'cri1' ? STATUS_CRI1_ORDEM : STATUS_CRI2_ORDEM;
    return mesesOrdenados.slice(-12).flatMap(([ym, { resumo }]) => {
      const cont: Record<string, number> | undefined = visaoEvolucao === 'geral' ? resumo.porStatus : resumo[visaoEvolucao]?.porStatus;
      if (!cont) return [];
      return [{ mes: nomeMesCurto(ym), ...Object.fromEntries(ordem.filter(s => s !== 'nao_se_aplica').map(s => [s, cont[s] || 0])) }];
    });
  }, [mesesOrdenados, visaoEvolucao]);

  const legendaEvolucao = useMemo(() => {
    if (visaoEvolucao === 'geral') return STATUS_ORDEM.map(s => ({ chave: s as string, ...STATUS_INFO[s] }));
    if (visaoEvolucao === 'cri1') return STATUS_CRI1_ORDEM.map(s => ({ chave: s as string, ...STATUS_CRI1_INFO[s] }));
    return STATUS_CRI2_ORDEM.filter(s => s !== 'nao_se_aplica').map(s => ({ chave: s as string, ...STATUS_CRI2_INFO[s] }));
  }, [visaoEvolucao]);
  const rotuloEvolucao = useMemo(() => Object.fromEntries(legendaEvolucao.map(l => [l.chave, l.label])), [legendaEvolucao]);

  const dadosPorAno = useMemo(() => {
    const cont = new Map<number, { cri1: number; cri2: number }>();
    imoveis.forEach(i => {
      (['cri1', 'cri2'] as const).forEach(c => {
        if (!i[c].anos.length) return;
        const ano = Math.max(...i[c].anos);
        const v = cont.get(ano) || { cri1: 0, cri2: 0 };
        v[c]++;
        cont.set(ano, v);
      });
    });
    return [...cont.entries()].sort(([a], [b]) => a - b).map(([ano, v]) => ({ ano: String(ano), ...v }));
  }, [imoveis]);

  const dadosProprietarias = useMemo(() => {
    const cont = new Map<string, number>();
    imoveis.forEach(i => {
      if (i.status === 'nao_iniciada') return;
      (i.proprietarias.length ? i.proprietarias : ['Não informada']).forEach(p => cont.set(p, (cont.get(p) || 0) + 1));
    });
    return [...cont.entries()].sort((a, b) => b[1] - a[1]).map(([nome, total]) => ({ nome, total }));
  }, [imoveis]);

  // Fotografias completas (com status por escola) do fim do mês escolhido e do
  // fim do mês anterior — só essas duas são buscadas com o JSON por escola.
  const carregarFotosDoMes = useCallback(async (ym: string): Promise<{ fim: Snapshot | null; inicio: Snapshot | null }> => {
    const fimData = resumoPorMes.get(ym)?.data;
    const inicioData = resumoPorMes.get(mesAnterior(ym))?.data
      // Sem foto do mês anterior: usa a primeira foto do próprio mês como base.
      ?? snapshots.find(s => s.data.startsWith(ym) && s.data !== fimData)?.data;
    const datas = [fimData, inicioData].filter(Boolean) as string[];
    let fotos: Snapshot[] = [];
    if (datas.length) {
      const { data } = await (supabase as any)
        .from('regularizacao_imoveis_snapshots')
        .select('data, resumo, por_escola')
        .in('data', datas);
      fotos = data || [];
    }
    const fim = ym === mesAtual && imoveis.length
      ? montarSnapshot(imoveis, hoje)
      : fotos.find(f => f.data === fimData) || null;
    const inicio = fotos.find(f => f.data === inicioData) || null;
    return { fim, inicio };
  }, [resumoPorMes, snapshots, mesAtual, imoveis, hoje]);

  useEffect(() => {
    if (loading || !imoveis.length) return;
    let cancelado = false;
    setFotosMes(null);
    carregarFotosDoMes(mesRelatorio).then(f => { if (!cancelado) setFotosMes(f); });
    return () => { cancelado = true; };
  }, [mesRelatorio, loading, imoveis.length, carregarFotosDoMes]);

  // Movimentações do mês agrupadas por unidade (geral + cada cartório).
  const movimentacoes = useMemo(() => {
    if (!fotosMes) return null;
    const { fim, inicio } = fotosMes;
    if (!fim || !inicio) return [];
    const porEscola = new Map<string, { escola: string; itens: { ambito: Visao; de: string | null; para: string; corPara: string }[] }>();
    const add = (chave: string, escola: string, ambito: Visao, de: string | null, para: string, corPara: string) => {
      if (!porEscola.has(chave)) porEscola.set(chave, { escola, itens: [] });
      porEscola.get(chave)!.itens.push({ ambito, de, para, corPara });
    };
    compararSnapshots(inicio, fim).forEach(m => add(m.chave, m.escola, 'geral', m.de ? STATUS_INFO[m.de].label : null, STATUS_INFO[m.para].label, STATUS_INFO[m.para].cor));
    compararCartorio(inicio, fim, 'cri1').forEach(m => add(m.chave, m.escola, 'cri1', m.de ? STATUS_CRI1_INFO[m.de].label : null, STATUS_CRI1_INFO[m.para].label, STATUS_CRI1_INFO[m.para].cor));
    compararCartorio(inicio, fim, 'cri2').forEach(m => add(m.chave, m.escola, 'cri2', m.de ? STATUS_CRI2_INFO[m.de].label : null, STATUS_CRI2_INFO[m.para].label, STATUS_CRI2_INFO[m.para].cor));
    return [...porEscola.entries()].map(([chave, v]) => ({ chave, ...v })).sort((a, b) => a.escola.localeCompare(b.escola));
  }, [fotosMes]);

  const pendencias = useMemo(() => {
    const nomes = (f: (i: ImovelEscola) => boolean) => imoveis.filter(f).map(i => i.escola).sort();
    return [
      { id: 'sol2', titulo: 'Solicitar ao 2º CRI', desc: 'Não constam no 1º CRI e a solicitação ainda não foi feita', cor: STATUS_CRI2_INFO.a_solicitar.cor, nomes: nomes(i => i.cri2.status === 'a_solicitar') },
      { id: 'agu2', titulo: 'Aguardando o 2º CRI', desc: 'Solicitação enviada, certidão ainda não recebida', cor: STATUS_CRI2_INFO.aguardando.cor, nomes: nomes(i => i.cri2.status === 'aguardando') },
      { id: 'desat', titulo: 'Renovar certidão', desc: `Registro localizado, certidão anterior a ${ANO_CICLO_ATUAL}`, cor: STATUS_INFO.desatualizada.cor, nomes: nomes(i => i.status === 'desatualizada') },
      { id: 'naoloc', titulo: 'Registro não localizado', desc: 'Verificar dados do imóvel junto ao cartório', cor: STATUS_INFO.nao_localizada.cor, nomes: nomes(i => i.status === 'nao_localizada') },
      { id: 'inic', titulo: 'Iniciar levantamento', desc: 'Nenhuma informação lançada na planilha', cor: STATUS_INFO.nao_iniciada.cor, nomes: nomes(i => i.status === 'nao_iniciada') },
    ];
  }, [imoveis]);

  const pontosAtencao = useMemo(() => {
    const out: { titulo: string; detalhe: string }[] = [];
    registrosCompartilhados(imoveis).forEach(g => out.push({
      titulo: `Mesmo registro em ${g.escolas.length} unidades`,
      detalhe: `${g.escolas.join(' e ')} (${g.registro}) — terreno compartilhado ou lançamento repetido.`,
    }));
    const semNumero = imoveis.filter(i => !i.numero).map(i => i.escola);
    if (semNumero.length) out.push({ titulo: `${semNumero.length} unidade(s) sem nº na planilha`, detalhe: semNumero.join('; ') });
    const oficioAntigo = imoveis.filter(i => i.status === 'atualizada' && i.cri1.oficios.some(o => {
      const m = o.match(/\/(\d{2})\b/);
      return m && 2000 + Number(m[1]) < ANO_CICLO_ATUAL;
    })).map(i => i.escola);
    if (oficioAntigo.length) out.push({ titulo: 'Ofício do CRI de ano anterior com certidão do ciclo', detalhe: `${oficioAntigo.join('; ')} — conferir o nº do ofício.` });
    return out;
  }, [imoveis]);

  const imoveisFiltrados = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return imoveis.filter(i =>
      (!filtroStatus || i.status === filtroStatus)
      && (!filtroCri || (filtroCri.cri === 'cri1' ? i.cri1.status === filtroCri.status : i.cri2.status === filtroCri.status))
      && (!q || i.escola.toUpperCase().includes(q) || i.documentos.join(' ').toUpperCase().includes(q) || i.numero === q));
  }, [imoveis, filtroStatus, filtroCri, busca]);

  const rolarParaTabela = () => document.getElementById('tabela-unidades')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const filtrarGeral = (s: StatusImovel) => { setFiltroCri(null); setFiltroStatus(filtroStatus === s ? '' : s); };
  const filtrarCri1 = (s: StatusCri1) => {
    setFiltroStatus('');
    setFiltroCri(filtroCri?.cri === 'cri1' && filtroCri.status === s ? null : { cri: 'cri1', status: s });
    rolarParaTabela();
  };
  const filtrarCri2 = (s: StatusCri2) => {
    setFiltroStatus('');
    setFiltroCri(filtroCri?.cri === 'cri2' && filtroCri.status === s ? null : { cri: 'cri2', status: s });
    rolarParaTabela();
  };

  const gerarPdf = async () => {
    setGerandoPdf(true);
    try {
      const { fim, inicio } = await carregarFotosDoMes(mesRelatorio);
      if (!fim) { alert('Não há registro da situação neste mês.'); return; }
      const serie = serieAtualizadas.filter(s => s.ym <= mesRelatorio);
      gerarRelatorioRegularizacaoPdf({
        ym: mesRelatorio,
        emCurso: mesRelatorio === mesAtual,
        fim,
        inicio,
        imoveis,
        serie,
        projecao: projetarConclusao(serie),
      });
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar o relatório.');
    } finally {
      setGerandoPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="animate-spin text-amber-700" size={28} />
      </div>
    );
  }

  const r = resumoAtual;
  const iniciadas = r.total - r.porStatus.nao_iniciada;
  const resMes = resumoPorMes.get(mesRelatorio)?.resumo;
  const resMesAnt = resumoPorMes.get(mesAnterior(mesRelatorio))?.resumo;
  const mesAntRes = resumoPorMes.get(mesAnterior(mesAtual))?.resumo;
  const d = (f: (x: ResumoRegularizacao) => number | undefined) => {
    const a = f(r); const b = mesAntRes ? f(mesAntRes) : undefined;
    return a === undefined || b === undefined ? null : a - b;
  };
  const pctAtualizadas = pct(r.porStatus.atualizada, r.total);

  const c1 = r.cri1;
  const c2 = r.cri2;
  const comRegistro1 = c1.porStatus.atualizada + c1.porStatus.desatualizada + c1.porStatus.em_pesquisa + c1.porStatus.nao_localizado;
  const solicitadas2 = c2.porStatus.aguardando + c2.porStatus.atualizada + c2.porStatus.desatualizada;

  const kpis = [
    { label: 'Unidades acompanhadas', valor: r.total, sub: `${iniciadas} com levantamento · ${r.porStatus.nao_iniciada} sem lançamento`, delta: d(x => x.porStatus.nao_iniciada) === null ? null : -(d(x => x.porStatus.nao_iniciada) as number), deltaLabel: 'levantadas no mês' },
    { label: 'Matrículas / transcrições', valor: r.matriculas + r.transcricoes, sub: `${r.matriculas} matrículas · ${r.transcricoes} transcrições`, delta: d(x => x.matriculas + x.transcricoes), deltaLabel: 'no mês' },
    { label: 'Ofícios emitidos', valor: r.oficiosUre + r.oficiosCri, sub: `${r.oficiosUre} da URE · ${r.oficiosCri} respondidos pelo CRI`, delta: d(x => x.oficiosUre + x.oficiosCri), deltaLabel: 'no mês' },
    { label: 'Pendências no 2º CRI', valor: c2.porStatus.aguardando + c2.porStatus.a_solicitar, sub: `${c2.porStatus.aguardando} aguardando · ${c2.porStatus.a_solicitar} a solicitar`, delta: null, deltaLabel: '' },
  ];

  // Linhas da tabela "Avanço do mês": indicador, fim do mês escolhido, anterior.
  const linhasAvanco: { grupo: Visao; label: string; f: (x: ResumoRegularizacao) => number | undefined }[] = [
    { grupo: 'geral', label: 'Certidões atualizadas', f: x => x.porStatus.atualizada },
    { grupo: 'geral', label: 'Unidades sem levantamento', f: x => x.porStatus.nao_iniciada },
    { grupo: 'geral', label: 'Matrículas + transcrições levantadas', f: x => x.matriculas + x.transcricoes },
    { grupo: 'geral', label: 'Ofícios emitidos (URE + CRI)', f: x => x.oficiosUre + x.oficiosCri },
    { grupo: 'cri1', label: 'Unidades pesquisadas', f: x => x.cri1?.unidades },
    { grupo: 'cri1', label: 'Certidões atualizadas', f: x => x.cri1?.porStatus.atualizada },
    { grupo: 'cri1', label: 'Não constam no 1º CRI', f: x => x.cri1?.porStatus.nao_consta },
    { grupo: 'cri2', label: 'Unidades com demanda', f: x => x.cri2?.unidades },
    { grupo: 'cri2', label: 'Solicitações feitas', f: x => x.solicitacoes2CriFeitas },
    { grupo: 'cri2', label: 'Solicitações pendentes', f: x => x.solicitacoes2CriPendentes },
    { grupo: 'cri2', label: 'Certidões recebidas', f: x => x.cri2 ? x.cri2.porStatus.atualizada + x.cri2.porStatus.desatualizada : undefined },
  ];

  const filtroAtivoTexto = filtroStatus
    ? `Situação geral: ${STATUS_INFO[filtroStatus].label}`
    : filtroCri
      ? `${ROTULO_VISAO[filtroCri.cri]}: ${filtroCri.cri === 'cri1' ? STATUS_CRI1_INFO[filtroCri.status].label : STATUS_CRI2_INFO[filtroCri.status].label}`
      : '';

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Landmark className="text-amber-700" size={28} />
            Regularização de Imóveis
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Regularização de terrenos e atualização de matrículas das unidades escolares junto ao 1º e ao 2º Cartório de Registro de Imóveis
          </p>
          {lidoEm && (
            <p className="text-xs text-slate-400 mt-1">
              Planilha lida às {lidoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ciclo de atualização {ANO_CICLO_ATUAL}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={carregar} className="flex items-center gap-2 px-3 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 text-sm">
            <RefreshCw size={16} /> Atualizar
          </button>
          <a href={PLANILHA_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 text-sm font-medium">
            <ExternalLink size={16} /> Abrir planilha
          </a>
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm flex items-center gap-2">
          <AlertTriangle size={18} /> {erro}
        </div>
      )}

      {!erro && (
        <>
          {/* Mês de referência + relatório */}
          <Card className="p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <CalendarRange size={18} className="text-amber-700" />
              <label className="text-sm font-semibold text-slate-700" htmlFor="mes-relatorio">Mês de referência</label>
              <select id="mes-relatorio" value={mesRelatorio} onChange={e => setMesRelatorio(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                {mesesDisponiveis.map(ym => <option key={ym} value={ym}>{nomeMes(ym)}{ym === mesAtual ? ' (em curso)' : ''}</option>)}
              </select>
              <span className="text-xs text-slate-500">define o painel "Avanço do mês" e o relatório</span>
            </div>
            <button onClick={gerarPdf} disabled={gerandoPdf}
              className="flex items-center gap-2 px-4 py-2 bg-amber-700 text-white rounded-lg hover:bg-amber-800 disabled:opacity-60 text-sm font-medium">
              {gerandoPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
              Gerar relatório de {nomeMes(mesRelatorio)} (PDF)
            </button>
          </Card>

          {/* Destaque + indicadores gerais */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-5 lg:row-span-2 flex flex-col">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Certidões atualizadas ({ANO_CICLO_ATUAL}+)</p>
              <div className="flex items-end gap-3 mt-2">
                <p className="text-5xl font-bold text-slate-800 tabular-nums">{r.porStatus.atualizada}</p>
                <p className="text-sm text-slate-500 mb-1.5">de {r.total} unidades</p>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Meta: 100% das unidades</span>
                  <span className="font-semibold text-slate-700 tabular-nums">{pctAtualizadas}%</span>
                </div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pctAtualizadas}%`, background: STATUS_INFO.atualizada.cor }} />
                </div>
              </div>
              <div className="mt-4 space-y-1.5 text-sm">
                <p className="text-slate-600">
                  <Delta valor={d(x => x.porStatus.atualizada)} /> <span className="text-slate-500">em relação ao mês anterior</span>
                </p>
                {projecao && (
                  <p className="text-slate-600 flex items-start gap-1.5">
                    <TrendingUp size={15} className="text-slate-400 mt-0.5 shrink-0" />
                    <span>
                      Ritmo médio de <b className="tabular-nums">{projecao.ritmo.toFixed(1).replace('.', ',')}</b> certidões/mês
                      {projecao.conclusao
                        ? <> — conclusão projetada para <b>{nomeMes(projecao.conclusao)}</b></>
                        : <> — sem avanço no período para projetar a conclusão</>}
                    </span>
                  </p>
                )}
              </div>
              <div className="mt-auto pt-4">
                <p className="text-xs font-semibold text-slate-600 mb-2">Situação geral das unidades</p>
                <BarraSituacao ordem={STATUS_ORDEM} info={STATUS_INFO} contagem={r.porStatus} ativo={filtroStatus} onSelecionar={s => { filtrarGeral(s); rolarParaTabela(); }} />
              </div>
            </Card>

            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {kpis.map(k => (
                <Card key={k.label} className="p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{k.label}</p>
                  <p className="text-3xl font-bold text-slate-800 mt-1 tabular-nums">{k.valor}</p>
                  <p className="text-xs text-slate-500 mt-1">{k.sub}</p>
                  {k.delta !== null && <p className="text-xs text-slate-500 mt-1"><Delta valor={k.delta} /> {k.deltaLabel}</p>}
                </Card>
              ))}
            </div>
          </div>

          {/* Por cartório */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CartorioCard
              id="cri1"
              titulo="1º Cartório de Registro de Imóveis"
              sub="Pesquisa padrão de matrículas e transcrições (ofícios “RI”)"
              resumo={c1}
              ordem={STATUS_CRI1_ORDEM}
              info={STATUS_CRI1_INFO}
              etapas={[
                { label: 'Unidades pesquisadas', valor: c1.unidades },
                { label: 'Com registro localizado', valor: comRegistro1, dica: 'Exclui as que não constam no 1º CRI' },
                { label: 'Certidão atualizada', valor: c1.porStatus.atualizada },
              ]}
              metricas={[
                { label: 'Certidões atualizadas', valor: c1.porStatus.atualizada, delta: d(x => x.cri1?.porStatus.atualizada) },
                { label: 'Matrículas', valor: c1.matriculas, delta: d(x => x.cri1?.matriculas) },
                { label: 'Transcrições', valor: c1.transcricoes, delta: d(x => x.cri1?.transcricoes) },
                { label: 'Ofícios respondidos', valor: c1.oficios, delta: d(x => x.cri1?.oficios) },
              ]}
              filtroAtivo={filtroCri?.cri === 'cri1' ? filtroCri.status : null}
              onFiltrar={filtrarCri1}
            />
            <CartorioCard
              id="cri2"
              titulo="2º Cartório de Registro de Imóveis"
              sub="Imóveis que não constam no 1º CRI ou registrados no 2º"
              resumo={c2}
              ordem={STATUS_CRI2_ORDEM}
              info={STATUS_CRI2_INFO}
              excluir="nao_se_aplica"
              etapas={[
                { label: 'Unidades com demanda', valor: c2.unidades },
                { label: 'Solicitação feita / registro identificado', valor: solicitadas2 },
                { label: 'Certidão recebida', valor: c2.porStatus.atualizada + c2.porStatus.desatualizada },
                { label: 'Certidão atualizada', valor: c2.porStatus.atualizada },
              ]}
              metricas={[
                { label: 'Aguardando certidão', valor: c2.porStatus.aguardando, delta: d(x => x.cri2?.porStatus.aguardando) },
                { label: 'A solicitar', valor: c2.porStatus.a_solicitar, delta: d(x => x.cri2?.porStatus.a_solicitar) },
                { label: 'Certidões atualizadas', valor: c2.porStatus.atualizada, delta: d(x => x.cri2?.porStatus.atualizada) },
                { label: 'Matrículas', valor: c2.matriculas, delta: d(x => x.cri2?.matriculas) },
              ]}
              filtroAtivo={filtroCri?.cri === 'cri2' ? filtroCri.status : null}
              onFiltrar={filtrarCri2}
            />
          </div>

          {/* Avanço do mês */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <Card className="p-4 lg:col-span-2">
              <CardTitulo titulo={`Avanço em ${nomeMes(mesRelatorio)}`}
                sub={resMesAnt ? `Fim do mês comparado ao fim de ${nomeMes(mesAnterior(mesRelatorio))}` : 'Sem fotografia do mês anterior para comparar'} />
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="text-left font-medium pb-1">Indicador</th>
                    <th className="text-right font-medium pb-1">Mês</th>
                    <th className="text-right font-medium pb-1">Anterior</th>
                    <th className="text-right font-medium pb-1">Var.</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasAvanco.map((l, i) => {
                    const a = resMes ? l.f(resMes) : undefined;
                    const b = resMesAnt ? l.f(resMesAnt) : undefined;
                    const novoGrupo = i === 0 || linhasAvanco[i - 1].grupo !== l.grupo;
                    return (
                      <tr key={l.grupo + l.label} className={novoGrupo ? 'border-t border-slate-100' : ''}>
                        <td className="py-1 pr-2 text-slate-700">
                          {novoGrupo && <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 pt-1.5">{ROTULO_VISAO[l.grupo]}</span>}
                          {l.label}
                        </td>
                        <td className="py-1 text-right tabular-nums align-bottom">{a ?? '—'}</td>
                        <td className="py-1 text-right tabular-nums text-slate-500 align-bottom">{b ?? '—'}</td>
                        <td className="py-1 text-right align-bottom"><Delta valor={a !== undefined && b !== undefined ? a - b : null} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {resMesAnt && (!resMesAnt.cri1 || !resMesAnt.cri2) && (
                <p className="text-[11px] text-slate-400 mt-2">Os indicadores por cartório começam a ser comparados a partir das fotografias de outubro/2026.</p>
              )}
            </Card>

            <Card className="p-4 lg:col-span-3">
              <CardTitulo titulo={`Movimentações em ${nomeMes(mesRelatorio)}`} sub="Unidades que mudaram de situação no mês, por âmbito" />
              {movimentacoes === null ? (
                <Loader2 className="animate-spin text-slate-400" size={20} />
              ) : movimentacoes.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nenhuma mudança registrada no período (ou ainda não há fotografia anterior para comparar).
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
                  {movimentacoes.map(m => (
                    <li key={m.chave} className="py-2">
                      <p className="text-sm font-medium text-slate-700">{m.escola}</p>
                      {m.itens.map(it => (
                        <div key={it.ambito} className="flex items-center gap-2 flex-wrap mt-1 text-xs">
                          <span className="w-12 shrink-0 font-semibold text-slate-500">{ROTULO_VISAO[it.ambito]}</span>
                          <span className="text-slate-500">{it.de ?? 'Nova'}</span>
                          <ArrowRight size={12} className="text-slate-400" />
                          <Badge label={it.para} cor={it.corPara} />
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-4 lg:col-span-2">
              <CardTitulo
                titulo="Evolução mensal por situação"
                sub="Quantidade de unidades em cada situação no fim de cada mês"
                acao={(
                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
                    {(['geral', 'cri1', 'cri2'] as Visao[]).map(v => (
                      <button key={v} type="button" onClick={() => setVisaoEvolucao(v)}
                        className={`px-2.5 py-1 rounded-md ${visaoEvolucao === v ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                        {ROTULO_VISAO[v]}
                      </button>
                    ))}
                  </div>
                )}
              />
              {avisoHistorico && <p className="text-xs text-amber-700 mb-2">{avisoHistorico}</p>}
              {dadosEvolucao.length < 2 && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2 mb-2">
                  A planilha não registra datas, então o histórico é montado a partir de uma fotografia diária tirada quando a página é aberta.
                  {visaoEvolucao !== 'geral' && ' A visão por cartório existe a partir de outubro/2026.'}
                  {' '}A curva ganha um ponto por mês.
                </p>
              )}
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dadosEvolucao} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v, name) => [v as number, rotuloEvolucao[name as string] ?? name]} />
                  <Legend formatter={(v) => <span className="text-xs text-slate-600">{rotuloEvolucao[v as string] ?? v}</span>} iconType="square" iconSize={10} />
                  {legendaEvolucao.map((s, i) => (
                    <Bar key={`${visaoEvolucao}-${s.chave}`} dataKey={s.chave} stackId="a" fill={s.cor} stroke="#fff" strokeWidth={1}
                      radius={i === legendaEvolucao.length - 1 ? [4, 4, 0, 0] : undefined} maxBarSize={56} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-4">
              <CardTitulo titulo="Ano da última certidão" sub="Unidades por ano informado, em cada cartório" />
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dadosPorAno} margin={{ top: 16, right: 8, left: -18, bottom: 0 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="ano" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v, name) => [v as number, name === 'cri1' ? '1º CRI' : '2º CRI']} />
                  <Legend formatter={(v) => <span className="text-xs text-slate-600">{v === 'cri1' ? '1º CRI' : '2º CRI'}</span>} iconType="square" iconSize={10} />
                  <Bar dataKey="cri1" fill={COR_CRI.cri1} radius={[4, 4, 0, 0]} maxBarSize={36} label={{ position: 'top', fontSize: 11, fill: '#334155' }} />
                  <Bar dataKey="cri2" fill={COR_CRI.cri2} radius={[4, 4, 0, 0]} maxBarSize={36} label={{ position: 'top', fontSize: 11, fill: '#334155' }} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Pendências + proprietárias + pontos de atenção */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-4 lg:col-span-2">
              <CardTitulo titulo="Pendências e próximas ações" sub="Situação atual da planilha — clique para ver as unidades" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {pendencias.filter(p => p.nomes.length > 0).map(p => {
                  const aberta = pendenciaAberta === p.id;
                  return (
                    <div key={p.id} className={`rounded-lg border border-slate-200 ${aberta ? 'sm:col-span-2' : ''}`}>
                      <button type="button" onClick={() => setPendenciaAberta(aberta ? null : p.id)}
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 rounded-lg">
                        <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: p.cor }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-700">{p.titulo}</span>
                          <span className="block text-xs text-slate-500">{p.desc}</span>
                        </span>
                        <span className="text-xl font-bold text-slate-800 tabular-nums">{p.nomes.length}</span>
                        {aberta ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                      </button>
                      {aberta && (
                        <ul className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-600">
                          {p.nomes.map(n => <li key={n}>• {n}</li>)}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-4">
              <CardTitulo titulo="Proprietária do imóvel" sub="Unidades já levantadas (uma unidade pode ter mais de uma)" />
              <ResponsiveContainer width="100%" height={Math.max(160, dadosProprietarias.length * 34)}>
                <BarChart data={dadosProprietarias} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="nome" width={120} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v) => [v as number, 'Unidades']} />
                  <Bar dataKey="total" fill="#2a78d6" radius={[0, 4, 4, 0]} barSize={16}
                    label={{ position: 'right', fontSize: 11, fill: '#334155' }} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {pontosAtencao.length > 0 && (
            <Card className="p-4">
              <CardTitulo titulo="Pontos de atenção na planilha" sub="Verificações automáticas de consistência — não alteram os números acima" />
              <ul className="space-y-2">
                {pontosAtencao.map(p => (
                  <li key={p.titulo + p.detalhe} className="flex items-start gap-2 text-sm">
                    <Info size={15} className="text-amber-600 mt-0.5 shrink-0" />
                    <span><b className="text-slate-700">{p.titulo}:</b> <span className="text-slate-600">{p.detalhe}</span></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Tabela por unidade */}
          <Card>
            <div id="tabela-unidades" className="scroll-mt-4 p-4 flex items-center justify-between flex-wrap gap-3 border-b border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                <ClipboardList size={16} className="text-slate-500" />
                <h2 className="text-sm font-bold text-slate-700">Unidades ({imoveisFiltrados.length})</h2>
                {filtroAtivoTexto && (
                  <button type="button" onClick={() => { setFiltroStatus(''); setFiltroCri(null); }}
                    className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 rounded-full px-2.5 py-1 hover:bg-slate-200">
                    {filtroAtivoTexto} <X size={12} />
                  </button>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <select value={filtroStatus} onChange={e => { setFiltroCri(null); setFiltroStatus(e.target.value as StatusImovel | ''); }}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" aria-label="Situação geral">
                  <option value="">Situação geral: todas</option>
                  {STATUS_ORDEM.map(s => <option key={s} value={s}>{STATUS_INFO[s].label}</option>)}
                </select>
                <select value={filtroCri ? `${filtroCri.cri}:${filtroCri.status}` : ''}
                  onChange={e => {
                    setFiltroStatus('');
                    const [cri, status] = e.target.value.split(':');
                    setFiltroCri(!cri ? null : cri === 'cri1' ? { cri: 'cri1', status: status as StatusCri1 } : { cri: 'cri2', status: status as StatusCri2 });
                  }}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" aria-label="Situação por cartório">
                  <option value="">Cartório: todos</option>
                  <optgroup label="1º CRI">
                    {STATUS_CRI1_ORDEM.map(s => <option key={s} value={`cri1:${s}`}>1º CRI — {STATUS_CRI1_INFO[s].label}</option>)}
                  </optgroup>
                  <optgroup label="2º CRI">
                    {STATUS_CRI2_ORDEM.map(s => <option key={s} value={`cri2:${s}`}>2º CRI — {STATUS_CRI2_INFO[s].label}</option>)}
                  </optgroup>
                </select>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar escola, nº ou matrícula"
                    className="border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm w-60" />
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                  <tr>
                    <th className="text-left px-3 py-2 w-10">Nº</th>
                    <th className="text-left px-3 py-2">Unidade</th>
                    <th className="text-left px-3 py-2">Situação geral</th>
                    <th className="text-left px-3 py-2">1º CRI</th>
                    <th className="text-left px-3 py-2">2º CRI</th>
                    <th className="text-left px-3 py-2">Ofícios</th>
                    <th className="text-left px-3 py-2">Proprietária</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {imoveisFiltrados.map(i => {
                    const regs = (c: ImovelEscola['cri1'] | ImovelEscola['cri2']) => [
                      c.matriculas.length && `${c.matriculas.length} matr.`,
                      c.transcricoes.length && `${c.transcricoes.length} transc.`,
                      c.outrosRegistros.length && `${c.outrosRegistros.length} outro(s)`,
                    ].filter(Boolean).join(' · ');
                    const ano = (c: { anos: number[] }) => (c.anos.length ? Math.max(...c.anos) : null);
                    return (
                      <tr key={i.chave} className="hover:bg-slate-50 align-top">
                        <td className="px-3 py-2 text-xs text-slate-500 tabular-nums">{i.numero || '—'}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {i.escola}
                          {i.documentos.length > 0 && (
                            <div className="text-[11px] font-normal text-slate-500 max-w-xs truncate" title={i.documentos.join(' · ')}>{i.documentos.join(' · ')}</div>
                          )}
                        </td>
                        <td className="px-3 py-2"><StatusBadge status={i.status} /></td>
                        <td className="px-3 py-2">
                          <Cri1Badge status={i.cri1.status} />
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {[regs(i.cri1), ano(i.cri1) && `certidão ${ano(i.cri1)}`].filter(Boolean).join(' · ')}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {i.cri2.status === 'nao_se_aplica'
                            ? <span className="text-xs text-slate-400">—</span>
                            : <>
                              <Cri2Badge status={i.cri2.status} />
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {[regs(i.cri2), ano(i.cri2) && `certidão ${ano(i.cri2)}`].filter(Boolean).join(' · ')}
                              </div>
                            </>}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{[...i.oficiosUre, ...i.oficiosCri].join(' · ') || '—'}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{i.proprietarias.join(', ') || '—'}</td>
                      </tr>
                    );
                  })}
                  {imoveisFiltrados.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400 text-sm">Nenhuma unidade encontrada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-xs text-slate-400 flex items-start gap-1.5">
            <Info size={13} className="mt-0.5 shrink-0" />
            Registros marcados na planilha como “2º CRI” ou “2º Cartório” contam para o 2º CRI; os demais, para o 1º CRI.
            Certidão “atualizada” = emitida em {ANO_CICLO_ATUAL} ou depois. Os números mensais vêm da última fotografia diária de cada mês.
          </p>
        </>
      )}
    </div>
  );
}
