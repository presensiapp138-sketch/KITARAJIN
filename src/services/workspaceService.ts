/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User as FirebaseUser,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  getAllUsers,
  getAllDepartments,
  getAllSchedules,
  getAllLocations,
  getAllFaceRegistry,
  getAllAttendanceRecords,
  getAllLeaveRequests,
  getAllAssignments,
  getAuditLogs,
  getAppSettings,
  updateAppSettings,
  reconcileUserReferences,
  refreshCurrentSessionFromUsers,
} from './storage';
import { hashPassword } from './crypto';
import {
  mergeUserRecordsNonDestructive,
  syncRecordToCloud,
  SEED_BASELINE_ISO,
  SYNC_COLLECTIONS,
} from './firestoreSync';
import { User } from '../types';

// Inisialisasi Firebase App secara aman (reuse instance yang ada)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Provider Google dengan scope Sheets dan Drive
export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

const provider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((s) => provider.addScope(s));
provider.setCustomParameters({
  prompt: 'select_account',
});

// Cache token OAuth murni di memori (tidak pernah di localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;
let cachedGoogleUser: FirebaseUser | null = null;
let isSigningIn = false;

export const PENDING_WORKSPACE_SYNC_KEY = 'kitarajin_pending_workspace_users_sync';
export const PENDING_WORKSPACE_FULL_SYNC_KEY = 'kitarajin_pending_workspace_full_sync';
export const DRIVE_USERS_BACKUP_FILENAME = 'KITARAJIN_Users_Database.json';
export const DRIVE_FULL_BACKUP_FILENAME = 'KITARAJIN_Full_Database.json';

const emitWorkspaceSyncEvent = (detail: Record<string, any> = {}): void => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kitarajin_workspace_sync', { detail }));
  }
};

export const hasPendingWorkspaceUserSync = (): boolean => {
  const settings = getAppSettings();
  const syncedMs = Date.parse(settings.lastWorkspaceUserSyncAt || '') || 0;
  const mutatedMs = Date.parse(settings.lastUserMutationAt || '') || 0;
  const localPendingStr = localStorage.getItem(PENDING_WORKSPACE_SYNC_KEY);
  const localPendingMs = Date.parse(localPendingStr || '') || 0;

  if (syncedMs > 0 && syncedMs >= mutatedMs && syncedMs >= localPendingMs) {
    return false;
  }
  return Boolean(localPendingStr) || mutatedMs > syncedMs;
};

export const hasPendingWorkspaceFullSync = (): boolean => {
  const settings = getAppSettings();
  const syncedMs = Date.parse(settings.lastWorkspaceFullSyncAt || settings.lastWorkspaceUserSyncAt || '') || 0;
  const mutatedMs = Math.max(
    Date.parse(settings.lastDataMutationAt || '') || 0,
    Date.parse(settings.lastUserMutationAt || '') || 0
  );
  const localPendingStr = localStorage.getItem(PENDING_WORKSPACE_FULL_SYNC_KEY);
  const localPendingMs = Date.parse(localPendingStr || '') || 0;

  if (syncedMs > 0 && syncedMs >= mutatedMs && syncedMs >= localPendingMs) {
    return false;
  }
  return Boolean(localPendingStr) || mutatedMs > syncedMs || hasPendingWorkspaceUserSync();
};

export const markPendingWorkspaceUserSync = (): void => {
  const nowIso = new Date().toISOString();
  localStorage.setItem(PENDING_WORKSPACE_SYNC_KEY, nowIso);
  localStorage.setItem(PENDING_WORKSPACE_FULL_SYNC_KEY, nowIso);
  emitWorkspaceSyncEvent({ pending: true, pendingFull: true });
};

export const markPendingWorkspaceFullSync = (): void => {
  localStorage.setItem(PENDING_WORKSPACE_FULL_SYNC_KEY, new Date().toISOString());
  emitWorkspaceSyncEvent({ pendingFull: true });
};

export const clearPendingWorkspaceUserSync = (): void => {
  localStorage.removeItem(PENDING_WORKSPACE_SYNC_KEY);
  localStorage.removeItem(PENDING_WORKSPACE_FULL_SYNC_KEY);
  emitWorkspaceSyncEvent({ pending: false, pendingFull: false });
};

export const getConnectedGoogleEmail = (): string | null => {
  if (cachedGoogleUser?.email) return cachedGoogleUser.email;
  const settings = getAppSettings();
  if (settings.isGoogleConnected && settings.googleAccountEmail) {
    return settings.googleAccountEmail;
  }
  return localStorage.getItem('kitarajin_google_account_email') || null;
};

export const hasRealAccessToken = (): boolean => {
  if (!cachedAccessToken || cachedAccessToken.startsWith('access-token-')) {
    return false;
  }
  if (tokenExpiresAt > 0 && Date.now() >= tokenExpiresAt) {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
    return false;
  }
  return true;
};

export const linkGoogleAccount = (
  email: string,
  userDisplayName: string = 'Kepala Sekolah'
): { user: FirebaseUser; accessToken: string | null } => {
  const cleanEmail = email.trim();
  const linkedUser = {
    email: cleanEmail,
    displayName: userDisplayName,
    uid: `google-${Date.now()}`,
    photoURL: null,
  } as unknown as FirebaseUser;

  cachedGoogleUser = linkedUser;
  localStorage.setItem('kitarajin_google_account_email', cleanEmail);

  return {
    user: linkedUser,
    accessToken: hasRealAccessToken() ? cachedAccessToken : null,
  };
};

export const unlinkGoogleAccount = (): void => {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
  cachedGoogleUser = null;
  localStorage.removeItem('kitarajin_google_account_email');
  emitWorkspaceSyncEvent({ tokenActive: false });
};

export const initAuth = (
  onAuthSuccess?: (user: FirebaseUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  const existingConnectedEmail = getConnectedGoogleEmail();
  if (existingConnectedEmail && !cachedGoogleUser) {
    linkGoogleAccount(existingConnectedEmail);
  }

  try {
    return onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
      if (user) {
        cachedGoogleUser = user;
        if (user.email) {
          localStorage.setItem('kitarajin_google_account_email', user.email);
        }
        if (hasRealAccessToken() && cachedAccessToken) {
          if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
        } else if (!isSigningIn) {
          cachedAccessToken = null;
          if (onAuthFailure) onAuthFailure();
        }
      } else {
        cachedAccessToken = null;
        if (!getConnectedGoogleEmail()) {
          cachedGoogleUser = null;
        }
        if (onAuthFailure) onAuthFailure();
      }
    });
  } catch (err) {
    console.warn('Firebase initAuth caught error:', err);
    return () => {};
  }
};

/**
 * Pesan kesalahan autentikasi Google dalam Bahasa Indonesia yang jelas
 */
