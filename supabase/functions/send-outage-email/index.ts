import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // 1. Tratamento de CORS para chamadas do navegador
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Busca a chave configurada nos Secrets do Supabase (dentro do handler para evitar EarlyDrop)
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    
    if (!RESEND_API_KEY) {
      console.error("[ERRO] RESEND_API_KEY não configurada no Supabase.");
      return new Response(JSON.stringify({ error: "Configuração de API pendente no servidor." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const body = await req.json()
    const { type, schoolName, data, userName } = body
    const normalizedType = type?.toUpperCase()

    console.log(`[LOG] Iniciando envio: ${normalizedType} para ${schoolName}`)

    let subject = ""
    let htmlContent = ""

    if (normalizedType === 'WATER_TRUCK') {
      subject = `💧 SOLICITAÇÃO CAMINHÃO PIPA: ${schoolName}`
      htmlContent = `
        <div style="font-family: sans-serif; color: #334155; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #2563eb; padding: 20px; text-align: center;">
            <h2 style="color: #ffffff; margin: 0;">Solicitação de Abastecimento</h2>
          </div>
          <div style="padding: 30px; background-color: #ffffff;">
            <p><strong>Unidade:</strong> ${schoolName}</p>
            <p><strong>Cód. Sabesp:</strong> ${data?.sabespCode || 'N/A'}</p>
            <p><strong>Solicitante:</strong> ${userName}</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <h3 style="font-size: 14px; text-transform: uppercase; color: #64748b;">Checklist de Verificação:</h3>
            <pre style="white-space: pre-wrap; background: #f8fafc; padding: 15px; border-radius: 8px; font-size: 13px; border: 1px solid #cbd5e1;">${data?.notes || 'Sem observações.'}</pre>
          </div>
          <div style="background-color: #f1f5f9; padding: 15px; text-align: center; font-size: 11px; color: #94a3b8;">
            Enviado via SGE-GSU Intelligence • Notificação Automática
          </div>
        </div>
      `
    } else {
      subject = `⚠️ QUEDA DE ENERGIA: ${schoolName}`
      htmlContent = `<div style="font-family: sans-serif;"><h2>Interrupção de Energia</h2><p>${data?.notes}</p></div>`
    }

    // Chamada para a API do Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'notificacoes@gse.ia.br', 
        to: ['gsu.seom@educacao.sp.gov.br'],
        subject: subject,
        html: htmlContent,
      }),
    })

    const resData = await res.json()

    // Se o Resend retornar erro (ex: 401, 403, 422), repassamos o erro REAL
    if (!res.ok) {
      console.error("[ERRO RESEND]", resData)
      return new Response(JSON.stringify({ 
        error: resData.message || "O Resend recusou o envio.",
        details: resData 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: res.status, // Retorna o status de erro real (ex: 403)
      })
    }

    return new Response(JSON.stringify({ success: true, id: resData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("[ERRO CRÍTICO NA FUNÇÃO]", errorMessage)
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})