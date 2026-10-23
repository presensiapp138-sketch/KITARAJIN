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
} from './storage';
import { User } from '../types';

// Inisialisasi Firebase App secara aman (reuse jika sudah pernah ada)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Provider Google dengan scope Sheets dan Drive
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.setCustomParameters({
  prompt: 'consent',
  access_type: 'offline',
});

// Cache token di memori (tidak di localStorage demi keamanan)
let cachedAccessToken: string | null = null;
let cachedGoogleUser: FirebaseUser | null = null;
let isSigningIn = false;

export const initAuth = (
  onAuthSuccess?: (user: FirebaseUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
    if (user) {
      cachedGoogleUser = user;
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token mungkin perlu diambil ulang lewat interaksi pengguna
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedGoogleUser = null;
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const signInWithGoogle = async (): Promise<{
  user: FirebaseUser;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan token akses dari Google.');
    }
    cachedAccessToken = credential.accessToken;
    cachedGoogleUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getGoogleUser = (): FirebaseUser | null => {
  return cachedGoogleUser || auth.currentUser;
};

export const signOutGoogle = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
  cachedGoogleUser = null;
};

// ==========================================
// Struktur 10 Tabel KITARAJIN
// ==========================================
export const TAB_DEFINITIONS = [
  {
    name: 'Users',
    headers: ['ID', 'NIP', 'Nama Lengkap', 'Email', 'Username', 'Peran', 'Jabatan', 'Departemen ID', 'Status Aktif', 'Dibuat', 'Diperbarui'],
    getData: () =>
      getAllUsers().map((u) => [
        u.id,
        u.nip,
        u.name,
        u.email || '',
        u.username,
        u.role,
        u.position,
        u.departmentId || '',
        u.isActive ? 'AKTIF' : 'NONAKTIF',
        u.createdAt,
        u.updatedAt,
      ]),
  },
  {
    name: 'Departments',
    headers: ['ID', 'Kode', 'Nama Departemen', 'Deskripsi', 'Total Anggota', 'Dibuat'],
    getData: () =>
      getAllDepartments().map((d) => [d.id, d.code, d.name, d.description, d.memberCount || 0, d.createdAt]),
  },
  {
    name: 'Schedules',
    headers: ['ID', 'Nama Jadwal', 'Jam Mulai Masuk', 'Jam Selesai Masuk', 'Toleransi Terlambat (Mnt)', 'Jam Mulai Pulang', 'Jam Selesai Pulang', 'Hari Kerja', 'Dibuat'],
    getData: () =>
      getAllSchedules().map((s) => [
        s.id,
        s.name,
        s.checkInStart,
        s.checkInEnd,
        s.lateToleranceMinutes,
        s.checkOutStart,
        s.checkOutEnd,
        (s.workDays || []).join(', '),
        s.createdAt,
      ]),
  },
  {
    name: 'Locations',
    headers: ['ID', 'Nama Lokasi', 'Latitude', 'Longitude', 'Radius (Meter)', 'Alamat', 'Status Aktif', 'Dibuat'],
    getData: () =>
      getAllLocations().map((l) => [
        l.id,
        l.name,
        l.latitude,
        l.longitude,
        l.radiusMeters,
        l.address,
        l.isActive ? 'AKTIF' : 'NONAKTIF',
        l.createdAt,
      ]),
  },
  {
    name: 'FaceRegistry',
    headers: ['ID', 'User ID', 'Nama Pengguna', 'Status Registrasi', 'Panjang Fitur Vektor', 'Terdaftar Pada'],
    getData: () =>
      getAllFaceRegistry().map((f) => [
        f.id,
        f.userId,
        f.userName,
        f.isRegistered ? 'TERDAFTAR' : 'BELUM',
        f.faceFeatures ? f.faceFeatures.length : 0,
        f.registeredAt,
      ]),
  },
  {
    name: 'Attendance',
    headers: ['ID', 'User ID', 'Nama', 'Departemen', 'Tanggal', 'Tipe Presensi', 'Waktu', 'Status', 'Jarak GPS (Meter)', 'Skor Wajah (%)', 'Catatan'],
    getData: () =>
      getAllAttendanceRecords().map((a) => [
        a.id,
        a.userId,
        a.userName,
        a.departmentName || '',
        a.date,
        a.type === 'in' ? 'MASUK' : 'PULANG',
        a.timestamp,
        a.status,
        a.gpsDistanceMeters !== undefined ? Math.round(a.gpsDistanceMeters) : '',
        a.faceMatchScore !== undefined ? Math.round(a.faceMatchScore * 100) : '',
        a.notes || '',
      ]),
  },
  {
    name: 'LeaveRequests',
    headers: ['ID', 'User ID', 'Nama', 'Tipe Cuti/Izin', 'Mulai', 'Selesai', 'Alasan', 'Status', 'Disetujui Oleh', 'Catatan Review', 'Diajukan Pada'],
    getData: () =>
      getAllLeaveRequests().map((l) => [
        l.id,
        l.userId,
        l.userName,
        l.leaveType,
        l.startDate,
        l.endDate,
        l.reason,
        l.status,
        l.approvedByName || '',
        l.reviewNotes || '',
        l.createdAt,
      ]),
  },
  {
    name: 'Assignments',
    headers: ['ID', 'Judul Penugasan', 'Deskripsi', 'Lokasi Target', 'Ditugaskan Kepada', 'Batas Waktu', 'Status', 'Foto Bukti Geotag', 'Dibuat'],
    getData: () =>
      getAllAssignments().map((asg) => [
        asg.id,
        asg.title,
        asg.description,
        asg.targetLocationName || '',
        (asg.assignedUserNames || []).join(', '),
        asg.deadline,
        asg.status,
        asg.documentationPhoto ? 'ADA BUKTI FOTO' : 'BELUM ADA',
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
        log.targetId,
        log.details,
        log.timestamp,
      ]),
  },
  {
    name: 'Settings',
    headers: ['Nama Sekolah', 'Alamat Sekolah', 'Judul Aplikasi', 'Ambang Wajah (%)', 'Ketat GPS', 'Ketat Wajah', 'Mode Penyimpanan', 'ID Spreadsheet', 'ID Folder Drive', 'Terakhir Diperbarui'],
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
          s.updatedAt,
        ],
      ];
    },
  },
];

