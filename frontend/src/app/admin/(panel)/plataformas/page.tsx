import { TaxonomyPage } from '@/components/admin/TaxonomyPage';

export default function PlataformasPage() {
  return (
    <TaxonomyPage
      config={{
        kind: 'platform',
        title: 'Plataformas',
        one: 'plataforma',
        api: '/admin/platforms',
        sub: 'Plataformas disponibles para tus juegos. El conjunto lo define la plataforma de Luismi; tú eliges cuáles usar.',
        emptyText: 'El conjunto lo define la plataforma de Luismi.',
        editable: false,
      }}
    />
  );
}
