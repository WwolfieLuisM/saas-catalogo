'use client';

import Link from 'next/link';
import { AdminIcon } from '@/components/admin/icons';
import { PageHead } from '@/components/admin/ui';
import { useTenantScope } from '@/hooks/useTenantScope';

const CFG = [
  { key: 'general', label: 'General', detail: 'Nombre público y contacto' },
  { key: 'catalogo', label: 'Catálogo', detail: 'Versión y publicación' },
  { key: 'precios', label: 'Precios', detail: 'Reglas por tamaño' },
  { key: 'datos', label: 'Datos / Importación', detail: 'Exportar e importar con vista previa' },
  { key: 'backups', label: 'Backups', detail: 'Copias y restauración' },
  { key: 'multimedia', label: 'Multimedia', detail: 'Límites y Cloudinary' },
  { key: 'sistema', label: 'Sistema', detail: 'Estado y rutas' },
] as const;

export default function ConfiguracionIndexPage() {
  const scope = useTenantScope();
  const sub = scope.isSa
    ? 'Ajustes de la plataforma y del negocio seleccionado.'
    : 'Ajustes de tu negocio.';

  return (
    <>
      <PageHead title="Configuración" sub={sub} />
      <div className="rows">
        {CFG.map((item) => (
          <Link key={item.key} href={`/admin/configuracion/${item.key}`} style={{ minHeight: 64 }}>
            <div className="gr">
              <b>{item.label}</b>
              <br />
              <small>{item.detail}</small>
            </div>
            <AdminIcon name="chev" />
          </Link>
        ))}
      </div>
    </>
  );
}
