/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocFromServer,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Inisialisasi Firebase App & Firestore Database
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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
  } catch (err) {
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
  } catch (err) {
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
          // Settings disimpan sebagai objek tunggal
          let settingsDoc = snapshot.docs.find((d) => d.id === 'global')?.data();
          if (settingsDoc) {
            localStorage.setItem(LOCAL_STORAGE_KEYS.settings, JSON.stringify(settingsDoc));
          } else {
            // Jika belum ada di Firestore, seed dari lokal
            const localSettingsStr = localStorage.getItem(LOCAL_STORAGE_KEYS.settings);
            if (localSettingsStr) {
              const localSettings = JSON.parse(localSettingsStr);
              setDoc(doc(db, 'settings', 'global'), localSettings).catch(() => {});
            }
          }
        } else {
          // Koleksi array data
          const items = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }));

          const storageKey = LOCAL_STORAGE_KEYS[colName];

          if (items.length > 0) {
            // Firestore memiliki data terbaru, perbarui localStorage
            localStorage.setItem(storageKey, JSON.stringify(items));
          } else {
            // Jika Firestore masih kosong saat pertama kali aplikasi dibuka di cloud,
            // otomatis seed data awal lokal ke Firestore agar perangkat lain langsung tersinkron
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
        console.warn(`Firestore onSnapshot error pada koleksi ${colName}:`, error);
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
