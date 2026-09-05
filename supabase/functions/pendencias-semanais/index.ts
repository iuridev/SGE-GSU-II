import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import { GoogleSpreadsheet } from "npm:google-spreadsheet@4.1.1"
// @ts-ignore
import { JWT } from "npm:google-auth-library@9.6.3"
import { getCorsHeaders } from '../_shared/cors.ts'

// Histórico semanal de pendências (Água + Manejo Arbóreo) por escola, usado
// para o gráfico de evolução em src/pages/PendenciasSemanais.tsx. O cálculo de
// quem está pendente é feito no cliente (reaproveita get_pending_water_schools
// e a lógica de src/lib/manejoArboreo.ts); esta função só persiste/lê o
// snapshot gerado, na planilha PENDENCIAS_SEMANAIS_SHEET_ID.
const SHEET_ID = Deno.env.get('PENDENCIAS_SEMANAIS_SHEET_ID') ?? ''

const TAB_NAME = 'PendenciasSemanais'
const COLUMNS = [
  'id', 'semana', 'escola_id', 'escola_nome',
  'tem_pendencia_agua', 'dias_agua_pendentes', 'agua_dispensada',
  'status_manejo', 'tem_pendencia_manejo',
  'gerado_em', 'gerado_por_nome',
]

// Roles que podem ver o histórico (mesmas da página, ver src/App.tsx e
// src/pages/PendenciasSemanais.tsx). chefe_departamento é somente-leitura e
// espelha regional_admin nas leituras — ver src/lib/roles.ts.
const ALLOWED_READ_ROLES = ['regional_admin', 'school_manager', 'supervisor', 'dirigente', 'chefe_departamento']

type Profile = { role: string; school_id: string | null; full_name: string | null; supervisor_schools: string[] | null }

// Cache em memória do módulo entre invocações "quentes" da mesma instância —
// mesmo motivo/padrão de supabase/functions/patrimonio-atendimento: sem isso
// cada ação dispara doc.loadInfo() e pode estourar a cota de leitura da
// Sheets API (erro 429) quando o usuário navega/clica rápido.
let cachedAuth: any = null
let cachedDoc: any = null
let docLoadedAt = 0
const DOC_CACHE_TTL_MS = 5 * 60 * 1000

