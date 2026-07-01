import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
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

const SALAS_COLUMNS = ['id', 'nome', 'descricao', 'ativa', 'criado_por', 'criado_em']
const ALOCACOES_COLUMNS = ['chapa', 'descricao_item', 'sala_id', 'sala_nome', 'alocado_por_id', 'alocado_por_nome', 'alocado_em']
const HISTORICO_COLUMNS = ['id', 'chapa', 'descricao_item', 'tipo_evento', 'sala_id', 'sala_nome', 'usuario_id', 'usuario_nome', 'data_evento', 'observacao']

type Profile = { role: string; sala_trabalho: string | null; full_name: string | null }

serve(async (req) => {
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

    const { data: profile } = await supabase.from('profiles').select('role, sala_trabalho, full_name').eq('id', user.id).single()
    if (!profile) throw new Error('Perfil de usuário não encontrado.')
    const usuarioNome = (profile as Profile).full_name || user.email || 'Usuário'

    if (!['regional_admin', 'ure_servico'].includes((profile as Profile).role)) {
      throw new Error('Seu perfil não tem acesso a este módulo.')
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action as string
    if (!action) throw new Error('Ação não informada.')

    // ── Conecta na planilha ──────────────────────────────────────────────
    const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    const key = Deno.env.get('GOOGLE_PRIVATE_KEY')
    if (!email || !key) throw new Error('Credenciais Google não configuradas nos secrets.')

    const auth = new JWT({
      email,
      key: key.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    const doc = new GoogleSpreadsheet(SHEET_ID, auth)
    await doc.loadInfo()

    const salasSheet = await getOrCreateSheet(doc, SALAS_SHEET, SALAS_COLUMNS)
    const alocacoesSheet = await getOrCreateSheet(doc, ALOCACOES_SHEET, ALOCACOES_COLUMNS)
    const historicoSheet = await getOrCreateSheet(doc, HISTORICO_SHEET, HISTORICO_COLUMNS)

    switch (action) {
      case 'listar_itens': {
        const itensSheet = doc.sheetsByTitle[ITENS_SHEET]
        if (!itensSheet) {
          const abasDisponiveis = Object.keys(doc.sheetsByTitle).join(', ') || '(nenhuma)'
          throw new Error(`Aba "${ITENS_SHEET}" não encontrada na planilha (ID ${SHEET_ID}). Abas encontradas: ${abasDisponiveis}.`)
        }

        const [itemRows, alocRows] = await Promise.all([itensSheet.getRows(), alocacoesSheet.getRows()])
        const alocMap = new Map(alocRows.map((r: any) => [String(r.get('chapa') ?? '').trim(), r]))

        const itens = itemRows
          .filter((r: any) => String(r.get('Chapa') ?? '').trim() !== '')
          .map((r: any) => {
            const chapa = String(r.get('Chapa')).trim()
            const aloc = alocMap.get(chapa)
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
            }
          })

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
              naoEncontrado: true,
            } as any)
          }
        }

        return ok(corsHeaders, { itens })
      }

      case 'listar_salas': {
        const rows = await salasSheet.getRows()
        const salas = rows.map((r: any) => ({
          id: r.get('id'),
          nome: r.get('nome'),
          descricao: r.get('descricao') || '',
          ativa: r.get('ativa') === 'TRUE',
        }))
        return ok(corsHeaders, { salas })
      }

      case 'criar_sala': {
        exigirRegionalAdmin(profile as Profile)
        const nome = String(body.nome || '').trim()
        if (!nome) throw new Error('Informe o nome da sala.')

        const rows = await salasSheet.getRows()
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
        return ok(corsHeaders, { success: true, sala: { id, nome } })
      }

      case 'editar_sala': {
        exigirRegionalAdmin(profile as Profile)
        const { id, nome, descricao, ativa } = body
        if (!id) throw new Error('Sala não informada.')

        const rows = await salasSheet.getRows()
        const row = rows.find((r: any) => r.get('id') === id)
        if (!row) throw new Error('Sala não encontrada.')

        if (nome !== undefined) row.set('nome', String(nome).trim())
        if (descricao !== undefined) row.set('descricao', String(descricao))
        if (ativa !== undefined) row.set('ativa', ativa ? 'TRUE' : 'FALSE')
        await row.save()
        return ok(corsHeaders, { success: true })
      }

      case 'remover_sala': {
        exigirRegionalAdmin(profile as Profile)
        const { id } = body
        if (!id) throw new Error('Sala não informada.')

        const alocRows = await alocacoesSheet.getRows()
        const emUso = alocRows.filter((r: any) => r.get('sala_id') === id).length
        if (emUso > 0) throw new Error(`Não é possível remover: há ${emUso} item(ns) alocado(s) nesta sala. Devolva-os antes.`)

        const rows = await salasSheet.getRows()
        const row = rows.find((r: any) => r.get('id') === id)
        if (!row) throw new Error('Sala não encontrada.')

        row.set('ativa', 'FALSE')
        await row.save()
        return ok(corsHeaders, { success: true })
      }

      case 'alocar_item': {
        const chapa = String(body.chapa || '').trim()
        if (!chapa) throw new Error('Item não informado.')

        let salaId: string
        if ((profile as Profile).role === 'ure_servico') {
          if (!(profile as Profile).sala_trabalho) {
            throw new Error('Você ainda não possui uma sala de trabalho vinculada. Solicite ao administrador regional.')
          }
          salaId = (profile as Profile).sala_trabalho!
        } else {
          if (!body.sala_id) throw new Error('Selecione a sala de destino.')
          salaId = String(body.sala_id)
        }

        const salasRows = await salasSheet.getRows()
        const salaRow = salasRows.find((r: any) => r.get('id') === salaId && r.get('ativa') === 'TRUE')
        if (!salaRow) throw new Error('Sala inválida ou inativa.')

        const itensSheet = doc.sheetsByTitle[ITENS_SHEET]
        if (!itensSheet) {
          const abasDisponiveis = Object.keys(doc.sheetsByTitle).join(', ') || '(nenhuma)'
          throw new Error(`Aba "${ITENS_SHEET}" não encontrada na planilha (ID ${SHEET_ID}). Abas encontradas: ${abasDisponiveis}.`)
        }
        const itemRows = await itensSheet.getRows()
        const itemRow = itemRows.find((r: any) => String(r.get('Chapa') ?? '').trim() === chapa)
        if (!itemRow) throw new Error('Item não encontrado no inventário.')

        const alocRows = await alocacoesSheet.getRows()
        const jaAlocado = alocRows.find((r: any) => String(r.get('chapa') ?? '').trim() === chapa)
        if (jaAlocado) throw new Error(`Item já alocado na sala "${jaAlocado.get('sala_nome')}".`)

        const descricaoItem = itemRow.get('Descrição do Item') || '-'
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
        await historicoSheet.addRow({
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

        return ok(corsHeaders, { success: true })
      }

      case 'devolver_item': {
        const chapa = String(body.chapa || '').trim()
        if (!chapa) throw new Error('Item não informado.')

        const alocRows = await alocacoesSheet.getRows()
        const row = alocRows.find((r: any) => String(r.get('chapa') ?? '').trim() === chapa)
        if (!row) throw new Error('Item não está alocado em nenhuma sala.')

        if ((profile as Profile).role === 'ure_servico' && row.get('sala_id') !== (profile as Profile).sala_trabalho) {
          throw new Error('Você só pode devolver itens da sua própria sala.')
        }

        const salaIdAnterior = row.get('sala_id')
        const salaNomeAnterior = row.get('sala_nome')
        const descricaoItem = row.get('descricao_item')

        await row.delete()
        await historicoSheet.addRow({
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
          historico = historico.filter((h) => h.salaId === (profile as Profile).sala_trabalho)
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
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[patrimonio-salas]', message)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

function exigirRegionalAdmin(profile: Profile) {
  if (profile.role !== 'regional_admin') {
    throw new Error('Apenas administradores regionais podem executar esta ação.')
  }
}

async function getOrCreateSheet(doc: any, title: string, columns: string[]) {
  let sheet = doc.sheetsByTitle[title]
  if (!sheet) {
    sheet = await doc.addSheet({ title, headerValues: columns })
  } else {
    const headers = await sheet.loadHeaderRow().then(() => sheet.headerValues).catch(() => [])
    if (!headers || headers.length === 0) await sheet.setHeaderRow(columns)
  }
  return sheet
}

function ok(headers: Record<string, string>, data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...headers, 'Content-Type': 'application/json' },
    status: 200,
  })
}
