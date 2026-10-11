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
  return (
    <footer className="site-footer">
      <div className="wrap">
        <b>
          Javier <span style={{ color: 'var(--gold)' }}>PC</span>
        </b>
        <span>Catálogo de videojuegos · Precios en CUP · Consultar disponibilidad</span>
      </div>
    </footer>
  );
}
