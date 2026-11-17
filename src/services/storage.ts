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
  LeaveStatus,
  AssignmentStatus,
  DailyAttendancePair,
} from '../types';
import { hashPassword, verifyPassword } from './crypto';
import {
  syncRecordToCloud,
  deleteRecordFromCloud,
  pullUsersFromCloudAndMerge,
  safeSaveJsonArray,
  SEED_BASELINE_ISO,
  SYNC_COLLECTIONS,
} from './firestoreSync';

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

const STORAGE_KEYS = {
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
};

// Data Inisial Departemen Default
const INITIAL_DEPARTMENTS: Department[] = [
  { id: 'dept-1', name: 'Tata Usaha (TU)', code: 'TU', description: 'Administrasi dan persuratan sekolah', headName: 'Ahmad Fauzi', createdAt: new Date().toISOString() },
  { id: 'dept-2', name: 'Tenaga Pendidik / Guru', code: 'GURU', description: 'Dewan guru mata pelajaran dan kelas', headName: 'Dra. Endang', createdAt: new Date().toISOString() },
  { id: 'dept-3', name: 'Keamanan & Satpam', code: 'SEC', description: 'Penjagaan ketertiban dan gerbang sekolah', headName: 'Bambang S.', createdAt: new Date().toISOString() },
  { id: 'dept-4', name: 'Dapur & Konsumsi', code: 'DAPUR', description: 'Pengelolaan gizi, makanan, dan kantin sekolah', headName: 'Mbak Sri', createdAt: new Date().toISOString() },
  { id: 'dept-5', name: 'Kebersihan & Sarpras', code: 'KBR', description: 'Pemeliharaan fasilitas, kebersihan kelas, dan taman', headName: 'Joko W.', createdAt: new Date().toISOString() },
];

// Data Inisial Jadwal Kerja & Sesi Fleksibel (Sesi 1, Sesi 2, Sesi 3)
const INITIAL_SCHEDULES: Schedule[] = [
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
  },
];

// Data Inisial Titik Lokasi Presensi (Geofence) Default
const INITIAL_LOCATIONS: LocationConfig[] = [
  {
    id: 'loc-sekolah-utama',
    name: 'Kampus Utama & Gedung Kantor',
    latitude: -6.2088, // Koordinat Jakarta Pusat (contoh representatif)
    longitude: 106.8456,
    radiusMeters: 50, // Radius presensi 50 meter
    address: 'Jl. Pendidikan No. 45, Kompleks Akademika',
    isActive: true,
  },
  {
    id: 'loc-gerbang-lapangan',
    name: 'Titik Pos Satpam & Gerbang Depan',
    latitude: -6.2090,
    longitude: 106.8459,
    radiusMeters: 40,
    address: 'Pos Gerbang Masuk SMA Negeri 1 Prestasi',
    isActive: true,
  },
];

/**
 * Inisialisasi Database Lokal jika belum ada
 */
