# PROMPT MESTRE — SISTEMA WEB PARA CLÍNICA DE HIPNOSE INTEGRATIVA MULTIDIMENSIONAL

## 0. Sua missão e a forma de trabalhar

Atue como um time sênior multidisciplinar: arquiteto de software, desenvolvedor full-stack, UX/UI designer, engenheiro de banco de dados, especialista em segurança e QA. Você está dentro do Google Antigravity IDE e deve **inspecionar, planejar, implementar, executar e verificar o software no repositório**, e não apenas responder com um plano ou com telas fictícias.

Crie um **sistema web responsivo, completo, profissional e pronto para evolução para produção**, feito sob medida para uma **clínica/espaço de Hipnose Integrativa Multidimensional**, com site público, agendamentos online, painel administrativo, cadastro de clientes, registros de atendimento, financeiro, pacotes, WhatsApp/automações, área privada do cliente e relatórios.

A aplicação deve ser intuitiva para uma proprietária com pouca familiaridade com tecnologia. Priorize poucos cliques, nomenclatura em **português do Brasil**, fluxos claros, design limpo, acessibilidade, organização, segurança e confiabilidade. Não confunda “completo” com interface cheia de elementos. Preserve todos os módulos abaixo, mas apresente ao usuário só o que fizer sentido no contexto de cada tela.

Se o repositório já possuir código, examine-o e reutilize o que for adequado, preservando dados e funcionalidades. Caso esteja vazio, inicialize o projeto. Documente decisões relevantes. Nunca destrua arquivos, bancos ou alterações do usuário para acelerar o desenvolvimento. Não utilize chaves privadas fictícias como se fossem válidas. Se faltar credencial externa, implemente toda a estrutura e o fluxo de configuração com estado claramente indicado como “Integração não configurada”; não simule sucesso real.

**Resultado exigido:** código funcional, banco de dados/migrations, telas integradas, validação, permissões, testes básicos, documentação e instruções para executar. Não entregue apenas protótipo, landing page, prints ou lista de ideias. Não declare nada concluído sem ter implementado e verificado.

## 1. Contexto e objetivo de negócio

A operação envolve a seguinte jornada:
1. O visitante acessa o site e conhece a clínica, a profissional e os serviços.
2. Seleciona um serviço, modalidade (presencial/online, se habilitada), dia e horário disponível e solicita uma reserva.
3. A clínica confirma automaticamente ou manualmente, conforme configuração, e envia orientações apropriadas.
4. A profissional atende, acompanha e registra somente as informações pertinentes e permitidas.
5. A clínica registra cobranças, pagamentos, uso de pacotes e retornos.
6. O cliente acompanha seus horários, solicita alterações e consulta documentos e dados financeiros permitidos.

O termo “Hipnose Integrativa Multidimensional” pode abranger práticas diversas. **Não presuma que se trata de psicoterapia, medicina ou tratamento cientificamente validado.** A natureza dos atendimentos, os serviços, os formulários, as alegações públicas e as exigências profissionais precisam ser configuráveis e validados com a proprietária. Não invente diagnóstico, promessa de cura, eficácia garantida ou terminologia clínica regulada. O sistema deve administrar o serviço sem substituir a avaliação da profissional.

Comece com **uma clínica/unidade e uma proprietária**, mas modele profissionais, permissões e unidades de forma extensível para crescimento futuro sem sobrecarregar a interface inicial.

## 2. Identidade visual, UI e experiência de uso — prioridade altíssima

Visual premium, acolhedor, sofisticado, minimalista e confiável; nem hospitalar, nem místico exagerado. **Fundo predominantemente branco**, áreas secundárias em cinza/azul muito claro; elementos de destaque em azul-petróleo/azul sereno. Diretrizes iniciais de tokens:
- Fundo: `#FFFFFF`; fundo alternativo `#F7FAFC`.
- Cor principal para botões e elementos selecionados: `#245D80` (ajustar contraste se necessário).
- Hover/ativo: `#194866`; azul muito claro: `#EAF3F8`.
- Texto: `#182B38`; secundário `#647784`; bordas `#E3EBF1`.
- Sucesso/alerta/erro com cores moderadas e **rótulos**, nunca depender só da cor.
- Fonte: Inter ou Manrope, com tipografia consistente e excelente leitura.
- Raio de borda moderado (10–14px), sombras sutis, espaçamento generoso e ícones discretos.
- Não usar excesso de gradientes, cards, cores, gráficos ou animações.
- A interface deve ser objetiva, organizada por tarefas e com boa hierarquia visual.

