import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Scale, FileText, CheckCircle2 } from 'lucide-react';

export const metadata = {
  title: 'Termos de Uso e Atendimento | Camila Machado',
  description: 'Termos e Condições Gerais de Atendimento em Hipnose Clínica Multidimensional Integrativa.',
};

export default function TermosPage() {
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
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eaf3f8', color: '#245d80', padding: '6px 12px', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 700, marginBottom: '12px' }}>
            <Scale size={14} /> Atualizado conforme Legislação 2026
          </div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
            Termos de Uso e Condições de Atendimento
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
            Espaço Terapêutico Camila Machado • Hipnose Clínica Multidimensional Integrativa • Urussanga - SC
          </p>
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', lineHeight: 1.7, fontSize: '0.95rem', color: '#334155' }}>
          
          <section>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              1. Natureza do Atendimento em Hipnose Clínica Multidimensional Integrativa
            </h2>
            <p>
              A <strong>Hipnose Clínica Multidimensional Integrativa</strong> exercida por Camila Machado é uma abordagem terapêutica integrativa fundamentada em processos de autorregulação emocional, autoconhecimento e desenvolvimento pessoal.
            </p>
            <div style={{ background: '#f1f5f9', borderLeft: '4px solid #245d80', padding: '12px 16px', borderRadius: '0 8px 8px 0', marginTop: '10px' }}>
              <strong>Aviso Importante:</strong> As sessões não substituem diagnósticos, tratamentos clínicos, médicos ou intervenções psiquiátricas/medicamentosas. Caso o paciente faça uso de medicação prescrita por médico ou psiquiatra, não deve interromper seu tratamento sem autorização expressa do profissional responsável.
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              2. Modalidades de Atendimento
            </h2>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>
                <strong>Atendimento Presencial:</strong> Realizado em consultório privativo localizado em <em>Urussanga - SC</em>. As instruções detalhadas de endereço e acesso são enviadas após a confirmação do horário.
              </li>
              <li>
                <strong>Teleatendimento (Online):</strong> Realizado via videochamada segura e criptografada ponta a ponta. É de responsabilidade do cliente garantir conexão estável à internet, fones de ouvido e estar em um ambiente silencioso, privativo e seguro durante todo o período da sessão.
              </li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              3. Agendamentos, Pontualidade e Tolerância
            </h2>
            <p>
              As sessões têm duração média estipulada no momento da contratação (geralmente entre 50 a 90 minutos, dependendo da modalidade/plano).
            </p>
            <p>
              O tempo de tolerância para atrasos é de até <strong>15 (quinze) minutos</strong>. Ultrapassado esse limite, a sessão poderá ser considerada realizada (no-show), sem direito a prorrogação do horário de término para não comprometer os agendamentos seguintes.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              4. Política de Cancelamento, Remarcação e Reembolso
            </h2>
            <p>
              Em conformidade com a legislação civil e o Código de Defesa do Consumidor (Lei nº 8.078/1990):
            </p>
            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              <li>
                <strong>Remarcações:</strong> Podem ser solicitadas sem custo adicional com até <strong>24 (vinte e quatro) horas úteis de antecedência</strong> através dos canais oficiais (WhatsApp ou Painel do Cliente).
              </li>
              <li>
                <strong>Cancelamento tardio ou Ausência (No-show):</strong> O cancelamento com menos de 24 horas ou o não comparecimento injustificado impossibilita a liberação da vaga para outro paciente na lista de espera, configurando a sessão como prestada/cobrada.
              </li>
              <li>
                <strong>Direito de Arrependimento (Art. 49 do CDC):</strong> Para contratações e pagamentos de pacotes realizados de forma 100% remota pela internet, o consumidor tem o prazo de 7 (sete) dias corridos a partir da contratação para requerer o reembolso dos valores referentes às sessões ainda não realizadas.
              </li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              5. Sigilo Profissional e Confidencialidade
            </h2>
            <p>
              Todas as informações partilhadas em sessão, histórico clínico, prontuários eletrônicos e relatos são protegidos pelo mais rigoroso <strong>sigilo profissional ético</strong>, não sendo divulgados a terceiros, exceto mediante ordem judicial específica fundamentada ou risco iminente de dano à vida do cliente ou de outrem.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              6. Cadastro e Responsabilidade de Acesso
            </h2>
            <p>
              Ao criar seu acesso na Área do Cliente, o usuário se compromete a fornecer dados verídicos e manter o sigilo de suas credenciais de login. O acesso à área do cliente é pessoal e intransferível.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              7. Foro de Eleição
            </h2>
            <p>
              Fica eleito o Foro da Comarca de <strong>Urussanga, Estado de Santa Catarina</strong>, para dirimir quaisquer dúvidas ou litígios oriundos do presente termo, com renúncia expressa a qualquer outro.
            </p>
          </section>

        </div>

        {/* Footer interno */}
        <div style={{ marginTop: '36px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            © 2026 Camila Machado. Todos os direitos reservados.
          </span>
          <Link href="/privacidade" style={{ fontSize: '0.85rem', color: '#245d80', fontWeight: 600 }}>
            Ver Política de Privacidade (LGPD) →
          </Link>
        </div>

      </div>
    </div>
  );
}

