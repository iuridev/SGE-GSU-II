import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { GoogleSpreadsheet } from "npm:google-spreadsheet@4.1.1"
// @ts-ignore
import { JWT } from "npm:google-auth-library@9.6.3"
import { getCorsHeaders } from '../_shared/cors.ts'

const SHEET_ID = Deno.env.get('COMUNICADOS_SHEET_ID') ?? ''

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    const key = Deno.env.get('GOOGLE_PRIVATE_KEY')

    if (!email || !key) throw new Error("Chaves de autenticação ausentes no Supabase.")

    const serviceAccountAuth = new JWT({
      email,
      key: key.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth)
    await doc.loadInfo()
    const sheet = doc.sheetsByIndex[0]

    const totalLinhas = sheet.rowCount
    await sheet.loadCells(`A1:I${totalLinhas}`)

    const comunicados = []
    for (let i = 1; i < totalLinhas; i++) {
      const idCell = sheet.getCell(i, 0).value
      if (idCell === null || idCell === undefined || idCell === '') continue

      const idStr = idCell.toString()
      if (!idStr.startsWith('COM-')) continue

      comunicados.push({
        id: idStr,
        titulo: sheet.getCell(i, 1).value?.toString() || '',
        conteudo: sheet.getCell(i, 2).value?.toString() || '',
        tipo: sheet.getCell(i, 3).value?.toString() || 'INFORMATIVO',
        autor: sheet.getCell(i, 4).value?.toString() || '',
        dataCriacao: sheet.getCell(i, 5).value?.toString() || '',
        dataExpiracao: sheet.getCell(i, 6).value?.toString() || '',
        ativo: sheet.getCell(i, 7).value?.toString() === 'TRUE',
        prioridade: sheet.getCell(i, 8).value?.toString() || 'MEDIA',
      })
    }

    return new Response(JSON.stringify({ sucesso: true, comunicados }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("ERRO ler-comunicados:", error)
    return new Response(JSON.stringify({ erroReal: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
