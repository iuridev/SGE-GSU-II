import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import { GoogleSpreadsheet } from "npm:google-spreadsheet@4.1.1"
// @ts-ignore
import { JWT } from "npm:google-auth-library@9.6.3"
import { getCorsHeaders } from '../_shared/cors.ts'

// Reaproveita a mesma planilha já usada por "Visitas às Unidades Escolares" /
// "Atendimento Patrimônio" (VISITAS_SHEET_ID já configurado nos secrets) — as
// abas abaixo são novas, criadas automaticamente na primeira escrita.
const SHEET_ID = Deno.env.get('VISITAS_SHEET_ID') ?? ''

const RESPOSTAS_SHEET = 'Reforma_FUNAP_Respostas'
const HISTORICO_SHEET = 'Reforma_FUNAP_Historico'
const JANELA_SHEET = 'Reforma_FUNAP_Janela'

const RESPOSTAS_COLUMNS = [
  'id', 'escola_id', 'escola_nome', 'cie_code',
  'cja05_carteiras', 'cja05_cadeiras', 'cja06_carteiras', 'cja06_cadeiras',
  'transporte', 'data_prevista_transporte', 'quantidade_viagens',
  'respondente_id', 'respondente_nome', 'data_resposta',
  'data_ultima_edicao', 'editado_por_nome',
  'logistica_atualizada_por', 'logistica_atualizada_em',
]
const HISTORICO_COLUMNS = [
  'id', 'resposta_id', 'escola_id', 'escola_nome', 'acao',
  'dados_antes', 'dados_depois', 'autor_id', 'autor_nome', 'data_hora',
]
const JANELA_COLUMNS = [
  'id', 'data_inicio', 'data_fim', 'ativo', 'autor_id', 'autor_nome', 'data_registro',
]

type Profile = { role: string; school_id: string | null; full_name: string | null }

// Cache em memória do módulo, reaproveitado entre invocações "quentes" da mesma
// instância — mesmo padrão de patrimonio-atendimento: sem isso cada ação dispara
// doc.loadInfo() de várias abas e estoura a cota de leitura da Sheets API (429).
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
  if (profile.role !== 'regional_admin') {
    throw new Error('Apenas administradores regionais podem executar esta ação.')
  }
}

function rowToObject(row: any, columns: string[]) {
  return Object.fromEntries(columns.map(col => [col, row.get(col) ?? '']))
}

async function getJanelaAtual(doc: any) {
  const sheet = await getOrCreateSheet(doc, JANELA_SHEET, JANELA_COLUMNS)
  const rows = await sheet.getRows()
  if (rows.length === 0) return null
  const last = rows[rows.length - 1]
  return rowToObject(last, JANELA_COLUMNS)
}

