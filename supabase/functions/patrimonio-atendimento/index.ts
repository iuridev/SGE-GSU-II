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
const INCORPORACOES_SHEET = 'Incorporacoes_Pendentes'

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
  'numero_patrimonial', 'descricao', 'numero_documento', 'gr_link', 'tipo_documento', 'cadastrado_sam',
  'pendente_incorporacao', 'nota_fiscal_link',
  'autor_id', 'autor_nome', 'data_registro',
]
// Itens recebidos por uma escola (ex.: compra direta, doação) que ainda não têm nº
// patrimonial e não passaram por remanejamento entre escolas — ficam "Pendente" até
// o admin regional confirmar a incorporação junto ao órgão central e informar o nº
// de chapa patrimonial atribuído.
const INCORPORACOES_COLUMNS = [
  'id', 'escola_id', 'escola_nome', 'descricao', 'quantidade', 'nota_fiscal_link',
  'status', 'numero_patrimonial',
  'autor_id', 'autor_nome', 'data_registro',
  'incorporado_por', 'data_incorporacao',
  // Origem do item: entrega FDE/SEDUC (sem custo) ou aquisição própria com verba PDDE
  // (Federal/Paulista) — nesse caso data de aquisição, valor e ano da verba importam
  // para prestação de contas.
  'origem_aquisicao', 'data_aquisicao', 'valor_item', 'ano_verba',
  // Órgão específico responsável pela entrega, quando origem_aquisicao é "Entrega
  // FDE/SEDUC" — não se aplica a itens PDDE.
  'orgao_entrega',
  // Agrupa itens cadastrados juntos no mesmo formulário (múltiplos itens numa leva) só
  // para exibição — cada item mantém status/nº patrimonial de incorporação independentes.
  'lote_id',
  // Exclusão (lixeira): item nunca é removido da planilha, só marcado com
  // status "Excluído" e some da listagem — mantém o registro de quem excluiu
  // e quando, para auditoria (mesmo padrão de incorporado_por/data_incorporacao).
  'excluido_por', 'data_exclusao',
]
const ORIGENS_AQUISICAO_VALIDAS = ['Entrega FDE/SEDUC', 'Aquisição PDDE Federal', 'Aquisição PDDE Paulista']
const ORGAOS_ENTREGA_VALIDOS = ['FDE', 'CEQUI', 'CITEM', 'COINTEC']

