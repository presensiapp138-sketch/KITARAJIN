/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AppsScriptConfig,
  AppSettings,
  AttendanceRecord,
  AuditLog,
  FaceRegistryItem,
  SheetRepairReport,
  SystemCheckResult,
  UserRole,
} from '../types';

export type AppsScriptTableName =
  | 'Users'
  | 'Departments'
  | 'Schedules'
  | 'Locations'
  | 'FaceRegistry'
  | 'Attendance'
  | 'LeaveRequests'
  | 'Assignments'
  | 'Settings'
  | 'Log';

export type SyncStateKind = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

export interface SyncUiState {
  kind: SyncStateKind;
  message: string;
  pendingAttendanceCount: number;
  lastSavedAt?: string;
  lastSyncAt?: string;
  version?: string;
  isConfigured: boolean;
  isPolling: boolean;
}

export interface ActorPayload {
  id: string;
  name: string;
  role: UserRole | string;
}

const GAS_CONFIG_KEY = 'kitarajin_gas_config';
const OFFLINE_QUEUE_KEY = 'kitarajin_offline_attendance_queue';
const LAST_VERSION_KEY = 'kitarajin_gas_data_version';
const HAS_SYNCED_SHEET_KEY = 'kitarajin_has_synced_sheet';

export const TABLE_STORAGE_MAP: Record<AppsScriptTableName, string> = {
  Users: 'kitarajin_table_users',
  Departments: 'kitarajin_table_departments',
  Schedules: 'kitarajin_table_schedules',
  Locations: 'kitarajin_table_locations',
  FaceRegistry: 'kitarajin_table_face_registry',
  Attendance: 'kitarajin_table_attendance',
  LeaveRequests: 'kitarajin_table_leave_requests',
  Assignments: 'kitarajin_table_assignments',
  Settings: 'kitarajin_table_settings',
  Log: 'kitarajin_table_audit_logs',
};

// Cache foto wajah dari Google Drive privat (via Apps Script endpoint ?action=getPhoto)
const drivePhotoCache = new Map<string, string>();
const inFlightPhotoFetch = new Map<string, Promise<string | null>>();

let currentUiState: SyncUiState = {
  kind: 'idle',
  message: 'Siap',
  pendingAttendanceCount: 0,
  isConfigured: false,
  isPolling: false,
};

const uiListeners = new Set<(state: SyncUiState) => void>();
let savedResetTimer: ReturnType<typeof setTimeout> | null = null;
let batchFlushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushingBatch = false;
let isPullInFlight = false;
let inFlightPullPromise: Promise<boolean> | null = null;
let inFlightPullWasDeep = false;
let inFlightPullWasForced = false;
let consecutivePollFailures = 0;
let hasDoneSessionDriveScan = false;
let isSeedingEmptySheet = false;
let realtimeLoopTimer: ReturnType<typeof setTimeout> | null = null;
let isRealtimeStarted = false;

function notifyUiListeners() {
  uiListeners.forEach((fn) => {
    try {
      fn({ ...currentUiState });
    } catch {
      // ignore listener errors
    }
  });
}

function setSyncUiState(patch: Partial<SyncUiState>) {
  currentUiState = {
    ...currentUiState,
    ...patch,
    isConfigured: isAppsScriptConfigured(),
    pendingAttendanceCount: getOfflineAttendanceQueue().length,
  };
  notifyUiListeners();
}

export function getSyncUiState(): SyncUiState {
  return {
    ...currentUiState,
    isConfigured: isAppsScriptConfigured(),
    pendingAttendanceCount: getOfflineAttendanceQueue().length,
  };
}

export function subscribeSyncUiState(listener: (state: SyncUiState) => void): () => void {
  uiListeners.add(listener);
  listener(getSyncUiState());
  return () => {
    uiListeners.delete(listener);
  };
}

function markSaving(message = 'Menyimpan...') {
  if (savedResetTimer) {
    clearTimeout(savedResetTimer);
    savedResetTimer = null;
  }
  setSyncUiState({ kind: 'saving', message });
}

function markSaved(message = 'Tersimpan') {
  if (savedResetTimer) {
    clearTimeout(savedResetTimer);
  }
  const now = new Date().toISOString();
  setSyncUiState({ kind: 'saved', message, lastSavedAt: now, lastSyncAt: now });
  savedResetTimer = setTimeout(() => {
    savedResetTimer = null;
    if (currentUiState.kind === 'saved') {
      setSyncUiState({ kind: 'idle', message: 'Tersinkron Otomatis' });
    }
  }, 3500);
}

function markSyncError(message: string) {
  if (savedResetTimer) {
    clearTimeout(savedResetTimer);
    savedResetTimer = null;
  }
  setSyncUiState({ kind: 'error', message });
}

function markOffline(message = 'Mode Offline — scan disimpan sementara') {
  if (savedResetTimer) {
    clearTimeout(savedResetTimer);
    savedResetTimer = null;
  }
  setSyncUiState({ kind: 'offline', message });
}

// ============================================================================
// URL & TOKEN CONFIG (TEMPPEL 1X, TERSIMPAN & TERKUNCI PERMANEN DI BROWSER/VERCEL)
// ============================================================================

export function getAppsScriptConfig(): AppsScriptConfig {
  const envUrl = String((import.meta as any).env?.VITE_APPS_SCRIPT_URL || '').trim();
  const envToken = String((import.meta as any).env?.VITE_APPS_SCRIPT_TOKEN || '').trim();

  try {
    const raw = localStorage.getItem(GAS_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppsScriptConfig>;
      const webAppUrl = String(parsed.webAppUrl || envUrl || '').trim();
      const apiToken = String(parsed.apiToken || envToken || '').trim();
      return {
        webAppUrl,
        apiToken,
        isLocked: Boolean(parsed.isLocked ?? (webAppUrl && apiToken)),
        updatedAt: parsed.updatedAt,
      };
    }
  } catch {
    // ignore parse failure
  }

  return {
    webAppUrl: envUrl,
    apiToken: envToken,
    isLocked: Boolean(envUrl && envToken),
  };
}

