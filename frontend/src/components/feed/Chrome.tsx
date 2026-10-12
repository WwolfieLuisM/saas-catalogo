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
          <b>¿No ves tu juego?</b>
          <span>Dinos cuál es y lo conseguimos para ti.</span>
        </div>
        <a
          className="btn gold"
          href={`https://wa.me/${(process.env.NEXT_PUBLIC_WHATSAPP ?? '5355555555').replace(/\D/g, '')}?text=${encodeURIComponent(
            'Hola Javier, quiero consultar por un juego.',
          )}`}
          target="_blank"
          rel="noreferrer"
        >
          Escribir a Javier
        </a>
      </div>
    </section>
  );
}

export function Footer() {
  const { catalogVersion, openDialog } = useFeed();
  return (
    <footer className="site-footer">
      <div className="wrap">
        <b>Javier PC</b>
        <span>Catálogo de juegos de Javier · © 2026</span>
        <span>{catalogVersion == null ? 'Catálogo sin cargar' : `Catálogo v${catalogVersion} · v12`}</span>
        <button className="linklike" type="button" onClick={() => openDialog('welcome')}>¿Cómo funciona?</button>
      </div>
    </footer>
  );
}
