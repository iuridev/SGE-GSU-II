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
    const { descricao, escola, nf, valor, quantidade } = await req.json();

    const email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    const key = Deno.env.get('GOOGLE_PRIVATE_KEY');

    const serviceAccountAuth = new JWT({
      email: email,
      key: key?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet('12y3vNtkcw34T6t1mafdFvuBG--vDZM4dDXlaQ5dvvRE', serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    // Pega o limite real da sua planilha (ex: 1000 linhas) para não dar erro
    const limiteLinhas = sheet.rowCount;
    await sheet.loadCells(`A1:E${limiteLinhas}`); 

    let ultimaLinhaOcupada = 0;
    let maiorGsu = 0;

    for (let i = 0; i < limiteLinhas; i++) {
      const val = sheet.getCell(i, 0).value;
      if (val !== null && val !== undefined && val !== "") {
        ultimaLinhaOcupada = i;
        const strVal = val.toString();
        if (strVal.includes('GSU-')) {
          const num = parseInt(strVal.split('-')[1]);
          if (!isNaN(num)) maiorGsu = Math.max(maiorGsu, num);
        }
      }
    }

    const proximaLinhaLivre = ultimaLinhaOcupada + 1;

    for (let j = 0; j < quantidade; j++) {
      const linhaAtual = proximaLinhaLivre + j;
      const novoId = `GSU-${maiorGsu + 1 + j}`;

      sheet.getCell(linhaAtual, 0).value = novoId;       
      sheet.getCell(linhaAtual, 1).value = descricao;    
      sheet.getCell(linhaAtual, 2).value = escola;       
      sheet.getCell(linhaAtual, 3).value = nf;          
      sheet.getCell(linhaAtual, 4).value = valor;       
    }

    await sheet.saveUpdatedCells();

    return new Response(JSON.stringify({ sucesso: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("🔥 ERRO:", error);
    // Alteramos para status 200 para o React não bloquear a leitura do erro
    return new Response(JSON.stringify({ erroReal: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, 
    });
  }
})