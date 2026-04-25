import Papa from 'papaparse';

export interface ConsumoData {
  codigo_predio: string;
  nome_escola: string;
  mes_ano: string;
  agua_qtde_m3: number;
  agua_valor: number;
  energia_qtde_kwh: number;
  energia_valor: number;
}

const parseMoedaBR = (valor: any): number => {
  if (!valor) return 0;
  const limpo = valor.toString().replace(/[^\d,-]/g, '').replace(',', '.');
  return parseFloat(limpo) || 0;
};

export const parseConsumoCSV = (file: File): Promise<ConsumoData[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as any[][];
        const registros: ConsumoData[] = [];
        
        let escolaAtual = "";
        let codigoAtual = "";
        
        // 1. Detecta o tipo de arquivo olhando as primeiras 20 linhas
        let isSomenteEnergia = false;
        for(let i = 0; i < Math.min(20, rows.length); i++) {
           const textoLinha = rows[i].join('').toLowerCase();
           if(textoLinha.includes('água') && textoLinha.includes('energia')) {
               isSomenteEnergia = false;
               break;
           } else if (textoLinha.includes('energia') && !textoLinha.includes('água')) {
               isSomenteEnergia = true;
               break;
           }
        }

        rows.forEach((row, index) => {
          // Tenta achar a linha do código
          const indexCodigo = row.findIndex(cell => 
            cell && cell.toString().toLowerCase().trim().includes('código')
          );
          
          if (indexCodigo !== -1) {
            // Pega o código (se existir no arquivo)
            codigoAtual = row[indexCodigo + 1] ? row[indexCodigo + 1].toString().replace(/[^\d]/g, '') : "";
            
            // Pega o nome (linhas acima)
            const nome1 = rows[index - 1]?.[0]?.toString().trim();
            const nome2 = rows[index - 2]?.[0]?.toString().trim();
            escolaAtual = nome1 && nome1.length > 3 ? nome1 : (nome2 || "Escola não identificada");
          }

          const primeiraCelula = row[0] ? row[0].toString().trim() : '';
          const mesAnoRegex = /^\d{2}\/\d{4}/;
          
          if (primeiraCelula && mesAnoRegex.test(primeiraCelula)) {
            const mesAnoLimpo = primeiraCelula.substring(0, 7);

            if (isSomenteEnergia) {
                // Formato Novo (Só Energia)
                registros.push({
                  codigo_predio: codigoAtual,
                  nome_escola: escolaAtual,
                  mes_ano: mesAnoLimpo,
                  agua_qtde_m3: 0,
                  agua_valor: 0,
                  energia_qtde_kwh: parseMoedaBR(row[1]),
                  energia_valor: parseMoedaBR(row[2])
                });
            } else {
                // Formato Antigo (Água e Luz)
                registros.push({
                  codigo_predio: codigoAtual,
                  nome_escola: escolaAtual,
                  mes_ano: mesAnoLimpo,
                  agua_qtde_m3: parseMoedaBR(row[1]),
                  agua_valor: parseMoedaBR(row[2]),
                  energia_qtde_kwh: parseMoedaBR(row[4]),
                  energia_valor: parseMoedaBR(row[5])
                });
            }
          }
        });
        resolve(registros);
      },
      error: (err) => reject(err)
    });
  });
};