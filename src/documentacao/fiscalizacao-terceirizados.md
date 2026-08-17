# Fiscalização de Serviços Terceirizados

Módulo para que as próprias escolas registrem, no dia a dia, ocorrências e o
preenchimento do checklist de rotina dos serviços terceirizados (Limpeza
Escolar, Transporte Escolar e, futuramente, outros como Cuidador ou Merenda).
O banco de dados é uma planilha do Google Sheets; o cadastro de escolas e o
login continuam sendo os mesmos já usados no resto do SGE (Supabase).

> **Como o restante do módulo, a lista de checklist do Transporte Escolar
> abaixo é um RASCUNHO.** O material de origem (COTRANS) não detalha um
> checklist operacional como o de Limpeza (DISPA/SEDUC) — os itens sugeridos
> precisam ser validados com o gestor da fiscalização antes de irem para
> produção.

## Arquitetura

```
Navegador (React/Vite)
  │  supabase.functions.invoke('google-sheets-fiscalizacao-terceirizados', ...)
  ▼
Supabase Edge Function (Deno) — supabase/functions/google-sheets-fiscalizacao-terceirizados/index.ts
  │  valida a sessão do usuário (Supabase Auth)
  │  autentica no Google Sheets com a service account (secrets do Supabase)
  ▼
Planilha do Google (uma aba por entidade)
```

A chave da service account **nunca** fica no front-end: ela vive apenas como
*secret* da Edge Function no Supabase. O front-end não conhece o ID da
planilha nem qualquer credencial do Google.

Escolas e usuários continuam vindo do Supabase (tabelas `schools` e
`profiles`, já usadas em todo o SGE) — não existe uma aba "Schools" na
planilha, para não haver duas fontes de verdade divergentes.

Anexos de ocorrência (foto/PDF) sobem para o bucket do Supabase Storage
`fiscalizacao-terceirizados-evidencias` (público para leitura, só
autenticado grava) e a URL pública é o que é salvo na planilha.

## Passo a passo de configuração

### 1. Abas da planilha (criação automática)

A Edge Function **cria as 6 abas sozinha**, com cabeçalho, na primeira vez
que alguém abre a página do módulo já logado — não é preciso criar nada à
mão na planilha. `ServiceTypes` e `ChecklistItems` já nascem populadas com
o seed descrito nas seções 2 e 3 abaixo (código-fonte do seed:
`SEEDS` em `supabase/functions/google-sheets-fiscalizacao-terceirizados/index.ts`).

| Aba | Colunas |
|---|---|
| `ServiceTypes` | `id, nome, ativo` |
| `ChecklistItems` | `id, serviceTypeId, frequencia, descricaoItem, ativo` |
| `Occurrences` | `id, data, escolaId, serviceTypeId, ambiente, categoriaOcorrencia, descricaoOcorrencia, providenciaAdotada, retornoDaEmpresa, situacao, anexos, registradoPor, criadoEm` |
| `ChecklistCompletions` | `id, data, escolaId, serviceTypeId, checklistItemId, executado, observacao, registradoPor, criadoEm` |
| `SatisfactionRatings` | `id, data, escolaId, serviceTypeId, nota, comentario, registradoPor, criadoEm` |
| `VisitRequests` | `id, escolaId, motivo, status, dataSolicitacao, dataAgendada, observacaoFiscal, solicitadoPor, criadoEm, atualizadoEm` |

`ativo` usa os textos `sim`/`nao`. `frequencia` usa `diaria`, `semanal`,
`mensal` ou `trimestral`. `situacao` usa `pendente`/`resolvido`. `executado`
usa `sim`/`nao`. `nota` (satisfação) vai de `0` a `10`. `status` de
`VisitRequests` vai de `pendente` → `agendada` → `concluida`.

#### `VisitRequests.dataAgendada` é oculta da escola — reforçada no servidor

A escola nunca deve ver a data que o fiscal marcou para atendê-la — só que
o pedido foi "agendado". Isso é feito na própria Edge Function, não na
tela: ao responder `GET`, ela consulta `profiles.role` do usuário logado e,
se o papel não for `regional_admin`, `supervisor`, `dirigente` ou
`ure_servico`, apaga `dataAgendada` de cada linha antes de devolver a
resposta. A função também recusa (`POST` com erro) qualquer tentativa de um
papel não-fiscal definir `dataAgendada` ou avançar `status` para `agendada`
ou `concluida` diretamente pela API. Ou seja: mesmo inspecionando a rede
pelo DevTools, a escola não consegue ver ou manipular a data — o controle
não depende da UI.

A autoprovisão só roda uma vez por aba: se você apagar uma aba depois, ela
é recriada vazia (sem o seed) na próxima chamada — o seed só entra junto da
criação da aba, não é reaplicado por cima de uma aba já existente.

**Este é um ponto de partida, não definitivo** — nomes de coluna podem ser
ajustados; se mudar, atualize o array `columns` de cada entidade em
`supabase/functions/google-sheets-fiscalizacao-terceirizados/index.ts`.