export async function initializeDatabase(): Promise<void> {
  const existingUsers = localStorage.getItem(STORAGE_KEYS.USERS);
  if (!existingUsers) {
    // Generate secure hashes for initial accounts in parallel
    const [kepsekHash, adminHash, guruHash, satpamHash] = await Promise.all([
      hashPassword('kepsek123'),
      hashPassword('admin123'),
      hashPassword('staff123'),
      hashPassword('staff123'),
    ]);

    const seedUsers: User[] = [
      {
        id: 'usr-ks-01',
        nip: '197508122000031001',
        name: 'Drs. H. Mulyadi, M.Pd.',
        email: 'kepsek@sekolah.sch.id',
        username: 'kepsek',
        passwordHash: kepsekHash,
        savedPassword: 'kepsek123',
        role: 'kepala_sekolah',
        departmentId: 'dept-1',
        position: 'Kepala Sekolah',
        phone: '081234567890',
        isActive: true,
        createdAt: SEED_BASELINE_ISO,
        updatedAt: SEED_BASELINE_ISO,
      },
      {
        id: 'usr-adm-01',
        nip: '198503202008011004',
        name: 'Ahmad Fauzi, S.Kom.',
        email: 'admin.fauzi@sekolah.sch.id',
        username: 'adminfauzi',
        passwordHash: adminHash,
        savedPassword: 'admin123',
        role: 'admin',
        departmentId: 'dept-1',
        position: 'Admin Tata Usaha',
        phone: '081398765432',
        isActive: true,
        createdAt: SEED_BASELINE_ISO,
        updatedAt: SEED_BASELINE_ISO,
      },
      {
        id: 'usr-stf-01',
        nip: '199004152014022003',
        name: 'Siti Rahmawati, S.Pd.',
        email: 'siti.rahma@sekolah.sch.id',
        username: 'sitirahma',
        passwordHash: guruHash,
        savedPassword: 'staff123',
        role: 'karyawan',
        departmentId: 'dept-2',
        position: 'Guru Matematika',
        phone: '085712345678',
        isActive: true,
        createdAt: SEED_BASELINE_ISO,
        updatedAt: SEED_BASELINE_ISO,
      },
      {
        id: 'usr-stf-02',
        nip: '199211052018011005',
        name: 'Budi Santoso',
        email: 'budi.satpam@sekolah.sch.id',
        username: 'budisatpam',
        passwordHash: satpamHash,
        savedPassword: 'staff123',
        role: 'karyawan',
        departmentId: 'dept-3',
        position: 'Staf Keamanan',
        phone: '089612345678',
        isActive: true,
        createdAt: SEED_BASELINE_ISO,
        updatedAt: SEED_BASELINE_ISO,
      },
    ];

    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(seedUsers));

    // Initial Audit Log
    const initialLog: AuditLog = {
      id: 'log-seed-01',
      actorUserId: 'usr-ks-01',
      actorName: 'Drs. H. Mulyadi, M.Pd.',
      actorRole: 'kepala_sekolah',
      action: 'INIT_SYSTEM',
      targetEntity: 'Users',
      targetId: 'all',
      details: 'Sistem diinisialisasi pertama kali untuk manajemen presensi sekolah.',
      timestamp: SEED_BASELINE_ISO,
    };
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify([initialLog]));
  }

  const currentUsers = getAllUsers();
  const findUserRef = (id: string, fallbackName: string, fallbackNip: string) => {
    const u = currentUsers.find((usr) => usr.id === id);
    return {
      name: u?.name || fallbackName,
      nip: u?.nip || fallbackNip,
    };
  };
  const ksRef = findUserRef('usr-ks-01', 'Drs. H. Mulyadi, M.Pd.', '197508122000031001');
  const admRef = findUserRef('usr-adm-01', 'Ahmad Fauzi, S.Kom.', '198503202008011004');
  const stf1Ref = findUserRef('usr-stf-01', 'Siti Rahmawati, S.Pd.', '199004152014022003');
  const stf2Ref = findUserRef('usr-stf-02', 'Budi Santoso', '199211052018011005');

  const seedAlreadyCompleted = localStorage.getItem('kitarajin_seed_completed_v1') === 'true';

  // Initial Departments
  if (!localStorage.getItem(STORAGE_KEYS.DEPARTMENTS)) {
    const initDepts = seedAlreadyCompleted
      ? []
      : INITIAL_DEPARTMENTS.map((d) => (d.id === 'dept-1' ? { ...d, headName: admRef.name } : d));
    localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(initDepts));
  }

  // Initial Schedules
  if (!localStorage.getItem(STORAGE_KEYS.SCHEDULES)) {
    localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(INITIAL_SCHEDULES));
  }

  // Initial Locations
  if (!localStorage.getItem(STORAGE_KEYS.LOCATIONS)) {
    localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(seedAlreadyCompleted ? [] : INITIAL_LOCATIONS));
  }

  // Initial Face Registry Seeds
  if (!localStorage.getItem(STORAGE_KEYS.FACE_REGISTRY)) {
    if (seedAlreadyCompleted) {
      localStorage.setItem(STORAGE_KEYS.FACE_REGISTRY, JSON.stringify([]));
    } else {
      const sampleVector = [
        0.45, 0.52, 0.48, 0.42,
        0.55, 0.62, 0.58, 0.51,
        0.49, 0.58, 0.54, 0.47,
        0.40, 0.46, 0.43, 0.38,
        0.51, 0.55, 0.50, 0.45,
        0.58, 0.60, 0.56, 0.52,
        0.48, 0.52, 0.49, 0.44,
        0.42, 0.45, 0.41, 0.39,
      ];

      const seedFaces: FaceRegistryItem[] = [
        {
          id: 'face-seed-01',
          userId: 'usr-ks-01',
          nip: ksRef.nip,
          userName: ksRef.name,
          role: 'kepala_sekolah',
          faceEmbedding: sampleVector,
          registeredPhotoRef: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          registeredBy: 'Sistem Terpusat',
          cameraUsed: 'user',
          qualityScore: 92,
          updatedAt: new Date().toISOString(),
          isActive: true,
        },
        {
          id: 'face-seed-02',
          userId: 'usr-stf-01',
          nip: stf1Ref.nip,
          userName: stf1Ref.name,
          role: 'karyawan',
          faceEmbedding: sampleVector,
          registeredPhotoRef: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
          registeredBy: ksRef.name,
          cameraUsed: 'user',
          qualityScore: 88,
          updatedAt: new Date().toISOString(),
          isActive: true,
        },
      ];
      localStorage.setItem(STORAGE_KEYS.FACE_REGISTRY, JSON.stringify(seedFaces));
    }
  }

  // Initial Attendance Records (Murni data presensi riil, riwayat demo dihapus)
  if (!localStorage.getItem(STORAGE_KEYS.ATTENDANCE)) {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify([]));
  } else {
    purgeDemoAttendanceRecords();
  }

  // Initial Leave Requests Seeds
  if (!localStorage.getItem(STORAGE_KEYS.LEAVE_REQUESTS)) {
    if (seedAlreadyCompleted) {
      localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify([]));
    } else {
      const seedLeaves: LeaveRequest[] = [
        {
          id: 'leave-seed-01',
          userId: 'usr-stf-01',
          nip: stf1Ref.nip,
          userName: stf1Ref.name,
          type: 'dinas',
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          durationDays: 2,
          reason: 'Mengikuti Workshop Kurikulum Merdeka di Balai Guru Penggerak Provinsi.',
          status: 'menunggu',
          createdAt: new Date().toISOString(),
        },
      ];
      localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(seedLeaves));
    }
  }

  // Initial Assignments Seeds
  if (!localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS)) {
    if (seedAlreadyCompleted) {
      localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify([]));
    } else {
      const seedAssignments: Assignment[] = [
        {
          id: 'task-seed-01',
          title: 'Pemeriksaan Sarana Laboratorium Komputer',
          description: 'Lakukan inspeksi kebersihan dan fungsi 35 unit komputer lab untuk persiapan asesmen nasional.',
          assignedToUserId: 'usr-stf-01',
          assignedToName: stf1Ref.name,
          assignedByUserId: 'usr-adm-01',
          assignedByName: admRef.name,
          dueDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
          status: 'belum_mulai',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'task-seed-02',
          title: 'Patroli Keamanan Area Gerbang Timur',
          description: 'Pantau ketertiban gerbang dan parkir kendaraan siswa saat jam kepulangan.',
          assignedToUserId: 'usr-stf-02',
          assignedToName: stf2Ref.name,
          assignedByUserId: 'usr-adm-01',
          assignedByName: admRef.name,
          dueDate: new Date().toISOString().split('T')[0],
          status: 'belum_mulai',
          createdAt: new Date().toISOString(),
        },
      ];
      localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(seedAssignments));
    }
  }

  // Initial Settings
  if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
    const defaultSettings: AppSettings = {
      schoolName: 'SMA Negeri 1 Prestasi',
      schoolAddress: 'Jl. Pendidikan No. 45, Kompleks Akademika',
      appTitle: 'KITARAJIN Presensi & Penugasan',
      storageMode: 'local_secure_vault',
      requireStrictFaceVerification: true,
      requireStrictGps: true,
      minFaceMatchThreshold: 0.75,
      themeColor: '#059669',
      lastSyncTimestamp: SEED_BASELINE_ISO,
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(defaultSettings));
  }

  localStorage.setItem('kitarajin_seed_completed_v1', 'true');

  // Pastikan seluruh entitas terkait mengikuti perubahan nama/NIP akun demo
  reconcileUserReferences(currentUsers, false);
}

/**
 * Mengambil semua pengguna dari storage
 */
export function getAllUsers(): User[] {
  const data = localStorage.getItem(STORAGE_KEYS.USERS);
  return data ? JSON.parse(data) : [];
}

/**
 * Mengambil semua departemen
 */
export function getAllDepartments(): Department[] {
  const data = localStorage.getItem(STORAGE_KEYS.DEPARTMENTS);
  return data ? JSON.parse(data) : [];
}

/**
 * Mengambil riwayat Audit Logs
 */
export function getAuditLogs(): AuditLog[] {
  const data = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
  return data ? JSON.parse(data) : [];
}

/**
 * Perbarui cache sesi pengguna aktif agar selalu sinkron dengan tabel Users terbaru
 */
export function refreshCurrentSessionFromUsers(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_SESSION);
    if (!raw) return null;
    const sessionUser = JSON.parse(raw);
    if (!sessionUser?.id) return null;
    const latest = getAllUsers().find((u) => u.id === sessionUser.id);
    if (latest) {
      saveSession(latest);
      return latest;
    }
    return sessionUser;
  } catch {
    return null;
  }
}

/**
 * Sinkronkan seluruh referensi nama/NIP user di semua tabel terkait
 * (FaceRegistry, Attendance, LeaveRequests, Assignments, AuditLogs, Departments)
 * agar akun demo atau akun lain yang diubah namanya selalu konsisten di UI, Sheet, & Drive.
 */
