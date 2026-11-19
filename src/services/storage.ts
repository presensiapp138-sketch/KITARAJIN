/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  User,
  AuditLog,
  AppSettings,
  Department,
  Schedule,
  LocationConfig,
  FaceRegistryItem,
  AttendanceRecord,
  LeaveRequest,
  Assignment,
  LeaveType,
  DailyAttendancePair,
} from '../types';
import { hashPassword, verifyPassword } from './crypto';
import {
  ActorPayload,
  enqueueAttendanceScan,
  isAppsScriptConfigured,
  pullChangesFromAppsScript,
  syncAppendLogOnly,
  syncCreateRow,
  syncSaveFace,
  syncSeedInitialIfEmpty,
  syncSoftDeleteRow,
  syncUpdateRow,
  syncUpsertSettings,
} from './appsScriptSync';

export const SEED_BASELINE_ISO = '2026-01-01T00:00:00.000Z';

function safeReadArray<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(key);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function dedupeById<T extends { id?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item || !item.id) continue;
    const key = String(item.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function safeSaveJsonArray<T>(key: string, items: T[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(items));
    return true;
  } catch {
    try {
      if (items.length > 50) {
        localStorage.setItem(key, JSON.stringify(items.slice(0, 50)));
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }
}

export const STORAGE_KEYS = {
  USERS: 'kitarajin_table_users',
  AUDIT_LOGS: 'kitarajin_table_audit_logs',
  SETTINGS: 'kitarajin_table_settings',
  DEPARTMENTS: 'kitarajin_table_departments',
  SCHEDULES: 'kitarajin_table_schedules',
  LOCATIONS: 'kitarajin_table_locations',
  FACE_REGISTRY: 'kitarajin_table_face_registry',
  ATTENDANCE: 'kitarajin_table_attendance',
  LEAVE_REQUESTS: 'kitarajin_table_leave_requests',
  ASSIGNMENTS: 'kitarajin_table_assignments',
  CURRENT_USER_SESSION: 'kitarajin_session_user',
  TAB_USER_SESSION: 'kitarajin_tab_session_user',
  SUPERADMIN_PASSWORD_CACHE: 'kitarajin_superadmin_password_cache',
};

const DEFAULT_SUPERADMIN_PASSWORD = 'superadmin';

export function getSuperadminCachedPassword(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEYS.SUPERADMIN_PASSWORD_CACHE);
    if (existing && existing.length > 0) {
      return existing;
    }
    localStorage.setItem(STORAGE_KEYS.SUPERADMIN_PASSWORD_CACHE, DEFAULT_SUPERADMIN_PASSWORD);
    return DEFAULT_SUPERADMIN_PASSWORD;
  } catch {
    return DEFAULT_SUPERADMIN_PASSWORD;
  }
}

export function updateSuperadminCachedPassword(
  newPassword: string
): { success: boolean; message: string } {
  const clean = String(newPassword || '').trim();
  if (clean.length < 4) {
    return { success: false, message: 'Password Superadmin minimal 4 karakter.' };
  }
  try {
    localStorage.setItem(STORAGE_KEYS.SUPERADMIN_PASSWORD_CACHE, clean);
    return {
      success: true,
      message: 'Password Superadmin berhasil diperbarui di cache aplikasi (tidak disimpan ke Google Sheet).',
    };
  } catch {
    return { success: false, message: 'Gagal menyimpan password Superadmin ke cache browser.' };
  }
}

export function authenticateSuperadmin(
  rawPassword: string
): { success: boolean; user?: User; message: string } {
  const expected = getSuperadminCachedPassword();
  if (rawPassword !== expected && rawPassword.trim() !== expected) {
    return {
      success: false,
      message: 'Password Superadmin tidak sesuai.',
    };
  }
  const saUser: User = {
    id: 'superadmin-local',
    nip: '-',
    name: 'Superadmin',
    username: 'superadmin',
    passwordHash: '',
    role: 'superadmin',
    position: 'Pengelola Pengaturan & Sheets',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
  saveSession(saUser);
  return {
    success: true,
    user: saUser,
    message: 'Berhasil masuk sebagai Superadmin.',
  };
}

// Sesi Jadwal Kerja Default (Sesi 1, Sesi 2, Sesi 3) - Struktur dasar sistem
const DEFAULT_SCHEDULES: Schedule[] = [
  {
    id: 'sesi-1',
    name: 'Sesi 1 (Pagi)',
    sessionName: 'Sesi 1',
    checkInStart: '06:00',
    checkInDeadline: '07:30',
    lateToleranceMinutes: 15,
    checkOutStart: '11:30',
    checkOutEnd: '13:00',
    workDays: [1, 2, 3, 4, 5, 6],
    ruleNotes: 'Sesi 1: Presensi kedatangan pagi seluruh staf dan guru.',
    isActive: true,
    status: 'aktif',
  },
  {
    id: 'sesi-2',
    name: 'Sesi 2 (Siang)',
    sessionName: 'Sesi 2',
    checkInStart: '11:30',
    checkInDeadline: '12:30',
    lateToleranceMinutes: 15,
    checkOutStart: '15:00',
    checkOutEnd: '16:30',
    workDays: [1, 2, 3, 4, 5, 6],
    ruleNotes: 'Sesi 2: Presensi mengajar dan operasional siang.',
    isActive: true,
    status: 'aktif',
  },
  {
    id: 'sesi-3',
    name: 'Sesi 3 (Sore / Lanjutan)',
    sessionName: 'Sesi 3',
    checkInStart: '15:00',
    checkInDeadline: '15:30',
    lateToleranceMinutes: 15,
    checkOutStart: '17:30',
    checkOutEnd: '19:00',
    workDays: [1, 2, 3, 4, 5, 6],
    ruleNotes: 'Sesi 3: Presensi sore, piket sekolah, dan pengawasan akhir.',
    isActive: true,
    status: 'aktif',
  },
];

function toActor(user: Pick<User, 'id' | 'name' | 'role'>): ActorPayload {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
  };
}

function notifyLocalChange(collectionName: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kitarajin_cloud_sync', { detail: { collection: collectionName } }));
  }
}

const DEMO_USER_EMAILS = new Set([
  'kepsek@sekolah.sch.id',
  'admin.fauzi@sekolah.sch.id',
  'siti.rahma@sekolah.sch.id',
]);

const DEMO_USER_USERNAMES = new Set(['kepsek', 'adminfauzi', 'sitirahma']);

export function isDemoAccount(user?: Partial<User> | null): boolean {
  if (!user || !user.id) return false;
  const id = String(user.id).trim();
  if (id !== 'usr-ks-01' && id !== 'usr-adm-01' && id !== 'usr-stf-01') {
    return false;
  }
  const email = String(user.email || '').trim().toLowerCase();
  const username = String(user.username || '').trim().toLowerCase();
  return DEMO_USER_EMAILS.has(email) || DEMO_USER_USERNAMES.has(username) || !email;
}

export function purgeDemoUsers(): { count: number } {
  try {
    const users = safeReadArray<User>(STORAGE_KEYS.USERS);
    const demoUsers = users.filter((u) => isDemoAccount(u));
    if (demoUsers.length > 0) {
      const realUsers = users.filter((u) => !isDemoAccount(u));
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(realUsers));
    }
    const rawSession = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_SESSION);
    if (rawSession) {
      const sess = JSON.parse(rawSession) as Partial<User>;
      if (isDemoAccount(sess)) {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_SESSION);
      }
    }
    return { count: demoUsers.length };
  } catch {
    return { count: 0 };
  }
}

/**
 * Inisialisasi cache struktur lokal bersih (tanpa akun demo & tanpa data dummy)
 */
export async function initializeDatabase(): Promise<void> {
  purgeDemoUsers();

  if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.SCHEDULES)) {
    localStorage.setItem(
      STORAGE_KEYS.SCHEDULES,
      JSON.stringify(isAppsScriptConfigured() ? [] : DEFAULT_SCHEDULES)
    );
  }
  if (!localStorage.getItem(STORAGE_KEYS.DEPARTMENTS)) {
    localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.LOCATIONS)) {
    localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.FACE_REGISTRY)) {
    localStorage.setItem(STORAGE_KEYS.FACE_REGISTRY, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.ATTENDANCE)) {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify([]));
  } else {
    purgeDemoAttendanceRecords();
  }
  if (!localStorage.getItem(STORAGE_KEYS.LEAVE_REQUESTS)) {
    localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS)) {
    localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS)) {
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
    const defaultSettings: AppSettings = {
      id: 'global',
      schoolName: 'Instansi / Sekolah',
      schoolAddress: '',
      schoolEmail: '',
      appTitle: 'KITARAJIN Presensi & Penugasan',
      storageMode: isAppsScriptConfigured() ? 'google_apps_script' : 'local_cache',
      requireStrictFaceVerification: true,
      requireStrictGps: true,
      minFaceMatchThreshold: 0.75,
      themeColor: '#059669',
      lastSyncTimestamp: SEED_BASELINE_ISO,
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(defaultSettings));
  }

  reconcileUserReferences(getAllUsers(), false);
}

/**
 * Mengambil semua pengguna aktif (mengabaikan baris soft-delete status='dihapus')
 */
export function getAllUsers(): User[] {
  return dedupeById(
    safeReadArray<User>(STORAGE_KEYS.USERS).filter(
      (u) => u && u.status !== 'dihapus' && !isDemoAccount(u)
    )
  ).map((u) => {
    const cleanName = String(u.name || u.username || u.email || u.nip || 'Pengguna').trim();
    const cleanUsername = String(u.username || u.nip || u.email || '').trim();
    const cleanNip = String(u.nip || '').trim();
    const rawRole = String(u.role || '').trim().toLowerCase();
    const normalizedRole: User['role'] =
      rawRole === 'kepala_sekolah' || rawRole === 'kepala sekolah' || rawRole === 'kepsek'
        ? 'kepala_sekolah'
        : rawRole === 'admin' || rawRole === 'administrator' || rawRole === 'tu'
        ? 'admin'
        : 'karyawan';
    const isActiveBool =
      u.isActive === undefined || u.isActive === null
        ? true
        : typeof u.isActive === 'boolean'
        ? u.isActive
        : !['false', '0', 'nonaktif', 'tidak', 'no'].includes(String(u.isActive).trim().toLowerCase());
    return {
      ...u,
      id: String(u.id),
      nip: cleanNip,
      name: cleanName,
      username: cleanUsername,
      role: normalizedRole,
      position: String(
        u.position ||
          (normalizedRole === 'kepala_sekolah'
            ? 'Kepala Sekolah'
            : normalizedRole === 'admin'
            ? 'Administrator'
            : 'Staff')
      ).trim(),
      isActive: isActiveBool,
      assignedSessionIds:
        Array.isArray(u.assignedSessionIds) && u.assignedSessionIds.length > 0
          ? u.assignedSessionIds
          : ['sesi-1', 'sesi-2', 'sesi-3'],
    };
  });
}

