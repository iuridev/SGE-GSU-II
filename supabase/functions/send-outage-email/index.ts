import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { getCorsHeaders } from '../_shared/cors.ts'

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  // Trata requisições de pre-flight do CORS
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Secrets do Supabase não configurados.")
    }

    // Valida que o chamador é um usuário autenticado
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autorizado.')

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('Token inválido ou expirado.')

    const escapeHtml = (v: unknown): string => {
      if (v === null || v === undefined) return ''
      return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const body = await req.json()
    const { type, schoolName, data, userName } = body
    const normalizedType = type?.toUpperCase()

    let subject = ""
    let htmlContent = ""
    let recipients = ['gsu.seom@educacao.sp.gov.br', 'gsu.sefisc@educacao.sp.gov.br'] // Destinatário padrão

    const now = new Date();
    // Ajuste manual: Londres (UTC) para Brasília (-3h) e soma 24h para amanhã
    const tomorrow = new Date(now.getTime() - (3 * 3600000) + (24 * 3600000));
    const year = tomorrow.getUTCFullYear();
    const month = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getUTCDate()).padStart(2, '0');
    const tomorrowStr = `${year}-${month}-${day}`; 
    const displayDate = `${day}/${month}/${year}`;

    // --- LÓGICA 1: AGENDAMENTO AUTOMÁTICO DE CARROS ---
    if (normalizedType === 'CAR_SCHEDULE_AUTO') {
      const { data: schedules } = await supabase.from('car_schedules').select('*').eq('service_date', tomorrowStr);
      
      if (!schedules || schedules.length === 0) {
        return new Response(JSON.stringify({ success: true, message: `Sem carros para ${displayDate}.` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      const aprovados = schedules.filter(s => s.status?.toUpperCase().includes('APROVADO') || s.status?.toUpperCase() === 'OK').map(s => s.requester_name);
      const aguardando = schedules.filter(s => !s.status?.toUpperCase().includes('APROVADO') && s.status?.toUpperCase() !== 'OK').map(s => s.requester_name);

      subject = `🚗 FROTA: Agendamentos para ${displayDate}`;
      htmlContent = `<div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
        <h2>Frota Regional - ${displayDate}</h2>
        ${aprovados.length > 0 ? `<div style="padding: 15px; background: #ecfdf5; border-radius: 10px; border: 1px solid #a7f3d0; margin-bottom: 10px;"><p><b>✅ APROVADOS:</b></p><ul>${aprovados.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>` : ''}
        ${aguardando.length > 0 ? `<div style="padding: 15px; background: #fffbeb; border-radius: 10px; border: 1px solid #fde68a;"><p><b>⏳ AGUARDANDO:</b></p><ul>${aguardando.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>` : ''}
      </div>`;
    } 

    // --- LÓGICA 2: AGENDAMENTO AUTOMÁTICO DE AMBIENTES (DESATIVADO) ---
    else if (normalizedType === 'ROOM_SCHEDULE_AUTO') {
      return new Response(JSON.stringify({ success: true, message: 'E-mail de ambientes desativado.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      recipients = ['gsu.seom@educacao.sp.gov.br', 'gsu.sefisc@educacao.sp.gov.br'];
      
      // Busca reservas onde amanhã está entre a data de início e a data de fim
      const { data: rooms, error: roomError } = await supabase
        .from('room_schedules')
        .select('*')
        .lte('start_date', tomorrowStr)
        .gte('end_date', tomorrowStr);

      if (roomError) throw new Error(`Erro no banco: ${roomError.message}`);

      if (!rooms || rooms.length === 0) {
        return new Response(JSON.stringify({ success: true, message: `Sem ambientes reservados para ${displayDate}.` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      const ativos = rooms.filter(r => r.status?.toUpperCase().includes('APROVADO') || r.status?.toUpperCase() === 'SIM');

      if (ativos.length === 0) {
        return new Response(JSON.stringify({ success: true, message: `Existem reservas para ${displayDate}, mas nenhuma aprovada ainda.` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      subject = `🏢 AMBIENTES: Reservas para ${displayDate}`;
      htmlContent = `
        <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
          <h2 style="color: #4f46e5;">Ocupação de Ambientes - ${displayDate}</h2>
          <p style="font-size: 14px; color: #64748b;">Segue a lista de ambientes reservados na Regional para amanhã:</p>
          <div style="margin-top: 20px;">
            ${ativos.map(r => `
              <div style="padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 10px; background: #f8fafc;">
                <p style="margin: 0; font-size: 11px; font-weight: 800; color: #6366f1; text-transform: uppercase;">LOCAL: ${escapeHtml(r.room_name)}</p>
                <p style="margin: 5px 0 0; font-size: 16px; font-weight: 900; color: #1e293b;">${escapeHtml(r.start_time)} às ${escapeHtml(r.end_time)}</p>
                <p style="margin: 5px 0 0; font-size: 10px; color: #94a3b8;">Período: ${escapeHtml(r.start_date.split('-').reverse().join('/'))} até ${escapeHtml(r.end_date.split('-').reverse().join('/'))}</p>
              </div>
            `).join('')}
          </div>
          <p style="margin-top: 30px; font-size: 10px; color: #94a3b8; text-align: center;">SGE-GSU INTELLIGENCE II</p>
        </div>
      `;
    }

    // --- FALLBACK PARA ALERTAS (PIPA/ENERGIA) ---
    else if (normalizedType === 'WATER_TRUCK' || normalizedType === 'POWER_OUTAGE') {
      subject = normalizedType === 'WATER_TRUCK' ? `💧 PIPA: ${schoolName}` : `⚠️ ENERGIA: ${schoolName}`;
      htmlContent = `<div style="font-family: sans-serif; padding: 20px;"><h3>Solicitante: ${escapeHtml(userName)}</h3><pre>${escapeHtml(data?.notes)}</pre></div>`;
    }

    // DISPARO
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'SGE-GSU <notificacoes@gse.ia.br>',
        to: recipients,
        subject: subject,
        html: htmlContent,
      }),
    });

    const resData = await res.json();
    if (!res.ok) throw new Error(`Erro Resend: ${resData.message}`);

    return new Response(JSON.stringify({ success: true, id: resData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
  }
})