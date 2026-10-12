'use client';

import { useFeed } from '@/hooks/useFeed';

export function Toast() {
  const { toastMsg } = useFeed();
  return (
    <div className={`toast${toastMsg ? ' show' : ''}`} role="status" aria-live="polite">
      {toastMsg}
    </div>
  );
}

export function ContactSection() {
  return (
    <section className="wrap" id="contact" aria-label="Contacto" style={{ paddingBottom: 8 }}>
      <div className="contact">
        <div>
          <b>¿No encuentras un juego?</b>
          <span>Escríbenos y te ayudamos a conseguirlo al mejor precio.</span>
        </div>
        <a
          className="btn gold"
          href={`https://wa.me/${(process.env.NEXT_PUBLIC_WHATSAPP ?? '5355555555').replace(/\D/g, '')}?text=${encodeURIComponent(
            'Hola, busco un juego en el catálogo de Javier PC.',
          )}`}
          target="_blank"
          rel="noreferrer"
        >
          Hablar por WhatsApp
        </a>
      </div>
    </section>
  );
}

export function Footer() {
  const { catalogVersion, setShowWelcome, showWelcome } = useFeed();
  return (
    <footer className="site-footer">
      <div className="wrap">
        <b>Javier PC</b>
        <span>Catálogo de juegos de Javier · © 2026</span>
        <span>
          Catálogo v{catalogVersion ?? 1} · v12 ·{' '}
          <button
            className="linklike"
            type="button"
            onClick={() => setShowWelcome(!showWelcome)}
          >
            ¿Cómo funciona?
          </button>
        </span>
      </div>
    </footer>
  );
}
