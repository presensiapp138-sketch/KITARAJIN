/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'kepala_sekolah' | 'admin' | 'karyawan';

export type AttendanceType = 'masuk' | 'pulang';
export type AttendanceStatus = 'tepat_waktu' | 'terlambat' | 'izin' | 'sakit' | 'dinas' | 'alpa';
export type LeaveType = 'izin' | 'sakit' | 'dinas';
export type LeaveStatus = 'menunggu' | 'disetujui' | 'ditolak';
export type AssignmentStatus = 'belum_mulai' | 'proses' | 'perlu_perbaikan' | 'selesai';

// 1. Users Table Schema
export interface User {
  id: string;
  nip: string; // NIP atau ID unik
  name: string;
  email?: string;
  username: string;
  passwordHash: string; // Enkripsi SHA-256 + salt
  savedPassword?: string; // Sandi tersimpan agar dapat ditampilkan/disembunyikan & disinkronkan ke Sheet
  role: UserRole;
  departmentId?: string;
  departmentName?: string; // Nama departemen yang diketik secara manual oleh Admin/Kepala Sekolah
  position: string; // Jabatan: e.g. Kepala Sekolah, Admin TU, Guru, Staff Dapur, Satpam
  scheduleId?: string;
  assignedSessionIds?: string[]; // Sesi presensi aktif yang ditugaskan ke karyawan ini (e.g. ['sesi-1', 'sesi-2'])
  phone?: string;
  isActive: boolean;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
  diubah_pada?: string;
  status?: 'aktif' | 'dihapus';
}

// 2. Departments Table Schema
export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string;
  headName?: string;
  createdAt: string;
  diubah_pada?: string;
  status?: 'aktif' | 'dihapus';
}

// 3. Schedules Table Schema
export interface Schedule {
  id: string;
  name: string;
  sessionName?: string; // Sesi / Shift (e.g. Sesi 1, Sesi 2, Sesi 3)
  targetRole?: 'semua' | UserRole;
  checkInStart: string; // '06:00'
  checkInDeadline: string; // '07:30'
  lateToleranceMinutes: number;
  checkOutStart: string; // '11:30'
  checkOutEnd?: string; // '13:00'
  workDays: number[]; // [1,2,3,4,5,6]
  ruleNotes?: string;
  isActive: boolean;
  diubah_pada?: string;
  status?: 'aktif' | 'dihapus';
}

// 4. Locations Table Schema (Titik Presensi & Geofence)
export interface LocationConfig {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  address: string;
  isActive: boolean;
  diubah_pada?: string;
  status?: 'aktif' | 'dihapus';
}

// 5. FaceRegistry Table Schema (Database Wajah + ID File Drive)
export interface FaceRegistryItem {
  id: string;
  userId: string;
  nip: string;
  userName: string;
  role: UserRole;
  faceEmbedding: number[];
  registeredPhotoRef: string; // Data URL cache lokal atau placeholder saat dimuat dari Drive endpoint
  registeredPhotoFileId?: string; // ID File privat di Google Drive (via DriveApp)
  registeredBy: string;
  cameraUsed: 'user' | 'environment';
  qualityScore: number;
  updatedAt: string;
  isActive: boolean;
  diubah_pada?: string;
  status?: 'aktif' | 'dihapus';
}

// 6. Attendance Table Schema (Presensi TIDAK menyimpan foto, hanya nama, NIP, verifikasi & GPS)
export interface AttendanceRecord {
  id: string;
  userId: string;
  nip: string;
  userName: string;
  role: UserRole;
  date: string; // 'YYYY-MM-DD' otoritatif dari server Apps Script
  type: AttendanceType;
  timestamp: string; // ISO string otoritatif dari server Apps Script
  status: AttendanceStatus;
  latitude: number;
  longitude: number;
  distanceFromLocationMeters: number;
  isLocationValid: boolean;
  isFaceValid: boolean;
  faceSimilarityScore: number;
  photoRef?: string; // Kosong untuk presensi baru (presensi tidak menyimpan foto)
  deviceInfo: string;
  notes?: string;
  sessionId?: string;
  sessionName?: string;
  diubah_pada?: string;
  rowStatus?: 'aktif' | 'dihapus';
  syncState?: 'synced' | 'queued' | 'offline';
}

// Pasangan Riwayat Presensi Harian (Absen Masuk & Pulang)
export interface DailyAttendancePair {
  date: string;
  userId: string;
  userName: string;
  nip: string;
  role: UserRole;
  masukRecord?: AttendanceRecord;
  pulangRecord?: AttendanceRecord;
}

// 7. LeaveRequests Table Schema
export interface LeaveRequest {
  id: string;
  userId: string;
  nip: string;
  userName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  durationDays: number;
  reason: string;
  documentRef?: string;
  status: LeaveStatus;
  reviewedBy?: string;
  reviewNotes?: string;
  reviewedAt?: string;
  createdAt: string;
  diubah_pada?: string;
  rowStatus?: 'aktif' | 'dihapus';
}

// 8. Assignments Table Schema
export interface Assignment {
  id: string;
  title: string;
  description: string;
  assignedToUserId: string;
  assignedToName: string;
  assignedByUserId: string;
  assignedByName: string;
  dueDate: string;
  status: AssignmentStatus;
  completedAt?: string;
  documentationPhotoRef?: string;
  documentationNotes?: string;
  documentationLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  feedback?: string;
  createdAt: string;
  diubah_pada?: string;
  rowStatus?: 'aktif' | 'dihapus';
}

// 9. AuditLogs / Log Sheet Table Schema
export interface AuditLog {
  id: string;
  actorUserId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetEntity: string;
  targetId?: string;
  details: string;
  ipAddress?: string;
  timestamp: string;
  diubah_pada?: string;
}

// 10. Settings Table Schema
export interface AppSettings {
  id?: string;
  schoolName: string;
  schoolAddress: string;
  schoolEmail?: string;
  appTitle: string;
  storageMode: 'google_apps_script' | 'local_cache';
  requireStrictFaceVerification: boolean;
  requireStrictGps: boolean;
  minFaceMatchThreshold: number;
  themeColor: string;
  lastSyncTimestamp?: string;
  diubah_pada?: string;
}

export interface AppsScriptConfig {
  webAppUrl: string;
  apiToken: string;
  isLocked: boolean;
  updatedAt?: string;
}

export interface SheetRepairReport {
  tabsCreated: string[];
  headersAdded: Array<{ table: string; columns: string[] }>;
  idsRepaired: number;
  legacyRowsImported: number;
  metadataNormalized: number;
  demoRemoved: number;
  photosLinked: number;
  crossRefsRepaired: number;
  summary: string;
}

export interface SystemCheckResult {
  checkedAt: string;
  latencyMs: number;
  frontendConfigured: boolean;
  frontendUrlPresent: boolean;
  frontendTokenPresent: boolean;
  scriptReachable: boolean;
  authorized: boolean;
  sheetsConnected: boolean;
  driveConnected: boolean;
  sheetName?: string;
  spreadsheetId?: string;
  driveFolderName?: string;
  tabsStatus?: Array<{ name: string; exists: boolean; rows: number }>;
  syncIssues?: string[];
  missingFrontendFields: string[];
  missingScriptProperties: string[];
  serverTime?: string;
  error?: string;
}