function clearNonSuperadminStoredSessions(): void {
  const clearIfNotSuperadmin = (store: Storage, key: string) => {
    try {
      const raw = store.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.role === 'superadmin' || parsed?.id === 'superadmin-local') return;
      store.removeItem(key);
    } catch {
      store.removeItem(key);
    }
  };
  clearIfNotSuperadmin(localStorage, 'kitarajin_session_user');
  if (typeof sessionStorage !== 'undefined') {
    clearIfNotSuperadmin(sessionStorage, 'kitarajin_tab_session_user');
  }
}

export function isAppsScriptConfigured(): boolean {
  const cfg = getAppsScriptConfig();
  return Boolean(cfg.webAppUrl && cfg.apiToken);
}

export function saveAppsScriptConfig(params: {
  webAppUrl: string;
  apiToken: string;
  isLocked?: boolean;
}): AppsScriptConfig {
  const prevCfg = getAppsScriptConfig();
  const cleanUrl = params.webAppUrl.trim();
  const cleanToken = params.apiToken.trim();
  const isDifferentUrl = Boolean(prevCfg.webAppUrl && prevCfg.webAppUrl !== cleanUrl);

  const next: AppsScriptConfig = {
    webAppUrl: cleanUrl,
    apiToken: cleanToken,
    isLocked: params.isLocked ?? Boolean(cleanUrl && cleanToken),
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(GAS_CONFIG_KEY, JSON.stringify(next));
  // Reset versi agar sinkron dua arah segera memuat seluruh data dari Sheet & Drive terbaru
  localStorage.removeItem(LAST_VERSION_KEY);
  localStorage.removeItem(HAS_SYNCED_SHEET_KEY);
  if (isDifferentUrl) {
    (Object.keys(TABLE_STORAGE_MAP) as AppsScriptTableName[]).forEach((tbl) => {
      if (tbl !== 'Settings') {
        localStorage.setItem(TABLE_STORAGE_MAP[tbl], JSON.stringify([]));
      }
    });
    clearNonSuperadminStoredSessions();
    drivePhotoCache.clear();
  }
  isPullInFlight = false;
  inFlightPullPromise = null;
  inFlightPullWasForced = false;
  inFlightPullWasDeep = false;
  hasDoneSessionDriveScan = false;
  consecutivePollFailures = 0;
  setSyncUiState({ isConfigured: Boolean(cleanUrl && cleanToken) });
  window.dispatchEvent(new CustomEvent('kitarajin_settings_updated'));
  if (cleanUrl && cleanToken) {
    pullChangesFromAppsScript(true, true).catch(() => {});
  }
  return next;
}

export function setAppsScriptConfigLocked(isLocked: boolean): AppsScriptConfig {
  const cur = getAppsScriptConfig();
  const next: AppsScriptConfig = {
    ...cur,
    isLocked,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(GAS_CONFIG_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('kitarajin_settings_updated'));
  return next;
}

export function clearAppsScriptConfig(): void {
  localStorage.removeItem(GAS_CONFIG_KEY);
  localStorage.removeItem(LAST_VERSION_KEY);
  localStorage.removeItem(HAS_SYNCED_SHEET_KEY);
  hasDoneSessionDriveScan = false;
  consecutivePollFailures = 0;
  drivePhotoCache.clear();
  setSyncUiState({ kind: 'idle', message: 'Belum dikonfigurasi', isConfigured: false });
  window.dispatchEvent(new CustomEvent('kitarajin_settings_updated'));
}

// ============================================================================
// LOW-LEVEL APPS SCRIPT FETCH (POST text/plain JSON & GET)
// ============================================================================

export async function postToAppsScript<T = any>(
  payload: Record<string, any>,
  timeoutMs = 30000
): Promise<T & { ok: boolean; error?: string; conflict?: boolean; serverRecord?: any }> {
  const cfg = getAppsScriptConfig();
  if (!cfg.webAppUrl || !cfg.apiToken) {
    return {
      ok: false,
      error: 'URL Web App atau Token Rahasia Apps Script belum dikonfigurasi.',
    } as any;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(cfg.webAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        token: cfg.apiToken,
        ...payload,
      }),
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    });

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return {
        ok: false,
        error: `Respons Apps Script bukan JSON valid (HTTP ${res.status}). Pastikan Web App di-deploy "Who has access: Anyone".`,
      } as any;
    }

    if (!res.ok || data?.ok === false) {
      return {
        ok: false,
        ...data,
        error: data?.error || `HTTP Error ${res.status}`,
      };
    }

    return data;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: 'Koneksi ke Apps Script melebihi batas waktu (timeout).' } as any;
    }
    return {
      ok: false,
      error: err?.message || 'Gagal menghubungi Google Apps Script.',
    } as any;
  } finally {
    clearTimeout(timer);
  }
}

export async function getFromAppsScript<T = any>(
  params: Record<string, string>,
  timeoutMs = 30000,
  retries = 1
): Promise<T & { ok: boolean; error?: string }> {
  const cfg = getAppsScriptConfig();
  if (!cfg.webAppUrl || !cfg.apiToken) {
    return {
      ok: false,
      error: 'URL Web App atau Token Rahasia Apps Script belum dikonfigurasi.',
    } as any;
  }

  let attempt = 0;
  while (attempt <= retries) {
    attempt++;
    const url = new URL(cfg.webAppUrl);
    url.searchParams.set('token', cfg.apiToken);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        signal: controller.signal,
      });
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        return {
          ok: false,
          error: `Respons GET Apps Script bukan JSON valid (HTTP ${res.status}).`,
        } as any;
      }
      if (!res.ok || data?.ok === false) {
        return { ok: false, ...data, error: data?.error || `HTTP ${res.status}` };
      }
      return data;
    } catch (err: any) {
      const isTimeoutOrNet = err?.name === 'AbortError' || err?.name === 'TypeError';
      if (attempt <= retries && isTimeoutOrNet && typeof navigator !== 'undefined' && navigator.onLine) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      if (err?.name === 'AbortError') {
        return { ok: false, error: 'Koneksi pembacaan Apps Script sedang sibuk. Mencoba menyinkronkan ulang otomatis.' } as any;
      }
      return { ok: false, error: err?.message || 'Gagal membaca data dari Apps Script.' } as any;
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, error: 'Gagal menghubungi Apps Script.' } as any;
}