export function formatAuthErrorMessage(error: any): string {
  if (!error) return 'Silakan otorisasi akun Google Anda untuk menyinkronkan ke Drive & Sheets.';
  const msg = typeof error === 'string' ? error : error.message || error.code || '';
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  if (msg.includes('auth/popup-blocked')) {
    return 'Jendela popup login Google terhalang browser. Mohon izinkan popup di browser Anda lalu klik kembali tombol Hubungkan Google.';
  }
  if (msg.includes('auth/popup-closed-by-user') || msg.includes('cancelled-popup-request')) {
    return 'Jendela login Google ditutup sebelum selesai. Klik kembali tombol Hubungkan Google untuk melanjutkan sinkronisasi Drive & Sheets.';
  }
  if (msg.includes('auth/unauthorized-domain') || msg.includes('origin_mismatch')) {
    return `Domain aplikasi (${currentHost || 'domain saat ini'}) belum masuk daftar Authorized Domains / OAuth Origins di Google Console. Hubungkan ulang via AI Studio atau tambahkan "${currentHost}" pada Authorized Domains.`;
  }
  if (msg.toLowerCase().includes('401') || msg.toLowerCase().includes('invalid credentials')) {
    return 'Sesi akses Google telah berakhir. Silakan klik Hubungkan / Otorisasi Ulang Akun Google.';
  }
  return msg;
}

/**
 * Tunggu sebentar jika script Google Identity Services masih dimuat secara async
 */
async function waitForGisLoaded(timeoutMs = 2500): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const gsi = typeof window !== 'undefined' ? (window as any).google?.accounts?.oauth2 : null;
    if (gsi?.initTokenClient) return gsi;
    await new Promise((r) => setTimeout(r, 120));
  }
  return typeof window !== 'undefined' ? (window as any).google?.accounts?.oauth2 || null : null;
}

/**
 * Fallback Google Identity Services (GIS) Token Client jika Firebase Popup menolak domain kustom (mis. Vercel)
 */
async function signInWithGisFallback(emailHint?: string): Promise<{
  user: FirebaseUser;
  accessToken: string;
} | null> {
  const oauthClientId = (firebaseConfig as any)?.oAuthClientId;
  const gsi = await waitForGisLoaded();
  if (!oauthClientId || !gsi?.initTokenClient) {
    return null;
  }

  return new Promise((resolve, reject) => {
    try {
      const client = gsi.initTokenClient({
        client_id: oauthClientId,
        scope: WORKSPACE_SCOPES.join(' '),
        hint: emailHint && emailHint.includes('@') ? emailHint.trim() : undefined,
        callback: async (tokenResponse: any) => {
          if (tokenResponse?.error || !tokenResponse?.access_token) {
            reject(
              new Error(
                tokenResponse?.error_description ||
                  tokenResponse?.error ||
                  'Gagal mendapatkan token akses melalui popup Google.'
              )
            );
            return;
          }

          const token = tokenResponse.access_token as string;
          const expiresSec = Number(tokenResponse.expires_in) || 3500;
          let resolvedEmail = emailHint?.trim() || getConnectedGoogleEmail() || '';
          let resolvedName = 'Pengguna Google';
          try {
            const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (infoRes.ok) {
              const info = await infoRes.json();
              if (info?.email) resolvedEmail = info.email;
              if (info?.name) resolvedName = info.name;
            }
          } catch {
            // Gunakan emailHint jika userinfo opsional gagal
          }

          const fallbackUser = {
            email: resolvedEmail || 'Akun Google Terhubung',
            displayName: resolvedName,
            uid: `gis-${Date.now()}`,
            photoURL: null,
          } as unknown as FirebaseUser;

          cachedAccessToken = token;
          tokenExpiresAt = Date.now() + Math.max(300, expiresSec - 90) * 1000;
          cachedGoogleUser = fallbackUser;
          if (resolvedEmail) {
            localStorage.setItem('kitarajin_google_account_email', resolvedEmail);
          }
          emitWorkspaceSyncEvent({ tokenActive: true });

          resolve({ user: fallbackUser, accessToken: token });
        },
        error_callback: (err: any) => {
          reject(new Error(err?.message || err?.type || 'Popup Google gagal dibuka atau dibatalkan.'));
        },
      });
      client.requestAccessToken({ prompt: emailHint ? '' : 'select_account' });
    } catch (e: any) {
      reject(e);
    }
  });
}

export const signInWithGoogle = async (
  emailHint?: string
): Promise<{
  user: FirebaseUser;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const customProvider = new GoogleAuthProvider();
    WORKSPACE_SCOPES.forEach((s) => customProvider.addScope(s));

    const customParams: Record<string, string> = {
      prompt: 'select_account',
    };
    if (emailHint && emailHint.trim().includes('@')) {
      customParams.login_hint = emailHint.trim();
    }
    customProvider.setCustomParameters(customParams);

    const result = await signInWithPopup(auth, customProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal memperoleh token akses Google Drive & Sheets.');
    }
    cachedAccessToken = credential.accessToken;
    tokenExpiresAt = Date.now() + 50 * 60 * 1000;
    cachedGoogleUser = result.user;
    if (result.user.email) {
      localStorage.setItem('kitarajin_google_account_email', result.user.email);
    }
    emitWorkspaceSyncEvent({ tokenActive: true });
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    const errMsg = String(error?.code || error?.message || error || '');
    console.warn('Google Sign In primary popup note:', errMsg);

    // Jika Firebase Auth melaporkan unauthorized-domain (misal saat dibuka dari domain custom), coba GIS fallback
    if (errMsg.includes('unauthorized-domain')) {
      try {
        const gisResult = await signInWithGisFallback(emailHint);
        if (gisResult) return gisResult;
      } catch (gisErr: any) {
        console.warn('GIS fallback error:', gisErr?.message || gisErr);
      }
    }

    const cleanMsg = formatAuthErrorMessage(error);
    throw new Error(cleanMsg);
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return hasRealAccessToken() ? cachedAccessToken : null;
};

export const getGoogleUser = (): FirebaseUser | null => {
  return cachedGoogleUser || auth.currentUser;
};

export const signOutGoogle = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch {
    // ignore
  }
  unlinkGoogleAccount();
};

/**
 * Pembersih ID Google Spreadsheet / Folder Drive dari URL lengkap
 */
export const cleanGoogleId = (val: string): string => {
  if (!val) return '';
  const trimmed = val.trim();
  const sheetMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheetMatch) return sheetMatch[1];
  const dMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch) return dMatch[1];
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  return trimmed.split('?')[0].split('#')[0];
};

// ==========================================
// Struktur 10 Tabel KITARAJIN
// ==========================================
export const USER_SHEET_HEADERS = [
  'ID',
  'NIP',
  'Nama Lengkap',
  'Email',
  'Username',
  'Password',
  'Password Hash',
  'Peran',
  'Jabatan',
  'Departemen',
  'Sesi Presensi',
  'Status Aktif',
  'Dibuat',
  'Diperbarui',
  'No. Telepon',
];

export function formatUserRowForSheet(u: User): any[] {
  return [
    u.id,
    u.nip,
    u.name,
    u.email || '',
    u.username,
    u.savedPassword || '',
    u.passwordHash || '',
    u.role,
    u.position,
    u.departmentName || u.departmentId || '',
    (u.assignedSessionIds && u.assignedSessionIds.length > 0
      ? u.assignedSessionIds
      : ['sesi-1', 'sesi-2', 'sesi-3']
    ).join(', '),
    u.isActive ? 'AKTIF' : 'NONAKTIF',
    u.createdAt,
    u.updatedAt,
    u.phone || '',
  ];
}

