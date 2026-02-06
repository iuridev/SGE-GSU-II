import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Trata requisições de pre-flight do CORS
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Secrets do Supabase (RESEND_API_KEY, SUPABASE_URL ou SERVICE_ROLE) não configurados.")
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const body = await req.json()
    const { type, schoolName, data, userName } = body
    const normalizedType = type?.toUpperCase()

    let subject = ""
    let htmlContent = ""

    // --- LÓGICA 1: AGENDAMENTO AUTOMÁTICO DE CARROS ---
    if (normalizedType === 'CAR_SCHEDULE_AUTO') {
      const now = new Date();
      // Ajuste manual: Londres (UTC) para Brasília (-3h) e soma 24h para amanhã
      const tomorrow = new Date(now.getTime() - (3 * 3600000) + (24 * 3600000));
      
      const year = tomorrow.getUTCFullYear();
      const month = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
      const day = String(tomorrow.getUTCDate()).padStart(2, '0');
      const tomorrowStr = `${year}-${month}-${day}`; 

      const { data: schedules, error: dbError } = await supabase
        .from('car_schedules')
        .select('*')
        .eq('service_date', tomorrowStr);

      if (dbError) throw new Error(`Erro ao consultar banco: ${dbError.message}`);

      const displayDate = `${day}/${month}/${year}`;

      if (!schedules || schedules.length === 0) {
        return new Response(JSON.stringify({ 
          success: true, 
          message: `Nenhum agendamento sincronizado para amanhã (${displayDate}).` 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      const aprovados = schedules
        .filter(s => s.status?.toUpperCase().includes('APROVADO') || s.status?.toUpperCase() === 'OK')
        .map(s => s.requester_name);

      const aguardando = schedules
        .filter(s => !s.status?.toUpperCase().includes('APROVADO') && s.status?.toUpperCase() !== 'OK')
        .map(s => s.requester_name);

      subject = `Lembrete Agendamento de Veiculo Oficial para o dia ${displayDate}`;
      htmlContent = `
        <div style="font-family: sans-serif; padding: 20px; color: #1e293b; background-color: #f8fafc;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 24px; padding: 40px; border: 1px solid #e2e8f0;">
            <h2 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 15px;">Frota Regional - ${displayDate}</h2>
            ${aprovados.length > 0 ? `
              <div style="margin-top: 20px; padding: 15px; background: #ecfdf5; border-radius: 12px; border: 1px solid #a7f3d0;">
                <p style="font-size: 11px; font-weight: 800; color: #065f46; text-transform: uppercase;">✅ APROVADOS PARA AMANHÃ:</p>
                <ul style="margin: 10px 0 0 0;">${aprovados.map(n => `<li style="font-weight: bold; margin-bottom: 5px;">${n}</li>`).join('')}</ul>
              </div>` : ''}
            ${aguardando.length > 0 ? `
              <div style="margin-top: 20px; padding: 15px; background: #fffbeb; border-radius: 12px; border: 1px solid #fde68a;">
                <p style="font-size: 11px; font-weight: 800; color: #92400e; text-transform: uppercase;">⏳ AGUARDANDO APROVAÇÃO:</p>
                <ul style="margin: 10px 0 0 0;">${aguardando.map(n => `<li style="margin-bottom: 5px;">${n}</li>`).join('')}</ul>
              </div>` : ''}
            <div style="margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 20px; text-align: center;">
              <p style="font-size: 12px; color: #64748b;">Favor conferir os veículos e documentações no SEOM.</p>
              <p style="font-size: 10px; color: #94a3b8; font-weight: bold; margin-top: 10px;">SGE-GSU Intelligence II</p>
            </div>
          </div>
        </div>
      `;
    } 
    // --- LÓGICA 2: CAMINHÃO PIPA ---
    else if (normalizedType === 'WATER_TRUCK') {
      subject = `💧 SOLICITAÇÃO DE CAMINHÃO PIPA: ${schoolName}`;
      htmlContent = `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Checklist de Abastecimento Emergencial</h2>
          <p><strong>Unidade:</strong> ${schoolName}</p>
          <p><strong>Solicitante:</strong> ${userName}</p>
          <p><strong>Cód. Sabesp:</strong> ${data?.sabespCode || 'Não informado'}</p>
          <div style="background: #f1f5f9; padding: 15px; border-radius: 10px; margin-top: 20px;">
            <pre style="white-space: pre-wrap;">${data?.notes}</pre>
          </div>
        </div>
      `;
    }
    // --- LÓGICA 3: QUEDA DE ENERGIA ---
    else if (normalizedType === 'POWER_OUTAGE') {
      subject = `⚠️ NOTIFICAÇÃO: QUEDA DE ENERGIA - ${schoolName}`;
      htmlContent = `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Relato de Interrupção de Energia</h2>
          <p><strong>Unidade:</strong> ${schoolName}</p>
          <p><strong>Solicitante:</strong> ${userName}</p>
          <p><strong>Instalação EDP:</strong> ${data?.edpCode || 'Não informado'}</p>
          <div style="background: #fff1f2; padding: 15px; border-radius: 10px; margin-top: 20px; border: 1px solid #fecdd3;">
            <pre style="white-space: pre-wrap;">${data?.notes}</pre>
          </div>
        </div>
      `;
    }

    // DISPARO DO E-MAIL VIA RESEND (Utilizando o domínio gse.ia.br)
    console.log(`Enviando e-mail do tipo ${normalizedType} para gsu.seom@educacao.sp.gov.br...`);
    
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${RESEND_API_KEY}` 
      },
      body: JSON.stringify({
        from: 'SGE-GSU <notificacoes@gse.ia.br>',
        to: ['gsu.seom@educacao.sp.gov.br'],
        subject: subject,
        html: htmlContent,
      }),
    });

    const resData = await res.json();
    
    if (!res.ok) {
      throw new Error(`Falha no Resend: ${resData.message || JSON.stringify(resData)}`);
    }

    console.log("E-mail aceito pelo Resend com sucesso ID:", resData.id);

    return new Response(JSON.stringify({ success: true, id: resData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("Erro Fatal na Função:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
})