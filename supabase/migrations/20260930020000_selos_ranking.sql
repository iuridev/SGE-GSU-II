-- Selos de Excelência para os pilares do Ranking de Escolas. As métricas
-- (chaves `ranking_*`) reaproveitam o mesmo cálculo do Ranking — ver
-- src/lib/rankingCalculo.ts e src/lib/selosMetricas.ts. Nas métricas de
-- sim/não (manejo, zeladoria, AVCB) o critério mínimo é sempre 1.
insert into public.selos (slug, nome, descricao, icone, cor, formato, acabamento, metrica, criterio_minimo, ordem)
values
  (
    'registro-de-agua',
    'Registro de Água',
    'Escola que mantém em dia o lançamento diário da leitura de água.',
    'droplets', 'blue', 'circulo', 'gradiente', 'ranking_agua_registro', 95, 30
  ),
  (
    'eficiencia-hidrica',
    'Eficiência Hídrica',
    'Escola que mantém o consumo de água dentro do teto estabelecido.',
    'droplets', 'sky', 'hexagono', 'gradiente', 'ranking_agua_eficiencia', 95, 40
  ),
  (
    'demandas-no-prazo',
    'Demandas no Prazo',
    'Escola que atende as demandas do setor dentro do prazo.',
    'clipboard', 'indigo', 'circulo', 'gradiente', 'ranking_demandas', 100, 50
  ),
  (
    'manejo-arboreo',
    'Manejo Arbóreo',
    'Escola com a autorização de manejo arbóreo regularizada.',
    'tree', 'lime', 'circulo', 'gradiente', 'ranking_manejo', 1, 60
  ),
  (
    'zeladoria',
    'Zeladoria',
    'Escola com o processo de zeladoria concluído.',
    'shield', 'violet', 'escudo', 'gradiente', 'ranking_zeladoria', 1, 70
  ),
  (
    'avcb',
    'AVCB',
    'Escola com o Auto de Vistoria do Corpo de Bombeiros dentro da validade.',
    'flame', 'red', 'escudo', 'gradiente', 'ranking_avcb', 1, 80
  )
on conflict (slug) do nothing;