export function reconcileUserReferences(
  usersList?: User[],
  syncChangedToCloud = false,
  oldNameHints?: Map<string, string>
): boolean {
  const users = usersList || getAllUsers();
  if (!users || users.length === 0) return false;

  const userById = new Map<string, User>(users.map((u) => [u.id, u]));
  const ksUser = users.find((u) => u.id === 'usr-ks-01') || users.find((u) => u.role === 'kepala_sekolah');
  const admUser = users.find((u) => u.id === 'usr-adm-01') || users.find((u) => u.role === 'admin');
  let anyEntityChanged = false;

  // 1. FaceRegistry
  try {
    const faces = getAllFaceRegistry();
    let changed = false;
    const oldKsName = oldNameHints?.get('usr-ks-01') || 'Drs. H. Mulyadi, M.Pd.';
    const updatedFaces = faces.map((f) => {
      const u = userById.get(f.userId);
      let nextRegisteredBy = f.registeredBy;
      if (ksUser && (f.registeredBy === 'Drs. H. Mulyadi, M.Pd.' || f.registeredBy === oldKsName)) {
        nextRegisteredBy = ksUser.name;
      } else if (oldNameHints) {
        for (const [uid, prevName] of oldNameHints.entries()) {
          if (f.registeredBy === prevName) {
            const actor = userById.get(uid);
            if (actor) nextRegisteredBy = actor.name;
          }
        }
      }
      if (u && (f.userName !== u.name || f.nip !== u.nip || f.registeredBy !== nextRegisteredBy)) {
        changed = true;
        const item = { ...f, userName: u.name, nip: u.nip, registeredBy: nextRegisteredBy };
        if (syncChangedToCloud) {
          syncRecordToCloud(SYNC_COLLECTIONS.FACE_REGISTRY, item.id, item).catch(() => {});
        }
        return item;
      }
      if (f.registeredBy !== nextRegisteredBy) {
        changed = true;
        const item = { ...f, registeredBy: nextRegisteredBy };
        if (syncChangedToCloud) {
          syncRecordToCloud(SYNC_COLLECTIONS.FACE_REGISTRY, item.id, item).catch(() => {});
        }
        return item;
      }
      return f;
    });
    if (changed) {
      localStorage.setItem(STORAGE_KEYS.FACE_REGISTRY, JSON.stringify(updatedFaces));
      anyEntityChanged = true;
    }
  } catch {
    // ignore
  }

  // 2. Attendance Records
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
          if (syncChangedToCloud && !item.id.startsWith('att-seed-')) {
            syncRecordToCloud(SYNC_COLLECTIONS.ATTENDANCE, item.id, item).catch(() => {});
          }
          return item;
        }
        return r;
      });
      if (changed) {
        localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(updated));
        anyEntityChanged = true;
      }
    }
  } catch {
    // ignore
  }

  // 3. Leave Requests
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
      if (
        (u && (l.userName !== u.name || l.nip !== u.nip)) ||
        nextReviewedBy !== l.reviewedBy
      ) {
        changed = true;
        const item = {
          ...l,
          userName: u ? u.name : l.userName,
          nip: u ? u.nip : l.nip,
          reviewedBy: nextReviewedBy,
        };
        if (syncChangedToCloud) {
          syncRecordToCloud(SYNC_COLLECTIONS.LEAVE_REQUESTS, item.id, item).catch(() => {});
        }
        return item;
      }
      return l;
    });
    if (changed) {
      localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(updated));
      anyEntityChanged = true;
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
        if (syncChangedToCloud) {
          syncRecordToCloud(SYNC_COLLECTIONS.ASSIGNMENTS, item.id, item).catch(() => {});
        }
        return item;
      }
      return t;
    });
    if (changed) {
      localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(updated));
      anyEntityChanged = true;
    }
  } catch {
    // ignore
  }

  // 5. Audit Logs
  try {
    const logs = getAuditLogs();
    let changed = false;
    const updated = logs.map((log) => {
      const u = userById.get(log.actorUserId);
      if (u && log.actorName !== u.name) {
        changed = true;
        const item = {
          ...log,
          actorName: u.name,
          details:
            log.id === 'log-seed-01'
              ? 'Sistem diinisialisasi pertama kali untuk manajemen presensi sekolah.'
              : log.details,
        };
        if (syncChangedToCloud) {
          syncRecordToCloud(SYNC_COLLECTIONS.AUDIT_LOGS, item.id, item).catch(() => {});
        }
        return item;
      }
      return log;
    });
    if (changed) {
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(updated));
      anyEntityChanged = true;
    }
  } catch {
    // ignore
  }

  // 6. Departments (perbarui headName bila masih mengacu pada nama lama akun demo/user)
  try {
    const depts = getAllDepartments();
    let changed = false;
    const oldAdmName = oldNameHints?.get('usr-adm-01') || 'Ahmad Fauzi, S.Kom.';
    const updated = depts.map((d) => {
      let nextHeadName = d.headName;
      if (
        d.id === 'dept-1' &&
        admUser &&
        (d.headName === 'Ahmad Fauzi' || d.headName === 'Ahmad Fauzi, S.Kom.' || d.headName === oldAdmName)
      ) {
        nextHeadName = admUser.name;
      } else if (d.headName && oldNameHints) {
        for (const [uid, prevName] of oldNameHints.entries()) {
          if (d.headName === prevName) {
            const matchedUser = userById.get(uid);
            if (matchedUser) nextHeadName = matchedUser.name;
          }
        }
      }
      if (nextHeadName !== d.headName) {
        changed = true;
        const item = { ...d, headName: nextHeadName };
        if (syncChangedToCloud) {
          syncRecordToCloud(SYNC_COLLECTIONS.DEPARTMENTS, item.id, item).catch(() => {});
        }
        return item;
      }
      return d;
    });
    if (changed) {
      localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(updated));
      anyEntityChanged = true;
    }
  } catch {
    // ignore
  }

  refreshCurrentSessionFromUsers();
  return anyEntityChanged;
}

function notifyRealtimeChange(collectionName: string, triggerWorkspaceSync = false): void {
  if (triggerWorkspaceSync && collectionName !== SYNC_COLLECTIONS.AUDIT_LOGS) {
    try {
      const curSettings = getAppSettings();
      const nowIso = new Date().toISOString();
      const timestampPatch: Partial<AppSettings> = {
        lastDataMutationAt: nowIso,
        lastSyncTimestamp: nowIso,
        ...(collectionName === SYNC_COLLECTIONS.USERS ? { lastUserMutationAt: nowIso } : {}),
      };
      const updatedSettings: AppSettings = {
        ...curSettings,
        ...timestampPatch,
      };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updatedSettings));
      syncRecordToCloud(SYNC_COLLECTIONS.SETTINGS, 'global', timestampPatch).catch(() => {});
    } catch {
      // ignore
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kitarajin_cloud_sync', { detail: { collection: collectionName } }));
  }
  if (triggerWorkspaceSync) {
    import('./workspaceService')
      .then((m) => m.scheduleWorkspaceAutoSync(collectionName))
      .catch(() => {});
  }
}

/**
 * Mencatat aktivitas ke tabel AuditLogs
 */
export function logAuditAction(
  actor: User,
  action: string,
  targetEntity: string,
  targetId: string,
  details: string
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
  logs.unshift(newLog); // letakkan terbaru di atas
  safeSaveJsonArray(STORAGE_KEYS.AUDIT_LOGS, logs.slice(0, 300)); // simpan log dengan proteksi kuota
  syncRecordToCloud(SYNC_COLLECTIONS.AUDIT_LOGS, newLog.id, newLog).catch(() => {});
  notifyRealtimeChange(SYNC_COLLECTIONS.AUDIT_LOGS, false);
}

/**
 * Autentikasi Pengguna
 * - Kepala Sekolah: Login via Email terdaftar atau Username
 * - Admin: Login via Username
 * - Karyawan: Login via Username atau NIP
 */
