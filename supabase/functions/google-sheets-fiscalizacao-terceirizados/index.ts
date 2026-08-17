import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import { GoogleSpreadsheet } from "npm:google-spreadsheet@4.1.1"
// @ts-ignore
import { JWT } from "npm:google-auth-library@9.6.3"
import { getCorsHeaders } from '../_shared/cors.ts'

const SHEET_ID = Deno.env.get('FISCALIZACAO_TERCEIRIZADOS_SHEET_ID') ?? ''

// Catálogo de entidades da planilha. Para adicionar um novo tipo de serviço
// terceirizado (ex.: Cuidador, Merenda) não é preciso mexer aqui — basta
// inserir uma linha na aba ServiceTypes e os itens correspondentes em
// ChecklistItems. Este mapa só descreve a estrutura das abas, não os
// serviços em si.
const SHEETS: Record<string, { name: string; columns: string[] }> = {
  serviceType: {
    name: 'ServiceTypes',
    columns: ['id', 'nome', 'ativo'],
  },
  checklistItem: {
    name: 'ChecklistItems',
    columns: ['id', 'serviceTypeId', 'frequencia', 'descricaoItem', 'ativo'],
  },
  occurrence: {
    name: 'Occurrences',
    columns: [
      'id', 'data', 'escolaId', 'serviceTypeId', 'ambiente', 'categoriaOcorrencia',
      'descricaoOcorrencia', 'providenciaAdotada', 'retornoDaEmpresa', 'situacao',
      'anexos', 'registradoPor', 'criadoEm',
    ],
  },
  checklistCompletion: {
    name: 'ChecklistCompletions',
    columns: ['id', 'data', 'escolaId', 'serviceTypeId', 'checklistItemId', 'executado', 'observacao', 'registradoPor', 'criadoEm'],
  },
  satisfactionRating: {
    name: 'SatisfactionRatings',
    columns: ['id', 'data', 'escolaId', 'serviceTypeId', 'nota', 'comentario', 'registradoPor', 'criadoEm'],
  },
  visitRequest: {
    name: 'VisitRequests',
    columns: ['id', 'escolaId', 'motivo', 'status', 'dataSolicitacao', 'dataAgendada', 'observacaoFiscal', 'solicitadoPor', 'criadoEm', 'atualizadoEm'],
  },
  serviceExemption: {
    name: 'ServiceExemptions',
    columns: ['id', 'escolaId', 'serviceTypeId', 'motivo', 'ativo', 'isentoPor', 'criadoEm'],
  },
  occurrenceImpactReview: {
    name: 'OccurrenceImpactReviews',
    columns: ['id', 'escolaId', 'mesReferencia', 'quantidadeOcorrencias', 'grauImpacto', 'comentario', 'registradoPor', 'criadoEm'],
  },
  technicalReport: {
    name: 'TechnicalReports',
    columns: ['id', 'periodoInicio', 'periodoFim', 'titulo', 'textoAdmin', 'criadoPor', 'criadoEm', 'atualizadoEm'],
  },
}

// Papéis que atuam como fiscal/regional — únicos que podem ver a data
// agendada de uma visita técnica e definir/concluir o agendamento. A escola
// só enxerga o status (ex.: "agendada"), nunca a data em si.
const ADMIN_LIKE_ROLES = ['regional_admin', 'supervisor', 'dirigente', 'ure_servico']

