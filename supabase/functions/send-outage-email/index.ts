import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// Alterado para uma versão fixa e estável para garantir o cache correto no Deno
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Configuração de ambiente incompleta no servidor." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // Inicializa o cliente Supabase interno
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

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
            <h2 style="color: #ffffff; margin: 0; text-transform: uppercase; letter-spacing: 1px;">Solicitação de Abastecimento</h2>
          </div>
          <div style="padding: 30px; background-color: #ffffff;">
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 25px; border-left: 4px solid #2563eb;">
              <p style="margin: 0 0 8px 0;"><strong>Unidade:</strong> ${schoolName}</p>
              <p style="margin: 0 0 8px 0;"><strong>Cód. Sabesp:</strong> ${data?.sabespCode || 'N/A'}</p>
              <p style="margin: 0 0 8px 0;"><strong>Solicitante:</strong> ${userName}</p>
              <p style="margin: 0;"><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
            </div>
            <h3 style="font-size: 14px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 15px;">Checklist Técnico:</h3>
            <pre style="white-space: pre-wrap; background: #f8fafc; padding: 15px; border-radius: 8px; font-size: 13px; color: #1e293b; border: 1px solid #e2e8f0;">${data?.notes}</pre>
          </div>
          <div style="background-color: #f1f5f9; padding: 15px; text-align: center; font-size: 11px; color: #94a3b8;">SGE-GSU Intelligence • Notificação Automática</div>
        </div>
      `
    } 
    else if (normalizedType === 'POWER_OUTAGE') {
      subject = `⚠️ QUEDA DE ENERGIA: ${schoolName}`
      htmlContent = `
        <div style="font-family: sans-serif; color: #334155; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #1e293b; padding: 20px; text-align: center;">
            <h2 style="color: #fbbf24; margin: 0; text-transform: uppercase; letter-spacing: 1px;">Notificação de Interrupção de Energia</h2>
          </div>
          <div style="padding: 30px; background-color: #ffffff;">
            <div style="background-color: #fffbeb; padding: 20px; border-radius: 8px; margin-bottom: 25px; border-left: 4px solid #fbbf24;">
              <p style="margin: 0 0 8px 0;"><strong>Unidade Escolar:</strong> ${schoolName}</p>
              <p style="margin: 0 0 8px 0;"><strong>Nº Instalação (EDP):</strong> ${data?.edpCode || 'N/A'}</p>
              <p style="margin: 0 0 8px 0;"><strong>Responsável:</strong> ${userName}</p>
              <p style="margin: 0;"><strong>Data do Relato:</strong> ${new Date().toLocaleString('pt-BR')}</p>
            </div>
            <h3 style="font-size: 14px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 15px;">Protocolo de Verificação e Relato:</h3>
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; font-size: 14px; color: #1e293b; border: 1px solid #e2e8f0; white-space: pre-wrap;">${data?.notes}</div>
          </div>
          <div style="background-color: #1e293b; padding: 15px; text-align: center; font-size: 11px; color: #94a3b8;">SGE-GSU Intelligence • Notificação de Emergência Manutenção</div>
        </div>
      `
    }

    // Envio do E-mail
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

    if (!res.ok) {
      console.error("[ERRO RESEND]", resData)
      return new Response(JSON.stringify({ error: resData.message || "Erro no Resend" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: res.status,
      })
    }

    // REGISTRO DE ESTATÍSTICA NO BANCO DE DADOS
    const { error: dbError } = await supabaseAdmin
      .from('occurrences')
      .insert([{
        type: normalizedType,
        school_name: schoolName,
        user_name: userName,
        details: data?.notes
      }])

    if (dbError) {
      console.error("[ERRO DB ESTATÍSTICA]", dbError)
    }

    return new Response(JSON.stringify({ success: true, id: resData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})