SGE-GSU II - Sistema de Gestão Escolar e Urbana

Bem-vindo ao repositório do SGE-GSU II. Este é um sistema abrangente de gestão desenvolvido para otimizar a administração de recursos, infraestrutura e processos escolares e urbanos. O projeto utiliza uma stack moderna focada em performance e experiência do usuário.

🚀 Tecnologias Utilizadas

O projeto foi construído utilizando as seguintes tecnologias principais:

React (com Vite): Biblioteca para construção da interface de usuário, garantindo rapidez e modularidade.

TypeScript: Superset do JavaScript que adiciona tipagem estática, aumentando a segurança e manutenibilidade do código.

Tailwind CSS: Framework de CSS utilitário para estilização rápida e responsiva.

Supabase: Backend-as-a-Service utilizado para autenticação, banco de dados (PostgreSQL) e Edge Functions.

ESLint: Para padronização e qualidade do código.

📚 Funcionalidades e Módulos

O sistema é dividido em diversas páginas e módulos funcionais. Abaixo está a descrição detalhada de cada seção do projeto:

🏠 Painel Principal

Dashboard (Dashboard.tsx): Visão geral do sistema com indicadores, gráficos e resumos das atividades recentes.

Login (Login.tsx): Tela de autenticação segura para acesso ao sistema.

📅 Agendamentos e Logística

Agendamento de Ambientes (AgendamentoAmbientes.tsx): Gestão de reservas de salas, auditórios e espaços comuns.

Agendamento de Carros (AgendamentoCarros.tsx): Controle da frota, permitindo reservar veículos para deslocamentos oficiais.

🏫 Gestão Escolar e Infraestrutura

Raio-X da Escola (RaioXEscola.tsx): Visão detalhada e diagnóstica de uma unidade escolar específica.

Ranking de Escolas (RankingEscolas.tsx): Classificação das unidades baseada em métricas definidas (atendimentos, notas, estrutura).

Escolas Prioritárias (EscolasPrioritarias.tsx): Gestão de unidades que necessitam de atenção urgente ou recursos especiais.

Dados da Escola (escola.tsx): Cadastro e visualização de informações gerais das unidades.

🛠️ Manutenção e Serviços

Zeladoria (Zeladoria.tsx): Controle de serviços de limpeza e conservação predial.

Manejo Arbóreo (ManejoArboreo.tsx): Gestão de solicitações de poda e cuidado com áreas verdes.

Elevadores (Elevador.tsx): Monitoramento da manutenção e status dos elevadores.

Consumo de Água (ConsumoAgua.tsx): Acompanhamento de leitura de hidrômetros e gastos.

Caminhão Pipa (WaterTruckModal.tsx): Modal específico para solicitação emergencial de abastecimento de água.

Queda de Energia (PowerOutageModal.tsx): Funcionalidade rápida para reportar falta de luz nas unidades.

🏗️ Obras e Patrimônio

Obras (Obras.tsx): Acompanhamento do status de reformas e construções.

Patrimônio (Patrimonio.tsx): Controle de inventário de bens móveis e equipamentos.

Processos de Patrimônio (PatrimonioProcessos.tsx): Gestão de movimentações, baixas e transferências de bens.

Aquisição (Aquisicao.tsx): Módulo para gestão de compras e novos insumos.

📋 Administrativo e Suporte

Chamados (Chamados.tsx): Sistema de Help Desk para abertura e acompanhamento de tickets de suporte.

Fiscalização (fiscalizacao.tsx): Módulo para registro de vistorias e auditorias.

Demanda (Demanda.tsx): Análise de demandas de vagas ou recursos.

Remanejamento (Remanejamento.tsx): Controle de transferência de alunos ou servidores.

Reuniões (Reunioes.tsx): Pautas e registros de reuniões administrativas.

👤 Usuário e Ajuda

Perfil do Usuário (Usuario.tsx): Gerenciamento de dados da conta e preferências.

Notificações (Notificacoes.tsx): Central de alertas e avisos do sistema.

Tutoriais (Tutoriais.tsx): Base de conhecimento e guias de uso do sistema.

💻 Instalação e Execução Local

Siga os passos abaixo para clonar e rodar o projeto em sua máquina:

Pré-requisitos

Node.js (versão 18 ou superior) instalado.

Git instalado.

Passo a Passo

Clone o repositório:
Abra seu terminal e execute:

git clone [https://github.com/iuridev/sge-gsu-ii.git](https://github.com/iuridev/sge-gsu-ii.git)
cd sge-gsu-ii


Instale as dependências:

npm install
# ou, se preferir usar yarn:
yarn install


Configuração de Variáveis de Ambiente:
O projeto utiliza o Supabase. Você precisará criar um arquivo .env na raiz do projeto com as chaves de acesso. Utilize o arquivo de exemplo (se houver) ou configure conforme abaixo:

VITE_SUPABASE_URL=sua_url_do_supabase
VITE_SUPABASE_ANON_KEY=sua_chave_anonima_do_supabase


Execute o projeto:

npm run dev


O terminal mostrará o link local (geralmente http://localhost:5173) para acessar a aplicação.

🤝 Como Contribuir

Quer colaborar com o projeto? Siga este guia para garantir um fluxo de trabalho organizado:

Faça um Fork do projeto:
Clique no botão "Fork" no canto superior direito da página do repositório no GitHub. Isso criará uma cópia do repositório na sua conta.

Crie uma Branch para sua Feature:
No seu terminal, dentro da pasta do projeto, crie uma branch com um nome descritivo para o que você vai fazer:

git checkout -b feature/nova-funcionalidade
# ou para correções de bugs:
git checkout -b fix/correcao-bug


Desenvolva e Comite:
Faça as alterações necessárias. Ao commitar, use mensagens claras e objetivas:

git add .
git commit -m "feat: adiciona filtro na tela de chamados"


Envie para o seu Fork (Push):

git push origin feature/nova-funcionalidade


Abra um Pull Request (PR):

Vá até o repositório original no GitHub.

Você verá um aviso de que sua branch tem alterações recentes. Clique em "Compare & pull request".

Descreva detalhadamente o que foi feito, quais arquivos foram alterados e, se possível, anexe prints das mudanças visuais.

Aguarde a revisão da equipe.

Padrões de Código

Mantenha a estrutura de pastas existente.

Utilize o ESLint configurado no projeto para garantir a formatação correta.

Evite commitar arquivos de configuração local (como .env).

📄 Licença

Este projeto está sob a licença MIT (ou a licença definida pelo proprietário).

Desenvolvido por Iuri Dev.