export const TAB_DEFINITIONS = [
  {
    name: 'Users',
    headers: USER_SHEET_HEADERS,
    getData: () => getAllUsers().map(formatUserRowForSheet),
  },
  {
    name: 'Departments',
    headers: ['ID', 'Kode', 'Nama Departemen', 'Deskripsi', 'Kepala Divisi', 'Dibuat'],
    getData: () =>
      getAllDepartments().map((d) => [d.id, d.code, d.name, d.description || '', d.headName || '', d.createdAt]),
  },
  {
    name: 'Schedules',
    headers: [
      'ID',
      'Nama Jadwal',
      'Sesi',
      'Target Role',
      'Buka Masuk',
      'Batas Masuk',
      'Toleransi (Mnt)',
      'Mulai Pulang',
      'Batas Pulang',
      'Hari Kerja',
      'Status',
    ],
    getData: () =>
      getAllSchedules().map((s) => [
        s.id,
        s.name,
        s.sessionName || '',
        s.targetRole || 'semua',
        s.checkInStart,
        s.checkInDeadline,
        s.lateToleranceMinutes,
        s.checkOutStart,
        s.checkOutEnd || '',
        (s.workDays || []).join(', '),
        s.isActive ? 'AKTIF' : 'NONAKTIF',
      ]),
  },
  {
    name: 'Locations',
    headers: ['ID', 'Nama Lokasi', 'Latitude', 'Longitude', 'Radius (Meter)', 'Alamat', 'Status Aktif'],
    getData: () =>
      getAllLocations().map((l) => [
        l.id,
        l.name,
        l.latitude,
        l.longitude,
        l.radiusMeters,
        l.address,
        l.isActive ? 'AKTIF' : 'NONAKTIF',
      ]),
  },
  {
    name: 'FaceRegistry',
    headers: ['ID', 'User ID', 'NIP', 'Nama Pengguna', 'Peran', 'Kamera', 'Skor Kualitas', 'Pendaftar', 'Status'],
    getData: () =>
      getAllFaceRegistry().map((f) => [
        f.id,
        f.userId,
        f.nip,
        f.userName,
        f.role,
        f.cameraUsed,
        f.qualityScore,
        f.registeredBy,
        f.isActive ? 'AKTIF' : 'NONAKTIF',
      ]),
  },
  {
    name: 'Attendance',
    headers: [
      'ID',
      'User ID',
      'NIP',
      'Nama',
      'Peran',
      'Tanggal',
      'Tipe',
      'Waktu',
      'Status',
      'Jarak GPS (M)',
      'Lokasi Valid',
      'Wajah Valid',
      'Skor Wajah (%)',
      'Catatan',
    ],
    getData: () =>
      getAllAttendanceRecords().map((a) => [
        a.id,
        a.userId,
        a.nip,
        a.userName,
        a.role,
        a.date,
        a.type.toUpperCase(),
        a.timestamp,
        a.status,
        Math.round(a.distanceFromLocationMeters),
        a.isLocationValid ? 'VALID' : 'LUAR RADIUS',
        a.isFaceValid ? 'VALID' : 'TIDAK COCOK',
        Math.round(a.faceSimilarityScore * 100),
        a.notes || '',
      ]),
  },
  {
    name: 'LeaveRequests',
    headers: [
      'ID',
      'User ID',
      'NIP',
      'Nama',
      'Tipe Izin',
      'Mulai',
      'Selesai',
      'Durasi (Hari)',
      'Alasan',
      'Status',
      'Direview Oleh',
      'Catatan Review',
      'Waktu Pengajuan',
    ],
    getData: () =>
      getAllLeaveRequests().map((l) => [
        l.id,
        l.userId,
        l.nip,
        l.userName,
        l.type,
        l.startDate,
        l.endDate,
        l.durationDays,
        l.reason,
        l.status,
        l.reviewedBy || '',
        l.reviewNotes || '',
        l.createdAt,
      ]),
  },
  {
    name: 'Assignments',
    headers: [
      'ID',
      'Judul Penugasan',
      'Deskripsi',
      'Ditugaskan Kepada',
      'Pemberi Tugas',
      'Batas Waktu',
      'Status',
      'Foto Bukti Geotag',
      'Catatan',
      'Dibuat',
    ],
    getData: () =>
      getAllAssignments().map((asg) => [
        asg.id,
        asg.title,
        asg.description,
        asg.assignedToName,
        asg.assignedByName,
        asg.dueDate,
        asg.status,
        asg.documentationPhotoRef ? 'ADA FOTO BUKTI' : 'BELUM ADA',
        asg.documentationNotes || '',
        asg.createdAt,
      ]),
  },
  {
    name: 'AuditLogs',
    headers: ['ID', 'Aktor ID', 'Nama Aktor', 'Peran Aktor', 'Aksi', 'Tabel Entitas', 'Target ID', 'Keterangan Rinci', 'Waktu Kejadian'],
    getData: () =>
      getAuditLogs().map((log) => [
        log.id,
        log.actorUserId,
        log.actorName,
        log.actorRole,
        log.action,
        log.targetEntity,
        log.targetId || '',
        log.details,
        log.timestamp,
      ]),
  },
  {
    name: 'Settings',
    headers: [
      'Nama Sekolah',
      'Alamat Sekolah',
      'Judul Aplikasi',
      'Ambang Wajah (%)',
      'Ketat GPS',
      'Ketat Wajah',
      'Mode Penyimpanan',
      'ID Spreadsheet',
      'ID Folder Drive',
      'Sinkron Terakhir',
    ],
    getData: () => {
      const s = getAppSettings();
      return [
        [
          s.schoolName,
          s.schoolAddress,
          s.appTitle,
          Math.round((s.minFaceMatchThreshold || 0.75) * 100),
          s.requireStrictGps ? 'YA' : 'TIDAK',
          s.requireStrictFaceVerification ? 'YA' : 'TIDAK',
          s.storageMode,
          s.googleSheetSpreadsheetId || '',
          s.googleDriveFolderId || '',
          s.lastSyncTimestamp || new Date().toISOString(),
        ],
      ];
    },
  },
];

// ==========================================
// Helper Sinkronisasi Non-Destructive Users (Username & Password)
// ke Google Sheets & Google Drive
// ==========================================

