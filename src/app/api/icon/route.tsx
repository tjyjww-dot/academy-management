import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sizeParam = searchParams.get('size') || '192';
  const s = parseInt(sizeParam);

  return new ImageResponse(
    (
      <div
        style={{
          width: s,
          height: s,
          background: 'linear-gradient(135deg, #1a3a7a 0%, #2563eb 100%)',
          borderRadius: s * 0.2,
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
          top: s * -0.15,
          right: s * -0.15,
          width: s * 0.6,
          height: s * 0.6,
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
            fontSize: s * 0.375,
            fontWeight: 900,
            color: '#94a3b8',
            letterSpacing: -2,
          }}>수</span>
          <span style={{
            fontSize: s * 0.375,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: -2,
          }}>탐</span>
        </div>
        <div style={{
          fontSize: s * 0.115,
          color: 'rgba(191,219,254,0.9)',
          fontWeight: 700,
          letterSpacing: 4,
          marginTop: s * -0.04,
          display: 'flex',
        }}>수학탐구</div>
      </div>
    ),
    { width: s, height: s }
  );
}
