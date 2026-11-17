/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocFromServer,
  getDocs,
  Firestore,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Inisialisasi Firebase App & Firestore Database (Force Long-Polling agar stabil di iframe/proxy & jaringan seluler)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        ignoreUndefinedProperties: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          experimentalForceLongPolling: true,
          ignoreUndefinedProperties: true,
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
}

export const db: Firestore = createFirestoreInstance();
const auth = getAuth(app);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
}

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Koleksi sinkronisasi 10 tabel KITARAJIN
export const SYNC_COLLECTIONS = {
  USERS: 'users',
  DEPARTMENTS: 'departments',
  SCHEDULES: 'schedules',
  LOCATIONS: 'locations',
  FACE_REGISTRY: 'faceRegistry',
  ATTENDANCE: 'attendance',
  LEAVE_REQUESTS: 'leaveRequests',
  ASSIGNMENTS: 'assignments',
  AUDIT_LOGS: 'auditLogs',
  SETTINGS: 'settings',
} as const;

export const LOCAL_STORAGE_KEYS: Record<string, string> = {
  users: 'kitarajin_table_users',
  departments: 'kitarajin_table_departments',
  schedules: 'kitarajin_table_schedules',
  locations: 'kitarajin_table_locations',
  faceRegistry: 'kitarajin_table_face_registry',
  attendance: 'kitarajin_table_attendance',
  leaveRequests: 'kitarajin_table_leave_requests',
  assignments: 'kitarajin_table_assignments',
  auditLogs: 'kitarajin_table_audit_logs',
  settings: 'kitarajin_table_settings',
};

const CLOUD_OUTBOX_KEY = 'kitarajin_cloud_outbox';

interface OutboxEntry {
  op: 'set' | 'delete';
  col: string;
  id: string;
  data?: Record<string, any>;
  queuedAt: string;
}

let isSyncInitialized = false;
let activeUnsubscribes: Unsubscribe[] = [];
let cloudConnectionActive = false;
let lastSyncTime: string = new Date().toISOString();
let isAutoSyncRunning = false;

export const SEED_BASELINE_ISO = '2020-01-01T00:00:00.000Z';
export const SEED_BASELINE_MS = Date.parse(SEED_BASELINE_ISO);

function loadOutbox(): OutboxEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CLOUD_OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOutbox(entries: OutboxEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (entries.length === 0) {
      localStorage.removeItem(CLOUD_OUTBOX_KEY);
    } else {
      localStorage.setItem(CLOUD_OUTBOX_KEY, JSON.stringify(entries.slice(-300)));
    }
  } catch {
    // ignore quota errors
  }
}

function enqueueOutbox(entry: OutboxEntry): void {
  const list = loadOutbox().filter((e) => !(e.col === entry.col && e.id === entry.id));
  list.push(entry);
  saveOutbox(list);
}

function removeFromOutbox(col: string, id: string): void {
  const current = loadOutbox();
  const next = current.filter((e) => !(e.col === col && e.id === id));
  if (next.length !== current.length) {
    saveOutbox(next);
  }
}

function syncPendingWorkspaceFlagFromSettings(settingsObj: any): void {
  if (!settingsObj || typeof window === 'undefined') return;
  const syncedMs = Date.parse(settingsObj.lastWorkspaceUserSyncAt || '') || 0;
  const mutatedMs = Date.parse(settingsObj.lastUserMutationAt || '') || 0;
  if (syncedMs > 0 && syncedMs >= mutatedMs) {
    const localPendingStr = localStorage.getItem('kitarajin_pending_workspace_users_sync');
    const localPendingMs = Date.parse(localPendingStr || '') || 0;
    if (!localPendingStr || syncedMs >= localPendingMs) {
      localStorage.removeItem('kitarajin_pending_workspace_users_sync');
    }
    window.dispatchEvent(
      new CustomEvent('kitarajin_workspace_sync', {
        detail: { pending: false, lastSync: settingsObj.lastWorkspaceUserSyncAt },
      })
    );
  }
}