export function getAllDepartments(): Department[] {
  return dedupeById(
    safeReadArray<Department>(STORAGE_KEYS.DEPARTMENTS).filter((d) => d && d.status !== 'dihapus')
  );
}

export function getAuditLogs(): AuditLog[] {
  return dedupeById(safeReadArray<AuditLog>(STORAGE_KEYS.AUDIT_LOGS));
}

function readRawStoredSession(): User | null {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const tabRaw = sessionStorage.getItem(STORAGE_KEYS.TAB_USER_SESSION);
      if (tabRaw) {
        return JSON.parse(tabRaw) as User;
      }
    }
    const localRaw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_SESSION);
    if (!localRaw) return null;
    const parsed = JSON.parse(localRaw) as User;
    if (parsed?.id && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEYS.TAB_USER_SESSION, localRaw);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function hasActiveTabSession(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem(STORAGE_KEYS.TAB_USER_SESSION));
  } catch {
    return false;
  }
}

export function refreshCurrentSessionFromUsers(): User | null {
  try {
    const sessionUser = readRawStoredSession();
    if (!sessionUser?.id || isDemoAccount(sessionUser)) {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STORAGE_KEYS.TAB_USER_SESSION);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_SESSION);
      return null;
    }
    // Akun Superadmin disimpan di cache aplikasi saja (tidak di Google Sheet)
    if (sessionUser.role === 'superadmin' || sessionUser.id === 'superadmin-local') {
      return sessionUser;
    }
    const allUsers = getAllUsers();
    const latest = allUsers.find((u) => u.id === sessionUser.id);
    if (latest) {
      const { passwordHash: _ph, ...safeLatest } = latest;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(STORAGE_KEYS.TAB_USER_SESSION, JSON.stringify(safeLatest));
      }
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_SESSION, JSON.stringify(safeLatest));
      return latest;
    }
    if (allUsers.length > 0 || isAppsScriptConfigured()) {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STORAGE_KEYS.TAB_USER_SESSION);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_SESSION);
      return null;
    }
    return sessionUser;
  } catch {
    return null;
  }
}

export function reconcileUserReferences(
  usersList?: User[],
  syncChangedToServer = false,
  oldNameHints?: Map<string, string>
): boolean {
  const users = usersList || getAllUsers();
  if (!users || users.length === 0) return false;

  const userById = new Map<string, User>(users.map((u) => [u.id, u]));
  const ksUser = users.find((u) => u.role === 'kepala_sekolah') || users[0];
  let anyChanged = false;

  // 1. FaceRegistry
  try {
    const faces = getAllFaceRegistry();
    let changed = false;
    const updatedFaces = faces.map((f) => {
      const u = userById.get(f.userId);
      if (u && (f.userName !== u.name || f.nip !== u.nip)) {
        changed = true;
        const item = { ...f, userName: u.name, nip: u.nip };
        if (syncChangedToServer) {
          syncUpdateRow('FaceRegistry', item.id, { userName: u.name, nip: u.nip }, item.diubah_pada, ksUser ? toActor(ksUser) : undefined).catch(() => {});
        }
        return item;
      }
      return f;
    });
    if (changed) {
      localStorage.setItem(STORAGE_KEYS.FACE_REGISTRY, JSON.stringify(updatedFaces));
      anyChanged = true;
    }
  } catch {
    // ignore
  }

  // 2. Attendance
  try {
    const rawAtt = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
    if (rawAtt) {
      const records: AttendanceRecord[] = JSON.parse(rawAtt);
      let changed = false;
      const updated = records.map((r) => {
        const u = userById.get(r.userId);
        if (u && (r.userName !== u.name || r.nip !== u.nip)) {
          changed = true;
          const item = { ...r, userName: u.name, nip: u.nip };
          if (syncChangedToServer && r.syncState === 'synced') {
            syncUpdateRow('Attendance', item.id, { userName: u.name, nip: u.nip }, item.diubah_pada, ksUser ? toActor(ksUser) : undefined).catch(() => {});
          }
          return item;
        }
        return r;
      });
      if (changed) {
        localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(updated));
        anyChanged = true;
      }
    }
  } catch {
    // ignore
  }

  // 3. LeaveRequests
  try {
    const leaves = getAllLeaveRequests();
    let changed = false;
    const updated = leaves.map((l) => {
      const u = userById.get(l.userId);
      let nextReviewedBy = l.reviewedBy;
      if (l.reviewedBy && oldNameHints) {
        for (const [uid, prevName] of oldNameHints.entries()) {
          if (l.reviewedBy === prevName) {
            const reviewer = userById.get(uid);
            if (reviewer) nextReviewedBy = reviewer.name;
          }
        }
      }
      if ((u && (l.userName !== u.name || l.nip !== u.nip)) || nextReviewedBy !== l.reviewedBy) {
        changed = true;
        const item = {
          ...l,
          userName: u ? u.name : l.userName,
          nip: u ? u.nip : l.nip,
          reviewedBy: nextReviewedBy,
        };
        if (syncChangedToServer) {
          syncUpdateRow(
            'LeaveRequests',
            item.id,
            { userName: item.userName, nip: item.nip, reviewedBy: item.reviewedBy || '' },
            item.diubah_pada,
            ksUser ? toActor(ksUser) : undefined
          ).catch(() => {});
        }
        return item;
      }
      return l;
    });
    if (changed) {
      localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(updated));
      anyChanged = true;
    }
  } catch {
    // ignore
  }

  // 4. Assignments
  try {
    const tasks = getAllAssignments();
    let changed = false;
    const updated = tasks.map((t) => {
      const toUser = userById.get(t.assignedToUserId);
      const byUser = userById.get(t.assignedByUserId);
      const nextToName = toUser ? toUser.name : t.assignedToName;
      const nextByName = byUser ? byUser.name : t.assignedByName;
      if (nextToName !== t.assignedToName || nextByName !== t.assignedByName) {
        changed = true;
        const item = { ...t, assignedToName: nextToName, assignedByName: nextByName };
        if (syncChangedToServer) {
          syncUpdateRow(
            'Assignments',
            item.id,
            { assignedToName: nextToName, assignedByName: nextByName },
            item.diubah_pada,
            ksUser ? toActor(ksUser) : undefined
          ).catch(() => {});
        }
        return item;
      }
      return t;
    });
    if (changed) {
      localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(updated));
      anyChanged = true;
    }
  } catch {
    // ignore
  }

  refreshCurrentSessionFromUsers();
  return anyChanged;
}

/**
 * Mencatat aktivitas ke Log lokal (dan opsional ke Sheet jika operasi non-mutasi tabel seperti login/logout)
 */
export function logAuditAction(
  actor: User,
  action: string,
  targetEntity: string,
  targetId: string,
  details: string,
  pushDirectToSheetLog = false
): void {
  const logs = getAuditLogs();
  const newLog: AuditLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    actorUserId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    targetEntity,
    targetId,
    details,
    timestamp: new Date().toISOString(),
  };
  logs.unshift(newLog);
  safeSaveJsonArray(STORAGE_KEYS.AUDIT_LOGS, logs.slice(0, 300));
  if (pushDirectToSheetLog) {
    syncAppendLogOnly(toActor(actor), action, targetEntity, targetId, details).catch(() => {});
  }
  notifyLocalChange('audit_logs');
}

/**
 * Autentikasi Pengguna
 */
function findMatchingUserByIdentifier(users: User[], cleanId: string): User | undefined {
  return (
    users.find((u) => String(u.username || '').trim().toLowerCase() === cleanId) ||
    users.find(
      (u) =>
        (u.email && String(u.email).trim().toLowerCase() === cleanId) ||
        String(u.nip || '').trim().toLowerCase() === cleanId
    )
  );
}

async function doesPasswordMatchUser(user: User, rawPassword: string): Promise<boolean> {
  const sheetPlainPass =
    user.savedPassword !== undefined && user.savedPassword !== null ? String(user.savedPassword) : '';
  if (sheetPlainPass.trim() !== '') {
    return sheetPlainPass === rawPassword || sheetPlainPass.trim() === rawPassword.trim();
  }
  if (user.passwordHash) {
    return verifyPassword(rawPassword, user.passwordHash);
  }
  return false;
}

export async function authenticateUser(
  identifier: string,
  rawPassword: string
): Promise<{ success: boolean; user?: User; message: string }> {
  const cleanId = identifier.trim().toLowerCase();
  const isOnline = typeof navigator === 'undefined' || navigator.onLine;
  const gasConfigured = isAppsScriptConfigured();

  // Sinkronkan data dari Apps Script (jalur cepat terlebih dahulu)
  if (gasConfigured && isOnline) {
    const synced = await pullChangesFromAppsScript(true, false).catch(() => false);
    if (!synced) {
      return {
        success: false,
        message:
          'Gagal membaca database dari Google Sheets yang terhubung. Periksa URL Web App, Token Rahasia, dan SPREADSHEET_ID.',
      };
    }
  }

  let users = getAllUsers();
  let user = findMatchingUserByIdentifier(users, cleanId);
  let isMatch = user ? await doesPasswordMatchUser(user, rawPassword) : false;

  // Jika pengguna baru ditambahkan/diubah manual langsung di Google Sheets dan belum masuk CacheService, lakukan deep sync langsung ke Sheet
  if (gasConfigured && isOnline && (!user || !isMatch)) {
    const deepSynced = await pullChangesFromAppsScript(true, true).catch(() => false);
    if (deepSynced) {
      users = getAllUsers();
      user = findMatchingUserByIdentifier(users, cleanId);
      isMatch = user ? await doesPasswordMatchUser(user, rawPassword) : false;
    }
  }

  if (!user) {
    return {
      success: false,
      message:
        users.length === 0
          ? 'Data pengguna pada Google Sheet yang terhubung masih kosong (0 baris).'
          : 'Username atau Password tidak ditemukan pada database Google Sheet.',
    };
  }

  if (!user.isActive) {
    return {
      success: false,
      message: 'Akun ini sedang dinonaktifkan oleh pimpinan. Silakan hubungi Kepala Sekolah atau Admin.',
    };
  }

  if (!isMatch) {
    return {
      success: false,
      message: 'Password tidak sesuai dengan data pada database Google Sheet.',
    };
  }

  saveSession(user);
  logAuditAction(user, 'USER_LOGIN', 'Users', user.id, `Pengguna login sebagai ${user.role}.`, true);

  return {
    success: true,
    user,
    message: `Selamat datang kembali, ${user.name}!`,
  };
}

