import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import { GoogleSpreadsheet } from "npm:google-spreadsheet@4.1.1"
// @ts-ignore
import { JWT } from "npm:google-auth-library@9.6.3"
import { getCorsHeaders } from '../_shared/cors.ts'

// Reaproveita a mesma planilha já usada por "Visitas às Unidades Escolares"
// (aba "Itens" é o inventário oficial, somente leitura; as abas abaixo são novas)
const SHEET_ID = Deno.env.get('PATRIMONIO_ITENS_SHEET_ID') ?? Deno.env.get('VISITAS_SHEET_ID') ?? ''

const ITENS_SHEET = 'Itens'
const SALAS_SHEET = 'Salas'
const ALOCACOES_SHEET = 'Alocacoes'
const HISTORICO_SHEET = 'Historico'
const COMODATO_SHEET = 'Comodato'
const INSERVIVEIS_SHEET = 'Inserviveis'

// "fotos": JSON array (máx. 4) de URLs públicas do bucket "salas-fotos" — ajudam
// a identificar a sala e saem no PDF da lista de itens.
const SALAS_COLUMNS = ['id', 'nome', 'descricao', 'ativa', 'criado_por', 'criado_em', 'fotos']
// Itens de empresas terceirizadas sob nossa guarda — não constam no inventário
// oficial (aba "Itens"). "codigo" é a identificação autoincremental (COM-0001...).
const COMODATO_COLUMNS = ['id', 'seq', 'codigo', 'descricao', 'empresa', 'patrimonio_empresa', 'observacao', 'ativo', 'criado_por_id', 'criado_por_nome', 'criado_em']
const ALOCACOES_COLUMNS = ['chapa', 'descricao_item', 'sala_id', 'sala_nome', 'alocado_por_id', 'alocado_por_nome', 'alocado_em', 'conferido_em', 'conferido_por_id', 'conferido_por_nome']
const INSERVIVEIS_COLUMNS = ['chapa', 'descricao_item', 'foto_url', 'observacao', 'registrado_por_id', 'registrado_por_nome', 'registrado_em']
const HISTORICO_COLUMNS = ['id', 'chapa', 'descricao_item', 'tipo_evento', 'sala_id', 'sala_nome', 'usuario_id', 'usuario_nome', 'data_evento', 'observacao']

type Profile = { role: string; salas_trabalho: string[] | null; full_name: string | null }

// Cache em memória do módulo, reaproveitado entre invocações enquanto a instância
// da Edge Function permanecer "quente". Sem isso, toda ação (listar, alocar, devolver...)
// disparava doc.loadInfo() + loadHeaderRow() de 3 abas — só isso já são 4 chamadas de
// leitura à Sheets API por clique, o que estoura a cota "Read requests per minute per user"
// (erro 429) quando o usuário navega/clica rápido.
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
  // Doc novo/recarregado invalida os caches de linhas abaixo.
  itensRowsCache = null
  salasRowsCache = null
  comodatoRowsCache = null
  inserviveisRowsCache = null
  return doc
}

// Cache leve das linhas de "Itens" (inventário oficial, só leitura — praticamente nunca
// muda) e "Salas" (muda raramente). Evita repetir getRows() a cada item alocado numa
// sequência de cliques, que é o que mais rápido consome a cota de leitura por minuto.
// "Alocacoes" e "Historico" NÃO são cacheados: precisam estar sempre atualizados para
// não permitir alocar o mesmo item duas vezes.
let itensRowsCache: { rows: any[]; loadedAt: number } | null = null
let salasRowsCache: { rows: any[]; loadedAt: number } | null = null
let comodatoRowsCache: { rows: any[]; loadedAt: number } | null = null
let inserviveisRowsCache: { rows: any[]; loadedAt: number } | null = null
const ROWS_CACHE_TTL_MS = 20_000
// O inventário é a leitura mais pesada e quase não muda: com 20s, cliques espaçados
// relíam a planilha inteira a cada alocação.
const ITENS_CACHE_TTL_MS = 5 * 60 * 1000