// ============================================================================
// QUEUE PRESENSI OFFLINE & BATCH 3 DETIK PER PERANGKAT
// ============================================================================

export function getOfflineAttendanceQueue(): AttendanceRecord[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOfflineAttendanceQueue(items: AttendanceRecord[]): void {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
}

export function enqueueAttendanceScan(record: AttendanceRecord): void {
  const queue = getOfflineAttendanceQueue();
  // Hindari penumpukan duplikat persis sama di antrean perangkat
  const existsIdx = queue.findIndex(
    (q) =>
      q.userId === record.userId &&
      q.date === record.date &&
      q.type === record.type &&
      (q.sessionId || '') === (record.sessionId || '')
  );
  if (existsIdx === -1) {
    queue.push({ ...record, photoRef: '' });
  } else {
    queue[existsIdx] = { ...record, photoRef: '' };
  }
  saveOfflineAttendanceQueue(queue);

  if (!isAppsScriptConfigured()) {
    setSyncUiState({
      kind: 'idle',
      message: 'Tersimpan lokal (Apps Script belum ditautkan)',
    });
    return;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    markOffline(`Mode Offline (${queue.length} scan tersimpan sementara)`);
    return;
  }

  markSaving(`Mengirim batch presensi (${queue.length} scan)...`);

  // Aturan: scan beruntun dari satu perangkat dikirim batch tiap 3 detik
  if (!batchFlushTimer) {
    batchFlushTimer = setTimeout(() => {
      batchFlushTimer = null;
      flushAttendanceBatch().catch(() => {});
    }, 3000);
  }
}

export async function flushAttendanceBatch(): Promise<{
  ok: boolean;
  acceptedCount: number;
  rejectedReasons: string[];
}> {
  if (!isAppsScriptConfigured()) {
    return { ok: false, acceptedCount: 0, rejectedReasons: [] };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const q = getOfflineAttendanceQueue();
    if (q.length > 0) {
      markOffline(`Mode Offline (${q.length} scan tersimpan sementara)`);
    }
    return { ok: false, acceptedCount: 0, rejectedReasons: [] };
  }
  if (isFlushingBatch) {
    return { ok: true, acceptedCount: 0, rejectedReasons: [] };
  }

  const queue = getOfflineAttendanceQueue();
  if (queue.length === 0) {
    return { ok: true, acceptedCount: 0, rejectedReasons: [] };
  }

  isFlushingBatch = true;
  markSaving(`Menyimpan ${queue.length} presensi ke Sheets...`);

  try {
    const cleanItems = queue.map((item) => ({
      ...item,
      photoRef: '', // Pastikan presensi TIDAK mengirim foto
    }));

    const res = await postToAppsScript<{
      accepted?: AttendanceRecord[];
      rejected?: Array<{ clientId?: string; userId?: string; type?: string; sessionId?: string; reason: string }>;
      version?: string;
    }>({
      action: 'recordAttendanceBatch',
      items: cleanItems,
    });

    if (!res.ok) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        markOffline(`Mode Offline (${queue.length} scan tersimpan sementara)`);
      } else {
        markSyncError(res.error || 'Gagal mengirim batch presensi.');
      }
      return { ok: false, acceptedCount: 0, rejectedReasons: [] };
    }

    const accepted = Array.isArray(res.accepted) ? res.accepted : [];
    const rejected = Array.isArray(res.rejected) ? res.rejected : [];

    // Hapus item yang sudah diproses (diterima atau ditolak server) dari antrean lokal
    const sentIds = new Set(cleanItems.map((i) => i.id));
    const remainingQueue = getOfflineAttendanceQueue().filter((q) => !sentIds.has(q.id));
    saveOfflineAttendanceQueue(remainingQueue);

    // Sinkronkan kembali daftar Attendance di localStorage dengan hasil otoritatif dari server
    try {
      const rawAtt = localStorage.getItem(TABLE_STORAGE_MAP.Attendance);
      const localList: AttendanceRecord[] = rawAtt ? JSON.parse(rawAtt) : [];
      const acceptedById = new Map(accepted.map((a) => [a.id, { ...a, photoRef: '', syncState: 'synced' as const }]));
      const rejectedIds = new Set(rejected.map((r) => r.clientId).filter(Boolean) as string[]);

      const updatedList = localList
        .filter((rec) => !rejectedIds.has(rec.id))
        .map((rec) => acceptedById.get(rec.id) || rec);

      accepted.forEach((acc) => {
        if (!updatedList.some((r) => r.id === acc.id)) {
          updatedList.push({ ...acc, photoRef: '', syncState: 'synced' });
        }
      });

      localStorage.setItem(TABLE_STORAGE_MAP.Attendance, JSON.stringify(updatedList));
    } catch {
      // ignore storage merge error
    }

    if (res.version) {
      localStorage.setItem(LAST_VERSION_KEY, String(res.version));
    }

    const rejectedReasons = rejected.map((r) => r.reason).filter(Boolean);
    if (rejectedReasons.length > 0) {
      markSyncError(rejectedReasons[0]);
      window.dispatchEvent(
        new CustomEvent('kitarajin_attendance_batch_result', {
          detail: { accepted, rejected },
        })
      );
    } else if (remainingQueue.length > 0) {
      // Masih ada scan baru yang masuk selama proses batch
      batchFlushTimer = setTimeout(() => {
        batchFlushTimer = null;
        flushAttendanceBatch().catch(() => {});
      }, 3000);
      markSaving(`Mengirim sisa ${remainingQueue.length} scan...`);
    } else {
      markSaved('Tersimpan');
    }

    window.dispatchEvent(new CustomEvent('kitarajin_cloud_sync', { detail: { collection: 'attendance' } }));
    return { ok: true, acceptedCount: accepted.length, rejectedReasons };
  } finally {
    isFlushingBatch = false;
  }
}

// ============================================================================
// OPERASI TULIS CEPAT (<= 1.5s) DENGAN CONFLICT CHECK & SOFT DELETE
// ============================================================================

