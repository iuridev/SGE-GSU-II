import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';
import { Users, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface TrackedPerson {
  id: number;
  x: number;
  y: number;
  hasCrossed: boolean;
  missedFrames: number;
}

export default function Fluxo() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [count, setCount] = useState(0);
  const [isError, setIsError] = useState(false);

  // Referências para variáveis mutáveis que não devem causar re-renderização
  const tracksRef = useRef<TrackedPerson[]>([]);
  const nextIdRef = useRef(1);
  const countRef = useRef(0);
  
  // Referência para acumular as passagens que ainda não foram guardadas na base de dados
  const pendingSavesRef = useRef(0);

  // Busca a contagem inicial de hoje ao abrir a página
  const carregarContagemDoDia = useCallback(async () => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // Utilizamos (supabase as any) para contornar temporariamente a falta de tipagem
    const { count: total, error } = await (supabase as any)
      .from('fluxo_registros')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', hoje.toISOString());

    if (!error && total !== null) {
      countRef.current = total;
      setCount(total);
    }
  }, []);

  // EFEITO DE BATCHING: Guarda na base de dados a cada 5 segundos se houver novas passagens
  useEffect(() => {
    const intervalId = setInterval(async () => {
      if (pendingSavesRef.current > 0) {
        // Captura a quantidade atual e zera a referência imediatamente para não perder novas passagens
        const quantidadeParaGuardar = pendingSavesRef.current;
        pendingSavesRef.current = 0;

        // Cria um array com objetos vazios equivalente ao número de pessoas que passaram
        const registos = Array(quantidadeParaGuardar).fill({});

        const { error } = await (supabase as any)
          .from('fluxo_registros')
          .insert(registos);

        if (error) {
          console.error(`Erro ao guardar lote de ${quantidadeParaGuardar} registos:`, error);
          // Opcional: devolver as contagens perdidas para a fila em caso de erro
          // pendingSavesRef.current += quantidadeParaGuardar;
        } else {
          console.log(`Lote de ${quantidadeParaGuardar} passagens guardado com sucesso no Supabase.`);
        }
      }
    }, 5000); // Executa a cada 5000ms (5 segundos)

    // Limpa o intervalo quando o componente for desmontado (fechar a página)
    return () => clearInterval(intervalId);
  }, []);

  const runCoco = useCallback(async () => {
    try {
      await carregarContagemDoDia();
      await tf.ready();
      const net = await cocossd.load();
      setIsLoading(false);
      
      setInterval(() => {
        detect(net);
      }, 100); 
    } catch (err) {
      console.error("Erro ao carregar o modelo de IA:", err);
      setIsError(true);
      setIsLoading(false);
    }
  }, [carregarContagemDoDia]);

  const detect = async (net: cocossd.ObjectDetection) => {
    if (
      typeof webcamRef.current !== "undefined" &&
      webcamRef.current !== null &&
      webcamRef.current.video?.readyState === 4
    ) {
      const video = webcamRef.current.video;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      if (canvasRef.current) {
        canvasRef.current.width = videoWidth;
        canvasRef.current.height = videoHeight;
      }

      const predictions = await net.detect(video);
      const people = predictions.filter(p => p.class === 'person');
      
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, videoWidth, videoHeight);

      // Desenha a linha virtual de contagem no meio do ecrã
      const lineY = videoHeight / 2;
      ctx.beginPath();
      ctx.moveTo(0, lineY);
      ctx.lineTo(videoWidth, lineY);
      ctx.strokeStyle = "#ef4444"; 
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      const currentCentroids = people.map(person => {
        const [x, y, width, height] = person.bbox;
        const cx = x + width / 2;
        const cy = y + height / 2;
        
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#3b82f6';
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#10b981';
        ctx.fill();

        return { cx, cy };
      });

      const maxDistance = 100;
      let newTracks: TrackedPerson[] = [];

      currentCentroids.forEach(centroid => {
        let matchedTrack: TrackedPerson | any = null;
        let minDistance = Infinity;

        tracksRef.current.forEach(track => {
          const dist = Math.sqrt(Math.pow(centroid.cx - track.x, 2) + Math.pow(centroid.cy - track.y, 2));
          if (dist < minDistance && dist < maxDistance) {
            minDistance = dist;
            matchedTrack = track;
          }
        });

        if (matchedTrack) {
          let justCrossed = false;
          
          // Verifica se o centroide cruzou a linha Y
          if ((matchedTrack.y < lineY && centroid.cy >= lineY) || 
              (matchedTrack.y > lineY && centroid.cy <= lineY)) {
            
            if (!matchedTrack.hasCrossed) {
              countRef.current += 1;
              setCount(countRef.current);
              justCrossed = true;
              
              // ADICIONA À FILA em vez de guardar imediatamente
              pendingSavesRef.current += 1;
            }
          }

          newTracks.push({
            id: matchedTrack.id,
            x: centroid.cx,
            y: centroid.cy,
            hasCrossed: matchedTrack.hasCrossed || justCrossed,
            missedFrames: 0
          });

          // Mostra o ID rastreado em cima da pessoa
          ctx.fillStyle = '#ffffff';
          ctx.font = '16px Arial';
          ctx.fillText(`ID: ${matchedTrack.id}`, centroid.cx + 10, centroid.cy - 10);
        } else {
          // Atribui ID para uma pessoa nova no ecrã
          const newId = nextIdRef.current++;
          newTracks.push({
            id: newId,
            x: centroid.cx,
            y: centroid.cy,
            hasCrossed: false,
            missedFrames: 0
          });
        }
      });

      tracksRef.current = newTracks;
    }
  };

  useEffect(() => {
    runCoco();
  }, [runCoco]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Controlo de Fluxo</h1>
          <p className="text-slate-500 mt-2">Monitorização de entrada e saída por Inteligência Artificial</p>
        </div>
        
        <div className="bg-blue-50 border border-blue-200 px-6 py-4 rounded-xl flex items-center space-x-4 shadow-sm">
          <div className="bg-blue-500 p-3 rounded-lg">
            <Users className="w-8 h-8 text-white" />
          </div>
          <div>
            <p className="text-sm text-blue-600 font-semibold uppercase tracking-wider">Passagens Hoje</p>
            <p className="text-4xl font-bold text-blue-900">{count}</p>
          </div>
        </div>
      </div>

      {isError && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center shadow-sm">
          <AlertCircle className="w-6 h-6 mr-3 flex-shrink-0" />
          <p>Erro ao carregar o modelo de IA. Verifique a sua ligação à internet ou as permissões da câmara.</p>
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="relative w-full max-w-3xl mx-auto bg-slate-900 rounded-xl overflow-hidden shadow-inner aspect-video flex items-center justify-center">
          
          {isLoading && (
            <div className="absolute inset-0 z-10 bg-slate-900/80 flex flex-col items-center justify-center text-white">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
              <p className="font-medium animate-pulse">A carregar Modelo de Visão Computacional...</p>
              <p className="text-sm text-slate-400 mt-2">Isto pode demorar alguns segundos na primeira vez</p>
            </div>
          )}

          <Webcam
            ref={webcamRef}
            muted={true} 
            className="absolute top-0 left-0 w-full h-full object-cover"
          />
          
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full object-cover z-0"
          />
          
        </div>
        
        <div className="mt-6 flex gap-4 text-sm text-slate-600 justify-center">
          <div className="flex items-center"><span className="w-3 h-3 bg-blue-500 rounded-full inline-block mr-2"></span> Deteção</div>
          <div className="flex items-center"><span className="w-3 h-3 bg-red-500 rounded-full inline-block mr-2"></span> Linha de Contagem</div>
          <div className="flex items-center"><span className="w-3 h-3 bg-emerald-500 rounded-full inline-block mr-2"></span> Centroide</div>
        </div>
      </div>
    </div>
  );
}