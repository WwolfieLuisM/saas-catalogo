'use client';

import { TabsLinks } from './ui';

const CFG_TABS = [
  { key: 'general', label: 'General' },
  { key: 'catalogo', label: 'Catálogo' },
  { key: 'precios', label: 'Precios' },
  { key: 'datos', label: 'Datos / Importación' },
  { key: 'backups', label: 'Backups' },
  { key: 'multimedia', label: 'Multimedia' },
  { key: 'sistema', label: 'Sistema' },
] as const;

export function CfgTabs({ active }: { active: string }) {
  return (
    <TabsLinks
      items={CFG_TABS.map((tab) => ({
        key: tab.key,
        label: tab.label,
        href: `/admin/configuracion/${tab.key}`,
      }))}
      active={active}
    />
  );
}
