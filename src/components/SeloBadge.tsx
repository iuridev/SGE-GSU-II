import type { CSSProperties } from 'react';
import {
  Award, Package, HardHat, Droplets, TreeDeciduous, ShieldCheck, Flame, Star,
  Trophy, ClipboardCheck, Sparkles, Building2, Medal, Crown, Gem, Heart, Leaf,
  Zap, BookOpen, GraduationCap, Wrench, Recycle, ThumbsUp, Target, Lightbulb,
  Rocket, Users, School, BadgeCheck, Sun, type LucideIcon,
} from 'lucide-react';

// Opções de aparência dos Selos de Excelência. As chaves são as gravadas nas
// colunas `icone`, `cor`, `formato` e `acabamento` da tabela `selos`.
export const SELO_ICONES: Record<string, { label: string; Icon: LucideIcon }> = {
  award: { label: 'Medalha', Icon: Award },
  medal: { label: 'Medalha com fita', Icon: Medal },
  trophy: { label: 'Troféu', Icon: Trophy },
  crown: { label: 'Coroa', Icon: Crown },
  star: { label: 'Estrela', Icon: Star },
  sparkles: { label: 'Brilho', Icon: Sparkles },
  gem: { label: 'Diamante', Icon: Gem },
  badgecheck: { label: 'Verificado', Icon: BadgeCheck },
  thumbsup: { label: 'Aprovado', Icon: ThumbsUp },
  target: { label: 'Meta', Icon: Target },
  rocket: { label: 'Foguete', Icon: Rocket },
  zap: { label: 'Energia', Icon: Zap },
  lightbulb: { label: 'Ideia', Icon: Lightbulb },
  heart: { label: 'Cuidado', Icon: Heart },
  users: { label: 'Equipe', Icon: Users },
  package: { label: 'Patrimônio', Icon: Package },
  hardhat: { label: 'Obras', Icon: HardHat },
  wrench: { label: 'Manutenção', Icon: Wrench },
  building: { label: 'Prédio', Icon: Building2 },
  school: { label: 'Escola', Icon: School },
  droplets: { label: 'Água', Icon: Droplets },
  tree: { label: 'Árvore', Icon: TreeDeciduous },
  leaf: { label: 'Sustentabilidade', Icon: Leaf },
  recycle: { label: 'Reciclagem', Icon: Recycle },
  sun: { label: 'Sol', Icon: Sun },
  shield: { label: 'Zeladoria', Icon: ShieldCheck },
  flame: { label: 'AVCB', Icon: Flame },
  clipboard: { label: 'Fiscalização', Icon: ClipboardCheck },
  book: { label: 'Documentação', Icon: BookOpen },
  graduation: { label: 'Formação', Icon: GraduationCap },
};

interface Paleta { label: string; gradiente: string; solido: string; borda: string; texto: string }

export const SELO_CORES: Record<string, Paleta> = {
  amber: { label: 'Dourado', gradiente: 'bg-gradient-to-br from-amber-300 to-amber-600', solido: 'bg-amber-500', borda: 'bg-amber-200', texto: 'text-amber-600' },
  yellow: { label: 'Amarelo', gradiente: 'bg-gradient-to-br from-yellow-300 to-yellow-500', solido: 'bg-yellow-400', borda: 'bg-yellow-200', texto: 'text-yellow-600' },
  orange: { label: 'Laranja', gradiente: 'bg-gradient-to-br from-orange-400 to-orange-600', solido: 'bg-orange-500', borda: 'bg-orange-200', texto: 'text-orange-600' },
  red: { label: 'Vermelho', gradiente: 'bg-gradient-to-br from-red-400 to-red-700', solido: 'bg-red-600', borda: 'bg-red-200', texto: 'text-red-600' },
  rose: { label: 'Rosa escuro', gradiente: 'bg-gradient-to-br from-rose-400 to-rose-600', solido: 'bg-rose-500', borda: 'bg-rose-200', texto: 'text-rose-600' },
  pink: { label: 'Rosa', gradiente: 'bg-gradient-to-br from-pink-400 to-pink-600', solido: 'bg-pink-500', borda: 'bg-pink-200', texto: 'text-pink-600' },
  violet: { label: 'Violeta', gradiente: 'bg-gradient-to-br from-violet-400 to-violet-700', solido: 'bg-violet-600', borda: 'bg-violet-200', texto: 'text-violet-600' },
  indigo: { label: 'Índigo', gradiente: 'bg-gradient-to-br from-indigo-400 to-indigo-700', solido: 'bg-indigo-600', borda: 'bg-indigo-200', texto: 'text-indigo-600' },
  blue: { label: 'Azul', gradiente: 'bg-gradient-to-br from-blue-400 to-blue-700', solido: 'bg-blue-600', borda: 'bg-blue-200', texto: 'text-blue-600' },
  sky: { label: 'Azul claro', gradiente: 'bg-gradient-to-br from-sky-300 to-sky-600', solido: 'bg-sky-500', borda: 'bg-sky-200', texto: 'text-sky-600' },
  teal: { label: 'Turquesa', gradiente: 'bg-gradient-to-br from-teal-400 to-teal-600', solido: 'bg-teal-500', borda: 'bg-teal-200', texto: 'text-teal-600' },
  emerald: { label: 'Verde', gradiente: 'bg-gradient-to-br from-emerald-400 to-emerald-700', solido: 'bg-emerald-600', borda: 'bg-emerald-200', texto: 'text-emerald-600' },
  lime: { label: 'Verde-limão', gradiente: 'bg-gradient-to-br from-lime-400 to-lime-600', solido: 'bg-lime-500', borda: 'bg-lime-200', texto: 'text-lime-600' },
  slate: { label: 'Prata', gradiente: 'bg-gradient-to-br from-slate-300 to-slate-500', solido: 'bg-slate-500', borda: 'bg-slate-200', texto: 'text-slate-600' },
  bronze: { label: 'Bronze', gradiente: 'bg-gradient-to-br from-orange-300 to-amber-800', solido: 'bg-amber-700', borda: 'bg-orange-200', texto: 'text-amber-800' },
  black: { label: 'Preto', gradiente: 'bg-gradient-to-br from-slate-600 to-slate-900', solido: 'bg-slate-800', borda: 'bg-slate-300', texto: 'text-slate-800' },
};