export async function bootstrapFirstKepalaSekolahAccount(params: {
  name: string;
  email: string;
  username: string;
  nip: string;
  rawPassword: string;
}): Promise<{ success: boolean; user?: User; message: string }> {
  const existingUsers = getAllUsers();
  if (existingUsers.length > 0) {
    return { success: false, message: 'Akun pengguna sudah tersedia di database.' };
  }

  const cleanPass = params.rawPassword.trim();
  const passwordHash = await hashPassword(cleanPass);
  const nowIso = new Date().toISOString();

  const newKepsek: User = {
    id: `usr-ks-${Date.now()}`,
    nip: params.nip.trim() || '001',
    name: params.name.trim(),
    email: params.email.trim(),
    username: params.username.trim(),
    passwordHash,
    savedPassword: cleanPass,
    role: 'kepala_sekolah',
    departmentId: 'Pimpinan',
    departmentName: 'Pimpinan',
    position: 'Kepala Sekolah',
    assignedSessionIds: ['sesi-1', 'sesi-2', 'sesi-3'],
    isActive: true,
    createdAt: nowIso,
    updatedAt: nowIso,
    diubah_pada: nowIso,
    status: 'aktif',
  };

  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify([newKepsek]));
  notifyLocalChange('users');

  if (isAppsScriptConfigured()) {
    const res = await syncSeedInitialIfEmpty({
      users: [newKepsek],
      schedules: DEFAULT_SCHEDULES,
      settings: getAppSettings(),
      actor: toActor(newKepsek),
    });
    if (!res) {
      const createRes = await syncCreateRow(
        'Users',
        newKepsek,
        toActor(newKepsek),
        `Membuat akun Kepala Sekolah utama ${newKepsek.name}`
      );
      if (!createRes.ok) {
        return { success: false, message: createRes.error || 'Gagal menyimpan akun Kepala Sekolah ke Google Sheets.' };
      }
    }
  }

  saveSession(newKepsek);
  return {
    success: true,
    user: newKepsek,
    message: `Akun Kepala Sekolah ${newKepsek.name} berhasil dibuat dan disinkronkan.`,
  };
}

export function saveSession(user: User): void {
  const { passwordHash, ...safeUser } = user;
  const serialized = JSON.stringify(safeUser);
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(STORAGE_KEYS.TAB_USER_SESSION, serialized);
  }
  localStorage.setItem(STORAGE_KEYS.CURRENT_USER_SESSION, serialized);
}

export function getCurrentSession(): User | null {
  try {
    const safeUser = readRawStoredSession();
    if (!safeUser) return null;
    if (!safeUser?.id || isDemoAccount(safeUser)) {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STORAGE_KEYS.TAB_USER_SESSION);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_SESSION);
      return null;
    }
    if (safeUser.role === 'superadmin' || safeUser.id === 'superadmin-local') {
      return safeUser;
    }
    const allUsers = getAllUsers();
    const fullUser = allUsers.find((u) => u.id === safeUser.id);
    if (fullUser) return fullUser;
    if (allUsers.length > 0 || isAppsScriptConfigured()) {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STORAGE_KEYS.TAB_USER_SESSION);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_SESSION);
      return null;
    }
    return safeUser;
  } catch {
    return null;
  }
}

export function clearSession(actor?: User): void {
  if (actor) {
    logAuditAction(actor, 'USER_LOGOUT', 'Users', actor.id, 'Pengguna keluar dari sistem (logout).', true);
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(STORAGE_KEYS.TAB_USER_SESSION);
  }
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_SESSION);
}

/**
 * Tambah Pengguna Baru
 */
export async function createUser(
  actor: User,
  userData: {
    nip: string;
    name: string;
    username: string;
    rawPassword: string;
    role: 'admin' | 'karyawan';
    departmentId?: string;
    departmentName?: string;
    scheduleId?: string;
    assignedSessionIds?: string[];
    position: string;
    email?: string;
    phone?: string;
  }
): Promise<{ success: boolean; user?: User; message: string }> {
  if (actor.role === 'karyawan') {
    return { success: false, message: 'Karyawan tidak memiliki hak akses membuat akun.' };
  }
  if (actor.role === 'admin' && userData.role !== 'karyawan') {
    return { success: false, message: 'Admin hanya berwenang membuat akun Karyawan/Tendik.' };
  }

  const users = getAllUsers();
  if (users.some((u) => u.nip === userData.nip.trim())) {
    return { success: false, message: `NIP/ID "${userData.nip}" sudah digunakan akun lain.` };
  }
  if (users.some((u) => u.username.toLowerCase() === userData.username.trim().toLowerCase())) {
    return { success: false, message: `Username "${userData.username}" sudah digunakan.` };
  }

  const cleanRawPassword = userData.rawPassword.trim();
  const passwordHash = await hashPassword(cleanRawPassword);
  const manualDept = userData.departmentName?.trim() || userData.departmentId?.trim() || '';
  const nowIso = new Date().toISOString();

  const newUser: User = {
    id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    nip: userData.nip.trim(),
    name: userData.name.trim(),
    username: userData.username.trim(),
    email: userData.email?.trim() || undefined,
    passwordHash,
    savedPassword: cleanRawPassword,
    role: userData.role,
    departmentId: manualDept,
    departmentName: manualDept,
    scheduleId: userData.scheduleId,
    assignedSessionIds:
      userData.assignedSessionIds && userData.assignedSessionIds.length > 0
        ? userData.assignedSessionIds
        : ['sesi-1', 'sesi-2', 'sesi-3'],
    position: userData.position.trim(),
    phone: userData.phone?.trim(),
    isActive: true,
    createdAt: nowIso,
    updatedAt: nowIso,
    diubah_pada: nowIso,
    status: 'aktif',
  };

  users.push(newUser);
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  logAuditAction(
    actor,
    'CREATE_USER',
    'Users',
    newUser.id,
    `Membuat akun baru ${newUser.name} (${newUser.role}) dengan NIP ${newUser.nip}.`
  );
  notifyLocalChange('users');

  const syncRes = await syncCreateRow(
    'Users',
    newUser,
    toActor(actor),
    `Menambah akun ${newUser.name} (${newUser.role}) NIP: ${newUser.nip}`
  );

  if (!syncRes.ok && isAppsScriptConfigured()) {
    return {
      success: false,
      user: newUser,
      message: syncRes.error || 'Gagal menyimpan pengguna ke Google Sheets.',
    };
  }

  return {
    success: true,
    user: syncRes.record || newUser,
    message: `Akun ${newUser.name} berhasil disimpan ke Google Sheets.`,
  };
}

/**
 * Update Data Pengguna (dengan perbandingan diubah_pada & edit sel spesifik di server)
 */
export async function updateUser(
  actor: User,
  userId: string,
  updates: Partial<Omit<User, 'id' | 'passwordHash'>> & { rawPassword?: string }
): Promise<{ success: boolean; message: string }> {
  const users = getAllUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) {
    return { success: false, message: 'Pengguna tidak ditemukan.' };
  }

  const targetUser = { ...users[index] };
  const expectedUpdatedAt = targetUser.diubah_pada;
  const oldName = targetUser.name;

  if (actor.role === 'admin') {
    if (targetUser.role === 'kepala_sekolah' || targetUser.role === 'admin') {
      return { success: false, message: 'Admin tidak dapat mengubah akun Kepala Sekolah atau Admin lain.' };
    }
  } else if (actor.role === 'karyawan' && actor.id !== userId) {
    return { success: false, message: 'Karyawan hanya dapat melihat profilnya sendiri.' };
  }

  const patch: Partial<User> = {};

  if (updates.nip && updates.nip.trim() !== targetUser.nip) {
    const cleanNip = updates.nip.trim();
    if (users.some((u) => u.id !== userId && u.nip === cleanNip)) {
      return { success: false, message: `NIP "${cleanNip}" sudah digunakan akun lain.` };
    }
    targetUser.nip = cleanNip;
    patch.nip = cleanNip;
  }

  if (updates.username && updates.username.trim().toLowerCase() !== targetUser.username.toLowerCase()) {
    const cleanUsername = updates.username.trim();
    if (users.some((u) => u.id !== userId && u.username.toLowerCase() === cleanUsername.toLowerCase())) {
      return { success: false, message: `Username "${cleanUsername}" sudah digunakan.` };
    }
    targetUser.username = cleanUsername;
    patch.username = cleanUsername;
  }

  if (updates.name) {
    targetUser.name = updates.name.trim();
    patch.name = targetUser.name;
  }
  if (updates.position) {
    targetUser.position = updates.position.trim();
    patch.position = targetUser.position;
  }
  if (updates.departmentName !== undefined) {
    targetUser.departmentName = updates.departmentName.trim();
    targetUser.departmentId = targetUser.departmentName;
    patch.departmentName = targetUser.departmentName;
    patch.departmentId = targetUser.departmentId;
  } else if (updates.departmentId !== undefined) {
    targetUser.departmentId = updates.departmentId;
    targetUser.departmentName = updates.departmentId;
    patch.departmentId = targetUser.departmentId;
    patch.departmentName = targetUser.departmentName;
  }
  if (updates.scheduleId !== undefined) {
    targetUser.scheduleId = updates.scheduleId;
    patch.scheduleId = updates.scheduleId;
  }
  if (updates.assignedSessionIds !== undefined) {
    targetUser.assignedSessionIds = updates.assignedSessionIds;
    patch.assignedSessionIds = updates.assignedSessionIds;
  }
  if (updates.email !== undefined) {
    targetUser.email = updates.email?.trim() || undefined;
    patch.email = targetUser.email || '';
  }
  if (updates.phone !== undefined) {
    targetUser.phone = updates.phone?.trim() || undefined;
    patch.phone = targetUser.phone || '';
  }
  if (updates.isActive !== undefined) {
    targetUser.isActive = updates.isActive;
    patch.isActive = updates.isActive;
  }

  if (updates.rawPassword && updates.rawPassword.trim().length > 0) {
    const cleanNewPass = updates.rawPassword.trim();
    targetUser.passwordHash = await hashPassword(cleanNewPass);
    targetUser.savedPassword = cleanNewPass;
    patch.passwordHash = targetUser.passwordHash;
    patch.savedPassword = cleanNewPass;
  }

  const mutationIso = new Date().toISOString();
  targetUser.updatedAt = mutationIso;
  users[index] = targetUser;
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  refreshCurrentSessionFromUsers();

  const oldNameHints = new Map<string, string>();
  if (oldName && oldName !== targetUser.name) {
    oldNameHints.set(userId, oldName);
  }
  logAuditAction(actor, 'UPDATE_USER', 'Users', userId, `Memperbarui profil akun ${targetUser.name} (${targetUser.role}).`);
  notifyLocalChange('users');

  const syncRes = await syncUpdateRow<User>(
    'Users',
    userId,
    patch,
    expectedUpdatedAt,
    toActor(actor),
    `Memperbarui data akun ${targetUser.name} (${targetUser.role})`
  );

  if (!syncRes.ok && isAppsScriptConfigured()) {
    return {
      success: false,
      message: syncRes.error || 'Gagal memperbarui data akun di Google Sheets.',
    };
  }

  if (syncRes.record?.diubah_pada) {
    const latestUsers = getAllUsers();
    const uIdx = latestUsers.findIndex((u) => u.id === userId);
    if (uIdx !== -1) {
      latestUsers[uIdx] = { ...latestUsers[uIdx], ...syncRes.record };
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(latestUsers));
    }
  }

  reconcileUserReferences(getAllUsers(), true, oldNameHints);
  return { success: true, message: `Data akun ${targetUser.name} berhasil tersimpan di Google Sheets.` };
}

