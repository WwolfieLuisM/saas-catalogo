import { ImageResponse } from 'next/og';

export const alt = 'Javier PC — catálogo de juegos';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: '#0b0e12',
          color: '#f4f1e8',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: -100,
            top: -180,
            width: 680,
            height: 680,
            borderRadius: 340,
            border: '1px solid rgba(217,184,114,0.2)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: -20,
            top: -100,
            width: 520,
            height: 520,
            borderRadius: 260,
            border: '1px solid rgba(217,184,114,0.16)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 88,
            top: 126,
            width: 300,
            height: 300,
            borderRadius: 36,
            border: '1px solid rgba(217,184,114,0.24)',
            background: 'linear-gradient(145deg, #171a20 0%, #101216 100%)',
            transform: 'rotate(8deg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 164,
              height: 164,
              borderRadius: 42,
              border: '2px solid #d9b872',
              color: '#d9b872',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 116,
              fontWeight: 800,
              transform: 'rotate(-8deg)',
            }}
          >
            J
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 78,
            top: 72,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: '#d9b872',
              color: '#0b0e12',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              fontWeight: 900,
            }}
          >
            J
          </div>
          <div style={{ color: '#d9b872', fontSize: 22, fontWeight: 700, letterSpacing: 5 }}>
            CATÁLOGO GAMING
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 78,
            top: 190,
            width: 680,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ fontSize: 88, lineHeight: 1, fontWeight: 900, letterSpacing: -3 }}>
            Javier PC
          </div>
          <div
            style={{
              marginTop: 22,
              fontSize: 34,
              lineHeight: 1.2,
              color: '#d9b872',
              fontWeight: 700,
            }}
          >
            Tu próximo juego empieza aquí.
          </div>
          <div
            style={{
              marginTop: 24,
              maxWidth: 650,
              fontSize: 25,
              lineHeight: 1.45,
              color: '#b9bec8',
            }}
          >
            Videojuegos para PC · Precios en CUP · Lista de compra por WhatsApp
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 78,
            bottom: 56,
            width: 1044,
            height: 1,
            background: 'rgba(217,184,114,0.28)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 78,
            bottom: 25,
            color: '#8e949f',
            fontSize: 18,
            letterSpacing: 2,
          }}
        >
          JUEGA A TU MANERA
        </div>
      </div>
    ),
    { ...size },
  );
}
