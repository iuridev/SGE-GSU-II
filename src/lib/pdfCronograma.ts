// PDF do Cronograma de Atividades (SEOM/SEFISC): A4 paisagem com timbrado.
// Página 1 = calendário do mês em grade; páginas seguintes = tabela
// detalhada. Recebe os dados já filtrados pela tela, para o PDF sair igual
// ao que o usuário está vendo.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addTimbradoAllPages, TIMBRADO_HEADER_H, TIMBRADO_FOOTER_H } from './pdfTimbrado';
import { AGENDA_TIPOS, type AgendaItem, type AgendaSourceType } from './agendaUnificada';
import {
  TIPO_INFO, semanasDoMes, nomeMes, formatarData, aguardandoConfirmacao, ordenarAtividades,
  type Atividade, type ResumoExecucao,
} from './cronogramaAtividades';

type RGB = [number, number, number];

const hexParaRgb = (hex: string): RGB => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Mesmas cores das classes Tailwind usadas na Agenda Unificada.
const COR_SISTEMA: Record<AgendaSourceType, RGB> = {
  ambiente: hexParaRgb('#3b82f6'),
  carro: hexParaRgb('#f59e0b'),
  reuniao: hexParaRgb('#6366f1'),
  visita_fiscal: hexParaRgb('#ef4444'),
  obra: hexParaRgb('#f97316'),
  visita_escolar: hexParaRgb('#10b981'),
};
const LABEL_SISTEMA = Object.fromEntries(AGENDA_TIPOS.map(t => [t.tipo, t.label])) as Record<AgendaSourceType, string>;

const COR_TEXTO: RGB = [30, 41, 59];
const COR_CINZA: RGB = [120, 120, 120];

const hora = (h: string | null | undefined) => (h ? h.slice(0, 5) : '');

export function rotuloStatus(a: Atividade, hoje: string): string {
  if (a.status === 'CONCLUIDA') return 'Concluída';
  if (a.status === 'NAO_REALIZADA') return 'Não realizada';
  if (a.status === 'CANCELADA') return 'Cancelada';
  return aguardandoConfirmacao(a, hoje) ? 'Aguardando confirmação' : 'Planejada';
}

function corStatus(a: Atividade): RGB {
  if (a.status === 'CONCLUIDA') return [4, 120, 87];
  if (a.status === 'NAO_REALIZADA') return [185, 28, 28];
  if (a.status === 'CANCELADA') return [150, 150, 150];
  return COR_TEXTO;
}

// Corta o texto com reticências para caber na largura (mm).
function caber(doc: jsPDF, texto: string, largura: number): string {
  if (doc.getTextWidth(texto) <= largura) return texto;
  let t = texto;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > largura) t = t.slice(0, -1);
  return `${t}…`;
}

interface Opcoes {
  mes: string;
  atividades: Atividade[];   // do mês, já filtradas
  eventos: AgendaItem[];     // eventos das outras páginas do mês (vazio se desligado)
  resumo: ResumoExecucao;
  filtros: string;           // descrição dos filtros aplicados
  hoje: string;
}

