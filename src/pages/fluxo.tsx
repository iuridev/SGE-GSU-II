import { useRef, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import Webcam from 'react-webcam';
import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';
import { Users, AlertCircle, Loader2, LogIn, LogOut, UserCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Side = 'left' | 'right';

interface TrackedPerson {
  id: number;
  x: number;
  y: number;
  bbox: number[];
  framesTracked: number;
  missedFrames: number;
  lastSide: Side | null;
}

// Color histogram (16 bins × R/G/B = 48 values) used to identify unique persons by appearance
type AppearanceSignature = number[];

const BINS = 16;
const SIMILARITY_THRESHOLD = 0.65; // above this = same person seen before

function histogramSimilarity(h1: AppearanceSignature, h2: AppearanceSignature): number {
  let s = 0;
  for (let i = 0; i < h1.length; i++) s += Math.min(h1[i], h2[i]);
  return s;
}

function StatCard({
  icon, bg, bg2, border, label, value, textColor, labelColor,
}: {
  icon: ReactNode;
  bg: string; bg2: string; border: string;
  label: string; value: number;
  textColor: string; labelColor: string;
}) {
  return (
    <div className={`${bg2} border ${border} px-5 py-4 rounded-xl flex items-center space-x-3 shadow-sm`}>
      <div className={`${bg} p-2.5 rounded-lg`}>{icon}</div>
      <div>
        <p className={`text-xs ${labelColor} font-semibold uppercase tracking-wider`}>{label}</p>
        <p className={`text-3xl font-bold ${textColor}`}>{value}</p>
      </div>
    </div>
  );
}

export default function Fluxo() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [entries, setEntries] = useState(0);
  const [exits, setExits] = useState(0);
  const [unique, setUnique] = useState(0);
  const [lineRatio, setLineRatio] = useState(0.5);

  const tracksRef = useRef<TrackedPerson[]>([]);
  const nextIdRef = useRef(1);
  const entriesRef = useRef(0);
  const exitsRef = useRef(0);
  const uniqueRef = useRef(0);
  const lineRatioRef = useRef(0.5);
  const isDetectingRef = useRef(false);
  const signaturesRef = useRef<AppearanceSignature[]>([]);

  const pendingInserts = useRef<Array<{ tipo: string; pessoa_nova: boolean }>>([]);

  // Capture color histogram of detected person from the live video frame
  const extractSignature = useCallback((bbox: number[]): AppearanceSignature => {
    const video = webcamRef.current?.video;
    if (!video) return [];

    if (!tempCanvasRef.current) {
      tempCanvasRef.current = document.createElement('canvas');
    }
    const tc = tempCanvasRef.current;
    tc.width = video.videoWidth;
    tc.height = video.videoHeight;
    const tctx = tc.getContext('2d');
    if (!tctx) return [];

    tctx.drawImage(video, 0, 0);

    const [bx, by, bw, bh] = bbox;
    const px = Math.max(0, Math.round(bx));
    const py = Math.max(0, Math.round(by));
    const pw = Math.min(Math.round(bw), video.videoWidth - px);
    const ph = Math.min(Math.round(bh), video.videoHeight - py);
    if (pw <= 0 || ph <= 0) return [];

    const { data } = tctx.getImageData(px, py, pw, ph);
    const hist = new Array(BINS * 3).fill(0);
    let count = 0;

    // Sample every 8th pixel for performance
    for (let i = 0; i < data.length; i += 32) {
      hist[Math.floor(data[i] * BINS / 256)]++;
      hist[BINS + Math.floor(data[i + 1] * BINS / 256)]++;
      hist[BINS * 2 + Math.floor(data[i + 2] * BINS / 256)]++;
      count++;
    }

    if (count > 0) {
      for (let i = 0; i < hist.length; i++) hist[i] /= count;
    }
    return hist;
  }, []);

  // Returns true if this appearance has NOT been seen today
  const isNewPerson = useCallback((sig: AppearanceSignature): boolean => {
    if (sig.length === 0) return true;
    return signaturesRef.current.every(stored => histogramSimilarity(sig, stored) < SIMILARITY_THRESHOLD);
  }, []);

  const carregarContagemDoDia = useCallback(async () => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const { data, error } = await (supabase as any)
      .from('fluxo_registros')
      .select('tipo, pessoa_nova')
      .gte('created_at', hoje.toISOString());

    if (!error && data) {
      const ent = (data as any[]).filter(r => r.tipo === 'entrada').length;
      const sai = (data as any[]).filter(r => r.tipo === 'saida').length;
      const uniq = (data as any[]).filter(r => r.pessoa_nova === true).length;
      entriesRef.current = ent;
      exitsRef.current = sai;
      uniqueRef.current = uniq;
      setEntries(ent);
      setExits(sai);
      setUnique(uniq);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(async () => {
      if (pendingInserts.current.length === 0) return;
      const toInsert = [...pendingInserts.current];
      pendingInserts.current = [];
      const { error } = await (supabase as any).from('fluxo_registros').insert(toInsert);
      if (error) {
        console.error('Erro ao guardar:', error);
        pendingInserts.current.unshift(...toInsert);
      }
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const detect = useCallback((net: cocossd.ObjectDetection) => {
    if (isDetectingRef.current) return;
    const video = webcamRef.current?.video;
    if (!video || video.readyState !== 4) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    canvas.width = videoWidth;
    canvas.height = videoHeight;

    const lineX = videoWidth * lineRatioRef.current;

    isDetectingRef.current = true;
    net.detect(video).then(predictions => {
      isDetectingRef.current = false;
      const people = predictions.filter(p => p.class === 'person');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, videoWidth, videoHeight);

      // Draw vertical counting line
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lineX, 0);
      ctx.lineTo(lineX, videoHeight);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 7]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 13px Arial';
      // Left side label (saída)
      ctx.save();
      ctx.translate(lineX - 14, videoHeight / 2 + 40);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('◄ SAÍDA', 0, 0);
      ctx.restore();
      // Right side label (entrada)
      ctx.save();
      ctx.translate(lineX + 14, videoHeight / 2 - 10);
      ctx.rotate(Math.PI / 2);
      ctx.fillText('◄ ENTRADA', 0, 0);
      ctx.restore();
      ctx.restore();

      const currentCentroids = people.map(p => {
        const [x, y, w, h] = p.bbox;
        return { cx: x + w / 2, cy: y + h / 2, bbox: p.bbox };
      });

      const maxDist = 150;
      const newTracks: TrackedPerson[] = [];
      const matchedIds = new Set<number>();

      currentCentroids.forEach(({ cx, cy, bbox }) => {
        const matched = tracksRef.current.reduce<TrackedPerson | null>((best, track) => {
          const d = Math.hypot(cx - track.x, cy - track.y);
          if (d >= maxDist) return best;
          if (!best) return track;
          return d < Math.hypot(cx - best.x, cy - best.y) ? track : best;
        }, null);

        const currentSide: Side = cx < lineX ? 'left' : 'right';

        // Bounding box
        const [bx, by, bw, bh] = bbox;
        ctx.beginPath();
        ctx.rect(bx, by, bw, bh);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#3b82f6';
        ctx.stroke();

        if (matched) {
          matchedIds.add(matched.id);
          const prevSide = matched.lastSide;
          matched.x = cx;
          matched.y = cy;
          matched.bbox = bbox;
          matched.framesTracked += 1;
          matched.missedFrames = 0;
          matched.lastSide = currentSide;

          // Detect crossing (min 3 frames of tracking to avoid ghost counts)
          if (prevSide && prevSide !== currentSide && matched.framesTracked >= 3) {
            const sig = extractSignature(matched.bbox);
            const novaPessoa = isNewPerson(sig);

            if (novaPessoa && sig.length > 0) {
              signaturesRef.current.push(sig);
              uniqueRef.current += 1;
              setUnique(uniqueRef.current);
            }

            // right → left = entrada, left → right = saída
            if (prevSide === 'right' && currentSide === 'left') {
              entriesRef.current += 1;
              setEntries(entriesRef.current);
              pendingInserts.current.push({ tipo: 'entrada', pessoa_nova: novaPessoa });
            } else {
              exitsRef.current += 1;
              setExits(exitsRef.current);
              pendingInserts.current.push({ tipo: 'saida', pessoa_nova: novaPessoa });
            }
          }

          newTracks.push(matched);

          ctx.fillStyle = '#3b82f6';
          ctx.font = 'bold 13px Arial';
          ctx.fillText(`#${matched.id}`, cx + 8, cy - 8);
        } else {
          newTracks.push({
            id: nextIdRef.current++,
            x: cx,
            y: cy,
            bbox,
            framesTracked: 1,
            missedFrames: 0,
            lastSide: currentSide,
          });
        }
      });

      // Keep recently-lost tracks in memory (1.5 s grace window)
      tracksRef.current.forEach(track => {
        if (!matchedIds.has(track.id)) {
          track.missedFrames += 1;
          if (track.missedFrames < 15) newTracks.push(track);
        }
      });

      tracksRef.current = newTracks;
    }).catch(() => { isDetectingRef.current = false; });
  }, [extractSignature, isNewPerson]);

  const runCoco = useCallback(async () => {
    try {
      await carregarContagemDoDia();
      await tf.ready();
      const net = await cocossd.load();
      setIsLoading(false);
      setInterval(() => detect(net), 100);
    } catch (err) {
      console.error('Erro ao carregar modelo:', err);
      setIsError(true);
      setIsLoading(false);
    }
  }, [carregarContagemDoDia, detect]);

  useEffect(() => { runCoco(); }, [runCoco]);

  const handleLineChange = (value: number) => {
    lineRatioRef.current = value / 100;
    setLineRatio(value / 100);
  };

  const inside = Math.max(0, entries - exits);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Controlo de Fluxo</h1>
          <p className="text-slate-500 mt-1">Detecção de entrada e saída por linha virtual</p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <StatCard
            icon={<LogIn className="w-6 h-6 text-white" />}
            bg="bg-emerald-500" bg2="bg-emerald-50" border="border-emerald-200"
            label="Entradas" value={entries}
            textColor="text-emerald-900" labelColor="text-emerald-600"
          />
          <StatCard
            icon={<LogOut className="w-6 h-6 text-white" />}
            bg="bg-red-500" bg2="bg-red-50" border="border-red-200"
            label="Saídas" value={exits}
            textColor="text-red-900" labelColor="text-red-600"
          />
          <StatCard
            icon={<Users className="w-6 h-6 text-white" />}
            bg="bg-blue-500" bg2="bg-blue-50" border="border-blue-200"
            label="No Prédio" value={inside}
            textColor="text-blue-900" labelColor="text-blue-600"
          />
          <StatCard
            icon={<UserCheck className="w-6 h-6 text-white" />}
            bg="bg-violet-500" bg2="bg-violet-50" border="border-violet-200"
            label="Pessoas Únicas" value={unique}
            textColor="text-violet-900" labelColor="text-violet-600"
          />
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center">
          <AlertCircle className="w-6 h-6 mr-3 flex-shrink-0" />
          <p>Erro ao carregar o modelo de IA. Verifique a ligação à internet e as permissões da câmara.</p>
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="relative w-full max-w-3xl mx-auto bg-slate-900 rounded-xl overflow-hidden shadow-inner aspect-video">
          {isLoading && (
            <div className="absolute inset-0 z-10 bg-slate-900/80 flex flex-col items-center justify-center text-white">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
              <p className="font-medium animate-pulse">A inicializar detecção...</p>
            </div>
          )}
          <Webcam ref={webcamRef} muted className="absolute inset-0 w-full h-full object-cover" />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover z-0" />
        </div>

        <div className="mt-5 max-w-3xl mx-auto space-y-1">
          <label className="text-sm font-medium text-slate-700 flex justify-between">
            <span>Posição da linha de contagem</span>
            <span className="text-amber-600 font-semibold">{Math.round(lineRatio * 100)}%</span>
          </label>
          <input
            type="range"
            min={10}
            max={90}
            value={Math.round(lineRatio * 100)}
            onChange={e => handleLineChange(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
          <p className="text-xs text-slate-500">
            Cruzar da direita para a esquerda = <span className="text-emerald-600 font-medium">entrada</span> · da esquerda para a direita = <span className="text-red-600 font-medium">saída</span>.
            Pessoas únicas são identificadas pela aparência (cor de roupa) e resetadas à meia-noite.
          </p>
        </div>
      </div>
    </div>
  );
}
