// Fonte real dos dados de Obras e Reformas: planilha do Google Sheets
// (a tabela `construction_works` do Supabase não é mais alimentada).
// Usado tanto pela página Obras quanto pelo card "Obras Ativas" do Dashboard,
// para que os dois nunca voltem a divergir.
const SHEET_CSV_URL = import.meta.env.VITE_OBRAS_CSV_URL as string;

export interface SheetSchool {
  id: string;
  name: string;
}

export interface SheetWork {
  escola: string;
  obra: string;
  integra?: string;
  pi?: string;
  sei?: string;
  empresa: string;
  fiscal?: string;
  status: string;
  dataInicio?: string;
  detalhamento?: string;
  matchedSchoolId?: string;
  matchedSchoolName?: string;
}

// Parses the whole CSV text at once (not pre-split by "\n") so that quoted
// fields containing embedded newlines (e.g. Alt+Enter cells in Sheets)
// don't break a single logical row into two.
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      row.push(field.trim());
      field = '';
    } else if (c === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\be\.?\s*e\.?\s*/gi, '')
    .replace(/escola\s+estadual\s*/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchSchool(sheetName: string, schools: SheetSchool[]): SheetSchool | undefined {
  if (!sheetName) return undefined;
  const n = normalizeForMatch(sheetName);
  return (
    schools.find(s => normalizeForMatch(s.name) === n) ||
    schools.find(s => { const sn = normalizeForMatch(s.name); return sn.includes(n) || n.includes(sn); })
  );
}

export function normalizeStatus(status: string): 'EM ANDAMENTO' | 'CONCLUÍDO' | 'PARALISADO' {
  const s = (status || '').toUpperCase().trim();
  if (s.includes('CONCLU')) return 'CONCLUÍDO';
  if (s.includes('PARALISA') || s.includes('SUSPENS')) return 'PARALISADO';
  return 'EM ANDAMENTO';
}

// Fetches and parses the Obras sheet, matching each row to a school id.
export async function fetchObrasSheet(schools: SheetSchool[]): Promise<SheetWork[]> {
  const res = await fetch(SHEET_CSV_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const csvRows = parseCSV(text);
  if (csvRows.length < 2) return [];

  const rawHeaders = csvRows[0];
  const headers = rawHeaders.map(h =>
    h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/"/g, '').trim()
  );

  const idx = {
    escola:     headers.findIndex(h => h.includes('escola')),
    obra:       headers.findIndex(h => h.includes('obra')),
    integra:    headers.findIndex(h => h.includes('integra')),
    pi:         headers.findIndex(h => h === 'pi'),
    sei:        headers.findIndex(h => h.includes('sei')),
    empresa:    headers.findIndex(h => h.includes('empresa')),
    fiscal:     headers.findIndex(h => h.includes('fiscal')),
    status:     headers.findIndex(h => h.includes('status')),
    dataInicio: headers.findIndex(h => h.includes('inicio') || (h.includes('data') && h.includes('in'))),
    detalhamento: headers.findIndex(h => h.includes('detalhamento')),
  };
  if (idx.dataInicio < 0) idx.dataInicio = headers.findIndex(h => h.startsWith('data'));

  const rows: SheetWork[] = [];
  for (let i = 1; i < csvRows.length; i++) {
    const v = csvRows[i];
    if (!v.some(cell => cell.trim())) continue;
    const escola = idx.escola >= 0 ? (v[idx.escola] || '') : '';
    if (!escola) continue;
    const matched = matchSchool(escola, schools);
    rows.push({
      escola,
      obra:       idx.obra >= 0       ? v[idx.obra]       || '' : '',
      integra:    idx.integra >= 0    ? v[idx.integra]    || '' : '',
      pi:         idx.pi >= 0         ? v[idx.pi]         || '' : '',
      sei:        idx.sei >= 0        ? v[idx.sei]        || '' : '',
      empresa:    idx.empresa >= 0    ? v[idx.empresa]    || '' : '',
      fiscal:     idx.fiscal >= 0     ? v[idx.fiscal]     || '' : '',
      status:     idx.status >= 0     ? v[idx.status]     || '' : '',
      dataInicio: idx.dataInicio >= 0 ? v[idx.dataInicio] || '' : '',
      detalhamento: idx.detalhamento >= 0 ? v[idx.detalhamento] || '' : '',
      matchedSchoolId:   matched?.id,
      matchedSchoolName: matched?.name || escola,
    });
  }
  return rows;
}