async function parseSheetRowsToUsers(rows: any[][]): Promise<User[]> {
  if (!rows || rows.length < 2) return [];
  const headerRow = rows[0].map((h) => String(h || '').trim().toLowerCase());

  const findCol = (...candidates: string[]): number => {
    for (const c of candidates) {
      const idx = headerRow.indexOf(c.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idxId = findCol('id');
  const idxNip = findCol('nip');
  const idxName = findCol('nama lengkap', 'nama', 'name');
  const idxEmail = findCol('email');
  const idxUsername = findCol('username');
  const idxPassword = findCol('password', 'sandi', 'savedpassword');
  const idxPasswordHash = findCol('password hash', 'passwordhash', 'hash');
  const idxRole = findCol('peran', 'role');
  const idxPosition = findCol('jabatan', 'position');
  const idxDept = findCol('departemen', 'departemen id', 'departmentname', 'departmentid');
  const idxSessions = findCol('sesi presensi', 'assignedsessionids');
  const idxStatus = findCol('status aktif', 'status', 'isactive');
  const idxCreated = findCol('dibuat', 'createdat');
  const idxUpdated = findCol('diperbarui', 'updatedat');
  const idxPhone = findCol('no. telepon', 'telepon', 'no. hp', 'phone');

  const normalizeSheetTimestamp = (rawVal: any): string => {
    if (!rawVal) return SEED_BASELINE_ISO;
    const str = String(rawVal).trim();
    if (!str) return SEED_BASELINE_ISO;
    const direct = Date.parse(str);
    if (!isNaN(direct)) return new Date(direct).toISOString();
    const idMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (idMatch) {
      const [, d, m, y, hh = '0', mm = '0', ss = '0'] = idMatch;
      const ms = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)).getTime();
      if (!isNaN(ms)) return new Date(ms).toISOString();
    }
    return SEED_BASELINE_ISO;
  };

  const parsedUsers: User[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;

    const username = idxUsername !== -1 ? String(r[idxUsername] || '').trim() : '';
    const id = idxId !== -1 ? String(r[idxId] || '').trim() : '';
    if (!username && !id) continue;

    const savedPassword = idxPassword !== -1 ? String(r[idxPassword] || '').trim() : '';
    let passwordHash = idxPasswordHash !== -1 ? String(r[idxPasswordHash] || '').trim() : '';
    if (!passwordHash && savedPassword) {
      passwordHash = await hashPassword(savedPassword);
    }

    const rawRole = idxRole !== -1 ? String(r[idxRole] || '').trim().toLowerCase() : 'karyawan';
    const role: User['role'] =
      rawRole === 'kepala_sekolah' || rawRole === 'admin' || rawRole === 'karyawan'
        ? (rawRole as User['role'])
        : 'karyawan';

    const rawStatus = idxStatus !== -1 ? String(r[idxStatus] || 'AKTIF').trim().toUpperCase() : 'AKTIF';
    const isActive = rawStatus !== 'NONAKTIF' && rawStatus !== 'FALSE' && rawStatus !== '0';

    const sessionsRaw = idxSessions !== -1 ? String(r[idxSessions] || '').trim() : '';
    const assignedSessionIds = sessionsRaw
      ? sessionsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : ['sesi-1', 'sesi-2', 'sesi-3'];

    const deptVal = idxDept !== -1 ? String(r[idxDept] || '').trim() : '';
    const phoneVal = idxPhone !== -1 ? String(r[idxPhone] || '').trim() : '';

    parsedUsers.push({
      id: id || `usr-sheet-${username || i}`,
      nip: idxNip !== -1 ? String(r[idxNip] || '').trim() : '',
      name: idxName !== -1 ? String(r[idxName] || '').trim() : username,
      email: idxEmail !== -1 ? String(r[idxEmail] || '').trim() || undefined : undefined,
      username,
      passwordHash,
      savedPassword: savedPassword || undefined,
      role,
      departmentId: deptVal,
      departmentName: deptVal,
      position: idxPosition !== -1 ? String(r[idxPosition] || '').trim() : 'Pegawai',
      phone: phoneVal || undefined,
      assignedSessionIds,
      isActive,
      createdAt: idxCreated !== -1 ? normalizeSheetTimestamp(r[idxCreated]) : SEED_BASELINE_ISO,
      updatedAt: idxUpdated !== -1 ? normalizeSheetTimestamp(r[idxUpdated]) : SEED_BASELINE_ISO,
    });
  }

  return parsedUsers;
}

/**
 * Pastikan tab 'Users' ada di Spreadsheet, baca baris yang sudah ada,
 * gabungkan tanpa menghapus username/password lama, lalu tulis kembali hasil gabungannya.
 */
export async function syncUsersWithGoogleSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<{
  totalUsers: number;
  importedFromSheet: number;
  updatedLocal: boolean;
}> {
  const cleanId = cleanGoogleId(spreadsheetId);
  if (!cleanId) {
    throw new Error('ID Google Spreadsheet belum diatur.');
  }

  // 1. Cek daftar sheet/tab yang ada
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal mengakses Google Spreadsheet (${metaRes.status})`);
  }

  const meta = await metaRes.json();
  const existingTitles: string[] = (meta.sheets || []).map((s: any) => s.properties?.title);

  if (!existingTitles.includes('Users')) {
    const addTabRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: 'Users',
                  gridProperties: { frozenRowCount: 1 },
                },
              },
            },
          ],
        }),
      }
    );
    if (!addTabRes.ok) {
      const err = await addTabRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Gagal menambahkan tab Users di Spreadsheet.');
    }
  }

  // 2. Baca semua data existing di tab 'Users' agar username & password sebelumnya TIDAK PERNAH terhapus
  let sheetUsers: User[] = [];
  const readRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/'Users'!A1:Z2000`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (readRes.ok) {
    const readData = await readRes.json();
    if (Array.isArray(readData.values) && readData.values.length > 0) {
      sheetUsers = await parseSheetRowsToUsers(readData.values);
    }
  }

  // 3. Gabungkan non-destruktif dengan local/Firestore users
  const localUsers = getAllUsers();
  const { merged } = mergeUserRecordsNonDestructive(localUsers, sheetUsers);

  // Pastikan setiap user punya passwordHash jika memiliki savedPassword
  for (const u of merged) {
    if (!u.passwordHash && u.savedPassword) {
      u.passwordHash = await hashPassword(u.savedPassword);
    }
  }

  const importedFromSheet = merged.length - localUsers.length;
  const updatedLocal =
    importedFromSheet > 0 ||
    JSON.stringify(merged.map((u) => u.id + u.updatedAt)) !==
      JSON.stringify(localUsers.map((u) => u.id + u.updatedAt));

  // Simpan hasil gabungan ke localStorage & Cloud Firestore
  localStorage.setItem('kitarajin_table_users', JSON.stringify(merged));
  reconcileUserReferences(merged, updatedLocal);
  refreshCurrentSessionFromUsers();
  for (const u of merged) {
    syncRecordToCloud(SYNC_COLLECTIONS.USERS, u.id, u).catch(() => {});
  }

  // 4. Tulis hasil gabungan ke tab 'Users' Google Sheets (mode RAW agar NIP, No. HP, Password angka, dan Timestamp ISO tidak berubah)
  const rowsToWrite = [USER_SHEET_HEADERS, ...merged.map(formatUserRowForSheet)];
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/'Users'!A1:Z2000:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  ).catch(() => {});

  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/'Users'!A1?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `'Users'!A1`,
        majorDimension: 'ROWS',
        values: rowsToWrite,
      }),
    }
  );

  if (!writeRes.ok) {
    const err = await writeRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal menulis data Username & Password ke Google Sheets.');
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kitarajin_cloud_sync', { detail: { collection: 'users' } }));
  }

  return {
    totalUsers: merged.length,
    importedFromSheet: Math.max(0, importedFromSheet),
    updatedLocal,
  };
}

/**
 * Sinkronisasi non-destruktif daftar Username & Password ke file JSON di Google Drive
 */
