import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // 1. Tratamento de CORS (Para o navegador não bloquear)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 2. Verifica se a chave existe
    if (!RESEND_API_KEY) {
      throw new Error("A chave RESEND_API_KEY não foi encontrada.");
    }

    // 3. Pega os dados enviados pelo site
    const { schoolName, userName, scope, description } = await req.json();

    console.log(`Tentando enviar e-mail para: ${schoolName}`);

    // 4. Envia para o Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        // IMPORTANTE: Aqui define quem manda e quem recebe
        from: "SGE-GSU <alerta@gse.ia.br>", 
        
        // ▼▼▼ É AQUI QUE VOCÊ COLOCA O E-MAIL DE DESTINO ▼▼▼
        to: ["gsu.seom@educacao.sp.gov.br"], 
        // ▲▲▲ CONFIRA SE ESTÁ CERTO ▲▲▲

        subject: `[URGENTE] Queda de Energia - ${schoolName}`,
        html: `
          <h1>Alerta de Queda de Energia</h1>
          <p><strong>Escola:</strong> ${schoolName}</p>
          <p><strong>Solicitante:</strong> ${userName}</p>
          <p><strong>Abrangência:</strong> ${scope === "school" ? "Local (Escola)" : "Regional"}</p>
          <p><strong>Relato:</strong> ${description}</p>
          <hr />
          <p><em>Este é um e-mail automático do sistema SGE-GSU.</em></p>
        `,
      }),
    });

    const data = await res.json();

    // 5. Verifica se o Resend aceitou
    if (!res.ok) {
      console.error("Erro do Resend:", data);
      return new Response(JSON.stringify({ error: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // 6. Sucesso Total
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("Erro interno:", error.message);
    return new Response(JSON.stringify({ error: error.message || "Erro desconhecido" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});