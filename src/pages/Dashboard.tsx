import { useState, useEffect, useRef, useMemo } from 'react'; // Importa os hooks fundamentais do React para gerir estado, ciclo de vida e referências
import { supabase } from '../lib/supabase'; // Importa a ligação configurada à base de dados Supabase
import { // Início do bloco de importação de ícones da biblioteca lucide-react
  Building2, Droplets, Zap, ShieldCheck, AlertTriangle, ArrowRight, // Ícones usados para os cartões de estatísticas e ações de emergência
  Calendar, CheckCircle2, Waves, ZapOff, History, ChevronRight, // Ícones para dados informativos, consumo, histórico e navegação
  ArrowRightLeft, Map as MapIcon, Loader2, Info, X // Ícones para remanejamento, mapa, loading e agora Info e X para o banner de ajuda
} from 'lucide-react'; // Fim do bloco de importação da lucide-react
import { WaterTruckModal } from '../components/WaterTruckModal'; // Importa o componente modal para pedir um Camião Cisterna
import { PowerOutageModal } from '../components/PowerOutageModal'; // Importa o componente modal para reportar Falha de Energia

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; // Constante com o link da folha de estilos do mapa Leaflet
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; // Constante com o link do script do motor do mapa Leaflet

const PERIOD_OPTIONS = ['Manhã', 'Tarde', 'Noite', 'Integral 9h', 'Integral 7h']; // Array que define os turnos escolares para os filtros do mapa

interface Stats { // Define a estrutura de dados esperada para os indicadores numéricos (tipagem TypeScript)
  schools: number; // Quantidade de escolas
  activeZeladorias: number; // Quantidade de zeladorias que estão ativas
  waterAlerts: number; // Número de alertas relacionados com água
  activeWorks: number; // Número de obras em curso
  avgConsumption: number; // Valor da média de consumo de água
  exceededDays: number; // Dias em que o limite de água estipulado foi ultrapassado
  waterTruckRequests: number; // Total de chamados para camião pipa/cisterna
  powerOutageRecords: number; // Total de registos de quebra de energia elétrica
  inventoryItems: number; // Quantidade de materiais disponíveis no banco de remanejamento
  pendingFiscalizations?: number; // Propriedade opcional para fiscalizações que faltam concluir
} // Fim da interface Stats

interface MapSchool { // Define a estrutura de dados para cada ponto (escola) que vai aparecer no mapa
  id: string; // Identificador único da escola na base de dados
  name: string; // Nome oficial da unidade escolar
  latitude: number | null; // Coordenada geográfica (latitude), permitindo ser nula se não existir
  longitude: number | null; // Coordenada geográfica (longitude), permitindo ser nula se não existir
  periods: string[] | null; // Lista de períodos em que a escola funciona
  address: string | null; // Morada completa da escola
  has_elevator: boolean; // Verdadeiro ou falso consoante a existência de elevador (acessibilidade)
} // Fim da interface MapSchool