type Profile = { role: string; school_id: string | null; full_name: string | null; supervisor_schools: string[] | null }

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

    const { data: profile } = await supabase.from('profiles').select('role, school_id, full_name, supervisor_schools').eq('id', user.id).single()
    if (!profile) throw new Error('Perfil de usuário não encontrado.')
    const p = profile as Profile
    const autorNome = p.full_name || user.email || 'Usuário'

    if (!['regional_admin', 'school_manager', 'chefe_departamento', 'supervisor'].includes(p.role)) {
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
        } else if (p.role === 'supervisor') {
          const escolasSupervisionadas = p.supervisor_schools || []
          atendimentos = atendimentos.filter((a: any) => escolasSupervisionadas.includes(a.escola_id))
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

      case 'editar_atendimento': {
        exigirRegionalAdmin(p)
        const sheet = await getOrCreateSheet(doc, ATENDIMENTOS_SHEET, ATENDIMENTOS_COLUMNS)
        if (!body.id) throw new Error('Atendimento não informado.')
        if (!body.data_atendimento || !body.pauta) throw new Error('Data e pauta são obrigatórios.')
        const rows = await sheet.getRows()
        const row = rows.find((r: any) => r.get('id') === String(body.id))
        if (!row) throw new Error('Atendimento não encontrado.')
        row.set('data_atendimento', String(body.data_atendimento))
        row.set('escola_id', String(body.escola_id || ''))
        row.set('escola_nome', String(body.escola_nome || ''))
        row.set('fde_code', String(body.fde_code || ''))
        row.set('canal', String(body.canal || 'Teams'))
        row.set('pauta', String(body.pauta))
        row.set('processo_origem', String(body.processo_origem || ''))
        row.set('processo_id', String(body.processo_id || ''))
        row.set('processo_identificador', String(body.processo_identificador || ''))
        row.set('duracao_minutos', String(body.duracao_minutos || ''))
        row.set('observacoes', String(body.observacoes || ''))
        await row.save()
        return ok(corsHeaders, { success: true })
      }

      case 'listar_observacoes': {
        const sheet = await getOrCreateSheet(doc, OBSERVACOES_SHEET, OBSERVACOES_COLUMNS)
        const rows = await sheet.getRows()
        let observacoes = rows.map((r: any) => rowToObject(r, OBSERVACOES_COLUMNS))
        if (p.role === 'school_manager') {
          observacoes = observacoes.filter((o: any) => o.escola_id === p.school_id)
        } else if (p.role === 'supervisor') {
          const escolasSupervisionadas = p.supervisor_schools || []
          observacoes = observacoes.filter((o: any) => escolasSupervisionadas.includes(o.escola_id))
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
        } else if (p.role === 'supervisor') {
          const escolasSupervisionadas = p.supervisor_schools || []
          remanejamentos = remanejamentos.filter((r: any) => escolasSupervisionadas.includes(r.escola_origem_id) || escolasSupervisionadas.includes(r.escola_destino_id))
        }
        return ok(corsHeaders, remanejamentos)
      }

      case 'registrar_remanejamento': {
        exigirRegionalAdmin(p)
        const sheet = await getOrCreateSheet(doc, REMANEJAMENTOS_SHEET, REMANEJAMENTOS_COLUMNS)
        if (!body.escola_origem_id || !body.escola_destino_id || !body.numero_documento) {
          throw new Error('Escola origem, escola destino e nº do documento são obrigatórios.')
        }
        if (!body.pendente_incorporacao && !body.numero_patrimonial) {
          throw new Error('Nº patrimonial é obrigatório, a menos que o item esteja marcado como pendente de incorporação.')
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
          numero_patrimonial: String(body.numero_patrimonial || ''),
          descricao: String(body.descricao || ''),
          numero_documento: String(body.numero_documento),
          gr_link: String(body.gr_link || ''),
          tipo_documento: body.tipo_documento === 'DOC' ? 'DOC' : 'GR',
          cadastrado_sam: body.cadastrado_sam ? 'TRUE' : 'FALSE',
          pendente_incorporacao: body.pendente_incorporacao ? 'TRUE' : 'FALSE',
          nota_fiscal_link: String(body.nota_fiscal_link || ''),
          autor_id: user.id,
          autor_nome: autorNome,
          data_registro: new Date().toISOString(),
        })
        return ok(corsHeaders, { success: true })
      }

      case 'editar_remanejamento': {
        exigirRegionalAdmin(p)
        const sheet = await getOrCreateSheet(doc, REMANEJAMENTOS_SHEET, REMANEJAMENTOS_COLUMNS)
        if (!body.id) throw new Error('Remanejamento não informado.')
        if (!body.escola_origem_id || !body.escola_destino_id || !body.numero_documento) {
          throw new Error('Escola origem, escola destino e nº do documento são obrigatórios.')
        }
        if (!body.pendente_incorporacao && !body.numero_patrimonial) {
          throw new Error('Nº patrimonial é obrigatório, a menos que o item esteja marcado como pendente de incorporação.')
        }
        if (String(body.escola_origem_id) === String(body.escola_destino_id)) {
          throw new Error('A escola de destino deve ser diferente da escola de origem.')
        }
        const rows = await sheet.getRows()
        const row = rows.find((r: any) => r.get('id') === String(body.id))
        if (!row) throw new Error('Remanejamento não encontrado.')
        row.set('escola_origem_id', String(body.escola_origem_id))
        row.set('escola_origem_nome', String(body.escola_origem_nome || ''))
        row.set('escola_destino_id', String(body.escola_destino_id))
        row.set('escola_destino_nome', String(body.escola_destino_nome || ''))
        row.set('numero_patrimonial', String(body.numero_patrimonial || ''))
        row.set('descricao', String(body.descricao || ''))
        row.set('numero_documento', String(body.numero_documento))
        row.set('gr_link', String(body.gr_link || ''))
        row.set('tipo_documento', body.tipo_documento === 'DOC' ? 'DOC' : 'GR')
        row.set('cadastrado_sam', body.cadastrado_sam ? 'TRUE' : 'FALSE')
        row.set('pendente_incorporacao', body.pendente_incorporacao ? 'TRUE' : 'FALSE')
        row.set('nota_fiscal_link', String(body.nota_fiscal_link || ''))
        await row.save()
        return ok(corsHeaders, { success: true })
      }

      case 'listar_incorporacoes': {
        const sheet = await getOrCreateSheet(doc, INCORPORACOES_SHEET, INCORPORACOES_COLUMNS)
        const rows = await sheet.getRows()
        let incorporacoes = rows.map((r: any) => rowToObject(r, INCORPORACOES_COLUMNS)).filter((i: any) => i.status !== 'Excluído')
        if (p.role === 'school_manager') {
          incorporacoes = incorporacoes.filter((i: any) => i.escola_id === p.school_id)
        } else if (p.role === 'supervisor') {
          const escolasSupervisionadas = p.supervisor_schools || []
          incorporacoes = incorporacoes.filter((i: any) => escolasSupervisionadas.includes(i.escola_id))
        }
        return ok(corsHeaders, incorporacoes)
      }

      case 'registrar_incorporacao': {
        exigirRegionalAdmin(p)
        const sheet = await getOrCreateSheet(doc, INCORPORACOES_SHEET, INCORPORACOES_COLUMNS)
        if (!body.escola_id || !body.descricao || !body.quantidade || !body.data_aquisicao) {
          throw new Error('Escola, descrição do item, quantidade e data de aquisição são obrigatórios.')
        }
        const origemAquisicao = ORIGENS_AQUISICAO_VALIDAS.includes(body.origem_aquisicao) ? body.origem_aquisicao : 'Entrega FDE/SEDUC'
        const pdde = origemAquisicao !== 'Entrega FDE/SEDUC'
        if (pdde && (!body.ano_verba || !body.valor_item)) {
          throw new Error('Valor do item e ano da verba são obrigatórios para itens adquiridos via PDDE.')
        }
        if (!pdde && !ORGAOS_ENTREGA_VALIDOS.includes(body.orgao_entrega)) {
          throw new Error('Órgão de entrega é obrigatório para itens de Entrega FDE/SEDUC.')
        }
        await sheet.addRow({
          id: crypto.randomUUID(),
          escola_id: String(body.escola_id),
          escola_nome: String(body.escola_nome || ''),
          descricao: String(body.descricao),
          quantidade: String(body.quantidade),
          nota_fiscal_link: String(body.nota_fiscal_link || ''),
          status: 'Pendente',
          numero_patrimonial: '',
          autor_id: user.id,
          autor_nome: autorNome,
          data_registro: new Date().toISOString(),
          incorporado_por: '',
          data_incorporacao: '',
          origem_aquisicao: String(origemAquisicao),
          orgao_entrega: pdde ? '' : String(body.orgao_entrega || ''),
          data_aquisicao: String(body.data_aquisicao || ''),
          valor_item: String(body.valor_item || ''),
          ano_verba: String(body.ano_verba || ''),
          lote_id: String(body.lote_id || ''),
        })
        return ok(corsHeaders, { success: true })
      }

      case 'editar_incorporacao': {
        exigirRegionalAdmin(p)
        const sheet = await getOrCreateSheet(doc, INCORPORACOES_SHEET, INCORPORACOES_COLUMNS)
        if (!body.id) throw new Error('Item não informado.')
        if (!body.escola_id || !body.descricao || !body.quantidade || !body.data_aquisicao) {
          throw new Error('Escola, descrição do item, quantidade e data de aquisição são obrigatórios.')
        }
        const origemAquisicao = ORIGENS_AQUISICAO_VALIDAS.includes(body.origem_aquisicao) ? body.origem_aquisicao : 'Entrega FDE/SEDUC'
        const pdde = origemAquisicao !== 'Entrega FDE/SEDUC'
        if (pdde && (!body.ano_verba || !body.valor_item)) {
          throw new Error('Valor do item e ano da verba são obrigatórios para itens adquiridos via PDDE.')
        }
        if (!pdde && !ORGAOS_ENTREGA_VALIDOS.includes(body.orgao_entrega)) {
          throw new Error('Órgão de entrega é obrigatório para itens de Entrega FDE/SEDUC.')
        }
        const rows = await sheet.getRows()
        const row = rows.find((r: any) => r.get('id') === String(body.id))
        if (!row) throw new Error('Item não encontrado.')
        row.set('escola_id', String(body.escola_id))
        row.set('escola_nome', String(body.escola_nome || ''))
        row.set('descricao', String(body.descricao))
        row.set('quantidade', String(body.quantidade))
        row.set('nota_fiscal_link', String(body.nota_fiscal_link || ''))
        row.set('origem_aquisicao', String(origemAquisicao))
        row.set('orgao_entrega', pdde ? '' : String(body.orgao_entrega || ''))
        row.set('data_aquisicao', String(body.data_aquisicao || ''))
        row.set('valor_item', String(body.valor_item || ''))
        row.set('ano_verba', String(body.ano_verba || ''))
        await row.save()
        return ok(corsHeaders, { success: true })
      }

      case 'marcar_incorporado': {
        exigirRegionalAdmin(p)
        const sheet = await getOrCreateSheet(doc, INCORPORACOES_SHEET, INCORPORACOES_COLUMNS)
        if (!body.id) throw new Error('Item não informado.')
        if (!body.numero_patrimonial) throw new Error('Nº patrimonial atribuído é obrigatório para confirmar a incorporação.')
        const rows = await sheet.getRows()
        const row = rows.find((r: any) => r.get('id') === String(body.id))
        if (!row) throw new Error('Item não encontrado.')
        row.set('status', 'Incorporado')
        row.set('numero_patrimonial', String(body.numero_patrimonial))
        row.set('incorporado_por', autorNome)
        row.set('data_incorporacao', new Date().toISOString())
        await row.save()
        return ok(corsHeaders, { success: true })
      }

      case 'excluir_incorporacao': {
        exigirRegionalAdmin(p)
        const sheet = await getOrCreateSheet(doc, INCORPORACOES_SHEET, INCORPORACOES_COLUMNS)
        if (!body.id) throw new Error('Item não informado.')
        const rows = await sheet.getRows()
        const row = rows.find((r: any) => r.get('id') === String(body.id))
        if (!row) throw new Error('Item não encontrado.')
        if (row.get('status') === 'Excluído') throw new Error('Item já foi excluído.')
        row.set('status', 'Excluído')
        row.set('excluido_por', autorNome)
        row.set('data_exclusao', new Date().toISOString())
        await row.save()
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
