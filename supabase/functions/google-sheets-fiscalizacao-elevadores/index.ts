import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import { GoogleSpreadsheet } from "npm:google-spreadsheet@4.1.1"
// @ts-ignore
import { JWT } from "npm:google-auth-library@9.6.3"
import { getCorsHeaders } from '../_shared/cors.ts'

// Mesma planilha da Fiscalização de Serviços Terceirizados (Limpeza/Transporte),
// só que em abas próprias. FISCALIZACAO_ELEVADORES_SHEET_ID é opcional, caso
// um dia se queira uma planilha separada.
const SHEET_ID =
  Deno.env.get('FISCALIZACAO_ELEVADORES_SHEET_ID') ??
  Deno.env.get('FISCALIZACAO_TERCEIRIZADOS_SHEET_ID') ?? ''

// Anexos (PDF/imagem) vão para uma pasta do Drive da conta sefiscgsu via Apps
// Script publicado por ela (ver docs/apps-script/fiscalizacao-elevadores-anexos.gs).
const ANEXOS_SCRIPT_URL = Deno.env.get('FISCALIZACAO_ELEVADORES_ANEXOS_SCRIPT_URL') ?? ''
const ANEXOS_TOKEN = Deno.env.get('FISCALIZACAO_ELEVADORES_ANEXOS_TOKEN') ?? ''
const ANEXO_MAX_BYTES = 10 * 1024 * 1024
const ANEXOS_MAX = 5
const ANEXO_MIME_OK = /^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif))$/

// Uma linha por escola/quinzena (id = "<escolaId>_<inicioDaQuinzena>"), lida pelo app.
const INSPECTIONS = {
  name: 'ElevatorInspections',
  columns: [
    'id', 'escolaId', 'escolaNome', 'periodoInicio', 'periodoFim', 'fiscalId', 'fiscalNome',
    'elevadorFuncionando', 'paradoDesde', 'houveVisita', 'houveChamado', 'tipoChamado',
    'chamadoAbertoEm', 'chamadoAtendidoEm', 'minutosAtendimento', 'pessoaPresa',
    'conformidade', 'situacao', 'naoConformidades', 'observacoesGerais',
    'respostas', 'observacoes', 'naoConformidadesIds', 'criadoEm', 'atualizadoEm', 'anexos',
  ],
}

// Uma linha por item respondido — formato "longo", pensado para filtrar e
// montar tabelas dinâmicas no Excel. Só é escrita pelo app, nunca lida por ele.
const ITEMS = {
  name: 'ElevatorInspectionItems',
  columns: ['inspecaoId', 'escolaId', 'escolaNome', 'periodoInicio', 'periodoFim', 'bloco', 'itemId', 'item', 'resposta', 'observacao'],
}