export async function authenticateUser(identifier: string, rawPassword: string): Promise<{ success: boolean; user?: User; message: string }> {
  const cleanId = identifier.trim().toLowerCase();

  const findUserInList = (list: User[]): User | undefined => {
    const found = list.find((u) => {
      return (
        u.username.toLowerCase() === cleanId ||
        (u.email && u.email.toLowerCase() === cleanId) ||
        u.nip === cleanId
      );
    });

    if (!found && cleanId === 'presensiapp138@gmail.com') {
      return list.find((u) => u.role === 'kepala_sekolah');
    }
    return found;
  };

  let users = getAllUsers();
  let user = findUserInList(users);

  // Jika belum ketemu di lokal atau password belum cocok, tarik data terbaru dari Cloud Firestore
  let isMatch = false;
  if (user) {
    isMatch = (user.passwordHash ? await verifyPassword(rawPassword, user.passwordHash) : false) || (Boolean(user.savedPassword) && user.savedPassword === rawPassword);
  }

  if (!user || !isMatch) {
    await pullUsersFromCloudAndMerge();
    users = getAllUsers();
    user = findUserInList(users);
    if (user) {
      isMatch = (user.passwordHash ? await verifyPassword(rawPassword, user.passwordHash) : false) || (Boolean(user.savedPassword) && user.savedPassword === rawPassword);
    }
  }

  if (!user) {
    return {
      success: false,
      message: 'Akun dengan ID/Username/Email tersebut tidak ditemukan.',
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
      message: 'Password yang Anda masukkan salah. Mohon periksa kembali.',
    };
  }

  // Simpan sesi aktif
  saveSession(user);

  // Catat audit login
  logAuditAction(user, 'USER_LOGIN', 'Users', user.id, `Pengguna berhasil login sebagai ${user.role}.`);

  return {
    success: true,
    user,
    message: `Selamat datang kembali, ${user.name}!`,
  };
}

/**
 * Simpan sesi ke browser
 */
export function saveSession(user: User): void {
  // Simpan tanpa passwordHash
  const { passwordHash, ...safeUser } = user;
  localStorage.setItem(STORAGE_KEYS.CURRENT_USER_SESSION, JSON.stringify(safeUser));
}

/**
 * Ambil sesi saat ini
 */
export function getCurrentSession(): User | null {
  const data = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_SESSION);
  if (!data) return null;
  const safeUser = JSON.parse(data);
  // Re-fetch data terbaru dari tabel users
  const users = getAllUsers();
  const fullUser = users.find((u) => u.id === safeUser.id);
  return fullUser || safeUser;
}

/**
 * Hapus sesi (Logout)
 */