async function getItensRows(itensSheet: any) {
  const now = Date.now()
  if (itensRowsCache && (now - itensRowsCache.loadedAt) < ITENS_CACHE_TTL_MS) return itensRowsCache.rows
  const rows = await itensSheet.getRows()
  itensRowsCache = { rows, loadedAt: now }
  return rows
}

async function getSalasRows(salasSheet: any) {
  const now = Date.now()
  if (salasRowsCache && (now - salasRowsCache.loadedAt) < ROWS_CACHE_TTL_MS) return salasRowsCache.rows
  const rows = await salasSheet.getRows()
  salasRowsCache = { rows, loadedAt: now }
  return rows
}

async function getComodatoRows(comodatoSheet: any) {
  const now = Date.now()
  if (comodatoRowsCache && (now - comodatoRowsCache.loadedAt) < ROWS_CACHE_TTL_MS) return comodatoRowsCache.rows
  const rows = await comodatoSheet.getRows()
  comodatoRowsCache = { rows, loadedAt: now }
  return rows
}

async function getInserviveisRows(inserviveisSheet: any) {
  const now = Date.now()
  if (inserviveisRowsCache && (now - inserviveisRowsCache.loadedAt) < ROWS_CACHE_TTL_MS) return inserviveisRowsCache.rows
  const rows = await inserviveisSheet.getRows()
  inserviveisRowsCache = { rows, loadedAt: now }
  return rows
}