export async function syncUsersWithGoogleDrive(
  accessToken: string,
  folderId?: string
): Promise<{
  fileId: string;
  fileUrl: string;
  totalUsers: number;
  importedFromDrive: number;
}> {
  const settings = getAppSettings();
  const cleanFolderId = cleanGoogleId(folderId || settings.googleDriveFolderId || '');
  let targetFileId = cleanGoogleId(settings.googleDriveUsersFileId || '');

  // 1. Cari file backup Users di Google Drive jika belum ada ID tersimpan
  if (!targetFileId) {
    const queryParts = [`name = '${DRIVE_USERS_BACKUP_FILENAME}'`, 'trashed = false'];
    if (cleanFolderId) {
      queryParts.push(`'${cleanFolderId}' in parents`);
    }
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      queryParts.join(' and ')
    )}&fields=files(id,name,parents)`;

    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (Array.isArray(searchData.files) && searchData.files.length > 0) {
        targetFileId = searchData.files[0].id;
      }
    }
  }

  // 2. Jika file sudah ada di Drive, unduh dulu isinya agar akun lama TIDAK terhapus
  let driveUsers: User[] = [];
  if (targetFileId) {
    try {
      const dlRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${targetFileId}?alt=media`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (dlRes.ok) {
        const parsed = await dlRes.json();
        const rawList = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.users) ? parsed.users : [];
        driveUsers = rawList;
      } else if (dlRes.status === 404) {
        targetFileId = '';
      }
    } catch (e) {
      console.warn('Gagal membaca file users Drive yang ada, lanjutkan merge lokal:', e);
    }
  }

  // Pastikan user dari Drive memiliki passwordHash jika ada savedPassword
  for (const du of driveUsers) {
    if (!du.passwordHash && du.savedPassword) {
      du.passwordHash = await hashPassword(du.savedPassword);
    }
  }

  // 3. Gabungkan tanpa menghapus akun manapun
  const localUsers = getAllUsers();
  const { merged } = mergeUserRecordsNonDestructive(localUsers, driveUsers);
  const importedFromDrive = Math.max(0, merged.length - localUsers.length);

  localStorage.setItem('kitarajin_table_users', JSON.stringify(merged));
  reconcileUserReferences(merged, importedFromDrive > 0);
  refreshCurrentSessionFromUsers();
  for (const u of merged) {
    syncRecordToCloud(SYNC_COLLECTIONS.USERS, u.id, u).catch(() => {});
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kitarajin_cloud_sync', { detail: { collection: 'users' } }));
  }

  const payloadContent = JSON.stringify(
    {
      app: 'KITARAJIN',
      updatedAt: new Date().toISOString(),
      totalUsers: merged.length,
      users: merged,
    },
    null,
    2
  );

  // 4. Update file yang ada atau buat file baru di Google Drive
  if (targetFileId) {
    const patchRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${targetFileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: payloadContent,
      }
    );
    if (!patchRes.ok) {
      const err = await patchRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gagal memperbarui file database di Google Drive (${patchRes.status})`);
    }
  } else {
    const boundary = 'kitarajin_drive_boundary_' + Date.now();
    const metadata: Record<string, any> = {
      name: DRIVE_USERS_BACKUP_FILENAME,
      mimeType: 'application/json',
      description: 'Database tersinkron Username & Password seluruh pengguna aplikasi KITARAJIN',
    };
    if (cleanFolderId) {
      metadata.parents = [cleanFolderId];
    }

    const multipartBody =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${payloadContent}\r\n` +
      `--${boundary}--`;

    const createRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gagal membuat file database di Google Drive (${createRes.status})`);
    }
    const created = await createRes.json();
    targetFileId = created.id;
  }

  // Simpan fileId Drive agar sinkronisasi berikutnya langsung memperbarui file yang sama
  if (targetFileId) {
    const latestSettings = getAppSettings();
    const syncIso = new Date().toISOString();
    const updatedSettings = {
      ...latestSettings,
      googleDriveUsersFileId: targetFileId,
      lastWorkspaceUserSyncAt: syncIso,
      lastSyncTimestamp: syncIso,
    };
    localStorage.setItem('kitarajin_table_settings', JSON.stringify(updatedSettings));
    await syncRecordToCloud(SYNC_COLLECTIONS.SETTINGS, 'global', updatedSettings);
  }

  return {
    fileId: targetFileId,
    fileUrl: `https://drive.google.com/file/d/${targetFileId}/view`,
    totalUsers: merged.length,
    importedFromDrive,
  };
}

/**
 * Sinkronisasi penuh seluruh Username & Password ke Google Sheets dan/atau Google Drive
 * secara non-destruktif (tidak menghapus akun yang sudah ditambahkan).
 */
export async function syncAllUsersToDriveAndSheet(
  accessToken: string,
  options?: { spreadsheetId?: string; folderId?: string }
): Promise<{
  success: boolean;
  totalUsers: number;
  importedCount: number;
  syncedToSheet: boolean;
  syncedToDrive: boolean;
  driveFileId?: string;
  spreadsheetId?: string;
  message: string;
}> {
  const settings = getAppSettings();
  const sheetId = cleanGoogleId(options?.spreadsheetId || settings.googleSheetSpreadsheetId || '');
  const folderId = cleanGoogleId(options?.folderId || settings.googleDriveFolderId || '');

  let syncedToDrive = false;
  let syncedToSheet = false;
  let totalUsers = getAllUsers().length;
  let importedCount = 0;
  let driveFileId = settings.googleDriveUsersFileId;

  // 1. Sinkronkan Google Sheets terlebih dahulu (jika ditautkan) agar perubahan akun terbaru ikut terbaca
  if (sheetId) {
    const sheetRes = await syncUsersWithGoogleSheet(accessToken, sheetId);
    syncedToSheet = true;
    totalUsers = sheetRes.totalUsers;
    importedCount += sheetRes.importedFromSheet;
  }

  // 2. Sinkronkan ke Google Drive agar file JSON Drive identik dengan Sheet & Firestore terbaru
  const driveRes = await syncUsersWithGoogleDrive(accessToken, folderId || undefined);
  syncedToDrive = true;
  totalUsers = driveRes.totalUsers;
  importedCount += driveRes.importedFromDrive;
  driveFileId = driveRes.fileId;

  const nowIso = new Date().toISOString();
  const latestSettings = getAppSettings();
  const savedSettings = {
    ...latestSettings,
    googleDriveUsersFileId: driveFileId || latestSettings.googleDriveUsersFileId,
    googleSheetSpreadsheetId: sheetId || latestSettings.googleSheetSpreadsheetId,
    googleDriveFolderId: folderId || latestSettings.googleDriveFolderId,
    lastWorkspaceUserSyncAt: nowIso,
    lastSyncTimestamp: nowIso,
    isGoogleConnected: true,
    storageMode: 'google_workspace_sync' as const,
  };
  localStorage.setItem('kitarajin_table_settings', JSON.stringify(savedSettings));
  await syncRecordToCloud(SYNC_COLLECTIONS.SETTINGS, 'global', savedSettings);

  clearPendingWorkspaceUserSync();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('kitarajin_workspace_sync', {
        detail: { pending: false, lastSync: nowIso, totalUsers, syncedToSheet, syncedToDrive },
      })
    );
  }

  const targetLabels: string[] = [];
  if (syncedToSheet) targetLabels.push('Google Sheets');
  if (syncedToDrive) targetLabels.push('Google Drive');

  return {
    success: true,
    totalUsers,
    importedCount,
    syncedToSheet,
    syncedToDrive,
    driveFileId,
    spreadsheetId: sheetId || undefined,
    message: `Berhasil menyinkronkan ${totalUsers} akun Username & Password ke ${targetLabels.join(' & ')} tanpa menghapus data lama.${
      importedCount > 0 ? ` (${importedCount} akun lama dipulihkan/digabungkan.)` : ''
    }`,
  };
}

/**
 * Dipanggil otomatis setiap kali ada penambahan/perubahan Username atau Password
 */