export function clearSession(actor?: User): void {
  if (actor) {
    logAuditAction(actor, 'USER_LOGOUT', 'Users', actor.id, 'Pengguna keluar dari sistem (logout).');
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
  // Cek otorisasi
  if (actor.role === 'karyawan') {
    return { success: false, message: 'Karyawan tidak memiliki hak akses membuat akun.' };
  }
  if (actor.role === 'admin' && userData.role !== 'karyawan') {
    return { success: false, message: 'Admin hanya berwenang membuat akun Karyawan/Tendik.' };
  }

  const users = getAllUsers();

  // Validasi keunikan NIP
  if (users.some((u) => u.nip === userData.nip.trim())) {
    return { success: false, message: `NIP/ID "${userData.nip}" sudah digunakan akun lain.` };
  }

  // Validasi keunikan Username
  if (users.some((u) => u.username.toLowerCase() === userData.username.trim().toLowerCase())) {
    return { success: false, message: `Username "${userData.username}" sudah digunakan.` };
  }

  const cleanRawPassword = userData.rawPassword.trim();
  const passwordHash = await hashPassword(cleanRawPassword);
  const manualDept = userData.departmentName?.trim() || userData.departmentId?.trim() || '';
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  users.push(newUser);
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  syncRecordToCloud(SYNC_COLLECTIONS.USERS, newUser.id, newUser).catch(() => {});

  logAuditAction(
    actor,
    'CREATE_USER',
    'Users',
    newUser.id,
    `Membuat akun baru ${newUser.name} (${newUser.role}) dengan NIP ${newUser.nip}.`
  );

  notifyRealtimeChange(SYNC_COLLECTIONS.USERS, true);

  return {
    success: true,
    user: newUser,
    message: `Akun ${newUser.name} berhasil disimpan dan disinkronkan di latar belakang.`,
  };
}

/**
 * Update Data Pengguna
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

  const targetUser = users[index];
  const oldName = targetUser.name;

  // Aturan otorisasi
  if (actor.role === 'admin') {
    if (targetUser.role === 'kepala_sekolah' || targetUser.role === 'admin') {
      return { success: false, message: 'Admin tidak dapat mengubah akun Kepala Sekolah atau Admin lain.' };
    }
  } else if (actor.role === 'karyawan' && actor.id !== userId) {
    return { success: false, message: 'Karyawan hanya dapat melihat profilnya sendiri.' };
  }

  // Cek keunikan NIP jika diubah
  if (updates.nip && updates.nip.trim() !== targetUser.nip) {
    const cleanNip = updates.nip.trim();
    if (users.some((u) => u.id !== userId && u.nip === cleanNip)) {
      return { success: false, message: `NIP "${cleanNip}" sudah digunakan akun lain.` };
    }
    targetUser.nip = cleanNip;
  }

  // Cek keunikan Username jika diubah
  if (updates.username && updates.username.trim().toLowerCase() !== targetUser.username.toLowerCase()) {
    const cleanUsername = updates.username.trim();
    if (users.some((u) => u.id !== userId && u.username.toLowerCase() === cleanUsername.toLowerCase())) {
      return { success: false, message: `Username "${cleanUsername}" sudah digunakan.` };
    }
    targetUser.username = cleanUsername;
  }

  if (updates.name) targetUser.name = updates.name.trim();
  if (updates.position) targetUser.position = updates.position.trim();
  if (updates.departmentName !== undefined) {
    targetUser.departmentName = updates.departmentName.trim();
    targetUser.departmentId = updates.departmentName.trim();
  } else if (updates.departmentId !== undefined) {
    targetUser.departmentId = updates.departmentId;
    targetUser.departmentName = updates.departmentId;
  }
  if (updates.scheduleId !== undefined) targetUser.scheduleId = updates.scheduleId;
  if (updates.assignedSessionIds !== undefined) targetUser.assignedSessionIds = updates.assignedSessionIds;
  if (updates.email !== undefined) targetUser.email = updates.email?.trim() || undefined;
  if (updates.phone !== undefined) targetUser.phone = updates.phone?.trim() || undefined;
  if (updates.isActive !== undefined) targetUser.isActive = updates.isActive;
  if ('isSeedDefault' in targetUser) {
    delete (targetUser as any).isSeedDefault;
  }

  // Jika ada reset password
  if (updates.rawPassword && updates.rawPassword.trim().length > 0) {
    const cleanNewPass = updates.rawPassword.trim();
    targetUser.passwordHash = await hashPassword(cleanNewPass);
    targetUser.savedPassword = cleanNewPass;
  }

  const mutationIso = new Date().toISOString();
  targetUser.updatedAt = mutationIso;
  users[index] = targetUser;
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  syncRecordToCloud(SYNC_COLLECTIONS.USERS, targetUser.id, targetUser).catch(() => {});

  {
    const curSettings = getAppSettings();
    if (
      targetUser.role === 'kepala_sekolah' &&
      targetUser.email &&
      (!curSettings.schoolEmail || curSettings.schoolEmail === 'kepsek@sekolah.sch.id')
    ) {
      const updatedSettings = { ...curSettings, schoolEmail: targetUser.email };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updatedSettings));
      syncRecordToCloud(SYNC_COLLECTIONS.SETTINGS, 'global', { schoolEmail: targetUser.email }).catch(() => {});
    }
  }

  // Propagasi penuh perubahan nama & NIP akun ke seluruh tabel terkait & sesi aktif
  const oldNameHints = new Map<string, string>();
  if (oldName && oldName !== targetUser.name) {
    oldNameHints.set(userId, oldName);
  }
  reconcileUserReferences(users, true, oldNameHints);
  refreshCurrentSessionFromUsers();

  logAuditAction(
    actor,
    'UPDATE_USER',
    'Users',
    userId,
    `Memperbarui profil akun ${targetUser.name} (${targetUser.role}).`
  );

  notifyRealtimeChange(SYNC_COLLECTIONS.USERS, true);

  return { success: true, message: `Data akun ${targetUser.name} berhasil disimpan dan disinkronkan di latar belakang.` };
}

/**
 * Toggle Status Aktif / Nonaktif Pengguna
 */
export function toggleUserStatus(actor: User, userId: string): { success: boolean; message: string; newStatus?: boolean } {
  const users = getAllUsers();
  const index = users.findIndex((u) => u.id === userId);

  if (index === -1) {
    return { success: false, message: 'Pengguna tidak ditemukan.' };
  }

  const targetUser = users[index];

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
  syncRecordToCloud(SYNC_COLLECTIONS.USERS, targetUser.id, targetUser).catch(() => {});
  notifyRealtimeChange(SYNC_COLLECTIONS.USERS, true);

  const statusText = targetUser.isActive ? 'diaktifkan' : 'dinonaktifkan';
  logAuditAction(
    actor,
    'TOGGLE_USER_STATUS',
    'Users',
    userId,
    `Mengubah status akun ${targetUser.name} menjadi ${statusText}.`
  );

  return {
    success: true,
    message: `Akun ${targetUser.name} berhasil ${statusText}.`,
    newStatus: targetUser.isActive,
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

  const newDept: Department = {
    id: `dept-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: data.name.trim(),
    code: cleanCode,
    description: data.description?.trim(),
    headName: data.headName?.trim(),
    createdAt: new Date().toISOString(),
  };

  depts.push(newDept);
  localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(depts));
  syncRecordToCloud(SYNC_COLLECTIONS.DEPARTMENTS, newDept.id, newDept);
  notifyRealtimeChange(SYNC_COLLECTIONS.DEPARTMENTS, true);

  logAuditAction(
    actor,
    'CREATE_DEPARTMENT',
    'Departments',
    newDept.id,
    `Membuat departemen baru: ${newDept.name} (${newDept.code}).`
  );

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

  depts[idx].name = data.name.trim();
  depts[idx].code = cleanCode;
  depts[idx].description = data.description?.trim();
  depts[idx].headName = data.headName?.trim();

  localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(depts));
  syncRecordToCloud(SYNC_COLLECTIONS.DEPARTMENTS, id, depts[idx]);
  notifyRealtimeChange(SYNC_COLLECTIONS.DEPARTMENTS, true);

  logAuditAction(
    actor,
    'UPDATE_DEPARTMENT',
    'Departments',
    id,
    `Memperbarui informasi departemen ${depts[idx].name}.`
  );

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
  const filtered = depts.filter((d) => d.id !== id);
  localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(filtered));
  deleteRecordFromCloud(SYNC_COLLECTIONS.DEPARTMENTS, id);
  notifyRealtimeChange(SYNC_COLLECTIONS.DEPARTMENTS, true);

  logAuditAction(actor, 'DELETE_DEPARTMENT', 'Departments', id, 'Menghapus departemen.');

  return { success: true, message: 'Departemen berhasil dihapus.' };
}

/**
 * ==========================================
 * MASTER DATA: JADWAL & SHIFT
 * ==========================================
 */

export function getAllSchedules(): Schedule[] {
  const data = localStorage.getItem(STORAGE_KEYS.SCHEDULES);
  let list: Schedule[] = data ? JSON.parse(data) : [];

  // Hapus jadwal lama non-sesi (misal "Tim Kebersihan & Sarpras", "Jadwal Reguler Guru & Staf TU", "Shift Pagi Keamanan & Satpam")
  const originalLength = list.length;
  list = list.filter((s) => {
    const combined = `${s.name || ''} ${s.sessionName || ''}`.toLowerCase();
    const isLegacy =
      combined.includes('kebersihan') ||
      combined.includes('sarpras') ||
      combined.includes('satpam') ||
      combined.includes('reguler guru') ||
      combined.includes('keamanan');
    return !isLegacy;
  });
  let hasChanges = list.length !== originalLength;

  // Hanya isi Sesi 1-3 default saat pertama kali tabel schedules benar-benar kosong/belum pernah diinisialisasi
  const addedSchedules: Schedule[] = [];
  if (!data || list.length === 0) {
    for (const initSched of INITIAL_SCHEDULES) {
      if (!list.some((s) => s.id === initSched.id || s.sessionName === initSched.sessionName)) {
        list.push(initSched);
        addedSchedules.push(initSched);
        hasChanges = true;
      }
    }
  }

  if (hasChanges || !data) {
    localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(list));
    for (const sched of addedSchedules) {
      syncRecordToCloud(SYNC_COLLECTIONS.SCHEDULES, sched.id, sched).catch(() => {});
    }
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

  users[idx].assignedSessionIds = sessionIds;
  users[idx].updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  refreshCurrentSessionFromUsers();
  syncRecordToCloud(SYNC_COLLECTIONS.USERS, userId, users[idx]).catch(() => {});
  notifyRealtimeChange(SYNC_COLLECTIONS.USERS, true);

  logAuditAction(
    actor,
    'UPDATE_USER_SESSIONS',
    'Users',
    userId,
    `Mengatur sesi presensi ${users[idx].name} (${users[idx].role}): [${sessionIds.join(', ')}]`
  );

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

  const curSessions = new Set(users[idx].assignedSessionIds || ['sesi-1', 'sesi-2', 'sesi-3']);
  if (enable) {
    curSessions.add(sessionId);
  } else {
    curSessions.delete(sessionId);
  }

  users[idx].assignedSessionIds = Array.from(curSessions);
  users[idx].updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  refreshCurrentSessionFromUsers();
  syncRecordToCloud(SYNC_COLLECTIONS.USERS, userId, users[idx]).catch(() => {});
  notifyRealtimeChange(SYNC_COLLECTIONS.USERS, true);

  logAuditAction(
    actor,
    'TOGGLE_USER_SESSION',
    'Users',
    userId,
    `${enable ? 'Menambahkan' : 'Mencabut'} penugasan ${sessionId} untuk ${users[idx].name} (${users[idx].role}).`
  );

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
    // Kepala Sekolah berwenang mengatur KS, Admin, dan Karyawan
    // Admin berwenang mengatur Admin dan Karyawan, tapi dilarang ubah KS
    const isAllowedToModify = actor.role === 'kepala_sekolah' || u.role !== 'kepala_sekolah';
    if (!isAllowedToModify) return;

    const curSessions = new Set(u.assignedSessionIds || ['sesi-1', 'sesi-2', 'sesi-3']);
    const shouldHave = targetUserIds.includes(u.id);
    if (shouldHave && !curSessions.has(sessionId)) {
      curSessions.add(sessionId);
      u.assignedSessionIds = Array.from(curSessions);
      u.updatedAt = new Date().toISOString();
      syncRecordToCloud(SYNC_COLLECTIONS.USERS, u.id, u);
      if (u.id === actor.id) {
        saveSession(u);
      }
      updatedCount++;
    } else if (!shouldHave && curSessions.has(sessionId)) {
      curSessions.delete(sessionId);
      u.assignedSessionIds = Array.from(curSessions);
      u.updatedAt = new Date().toISOString();
      syncRecordToCloud(SYNC_COLLECTIONS.USERS, u.id, u);
      if (u.id === actor.id) {
        saveSession(u);
      }
      updatedCount++;
    }
  });

  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  refreshCurrentSessionFromUsers();
  if (updatedCount > 0) {
    notifyRealtimeChange(SYNC_COLLECTIONS.USERS, true);
  }
  logAuditAction(
    actor,
    'UPDATE_SESSION_ROSTER',
    'Schedules',
    sessionId,
    `Memperbarui penugasan pegawai untuk ${sessionId} (${targetUserIds.length} pegawai terdaftar).`
  );

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
  };

  schedules.push(newSchedule);
  localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));
  syncRecordToCloud(SYNC_COLLECTIONS.SCHEDULES, newSchedule.id, newSchedule);
  notifyRealtimeChange(SYNC_COLLECTIONS.SCHEDULES, true);

  logAuditAction(
    actor,
    'CREATE_SCHEDULE',
    'Schedules',
    newSchedule.id,
    `Menambah sesi jadwal: ${newSchedule.name} (${newSchedule.sessionName}, Target: ${newSchedule.targetRole}) - Masuk: ${newSchedule.checkInDeadline}, Pulang: ${newSchedule.checkOutStart}.`
  );

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

  if (data.name) schedules[idx].name = data.name.trim();
  if (data.sessionName !== undefined) schedules[idx].sessionName = data.sessionName.trim();
  if (data.targetRole !== undefined) schedules[idx].targetRole = data.targetRole;
  if (data.checkInStart) schedules[idx].checkInStart = data.checkInStart;
  if (data.checkInDeadline) schedules[idx].checkInDeadline = data.checkInDeadline;
  if (data.lateToleranceMinutes !== undefined) schedules[idx].lateToleranceMinutes = Math.max(0, data.lateToleranceMinutes);
  if (data.checkOutStart) schedules[idx].checkOutStart = data.checkOutStart;
  if (data.checkOutEnd !== undefined) schedules[idx].checkOutEnd = data.checkOutEnd;
  if (data.workDays) schedules[idx].workDays = data.workDays;
  if (data.ruleNotes !== undefined) schedules[idx].ruleNotes = data.ruleNotes;
  if (data.isActive !== undefined) schedules[idx].isActive = data.isActive;

  localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));
  syncRecordToCloud(SYNC_COLLECTIONS.SCHEDULES, id, schedules[idx]);
  notifyRealtimeChange(SYNC_COLLECTIONS.SCHEDULES, true);

  logAuditAction(actor, 'UPDATE_SCHEDULE', 'Schedules', id, `Memperbarui jadwal/sesi ${schedules[idx].name}.`);

  return { success: true, message: `Jadwal & Sesi ${schedules[idx].name} berhasil diperbarui.` };
}

export function deleteSchedule(actor: User, id: string): { success: boolean; message: string } {
  if (actor.role === 'karyawan') {
    return { success: false, message: 'Karyawan tidak memiliki wewenang.' };
  }

  const schedules = getAllSchedules();
  if (schedules.length <= 1) {
    return { success: false, message: 'Harus ada minimal 1 jadwal kerja aktif di sistem.' };
  }

  const filtered = schedules.filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(filtered));
  deleteRecordFromCloud(SYNC_COLLECTIONS.SCHEDULES, id);
  notifyRealtimeChange(SYNC_COLLECTIONS.SCHEDULES, true);

  logAuditAction(actor, 'DELETE_SCHEDULE', 'Schedules', id, 'Menghapus jadwal kerja.');

  return { success: true, message: 'Jadwal kerja berhasil dihapus.' };
}

/**
 * ==========================================
 * MASTER DATA: TITIK LOKASI & RADIUS GPS
 * ==========================================
 */

export function getAllLocations(): LocationConfig[] {
  const data = localStorage.getItem(STORAGE_KEYS.LOCATIONS);
  return data ? JSON.parse(data) : [];
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
  // Hanya Kepala Sekolah yang berwenang mengatur lokasi & radius
  if (actor.role !== 'kepala_sekolah') {
    return { success: false, message: 'Hanya Kepala Sekolah yang memiliki wewenang mengatur lokasi dan radius presensi.' };
  }

  const locations = getAllLocations();
  const newLocation: LocationConfig = {
    id: `loc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: data.name.trim(),
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    radiusMeters: Math.max(10, Number(data.radiusMeters)),
    address: data.address.trim(),
    isActive: true,
  };

  locations.push(newLocation);
  localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(locations));
  syncRecordToCloud(SYNC_COLLECTIONS.LOCATIONS, newLocation.id, newLocation);
  notifyRealtimeChange(SYNC_COLLECTIONS.LOCATIONS, true);

  logAuditAction(
    actor,
    'CREATE_LOCATION',
    'Locations',
    newLocation.id,
    `Menambah titik presensi ${newLocation.name} (Koordinat: ${newLocation.latitude}, ${newLocation.longitude}, Radius: ${newLocation.radiusMeters}m).`
  );

  return { success: true, location: newLocation, message: `Titik lokasi ${newLocation.name} berhasil disimpan.` };
}

export function updateLocation(
  actor: User,
  id: string,
  data: Partial<Omit<LocationConfig, 'id'>>
): { success: boolean; message: string } {
  // Hanya Kepala Sekolah yang berwenang mengatur lokasi & radius
  if (actor.role !== 'kepala_sekolah') {
    return { success: false, message: 'Hanya Kepala Sekolah yang memiliki wewenang mengubah lokasi presensi.' };
  }

  const locations = getAllLocations();
  const idx = locations.findIndex((l) => l.id === id);
  if (idx === -1) {
    return { success: false, message: 'Lokasi tidak ditemukan.' };
  }

  if (data.name) locations[idx].name = data.name.trim();
  if (data.latitude !== undefined) locations[idx].latitude = Number(data.latitude);
  if (data.longitude !== undefined) locations[idx].longitude = Number(data.longitude);
  if (data.radiusMeters !== undefined) locations[idx].radiusMeters = Math.max(10, Number(data.radiusMeters));
  if (data.address) locations[idx].address = data.address.trim();
  if (data.isActive !== undefined) locations[idx].isActive = data.isActive;

  localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(locations));
  syncRecordToCloud(SYNC_COLLECTIONS.LOCATIONS, id, locations[idx]);
  notifyRealtimeChange(SYNC_COLLECTIONS.LOCATIONS, true);

  logAuditAction(
    actor,
    'UPDATE_LOCATION',
    'Locations',
    id,
    `Memperbarui titik lokasi ${locations[idx].name} (Radius: ${locations[idx].radiusMeters}m).`
  );

  return { success: true, message: `Titik lokasi ${locations[idx].name} berhasil diperbarui.` };
}

