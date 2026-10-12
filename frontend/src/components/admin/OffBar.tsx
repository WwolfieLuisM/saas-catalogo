'use client';

import { useEffect, useState } from 'react';
import { AdminIcon } from './icons';

export function OffBar() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (online) return null;

  return (
    <div className="bar-off" role="status" aria-live="polite">
      <AdminIcon name="alert" />
      Sin conexión. Puedes consultar lo ya cargado; los cambios no se guardarán hasta recuperar
      la conexión.
    </div>
  );
}
