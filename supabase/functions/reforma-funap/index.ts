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
  'confirmado', 'confirmado_por', 'confirmado_em', 'termo_texto',
  'atendimento', 'atendimento_motivo', 'atendimento_por', 'atendimento_em',
  'atend_cja05_carteiras', 'atend_cja05_cadeiras', 'atend_cja06_carteiras', 'atend_cja06_cadeiras',
  'secomse_enviado_em', 'secomse_registrado_por',
]
const CAMPOS_QTD = ['cja05_carteiras', 'cja05_cadeiras', 'cja06_carteiras', 'cja06_cadeiras']
const ROTULO_QTD: Record<string, string> = {
  cja05_carteiras: 'Carteiras CJA-05',
  cja05_cadeiras: 'Cadeiras CJA-05',
  cja06_carteiras: 'Carteiras CJA-06',
  cja06_cadeiras: 'Cadeiras CJA-06',
}
const HISTORICO_COLUMNS = [
  'id', 'resposta_id', 'escola_id', 'escola_nome', 'acao',
  'dados_antes', 'dados_depois', 'autor_id', 'autor_nome', 'data_hora',
]
const JANELA_COLUMNS = [
  'id', 'data_inicio', 'data_fim', 'ativo', 'autor_id', 'autor_nome', 'data_registro',
]
// Capacidade informada pela FUNAP. Cada edição vira uma linha nova (a última
// vale) — mesmo padrão da Janela, para manter o histórico de alterações.
const CAPACIDADE_SHEET = 'Reforma_FUNAP_Capacidade'
// `lote` vazio = Lote 1 (linhas cadastradas antes de existirem lotes). Cada
// novo saldo recebido da FUNAP abre o lote seguinte, com capacidade própria.
const CAPACIDADE_COLUMNS = [
  'id', 'cja05_carteiras', 'cja05_cadeiras', 'cja06_carteiras', 'cja06_cadeiras',
  'observacao', 'autor_id', 'autor_nome', 'data_registro', 'lote',
]
// Decisão de atendimento por escola × lote — a mesma escola pode ser atendida
// em parte no Lote 1 e completar no Lote 2, cada lote com sua logística.
// Linha com atendimento vazio = desfeita (a linha nunca é apagada, para não
// reativar a migração abaixo).
const ATENDIMENTOS_SHEET = 'Reforma_FUNAP_Atendimentos'
const ATENDIMENTOS_COLUMNS = [
  'id', 'resposta_id', 'escola_id', 'escola_nome', 'lote',
  'atendimento', 'atendimento_motivo', 'atendimento_por', 'atendimento_em',
  'atend_cja05_carteiras', 'atend_cja05_cadeiras', 'atend_cja06_carteiras', 'atend_cja06_cadeiras',
  'transporte', 'data_prevista_transporte', 'quantidade_viagens',
  'logistica_atualizada_por', 'logistica_atualizada_em',
  'secomse_enviado_em', 'secomse_registrado_por',
]
// Colunas que antes dos lotes ficavam na própria resposta (mesmos nomes).
const COLUNAS_MIGRADAS = ATENDIMENTOS_COLUMNS.slice(5)

const loteDe = (v: unknown) => Math.max(1, parseInt(String(v ?? ''), 10) || 1)

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
    const novosHeaders = [...headers, ...missing]
    // setHeaderRow recusa cabeçalho maior que a grade da aba (26 colunas por
    // padrão) — amplia as colunas antes, mantendo as linhas existentes.
    if (novosHeaders.length > sheet.columnCount) {
      await sheet.resize({ rowCount: sheet.rowCount, columnCount: novosHeaders.length })
    }
    await sheet.setHeaderRow(novosHeaders)
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

// Capacidade vigente de cada lote (a última linha do lote vale) + histórico.
async function getCapacidades(doc: any) {
  const sheet = await getOrCreateSheet(doc, CAPACIDADE_SHEET, CAPACIDADE_COLUMNS)
  const rows = await sheet.getRows()
  const historico = rows.map((r: any) => ({ ...rowToObject(r, CAPACIDADE_COLUMNS), lote: String(loteDe(r.get('lote'))) }))
  const porLote: Record<string, any> = {}
  for (const h of historico) porLote[h.lote] = h
  const ultimoLote = Math.max(1, ...Object.keys(porLote).map(Number))
  return { porLote, historico, ultimoLote }
}