export function toggleUserStatus(
  actor: User,
  userId: string
): { success: boolean; message: string; newStatus?: boolean } {
  const users = getAllUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) {
    return { success: false, message: 'Pengguna tidak ditemukan.' };
  }

  const targetUser = { ...users[index] };
  const expectedUpdatedAt = targetUser.diubah_pada;

  if (targetUser.role === 'kepala_sekolah') {
    return { success: false, message: 'Akun Kepala Sekolah utama tidak dapat dinonaktifkan.' };
  }
  if (actor.role === 'admin' && targetUser.role === 'admin') {
    return { success: false, message: 'Hanya Kepala Sekolah yang dapat menonaktifkan akun Admin.' };
  }

  targetUser.isActive = !targetUser.isActive;
  targetUser.updatedAt = new Date().toISOString();
  users[index] = targetUser;
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  refreshCurrentSessionFromUsers();

  const statusText = targetUser.isActive ? 'diaktifkan' : 'dinonaktifkan';
  logAuditAction(actor, 'TOGGLE_USER_STATUS', 'Users', userId, `Mengubah status akun ${targetUser.name} menjadi ${statusText}.`);
  notifyLocalChange('users');

  syncUpdateRow(
    'Users',
    userId,
    { isActive: targetUser.isActive },
    expectedUpdatedAt,
    toActor(actor),
    `Status akun ${targetUser.name} ${statusText}`
  ).catch(() => {});

  return {
    success: true,
    message: `Akun ${targetUser.name} berhasil ${statusText}.`,
    newStatus: targetUser.isActive,
  };
}

export async function deleteUser(
  actor: User,
  userId: string
): Promise<{ success: boolean; message: string }> {
  if (actor.role === 'karyawan') {
    return { success: false, message: 'Karyawan tidak memiliki hak akses menghapus akun.' };
  }

  const users = getAllUsers();
  const targetUser = users.find((u) => u.id === userId);
  if (!targetUser) {
    return { success: false, message: 'Pengguna tidak ditemukan.' };
  }

  if (targetUser.role === 'kepala_sekolah') {
    return { success: false, message: 'Akun Kepala Sekolah utama tidak dapat dihapus.' };
  }
  if (targetUser.id === actor.id) {
    return { success: false, message: 'Anda tidak dapat menghapus akun yang sedang aktif digunakan.' };
  }
  if (actor.role === 'admin' && targetUser.role === 'admin') {
    return { success: false, message: 'Hanya Kepala Sekolah yang berwenang menghapus akun Admin.' };
  }

  const filtered = users.filter((u) => u.id !== userId);
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(filtered));
  logAuditAction(
    actor,
    'DELETE_USER',
    'Users',
    userId,
    `Menghapus akun ${targetUser.name} (${targetUser.role}) NIP: ${targetUser.nip}.`
  );
  notifyLocalChange('users');

  const syncRes = await syncSoftDeleteRow(
    'Users',
    userId,
    targetUser.diubah_pada,
    toActor(actor),
    `Menghapus akun ${targetUser.name} (${targetUser.role}) NIP: ${targetUser.nip}`
  );

  if (!syncRes.ok && isAppsScriptConfigured()) {
    return {
      success: false,
      message: syncRes.error || 'Gagal menyinkronkan penghapusan pengguna ke Google Sheets.',
    };
  }

  return {
    success: true,
    message: `Akun ${targetUser.name} berhasil dihapus dan disinkronkan ke Google Sheets & Drive.`,
  };
}

/**
 * ==========================================
 * MASTER DATA: DEPARTEMEN
 * ==========================================
 */