**Responsividade obrigatória:** celular (a partir de 360px), tablet (768px+), notebook/desktop (1280px+) e telas amplas. Desktop com menu lateral enxuto e recolhível; tablet com navegação adaptativa; celular com menu acessível, botões de toque confortáveis, tabelas transformadas em cartões quando adequado e formulários de uma coluna. A agenda deve funcionar bem por toque e sem depender de drag-and-drop. Testar layout, rolagem, calendário e tabelas nos três formatos. Considerar teclado, foco visível, contraste WCAG AA, labels, estados vazios, estados de carregamento, erro, sucesso, validação inline e confirmação de ações destrutivas.

Criar um **design system** reutilizável: Button, Input, Select, DatePicker, Calendar, Modal/Dialog, Drawer, Table, Card, Badge, Tabs, Toast, ConfirmationDialog, EmptyState, Skeleton, FormField, PageHeader, Breadcrumb, Search e componentes de estatísticas. Utilizar cores/variáveis centralizadas. Nenhuma página deve parecer de outro software.

## 3. Arquitetura sugerida

Se o repositório estiver vazio, preferir esta stack coesa, verificando versões estáveis e compatibilidade:
- Next.js com App Router + TypeScript.
- Tailwind CSS + shadcn/ui (Radix UI) + ícones Lucide.
- PostgreSQL; Supabase pode prover Postgres, autenticação e armazenamento privado, respeitando RLS. Evitar combinar vários sistemas de autenticação.
- Zod + React Hook Form para validar formulários no cliente **e no servidor**.
- Uso correto de Server Components/Actions/API routes de acordo com segurança e requisitos.
- date-fns com funções de fuso horário ou equivalente confiável; fuso padrão `America/Sao_Paulo`, persistência de instantes em UTC.
- Recharts ou biblioteca enxuta para gráficos, somente onde agreguem valor.
- Testes unitários e de integração, além de Playwright para jornadas centrais.

Caso outra arquitetura se mostre melhor após inspecionar o workspace, justifique-a brevemente antes de implementar. Organize por domínio: `auth`, `dashboard`, `agenda`, `clientes`, `atendimentos`, `formularios`, `financeiro`, `pacotes`, `notificacoes`, `relatorios`, `configuracoes`, `site-publico` e `portal-cliente`. Centralize tipagens, permissões, validação e componentes compartilhados; evite arquivos gigantes e código duplicado. Execute comandos reais e corrija erros de compilação, migrações e lint.

## 4. Perfis e permissões

Suportar RBAC com permissões verificadas no **backend**, jamais somente escondendo botões:
- **Proprietária/administradora:** gestão de configurações, serviços, agenda, usuários, autorizações, financeiro, relatórios e integrações; acesso a conteúdo sigiloso apenas conforme atribuição/autorização legítima.
- **Profissional:** agenda própria e devidos registros de clientes sob sua responsabilidade; sem acesso automático a finanças globais ou registros de outros profissionais.
- **Recepção/assistente:** agenda, dados cadastrais administrativos, confirmações e cobranças quando autorizado; **sem acesso a notas confidenciais, fichas de saúde ou detalhes sensíveis**.
- **Cliente:** acesso restrito aos seus próprios agendamentos, documentos explicitamente compartilhados e informações financeiras permitidas.

Criar convites para usuários internos, ativação/desativação, recuperação de acesso e trilha de auditoria das ações críticas. Prever política configurável para clínicas com uma profissional, sem mostrar telas de “equipe” desnecessárias no dia a dia.

## 5. MÓDULO 01 — Agenda inteligente (essencial)

Implementar calendário de visualização **dia, semana e mês**, com visão padrão do dia e próximo agendamento. Mostrar serviço, profissional, modalidade, horário e status. Permitir pesquisar, filtrar e abrir detalhes do agendamento a partir de um único clique/toque.

