import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import { GoogleSpreadsheet } from "npm:google-spreadsheet@4.1.1"
// @ts-ignore
import { JWT } from "npm:google-auth-library@9.6.3"
import { getCorsHeaders } from '../_shared/cors.ts'

// Reaproveita a mesma planilha já usada por "Visitas às Unidades Escolares" /
// "Salas de Trabalho" (VISITAS_SHEET_ID já configurado nos secrets) — as abas
// abaixo são novas, criadas automaticamente na primeira escrita.
const SHEET_ID = Deno.env.get('VISITAS_SHEET_ID') ?? ''

const ATENDIMENTOS_SHEET = 'Atendimentos_Teams'
const OBSERVACOES_SHEET = 'Observacoes_Processos'
const REMANEJAMENTOS_SHEET = 'Remanejamentos_Patrimonio'

const ATENDIMENTOS_COLUMNS = [
  'id', 'data_atendimento', 'escola_id', 'escola_nome', 'fde_code',
  'atendente_id', 'atendente_nome', 'canal', 'pauta',
  'processo_origem', 'processo_id', 'processo_identificador',
  'duracao_minutos', 'observacoes', 'data_registro',
]
const OBSERVACOES_COLUMNS = [
  'id', 'processo_origem', 'processo_id', 'processo_identificador', 'tipo_processo',
  'escola_id', 'escola_nome', 'etapa_atual', 'observacao',
  'autor_id', 'autor_nome', 'data_registro',
]
const REMANEJAMENTOS_COLUMNS = [
  'id', 'escola_origem_id', 'escola_origem_nome', 'escola_destino_id', 'escola_destino_nome',
  'numero_patrimonial', 'descricao', 'numero_documento', 'cadastrado_sam',
  'autor_id', 'autor_nome', 'data_registro',
]

type Profile = { role: string; school_id: string | null; full_name: string | null }

// Cache em memória do módulo, reaproveitado entre invocações "quentes" da mesma
// instância — mesmo motivo/padrão de supabase/functions/patrimonio-salas: sem isso
// cada ação dispara doc.loadInfo() + loadHeaderRow() de 3 abas e estoura a cota de
// leitura da Sheets API (erro 429) quando o usuário navega/clica rápido.
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

  // Evolução de schema: se a aba já existia com colunas antigas (ex.: campo novo
  // adicionado depois em COLUMNS), estende o cabeçalho com as colunas que faltam no
  // final, sem mexer nas colunas/dados já existentes — addRow() falha se mandarmos
  // uma chave que não é um header da planilha.
  const missing = columns.filter(c => !headers.includes(c))
  if (missing.length > 0) {
    await sheet.setHeaderRow([...headers, ...missing])
  }
  return sheet
}

function exigirRegionalAdmin(profile: Profile) {
  if (profile.role !== 'regional_admin') {
    throw new Error('Apenas administradores regionais podem executar esta ação.')
  }
}