// Deno.serve é nativo do runtime de Edge Functions — evita depender do fetch externo
// a deno.land/std, que pode falhar/timeoutar durante o bundle do deploy.
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') throw new Error('Método não suportado.')
    if (!SHEET_ID) throw new Error('Planilha de patrimônio não configurada nos secrets (PATRIMONIO_ITENS_SHEET_ID / VISITAS_SHEET_ID).')

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

    const { data: profile } = await supabase.from('profiles').select('role, salas_trabalho, full_name').eq('id', user.id).single()
    if (!profile) throw new Error('Perfil de usuário não encontrado.')
    const usuarioNome = (profile as Profile).full_name || user.email || 'Usuário'

    if (!['regional_admin', 'ure_servico', 'chefe_departamento'].includes((profile as Profile).role)) {
      throw new Error('Seu perfil não tem acesso a este módulo.')
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action as string
    if (!action) throw new Error('Ação não informada.')

    // ── Conecta na planilha (doc cacheado entre invocações — ver getDoc) ──
    const doc = await getDoc()

    const [salasSheet, alocacoesSheet, historicoSheet, comodatoSheet, inserviveisSheet] = await Promise.all([
      getOrCreateSheet(doc, SALAS_SHEET, SALAS_COLUMNS),
      getOrCreateSheet(doc, ALOCACOES_SHEET, ALOCACOES_COLUMNS),
      getOrCreateSheet(doc, HISTORICO_SHEET, HISTORICO_COLUMNS),
      getOrCreateSheet(doc, COMODATO_SHEET, COMODATO_COLUMNS),
      getOrCreateSheet(doc, INSERVIVEIS_SHEET, INSERVIVEIS_COLUMNS),
    ])

    switch (action) {
      // Abertura da página: itens + salas numa única invocação, para pagar uma vez só
      // a autenticação e a conexão com a planilha.
      case 'carregar_inicial': {
        const [itens, salasRows] = await Promise.all([
          montarItens(doc, alocacoesSheet, comodatoSheet, inserviveisSheet),
          getSalasRows(salasSheet),
        ])
        return ok(corsHeaders, { itens, salas: montarSalas(salasRows) })
      }

      case 'listar_itens': {
        return ok(corsHeaders, { itens: await montarItens(doc, alocacoesSheet, comodatoSheet, inserviveisSheet) })
      }

      case 'listar_salas': {
        return ok(corsHeaders, { salas: montarSalas(await getSalasRows(salasSheet)) })
      }

      case 'atualizar_fotos_sala': {
        const id = String(body.id || '')
        if (!id) throw new Error('Sala não informada.')
        const role = (profile as Profile).role
        if (role !== 'regional_admin') {
          if (role !== 'ure_servico' || !((profile as Profile).salas_trabalho || []).includes(id)) {
            throw new Error('Você só pode editar as fotos de uma das suas salas.')
          }
        }
        const fotos = Array.isArray(body.fotos)
          ? body.fotos.map((f: unknown) => String(f)).filter(Boolean).slice(0, 4)
          : []

        const rows = await getSalasRows(salasSheet)
        const row = rows.find((r: any) => r.get('id') === id)
        if (!row) throw new Error('Sala não encontrada.')
        row.set('fotos', JSON.stringify(fotos))
        await row.save()
        salasRowsCache = null
        return ok(corsHeaders, { success: true, fotos })
      }

      case 'criar_sala': {
        exigirRegionalAdmin(profile as Profile)
        const nome = String(body.nome || '').trim()
        if (!nome) throw new Error('Informe o nome da sala.')

        const rows = await getSalasRows(salasSheet)
        const duplicada = rows.some((r: any) => r.get('ativa') === 'TRUE' && String(r.get('nome') || '').trim().toLowerCase() === nome.toLowerCase())
        if (duplicada) throw new Error('Já existe uma sala ativa com esse nome.')

        const id = crypto.randomUUID()
        await salasSheet.addRow({
          id,
          nome,
          descricao: String(body.descricao || ''),
          ativa: 'TRUE',
          criado_por: usuarioNome,
          criado_em: new Date().toISOString(),
        })
        salasRowsCache = null
        return ok(corsHeaders, { success: true, sala: { id, nome } })
      }

      case 'editar_sala': {
        exigirRegionalAdmin(profile as Profile)
        const { id, nome, descricao, ativa } = body
        if (!id) throw new Error('Sala não informada.')

        const rows = await getSalasRows(salasSheet)
        const row = rows.find((r: any) => r.get('id') === id)
        if (!row) throw new Error('Sala não encontrada.')

        if (nome !== undefined) row.set('nome', String(nome).trim())
        if (descricao !== undefined) row.set('descricao', String(descricao))
        if (ativa !== undefined) row.set('ativa', ativa ? 'TRUE' : 'FALSE')
        await row.save()
        salasRowsCache = null
        return ok(corsHeaders, { success: true })
      }

      case 'remover_sala': {
        exigirRegionalAdmin(profile as Profile)
        const { id } = body
        if (!id) throw new Error('Sala não informada.')

        const alocRows = await alocacoesSheet.getRows()
        const emUso = alocRows.filter((r: any) => r.get('sala_id') === id).length
        if (emUso > 0) throw new Error(`Não é possível remover: há ${emUso} item(ns) alocado(s) nesta sala. Devolva-os antes.`)

        const rows = await getSalasRows(salasSheet)
        const row = rows.find((r: any) => r.get('id') === id)
        if (!row) throw new Error('Sala não encontrada.')

        row.set('ativa', 'FALSE')
        await row.save()
        salasRowsCache = null
        return ok(corsHeaders, { success: true })
      }

      case 'listar_comodato': {
        const [rows, alocRows] = await Promise.all([getComodatoRows(comodatoSheet), alocacoesSheet.getRows()])
        const alocMap = new Map(alocRows.map((r: any) => [String(r.get('chapa') ?? '').trim(), r]))
        const itens = rows
          .filter((r: any) => String(r.get('codigo') ?? '').trim() !== '' && r.get('ativo') !== 'FALSE')
          .map((r: any) => {
            const codigo = String(r.get('codigo')).trim()
            const aloc = alocMap.get(codigo)
            return {
              id: r.get('id'),
              codigo,
              descricao: r.get('descricao') || '',
              empresa: r.get('empresa') || '',
              patrimonioEmpresa: r.get('patrimonio_empresa') || '',
              observacao: r.get('observacao') || '',
              criadoPorNome: r.get('criado_por_nome') || '',
              criadoEm: r.get('criado_em') || '',
              alocado: !!aloc,
              salaId: aloc?.get('sala_id') || null,
              salaNome: aloc?.get('sala_nome') || null,
            }
          })
          .sort((a: any, b: any) => (a.codigo < b.codigo ? 1 : -1))
        return ok(corsHeaders, { itens })
      }

      case 'criar_comodato': {
        exigirRegionalAdmin(profile as Profile)
        const descricao = String(body.descricao || '').trim()
        const empresa = String(body.empresa || '').trim()
        if (!descricao) throw new Error('Informe a descrição do item.')
        if (!empresa) throw new Error('Informe a empresa proprietária do item.')

        const rows = await getComodatoRows(comodatoSheet)
        const maxSeq = rows.reduce((m: number, r: any) => Math.max(m, Number(r.get('seq')) || 0), 0)
        const seq = maxSeq + 1
        const codigo = `COM-${String(seq).padStart(4, '0')}`
        const id = crypto.randomUUID()
        const agora = new Date().toISOString()

        await comodatoSheet.addRow({
          id,
          seq,
          codigo,
          descricao,
          empresa,
          patrimonio_empresa: String(body.patrimonio_empresa || ''),
          observacao: String(body.observacao || ''),
          ativo: 'TRUE',
          criado_por_id: user.id,
          criado_por_nome: usuarioNome,
          criado_em: agora,
        })
        comodatoRowsCache = null
        return ok(corsHeaders, { success: true, item: { id, codigo, descricao, empresa } })
      }

      case 'editar_comodato': {
        exigirRegionalAdmin(profile as Profile)
        const id = String(body.id || '')
        if (!id) throw new Error('Item não informado.')
        const rows = await getComodatoRows(comodatoSheet)
        const row = rows.find((r: any) => r.get('id') === id)
        if (!row) throw new Error('Item de comodato não encontrado.')

        if (body.descricao !== undefined) {
          const d = String(body.descricao).trim()
          if (!d) throw new Error('A descrição não pode ficar em branco.')
          row.set('descricao', d)
        }
        if (body.empresa !== undefined) {
          const e = String(body.empresa).trim()
          if (!e) throw new Error('A empresa não pode ficar em branco.')
          row.set('empresa', e)
        }
        if (body.patrimonio_empresa !== undefined) row.set('patrimonio_empresa', String(body.patrimonio_empresa))
        if (body.observacao !== undefined) row.set('observacao', String(body.observacao))
        await row.save()
        comodatoRowsCache = null
        return ok(corsHeaders, { success: true })
      }

      case 'remover_comodato': {
        exigirRegionalAdmin(profile as Profile)
        const id = String(body.id || '')
        if (!id) throw new Error('Item não informado.')
        const rows = await getComodatoRows(comodatoSheet)
        const row = rows.find((r: any) => r.get('id') === id)
        if (!row) throw new Error('Item de comodato não encontrado.')

        const codigo = String(row.get('codigo') ?? '').trim()
        const alocRows = await alocacoesSheet.getRows()
        if (alocRows.some((r: any) => String(r.get('chapa') ?? '').trim() === codigo)) {
          throw new Error('Este item está alocado em uma sala. Devolva-o antes de remover.')
        }
        row.set('ativo', 'FALSE')
        await row.save()
        comodatoRowsCache = null
        return ok(corsHeaders, { success: true })
      }

      case 'alocar_item': {
        const chapa = String(body.chapa || '').trim()
        if (!chapa) throw new Error('Item não informado.')

        let salaId: string
        if ((profile as Profile).role === 'ure_servico') {
          const minhasSalas = (profile as Profile).salas_trabalho || []
          if (minhasSalas.length === 0) {
            throw new Error('Você ainda não possui nenhuma sala de trabalho vinculada. Solicite ao administrador regional.')
          }
          if (!body.sala_id) throw new Error('Selecione a sala de destino.')
          if (!minhasSalas.includes(String(body.sala_id))) {
            throw new Error('Você só pode alocar itens em uma das suas salas vinculadas.')
          }
          salaId = String(body.sala_id)
        } else {
          if (!body.sala_id) throw new Error('Selecione a sala de destino.')
          salaId = String(body.sala_id)
        }

        const [salasRows, itemRows, alocRows, inservRows] = await Promise.all([
          getSalasRows(salasSheet),
          getItensRows(getItensSheet(doc)),
          alocacoesSheet.getRows(),
          getInserviveisRows(inserviveisSheet),
        ])
        const salaRow = salasRows.find((r: any) => r.get('id') === salaId && r.get('ativa') === 'TRUE')
        if (!salaRow) throw new Error('Sala inválida ou inativa.')

        const jaAlocado = alocRows.find((r: any) => String(r.get('chapa') ?? '').trim() === chapa)
        if (jaAlocado) throw new Error(`Item já alocado na sala "${jaAlocado.get('sala_nome')}".`)
        if (inservRows.some((r: any) => String(r.get('chapa') ?? '').trim() === chapa)) {
          throw new Error('Este item está na lista de inservíveis da URE.')
        }

        const itemRow = itemRows.find((r: any) => String(r.get('Chapa') ?? '').trim() === chapa)

        let descricaoItem: string
        if (itemRow) {
          descricaoItem = itemRow.get('Descrição do Item') || '-'
        } else {
          // Não está no inventário oficial — pode ser um item em comodato (COM-0001...).
          const comodatoRows = await getComodatoRows(comodatoSheet)
          const comodatoRow = comodatoRows.find(
            (r: any) => String(r.get('codigo') ?? '').trim() === chapa && r.get('ativo') !== 'FALSE',
          )
          if (!comodatoRow) throw new Error('Item não encontrado no inventário.')
          descricaoItem = comodatoRow.get('descricao') || '-'
        }

        const agora = new Date().toISOString()

        await alocacoesSheet.addRow({
          chapa,
          descricao_item: descricaoItem,
          sala_id: salaId,
          sala_nome: salaRow.get('nome'),
          alocado_por_id: user.id,
          alocado_por_nome: usuarioNome,
          alocado_em: agora,
        })
        await registrarHistorico(historicoSheet, {
          id: crypto.randomUUID(),
          chapa,
          descricao_item: descricaoItem,
          tipo_evento: 'ALOCACAO',
          sala_id: salaId,
          sala_nome: salaRow.get('nome'),
          usuario_id: user.id,
          usuario_nome: usuarioNome,
          data_evento: agora,
          observacao: '',
        })

        // Devolve o item já atualizado para o frontend aplicar no estado local
        // em vez de precisar chamar "listar_itens" de novo (economiza leituras na cota).
        return ok(corsHeaders, {
          success: true,
          item: {
            chapa,
            descricao: descricaoItem,
            alocado: true,
            salaId,
            salaNome: salaRow.get('nome'),
            alocadoPorNome: usuarioNome,
            alocadoEm: agora,
          },
        })
      }

      case 'devolver_item': {
        const chapa = String(body.chapa || '').trim()
        if (!chapa) throw new Error('Item não informado.')

        const alocRows = await alocacoesSheet.getRows()
        const row = alocRows.find((r: any) => String(r.get('chapa') ?? '').trim() === chapa)
        if (!row) throw new Error('Item não está alocado em nenhuma sala.')

        if ((profile as Profile).role === 'ure_servico' && !((profile as Profile).salas_trabalho || []).includes(row.get('sala_id'))) {
          throw new Error('Você só pode devolver itens de uma das suas salas.')
        }

        const salaIdAnterior = row.get('sala_id')
        const salaNomeAnterior = row.get('sala_nome')
        const descricaoItem = row.get('descricao_item')

        await row.delete()
        await registrarHistorico(historicoSheet, {
          id: crypto.randomUUID(),
          chapa,
          descricao_item: descricaoItem,
          tipo_evento: 'DEVOLUCAO',
          sala_id: salaIdAnterior,
          sala_nome: salaNomeAnterior,
          usuario_id: user.id,
          usuario_nome: usuarioNome,
          data_evento: new Date().toISOString(),
          observacao: String(body.observacao || ''),
        })

        return ok(corsHeaders, { success: true })
      }

      // Conferência física: alguém confirmou que o item está mesmo na sala. Fica na linha
      // da alocação, então devolver o item apaga a conferência junto.
      case 'conferir_item': {
        const chapa = String(body.chapa || '').trim()
        if (!chapa) throw new Error('Item não informado.')
        const conferido = body.conferido !== false

        const alocRows = await alocacoesSheet.getRows()
        const row = alocRows.find((r: any) => String(r.get('chapa') ?? '').trim() === chapa)
        if (!row) throw new Error('Item não está alocado em nenhuma sala.')

        const role = (profile as Profile).role
        if (role !== 'regional_admin') {
          if (role !== 'ure_servico' || !((profile as Profile).salas_trabalho || []).includes(row.get('sala_id'))) {
            throw new Error('Você só pode conferir itens de uma das suas salas.')
          }
        }

        const conferidoEm = conferido ? new Date().toISOString() : ''
        row.set('conferido_em', conferidoEm)
        row.set('conferido_por_id', conferido ? user.id : '')
        row.set('conferido_por_nome', conferido ? usuarioNome : '')
        await row.save()

        return ok(corsHeaders, {
          success: true,
          item: { chapa, conferidoEm: conferidoEm || null, conferidoPorNome: conferido ? usuarioNome : null },
        })
      }

      case 'marcar_inservivel': {
        exigirEdicaoInserviveis(profile as Profile)
        const chapa = String(body.chapa || '').trim()
        if (!chapa) throw new Error('Item não informado.')
        const fotoUrl = String(body.foto_url || '').trim()
        if (!fotoUrl) throw new Error('A foto do item é obrigatória.')
        const observacao = String(body.observacao || '').trim()

        const [itemRows, alocRows, inservRows] = await Promise.all([
          getItensRows(getItensSheet(doc)),
          alocacoesSheet.getRows(),
          inserviveisSheet.getRows(),
        ])
        const itemRow = itemRows.find((r: any) => String(r.get('Chapa') ?? '').trim() === chapa)
        if (!itemRow) throw new Error('Item não encontrado no inventário oficial.')

        const alocado = alocRows.find((r: any) => String(r.get('chapa') ?? '').trim() === chapa)
        if (alocado) throw new Error(`Item alocado na sala "${alocado.get('sala_nome')}". Devolva-o antes de marcar como inservível.`)
        if (inservRows.some((r: any) => String(r.get('chapa') ?? '').trim() === chapa)) {
          throw new Error('Este item já está na lista de inservíveis.')
        }

        const agora = new Date().toISOString()
        await inserviveisSheet.addRow({
          chapa,
          descricao_item: itemRow.get('Descrição do Item') || '-',
          foto_url: fotoUrl,
          observacao,
          registrado_por_id: user.id,
          registrado_por_nome: usuarioNome,
          registrado_em: agora,
        })
        inserviveisRowsCache = null

        return ok(corsHeaders, {
          success: true,
          item: {
            chapa,
            inservivel: true,
            inservivelFotoUrl: fotoUrl,
            inservivelObservacao: observacao || null,
            inservivelPorNome: usuarioNome,
            inservivelEm: agora,
          },
        })
      }

      case 'desmarcar_inservivel': {
        exigirEdicaoInserviveis(profile as Profile)
        const chapa = String(body.chapa || '').trim()
        if (!chapa) throw new Error('Item não informado.')

        const rows = await inserviveisSheet.getRows()
        const row = rows.find((r: any) => String(r.get('chapa') ?? '').trim() === chapa)
        if (!row) throw new Error('Item não está na lista de inservíveis.')

        await row.delete()
        inserviveisRowsCache = null
        return ok(corsHeaders, { success: true })
      }

      case 'listar_historico': {
        const rows = await historicoSheet.getRows()
        let historico = rows.map((r: any) => ({
          id: r.get('id'),
          chapa: r.get('chapa'),
          descricaoItem: r.get('descricao_item'),
          tipoEvento: r.get('tipo_evento'),
          salaId: r.get('sala_id'),
          salaNome: r.get('sala_nome'),
          usuarioNome: r.get('usuario_nome'),
          dataEvento: r.get('data_evento'),
          observacao: r.get('observacao') || '',
        }))

        if ((profile as Profile).role === 'ure_servico') {
          const minhasSalas = new Set((profile as Profile).salas_trabalho || [])
          historico = historico.filter((h) => minhasSalas.has(h.salaId))
          if (body.sala_id && minhasSalas.has(String(body.sala_id))) {
            historico = historico.filter((h) => h.salaId === body.sala_id)
          }
        } else if (body.sala_id) {
          historico = historico.filter((h) => h.salaId === body.sala_id)
        }

        historico.sort((a, b) => (a.dataEvento < b.dataEvento ? 1 : -1))

        const offset = Number(body.offset) || 0
        const limit = Number(body.limit) || 200
        return ok(corsHeaders, { historico: historico.slice(offset, offset + limit) })
      }

      default:
        throw new Error(`Ação "${action}" desconhecida.`)
    }
  } catch (error) {
    let message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[patrimonio-salas]', message)

    if (message.includes('[429]') || message.toLowerCase().includes('quota exceeded')) {
      // Cota da Sheets API pode ter sido excedida com base num doc/estado antigo;
      // força reconexão limpa na próxima chamada em vez de manter o cache preso.
      cachedDoc = null
      message = 'Muitas ações em pouco tempo. Aguarde alguns segundos e tente novamente.'
    }

    return new Response(JSON.stringify({ error: message }), {
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

function getItensSheet(doc: any) {
  const itensSheet = doc.sheetsByTitle[ITENS_SHEET]
  if (!itensSheet) {
    const abasDisponiveis = Object.keys(doc.sheetsByTitle).join(', ') || '(nenhuma)'
    throw new Error(`Aba "${ITENS_SHEET}" não encontrada na planilha (ID ${SHEET_ID}). Abas encontradas: ${abasDisponiveis}.`)
  }
  return itensSheet
}

async function montarItens(doc: any, alocacoesSheet: any, comodatoSheet: any, inserviveisSheet: any) {
  const [itemRows, alocRows, comodatoRows, inservRows] = await Promise.all([
    getItensRows(getItensSheet(doc)),
    alocacoesSheet.getRows(),
    getComodatoRows(comodatoSheet),
    inserviveisSheet.getRows(),
  ])
  const inservMap = new Map<string, any>(inservRows.map((r: any) => [String(r.get('chapa') ?? '').trim(), r]))
  const alocMap = new Map(alocRows.map((r: any) => [String(r.get('chapa') ?? '').trim(), r]))

  const itens = itemRows
    .filter((r: any) => String(r.get('Chapa') ?? '').trim() !== '')
    .map((r: any) => {
      const chapa = String(r.get('Chapa')).trim()
      const aloc = alocMap.get(chapa)
      const inserv = inservMap.get(chapa)
      return {
        chapa,
        descricao: r.get('Descrição do Item') || '-',
        grupo: r.get('Grupo do Material') || '',
        estadoConservacao: r.get('Estado de Conservacao') || '',
        alocado: !!aloc,
        salaId: aloc?.get('sala_id') || null,
        salaNome: aloc?.get('sala_nome') || null,
        alocadoPorNome: aloc?.get('alocado_por_nome') || null,
        alocadoEm: aloc?.get('alocado_em') || null,
        conferidoEm: aloc?.get('conferido_em') || null,
        conferidoPorNome: aloc?.get('conferido_por_nome') || null,
        inservivel: !!inserv,
        inservivelFotoUrl: inserv?.get('foto_url') || null,
        inservivelObservacao: inserv?.get('observacao') || null,
        inservivelPorNome: inserv?.get('registrado_por_nome') || null,
        inservivelEm: inserv?.get('registrado_em') || null,
      }
    })

  // Itens em comodato (empresas terceirizadas sob nossa guarda) — não estão no
  // inventário oficial, mas alocam em sala como qualquer outro item. A "chapa"
  // usada como chave em todo o fluxo é o código gerado no cadastro (COM-0001).
  for (const r of comodatoRows as any[]) {
    const codigo = String(r.get('codigo') ?? '').trim()
    if (!codigo || r.get('ativo') === 'FALSE') continue
    const aloc = alocMap.get(codigo)
    const empresa = r.get('empresa') || ''
    itens.push({
      chapa: codigo,
      descricao: r.get('descricao') || '-',
      grupo: empresa ? `Comodato — ${empresa}` : 'Comodato',
      estadoConservacao: '',
      alocado: !!aloc,
      salaId: aloc?.get('sala_id') || null,
      salaNome: aloc?.get('sala_nome') || null,
      alocadoPorNome: aloc?.get('alocado_por_nome') || null,
      alocadoEm: aloc?.get('alocado_em') || null,
      conferidoEm: aloc?.get('conferido_em') || null,
      conferidoPorNome: aloc?.get('conferido_por_nome') || null,
      comodato: true,
      empresa,
      patrimonioEmpresa: r.get('patrimonio_empresa') || '',
    } as any)
  }

  const chapasConhecidas = new Set(itens.map((i) => i.chapa))
  for (const r of alocRows as any[]) {
    const chapa = String(r.get('chapa') ?? '').trim()
    if (chapa && !chapasConhecidas.has(chapa)) {
      itens.push({
        chapa,
        descricao: r.get('descricao_item') || '(item não encontrado no inventário atual)',
        grupo: '',
        estadoConservacao: '',
        alocado: true,
        salaId: r.get('sala_id') || null,
        salaNome: r.get('sala_nome') || null,
        alocadoPorNome: r.get('alocado_por_nome') || null,
        alocadoEm: r.get('alocado_em') || null,
        conferidoEm: r.get('conferido_em') || null,
        conferidoPorNome: r.get('conferido_por_nome') || null,
        naoEncontrado: true,
      } as any)
    }
  }

  return itens
}

function montarSalas(rows: any[]) {
  return rows.map((r: any) => ({
    id: r.get('id'),
    nome: r.get('nome'),
    descricao: r.get('descricao') || '',
    ativa: r.get('ativa') === 'TRUE',
    fotos: parseFotos(r.get('fotos')),
  }))
}

// A alocação/devolução já foi gravada quando isto roda: uma falha aqui não pode virar
// erro para o usuário (ele tentaria de novo uma ação que já aconteceu).
async function registrarHistorico(historicoSheet: any, evento: Record<string, unknown>) {
  for (const espera of [2000, 5000, 0]) {
    try {
      await historicoSheet.addRow(evento)
      return
    } catch (e) {
      if (!espera) {
        console.error('[patrimonio-salas] histórico não registrado', evento, e)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, espera))
    }
  }
}

function parseFotos(raw: unknown): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(String(raw))
    return Array.isArray(arr) ? arr.map((f) => String(f)).filter(Boolean).slice(0, 4) : []
  } catch {
    return []
  }
}