// Antes dos lotes, a decisão de atendimento e a logística ficavam em colunas da
// própria resposta. Na primeira leitura, copia tudo como Lote 1 — as colunas
// antigas continuam intactas na aba de respostas, só deixam de ser usadas.
async function getAtendimentos(doc: any) {
  const sheet = await getOrCreateSheet(doc, ATENDIMENTOS_SHEET, ATENDIMENTOS_COLUMNS)
  let rows = await sheet.getRows()
  if (rows.length === 0) {
    const respostasSheet = await getOrCreateSheet(doc, RESPOSTAS_SHEET, RESPOSTAS_COLUMNS)
    const legado = (await respostasSheet.getRows()).filter((r: any) => r.get('atendimento'))
    if (legado.length > 0) {
      await sheet.addRows(legado.map((r: any) => ({
        id: crypto.randomUUID(),
        resposta_id: r.get('id'),
        escola_id: r.get('escola_id'),
        escola_nome: r.get('escola_nome') ?? '',
        lote: '1',
        ...Object.fromEntries(COLUNAS_MIGRADAS.map(c => [c, r.get(c) ?? ''])),
      })))
      rows = await sheet.getRows()
    }
  }
  return { sheet, rows }
}

const qtdAtendidaRow = (r: any, campo: string) =>
  r.get('atendimento') === 'ATENDIDA' ? Number(r.get(`atend_${campo}`) || 0) : 0

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
      case 'obter_capacidade': {
        if (p.role === 'school_manager') throw new Error('Seu perfil não tem acesso a esta informação.')
        const { porLote, historico } = await getCapacidades(doc)
        return ok(corsHeaders, { capacidades: porLote, historico: [...historico].reverse() })
      }

      case 'definir_capacidade': {
        exigirRegionalAdmin(p)
        const lote = loteDe(body.lote)
        const { porLote, ultimoLote } = await getCapacidades(doc)
        // Só abre o lote seguinte depois que o atual tem capacidade cadastrada.
        const proximo = porLote[String(ultimoLote)] ? ultimoLote + 1 : ultimoLote
        if (lote > proximo) throw new Error(`Cadastre a capacidade do Lote ${proximo} antes.`)
        const valores: Record<string, string> = {}
        for (const campo of CAMPOS_QTD) {
          const v = Number(body[campo] ?? 0)
          if (!Number.isInteger(v) || v < 0) throw new Error('As quantidades da capacidade devem ser números inteiros não negativos.')
          valores[campo] = String(v)
        }
        const sheet = await getOrCreateSheet(doc, CAPACIDADE_SHEET, CAPACIDADE_COLUMNS)
        await sheet.addRow({
          id: crypto.randomUUID(),
          ...valores,
          lote: String(lote),
          observacao: String(body.observacao ?? '').trim(),
          autor_id: user.id,
          autor_nome: autorNome,
          data_registro: new Date().toISOString(),
        })
        return ok(corsHeaders, { success: true })
      }

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

      // Decisão é visível só para admin/supervisor/dirigente — a escola não vê.
      case 'listar_atendimentos': {
        if (p.role === 'school_manager') throw new Error('Seu perfil não tem acesso a esta informação.')
        const { rows } = await getAtendimentos(doc)
        // Se duas leituras simultâneas migraram o legado em dobro, vale a primeira.
        const unicos = new Map<string, any>()
        for (const r of rows) {
          const chave = `${r.get('resposta_id')}|${loteDe(r.get('lote'))}`
          if (!unicos.has(chave)) unicos.set(chave, r)
        }
        const atendimentos = [...unicos.values()]
          .filter((r: any) => r.get('atendimento'))
          .map((r: any) => ({ ...rowToObject(r, ATENDIMENTOS_COLUMNS), lote: String(loteDe(r.get('lote'))) }))
        return ok(corsHeaders, atendimentos)
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

        if (existente && existente.get('confirmado') === 'TRUE') {
          throw new Error('Esta resposta já foi confirmada pela escola e não pode mais ser alterada.')
        }

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

      case 'confirmar_resposta': {
        if (p.role !== 'school_manager') throw new Error('Apenas escolas podem confirmar a resposta.')
        if (!p.school_id) throw new Error('Usuário não está vinculado a uma escola.')
        if (!body.termo_texto) throw new Error('Texto do termo de conferência não informado.')

        const sheet = await getOrCreateSheet(doc, RESPOSTAS_SHEET, RESPOSTAS_COLUMNS)
        const rows = await sheet.getRows()
        const row = rows.find((r: any) => r.get('escola_id') === String(p.school_id))
        if (!row) throw new Error('Preencha e salve as quantidades antes de confirmar.')
        if (row.get('confirmado') === 'TRUE') throw new Error('Esta resposta já foi confirmada.')

        const agora = new Date().toISOString()
        row.set('confirmado', 'TRUE')
        row.set('confirmado_por', autorNome)
        row.set('confirmado_em', agora)
        row.set('termo_texto', String(body.termo_texto))
        await row.save()

        const historicoSheet = await getOrCreateSheet(doc, HISTORICO_SHEET, HISTORICO_COLUMNS)
        await historicoSheet.addRow({
          id: crypto.randomUUID(),
          resposta_id: row.get('id'),
          escola_id: String(p.school_id),
          escola_nome: row.get('escola_nome') ?? '',
          acao: 'confirmacao',
          dados_antes: '',
          dados_depois: JSON.stringify({ confirmado: 'TRUE' }),
          autor_id: user.id,
          autor_nome: autorNome,
          data_hora: agora,
        })

        return ok(corsHeaders, { success: true })
      }

      // Logística de transporte de um atendimento (escola × lote).
      case 'atualizar_logistica': {
        exigirRegionalAdmin(p)
        if (!body.atendimento_id) throw new Error('Atendimento não informado.')
        const { rows } = await getAtendimentos(doc)
        const row = rows.find((r: any) => r.get('id') === String(body.atendimento_id))
        if (!row || row.get('atendimento') !== 'ATENDIDA') throw new Error('Atendimento não encontrado.')

        const lote = String(loteDe(row.get('lote')))
        const dadosAntes = {
          lote,
          transporte: row.get('transporte') ?? '',
          data_prevista_transporte: row.get('data_prevista_transporte') ?? '',
          quantidade_viagens: row.get('quantidade_viagens') ?? '',
        }
        const dadosDepois = {
          lote,
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
          resposta_id: row.get('resposta_id'),
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

      // Decisão da Regional, por lote, sobre o que a FUNAP vai atender de cada
      // escola: ATENDIDA | NAO_ATENDIDA | '' (vazio = volta a "a decidir").
      // Motivo obrigatório quando não atendida. Quando atendida, informa a
      // quantidade por item — até o que falta atender (solicitado − atendido
      // nos outros lotes) e dentro do saldo do lote.
      case 'definir_atendimento': {
        exigirRegionalAdmin(p)
        if (!body.id) throw new Error('Resposta não informada.')
        const lote = loteDe(body.lote)
        const atendimento = String(body.atendimento ?? '')
        if (!['ATENDIDA', 'NAO_ATENDIDA', ''].includes(atendimento)) throw new Error('Situação de atendimento inválida.')
        const motivo = atendimento ? String(body.motivo ?? '').trim() : ''
        if (atendimento === 'NAO_ATENDIDA' && !motivo) throw new Error('Informe o motivo do não atendimento.')

        const { porLote, ultimoLote } = await getCapacidades(doc)
        if (lote > ultimoLote) throw new Error(`O Lote ${lote} ainda não foi aberto — cadastre a capacidade dele.`)

        const respostasSheet = await getOrCreateSheet(doc, RESPOSTAS_SHEET, RESPOSTAS_COLUMNS)
        const resposta = (await respostasSheet.getRows()).find((r: any) => r.get('id') === String(body.id))
        if (!resposta) throw new Error('Resposta não encontrada.')

        const { sheet, rows } = await getAtendimentos(doc)
        const daEscola = (r: any) => r.get('resposta_id') === String(body.id)
        const doLote = (r: any) => loteDe(r.get('lote')) === lote
        const existente = rows.find((r: any) => daEscola(r) && doLote(r))

        const quantidades: Record<string, string> = {}
        for (const campo of CAMPOS_QTD) {
          const colAtend = `atend_${campo}`
          if (atendimento !== 'ATENDIDA') { quantidades[colAtend] = ''; continue }
          const v = Number(body.quantidades?.[campo] ?? 0)
          const outrosLotes = rows.filter((r: any) => daEscola(r) && !doLote(r)).reduce((acc: number, r: any) => acc + qtdAtendidaRow(r, campo), 0)
          const restante = Number(resposta.get(campo) || 0) - outrosLotes
          if (!Number.isInteger(v) || v < 0) throw new Error('As quantidades atendidas devem ser números inteiros não negativos.')
          if (v > restante) {
            throw new Error(`${ROTULO_QTD[campo]}: só faltam ${Math.max(0, restante)} para esta escola (solicitado menos o já atendido em outros lotes).`)
          }
          quantidades[colAtend] = String(v)
        }
        if (atendimento === 'ATENDIDA' && Object.values(quantidades).every(v => Number(v) === 0)) {
          throw new Error('Informe ao menos um item a ser atendido (ou marque como não atendida).')
        }

        // Não deixa passar do saldo do lote (se a capacidade dele foi cadastrada):
        // soma o já atendido nas outras escolas do lote + o desta.
        const capacidade = porLote[String(lote)]
        if (atendimento === 'ATENDIDA' && capacidade) {
          for (const campo of CAMPOS_QTD) {
            const outras = rows.filter((r: any) => doLote(r) && !daEscola(r)).reduce((acc: number, r: any) => acc + qtdAtendidaRow(r, campo), 0)
            const saldo = Number(capacidade[campo] || 0) - outras
            if (Number(quantidades[`atend_${campo}`]) > saldo) {
              throw new Error(`Saldo do Lote ${lote} insuficiente em ${ROTULO_QTD[campo]}: disponível ${Math.max(0, saldo)}.`)
            }
          }
        }

        const dadosAntes: Record<string, string> = {
          lote: String(lote),
          atendimento: existente?.get('atendimento') ?? '',
          atendimento_motivo: existente?.get('atendimento_motivo') ?? '',
        }
        for (const campo of CAMPOS_QTD) dadosAntes[`atend_${campo}`] = existente?.get(`atend_${campo}`) ?? ''
        const dadosDepois = { lote: String(lote), atendimento, atendimento_motivo: motivo, ...quantidades }
        const agora = new Date().toISOString()
        const valores = {
          atendimento,
          atendimento_motivo: motivo,
          ...quantidades,
          atendimento_por: atendimento ? autorNome : '',
          atendimento_em: atendimento ? agora : '',
        }

        if (existente) {
          for (const [col, v] of Object.entries(valores)) existente.set(col, v)
          await existente.save()
        } else if (atendimento) {
          await sheet.addRow({
            id: crypto.randomUUID(),
            resposta_id: resposta.get('id'),
            escola_id: resposta.get('escola_id'),
            escola_nome: resposta.get('escola_nome') ?? '',
            lote: String(lote),
            ...valores,
          })
        }

        const historicoSheet = await getOrCreateSheet(doc, HISTORICO_SHEET, HISTORICO_COLUMNS)
        await historicoSheet.addRow({
          id: crypto.randomUUID(),
          resposta_id: resposta.get('id'),
          escola_id: resposta.get('escola_id'),
          escola_nome: resposta.get('escola_nome') ?? '',
          acao: 'atendimento',
          dados_antes: JSON.stringify(dadosAntes),
          dados_depois: JSON.stringify(dadosDepois),
          autor_id: user.id,
          autor_nome: autorNome,
          data_hora: agora,
        })

        return ok(corsHeaders, { success: true })
      }

      // Registra quando o atendimento (escola × lote) foi enviado à SECOMSE para
      // contratar o transporte. enviado_em vazio = desfaz (ainda não enviado).
      case 'definir_envio_secomse': {
        exigirRegionalAdmin(p)
        if (!body.atendimento_id) throw new Error('Atendimento não informado.')
        const enviadoEm = String(body.enviado_em ?? '')
        if (enviadoEm && isNaN(new Date(enviadoEm).getTime())) throw new Error('Data/hora de envio inválida.')

        const { rows } = await getAtendimentos(doc)
        const row = rows.find((r: any) => r.get('id') === String(body.atendimento_id))
        if (!row || row.get('atendimento') !== 'ATENDIDA') throw new Error('Atendimento não encontrado.')

        const lote = String(loteDe(row.get('lote')))
        const dadosAntes = { lote, secomse_enviado_em: row.get('secomse_enviado_em') ?? '' }
        const dadosDepois = { lote, secomse_enviado_em: enviadoEm }
        row.set('secomse_enviado_em', enviadoEm)
        row.set('secomse_registrado_por', enviadoEm ? autorNome : '')
        await row.save()

        const historicoSheet = await getOrCreateSheet(doc, HISTORICO_SHEET, HISTORICO_COLUMNS)
        await historicoSheet.addRow({
          id: crypto.randomUUID(),
          resposta_id: row.get('resposta_id'),
          escola_id: row.get('escola_id'),
          escola_nome: row.get('escola_nome') ?? '',
          acao: 'secomse',
          dados_antes: JSON.stringify(dadosAntes),
          dados_depois: JSON.stringify(dadosDepois),
          autor_id: user.id,
          autor_nome: autorNome,
          data_hora: new Date().toISOString(),
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
