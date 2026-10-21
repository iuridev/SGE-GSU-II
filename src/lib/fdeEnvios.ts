// Envios informados pela FDE: itens que a FDE vai mandar para cada escola.
// A planilha é mantida pela FDE/Regional; o ID fica só em variável de ambiente.
import { parseCSV } from './obrasSheet';

const SHEET_ID = import.meta.env.VITE_FDE_ENVIOS_SHEET_ID as string | undefined;

export const FDE_ENVIOS_CONFIGURADO = !!SHEET_ID;
export const FDE_ENVIOS_SHEET_URL = SHEET_ID ? `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit` : '';

export interface FdeEnvio {
  projeto: string;
  dataLimite: string | null; // ISO yyyy-mm-dd
  cie: string;               // sem zeros à esquerda
  escola: string;
  codigo: string;
  qtde: number;
  status: string;
}

// A planilha da FDE não tem id por linha: o envio é identificado por projeto +
// escola + código do item. É essa chave que fica gravada no item a incorporar
// (coluna fde_envio_chave) para ligar a nota fiscal ao envio.
export function chaveEnvioFde(e: Pick<FdeEnvio, 'projeto' | 'cie' | 'codigo'>): string {
  return `${e.projeto}|${e.cie}|${e.codigo}`;
}

export function descreverChaveEnvioFde(chave: string): string {
  const [projeto, , codigo] = (chave || '').split('|');
  return [projeto, codigo].filter(Boolean).join(' · ');
}

export function normalizarTexto(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

export function normalizarCie(s: string | null | undefined): string {
  return (s || '').replace(/\D/g, '').replace(/^0+/, '');
}

function dataBrParaIso(s: string): string | null {
  const m = (s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export async function carregarEnviosFde(): Promise<FdeEnvio[]> {
  if (!SHEET_ID) throw new Error('Variável VITE_FDE_ENVIOS_SHEET_ID não configurada.');
  // Endpoint gviz: devolve CORS liberado para leitura direto do navegador
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`);
  if (!res.ok) throw new Error(`Falha ao ler a planilha da FDE (HTTP ${res.status}).`);
  const linhas = parseCSV(await res.text());

  const idxCab = linhas.findIndex(l => l.some(c => normalizarTexto(c) === 'CIE'));
  if (idxCab < 0) throw new Error('Cabeçalho "CIE" não encontrado na planilha da FDE.');
  const cab = linhas[idxCab].map(normalizarTexto);
  const col = (...nomes: string[]) => cab.findIndex(c => nomes.some(n => c.startsWith(n)));
  const iProjeto = col('PROJETO');
  const iData = col('DATA LIMITE', 'DATA');
  const iCie = col('CIE');
  const iEscola = col('NOME DA ESCOLA', 'ESCOLA');
  const iCodigo = col('CODIGO');
  const iQtde = col('QTDE', 'QUANTIDADE');
  const iStatus = col('STATUS');

  const get = (l: string[], i: number) => (i >= 0 ? (l[i] || '').trim() : '');

  return linhas.slice(idxCab + 1)
    .filter(l => get(l, iCie) || get(l, iEscola))
    .map(l => ({
      projeto: normalizarTexto(get(l, iProjeto)),
      dataLimite: dataBrParaIso(get(l, iData)),
      cie: normalizarCie(get(l, iCie)),
      escola: get(l, iEscola),
      codigo: get(l, iCodigo).toUpperCase(),
      qtde: Number(get(l, iQtde).replace(/\./g, '').replace(',', '.')) || 0,
      status: normalizarTexto(get(l, iStatus)),
    }));
}