export async function syncCreateRow<T extends { id: string }>(
  table: AppsScriptTableName,
  record: T,
  actor?: ActorPayload,
  logDetails?: string
): Promise<{ ok: boolean; record?: T; error?: string }> {
  if (!isAppsScriptConfigured()) return { ok: true, record };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    markOffline('Offline — perubahan hanya di cache lokal');
    return { ok: false, error: 'Perangkat sedang offline.' };
  }

  markSaving('Menyimpan...');
  const res = await postToAppsScript<{ record?: T; version?: string }>({
    action: 'createRow',
    table,
    record,
    actor,
    logDetails,
  });

  if (!res.ok) {
    markSyncError(res.error || `Gagal menambah data ke ${table}.`);
    return { ok: false, error: res.error };
  }

  if (res.record) {
    updateLocalItemFromServer(table, res.record);
  }
  if (res.version) localStorage.setItem(LAST_VERSION_KEY, String(res.version));
  markSaved('Tersimpan');
  return { ok: true, record: res.record || record };
}

export async function syncUpdateRow<T extends Record<string, any> = Record<string, any>>(
  table: AppsScriptTableName,
  id: string,
  updates: Partial<T> | Record<string, any>,
  expectedUpdatedAt?: string,
  actor?: ActorPayload,
  logDetails?: string
): Promise<{ ok: boolean; record?: T; conflict?: boolean; error?: string }> {
  if (!isAppsScriptConfigured()) return { ok: true };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    markOffline('Offline — edit membutuhkan koneksi ke Apps Script');
    return { ok: false, error: 'Perangkat sedang offline.' };
  }

  markSaving('Menyimpan...');
  const res = await postToAppsScript<{ record?: T; conflict?: boolean; serverRecord?: T; version?: string }>({
    action: 'updateRow',
    table,
    id,
    updates,
    expectedUpdatedAt,
    actor,
    logDetails,
  });

  if (!res.ok) {
    markSyncError(res.error || `Gagal memperbarui ${table}.`);
    if (res.conflict) {
      // Muat ulang seluruh data agar pengguna langsung melihat versi terbaru dari server
      pullChangesFromAppsScript(true).catch(() => {});
    }
    return { ok: false, conflict: res.conflict, error: res.error };
  }

  if (res.record) {
    updateLocalItemFromServer(table, res.record);
  }
  if (res.version) localStorage.setItem(LAST_VERSION_KEY, String(res.version));
  markSaved('Tersimpan');
  return { ok: true, record: res.record };
}

export async function syncSoftDeleteRow(
  table: AppsScriptTableName,
  id: string,
  expectedUpdatedAt?: string,
  actor?: ActorPayload,
  logDetails?: string
): Promise<{ ok: boolean; conflict?: boolean; error?: string }> {
  if (!isAppsScriptConfigured()) return { ok: true };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    markOffline('Offline — hapus membutuhkan koneksi ke Apps Script');
    return { ok: false, error: 'Perangkat sedang offline.' };
  }

  markSaving('Menyimpan...');
  const res = await postToAppsScript<{ version?: string; conflict?: boolean }>({
    action: 'softDeleteRow',
    table,
    id,
    expectedUpdatedAt,
    actor,
    logDetails,
  });

  if (!res.ok) {
    markSyncError(res.error || `Gagal menghapus data di ${table}.`);
    if (res.conflict) {
      pullChangesFromAppsScript(true, true).catch(() => {});
    }
    return { ok: false, conflict: res.conflict, error: res.error };
  }

  removeLocalItem(table, id);
  if (res.version) localStorage.setItem(LAST_VERSION_KEY, String(res.version));
  markSaved('Tersimpan');
  return { ok: true };
}

export async function syncUpsertSettings(
  settings: AppSettings,
  expectedUpdatedAt?: string,
  actor?: ActorPayload,
  logDetails?: string
): Promise<{ ok: boolean; record?: AppSettings; error?: string }> {
  if (!isAppsScriptConfigured()) return { ok: true, record: settings };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    markOffline('Offline — pengaturan belum tersimpan ke Sheets');
    return { ok: false, error: 'Perangkat sedang offline.' };
  }

  markSaving('Menyimpan...');
  const res = await postToAppsScript<{ record?: AppSettings; version?: string }>({
    action: 'upsertSettings',
    record: { ...settings, id: 'global', storageMode: 'google_apps_script' },
    expectedUpdatedAt,
    actor,
    logDetails,
  });

  if (!res.ok) {
    markSyncError(res.error || 'Gagal menyimpan pengaturan ke Sheets.');
    return { ok: false, error: res.error };
  }

  if (res.record) {
    localStorage.setItem(TABLE_STORAGE_MAP.Settings, JSON.stringify(res.record));
  }
  if (res.version) localStorage.setItem(LAST_VERSION_KEY, String(res.version));
  markSaved('Tersimpan');
  return { ok: true, record: res.record || settings };
}

export async function syncSaveFace(
  item: FaceRegistryItem,
  photoBase64: string,
  expectedUpdatedAt?: string,
  actor?: ActorPayload
): Promise<{ ok: boolean; record?: FaceRegistryItem; error?: string }> {
  if (!isAppsScriptConfigured()) return { ok: true, record: item };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    markOffline('Offline — registrasi wajah butuh koneksi ke Drive');
    return { ok: false, error: 'Perangkat sedang offline.' };
  }

  markSaving('Menyimpan foto wajah ke Drive...');
  const res = await postToAppsScript<{ record?: FaceRegistryItem; version?: string }>(
    {
      action: 'saveFace',
      record: {
        ...item,
        registeredPhotoRef: undefined, // Jangan kirim data URL berulang ke kolom sheet
      },
      photoBase64,
      expectedUpdatedAt,
      actor,
    },
    35000
  );

  if (!res.ok) {
    markSyncError(res.error || 'Gagal menyimpan foto wajah ke Drive.');
    return { ok: false, error: res.error };
  }

  const savedRecord: FaceRegistryItem = {
    ...(res.record || item),
    registeredPhotoRef: photoBase64 || item.registeredPhotoRef || '',
  };

  if (savedRecord.registeredPhotoFileId && photoBase64) {
    drivePhotoCache.set(savedRecord.registeredPhotoFileId, photoBase64);
  }
  updateLocalItemFromServer('FaceRegistry', savedRecord);
  if (res.version) localStorage.setItem(LAST_VERSION_KEY, String(res.version));
  markSaved('Tersimpan');
  return { ok: true, record: savedRecord };
}