Obrigatório:
- Agendamento público e agendamento interno usando **a mesma fonte de disponibilidade**.
- Criar manualmente, editar, confirmar, reagendar, cancelar, concluir, marcar falta e duplicar agendamento quando pertinente.
- Encaixe manual fora do horário público com permissão especial e motivo registrado. Horários bloqueados podem ter exceção autorizada, mas **não autorizar sobreposição real de duas sessões do mesmo profissional/recurso por engano**. Se houver regra de sobreposição legítima, exigir configuração expressa, confirmação e auditoria.
- Configuração por profissional, serviço, modalidade, dias úteis, turnos, férias, feriados, pausas, intervalos entre sessões e exceções de datas.
- Duração configurável por serviço, intervalos e antecedência mínima/máxima de reserva.
- Bloquear períodos para férias, eventos, intervalos e indisponibilidade, com motivo interno.
- Agendamento recorrente: semanal/quinzenal ou série de retornos, visualização e exceções, sem duplicações.
- Reagendamento com histórico de horário anterior, responsável e motivo; se houver notificação, evitar mensagens duplicadas.
- Lista de espera com preferências de horários e contato, para acionamento quando abrir vaga.
- Políticas configuráveis de confirmação automática/manual, cancelamento e limite de reagendamento.
- Proteção contra concorrência: verificar no servidor e usar operação transacional/restrição adequada no banco para evitar dupla reserva mesmo com duas solicitações simultâneas.
- Tratamento correto de timezones e datas, inclusive virada de dia.

**Fluxo público:** serviço -> modalidade -> profissional (se aplicável) -> dia -> horários livres -> identificação/contato -> revisão -> solicitação/confirmado -> comprovante visual de reserva e orientações. Não exigir conta obrigatória para solicitar primeiro horário; evitar conta duplicada por telefone/e-mail; não expor nomes de outros clientes na disponibilidade.

**Fluxo interno:** botão sempre visível “Novo agendamento” -> localizar/cadastrar cliente -> escolher serviço e profissional -> selecionar horário (incluindo encaixe interno) -> ver conflito/alertas -> confirmar -> atualizar calendário/cliente/financeiro/notificações de forma consistente.

Status de agendamento: `solicitado`, `confirmado`, `em_atendimento`, `concluido`, `cancelado`, `nao_compareceu`; registrar evento de `reagendado` no histórico. Definir transições válidas; não permitir retrocessos incoerentes sem privilégio/auditoria.

## 6. MÓDULO 02 — Clientes e histórico

CRUD completo e seguro de clientes com campos básicos de nome, contato, dados necessários, preferências de comunicação e modalidade. Validação e detecção de possíveis duplicidades. Pesquisa rápida por nome, telefone e e-mail. Histórico administrativo em **linha do tempo** contendo reservas, confirmações, cancelamentos, faltas, sessões concluídas, pacotes, pagamentos e documentos disponíveis; separar visualmente conteúdos sensíveis.

Ficha com abas simples: `Visão geral`, `Agendamentos`, `Pacotes e pagamentos`, `Formulários/documentos` e `Registros restritos` (esta última apenas quando autorizada). Ações rápidas: novo agendamento, enviar confirmação, adicionar observação administrativa, registrar pagamento, consultar pacote.

Não misturar recados administrativos (“prefere horário da tarde”) com registro de atendimento sigiloso. Evitar coleta desnecessária de dados pessoais. Permitir exportação controlada dos próprios dados e atendimento a solicitações de privacidade conforme fluxo autorizado.

## 7. MÓDULO 03 — Ficha inicial, formulários e registros de sessões

Criar **construtor de formulários** administrável (texto curto, longo, número, data, seleção, múltipla escolha, checkbox, campos obrigatórios e descrição), com rascunho, publicação e versionamento. Modelos possíveis: ficha inicial, questionário pré-atendimento, orientações, termo de ciência/consentimento e pesquisa de satisfação. Não predefinir perguntas médicas invasivas. Respostas com armazenamento protegido, autoria/data, referência à versão do formulário e acesso por permissão.

