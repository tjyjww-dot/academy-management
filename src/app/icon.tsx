import { ImageResponse } from 'next/og';

export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 192,
          height: 192,
          background: 'linear-gradient(135deg, #1a3a7a 0%, #2563eb 100%)',
          borderRadius: 40,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background accent */}
        <div style={{
          position: 'absolute',
          top: -30,
          right: -30,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
          display: 'flex',
        }} />
        {/* Main text */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
        }}>
          <span style={{
            fontSize: 72,
            fontWeight: 900,
            color: '#94a3b8',
            letterSpacing: -2,
          }}>수</span>
          <span style={{
            fontSize: 72,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: -2,
          }}>탐</span>
        </div>
        {/* Subtitle */}
        <div style={{
          fontSize: 22,
          color: 'rgba(191,219,254,0.9)',
          fontWeight: 700,
          letterSpacing: 4,
          marginTop: -8,
          display: 'flex',
        }}>수학탐구</div>
      </div>
    ),
    { ...size }
  );
}
