// supabase/functions/send-outage-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const handler = async (request: Request): Promise<Response> => {
  // Configuração de CORS (Para seu frontend poder chamar a função)
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }})
  }

  try {
    const { schoolName, userName, scope, description } = await request.json()

    // Validação básica
    if (!schoolName || !description) {
      throw new Error("Dados incompletos para envio.");
    }

    // Chamada para o Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'SGE-GSU <alerta@gse.ia.br>', // Use este e-mail do dominio
        to: ['gsu.seom@educacao.sp.gov.br'], // Troque pelo SEU e-mail para testar
        subject: `[URGENTE] Queda de Energia - ${schoolName}`,
        html: `
          <h1>Notificação de Falta de Energia</h1>
          <p><strong>Unidade:</strong> ${schoolName}</p>
          <p><strong>Solicitante:</strong> ${userName}</p>
          <hr />
          <h3>Detalhes da Triagem</h3>
          <ul>
            <li><strong>Abrangência:</strong> ${scope === 'school' ? 'Local (Apenas Escola)' : 'Regional (Bairro)'}</li>
            <li><strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR')}</li>
          </ul>
          <h3>Relato:</h3>
          <blockquote style="background: #f9f9f9; padding: 10px; border-left: 4px solid orange;">
            ${description}
          </blockquote>
        `,
      }),
    })

    const data = await res.json()

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 200,
    })
  } catch (error) {
    // CORREÇÃO AQUI: Usamos 'String(error)' ou '(error as Error).message'
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 500,
    })
  }
}

serve(handler)