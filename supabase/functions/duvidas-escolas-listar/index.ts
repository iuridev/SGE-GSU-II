import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import { GoogleSpreadsheet } from "npm:google-spreadsheet@4.1.1"
// @ts-ignore
import { JWT } from "npm:google-auth-library@9.6.3"
import { getCorsHeaders } from '../_shared/cors.ts'

// Endpoint AUTENTICADO (verify_jwt padrão, ver config.toml) — só quem tem
// perfil regional_admin lê as dúvidas enviadas pelo formulário público
// (duvidas-escolas-enviar). Nunca aceita gravação, só leitura.
const SHEET_ID = Deno.env.get('DUVIDAS_ESCOLAS_SHEET_ID') ?? ''
const DUVIDAS_SHEET = 'Duvidas'
const DUVIDAS_COLUMNS = ['id', 'escola_id', 'escola_nome', 'categoria', 'duvida', 'contato', 'criado_em']

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
  try {
    if (sheet.headerValues && sheet.headerValues.length > 0) return sheet
  } catch { /* ainda não carregado */ }

  const headers = await sheet.loadHeaderRow().then(() => sheet.headerValues).catch(() => [])
  if (!headers || headers.length === 0) {
    await sheet.setHeaderRow(columns)
  } else {
    const missing = columns.filter((c) => !headers.includes(c))
    if (missing.length > 0) await sheet.setHeaderRow([...headers, ...missing])
  }
  return sheet
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') throw new Error('Método não suportado.')
    if (!SHEET_ID) throw new Error('Planilha de dúvidas não configurada nos secrets (DUVIDAS_ESCOLAS_SHEET_ID).')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autorizado.')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Token inválido ou expirado.')

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'regional_admin') {
      throw new Error('Apenas administradores regionais podem acessar as dúvidas das escolas.')
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action as string
    if (action !== 'listar') throw new Error(`Ação "${action}" desconhecida.`)

    const doc = await getDoc()
    const sheet = await getOrCreateSheet(doc, DUVIDAS_SHEET, DUVIDAS_COLUMNS)
    const rows = await sheet.getRows()

    const duvidas = rows.map((r: any) => ({
      id: r.get('id'),
      escolaId: r.get('escola_id') || '',
      escolaNome: r.get('escola_nome') || '',
      categoria: r.get('categoria') || '',
      duvida: r.get('duvida') || '',
      contato: r.get('contato') || '',
      criadoEm: r.get('criado_em') || '',
    })).sort((a: any, b: any) => (a.criadoEm < b.criadoEm ? 1 : -1))

    return ok(corsHeaders, { duvidas })
  } catch (error) {
    let message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[duvidas-escolas-listar]', message)

    if (message.includes('[429]') || message.toLowerCase().includes('quota exceeded')) {
      cachedDoc = null
      message = 'Muitas solicitações em pouco tempo. Aguarde alguns segundos e tente novamente.'
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