export function createDepartment(
  actor: User,
  data: { name: string; code: string; description?: string; headName?: string }
): { success: boolean; department?: Department; message: string } {
  if (actor.role === 'karyawan') {
    return { success: false, message: 'Karyawan tidak memiliki hak akses mengelola departemen.' };
  }

  const depts = getAllDepartments();
  const cleanCode = data.code.trim().toUpperCase();
  if (depts.some((d) => d.code.toUpperCase() === cleanCode)) {
    return { success: false, message: `Kode departemen "${cleanCode}" sudah digunakan.` };
  }

  const nowIso = new Date().toISOString();
  const newDept: Department = {
    id: `dept-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: data.name.trim(),
    code: cleanCode,
    description: data.description?.trim(),
    headName: data.headName?.trim(),
    createdAt: nowIso,
    diubah_pada: nowIso,
    status: 'aktif',
  };

  depts.push(newDept);
  localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(depts));
  syncCreateRow('Departments', newDept, toActor(actor), `Menambah departemen ${newDept.name} (${newDept.code})`).catch(() => {});
  logAuditAction(actor, 'CREATE_DEPARTMENT', 'Departments', newDept.id, `Membuat departemen baru: ${newDept.name} (${newDept.code}).`);
  notifyLocalChange('departments');

  return { success: true, department: newDept, message: `Departemen ${newDept.name} berhasil dibuat.` };
}

export function updateDepartment(
  actor: User,
  id: string,
  data: { name: string; code: string; description?: string; headName?: string }
): { success: boolean; message: string } {
  if (actor.role === 'karyawan') {
    return { success: false, message: 'Karyawan tidak memiliki hak akses mengelola departemen.' };
  }

  const depts = getAllDepartments();
  const idx = depts.findIndex((d) => d.id === id);
  if (idx === -1) {
    return { success: false, message: 'Departemen tidak ditemukan.' };
  }

  const cleanCode = data.code.trim().toUpperCase();
  if (depts.some((d) => d.id !== id && d.code.toUpperCase() === cleanCode)) {
    return { success: false, message: `Kode departemen "${cleanCode}" sudah digunakan departemen lain.` };
  }

  const expectedUpdatedAt = depts[idx].diubah_pada;
  const patch: Partial<Department> = {
    name: data.name.trim(),
    code: cleanCode,
    description: data.description?.trim() || '',
    headName: data.headName?.trim() || '',
  };

  depts[idx] = { ...depts[idx], ...patch };
  localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(depts));
  syncUpdateRow('Departments', id, patch, expectedUpdatedAt, toActor(actor), `Memperbarui departemen ${depts[idx].name}`).catch(() => {});
  logAuditAction(actor, 'UPDATE_DEPARTMENT', 'Departments', id, `Memperbarui informasi departemen ${depts[idx].name}.`);
  notifyLocalChange('departments');

  return { success: true, message: `Departemen ${depts[idx].name} berhasil diperbarui.` };
}

export function deleteDepartment(actor: User, id: string): { success: boolean; message: string } {
  if (actor.role === 'karyawan') {
    return { success: false, message: 'Karyawan tidak memiliki hak akses.' };
  }

  const users = getAllUsers();
  if (users.some((u) => u.departmentId === id)) {
    return {
      success: false,
      message: 'Tidak dapat menghapus departemen yang masih memiliki karyawan aktif terdaftar.',
    };
  }

  const depts = getAllDepartments();
  const target = depts.find((d) => d.id === id);
  const filtered = depts.filter((d) => d.id !== id);
  localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(filtered));
  syncSoftDeleteRow('Departments', id, target?.diubah_pada, toActor(actor), `Menghapus departemen ${target?.name || id}`).catch(() => {});
  logAuditAction(actor, 'DELETE_DEPARTMENT', 'Departments', id, 'Menghapus departemen.');
  notifyLocalChange('departments');

  return { success: true, message: 'Departemen berhasil dihapus.' };
}

/**
 * ==========================================
 * MASTER DATA: JADWAL & SESI PRESENSI
 * ==========================================
 */

export function getAllSchedules(): Schedule[] {
  const rawList = safeReadArray<Schedule>(STORAGE_KEYS.SCHEDULES).filter((s) => s && s.id && s.status !== 'dihapus');
  const seen = new Set<string>();
  const list = rawList.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  if (list.length === 0) {
    localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(DEFAULT_SCHEDULES));
    return DEFAULT_SCHEDULES;
  }
  return list;
}

export function updateUserSessions(
  actor: User,
  userId: string,
  sessionIds: string[]
): { success: boolean; message: string } {
  if (actor.role === 'karyawan' && actor.id !== userId) {
    return { success: false, message: 'Hanya Kepala Sekolah dan Admin yang dapat mengatur sesi presensi.' };
  }

  const users = getAllUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) {
    return { success: false, message: 'Pegawai tidak ditemukan.' };
  }
  if (actor.role === 'admin' && users[idx].role === 'kepala_sekolah') {
    return { success: false, message: 'Admin tidak dapat mengubah sesi presensi Kepala Sekolah.' };
  }

  const expectedUpdatedAt = users[idx].diubah_pada;
  users[idx].assignedSessionIds = sessionIds;
  users[idx].updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  refreshCurrentSessionFromUsers();

  syncUpdateRow(
    'Users',
    userId,
    { assignedSessionIds: sessionIds },
    expectedUpdatedAt,
    toActor(actor),
    `Mengatur sesi presensi ${users[idx].name}: [${sessionIds.join(', ')}]`
  ).catch(() => {});
  logAuditAction(actor, 'UPDATE_USER_SESSIONS', 'Users', userId, `Mengatur sesi presensi ${users[idx].name} (${users[idx].role}): [${sessionIds.join(', ')}]`);
  notifyLocalChange('users');

  return { success: true, message: `Sesi presensi untuk ${users[idx].name} berhasil disimpan.` };
}

export function toggleUserSession(
  actor: User,
  userId: string,
  sessionId: string,
  enable: boolean
): { success: boolean; message: string } {
  if (actor.role === 'karyawan' && actor.id !== userId) {
    return { success: false, message: 'Hanya Kepala Sekolah dan Admin yang berwenang mengatur sesi.' };
  }

  const users = getAllUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) {
    return { success: false, message: 'Pegawai tidak ditemukan.' };
  }
  if (actor.role === 'admin' && users[idx].role === 'kepala_sekolah') {
    return { success: false, message: 'Admin tidak dapat mengubah sesi presensi Kepala Sekolah.' };
  }

  const expectedUpdatedAt = users[idx].diubah_pada;
  const curSessions = new Set(users[idx].assignedSessionIds || ['sesi-1', 'sesi-2', 'sesi-3']);
  if (enable) curSessions.add(sessionId);
  else curSessions.delete(sessionId);

  const nextArr = Array.from(curSessions);
  users[idx].assignedSessionIds = nextArr;
  users[idx].updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  refreshCurrentSessionFromUsers();

  syncUpdateRow(
    'Users',
    userId,
    { assignedSessionIds: nextArr },
    expectedUpdatedAt,
    toActor(actor),
    `${enable ? 'Menambahkan' : 'Mencabut'} sesi ${sessionId} untuk ${users[idx].name}`
  ).catch(() => {});
  logAuditAction(actor, 'TOGGLE_USER_SESSION', 'Users', userId, `${enable ? 'Menambahkan' : 'Mencabut'} penugasan ${sessionId} untuk ${users[idx].name} (${users[idx].role}).`);
  notifyLocalChange('users');

  return {
    success: true,
    message: `${enable ? 'Menambahkan' : 'Mencabut'} sesi untuk ${users[idx].name}.`,
  };
}

export function assignUsersToSession(
  actor: User,
  sessionId: string,
  targetUserIds: string[]
): { success: boolean; message: string } {
  if (actor.role === 'karyawan') {
    return { success: false, message: 'Hanya Kepala Sekolah dan Admin yang berwenang mengatur sesi.' };
  }

  const users = getAllUsers();
  let updatedCount = 0;

  users.forEach((u) => {
    const isAllowedToModify = actor.role === 'kepala_sekolah' || u.role !== 'kepala_sekolah';
    if (!isAllowedToModify) return;

    const expectedUpdatedAt = u.diubah_pada;
    const curSessions = new Set(u.assignedSessionIds || ['sesi-1', 'sesi-2', 'sesi-3']);
    const shouldHave = targetUserIds.includes(u.id);
    if (shouldHave && !curSessions.has(sessionId)) {
      curSessions.add(sessionId);
    } else if (!shouldHave && curSessions.has(sessionId)) {
      curSessions.delete(sessionId);
    } else {
      return;
    }

    u.assignedSessionIds = Array.from(curSessions);
    u.updatedAt = new Date().toISOString();
    syncUpdateRow(
      'Users',
      u.id,
      { assignedSessionIds: u.assignedSessionIds },
      expectedUpdatedAt,
      toActor(actor),
      `Penugasan sesi ${sessionId} untuk ${u.name}`
    ).catch(() => {});
    if (u.id === actor.id) saveSession(u);
    updatedCount++;
  });

  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  refreshCurrentSessionFromUsers();
  if (updatedCount > 0) notifyLocalChange('users');

  logAuditAction(actor, 'UPDATE_SESSION_ROSTER', 'Schedules', sessionId, `Memperbarui penugasan pegawai untuk ${sessionId} (${targetUserIds.length} pegawai terdaftar).`);
  return { success: true, message: `Berhasil mengatur ${targetUserIds.length} pegawai untuk sesi ini.` };
}

export function createSchedule(
  actor: User,
  data: {
    name: string;
    sessionName?: string;
    targetRole?: 'semua' | User['role'];
    checkInStart: string;
    checkInDeadline: string;
    lateToleranceMinutes: number;
    checkOutStart: string;
    checkOutEnd?: string;
    workDays: number[];
    ruleNotes?: string;
  }
): { success: boolean; schedule?: Schedule; message: string } {
  if (actor.role === 'karyawan') {
    return { success: false, message: 'Karyawan tidak memiliki wewenang mengelola jadwal.' };
  }

  const schedules = getAllSchedules();
  const nowIso = new Date().toISOString();
  const newSchedule: Schedule = {
    id: `sch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: data.name.trim(),
    sessionName: data.sessionName?.trim() || 'Sesi Reguler',
    targetRole: data.targetRole || 'semua',
    checkInStart: data.checkInStart,
    checkInDeadline: data.checkInDeadline,
    lateToleranceMinutes: Math.max(0, data.lateToleranceMinutes),
    checkOutStart: data.checkOutStart,
    checkOutEnd: data.checkOutEnd || '18:00',
    workDays: data.workDays.length ? data.workDays : [1, 2, 3, 4, 5],
    ruleNotes: data.ruleNotes?.trim(),
    isActive: true,
    diubah_pada: nowIso,
    status: 'aktif',
  };

  schedules.push(newSchedule);
  localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));
  syncCreateRow('Schedules', newSchedule, toActor(actor), `Menambah sesi jadwal ${newSchedule.name}`).catch(() => {});
  logAuditAction(actor, 'CREATE_SCHEDULE', 'Schedules', newSchedule.id, `Menambah sesi jadwal: ${newSchedule.name} (${newSchedule.sessionName}).`);
  notifyLocalChange('schedules');

  return { success: true, schedule: newSchedule, message: `Jadwal & Sesi ${newSchedule.name} berhasil disimpan.` };
}

export function updateSchedule(
  actor: User,
  id: string,
  data: Partial<Omit<Schedule, 'id'>>
): { success: boolean; message: string } {
  if (actor.role === 'karyawan') {
    return { success: false, message: 'Karyawan tidak memiliki wewenang.' };
  }

  const schedules = getAllSchedules();
  const idx = schedules.findIndex((s) => s.id === id);
  if (idx === -1) {
    return { success: false, message: 'Jadwal tidak ditemukan.' };
  }

  const expectedUpdatedAt = schedules[idx].diubah_pada;
  const patch: Partial<Schedule> = {};
  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.sessionName !== undefined) patch.sessionName = data.sessionName.trim();
  if (data.targetRole !== undefined) patch.targetRole = data.targetRole;
  if (data.checkInStart !== undefined) patch.checkInStart = data.checkInStart;
  if (data.checkInDeadline !== undefined) patch.checkInDeadline = data.checkInDeadline;
  if (data.lateToleranceMinutes !== undefined) patch.lateToleranceMinutes = Math.max(0, data.lateToleranceMinutes);
  if (data.checkOutStart !== undefined) patch.checkOutStart = data.checkOutStart;
  if (data.checkOutEnd !== undefined) patch.checkOutEnd = data.checkOutEnd;
  if (data.workDays !== undefined) patch.workDays = data.workDays;
  if (data.ruleNotes !== undefined) patch.ruleNotes = data.ruleNotes;
  if (data.isActive !== undefined) patch.isActive = data.isActive;

  schedules[idx] = { ...schedules[idx], ...patch };
  localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));
  syncUpdateRow('Schedules', id, patch, expectedUpdatedAt, toActor(actor), `Memperbarui jadwal ${schedules[idx].name}`).catch(() => {});
  logAuditAction(actor, 'UPDATE_SCHEDULE', 'Schedules', id, `Memperbarui jadwal/sesi ${schedules[idx].name}.`);
  notifyLocalChange('schedules');

  return { success: true, message: `Jadwal & Sesi ${schedules[idx].name} berhasil diperbarui.` };
}

export function deleteSchedule(actor: User, id: string): { success: boolean; message: string } {
  if (actor.role === 'karyawan') {
    return { success: false, message: 'Karyawan tidak memiliki wewenang.' };
  }

  const schedules = getAllSchedules();
  if (schedules.length <= 1) {
    return { success: false, message: 'Harus ada minimal 1 jadwal sesi aktif di sistem.' };
  }

  const target = schedules.find((s) => s.id === id);
  const filtered = schedules.filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(filtered));
  syncSoftDeleteRow('Schedules', id, target?.diubah_pada, toActor(actor), `Menghapus jadwal sesi ${target?.name || id}`).catch(() => {});

  // Bersihkan ID sesi yang dihapus dari assignedSessionIds pegawai agar tetap selaras
  const remainingFallback = filtered.map((s) => s.id);
  const users = getAllUsers();
  let usersChanged = false;
  users.forEach((u) => {
    if (Array.isArray(u.assignedSessionIds) && u.assignedSessionIds.includes(id)) {
      const nextIds = u.assignedSessionIds.filter((sid) => sid !== id);
      u.assignedSessionIds = nextIds.length > 0 ? nextIds : remainingFallback.slice(0, 1);
      syncUpdateRow(
        'Users',
        u.id,
        { assignedSessionIds: u.assignedSessionIds },
        u.diubah_pada,
        toActor(actor),
        `Sinkron penghapusan sesi ${target?.name || id}`
      ).catch(() => {});
      usersChanged = true;
    }
  });
  if (usersChanged) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    refreshCurrentSessionFromUsers();
  }

  logAuditAction(actor, 'DELETE_SCHEDULE', 'Schedules', id, `Menghapus jadwal sesi ${target?.name || id}.`);
  notifyLocalChange('schedules');

  return { success: true, message: `Jadwal sesi "${target?.name || id}" berhasil dihapus dan disinkronkan.` };
}

/**
 * ==========================================
 * MASTER DATA: TITIK LOKASI & RADIUS GPS
 * ==========================================
 */

export function getAllLocations(): LocationConfig[] {
  return dedupeById(
    safeReadArray<LocationConfig>(STORAGE_KEYS.LOCATIONS).filter((l) => l && l.status !== 'dihapus')
  );
}

