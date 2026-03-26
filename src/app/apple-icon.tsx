import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: 'linear-gradient(135deg, #1a3a7a 0%, #2563eb 100%)',
          borderRadius: 36,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute',
          top: -30,
          right: -30,
          width: 110,
          height: 110,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
          display: 'flex',
        }} />
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
        }}>
          <span style={{
            fontSize: 68,
            fontWeight: 900,
            color: '#94a3b8',
            letterSpacing: -2,
          }}>수</span>
          <span style={{
            fontSize: 68,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: -2,
          }}>탐</span>
        </div>
        <div style={{
          fontSize: 20,
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
