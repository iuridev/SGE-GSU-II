import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addTimbradoAllPages, TIMBRADO_HEADER_H, TIMBRADO_FOOTER_H } from './pdfTimbrado';

export interface RelatorioAcessoData {
  periodoLabel: string;
  comparaAnterior: boolean;
  totalEventos: number;
  kpis: { label: string; value: string; hint: string; delta: string }[];
  diario: { label: string; ativos: number; visitas: number; logins: number }[];
  porHora: { label: string; value: number }[];
  porDiaSemana: { label: string; value: number }[];
  adesao: { label: string; ativos: number; total: number; pct: number }[];
  topUsuarios: { nome: string; perfil: string; visitas: number; tempo: string; navegacoes: number }[];
  topPaginas: { label: string; total: number; usuarios: number }[];
  semAcesso: { nome: string; perfil: string; situacao: string; ultimo: string }[];
  semAcessoTotal: number;
  inativoDias: number;
}

type RGB = [number, number, number];
const TEAL: RGB = [13, 148, 136];
const BLUE: RGB = [59, 130, 246];
const INDIGO: RGB = [99, 102, 241];
const SLATE_900: RGB = [15, 23, 42];
const SLATE_500: RGB = [100, 116, 139];
const SLATE_200: RGB = [226, 232, 240];
const SLATE_50: RGB = [248, 250, 252];

const MARGIN = 14;
const START_Y = TIMBRADO_HEADER_H + 6;

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function drawAxes(doc: jsPDF, x: number, y: number, w: number, h: number, max: number) {
  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...SLATE_500);
  for (let i = 0; i <= 4; i++) {
    const gy = y + h - (h * i) / 4;
    doc.line(x, gy, x + w, gy);
    doc.text(String(Math.round((max * i) / 4)), x - 1.5, gy + 1, { align: 'right' });
  }
}

function barChart(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  data: { label: string; value: number }[], color: RGB, labelEvery = 1,
) {
  const plotX = x + 8;
  const plotW = w - 8;
  const plotH = h - 8;
  const max = niceMax(Math.max(...data.map(d => d.value), 0));
  drawAxes(doc, plotX, y, plotW, plotH, max);
  const slot = plotW / data.length;
  const bw = slot * 0.62;
  data.forEach((d, i) => {
    const bh = (d.value / max) * plotH;
    const bx = plotX + i * slot + (slot - bw) / 2;
    if (bh > 0) {
      doc.setFillColor(...color);
      doc.rect(bx, y + plotH - bh, bw, bh, 'F');
      doc.setFontSize(data.length > 12 ? 5 : 6.5);
      doc.setTextColor(...SLATE_900);
      doc.text(String(d.value), bx + bw / 2, y + plotH - bh - 0.8, { align: 'center' });
    }
    if (i % labelEvery === 0) {
      doc.setFontSize(6);
      doc.setTextColor(...SLATE_500);
      doc.text(d.label, bx + bw / 2, y + plotH + 4, { align: 'center' });
    }
  });
}

function lineChart(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  labels: string[], series: { name: string; color: RGB; values: number[] }[],
) {
  // legenda
  let lx = x + 8;
  doc.setFontSize(7);
  series.forEach(s => {
    doc.setFillColor(...s.color);
    doc.rect(lx, y + 0.5, 3, 3, 'F');
    doc.setTextColor(...SLATE_900);
    doc.text(s.name, lx + 4.5, y + 3);
    lx += 8 + doc.getTextWidth(s.name);
  });

  const top = y + 7;
  const plotX = x + 8;
  const plotW = w - 8;
  const plotH = h - 7 - 8;
  const max = niceMax(Math.max(...series.flatMap(s => s.values), 0));
  drawAxes(doc, plotX, top, plotW, plotH, max);

  const n = labels.length;
  const px = (i: number) => plotX + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const py = (v: number) => top + plotH - (v / max) * plotH;

  series.forEach(s => {
    doc.setDrawColor(...s.color);
    doc.setLineWidth(0.5);
    for (let i = 1; i < n; i++) doc.line(px(i - 1), py(s.values[i - 1]), px(i), py(s.values[i]));
    if (n <= 31) {
      doc.setFillColor(...s.color);
      s.values.forEach((v, i) => doc.circle(px(i), py(v), 0.6, 'F'));
    }
  });

  const every = Math.max(1, Math.ceil(n / 12));
  doc.setFontSize(6);
  doc.setTextColor(...SLATE_500);
  labels.forEach((l, i) => {
    if (i % every === 0) doc.text(l, px(i), top + plotH + 4, { align: 'center' });
  });
}

