// Leitura das respostas do formulário de Acompanhamento Semanal de Obras
// (planilha Google publicada como CSV). Fica fora da página para que a tela
// de Acompanhamento e a métrica do Selo de Acompanhamento de Obras leiam
// exatamente os mesmos registros.
import Papa from 'papaparse';

const CSV_URL = import.meta.env.VITE_ACOMPANHAMENTO_OBRAS_CSV_URL as string;

export interface AcompanhamentoRow {
  id: string;
  timestamp: string;
  dataISO: string;
  escola: string;
  tipoObra: string;
  empresa: string;
  fiscal: string;
  dataAbertura: string;
  servicosExecutados: string;
  fotosCount: number;
  fotosUrls: string[];
  ocorrencia: string;
  temOcorrencia: boolean;
  avaliacao: number | null;
  responsavel: string;
}

const normalizeHeader = (s: string) =>
  s?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim() || '';

const normalizeText = (s: string) =>
  s?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.,;!]/g, '').trim() || '';

// dd/mm/yyyy [hh:mm:ss] -> yyyy-mm-dd
function parseDateBR(raw: string): string {
  const m = raw?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '';
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

const OCORRENCIA_NEGATIVA = /^(nao|nenhuma?|n a|na|sem ocorrencia)\b/;

function parseRow(headers: string[], row: Record<string, string>): AcompanhamentoRow | null {
  // Prioriza correspondência exata do cabeçalho normalizado (ex.: "Fiscal") antes de cair
  // para "contém o termo" — sem isso, "Fiscal" batia primeiro com a pergunta de fotos
  // ("...LO do fiscal da FDE..."), que aparece antes da coluna real na planilha.
  const findKey = (terms: string[]) => {
    const exato = headers.find(h => terms.includes(normalizeHeader(h)));
    if (exato) return exato;
    return headers.find(h => terms.some(t => normalizeHeader(h).includes(t)));
  };

  const kTimestamp = findKey(['carimbo']);
  const kEscola = findKey(['selecione a ue']);
  const kTipoObra = findKey(['tipo de obra']);
  const kEmpresa = findKey(['constru']);
  const kFiscal = findKey(['fiscal']);
  const kAbertura = findKey(['abertura da obra']);
  const kServicos = findKey(['servicos executados']);
  const kFotos = findKey(['fotos']);
  const kOcorrencia = findKey(['ocorrencia']);
  const kAvaliacao = findKey(['andamento da obra']);
  const kResponsavel = findKey(['responsavel']);

  const escola = kEscola ? (row[kEscola] || '').trim() : '';
  if (!escola) return null;

  const timestampRaw = kTimestamp ? (row[kTimestamp] || '').trim() : '';
  const ocorrenciaRaw = kOcorrencia ? (row[kOcorrencia] || '').trim() : '';
  const fotosRaw = kFotos ? (row[kFotos] || '').trim() : '';
  const fotosUrls = fotosRaw ? fotosRaw.split(',').map(u => u.trim()).filter(Boolean) : [];
  const avaliacaoNum = kAvaliacao ? parseInt((row[kAvaliacao] || '').trim(), 10) : NaN;

  return {
    id: `${timestampRaw}-${escola}`,
    timestamp: timestampRaw,
    dataISO: parseDateBR(timestampRaw),
    escola,
    tipoObra: kTipoObra ? (row[kTipoObra] || '').trim() : '',
    empresa: kEmpresa ? (row[kEmpresa] || '').trim() : '',
    fiscal: kFiscal ? (row[kFiscal] || '').trim() : '',
    dataAbertura: kAbertura ? (row[kAbertura] || '').trim() : '',
    servicosExecutados: kServicos ? (row[kServicos] || '').trim() : '',
    fotosCount: fotosUrls.length,
    fotosUrls,
    ocorrencia: ocorrenciaRaw,
    temOcorrencia: normalizeText(ocorrenciaRaw) !== '' && !OCORRENCIA_NEGATIVA.test(normalizeText(ocorrenciaRaw)),
    avaliacao: Number.isFinite(avaliacaoNum) && avaliacaoNum >= 1 && avaliacaoNum <= 5 ? avaliacaoNum : null,
    responsavel: kResponsavel ? (row[kResponsavel] || '').trim() : '',
  };
}

export function fetchAcompanhamentoCSV(): Promise<AcompanhamentoRow[]> {
  return new Promise((resolve, reject) => {
    if (!CSV_URL) {
      console.warn('VITE_ACOMPANHAMENTO_OBRAS_CSV_URL não configurada.');
      resolve([]);
      return;
    }
    Papa.parse<Record<string, string>>(CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        const rows = results.data
          .map(r => parseRow(headers, r))
          .filter((r): r is AcompanhamentoRow => r !== null)
          .sort((a, b) => (b.dataISO || '').localeCompare(a.dataISO || ''));
        resolve(rows);
      },
      error: (err) => reject(err),
    });
  });
}
