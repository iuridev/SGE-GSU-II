import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Selo, SeloEscola } from '../lib/selosMetricas';
import { SeloBadge } from './SeloBadge';

// Selos de Excelência do ano corrente da escola logada, exibidos na barra do
// topo (só para school_manager). Clicar leva à galeria de selos.
export function SelosTopo({ userId, onAbrirGaleria }: { userId: string; onAbrirGaleria: () => void }) {
  const [selos, setSelos] = useState<Selo[]>([]);
  const ano = new Date().getFullYear();

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const { data: perfil } = await (supabase as any).from('profiles').select('school_id').eq('id', userId).single();
        if (!perfil?.school_id) return;
        const [concedidosRes, catalogoRes] = await Promise.all([
          (supabase as any).from('selos_escolas').select('selo_id').eq('school_id', perfil.school_id).eq('ano', ano),
          (supabase as any).from('selos').select('*').eq('ativo', true).order('ordem'),
        ]);
        const ids = new Set(((concedidosRes.data || []) as Pick<SeloEscola, 'selo_id'>[]).map(c => c.selo_id));
        if (ativo) setSelos(((catalogoRes.data || []) as Selo[]).filter(s => ids.has(s.id)));
      } catch (err) {
        console.error('Erro ao carregar selos da escola:', err);
      }
    })();
    return () => { ativo = false; };
  }, [userId, ano]);

  if (selos.length === 0) return null;

  return (
    <button
      onClick={onAbrirGaleria}
      title="Ver galeria de Selos de Excelência"
      className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-all"
    >
      {selos.map(s => (
        <SeloBadge key={s.id} icone={s.icone} cor={s.cor} formato={s.formato} acabamento={s.acabamento} tamanho="sm" title={`Selo ${s.nome} ${ano}`} />
      ))}
    </button>
  );
}
