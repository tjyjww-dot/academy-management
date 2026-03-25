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
    if (!tokenData.access_token) {
          throw new Error('Failed to get access token: ' + JSON.stringify(tokenData));
    }
    return tokenData.access_token;
}

async function listFiles(accessToken: string, folderId?: string) {
    let query: string;
    if (folderId) {
          query = `'${folderId}' in parents and trashed = false`;
    } else {
          // No folder ID: list all folders shared with service account
      query = `mimeType = 'application/vnd.google-apps.folder' and trashed = false and sharedWithMe = true`;
    }
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime)&orderBy=name`;

  const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json();

  // Check for Google API errors
  if (data.error) {
        throw new Error(data.error.message || 'Google Drive API error');
  }

  return data;
}

async function downloadFile(accessToken: string, fileId: string) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status}`);
  }

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
              const result = await listFiles(accessToken, folderId || undefined);
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
          const message = error instanceof Error ? error.message : 'Failed to access Google Drive';
          return NextResponse.json({ error: message }, { status: 500 });
    }
}