export function Dashboard() { // Declaração do componente funcional Dashboard, exportado para ser usado no Router
  const [stats, setStats] = useState<Stats>({ // Inicializa o estado das estatísticas do painel com zeros
    schools: 0, activeZeladorias: 0, waterAlerts: 0, activeWorks: 0, // Zera contagens de infraestrutura
    avgConsumption: 0, exceededDays: 0, waterTruckRequests: 0, powerOutageRecords: 0, // Zera contagens de consumo e ocorrências
    inventoryItems: 0 // Zera contagem de remanejamento
  }); // Fim da inicialização do estado stats
  
  const [mapSchools, setMapSchools] = useState<MapSchool[]>([]); // Estado que armazena todas as escolas devolvidas pela base de dados para o mapa
  const [loading, setLoading] = useState(true); // Estado que controla se a página ainda está a carregar dados (mostra os skeletons se true)
  const [userRole, setUserRole] = useState<string>(''); // Guarda o nível de acesso do utilizador (ex: supervisor, dirigente)
  const [userName, setUserName] = useState(''); // Guarda o nome completo do utilizador autenticado
  const [schoolName, setSchoolName] = useState(''); // Guarda o nome da escola caso o utilizador seja diretor/gestor de uma unidade
  const [sabespCode, setSabespCode] = useState(''); // Guarda o código da conta de água (Sabesp) da unidade
  const [edpCode, setEdpCode] = useState(''); // Guarda o código da instalação elétrica (EDP) da unidade
  const [schoolId, setSchoolId] = useState<string | null>(null); // Guarda o ID da escola do utilizador, sendo nulo se ele for da equipa regional
  
  const [supervisorSchoolsList, setSupervisorSchoolsList] = useState<{id: string, name: string}[]>([]); // Estado para listar as escolas atribuídas a um supervisor específico
  const [selectedSupervisorSchool, setSelectedSupervisorSchool] = useState<string>('all'); // Controla qual a escola que o supervisor escolheu no filtro (ou 'all' para todas)
  const [supervisorSchoolIds, setSupervisorSchoolIds] = useState<string[]>([]); // Array apenas com os IDs das escolas do supervisor para facilitar queries

  const [isWaterTruckModalOpen, setIsWaterTruckModalOpen] = useState(false); // Estado para mostrar ou ocultar o formulário de pedir Camião Cisterna
  const [isPowerOutageModalOpen, setIsPowerOutageModalOpen] = useState(false); // Estado para mostrar ou ocultar o formulário de Falha de Energia
  
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(true); // NOVO: Estado que controla a visibilidade do banner explicativo inicial

  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(PERIOD_OPTIONS); // Estado do filtro do mapa: inicia com todos os períodos selecionados
  const [filterOnlyElevator, setFilterOnlyElevator] = useState(false); // Estado do filtro do mapa: inicia como falso (mostra escolas com e sem elevador)

  const mapContainerRef = useRef<HTMLDivElement>(null); // Cria uma referência direta à div no HTML onde o Leaflet vai injetar o mapa interativo
  const mapInstanceRef = useRef<any>(null); // Guarda a instância do mapa Leaflet para podermos interagir com ele mais tarde (sem causar re-renders)
  const markersLayerRef = useRef<any>(null); // Guarda a camada específica onde desenhamos os "pins" para podermos apagá-los e redesenhá-los facilmente
  const [leafletLoaded, setLeafletLoaded] = useState(false); // Estado que avisa o React quando os scripts externos do mapa terminaram de descarregar

  useEffect(() => { // Hook que executa código assim que o Dashboard é aberto no ecrã
    loadLeaflet(); // Inicia o download silencioso do código do mapa
    initDashboard(); // Começa a ir buscar quem é o utilizador e os números das estatísticas

    return () => { // Esta função é chamada quando o utilizador sai da página do Dashboard (desmontagem)
      if (mapInstanceRef.current) { // Se o mapa estava aberto na memória
        mapInstanceRef.current.remove(); // Destrói o mapa para o browser não ficar lento com lixo na memória
        mapInstanceRef.current = null; // Limpa a variável
      } // Fim da verificação de segurança
    }; // Fim do cleanup
  }, []); // Os colchetes vazios indicam que isto só acontece 1 vez (no início)

  const filteredMapSchools = useMemo(() => { // Cria uma lista derivada das escolas que só é recalculada quando os filtros mudam (performance)
    let filtered = mapSchools; // Começa por pegar em todas as escolas
    
    if (selectedPeriods.length > 0) { // Verifica se há pelo menos um turno clicado nos botões
      filtered = filtered.filter(school => // Se sim, filtra a lista
        school.periods?.some(p => selectedPeriods.includes(p)) // Mantém apenas escolas cujo array de turnos tenha interceção com os turnos selecionados
      ); // Fim do filtro de turnos
    } else { // Se o utilizador desmarcou todos os turnos
      return []; // Devolve a lista vazia (o mapa fica sem pins)
    } // Fim do bloco if-else de turnos
    
    if (filterOnlyElevator) { // Verifica se o botão escuro "Com Elevador" está ativado
      filtered = filtered.filter(school => school.has_elevator); // Deita fora as escolas que têm o has_elevator a false
    } // Fim da verificação de elevador

    return filtered; // Devolve a lista já mastigada para o Leaflet desenhar
  }, [mapSchools, selectedPeriods, filterOnlyElevator]); // Refaz esta matemática sempre que uma destas 3 variáveis for alterada

  useEffect(() => { // Hook responsável por criar o retângulo cinzento do mapa pela primeira vez
    if (leafletLoaded && mapSchools.length > 0 && mapContainerRef.current && !mapInstanceRef.current) { // Garante que tem a biblioteca, tem dados, tem a div e que ainda não o criou
      const L = (window as any).L; // Pega no objeto global L (do Leaflet inserido no HTML)
      const firstSchoolWithCoords = mapSchools.find(s => s.latitude && s.longitude) || mapSchools[0]; // Procura a primeira escola que não tenha coordenadas a null para centralizar a câmara
      const center: [number, number] = [firstSchoolWithCoords.latitude || -23.5505, firstSchoolWithCoords.longitude || -46.6333]; // Define as coordenadas centrais (padrão São Paulo se falhar)

      const map = L.map(mapContainerRef.current, { // Manda o Leaflet construir o mapa dentro da nossa div ref
        center: center, // Diz-lhe para olhar para o centro calculado
        zoom: 12, // Define a proximidade (12 é bom para ver bairros de uma cidade)
        scrollWheelZoom: false // Bloqueia o zoom da roda do rato para a página não "encravar" quando o utilizador faz scroll para baixo
      }); // Fim das opções do mapa

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { // Vai buscar os quadradinhos de imagem das ruas ao OpenStreetMap gratuito
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' // Adiciona o texto obrigatório de direitos de autor no canto inferior
      }).addTo(map); // Cola a camada visual no mapa

      markersLayerRef.current = L.layerGroup().addTo(map); // Cria uma camada transparente só para espetar os alfinetes (pins) e cola-a no mapa
      mapInstanceRef.current = map; // Salva a instância criada para não a perdermos
    } // Fim da verificação de criação
  }, [leafletLoaded, mapSchools]); // Executa quando o mapa descarrega ou as escolas chegam da base de dados

  useEffect(() => { // Hook que toma conta exclusivamente de atualizar os pins
    if (mapInstanceRef.current && markersLayerRef.current) { // Se o chão do mapa e a película de pins já existirem
      renderMarkers(); // Manda desenhar os pins de acordo com as escolas filtradas no momento
    } // Fim if
  }, [filteredMapSchools, leafletLoaded]); // Reage cada vez que as escolas filtradas mudam (ex: clicar no botão Manhã)

  function loadLeaflet() { // Função clássica para injetar scripts em React sem usar npm install (evita conflitos de tipos)
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) { // Procura no topo do site se já existe a tag do CSS
      const link = document.createElement('link'); // Cria uma tag vazia <link>
      link.rel = 'stylesheet'; // Diz que é de estilos
      link.href = LEAFLET_CSS; // Coloca o endereço do Leaflet
      document.head.appendChild(link); // Insere no <head> da página
    } // Fim injeção CSS

    if (!document.querySelector(`script[src="${LEAFLET_JS}"]`)) { // Procura se o javascript já lá está
      const script = document.createElement('script'); // Cria a tag <script>
      script.src = LEAFLET_JS; // Aponta para o servidor CDN
      script.async = true; // Não bloqueia o resto do site enquanto faz o download
      script.onload = () => setLeafletLoaded(true); // Quando o ficheiro acabar de transferir, muda o estado para avisar o React
      document.head.appendChild(script); // Insere no <head>
    } else if ((window as any).L) { // No caso de o utilizador sair e voltar à página, o L já estará lá
      setLeafletLoaded(true); // Força o estado a verdadeiro para não ficar preso no ecrã de "A carregar"
    } // Fim injeção JS
  } // Fim da função

  async function initDashboard() { // Função cérebro que vai orquestrar a ida à base de dados para buscar os dados vitais
    setLoading(true); // Liga o efeito visual de "a carregar" em todo o lado
    try { // Try previne que o site vá abaixo se a internet cair
      const { data: { user } } = await supabase.auth.getUser(); // Pergunta ao Supabase quem é que está com login feito neste PC
      if (!user) return; // Se for um fantasma (não há utilizador), sai da função imediatamente
      
      const { data: profile } = await (supabase as any).from('profiles').select('full_name, role, school_id, supervisor_schools').eq('id', user.id).single(); // Puxa os dados profissionais do utilizador na tabela profiles usando o seu ID
      
      if (profile) { // Verifica se o perfil existe de facto
        setUserRole(profile.role); // Regista no componente o cargo da pessoa (ex: regional_admin)
        setUserName(profile.full_name || 'Gestor'); // Guarda o nome. Se não tiver nome, chama-lhe Gestor
        setSchoolId(profile.school_id); // Associa o ID da escola ao estado local
        
        if (profile.role === 'supervisor') { // Lógica específica se ele for supervisor (vê várias escolas, mas não todas)
           const supSchools = profile.supervisor_schools || []; // Puxa o array de escolas que lhe pertencem
           setSupervisorSchoolIds(supSchools); // Guarda esse array no estado

           if (supSchools.length > 0) { // Se ele tiver de facto escolas atribuídas
             const { data: sSchools } = await (supabase as any) // Pede à base de dados
               .from('schools') // da tabela de escolas
               .select('id, name') // Apenas o ID e o Nome
               .in('id', supSchools) // Onde os IDs batem certo com as escolas deste supervisor
               .order('name'); // E traz por ordem alfabética
             setSupervisorSchoolsList(sSchools || []); // Guarda a listagem para montar a combo box (select)
           } // Fim if
           await fetchStats('supervisor', null, supSchools); // Chama a função que traz números e gráficos, passando as escolas dele
        } else if (profile.school_id) { // Se não for supervisor, mas tiver uma escola associada (diretor/agente)
          const { data: school } = await (supabase as any).from('schools').select('name, sabesp_supply_id, edp_installation_id').eq('id', profile.school_id).single(); // Traz detalhes administrativos da escola dele
          if (school) { // Se encontrou
            setSchoolName(school.name); // Guarda o nome da escola para o crachá
            setSabespCode(school.sabesp_supply_id || 'N/A'); // Guarda a conta de água
            setEdpCode(school.edp_installation_id || 'N/A'); // Guarda o contrato de luz
          } // Fim if
          await fetchStats(profile.role, profile.school_id); // Traz as estatísticas apenas para a escola dele
        } else { // Se não tiver escola nenhuma associada (é o Dirigente ou o Regional)
          await fetchStats(profile.role, null); // Traz as estatísticas da rede inteira (tudo)
        } // Fim condicionais de cargo
        
        await fetchMapData(); // Por fim, vai buscar o pacotão de coordenadas e moradas para atirar para o mapa
      } // Fim if profile
    } catch (error) { console.error(error); } finally { setLoading(false); } // Se algo correr mal, escreve na consola, mas no fim desliga sempre a animação de "carregar"
  } // Fim da função inicializadora

  function handleSupervisorFilterChange(value: string) { // Despoletada quando o supervisor muda o "select" na barra de cima
    setSelectedSupervisorSchool(value); // Diz ao React que ele escolheu uma nova escola
    setSchoolId(value === 'all' ? null : value); // Se escolheu "Todas", põe o ID a nulo. Senão põe o ID da escola
    setLoading(true); // Liga o esqueleto de carregamento
    const idsToFetch = value === 'all' ? supervisorSchoolIds : [value]; // Define se manda pedir dados de uma ou da lista toda
    fetchStats('supervisor', null, idsToFetch).finally(() => setLoading(false)); // Pede novos números à base de dados e apaga o loading
  } // Fim handler filtro supervisor

  async function fetchMapData() { // Tarefa de ir buscar as coordenadas
    try { // Protege contra erros
      const { data } = await (supabase as any) // Pede ao Supabase
        .from('schools') // tabela de escolas
        .select('id, name, latitude, longitude, periods, address, has_elevator') // Traz só a gordura necessária para montar as janelinhas do mapa
        .not('latitude', 'is', null) // Impede que o servidor envie lixo (escolas sem coordenada de latitude)
        .not('longitude', 'is', null); // Impede que envie escolas sem longitude (evita rebentar com o Leaflet)
      
      setMapSchools(data || []); // Salva no estado as escolas limpas
    } catch (error) { // Se a net cair
      console.error("Erro ao procurar dados do mapa:", error); // Chora na consola
    } // Fim bloco protegido
  } // Fim fetch map data

  async function fetchStats(role: string, sId: string | null, supervisorIds: string[] = []) { // A função mais pesada: vai buscar os 5 números vitais do painel
    const firstDayMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(); // Calcula matematicamente quando começou este mês e formata para a base de dados
    const firstDayYear = new Date(new Date().getFullYear(), 0, 1).toISOString(); // Calcula matematicamente quando começou o ano atual
    
    try { // Abre escudo contra falhas
      const { count: ic } = await (supabase as any).from('inventory_items').select('*', { count: 'exact', head: true }).eq('status', 'DISPONÍVEL'); // Conta quantas cadeiras/mesas há para doar (Remanejamento) - rápido e exato

      let pendingFisc = 0; // Variável que guardará as fiscalizações
      if (role === 'regional_admin' || role === 'dirigente') { // Se é o manda-chuva
        const { data: submissions } = await (supabase as any).from('monitoring_submissions').select('is_completed'); // Traz estado das rondas
        pendingFisc = (submissions || []).filter((s: any) => !s.is_completed).length; // Conta só as que não estão acabadas
      } else if (role === 'supervisor' && supervisorIds.length > 0) { // Se é o supervisor intermédio
        const { data: submissions } = await (supabase as any).from('monitoring_submissions').select('is_completed').in('school_id', supervisorIds); // Traz só das escolas dele
        pendingFisc = (submissions || []).filter((s: any) => !s.is_completed).length; // Conta pendentes
      } else if (sId) { // Se é só uma escola
        const { data: submissions } = await (supabase as any).from('monitoring_submissions').select('is_completed').eq('school_id', sId); // Traz a dessa escola
        pendingFisc = (submissions || []).filter((s: any) => !s.is_completed).length; // Conta
      } // Fim matemática fiscalizações

      if (role === 'regional_admin' || role === 'dirigente') { // Matemática Global
        const { count: sc } = await (supabase as any).from('schools').select('*', { count: 'exact', head: true }); // Total de Escolas do sistema
        const { count: zc } = await (supabase as any).from('zeladorias').select('*', { count: 'exact', head: true }).not('ocupada', 'in', '("NÃO POSSUI", "NÃO HABITÁVEL")'); // Conta zeladorias deduzindo as estragadas ou inexistentes
        const { data: globalCons } = await (supabase as any).from('consumo_agua').select('consumption_diff').gte('date', firstDayMonth); // Puxa todos os leitores de água lidos desde o dia 1 deste mês
        const logsGlobal = globalCons || []; // Previne erros de null
        const globalAvg = logsGlobal.length > 0 ? logsGlobal.reduce((acc: number, curr: any) => acc + (curr.consumption_diff || 0), 0) / logsGlobal.length : 0; // Faz a soma de tudo e divide pelo número de leituras (Média de consumo)
        
        const { data: occsGlobal } = await (supabase as any).from('occurrences').select('type').gte('created_at', firstDayYear); // Traz todos os alertas batidos este ano
        const wtGlobal = (occsGlobal || []).filter((o: any) => o.type === 'WATER_TRUCK').length; // Separa os que são de falta de água (WATER_TRUCK)
        const poGlobal = (occsGlobal || []).filter((o: any) => o.type === 'POWER_OUTAGE').length; // Separa os que são falha na luz (POWER_OUTAGE)

        setStats(prev => ({ // Atualiza a variável gigante
          ...prev, // Preserva o que estava bom
          schools: sc || 0, activeZeladorias: zc || 0, avgConsumption: globalAvg, // Substitui as métricas principais
          waterTruckRequests: wtGlobal, powerOutageRecords: poGlobal, inventoryItems: ic || 0, // Substitui ocorrências
          pendingFiscalizations: pendingFisc // Atualiza as rondas
        })); // Fim do setState
      } else if (role === 'supervisor') { // Matemática de Bloco (Supervisor)
        if (supervisorIds.length === 0) return; // Se não tem escolas na lista dele, aborta para não dar erro no ".in"
        
        const { data: cons } = await (supabase as any).from('consumo_agua').select('consumption_diff, limit_exceeded').in('school_id', supervisorIds).gte('date', firstDayMonth); // Água só do bloco dele
        const logs = cons || []; // Previne
        const avg = logs.length > 0 ? logs.reduce((acc: number, curr: any) => acc + (curr.consumption_diff || 0), 0) / logs.length : 0; // Média de água das escolas dele
        const exc = logs.filter((l: any) => l.limit_exceeded).length; // Vê quantos dias ultrapassaram a meta estipulada no sistema SGE
        
        const { data: occs } = await (supabase as any).from('occurrences').select('type').in('school_id', supervisorIds).gte('created_at', firstDayYear); // Ocorrências só do bloco
        const wt = (occs || []).filter((o: any) => o.type === 'WATER_TRUCK').length; // Filtra água
        const po = (occs || []).filter((o: any) => o.type === 'POWER_OUTAGE').length; // Filtra luz
        
        setStats(prev => ({ // Dispara o update
          ...prev, // Mantém
          avgConsumption: avg, exceededDays: exc, waterTruckRequests: wt, powerOutageRecords: po, inventoryItems: ic || 0, // Escreve valores
          pendingFiscalizations: pendingFisc // Escreve fiscalizações
        })); // Fim set
      } else if (sId) { // Matemática Simples (Uma só escola)
        const { data: cons } = await (supabase as any).from('consumo_agua').select('consumption_diff, limit_exceeded').eq('school_id', sId).gte('date', firstDayMonth); // Filtra só para este ID da escola
        const logs = cons || []; // Null check
        const avg = logs.length > 0 ? logs.reduce((acc: number, curr: any) => acc + (curr.consumption_diff || 0), 0) / logs.length : 0; // Média exata
        const exc = logs.filter((l: any) => l.limit_exceeded).length; // Contabiliza infrações no limite de água
        
        const { data: occs } = await (supabase as any).from('occurrences').select('type').eq('school_id', sId).gte('created_at', firstDayYear); // Vai buscar pedidos de emergência
        const wt = (occs || []).filter((o: any) => o.type === 'WATER_TRUCK').length; // Água
        const po = (occs || []).filter((o: any) => o.type === 'POWER_OUTAGE').length; // Energia
        
        setStats(prev => ({ // Aplica o novo estado à view
          ...prev, // Espalha
          avgConsumption: avg, exceededDays: exc, waterTruckRequests: wt, powerOutageRecords: po, inventoryItems: ic || 0, // Subscreve
          pendingFiscalizations: pendingFisc // Subscreve
        })); // Fim setState
      } // Fim arvore if
    } catch (error) { console.error(error); } // Proteção final do catch
  } // Fim da requisição de estatísticas

  function renderMarkers() { // Função artesanal que coloca as cores e os balõezinhos do mapa
    const L = (window as any).L; // Importa o Leaflet
    if (!L || !markersLayerRef.current) return; // Se a internet estiver lenta e o mapa não existir, sai para não crashar

    markersLayerRef.current.clearLayers(); // Dá reset ao ecrã transparente: apaga todos os pins antigos

    filteredMapSchools.forEach(school => { // Entra num loop sobre todas as escolas que devem aparecer
      if (school.latitude && school.longitude) { // Garante mais uma vez que as coordenadas existem
        let color = '#f97316'; // Define laranja esteticamente apelativo por norma
        if (school.periods?.includes('Integral 9h')) color = '#10b981'; // Se tiver ensino Integral longo, muda a cor do pin para verde
        else if (school.periods?.includes('Integral 7h')) color = '#3b82f6'; // Se for ensino integral curto, pinta o pin de azul

        const isSquare = school.has_elevator; // Flag booleana: se tiver elevador, muda o aspeto do pin
        const borderRadius = isSquare ? '8px' : '50%'; // O formato: Quadrado com bordas suaves (8px) vs Bola perfeita (50%)
        const rotation = isSquare ? 'rotate(45deg)' : 'rotate(0deg)'; // Se for quadrado, rola-o para parecer um losango/diamante no mapa
        const size = isSquare ? '22px' : '26px'; // Ajusta os pixeis ligeiramente para o losango não parecer gigante em relação à bola

        const icon = L.divIcon({ // Pede ao Leaflet para desenhar uma div de HTML em vez da tradicional imagem .png azul do Google Maps
          className: 'custom-div-icon', // Dá-lhe uma classe vazia só para limpar os estilos por defeito
          html: `<div style="background-color: ${color}; width: ${size}; height: ${size}; border-radius: ${borderRadius}; border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.25); transform: ${rotation}; transition: all 0.3s ease;"></div>`, // Aqui vai o código CSS puro e inline que desenha a bola ou losango com sombra de vidro
          iconSize: [26, 26], // Afirma o tamanho base
          iconAnchor: [13, 13] // Diz qual é o pixel exato do desenho que deve tocar na coordenada real do mapa (o centro dele)
        }); // Fecha a configuração do ícone

        const popupContent = ` 
          <div style="font-family: 'Inter', sans-serif; padding: 6px; min-width: 220px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
              <h4 style="margin: 0; font-weight: 800; text-transform: uppercase; font-size: 13px; color: #0f172a; line-height: 1.3;">${school.name}</h4>
              ${school.has_elevator ? '<div title="Possui Elevador" style="color: #4f46e5; background: #e0e7ff; padding: 5px; border-radius: 8px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="m3 21 4-4"/><path d="m21 21-4-4"/></svg></div>' : ''}
            </div>
            <p style="margin: 0 0 14px 0; font-size: 11px; color: #64748b; font-weight: 500; line-height: 1.4;">${school.address || 'Sem morada registada'}</p>
            
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
              ${(school.periods || []).map(p => `<span style="background: #f1f5f9; color: #334155; padding: 4px 10px; border-radius: 8px; font-size: 9px; font-weight: 700; text-transform: uppercase; border: 1px solid #e2e8f0;">${p}</span>`).join('')}
              ${school.has_elevator ? '<span style="background: #4f46e5; color: white; padding: 4px 10px; border-radius: 8px; font-size: 9px; font-weight: 700; text-transform: uppercase;">Elevador OK</span>' : ''}
            </div>

            <a href="https://www.google.com/maps/dir/?api=1&destination=$$${school.latitude},${school.longitude}" 
               target="_blank" 
               style="display: flex; align-items: center; justify-content: center; background: #4f46e5; color: white; text-align: center; padding: 12px; border-radius: 12px; text-decoration: none; font-size: 11px; font-weight: 700; text-transform: uppercase; transition: background 0.2s; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.25);">
               Abrir Direções GPS
            </a>
          </div>
        `; // Cria uma string HTML gigantesca que contém o design modernizado (Tailwind-like) da janela de informação que abre ao clicar no pin. Mostra nome, badges de horário e botão para redirecionar para o Google Maps

        L.marker([school.latitude, school.longitude], { icon }) // Cria o objeto "pino" no local exato e cola-lhe a nossa arte vetorial
          .addTo(markersLayerRef.current) // Espeta-o literalmente na camada transparente
          .bindPopup(popupContent, { // Liga o evento de clique para abrir o HTML gigante que fizemos acima
            className: 'modern-map-popup', // Opcional, permite customizar o triângulo que o Leaflet põe na fala
            maxWidth: 280 // Impede que o balão cresça muito com nomes de escolas longos
          }); // Fim da montagem do pin unitário
      } // Fim verificação de segurança de coordenadas
    }); // Fim do loop forEach (agora o mapa tá cheio de pontos coloridos)
  } // Fim de renderMarkers

  const togglePeriodFilter = (period: string) => { // Ação de quando o utilizador clica num dos botões coloridos de filtro (ex: Tarde)
    setSelectedPeriods(prev => // Recebe o array atual
      prev.includes(period) // Vê se o filtro já estava "pressionado" ou ativo
        ? prev.filter(p => p !== period) // Se estava, retira-o de lá (o botão perde a cor no ecrã)
        : [...prev, period] // Se não estava, junta o turno ao array existente (botão ganha cor e o mapa re-renderiza)
    ); // Acaba a injeção do set
  }; // Fim da ação

  const getTimeGreeting = () => { // Ferramenta simples para saber se digo "Bom dia" ou "Boa noite"
    const hour = new Date().getHours(); // Vê em que hora a máquina corre
    if (hour < 12) return 'Bom dia'; // Antes do meio-dia
    if (hour < 18) return 'Boa tarde'; // Entre o almoço e as 18h
    return 'Boa noite'; // Depois de anoitecer
  }; // Fim da ferramenta

  return ( // Ponto de retorno onde o TSX se converte em HTML na página
    <div className="space-y-8 pb-10 max-w-7xl mx-auto"> 
      {/* Container mestre: espaça os elementos verticais 2rem entre eles, dá padding em baixo e restringe a largura a 7xl centrando o ecrã em monitores muito grandes */}
      
      {/* --- CABEÇALHO (Header Section) --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6"> 
        {/* Caixa fléxivel: Põe as coisas em coluna no telemóvel e em linha no PC, espalha-as nos cantos */}
        <div> 
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight"> 
            {getTimeGreeting()}, <span className="text-indigo-600">{userName.split(' ')[0]}</span> 
          </h1> 
          {/* Saúda o utilizador usando a função lógica, apanha a primeira palavra do nome (O split) e pinta de indigo vivo */}
          <p className="text-slate-500 font-medium mt-1 flex items-center gap-2"> 
            <Calendar size={18} className="text-slate-400" /> 
            Hoje é {new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })} 
          </p> 
          {/* Mostra a data do sistema de forma amigável com um ícone */}
        </div> 
        
        {/* Crachá de Acesso do Utilizador estilo "Glassmorphism" */}
        <div className="flex items-center gap-4 bg-white/70 backdrop-blur-md px-5 py-3 rounded-2xl border border-slate-200/60 shadow-sm"> 
          <div className="w-12 h-12 bg-indigo-50/80 rounded-xl flex items-center justify-center text-indigo-600"> 
            <CheckCircle2 size={24} /> 
          </div> 
          {/* Símbolo do crachá para provar que a sessão tá autêntica */}
          <div className="pr-2"> 
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Acesso</p> 
            <p className="text-sm font-extrabold text-slate-700 truncate max-w-[200px] uppercase"> 
              {/* Lógica condicional (ternário encadeado) que converte o jargão do sistema em nomes bonitos e percetíveis */}
              {userRole === 'regional_admin' ? 'Administrativo Comum' : 
               userRole === 'dirigente' ? 'Dirigente Regional' : 
               userRole === 'supervisor' ? 'Supervisão Escolar' : 
               (schoolName || 'Gestão de Unidade')} 
            </p> 
          </div> 
        </div> 
      </div> 

      {/* --- BANNER DE BOAS-VINDAS / EXPLICAÇÃO (NOVIDADE) --- */}
      {showWelcomeBanner && ( // Se o estado do banner for verdadeiro (começa a true) desenha este bloco
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100/60 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
          {/* Div azulada com um gradiente macio, borda subtil, slide-down animation e organização responsiva */}
          <div className="flex items-start gap-4">
            <div className="p-3 bg-indigo-100/50 rounded-xl text-indigo-600 shrink-0">
              <Info size={24} /> 
              {/* Ícone de informação gordo a focar atenção */}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Bem-vindo ao Sistema de Gestão SGE-GSU-II</h3>
              {/* Título de boas vindas com o nome realçado nos comentários passados */}
              <p className="text-sm text-slate-600 font-medium mt-1 leading-relaxed max-w-3xl">
                Este é o seu centro de controle integrado. Utilize este painel para monitorizar a rede, acompanhar as métricas de consumo de recursos, acionar serviços de emergência e gerir remanejamento patrimonial.
              </p>
              {/* Parágrafo conciso mas abrangente que clarifica as valências do Dashboard a novos utilizadores */}
            </div>
          </div>
          <button 
            onClick={() => setShowWelcomeBanner(false)} // Evento que queima/desliga o estado do banner
            className="p-2 hover:bg-indigo-100/50 rounded-lg text-indigo-400 hover:text-indigo-600 transition-colors shrink-0"
            title="Fechar mensagem"
          >
            {/* O botão "X" que repousa do lado direito, permite dispensar a caixa depois do utilizador a ler */}
            <X size={20} />
          </button>
        </div>
      )}

      {/* --- BARRA FILTRO DO SUPERVISOR --- */}
      {userRole === 'supervisor' && supervisorSchoolsList.length > 0 && ( // Só se materializa se o sujeito tiver poder de supervisor E possuir escolas atribuídas
        <div className="bg-gradient-to-r from-orange-50 to-white border border-orange-100/60 p-5 rounded-2xl flex flex-col md:flex-row md:items-center gap-4 justify-between shadow-sm animate-in fade-in duration-500"> 
          {/* Caixa cor-de-laranja pálida, exclusiva para destacar que há um contexto de filtragem superior ativo */}
          <div className="flex items-center gap-4"> 
            <div className="p-3 bg-orange-100/50 rounded-xl text-orange-600 border border-orange-200/50"> 
              <Building2 size={24} /> 
            </div> 
            <div> 
              <h3 className="text-base font-bold text-slate-800">Painel de Supervisão</h3> 
              <p className="text-sm text-slate-500 font-medium">Filtre dados por unidade ou veja o resumo de todas</p> 
            </div> 
          </div> 
          <select 
            className="w-full md:w-auto min-w-[320px] bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent shadow-sm cursor-pointer transition-all hover:bg-slate-50" 
            value={selectedSupervisorSchool} 
            onChange={(e) => handleSupervisorFilterChange(e.target.value)} 
          > 
            {/* O dropdown polido: ao alterar avisa o React qual o ID que deve mostrar nos cartões numéricos */}
            <option value="all">📊 Resumo Geral ({supervisorSchoolsList.length} escolas)</option> 
            {supervisorSchoolsList.map(school => ( 
              <option key={school.id} value={school.id}>🏫 {school.name}</option> 
            ))} 
            {/* Mapeia a listinha do supervisor para tags de <option> no HTML */}
          </select> 
        </div> 
      )} 

      {/* --- GRELHA NUMÉRICA BENTO BOX (Estatísticas) --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5"> 
        {/* A grelha adapta-se à responsividade: 1 de cada vez no tlm, passa a 3 e finalmente 5 para monitores largos */}
        {userRole === 'regional_admin' || userRole === 'dirigente' ? ( // Visão Superior: Mostra totais da rede
          <> 
            <StatCard title="Escolas" value={stats.schools} icon={<Building2 size={24} />} color="blue" loading={loading} label="Rede Registada" /> 
            <StatCard title="Zeladorias" value={stats.activeZeladorias} icon={<ShieldCheck size={24} />} color="emerald" loading={loading} label="Espaços Ativos" /> 
            <StatCard title="Média Global" value={`${stats.avgConsumption.toFixed(2)} m³`} icon={<Waves size={24} />} color="blue" loading={loading} label="Consumo Diário" /> 
            <StatCard title="Falta de Luz" value={stats.powerOutageRecords} icon={<ZapOff size={24} />} color="slate" loading={loading} label="Falhas no Ano" /> 
            <StatCard title="Remanejamento" value={stats.inventoryItems} icon={<ArrowRightLeft size={24} />} color="indigo" loading={loading} label="Itens em Banco" /> 
          </> // 5 Cartões enviados com "props" customizadas de dados
        ) : ( // Visão Limitada (Diretor/Supervisor): Focado apenas num núcleo ou numa só escola
          <> 
            <StatCard title="Média Consumo" value={`${stats.avgConsumption.toFixed(2)} m³`} icon={<Waves size={24} />} color="blue" loading={loading} label="Por dia" /> 
            <StatCard title="Limites Excedidos" value={stats.exceededDays} icon={<AlertTriangle size={24} />} color="amber" loading={loading} label="Neste mês" alert={stats.exceededDays > 0} /> 
            <StatCard title="Falta de Luz" value={stats.powerOutageRecords} icon={<ZapOff size={24} />} color="slate" loading={loading} label="Ocorrências anuais" /> 
            <StatCard title="Caminhão Pipa" value={stats.waterTruckRequests} icon={<History size={24} />} color="blue" loading={loading} label="Solicitações ano" /> 
            <StatCard title="Remanejamento" value={stats.inventoryItems} icon={<ArrowRightLeft size={24} />} color="indigo" loading={loading} label="Material Disponível" /> 
          </> // O cartão de dias de excesso (alerta) é aqui invocado, mostrando luz amarela caso o número passe de zero
        )} 
      </div> 

      {/* --- SECÇÃO MAIN: CORPO DO DASHBOARD --- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8"> 
        {/* Separa tudo num layout de 12 colunas, como no Bootstrap */}
        
        {/* COLUNA ESQUERDA (GIGANTE - 8/12) - MÓDULO GEOGRÁFICO */}
        <div className="lg:col-span-8 space-y-5"> 
          {/* Caixa de controles visuais do mapa */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4"> 
            <div className="flex items-center gap-3"> 
              <div className="w-1.5 h-8 bg-indigo-600 rounded-full"></div> 
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2"> 
                <MapIcon size={24} className="text-indigo-500" /> Cobertura Geográfica 
              </h2> 
              {/* Título bonitinho de Mapa em formato pill com linha vertical lateral */}
            </div> 
            
            {/* O cluster de botões interativos (Filtros Pilula) */}
            <div className="flex flex-wrap gap-2 bg-white/60 backdrop-blur-sm p-1.5 rounded-2xl border border-slate-200/80 shadow-sm"> 
               {PERIOD_OPTIONS.map(opt => { // Para cada um dos 5 horários permitidos pelo sistema
                 const isSelected = selectedPeriods.includes(opt); // Verifica ativo ou inativo
                 const isIntegral9 = opt === 'Integral 9h'; // Cor forte específica para facilitar análise
                 const isIntegral7 = opt === 'Integral 7h'; // Cor forte de filtro
                 
                 let activeClass = 'bg-orange-500 border-orange-500 shadow-orange-500/20 text-white'; // Default ativo (Laranja)
                 if (isIntegral9) activeClass = 'bg-emerald-500 border-emerald-500 shadow-emerald-500/20 text-white'; // (Verde)
                 if (isIntegral7) activeClass = 'bg-blue-500 border-blue-500 shadow-blue-500/20 text-white'; // (Azul)

                 return ( 
                   <button 
                    key={opt} // Evita avisos de array do React
                    onClick={() => togglePeriodFilter(opt)} // Manda atualizar as métricas
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm active:scale-95 border ${ 
                      isSelected  // Se o botão for escolhido
                        ? activeClass // Adota o estilo forte que foi gerado em cima
                        : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 hover:border-slate-300' // Senão fica um botão subtil cinza e branco
                    }`} 
                   > 
                     <div className={`w-2 h-2 rounded-full border border-white/30 ${ // Pontinho colorido que emita sinal
                       isIntegral9 ? 'bg-green-300' : // Cor da bolinha
                       isIntegral7 ? 'bg-blue-300' : // Cor da bolinha
                       'bg-orange-300' // Cor da bolinha
                     } ${isSelected ? 'bg-white' : ''}`} /> 
                     {opt} 
                   </button> 
                 ); // Imprime fisicamente o botão no ecrã
               })} 

               {/* Separador fininho vertical só para beleza */}
               <div className="w-px h-6 bg-slate-200 self-center mx-2 hidden md:block"></div> 

               <button 
                  onClick={() => setFilterOnlyElevator(!filterOnlyElevator)} // Corta logo as escolas com problemas de acessibilidade
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm active:scale-95 border ${ 
                    filterOnlyElevator // Se este modo duro tiver on
                      ? 'bg-slate-800 border-slate-800 text-white shadow-slate-500/20' // Pintamos tudo de escuro tipo Dark Mode
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 hover:border-slate-300' // Senão fica transparente
                  }`} 
               > 
                 <div className={`w-3 h-3 flex items-center justify-center rounded-[3px] rotate-45 border border-white/20 ${filterOnlyElevator ? 'bg-indigo-400' : 'bg-slate-300'}`}></div> 
                 Com Elevador 
                 {/* Aqui desenha aquele mini-diamante dentro do botão */}
               </button> 
            </div> 
          </div> 
          
          {/* Caixa onde de facto o mapa vai ser pintado com Efeito "Float" e Bordas Arredondadas */}
          <div className="bg-white p-2 rounded-3xl border border-slate-200 shadow-xl overflow-hidden relative group"> 
            
            {/* Mini janela transparente no topo com a legenda */}
            <div className="absolute top-6 right-6 z-[400] opacity-90 group-hover:opacity-100 transition-opacity"> 
                <div className="bg-white/90 backdrop-blur-md px-4 py-3 rounded-2xl shadow-lg border border-slate-100 space-y-2.5"> 
                   <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-1.5">Legenda Geográfica</p> 
                   <div className="flex items-center gap-2.5 text-[11px] font-semibold text-slate-700"> 
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-400 border border-white shadow-sm"></div> 
                      Infraestrutura Standard 
                   </div> 
                   <div className="flex items-center gap-2.5 text-[11px] font-semibold text-slate-700"> 
                      <div className="w-2.5 h-2.5 rounded-sm rotate-45 bg-slate-400 border border-white shadow-sm"></div> 
                      Com Acessibilidade (Elevador) 
                   </div> 
                   {/* Esta lengalenga mostra que a bolinha é normal e o losango é com elevador, pra ngm ficar perdido */}
                </div> 
            </div> 

            {/* Crachá preto super visível que conta os pins no ecrã e avisa que o filtro está on */}
            <div className="absolute top-6 left-6 z-[400]"> 
                <div className="bg-slate-900/90 backdrop-blur-md text-white px-4 py-2 rounded-xl shadow-lg border border-white/10 flex items-center gap-2.5"> 
                   <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div> 
                   <span className="text-xs font-bold uppercase tracking-wide"> 
                      {filteredMapSchools.length} Unidades Apresentadas 
                   </span> 
                </div> 
            </div> 

            {/* A TELA BRANCA DO PINTOR: div que apanha o refLeaflet. O CSS a 600px garante o tamanho certo */}
            <div ref={mapContainerRef} className="h-[600px] w-full rounded-[1.5rem] overflow-hidden bg-slate-50 z-0"> 
               {(!leafletLoaded || mapSchools.length === 0) && ( // Feedback caso a net esteja lerda, aparece a rodinha invés de branco feio
                 <div className="h-full w-full flex flex-col items-center justify-center text-slate-400"> 
                    <Loader2 size={48} className="mb-4 animate-spin text-indigo-500" /> 
                    <p className="text-sm font-bold uppercase tracking-widest text-slate-500"> 
                      {!leafletLoaded ? 'A descarregar módulos de mapa...' : 'A sincronizar dados geográficos...'} 
                    </p> 
                 </div> 
               )} 
            </div> 
          </div> 
        </div> 

        {/* COLUNA DIREITA (FINA - 4/12) - SERVIÇOS CRÍTICOS E BOTÕES DE EMERGÊNCIA */}
        <div className="lg:col-span-4 space-y-6"> 
          {/* Título com aspeto urgente usando o vermelho 'rose' */}
          <div className="flex items-center gap-3"> 
             <div className="w-1.5 h-6 bg-rose-500 rounded-full"></div> 
             <h2 className="text-xl font-bold text-slate-800 tracking-tight">Serviços de Ação Rápida</h2> 
          </div> 

          {/* Wrapper dos Mega botões */}
          <div className="grid grid-cols-1 gap-4"> 
            
            {/* MEGA BOTÃO DA ÁGUA (Pipa) */}
            <button onClick={() => setIsWaterTruckModalOpen(true)} className="group relative overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600 p-7 rounded-3xl text-left shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] text-white"> 
              {/* Efeito hover espetacular com aquele borrão que cresce atrás (Círculo expansivo) */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -translate-y-10 translate-x-10 group-hover:scale-150 transition-transform duration-700"></div> 
              <div className="relative z-10"> 
                 {/* Quadrado leitoso para alojar as gotinhas svg */}
                 <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center text-white mb-5"> 
                    <Droplets size={26} strokeWidth={2.5} /> 
                 </div> 
                 <h3 className="text-2xl font-black leading-tight tracking-tight">Caminhão <br/>Pipa</h3> 
                 <div className="mt-5 flex items-center gap-2 text-white/80 font-bold text-xs uppercase tracking-widest"> 
                    Efetuar Solicitação <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" /> 
                 </div> 
              </div> 
            </button> 

            {/* MEGA BOTÃO DA LUZ (Raio) */}
            <button onClick={() => setIsPowerOutageModalOpen(true)} className="group relative overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 p-7 rounded-3xl text-left shadow-lg shadow-slate-900/20 transition-all hover:scale-[1.02] active:scale-[0.98] text-white"> 
              {/* Efeito identico ao de cima, mas amarelo para fazer match do tema elétrico */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400 opacity-5 rounded-full -translate-y-10 translate-x-10 group-hover:scale-150 transition-transform duration-700"></div> 
              <div className="relative z-10"> 
                 <div className="w-12 h-12 bg-white/10 backdrop-blur-md border border-white/5 rounded-xl flex items-center justify-center text-amber-400 mb-5"> 
                    <Zap size={26} strokeWidth={2.5} /> 
                 </div> 
                 <h3 className="text-2xl font-black leading-tight tracking-tight">Registo de<br/>Falta de Energia</h3> 
                 <div className="mt-5 flex items-center gap-2 text-white/80 font-bold text-xs uppercase tracking-widest"> 
                    Notificar URE <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" /> 
                 </div> 
              </div> 
            </button> 
          </div> 

          {/* SUB-BLOCO de Painéis Inferiores */}
          <div className="flex items-center gap-3 mt-8"> 
             <div className="w-1.5 h-6 bg-slate-300 rounded-full"></div> 
             <h2 className="text-xl font-bold text-slate-800 tracking-tight">Painéis de Controle</h2> 
          </div> 
          
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-3 space-y-2"> 
            {/* Este componente reutiliza um padrão elegante para atalhos internos do sistema */}
            <QuickLink 
               icon={<ArrowRightLeft size={20}/>} 
               title="Gestão de Remanejamento" 
               desc="Acesso ao banco regional de materiais" 
               href="/remanejamento" 
               color="indigo" 
            /> 
            {/* NOVIDADE: Adicionado atalho direto para a página Tutoriais.tsx, para orientar utilizadores inexperientes */}
            <QuickLink 
               icon={<Info size={20}/>} 
               title="Manuais e Tutoriais" 
               desc="Aprenda a utilizar os recursos do sistema" 
               href="/tutoriais" 
               color="blue" 
            /> 
          </div> 
        </div> 
      </div> 

      {/* --- CORTINAS / MODAIS DE AÇÃO --- */}
      {/* Isto só aparece a esvaziar/ofuscar o ecrã se o utilizador clicou no tal mega botão. A lógica de qual "nome de escola" ele envia para o formulário dependende dele ter usado o Filtro ou não */}
      {isWaterTruckModalOpen && <WaterTruckModal isOpen={isWaterTruckModalOpen} onClose={() => { setIsWaterTruckModalOpen(false); initDashboard(); }} schoolName={selectedSupervisorSchool !== 'all' ? supervisorSchoolsList.find(s => s.id === selectedSupervisorSchool)?.name || schoolName : schoolName} schoolId={schoolId} userName={userName} sabespCode={sabespCode} />} 
      {isPowerOutageModalOpen && <PowerOutageModal isOpen={isPowerOutageModalOpen} onClose={() => { setIsPowerOutageModalOpen(false); initDashboard(); }} schoolName={selectedSupervisorSchool !== 'all' ? supervisorSchoolsList.find(s => s.id === selectedSupervisorSchool)?.name || schoolName : schoolName} schoolId={schoolId} userName={userName} edpCode={edpCode} />} 
    </div> 
  ); // Ponto de finalização do retorno TSX do Dashboard principal
} // Fecho absoluto da função Dashboard

// =========================================================
// MÓDULO AUXILIAR 1: O pequeno quadrado estatístico 
// =========================================================
function StatCard({ title, value, icon, color, loading, label, alert = false }: any) { 
  const colorMap: any = { // Dicionário que converte palavras fáceis em strings malucas de Tailwindcss
    blue: "bg-blue-50/80 text-blue-600 border-blue-100", // Esquema azulado para consumo de água normal
    emerald: "bg-emerald-50/80 text-emerald-600 border-emerald-100", // Esquema verde para coisas ativas
    amber: "bg-amber-50/80 text-amber-600 border-amber-100", // Esquema amarelo para alertas/excessos
    slate: "bg-slate-50/80 text-slate-600 border-slate-200", // Esquema padrão cinza
    indigo: "bg-indigo-50/80 text-indigo-600 border-indigo-100" // Esquema sofisticado para ferramentas/inventários
  }; 
  return ( 
    // Corpo card: flutua levemente no hover, apita com border amarela se tiver o flag de alert ON
    <div className={`relative bg-white p-5 rounded-3xl border border-slate-200 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 overflow-hidden ${alert ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}> 
      {/* Deco background (Efeito Apple / Glassmorphism de luz esfumada no canto superior direito do cartão) */}
      <div className={`absolute -right-4 -top-4 w-16 h-16 rounded-full opacity-20 blur-2xl ${colorMap[color].split(' ')[1]}`}></div> 
      
      <div className="flex justify-between items-start mb-4 relative z-10"> 
         {/* Área do logo */}
         <div className={`p-2.5 rounded-xl ${colorMap[color]} shadow-sm backdrop-blur-sm border`}>{icon}</div> 
         {/* Animação perigosa (led a piscar) no topo direito caso o estado de "alerta" seja invocado, ex: rebentar consumo de água */}
         {alert && <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span></span>} 
      </div> 
      
      {/* Loader visual - os famosos blocos cinzentos que piscam enquanto a net não atinge o destino */}
      {loading ? ( 
        <div className="space-y-3 relative z-10"> 
           <div className="h-8 w-20 bg-slate-100 animate-pulse rounded-lg"></div> 
           <div className="h-3 w-24 bg-slate-50 animate-pulse rounded-md"></div> 
        </div> 
      ) : ( 
        // O conteúdo de verdade:
        <div className="relative z-10"> 
           {/* O número 3.32m2 bem destacado */}
           <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight leading-none">{value}</h3> 
           {/* O nome "Consumo", minúsculo mas espaçado e agressivo */}
           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{title}</p> 
           {/* Separação e a linha de nota de rodapé com setinha simpática */}
           <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between"> 
              <span className="text-[10px] font-semibold text-slate-400 uppercase">{label}</span> 
              <ArrowRight size={12} className="text-slate-300" /> 
           </div> 
        </div> 
      )} 
    </div> 
  ); // Fim de StatCard
} 

// =========================================================
// MÓDULO AUXILIAR 2: Os atalhos inferiores 
// =========================================================
function QuickLink({ icon, title, desc, href, color }: any) { 
  const colorMap: any = { // Outro dicionário, agora para controlar quem fica preenchido ou vazio quando se põe lá o rato por cima
    blue: "group-hover:bg-blue-500 group-hover:text-white text-blue-500 bg-blue-50", 
    emerald: "group-hover:bg-emerald-500 group-hover:text-white text-emerald-500 bg-emerald-50", 
    amber: "group-hover:bg-amber-500 group-hover:text-white text-amber-500 bg-amber-50", 
    indigo: "group-hover:bg-indigo-500 group-hover:text-white text-indigo-500 bg-indigo-50", 
  }; 
  return ( 
    // É apenas uma tag <a href> bonitinha para levar a outra rota (ex: /tutoriais) com propriedades globais de hover do tailwind
    <a href={href} className="group flex items-center gap-4 p-3 hover:bg-slate-50 rounded-2xl transition-all border border-transparent hover:border-slate-100"> 
      {/* Fundo do Ícone inverte a cor de forma brutal no hover */}
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${colorMap[color]}`}>{icon}</div> 
      <div className="flex-1"> 
         {/* Title limpo */}
         <p className="text-sm font-bold text-slate-700 leading-tight">{title}</p> 
         {/* Sub-contexto text minimizado */}
         <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{desc}</p> 
      </div> 
      {/* Seta no fim empurra ligeiramente pra direita durante o hover do cursor do rato */}
      <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-600 transition-colors group-hover:translate-x-1" /> 
    </a> 
  ); // Fim do QuickLink
} // Fim absoluto de todo o código fonte