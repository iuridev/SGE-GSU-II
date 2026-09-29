import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Landmark, RefreshCw, ExternalLink, FileDown, Loader2, Search, AlertTriangle, ArrowRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import { addTimbradoAllPages, TIMBRADO_HEADER_H, TIMBRADO_FOOTER_H } from '../lib/pdfTimbrado';
import {
  PLANILHA_CSV_URL, PLANILHA_URL, ANO_CICLO_ATUAL, STATUS_ORDEM, STATUS_INFO,
  parsePlanilha, resumir, montarSnapshot, compararSnapshots, ultimoSnapshotPorMes,
  type ImovelEscola, type ResumoRegularizacao, type Snapshot, type StatusImovel, type Movimentacao,
} from '../lib/regularizacaoImoveis';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const nomeMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`;
const nomeMesCurto = (ym: string) => `${MESES_CURTOS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mesAnterior(ym: string): string {
  const [a, m] = ym.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

type SnapResumo = Pick<Snapshot, 'data' | 'resumo'>;

function hexParaRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function StatusBadge({ status }: { status: StatusImovel }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 whitespace-nowrap">
      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: STATUS_INFO[status].cor }} />
      {STATUS_INFO[status].label}
    </span>
  );
}

export default function RegularizacaoImoveis() {
  const [imoveis, setImoveis] = useState<ImovelEscola[]>([]);
  const [snapshots, setSnapshots] = useState<SnapResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [avisoHistorico, setAvisoHistorico] = useState('');
  const [mesRelatorio, setMesRelatorio] = useState(hojeLocal().slice(0, 7));
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[] | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<StatusImovel | ''>('');
  const [busca, setBusca] = useState('');

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

  const dadosEvolucao = useMemo(() => [...resumoPorMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([ym, { resumo }]) => ({
      mes: nomeMesCurto(ym),
      ...Object.fromEntries(STATUS_ORDEM.map(s => [s, resumo.porStatus[s] || 0])),
    })), [resumoPorMes]);

  const dadosPorAno = useMemo(() => {
    const cont = new Map<number, number>();
    imoveis.forEach(i => {
      if (!i.anosAtualizacao.length) return;
      const ano = Math.max(...i.anosAtualizacao);
      cont.set(ano, (cont.get(ano) || 0) + 1);
    });
    return [...cont.entries()].sort(([a], [b]) => a - b).map(([ano, total]) => ({ ano: String(ano), total }));
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
    setMovimentacoes(null);
    carregarFotosDoMes(mesRelatorio).then(({ fim, inicio }) => {
      if (cancelado) return;
      setMovimentacoes(fim && inicio ? compararSnapshots(inicio, fim) : []);
    });
    return () => { cancelado = true; };
  }, [mesRelatorio, loading, imoveis.length, carregarFotosDoMes]);

  const imoveisFiltrados = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return imoveis.filter(i =>
      (!filtroStatus || i.status === filtroStatus)
      && (!q || i.escola.toUpperCase().includes(q) || i.documentos.join(' ').toUpperCase().includes(q)));
  }, [imoveis, filtroStatus, busca]);

  const gerarPdf = async () => {
    setGerandoPdf(true);
    try {
      const { fim, inicio } = await carregarFotosDoMes(mesRelatorio);
      if (!fim) { alert('Não há registro da situação neste mês.'); return; }
      const movs = inicio ? compararSnapshots(inicio, fim) : [];
      const r = fim.resumo;
      const rAnt = inicio?.resumo;

      const doc = new jsPDF('portrait');
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 14;
      let y = TIMBRADO_HEADER_H + 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('RELATÓRIO MENSAL — REGULARIZAÇÃO DE IMÓVEIS ESCOLARES', pageW / 2, y, { align: 'center' });
      y += 6;
      doc.setFontSize(11);
      doc.text(`Atualização de matrículas e regularização de terrenos — ${nomeMes(mesRelatorio)}`, pageW / 2, y, { align: 'center' });
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(90, 90, 90);
      const baseTxt = mesRelatorio === mesAtual
        ? `Situação em ${new Date().toLocaleDateString('pt-BR')} (mês em curso)`
        : `Situação em ${fim.data.split('-').reverse().join('/')}`;
      const compTxt = inicio ? ` · comparado a ${inicio.data.split('-').reverse().join('/')}` : ' · sem registro anterior para comparação';
      doc.text(baseTxt + compTxt, pageW / 2, y, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      y += 8;

      // Indicadores
      const linhaInd = (label: string, atual: number, anterior?: number) => {
        const delta = anterior === undefined ? '—' : `${atual - anterior >= 0 ? '+' : ''}${atual - anterior}`;
        return [label, String(atual), anterior === undefined ? '—' : String(anterior), delta];
      };
      autoTable(doc, {
        startY: y,
        head: [['Indicador', 'Fim do período', 'Período anterior', 'Variação']],
        body: [
          linhaInd('Unidades acompanhadas', r.total, rAnt?.total),
          linhaInd(`Certidões atualizadas (${ANO_CICLO_ATUAL}+)`, r.porStatus.atualizada, rAnt?.porStatus.atualizada),
          ['% de unidades com certidão atualizada', `${pct(r.porStatus.atualizada, r.total)}%`, rAnt ? `${pct(rAnt.porStatus.atualizada, rAnt.total)}%` : '—',
            rAnt ? `${pct(r.porStatus.atualizada, r.total) - pct(rAnt.porStatus.atualizada, rAnt.total) >= 0 ? '+' : ''}${pct(r.porStatus.atualizada, r.total) - pct(rAnt.porStatus.atualizada, rAnt.total)} p.p.` : '—'],
          linhaInd('Matrículas levantadas', r.matriculas, rAnt?.matriculas),
          linhaInd('Transcrições levantadas', r.transcricoes, rAnt?.transcricoes),
          linhaInd('Ofícios da URE emitidos', r.oficiosUre, rAnt?.oficiosUre),
          linhaInd('Ofícios ao CRI', r.oficiosCri, rAnt?.oficiosCri),
          linhaInd('Solicitações ao 2º CRI já feitas', r.solicitacoes2CriFeitas, rAnt?.solicitacoes2CriFeitas),
          linhaInd('Solicitações ao 2º CRI pendentes', r.solicitacoes2CriPendentes, rAnt?.solicitacoes2CriPendentes),
        ],
        styles: { fontSize: 8.5, cellPadding: 1.8 },
        headStyles: { fillColor: [51, 65, 85] },
        columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' } },
        margin: { left: margin, right: margin, top: TIMBRADO_HEADER_H + 6, bottom: TIMBRADO_FOOTER_H + 6 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      // Distribuição por situação (barras desenhadas direto no PDF)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Situação das unidades no fim do período', margin, y);
      y += 5;
      const barW = pageW - margin * 2 - 70;
      const maxV = Math.max(1, ...STATUS_ORDEM.map(s => r.porStatus[s] || 0));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      STATUS_ORDEM.forEach(s => {
        const v = r.porStatus[s] || 0;
        doc.setTextColor(0, 0, 0);
        doc.text(STATUS_INFO[s].label, margin, y + 3.2);
        doc.setFillColor(...hexParaRgb(STATUS_INFO[s].cor));
        if (v > 0) doc.rect(margin + 48, y, Math.max(0.8, (v / maxV) * barW), 4.2, 'F');
        doc.text(`${v} (${pct(v, r.total)}%)`, margin + 48 + (v / maxV) * barW + 2, y + 3.2);
        y += 6.2;
      });
      y += 4;

      // Movimentações do mês
      autoTable(doc, {
        startY: y,
        head: [['Movimentações no período', 'Situação anterior', 'Nova situação']],
        body: !inicio
          ? [['Sem registro anterior para comparação — as movimentações passam a ser apuradas a partir do próximo mês.', '', '']]
          : movs.length
            ? movs.map(m => [m.escola, m.de ? STATUS_INFO[m.de].label : 'Nova na planilha', STATUS_INFO[m.para].label])
            : [['Nenhuma unidade mudou de situação no período.', '', '']],
        styles: { fontSize: 8.5, cellPadding: 1.8 },
        headStyles: { fillColor: [51, 65, 85] },
        margin: { left: margin, right: margin, top: TIMBRADO_HEADER_H + 6, bottom: TIMBRADO_FOOTER_H + 6 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      // Situação por unidade no fim do período
      const detalhe = new Map(imoveis.map(i => [i.chave, i]));
      const linhas = Object.entries(fim.por_escola)
        .sort(([, a], [, b]) => STATUS_ORDEM.indexOf(a.status) - STATUS_ORDEM.indexOf(b.status) || a.escola.localeCompare(b.escola))
        .map(([chave, v]) => {
          const d = detalhe.get(chave);
          return [v.escola, STATUS_INFO[v.status].label, d?.proprietarias.join(', ') || '—', d?.oficiosCri.join(', ') || '—'];
        });
      autoTable(doc, {
        startY: y,
        head: [['Unidade', 'Situação', 'Proprietária*', 'Ofício CRI*']],
        body: linhas,
        styles: { fontSize: 7.5, cellPadding: 1.4 },
        headStyles: { fillColor: [51, 65, 85] },
        columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 38 } },
        margin: { left: margin, right: margin, top: TIMBRADO_HEADER_H + 6, bottom: TIMBRADO_FOOTER_H + 6 },
      });
      y = (doc as any).lastAutoTable.finalY + 5;
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      if (y > doc.internal.pageSize.getHeight() - TIMBRADO_FOOTER_H - 8) { doc.addPage(); y = TIMBRADO_HEADER_H + 8; }
      doc.text(`* Conforme a planilha na data de emissão (${new Date().toLocaleDateString('pt-BR')}). Fonte: planilha de regularização mantida pelo servidor responsável.`, margin, y);

      addTimbradoAllPages(doc);
      doc.save(`Relatorio_Regularizacao_Imoveis_${mesRelatorio}.pdf`);
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
  const mesAntRes = resumoPorMes.get(mesAnterior(mesAtual))?.resumo;
  const deltaAtualizadas = mesAntRes ? r.porStatus.atualizada - mesAntRes.porStatus.atualizada : null;

  const kpis = [
    { label: 'Certidões atualizadas', valor: `${r.porStatus.atualizada}`, sub: `${pct(r.porStatus.atualizada, r.total)}% de ${r.total} unidades`,
      extra: deltaAtualizadas !== null ? `${deltaAtualizadas >= 0 ? '+' : ''}${deltaAtualizadas} vs mês anterior` : null },
    { label: 'Unidades com levantamento', valor: `${iniciadas}`, sub: `${r.porStatus.nao_iniciada} ainda sem lançamento` },
    { label: 'Matrículas / transcrições', valor: `${r.matriculas + r.transcricoes}`, sub: `${r.matriculas} matrículas · ${r.transcricoes} transcrições` },
    { label: 'Ofícios emitidos', valor: `${r.oficiosUre + r.oficiosCri}`, sub: `${r.oficiosUre} da URE · ${r.oficiosCri} ao CRI` },
    { label: 'Dependem do 2º CRI', valor: `${r.porStatus.aguardando_2cri}`, sub: `${r.solicitacoes2CriFeitas} já solicitadas · ${r.solicitacoes2CriPendentes} a solicitar` },
  ];

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
            Regularização de terrenos e atualização de matrículas das unidades escolares — dados lidos da planilha do servidor responsável
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={carregar} className="flex items-center gap-2 px-3 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 text-sm">
            <RefreshCw size={16} /> Atualizar
          </button>
          <a href={PLANILHA_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 text-sm font-medium">
            <ExternalLink size={16} /> Abrir Planilha
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
          {/* Relatório mensal */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm font-semibold text-slate-700" htmlFor="mes-relatorio">Relatório do mês</label>
              <select id="mes-relatorio" value={mesRelatorio} onChange={e => setMesRelatorio(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                {mesesDisponiveis.map(ym => <option key={ym} value={ym}>{nomeMes(ym)}</option>)}
              </select>
            </div>
            <button onClick={gerarPdf} disabled={gerandoPdf}
              className="flex items-center gap-2 px-4 py-2 bg-amber-700 text-white rounded-lg hover:bg-amber-800 disabled:opacity-60 text-sm font-medium">
              {gerandoPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
              Baixar relatório (PDF)
            </button>
          </div>

          {/* Indicadores */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {kpis.map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{k.label}</p>
                <p className="text-3xl font-bold text-slate-800 mt-1 tabular-nums">{k.valor}</p>
                <p className="text-xs text-slate-500 mt-1">{k.sub}</p>
                {k.extra && <p className="text-xs font-semibold text-slate-700 mt-1">{k.extra}</p>}
              </div>
            ))}
          </div>

          {/* Barra de progresso por situação */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h2 className="text-sm font-bold text-slate-700 mb-3">Situação atual das {r.total} unidades</h2>
            <div className="flex h-6 rounded-md overflow-hidden gap-[2px] bg-white">
              {STATUS_ORDEM.filter(s => r.porStatus[s] > 0).map(s => (
                <button key={s} type="button" onClick={() => setFiltroStatus(filtroStatus === s ? '' : s)}
                  title={`${STATUS_INFO[s].label}: ${r.porStatus[s]} (${pct(r.porStatus[s], r.total)}%)`}
                  style={{ width: `${(r.porStatus[s] / r.total) * 100}%`, background: STATUS_INFO[s].cor }}
                  className="h-full hover:opacity-80 transition-opacity" />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">
              {STATUS_ORDEM.map(s => (
                <button key={s} type="button" onClick={() => setFiltroStatus(filtroStatus === s ? '' : s)}
                  className={`text-left ${filtroStatus && filtroStatus !== s ? 'opacity-40' : ''}`} title={STATUS_INFO[s].descricao}>
                  <StatusBadge status={s} />
                  <span className="text-xs text-slate-500 ml-1.5 tabular-nums">{r.porStatus[s]} · {pct(r.porStatus[s], r.total)}%</span>
                </button>
              ))}
            </div>
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:col-span-2">
              <h2 className="text-sm font-bold text-slate-700">Evolução mensal por situação</h2>
              <p className="text-xs text-slate-500 mb-3">Quantidade de unidades em cada situação no fim de cada mês</p>
              {avisoHistorico && <p className="text-xs text-amber-700 mb-2">{avisoHistorico}</p>}
              {dadosEvolucao.length < 2 && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2 mb-2">
                  A planilha não registra datas, então o histórico é montado a partir de uma fotografia diária tirada quando a página é aberta.
                  A curva ganha um ponto por mês a partir de agora.
                </p>
              )}
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dadosEvolucao} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v, name) => [v as number, STATUS_INFO[name as StatusImovel]?.label ?? name]} />
                  <Legend formatter={(v) => <span className="text-xs text-slate-600">{STATUS_INFO[v as StatusImovel]?.label ?? v}</span>} iconType="square" iconSize={10} />
                  {STATUS_ORDEM.map((s, i) => (
                    <Bar key={s} dataKey={s} stackId="a" fill={STATUS_INFO[s].cor} stroke="#fff" strokeWidth={1}
                      radius={i === STATUS_ORDEM.length - 1 ? [4, 4, 0, 0] : undefined} maxBarSize={56} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h2 className="text-sm font-bold text-slate-700">Ano da última atualização da certidão</h2>
              <p className="text-xs text-slate-500 mb-3">Unidades por ano informado na coluna "Atualização"</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dadosPorAno} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="ano" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v) => [v as number, 'Unidades']} />
                  <Bar dataKey="total" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={48}
                    label={{ position: 'top', fontSize: 11, fill: '#334155' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h2 className="text-sm font-bold text-slate-700">Proprietária do imóvel</h2>
              <p className="text-xs text-slate-500 mb-3">Unidades já levantadas (uma unidade pode ter mais de uma)</p>
              <ResponsiveContainer width="100%" height={Math.max(160, dadosProprietarias.length * 34)}>
                <BarChart data={dadosProprietarias} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="nome" width={120} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(v) => [v as number, 'Unidades']} />
                  <Bar dataKey="total" fill="#2a78d6" radius={[0, 4, 4, 0]} barSize={16}
                    label={{ position: 'right', fontSize: 11, fill: '#334155' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:col-span-2">
              <h2 className="text-sm font-bold text-slate-700">Movimentações em {nomeMes(mesRelatorio)}</h2>
              <p className="text-xs text-slate-500 mb-3">Unidades que mudaram de situação no mês escolhido acima</p>
              {movimentacoes === null ? (
                <Loader2 className="animate-spin text-slate-400" size={20} />
              ) : movimentacoes.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nenhuma mudança registrada no período (ou ainda não há fotografia anterior para comparar).
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {movimentacoes.map(m => (
                    <li key={m.chave} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-sm font-medium text-slate-700">{m.escola}</span>
                      <span className="flex items-center gap-2">
                        {m.de ? <StatusBadge status={m.de} /> : <span className="text-xs text-slate-500">Nova</span>}
                        <ArrowRight size={14} className="text-slate-400" />
                        <StatusBadge status={m.para} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Tabela por unidade */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-4 flex items-center justify-between flex-wrap gap-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-700">
                Unidades {filtroStatus && <>— {STATUS_INFO[filtroStatus].label}</>} ({imoveisFiltrados.length})
              </h2>
              <div className="flex gap-2 flex-wrap">
                <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as StatusImovel | '')}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Todas as situações</option>
                  {STATUS_ORDEM.map(s => <option key={s} value={s}>{STATUS_INFO[s].label}</option>)}
                </select>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar escola ou matrícula"
                    className="border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm w-56" />
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Unidade</th>
                    <th className="text-left px-4 py-2">Situação</th>
                    <th className="text-left px-4 py-2">Matrículas / transcrições</th>
                    <th className="text-left px-4 py-2">Ofícios</th>
                    <th className="text-left px-4 py-2">Atualização</th>
                    <th className="text-left px-4 py-2">Proprietária</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {imoveisFiltrados.map(i => (
                    <tr key={i.chave} className="hover:bg-slate-50 align-top">
                      <td className="px-4 py-2 font-medium text-slate-800">{i.escola}</td>
                      <td className="px-4 py-2"><StatusBadge status={i.status} /></td>
                      <td className="px-4 py-2 text-xs text-slate-600 max-w-xs">{i.documentos.join(' · ') || '—'}</td>
                      <td className="px-4 py-2 text-xs text-slate-600 whitespace-nowrap">
                        {[...i.oficiosUre, ...i.oficiosCri].join(' · ') || '—'}
                        {i.solicitar2Cri && (
                          <div className={i.solicitado2Cri ? 'text-slate-500' : 'text-orange-700 font-semibold'}>
                            2º CRI: {i.solicitado2Cri ? 'solicitado' : 'a solicitar'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600 tabular-nums">{i.anosAtualizacao.length ? Math.max(...i.anosAtualizacao) : '—'}</td>
                      <td className="px-4 py-2 text-xs text-slate-600">{i.proprietarias.join(', ') || '—'}</td>
                    </tr>
                  ))}
                  {imoveisFiltrados.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400 text-sm">Nenhuma unidade encontrada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
