/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocFromServer,
  getDocs,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Inisialisasi Firebase App & Firestore Database
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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

let isSyncInitialized = false;
let activeUnsubscribes: Unsubscribe[] = [];
let cloudConnectionActive = false;
let lastSyncTime: string = new Date().toISOString();

/**
 * Gabungkan data array pengguna tanpa pernah menghapus username/password yang sudah ditambahkan
 */
export function mergeUserRecordsNonDestructive(
  localUsers: any[],
  remoteUsers: any[]
): { merged: any[]; toUpload: any[] } {
  const byId = new Map<string, any>();
  const toUpload: any[] = [];

  const getUpdatedMs = (u: any): number => {
    const t = Date.parse(u?.updatedAt || u?.createdAt || '');
    return isNaN(t) ? 0 : t;
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
        const localNewer = getUpdatedMs(l) > getUpdatedMs(remoteByName);
        const winner = localNewer ? { ...remoteByName, ...l } : { ...l, ...remoteByName };
        if (!winner.savedPassword) {
          winner.savedPassword = l.savedPassword || remoteByName.savedPassword;
        }
        if (!winner.passwordHash) {
          winner.passwordHash = l.passwordHash || remoteByName.passwordHash;
        }
        byId.set(matchedKey, winner);
        if (localNewer || (!remoteByName.savedPassword && winner.savedPassword)) {
          toUpload.push(winner);
        }
      } else {
        // Akun baru lokal yang belum ada di remote -> PERTAHANKAN dan upload ke cloud!
        byId.set(id, l);
        toUpload.push(l);
      }
    } else {
      const localMs = getUpdatedMs(l);
      const remoteMs = getUpdatedMs(existingRemote);
      const localNewer = localMs > remoteMs;
      const mergedUser = localNewer
        ? { ...existingRemote, ...l }
        : { ...l, ...existingRemote };

      // Jangan pernah hilangkan savedPassword jika salah satu sisi memilikinya
      const sameHash = !l.passwordHash || !existingRemote.passwordHash || l.passwordHash === existingRemote.passwordHash;
      if (!mergedUser.savedPassword && sameHash) {
        mergedUser.savedPassword = l.savedPassword || existingRemote.savedPassword;
      }

      byId.set(id, mergedUser);

      // Jika lokal lebih baru atau memiliki savedPassword yang belum tersimpan di cloud
      if (
        localNewer ||
        (mergedUser.savedPassword && !existingRemote.savedPassword)
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

/**
 * Validasi koneksi ke server Firestore (sesuai spesifikasi Firebase Skill)
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    cloudConnectionActive = true;
    return true;
  } catch (error: any) {
    if (error?.message && error.message.includes('the client is offline')) {
      console.warn('Firestore offline, fallback ke cache lokal.');
      cloudConnectionActive = false;
      return false;
    }
    // Jika dokumen test belum ada, koneksi server tetap aktif jika tidak melempar 'client is offline'
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

/**
 * Kirim data per dokumen ke Cloud Firestore
 */
export async function syncRecordToCloud(
  collectionName: string,
  recordId: string,
  data: Record<string, any>
): Promise<void> {
  try {
    const cleanData = JSON.parse(JSON.stringify(data));
    await setDoc(doc(db, collectionName, recordId), cleanData, { merge: true });
    lastSyncTime = new Date().toISOString();
    cloudConnectionActive = true;
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.WRITE, `${collectionName}/${recordId}`);
    }
    console.warn(`Gagal sinkronisasi ${collectionName}/${recordId} ke Firestore:`, err);
  }
}

/**
 * Hapus data dokumen dari Cloud Firestore
 */
export async function deleteRecordFromCloud(
  collectionName: string,
  recordId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, collectionName, recordId));
    lastSyncTime = new Date().toISOString();
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (msg.toLowerCase().includes('permission')) {
      handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${recordId}`);
    }
    console.warn(`Gagal menghapus ${collectionName}/${recordId} dari Firestore:`, err);
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

  testFirestoreConnection();

  const collectionsToWatch = Object.values(SYNC_COLLECTIONS);

  activeUnsubscribes = collectionsToWatch.map((colName) => {
    return onSnapshot(
      collection(db, colName),
      (snapshot) => {
        cloudConnectionActive = true;
        lastSyncTime = new Date().toISOString();

        if (colName === 'settings') {
          // Settings disimpan sebagai objek tunggal (merge agar ID sheet/drive tidak hilang)
          const settingsDoc = snapshot.docs.find((d) => d.id === 'global')?.data();
          const localSettingsStr = localStorage.getItem(LOCAL_STORAGE_KEYS.settings);
          const localSettings = localSettingsStr ? JSON.parse(localSettingsStr) : null;

          if (settingsDoc) {
            const remoteTs = Date.parse(settingsDoc.lastSyncTimestamp || '') || 0;
            const localTs = Date.parse(localSettings?.lastSyncTimestamp || '') || 0;
            const mergedSettings =
              localSettings && localTs > remoteTs
                ? { ...settingsDoc, ...localSettings }
                : { ...(localSettings || {}), ...settingsDoc };
            localStorage.setItem(LOCAL_STORAGE_KEYS.settings, JSON.stringify(mergedSettings));
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
          // Koleksi array data lainnya
          const items = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));

          const storageKey = LOCAL_STORAGE_KEYS[colName];

          if (items.length > 0) {
            localStorage.setItem(storageKey, JSON.stringify(items));
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

  return () => {
    activeUnsubscribes.forEach((unsub) => unsub());
    activeUnsubscribes = [];
    isSyncInitialized = false;
  };
}

/**
 * Cek status sinkronisasi cloud real-time saat ini
 */
export function getCloudSyncStatus(): { isOnline: boolean; lastSync: string; databaseId: string } {
  return {
    isOnline: cloudConnectionActive,
    lastSync: lastSyncTime,
    databaseId: firebaseConfig.firestoreDatabaseId,
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

    // 2. Koleksi 9 tabel lainnya
    const collectionsToPush = [
      { col: SYNC_COLLECTIONS.USERS, key: LOCAL_STORAGE_KEYS.users },
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
