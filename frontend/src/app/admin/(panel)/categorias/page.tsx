import { TaxonomyPage } from '@/components/admin/TaxonomyPage';

export default function CategoriasPage() {
  return (
    <TaxonomyPage
      config={{
        kind: 'category',
        title: 'Categorías',
        one: 'categoría',
        api: '/admin/categories',
        sub: 'Secciones de tu catálogo público.',
        emptyText: 'Crea la primera.',
        editable: true,
      }}
    />
  );
}
