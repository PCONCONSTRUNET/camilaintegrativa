import 'server-only';

import crypto, { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { getDatabase, IDS } from '@/lib/db';
import { PROFESSIONAL_INFO } from '@/lib/domain';
import { formatCpf, formatPhone } from '@/lib/utils';

export type ContractOrigin = 'agendamento' | 'grupo' | 'avulso';
export type ContractStatus = 'pendente' | 'assinado';

export interface ClinicContractTemplate {
  title: string;
  body: string;
  professionalName: string;
  professionalCpf: string;
  professionalCredential: string;
  professionalSignatureData: string; // data URL PNG ou texto vazio (usa assinatura cursiva padrão)
  updatedAt: string;
}

export interface SignedContractRecord {
  id: string;
  token: string;
  origin: ContractOrigin;
  status: ContractStatus;
  appointmentId: string | null;
  clientId: string | null;
  clientName: string;
  clientCpf: string;
  clientBirthDate: string;
  clientPhone: string;
  clientEmail: string;
  serviceName: string;
  sessionDate: string;
  sessionTime: string;
  modality: string;
  contractTitle: string;
  contractBodySnapshot: string;
  professionalName: string;
  professionalCpf: string;
  professionalCredential: string;
  professionalSignatureData: string;
  acceptedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export const DEFAULT_PROFESSIONAL_CPF = '08495423910';

export const CONTRACT_DOCUMENT_VERSION = 'v2.1';

export const DEFAULT_CONTRACT_TITLE =
  'Contrato de Prestação de Serviços Terapêuticos, Agendamento, Cancelamento e Reembolso';

const LEGACY_DRAFT_BODY_PREFIX = 'Pelo presente instrumento particular de prestação de serviços terapêuticos:';
const LEGACY_17_CLAUSE_PREFIX = 'CONTRATADA (PROPRIETÁRIA): {{NOME_PROFISSIONAL}}, CPF nº {{CPF_PROFISSIONAL}}, responsável pelos atendimentos de Hipnose Clínica Multidimensional Integrativa, registro profissional informado {{REGISTRO_PROFISSIONAL}}, doravante denominada CONTRATADA.';

export const DEFAULT_CONTRACT_BODY = `CONTRATADA: {{NOME_PROFISSIONAL}}, CPF nº {{CPF_PROFISSIONAL}}, responsável pelos atendimentos sob a denominação Camila Machado — Hipnose Clínica Multidimensional Integrativa, registro profissional informado {{REGISTRO_PROFISSIONAL}}, com endereço profissional em {{CIDADE}}, doravante denominada CONTRATADA.

CONTRATANTE: {{NOME_CLIENTE}}, CPF nº {{CPF_CLIENTE}}, data de nascimento {{DATA_NASCIMENTO}}, pessoa física devidamente identificada no sistema de agendamento para o atendimento {{SERVICO}} ({{MODALIDADE}}) em {{DATA_ATENDIMENTO}} às {{HORARIO_ATENDIMENTO}}, doravante denominada CONTRATANTE.

As partes celebram o presente Contrato de Prestação de Serviços Terapêuticos, regido pelo Código Civil Brasileiro, Código de Defesa do Consumidor, Lei Geral de Proteção de Dados Pessoais e demais disposições legais aplicáveis.

CLÁUSULA 1ª — DO OBJETO
1.1. O presente contrato estabelece as condições para contratação, pagamento, agendamento, reagendamento, cancelamento, reembolso e realização dos serviços terapêuticos disponibilizados pela CONTRATADA.
1.2. O atendimento contratado será individualmente identificado no comprovante de agendamento, incluindo serviço escolhido ({{SERVICO}}), valor, duração estimada, modalidade presencial ou online ({{MODALIDADE}}), data ({{DATA_ATENDIMENTO}}) e horário ({{HORARIO_ATENDIMENTO}}).
1.3. Os atendimentos serão realizados conforme a formação, qualificação e os limites legais de atuação da CONTRATADA.
1.4. Os serviços não constituem promessa de cura ou garantia de resultado terapêutico específico, nem substituem atendimento médico ou psicológico quando necessário.

CLÁUSULA 2ª — DA CONTRATAÇÃO E DO ACEITE
2.1. A contratação poderá ocorrer presencialmente, por telefone, WhatsApp, site ou plataforma eletrônica.
2.2. O CONTRATANTE deverá receber informações claras sobre o serviço, preço, duração, condições de pagamento e políticas de cancelamento antes de confirmar a contratação.
2.3. O aceite eletrônico deverá ocorrer mediante manifestação expressa e voluntária do CONTRATANTE.
2.4. A assinatura eletrônica não altera, por si só, a natureza presencial ou à distância da contratação.
2.5. O comprovante de agendamento e a versão do contrato aceita eletronicamente integrarão este instrumento.

CLÁUSULA 3ª — DOS PAGAMENTOS E DA RESERVA DE HORÁRIO
3.1. Os valores serão informados previamente ao CONTRATANTE.
3.2. O pagamento poderá ser antecipado, integral ou parcial, conforme as condições apresentadas no momento da contratação.
3.3. O agendamento confirmado representa a reserva de horário específico na agenda da CONTRATADA.
3.4. O CONTRATANTE reconhece que a reserva pode impedir a disponibilização do mesmo horário para outros clientes.
3.5. Eventuais taxas adicionais deverão ser previamente informadas, não sendo admitidas cobranças ocultas.

CLÁUSULA 4ª — DO DIREITO LEGAL DE ARREPENDIMENTO
4.1. Nas contratações realizadas fora do estabelecimento comercial, inclusive pela internet, telefone ou WhatsApp, será respeitado o direito de arrependimento estabelecido no artigo 49 do Código de Defesa do Consumidor.
4.2. O prazo legal será de 7 (sete) dias, observadas as regras legais de contagem a partir da assinatura ou do recebimento do serviço, conforme aplicável.
4.3. O exercício válido desse direito assegurará a restituição integral dos valores pagos, sem desconto de multa ou taxa administrativa.
4.4. A política contratual de cancelamento não poderá restringir o exercício de direitos legalmente obrigatórios.
4.5. Nas contratações concluídas presencialmente no estabelecimento, não haverá direito automático de arrependimento com fundamento exclusivo no artigo 49, permanecendo assegurados os demais direitos do consumidor.
4.6. Situações envolvendo serviços já iniciados ou prestados durante o prazo de arrependimento serão avaliadas conforme a legislação aplicável, sem renúncia antecipada de direitos.

CLÁUSULA 5ª — DO CANCELAMENTO COM ANTECEDÊNCIA IGUAL OU SUPERIOR A 48 HORAS
5.1. Fora das hipóteses de restituição integral obrigatória, o CONTRATANTE poderá solicitar o cancelamento voluntário da sessão com antecedência igual ou superior a 48 (quarenta e oito) horas do horário agendado.
5.2. Nessa hipótese, poderá ser aplicada multa contratual compensatória de até 12% (doze por cento) do valor da sessão cancelada.
5.3. A multa deverá ser previamente informada, proporcional à finalidade contratual e compatível com a legislação de proteção ao consumidor.
5.4. Quando juridicamente aplicável a retenção integral de 12%, o CONTRATANTE receberá reembolso de 88% do valor pago pela sessão cancelada.
5.5. A penalidade poderá ser reduzida ou afastada quando exigido pelas circunstâncias do caso e pela legislação.

CLÁUSULA 6ª — DO CANCELAMENTO COM MENOS DE 48 HORAS
6.1. O cancelamento voluntário solicitado com antecedência inferior a 48 (quarenta e oito) horas será considerado cancelamento tardio.
6.2. Considerando a reserva do horário e a dificuldade de disponibilizá-lo a terceiros, poderá ser aplicada multa contratual compensatória de até 19% (dezenove por cento) do valor da sessão cancelada.
6.3. A penalidade dependerá de sua admissibilidade jurídica, proporcionalidade e das circunstâncias concretas do cancelamento.
6.4. Quando juridicamente aplicável a retenção integral de 19%, o CONTRATANTE receberá reembolso de 81% do valor pago pela sessão cancelada.
6.5. A multa de 19% substituirá a multa de 12%, sendo expressamente proibida a cumulação das duas penalidades sobre o mesmo cancelamento.
6.6. A CONTRATADA considerará circunstâncias excepcionais justificadas e os limites legais antes da aplicação da retenção.
6.7. O cancelamento tardio não implicará perda automática do valor integral pago.

CLÁUSULA 7ª — DA PROPORCIONALIDADE DAS MULTAS
7.1. As multas previstas neste contrato possuem finalidade compensatória e não poderão representar vantagem manifestamente excessiva para a CONTRATADA.
7.2. Os percentuais de 12% e 19% constituem limites contratuais propostos, sujeitos à legislação aplicável e à possibilidade de revisão judicial.
7.3. As penalidades não poderão ser aplicadas nas hipóteses em que a legislação determine restituição integral.
7.4. A CONTRATADA deverá observar os princípios da boa-fé, razoabilidade e equilíbrio contratual.
7.5. Não será permitida cobrança duplicada pelo mesmo fato.

CLÁUSULA 8ª — DO REAGENDAMENTO
8.1. O CONTRATANTE poderá solicitar reagendamento sem cobrança adicional quando comunicar a CONTRATADA com antecedência mínima de 72 (setenta e duas) horas do início da sessão.
8.2. A definição de novo horário ficará sujeita à disponibilidade da agenda.
8.3. Pedidos realizados com antecedência inferior a 72 horas serão analisados individualmente, podendo ser oferecidas alternativas conforme a disponibilidade da CONTRATADA.
8.4. Eventual cobrança relacionada a reagendamento tardio deverá ser previamente informada, proporcional e juridicamente admissível.
8.5. O reagendamento não poderá ser imposto como substituição obrigatória a reembolso legalmente devido.

CLÁUSULA 9ª — DO NÃO COMPARECIMENTO
9.1. O não comparecimento do CONTRATANTE no horário reservado, sem comunicação prévia, será registrado como ausência.
9.2. A ausência injustificada poderá ser tratada como cancelamento tardio para fins de análise de compensação contratual, respeitado o limite proposto de 19% e os demais requisitos legais.
9.3. Não haverá retenção integral automática do pagamento exclusivamente em razão da ausência.
9.4. Circunstâncias excepcionais, caso fortuito ou força maior serão avaliados individualmente.

CLÁUSULA 10ª — DOS ATRASOS
10.1. O CONTRATANTE deverá comparecer ou acessar o atendimento online no horário estabelecido.
10.2. Eventuais atrasos poderão reduzir o período disponível da sessão, sem obrigação de prorrogação automática além do horário reservado.
10.3. Atrasos ou impossibilidades de atendimento imputáveis à CONTRATADA deverão ser solucionados sem penalização do CONTRATANTE.
10.4. Quando a prestação do serviço se tornar inviável, serão avaliadas as alternativas legalmente cabíveis, incluindo reagendamento e restituição.

CLÁUSULA 11ª — DOS PACOTES DE ATENDIMENTO
11.1. A contratação de pacotes deverá identificar o número de sessões, preço total, valor correspondente a cada atendimento e condições de utilização.
11.2. Em caso de cancelamento do pacote, serão considerados os serviços efetivamente prestados e os valores relativos às sessões ainda não realizadas.
11.3. As multas contratuais serão calculadas, quando juridicamente cabíveis, sobre o valor correspondente às sessões efetivamente afetadas pelo cancelamento, evitando cobranças duplicadas.
11.4. Não haverá perda automática de todos os valores pagos por sessões não realizadas.
11.5. Os direitos legais de arrependimento e restituição serão preservados.

CLÁUSULA 12ª — DOS CANCELAMENTOS PELA CONTRATADA
12.1. Caso a CONTRATADA não possa realizar o atendimento, deverá informar o CONTRATANTE com antecedência razoável, sempre que possível.
12.2. O CONTRATANTE poderá optar por reagendamento sem cobrança adicional ou restituição dos valores correspondentes ao serviço não prestado, conforme a legislação.
12.3. Não será aplicada multa ao CONTRATANTE em razão de cancelamento imputável à CONTRATADA.
12.4. Permanecem preservados os demais direitos legalmente assegurados ao consumidor.

CLÁUSULA 13ª — DAS OBRIGAÇÕES DA CONTRATADA
13.1. Prestar os serviços contratados com diligência, responsabilidade, boa-fé e observância dos limites profissionais aplicáveis.
13.2. Informar previamente as características dos atendimentos e as condições de contratação.
13.3. Preservar o sigilo das informações obtidas durante os atendimentos, ressalvadas as hipóteses legais.
13.4. Não prometer resultados terapêuticos específicos ou garantidos.
13.5. Respeitar os direitos dos consumidores, inclusive quanto à informação, segurança e qualidade dos serviços.
13.6. Manter canal adequado para solicitações de cancelamento, reagendamento e esclarecimento de dúvidas.

CLÁUSULA 14ª — DAS OBRIGAÇÕES DO CONTRATANTE
14.1. Fornecer informações verdadeiras e atualizadas necessárias à prestação dos serviços.
14.2. Respeitar os horários e as condições de atendimento.
14.3. Comunicar pedidos de cancelamento ou reagendamento pelos canais disponibilizados.
14.4. Efetuar os pagamentos conforme as condições previamente aceitas.
14.5. Informar circunstâncias relevantes à realização segura do atendimento.
14.6. Respeitar as orientações pertinentes à prestação dos serviços, preservada sua liberdade de escolha.

CLÁUSULA 15ª — DA PRIVACIDADE E PROTEÇÃO DE DADOS PESSOAIS
15.1. Os dados pessoais serão tratados para finalidades legítimas relacionadas à contratação, identificação, agendamento, realização dos atendimentos, pagamentos, cumprimento de obrigações legais e exercício regular de direitos, observadas as bases legais aplicáveis.
15.2. Informações referentes à saúde e ao histórico terapêutico serão protegidas conforme sua natureza sensível e as disposições da Lei Geral de Proteção de Dados Pessoais.
15.3. O acesso às informações será limitado a pessoas autorizadas e aos prestadores de serviços necessários, observadas as obrigações legais de proteção dos dados.
15.4. O CONTRATANTE poderá exercer os direitos previstos na LGPD por meio do canal de privacidade disponibilizado pela CONTRATADA.
15.5. As informações completas sobre o tratamento de dados deverão constar de aviso de privacidade acessível ao CONTRATANTE.

CLÁUSULA 16ª — DOS REEMBOLSOS
16.1. As solicitações de reembolso deverão ser realizadas pelos canais oficiais disponibilizados pela CONTRATADA.
16.2. O pedido deverá identificar a contratação e permitir a verificação da data, do horário e do motivo do cancelamento.
16.3. Os valores devidos serão restituídos pelo meio de pagamento original sempre que possível, respeitados os prazos e procedimentos legalmente aplicáveis.
16.4. Quando houver direito legal de arrependimento, serão observadas as regras de restituição integral e imediata previstas na legislação, inclusive quanto à comunicação necessária ao intermediador de pagamento.
16.5. O CONTRATANTE receberá confirmação do recebimento da solicitação e informações sobre o procedimento de restituição.
16.6. Nenhuma taxa contratual prevalecerá sobre hipótese legal de restituição integral.

CLÁUSULA 17ª — DAS SITUAÇÕES EXCEPCIONAIS
17.1. Emergências médicas, caso fortuito, força maior ou outras circunstâncias relevantes serão analisadas individualmente.
17.2. A CONTRATADA poderá solicitar documentação razoavelmente necessária à análise, respeitando a privacidade e a proteção dos dados pessoais.
17.3. As partes buscarão solução proporcional e equilibrada, privilegiando o reagendamento quando adequado e voluntariamente aceito.
17.4. Nenhuma disposição desta cláusula poderá afastar direitos legalmente assegurados.

CLÁUSULA 18ª — DA ASSINATURA ELETRÔNICA
18.1. O presente contrato poderá ser celebrado por meio eletrônico, mediante manifestação expressa das partes.
18.2. O CONTRATANTE deverá ter acesso integral ao conteúdo antes de confirmar sua concordância.
18.3. A plataforma poderá registrar, conforme sua implementação técnica:
- Identificação do CONTRATANTE;
- Data e hora do aceite;
- Identificador único do contrato;
- Versão integral do documento;
- Método utilizado para autenticação;
- Registro da manifestação de concordância;
- Elementos técnicos de integridade e auditoria.
18.4. A assinatura da CONTRATADA poderá ser aplicada eletronicamente mediante autorização válida e mecanismo adequado.
18.5. A assinatura do CONTRATANTE deverá corresponder a uma manifestação efetiva de vontade, não podendo ser presumida ou gerada sem sua autorização.
18.6. Uma cópia integral do documento assinado deverá ser disponibilizada ao CONTRATANTE.

CLÁUSULA 19ª — DA RESPONSABILIDADE E DOS RESULTADOS
19.1. A CONTRATADA compromete-se a utilizar métodos compatíveis com os serviços efetivamente oferecidos e com sua qualificação profissional.
19.2. O CONTRATANTE reconhece que as respostas individuais aos atendimentos podem variar.
19.3. A ausência de resultado subjetivamente esperado não caracteriza, isoladamente, falha na prestação do serviço.
19.4. Permanecem preservadas as responsabilidades legais da CONTRATADA por eventuais defeitos ou irregularidades na prestação dos serviços.

CLÁUSULA 20ª — DA RESOLUÇÃO DE CONFLITOS
20.1. As partes procurarão solucionar eventuais divergências inicialmente por meio de comunicação direta e de boa-fé.
20.2. A tentativa de solução amigável não impedirá o acesso aos órgãos de defesa do consumidor ou ao Poder Judiciário.
20.3. Será respeitada a competência judicial estabelecida pela legislação aplicável, especialmente as normas de proteção do consumidor.

CLÁUSULA 21ª — DAS DISPOSIÇÕES FINAIS
21.1. O presente contrato será disponibilizado antes da confirmação da contratação.
21.2. Alterações relevantes das condições contratuais deverão ser comunicadas previamente e submetidas à aceitação quando necessário.
21.3. Alterações posteriores não prejudicarão retroativamente direitos adquiridos pelo CONTRATANTE.
21.4. A eventual invalidade de determinada cláusula não prejudicará automaticamente as demais disposições juridicamente independentes.
21.5. Os comprovantes de agendamento, pagamento, cancelamento, reagendamento e aceite eletrônico integrarão os registros da contratação.
21.6. O presente instrumento produzirá efeitos a partir da aceitação válida pelas partes.
21.7. Nenhuma disposição deste contrato constituirá renúncia antecipada aos direitos assegurados pela legislação brasileira.`;

let tablesInitialized = false;

export async function ensureContractsTables() {
  if (tablesInitialized) return;
  try {
    const db = getDatabase();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS clinic_contract_settings (
        clinic_id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'Contrato de Prestação de Serviços Terapêuticos',
        body TEXT NOT NULL DEFAULT '',
        professional_name TEXT NOT NULL DEFAULT 'Camila Machado',
        professional_cpf TEXT NOT NULL DEFAULT '',
        professional_credential TEXT NOT NULL DEFAULT 'CRT-SBHP/SC 805',
        professional_signature_data TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      )
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS signed_contracts (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        origin TEXT NOT NULL DEFAULT 'agendamento',
        status TEXT NOT NULL DEFAULT 'assinado',
        appointment_id TEXT,
        client_id TEXT,
        client_name TEXT NOT NULL DEFAULT '',
        client_cpf TEXT NOT NULL DEFAULT '',
        client_birth_date TEXT NOT NULL DEFAULT '',
        client_phone TEXT NOT NULL DEFAULT '',
        client_email TEXT NOT NULL DEFAULT '',
        service_name TEXT NOT NULL DEFAULT '',
        session_date TEXT NOT NULL DEFAULT '',
        session_time TEXT NOT NULL DEFAULT '',
        modality TEXT NOT NULL DEFAULT 'presencial',
        contract_title TEXT NOT NULL DEFAULT '',
        contract_body_snapshot TEXT NOT NULL DEFAULT '',
        professional_name TEXT NOT NULL DEFAULT 'Camila Machado',
        professional_cpf TEXT NOT NULL DEFAULT '',
        professional_credential TEXT NOT NULL DEFAULT 'CRT-SBHP/SC 805',
        professional_signature_data TEXT NOT NULL DEFAULT '',
        accepted_at TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL
      )
    `);

    await db
      .exec(`ALTER TABLE signed_contracts ADD COLUMN client_birth_date TEXT NOT NULL DEFAULT ''`)
      .catch(() => null);

    tablesInitialized = true;
  } catch (err) {
    console.error('[contracts] Erro ao inicializar tabelas de contrato:', err);
  }
}

export async function getContractTemplate(): Promise<ClinicContractTemplate> {
  await ensureContractsTables();
  try {
    const db = getDatabase();
    const row = (await db
      .prepare(`
        SELECT title, body, professional_name, professional_cpf, professional_credential, professional_signature_data, updated_at
        FROM clinic_contract_settings
        WHERE clinic_id = ?
      `)
      .get(IDS.clinic)) as
      | {
          title: string;
          body: string;
          professional_name: string;
          professional_cpf: string;
          professional_credential: string;
          professional_signature_data: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return {
        title: DEFAULT_CONTRACT_TITLE,
        body: DEFAULT_CONTRACT_BODY,
        professionalName: PROFESSIONAL_INFO.name,
        professionalCpf: DEFAULT_PROFESSIONAL_CPF,
        professionalCredential: PROFESSIONAL_INFO.credentialCode,
        professionalSignatureData: '',
        updatedAt: new Date().toISOString(),
      };
    }

    const isLegacyDraft =
      row.body?.trim().startsWith(LEGACY_DRAFT_BODY_PREFIX) ||
      row.body?.trim().startsWith(LEGACY_17_CLAUSE_PREFIX);

    return {
      title: isLegacyDraft ? DEFAULT_CONTRACT_TITLE : row.title || DEFAULT_CONTRACT_TITLE,
      body: !row.body?.trim() || isLegacyDraft ? DEFAULT_CONTRACT_BODY : row.body,
      professionalName: row.professional_name || PROFESSIONAL_INFO.name,
      professionalCpf: row.professional_cpf?.trim() ? row.professional_cpf : DEFAULT_PROFESSIONAL_CPF,
      professionalCredential: row.professional_credential || PROFESSIONAL_INFO.credentialCode,
      professionalSignatureData: row.professional_signature_data || '',
      updatedAt: row.updated_at || new Date().toISOString(),
    };
  } catch (err) {
    console.error('[contracts] Erro ao carregar template de contrato:', err);
    return {
      title: DEFAULT_CONTRACT_TITLE,
      body: DEFAULT_CONTRACT_BODY,
      professionalName: PROFESSIONAL_INFO.name,
      professionalCpf: DEFAULT_PROFESSIONAL_CPF,
      professionalCredential: PROFESSIONAL_INFO.credentialCode,
      professionalSignatureData: '',
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function saveContractTemplate(
  input: Partial<Omit<ClinicContractTemplate, 'updatedAt'>>
): Promise<ClinicContractTemplate> {
  await ensureContractsTables();
  const current = await getContractTemplate();

  const title = input.title !== undefined ? input.title.trim() || DEFAULT_CONTRACT_TITLE : current.title;
  const body = input.body !== undefined ? input.body.trim() || DEFAULT_CONTRACT_BODY : current.body;
  const professionalName =
    input.professionalName !== undefined
      ? input.professionalName.trim() || PROFESSIONAL_INFO.name
      : current.professionalName;
  const professionalCpf =
    input.professionalCpf !== undefined ? input.professionalCpf.trim() : current.professionalCpf;
  const professionalCredential =
    input.professionalCredential !== undefined
      ? input.professionalCredential.trim() || PROFESSIONAL_INFO.credentialCode
      : current.professionalCredential;
  const professionalSignatureData =
    input.professionalSignatureData !== undefined
      ? input.professionalSignatureData
      : current.professionalSignatureData;
  const updatedAt = new Date().toISOString();

  const db = getDatabase();
  await db
    .prepare(`
      INSERT INTO clinic_contract_settings (
        clinic_id, title, body, professional_name, professional_cpf, professional_credential, professional_signature_data, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(clinic_id) DO UPDATE SET
        title = excluded.title,
        body = excluded.body,
        professional_name = excluded.professional_name,
        professional_cpf = excluded.professional_cpf,
        professional_credential = excluded.professional_credential,
        professional_signature_data = excluded.professional_signature_data,
        updated_at = excluded.updated_at
    `)
    .run(
      IDS.clinic,
      title,
      body,
      professionalName,
      professionalCpf,
      professionalCredential,
      professionalSignatureData,
      updatedAt
    );

  return {
    title,
    body,
    professionalName,
    professionalCpf,
    professionalCredential,
    professionalSignatureData,
    updatedAt,
  };
}

function formatDateBr(val?: string | null): string {
  if (!val) {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(val);
  if (Number.isNaN(dt.getTime())) return val;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(dt);
}

function formatTimeBr(iso?: string | null): string {
  const dt = iso ? new Date(iso) : new Date();
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(dt);
}

export function renderContractText(
  templateBody: string,
  vars: {
    clientName?: string | null;
    clientCpf?: string | null;
    clientBirthDate?: string | null;
    clientPhone?: string | null;
    clientEmail?: string | null;
    serviceName?: string | null;
    sessionDate?: string | null;
    sessionTime?: string | null;
    modality?: string | null;
    professionalName?: string | null;
    professionalCpf?: string | null;
    professionalCredential?: string | null;
    acceptedAt?: string | null;
  }
): string {
  const nowIso = vars.acceptedAt || new Date().toISOString();
  const formattedClientCpf = vars.clientCpf ? formatCpf(vars.clientCpf) : 'Não informado';
  const formattedProfCpf = vars.professionalCpf ? formatCpf(vars.professionalCpf) : 'Não informado';
  const formattedPhone = vars.clientPhone ? formatPhone(vars.clientPhone) : 'Não informado';
  const formattedBirthDate = vars.clientBirthDate ? formatDateBr(vars.clientBirthDate) : 'Não informado';
  const modalityLabel =
    vars.modality === 'online'
      ? 'Online'
      : vars.modality === 'presencial'
      ? 'Presencial'
      : vars.modality || 'Presencial';

  const replacements: Record<string, string> = {
    '{{NOME_CLIENTE}}': vars.clientName?.trim() || '___________________________',
    '{{CPF_CLIENTE}}': formattedClientCpf,
    '{{DATA_NASCIMENTO}}': formattedBirthDate,
    '{{TELEFONE_CLIENTE}}': formattedPhone,
    '{{EMAIL_CLIENTE}}': vars.clientEmail?.trim() || 'Não informado',
    '{{SERVICO}}': vars.serviceName?.trim() || 'Atendimento Terapêutico',
    '{{DATA_ATENDIMENTO}}': vars.sessionDate ? formatDateBr(vars.sessionDate) : formatDateBr(nowIso),
    '{{HORARIO_ATENDIMENTO}}': vars.sessionTime?.trim() || 'A combinar',
    '{{MODALIDADE}}': modalityLabel,
    '{{DATA_ASSINATURA}}': formatDateBr(nowIso),
    '{{HORA_ASSINATURA}}': formatTimeBr(nowIso),
    '{{CIDADE}}': PROFESSIONAL_INFO.city,
    '{{NOME_PROFISSIONAL}}': vars.professionalName?.trim() || PROFESSIONAL_INFO.name,
    '{{CPF_PROFISSIONAL}}': formattedProfCpf,
    '{{REGISTRO_PROFISSIONAL}}': vars.professionalCredential?.trim() || PROFESSIONAL_INFO.credentialCode,
  };

  let out = templateBody;
  for (const [key, val] of Object.entries(replacements)) {
    out = out.split(key).join(val);
  }
  return out;
}

function mapContractRow(row: Record<string, unknown>): SignedContractRecord {
  return {
    id: String(row.id),
    token: String(row.token),
    origin: (row.origin as ContractOrigin) || 'agendamento',
    status: (row.status as ContractStatus) || 'assinado',
    appointmentId: row.appointment_id ? String(row.appointment_id) : null,
    clientId: row.client_id ? String(row.client_id) : null,
    clientName: String(row.client_name || ''),
    clientCpf: String(row.client_cpf || ''),
    clientBirthDate: String(row.client_birth_date || ''),
    clientPhone: String(row.client_phone || ''),
    clientEmail: String(row.client_email || ''),
    serviceName: String(row.service_name || ''),
    sessionDate: String(row.session_date || ''),
    sessionTime: String(row.session_time || ''),
    modality: String(row.modality || 'presencial'),
    contractTitle: String(row.contract_title || DEFAULT_CONTRACT_TITLE),
    contractBodySnapshot: String(row.contract_body_snapshot || ''),
    professionalName: String(row.professional_name || PROFESSIONAL_INFO.name),
    professionalCpf: String(row.professional_cpf || ''),
    professionalCredential: String(row.professional_credential || PROFESSIONAL_INFO.credentialCode),
    professionalSignatureData: String(row.professional_signature_data || ''),
    acceptedAt: row.accepted_at ? String(row.accepted_at) : null,
    ipAddress: row.ip_address ? String(row.ip_address) : null,
    userAgent: row.user_agent ? String(row.user_agent) : null,
    createdAt: String(row.created_at),
  };
}

async function resolveOrCreateClientForStandaloneContract(input: {
  name: string;
  cpf: string;
  birthDate?: string;
  phone?: string;
  email?: string;
}): Promise<string | null> {
  const db = getDatabase();
  const cleanCpf = input.cpf.replace(/\D/g, '');
  const cleanBirthDate = (input.birthDate || '').trim();
  const cleanPhone = (input.phone || '').replace(/\D/g, '');
  const cleanEmail = (input.email || '').trim().toLowerCase();

  try {
    if (cleanCpf.length === 11) {
      const byCpf = (await db
        .prepare(`
          SELECT c.id FROM clients c
          JOIN client_records cr ON cr.client_id = c.id
          WHERE c.clinic_id = ? AND REPLACE(REPLACE(REPLACE(cr.cpf, '.', ''), '-', ''), ' ', '') = ?
          LIMIT 1
        `)
        .get(IDS.clinic, cleanCpf)) as { id: string } | undefined;
      if (byCpf?.id) {
        if (cleanBirthDate) {
          await db
            .prepare("UPDATE client_records SET birth_date = COALESCE(NULLIF(birth_date, ''), ?), updated_at = ? WHERE client_id = ?")
            .run(cleanBirthDate, new Date().toISOString(), byCpf.id)
            .catch(() => null);
        }
        return byCpf.id;
      }
    }

    if (cleanPhone.length >= 8) {
      const byPhone = (await db
        .prepare(`
          SELECT id FROM clients
          WHERE clinic_id = ?
            AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '(', ''), ')', ''), '-', ''), ' ', ''), '+', '') LIKE '%' || ?
          LIMIT 1
        `)
        .get(IDS.clinic, cleanPhone.slice(-8))) as { id: string } | undefined;
      if (byPhone?.id) {
        if (cleanCpf.length === 11 || cleanBirthDate) {
          const nowRec = new Date().toISOString();
          const hasRec = await db.prepare('SELECT client_id FROM client_records WHERE client_id = ?').get(byPhone.id);
          if (hasRec) {
            await db
              .prepare(
                "UPDATE client_records SET cpf = COALESCE(NULLIF(cpf, ''), ?), birth_date = COALESCE(NULLIF(birth_date, ''), ?), updated_at = ? WHERE client_id = ?"
              )
              .run(cleanCpf || null, cleanBirthDate || null, nowRec, byPhone.id)
              .catch(() => null);
          } else {
            await db
              .prepare('INSERT INTO client_records (client_id, cpf, birth_date, updated_at) VALUES (?, ?, ?, ?)')
              .run(byPhone.id, cleanCpf || null, cleanBirthDate || null, nowRec)
              .catch(() => null);
          }
        }
        return byPhone.id;
      }
    }

    const newClientId = randomUUID();
    await db
      .prepare(`
        INSERT INTO clients (id, clinic_id, name, phone, email, status, administrative_notes)
        VALUES (?, ?, ?, ?, ?, 'ativo', ?)
      `)
      .run(
        newClientId,
        IDS.clinic,
        input.name.trim(),
        cleanPhone || '',
        cleanEmail || null,
        'Cadastrado automaticamente ao assinar contrato avulso'
      );

    if (cleanCpf.length === 11 || cleanBirthDate) {
      await db
        .prepare('INSERT INTO client_records (client_id, cpf, birth_date, updated_at) VALUES (?, ?, ?, ?)')
        .run(newClientId, cleanCpf || null, cleanBirthDate || null, new Date().toISOString())
        .catch(() => null);
    }

    return newClientId;
  } catch (err) {
    console.warn('[contracts] Falha não bloqueante ao vincular cliente:', err);
    return null;
  }
}

async function registerSignedContractInClientDocuments(contract: SignedContractRecord) {
  if (!contract.clientId) return;
  try {
    const db = getDatabase();
    await db
      .prepare(`
        INSERT INTO client_documents (
          id, client_id, title, document_type, document_type_label, status, content, signed_at, created_at
        ) VALUES (?, ?, ?, 'termo_consentimento', 'Contrato Assinado', 'assinado', ?, ?, ?)
      `)
      .run(
        randomUUID(),
        contract.clientId,
        `${contract.contractTitle} (${formatDateBr(contract.sessionDate)})`,
        contract.contractBodySnapshot,
        contract.acceptedAt || contract.createdAt,
        contract.createdAt
      );
  } catch (err) {
    console.warn('[contracts] Não foi possível espelhar em client_documents:', err);
  }
}

export async function recordSignedContract(input: {
  origin: ContractOrigin;
  appointmentId?: string | null;
  clientId?: string | null;
  clientName: string;
  clientCpf: string;
  clientBirthDate?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  serviceName?: string | null;
  sessionDate?: string | null;
  sessionTime?: string | null;
  modality?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<SignedContractRecord> {
  await ensureContractsTables();
  const template = await getContractTemplate();
  const now = new Date().toISOString();
  const id = `ctr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const token = crypto.randomBytes(8).toString('hex');

  const cleanCpf = (input.clientCpf || '').replace(/\D/g, '');
  const cleanBirthDate = (input.clientBirthDate || '').trim();
  const snapshot = renderContractText(template.body, {
    clientName: input.clientName,
    clientCpf: cleanCpf,
    clientBirthDate: cleanBirthDate,
    clientPhone: input.clientPhone,
    clientEmail: input.clientEmail,
    serviceName: input.serviceName,
    sessionDate: input.sessionDate,
    sessionTime: input.sessionTime,
    modality: input.modality,
    professionalName: template.professionalName,
    professionalCpf: template.professionalCpf,
    professionalCredential: template.professionalCredential,
    acceptedAt: now,
  });

  let resolvedClientId = input.clientId || null;
  if (!resolvedClientId && input.origin === 'avulso') {
    resolvedClientId = await resolveOrCreateClientForStandaloneContract({
      name: input.clientName,
      cpf: cleanCpf,
      birthDate: cleanBirthDate,
      phone: input.clientPhone || '',
      email: input.clientEmail || '',
    });
  }

  const db = getDatabase();
  await db
    .prepare(`
      INSERT INTO signed_contracts (
        id, clinic_id, token, origin, status, appointment_id, client_id,
        client_name, client_cpf, client_birth_date, client_phone, client_email,
        service_name, session_date, session_time, modality,
        contract_title, contract_body_snapshot,
        professional_name, professional_cpf, professional_credential, professional_signature_data,
        accepted_at, ip_address, user_agent, created_at
      ) VALUES (?, ?, ?, ?, 'assinado', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      IDS.clinic,
      token,
      input.origin,
      input.appointmentId || null,
      resolvedClientId,
      input.clientName.trim(),
      cleanCpf,
      cleanBirthDate,
      (input.clientPhone || '').replace(/\D/g, ''),
      (input.clientEmail || '').trim(),
      (input.serviceName || 'Atendimento Terapêutico').trim(),
      (input.sessionDate || now.slice(0, 10)).trim(),
      (input.sessionTime || '').trim(),
      (input.modality || 'presencial').trim(),
      template.title,
      snapshot,
      template.professionalName,
      template.professionalCpf,
      template.professionalCredential,
      template.professionalSignatureData,
      now,
      input.ipAddress || null,
      input.userAgent || null,
      now
    );

  const created = (await getContractById(id))!;
  await registerSignedContractInClientDocuments(created);
  return created;
}

export async function createPendingContractLink(input: {
  clientName?: string;
  clientCpf?: string;
  clientPhone?: string;
  serviceName?: string;
  sessionDate?: string;
  sessionTime?: string;
  modality?: string;
}): Promise<SignedContractRecord> {
  await ensureContractsTables();
  const template = await getContractTemplate();
  const now = new Date().toISOString();
  const id = `ctr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const token = crypto.randomBytes(6).toString('hex');

  const db = getDatabase();
  await db
    .prepare(`
      INSERT INTO signed_contracts (
        id, clinic_id, token, origin, status,
        client_name, client_cpf, client_phone, client_email,
        service_name, session_date, session_time, modality,
        contract_title, contract_body_snapshot,
        professional_name, professional_cpf, professional_credential, professional_signature_data,
        created_at
      ) VALUES (?, ?, ?, 'avulso', 'pendente', ?, ?, ?, '', ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      IDS.clinic,
      token,
      (input.clientName || '').trim(),
      (input.clientCpf || '').replace(/\D/g, ''),
      (input.clientPhone || '').replace(/\D/g, ''),
      (input.serviceName || 'Atendimento Terapêutico').trim(),
      (input.sessionDate || '').trim(),
      (input.sessionTime || '').trim(),
      (input.modality || 'presencial').trim(),
      template.title,
      template.professionalName,
      template.professionalCpf,
      template.professionalCredential,
      template.professionalSignatureData,
      now
    );

  return (await getContractById(id))!;
}

export async function signPendingContractByToken(
  token: string,
  input: {
    clientName: string;
    clientCpf: string;
    clientBirthDate?: string;
    clientPhone?: string;
    clientEmail?: string;
    serviceName?: string;
    sessionDate?: string;
    sessionTime?: string;
    modality?: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }
): Promise<SignedContractRecord> {
  await ensureContractsTables();
  const existing = await getContractByToken(token);
  if (!existing) {
    throw new Error('Link de contrato não encontrado ou expirado.');
  }
  if (existing.status === 'assinado') {
    return existing;
  }

  const template = await getContractTemplate();
  const now = new Date().toISOString();
  const cleanCpf = input.clientCpf.replace(/\D/g, '');
  const cleanBirthDate = (input.clientBirthDate || existing.clientBirthDate || '').trim();
  const cleanPhone = (input.clientPhone || existing.clientPhone || '').replace(/\D/g, '');
  const cleanEmail = (input.clientEmail || existing.clientEmail || '').trim();
  const finalService = (input.serviceName || existing.serviceName || 'Atendimento Terapêutico').trim();
  const finalDate = (input.sessionDate || existing.sessionDate || now.slice(0, 10)).trim();
  const finalTime = (input.sessionTime || existing.sessionTime || '').trim();
  const finalModality = (input.modality || existing.modality || 'presencial').trim();

  const snapshot = renderContractText(template.body, {
    clientName: input.clientName,
    clientCpf: cleanCpf,
    clientBirthDate: cleanBirthDate,
    clientPhone: cleanPhone,
    clientEmail: cleanEmail,
    serviceName: finalService,
    sessionDate: finalDate,
    sessionTime: finalTime,
    modality: finalModality,
    professionalName: template.professionalName,
    professionalCpf: template.professionalCpf,
    professionalCredential: template.professionalCredential,
    acceptedAt: now,
  });

  const resolvedClientId = await resolveOrCreateClientForStandaloneContract({
    name: input.clientName,
    cpf: cleanCpf,
    birthDate: cleanBirthDate,
    phone: cleanPhone,
    email: cleanEmail,
  });

  const db = getDatabase();
  await db
    .prepare(`
      UPDATE signed_contracts
      SET status = 'assinado',
          client_id = ?,
          client_name = ?,
          client_cpf = ?,
          client_birth_date = ?,
          client_phone = ?,
          client_email = ?,
          service_name = ?,
          session_date = ?,
          session_time = ?,
          modality = ?,
          contract_title = ?,
          contract_body_snapshot = ?,
          professional_name = ?,
          professional_cpf = ?,
          professional_credential = ?,
          professional_signature_data = ?,
          accepted_at = ?,
          ip_address = ?,
          user_agent = ?
      WHERE id = ? AND clinic_id = ?
    `)
    .run(
      resolvedClientId,
      input.clientName.trim(),
      cleanCpf,
      cleanBirthDate,
      cleanPhone,
      cleanEmail,
      finalService,
      finalDate,
      finalTime,
      finalModality,
      template.title,
      snapshot,
      template.professionalName,
      template.professionalCpf,
      template.professionalCredential,
      template.professionalSignatureData,
      now,
      input.ipAddress || null,
      input.userAgent || null,
      existing.id,
      IDS.clinic
    );

  const signed = (await getContractById(existing.id))!;
  await registerSignedContractInClientDocuments(signed);
  return signed;
}

export async function listContracts(filter?: {
  status?: string;
  origin?: string;
  search?: string;
}): Promise<SignedContractRecord[]> {
  await ensureContractsTables();
  const db = getDatabase();
  const rows = (await db
    .prepare(`
      SELECT * FROM signed_contracts
      WHERE clinic_id = ?
      ORDER BY COALESCE(accepted_at, created_at) DESC
    `)
    .all(IDS.clinic)) as Record<string, unknown>[];

  let list = rows.map(mapContractRow);
  if (filter?.status && filter.status !== 'todos') {
    list = list.filter((c) => c.status === filter.status);
  }
  if (filter?.origin && filter.origin !== 'todos') {
    list = list.filter((c) => c.origin === filter.origin);
  }
  if (filter?.search?.trim()) {
    const q = filter.search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    list = list.filter(
      (c) =>
        c.clientName.toLowerCase().includes(q) ||
        c.serviceName.toLowerCase().includes(q) ||
        (qDigits && c.clientCpf.includes(qDigits)) ||
        c.id.toLowerCase().includes(q)
    );
  }
  return list;
}

export async function getContractById(id: string): Promise<SignedContractRecord | null> {
  await ensureContractsTables();
  const db = getDatabase();
  const row = (await db
    .prepare('SELECT * FROM signed_contracts WHERE id = ? AND clinic_id = ?')
    .get(id, IDS.clinic)) as Record<string, unknown> | undefined;
  return row ? mapContractRow(row) : null;
}

export async function getContractByToken(token: string): Promise<SignedContractRecord | null> {
  await ensureContractsTables();
  const db = getDatabase();
  const row = (await db
    .prepare('SELECT * FROM signed_contracts WHERE token = ? AND clinic_id = ?')
    .get(token, IDS.clinic)) as Record<string, unknown> | undefined;
  return row ? mapContractRow(row) : null;
}

export async function deleteContractById(id: string): Promise<boolean> {
  await ensureContractsTables();
  const db = getDatabase();
  const res = await db
    .prepare('DELETE FROM signed_contracts WHERE id = ? AND clinic_id = ?')
    .run(id, IDS.clinic);
  return res.changes > 0;
}

// ============================================================================
// GERADOR DE PDF DO CONTRATO ASSINADO (A4 MULTI-PÁGINA COM ASSINATURAS)
// ============================================================================

const NAVY = rgb(0.102, 0.227, 0.29);
const GOLD = rgb(0.722, 0.537, 0.165);
const GRAY = rgb(0.39, 0.45, 0.5);
const DARK = rgb(0.09, 0.12, 0.15);

function cleanPdfText(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, '');
}

function wrapPdfLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of cleanPdfText(text).split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        line = test;
      } else {
        if (line) out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

export async function buildSignedContractPdf(contract: SignedContractRecord): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(cleanPdfText(`${contract.contractTitle} - ${contract.clientName || 'Cliente'}`));
  pdf.setAuthor('Camila Machado - Clínica Integrativa');

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let logoImage = null;
  try {
    const logoBytes = await readFile(path.join(process.cwd(), 'public', 'logo-camila-machado.png'));
    logoImage = await pdf.embedPng(logoBytes);
  } catch {}

  let signatureImage = null;
  if (contract.professionalSignatureData && contract.professionalSignatureData.startsWith('data:image/')) {
    try {
      const base64 = contract.professionalSignatureData.split(',')[1];
      if (base64) {
        const imgBytes = Buffer.from(base64, 'base64');
        if (contract.professionalSignatureData.includes('image/png')) {
          signatureImage = await pdf.embedPng(imgBytes);
        } else {
          signatureImage = await pdf.embedJpg(imgBytes);
        }
      }
    } catch {}
  }

  const W = 595.28;
  const H = 841.89;
  const M = 46;
  const contentWidth = W - M * 2;

  const drawPageHeader = (page: PDFPage, isFirst: boolean) => {
    let topY = H - 34;
    if (isFirst && logoImage) {
      const lw = 140;
      const lh = (logoImage.height / logoImage.width) * lw;
      page.drawImage(logoImage, { x: (W - lw) / 2, y: topY - lh, width: lw, height: lh });
      topY = topY - lh - 8;
    } else {
      const headerLabel = cleanPdfText(`${contract.professionalName} • Contrato de Prestação de Serviços Terapêuticos`);
      page.drawText(headerLabel, {
        x: Math.max(M, (W - bold.widthOfTextAtSize(headerLabel, 9.5)) / 2),
        y: topY,
        size: 9.5,
        font: bold,
        color: NAVY,
      });
      topY -= 16;
    }

    if (isFirst) {
      const sub = cleanPdfText(`${PROFESSIONAL_INFO.title} • ${contract.professionalCredential}`);
      page.drawText(sub, {
        x: (W - regular.widthOfTextAtSize(sub, 8.5)) / 2,
        y: topY,
        size: 8.5,
        font: regular,
        color: GRAY,
      });
      topY -= 12;
      page.drawLine({ start: { x: M, y: topY }, end: { x: W - M, y: topY }, thickness: 1.5, color: GOLD });
      topY -= 22;
    } else {
      page.drawLine({ start: { x: M, y: topY }, end: { x: W - M, y: topY }, thickness: 1, color: GOLD });
      topY -= 22;
    }

    return topY;
  };

  let page = pdf.addPage([W, H]);
  let y = drawPageHeader(page, true);

  const titleWrap = wrapPdfLines(contract.contractTitle.toUpperCase(), bold, 11, contentWidth);
  for (const tLine of titleWrap) {
    if (y < 145) {
      page = pdf.addPage([W, H]);
      y = drawPageHeader(page, false);
    }
    page.drawText(tLine, {
      x: Math.max(M, (W - bold.widthOfTextAtSize(tLine, 11)) / 2),
      y,
      size: 11,
      font: bold,
      color: NAVY,
    });
    y -= 15;
  }
  y -= 6;

  // Quadro resumo do atendimento / assinatura
  page.drawRectangle({
    x: M,
    y: y - 54,
    width: contentWidth,
    height: 54,
    color: rgb(0.97, 0.985, 0.995),
    borderColor: rgb(0.82, 0.88, 0.93),
    borderWidth: 1,
  });

  const cpfFmt = contract.clientCpf ? formatCpf(contract.clientCpf) : 'Não informado';
  const profCpfFmt = formatCpf(contract.professionalCpf || DEFAULT_PROFESSIONAL_CPF);
  page.drawText(cleanPdfText(`CONTRATANTE: ${contract.clientName || '—'}  |  CPF: ${cpfFmt}`), {
    x: M + 12,
    y: y - 18,
    size: 8.8,
    font: bold,
    color: NAVY,
  });
  page.drawText(
    cleanPdfText(
      `SERVIÇO: ${contract.serviceName || 'Atendimento'}  |  DATA: ${formatDateBr(contract.sessionDate)}${contract.sessionTime ? ` às ${contract.sessionTime}` : ''} (${contract.modality})`
    ),
    {
      x: M + 12,
      y: y - 33,
      size: 8.3,
      font: regular,
      color: DARK,
    }
  );
  page.drawText(
    cleanPdfText(
      `CONTRATADA (PROPRIETÁRIA): ${contract.professionalName}  |  CPF: ${profCpfFmt}  |  REGISTRO: ${contract.professionalCredential}`
    ),
    {
      x: M + 12,
      y: y - 46,
      size: 8,
      font: regular,
      color: GRAY,
    }
  );

  y -= 72;

  const lines = wrapPdfLines(contract.contractBodySnapshot || '', regular, 9.2, contentWidth);
  for (const line of lines) {
    if (y < 145) {
      page = pdf.addPage([W, H]);
      y = drawPageHeader(page, false);
    }
    if (line === '') {
      y -= 7;
      continue;
    }
    const isHeading =
      /^CL[ÁA]USULA\s+\d+/i.test(line) ||
      /^\d+\.\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(line);
    page.drawText(line, {
      x: M,
      y,
      size: isHeading ? 9.6 : 9.1,
      font: isHeading ? bold : regular,
      color: isHeading ? NAVY : DARK,
    });
    y -= isHeading ? 14 : 12.8;
  }

  // Garante espaço para o bloco de assinaturas lado a lado + bloco de integridade e auditoria
  if (y < 235) {
    page = pdf.addPage([W, H]);
    y = drawPageHeader(page, false);
  }

  const refIso = contract.acceptedAt || contract.createdAt || new Date().toISOString();
  const integrityHash = crypto
    .createHash('sha256')
    .update(
      [
        contract.id,
        CONTRACT_DOCUMENT_VERSION,
        contract.contractTitle,
        contract.contractBodySnapshot,
        contract.clientCpf,
        refIso,
      ].join('|')
    )
    .digest('hex');

  const sectionLabel = 'ASSINATURAS ELETRÔNICAS';
  page.drawText(sectionLabel, {
    x: M,
    y: y - 10,
    size: 9.5,
    font: bold,
    color: NAVY,
  });
  y -= 24;

  const signY = Math.max(152, y - 54);
  const halfW = (contentWidth - 20) / 2;
  const x1 = M;
  const x2 = M + halfW + 20;

  // Bloco 1 (Esquerda): Proprietária / Contratada — Assinatura padrão da Camila + Nome + CPF + Data/Hora
  page.drawRectangle({
    x: x1,
    y: signY - 52,
    width: halfW,
    height: 100,
    color: rgb(0.985, 0.98, 0.965),
    borderColor: rgb(0.84, 0.79, 0.7),
    borderWidth: 1,
  });
  page.drawText('CONTRATADA — PRESTADORA DOS SERVIÇOS:', {
    x: x1 + 10,
    y: signY + 35,
    size: 7.1,
    font: bold,
    color: GOLD,
  });

  if (signatureImage) {
    const maxW = halfW - 24;
    const maxH = 26;
    const ratio = Math.min(maxW / signatureImage.width, maxH / signatureImage.height);
    const sw = signatureImage.width * ratio;
    const sh = signatureImage.height * ratio;
    page.drawImage(signatureImage, { x: x1 + 10, y: signY + 8, width: sw, height: sh });
  } else {
    page.drawText(cleanPdfText(contract.professionalName), {
      x: x1 + 10,
      y: signY + 13,
      size: 12.5,
      font: italic,
      color: NAVY,
    });
  }

  page.drawLine({
    start: { x: x1 + 10, y: signY + 5 },
    end: { x: x1 + halfW - 10, y: signY + 5 },
    thickness: 0.7,
    color: GRAY,
  });
  page.drawText(cleanPdfText(contract.professionalName), {
    x: x1 + 10,
    y: signY - 9,
    size: 8.6,
    font: bold,
    color: NAVY,
  });
  page.drawText(cleanPdfText(`CPF: ${profCpfFmt}  |  ${contract.professionalCredential}`), {
    x: x1 + 10,
    y: signY - 21,
    size: 7.7,
    font: bold,
    color: DARK,
  });
  page.drawText(
    cleanPdfText(`Data e hora: ${formatDateBr(refIso)} às ${formatTimeBr(refIso)}`),
    {
      x: x1 + 10,
      y: signY - 33,
      size: 7.4,
      font: regular,
      color: GRAY,
    }
  );

  // Bloco 2 (Direita, ao lado): Contratante / Cliente — Dados coletados na hora (Nome, CPF, Nascimento, Data e Horário)
  page.drawRectangle({
    x: x2,
    y: signY - 52,
    width: halfW,
    height: 100,
    color: rgb(0.97, 0.99, 0.982),
    borderColor: rgb(0.74, 0.87, 0.81),
    borderWidth: 1,
  });
  const cSignLabel = cleanPdfText(
    contract.status === 'assinado'
      ? 'CONTRATANTE — CLIENTE (ASSINADO):'
      : 'CONTRATANTE — CLIENTE (PENDENTE):'
  );
  page.drawText(cSignLabel, {
    x: x2 + 10,
    y: signY + 35,
    size: 7.1,
    font: bold,
    color: rgb(0.05, 0.45, 0.3),
  });
  const cNameItalic = cleanPdfText(contract.clientName || 'Cliente');
  page.drawText(cNameItalic, {
    x: x2 + 10,
    y: signY + 13,
    size: 11,
    font: italic,
    color: NAVY,
  });
  page.drawLine({
    start: { x: x2 + 10, y: signY + 5 },
    end: { x: x2 + halfW - 10, y: signY + 5 },
    thickness: 0.7,
    color: GRAY,
  });
  page.drawText(cleanPdfText(contract.clientName || 'Não informado'), {
    x: x2 + 10,
    y: signY - 9,
    size: 8.4,
    font: bold,
    color: NAVY,
  });
  page.drawText(
    cleanPdfText(
      `CPF: ${cpfFmt}${contract.clientBirthDate ? `  |  Nasc: ${formatDateBr(contract.clientBirthDate)}` : ''}`
    ),
    {
      x: x2 + 10,
      y: signY - 21,
      size: 7.7,
      font: bold,
      color: DARK,
    }
  );
  const acceptTimeText = contract.acceptedAt
    ? `Data e hora: ${formatDateBr(contract.acceptedAt)} às ${formatTimeBr(contract.acceptedAt)}`
    : `Sessão: ${formatDateBr(contract.sessionDate)}${contract.sessionTime ? ` às ${contract.sessionTime}` : ''}`;
  page.drawText(cleanPdfText(acceptTimeText), {
    x: x2 + 10,
    y: signY - 33,
    size: 7.4,
    font: regular,
    color: GRAY,
  });
  if (contract.ipAddress) {
    page.drawText(cleanPdfText(`IP: ${contract.ipAddress}`), {
      x: x2 + 10,
      y: signY - 44,
      size: 7.1,
      font: regular,
      color: GRAY,
    });
  }

  // Bloco de Validação, Versão e Integridade do Documento
  const auditBoxY = signY - 120;
  page.drawRectangle({
    x: M,
    y: auditBoxY,
    width: contentWidth,
    height: 58,
    color: rgb(0.975, 0.98, 0.99),
    borderColor: rgb(0.84, 0.87, 0.91),
    borderWidth: 0.8,
  });
  page.drawText(
    cleanPdfText(
      `Identificação do contrato: ${contract.id.toUpperCase()}   |   Versão do documento: ${CONTRACT_DOCUMENT_VERSION}`
    ),
    {
      x: M + 10,
      y: auditBoxY + 43,
      size: 7.5,
      font: bold,
      color: NAVY,
    }
  );
  page.drawText(
    cleanPdfText(`Local e data: ${PROFESSIONAL_INFO.city}, ${formatDateBr(refIso)} às ${formatTimeBr(refIso)}`),
    {
      x: M + 10,
      y: auditBoxY + 31,
      size: 7.4,
      font: regular,
      color: DARK,
    }
  );
  page.drawText(cleanPdfText(`Registro de integridade (SHA-256): ${integrityHash}`), {
    x: M + 10,
    y: auditBoxY + 19,
    size: 6.7,
    font: regular,
    color: GRAY,
  });
  page.drawText(
    cleanPdfText(
      'Documento formalizado eletronicamente, sujeito aos mecanismos de autenticação e integridade disponibilizados pela plataforma.'
    ),
    {
      x: M + 10,
      y: auditBoxY + 7,
      size: 6.8,
      font: italic,
      color: GRAY,
    }
  );

  const footer = cleanPdfText(`Código do Contrato: ${contract.id.toUpperCase()} • ${PROFESSIONAL_INFO.city}`);
  page.drawText(footer, {
    x: (W - regular.widthOfTextAtSize(footer, 7.5)) / 2,
    y: 22,
    size: 7.5,
    font: regular,
    color: GRAY,
  });

  return pdf.save();
}
