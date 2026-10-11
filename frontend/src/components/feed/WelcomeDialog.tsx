'use client';

import { useEffect, useRef } from 'react';
import { useFeed } from '@/hooks/useFeed';
import { hasSeenWelcome, markWelcomeSeen } from '@/lib/feed/storage';

export function WelcomeDialog() {
  const { showWelcome, setShowWelcome } = useFeed();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (hasSeenWelcome()) {
        setShowWelcome(false);
        return;
      }
    });
    const t = window.setTimeout(() => {
      if (!cancelled && !hasSeenWelcome()) setShowWelcome(true);
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [setShowWelcome]);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (showWelcome && !dlg.open) {
      dlg.showModal();
      markWelcomeSeen();
    } else if (!showWelcome && dlg.open) {
      dlg.close();
    }
  }, [showWelcome]);

  const close = () => {
    setShowWelcome(false);
    ref.current?.close();
  };

  return (
    <dialog
      ref={ref}
      className="welcome-card"
      aria-label="Bienvenida"
      onClose={() => setShowWelcome(false)}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="wc-in">
        <div className="wc-body">
          <span className="wc-eyebrow">Bienvenido</span>
          <h2 className="wc-title">
            Explora el catálogo de <em>Javier PC</em>
          </h2>
          <p className="wc-intro">Así sacas el máximo partido a la tienda:</p>
          <ol className="wc-steps">
            <li>
              <div>
                <b>Busca y filtra</b>
                <span>Usa la barra superior, las categorías o el botón «Filtros» para afinar.</span>
              </div>
            </li>
            <li>
              <div>
                <b>Añade a tu lista</b>
                <span>Pulsa «+ Añadir» en cualquier tarjeta. Tu lista se guarda en este dispositivo.</span>
              </div>
            </li>
            <li>
              <div>
                <b>Marca favoritos y estados</b>
                <span>Guarda favoritos y apunta qué llevas pendiente, jugado o ganado.</span>
              </div>
            </li>
            <li>
              <div>
                <b>Envía la lista</b>
                <span>Al terminar, compártela por WhatsApp con un solo clic.</span>
              </div>
            </li>
          </ol>
          <p className="wc-note">Puedes volver a abrir esta guía desde el menú «¿Cómo funciona?».</p>
        </div>
        <div className="wc-foot">
          <button className="btn gold" type="button" onClick={close}>
            ¡Entendido, empezar!
          </button>
        </div>
      </div>
    </dialog>
  );
}