### 2. `ServiceTypes` (já vem semeada automaticamente)

| id | nome | ativo |
|---|---|---|
| `svc-limpeza` | Limpeza Escolar | sim |
| `svc-transporte` | Transporte Escolar | sim |

### 3. `ChecklistItems` (já vem semeada automaticamente)

Itens de **Limpeza Escolar** (material DISPA/SEDUC — "Fiscalização na
Prática — Contratos de Limpeza Escolar"), todos com `serviceTypeId =
svc-limpeza` e `ativo = sim`:

**Diárias** — limpeza de pisos; sanitários; lixeiras e resíduos; superfícies
de uso frequente (maçanetas, corrimãos, interruptores, mesas); pátios e
áreas de circulação; reposição de materiais (papel, sabonete, saco de
lixo); remoção de sujeiras e resíduos acumulados.

**Semanais** — limpeza de vidros internos sem exposição a risco; paredes e
portas; mobiliário; áreas externas (varrição/lavagem); revisão de
lixeiras; limpeza e desinfecção de sanitários; polir metais de bebedouros.

**Mensais** — limpeza de vidros externos sem exposição a risco; forros e
luminárias; áreas externas amplas; remoção de manchas de pisos e paredes;
limpeza de ralos e grelhas; revisão de selantes e rejuntes.

**Trimestrais** — limpeza de vidros externos com exposição a risco; áreas
elevadas; fachadas e estruturas externas; calhas e rufos.

Itens de **Transporte Escolar** (`serviceTypeId = svc-transporte`) —
**RASCUNHO, validar antes de produção**:

**Diárias** — conferência da documentação do motorista/monitor; estado de
conservação do veículo (pneus, freios, cintos); cumprimento de horário e
rota; uso de cinto de segurança pelos alunos; presença do monitor quando
exigido.

**Semanais** — verificação de itens de segurança (extintor, kit de
primeiros socorros); limpeza interna do veículo.

**Mensais** — revisão da documentação do veículo (CRLV, seguro, vistoria);
avaliação de conduta do motorista relatada pela escola.

### 4. Compartilhar a planilha com a service account

O SGE já usa uma service account do Google (mesma dos módulos de Plano de
Ação, Visitas Escolares, Drive etc.). Compartilhe **esta** planilha com o
e-mail dessa service account, com permissão de **Editor** — sem isso, a
Edge Function não consegue ler nem gravar.

### 5. Configurar os secrets da Edge Function

```bash
supabase secrets set FISCALIZACAO_TERCEIRIZADOS_SHEET_ID=<ID da planilha, da URL>
```

`GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY` já existem como
secrets do projeto (reaproveitados de outros módulos) — não é preciso
recriá-los.

### 6. Deploy da função

```bash
supabase functions deploy google-sheets-fiscalizacao-terceirizados
```

### 7. Rodar localmente

```bash
npm install
npm run dev
```

O front-end usa as mesmas `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` já
configuradas no `.env.local` do projeto — nada novo a adicionar ali.

## Adicionando um novo tipo de serviço (ex.: Cuidador, Merenda)

Nenhuma tela ou componente precisa mudar. Basta:

1. Inserir uma linha em `ServiceTypes` (novo `id`, `nome`, `ativo = sim`).
2. Inserir as linhas correspondentes em `ChecklistItems`, usando o `id` do
   novo serviço em `serviceTypeId`.

O novo serviço aparece automaticamente nos seletores de "Registrar
Ocorrência" e "Checklist de Rotina".

## Testes

```bash
npm run test
```

Cobre as funções puras de `src/lib/fiscalizacaoTerceirizados.ts` (cálculo de
vencimento do checklist, validação do formulário de ocorrência, geração de
CSV, agregação de satisfação por semana/mês e o cálculo de "escolas que
precisam de atenção") com mocks simples — sem depender do cliente do Google
Sheets.

## Satisfação, atenção e visita técnica

- **Satisfação**: a escola avalia (0–10) quando quiser, por serviço. O
  fiscal (papéis `regional_admin`/`supervisor`/`dirigente`/`ure_servico`) vê
  a evolução num gráfico (semanal ou mensal, período customizável) e pode
  gerar um PDF (`jsPDF` + `jspdf-autotable`, mesmo timbrado institucional
  usado em Plano de Ação — `src/lib/pdfTimbrado.ts`).
- **Escolas que precisam de atenção**: `getSchoolsNeedingAttention` combina
  3 sinais independentes — satisfação média abaixo de 6 nos últimos 90
  dias, 2+ ocorrências pendentes, ou checklist obrigatório atrasado. Os
  limiares são um ponto de partida (parâmetros da função), ajustáveis.
- **Visita técnica**: a escola solicita (fica `pendente`); o fiscal define
  a data (`agendada`) e depois marca `concluida`. A escola só enxerga o
  status, nunca a data — ver a seção sobre `VisitRequests.dataAgendada`
  acima.