export function gerarPdfCronograma({ mes, atividades, eventos, resumo, filtros, hoje }: Opcoes): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margem = 12;
  const topo = TIMBRADO_HEADER_H + 5;
  const base = pageH - TIMBRADO_FOOTER_H - 9; // espaço para a legenda

  const lista = ordenarAtividades(atividades);

  // ── Título ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...COR_TEXTO);
  doc.text(`Cronograma de Atividades — ${nomeMes(mes)}`, margem, topo);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COR_CINZA);
  const pct = resumo.percentual === null ? '—' : `${resumo.percentual}%`;
  doc.text(
    `${filtros}  ·  Previstas: ${resumo.total}  ·  Concluídas: ${resumo.concluidas}  ·  Não realizadas: ${resumo.naoRealizadas}  ·  Aguardando: ${resumo.aguardando}  ·  Execução: ${pct}`,
    margem, topo + 4.5,
  );
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, pageW - margem, topo, { align: 'right' });

  // ── Grade do calendário ──────────────────────────────────────────────────
  const semanas = semanasDoMes(mes);
  const gradeTopo = topo + 8;
  const cabH = 5;
  const colW = (pageW - margem * 2) / 7;
  const linhaH = (base - gradeTopo - cabH) / semanas.length;
  const itemH = 2.9;

  doc.setFillColor(30, 41, 59);
  doc.rect(margem, gradeTopo, colW * 7, cabH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO', 'DOMINGO'].forEach((d, i) =>
    doc.text(d, margem + colW * i + colW / 2, gradeTopo + 3.4, { align: 'center' }));

  const porDia = new Map<string, { cor: RGB; texto: string; corTexto: RGB; sistema: boolean }[]>();
  const add = (dia: string, item: { cor: RGB; texto: string; corTexto: RGB; sistema: boolean }) =>
    porDia.set(dia, [...(porDia.get(dia) || []), item]);
  for (const a of lista) {
    add(a.data_prevista, {
      cor: hexParaRgb(TIPO_INFO[a.tipo].bar),
      texto: `${hora(a.hora_inicio) ? `${hora(a.hora_inicio)} ` : ''}${a.status === 'CONCLUIDA' ? '(ok) ' : a.status === 'NAO_REALIZADA' ? '(não) ' : ''}${a.titulo}`,
      corTexto: corStatus(a),
      sistema: false,
    });
  }
  for (const ev of eventos) {
    add(ev.data, { cor: COR_SISTEMA[ev.tipo], texto: `${hora(ev.hora) ? `${hora(ev.hora)} ` : ''}${ev.titulo}`, corTexto: COR_CINZA, sistema: true });
  }

  semanas.forEach((semana, si) => {
    const y = gradeTopo + cabH + si * linhaH;
    semana.forEach((dia, di) => {
      const x = margem + di * colW;
      if (!dia || di >= 5) {
        doc.setFillColor(245, 246, 248);
        doc.rect(x, y, colW, linhaH, 'F');
      }
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.rect(x, y, colW, linhaH);
      if (!dia) return;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...(dia === hoje ? [37, 99, 235] as RGB : COR_TEXTO));
      doc.text(String(Number(dia.slice(8))), x + 1.5, y + 3.5);

      const itens = porDia.get(dia) || [];
      const cabem = Math.max(0, Math.floor((linhaH - 5) / itemH));
      const visiveis = itens.length > cabem ? itens.slice(0, Math.max(0, cabem - 1)) : itens;
      doc.setFontSize(6);
      visiveis.forEach((it, k) => {
        const iy = y + 5 + k * itemH;
        doc.setFillColor(...it.cor);
        doc.rect(x + 1.2, iy + 0.5, 1.4, 1.8, 'F');
        doc.setFont('helvetica', it.sistema ? 'italic' : 'normal');
        doc.setTextColor(...it.corTexto);
        doc.text(caber(doc, it.texto, colW - 4.5), x + 3.3, iy + 2.1);
      });
      if (visiveis.length < itens.length) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(37, 99, 235);
        doc.text(`+ ${itens.length - visiveis.length} (ver tabela)`, x + 3.3, y + 5 + visiveis.length * itemH + 2.1);
      }
    });
  });

  // ── Legenda ──────────────────────────────────────────────────────────────
  let lx = margem;
  const ly = base + 4.5;
  doc.setFontSize(6.5);
  const legenda = (cor: RGB, texto: string, italico = false) => {
    doc.setFillColor(...cor);
    doc.rect(lx, ly - 1.8, 2, 2, 'F');
    doc.setFont('helvetica', italico ? 'italic' : 'normal');
    doc.setTextColor(...COR_TEXTO);
    doc.text(texto, lx + 2.8, ly);
    lx += doc.getTextWidth(texto) + 6;
  };
  const rotulo = (texto: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COR_CINZA);
    doc.text(texto, lx, ly);
    lx += doc.getTextWidth(texto) + 2;
  };
  rotulo('Cronograma:');
  Object.values(TIPO_INFO).forEach(t => legenda(hexParaRgb(t.bar), t.label));
  if (eventos.length) {
    lx += 2;
    rotulo('Outras páginas:');
    const tiposEv = Array.from(new Set(eventos.map(e => e.tipo)));
    tiposEv.forEach(t => legenda(COR_SISTEMA[t], LABEL_SISTEMA[t], true));
  }
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COR_CINZA);
  doc.text('(ok) concluída · (não) não realizada · itálico: outras páginas', pageW - margem, ly, { align: 'right' });

  // ── Tabela detalhada ─────────────────────────────────────────────────────
  if (lista.length || eventos.length) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COR_TEXTO);
    doc.text(`Detalhamento — ${nomeMes(mes)}`, margem, topo);

    const linhas = [
      ...lista.map(a => ({
        chave: `${a.data_prevista}|${hora(a.hora_inicio) || '99'}`,
        cols: [
          formatarData(a.data_prevista),
          `${hora(a.hora_inicio)}${a.hora_fim ? `–${hora(a.hora_fim)}` : ''}`,
          a.setor,
          TIPO_INFO[a.tipo].label,
          [a.titulo, a.objetivo, a.local].filter(Boolean).join(' — '),
          a.responsavel || '',
          rotuloStatus(a, hoje) + (a.status === 'NAO_REALIZADA' && a.motivo_nao_realizacao ? `: ${a.motivo_nao_realizacao}` : ''),
        ],
      })),
      ...eventos.map(ev => ({
        chave: `${ev.data}|${hora(ev.hora) || '99'}`,
        cols: [formatarData(ev.data), hora(ev.hora), '—', LABEL_SISTEMA[ev.tipo], [ev.titulo, ev.subtitulo].filter(Boolean).join(' — '), '', 'Outra página'],
      })),
    ].sort((x, y) => x.chave.localeCompare(y.chave));

    autoTable(doc, {
      startY: topo + 4,
      margin: { left: margem, right: margem, top: topo, bottom: TIMBRADO_FOOTER_H + 4 },
      head: [['Data', 'Horário', 'Setor', 'Tipo', 'Atividade', 'Responsável', 'Situação']],
      body: linhas.map(l => l.cols),
      styles: { fontSize: 7.5, cellPadding: 1.5, valign: 'middle' },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 20 }, 1: { cellWidth: 20 }, 2: { cellWidth: 16 }, 3: { cellWidth: 30 },
        5: { cellWidth: 40 }, 6: { cellWidth: 45 },
      },
      didParseCell: data => {
        if (data.section === 'body' && data.row.raw && (data.row.raw as string[])[6] === 'Outra página') {
          data.cell.styles.textColor = COR_CINZA;
          data.cell.styles.fontStyle = 'italic';
        }
      },
    });
  }

  addTimbradoAllPages(doc);
  doc.save(`Cronograma_SEOM_SEFISC_${mes}.pdf`);
}