export function createLocation(
  actor: User,
  data: {
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    address: string;
  }
): { success: boolean; location?: LocationConfig; message: string } {
  if (actor.role !== 'kepala_sekolah') {
    return { success: false, message: 'Hanya Kepala Sekolah yang memiliki wewenang mengatur lokasi dan radius presensi.' };
  }

  const locations = getAllLocations();
  const nowIso = new Date().toISOString();
  const newLocation: LocationConfig = {
    id: `loc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: data.name.trim(),
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    radiusMeters: Math.max(10, Number(data.radiusMeters)),
    address: data.address.trim(),
    isActive: true,
    diubah_pada: nowIso,
    status: 'aktif',
  };

  locations.push(newLocation);
  localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(locations));
  syncCreateRow('Locations', newLocation, toActor(actor), `Menambah titik lokasi ${newLocation.name} (Radius ${newLocation.radiusMeters}m)`).catch(() => {});
  logAuditAction(
    actor,
    'CREATE_LOCATION',
    'Locations',
    newLocation.id,
    `Menambah titik presensi ${newLocation.name} (Koordinat: ${newLocation.latitude}, ${newLocation.longitude}, Radius: ${newLocation.radiusMeters}m).`
  );
  notifyLocalChange('locations');

  return { success: true, location: newLocation, message: `Titik lokasi ${newLocation.name} berhasil disimpan ke Sheets.` };
}

export function updateLocation(
  actor: User,
  id: string,
  data: Partial<Omit<LocationConfig, 'id'>>
): { success: boolean; message: string } {
  if (actor.role !== 'kepala_sekolah') {
    return { success: false, message: 'Hanya Kepala Sekolah yang memiliki wewenang mengubah lokasi presensi.' };
  }

  const locations = getAllLocations();
  const idx = locations.findIndex((l) => l.id === id);
  if (idx === -1) {
    return { success: false, message: 'Lokasi tidak ditemukan.' };
  }

  const expectedUpdatedAt = locations[idx].diubah_pada;
  const patch: Partial<LocationConfig> = {};
  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.latitude !== undefined) patch.latitude = Number(data.latitude);
  if (data.longitude !== undefined) patch.longitude = Number(data.longitude);
  if (data.radiusMeters !== undefined) patch.radiusMeters = Math.max(10, Number(data.radiusMeters));
  if (data.address !== undefined) patch.address = data.address.trim();
  if (data.isActive !== undefined) patch.isActive = data.isActive;

  locations[idx] = { ...locations[idx], ...patch };
  localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(locations));
  syncUpdateRow('Locations', id, patch, expectedUpdatedAt, toActor(actor), `Memperbarui titik lokasi ${locations[idx].name}`).catch(() => {});
  logAuditAction(
    actor,
    'UPDATE_LOCATION',
    'Locations',
    id,
    `Memperbarui titik lokasi ${locations[idx].name} (Radius: ${locations[idx].radiusMeters}m).`
  );
  notifyLocalChange('locations');

  return { success: true, message: `Titik lokasi ${locations[idx].name} berhasil diperbarui.` };
}

export function deleteLocation(actor: User, id: string): { success: boolean; message: string } {
  if (actor.role !== 'kepala_sekolah') {
    return { success: false, message: 'Hanya Kepala Sekolah yang memiliki wewenang menghapus lokasi presensi.' };
  }

  const locations = getAllLocations();
  const target = locations.find((l) => l.id === id);
  const filtered = locations.filter((l) => l.id !== id);
  localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(filtered));
  syncSoftDeleteRow('Locations', id, target?.diubah_pada, toActor(actor), `Menghapus titik lokasi ${target?.name || id}`).catch(() => {});
  logAuditAction(actor, 'DELETE_LOCATION', 'Locations', id, 'Menghapus titik presensi.');
  notifyLocalChange('locations');

  return { success: true, message: 'Titik lokasi presensi berhasil dihapus.' };
}

/**
 * ==========================================
 * MASTER DATA: PENGATURAN SEKOLAH (SETTINGS)
 * ==========================================
 */

export function getAppSettings(): AppSettings {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (data) {
      const parsed = JSON.parse(data);
      return {
        ...parsed,
        storageMode: isAppsScriptConfigured() ? 'google_apps_script' : 'local_cache',
      };
    }
  } catch {
    // fallback default
  }
  return {
    id: 'global',
    schoolName: 'SMA Negeri 1 Prestasi',
    schoolEmail: 'kepsek@sekolah.sch.id',
    schoolAddress: 'Jl. Pendidikan No. 45, Kompleks Akademika',
    appTitle: 'KITARAJIN Presensi & Penugasan',
    storageMode: isAppsScriptConfigured() ? 'google_apps_script' : 'local_cache',
    requireStrictFaceVerification: true,
    requireStrictGps: true,
    minFaceMatchThreshold: 0.75,
    themeColor: '#059669',
    lastSyncTimestamp: SEED_BASELINE_ISO,
  };
}

export function updateAppSettings(
  actor: User,
  updates: Partial<AppSettings>
): { success: boolean; message: string } {
  if (actor.role !== 'superadmin' && actor.role !== 'kepala_sekolah') {
    return { success: false, message: 'Hanya Superadmin yang berwenang mengubah pengaturan global sistem.' };
  }

  const current = getAppSettings();
  const expectedUpdatedAt = current.diubah_pada;
  const merged: AppSettings = {
    ...current,
    ...updates,
    id: 'global',
    storageMode: isAppsScriptConfigured() ? 'google_apps_script' : 'local_cache',
    lastSyncTimestamp: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
  syncUpsertSettings(merged, expectedUpdatedAt, toActor(actor), 'Memperbarui profil sekolah & kebijakan presensi.').catch(() => {});
  logAuditAction(actor, 'UPDATE_SETTINGS', 'Settings', 'global', 'Memperbarui pengaturan sistem dan sekolah.');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kitarajin_settings_updated', { detail: merged }));
  }

  return { success: true, message: 'Pengaturan sekolah berhasil disimpan.' };
}

/**
 * ==========================================
 * DATABASE WAJAH (FOTO DISIMPAN DI DRIVE VIA APPS SCRIPT)
 * ==========================================
 */

export function getAllFaceRegistry(): FaceRegistryItem[] {
  return dedupeById(
    safeReadArray<FaceRegistryItem>(STORAGE_KEYS.FACE_REGISTRY).filter((f) => f && f.status !== 'dihapus')
  );
}

export function getFaceRegistryByUserId(userId: string): FaceRegistryItem | undefined {
  return getAllFaceRegistry().find((f) => f.userId === userId && f.isActive);
}

export function registerOrUpdateFace(
  actor: User,
  data: {
    userId: string;
    faceEmbedding: number[];
    registeredPhotoRef: string;
    cameraUsed: 'user' | 'environment';
    qualityScore: number;
  }
): { success: boolean; item?: FaceRegistryItem; message: string } {
  if (actor.role !== 'kepala_sekolah' && actor.role !== 'admin') {
    return {
      success: false,
      message: 'Hanya Admin atau Kepala Sekolah yang memiliki wewenang mengelola Perekaman & Database Wajah.',
    };
  }

  const users = getAllUsers();
  const targetUser = users.find((u) => u.id === data.userId);
  if (!targetUser) {
    return { success: false, message: 'Data pengguna tidak ditemukan.' };
  }

  const registry = getAllFaceRegistry();
  const existingIndex = registry.findIndex((f) => f.userId === data.userId);
  const existingItem = existingIndex !== -1 ? registry[existingIndex] : undefined;
  const nowIso = new Date().toISOString();

  const registryItem: FaceRegistryItem = {
    id: existingItem ? existingItem.id : `face-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    userId: targetUser.id,
    nip: targetUser.nip,
    userName: targetUser.name,
    role: targetUser.role,
    faceEmbedding: data.faceEmbedding,
    registeredPhotoRef: data.registeredPhotoRef,
    registeredPhotoFileId: existingItem?.registeredPhotoFileId,
    registeredBy: actor.name,
    cameraUsed: data.cameraUsed,
    qualityScore: data.qualityScore,
    updatedAt: nowIso,
    diubah_pada: existingItem?.diubah_pada,
    isActive: true,
    status: 'aktif',
  };

  if (existingIndex !== -1) {
    registry[existingIndex] = registryItem;
  } else {
    registry.push(registryItem);
  }

  localStorage.setItem(STORAGE_KEYS.FACE_REGISTRY, JSON.stringify(registry));
  syncSaveFace(registryItem, data.registeredPhotoRef, existingItem?.diubah_pada, toActor(actor)).catch(() => {});
  logAuditAction(
    actor,
    'REGISTER_FACE',
    'FaceRegistry',
    registryItem.id,
    `Mendaftarkan biometrik wajah untuk ${targetUser.name} (NIP: ${targetUser.nip}) oleh ${actor.name}.`
  );
  notifyLocalChange('face_registry');

  return {
    success: true,
    item: registryItem,
    message: isAppsScriptConfigured()
      ? `Wajah ${targetUser.name} disimpan & foto diunggah ke Google Drive.`
      : `Wajah ${targetUser.name} berhasil disimpan di cache lokal.`,
  };
}

export function toggleFaceStatus(actor: User, registryId: string): { success: boolean; message: string } {
  if (actor.role !== 'kepala_sekolah' && actor.role !== 'admin') {
    return { success: false, message: 'Hanya Admin atau Kepala Sekolah yang berwenang.' };
  }

  const registry = getAllFaceRegistry();
  const item = registry.find((f) => f.id === registryId);
  if (!item) return { success: false, message: 'Data wajah tidak ditemukan.' };

  const expectedUpdatedAt = item.diubah_pada;
  item.isActive = !item.isActive;
  item.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEYS.FACE_REGISTRY, JSON.stringify(registry));

  const statusText = item.isActive ? 'diaktifkan' : 'dinonaktifkan';
  syncUpdateRow(
    'FaceRegistry',
    registryId,
    { isActive: item.isActive },
    expectedUpdatedAt,
    toActor(actor),
    `Status wajah ${item.userName} ${statusText}`
  ).catch(() => {});
  logAuditAction(actor, 'TOGGLE_FACE_STATUS', 'FaceRegistry', registryId, `Status wajah ${item.userName} ${statusText}.`);
  notifyLocalChange('face_registry');

  return { success: true, message: `Data wajah ${item.userName} berhasil ${statusText}.` };
}

