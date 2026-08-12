import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import { GoogleSpreadsheet } from "npm:google-spreadsheet@4.1.1"
// @ts-ignore
import { JWT } from "npm:google-auth-library@9.6.3"
import { getCorsHeaders } from '../_shared/cors.ts'

const SHEET_ID = Deno.env.get('PLANO_ACAO_SHEET_ID') ?? ''

const SHEETS: Record<string, { name: string; columns: string[] }> = {
  meta: {
    name: 'Metas',
    columns: ['id', 'dimensao', 'meta', 'acao_estrategia', 'responsavel_id', 'responsavel_nome', 'criado_por', 'criado_em'],
  },
  etapa: {
    name: 'Etapas',
    columns: ['id', 'meta_id', 'ordem', 'descricao', 'responsavel_id', 'responsavel_nome', 'prazo_previsto', 'status', 'data_conclusao', 'criado_em'],
  },
  evidencia: {
    name: 'Evidencias',
    columns: ['id', 'etapa_id', 'arquivo_url', 'arquivo_nome', 'observacao', 'autor_id', 'autor_nome', 'criado_em'],
  },
}

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
    if (!SHEET_ID)      throw new Error('PLANO_ACAO_SHEET_ID não configurado nos secrets.')

    const auth = new JWT({
      email,
      key: key.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    const doc = new GoogleSpreadsheet(SHEET_ID, auth)
    await doc.loadInfo()

    const getEntitySheet = (entity: string) => {
      const def = SHEETS[entity]
      if (!def) throw new Error(`Entidade "${entity}" inválida.`)
      const sheet = doc.sheetsByTitle[def.name]
      if (!sheet) throw new Error(`Aba "${def.name}" não encontrada na planilha. Crie a aba e tente novamente.`)
      return { sheet, columns: def.columns }
    }

    // ── GET: retorna as 3 abas como arrays de objetos ────────────────────────
    if (req.method === 'GET') {
      const result: Record<string, unknown[]> = {}
      for (const entity of Object.keys(SHEETS)) {
        const { sheet, columns } = getEntitySheet(entity)
        const rows = await sheet.getRows()
        result[`${entity}s`] = rows.map((row: any) =>
          Object.fromEntries(columns.map(col => [col, row.get(col) ?? '']))
        )
      }
      return ok(corsHeaders, result)
    }

    // ── POST: cria ou atualiza uma linha ─────────────────────────────────────
    if (req.method === 'POST') {
      const body = await req.json()
      const { entity, action, id, data } = body
      if (!entity || !action || !data) throw new Error('Requisição inválida: entity, action e data são obrigatórios.')

      const { sheet, columns } = getEntitySheet(entity)

      if (action === 'create') {
        const headers = await sheet.loadHeaderRow().then(() => sheet.headerValues).catch(() => [])
        if (!headers || headers.length === 0) {
          await sheet.setHeaderRow(columns)
        }
        await sheet.addRow(Object.fromEntries(columns.map(col => [col, data[col] ?? ''])))
        return ok(corsHeaders, { success: true })
      }

      if (action === 'update') {
        if (!id) throw new Error('Requisição inválida: id é obrigatório para update.')
        const rows = await sheet.getRows()
        const row = rows.find((r: any) => r.get('id') === id)
        if (!row) throw new Error(`Linha com id "${id}" não encontrada em ${entity}.`)
        for (const col of columns) {
          if (col in data) row.set(col, data[col] ?? '')
        }
        await row.save()
        return ok(corsHeaders, { success: true })
      }

      throw new Error(`Action "${action}" inválida.`)
    }

    throw new Error('Método não suportado.')

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[google-sheets-plano-acao]', message)
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
