import { TaxonomyPage } from '@/components/admin/TaxonomyPage';

export default function GenerosPage() {
  return (
    <TaxonomyPage
      config={{
        kind: 'genre',
        title: 'Géneros',
        one: 'género',
        api: '/admin/genres',
        sub: 'Clasificación por tipo de juego.',
        emptyText: 'Crea la primera.',
        editable: true,
      }}
    />
  );
}