// Dados iniciais gravados apenas na primeira vez que uma aba precisa ser
// criada (planilha nova/vazia) — depois disso, ServiceTypes/ChecklistItems
// passam a ser mantidos direto na planilha, sem depender deste código.
// Checklist de Transporte Escolar é RASCUNHO (ver src/documentacao/fiscalizacao-terceirizados.md).
const SEEDS: Record<string, Record<string, string>[]> = {
  serviceType: [
    { id: 'svc-limpeza', nome: 'Limpeza Escolar', ativo: 'sim' },
    { id: 'svc-transporte', nome: 'Transporte Escolar', ativo: 'sim' },
  ],
  checklistItem: [
    // Limpeza Escolar — DISPA/SEDUC
    { id: 'chk-limp-d1', serviceTypeId: 'svc-limpeza', frequencia: 'diaria', descricaoItem: 'Limpeza de pisos', ativo: 'sim' },
    { id: 'chk-limp-d2', serviceTypeId: 'svc-limpeza', frequencia: 'diaria', descricaoItem: 'Sanitários', ativo: 'sim' },
    { id: 'chk-limp-d3', serviceTypeId: 'svc-limpeza', frequencia: 'diaria', descricaoItem: 'Lixeiras e resíduos', ativo: 'sim' },
    { id: 'chk-limp-d4', serviceTypeId: 'svc-limpeza', frequencia: 'diaria', descricaoItem: 'Superfícies de uso frequente (maçanetas, corrimãos, interruptores, mesas)', ativo: 'sim' },
    { id: 'chk-limp-d5', serviceTypeId: 'svc-limpeza', frequencia: 'diaria', descricaoItem: 'Pátios e áreas de circulação', ativo: 'sim' },
    { id: 'chk-limp-d6', serviceTypeId: 'svc-limpeza', frequencia: 'diaria', descricaoItem: 'Reposição de materiais (papel, sabonete, saco de lixo)', ativo: 'sim' },
    { id: 'chk-limp-d7', serviceTypeId: 'svc-limpeza', frequencia: 'diaria', descricaoItem: 'Remoção de sujeiras e resíduos acumulados', ativo: 'sim' },
    { id: 'chk-limp-s1', serviceTypeId: 'svc-limpeza', frequencia: 'semanal', descricaoItem: 'Limpeza de vidros internos sem exposição a risco', ativo: 'sim' },
    { id: 'chk-limp-s2', serviceTypeId: 'svc-limpeza', frequencia: 'semanal', descricaoItem: 'Paredes e portas', ativo: 'sim' },
    { id: 'chk-limp-s3', serviceTypeId: 'svc-limpeza', frequencia: 'semanal', descricaoItem: 'Mobiliário', ativo: 'sim' },
    { id: 'chk-limp-s4', serviceTypeId: 'svc-limpeza', frequencia: 'semanal', descricaoItem: 'Áreas externas (varrição/lavagem)', ativo: 'sim' },
    { id: 'chk-limp-s5', serviceTypeId: 'svc-limpeza', frequencia: 'semanal', descricaoItem: 'Revisão de lixeiras', ativo: 'sim' },
    { id: 'chk-limp-s6', serviceTypeId: 'svc-limpeza', frequencia: 'semanal', descricaoItem: 'Limpeza e desinfecção de sanitários', ativo: 'sim' },
    { id: 'chk-limp-s7', serviceTypeId: 'svc-limpeza', frequencia: 'semanal', descricaoItem: 'Polir metais de bebedouros', ativo: 'sim' },
    { id: 'chk-limp-m1', serviceTypeId: 'svc-limpeza', frequencia: 'mensal', descricaoItem: 'Limpeza de vidros externos sem exposição a risco', ativo: 'sim' },
    { id: 'chk-limp-m2', serviceTypeId: 'svc-limpeza', frequencia: 'mensal', descricaoItem: 'Forros e luminárias', ativo: 'sim' },
    { id: 'chk-limp-m3', serviceTypeId: 'svc-limpeza', frequencia: 'mensal', descricaoItem: 'Áreas externas amplas', ativo: 'sim' },
    { id: 'chk-limp-m4', serviceTypeId: 'svc-limpeza', frequencia: 'mensal', descricaoItem: 'Remoção de manchas de pisos e paredes', ativo: 'sim' },
    { id: 'chk-limp-m5', serviceTypeId: 'svc-limpeza', frequencia: 'mensal', descricaoItem: 'Limpeza de ralos e grelhas', ativo: 'sim' },
    { id: 'chk-limp-m6', serviceTypeId: 'svc-limpeza', frequencia: 'mensal', descricaoItem: 'Revisão de selantes e rejuntes', ativo: 'sim' },
    { id: 'chk-limp-t1', serviceTypeId: 'svc-limpeza', frequencia: 'trimestral', descricaoItem: 'Limpeza de vidros externos com exposição a risco', ativo: 'sim' },
    { id: 'chk-limp-t2', serviceTypeId: 'svc-limpeza', frequencia: 'trimestral', descricaoItem: 'Áreas elevadas', ativo: 'sim' },
    { id: 'chk-limp-t3', serviceTypeId: 'svc-limpeza', frequencia: 'trimestral', descricaoItem: 'Fachadas e estruturas externas', ativo: 'sim' },
    { id: 'chk-limp-t4', serviceTypeId: 'svc-limpeza', frequencia: 'trimestral', descricaoItem: 'Calhas e rufos', ativo: 'sim' },
    // Transporte Escolar — RASCUNHO, validar com o gestor antes de produção
    { id: 'chk-transp-d1', serviceTypeId: 'svc-transporte', frequencia: 'diaria', descricaoItem: '[RASCUNHO] Conferência da documentação do motorista/monitor', ativo: 'sim' },
    { id: 'chk-transp-d2', serviceTypeId: 'svc-transporte', frequencia: 'diaria', descricaoItem: '[RASCUNHO] Estado de conservação do veículo (pneus, freios, cintos)', ativo: 'sim' },
    { id: 'chk-transp-d3', serviceTypeId: 'svc-transporte', frequencia: 'diaria', descricaoItem: '[RASCUNHO] Cumprimento de horário e rota', ativo: 'sim' },
    { id: 'chk-transp-d4', serviceTypeId: 'svc-transporte', frequencia: 'diaria', descricaoItem: '[RASCUNHO] Uso de cinto de segurança pelos alunos', ativo: 'sim' },
    { id: 'chk-transp-d5', serviceTypeId: 'svc-transporte', frequencia: 'diaria', descricaoItem: '[RASCUNHO] Presença do monitor quando exigido', ativo: 'sim' },
    { id: 'chk-transp-s1', serviceTypeId: 'svc-transporte', frequencia: 'semanal', descricaoItem: '[RASCUNHO] Verificação de itens de segurança (extintor, kit de primeiros socorros)', ativo: 'sim' },
    { id: 'chk-transp-s2', serviceTypeId: 'svc-transporte', frequencia: 'semanal', descricaoItem: '[RASCUNHO] Limpeza interna do veículo', ativo: 'sim' },
    { id: 'chk-transp-m1', serviceTypeId: 'svc-transporte', frequencia: 'mensal', descricaoItem: '[RASCUNHO] Revisão da documentação do veículo (CRLV, seguro, vistoria)', ativo: 'sim' },
    { id: 'chk-transp-m2', serviceTypeId: 'svc-transporte', frequencia: 'mensal', descricaoItem: '[RASCUNHO] Avaliação de conduta do motorista relatada pela escola', ativo: 'sim' },
  ],
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

    // Papel do usuário logado — decide se ele vê/edita a data de visitas
    // técnicas (VisitRequests.dataAgendada). Consultado uma vez e reaproveitado
    // tanto no GET (redação) quanto no POST (guarda de escrita).
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    // chefe_departamento é somente-leitura, mas em todo o resto do sistema é
    // tratado como equivalente a regional_admin para fins de visualização
    // (ver resolveViewRole em src/lib/roles.ts) — mantém a mesma regra aqui.
    const rawRole = profile?.role || ''
    const effectiveRole = rawRole === 'chefe_departamento' ? 'regional_admin' : rawRole
    const isAdminLike = ADMIN_LIKE_ROLES.includes(effectiveRole)

    // ── Autentica na Google Sheets API (mesma service account do Drive) ──────
    const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    const key   = Deno.env.get('GOOGLE_PRIVATE_KEY')
    if (!email || !key) throw new Error('Credenciais Google não configuradas nos secrets.')
    if (!SHEET_ID)      throw new Error('FISCALIZACAO_TERCEIRIZADOS_SHEET_ID não configurado nos secrets.')

    const auth = new JWT({
      email,
      key: key.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    const doc = new GoogleSpreadsheet(SHEET_ID, auth)
    await doc.loadInfo()

    // Cria a aba (com cabeçalho e, se houver, dados iniciais) na primeira vez
    // que ela é referenciada e ainda não existe na planilha — assim a
    // planilha se autoprovisiona no primeiro acesso, sem exigir que alguém
    // crie as abas manualmente antes de usar o módulo.
    const getEntitySheet = async (entity: string) => {
      const def = SHEETS[entity]
      if (!def) throw new Error(`Entidade "${entity}" inválida.`)
      let sheet = doc.sheetsByTitle[def.name]
      if (!sheet) {
        sheet = await doc.addSheet({ title: def.name, headerValues: def.columns })
        const seed = SEEDS[entity]
        if (seed && seed.length > 0) await sheet.addRows(seed)
      }
      return { sheet, columns: def.columns }
    }

    // ── GET: retorna as 4 abas como arrays de objetos ────────────────────────
    if (req.method === 'GET') {
      const result: Record<string, unknown[]> = {}
      for (const entity of Object.keys(SHEETS)) {
        const { sheet, columns } = await getEntitySheet(entity)
        const rows = await sheet.getRows()
        result[`${entity}s`] = rows.map((row: any) => {
          const obj = Object.fromEntries(columns.map(col => [col, row.get(col) ?? '']))
          // A escola nunca recebe a data agendada da própria visita — só
          // sabe que foi agendada (status). Redigido aqui, no servidor, para
          // não depender da UI esconder o campo.
          if (entity === 'visitRequest' && !isAdminLike) obj.dataAgendada = ''
          return obj
        })
      }
      return ok(corsHeaders, result)
    }

    // ── POST: cria ou atualiza uma linha ─────────────────────────────────────
    if (req.method === 'POST') {
      const body = await req.json()
      const { entity, action, id, data } = body
      if (!entity || !action || !data) throw new Error('Requisição inválida: entity, action e data são obrigatórios.')

      // Só o fiscal/regional pode definir a data de uma visita técnica ou
      // avançar o status para agendada/concluída — a escola só pode criar o
      // pedido (status inicial "pendente").
      if (entity === 'visitRequest' && !isAdminLike) {
        if (data.dataAgendada || data.status === 'agendada' || data.status === 'concluida') {
          throw new Error('Apenas o fiscal pode definir a data ou concluir uma visita técnica.')
        }
      }

      // Só o fiscal/regional decide quais escolas ficam isentas de um serviço.
      if (entity === 'serviceExemption' && !isAdminLike) {
        throw new Error('Apenas o fiscal pode gerenciar isenções de serviço.')
      }

      // Só o fiscal/regional escreve/edita o Relatório Técnico de Fiscalização.
      if (entity === 'technicalReport' && !isAdminLike) {
        throw new Error('Apenas o fiscal pode criar ou editar o relatório técnico.')
      }

      const { sheet, columns } = await getEntitySheet(entity)

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
    console.error('[google-sheets-fiscalizacao-terceirizados]', message)
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
