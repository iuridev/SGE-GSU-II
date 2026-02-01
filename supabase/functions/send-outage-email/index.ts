// Usando a versão padrão do Deno para servidor HTTP
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  type?: string; // 'power_outage' | 'water_truck'
  schoolName: string;
  requesterName: string;
  timestamp: string;
  details: any;
  sabespId?: string; // Específico para caminhão pipa
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { type, schoolName, requesterName, timestamp, details, sabespId }: EmailRequest = await req.json();

    console.log(`[LOG] Recebendo solicitação de email tipo: ${type}`); 

    let subject = "";
    let htmlContent = "";

    // Lógica para diferenciar os tipos de solicitação
    if (type === 'water_truck') {
      // --- CASO 1: CAMINHÃO PIPA ---
      subject = `[URGENTE] Solicitação de Caminhão Pipa - ${schoolName}`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <h2 style="color: #2563eb;">Nova Solicitação de Abastecimento (Caminhão Pipa)</h2>
          <p><strong>Escola:</strong> ${schoolName}</p>
          <p><strong>Código SABESP:</strong> ${sabespId || "Não informado"}</p>
          <p><strong>Solicitante:</strong> ${requesterName}</p>
          <p><strong>Data/Hora:</strong> ${new Date(timestamp).toLocaleString("pt-BR")}</p>
          <hr style="border: 1px solid #eee;" />
          
          <h3 style="color: #444;">Detalhes da Solicitação:</h3>
          <ul style="list-style-type: none; padding: 0;">
            <li style="margin-bottom: 8px;">✅ <strong>Registro Fechado?</strong> ${details.registroFechado}</li>
            <li style="margin-bottom: 8px;">✅ <strong>Reservatório Vazio?</strong> ${details.reservatorioVazio}</li>
            <li style="margin-bottom: 8px;">✅ <strong>Possui Engate?</strong> ${details.engateAbastecimento}</li>
            <li style="margin-bottom: 8px;">📏 <strong>Distância Caminhão-Reservatório:</strong> ${details.distanciaCaminhao}</li>
            <li style="margin-bottom: 8px;">📏 <strong>Altura do Reservatório:</strong> ${details.alturaReservatorio}</li>
            <li style="margin-bottom: 8px;">💧 <strong>Capacidade:</strong> ${details.capacidadeReservatorio}</li>
            <li style="margin-bottom: 8px;">👷 <strong>Responsável no Local:</strong> ${details.nomeFuncionario}</li>
          </ul>
        </div>
      `;
    } else {
      // --- CASO 2: QUEDA DE ENERGIA (Padrão) ---
      // Se não vier type, assume power_outage para compatibilidade
      subject = `[ALERTA] Queda de Energia - ${schoolName}`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <h2 style="color: #dc2626;">Relato de Queda de Energia</h2>
          <p><strong>Escola:</strong> ${schoolName}</p>
          <p><strong>Solicitante:</strong> ${requesterName}</p>
          <p><strong>Data/Hora:</strong> ${new Date(timestamp).toLocaleString("pt-BR")}</p>
          <p><strong>Abrangência:</strong> ${details.scope === 'school' ? 'Apenas na Escola' : 'Toda a Região'}</p>
          <hr style="border: 1px solid #eee;" />
          
          <h3 style="color: #444;">Detalhes do Relato:</h3>
          <p style="background-color: #f8fafc; padding: 10px; border-left: 4px solid #dc2626;">
            "${details.description}"
          </p>
        </div>
      `;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "SGE-GSU <onboarding@resend.dev>", // Certifique-se que este remetente é válido no seu Resend
        to: ["gsu.seom@educacao.sp.gov.br"],
        subject: subject,
        html: htmlContent,
      }),
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});