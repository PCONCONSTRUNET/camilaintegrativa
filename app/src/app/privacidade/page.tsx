import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Lock, FileCheck, UserCheck } from 'lucide-react';

export const metadata = {
  title: 'Política de Privacidade e LGPD | Camila Machado',
  description: 'Política de Privacidade e Tratamento de Dados Pessoais Sensíveis em conformidade com a LGPD (Lei nº 13.709/2018).',
};

export default function PrivacidadePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#1e293b', padding: '40px 16px' }}>
      <div style={{ maxWidth: '820px', margin: '0 auto', background: '#ffffff', borderRadius: '24px', padding: '36px 32px', boxShadow: '0 4px 25px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
        
        {/* Voltar */}
        <Link
          href="/"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#245d80', fontWeight: 600, textDecoration: 'none', marginBottom: '24px' }}
        >
          <ArrowLeft size={18} /> Voltar ao Início
        </Link>

        {/* Header */}
        <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '20px', marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#059669', padding: '6px 12px', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 700, marginBottom: '12px' }}>
            <ShieldCheck size={14} /> Conformidade com a Lei Federal nº 13.709/2018 (LGPD - 2026)
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
            Política de Privacidade e Proteção de Dados
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
            Tratamento de Dados Pessoais e Sensíveis de Saúde • Camila Machado Hipnose Clínica Multidimensional Integrativa
          </p>
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', lineHeight: 1.7, fontSize: '0.95rem', color: '#334155' }}>
          
          <section>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              1. Identificação do Controlador dos Dados
            </h2>
            <p>
              O controlador dos dados coletados nesta plataforma é o <strong>Espaço Terapêutico Camila Machado</strong>, responsável pelo serviço de Hipnose Clínica Multidimensional Integrativa com sede em <strong>Urussanga - SC</strong>, doravante denominado simplesmente &quot;Controlador&quot;.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              2. Dados Coletados e Sua Classificação Legal
            </h2>
            <p>
              Em virtude da natureza das terapias integrativas, coletamos e tratamos duas categorias de dados:
            </p>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
              <li>
                <strong>a) Dados Pessoais Comuns (Art. 5º, I, LGPD):</strong> Nome completo, telefone/WhatsApp, e-mail, data de nascimento e endereço para identificação, emissão de recibos e comunicação de agendamentos.
              </li>
              <li>
                <strong>b) Dados Pessoais Sensíveis de Saúde (Art. 5º, II, LGPD):</strong> Histórico de saúde, queixas emocionais, anotações de evolução de sessões, prescrições de auto-hipnose e registros terapêuticos (prontuário integrado).
              </li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              3. Finalidade e Bases Legais do Tratamento
            </h2>
            <p>
              O tratamento de dados sensíveis e comuns apoia-se estritamente nas seguintes hipóteses legais da LGPD:
            </p>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              <li><strong>Execução de Contrato e Pré-Contrato (Art. 7º, V):</strong> Viabilizar o agendamento de consultas, confirmações automáticas e suporte ao cliente.</li>
              <li><strong>Tutela da Saúde e Procedimentos Terapêuticos (Art. 11, II, &quot;f&quot;):</strong> Manutenção do prontuário com evolução dos atendimentos de hipnose integrativa.</li>
              <li><strong>Consentimento Específico e Destacado (Art. 11, I):</strong> Coleta autorizada expressamente pelo cliente no momento do cadastro e agendamento.</li>
              <li><strong>Cumprimento de Obrigação Legal ou Regulatória (Art. 7º, II):</strong> Emissão de recibos/comprovantes fiscais e guarda obrigatória de prontuários.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              4. Segurança da Informação e Criptografia
            </h2>
            <p>
              Adotamos práticas técnicas e organizacionais rígidas para assegurar a inviolabilidade das suas informações:
            </p>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
              <li>Tráfego 100% criptografado com certificados SSL/TLS modernos (HTTPS).</li>
              <li>Senhas de acesso com hash criptográfico irreversível.</li>
              <li>Armazenamento de banco de dados protegido por credenciais e controle de acesso baseado em perfis (apenas o terapeuta titular e o próprio paciente visualizam seu prontuário).</li>
              <li>Trilhas de auditoria para registros de acessos a dados sensíveis.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              5. Compartilhamento de Dados
            </h2>
            <p>
              <strong>Em hipótese alguma comercializamos ou compartilhamos seus dados com agências de publicidade ou terceiros com fins lucrativos.</strong> O compartilhamento restringe-se unicamente a:
            </p>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
              <li>Provedores de infraestrutura e hospedagem em nuvem que atendam a padrões rigorosos de segurança e LGPD.</li>
              <li>Meios de pagamento para liquidação de faturas de sessões.</li>
              <li>Autoridades judiciais apenas mediante requisição formal prevista em lei.</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              6. Direitos do Titular dos Dados (Art. 18 da LGPD)
            </h2>
            <p>
              A qualquer momento, o titular tem direito de solicitar:
            </p>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
              <li>Confirmação da existência de tratamento e acesso aos seus dados.</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados.</li>
              <li>Revogação do consentimento ou eliminação dos dados desnecessários (observado o prazo legal de guarda de prontuários estipulado para serviços de saúde).</li>
            </ul>
            <p style={{ marginTop: '10px' }}>
              Para exercer qualquer um destes direitos, basta entrar em contato com nossa equipe através dos canais de suporte ou WhatsApp oficial.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              7. Atualizações Desta Política
            </h2>
            <p>
              Esta Política foi elaborada e atualizada em <strong>2026</strong> em consonância com as diretrizes e resoluções da Autoridade Nacional de Proteção de Dados (ANPD). Quaisquer alterações futuras serão notificadas nesta mesma página.
            </p>
          </section>

        </div>

        {/* Footer interno */}
        <div style={{ marginTop: '36px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            © 2026 Camila Machado. Todos os direitos reservados.
          </span>
          <Link href="/termos" style={{ fontSize: '0.85rem', color: '#245d80', fontWeight: 600 }}>
            Ver Termos de Uso e Atendimento →
          </Link>
        </div>

      </div>
    </div>
  );
}

