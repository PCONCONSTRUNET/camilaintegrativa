import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Camila Machado | Espaço de atendimento integrativo',
    template: '%s | Camila Machado',
  },
  description:
    'Conheça os serviços e solicite um horário no espaço de atendimento de Camila Machado.',
  keywords: ['hipnose integrativa', 'Camila Machado', 'atendimento presencial', 'atendimento online', 'agendamento'],
  openGraph: {
    title: 'Camila Machado | Espaço de atendimento integrativo',
    description: 'Conheça os serviços e solicite um horário.',
    type: 'website',
    locale: 'pt_BR',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
