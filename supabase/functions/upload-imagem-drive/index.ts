import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { JWT } from "npm:google-auth-library@9.6.3"
import { getCorsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { imageBase64, mimeType, fileName } = await req.json()
    if (!imageBase64 || !mimeType || !fileName) throw new Error('imageBase64, mimeType e fileName são obrigatórios.')

    const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    const key = Deno.env.get('GOOGLE_PRIVATE_KEY')
    const folderId = Deno.env.get('DRIVE_COMUNICADOS_FOLDER_ID')
    if (!email || !key) throw new Error('Chaves de autenticação ausentes.')
    if (!folderId) throw new Error('DRIVE_COMUNICADOS_FOLDER_ID não configurado.')

    const auth = new JWT({
      email,
      key: key.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive'],
    })

    const { token } = await auth.getAccessToken()
    if (!token) throw new Error('Falha ao obter token de acesso.')

    // Verifica se folderId é realmente um Shared Drive
    const driveCheckRes = await fetch(
      `https://www.googleapis.com/drive/v3/drives/${folderId}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    )
    const driveCheckData = await driveCheckRes.json()
    const isSharedDrive = !!driveCheckData.id
    if (!isSharedDrive) {
      throw new Error(`O ID configurado não é um Drive Compartilhado (é uma pasta comum). Erro: ${driveCheckData.error?.message || 'ID inválido'}`)
    }

    // Passo 1: cria o arquivo vazio no Drive Compartilhado
    const createRes = await fetch(
      'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: fileName, mimeType, parents: [folderId] }),
      }
    )
    const createData = await createRes.json()
    if (!createData.id) throw new Error(`Falha ao criar arquivo no Drive: ${JSON.stringify(createData)}`)

    const fileId = createData.id

    // Passo 2: envia o conteúdo binário
    const imageBytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0))
    const uploadRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': mimeType,
        },
        body: imageBytes,
      }
    )
    const uploadData = await uploadRes.json()
    if (!uploadData.id) throw new Error(`Falha ao enviar conteúdo: ${JSON.stringify(uploadData)}`)

    // Passo 3: torna o arquivo público
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      }
    )

    const url = `https://drive.google.com/uc?export=view&id=${fileId}`

    return new Response(JSON.stringify({ sucesso: true, url, fileId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('ERRO upload-imagem-drive:', error)
    return new Response(JSON.stringify({ erroReal: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
