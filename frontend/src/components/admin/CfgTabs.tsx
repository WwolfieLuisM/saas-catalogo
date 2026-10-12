'use client';

import { useAdminAuth } from '@/hooks/useAdminAuth';
import { TabsLinks } from './ui';

const CFG_TABS = [
  { key: 'general', label: 'General', role: 'SUPER_ADMIN' },
  { key: 'catalogo', label: 'Catálogo' },
  { key: 'precios', label: 'Precios' },
  { key: 'datos', label: 'Datos / Importación' },
  { key: 'backups', label: 'Backups' },
  { key: 'multimedia', label: 'Multimedia' },
  { key: 'sistema', label: 'Sistema', role: 'SUPER_ADMIN' },
] as const;

export function CfgTabs({ active }: { active: string }) {
  const { user } = useAdminAuth();
  const isSa = user?.role === 'SUPER_ADMIN';
  const visibleTabs = CFG_TABS.filter((tab) => !('role' in tab) || isSa);

  return (
    <TabsLinks
      items={visibleTabs.map((tab) => ({
        key: tab.key,
        label: tab.label,
        href: `/admin/configuracion/${tab.key}`,
      }))}
      active={active}
    />
  );
}