const ADMIN_LIKE_ROLES = ['regional_admin', 'supervisor', 'dirigente', 'ure_servico']

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autorizado.')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Token inválido ou expirado.')

    const { data: profile } = await supabase.from('profiles').select('role, school_id').eq('id', user.id).single()
    const rawRole = profile?.role || ''
    // chefe_departamento enxerga como regional_admin, mas nunca escreve.
    const effectiveRole = rawRole === 'chefe_departamento' ? 'regional_admin' : rawRole
    const isAdminLike = ADMIN_LIKE_ROLES.includes(effectiveRole)
    const mySchoolId: string | null = profile?.school_id ?? null

    // ── POST action=upload_anexo: envia um arquivo ao Drive e devolve o id ───
    // Não toca na planilha: o anexo só entra na linha quando o formulário é salvo.
    const body = req.method === 'POST' ? await req.json() : null
    if (body?.action === 'upload_anexo') {
      if (rawRole !== 'school_manager' || !mySchoolId || body.escolaId !== mySchoolId) {
        throw new Error('Apenas o Fiscal Setorial da própria escola pode anexar arquivos.')
      }
      if (!ANEXOS_SCRIPT_URL || !ANEXOS_TOKEN) throw new Error('Envio de anexos não configurado nos secrets.')
      const { fileName, mimeType, base64, periodoInicio } = body
      if (typeof base64 !== 'string' || typeof fileName !== 'string' || !ANEXO_MIME_OK.test(mimeType ?? '')) {
        throw new Error('Envie apenas PDF ou imagem.')
      }
      if (Math.floor(base64.length * 3 / 4) > ANEXO_MAX_BYTES) throw new Error('Arquivo acima de 10 MB.')

      const { data: escola } = await supabase.from('schools').select('name').eq('id', mySchoolId).single()
      const nomeSeguro = fileName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120)
      const resp = await fetch(ANEXOS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: ANEXOS_TOKEN,
          pasta: escola?.name ?? mySchoolId,
          fileName: `${String(periodoInicio ?? '').slice(0, 10)}_${nomeSeguro}`,
          mimeType,
          base64,
        }),
      })
      const out = await resp.json().catch(() => null)
      if (!out?.id) throw new Error(out?.error || 'Falha ao gravar o arquivo no Drive.')
      return ok(corsHeaders, { anexo: { id: out.id, nome: fileName.slice(0, 120), mimeType } })
    }

    const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    const key = Deno.env.get('GOOGLE_PRIVATE_KEY')
    if (!email || !key) throw new Error('Credenciais Google não configuradas nos secrets.')
    if (!SHEET_ID) throw new Error('FISCALIZACAO_TERCEIRIZADOS_SHEET_ID não configurado nos secrets.')

    const auth = new JWT({
      email,
      key: key.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    const doc = new GoogleSpreadsheet(SHEET_ID, auth)
    await doc.loadInfo()

    // Cria a aba com cabeçalho na primeira vez que for usada; se a aba já existe
    // mas é anterior a alguma coluna nova (ex.: "anexos"), acrescenta-a ao final.
    const getSheet = async (def: { name: string; columns: string[] }) => {
      let sheet = doc.sheetsByTitle[def.name]
      if (!sheet) return await doc.addSheet({ title: def.name, headerValues: def.columns })
      await sheet.loadHeaderRow()
      const missing = def.columns.filter(c => !sheet.headerValues.includes(c))
      if (missing.length > 0) await sheet.setHeaderRow([...sheet.headerValues, ...missing])
      return sheet
    }

    // ── GET: retorna as fiscalizações (a escola só recebe as próprias) ───────
    if (req.method === 'GET') {
      const sheet = await getSheet(INSPECTIONS)
      const rows = await sheet.getRows()
      let inspections = rows.map((row: any) =>
        Object.fromEntries(INSPECTIONS.columns.map(col => [col, row.get(col) ?? ''])))
      if (!isAdminLike) {
        inspections = inspections.filter((r: any) => mySchoolId && r.escolaId === mySchoolId)
      }
      // O link da planilha só é entregue ao regional_admin (o ID não vai para o front).
      const sheetUrl = effectiveRole === 'regional_admin'
        ? `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${sheet.sheetId}`
        : null
      return ok(corsHeaders, { inspections, sheetUrl })
    }

    // ── POST: grava (cria ou substitui) a fiscalização da quinzena ───────────
    if (req.method === 'POST') {
      const { data, items } = body
      if (!data?.id || !data?.escolaId || !data?.periodoInicio) {
        throw new Error('Requisição inválida: id, escolaId e periodoInicio são obrigatórios.')
      }
      // Só o Fiscal Setorial, e só da própria escola. chefe_departamento e
      // demais papéis regionais não escrevem.
      if (rawRole !== 'school_manager' || !mySchoolId || data.escolaId !== mySchoolId) {
        throw new Error('Apenas o Fiscal Setorial da própria escola pode enviar esta fiscalização.')
      }
      if (data.id !== `${data.escolaId}_${data.periodoInicio}`) throw new Error('Identificador inválido.')
      data.anexos = sanitizarAnexos(data.anexos)

      const now = new Date().toISOString()
      const sheet = await getSheet(INSPECTIONS)
      const rows = await sheet.getRows()
      const existing = rows.find((r: any) => r.get('id') === data.id)

      if (existing) {
        for (const col of INSPECTIONS.columns) {
          if (col === 'id' || col === 'criadoEm') continue
          if (col in data) existing.set(col, data[col] ?? '')
        }
        existing.set('atualizadoEm', now)
        await existing.save()
      } else {
        await sheet.addRow({
          ...Object.fromEntries(INSPECTIONS.columns.map(col => [col, data[col] ?? ''])),
          criadoEm: now,
          atualizadoEm: now,
        })
      }

      // Itens: apaga as linhas anteriores desta inspeção (de baixo para cima,
      // porque excluir desloca os índices) e regrava.
      const itemsSheet = await getSheet(ITEMS)
      const itemRows = await itemsSheet.getRows()
      for (let i = itemRows.length - 1; i >= 0; i--) {
        if (itemRows[i].get('inspecaoId') === data.id) await itemRows[i].delete()
      }
      if (Array.isArray(items) && items.length > 0) {
        await itemsSheet.addRows(items.map((it: Record<string, string>) =>
          Object.fromEntries(ITEMS.columns.map(col => [col, it[col] ?? '']))))
      }
      return ok(corsHeaders, { success: true })
    }

    throw new Error('Método não suportado.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[google-sheets-fiscalizacao-elevadores]', message)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

// Só guarda id/nome/tipo; o link é sempre montado a partir do id, então o
// cliente não consegue injetar URLs arbitrárias que a URE depois clicaria.
function sanitizarAnexos(raw: unknown): string {
  let lista: any[] = []
  try { lista = typeof raw === 'string' ? JSON.parse(raw || '[]') : [] } catch { lista = [] }
  if (!Array.isArray(lista)) return '[]'
  const limpos = lista
    .filter(a => a && typeof a.id === 'string' && /^[\w-]{10,100}$/.test(a.id))
    .slice(0, ANEXOS_MAX)
    .map(a => ({
      id: a.id,
      nome: String(a.nome ?? 'anexo').slice(0, 120),
      mimeType: ANEXO_MIME_OK.test(a.mimeType ?? '') ? a.mimeType : 'application/octet-stream',
    }))
  return JSON.stringify(limpos)
}

function ok(headers: Record<string, string>, data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...headers, 'Content-Type': 'application/json' },
    status: 200,
  })
}