export async function syncSeedInitialIfEmpty(params: {
  users?: any[];
  schedules?: any[];
  departments?: any[];
  locations?: any[];
  faceRegistry?: any[];
  attendance?: any[];
  leaveRequests?: any[];
  assignments?: any[];
  settings?: any;
  actor?: ActorPayload;
}): Promise<boolean> {
  if (!isAppsScriptConfigured()) return false;
  if (isSeedingEmptySheet) return false;
  isSeedingEmptySheet = true;
  try {
    markSaving('Menyinkronkan data awal ke Sheets & Drive...');
    const res = await postToAppsScript(
      {
        action: 'seedInitialIfEmpty',
        users: params.users || [],
        schedules: params.schedules || [],
        departments: params.departments || [],
        locations: params.locations || [],
        faceRegistry: params.faceRegistry || [],
        attendance: params.attendance || [],
        leaveRequests: params.leaveRequests || [],
        assignments: params.assignments || [],
        settings: params.settings,
        actor: params.actor,
      },
      45000
    );
    if (res.ok) {
      localStorage.setItem(HAS_SYNCED_SHEET_KEY, '1');
      markSaved('Tersimpan');
      return true;
    }
    markSyncError(res.error || 'Gagal menyinkronkan data awal ke Sheets.');
    return false;
  } finally {
    isSeedingEmptySheet = false;
  }
}

export async function syncAppendLogOnly(
  actor: ActorPayload,
  logAction: string,
  targetEntity: string,
  targetId: string,
  details: string
): Promise<void> {
  if (!isAppsScriptConfigured()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  await postToAppsScript({
    action: 'appendLog',
    actor,
    logAction,
    targetEntity,
    targetId,
    details,
  }).catch(() => {});
}

// ============================================================================
// FETCH PRIVATE DRIVE PHOTO VIA AUTHORIZED APPS SCRIPT ENDPOINT
// ============================================================================

export async function fetchFacePhotoUrl(fileId?: string): Promise<string | null> {
  const cleanId = String(fileId || '').trim();
  if (!cleanId) return null;

  const cached = drivePhotoCache.get(cleanId);
  if (cached) return cached;

  if (!isAppsScriptConfigured()) return null;

  const existingPromise = inFlightPhotoFetch.get(cleanId);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    try {
      const res = await getFromAppsScript<{ dataUrl?: string }>({
        action: 'getPhoto',
        fileId: cleanId,
      });
      if (res.ok && res.dataUrl) {
        drivePhotoCache.set(cleanId, res.dataUrl);
        return res.dataUrl;
      }
      return null;
    } finally {
      inFlightPhotoFetch.delete(cleanId);
    }
  })();

  inFlightPhotoFetch.set(cleanId, promise);
  return promise;
}

// ============================================================================
// SINKRONISASI DUA ARAH & AUTO-RELOAD MULTI-PENGGUNA
// ============================================================================

function updateLocalItemFromServer(table: AppsScriptTableName, serverRecord: any): void {
  if (table === 'Settings') {
    localStorage.setItem(TABLE_STORAGE_MAP.Settings, JSON.stringify(serverRecord));
    window.dispatchEvent(new CustomEvent('kitarajin_settings_updated'));
    return;
  }
  const key = TABLE_STORAGE_MAP[table];
  if (!key) return;
  try {
    const raw = localStorage.getItem(key);
    const list: any[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((item) => item.id === serverRecord.id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...serverRecord };
    } else {
      list.push(serverRecord);
    }
    localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('kitarajin_cloud_sync', { detail: { collection: table.toLowerCase() } }));
  } catch {
    // ignore storage errors
  }
}

function removeLocalItem(table: AppsScriptTableName, id: string): void {
  const key = TABLE_STORAGE_MAP[table];
  if (!key || table === 'Settings') return;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const list: any[] = JSON.parse(raw);
    if (!Array.isArray(list)) return;
    const filtered = list.filter((item) => item && item.id !== id);
    localStorage.setItem(key, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent('kitarajin_cloud_sync', { detail: { collection: table.toLowerCase() } }));
  } catch {
    // ignore storage errors
  }
}

const DEMO_EMAILS = new Set([
  'kepsek@sekolah.sch.id',
  'admin.fauzi@sekolah.sch.id',
  'siti.rahma@sekolah.sch.id',
]);
const DEMO_USERNAMES = new Set(['kepsek', 'adminfauzi', 'sitirahma']);
const cleanedDemoSheetIds = new Set<string>();

function isDemoUserRecord(row: any): boolean {
  if (!row || !row.id) return false;
  const id = String(row.id).trim();
  if (id !== 'usr-ks-01' && id !== 'usr-adm-01' && id !== 'usr-stf-01') return false;
  const email = String(row.email || '').trim().toLowerCase();
  const username = String(row.username || '').trim().toLowerCase();
  return DEMO_EMAILS.has(email) || DEMO_USERNAMES.has(username) || !email;
}

