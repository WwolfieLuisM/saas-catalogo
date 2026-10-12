'use client';

import { useFeed } from '@/hooks/useFeed';
import { deliver } from '@/lib/feed/deliver';

export function Toast() {
  const { toastMsg } = useFeed();
  return (
    <div className={`toast${toastMsg ? ' show' : ''}`} role="status" aria-live="polite">
      {toastMsg}
    </div>
  );
}

export function ContactSection() {
  const { toast } = useFeed();

  const contact = async () => {
    const result = await deliver('Hola Javier, quiero consultar por un juego.');
    if (result === 'whatsapp') toast('Abriendo WhatsApp…');
    else if (result === 'clipboard' || result === 'fallback') {
      toast('Mensaje copiado. Pégalo en tu chat con Javier.');
    } else {
      toast('No se pudo abrir WhatsApp ni copiar el mensaje.');
    }
  };

  return (
    <section className="wrap" id="contact" aria-label="Contacto" style={{ paddingBottom: 8 }}>
      <div className="contact">
        <div>
          <b>¿No ves tu juego?</b>
          <span>Dinos cuál es y lo conseguimos para ti.</span>
        </div>
        <button className="btn gold" type="button" onClick={() => void contact()}>
          Escribir a Javier
        </button>
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
