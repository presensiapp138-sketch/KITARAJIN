/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserRole } from '../types';

export interface PermissionDefinition {
  code: string;
  category: string;
  label: string;
  description: string;
  allowedRoles: UserRole[];
}

export const PERMISSION_MATRIX: PermissionDefinition[] = [
  // Presensi Wajib (Semua Peran Wajib!)
  {
    code: 'ATTENDANCE_SELF',
    category: 'Presensi',
    label: 'Melakukan Presensi Mandiri',
    description: 'Wajib melakukan verifikasi wajah dan validasi GPS radius untuk masuk dan pulang.',
    allowedRoles: ['kepala_sekolah', 'admin', 'karyawan'],
  },
  {
    code: 'ATTENDANCE_VIEW_SELF',
    category: 'Presensi',
    label: 'Lihat Riwayat Presensi Sendiri',
    description: 'Melihat histori presensi harian, mingguan, dan bulanan akun sendiri.',
    allowedRoles: ['kepala_sekolah', 'admin', 'karyawan'],
  },

  // Database Wajah (Khusus Kepala Sekolah!)
  {
    code: 'FACE_DB_MANAGE_ALL',
    category: 'Database Wajah',
    label: 'Kelola Database Wajah Seluruh Pengguna',
    description: 'Mendaftarkan, memperbarui, dan menonaktifkan data wajah Kepala Sekolah, Admin, dan Karyawan.',
    allowedRoles: ['kepala_sekolah'],
  },
  {
    code: 'FACE_DB_VIEW_STATUS',
    category: 'Database Wajah',
    label: 'Lihat Status Registrasi Wajah',
    description: 'Mengecek apakah karyawan/admin sudah terdaftar di database wajah.',
    allowedRoles: ['kepala_sekolah', 'admin'],
  },

  // Manajemen Akun & Pengguna
  {
    code: 'USERS_MANAGE_ADMINS',
    category: 'Manajemen Pengguna',
    label: 'Kelola Akun Admin',
    description: 'Membuat, mengubah status, dan menonaktifkan akun Admin sekolah.',
    allowedRoles: ['kepala_sekolah'],
  },
  {
    code: 'USERS_MANAGE_STAFF',
    category: 'Manajemen Pengguna',
    label: 'Kelola Akun Karyawan / Tendik',
    description: 'Menambah, mengedit, dan menonaktifkan akun staf/karyawan serta NIP dan departemen.',
    allowedRoles: ['kepala_sekolah', 'admin'],
  },

  // Master Data (Departemen, Lokasi & Jadwal)
  {
    code: 'MASTER_DEPARTMENTS',
    category: 'Master Data',
    label: 'Kelola Departemen',
    description: 'Mengatur unit kerja (Tata Usaha, Guru, Dapur, Keamanan, Kebersihan, dll).',
    allowedRoles: ['kepala_sekolah', 'admin'],
  },
  {
    code: 'MASTER_SCHEDULES',
    category: 'Master Data',
    label: 'Kelola Jadwal & Jam Kerja',
    description: 'Mengatur jam masuk, jam pulang, toleransi keterlambatan, dan hari kerja.',
    allowedRoles: ['kepala_sekolah', 'admin'],
  },
  {
    code: 'MASTER_LOCATIONS',
    category: 'Master Data',
    label: 'Kelola Lokasi & Radius GPS',
    description: 'Mengatur koordinat titik presensi sekolah dan batas radius meter.',
    allowedRoles: ['kepala_sekolah', 'admin'],
  },

  // Perizinan & Sakit
  {
    code: 'LEAVE_SUBMIT',
    category: 'Perizinan',
    label: 'Pengajuan Izin, Sakit & Dinas',
    description: 'Mengajukan permohonan tidak hadir disertai tanggal, alasan, dan bukti dokumen.',
    allowedRoles: ['kepala_sekolah', 'admin', 'karyawan'],
  },
  {
    code: 'LEAVE_APPROVE',
    category: 'Perizinan',
    label: 'Peninjauan & Persetujuan Izin',
    description: 'Menyetujui atau menolak pengajuan izin dari karyawan/tendik.',
    allowedRoles: ['kepala_sekolah', 'admin'],
  },

  // Tugas & Dokumentasi
  {
    code: 'TASK_ASSIGN',
    category: 'Penugasan',
    label: 'Membuat & Mendelegasikan Tugas',
    description: 'Membuat instruksi tugas dan menugaskan karyawan tertentu.',
    allowedRoles: ['kepala_sekolah', 'admin'],
  },
  {
    code: 'TASK_EXECUTE_SUBMIT',
    category: 'Penugasan',
    label: 'Mengerjakan & Unggah Bukti Tugas',
    description: 'Mengunggah dokumentasi foto, waktu, lokasi GPS, dan keterangan progres.',
    allowedRoles: ['karyawan', 'admin'],
  },
  {
    code: 'TASK_VERIFY',
    category: 'Penugasan',
    label: 'Verifikasi & Review Hasil Tugas',
    description: 'Memeriksa foto dokumentasi dan menandai status tugas selesai / revisi.',
    allowedRoles: ['kepala_sekolah', 'admin'],
  },

  // Laporan & Rekap
  {
    code: 'REPORT_ALL_VIEW',
    category: 'Laporan',
    label: 'Laporan Seluruh Pengguna & Ekspor',
    description: 'Melihat rekap presensi seluruh kepala sekolah, admin, dan karyawan (Harian/Mingguan/Bulanan).',
    allowedRoles: ['kepala_sekolah'],
  },
  {
    code: 'REPORT_STAFF_VIEW',
    category: 'Laporan',
    label: 'Laporan Presensi Karyawan Binaan',
    description: 'Melihat rekap presensi staf dan karyawan sesuai divisi/departemen.',
    allowedRoles: ['admin'],
  },

  // Audit Logs & Pengaturan Sistem
  {
    code: 'AUDIT_LOG_VIEW',
    category: 'Keamanan & Audit',
    label: 'Lihat Jejak Audit (Audit Logs)',
    description: 'Melihat catatan riwayat seluruh tindakan admin dan perubahan data penting.',
    allowedRoles: ['kepala_sekolah'],
  },
  {
    code: 'SYSTEM_SETTINGS',
    category: 'Pengaturan Sistem',
    label: 'Pengaturan Penyimpanan & Sekolah',
    description: 'Konfigurasi integrasi Google Sheets, nama sekolah, dan toleransi keamanan.',
    allowedRoles: ['kepala_sekolah'],
  },
];

export function hasPermission(role: UserRole, permissionCode: string): boolean {
  const perm = PERMISSION_MATRIX.find((p) => p.code === permissionCode);
  if (!perm) return false;
  return perm.allowedRoles.includes(role);
}