function mergeDownloadedTablesToLocalStorage(
  tables: Record<string, any[]>,
  sheetTotalRows?: Record<string, number>
): void {
  const incomingUsers = Array.isArray(tables.Users) ? tables.Users : [];
  const sheetUsersRows = sheetTotalRows?.Users ?? incomingUsers.length;
  if (sheetUsersRows > 0 || incomingUsers.length > 0) {
    localStorage.setItem(HAS_SYNCED_SHEET_KEY, '1');
  }

  const names = Object.keys(TABLE_STORAGE_MAP) as AppsScriptTableName[];
  const realIncomingUsers = incomingUsers.filter((u) => u && u.id && !isDemoUserRecord(u));
  const actorForCleanup: ActorPayload = realIncomingUsers[0]
    ? {
        id: String(realIncomingUsers[0].id),
        name: String(realIncomingUsers[0].name || 'Sistem'),
        role: String(realIncomingUsers[0].role || 'kepala_sekolah'),
      }
    : { id: 'system', name: 'Sistem', role: 'kepala_sekolah' };

  names.forEach((table) => {
    const storageKey = TABLE_STORAGE_MAP[table];
    const rawIncoming = Array.isArray(tables[table]) ? tables[table] : [];
    const seenIds = new Set<string>();
    const incoming = rawIncoming.filter((row: any) => {
      if (!row || !row.id) return false;
      const key = String(row.id);
      if (seenIds.has(key)) return false;
      seenIds.add(key);
      return true;
    });

    if (table === 'Users') {
      const demoInSheet = incoming.filter((u) => isDemoUserRecord(u));
      if (demoInSheet.length > 0) {
        demoInSheet.forEach((demoRow) => {
          if (!cleanedDemoSheetIds.has(demoRow.id)) {
            cleanedDemoSheetIds.add(demoRow.id);
            syncSoftDeleteRow(
              'Users',
              String(demoRow.id),
              demoRow.diubah_pada,
              actorForCleanup,
              `Menghapus otomatis akun demo bawaan (${demoRow.name || demoRow.id})`
            ).catch(() => {});
          }
        });
      }
      const cleanUsers = incoming.filter((u) => !isDemoUserRecord(u));
      localStorage.setItem(storageKey, JSON.stringify(cleanUsers));

      const validateStoredSession = (store: Storage, key: string) => {
        try {
          const rawSess = store.getItem(key);
          if (!rawSess) return;
          const sess = JSON.parse(rawSess);
          if (sess?.role === 'superadmin' || sess?.id === 'superadmin-local') {
            return;
          }
          if (!sess?.id || isDemoUserRecord(sess) || !cleanUsers.some((u) => u.id === sess.id)) {
            store.removeItem(key);
          }
        } catch {
          // ignore session parse errors
        }
      };

      validateStoredSession(localStorage, 'kitarajin_session_user');
      if (typeof sessionStorage !== 'undefined') {
        validateStoredSession(sessionStorage, 'kitarajin_tab_session_user');
      }
      return;
    }

    if (table === 'Settings') {
      if (incoming.length > 0) {
        const globalRow = incoming.find((r) => r.id === 'global') || incoming[0];
        let existingLocal: any = {};
        try {
          existingLocal = JSON.parse(localStorage.getItem(storageKey) || '{}');
        } catch {
          existingLocal = {};
        }
        const mergedSettings = {
          ...existingLocal,
          ...globalRow,
          storageMode: 'google_apps_script',
        };
        localStorage.setItem(storageKey, JSON.stringify(mergedSettings));
        window.dispatchEvent(new CustomEvent('kitarajin_settings_updated'));
      }
      return;
    }

    if (table === 'FaceRegistry') {
      let existingFaces: FaceRegistryItem[] = [];
      try {
        existingFaces = JSON.parse(localStorage.getItem(storageKey) || '[]');
      } catch {
        existingFaces = [];
      }
      const existingById = new Map(existingFaces.map((f) => [f.id, f]));
      const mergedFaces = incoming.map((row: FaceRegistryItem) => {
        const prev = existingById.get(row.id);
        const sameFile =
          prev &&
          prev.registeredPhotoFileId &&
          row.registeredPhotoFileId &&
          prev.registeredPhotoFileId === row.registeredPhotoFileId;
        const cachedPhoto = row.registeredPhotoFileId
          ? drivePhotoCache.get(row.registeredPhotoFileId)
          : undefined;
        return {
          ...row,
          registeredPhotoRef:
            cachedPhoto || (sameFile && prev?.registeredPhotoRef) || row.registeredPhotoRef || '',
        };
      });
      localStorage.setItem(storageKey, JSON.stringify(mergedFaces));
      return;
    }

    if (table === 'Attendance') {
      // Hapus record demo (att-seed-*) dan pertahankan antrean presensi lokal yang belum terkirim ke server
      const pendingQueue = getOfflineAttendanceQueue();
      const nonDemoIncoming = incoming.filter((r: AttendanceRecord) => !String(r.id).startsWith('att-seed-'));
      const serverIds = new Set(nonDemoIncoming.map((r: AttendanceRecord) => r.id));
      const serverDupKeys = new Set(
        nonDemoIncoming.map((r: AttendanceRecord) => `${r.userId}|${r.date}|${r.type}|${r.sessionId || 'default'}`)
      );

      const syncedServerRows: AttendanceRecord[] = nonDemoIncoming.map((r: AttendanceRecord) => ({
        ...r,
        photoRef: '',
        syncState: 'synced',
      }));

      const preservedQueued = pendingQueue
        .filter((q) => {
          const dk = `${q.userId}|${q.date}|${q.type}|${q.sessionId || 'default'}`;
          return !serverIds.has(q.id) && !serverDupKeys.has(dk);
        })
        .map((q) => ({
          ...q,
          photoRef: '',
          syncState: (typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'queued') as 'offline' | 'queued',
        }));

      localStorage.setItem(storageKey, JSON.stringify([...syncedServerRows, ...preservedQueued]));
      return;
    }

    if (table === 'Log') {
      // Urutkan Log terbaru di atas agar kompatibel dengan UI AuditLogManager
      const sortedLogs: AuditLog[] = [...incoming].sort(
        (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
      );
      localStorage.setItem(storageKey, JSON.stringify(sortedLogs));
      return;
    }

    localStorage.setItem(storageKey, JSON.stringify(incoming));
  });
}

export async function pullChangesFromAppsScript(forceFull = false, deepCheck = false): Promise<boolean> {
  if (!isAppsScriptConfigured()) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  if (isPullInFlight && inFlightPullPromise) {
    const coveredForce = !forceFull || inFlightPullWasForced;
    const coveredDeep = !deepCheck || inFlightPullWasDeep;
    if (coveredForce && coveredDeep) {
      return inFlightPullPromise;
    }
    await inFlightPullPromise.catch(() => false);
  }

  isPullInFlight = true;
  inFlightPullWasForced = forceFull;
  inFlightPullWasDeep = deepCheck;
  const runPull = async (): Promise<boolean> => {
    try {
      const sinceVersion = forceFull ? '' : localStorage.getItem(LAST_VERSION_KEY) || '';
      const shouldScanDrive = forceFull && !hasDoneSessionDriveScan;
      const queryParams: Record<string, string> = {
        action: forceFull ? 'getAll' : 'getChanges',
        sinceVersion,
      };
      if (deepCheck) {
        queryParams.deep = '1';
      }
      if (shouldScanDrive) {
        queryParams.scanDrive = '1';
      }

      const timeoutMs = forceFull ? 35000 : deepCheck ? 25000 : 18000;
      let res = await getFromAppsScript<{
        unchanged?: boolean;
        version?: string;
        serverTime?: string;
        tables?: Record<string, any[]>;
        sheetTotalRows?: Record<string, number>;
      }>(queryParams, timeoutMs, 1);

      // Fallback aman: jika scanDrive=1 lambat/gagal, langsung muat Sheets saja tanpa menunggu Drive scan
      if (!res.ok && shouldScanDrive) {
        res = await getFromAppsScript(
          deepCheck ? { action: 'getAll', sinceVersion: '', deep: '1' } : { action: 'getAll', sinceVersion: '' },
          30000,
          0
        );
      }

      if (!res.ok) {
        consecutivePollFailures++;
        const isAuthErr = String(res.error || '').toLowerCase().includes('token') || String(res.error || '').includes('401');
        if ((forceFull || isAuthErr || consecutivePollFailures >= 3) && currentUiState.kind !== 'saving') {
          markSyncError(res.error || 'Gagal menyinkronkan data dari Apps Script.');
        }
        return false;
      }

      consecutivePollFailures = 0;
      if (shouldScanDrive) {
        hasDoneSessionDriveScan = true;
      }

      const now = new Date().toISOString();
      if (!res.unchanged && res.tables) {
        mergeDownloadedTablesToLocalStorage(res.tables, res.sheetTotalRows);
        if (res.version) {
          localStorage.setItem(LAST_VERSION_KEY, String(res.version));
        }
        window.dispatchEvent(new CustomEvent('kitarajin_cloud_sync', { detail: { collection: 'all' } }));
      } else if (res.version) {
        localStorage.setItem(LAST_VERSION_KEY, String(res.version));
      }

      if (currentUiState.kind === 'error' || currentUiState.kind === 'offline') {
        setSyncUiState({
          kind: 'idle',
          message: 'Tersinkron Otomatis',
          lastSyncAt: now,
          version: res.version,
        });
      } else {
        setSyncUiState({
          lastSyncAt: now,
          version: res.version,
        });
      }

      return true;
    } finally {
      isPullInFlight = false;
      inFlightPullPromise = null;
      inFlightPullWasForced = false;
      inFlightPullWasDeep = false;
    }
  };

  inFlightPullPromise = runPull();
  return inFlightPullPromise;
}

export function startAppsScriptRealtimeSync(onDataUpdated?: (col?: string) => void): () => void {
  if (isRealtimeStarted) {
    return () => {};
  }
  isRealtimeStarted = true;
  let stopped = false;
  let pollCount = 0;

  const scheduleNextPoll = (delayMs = 900) => {
    if (stopped) return;
    if (realtimeLoopTimer) clearTimeout(realtimeLoopTimer);
    realtimeLoopTimer = setTimeout(async () => {
      if (stopped) return;
      if (document.visibilityState !== 'hidden' && isAppsScriptConfigured() && navigator.onLine) {
        pollCount++;
        // Poll super cepat tiap ~0.9s (via CacheService <100ms), dan deep check tiap ~11s untuk edit manual langsung di Google Sheets
        await pullChangesFromAppsScript(false, pollCount % 12 === 0).catch(() => {});
      }
      scheduleNextPoll(900);
    }, delayMs);
  };

  // Sinkron penuh super cepat saat aplikasi dibuka (menggunakan CacheService jika segar)
  if (isAppsScriptConfigured()) {
    setSyncUiState({ isPolling: true });
    pullChangesFromAppsScript(true, false).catch(() => {});
    flushAttendanceBatch().catch(() => {});
  }
  scheduleNextPoll(900);

  const handleResumeAndPull = () => {
    if (stopped) return;
    if (document.visibilityState === 'hidden') return;
    if (isAppsScriptConfigured() && navigator.onLine) {
      flushAttendanceBatch().catch(() => {});
      pullChangesFromAppsScript(false, false).catch(() => {});
    }
  };

  const handleOnline = () => {
    if (stopped) return;
    if (isAppsScriptConfigured()) {
      flushAttendanceBatch().catch(() => {});
      pullChangesFromAppsScript(true, false).catch(() => {});
    }
  };

  const handleOffline = () => {
    const q = getOfflineAttendanceQueue();
    markOffline(
      q.length > 0
        ? `Mode Offline (${q.length} scan menunggu koneksi)`
        : 'Mode Offline — presensi disimpan sementara'
    );
  };

  const handleCloudSync = (ev: Event) => {
    const col = (ev as CustomEvent)?.detail?.collection as string | undefined;
    if (onDataUpdated) onDataUpdated(col);
  };

  document.addEventListener('visibilitychange', handleResumeAndPull);
  window.addEventListener('focus', handleResumeAndPull);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('kitarajin_cloud_sync', handleCloudSync);

  return () => {
    stopped = true;
    isRealtimeStarted = false;
    if (realtimeLoopTimer) {
      clearTimeout(realtimeLoopTimer);
      realtimeLoopTimer = null;
    }
    setSyncUiState({ isPolling: false });
    document.removeEventListener('visibilitychange', handleResumeAndPull);
    window.removeEventListener('focus', handleResumeAndPull);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('kitarajin_cloud_sync', handleCloudSync);
  };
}

// ============================================================================
// CEK SISTEM (MENGUJI SHEETS & DRIVE + MENAMPILKAN FIELD YANG KOSONG SAJA)
// ============================================================================

export async function runSystemCheck(): Promise<SystemCheckResult> {
  const cfg = getAppsScriptConfig();
  const missingFrontendFields: string[] = [];
  if (!cfg.webAppUrl) missingFrontendFields.push('URL Web App Google Apps Script');
  if (!cfg.apiToken) missingFrontendFields.push('API Token Rahasia');

  const checkedAt = new Date().toISOString();

  if (!cfg.webAppUrl || !cfg.apiToken) {
    return {
      checkedAt,
      latencyMs: 0,
      frontendConfigured: false,
      frontendUrlPresent: Boolean(cfg.webAppUrl),
      frontendTokenPresent: Boolean(cfg.apiToken),
      scriptReachable: false,
      authorized: false,
      sheetsConnected: false,
      driveConnected: false,
      missingFrontendFields,
      missingScriptProperties: [],
      error: 'Konfigurasi frontend belum lengkap. Isi field yang masih kosong di menu Pengaturan & Sheets.',
    };
  }

  const t0 = performance.now();
  const res = await getFromAppsScript<{
    authorized?: boolean;
    sheetsConnected?: boolean;
    driveConnected?: boolean;
    sheetName?: string;
    spreadsheetId?: string;
    driveFolderName?: string;
    tabsStatus?: Array<{ name: string; exists: boolean; rows: number }>;
    syncIssues?: string[];
    missingScriptProperties?: string[];
    serverTime?: string;
  }>({ action: 'checkSystem' }, 30000, 1);
  const latencyMs = Math.round(performance.now() - t0);

  if (!res.ok) {
    const isAuthError = String(res.error || '').toLowerCase().includes('token') || String(res.error || '').includes('401');
    return {
      checkedAt,
      latencyMs,
      frontendConfigured: true,
      frontendUrlPresent: true,
      frontendTokenPresent: true,
      scriptReachable: true,
      authorized: !isAuthError,
      sheetsConnected: false,
      driveConnected: false,
      missingFrontendFields: [],
      missingScriptProperties: [],
      error: res.error,
    };
  }

  return {
    checkedAt,
    latencyMs,
    frontendConfigured: true,
    frontendUrlPresent: true,
    frontendTokenPresent: true,
    scriptReachable: true,
    authorized: Boolean(res.authorized),
    sheetsConnected: Boolean(res.sheetsConnected),
    driveConnected: Boolean(res.driveConnected),
    sheetName: res.sheetName,
    spreadsheetId: res.spreadsheetId,
    driveFolderName: res.driveFolderName,
    tabsStatus: res.tabsStatus || [],
    syncIssues: res.syncIssues || [],
    missingFrontendFields: [],
    missingScriptProperties: res.missingScriptProperties || [],
    serverTime: res.serverTime,
    error: res.error,
  };
}

export async function repairSheetSync(
  actor?: ActorPayload
): Promise<{ ok: boolean; report?: SheetRepairReport; error?: string }> {
  if (!isAppsScriptConfigured()) {
    return { ok: false, error: 'URL Web App dan API Token Apps Script belum diisi.' };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, error: 'Perangkat sedang offline.' };
  }

  markSaving('Memeriksa & memperbaiki struktur Sheet...');
  const res = await postToAppsScript<{
    report?: SheetRepairReport;
    tables?: Record<string, any[]>;
    sheetTotalRows?: Record<string, number>;
    version?: string;
  }>(
    {
      action: 'repairSheetSync',
      actor,
    },
    45000
  );

  if (!res.ok) {
    const rawErr = String(res.error || '');
    const isOldDeployment = rawErr.includes('tidak dikenali');
    const finalMsg = isOldDeployment
      ? 'Apps Script Web App Anda masih memakai versi lama. Salin ulang Code.gs terbaru dari menu Pengaturan & Sheets lalu Deploy -> Manage deployments -> Edit -> New version.'
      : rawErr || 'Gagal memperbaiki ketidaksinkronan Sheet.';
    markSyncError(finalMsg);
    return { ok: false, error: finalMsg };
  }

  if (res.tables) {
    mergeDownloadedTablesToLocalStorage(res.tables, res.sheetTotalRows);
  }
  if (res.version) {
    localStorage.setItem(LAST_VERSION_KEY, String(res.version));
  }
  localStorage.setItem(HAS_SYNCED_SHEET_KEY, '1');
  hasDoneSessionDriveScan = true;
  window.dispatchEvent(new CustomEvent('kitarajin_cloud_sync', { detail: { collection: 'all' } }));
  markSaved('Sheet diperbaiki & tersinkron');

  return {
    ok: true,
    report: res.report,
  };
}