Registro por sessão, acessível à profissional autorizada: data, duração, tipo de atendimento, objetivo informado, observações pertinentes, atividades/técnicas, orientações, encaminhamentos e proposta de retorno. Campos configuráveis conforme atuação legal da proprietária. Permitir salvar rascunho e finalizar registro, preservando autoria e histórico de alterações/adendos; não permitir que edição apague silenciosamente histórico anterior. Anexos privados e consentimentos documentados. Não disponibilizar registros sigilosos automaticamente no portal do cliente. Processos de acesso/cópia sujeitos à política e à legislação aplicável.

**Importante:** não implementar diagnóstico automático, plano de tratamento gerado como orientação médica, alegações de cura nem interpretação automática de traumas. Caso a proprietária seja psicóloga, médica ou outra profissão regulamentada, validar depois as exigências específicas de registro e sigilo com a profissional/responsável técnico.

## 8. MÓDULO 04 — Financeiro e pacotes

Painel financeiro administrativo: serviços e preços, condições especiais/descontos com permissão, contas a receber, pagamentos efetuados/parciais, despesas, reembolsos, fluxo de caixa simples, fechamento diário/mensal, receita por serviço/profissional e inadimplência. Métodos de pagamento: Pix (registro manual inicialmente), dinheiro, cartão e outros configuráveis. Sempre distinguir **cobrança**, **pagamento efetivo** e **status do agendamento**.

Status financeiro: `nao_pago`, `parcialmente_pago`, `pago`, `reembolsado` (tratando estornos parciais de forma consistente). Valores em centavos inteiros, moeda BRL, com datas/histórico/auditoria; nunca usar float para dinheiro. Se não houver gateway real configurado, não mostrar “pagamento aprovado” fictício.

Pacotes: cadastrar oferta com nome, número de sessões, preço, serviço(s) elegíveis, prazo opcional e regras; vender/atribuir a cliente; controlar sessões contratadas/usadas/restantes, validade, ajustes autorizados e histórico de consumo. Abater sessão **somente conforme regra configurada** (por padrão após conclusão do atendimento); operação idempotente para não descontar duas vezes. Cancelamentos/reversões devem estornar o consumo com rastreabilidade.

Preparar adaptador para pagamento online (priorizar solução apropriada ao Brasil, como Mercado Pago, a decidir), incluindo estados da integração, webhooks assinados e idempotência. Não coletar/armazenar dados completos de cartão no sistema.

## 9. MÓDULO 05 — WhatsApp e automações

Criar central de notificações e automações configurável com templates, regras de disparo, opt-in/preferência de contato, status de envio, tentativas, erros e histórico por agendamento. Planejar integração oficial com **WhatsApp Business Platform/Cloud API**, respeitando templates autorizados, janelas e regras do provedor. Estruturar adaptador de integração para não acoplar a lógica de agendamentos ao fornecedor. Não usar bibliotecas não oficiais de WhatsApp como dependência obrigatória nem assumir que QR Code pessoal é a API oficial.

Eventos mínimos:
- Agendamento solicitado e confirmado.
- Reagendamento/cancelamento.
- Lembrete programável (ex.: 24 horas antes) apenas de reservas elegíveis.
- Aviso interno de nova solicitação/cancelamento.
- Vaga liberada: aviso à lista de espera conforme política/opt-in.
- Pacote próximo do fim.
- Mensagem de pós-sessão com orientações gerais aprovadas pela profissional, sem detalhes sigilosos.

Implementar fila/jobs com agendamento confiável, tentativas limitadas, deduplicação/idempotência, cancelamento de tarefas obsoletas e logs técnicos sem conteúdo sensível desnecessário. Se API/chave/conta não estiver configurada, o painel indica “Aguardando configuração” e permite pré-visualizar templates e eventos **sem marcar notificações como enviadas**. Nunca mencionar o motivo específico do atendimento em notificações sem justificativa e autorização adequadas.

## 10. MÓDULO 06 — Site público

Criar site acolhedor, rápido e elegante, com layout de alta qualidade e agendamento integrado. Páginas mínimas: `Início`, `Sobre a profissional`, `Serviços`, `Agendar`, `Perguntas frequentes`, `Contato`. Rodapé com informações institucionais, políticas, links e identificação profissional conforme aplicável. Home com chamada clara, resumo de serviços, explicação simples de como agendar e CTA “Agendar sessão”.