// Roseta: estrela de muitas pontas, alternando raio externo e interno.
function roseta(pontas: number, raioInterno: number): string {
  const pts: string[] = [];
  for (let i = 0; i < pontas * 2; i++) {
    const r = i % 2 === 0 ? 50 : raioInterno;
    const a = (Math.PI * i) / pontas - Math.PI / 2;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)}% ${(50 + r * Math.sin(a)).toFixed(2)}%`);
  }
  return `polygon(${pts.join(', ')})`;
}

// `escala` reduz o ícone nos formatos com menos área útil no centro.
export const SELO_FORMATOS: Record<string, { label: string; estilo: CSSProperties; escala: number }> = {
  circulo: { label: 'Círculo', estilo: { borderRadius: '50%' }, escala: 1 },
  quadrado: { label: 'Quadrado', estilo: { borderRadius: '24%' }, escala: 1 },
  escudo: { label: 'Escudo', estilo: { clipPath: 'polygon(50% 0%, 100% 14%, 100% 56%, 50% 100%, 0% 56%, 0% 14%)' }, escala: 0.85 },
  hexagono: { label: 'Hexágono', estilo: { clipPath: 'polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)' }, escala: 0.9 },
  losango: { label: 'Losango', estilo: { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }, escala: 0.7 },
  roseta: { label: 'Roseta', estilo: { clipPath: roseta(12, 42) }, escala: 0.85 },
  estrela: { label: 'Estrela', estilo: { clipPath: roseta(8, 36) }, escala: 0.75 },
};

export const SELO_ACABAMENTOS: Record<string, string> = {
  gradiente: 'Degradê',
  solido: 'Cor sólida',
  contorno: 'Contorno',
};

const TAMANHOS = {
  sm: { caixa: 36, icone: 16 },
  md: { caixa: 56, icone: 26 },
  lg: { caixa: 88, icone: 40 },
};

interface SeloBadgeProps {
  icone: string;
  cor: string;
  formato?: string | null;
  acabamento?: string | null;
  tamanho?: keyof typeof TAMANHOS;
  title?: string;
}

export function SeloBadge({ icone, cor, formato, acabamento, tamanho = 'md', title }: SeloBadgeProps) {
  const { Icon } = SELO_ICONES[icone] || SELO_ICONES.award;
  const paleta = SELO_CORES[cor] || SELO_CORES.amber;
  const forma = SELO_FORMATOS[formato || ''] || SELO_FORMATOS.circulo;
  const t = TAMANHOS[tamanho];
  const contorno = acabamento === 'contorno';

  // Duas camadas com o mesmo recorte: a de fora faz a moldura, a de dentro o
  // miolo. (ring/border do CSS não acompanham clip-path.)
  const moldura = contorno ? paleta.solido : paleta.borda;
  const miolo = contorno ? 'bg-white' : acabamento === 'solido' ? paleta.solido : paleta.gradiente;

  return (
    <div title={title} className="shrink-0 drop-shadow-sm" style={{ width: t.caixa, height: t.caixa }}>
      <div className={`relative w-full h-full ${moldura}`} style={forma.estilo}>
        <div
          className={`absolute inset-[7%] flex items-center justify-center ${miolo} ${contorno ? paleta.texto : 'text-white'}`}
          style={forma.estilo}
        >
          <Icon size={Math.round(t.icone * forma.escala)} strokeWidth={2.25} />
        </div>
      </div>
    </div>
  );
}
