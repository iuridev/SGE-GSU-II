// Lógica de leitura/merge da planilha de Manejo Arbóreo (fonte da verdade,
// sem histórico) — compartilhada entre a página do mapa/lista (ManejoArboreo.tsx)
// e o snapshot semanal de pendências (PendenciasSemanais.tsx), para que as duas
// nunca divirjam sobre o que conta como pendência.

export const MANEJO_SHEET_ID = import.meta.env.VITE_MANEJO_SHEET_ID as string;

export interface ManejoSheetRow {
  timestamp: Date;
  escola: string;            // nome normalizado (chave de merge)
  escolaOriginal: string;    // nome como veio na planilha
  qtdRemocaoSolicitada: number; // coluna C
  qtdPodaSolicitada: number;    // coluna D
  qtdRemocaoAutorizada: number; // coluna R
  qtdPodaAutorizada: number;    // coluna Q
  validadeISO: string | null; // YYYY-MM-DD | null (coluna E)
  naoSeAplica: boolean;      // coluna E contém "Não se Aplica" (sem árvores)
  autorizacaoEnviada: boolean; // coluna F preenchida (link do documento)
  observacoes: string;
}

// PENDENTE = respondeu o Forms mas não informou data de validade na coluna E
export type StatusManejo = 'VALIDO' | 'VENCIDO' | 'NAO_RESPONDIDO' | 'NAO_SE_APLICA' | 'PENDENTE';

function parseGvizDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const m = v.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
    if (m) return new Date(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  }
  return null;
}

export function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')          // remove diacríticos (forma explícita)
    .replace(/^(EE|EMEI|EMEF|CEI|EM |ESCOLA ESTADUAL|ESCOLA MUNICIPAL|PROF\.?|PROFESSOR[A]?)\s+/g, '')
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchNames(supNorm: string, sheetNorm: string): boolean {
  if (supNorm === sheetNorm) return true;
  if (supNorm.includes(sheetNorm) || sheetNorm.includes(supNorm)) return true;
  // sobreposição de palavras ≥ 60%
  const wA = supNorm.split(' ').filter(Boolean);
  const wB = new Set(sheetNorm.split(' ').filter(Boolean));
  const overlap = wA.filter(w => wB.has(w)).length;
  return overlap / Math.min(wA.length, wB.size) >= 0.6;
}

function toQuantidade(v: any): number {
  if (typeof v === 'number') return Math.round(v);
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  return 0;
}

export async function fetchManejoFromSheet(): Promise<Map<string, ManejoSheetRow>> {
  const url = `https://docs.google.com/spreadsheets/d/${MANEJO_SHEET_ID}/gviz/tq?tqx=out:json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet HTTP ${res.status}`);
  const text = await res.text();
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));

  const rows: ManejoSheetRow[] = (json.table?.rows ?? [])
    .filter((r: any) => r?.c?.[1]?.v)
    .map((r: any): ManejoSheetRow => {
      const c = r.c || [];
      const raw = (i: number) => c[i]?.v ?? null;
      const fmt = (i: number): string => c[i]?.f ?? String(c[i]?.v ?? '');

      const ts = parseGvizDate(raw(0)) ?? new Date(0);

      // Coluna E (Validade): pode ser uma data OU o texto "Não se Aplica"
      const colE_raw = raw(4);
      const colE_fmt = fmt(4);
      const naoSeAplica =
        (typeof colE_raw === 'string' && /n.o\s*se\s*aplic/i.test(colE_raw)) ||
        /n.o\s*se\s*aplic/i.test(colE_fmt);
      const validadeDate = naoSeAplica ? null : parseGvizDate(colE_raw);
      const validadeISO = validadeDate
        ? `${validadeDate.getFullYear()}-${String(validadeDate.getMonth() + 1).padStart(2, '0')}-${String(validadeDate.getDate()).padStart(2, '0')}`
        : null;

      // Coluna F (Autorização): preenchida com o link do documento quando enviada
      const autorizacaoEnviada = raw(5) != null && String(raw(5)).trim() !== '';

      const escolaOriginal = String(raw(1)).trim();
      return {
        timestamp: ts,
        escola: normalizeName(escolaOriginal),
        escolaOriginal,
        qtdRemocaoSolicitada: toQuantidade(raw(2)),
        qtdPodaSolicitada: toQuantidade(raw(3)),
        qtdPodaAutorizada: toQuantidade(raw(16)),
        qtdRemocaoAutorizada: toQuantidade(raw(17)),
        validadeISO,
        naoSeAplica,
        autorizacaoEnviada,
        observacoes: raw(14) ? String(raw(14)).trim() : '',
      };
    });

  // Ordena por timestamp descendente e mantém apenas a resposta mais recente por escola
  rows.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const map = new Map<string, ManejoSheetRow>();
  for (const row of rows) {
    if (!map.has(row.escola)) map.set(row.escola, row);
  }
  return map;
}

export interface ManejoStatusInput {
  naoSeAplica: boolean;
  validadeAutorizacao: string | null;
  daPlanilha: boolean;
}

export function determinarStatus(escola: ManejoStatusInput): StatusManejo {
  if (escola.naoSeAplica) return 'NAO_SE_APLICA';
  if (!escola.validadeAutorizacao) {
    // Respondeu o Forms mas não preencheu a data de validade → pendente
    return escola.daPlanilha ? 'PENDENTE' : 'NAO_RESPONDIDO';
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [ano, mes, dia] = escola.validadeAutorizacao.split('-');
  const dataCorrigida = new Date(Number(ano), Number(mes) - 1, Number(dia));

  if (dataCorrigida < hoje) return 'VENCIDO';
  return 'VALIDO';
}

// Uma escola "tem pendência" de manejo arbóreo quando não possui autorização
// válida nem foi marcada como Não se Aplica — cobre tanto quem nunca
// respondeu o Forms quanto quem respondeu mas ficou com validade vencida ou
// em branco.
export function temPendenciaManejo(status: StatusManejo): boolean {
  return status !== 'VALIDO' && status !== 'NAO_SE_APLICA';
}
