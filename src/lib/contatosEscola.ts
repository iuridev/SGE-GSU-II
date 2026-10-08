import { supabase } from './supabase';

// Contatos da escola (tabela `school_contacts`), alimentados pelos modais
// emergenciais de Caminhão Pipa e Falta de Energia.

export interface ContatoEscola {
  id: string;
  school_id: string;
  nome: string;
  cargo: string;
  telefone: string; // só dígitos
  origem: 'WATER_TRUCK' | 'POWER_OUTAGE' | 'MANUAL';
  usos: number;
  ultimo_uso: string;
  created_at: string;
}

export interface ContatoSolicitante {
  nome: string;
  cargo: string;
  telefone: string; // formatado ou não; normalizado ao gravar
}

export const CONTATO_VAZIO: ContatoSolicitante = { nome: '', cargo: '', telefone: '' };

export function somenteDigitos(v: string): string {
  return (v || '').replace(/\D/g, '');
}

// (11) 98765-4321 / (11) 3456-7890 — aceita digitação parcial.
export function formatarTelefone(v: string): string {
  const d = somenteDigitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function telefoneValido(v: string): boolean {
  const n = somenteDigitos(v).length;
  return n === 10 || n === 11;
}

// Retorna a mensagem de erro, ou null se o contato estiver completo.
export function validarContato(c: ContatoSolicitante): string | null {
  if (!c.nome.trim()) return 'Informe o nome do solicitante.';
  if (!c.cargo.trim()) return 'Informe o cargo/função do solicitante.';
  if (!telefoneValido(c.telefone)) return 'Informe um telefone válido com DDD.';
  return null;
}

export function contatoParaTexto(c: ContatoSolicitante): string {
  return `Contato do solicitante: ${c.nome.trim()} — ${c.cargo.trim()} — ${formatarTelefone(c.telefone)}`;
}

export async function listarContatosEscola(schoolId: string): Promise<ContatoEscola[]> {
  const { data, error } = await (supabase as any)
    .from('school_contacts')
    .select('*')
    .eq('school_id', schoolId)
    .order('ultimo_uso', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Grava o contato na escola; se já existir (mesmo nome + telefone) só
// atualiza cargo/último uso — a deduplicação é feita no banco.
export async function registrarContatoEscola(
  schoolId: string,
  c: ContatoSolicitante,
  origem: ContatoEscola['origem'],
): Promise<void> {
  const { error } = await (supabase as any).rpc('registrar_contato_escola', {
    p_school_id: schoolId,
    p_nome: c.nome,
    p_cargo: c.cargo,
    p_telefone: somenteDigitos(c.telefone),
    p_origem: origem,
  });
  if (error) throw error;
}