// ==========================================
// Helper Pemanggilan Google API
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
 * Buat Spreadsheet baru di Google Sheets dengan 10 tab
 */
export async function createGoogleSpreadsheetWithTabs(
  accessToken: string,
  schoolName: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const title = `KITARAJIN - Database Presensi (${schoolName})`;
  const sheetsPayload = TAB_DEFINITIONS.map((tab, idx) => ({
    properties: {
      sheetId: idx + 1,
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

  // Sekarang isi setiap tab dengan header dan data awal
  await writeAllTabsData(accessToken, spreadsheetId);

  return { spreadsheetId, spreadsheetUrl };
}

/**
 * Buat atau lengkapi 10 tab pada Spreadsheet yang sudah ada (berdasarkan ID yang ditempel user)
 */
export async function ensureSpreadsheetHas10Tabs(
  accessToken: string,
  spreadsheetId: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; addedTabs: string[] }> {
  // 1. Ambil daftar tab yang sudah ada
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
  const existingSheetTitles: string[] = (meta.sheets || []).map(
    (s: any) => s.properties?.title
  );

  const missingTabs = TAB_DEFINITIONS.filter(
    (tab) => !existingSheetTitles.includes(tab.name)
  );

  // 2. Jika ada tab yang kurang, buat tab tersebut
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

  // 3. Tulis data & header ke semua tab
  await writeAllTabsData(accessToken, spreadsheetId);

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    addedTabs: missingTabs.map((t) => t.name),
  };
}

/**
 * Tulis Header & Data untuk seluruh 10 tab ke Google Sheets
 */
export async function writeAllTabsData(accessToken: string, spreadsheetId: string): Promise<void> {
  const valueRanges = TAB_DEFINITIONS.map((tab) => {
    const rows = [tab.headers, ...tab.getData()];
    return {
      range: `${tab.name}!A1`,
      values: rows,
    };
  });

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: valueRanges,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal menulis data ke tab Google Sheets.');
  }
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
    throw new Error(err.error?.message || 'Gagal membuat folder di Google Drive.');
  }

  const data = await res.json();
  const folderId = data.id;
  const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

  return { folderId, folderUrl };
}

/**
 * Eksekusi Pembuatan Lengkap Otomatis (Drive + Sheets 10 Tab)
 */
export async function executeAutoCreateDatabase(
  currentUser: User,
  customSheetId?: string,
  customDriveId?: string
): Promise<CreateDatabaseResult> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Anda belum masuk dengan akun Google atau sesi telah berakhir. Silakan login terlebih dahulu.');
  }

  const settings = getAppSettings();
  const schoolName = settings.schoolName || 'Sekolah';

  let spreadsheetId = customSheetId?.trim() || settings.googleSheetSpreadsheetId;
  let spreadsheetUrl = '';
  let folderId = customDriveId?.trim() || settings.googleDriveFolderId;
  let folderUrl = '';
  const tabsCreated: string[] = TAB_DEFINITIONS.map((t) => t.name);

  // 1. Google Sheets: Buat baru atau tambahkan 10 tab ke ID yang ditempel
  if (spreadsheetId) {
    const res = await ensureSpreadsheetHas10Tabs(token, spreadsheetId);
    spreadsheetId = res.spreadsheetId;
    spreadsheetUrl = res.spreadsheetUrl;
  } else {
    const res = await createGoogleSpreadsheetWithTabs(token, schoolName);
    spreadsheetId = res.spreadsheetId;
    spreadsheetUrl = res.spreadsheetUrl;
  }

  // 2. Google Drive: Buat folder jika belum ada
  if (!folderId) {
    const driveRes = await createGoogleDriveFolder(token, schoolName);
    folderId = driveRes.folderId;
    folderUrl = driveRes.folderUrl;
  } else {
    folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
  }

  // 3. Simpan ID ke AppSettings aplikasi
  updateAppSettings(currentUser, {
    googleSheetSpreadsheetId: spreadsheetId,
    googleDriveFolderId: folderId,
    storageMode: 'google_workspace_sync',
  });

  return {
    success: true,
    message: `Database berhasil dibuat di Google Drive & Google Sheets! 10 Tab (${tabsCreated.join(', ')}) dan folder foto telah aktif.`,
    spreadsheetId,
    spreadsheetUrl,
    folderId,
    folderUrl,
    tabsCreated,
  };
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

  const sId = spreadsheetId?.trim() || getAppSettings().googleSheetSpreadsheetId;
  if (!sId) {
    return {
      isOnline: false,
      tabsFound: [],
      error: 'ID Google Spreadsheet belum diisi atau belum ditautkan.',
    };
  }

  try {
    // Cek Spreadsheet
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

    // Cek Folder Drive jika ada ID
    let driveFolderName: string | undefined;
    const fId = folderId?.trim() || getAppSettings().googleDriveFolderId;
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