function parseUserTimestampMs(raw: any): number {
  if (!raw) return 0;
  if (typeof raw === 'number' && !isNaN(raw)) return raw;
  const str = String(raw).trim();
  if (!str) return 0;
  const direct = Date.parse(str);
  if (!isNaN(direct)) return direct;
  // Dukungan format tanggal DD/MM/YYYY [HH:mm[:ss]] bila pernah terformat oleh Google Sheets
  const idMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (idMatch) {
    const [, d, m, y, hh = '0', mm = '0', ss = '0'] = idMatch;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

function syncCurrentSessionUserFromList(usersList: any[]): void {
  if (typeof window === 'undefined' || !Array.isArray(usersList) || usersList.length === 0) return;
  try {
    const rawSession = localStorage.getItem('kitarajin_session_user');
    if (!rawSession) return;
    const parsed = JSON.parse(rawSession);
    if (!parsed || !parsed.id) return;
    const freshUser = usersList.find((u: any) => u && String(u.id) === String(parsed.id));
    if (freshUser) {
      const { passwordHash, ...safeUser } = freshUser;
      localStorage.setItem('kitarajin_session_user', JSON.stringify(safeUser));
    }
  } catch {
    // ignore
  }
}

/**
 * Gabungkan data array pengguna tanpa pernah menghapus username/password yang sudah ditambahkan
 * serta memastikan akun seed awal (2020) TIDAK PERNAH menimpa akun yang sudah diubah di cloud!
 */
export function mergeUserRecordsNonDestructive(
  localUsers: any[],
  remoteUsers: any[]
): { merged: any[]; toUpload: any[] } {
  const byId = new Map<string, any>();
  const toUpload: any[] = [];

  const getUpdatedMs = (u: any): number => {
    return parseUserTimestampMs(u?.updatedAt) || parseUserTimestampMs(u?.createdAt);
  };

  for (const r of remoteUsers) {
    if (r && r.id) {
      byId.set(String(r.id), r);
    }
  }

  for (const l of localUsers) {
    if (!l || !l.id) continue;
    const id = String(l.id);
    const existingRemote = byId.get(id);
    const localMs = getUpdatedMs(l);
    const isLocalBaselineSeed = localMs <= SEED_BASELINE_MS || Boolean(l.isSeedDefault);

    if (!existingRemote) {
      // Cek apakah ada username identik dengan ID berbeda (hindari duplikat username)
      const uname = String(l.username || '').trim().toLowerCase();
      let matchedKey: string | null = null;
      if (uname) {
        for (const [k, v] of byId.entries()) {
          if (String(v.username || '').trim().toLowerCase() === uname) {
            matchedKey = k;
            break;
          }
        }
      }

      if (matchedKey) {
        const remoteByName = byId.get(matchedKey);
        const remoteMs = getUpdatedMs(remoteByName);
        const localNewer = !isLocalBaselineSeed && localMs >= remoteMs;
        const winnerSource = localNewer ? l : remoteByName;
        const loserSource = localNewer ? remoteByName : l;
        const winner: any = {
          ...loserSource,
          ...winnerSource,
          id: matchedKey,
          email: winnerSource.email,
          phone: winnerSource.phone,
          departmentId: winnerSource.departmentId ?? loserSource.departmentId ?? '',
          departmentName: winnerSource.departmentName ?? loserSource.departmentName ?? '',
        };
        if ('isSeedDefault' in winner && (winnerMsCheck(winner) > SEED_BASELINE_MS)) {
          delete winner.isSeedDefault;
        }
        if (!winner.savedPassword) {
          winner.savedPassword = l.savedPassword || remoteByName.savedPassword;
        }
        if (!winner.passwordHash) {
          winner.passwordHash = l.passwordHash || remoteByName.passwordHash;
        }
        byId.set(matchedKey, winner);
        if (localNewer || (!isLocalBaselineSeed && !remoteByName.savedPassword && winner.savedPassword)) {
          toUpload.push(winner);
        }
      } else {
        // Akun baru lokal yang belum ada di remote -> PERTAHANKAN dan upload ke cloud!
        byId.set(id, l);
        toUpload.push(l);
      }
    } else {
      const remoteMs = getUpdatedMs(existingRemote);
      const isRemoteBaselineSeed = remoteMs <= SEED_BASELINE_MS || Boolean(existingRemote.isSeedDefault);
      const localNewer =
        !isLocalBaselineSeed && (isRemoteBaselineSeed || localMs > remoteMs);
      const winnerSource = localNewer ? l : existingRemote;
      const loserSource = localNewer ? existingRemote : l;

      const mergedUser: any = {
        ...loserSource,
        ...winnerSource,
        email: winnerSource.email,
        phone: winnerSource.phone,
        departmentId: winnerSource.departmentId ?? '',
        departmentName: winnerSource.departmentName ?? winnerSource.departmentId ?? '',
      };

      if (getUpdatedMs(winnerSource) > SEED_BASELINE_MS && 'isSeedDefault' in mergedUser) {
        delete mergedUser.isSeedDefault;
      }

      // Jangan pernah hilangkan savedPassword jika salah satu sisi memilikinya dan hash cocok
      const sameHash =
        !l.passwordHash ||
        !existingRemote.passwordHash ||
        l.passwordHash === existingRemote.passwordHash;
      if (!mergedUser.savedPassword && sameHash) {
        mergedUser.savedPassword = l.savedPassword || existingRemote.savedPassword;
      }

      byId.set(id, mergedUser);

      // Hanya upload ke cloud bila lokal benar-benar lebih baru atau melengkapi savedPassword tanpa menimpa perubahan remote
      if (
        localNewer ||
        (!isLocalBaselineSeed && mergedUser.savedPassword && !existingRemote.savedPassword && sameHash)
      ) {
        toUpload.push(mergedUser);
      }
    }
  }

  return {
    merged: Array.from(byId.values()),
    toUpload,
  };
}

function winnerMsCheck(u: any): number {
  return parseUserTimestampMs(u?.updatedAt) || parseUserTimestampMs(u?.createdAt);
}

/**
 * Validasi koneksi ke server Firestore (sesuai spesifikasi Firebase Skill)
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    cloudConnectionActive = true;
    return true;
  } catch (error: any) {
    const code = String(error?.code || '').toLowerCase();
    const msg = String(error?.message || '').toLowerCase();
    if (code.includes('unavailable') || msg.includes('the client is offline') || msg.includes('unavailable')) {
      console.warn('Firestore sementara offline / tidak terjangkau, fallback ke cache lokal.');
      cloudConnectionActive = false;
      return false;
    }
    // Jika dokumen test belum ada, koneksi server tetap aktif jika tidak melempar 'offline/unavailable'
    cloudConnectionActive = true;
    return true;
  }
}

/**
 * Tarik & gabungkan data users terbaru dari Firestore (dipakai saat login / sinkronisasi)
 */
export async function pullUsersFromCloudAndMerge(): Promise<any[]> {
  try {
    const snapshot = await getDocs(collection(db, SYNC_COLLECTIONS.USERS));
    const remoteUsers = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    const localStr = localStorage.getItem(LOCAL_STORAGE_KEYS.users);
    const localUsers = localStr ? JSON.parse(localStr) : [];

    const { merged, toUpload } = mergeUserRecordsNonDestructive(
      Array.isArray(localUsers) ? localUsers : [],
      remoteUsers
    );

    if (merged.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.users, JSON.stringify(merged));
      syncCurrentSessionUserFromList(merged);
    }

    for (const u of toUpload) {
      syncRecordToCloud(SYNC_COLLECTIONS.USERS, String(u.id), u).catch(() => {});
    }

    return merged;
  } catch (err: any) {
    console.warn('pullUsersFromCloudAndMerge note:', err?.message || err);
    const localStr = localStorage.getItem(LOCAL_STORAGE_KEYS.users);
    return localStr ? JSON.parse(localStr) : [];
  }
}

function mergeRemoteWithPendingOutbox(colName: string, remoteItems: any[]): any[] {
  const pending = loadOutbox().filter((e) => e.col === colName);
  if (pending.length === 0) return remoteItems;

  const byId = new Map<string, any>();
  for (const item of remoteItems) {
    if (item && item.id) {
      byId.set(String(item.id), item);
    }
  }
  for (const entry of pending) {
    if (entry.op === 'delete') {
      byId.delete(entry.id);
    } else if (entry.op === 'set' && entry.data) {
      const prev = byId.get(entry.id) || {};
      byId.set(entry.id, { ...prev, ...entry.data, id: entry.id });
    }
  }
  return Array.from(byId.values());
}

function mergeSettingsDocuments(localSettings: any, remoteSettings: any): any {
  if (!remoteSettings) return localSettings;
  if (!localSettings) return remoteSettings;
  const remoteTs = Date.parse(remoteSettings.lastSyncTimestamp || '') || 0;
  const localTs = Date.parse(localSettings?.lastSyncTimestamp || '') || 0;
  const useLocal = Boolean(localSettings && localTs > SEED_BASELINE_MS && localTs > remoteTs);
  const merged = useLocal
    ? { ...remoteSettings, ...localSettings }
    : { ...localSettings, ...remoteSettings };

  // Pastikan timestamp mutasi terbaru tidak pernah mundur oleh snapshot lama
  const maxUserMut = Math.max(
    Date.parse(localSettings?.lastUserMutationAt || '') || 0,
    Date.parse(remoteSettings?.lastUserMutationAt || '') || 0
  );
  const maxDataMut = Math.max(
    Date.parse(localSettings?.lastDataMutationAt || '') || 0,
    Date.parse(remoteSettings?.lastDataMutationAt || '') || 0
  );
  if (maxUserMut > 0) merged.lastUserMutationAt = new Date(maxUserMut).toISOString();
  if (maxDataMut > 0) merged.lastDataMutationAt = new Date(maxDataMut).toISOString();

  // Pertahankan konfigurasi Google Workspace jika salah satu sudah menautkan
  merged.googleSheetSpreadsheetId =
    merged.googleSheetSpreadsheetId || remoteSettings.googleSheetSpreadsheetId || localSettings.googleSheetSpreadsheetId;
  merged.googleDriveFolderId =
    merged.googleDriveFolderId || remoteSettings.googleDriveFolderId || localSettings.googleDriveFolderId;
  merged.googleDriveUsersFileId =
    merged.googleDriveUsersFileId || remoteSettings.googleDriveUsersFileId || localSettings.googleDriveUsersFileId;
  merged.googleAccountEmail =
    merged.googleAccountEmail || remoteSettings.googleAccountEmail || localSettings.googleAccountEmail;

  return merged;
}

/**
 * Tarik seluruh data Cloud Firestore saat aplikasi pertama kali dibuka (khususnya domain baru seperti Vercel)
 * SEBELUM initializeDatabase() berjalan agar akun/pengaturan yang sudah diubah tidak pernah tertimpa data demo awal.
 */
export async function pullAllCloudDataOnStartup(): Promise<void> {
  const fetchAll = async () => {
    // Kirim dulu antrean offline yang tersimpan di perangkat sebelum menarik snapshot terbaru
    await flushCloudOutbox().catch(() => {});

    const collections = Object.values(SYNC_COLLECTIONS);
    await Promise.allSettled(
      collections.map(async (colName) => {
        try {
          const snapshot = await getDocs(collection(db, colName));
          if (snapshot.empty) return;
          cloudConnectionActive = true;
          lastSyncTime = new Date().toISOString();

          const storageKey = LOCAL_STORAGE_KEYS[colName];
          if (colName === 'settings') {
            const settingsDoc = snapshot.docs.find((d) => d.id === 'global')?.data();
            if (settingsDoc) {
              const localStr = localStorage.getItem(storageKey);
              const localSettings = localStr ? JSON.parse(localStr) : null;
              const mergedSettings = mergeSettingsDocuments(localSettings, settingsDoc);
              localStorage.setItem(storageKey, JSON.stringify(mergedSettings));
              syncPendingWorkspaceFlagFromSettings(mergedSettings);
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('kitarajin_settings_updated'));
              }
            }
          } else if (colName === 'users') {
            const remoteUsers = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }));
            const localStr = localStorage.getItem(storageKey);
            const localUsers = localStr ? JSON.parse(localStr) : [];
            const { merged, toUpload } = mergeUserRecordsNonDestructive(
              Array.isArray(localUsers) ? localUsers : [],
              remoteUsers
            );
            if (merged.length > 0) {
              localStorage.setItem(storageKey, JSON.stringify(merged));
              syncCurrentSessionUserFromList(merged);
            }
            for (const u of toUpload) {
              syncRecordToCloud(SYNC_COLLECTIONS.USERS, String(u.id), u).catch(() => {});
            }
          } else {
            const remoteItems = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
            }));
            const mergedItems = mergeRemoteWithPendingOutbox(colName, remoteItems);
            if (mergedItems.length > 0) {
              localStorage.setItem(storageKey, JSON.stringify(mergedItems));
            }
          }
        } catch (colErr) {
          console.warn(`Startup pull note (${colName}):`, colErr);
        }
      })
    );
  };

  try {
    await Promise.race([
      fetchAll(),
      new Promise<void>((resolve) => setTimeout(resolve, 6000)),
    ]);
  } catch (err) {
    console.warn('pullAllCloudDataOnStartup warning:', err);
  }
}

