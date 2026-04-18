import { SignJWT, importPKCS8 } from 'jose';
import { prisma } from '@/lib/prisma';

// Google Drive scope: drive.file allows managing files created by this app
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// AppSetting keys for OAuth refresh-token based auth (preferred over service account)
export const DRIVE_REFRESH_TOKEN_KEY = 'google_drive_refresh_token';
export const DRIVE_OWNER_EMAIL_KEY = 'google_drive_owner_email';

type DriveAuthSource = 'oauth' | 'service' | 'none';

// Cache token to avoid re-generating for every request
let cachedToken: { token: string; expiresAt: number; source: DriveAuthSource } | null = null;

/**
 * Force the in-memory access-token cache to be cleared.
 * Call this after connect/disconnect in the OAuth admin UI so the next
 * upload re-authenticates with the new credential.
 */
export function clearDriveTokenCache(): void {
  cachedToken = null;
}

/**
 * Report which credential source Drive is using right now.
 * Used by the admin "Drive 연결" settings page.
 */
export async function getDriveAuthSource(): Promise<DriveAuthSource> {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: DRIVE_REFRESH_TOKEN_KEY },
    });
    if (row?.value) return 'oauth';
  } catch {
    // DB not reachable — fall through and report by env presence
  }
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (key && key.length > 10) return 'service';
  return 'none';
}

/**
 * Load the admin's personal-account refresh token from AppSetting.
 * Returns null if no token has been stored yet.
 */
async function loadRefreshToken(): Promise<string | null> {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: DRIVE_REFRESH_TOKEN_KEY },
    });
    return row?.value || null;
  } catch {
    return null;
  }
}

/**
 * Exchange a stored refresh_token for a short-lived access_token.
 * Throws on failure so the caller can fall back to the service account.
 */
async function exchangeRefreshToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    // If Google reports invalid_grant, the refresh token was revoked
    // (admin visited myaccount.google.com/permissions and removed our app).
    // Clear it from DB so the UI shows "disconnected" and we fall back.
    if (data.error === 'invalid_grant') {
      try {
        await prisma.appSetting.deleteMany({
          where: { key: { in: [DRIVE_REFRESH_TOKEN_KEY, DRIVE_OWNER_EMAIL_KEY] } },
        });
      } catch {}
    }
    throw new Error(
      'refresh_token 교환 실패: ' + (data.error_description || data.error || 'unknown')
    );
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 3600,
  };
}

/**
 * Get Google Drive access token.
 *
 * Priority:
 *   1. OAuth refresh_token stored in AppSetting (admin's personal 15GB account)
 *   2. Service account JWT (legacy — 0 byte personal quota, usually fails)
 *
 * Callers don't need to know which path was used; they just get a Bearer token.
 */
