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
    const { titulo, conteudo, tipo, autor, dataExpiracao, prioridade, imagemUrl } = await req.json()

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

    const limiteLinhas = sheet.rowCount
    await sheet.loadCells(`A1:J${limiteLinhas}`)

    let ultimaLinhaOcupada = 0
    let maiorCom = 0

    for (let i = 0; i < limiteLinhas; i++) {
      const val = sheet.getCell(i, 0).value
      if (val !== null && val !== undefined && val !== '') {
        ultimaLinhaOcupada = i
        const strVal = val.toString()
        if (strVal.startsWith('COM-')) {
          const num = parseInt(strVal.split('-')[1])
          if (!isNaN(num)) maiorCom = Math.max(maiorCom, num)
        }
      }
    }

    const proximaLinha = ultimaLinhaOcupada + 1
    const novoId = `COM-${maiorCom + 1}`

    sheet.getCell(proximaLinha, 0).value = novoId
    sheet.getCell(proximaLinha, 1).value = titulo
    sheet.getCell(proximaLinha, 2).value = conteudo
    sheet.getCell(proximaLinha, 3).value = tipo || 'INFORMATIVO'
    sheet.getCell(proximaLinha, 4).value = autor
    sheet.getCell(proximaLinha, 5).value = new Date().toISOString()
    sheet.getCell(proximaLinha, 6).value = dataExpiracao || ''
    sheet.getCell(proximaLinha, 7).value = 'TRUE'
    sheet.getCell(proximaLinha, 8).value = prioridade || 'MEDIA'
    sheet.getCell(proximaLinha, 9).value = imagemUrl || ''

    await sheet.saveUpdatedCells()

    return new Response(JSON.stringify({ sucesso: true, id: novoId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("ERRO salvar-comunicado:", error)
    return new Response(JSON.stringify({ erroReal: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
