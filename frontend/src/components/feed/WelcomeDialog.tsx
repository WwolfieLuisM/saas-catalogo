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
    }, 700);
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
    } else if (!showWelcome && dlg.open) {
      dlg.close();
    }
  }, [showWelcome]);

  const close = () => {
    setShowWelcome(false);
    markWelcomeSeen();
    ref.current?.close();
  };

  const hour = new Date().getHours();
  const greeting = hour >= 5 && hour < 12 ? 'Buenos días' : hour >= 12 && hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <dialog
      ref={ref}
      className="welcome-card"
      aria-label="Bienvenida"
      onClose={() => {
        setShowWelcome(false);
        markWelcomeSeen();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="wc-in">
        <div className="wc-body">
          <span className="wc-eyebrow">{greeting}</span>
          <h2 className="wc-title">
            Bienvenido a <em>Javier PC</em>
          </h2>
          <p className="wc-intro">Catálogo de juegos de Javier. Así lo aprovechas al máximo:</p>
          <ol className="wc-steps">
            <li>
              <div>
                <b>Explora y busca</b>
                <span>Usa la barra superior, las categorías o el botón «Filtros» para encontrar juegos.</span>
              </div>
            </li>
            <li>
              <div>
                <b>Mira los detalles</b>
                <span>Toca cualquier tarjeta para ver descripción, requisitos y capturas.</span>
              </div>
            </li>
            <li>
              <div>
                <b>Guarda tus favoritos</b>
                <span>Marca los que más te gusten con el corazón de cada tarjeta o desde el detalle.</span>
              </div>
            </li>
            <li>
              <div>
                <b>Arma tu lista y pídela</b>
                <span>Añade juegos a tu lista y envíala por WhatsApp con un solo clic.</span>
              </div>
            </li>
            <li>
              <div>
                <b>Lleva tu colección</b>
                <span>Apunta qué tienes pendiente, jugado o ganado para no perderte nada.</span>
              </div>
            </li>
            <li>
              <div>
                <b>¿Aún no sale o no lo ves?</b>
                <span>Explora lo próximo o escríbenos y te ayudamos a conseguirlo.</span>
              </div>
            </li>
          </ol>
          <p className="wc-note">Tus favoritos, lista y colección se guardan en este dispositivo.</p>
        </div>
        <div className="wc-foot">
          <button className="btn gold" type="button" onClick={close}>
            Entendido
          </button>
        </div>
      </div>
    </dialog>
  );
}
