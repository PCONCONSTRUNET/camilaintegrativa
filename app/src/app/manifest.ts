import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Camila Machado | Espaço Integrativo',
    short_name: 'Camila Machado',
    description: 'Espaço de Atendimento Integrativo, Hipnose Clínica, Agendamentos e Acompanhamento de Sessões.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#FFFFFF',
    theme_color: '#245D80',
    categories: ['medical', 'health', 'lifestyle'],
    lang: 'pt-BR',
    scope: '/',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Agendar Sessão',
        short_name: 'Agendar',
        description: 'Agende uma sessão individual ou em grupo',
        url: '/agendar',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Área do Paciente',
        short_name: 'Meu Portal',
        description: 'Acesse seus agendamentos e histórico',
        url: '/cliente/login',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Painel Administrativo',
        short_name: 'Admin',
        description: 'Gestão da clínica e agenda',
        url: '/admin',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}

