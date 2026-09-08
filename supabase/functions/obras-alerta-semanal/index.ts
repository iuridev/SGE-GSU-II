import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { getCorsHeaders } from '../_shared/cors.ts'

// Lê a mesma planilha pública (Google Forms) que a tela Acompanhamento
// Semanal de Obras usa no front (VITE_ACOMPANHAMENTO_OBRAS_CSV_URL) — sem
// precisar de credencial Google, é um CSV publicado.
const CSV_URL = Deno.env.get('ACOMPANHAMENTO_OBRAS_CSV_URL') ?? ''

// Chamada só pelo cron (pg_cron + pg_net), nunca por um usuário logado —
// por isso a checagem é um segredo compartilhado num header custom, e não
// um JWT de usuário (ver config.toml: verify_jwt = false pra esta função).
const CRON_SECRET = Deno.env.get('OBRAS_ALERTA_CRON_SECRET') ?? ''

const DESTINATARIOS = ['gsu.seom@educacao.sp.gov.br', 'gsu.sefisc@educacao.sp.gov.br']

// Mesmo parser em estado-de-máquina de src/lib/obrasSheet.ts — precisa lidar
// com campos entre aspas contendo vírgula/quebra de linha (respostas longas
// do formulário).
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQ = false
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQ = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQ = true
    } else if (c === ',') {
      row.push(field.trim()); field = ''
    } else if (c === '\n') {
      row.push(field.trim()); rows.push(row); row = []; field = ''
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field.trim()); rows.push(row) }
  return rows
}

