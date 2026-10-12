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
            Bienvenido a <em>Javier PC</em>
          </h2>
          <p className="wc-intro">Catálogo de juegos de Javier. Así lo aprovechas al máximo:</p>
          <ol className="wc-steps">
            <li>
              <div>
                <b>Explora y busca</b>
                <span>Usa el buscador o los filtros de género, plataforma y precio para encontrar lo que quieres.</span>
              </div>
            </li>
            <li>
              <div>
                <b>Mira los detalles</b>
                <span>Toca cualquier juego para ver su descripción, tamaño y precio.</span>
              </div>
            </li>
            <li>
              <div>
                <b>Guarda tus favoritos</b>
                <span>Marca un juego como Favorito y lo encuentras después en Favoritos.</span>
              </div>
            </li>
            <li>
              <div>
                <b>Arma tu lista y pídela</b>
                <span>Agrega juegos a tu Lista y envíala a Javier por mensaje con un toque.</span>
              </div>
            </li>
            <li>
              <div>
                <b>Lleva tu colección</b>
                <span>Dentro de cada juego márcalo como Pendiente, Jugado o Ganado; todo queda en Colección.</span>
              </div>
            </li>
            <li>
              <div>
                <b>¿Aún no sale o no lo ves?</b>
                <span>En los próximos lanzamientos toca Avísame, y si falta un juego escribe desde Contacto.</span>
              </div>
            </li>
          </ol>
          <p className="wc-note">Tus favoritos, lista y colección se guardan en este dispositivo.</p>
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