function rowToObject(row: any, columns: string[]) {
  return Object.fromEntries(columns.map(col => [col, row.get(col) ?? '']))
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') throw new Error('Método não suportado.')
    if (!SHEET_ID) throw new Error('Planilha não configurada nos secrets (VISITAS_SHEET_ID).')

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

    const { data: profile } = await supabase.from('profiles').select('role, school_id, full_name').eq('id', user.id).single()
    if (!profile) throw new Error('Perfil de usuário não encontrado.')
    const p = profile as Profile
    const autorNome = p.full_name || user.email || 'Usuário'

    if (!['regional_admin', 'school_manager'].includes(p.role)) {
      throw new Error('Seu perfil não tem acesso a este módulo.')
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action as string
    if (!action) throw new Error('Ação não informada.')

    const doc = await getDoc()

    switch (action) {
      case 'listar_atendimentos': {
        const sheet = await getOrCreateSheet(doc, ATENDIMENTOS_SHEET, ATENDIMENTOS_COLUMNS)
        const rows = await sheet.getRows()
        let atendimentos = rows.map((r: any) => rowToObject(r, ATENDIMENTOS_COLUMNS))
        if (p.role === 'school_manager') {
          atendimentos = atendimentos.filter((a: any) => a.escola_id === p.school_id)
        }
        return ok(corsHeaders, atendimentos)
      }

      case 'registrar_atendimento': {
        exigirRegionalAdmin(p)
        const sheet = await getOrCreateSheet(doc, ATENDIMENTOS_SHEET, ATENDIMENTOS_COLUMNS)
        if (!body.data_atendimento || !body.pauta) {
          throw new Error('Data e pauta são obrigatórios.')
        }
        await sheet.addRow({
          id: String(body.id || crypto.randomUUID()),
          data_atendimento: String(body.data_atendimento),
          escola_id: String(body.escola_id),
          escola_nome: String(body.escola_nome || ''),
          fde_code: String(body.fde_code || ''),
          atendente_id: user.id,
          atendente_nome: autorNome,
          canal: String(body.canal || 'Teams'),
          pauta: String(body.pauta),
          processo_origem: String(body.processo_origem || ''),
          processo_id: String(body.processo_id || ''),
          processo_identificador: String(body.processo_identificador || ''),
          duracao_minutos: String(body.duracao_minutos || ''),
          observacoes: String(body.observacoes || ''),
          data_registro: new Date().toISOString(),
        })
        return ok(corsHeaders, { success: true })
      }

      case 'listar_observacoes': {
        const sheet = await getOrCreateSheet(doc, OBSERVACOES_SHEET, OBSERVACOES_COLUMNS)
        const rows = await sheet.getRows()
        let observacoes = rows.map((r: any) => rowToObject(r, OBSERVACOES_COLUMNS))
        if (p.role === 'school_manager') {
          observacoes = observacoes.filter((o: any) => o.escola_id === p.school_id)
        } else if (body.processo_id) {
          observacoes = observacoes.filter((o: any) => o.processo_id === String(body.processo_id))
        }
        return ok(corsHeaders, observacoes)
      }

      case 'registrar_observacao': {
        exigirRegionalAdmin(p)
        const sheet = await getOrCreateSheet(doc, OBSERVACOES_SHEET, OBSERVACOES_COLUMNS)
        if (!body.processo_id || !body.observacao) {
          throw new Error('Processo e observação são obrigatórios.')
        }
        await sheet.addRow({
          id: crypto.randomUUID(),
          processo_origem: String(body.processo_origem || ''),
          processo_id: String(body.processo_id),
          processo_identificador: String(body.processo_identificador || ''),
          tipo_processo: String(body.tipo_processo || ''),
          escola_id: String(body.escola_id || ''),
          escola_nome: String(body.escola_nome || ''),
          etapa_atual: String(body.etapa_atual || ''),
          observacao: String(body.observacao),
          autor_id: user.id,
          autor_nome: autorNome,
          data_registro: new Date().toISOString(),
        })
        return ok(corsHeaders, { success: true })
      }

      case 'listar_remanejamentos': {
        const sheet = await getOrCreateSheet(doc, REMANEJAMENTOS_SHEET, REMANEJAMENTOS_COLUMNS)
        const rows = await sheet.getRows()
        let remanejamentos = rows.map((r: any) => rowToObject(r, REMANEJAMENTOS_COLUMNS))
        if (p.role === 'school_manager') {
          remanejamentos = remanejamentos.filter((r: any) => r.escola_origem_id === p.school_id || r.escola_destino_id === p.school_id)
        }
        return ok(corsHeaders, remanejamentos)
      }

      case 'registrar_remanejamento': {
        exigirRegionalAdmin(p)
        const sheet = await getOrCreateSheet(doc, REMANEJAMENTOS_SHEET, REMANEJAMENTOS_COLUMNS)
        if (!body.escola_origem_id || !body.escola_destino_id || !body.numero_patrimonial || !body.numero_documento) {
          throw new Error('Escola origem, escola destino, nº patrimonial e nº do documento são obrigatórios.')
        }
        if (String(body.escola_origem_id) === String(body.escola_destino_id)) {
          throw new Error('A escola de destino deve ser diferente da escola de origem.')
        }
        await sheet.addRow({
          id: crypto.randomUUID(),
          escola_origem_id: String(body.escola_origem_id),
          escola_origem_nome: String(body.escola_origem_nome || ''),
          escola_destino_id: String(body.escola_destino_id),
          escola_destino_nome: String(body.escola_destino_nome || ''),
          numero_patrimonial: String(body.numero_patrimonial),
          descricao: String(body.descricao || ''),
          numero_documento: String(body.numero_documento),
          cadastrado_sam: body.cadastrado_sam ? 'TRUE' : 'FALSE',
          autor_id: user.id,
          autor_nome: autorNome,
          data_registro: new Date().toISOString(),
        })
        return ok(corsHeaders, { success: true })
      }

      default:
        throw new Error(`Ação "${action}" desconhecida.`)
    }
  } catch (error) {
    let message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[patrimonio-atendimento]', message)

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