function normalizeHeader(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

// dd/mm/yyyy [hh:mm:ss] -> yyyy-mm-dd
function parseDateBR(raw: string): string {
  const m = raw?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return ''
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function fmtBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function escapeHtml(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

// Assume execução toda segunda-feira: retorna a semana anterior completa
// (segunda a domingo). Se rodar em outro dia, ainda calcula a última
// segunda-a-domingo fechada antes de "hoje" — nunca inclui a semana corrente.
function semanaAnterior(hoje: Date): { inicio: string; fim: string } {
  const dow = hoje.getUTCDay() // 0=domingo .. 6=sábado
  const diffParaSegunda = (dow + 6) % 7
  const segundaAtual = new Date(hoje)
  segundaAtual.setUTCDate(hoje.getUTCDate() - diffParaSegunda)
  const segundaAnterior = new Date(segundaAtual)
  segundaAnterior.setUTCDate(segundaAtual.getUTCDate() - 7)
  const domingoAnterior = new Date(segundaAtual)
  domingoAnterior.setUTCDate(segundaAtual.getUTCDate() - 1)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { inicio: fmt(segundaAnterior), fim: fmt(domingoAnterior) }
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
      throw new Error('Não autorizado.')
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CSV_URL) {
      throw new Error('Secrets não configurados (RESEND_API_KEY / SUPABASE_SERVICE_ROLE_KEY / ACOMPANHAMENTO_OBRAS_CSV_URL).')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const csvRes = await fetch(CSV_URL, { cache: 'no-store' })
    if (!csvRes.ok) throw new Error(`Falha ao ler a planilha (HTTP ${csvRes.status}).`)
    const csvRows = parseCSV(await csvRes.text())
    if (csvRows.length < 2) {
      return ok(corsHeaders, { success: true, message: 'Planilha vazia ou sem respostas ainda.' })
    }

    const headers = csvRows[0]
    const findKey = (terms: string[]) => headers.findIndex(h => terms.some(t => normalizeHeader(h).includes(t)))
    const idx = {
      carimbo: findKey(['carimbo']),
      escola: findKey(['selecione a ue']),
      ocorrencia: findKey(['ocorrencia']),
      fotos: findKey(['fotos']),
      avaliacao: findKey(['andamento da obra']),
      responsavel: findKey(['responsavel']),
    }

    const { inicio, fim } = semanaAnterior(new Date())

    type Candidato = { id: string; escola: string; nota: number; ocorrencia: string; fotosUrls: string[]; responsavel: string; data: string }
    const candidatos: Candidato[] = []

    for (let i = 1; i < csvRows.length; i++) {
      const r = csvRows[i]
      if (!r.some(c => c.trim())) continue
      const carimbo = idx.carimbo >= 0 ? (r[idx.carimbo] || '').trim() : ''
      const dataISO = parseDateBR(carimbo)
      if (!dataISO || dataISO < inicio || dataISO > fim) continue
      const nota = idx.avaliacao >= 0 ? parseInt((r[idx.avaliacao] || '').trim(), 10) : NaN
      if (!Number.isFinite(nota) || nota < 1 || nota > 5 || nota >= 4) continue
      const escola = idx.escola >= 0 ? (r[idx.escola] || '').trim() : ''
      if (!escola) continue
      const fotosRaw = idx.fotos >= 0 ? (r[idx.fotos] || '').trim() : ''
      candidatos.push({
        id: `${carimbo}-${escola}`,
        escola,
        nota,
        ocorrencia: idx.ocorrencia >= 0 ? (r[idx.ocorrencia] || '').trim() : '',
        fotosUrls: fotosRaw ? fotosRaw.split(',').map(u => u.trim()).filter(Boolean) : [],
        responsavel: idx.responsavel >= 0 ? (r[idx.responsavel] || '').trim() : '',
        data: dataISO,
      })
    }

    if (candidatos.length === 0) {
      return ok(corsHeaders, { success: true, message: `Nenhuma avaliação com nota < 4 na semana de ${inicio} a ${fim}.` })
    }

    // Garante uma linha por candidato na tabela de controle (mesmo antes de
    // enviar), pra tela já poder mostrar "E-mail Não Enviado" imediatamente.
    const { error: upsertError } = await supabase
      .from('obra_avaliacao_alertas')
      .upsert(
        candidatos.map(c => ({
          id: c.id,
          semana_inicio: inicio,
          semana_fim: fim,
          escola: c.escola,
          nota: c.nota,
          ocorrencia: c.ocorrencia,
          responsavel: c.responsavel,
          data_avaliacao: c.data,
        })),
        { onConflict: 'id', ignoreDuplicates: false },
      )
    if (upsertError) throw new Error(`Erro ao gravar controle: ${upsertError.message}`)

    const { data: existentes, error: selectError } = await supabase
      .from('obra_avaliacao_alertas')
      .select('id, email_enviado')
      .in('id', candidatos.map(c => c.id))
    if (selectError) throw new Error(`Erro ao consultar controle: ${selectError.message}`)

    const jaEnviados = new Set((existentes || []).filter(e => e.email_enviado).map(e => e.id))
    const pendentes = candidatos.filter(c => !jaEnviados.has(c.id))

    if (pendentes.length === 0) {
      return ok(corsHeaders, { success: true, message: 'Todas as avaliações da semana já haviam sido notificadas.' })
    }

    const subject = `⚠️ Acompanhamento de Obras: ${pendentes.length} avaliação(ões) com nota < 4 — semana de ${fmtBR(inicio)} a ${fmtBR(fim)}`
    const htmlContent = `<div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
      <h2 style="color:#dc2626;">Avaliações de andamento de obra abaixo de 4</h2>
      <p style="font-size:13px;color:#64748b;">Semana de ${fmtBR(inicio)} a ${fmtBR(fim)} — respostas do formulário semanal preenchido pelas escolas.</p>
      ${pendentes.map(p => `
        <div style="padding:15px;background:#fef2f2;border-radius:10px;border:1px solid #fecaca;margin-bottom:10px;">
          <p style="margin:0;"><b>Escola:</b> ${escapeHtml(p.escola)}</p>
          <p style="margin:5px 0 0;"><b>Nota:</b> ${escapeHtml(p.nota)}/5</p>
          <p style="margin:5px 0 0;"><b>Data da resposta:</b> ${fmtBR(p.data)}</p>
          ${p.ocorrencia ? `<p style="margin:5px 0 0;"><b>Ocorrência relatada:</b> ${escapeHtml(p.ocorrencia)}</p>` : ''}
          ${p.fotosUrls.length > 0 ? `<p style="margin:5px 0 0;"><b>Fotos/anexos:</b> ${p.fotosUrls.map((u, i) => `<a href="${escapeHtml(u)}" style="color:#2563eb;">link ${i + 1}</a>`).join(', ')}</p>` : ''}
          <p style="margin:5px 0 0;"><b>Responsável pelo preenchimento:</b> ${escapeHtml(p.responsavel)}</p>
        </div>`).join('')}
    </div>`

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'SGE-GSU <notificacoes@gse.ia.br>',
        to: DESTINATARIOS,
        subject,
        html: htmlContent,
      }),
    })
    const emailData = await emailRes.json()
    if (!emailRes.ok) throw new Error(`Erro Resend: ${emailData.message}`)

    const { error: updateError } = await supabase
      .from('obra_avaliacao_alertas')
      .update({ email_enviado: true, enviado_em: new Date().toISOString() })
      .in('id', pendentes.map(p => p.id))
    if (updateError) throw new Error(`E-mail enviado mas falhou ao marcar como enviado: ${updateError.message}`)

    return ok(corsHeaders, { success: true, enviados: pendentes.length, emailId: emailData.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[obras-alerta-semanal]', message)
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
