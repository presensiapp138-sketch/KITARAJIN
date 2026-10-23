/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserRole } from '../types';

export interface NavItem {
  id: string;
  label: string;
  iconName: string;
  badge?: string;
  description: string;
  roles: UserRole[];
  group: 'utama' | 'operasional' | 'manajemen' | 'pengaturan';
}

export const NAVIGATION_ITEMS: NavItem[] = [
  // Utama
  {
    id: 'dashboard',
    label: 'Dashboard',
    iconName: 'LayoutDashboard',
    description: 'Ringkasan presensi harian, grafik kehadiran, dan status hari ini.',
    roles: ['kepala_sekolah', 'admin', 'karyawan'],
    group: 'utama',
  },
  {
    id: 'presensi',
    label: 'Presensi Mandiri',
    iconName: 'Camera',
    badge: 'Wajib',
    description: 'Presensi masuk & pulang dengan verifikasi wajah aktif dan GPS radius.',
    roles: ['kepala_sekolah', 'admin', 'karyawan'],
    group: 'utama',
  },
  {
    id: 'riwayat',
    label: 'Riwayat Presensi',
    iconName: 'CalendarCheck',
    description: 'Histori presensi harian, mingguan, dan bulanan.',
    roles: ['kepala_sekolah', 'admin', 'karyawan'],
    group: 'utama',
  },

  // Operasional
  {
    id: 'izin',
    label: 'Pengajuan Izin',
    iconName: 'FileText',
    description: 'Pengajuan dan persetujuan izin, sakit, serta dinas luar.',
    roles: ['kepala_sekolah', 'admin', 'karyawan'],
    group: 'operasional',
  },
  {
    id: 'tugas',
    label: 'Tugas & Dokumentasi',
    iconName: 'ClipboardList',
    description: 'Distribusi tugas staf dan unggah foto dokumentasi kegiatan.',
    roles: ['kepala_sekolah', 'admin', 'karyawan'],
    group: 'operasional',
  },
  {
    id: 'laporan',
    label: 'Laporan Rekap',
    iconName: 'BarChart3',
    description: 'Rekapitulasi kehadiran harian, mingguan, bulanan, dan ekspor data.',
    roles: ['kepala_sekolah', 'admin', 'karyawan'],
    group: 'operasional',
  },

  // Manajemen
  {
    id: 'database_wajah',
    label: 'Database Wajah',
    iconName: 'ScanFace',
    badge: 'Admin & KS',
    description: 'Perekaman biometrik wajah dan validasi dataset wajah seluruh staf/karyawan sekolah.',
    roles: ['admin', 'kepala_sekolah'],
    group: 'manajemen',
  },
  {
    id: 'karyawan_users',
    label: 'Kelola Karyawan',
    iconName: 'Users',
    description: 'Data pegawai, NIP/ID, departemen, jadwal, dan status akun.',
    roles: ['kepala_sekolah', 'admin'],
    group: 'manajemen',
  },
  {
    id: 'departemen',
    label: 'Departemen',
    iconName: 'Building2',
    description: 'Unit kerja sekolah: TU, Guru, Dapur, Satpam, Kebersihan, dll.',
    roles: ['kepala_sekolah', 'admin'],
    group: 'manajemen',
  },
  {
    id: 'jadwal',
    label: 'Jadwal & Shift',
    iconName: 'Clock',
    description: 'Aturan jam masuk, jam pulang, dan toleransi keterlambatan.',
    roles: ['kepala_sekolah', 'admin'],
    group: 'manajemen',
  },
  {
    id: 'lokasi',
    label: 'Lokasi & Radius',
    iconName: 'MapPin',
    badge: 'Khusus KS',
    description: 'Titik koordinat GPS sekolah dan batas radius presensi (Wewenang eksklusif Kepala Sekolah).',
    roles: ['kepala_sekolah'], // Admin DILARANG atur lokasi & radius
    group: 'manajemen',
  },
  {
    id: 'admin_users',
    label: 'Kelola Admin',
    iconName: 'ShieldCheck',
    badge: 'Khusus KS',
    description: 'Manajemen akun admin sekolah dan wewenang operasional.',
    roles: ['kepala_sekolah'],
    group: 'manajemen',
  },

  // Pengaturan & Audit
  {
    id: 'audit_logs',
    label: 'Log Audit Admin',
    iconName: 'ShieldAlert',
    description: 'Catatan transparansi seluruh aktivitas dan perubahan data penting.',
    roles: ['kepala_sekolah'],
    group: 'pengaturan',
  },
  {
    id: 'pengaturan',
    label: 'Pengaturan & Sheets',
    iconName: 'Settings',
    description: 'Sinkronisasi 10 tab Google Sheets, profil sekolah, dan opsi sistem.',
    roles: ['kepala_sekolah'],
    group: 'pengaturan',
  },
];

export function getNavItemsForRole(role: UserRole): NavItem[] {
  return NAVIGATION_ITEMS.filter((item) => item.roles.includes(role));
}
