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
  const { settings } = useFeed();
  const storeName = settings?.publicName || 'Javier PC';
  const digits =
    settings === null ? '5355555555' : (settings.whatsapp || settings.phone).replace(/\D/g, '');
  return (
    <section className="wrap" id="contact" aria-label="Contacto" style={{ paddingBottom: 8 }}>
      <div className="contact">
        <div>
          <b>¿No encuentras un juego?</b>
          <span>Escríbenos y te ayudamos a conseguirlo al mejor precio.</span>
        </div>
        {digits && (
          <a
            className="btn gold"
            href={`https://wa.me/${digits}?text=${encodeURIComponent(
              `Hola, busco un juego en el catálogo de ${storeName}.`,
            )}`}
            target="_blank"
            rel="noreferrer"
          >
            Hablar por WhatsApp
          </a>
        )}
        {settings?.email && (
          <a className="btn" href={`mailto:${settings.email}`}>
            Escribir por email
          </a>
        )}
      </div>
    </section>
  );
}

export function Footer() {
  const { catalogVersion, setShowWelcome, showWelcome, settings } = useFeed();
  return (
    <footer className="site-footer">
      <div className="wrap">
        <b>{settings?.publicName || 'Javier PC'}</b>
        <span>{settings?.footer || 'Catálogo de juegos de Javier · © 2026'}</span>
        {settings?.socialLinks?.length ? (
          <span>
            {settings.socialLinks.map((s) => (
              <a
                key={s.url}
                className="linklike"
                href={s.url}
                target="_blank"
                rel="noreferrer"
                style={{ marginRight: 12 }}
              >
                {s.label}
              </a>
            ))}
          </span>
        ) : null}
        <span>
          Catálogo v{catalogVersion ?? 1} · Feed v17 ·{' '}
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
