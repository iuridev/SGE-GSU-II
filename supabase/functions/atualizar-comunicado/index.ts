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
    const body = await req.json()
    const { id, titulo, conteudo, tipo, dataExpiracao, prioridade, ativo, imagemUrl } = body

    if (!id) throw new Error("ID do comunicado é obrigatório.")

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

    let linhaEncontrada = -1
    for (let i = 0; i < limiteLinhas; i++) {
      const val = sheet.getCell(i, 0).value?.toString()
      if (val === id) {
        linhaEncontrada = i
        break
      }
    }

    if (linhaEncontrada === -1) throw new Error(`Comunicado ${id} não encontrado na planilha.`)

    if (titulo !== undefined) sheet.getCell(linhaEncontrada, 1).value = titulo
    if (conteudo !== undefined) sheet.getCell(linhaEncontrada, 2).value = conteudo
    if (tipo !== undefined) sheet.getCell(linhaEncontrada, 3).value = tipo
    if (dataExpiracao !== undefined) sheet.getCell(linhaEncontrada, 6).value = dataExpiracao
    if (prioridade !== undefined) sheet.getCell(linhaEncontrada, 8).value = prioridade
    if (ativo !== undefined) sheet.getCell(linhaEncontrada, 7).value = ativo ? 'TRUE' : 'FALSE'
    if (imagemUrl !== undefined) sheet.getCell(linhaEncontrada, 9).value = imagemUrl

    await sheet.saveUpdatedCells()

    return new Response(JSON.stringify({ sucesso: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("ERRO atualizar-comunicado:", error)
    return new Response(JSON.stringify({ erroReal: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