export function deleteLocation(actor: User, id: string): { success: boolean; message: string } {
  // Hanya Kepala Sekolah yang berwenang menghapus lokasi
  if (actor.role !== 'kepala_sekolah') {
    return { success: false, message: 'Hanya Kepala Sekolah yang memiliki wewenang menghapus lokasi presensi.' };
  }

  const locations = getAllLocations();
  if (locations.length <= 1) {
    return { success: false, message: 'Harus ada minimal 1 titik presensi sekolah yang aktif.' };
  }

  const filtered = locations.filter((l) => l.id !== id);
  localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(filtered));
  deleteRecordFromCloud(SYNC_COLLECTIONS.LOCATIONS, id);
  notifyRealtimeChange(SYNC_COLLECTIONS.LOCATIONS, true);

  logAuditAction(actor, 'DELETE_LOCATION', 'Locations', id, 'Menghapus titik presensi.');

  return { success: true, message: 'Titik lokasi presensi berhasil dihapus.' };
}

/**
 * ==========================================
 * MASTER DATA: PENGATURAN SEKOLAH (SETTINGS)
 * ==========================================
 */

export function getAppSettings(): AppSettings {
  const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  return data
    ? JSON.parse(data)
    : {
        schoolName: 'SMA Negeri 1 Prestasi',
        schoolEmail: 'kepsek@sekolah.sch.id',
        schoolAddress: 'Jl. Pendidikan No. 45, Kompleks Akademika',
        appTitle: 'KITARAJIN Presensi & Penugasan',
        storageMode: 'local_secure_vault',
        requireStrictFaceVerification: true,
        requireStrictGps: true,
        minFaceMatchThreshold: 0.75,
        themeColor: '#059669',
        lastSyncTimestamp: SEED_BASELINE_ISO,
      };
}

