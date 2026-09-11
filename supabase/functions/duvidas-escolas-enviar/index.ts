import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import { GoogleSpreadsheet } from "npm:google-spreadsheet@4.1.1"
// @ts-ignore
import { JWT } from "npm:google-auth-library@9.6.3"
import { getCorsHeaders } from '../_shared/cors.ts'

// Endpoint PÚBLICO (verify_jwt = false, ver supabase/config.toml) — usado pelo
// formulário sem login enviado por link às escolas. Só sabe fazer duas coisas:
// listar nomes de escola (nada sensível) e gravar uma dúvida nova. Nunca lê
// dúvidas de terceiros — a leitura fica isolada em duvidas-escolas-listar,
// que exige login de regional_admin.
const SHEET_ID = Deno.env.get('DUVIDAS_ESCOLAS_SHEET_ID') ?? ''
const DUVIDAS_SHEET = 'Duvidas'
const DUVIDAS_COLUMNS = ['id', 'escola_id', 'escola_nome', 'categoria', 'duvida', 'contato', 'criado_em']

// "Fiscalização de Contrato de Manutenção de Elevadores" é o único tipo de
// fiscalização de contrato ativo por enquanto — por isso o value já vem
// descritivo (ver mesma lista em src/pages/FormularioDuvidas.tsx).
const CATEGORIAS = ['Obras', 'Manutenções', 'Patrimônio', 'Zeladoria', 'Fiscalização de Contrato de Manutenção de Elevadores', 'Outro']

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

// Mitigação de "formula injection": se o Sheets abrir uma célula que começa
// com = + - @ como fórmula, um texto malicioso poderia executar algo ao ser
// aberto por um humano depois. Prefixando com aspa simples, o Sheets sempre
// trata como texto literal.
function sanitizeText(raw: unknown, maxLen: number): string {
  let s = String(raw ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim().slice(0, maxLen)
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  return s
}

// Rate-limit em memória por IP — reseta a cada cold start da instância, o
// que é aceitável aqui: o objetivo é só amortecer flood/duplo clique, não
// substituir um WAF. Mesma ideia de cache em memória usada em patrimonio-salas.
const lastSubmitByIp = new Map<string, number>()
const RATE_LIMIT_MS = 10_000

function checkRateLimit(ip: string) {
  const now = Date.now()
  const last = lastSubmitByIp.get(ip)
  if (last && (now - last) < RATE_LIMIT_MS) {
    throw new Error('Aguarde alguns segundos antes de enviar outra dúvida.')
  }
  if (lastSubmitByIp.size > 5000) lastSubmitByIp.clear()
  lastSubmitByIp.set(ip, now)
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') throw new Error('Método não suportado.')
    if (!SHEET_ID) throw new Error('Planilha de dúvidas não configurada nos secrets (DUVIDAS_ESCOLAS_SHEET_ID).')

    const body = await req.json().catch(() => ({}))
    const action = body.action as string
    if (!action) throw new Error('Ação não informada.')

    if (action === 'listar_escolas') {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      )
      const { data, error } = await supabaseAdmin.from('schools').select('id, name').order('name')
      if (error) throw error
      const escolas = (data || []).map((s: any) => ({ id: s.id, nome: s.name }))
      return ok(corsHeaders, { escolas })
    }

    if (action === 'criar') {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido'
      checkRateLimit(ip)

      // Honeypot: campo escondido no formulário que só um bot preenche.
      // Resposta "de sucesso" evita dar dica a scrapers de que foi bloqueado.
      if (String(body.campo_extra || '').trim() !== '') {
        return ok(corsHeaders, { success: true })
      }

      const escolaId = String(body.escola_id || '').trim()
      const escolaNome = sanitizeText(body.escola_nome, 200)
      const categoria = String(body.categoria || '').trim()
      const duvida = sanitizeText(body.duvida, 1000)
      const contato = sanitizeText(body.contato, 200)

      if (!escolaId || !escolaNome) throw new Error('Selecione a escola.')
      if (!CATEGORIAS.includes(categoria)) throw new Error('Categoria inválida.')
      if (duvida.length < 5) throw new Error('Descreva a dúvida com um pouco mais de detalhe.')

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      )
      const { data: escola } = await supabaseAdmin.from('schools').select('id').eq('id', escolaId).single()
      if (!escola) throw new Error('Escola não encontrada.')

      const doc = await getDoc()
      const sheet = await getOrCreateSheet(doc, DUVIDAS_SHEET, DUVIDAS_COLUMNS)

      await sheet.addRow({
        id: crypto.randomUUID(),
        escola_id: escolaId,
        escola_nome: escolaNome,
        categoria,
        duvida,
        contato,
        criado_em: new Date().toISOString(),
      })

      return ok(corsHeaders, { success: true })
    }

    throw new Error(`Ação "${action}" desconhecida.`)
  } catch (error) {
    let message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[duvidas-escolas-enviar]', message)

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