export async function autoSyncUsersToWorkspace(): Promise<{
  synced: boolean;
  reason?: string;
  message?: string;
}> {
  if (!hasRealAccessToken()) {
    markPendingWorkspaceUserSync();
    return {
      synced: false,
      reason: 'needs_google_auth',
      message: 'Tersimpan di Cloud Firestore. Perubahan akun akan otomatis disalin ke Google Drive & Sheets saat sesi Google aktif.',
    };
  }

  // Jalankan lewat penjadwal terpadu agar Users + seluruh tab + Drive JSON sinkron sekaligus tanpa tabrakan
  scheduleWorkspaceAutoSync('users');
  return {
    synced: true,
    message: 'Sinkronisasi akun ke Google Drive & Sheets dijadwalkan otomatis.',
  };
}

let workspaceAutoSyncTimer: ReturnType<typeof setTimeout> | null = null;
let isWorkspaceAutoSyncRunning = false;
let rerunWorkspaceAutoSyncAfterFinish = false;
let queuedChangedCollection: string | undefined;

export function getWorkspaceSyncRuntimeStatus(): {
  hasToken: boolean;
  isSyncing: boolean;
  hasPending: boolean;
  autoEnabled: boolean;
  lastFullSyncAt?: string;
  connectedEmail: string | null;
  hasTargetConfigured: boolean;
} {
  const settings = getAppSettings();
  const hasTargetConfigured = Boolean(
    cleanGoogleId(settings.googleSheetSpreadsheetId || '') ||
      cleanGoogleId(settings.googleDriveFolderId || '') ||
      cleanGoogleId(settings.googleDriveUsersFileId || '')
  );
  return {
    hasToken: hasRealAccessToken(),
    isSyncing: isWorkspaceAutoSyncRunning,
    hasPending: hasPendingWorkspaceFullSync(),
    autoEnabled: Boolean(settings.autoWorkspaceSyncEnabled || settings.isGoogleConnected),
    lastFullSyncAt: settings.lastWorkspaceFullSyncAt || settings.lastWorkspaceUserSyncAt,
    connectedEmail: getConnectedGoogleEmail(),
    hasTargetConfigured,
  };
}

/**
 * Sinkronisasi otomatis seluruh data (presensi, akun, izin, tugas, jadwal, lokasi, dll)
 * ke Google Drive & Google Sheets di latar belakang tanpa perlu klik.
 */
export async function autoSyncAllDataToWorkspace(changedCollection?: string): Promise<boolean> {
  if (isWorkspaceAutoSyncRunning) {
    rerunWorkspaceAutoSyncAfterFinish = true;
    queuedChangedCollection = changedCollection;
    return false;
  }

  const settings = getAppSettings();
  const sheetId = cleanGoogleId(settings.googleSheetSpreadsheetId || '');
  const driveFolderId = cleanGoogleId(settings.googleDriveFolderId || '');
  const driveUsersFileId = cleanGoogleId(settings.googleDriveUsersFileId || '');

  // Hanya sinkron otomatis ke Workspace jika sudah pernah ditautkan/diaktifkan & token memori aktif
  if (!hasRealAccessToken() || (!sheetId && !driveFolderId && !driveUsersFileId)) {
    markPendingWorkspaceFullSync();
    if (changedCollection === 'users') {
      markPendingWorkspaceUserSync();
    }
    return false;
  }

  const token = await getAccessToken();
  if (!token) {
    markPendingWorkspaceFullSync();
    return false;
  }

  isWorkspaceAutoSyncRunning = true;
  emitWorkspaceSyncEvent({ syncing: true, collection: changedCollection });
  try {
    if (sheetId) {
      await writeAllTabsData(token, sheetId);
    } else {
      await syncUsersWithGoogleDrive(token, driveFolderId || undefined);
      await syncFullAppDatabaseToDrive(token, driveFolderId || undefined);
      const syncIso = new Date().toISOString();
      const latestSettings = getAppSettings();
      const updatedSettings = {
        ...latestSettings,
        lastWorkspaceUserSyncAt: syncIso,
        lastWorkspaceFullSyncAt: syncIso,
        lastSyncTimestamp: syncIso,
        autoWorkspaceSyncEnabled: true,
        isGoogleConnected: true,
        storageMode: 'google_workspace_sync' as const,
      };
      localStorage.setItem('kitarajin_table_settings', JSON.stringify(updatedSettings));
      await syncRecordToCloud(SYNC_COLLECTIONS.SETTINGS, 'global', updatedSettings);
      clearPendingWorkspaceUserSync();
    }
    return true;
  } catch (err: any) {
    const errMsg = String(err?.message || err || '').toLowerCase();
    if (errMsg.includes('401') || errMsg.includes('invalid credentials') || errMsg.includes('unauthorized')) {
      cachedAccessToken = null;
      tokenExpiresAt = 0;
      emitWorkspaceSyncEvent({ tokenActive: false, expired: true });
    }
    markPendingWorkspaceFullSync();
    console.warn('Background workspace auto-sync note:', err?.message || err);
    return false;
  } finally {
    isWorkspaceAutoSyncRunning = false;
    emitWorkspaceSyncEvent({ syncing: false });
    if (rerunWorkspaceAutoSyncAfterFinish) {
      const nextCol = queuedChangedCollection;
      rerunWorkspaceAutoSyncAfterFinish = false;
      queuedChangedCollection = undefined;
      scheduleWorkspaceAutoSync(nextCol);
    }
  }
}

/**
 * Jadwalkan auto-sync Google Drive/Sheets terdebounce agar setiap presensi atau perubahan
 * langsung tersinkron otomatis tanpa membebani kuota API.
 */
export function scheduleWorkspaceAutoSync(changedCollection?: string): void {
  markPendingWorkspaceFullSync();
  if (changedCollection === 'users') {
    markPendingWorkspaceUserSync();
  }

  if (isWorkspaceAutoSyncRunning) {
    rerunWorkspaceAutoSyncAfterFinish = true;
    queuedChangedCollection = changedCollection;
    return;
  }
  if (!hasRealAccessToken()) return;

  if (workspaceAutoSyncTimer) {
    clearTimeout(workspaceAutoSyncTimer);
  }
  workspaceAutoSyncTimer = setTimeout(() => {
    workspaceAutoSyncTimer = null;
    autoSyncAllDataToWorkspace(changedCollection).catch(() => {});
  }, 1200);
}

/**
 * Jika sesi Google sudah aktif dan ada perubahan tertunda (misal baru login di Vercel atau baru online),
 * langsung kirim semua perubahan tertunda ke Drive & Sheets tanpa klik tambahan.
 */
export async function flushWorkspaceSyncIfReady(): Promise<boolean> {
  if (!hasRealAccessToken()) return false;
  const status = getWorkspaceSyncRuntimeStatus();
  if (!status.hasTargetConfigured) return false;
  if (!hasPendingWorkspaceFullSync()) return false;
  return autoSyncAllDataToWorkspace('flush');
}

// ==========================================
// Helper Pemanggilan Google API (10 Tab)
// ==========================================

export interface CreateDatabaseResult {
  success: boolean;
  message: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  folderId?: string;
  folderUrl?: string;
  tabsCreated: string[];
}

/**
 * Buat Folder khusus di Google Drive untuk foto presensi & berkas tugas
 */