export function updateAppSettings(
  actor: User,
  updates: Partial<AppSettings>,
  options?: { skipWorkspaceAutoSync?: boolean }
): { success: boolean; message: string } {
  if (actor.role !== 'kepala_sekolah') {
    return { success: false, message: 'Hanya Kepala Sekolah yang berwenang mengubah pengaturan global sekolah.' };
  }

  const current = getAppSettings();
  const merged: AppSettings = {
    ...current,
    ...updates,
    lastSyncTimestamp: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
  try {
    syncRecordToCloud(SYNC_COLLECTIONS.SETTINGS, 'global', merged);
  } catch (err) {
    console.warn('Sync settings ke cloud warning:', err);
  }
  notifyRealtimeChange(SYNC_COLLECTIONS.SETTINGS, !options?.skipWorkspaceAutoSync);

  logAuditAction(actor, 'UPDATE_SETTINGS', 'Settings', 'global', 'Memperbarui pengaturan sistem dan sekolah.');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kitarajin_settings_updated', { detail: merged }));
  }

  return { success: true, message: 'Pengaturan sekolah berhasil disimpan dan disinkronkan.' };
}



/**
 * ==========================================
 * DATABASE WAJAH (KHUSUS KEPALA SEKOLAH)
 * ==========================================
 */

export function getAllFaceRegistry(): FaceRegistryItem[] {
  const data = localStorage.getItem(STORAGE_KEYS.FACE_REGISTRY);
  return data ? JSON.parse(data) : [];
}

