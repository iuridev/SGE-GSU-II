import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import { GoogleSpreadsheet } from "npm:google-spreadsheet@4.1.1"
// @ts-ignore
import { JWT } from "npm:google-auth-library@9.6.3"
import { getCorsHeaders } from '../_shared/cors.ts'

const SHEET_ID   = Deno.env.get('VISITAS_SHEET_ID') ?? ''
const SHEET_NAME = 'Visitas'
const COLUMNS    = ['id', 'data_visita', 'escola_nome', 'fde_code', 'visitante', 'objetivo', 'observacoes', 'data_registro']

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── Valida autenticação Supabase ────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autorizado.')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Token inválido ou expirado.')

    // ── Autentica na Google Sheets API (mesma service account do Drive) ──────
    const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    const key   = Deno.env.get('GOOGLE_PRIVATE_KEY')
    if (!email || !key) throw new Error('Credenciais Google não configuradas nos secrets.')
    if (!SHEET_ID)      throw new Error('VISITAS_SHEET_ID não configurado nos secrets.')

    const auth = new JWT({
      email,
      key: key.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    const doc = new GoogleSpreadsheet(SHEET_ID, auth)
    await doc.loadInfo()

    let sheet = doc.sheetsByTitle[SHEET_NAME]
    if (!sheet) throw new Error(`Aba "${SHEET_NAME}" não encontrada na planilha. Crie a aba e tente novamente.`)

    // ── GET: retorna todas as linhas como array de objetos ──────────────────
    if (req.method === 'GET') {
      const rows = await sheet.getRows()
      const data = rows.map(row =>
        Object.fromEntries(COLUMNS.map(col => [col, row.get(col) ?? '']))
      )
      return ok(corsHeaders, data)
    }

    // ── POST: adiciona uma linha nova ────────────────────────────────────────
    if (req.method === 'POST') {
      const body = await req.json()

      // Garante que os cabeçalhos existem na planilha
      const headers = await sheet.loadHeaderRow().then(() => sheet.headerValues).catch(() => [])
      if (!headers || headers.length === 0) {
        await sheet.setHeaderRow(COLUMNS)
      }

      await sheet.addRow(Object.fromEntries(COLUMNS.map(col => [col, body[col] ?? ''])))

      return ok(corsHeaders, { success: true })
    }

    throw new Error('Método não suportado.')

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[google-sheets-visitas]', message)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