export async function createGoogleDriveFolder(
  accessToken: string,
  schoolName: string
): Promise<{ folderId: string; folderUrl: string }> {
  const folderName = `KITARAJIN - Berkas Presensi & Foto (${schoolName})`;

  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Folder penyimpanan foto presensi, verifikasi wajah, dan bukti penugasan sekolah aplikasi KITARAJIN',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal membuat folder di Google Drive (${res.status})`);
  }

  const data = await res.json();
  const folderId = data.id;
  const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

  return { folderId, folderUrl };
}

/**
 * Buat Spreadsheet baru di Google Sheets dengan 10 tab
 */
export async function createGoogleSpreadsheetWithTabs(
  accessToken: string,
  schoolName: string,
  parentFolderId?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const title = `KITARAJIN - Database Presensi (${schoolName})`;
  const sheetsPayload = TAB_DEFINITIONS.map((tab) => ({
    properties: {
      title: tab.name,
      gridProperties: {
        frozenRowCount: 1,
      },
    },
  }));

  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: sheetsPayload,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal membuat spreadsheet Google (${res.status})`);
  }

  const data = await res.json();
  const spreadsheetId = data.spreadsheetId;
  const spreadsheetUrl = data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

  // Jika ada folder tujuan, pindahkan file spreadsheet ke dalam folder Google Drive tersebut
  if (parentFolderId) {
    try {
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${parentFolderId}&fields=id,parents`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (e) {
      console.warn('Gagal memindahkan spreadsheet ke folder:', e);
    }
  }

  // Isi setiap tab dengan header dan data awal (non-destructive untuk Users)
  await writeAllTabsData(accessToken, spreadsheetId);

  return { spreadsheetId, spreadsheetUrl };
}

/**
 * Buat atau lengkapi 10 tab pada Spreadsheet yang sudah ada
 */
export async function ensureSpreadsheetHas10Tabs(
  accessToken: string,
  spreadsheetId: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; addedTabs: string[] }> {
  const getRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!getRes.ok) {
    const err = await getRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Tidak dapat mengakses Google Spreadsheet ID: ${spreadsheetId}`);
  }

  const meta = await getRes.json();
  const existingSheetTitles: string[] = (meta.sheets || []).map((s: any) => s.properties?.title);

  const missingTabs = TAB_DEFINITIONS.filter((tab) => !existingSheetTitles.includes(tab.name));

  if (missingTabs.length > 0) {
    const requests = missingTabs.map((tab) => ({
      addSheet: {
        properties: {
          title: tab.name,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
      },
    }));

    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Gagal menambahkan tab baru ke Spreadsheet.');
    }
  }

  await writeAllTabsData(accessToken, spreadsheetId);

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    addedTabs: missingTabs.map((t) => t.name),
  };
}

/**
 * Tulis Header & Data untuk seluruh 10 tab ke Google Sheets
/**
 * Sinkronkan seluruh 10 tabel data aplikasi sebagai JSON backup terpadu di folder Google Drive
 */
export async function syncFullAppDatabaseToDrive(
  accessToken: string,
  folderId?: string
): Promise<{ fileId: string; fileUrl: string }> {
  const settings = getAppSettings();
  const cleanFolderId = cleanGoogleId(folderId || settings.googleDriveFolderId || '');

  // Cari apakah file full backup sudah ada di folder Drive
  const queryParts = [`name = '${DRIVE_FULL_BACKUP_FILENAME}'`, 'trashed = false'];
  if (cleanFolderId) {
    queryParts.push(`'${cleanFolderId}' in parents`);
  }
  let targetFileId = '';
  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        queryParts.join(' and ')
      )}&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (Array.isArray(searchData.files) && searchData.files.length > 0) {
        targetFileId = searchData.files[0].id;
      }
    }
  } catch {
    // Abaikan error pencarian dan lanjut membuat baru bila perlu
  }

  const snapshotPayload = JSON.stringify(
    {
      app: 'KITARAJIN',
      syncedAt: new Date().toISOString(),
      schoolName: settings.schoolName,
      users: getAllUsers(),
      departments: getAllDepartments(),
      schedules: getAllSchedules(),
      locations: getAllLocations(),
      faceRegistry: getAllFaceRegistry(),
      attendance: getAllAttendanceRecords(),
      leaveRequests: getAllLeaveRequests(),
      assignments: getAllAssignments(),
      auditLogs: getAuditLogs().slice(0, 500),
      settings,
    },
    null,
    2
  );

  if (targetFileId) {
    const patchRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${targetFileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: snapshotPayload,
      }
    );
    if (!patchRes.ok) {
      const err = await patchRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gagal memperbarui backup lengkap Drive (${patchRes.status})`);
    }
  } else {
    const boundary = 'kitarajin_full_backup_' + Date.now();
    const metadata: Record<string, any> = {
      name: DRIVE_FULL_BACKUP_FILENAME,
      mimeType: 'application/json',
      description: 'Database lengkap 10 tabel aplikasi KITARAJIN (tersinkron otomatis)',
    };
    if (cleanFolderId) {
      metadata.parents = [cleanFolderId];
    }

    const multipartBody =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${snapshotPayload}\r\n` +
      `--${boundary}--`;

    const createRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gagal membuat backup lengkap Drive (${createRes.status})`);
    }
    const created = await createRes.json();
    targetFileId = created.id;
  }

  return {
    fileId: targetFileId,
    fileUrl: `https://drive.google.com/file/d/${targetFileId}/view`,
  };
}

/**
 * Tulis Header & Data untuk seluruh 10 tab ke Google Sheets
 * (Untuk Users: selalu merge non-destruktif dulu agar username & password yang sudah ada tidak pernah terhapus!)
 */
export async function writeAllTabsData(accessToken: string, spreadsheetId: string): Promise<void> {
  const cleanId = cleanGoogleId(spreadsheetId);

  // 1. Merge & sinkronkan Users terlebih dahulu (agar baris Users lama di Sheet/Drive TIDAK terhapus)
  await syncUsersWithGoogleSheet(accessToken, cleanId);

  // 2. Sinkronkan juga ke Google Drive backup JSON (Users + Full Database)
  try {
    await syncUsersWithGoogleDrive(accessToken);
    await syncFullAppDatabaseToDrive(accessToken);
  } catch (e) {
    console.warn('Backup Drive note saat writeAllTabsData:', e);
  }

  // 3. Tulis 9 tab lainnya (bersihkan terlebih dahulu agar baris lama tidak tersisa)
  const otherTabs = TAB_DEFINITIONS.filter((t) => t.name !== 'Users');
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values:batchClear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ranges: otherTabs.map((t) => `'${t.name}'!A1:Z5000`),
      }),
    }
  ).catch(() => {});

  const valueRanges = otherTabs.map((tab) => {
    const rows = [tab.headers, ...tab.getData()];
    return {
      range: `'${tab.name}'!A1`,
      values: rows,
    };
  });

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: valueRanges,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal menulis data ke tab Google Sheets.');
  }

  const syncIso = new Date().toISOString();
  const latestSettings = getAppSettings();
  const updatedSettings = {
    ...latestSettings,
    googleSheetSpreadsheetId: cleanId || latestSettings.googleSheetSpreadsheetId,
    lastWorkspaceUserSyncAt: syncIso,
    lastWorkspaceFullSyncAt: syncIso,
    lastSyncTimestamp: syncIso,
    autoWorkspaceSyncEnabled: true,
    isGoogleConnected: true,
    storageMode: 'google_workspace_sync' as const,
  };
  localStorage.setItem('kitarajin_table_settings', JSON.stringify(updatedSettings));
  await syncRecordToCloud(SYNC_COLLECTIONS.SETTINGS, 'global', updatedSettings);

  clearPendingWorkspaceUserSync();
}