Área administrativa para editar dados reais de marca, nome da clínica, descrição, logo, contatos, WhatsApp, endereço, localização, horários, imagens, links e textos básicos, sem mexer em código. Serviços com nome, descrição cuidadosa, duração, modalidade, preço visível ou “sob consulta”, imagem opcional e status de publicação. SEO técnico básico, metadata, sitemap, `robots.txt`, performance e acessibilidade. Bloquear indexação de painel, formulários privados e páginas sensíveis. **Não inventar depoimentos, avaliações, credenciais ou resultados terapêuticos.** Utilizar conteúdo de exemplo claramente sinalizado até a proprietária fornecer o texto final.

## 11. MÓDULO 07 — Área do cliente

Portal intuitivo, mobile-first, com login seguro/OTP/link temporário de uso limitado, evitando senha obrigatória quando viável. Nunca colocar token persistente ou dados privados em URL compartilhável ou analytics. Validar identidade e propriedade dos registros no servidor.

Exibir: próximo agendamento, histórico de sessões com dados administrativos, solicitar cancelamento/reagendamento dentro da política, documentos/orientações explicitamente disponibilizados, termos/formulários pendentes, pagamentos, recibos administrativos quando cabíveis e saldo de pacotes. Atendimento online: mostrar link quando configurado e autorizado. Disponibilizar contato com a clínica via canal escolhido, sem chat interno complexo como requisito inicial. Nunca expor registros confidenciais ou dados de outros clientes.

## 12. MÓDULO 08 — Painel administrativo

Dashboard inicial com **informação acionável, não excesso de gráficos**:
- Sessões do dia e próximos atendimentos.
- Agendamentos solicitados aguardando confirmação.
- Clientes ativos (com definição/documentação da métrica).
- Receita recebida no período e valores a receber (somente para quem pode ver finanças).
- Alertas de pacotes próximos do fim, mensagens com falha e vagas em lista de espera.
- Ações rápidas: `Novo agendamento`, `Novo cliente`, `Bloquear horário`, `Registrar pagamento`.

Menu simples com ícones: `Visão geral`, `Agenda`, `Clientes`, `Atendimentos`, `Formulários`, `Financeiro`, `Pacotes`, `Automações`, `Relatórios`, `Site e configurações`. Ocultar por permissão ou agrupar menus secundários para evitar poluição. Busca global útil com controle de acesso. Todas as estatísticas precisam de consultas reais, sem métricas inventadas em produção.

## 13. Relatórios, configurações e integrações

Relatórios filtráveis por período, profissional, serviço, modalidade e status: agendamentos realizados, taxa de faltas/cancelamentos, ocupação da agenda, retornos, pacotes vendidos/saldo, recebimentos e pendências. Gráficos discretos e dados tabulares exportáveis em CSV, respeitando permissões. As estatísticas devem contar estados corretamente (ex.: solicitado não é concluído; receita recebida não é faturamento previsto).

Configurações: informações institucionais, dias de atendimento, feriados e exceções, tempo mínimo de antecedência, horários visíveis publicamente, modalidade online/presencial, confirmação automática/manual, política de cancelamento, duração e intervalo por serviço, textos de mensagens, canais, logotipo/cores, usuários e permissões, opções de pagamento, integração externa, política de dados e termos. Oferecer boas configurações iniciais, mas não assumir políticas comerciais não aprovadas.

Preparar integração futura com Google Calendar para sincronização **com autorização**, sem tratá-la como fonte única de verdade. Evitar laços de sincronização/duplicação. Preparar arquitetura para múltiplas unidades/profissionais sem implementar uma gestão multiempresa complexa antes da necessidade.

## 14. Modelo de dados (proposta inicial)

