import { AlertTriangle } from 'lucide-react';

export function DefesoEleitoralBanner() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 items-start shadow-sm">
      <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
        <AlertTriangle size={18} className="text-amber-600" />
      </div>
      <div className="text-sm text-amber-800 leading-relaxed">
        <p>
          Em cumprimento ao disposto no art. 73, § 10, da Lei nº 9.504/1997 e na Resolução TSE nº 23.610,
          durante o Período de Defeso Eleitoral estão suspensos os seguintes processos patrimoniais:
        </p>
        <p className="font-semibold mt-2">📦 Doação de Material Permanente</p>
        <p className="font-semibold">♻️ Material Inservível</p>
        <p className="mt-2">Os processos em andamento terão continuidade após o encerramento do período eleitoral.</p>
      </div>
    </div>
  );
}