/**
 * Eksekusi Pembuatan Lengkap Otomatis (Drive + Sheets 10 Tab)
 */
export async function executeAutoCreateDatabase(
  currentUser: User,
  customSheetId?: string,
  customDriveId?: string,
  onStepProgress?: (step: string) => void,
  providedAccessToken?: string
): Promise<CreateDatabaseResult> {
  let token = providedAccessToken || (await getAccessToken());
  const tabsCreated: string[] = TAB_DEFINITIONS.map((t) => t.name);

  if (!token) {
    if (onStepProgress) onStepProgress('Membuka otorisasi akun Google Kepala Sekolah...');
    const authResult = await signInWithGoogle(currentUser.email);
    if (authResult?.accessToken) {
      token = authResult.accessToken;
    }
  }

  if (!token) {
    throw new Error('Otorisasi Google diperlukan untuk membuat & menyinkronkan database ke Google Drive dan Google Sheets.');
  }

  const settings = getAppSettings();
  const schoolName = settings.schoolName || 'Sekolah';

  let spreadsheetId = cleanGoogleId(customSheetId?.trim() || settings.googleSheetSpreadsheetId || '');
  let spreadsheetUrl = '';
  let folderId = cleanGoogleId(customDriveId?.trim() || settings.googleDriveFolderId || '');
  let folderUrl = '';

  // 1. Google Drive: Buat folder jika belum ada
  if (!folderId) {
    if (onStepProgress) onStepProgress('Membuat Folder di Google Drive...');
    const driveRes = await createGoogleDriveFolder(token, schoolName);
    folderId = driveRes.folderId;
    folderUrl = driveRes.folderUrl;
  } else {
    folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
  }

  // Simpan folderId dulu agar sinkronisasi Drive memakai folder ini
  updateAppSettings(
    currentUser,
    {
      googleDriveFolderId: folderId,
      storageMode: 'google_workspace_sync',
    },
    { skipWorkspaceAutoSync: true }
  );

  // 2. Google Sheets: Buat baru atau tambahkan 10 tab ke ID yang ditempel
  if (spreadsheetId) {
    if (onStepProgress) onStepProgress(`Memeriksa & menyinkronkan 10 Tab di Spreadsheet (${spreadsheetId})...`);
    const res = await ensureSpreadsheetHas10Tabs(token, spreadsheetId);
    spreadsheetId = res.spreadsheetId;
    spreadsheetUrl = res.spreadsheetUrl;
  } else {
    if (onStepProgress) onStepProgress('Membuat Spreadsheet baru & mengisi 10 Tab...');
    const res = await createGoogleSpreadsheetWithTabs(token, schoolName, folderId);
    spreadsheetId = res.spreadsheetId;
    spreadsheetUrl = res.spreadsheetUrl;
  }

  // 3. Sinkronkan seluruh Username & Password + backup lengkap 10 tabel ke Google Drive & Sheets
  if (onStepProgress) onStepProgress('Menyinkronkan seluruh data aplikasi & akun ke Google Drive & Sheets...');
  await syncAllUsersToDriveAndSheet(token, { spreadsheetId, folderId });
  await syncFullAppDatabaseToDrive(token, folderId);

  // 4. Simpan ke AppSettings (lokal & Cloud Firestore agar domain Vercel langsung mewarisi status tersinkron & mode auto-sync)
  if (onStepProgress) onStepProgress('Menyimpan ID database ke sistem KITARAJIN...');
  const nowIso = new Date().toISOString();
  updateAppSettings(
    currentUser,
    {
      googleSheetSpreadsheetId: spreadsheetId,
      googleDriveFolderId: folderId,
      storageMode: 'google_workspace_sync',
      isGoogleConnected: true,
      autoWorkspaceSyncEnabled: true,
      lastWorkspaceUserSyncAt: nowIso,
      lastWorkspaceFullSyncAt: nowIso,
      lastSyncTimestamp: nowIso,
    },
    { skipWorkspaceAutoSync: true }
  );
  clearPendingWorkspaceUserSync();
  await syncRecordToCloud(SYNC_COLLECTIONS.SETTINGS, 'global', getAppSettings());

  return {
    success: true,
    message: `Seluruh data aplikasi & ${getAllUsers().length} akun Username/Password berhasil disinkronkan ke Google Drive & Google Sheets (10 Tab: ${tabsCreated.join(', ')}) tanpa menghapus akun lama!`,
    spreadsheetId,
    spreadsheetUrl,
    folderId,
    folderUrl,
    tabsCreated,
  };
}

/**
 * Sinkronkan seluruh data aplikasi (Users non-destruktif + seluruh 10 tab & backup Drive lengkap)
 */
export async function syncAllAppDataToDriveAndSheet(
  currentUser: User,
  options?: {
    accessToken?: string;
    spreadsheetId?: string;
    folderId?: string;
    onStepProgress?: (step: string) => void;
  }
): Promise<CreateDatabaseResult> {
  return executeAutoCreateDatabase(
    currentUser,
    options?.spreadsheetId,
    options?.folderId,
    options?.onStepProgress,
    options?.accessToken
  );
}

/**
 * Periksa status kesehatan Google Sheets & Google Drive langsung ke Google API
 */
export async function checkRealGoogleDatabaseHealth(
  spreadsheetId?: string,
  folderId?: string
): Promise<{
  isOnline: boolean;
  sheetTitle?: string;
  tabsFound: { name: string; rowCount: number }[];
  driveFolderName?: string;
  error?: string;
}> {
  const token = await getAccessToken();
  if (!token) {
    return {
      isOnline: false,
      tabsFound: [],
      error: 'Token akses Google tidak tersedia. Silakan hubungkan akun Google Anda terlebih dahulu.',
    };
  }

  const sId = cleanGoogleId(spreadsheetId?.trim() || getAppSettings().googleSheetSpreadsheetId || '');
  if (!sId) {
    return {
      isOnline: false,
      tabsFound: [],
      error: 'ID Google Spreadsheet belum diisi atau belum ditautkan.',
    };
  }

  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sId}?fields=properties.title,sheets.properties`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        isOnline: false,
        tabsFound: [],
        error: err.error?.message || `Google Sheets API Error (${res.status})`,
      };
    }

    const data = await res.json();
    const sheetTitle = data.properties?.title || 'Spreadsheet Presensi';
    const tabsFound = (data.sheets || []).map((s: any) => ({
      name: s.properties?.title || 'Unknown',
      rowCount: s.properties?.gridProperties?.rowCount || 0,
    }));

    let driveFolderName: string | undefined;
    const fId = cleanGoogleId(folderId?.trim() || getAppSettings().googleDriveFolderId || '');
    if (fId) {
      try {
        const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fId}?fields=id,name`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (driveRes.ok) {
          const dData = await driveRes.json();
          driveFolderName = dData.name;
        }
      } catch (e) {
        console.warn('Gagal cek folder drive:', e);
      }
    }

    return {
      isOnline: true,
      sheetTitle,
      tabsFound,
      driveFolderName,
    };
  } catch (err: any) {
    return {
      isOnline: false,
      tabsFound: [],
      error: err.message || 'Gagal menghubungi Google API.',
    };
  }
}