export function getFaceRegistryByUserId(userId: string): FaceRegistryItem | undefined {
  const items = getAllFaceRegistry();
  return items.find((f) => f.userId === userId && f.isActive);
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
  // Admin dan Kepala Sekolah berwenang mengelola perekaman & database wajah
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

  const registryItem: FaceRegistryItem = {
    id: existingIndex !== -1 ? registry[existingIndex].id : `face-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    userId: targetUser.id,
    nip: targetUser.nip,
    userName: targetUser.name,
    role: targetUser.role,
    faceEmbedding: data.faceEmbedding,
    registeredPhotoRef: data.registeredPhotoRef,
    registeredBy: actor.name,
    cameraUsed: data.cameraUsed,
    qualityScore: data.qualityScore,
    updatedAt: new Date().toISOString(),
    isActive: true,
  };

  if (existingIndex !== -1) {
    registry[existingIndex] = registryItem;
  } else {
    registry.push(registryItem);
  }

  localStorage.setItem(STORAGE_KEYS.FACE_REGISTRY, JSON.stringify(registry));
  syncRecordToCloud(SYNC_COLLECTIONS.FACE_REGISTRY, registryItem.id, registryItem);
  notifyRealtimeChange(SYNC_COLLECTIONS.FACE_REGISTRY, true);

  logAuditAction(
    actor,
    'REGISTER_FACE',
    'FaceRegistry',
    registryItem.id,
    `Mendaftarkan data biometrik wajah untuk ${targetUser.name} (${targetUser.role}, NIP: ${targetUser.nip}) oleh ${actor.name} (${actor.role}).`
  );

  return {
    success: true,
    item: registryItem,
    message: `Wajah ${targetUser.name} berhasil didaftarkan di Database Wajah.`,
  };
}

export function toggleFaceStatus(actor: User, registryId: string): { success: boolean; message: string } {
  if (actor.role !== 'kepala_sekolah' && actor.role !== 'admin') {
    return { success: false, message: 'Hanya Admin atau Kepala Sekolah yang berwenang.' };
  }

  const registry = getAllFaceRegistry();
  const item = registry.find((f) => f.id === registryId);
  if (!item) return { success: false, message: 'Data wajah tidak ditemukan.' };

  item.isActive = !item.isActive;
  item.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEYS.FACE_REGISTRY, JSON.stringify(registry));
  syncRecordToCloud(SYNC_COLLECTIONS.FACE_REGISTRY, registryId, item);
  notifyRealtimeChange(SYNC_COLLECTIONS.FACE_REGISTRY, true);

  const statusText = item.isActive ? 'diaktifkan' : 'dinonaktifkan';
  logAuditAction(actor, 'TOGGLE_FACE_STATUS', 'FaceRegistry', registryId, `Status wajah ${item.userName} ${statusText}.`);

  return { success: true, message: `Data wajah ${item.userName} berhasil ${statusText}.` };
}

export function deleteFaceRegistry(actor: User, registryId: string): { success: boolean; message: string } {
  if (actor.role !== 'kepala_sekolah' && actor.role !== 'admin') {
    return { success: false, message: 'Hanya Admin atau Kepala Sekolah yang berwenang.' };
  }

  const registry = getAllFaceRegistry();
  const filtered = registry.filter((f) => f.id !== registryId);
  localStorage.setItem(STORAGE_KEYS.FACE_REGISTRY, JSON.stringify(filtered));
  deleteRecordFromCloud(SYNC_COLLECTIONS.FACE_REGISTRY, registryId);
  notifyRealtimeChange(SYNC_COLLECTIONS.FACE_REGISTRY, true);

  logAuditAction(actor, 'DELETE_FACE', 'FaceRegistry', registryId, 'Menghapus data biometrik wajah.');

  return { success: true, message: 'Data wajah berhasil dihapus dari database.' };
}

/**
 * ==========================================
 * PRESENSI MANDIRI (ATTENDANCE TRANSACTION)
 * ==========================================
 */

export function getAllAttendanceRecords(): AttendanceRecord[] {
  return safeReadArray<AttendanceRecord>(STORAGE_KEYS.ATTENDANCE).filter(
    (r) => r && r.id && !String(r.id).startsWith('att-seed-')
  );
}

/**
 * Hapus hanya riwayat presensi demo bawaan (att-seed-*) tanpa menyentuh presensi asli pegawai
 */
export function purgeDemoAttendanceRecords(): { count: number } {
  try {
    const records = safeReadArray<AttendanceRecord>(STORAGE_KEYS.ATTENDANCE);
    if (records.length === 0) return { count: 0 };
    const demoRecords = records.filter((r) => r && r.id && String(r.id).startsWith('att-seed-'));
    if (demoRecords.length === 0) return { count: 0 };

    const realRecords = records.filter((r) => r && r.id && !String(r.id).startsWith('att-seed-'));
    safeSaveJsonArray(STORAGE_KEYS.ATTENDANCE, realRecords);

    for (const dr of demoRecords) {
      try {
        deleteRecordFromCloud(SYNC_COLLECTIONS.ATTENDANCE, dr.id).catch(() => {});
      } catch {
        // ignore
      }
    }
    return { count: demoRecords.length };
  } catch (err) {
    console.warn('Error purging demo attendance:', err);
    return { count: 0 };
  }
}

export function getAttendanceForUser(userId: string): AttendanceRecord[] {
  const records = getAllAttendanceRecords();
  return records.filter((r) => r.userId === userId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Mengelompokkan catatan presensi per tanggal & per pengguna
 * sehingga setiap baris/hari memuat informasi lengkap Absen Masuk dan Absen Pulang
 */
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
    if (r.type === 'masuk') {
      item.masukRecord = r;
    } else if (r.type === 'pulang') {
      item.pulangRecord = r;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    // Sort by date descending
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

  // Validasi ketat aturan jam presensi sesuai sesi yang diatur untuk pengguna
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

  // Cegah presensi ganda untuk jenis yang sama di hari yang sama per sesi
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

  const newRecord: AttendanceRecord = {
    id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: now.toISOString(),
    ...recordData,
    date: todayStr,
    sessionId: effectiveSessionId,
    sessionName: schedule ? schedule.sessionName || schedule.name : recordData.sessionName,
  };

  records.unshift(newRecord);
  const savedLocally = safeSaveJsonArray(STORAGE_KEYS.ATTENDANCE, records);
  if (!savedLocally) {
    return {
      success: false,
      message: 'Penyimpanan lokal peramban penuh. Silakan segarkan halaman atau kosongkan log audit terlebih dahulu.',
    };
  }
  syncRecordToCloud(SYNC_COLLECTIONS.ATTENDANCE, newRecord.id, newRecord).catch(() => {});
  notifyRealtimeChange(SYNC_COLLECTIONS.ATTENDANCE, true);

  // Catat audit
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
    `Presensi ${newRecord.type.toUpperCase()} berhasil dicatat (${newRecord.status.replace('_', ' ')}) dengan verifikasi wajah (${Math.round(newRecord.faceSimilarityScore * 100)}%) dan jarak GPS (${newRecord.distanceFromLocationMeters}m).`
  );

  return {
    success: true,
    record: newRecord,
    message: `Presensi ${newRecord.type.toUpperCase()} Anda berhasil dicatat (${newRecord.status.replace('_', ' ')}).`,
  };
}


/**
 * ==========================================
 * PERIZINAN, SAKIT & DINAS (LEAVE REQUESTS)
 * ==========================================
 */

export function getAllLeaveRequests(): LeaveRequest[] {
  const data = localStorage.getItem(STORAGE_KEYS.LEAVE_REQUESTS);
  return data ? JSON.parse(data) : [];
}

export function getLeaveRequestsForUser(userId: string): LeaveRequest[] {
  const all = getAllLeaveRequests();
  return all.filter((l) => l.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
    createdAt: new Date().toISOString(),
  };

  const leaves = getAllLeaveRequests();
  leaves.unshift(newRequest);
  localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(leaves));
  syncRecordToCloud(SYNC_COLLECTIONS.LEAVE_REQUESTS, newRequest.id, newRequest);
  notifyRealtimeChange(SYNC_COLLECTIONS.LEAVE_REQUESTS, true);

  logAuditAction(
    actor,
    'SUBMIT_LEAVE',
    'LeaveRequests',
    newRequest.id,
    `Mengajukan permohonan ${newRequest.type.toUpperCase()} dari ${newRequest.startDate} s/d ${newRequest.endDate} (${newRequest.durationDays} hari).`
  );

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

  leaves[idx].status = decision;
  leaves[idx].reviewedBy = actor.name;
  leaves[idx].reviewNotes = reviewNotes?.trim();
  leaves[idx].reviewedAt = new Date().toISOString();

  localStorage.setItem(STORAGE_KEYS.LEAVE_REQUESTS, JSON.stringify(leaves));
  syncRecordToCloud(SYNC_COLLECTIONS.LEAVE_REQUESTS, requestId, leaves[idx]);
  notifyRealtimeChange(SYNC_COLLECTIONS.LEAVE_REQUESTS, true);

  logAuditAction(
    actor,
    'REVIEW_LEAVE',
    'LeaveRequests',
    requestId,
    `Meninjau izin ${leaves[idx].userName}: ${decision.toUpperCase()} (Catatan: ${reviewNotes || 'Tanpa catatan'}).`
  );

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
  const data = localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS);
  return data ? JSON.parse(data) : [];
}

export function getAssignmentsForUser(userId: string): Assignment[] {
  const all = getAllAssignments();
  return all.filter((a) => a.assignedToUserId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
    createdAt: new Date().toISOString(),
  };

  const tasks = getAllAssignments();
  tasks.unshift(newAssignment);
  localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(tasks));
  syncRecordToCloud(SYNC_COLLECTIONS.ASSIGNMENTS, newAssignment.id, newAssignment);
  notifyRealtimeChange(SYNC_COLLECTIONS.ASSIGNMENTS, true);

  logAuditAction(
    actor,
    'CREATE_ASSIGNMENT',
    'Assignments',
    newAssignment.id,
    `Membuat tugas "${newAssignment.title}" untuk ${newAssignment.assignedToName} (Tenggat: ${newAssignment.dueDate}).`
  );

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

  task.documentationPhotoRef = data.documentationPhotoRef;
  task.documentationNotes = data.documentationNotes.trim();
  task.documentationLocation = data.documentationLocation;
  task.completedAt = new Date().toISOString();
  task.status = 'proses'; // Menunggu review admin / verifikasi

  localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(tasks));
  syncRecordToCloud(SYNC_COLLECTIONS.ASSIGNMENTS, assignmentId, task);
  notifyRealtimeChange(SYNC_COLLECTIONS.ASSIGNMENTS, true);

  logAuditAction(
    actor,
    'SUBMIT_TASK_DOCS',
    'Assignments',
    assignmentId,
    `Mengunggah bukti dokumentasi foto lapangan untuk tugas "${task.title}".`
  );

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

  tasks[idx].status = status;
  tasks[idx].feedback = feedback?.trim();

  localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(tasks));
  syncRecordToCloud(SYNC_COLLECTIONS.ASSIGNMENTS, assignmentId, tasks[idx]);
  notifyRealtimeChange(SYNC_COLLECTIONS.ASSIGNMENTS, true);

  const statusLabel = status === 'selesai' ? 'SELESAI' : 'PERLU PERBAIKAN';
  logAuditAction(
    actor,
    'REVIEW_ASSIGNMENT',
    'Assignments',
    assignmentId,
    `Memverifikasi tugas "${tasks[idx].title}": ${statusLabel}.`
  );

  return {
    success: true,
    message: `Status tugas berhasil diperbarui menjadi ${status === 'selesai' ? 'Selesai' : 'Perlu Perbaikan'}.`,
  };
}