async function getDoc() {
  const now = Date.now()
  if (cachedDoc && (now - docLoadedAt) < DOC_CACHE_TTL_MS) return cachedDoc

  if (!cachedAuth) {
    const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    const key = Deno.env.get('GOOGLE_PRIVATE_KEY')
    if (!email || !key) throw new Error('Credenciais Google não configuradas nos secrets.')
    cachedAuth = new JWT({
      email,
      key: key.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
  }

  const doc = new GoogleSpreadsheet(SHEET_ID, cachedAuth)
  await doc.loadInfo()
  cachedDoc = doc
  docLoadedAt = now
  return doc
}

async function getOrCreateSheet(doc: any, title: string, columns: string[]) {
  let sheet = doc.sheetsByTitle[title]
  if (!sheet) {
    sheet = await doc.addSheet({ title, headerValues: columns })
    return sheet
  }

  let headers: string[] = []
  try {
    headers = sheet.headerValues && sheet.headerValues.length > 0
      ? sheet.headerValues
      : await sheet.loadHeaderRow().then(() => sheet.headerValues).catch(() => [])
  } catch {
    headers = await sheet.loadHeaderRow().then(() => sheet.headerValues).catch(() => [])
  }

  if (!headers || headers.length === 0) {
    await sheet.setHeaderRow(columns)
    return sheet
  }

  const missing = columns.filter(c => !headers.includes(c))
  if (missing.length > 0) {
    await sheet.setHeaderRow([...headers, ...missing])
  }
  return sheet
}

function exigirRegionalAdmin(profile: Profile) {
  // Checagem estrita da role bruta: chefe_departamento é mapeado para
  // regional_admin apenas para fins de leitura (resolveViewRole no
  // frontend) e nunca deve conseguir gravar um snapshot.
  if (profile.role !== 'regional_admin') {
    throw new Error('Apenas administradores regionais podem gerar o snapshot semanal.')
  }
}

function rowToObject(row: any, columns: string[]) {
  return Object.fromEntries(columns.map(col => [col, row.get(col) ?? '']))
}

// A1: número da coluna (1-based) → letra ("A", "B", ... "AA").
function colLetter(n: number): string {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') throw new Error('Método não suportado.')
    if (!SHEET_ID) throw new Error('Planilha não configurada nos secrets (PENDENCIAS_SEMANAIS_SHEET_ID).')

    // ── Autenticação ─────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autorizado.')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Token inválido ou expirado.')

    const { data: profile } = await supabase.from('profiles').select('role, school_id, full_name, supervisor_schools').eq('id', user.id).single()
    if (!profile) throw new Error('Perfil de usuário não encontrado.')
    const p = profile as Profile
    const autorNome = p.full_name || user.email || 'Usuário'

    if (!ALLOWED_READ_ROLES.includes(p.role)) {
      throw new Error('Seu perfil não tem acesso a este módulo.')
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action as string
    if (!action) throw new Error('Ação não informada.')

    const doc = await getDoc()

    switch (action) {
      case 'listar': {
        const sheet = await getOrCreateSheet(doc, TAB_NAME, COLUMNS)
        const rows = await sheet.getRows()
        let objetos = rows.map((r: any) => rowToObject(r, COLUMNS))

        // Mesmo padrão de escopo por role usado em patrimonio-atendimento:
        // a API não confia no filtro client-side, cada role só recebe o que
        // tem permissão de ver.
        if (p.role === 'school_manager') {
          objetos = objetos.filter((o: any) => o.escola_id === p.school_id)
        } else if (p.role === 'supervisor') {
          const escolasSupervisionadas = p.supervisor_schools || []
          objetos = objetos.filter((o: any) => escolasSupervisionadas.includes(o.escola_id))
        }

        return ok(corsHeaders, { rows: objetos })
      }

      case 'gerar_snapshot': {
        exigirRegionalAdmin(p)
        const semana = String(body.semana || '')
        const linhas = Array.isArray(body.rows) ? body.rows : []
        if (!semana) throw new Error('Semana não informada.')
        if (linhas.length === 0) throw new Error('Nenhuma escola informada para o snapshot.')

        const sheet = await getOrCreateSheet(doc, TAB_NAME, COLUMNS)
        const existentes = await sheet.getRows()
        const porChave = new Map<string, any>()
        for (const r of existentes) {
          porChave.set(`${r.get('escola_id')}|${r.get('semana')}`, r)
        }

        const geradoEm = new Date().toISOString()

        // Separa em inserções (o caso comum: cada semana nova é 100% linhas
        // novas, uma por escola da rede) e atualizações (ocorre quando o
        // mesmo snapshot da mesma semana é gerado de novo). Gravar uma linha
        // por vez (addRow/save sequenciais) estourava a cota de escrita do
        // Google Sheets em redes com muitas escolas — por isso as inserções
        // vão numa única chamada em lote (addRows) e as atualizações via
        // saveUpdatedCells (também uma única chamada, ver abaixo).
        const paraInserir: Record<string, string>[] = []
        const paraAtualizar: { row: any; valores: Record<string, string> }[] = []

        for (const linha of linhas) {
          if (!linha.escola_id) continue
          const chave = `${linha.escola_id}|${semana}`
          const valores = {
            semana,
            escola_id: String(linha.escola_id),
            escola_nome: String(linha.escola_nome || ''),
            tem_pendencia_agua: linha.tem_pendencia_agua ? 'TRUE' : 'FALSE',
            dias_agua_pendentes: String(linha.dias_agua_pendentes ?? 0),
            agua_dispensada: linha.agua_dispensada ? 'TRUE' : 'FALSE',
            status_manejo: String(linha.status_manejo || ''),
            tem_pendencia_manejo: linha.tem_pendencia_manejo ? 'TRUE' : 'FALSE',
            gerado_em: geradoEm,
            gerado_por_nome: autorNome,
          }

          const existente = porChave.get(chave)
          if (existente) {
            paraAtualizar.push({ row: existente, valores })
          } else {
            paraInserir.push({ id: crypto.randomUUID(), ...valores })
          }
        }

        if (paraInserir.length > 0) {
          await sheet.addRows(paraInserir)
        }

        if (paraAtualizar.length > 0) {
          // Atualização em lote: carrega de uma vez o bloco de células que
          // cobre as linhas a alterar, escreve todos os valores em memória e
          // persiste com um único saveUpdatedCells(). Antes era um row.save()
          // por escola, o que estourava a cota de escrita da Sheets API ao
          // regerar o snapshot da semana numa rede com centenas de escolas.
          const headers: string[] = sheet.headerValues || COLUMNS
          const colIdx = new Map<string, number>(headers.map((h, i) => [h, i] as [string, number]))
          const rowNums = paraAtualizar.map(u => u.row.rowNumber as number)
          const minRow = Math.min(...rowNums)
          const maxRow = Math.max(...rowNums)
          const ultimaColuna = colLetter(headers.length)
          await sheet.loadCells(`A${minRow}:${ultimaColuna}${maxRow}`)

          for (const { row, valores } of paraAtualizar) {
            const r = (row.rowNumber as number) - 1 // getCell usa índice 0-based
            for (const [col, val] of Object.entries(valores)) {
              const c = colIdx.get(col)
              if (c === undefined) continue
              sheet.getCell(r, c).value = val
            }
          }
          await sheet.saveUpdatedCells()
        }

        return ok(corsHeaders, { success: true, criadas: paraInserir.length, atualizadas: paraAtualizar.length })
      }

      default:
        throw new Error(`Ação "${action}" desconhecida.`)
    }
  } catch (error) {
    let message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[pendencias-semanais]', message)

    if (message.includes('[429]') || message.toLowerCase().includes('quota exceeded')) {
      cachedDoc = null
      message = 'Muitas ações em pouco tempo. Aguarde alguns segundos e tente novamente.'
    }

    return new Response(JSON.stringify({ error: message }), {
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

function ok(headers: Record<string, string>, data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...headers, 'Content-Type': 'application/json' },
    status: 200,
  })
}
