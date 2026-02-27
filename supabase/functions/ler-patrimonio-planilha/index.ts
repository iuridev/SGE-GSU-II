import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { GoogleSpreadsheet } from "npm:google-spreadsheet@4.1.1"
// @ts-ignore
import { JWT } from "npm:google-auth-library@9.6.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    const key = Deno.env.get('GOOGLE_PRIVATE_KEY');

    if (!email || !key) throw new Error("Chaves ausentes no Supabase.");

    const serviceAccountAuth = new JWT({
      email: email,
      key: key.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet('12y3vNtkcw34T6t1mafdFvuBG--vDZM4dDXlaQ5dvvRE', serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    // --- A SOLUÇÃO ESTÁ AQUI ---
    // Pega o número exato de linhas que a planilha possui (neste caso, 841)
    const totalLinhas = sheet.rowCount;
    
    // Carrega as células apenas até onde a planilha realmente existe
    await sheet.loadCells(`A1:E${totalLinhas}`);

    const itensReais = [];

    // O laço de repetição vai parar exatamente no tamanho da planilha, evitando o erro
    for (let i = 1; i < totalLinhas; i++) {
      const idCell = sheet.getCell(i, 0).value;
      
      if (idCell !== null && idCell !== undefined && idCell !== "") {
        const idStr = idCell.toString();
        
        if (idStr.includes('GSU-')) {
          itensReais.push({
            id: idStr,
            descricao: sheet.getCell(i, 1).value?.toString() || '-',
            escola: sheet.getCell(i, 2).value?.toString() || '-',
            nf: sheet.getCell(i, 3).value?.toString() || '-',
            valor: sheet.getCell(i, 4).value?.toString() || '0'
          });
        }
      }
    }

    return new Response(JSON.stringify({ sucesso: true, itens: itensReais }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("🔥 ERRO NA LEITURA:", error);
    return new Response(JSON.stringify({ erroReal: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, 
    });
  }
})