function exigirEdicaoInserviveis(profile: Profile) {
  if (!['regional_admin', 'ure_servico'].includes(profile.role)) {
    throw new Error('Seu perfil não pode alterar a lista de inservíveis.')
  }
}

function exigirRegionalAdmin(profile: Profile) {
  if (profile.role !== 'regional_admin') {
    throw new Error('Apenas administradores regionais podem executar esta ação.')
  }
}

async function getOrCreateSheet(doc: any, title: string, columns: string[]) {
  let sheet = doc.sheetsByTitle[title]
  if (!sheet) {
    sheet = await doc.addSheet({ title, headerValues: columns })
    return sheet
  }

  // Se o cabeçalho já foi carregado numa invocação anterior desta mesma instância
  // (doc cacheado — ver getDoc), o objeto sheet já mantém headerValues em memória:
  // evita repetir a chamada de leitura à Sheets API a cada ação.
  try {
    if (sheet.headerValues && sheet.headerValues.length > 0) return sheet
  } catch { /* ainda não carregado */ }

  const headers = await sheet.loadHeaderRow().then(() => sheet.headerValues).catch(() => [])
  if (!headers || headers.length === 0) {
    await sheet.setHeaderRow(columns)
  } else {
    // Aba já existe mas pode ter sido criada antes de alguma coluna nova (ex.: "fotos").
    // Acrescenta as que faltam ao final, preservando as existentes e os dados.
    const missing = columns.filter((c) => !headers.includes(c))
    if (missing.length > 0) await sheet.setHeaderRow([...headers, ...missing])
  }
  return sheet
}

function ok(headers: Record<string, string>, data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...headers, 'Content-Type': 'application/json' },
    status: 200,
  })
}
