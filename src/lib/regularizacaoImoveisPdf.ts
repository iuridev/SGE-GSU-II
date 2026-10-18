// Relatório mensal em PDF da Regularização de Imóveis: compara a fotografia do
// fim do mês escolhido com a do fim do mês anterior, com indicadores gerais e
// separados por cartório (1º e 2º CRI), movimentações e pendências.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addTimbradoAllPages, TIMBRADO_HEADER_H, TIMBRADO_FOOTER_H } from './pdfTimbrado';
import {
  ANO_CICLO_ATUAL, STATUS_ORDEM, STATUS_INFO,
  STATUS_CRI1_ORDEM, STATUS_CRI1_INFO, STATUS_CRI2_ORDEM, STATUS_CRI2_INFO,
  compararSnapshots, compararCartorio,
  type ImovelEscola, type ResumoCartorio, type Snapshot, type StatusCri1, type StatusCri2,
} from './regularizacaoImoveis';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`;
const nomeMesCurto = (ym: string) => `${MESES_CURTOS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const dataBr = (iso: string) => iso.split('-').reverse().join('/');
const sinal = (n: number) => `${n > 0 ? '+' : ''}${n}`;

const COR_CABECALHO: [number, number, number] = [51, 65, 85];
const COR_1CRI: [number, number, number] = [42, 120, 214];
const COR_2CRI: [number, number, number] = [235, 104, 52];

function hexParaRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface DadosRelatorio {
  ym: string;
  emCurso: boolean;
  fim: Snapshot;
  inicio: Snapshot | null;
  imoveis: ImovelEscola[];
  // Série mensal (crescente) de certidões atualizadas, para o mini-gráfico.
  serie: { ym: string; atualizadas: number; total: number }[];
  projecao: { ritmo: number; conclusao: string | null } | null;
}

export function gerarRelatorioRegularizacaoPdf(d: DadosRelatorio): void {
  const { fim, inicio, imoveis, ym } = d;
  const r = fim.resumo;
  const rAnt = inicio?.resumo;
  const doc = new jsPDF('portrait');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const larguraUtil = pageW - margin * 2;
  const topo = TIMBRADO_HEADER_H + 8;
  const limite = pageH - TIMBRADO_FOOTER_H - 8;
  const margemTabela = { left: margin, right: margin, top: TIMBRADO_HEADER_H + 6, bottom: TIMBRADO_FOOTER_H + 6 };
  let y = topo;

  const garantirEspaco = (h: number) => {
    if (y + h > limite) { doc.addPage(); y = topo; }
  };
  // `reserva` = altura mínima do conteúdo que vem logo abaixo, para o título
  // nunca ficar sozinho no pé da página.
  const tituloSecao = (txt: string, cor: [number, number, number] = COR_CABECALHO, reserva = 24) => {
    garantirEspaco(8 + reserva);
    doc.setFillColor(...cor);
    doc.rect(margin, y - 3.6, 1.6, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(30, 41, 59);
    doc.text(txt, margin + 4, y);
    doc.setTextColor(0, 0, 0);
    y += 4;
  };
  const posTabela = () => { y = (doc as any).lastAutoTable.finalY + 8; };

  // ── Cabeçalho ──────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('RELATÓRIO MENSAL — REGULARIZAÇÃO DE IMÓVEIS ESCOLARES', pageW / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(11);
  doc.text(`Matrículas, transcrições e certidões junto ao 1º e ao 2º CRI — ${nomeMes(ym)}`, pageW / 2, y, { align: 'center' });
  y += 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  const baseTxt = d.emCurso
    ? `Situação em ${new Date().toLocaleDateString('pt-BR')} (mês em curso)`
    : `Situação em ${dataBr(fim.data)}`;
  const compTxt = inicio ? ` · comparada a ${dataBr(inicio.data)}` : ' · sem registro anterior para comparação';
  doc.text(baseTxt + compTxt, pageW / 2, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 7;

  // ── Quadro de destaques ────────────────────────────────────────────────
  const cri1 = r.cri1;
  const cri2 = r.cri2;
  const comRegistro1 = cri1 ? cri1.porStatus.atualizada + cri1.porStatus.desatualizada + cri1.porStatus.em_pesquisa + cri1.porStatus.nao_localizado : 0;
  const destaques: { titulo: string; valor: string; sub: string; delta?: string }[] = [
    {
      titulo: 'Certidões atualizadas', valor: String(r.porStatus.atualizada), sub: `${pct(r.porStatus.atualizada, r.total)}% de ${r.total} unidades`,
      delta: rAnt ? `${sinal(r.porStatus.atualizada - rAnt.porStatus.atualizada)} no mês` : undefined,
    },
    {
      titulo: 'Sem levantamento', valor: String(r.porStatus.nao_iniciada), sub: `${pct(r.porStatus.nao_iniciada, r.total)}% das unidades`,
      delta: rAnt ? `${sinal(r.porStatus.nao_iniciada - rAnt.porStatus.nao_iniciada)} no mês` : undefined,
    },
    {
      titulo: '1º CRI — atualizadas', valor: cri1 ? String(cri1.porStatus.atualizada) : '—',
      sub: cri1 ? `${pct(cri1.porStatus.atualizada, comRegistro1)}% dos ${comRegistro1} com registro` : 'sem dado no período',
      delta: cri1 && rAnt?.cri1 ? `${sinal(cri1.porStatus.atualizada - rAnt.cri1.porStatus.atualizada)} no mês` : undefined,
    },
    {
      titulo: '2º CRI — demandas', valor: cri2 ? String(cri2.unidades) : '—',
      sub: cri2 ? `${cri2.porStatus.aguardando} aguardando · ${cri2.porStatus.a_solicitar} a solicitar` : 'sem dado no período',
      delta: cri2 && rAnt?.cri2 ? `${sinal(cri2.porStatus.atualizada - rAnt.cri2.porStatus.atualizada)} certidões no mês` : undefined,
    },
  ];
  const gap = 3;
  const boxW = (larguraUtil - gap * (destaques.length - 1)) / destaques.length;
  const boxH = 22;
  destaques.forEach((k, i) => {
    const x = margin + i * (boxW + gap);
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, boxW, boxH, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(k.titulo.toUpperCase(), x + 3, y + 5);
    doc.setFontSize(15);
    doc.setTextColor(30, 41, 59);
    doc.text(k.valor, x + 3, y + 12.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(k.sub, x + 3, y + 16.8, { maxWidth: boxW - 5 });
    if (k.delta) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text(k.delta, x + boxW - 3, y + 12.5, { align: 'right' });
    }
  });
  doc.setTextColor(0, 0, 0);
  y += boxH + 7;

  // ── Resumo executivo ───────────────────────────────────────────────────
  tituloSecao('Resumo executivo');
  const frases: string[] = [];
  frases.push(`Ao fim de ${nomeMes(ym)}, ${r.porStatus.atualizada} das ${r.total} unidades acompanhadas (${pct(r.porStatus.atualizada, r.total)}%) estavam com certidão de matrícula/transcrição atualizada em ${ANO_CICLO_ATUAL} ou depois`
    + (rAnt ? `, ${r.porStatus.atualizada - rAnt.porStatus.atualizada === 0 ? 'mesmo número do período anterior' : `${sinal(r.porStatus.atualizada - rAnt.porStatus.atualizada)} em relação ao período anterior`}.` : '.'));
  if (cri1) {
    frases.push(`No 1º Cartório de Registro de Imóveis, ${cri1.unidades} unidades já foram pesquisadas: ${comRegistro1} têm registro localizado (${cri1.porStatus.atualizada} com certidão atualizada e ${cri1.porStatus.desatualizada} com certidão anterior ao ciclo) e ${cri1.porStatus.nao_consta} não constam no 1º CRI.`);
  }
  if (cri2) {
    frases.push(`No 2º Cartório de Registro de Imóveis há ${cri2.unidades} unidades com demanda: ${cri2.porStatus.aguardando} aguardando certidão, ${cri2.porStatus.a_solicitar} ainda a solicitar e ${cri2.porStatus.atualizada + cri2.porStatus.desatualizada} com registro já identificado.`);
  }
  if (r.porStatus.nao_iniciada > 0) frases.push(`${r.porStatus.nao_iniciada} unidades ainda não têm nenhum lançamento na planilha.`);
  if (d.projecao?.conclusao) {
    frases.push(`No ritmo médio observado (${d.projecao.ritmo.toFixed(1).replace('.', ',')} certidões/mês), a atualização de todas as unidades seria concluída por volta de ${nomeMes(d.projecao.conclusao)}.`);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  const linhasResumo = doc.splitTextToSize(frases.join(' '), larguraUtil);
  garantirEspaco(linhasResumo.length * 4.2);
  doc.text(linhasResumo, margin, y + 1);
  y += linhasResumo.length * 4.2 + 6;

  // ── Indicadores gerais ─────────────────────────────────────────────────
  const linhaInd = (label: string, atual: number | undefined, anterior: number | undefined) => [
    label,
    atual === undefined ? '—' : String(atual),
    anterior === undefined ? '—' : String(anterior),
    atual === undefined || anterior === undefined ? '—' : sinal(atual - anterior),
  ];
  const tabelaIndicadores = (body: string[][], cor: [number, number, number]) => {
    autoTable(doc, {
      startY: y,
      head: [['Indicador', 'Fim do período', 'Período anterior', 'Variação']],
      body,
      styles: { fontSize: 8.3, cellPadding: 1.6 },
      headStyles: { fillColor: cor },
      columnStyles: { 0: { cellWidth: 92 }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center', fontStyle: 'bold' } },
      margin: margemTabela,
    });
    posTabela();
  };

  tituloSecao('Indicadores gerais', COR_CABECALHO, 70);
  const pAt = pct(r.porStatus.atualizada, r.total);
  const pAnt = rAnt ? pct(rAnt.porStatus.atualizada, rAnt.total) : undefined;
  tabelaIndicadores([
    linhaInd('Unidades acompanhadas', r.total, rAnt?.total),
    linhaInd(`Certidões atualizadas (${ANO_CICLO_ATUAL}+)`, r.porStatus.atualizada, rAnt?.porStatus.atualizada),
    ['% de unidades com certidão atualizada', `${pAt}%`, pAnt === undefined ? '—' : `${pAnt}%`, pAnt === undefined ? '—' : `${sinal(pAt - pAnt)} p.p.`],
    linhaInd('Certidões desatualizadas', r.porStatus.desatualizada, rAnt?.porStatus.desatualizada),
    linhaInd('Unidades sem levantamento', r.porStatus.nao_iniciada, rAnt?.porStatus.nao_iniciada),
    linhaInd('Matrículas levantadas', r.matriculas, rAnt?.matriculas),
    linhaInd('Transcrições levantadas', r.transcricoes, rAnt?.transcricoes),
    linhaInd('Ofícios da URE emitidos', r.oficiosUre, rAnt?.oficiosUre),
    linhaInd('Ofícios respondidos pelo CRI', r.oficiosCri, rAnt?.oficiosCri),
  ], COR_CABECALHO);

  // Barras de situação (desenhadas no próprio PDF)
  const barras = (itens: { label: string; valor: number; cor: string }[], total: number) => {
    garantirEspaco(itens.length * 6 + 4);
    const barW = larguraUtil - 76;
    const maxV = Math.max(1, ...itens.map(i => i.valor));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    itens.forEach(it => {
      doc.setTextColor(0, 0, 0);
      doc.text(it.label, margin, y + 3.2);
      doc.setFillColor(226, 232, 240);
      doc.rect(margin + 50, y, barW, 4.2, 'F');
      doc.setFillColor(...hexParaRgb(it.cor));
      if (it.valor > 0) doc.rect(margin + 50, y, Math.max(0.8, (it.valor / maxV) * barW), 4.2, 'F');
      doc.text(`${it.valor} (${pct(it.valor, total)}%)`, margin + 52 + barW, y + 3.2);
      y += 6;
    });
    y += 4;
  };

  tituloSecao('Situação geral das unidades no fim do período', COR_CABECALHO, STATUS_ORDEM.length * 6 + 4);
  barras(STATUS_ORDEM.map(s => ({ label: STATUS_INFO[s].label, valor: r.porStatus[s] || 0, cor: STATUS_INFO[s].cor })), r.total);

  // Evolução mensal das certidões atualizadas (até 12 meses)
  if (d.serie.length >= 2) {
    const serie = d.serie.slice(-12);
    const h = 30;
    tituloSecao('Evolução das certidões atualizadas', COR_CABECALHO, h + 12);
    garantirEspaco(h + 12);
    const maxV = Math.max(1, ...serie.map(s => s.total));
    const colW = larguraUtil / serie.length;
    const barW = Math.min(12, colW * 0.55);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + h, margin + larguraUtil, y + h);
    serie.forEach((s, i) => {
      const cx = margin + colW * i + colW / 2;
      const bh = (s.atualizadas / maxV) * h;
      doc.setFillColor(27, 175, 122);
      if (bh > 0) doc.rect(cx - barW / 2, y + h - bh, barW, bh, 'F');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text(String(s.atualizadas), cx, y + h - bh - 1.5, { align: 'center' });
      doc.setTextColor(100, 116, 139);
      doc.text(nomeMesCurto(s.ym), cx, y + h + 4, { align: 'center' });
    });
    doc.setTextColor(0, 0, 0);
    y += h + 10;
  }

  // ── Por cartório ───────────────────────────────────────────────────────
  const secaoCartorio = <S extends string>(
    titulo: string, cor: [number, number, number],
    atual: ResumoCartorio<S> | undefined, anterior: ResumoCartorio<S> | undefined,
    ordem: S[], info: Record<S, { label: string; cor: string }>, rotuloUnidades: string, extras: string[][],
    semDemanda?: S,
  ) => {
    // Tabela + barras juntas na mesma página sempre que couberem.
    const linhasTabela = 1 + ordem.length + 2 + extras.length;
    tituloSecao(titulo, cor, (linhasTabela + 1) * 6.4 + 8 + ordem.length * 6 + 4);
    if (!atual) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.text('Indicadores por cartório só existem nas fotografias gravadas a partir de outubro/2026.', margin, y + 1);
      y += 8;
      return;
    }
    tabelaIndicadores([
      linhaInd(rotuloUnidades, atual.unidades, anterior?.unidades),
      ...ordem.filter(s => s !== semDemanda).map(s => linhaInd(info[s].label, atual.porStatus[s], anterior?.porStatus[s])),
      linhaInd('Matrículas identificadas', atual.matriculas, anterior?.matriculas),
      linhaInd('Transcrições identificadas', atual.transcricoes, anterior?.transcricoes),
      ...extras,
    ], cor);
    // Percentuais sobre as unidades com demanda quando há uma categoria "sem demanda".
    const itensBarra = ordem.filter(s => s !== semDemanda);
    barras(itensBarra.map(s => ({ label: info[s].label, valor: atual.porStatus[s] || 0, cor: info[s].cor })),
      semDemanda ? atual.unidades : r.total);
  };

  secaoCartorio('1º Cartório de Registro de Imóveis (1º CRI)', COR_1CRI, r.cri1, rAnt?.cri1,
    STATUS_CRI1_ORDEM, STATUS_CRI1_INFO, 'Unidades pesquisadas no 1º CRI', [linhaInd('Ofícios respondidos pelo 1º CRI', r.cri1?.oficios, rAnt?.cri1?.oficios)]);
  secaoCartorio('2º Cartório de Registro de Imóveis (2º CRI)', COR_2CRI, r.cri2, rAnt?.cri2,
    STATUS_CRI2_ORDEM, STATUS_CRI2_INFO, 'Unidades com demanda no 2º CRI', [
      linhaInd('Solicitações ao 2º CRI já feitas', r.solicitacoes2CriFeitas, rAnt?.solicitacoes2CriFeitas),
      linhaInd('Solicitações ao 2º CRI pendentes', r.solicitacoes2CriPendentes, rAnt?.solicitacoes2CriPendentes),
    ], 'nao_se_aplica');

  // ── Movimentações ──────────────────────────────────────────────────────
  tituloSecao('Movimentações no período');
  const movs: string[][] = [];
  if (inicio) {
    compararSnapshots(inicio, fim).forEach(m => movs.push([m.escola, 'Geral', m.de ? STATUS_INFO[m.de].label : 'Nova na planilha', STATUS_INFO[m.para].label]));
    compararCartorio(inicio, fim, 'cri1').forEach(m => movs.push([m.escola, '1º CRI', m.de ? STATUS_CRI1_INFO[m.de].label : 'Nova na planilha', STATUS_CRI1_INFO[m.para].label]));
    compararCartorio(inicio, fim, 'cri2').forEach(m => movs.push([m.escola, '2º CRI', m.de ? STATUS_CRI2_INFO[m.de].label : 'Nova na planilha', STATUS_CRI2_INFO[m.para].label]));
    movs.sort((a, b) => a[0].localeCompare(b[0]));
  }
  autoTable(doc, {
    startY: y,
    head: [['Unidade', 'Âmbito', 'Situação anterior', 'Nova situação']],
    body: !inicio
      ? [[{ content: 'Sem registro anterior para comparação — as movimentações passam a ser apuradas a partir do próximo mês.', colSpan: 4 }]]
      : movs.length ? movs : [[{ content: 'Nenhuma unidade mudou de situação no período.', colSpan: 4 }]],
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: COR_CABECALHO },
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 18 } },
    margin: margemTabela,
  });
  posTabela();

  // ── Pendências (situação atual da planilha) ────────────────────────────
  // As listas nominais vêm da planilha na data de emissão; os números acima
  // vêm da fotografia do período.
  const nomes = (f: (i: ImovelEscola) => boolean) => imoveis.filter(f).map(i => i.escola).sort();
  const pendencias: [string, string[]][] = [
    ['Solicitar certidão ao 2º CRI', nomes(i => i.cri2.status === 'a_solicitar')],
    ['Aguardando certidão do 2º CRI', nomes(i => i.cri2.status === 'aguardando')],
    ['Renovar certidão desatualizada', nomes(i => i.status === 'desatualizada')],
    ['Registro não localizado (verificar)', nomes(i => i.status === 'nao_localizada')],
    ['Iniciar levantamento', nomes(i => i.status === 'nao_iniciada')],
  ];
  tituloSecao('Pendências e próximas ações', COR_CABECALHO, 30);
  autoTable(doc, {
    startY: y,
    head: [['Ação', 'Qtd.', 'Unidades']],
    body: pendencias.filter(([, l]) => l.length).map(([acao, l]) => [acao, String(l.length), l.join('; ')]),
    styles: { fontSize: 7.6, cellPadding: 1.6, valign: 'top' },
    headStyles: { fillColor: COR_CABECALHO },
    columnStyles: { 0: { cellWidth: 46, fontStyle: 'bold' }, 1: { cellWidth: 12, halign: 'center' } },
    margin: margemTabela,
  });
  posTabela();

  // ── Situação por unidade ───────────────────────────────────────────────
  tituloSecao('Situação por unidade no fim do período', COR_CABECALHO, 40);
  const detalhe = new Map(imoveis.map(i => [i.chave, i]));
  const linhas = Object.entries(fim.por_escola)
    .sort(([, a], [, b]) => STATUS_ORDEM.indexOf(a.status) - STATUS_ORDEM.indexOf(b.status) || a.escola.localeCompare(b.escola))
    .map(([chave, v]) => {
      const det = detalhe.get(chave);
      return [
        det?.numero || '—',
        v.escola,
        STATUS_INFO[v.status].label,
        v.cri1 ? STATUS_CRI1_INFO[v.cri1 as StatusCri1].label : '—',
        v.cri2 && v.cri2 !== 'nao_se_aplica' ? STATUS_CRI2_INFO[v.cri2 as StatusCri2].label : '—',
        det?.proprietarias.join(', ') || '—',
      ];
    });
  autoTable(doc, {
    startY: y,
    head: [['Nº*', 'Unidade', 'Situação geral', '1º CRI', '2º CRI', 'Proprietária*']],
    body: linhas,
    styles: { fontSize: 7, cellPadding: 1.3 },
    headStyles: { fillColor: COR_CABECALHO },
    columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 56 }, 2: { cellWidth: 30 }, 3: { cellWidth: 30 }, 4: { cellWidth: 28 } },
    margin: margemTabela,
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  // ── Nota metodológica ──────────────────────────────────────────────────
  const nota = [
    '* Conforme a planilha na data de emissão. Fonte: planilha de regularização mantida pelo servidor responsável.',
    `Metodologia: a planilha não registra datas; os números de cada mês vêm da última fotografia diária do mês. Certidão "atualizada" = emitida em ${ANO_CICLO_ATUAL} ou depois. `
      + 'Registros marcados como "2º CRI"/"2º Cartório" contam para o 2º CRI; os demais, para o 1º CRI. "Não consta no 1º CRI" = resposta negativa do 1º cartório.',
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  const linhasNota = doc.splitTextToSize(nota.join(' '), larguraUtil);
  garantirEspaco(linhasNota.length * 3.2);
  doc.text(linhasNota, margin, y);

  addTimbradoAllPages(doc);

  // Paginação e data de emissão no rodapé
  const total: number = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(110, 110, 110);
    doc.text(`Emitido em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`, margin, pageH - 3);
    doc.text(`Página ${i} de ${total}`, pageW - margin, pageH - 3, { align: 'right' });
  }

  doc.save(`Relatorio_Regularizacao_Imoveis_${ym}.pdf`);
}
