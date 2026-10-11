import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@/styles/feed.css';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Javier PC · Catálogo de videojuegos',
    template: '%s · Javier PC',
  },
  description:
    'Catálogo público de videojuegos para PC: precios en CUP, disponibilidad y lista de compra por WhatsApp.',
  keywords: [
    'videojuegos',
    'PC',
    'catálogo',
    'CUP',
    'Cuba',
    'Javier PC',
    'juegos',
    'precios',
  ],
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Javier PC',
    title: 'Javier PC · Catálogo de videojuegos',
    description:
      'Catálogo público de videojuegos para PC: precios en CUP, disponibilidad y lista de compra por WhatsApp.',
    url: siteUrl,
    images: [{ url: '/icon.svg', width: 32, height: 32, alt: 'Javier PC' }],
  },
  twitter: {
    card: 'summary',
    title: 'Javier PC · Catálogo de videojuegos',
    description:
      'Catálogo público de videojuegos para PC: precios en CUP, disponibilidad y lista de compra por WhatsApp.',
    images: ['/icon.svg'],
  },
  alternates: {
    canonical: siteUrl,
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/icon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0e12',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link rel="preconnect" href="https://wsrv.nl" />
        <link rel="dns-prefetch" href="https://shared.akamai.steamstatic.com" />
      </head>
      <body>{children}</body>
    </html>
  );
}