function janelaEstaAberta(janela: any): { aberta: boolean; motivo?: string } {
  if (!janela) return { aberta: false, motivo: 'Nenhum prazo de preenchimento foi configurado ainda.' }
  if (janela.ativo !== 'TRUE') return { aberta: false, motivo: 'O prazo de preenchimento está desativado.' }
  const inicio = new Date(janela.data_inicio)
  const fim = new Date(janela.data_fim)
  const agora = new Date()
  if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
    return { aberta: false, motivo: 'Prazo de preenchimento configurado incorretamente.' }
  }
  if (agora < inicio) return { aberta: false, motivo: 'O prazo de preenchimento ainda não foi aberto.' }
  if (agora > fim) return { aberta: false, motivo: 'O prazo de preenchimento já foi encerrado.' }
  return { aberta: true }
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

    if (!['regional_admin', 'school_manager', 'supervisor', 'dirigente', 'chefe_departamento'].includes(p.role)) {
      throw new Error('Seu perfil não tem acesso a este módulo.')
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action as string
    if (!action) throw new Error('Ação não informada.')

    const doc = await getDoc()

    switch (action) {
      case 'obter_janela': {
        const janela = await getJanelaAtual(doc)
        return ok(corsHeaders, { janela, status: janelaEstaAberta(janela) })
      }

      case 'definir_janela': {
        exigirRegionalAdmin(p)
        if (!body.data_inicio || !body.data_fim) throw new Error('Data de início e data de fim são obrigatórias.')
        if (new Date(body.data_fim) <= new Date(body.data_inicio)) {
          throw new Error('A data de fim deve ser depois da data de início.')
        }
        const sheet = await getOrCreateSheet(doc, JANELA_SHEET, JANELA_COLUMNS)
        await sheet.addRow({
          id: crypto.randomUUID(),
          data_inicio: String(body.data_inicio),
          data_fim: String(body.data_fim),
          ativo: body.ativo === false ? 'FALSE' : 'TRUE',
          autor_id: user.id,
          autor_nome: autorNome,
          data_registro: new Date().toISOString(),
        })
        return ok(corsHeaders, { success: true })
      }

      case 'listar_janelas': {
        exigirRegionalAdmin(p)
        const sheet = await getOrCreateSheet(doc, JANELA_SHEET, JANELA_COLUMNS)
        const rows = await sheet.getRows()
        const janelas = rows.map((r: any) => rowToObject(r, JANELA_COLUMNS)).reverse()
        return ok(corsHeaders, janelas)
      }

      case 'listar_respostas': {
        const sheet = await getOrCreateSheet(doc, RESPOSTAS_SHEET, RESPOSTAS_COLUMNS)
        const rows = await sheet.getRows()
        let respostas = rows.map((r: any) => rowToObject(r, RESPOSTAS_COLUMNS))
        if (p.role === 'school_manager') {
          respostas = respostas.filter((r: any) => r.escola_id === p.school_id)
        }
        return ok(corsHeaders, respostas)
      }

      case 'salvar_resposta': {
        if (p.role !== 'school_manager') throw new Error('Apenas escolas podem preencher o levantamento.')
        if (!p.school_id) throw new Error('Usuário não está vinculado a uma escola.')

        const janela = await getJanelaAtual(doc)
        const statusJanela = janelaEstaAberta(janela)
        if (!statusJanela.aberta) throw new Error(statusJanela.motivo || 'Prazo de preenchimento encerrado.')

        const camposNumericos = ['cja05_carteiras', 'cja05_cadeiras', 'cja06_carteiras', 'cja06_cadeiras']
        for (const campo of camposNumericos) {
          const v = Number(body[campo] ?? 0)
          if (!Number.isFinite(v) || v < 0) throw new Error('As quantidades informadas devem ser números válidos e não negativos.')
        }

        const sheet = await getOrCreateSheet(doc, RESPOSTAS_SHEET, RESPOSTAS_COLUMNS)
        const rows = await sheet.getRows()
        const existente = rows.find((r: any) => r.get('escola_id') === String(p.school_id))
        const agora = new Date().toISOString()

        const novosValores = {
          cja05_carteiras: String(body.cja05_carteiras ?? 0),
          cja05_cadeiras: String(body.cja05_cadeiras ?? 0),
          cja06_carteiras: String(body.cja06_carteiras ?? 0),
          cja06_cadeiras: String(body.cja06_cadeiras ?? 0),
        }

        const historicoSheet = await getOrCreateSheet(doc, HISTORICO_SHEET, HISTORICO_COLUMNS)

        if (existente) {
          const dadosAntes = {
            cja05_carteiras: existente.get('cja05_carteiras') ?? '',
            cja05_cadeiras: existente.get('cja05_cadeiras') ?? '',
            cja06_carteiras: existente.get('cja06_carteiras') ?? '',
            cja06_cadeiras: existente.get('cja06_cadeiras') ?? '',
          }
          existente.set('cja05_carteiras', novosValores.cja05_carteiras)
          existente.set('cja05_cadeiras', novosValores.cja05_cadeiras)
          existente.set('cja06_carteiras', novosValores.cja06_carteiras)
          existente.set('cja06_cadeiras', novosValores.cja06_cadeiras)
          existente.set('data_ultima_edicao', agora)
          existente.set('editado_por_nome', autorNome)
          await existente.save()

          await historicoSheet.addRow({
            id: crypto.randomUUID(),
            resposta_id: existente.get('id'),
            escola_id: String(p.school_id),
            escola_nome: existente.get('escola_nome') ?? '',
            acao: 'edicao',
            dados_antes: JSON.stringify(dadosAntes),
            dados_depois: JSON.stringify(novosValores),
            autor_id: user.id,
            autor_nome: autorNome,
            data_hora: agora,
          })
        } else {
          const { data: escola } = await supabase.from('schools').select('id, name, cie_code').eq('id', p.school_id).single()
          const novaId = crypto.randomUUID()
          await sheet.addRow({
            id: novaId,
            escola_id: String(p.school_id),
            escola_nome: escola?.name || '',
            cie_code: escola?.cie_code || '',
            ...novosValores,
            transporte: '',
            data_prevista_transporte: '',
            quantidade_viagens: '',
            respondente_id: user.id,
            respondente_nome: autorNome,
            data_resposta: agora,
            data_ultima_edicao: agora,
            editado_por_nome: autorNome,
          })

          await historicoSheet.addRow({
            id: crypto.randomUUID(),
            resposta_id: novaId,
            escola_id: String(p.school_id),
            escola_nome: escola?.name || '',
            acao: 'criacao',
            dados_antes: '',
            dados_depois: JSON.stringify(novosValores),
            autor_id: user.id,
            autor_nome: autorNome,
            data_hora: agora,
          })
        }

        return ok(corsHeaders, { success: true })
      }

      case 'atualizar_logistica': {
        exigirRegionalAdmin(p)
        if (!body.id) throw new Error('Resposta não informada.')
        const sheet = await getOrCreateSheet(doc, RESPOSTAS_SHEET, RESPOSTAS_COLUMNS)
        const rows = await sheet.getRows()
        const row = rows.find((r: any) => r.get('id') === String(body.id))
        if (!row) throw new Error('Resposta não encontrada.')

        const dadosAntes = {
          transporte: row.get('transporte') ?? '',
          data_prevista_transporte: row.get('data_prevista_transporte') ?? '',
          quantidade_viagens: row.get('quantidade_viagens') ?? '',
        }
        const dadosDepois = {
          transporte: body.transporte === true || body.transporte === 'SIM' ? 'SIM' : 'NAO',
          data_prevista_transporte: String(body.data_prevista_transporte || ''),
          quantidade_viagens: String(body.quantidade_viagens || ''),
        }
        const agora = new Date().toISOString()

        row.set('transporte', dadosDepois.transporte)
        row.set('data_prevista_transporte', dadosDepois.data_prevista_transporte)
        row.set('quantidade_viagens', dadosDepois.quantidade_viagens)
        row.set('logistica_atualizada_por', autorNome)
        row.set('logistica_atualizada_em', agora)
        await row.save()

        const historicoSheet = await getOrCreateSheet(doc, HISTORICO_SHEET, HISTORICO_COLUMNS)
        await historicoSheet.addRow({
          id: crypto.randomUUID(),
          resposta_id: row.get('id'),
          escola_id: row.get('escola_id'),
          escola_nome: row.get('escola_nome') ?? '',
          acao: 'logistica',
          dados_antes: JSON.stringify(dadosAntes),
          dados_depois: JSON.stringify(dadosDepois),
          autor_id: user.id,
          autor_nome: autorNome,
          data_hora: agora,
        })

        return ok(corsHeaders, { success: true })
      }

      case 'listar_historico': {
        const sheet = await getOrCreateSheet(doc, HISTORICO_SHEET, HISTORICO_COLUMNS)
        const rows = await sheet.getRows()
        let historico = rows.map((r: any) => rowToObject(r, HISTORICO_COLUMNS))
        if (p.role === 'school_manager') {
          historico = historico.filter((h: any) => h.escola_id === p.school_id)
        } else if (body.escola_id) {
          historico = historico.filter((h: any) => h.escola_id === String(body.escola_id))
        }
        historico.sort((a: any, b: any) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime())
        return ok(corsHeaders, historico)
      }

      // O ID da planilha (SHEET_ID) fica só nos secrets do servidor — nunca é
      // embutido no bundle do frontend (ao contrário de variáveis VITE_*, que
      // ficam expostas no JS compilado). Só o link final é devolvido, e só
      // para regional_admin autenticado.
      case 'obter_link_planilha': {
        exigirRegionalAdmin(p)
        return ok(corsHeaders, { url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit` })
      }

      default:
        throw new Error(`Ação "${action}" desconhecida.`)
    }
  } catch (error) {
    let message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[reforma-funap]', message)

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
