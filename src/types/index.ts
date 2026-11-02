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
  role: UserRole;
  departmentId?: string;
  position: string; // Jabatan: e.g. Kepala Sekolah, Admin TU, Guru, Staff Dapur, Satpam
  scheduleId?: string;
  assignedSessionIds?: string[]; // Sesi presensi aktif yang ditugaskan ke karyawan ini (e.g. ['sesi-1', 'sesi-2'])
  phone?: string;
  isActive: boolean;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// 2. Departments Table Schema
export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string;
  headName?: string;
  createdAt: string;
}

// 3. Schedules Table Schema
export interface Schedule {
  id: string;
  name: string;
  sessionName?: string; // Sesi / Shift (e.g. Sesi Pagi, Sesi Khusus KS & Admin, Sesi Piket)
  targetRole?: 'semua' | UserRole; // 'semua' | 'kepala_sekolah' | 'admin' | 'karyawan'
  checkInStart: string; // '06:30' (Jam & Menit presensi dibuka)
  checkInDeadline: string; // '07:30' (Jam & Menit batas masuk tepat waktu)
  lateToleranceMinutes: number; // Toleransi keterlambatan (misal 15 menit)
  checkOutStart: string; // '15:00' (Jam & Menit mulai presensi pulang)
  checkOutEnd?: string; // '18:00' (Jam & Menit batas akhir presensi pulang)
  workDays: number[]; // [1,2,3,4,5] (Senin-Jumat)
  ruleNotes?: string; // Catatan dan ketentuan manual jadwal
  isActive: boolean;
}

// 4. Locations Table Schema (Titik Presensi & Geofence)
export interface LocationConfig {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number; // Radius toleransi (e.g. 50 meter)
  address: string;
  isActive: boolean;
}

// 5. FaceRegistry Table Schema (Database Wajah Terpusat Kepala Sekolah)
export interface FaceRegistryItem {
  id: string;
  userId: string;
  nip: string;
  userName: string;
  role: UserRole;
  faceEmbedding: number[]; // Vektor fitur wajah numerik nyata (bukan teks palsu)
  registeredPhotoRef: string; // Referensi URL/Blob penyimpanan foto
  registeredBy: string; // ID Kepala Sekolah / Admin yang mendaftarkan
  cameraUsed: 'user' | 'environment';
  qualityScore: number; // Skor kualitas pengambilan (0-100)
  updatedAt: string;
  isActive: boolean;
}

// 6. Attendance Table Schema (Riwayat Presensi Masuk & Pulang)
export interface AttendanceRecord {
  id: string;
  userId: string;
  nip: string;
  userName: string;
  role: UserRole;
  date: string; // 'YYYY-MM-DD'
  type: AttendanceType;
  timestamp: string; // ISO string
  status: AttendanceStatus;
  latitude: number;
  longitude: number;
  distanceFromLocationMeters: number;
  isLocationValid: boolean;
  isFaceValid: boolean;
  faceSimilarityScore: number;
  photoRef: string; // Foto bukti presensi
  deviceInfo: string;
  notes?: string;
  sessionId?: string;
  sessionName?: string;
}

// Pasangan Riwayat Presensi Harian (Absen Masuk & Pulang)
export interface DailyAttendancePair {
  date: string; // 'YYYY-MM-DD'
  userId: string;
  userName: string;
  nip: string;
  role: UserRole;
  masukRecord?: AttendanceRecord;
  pulangRecord?: AttendanceRecord;
}

// 7. LeaveRequests Table Schema (Pengajuan Izin, Sakit, Dinas)
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
  documentRef?: string; // Dokumen surat dokter / surat tugas
  status: LeaveStatus;
  reviewedBy?: string;
  reviewNotes?: string;
  reviewedAt?: string;
  createdAt: string;
}

// 8. Assignments Table Schema (Tugas & Dokumentasi)
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
}

// 9. AuditLogs Table Schema (Log Rekam Jejak Admin & Sistem)
export interface AuditLog {
  id: string;
  actorUserId: string;
  actorName: string;
  actorRole: UserRole;
  action: string; // e.g. 'UPDATE_LOCATION', 'REGISTER_FACE', 'APPROVE_LEAVE'
  targetEntity: string; // 'FaceRegistry', 'Locations', 'Users', etc.
  targetId?: string;
  details: string;
  ipAddress?: string;
  timestamp: string;
}

// 10. Settings Table Schema (Pengaturan Global & Koneksi Spreadsheet)
export interface AppSettings {
  schoolName: string;
  schoolAddress: string;
  appTitle: string;
  storageMode: 'local_secure_vault' | 'google_workspace_sync' | 'hybrid';
  googleSheetSpreadsheetId?: string;
  googleDriveFolderId?: string;
  requireStrictFaceVerification: boolean;
  requireStrictGps: boolean;
  minFaceMatchThreshold: number; // e.g. 0.75 (75%)
  themeColor: string;
  lastSyncTimestamp?: string;
  googleAccountEmail?: string;
  isGoogleConnected?: boolean;
  googleConnectedAt?: string;
}
