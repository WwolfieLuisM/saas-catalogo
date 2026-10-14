'use client';

import { CfgTabs } from '@/components/admin/CfgTabs';
import { MediaAudit } from '@/components/admin/MediaAudit';
import { PageHead } from '@/components/admin/ui';
import { useTenantScope } from '@/hooks/useTenantScope';

const MEDIA_LIMITS: ReadonlyArray<readonly [string, string]> = [
  ['Portada', '1 por juego'],
  ['Screenshots', 'Máximo 4 por juego'],
  ['Formatos', 'JPG, PNG o WebP, hasta 8 MB'],
  ['Entrega', 'CDN, miniaturas y carga diferida'],
];

export default function ConfigMultimediaPage() {
  const scope = useTenantScope();
  const folder = `tenants/${scope.tenantId ?? '<tenant>'}/games/…`;

  return (
    <>
      <PageHead title="Multimedia" sub="Límites de subida y carpeta de Cloudinary." />
      <CfgTabs active="multimedia" />
      <div className="panel">
        <dl className="kv">
          {MEDIA_LIMITS.map(([label, value]) => (
            <div key={label} style={{ display: 'contents' }}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <div style={{ display: 'contents' }}>
            <dt>Carpeta Cloudinary</dt>
            <dd className="mono">{folder}</dd>
          </div>
        </dl>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Estos límites los define la plataforma. Cambiarlos requiere SUPER_ADMIN.
      </p>
      <MediaAudit />
    </>
  );
}