Desenhe entidades, relacionamentos, índices, constraints e migrations para, no mínimo:
- `clinics`, `clinic_settings`, `users/profiles`, `memberships/roles`, `professionals`.
- `services`, `service_modalities`, `working_hours`, `availability_exceptions`, `time_blocks`, `holidays`.
- `clients`, `client_contacts/preferences`, `appointments`, `appointment_events`, `waitlist_entries`.
- `form_templates`, `form_versions`, `form_fields`, `form_responses`, `consent_records`.
- `session_records`, `session_record_versions/addenda`, `private_documents`.
- `charges/receivables`, `payments`, `refunds`, `expenses`.
- `package_offerings`, `client_packages`, `package_usages`.
- `message_templates`, `notification_rules`, `notification_jobs`, `notification_attempts`, `integration_settings`.
- `public_site_content`, `audit_logs`, `privacy_requests`.

Use campos `created_at`, `updated_at`, autoria e relações onde cabíveis. Índices de busca e filtros. Chaves estrangeiras e constraints de integridade; operações transacionais críticas. Estruturar `clinic_id` quando pertinente para isolamento de contexto e futura expansão. Não crie tabelas irrelevantes por antecipação. Registros sigilosos e armazenamento de anexos devem ter políticas mais restritivas que cadastro geral. Documentar como dados financeiros, agendamentos, registros e permissões se relacionam.

## 15. Privacidade, LGPD e segurança — obrigatórios

A aplicação poderá lidar com **dados pessoais sensíveis**. Implemente segurança desde o início:
- Autenticação robusta e autorização por recurso/ação no servidor; menor privilégio.
- Supabase RLS (se adotado) corretamente configurada e testada; jamais expor `service_role` no frontend.
- Sessões protegidas, verificação de e-mail/OTP, proteção de rotas e rate limit em login, agendamento e endpoints públicos.
- HTTPS em produção, segredos só em variáveis de ambiente, sanitização e validação de entradas, proteção CSRF onde aplicável, tratamento de XSS/injeção.
- Uploads privados com tipos/tamanhos permitidos, URLs assinadas de curta duração e controle de acesso; não expor publicamente prontuários/formulários.
- Logs de auditoria de ações importantes, especialmente acessos/alterações a registros restritos, permissões, finanças e cancelamentos; sem registrar informações sensíveis em logs de debug.
- Estratégia de backup/recuperação, monitoramento e controle de erros sem vazamento de dados.
- Fluxos para direitos de titulares, exportação e tratamento de solicitações de exclusão/correção, sujeitos a regras legais de retenção e revisão humana.
- Termos de uso, política de privacidade e consentimentos específicos quando necessários; não presumir que todo tratamento exige consentimento como única base legal.
- Nunca mandar dados sigilosos para analytics, IA externa, e-mail/WhatsApp ou serviços de logs sem avaliação apropriada.

Código que envolve sigilo, prontuário, critérios profissionais, termos jurídicos e integração de pagamento deve ser explicitamente marcado para **validação da proprietária e de especialistas competentes** antes do lançamento. Não afirmar conformidade legal total apenas porque funcionalidades foram implementadas.

## 16. Critérios de aceitação verificáveis

Uma funcionalidade só está pronta quando sua interface, regras, banco, permissões, estados de erro e testes mínimos funcionarem. Validar ao menos estes cenários:
1. Visitante abre o site no celular, encontra um serviço e solicita horário que realmente está livre.
2. Duas pessoas tentam reservar o mesmo horário simultaneamente: apenas uma reserva válida é criada.
3. Administradora cadastra atendimento manual, faz encaixe fora da agenda pública e bloqueia férias.
4. Atendimentos bloqueados não aparecem para o público; edição/reagendamento atualiza disponibilidade e histórico.
5. Recepcionista consegue confirmar reserva, mas não acessar registros de sessão restritos.
6. Profissional encontra cliente, preenche formulário/registro e consulta suas sessões autorizadas.
7. Cliente autenticado não consegue abrir agendamento/documento de outro cliente, mesmo alterando ID na URL.
8. Pagamento parcial e reembolso refletem o saldo correto; o painel não confunde valores a receber com valores recebidos.
9. Pacote de cinco sessões passa a quatro após uma conclusão elegível; repetição do evento não desconta novamente.
10. Cancelamento invalida lembrete pendente; notificações sem integração ativa não aparecem como “enviadas”.
11. Dashboard e relatórios exibem valores verdadeiros e coerentes com o banco.
12. Site e painel funcionam em 360px, tablet e desktop, sem corte horizontal ou botões inacessíveis.
13. Acessos não autorizados retornam erro adequado sem expor conteúdo.
14. Formulário público com erros mostra mensagens claras e não perde dados digitados desnecessariamente.
15. Compilação, lint, migrations, testes relevantes e smoke test do navegador passam antes de declarar conclusão.