export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  // ─────────────────────────────────────────────────────────────
  // Path 1 · OAuth refresh token (preferred)
  // ─────────────────────────────────────────────────────────────
  const refreshToken = await loadRefreshToken();
  if (refreshToken) {
    try {
      const { accessToken, expiresIn } = await exchangeRefreshToken(refreshToken);
      cachedToken = {
        token: accessToken,
        expiresAt: Date.now() + expiresIn * 1000,
        source: 'oauth',
      };
      return accessToken;
    } catch (err) {
      // Log and fall through to service account
      console.warn('[googleDrive] OAuth refresh failed, falling back to service account:', err);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Path 2 · Service account JWT (legacy fallback)
  // ─────────────────────────────────────────────────────────────
  const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');

  if (!serviceAccountKey.private_key || !serviceAccountKey.client_email) {
    throw new Error(
      'Google Drive 인증이 설정되지 않았습니다. 관리자 설정 → Drive 연결에서 Google 계정을 연결해 주세요.'
    );
  }

  const privateKey = await importPKCS8(serviceAccountKey.private_key, 'RS256');

  const jwt = await new SignJWT({
    scope: DRIVE_SCOPE,
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

  cachedToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
    source: 'service',
  };

  return tokenData.access_token;
}

/**
 * Find or create a folder in Google Drive
 */
export async function findOrCreateFolder(
  accessToken: string,
  folderName: string,
  parentId?: string
): Promise<string> {
  // Search for existing folder
  let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create new folder
  const metadata: Record<string, unknown> = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  const created = await createRes.json();
  if (!created.id) {
    throw new Error('Failed to create folder: ' + JSON.stringify(created));
  }

  return created.id;
}

/**
 * Ensure nested folder path exists (e.g., "수탐학원/시험지/중1A반")
 * Returns the final folder's ID
 */
export async function ensureFolderPath(
  accessToken: string,
  folderPath: string[],
  rootFolderId?: string
): Promise<string> {
  let parentId = rootFolderId;

  for (const folderName of folderPath) {
    parentId = await findOrCreateFolder(accessToken, folderName, parentId);
  }

  return parentId!;
}

/**
 * Upload a file to Google Drive
 * Returns { id, url } where url is the direct view/download link
 */
export async function uploadFile(
  accessToken: string,
  fileName: string,
  fileBuffer: Buffer | Uint8Array,
  mimeType: string,
  folderId?: string
): Promise<{ id: string; url: string; thumbnailUrl: string }> {
  // Use multipart upload for files
  const metadata: Record<string, unknown> = {
    name: fileName,
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = '===boundary_' + Date.now() + '===';
  const metadataStr = JSON.stringify(metadata);

  // Build multipart body
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];

  // Metadata part
  parts.push(encoder.encode(
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    metadataStr + '\r\n'
  ));

  // File content part
  parts.push(encoder.encode(
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  ));
  parts.push(fileBuffer instanceof Buffer ? new Uint8Array(fileBuffer) : fileBuffer);
  parts.push(encoder.encode(`\r\n--${boundary}--`));

  // Concatenate all parts
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const body = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.length;
  }

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink,thumbnailLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: body,
    }
  );

  const uploaded = await uploadRes.json();
  if (!uploaded.id) {
    throw new Error('Failed to upload file: ' + JSON.stringify(uploaded));
  }

  // Make the file publicly readable
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    }
  );

  // Return direct image URL (works without auth)
  const directUrl = `https://drive.google.com/uc?export=view&id=${uploaded.id}`;
  const thumbnailUrl = `https://drive.google.com/thumbnail?id=${uploaded.id}&sz=w400`;

  return {
    id: uploaded.id,
    url: directUrl,
    thumbnailUrl,
  };
}

/**
 * Upload a file from a File/Blob object (convenience for API routes)
 */
export async function uploadFileFromBlob(
  fileName: string,
  file: File | Blob,
  mimeType: string,
  folderPath?: string[]
): Promise<{ id: string; url: string; thumbnailUrl: string }> {
  const accessToken = await getAccessToken();

  // Ensure folder structure exists
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  let folderId: string | undefined;

  if (folderPath && folderPath.length > 0) {
    folderId = await ensureFolderPath(accessToken, folderPath, rootFolderId);
  } else {
    folderId = rootFolderId;
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return uploadFile(accessToken, fileName, buffer, mimeType, folderId);
}

/**
 * Delete a file from Google Drive
 */
export async function deleteFile(fileId: string): Promise<void> {
  const accessToken = await getAccessToken();

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete file: ${res.status}`);
  }
}

/**
 * Extract Google Drive file ID from a URL
 */
export function extractFileId(url: string): string | null {
  // https://drive.google.com/uc?export=view&id=FILE_ID
  const match1 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match1) return match1[1];

  // https://drive.google.com/file/d/FILE_ID/view
  const match2 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match2) return match2[1];

  // https://drive.google.com/thumbnail?id=FILE_ID
  const match3 = url.match(/thumbnail\?id=([a-zA-Z0-9_-]+)/);
  if (match3) return match3[1];

  return null;
}