export function deleteFaceRegistry(actor: User, registryId: string): { success: boolean; message: string } {
  if (actor.role !== 'kepala_sekolah' && actor.role !== 'admin') {
    return { success: false, message: 'Hanya Admin atau Kepala Sekolah yang berwenang.' };
  }

  const registry = getAllFaceRegistry();
  const target = registry.find((f) => f.id === registryId);
  const filtered = registry.filter((f) => f.id !== registryId);
  localStorage.setItem(STORAGE_KEYS.FACE_REGISTRY, JSON.stringify(filtered));
  syncSoftDeleteRow(
    'FaceRegistry',
    registryId,
    target?.diubah_pada,
    toActor(actor),
    `Menghapus database wajah ${target?.userName || registryId}`
  ).catch(() => {});
  logAuditAction(actor, 'DELETE_FACE', 'FaceRegistry', registryId, 'Menghapus data biometrik wajah.');
  notifyLocalChange('face_registry');

  return { success: true, message: 'Data wajah berhasil dihapus dari database.' };
}

/**
 * ==========================================
 * PRESENSI MANDIRI (TANPA FOTO, BATCH 3 DETIK, OFFLINE-READY)
 * ==========================================
 */

export function getAllAttendanceRecords(): AttendanceRecord[] {
  return dedupeById(
    safeReadArray<AttendanceRecord>(STORAGE_KEYS.ATTENDANCE).filter(
      (r) => r && r.id && !String(r.id).startsWith('att-seed-') && r.rowStatus !== 'dihapus'
    )
  );
}

export function purgeDemoAttendanceRecords(): { count: number } {
  try {
    const records = safeReadArray<AttendanceRecord>(STORAGE_KEYS.ATTENDANCE);
    if (records.length === 0) return { count: 0 };
    const demoRecords = records.filter((r) => r && r.id && String(r.id).startsWith('att-seed-'));
    if (demoRecords.length === 0) return { count: 0 };
    const realRecords = records.filter((r) => r && r.id && !String(r.id).startsWith('att-seed-'));
    safeSaveJsonArray(STORAGE_KEYS.ATTENDANCE, realRecords);
    return { count: demoRecords.length };
  } catch {
    return { count: 0 };
  }
}

