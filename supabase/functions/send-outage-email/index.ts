import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
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
      return new Response(JSON.stringify({ error: "Configuração de ambiente incompleta." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const body = await req.json()
    const { type, schoolName, schoolId, data, userName } = body
    const normalizedType = type?.toUpperCase()

    // 1. Envio do E-mail via Resend
    let subject = normalizedType === 'WATER_TRUCK' ? `💧 PIPA: ${schoolName}` : `⚠️ ENERGIA: ${schoolName}`;
    let htmlContent = `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>${normalizedType === 'WATER_TRUCK' ? 'Solicitação de Caminhão Pipa' : 'Queda de Energia'}</h2>
        <p><strong>Escola:</strong> ${schoolName}</p>
        <p><strong>Solicitante:</strong> ${userName}</p>
        <hr/>
        <pre style="background: #f4f4f4; padding: 15px;">${data?.notes}</pre>
      </div>
    `;

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

    if (!res.ok) throw new Error(resData.message || "Erro no Resend")

    // 2. REGISTRO DE ESTATÍSTICA (Agora com school_id)
    await supabaseAdmin
      .from('occurrences')
      .insert([{
        type: normalizedType,
        school_id: schoolId, // Gravando o ID vinculado
        school_name: schoolName,
        user_name: userName,
        details: data?.notes
      }])

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})