export async function updateSheetBinding(
  spreadsheetId: string,
  actor?: ActorPayload
): Promise<{ ok: boolean; spreadsheetId?: string; sheetName?: string; error?: string }> {
  if (!isAppsScriptConfigured()) {
    return { ok: false, error: 'URL Web App dan API Token Apps Script belum diisi.' };
  }
  const cleanId = String(spreadsheetId || '').trim();
  if (!cleanId) {
    return { ok: false, error: 'ID Spreadsheet tidak boleh kosong.' };
  }

  markSaving('Menautkan ID Spreadsheet baru...');
  const res = await postToAppsScript<{
    spreadsheetId?: string;
    sheetName?: string;
    version?: string;
  }>(
    {
      action: 'updateSheetBinding',
      spreadsheetId: cleanId,
      actor,
    },
    30000
  );

  if (!res.ok) {
    const rawErr = String(res.error || '');
    const isOldDeployment = rawErr.includes('tidak dikenali');
    const finalMsg = isOldDeployment
      ? 'Apps Script Web App Anda masih memakai versi lama. Salin ulang Code.gs terbaru dari menu Pengaturan & Sheets lalu Deploy -> Manage deployments -> Edit -> New version.'
      : rawErr || 'Gagal menautkan ID Spreadsheet.';
    markSyncError(finalMsg);
    return { ok: false, error: finalMsg };
  }

  // Bersihkan cache tabel lama agar data dari Spreadsheet baru langsung dimuat penuh
  (Object.keys(TABLE_STORAGE_MAP) as AppsScriptTableName[]).forEach((tbl) => {
    if (tbl !== 'Settings') {
      localStorage.setItem(TABLE_STORAGE_MAP[tbl], JSON.stringify([]));
    }
  });
  localStorage.removeItem(LAST_VERSION_KEY);
  localStorage.removeItem(HAS_SYNCED_SHEET_KEY);
  clearNonSuperadminStoredSessions();
  hasDoneSessionDriveScan = false;
  drivePhotoCache.clear();

  await pullChangesFromAppsScript(true, true).catch(() => false);
  markSaved('ID Sheet diperbarui');
  return {
    ok: true,
    spreadsheetId: res.spreadsheetId,
    sheetName: res.sheetName,
  };
}