export function getAttendanceForUser(userId: string): AttendanceRecord[] {
  return getAllAttendanceRecords()
    .filter((r) => r.userId === userId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function groupAttendanceByDateAndUser(records: AttendanceRecord[]): DailyAttendancePair[] {
  const map = new Map<string, DailyAttendancePair>();
  const userById = new Map<string, User>(getAllUsers().map((u) => [u.id, u]));

  for (const r of records) {
    const key = `${r.date}_${r.userId}_${r.sessionId || 'default'}`;
    const latestUser = userById.get(r.userId);
    if (!map.has(key)) {
      map.set(key, {
        date: r.date,
        userId: r.userId,
        userName: latestUser?.name || r.userName,
        nip: latestUser?.nip || r.nip,
        role: latestUser?.role || r.role,
      });
    }
    const item = map.get(key)!;
    if (r.type === 'masuk') item.masukRecord = r;
    else if (r.type === 'pulang') item.pulangRecord = r;
  }

  return Array.from(map.values()).sort((a, b) => {
    const dateComp = b.date.localeCompare(a.date);
    if (dateComp !== 0) return dateComp;
    return a.userName.localeCompare(b.userName);
  });
}

export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function recordAttendance(
  recordData: Omit<AttendanceRecord, 'id' | 'timestamp'>
): { success: boolean; record?: AttendanceRecord; message: string } {
  const records = getAllAttendanceRecords();
  const now = new Date();
  const todayStr = getLocalDateString(now);

  const users = getAllUsers();
  const user = users.find((u) => u.id === recordData.userId);
  const schedules = getAllSchedules();

  let schedule: Schedule | undefined;
  if (recordData.sessionId) {
    schedule = schedules.find((s) => s.id === recordData.sessionId);
    if (!schedule) {
      return {
        success: false,
        message: 'Sesi presensi yang dipilih tidak ditemukan atau telah dihapus oleh Admin.',
      };
    }
  } else {
    const allowedIds = user?.assignedSessionIds || [];
    schedule =
      (allowedIds.length > 0 ? schedules.find((s) => allowedIds.includes(s.id)) : undefined) ||
      (user?.scheduleId ? schedules.find((s) => s.id === user.scheduleId) : undefined) ||
      schedules[0];
  }

  if (schedule && user?.assignedSessionIds && user.assignedSessionIds.length > 0) {
    if (!user.assignedSessionIds.includes(schedule.id)) {
      return {
        success: false,
        message: `Anda tidak terdaftar pada ${schedule.sessionName || schedule.name}. Silakan pilih sesi presensi yang diatur untuk akun Anda.`,
      };
    }
  }

  const effectiveSessionId = schedule?.id || recordData.sessionId;

  // Cegah presensi ganda di hari yang sama per sesi
  const duplicate = records.find(
    (r) =>
      r.userId === recordData.userId &&
      r.date === todayStr &&
      r.type === recordData.type &&
      (effectiveSessionId ? r.sessionId === effectiveSessionId : true)
  );

  if (duplicate) {
    const timeFormatted = new Date(duplicate.timestamp).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const sessionLabel = duplicate.sessionName ? ` untuk ${duplicate.sessionName}` : '';
    return {
      success: false,
      message: `Anda sudah melakukan presensi ${recordData.type.toUpperCase()}${sessionLabel} hari ini pada pukul ${timeFormatted} WIB.`,
    };
  }

  if (schedule) {
    const curTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (recordData.type === 'masuk') {
      if (curTime < schedule.checkInStart) {
        return {
          success: false,
          message: `Presensi MASUK ${schedule.sessionName || schedule.name} belum dibuka. Jadwal presensi masuk dibuka pukul ${schedule.checkInStart} WIB (Waktu sekarang: ${curTime} WIB).`,
        };
      }
      if (curTime >= schedule.checkOutStart) {
        return {
          success: false,
          message: `Waktu presensi MASUK ${schedule.sessionName || schedule.name} sudah ditutup. Saat ini sudah memasuki jam kepulangan (mulai ${schedule.checkOutStart} WIB).`,
        };
      }
    } else if (recordData.type === 'pulang') {
      if (curTime < schedule.checkOutStart) {
        return {
          success: false,
          message: `Presensi PULANG ${schedule.sessionName || schedule.name} belum dibuka. Jam presensi pulang baru dibuka pukul ${schedule.checkOutStart} WIB (Waktu sekarang: ${curTime} WIB).`,
        };
      }
      if (schedule.checkOutEnd && curTime > schedule.checkOutEnd) {
        return {
          success: false,
          message: `Batas waktu presensi PULANG ${schedule.sessionName || schedule.name} telah berakhir pada pukul ${schedule.checkOutEnd} WIB (Waktu sekarang: ${curTime} WIB).`,
        };
      }
    }
  }

  const isOfflineNow = typeof navigator !== 'undefined' && !navigator.onLine;
  // PRESENSI TIDAK MENYIMPAN FOTO: hanya menyimpan nama, NIP, kecocokan wajah, GPS, dan sesi
  const newRecord: AttendanceRecord = {
    id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    userId: recordData.userId,
    nip: recordData.nip,
    userName: recordData.userName,
    role: recordData.role,
    date: todayStr,
    type: recordData.type,
    timestamp: now.toISOString(),
    status: recordData.status,
    latitude: recordData.latitude,
    longitude: recordData.longitude,
    distanceFromLocationMeters: recordData.distanceFromLocationMeters,
    isLocationValid: recordData.isLocationValid,
    isFaceValid: recordData.isFaceValid,
    faceSimilarityScore: recordData.faceSimilarityScore,
    photoRef: '',
    deviceInfo: recordData.deviceInfo,
    notes: recordData.notes,
    sessionId: effectiveSessionId,
    sessionName: schedule ? schedule.sessionName || schedule.name : recordData.sessionName,
    rowStatus: 'aktif',
    syncState: isAppsScriptConfigured() ? (isOfflineNow ? 'offline' : 'queued') : 'synced',
  };

  records.unshift(newRecord);
  const savedLocally = safeSaveJsonArray(STORAGE_KEYS.ATTENDANCE, records);
  if (!savedLocally) {
    return {
      success: false,
      message: 'Penyimpanan lokal peramban penuh. Silakan segarkan halaman atau kosongkan log audit terlebih dahulu.',
    };
  }

  // Kirim lewat batch 3 detik (atau antrean offline otomatis saat terhubung kembali)
  enqueueAttendanceScan(newRecord);
  notifyLocalChange('attendance');

  const actor: User = {
    id: recordData.userId,
    name: recordData.userName,
    role: recordData.role,
    nip: recordData.nip,
    username: '',
    passwordHash: '',
    position: '',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };

  logAuditAction(
    actor,
    'SUBMIT_ATTENDANCE',
    'Attendance',
    newRecord.id,
    `Presensi ${newRecord.type.toUpperCase()} (${newRecord.status.replace('_', ' ')}) cocok wajah ${Math.round(newRecord.faceSimilarityScore * 100)}%, jarak ${newRecord.distanceFromLocationMeters}m.`
  );

  return {
    success: true,
    record: newRecord,
    message: isOfflineNow
      ? `Mode Offline: Presensi ${newRecord.type.toUpperCase()} disimpan sementara & otomatis dikirim saat internet kembali aktif.`
      : isAppsScriptConfigured()
      ? `Presensi ${newRecord.type.toUpperCase()} berhasil dicatat (terjadwal batch otomatis ke Sheets).`
      : `Presensi ${newRecord.type.toUpperCase()} berhasil dicatat.`,
  };
}

export async function deleteAttendanceRecord(
  actor: User,
  recordId: string
): Promise<{ success: boolean; message: string }> {
  if (actor.role !== 'kepala_sekolah') {
    return { success: false, message: 'Hanya Kepala Sekolah yang berwenang menghapus riwayat presensi.' };
  }

  const records = getAllAttendanceRecords();
  const target = records.find((r) => r.id === recordId);
  if (!target) {
    return { success: false, message: 'Catatan presensi tidak ditemukan.' };
  }

  const filtered = records.filter((r) => r.id !== recordId);
  safeSaveJsonArray(STORAGE_KEYS.ATTENDANCE, filtered);

  try {
    const rawQ = localStorage.getItem('kitarajin_offline_attendance_queue');
    if (rawQ) {
      const q = JSON.parse(rawQ);
      if (Array.isArray(q)) {
        localStorage.setItem(
          'kitarajin_offline_attendance_queue',
          JSON.stringify(q.filter((item: any) => item?.id !== recordId))
        );
      }
    }
  } catch {
    // ignore
  }

  logAuditAction(
    actor,
    'DELETE_ATTENDANCE',
    'Attendance',
    recordId,
    `Menghapus catatan presensi ${target.type.toUpperCase()} milik ${target.userName} tanggal ${target.date}.`
  );
  notifyLocalChange('attendance');

  const syncRes = await syncSoftDeleteRow(
    'Attendance',
    recordId,
    target.diubah_pada,
    toActor(actor),
    `Menghapus presensi ${target.type.toUpperCase()} ${target.userName} (${target.date})`
  );

  if (!syncRes.ok && isAppsScriptConfigured()) {
    return {
      success: false,
      message: syncRes.error || 'Gagal menyinkronkan penghapusan presensi ke Google Sheets.',
    };
  }

  return {
    success: true,
    message: `Catatan presensi ${target.type.toUpperCase()} (${target.userName}) berhasil dihapus & disinkronkan ke Google Sheets.`,
  };
}

/**
 * ==========================================
 * PERIZINAN, SAKIT & DINAS (LEAVE REQUESTS)
 * ==========================================
 */

export function getAllLeaveRequests(): LeaveRequest[] {
  return dedupeById(
    safeReadArray<LeaveRequest>(STORAGE_KEYS.LEAVE_REQUESTS).filter((l) => l && l.rowStatus !== 'dihapus')
  );
}

export function getLeaveRequestsForUser(userId: string): LeaveRequest[] {
  return getAllLeaveRequests()
    .filter((l) => l.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function createLeaveRequest(
  actor: User,
  data: {
    type: LeaveType;
    startDate: string;
    endDate: string;
    reason: string;
    documentRef?: string;
  }
): { success: boolean; request?: LeaveRequest; message: string } {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  const nowIso = new Date().toISOString();

  const newRequest: LeaveRequest = {
    id: `leave-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    userId: actor.id,
    nip: actor.nip,
    userName: actor.name,
    type: data.type,
    startDate: data.startDate,
    endDate: data.endDate,
    durationDays: Math.max(1, diffDays),
    reason: data.reason.trim(),
    documentRef: data.documentRef,
    status: 'menunggu',
    createdAt: nowIso,
    diubah_pada: nowIso,
    rowStatus: 'aktif',
  };

  const leaves = getAllLeaveRequests();
  leaves.unshift(newRequest);
  localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(leaves));
  syncCreateRow('LeaveRequests', newRequest, toActor(actor), `Mengajukan ${newRequest.type.toUpperCase()} (${newRequest.startDate} s/d ${newRequest.endDate})`).catch(() => {});
  logAuditAction(actor, 'SUBMIT_LEAVE', 'LeaveRequests', newRequest.id, `Mengajukan permohonan ${newRequest.type.toUpperCase()} dari ${newRequest.startDate} s/d ${newRequest.endDate} (${newRequest.durationDays} hari).`);
  notifyLocalChange('leave_requests');

  return {
    success: true,
    request: newRequest,
    message: `Permohonan ${newRequest.type.toUpperCase()} berhasil dikirimkan dan menunggu peninjauan pimpinan.`,
  };
}

export function reviewLeaveRequest(
  actor: User,
  requestId: string,
  decision: 'disetujui' | 'ditolak',
  reviewNotes?: string
): { success: boolean; message: string } {
  if (actor.role === 'karyawan') {
    return { success: false, message: 'Karyawan tidak memiliki hak meninjau permohonan izin.' };
  }

  const leaves = getAllLeaveRequests();
  const idx = leaves.findIndex((l) => l.id === requestId);
  if (idx === -1) {
    return { success: false, message: 'Permohonan izin tidak ditemukan.' };
  }

  const expectedUpdatedAt = leaves[idx].diubah_pada;
  const reviewedAt = new Date().toISOString();
  const patch = {
    status: decision,
    leaveStatus: decision,
    reviewedBy: actor.name,
    reviewNotes: reviewNotes?.trim() || '',
    reviewedAt,
  };

  leaves[idx].status = decision;
  leaves[idx].reviewedBy = actor.name;
  leaves[idx].reviewNotes = reviewNotes?.trim();
  leaves[idx].reviewedAt = reviewedAt;

  localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(leaves));
  syncUpdateRow(
    'LeaveRequests',
    requestId,
    patch,
    expectedUpdatedAt,
    toActor(actor),
    `Meninjau izin ${leaves[idx].userName}: ${decision.toUpperCase()}`
  ).catch(() => {});
  logAuditAction(actor, 'REVIEW_LEAVE', 'LeaveRequests', requestId, `Meninjau izin ${leaves[idx].userName}: ${decision.toUpperCase()}.`);
  notifyLocalChange('leave_requests');

  return {
    success: true,
    message: `Permohonan izin ${leaves[idx].userName} berhasil ${decision}.`,
  };
}

/**
 * ==========================================
 * PENUGASAN & DOKUMENTASI (ASSIGNMENTS)
 * ==========================================
 */

export function getAllAssignments(): Assignment[] {
  return dedupeById(
    safeReadArray<Assignment>(STORAGE_KEYS.ASSIGNMENTS).filter((a) => a && a.rowStatus !== 'dihapus')
  );
}

export function getAssignmentsForUser(userId: string): Assignment[] {
  return getAllAssignments()
    .filter((a) => a.assignedToUserId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function createAssignment(
  actor: User,
  data: {
    title: string;
    description: string;
    assignedToUserId: string;
    dueDate: string;
  }
): { success: boolean; assignment?: Assignment; message: string } {
  if (actor.role === 'karyawan') {
    return { success: false, message: 'Hanya Admin atau Kepala Sekolah yang dapat membuat tugas.' };
  }

  const users = getAllUsers();
  const targetUser = users.find((u) => u.id === data.assignedToUserId);
  if (!targetUser) {
    return { success: false, message: 'Karyawan yang ditugaskan tidak ditemukan.' };
  }

  const nowIso = new Date().toISOString();
  const newAssignment: Assignment = {
    id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    title: data.title.trim(),
    description: data.description.trim(),
    assignedToUserId: targetUser.id,
    assignedToName: targetUser.name,
    assignedByUserId: actor.id,
    assignedByName: actor.name,
    dueDate: data.dueDate,
    status: 'belum_mulai',
    createdAt: nowIso,
    diubah_pada: nowIso,
    rowStatus: 'aktif',
  };

  const tasks = getAllAssignments();
  tasks.unshift(newAssignment);
  localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(tasks));
  syncCreateRow('Assignments', newAssignment, toActor(actor), `Membuat tugas "${newAssignment.title}" untuk ${targetUser.name}`).catch(() => {});
  logAuditAction(actor, 'CREATE_ASSIGNMENT', 'Assignments', newAssignment.id, `Membuat tugas "${newAssignment.title}" untuk ${newAssignment.assignedToName}.`);
  notifyLocalChange('assignments');

  return {
    success: true,
    assignment: newAssignment,
    message: `Tugas berhasil diberikan kepada ${targetUser.name}.`,
  };
}

export function submitAssignmentDocumentation(
  actor: User,
  assignmentId: string,
  data: {
    documentationPhotoRef: string;
    documentationNotes: string;
    documentationLocation?: { latitude: number; longitude: number; address?: string };
  }
): { success: boolean; message: string } {
  const tasks = getAllAssignments();
  const idx = tasks.findIndex((t) => t.id === assignmentId);
  if (idx === -1) {
    return { success: false, message: 'Tugas tidak ditemukan.' };
  }

  const task = tasks[idx];
  if (actor.role === 'karyawan' && task.assignedToUserId !== actor.id) {
    return { success: false, message: 'Anda hanya dapat mengirim dokumentasi untuk tugas milik Anda.' };
  }

  const expectedUpdatedAt = task.diubah_pada;
  const completedAt = new Date().toISOString();
  const patch = {
    documentationPhotoRef: data.documentationPhotoRef,
    documentationNotes: data.documentationNotes.trim(),
    documentationLocation: data.documentationLocation,
    completedAt,
    status: 'proses' as const,
    assignmentStatus: 'proses',
  };

  task.documentationPhotoRef = patch.documentationPhotoRef;
  task.documentationNotes = patch.documentationNotes;
  task.documentationLocation = patch.documentationLocation;
  task.completedAt = completedAt;
  task.status = 'proses';

  localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(tasks));
  syncUpdateRow('Assignments', assignmentId, patch, expectedUpdatedAt, toActor(actor), `Mengirim dokumentasi tugas "${task.title}"`).catch(() => {});
  logAuditAction(actor, 'SUBMIT_TASK_DOCS', 'Assignments', assignmentId, `Mengunggah bukti dokumentasi tugas "${task.title}".`);
  notifyLocalChange('assignments');

  return {
    success: true,
    message: 'Bukti dokumentasi tugas berhasil diunggah dan dikirim untuk peninjauan.',
  };
}

export function reviewAssignment(
  actor: User,
  assignmentId: string,
  status: 'selesai' | 'perlu_perbaikan',
  feedback?: string
): { success: boolean; message: string } {
  if (actor.role === 'karyawan') {
    return { success: false, message: 'Karyawan tidak memiliki wewenang memverifikasi tugas.' };
  }

  const tasks = getAllAssignments();
  const idx = tasks.findIndex((t) => t.id === assignmentId);
  if (idx === -1) {
    return { success: false, message: 'Tugas tidak ditemukan.' };
  }

  const expectedUpdatedAt = tasks[idx].diubah_pada;
  const patch = {
    status,
    assignmentStatus: status,
    feedback: feedback?.trim() || '',
  };

  tasks[idx].status = status;
  tasks[idx].feedback = feedback?.trim();
  localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(tasks));
  syncUpdateRow('Assignments', assignmentId, patch, expectedUpdatedAt, toActor(actor), `Verifikasi tugas "${tasks[idx].title}": ${status.toUpperCase()}`).catch(() => {});

  const statusLabel = status === 'selesai' ? 'SELESAI' : 'PERLU PERBAIKAN';
  logAuditAction(actor, 'REVIEW_ASSIGNMENT', 'Assignments', assignmentId, `Memverifikasi tugas "${tasks[idx].title}": ${statusLabel}.`);
  notifyLocalChange('assignments');

  return {
    success: true,
    message: `Status tugas berhasil diperbarui menjadi ${status === 'selesai' ? 'Selesai' : 'Perlu Perbaikan'}.`,
  };
}