/**
 * Kirim data per dokumen ke Cloud Firestore (otomatis masuk antrean outbox bila jaringan terputus)
 */
export async function syncRecordToCloud(
  collectionName: string,
  recordId: string,
  data: Record<string, any>
): Promise<void> {
  const cleanData = JSON.parse(JSON.stringify(data));
  try {
    await setDoc(doc(db, collectionName, recordId), cleanData, { merge: true });
    removeFromOutbox(collectionName, recordId);
    lastSyncTime = new Date().toISOString();
    cloudConnectionActive = true;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kitarajin_cloud_sync', { detail: { collection: collectionName } }));
    }
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, `${collectionName}/${recordId}`);
    }
    enqueueOutbox({
      op: 'set',
      col: collectionName,
      id: recordId,
      data: cleanData,
      queuedAt: new Date().toISOString(),
    });
    console.warn(`Antrean auto-sync cloud untuk ${collectionName}/${recordId}:`, err);
  }
}

/**
 * Hapus data dokumen dari Cloud Firestore (otomatis masuk antrean outbox bila jaringan terputus)
 */
export async function deleteRecordFromCloud(
  collectionName: string,
  recordId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, collectionName, recordId));
    removeFromOutbox(collectionName, recordId);
    lastSyncTime = new Date().toISOString();
    cloudConnectionActive = true;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kitarajin_cloud_sync', { detail: { collection: collectionName } }));
    }
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${recordId}`);
    }
    enqueueOutbox({
      op: 'delete',
      col: collectionName,
      id: recordId,
      queuedAt: new Date().toISOString(),
    });
    console.warn(`Antrean auto-delete cloud untuk ${collectionName}/${recordId}:`, err);
  }
}

/**
 * Proses otomatis seluruh antrean perubahan yang tertunda ke Cloud Firestore
 */
export async function flushCloudOutbox(): Promise<number> {
  const queue = loadOutbox();
  if (queue.length === 0) return 0;

  let flushed = 0;
  const remaining: OutboxEntry[] = [];

  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    try {
      if (entry.op === 'set' && entry.data) {
        await setDoc(doc(db, entry.col, entry.id), entry.data, { merge: true });
      } else if (entry.op === 'delete') {
        await deleteDoc(doc(db, entry.col, entry.id));
      }
      flushed++;
      cloudConnectionActive = true;
      lastSyncTime = new Date().toISOString();
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (msg.toLowerCase().includes('permission')) {
        handleFirestoreError(
          err,
          entry.op === 'delete' ? OperationType.DELETE : OperationType.WRITE,
          `${entry.col}/${entry.id}`
        );
      }
      remaining.push(...queue.slice(i));
      cloudConnectionActive = false;
      break;
    }
  }

  saveOutbox(remaining);
  if (flushed > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kitarajin_cloud_sync', { detail: { collection: 'outbox', flushed } }));
  }
  return flushed;
}

/**
 * Sinkronisasi penuh otomatis di latar belakang tanpa klik pengguna:
 * - Flush antrean offline
 * - Pastikan data inisial / lokal yang belum ada di Firestore langsung terunggah non-destruktif
 */
export async function autoSyncCloudInBackground(): Promise<void> {
  if (isAutoSyncRunning) return;
  isAutoSyncRunning = true;

  try {
    await flushCloudOutbox();

    // 1. Settings global
    try {
      const settingsSnap = await getDocs(collection(db, SYNC_COLLECTIONS.SETTINGS));
      const remoteSettings = settingsSnap.docs.find((d) => d.id === 'global')?.data();
      const localStr = localStorage.getItem(LOCAL_STORAGE_KEYS.settings);
      const localSettings = localStr ? JSON.parse(localStr) : null;

      if (localSettings) {
        if (!remoteSettings) {
          await setDoc(doc(db, SYNC_COLLECTIONS.SETTINGS, 'global'), JSON.parse(JSON.stringify(localSettings)), {
            merge: true,
          });
        } else {
          const remoteTs = Date.parse(remoteSettings.lastSyncTimestamp || '') || 0;
          const localTs = Date.parse(localSettings.lastSyncTimestamp || '') || 0;
          if (localTs > SEED_BASELINE_MS && localTs > remoteTs) {
            const merged = { ...remoteSettings, ...localSettings };
            await setDoc(doc(db, SYNC_COLLECTIONS.SETTINGS, 'global'), JSON.parse(JSON.stringify(merged)), {
              merge: true,
            });
          }
        }
      }
    } catch {
      // ignore transient errors
    }

    // 2. Users (non-destruktif: hanya upload yang lebih baru atau akun baru lokal)
    try {
      const remoteSnap = await getDocs(collection(db, SYNC_COLLECTIONS.USERS));
      const remoteUsers = remoteSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const localStr = localStorage.getItem(LOCAL_STORAGE_KEYS.users);
      const localUsers = localStr ? JSON.parse(localStr) : [];
      const { merged, toUpload } = mergeUserRecordsNonDestructive(
        Array.isArray(localUsers) ? localUsers : [],
        remoteUsers
      );
      if (merged.length > 0) {
        localStorage.setItem(LOCAL_STORAGE_KEYS.users, JSON.stringify(merged));
        syncCurrentSessionUserFromList(merged);
      }
      for (const u of toUpload) {
        if (u && u.id) {
          await setDoc(doc(db, SYNC_COLLECTIONS.USERS, String(u.id)), JSON.parse(JSON.stringify(u)), {
            merge: true,
          });
        }
      }
    } catch {
      // ignore transient errors
    }

    // 3. Koleksi 8 tabel lainnya: unggah item lokal yang belum ada di Cloud Firestore
    const otherCols = [
      SYNC_COLLECTIONS.DEPARTMENTS,
      SYNC_COLLECTIONS.SCHEDULES,
      SYNC_COLLECTIONS.LOCATIONS,
      SYNC_COLLECTIONS.FACE_REGISTRY,
      SYNC_COLLECTIONS.ATTENDANCE,
      SYNC_COLLECTIONS.LEAVE_REQUESTS,
      SYNC_COLLECTIONS.ASSIGNMENTS,
      SYNC_COLLECTIONS.AUDIT_LOGS,
    ];

    await Promise.allSettled(
      otherCols.map(async (colName) => {
        const storageKey = LOCAL_STORAGE_KEYS[colName];
        const localStr = localStorage.getItem(storageKey);
        if (!localStr) return;
        let localArr: any[] = [];
        try {
          localArr = JSON.parse(localStr);
        } catch {
          return;
        }
        if (!Array.isArray(localArr) || localArr.length === 0) return;

        const remoteSnap = await getDocs(collection(db, colName));
        const remoteIds = new Set(remoteSnap.docs.map((d) => d.id));

        for (const item of localArr) {
          if (!item || !item.id) continue;
          const id = String(item.id);
          if (colName === SYNC_COLLECTIONS.ATTENDANCE && id.startsWith('att-seed-')) continue;
          if (!remoteIds.has(id)) {
            await setDoc(doc(db, colName, id), JSON.parse(JSON.stringify(item)), { merge: true });
          }
        }
      })
    );

    cloudConnectionActive = true;
    lastSyncTime = new Date().toISOString();
  } catch (err) {
    console.warn('autoSyncCloudInBackground note:', err);
  } finally {
    isAutoSyncRunning = false;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kitarajin_cloud_sync', { detail: { collection: 'auto' } }));
    }
  }
}

/**
 * Memulai sinkronisasi real-time multi-device
 * Mendengarkan perubahan Firestore dan memperbarui local storage & state UI secara otomatis
 */
export function startMultiDeviceRealtimeSync(onUpdateCallback?: (collectionName: string) => void): () => void {
  if (isSyncInitialized) {
    return () => {};
  }
  isSyncInitialized = true;

  testFirestoreConnection().catch(() => {});
  const initialSyncTimer = setTimeout(() => {
    autoSyncCloudInBackground().catch(() => {});
  }, 1500);

  const collectionsToWatch = Object.values(SYNC_COLLECTIONS);

  activeUnsubscribes = collectionsToWatch.map((colName) => {
    let isInitialSnapshot = true;
    return onSnapshot(
      collection(db, colName),
      (snapshot) => {
        const wasInitial = isInitialSnapshot;
        isInitialSnapshot = false;
        cloudConnectionActive = true;
        lastSyncTime = new Date().toISOString();

        if (colName === 'settings') {
          // Settings disimpan sebagai objek tunggal (merge agar ID sheet/drive & status sinkron tidak hilang)
          const settingsDoc = snapshot.docs.find((d) => d.id === 'global')?.data();
          const localSettingsStr = localStorage.getItem(LOCAL_STORAGE_KEYS.settings);
          const localSettings = localSettingsStr ? JSON.parse(localSettingsStr) : null;

          if (settingsDoc) {
            const mergedSettings = mergeSettingsDocuments(localSettings, settingsDoc);
            localStorage.setItem(LOCAL_STORAGE_KEYS.settings, JSON.stringify(mergedSettings));
            syncPendingWorkspaceFlagFromSettings(mergedSettings);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('kitarajin_settings_updated'));
            }
          } else if (localSettings) {
            setDoc(doc(db, 'settings', 'global'), localSettings).catch(() => {});
          }
        } else if (colName === 'users') {
          // KHUSUS USERS: Jangan pernah menimpa/menghapus username & password lokal yang belum ter-upload!
          const remoteItems = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));
          const storageKey = LOCAL_STORAGE_KEYS[colName];
          const localDataStr = localStorage.getItem(storageKey);
          const localItems = localDataStr ? JSON.parse(localDataStr) : [];

          const { merged, toUpload } = mergeUserRecordsNonDestructive(
            Array.isArray(localItems) ? localItems : [],
            remoteItems
          );

          if (merged.length > 0) {
            localStorage.setItem(storageKey, JSON.stringify(merged));
            syncCurrentSessionUserFromList(merged);
          }

          if (toUpload.length > 0) {
            toUpload.forEach((item: any) => {
              if (item && item.id) {
                const cleanItem = JSON.parse(JSON.stringify(item));
                setDoc(doc(db, colName, String(item.id)), cleanItem, { merge: true }).catch(() => {});
              }
            });
          }
        } else {
          // Koleksi array data lainnya (pertahankan item antrean offline bila ada)
          const remoteItems = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));

          const storageKey = LOCAL_STORAGE_KEYS[colName];
          const mergedItems = mergeRemoteWithPendingOutbox(colName, remoteItems);

          if (mergedItems.length > 0) {
            localStorage.setItem(storageKey, JSON.stringify(mergedItems));
          } else {
            const localDataStr = localStorage.getItem(storageKey);
            if (localDataStr) {
              try {
                const localItems = JSON.parse(localDataStr);
                if (Array.isArray(localItems) && localItems.length > 0) {
                  localItems.forEach((item: any) => {
                    if (item && item.id) {
                      setDoc(doc(db, colName, item.id), item, { merge: true }).catch(() => {});
                    }
                  });
                }
              } catch (e) {
                console.warn(`Gagal auto-seed ${colName} ke cloud:`, e);
              }
            }
          }
        }

        // Jika perubahan data berasal dari perangkat lain (remote server), otomatis sinkronkan juga ke Google Drive/Sheets bila terhubung
        if (
          !wasInitial &&
          !snapshot.metadata.hasPendingWrites &&
          colName !== SYNC_COLLECTIONS.AUDIT_LOGS &&
          colName !== SYNC_COLLECTIONS.SETTINGS
        ) {
          import('./workspaceService')
            .then((m) => m.scheduleWorkspaceAutoSync(colName))
            .catch(() => {});
        } else if (colName === SYNC_COLLECTIONS.SETTINGS) {
          import('./workspaceService')
            .then((m) => m.flushWorkspaceSyncIfReady())
            .catch(() => {});
        }

        // Panggil notifikasi pembaruan untuk render ulang UI di semua tab / halaman
        if (onUpdateCallback) {
          onUpdateCallback(colName);
        }
        window.dispatchEvent(new CustomEvent('kitarajin_cloud_sync', { detail: { collection: colName } }));
      },
      (error) => {
        const errInfo = buildFirestoreErrorInfo(error, OperationType.GET, colName);
        console.warn(`Firestore onSnapshot error pada koleksi ${colName}:`, JSON.stringify(errInfo));
        cloudConnectionActive = false;
      }
    );
  });

  const handleOnline = () => {
    autoSyncCloudInBackground().catch(() => {});
    import('./workspaceService')
      .then((m) => m.flushWorkspaceSyncIfReady())
      .catch(() => {});
  };
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      flushCloudOutbox().catch(() => {});
      import('./workspaceService')
        .then((m) => m.flushWorkspaceSyncIfReady())
        .catch(() => {});
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);
  }
  const outboxTimer = setInterval(() => {
    if (loadOutbox().length > 0) {
      flushCloudOutbox().catch(() => {});
    }
    import('./workspaceService')
      .then((m) => m.flushWorkspaceSyncIfReady())
      .catch(() => {});
  }, 15000);

  return () => {
    clearTimeout(initialSyncTimer);
    activeUnsubscribes.forEach((unsub) => unsub());
    activeUnsubscribes = [];
    clearInterval(outboxTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    }
    isSyncInitialized = false;
  };
}

/**
 * Cek status sinkronisasi cloud real-time saat ini
 */
export function getCloudSyncStatus(): {
  isOnline: boolean;
  lastSync: string;
  databaseId: string;
  pendingCount: number;
  isSyncing: boolean;
} {
  return {
    isOnline: cloudConnectionActive,
    lastSync: lastSyncTime,
    databaseId: firebaseConfig.firestoreDatabaseId,
    pendingCount: loadOutbox().length,
    isSyncing: isAutoSyncRunning,
  };
}

/**
 * Paksa unggah/sinkronisasi seluruh data lokal ke Firestore Cloud Database
 */
export async function pushAllLocalDataToCloud(): Promise<{ success: boolean; totalUploaded: number; error?: string }> {
  let count = 0;
  let lastError: string | null = null;

  try {
    // 1. Settings
    const settingsStr = localStorage.getItem(LOCAL_STORAGE_KEYS.settings);
    if (settingsStr) {
      try {
        const cleanSettings = JSON.parse(settingsStr);
        await setDoc(doc(db, 'settings', 'global'), cleanSettings, { merge: true });
        count++;
      } catch (err: any) {
        console.warn('Gagal push settings global ke cloud:', err);
        lastError = err?.message || 'Gagal push settings';
      }
    }

    // 2. Koleksi Users: merge non-destruktif terlebih dahulu agar akun demo yang sudah diubah tidak pernah tertimpa
    try {
      const remoteSnap = await getDocs(collection(db, SYNC_COLLECTIONS.USERS));
      const remoteUsers = remoteSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const localUsersStr = localStorage.getItem(LOCAL_STORAGE_KEYS.users);
      const localUsersArr = localUsersStr ? JSON.parse(localUsersStr) : [];
      const { merged } = mergeUserRecordsNonDestructive(
        Array.isArray(localUsersArr) ? localUsersArr : [],
        remoteUsers
      );
      if (merged.length > 0) {
        localStorage.setItem(LOCAL_STORAGE_KEYS.users, JSON.stringify(merged));
        for (const docItem of merged) {
          if (docItem && docItem.id) {
            try {
              const cleanItem = JSON.parse(JSON.stringify(docItem));
              await setDoc(doc(db, SYNC_COLLECTIONS.USERS, String(docItem.id)), cleanItem, { merge: true });
              count++;
            } catch (itemErr: any) {
              console.warn(`Gagal upload users/${docItem.id}:`, itemErr);
              lastError = itemErr?.message || 'Error item';
            }
          }
        }
      }
    } catch (userErr: any) {
      console.warn('Gagal merge users sebelum push cloud:', userErr);
    }

    // 3. Koleksi 8 tabel lainnya
    const collectionsToPush = [
      { col: SYNC_COLLECTIONS.DEPARTMENTS, key: LOCAL_STORAGE_KEYS.departments },
      { col: SYNC_COLLECTIONS.SCHEDULES, key: LOCAL_STORAGE_KEYS.schedules },
      { col: SYNC_COLLECTIONS.LOCATIONS, key: LOCAL_STORAGE_KEYS.locations },
      { col: SYNC_COLLECTIONS.FACE_REGISTRY, key: LOCAL_STORAGE_KEYS.faceRegistry },
      { col: SYNC_COLLECTIONS.ATTENDANCE, key: LOCAL_STORAGE_KEYS.attendance },
      { col: SYNC_COLLECTIONS.LEAVE_REQUESTS, key: LOCAL_STORAGE_KEYS.leaveRequests },
      { col: SYNC_COLLECTIONS.ASSIGNMENTS, key: LOCAL_STORAGE_KEYS.assignments },
      { col: SYNC_COLLECTIONS.AUDIT_LOGS, key: LOCAL_STORAGE_KEYS.auditLogs },
    ];

    for (const item of collectionsToPush) {
      const dataStr = localStorage.getItem(item.key);
      if (dataStr) {
        try {
          const arr = JSON.parse(dataStr);
          if (Array.isArray(arr)) {
            for (const docItem of arr) {
              if (docItem && docItem.id) {
                try {
                  const cleanItem = JSON.parse(JSON.stringify(docItem));
                  await setDoc(doc(db, item.col, String(docItem.id)), cleanItem, { merge: true });
                  count++;
                } catch (itemErr: any) {
                  console.warn(`Gagal upload ${item.col}/${docItem.id}:`, itemErr);
                  lastError = itemErr?.message || 'Error item';
                }
              }
            }
          }
        } catch (parseErr) {
          console.warn(`Gagal parse data lokal untuk ${item.col}:`, parseErr);
        }
      }
    }

    cloudConnectionActive = true;
    lastSyncTime = new Date().toISOString();
    return {
      success: count > 0 || !lastError,
      totalUploaded: count,
      error: lastError || undefined,
    };
  } catch (err: any) {
    console.error('Gagal push seluruh data lokal ke cloud:', err);
    return { success: false, totalUploaded: count, error: err?.message };
  }
}
