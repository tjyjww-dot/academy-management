import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, importPKCS8 } from 'jose';

// Google Drive API helper functions
async function getAccessToken() {
  const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');
  const privateKey = await importPKCS8(serviceAccountKey.private_key, 'RS256');
  
  const jwt = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/drive.readonly',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer(serviceAccountKey.client_email)
    .setSubject(serviceAccountKey.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .sign(privateKey);

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function listFiles(accessToken: string, folderId: string) {
  const query = `'${folderId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime)&orderBy=name`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  return response.json();
}

async function downloadFile(accessToken: string, fileId: string) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// GET: List folders and files
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId') || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '';
    const action = searchParams.get('action') || 'list';

    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      return NextResponse.json({ error: 'Google Service Account not configured' }, { status: 500 });
    }

    const accessToken = await getAccessToken();

    if (action === 'list') {
      const result = await listFiles(accessToken, folderId);
      return NextResponse.json(result);
    }

    if (action === 'download') {
      const fileId = searchParams.get('fileId');
      if (!fileId) {
        return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
      }
      const buffer = await downloadFile(accessToken, fileId);
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline',
        },
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Google Drive API error:', error);
    return NextResponse.json({ error: 'Failed to access Google Drive' }, { status: 500 });
  }
}