Criar dados de **demonstração somente em desenvolvimento**, claramente rotulados; nunca colocar nomes de pacientes reais, dados de saúde identificáveis ou segredos em seed.

## 17. Plano de execução por fases — complete todas, começando agora pela fase 1

O objetivo final é entregar **todos os módulos**, mas implemente incrementalmente sem sacrificar arquitetura e qualidade.

**Fase 0 — Reconhecimento e fundação (primeira ação):** inspecione o projeto e dependências; defina stack; crie `docs/visao-do-produto.md`, `docs/arquitetura.md`, `docs/modelo-de-dados.md`, `docs/roadmap.md`, `docs/checklist-funcionalidades.md` com checkboxes de cada item deste prompt. Configure design system, autenticação, banco, permissões iniciais, layouts público/admin e configuração de ambiente. Não fique preso apenas produzindo documentos: inicie código executável.

**Fase 1 — Operação diária utilizável:** site público, catálogo de serviços, disponibilidade e reservas online, agenda interna/manual, bloqueios e encaixes, cadastro de clientes, status, configurações básicas, dashboard e confirmação básica. Entregar fluxo ponta a ponta com persistência real e testes. É a primeira versão demonstrável à proprietária.

**Fase 2 — Gestão profissional:** construtor de formulários, respostas, registros restritos por sessão, documentos privados, financeiro, pagamentos manuais, pacotes, permissões completas, auditoria e relatórios base. Integrar fluxos e executar testes de autorização.

**Fase 3 — Experiência e automação:** portal do cliente, lista de espera, recorrências completas, central de WhatsApp com integração configurável, notificações programadas, integrações financeiras quando credenciais existirem, relatórios avançados e refinamento UX/performance.

**Fase 4 — Qualidade de lançamento:** revisar segurança, LGPD, acessibilidade, responsividade, testes E2E, fluxos de erro, logs, backups, envs, documentação de deploy e checklist de homologação da proprietária.

Em cada fase: implementar -> rodar -> testar -> corrigir -> registrar progresso real em `docs/checklist-funcionalidades.md` e `docs/decisoes.md`. Não trocar de fase com funcionalidades centrais quebradas. Se limites de contexto impedirem terminar tudo em uma execução, deixe o projeto compilando, com estado objetivo dos itens pendentes e instruções exatas para continuar; **não apagar módulos pendentes nem fingir conclusão**.

## 18. Requisitos de entrega e comunicação do agente

Antes de grandes alterações, faça um plano curto com arquitetura, tarefas e critérios. Depois **execute**, crie/edite arquivos e faça as verificações no terminal/navegador. Evite pedir confirmação a cada detalhe: use defaults seguros e documentados para campos não especificados; peça somente decisões que realmente dependam da proprietária (ex.: formação profissional, política de cancelamento, preço, textos institucionais, credenciais, domínio, gateway, provedor de WhatsApp). Mantenha essas pendências em `docs/pendencias-da-clinica.md`, sem bloquear a criação do restante.

Ao terminar cada entrega, apresente:
- Funcionalidades efetivamente implementadas (sem exagero).
- Arquivos/rotas/tabelas principais criados ou alterados.
- Comandos usados e testes que passaram/falharam.
- Como iniciar a aplicação e acessar os fluxos em desenvolvimento.
- Quais configurações externas ainda estão pendentes.
- Próximos itens do checklist, na ordem priorizada.

**PRIMEIRA TAREFA AGORA:** examine o repositório e comece imediatamente a implementar a Fase 0 e a Fase 1 com foco em design system branco/azul, estrutura de navegação responsiva, autenticação, banco de dados, serviços, cadastro de clientes e agenda pública/interna funcionando. Não responda apenas com uma proposta textual; avance no código e execute o projeto.