export function gerarPdfMetricasAcesso(data: RelatorioAcessoData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const limitY = pageH - TIMBRADO_FOOTER_H - 4;
  let y = START_Y;

  const need = (h: number) => {
    if (y + h > limitY) { doc.addPage(); y = START_Y; }
  };

  const section = (title: string, subtitle?: string) => {
    need(subtitle ? 16 : 12);
    doc.setFillColor(...TEAL);
    doc.rect(MARGIN, y - 3.5, 1.2, subtitle ? 8.5 : 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...SLATE_900);
    doc.text(title, MARGIN + 3.5, y);
    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE_500);
      doc.text(subtitle, MARGIN + 3.5, y + 4);
      y += 4;
    }
    y += 5;
  };

  // ---- Título ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...SLATE_900);
  doc.text('RELATÓRIO DE MÉTRICAS DE ACESSO — SGE', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_500);
  doc.text(
    `Período: ${data.periodoLabel}  ·  Emitido em ${new Date().toLocaleString('pt-BR')}  ·  ${data.totalEventos.toLocaleString('pt-BR')} eventos analisados`,
    MARGIN, y + 6,
  );
  y += 13;

  // ---- KPIs (grade 3 x 2) ----
  const gap = 4;
  const kw = (contentW - gap * 2) / 3;
  const kh = 26;
  need(kh * 2 + gap + 4);
  data.kpis.forEach((k, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const kx = MARGIN + col * (kw + gap);
    const ky = y + row * (kh + gap);
    doc.setFillColor(...SLATE_50);
    doc.setDrawColor(...SLATE_200);
    doc.setLineWidth(0.2);
    doc.roundedRect(kx, ky, kw, kh, 1.5, 1.5, 'FD');
    doc.setFillColor(...TEAL);
    doc.rect(kx, ky + 2, 1, kh - 4, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_500);
    doc.text(k.label.toUpperCase(), kx + 4, ky + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...SLATE_900);
    doc.text(k.value, kx + 4, ky + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...SLATE_500);
    doc.text(doc.splitTextToSize(k.hint, kw - 7).slice(0, 2), kx + 4, ky + 18.5);
    if (k.delta) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      const up = k.delta.startsWith('+');
      const down = k.delta.startsWith('-');
      doc.setTextColor(...(up ? ([5, 150, 105] as RGB) : down ? ([225, 29, 72] as RGB) : SLATE_500));
      doc.text(k.delta, kx + kw - 3, ky + 6, { align: 'right' });
    }
  });
  y += kh * 2 + gap + 8;

  // ---- Evolução diária ----
  section('Evolução Diária', 'Usuários ativos, visitas e logins por dia');
  need(66);
  if (data.diario.length === 0 || data.diario.every(d => d.visitas === 0)) {
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_500);
    doc.text('Nenhum acesso registrado no período.', MARGIN, y + 4);
    y += 12;
  } else {
    lineChart(doc, MARGIN, y, contentW, 62, data.diario.map(d => d.label), [
      { name: 'Usuários ativos', color: BLUE, values: data.diario.map(d => d.ativos) },
      { name: 'Visitas', color: INDIGO, values: data.diario.map(d => d.visitas) },
      { name: 'Logins', color: TEAL, values: data.diario.map(d => d.logins) },
    ]);
    y += 70;
  }

  // ---- Horário e dia da semana (lado a lado) ----
  need(64);
  const half = (contentW - 6) / 2;
  const yBefore = y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...SLATE_900);
  doc.setFillColor(...TEAL);
  doc.rect(MARGIN, y - 3.5, 1.2, 5, 'F');
  doc.text('Visitas por Horário', MARGIN + 3.5, y);
  doc.rect(MARGIN + half + 6, y - 3.5, 1.2, 5, 'F');
  doc.text('Visitas por Dia da Semana', MARGIN + half + 9.5, y);
  y += 6;
  barChart(doc, MARGIN, y, half, 46, data.porHora, TEAL, 2);
  barChart(doc, MARGIN + half + 6, y, half, 46, data.porDiaSemana, INDIGO, 1);
  y = yBefore + 6 + 46 + 8;

  // ---- Adesão por perfil ----
  section('Adesão por Perfil', 'Usuários cadastrados que acessaram o sistema no período');
  data.adesao.forEach(r => {
    need(9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_900);
    doc.text(r.label, MARGIN, y);
    doc.setTextColor(...SLATE_500);
    doc.text(`${r.ativos}/${r.total}  ·  ${Math.round(r.pct)}%`, MARGIN + contentW, y, { align: 'right' });
    doc.setFillColor(...SLATE_200);
    doc.roundedRect(MARGIN, y + 1.5, contentW, 2.2, 1, 1, 'F');
    const color: RGB = r.pct >= 60 ? [16, 185, 129] : r.pct >= 30 ? [251, 191, 36] : [251, 113, 133];
    if (r.pct > 0) {
      doc.setFillColor(...color);
      doc.roundedRect(MARGIN, y + 1.5, Math.max(2, (contentW * r.pct) / 100), 2.2, 1, 1, 'F');
    }
    y += 8;
  });
  y += 4;

  // ---- Tabelas ----
  const tableBase = {
    margin: { left: MARGIN, right: MARGIN, top: START_Y, bottom: TIMBRADO_FOOTER_H + 4 },
    headStyles: { fillColor: SLATE_900, textColor: [255, 255, 255] as RGB, fontStyle: 'bold' as const, fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: SLATE_900 },
    alternateRowStyles: { fillColor: SLATE_50 },
  };
  const afterTable = () => { y = (doc as any).lastAutoTable.finalY + 8; };

  section('Usuários Mais Engajados', 'Ordenado por número de visitas');
  if (data.topUsuarios.length === 0) {
    doc.setFontSize(8); doc.setTextColor(...SLATE_500);
    doc.text('Nenhum acesso registrado no período.', MARGIN, y + 2); y += 10;
  } else {
    autoTable(doc, {
      ...tableBase, startY: y,
      head: [['#', 'Usuário', 'Perfil', 'Visitas', 'Tempo de uso', 'Navegações']],
      body: data.topUsuarios.map((u, i) => [`${i + 1}º`, u.nome, u.perfil, u.visitas, u.tempo, u.navegacoes]),
      columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    });
    afterTable();
  }

  need(30);
  section('Páginas Mais Acessadas', 'Trocas de página (sem contar tempo parado na mesma tela)');
  if (data.topPaginas.length === 0) {
    doc.setFontSize(8); doc.setTextColor(...SLATE_500);
    doc.text('Nenhuma navegação registrada no período.', MARGIN, y + 2); y += 10;
  } else {
    autoTable(doc, {
      ...tableBase, startY: y,
      head: [['#', 'Página', 'Acessos', 'Usuários distintos']],
      body: data.topPaginas.map((p, i) => [`${i + 1}º`, p.label, p.total, p.usuarios]),
      columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });
    afterTable();
  }

  need(30);
  section(
    `Usuários sem Acesso Recente (${data.semAcessoTotal})`,
    `Nunca acessaram ou não acessam há mais de ${data.inativoDias} dias (fonte: Supabase Auth)`,
  );
  if (data.semAcesso.length === 0) {
    doc.setFontSize(8); doc.setTextColor(...SLATE_500);
    doc.text('Todos os usuários acessaram recentemente.', MARGIN, y + 2); y += 10;
  } else {
    autoTable(doc, {
      ...tableBase, startY: y,
      head: [['Usuário', 'Perfil', 'Situação', 'Último acesso']],
      body: data.semAcesso.map(a => [a.nome, a.perfil, a.situacao, a.ultimo]),
    });
    afterTable();
    if (data.semAcessoTotal > data.semAcesso.length) {
      doc.setFontSize(7); doc.setTextColor(...SLATE_500);
      doc.text(`Exibindo ${data.semAcesso.length} de ${data.semAcessoTotal} usuários.`, MARGIN, y - 4);
    }
  }

  // ---- Nota metodológica ----
  need(24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_900);
  doc.text('Notas metodológicas', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...SLATE_500);
  const notas = [
    'Visita: período de uso contínuo de um usuário; uma pausa superior a 15 minutos inicia nova visita.',
    'Tempo de uso: estimado a partir de sinais de atividade enviados a cada ~5 minutos; não é um cronômetro exato.',
    'Navegações: trocas de página; sinais periódicos na mesma tela não são contados.',
    'Só há registro a partir da ativação do rastreamento; "último acesso" vem do Supabase Auth e tem histórico anterior.',
    ...(data.comparaAnterior ? ['Variações (+/-) comparam com o período imediatamente anterior, de mesmo tamanho.'] : []),
  ];
  const linhas = notas.flatMap(n => doc.splitTextToSize(`• ${n}`, contentW) as string[]);
  doc.text(linhas, MARGIN, y + 4.5);

  addTimbradoAllPages(doc);

  // numeração de páginas (depois do timbrado, que repinta as faixas)
  const total = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(60, 60, 60);
    doc.text(`Página ${i} de ${total}`, pageW - MARGIN, pageH - 6, { align: 'right' });
  }

  doc.save(`Metricas_Acesso_${new Date().toISOString().slice(0, 10)}.pdf`);
}
