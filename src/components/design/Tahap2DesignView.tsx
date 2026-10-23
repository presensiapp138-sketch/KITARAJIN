/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Layers,
  ShieldCheck,
  Workflow,
  Smartphone,
  Monitor,
  Database,
  CheckCircle2,
  XCircle,
  ScanFace,
  MapPin,
  Clock,
  ArrowRight,
  FileSpreadsheet,
  AlertTriangle,
  Lock,
  ChevronDown,
  Info,
} from 'lucide-react';
import { UserRole } from '../../types';
import { PERMISSION_MATRIX } from '../../config/permissions';
import { NAVIGATION_ITEMS, getNavItemsForRole } from '../../config/navigation';

interface Tahap2DesignViewProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  onNavigateToStage3Preview?: () => void;
}

export const Tahap2DesignView: React.FC<Tahap2DesignViewProps> = ({
  currentRole,
  onRoleChange,
}) => {
  const [activeTab, setActiveTab] = useState<'menu' | 'alur' | 'rbac' | 'sheets' | 'layout'>('menu');
  const [selectedFlow, setSelectedFlow] = useState<number>(3); // Default on Alur 3 (Registrasi Wajah) or Alur 4 (Presensi)

  const navItems = getNavItemsForRole(currentRole);

  const flows = [
    {
      stepNumber: 1,
      title: 'Alur 1 — Persiapan oleh Kepala Sekolah',
      role: 'Kepala Sekolah',
      steps: [
        'Kepala Sekolah login menggunakan email terverifikasi.',
        'Membuat akun Admin baru (Username, Password acak aman, Hak akses).',
        'Menentukan konfigurasi penyimpanan data (Struktur 10 Tab Sheets / Vault).',
        'Admin menerima kredensial untuk dapat masuk ke sistem.',
      ],
      highlight: 'Otoritas tertinggi pembuatan admin dan konfigurasi data sekolah.',
    },
    {
      stepNumber: 2,
      title: 'Alur 2 — Persiapan oleh Admin',
      role: 'Admin',
      steps: [
        'Admin login dengan username dan password yang diberikan Kepala Sekolah.',
        'Membuat master Departemen (Tata Usaha, Guru, Dapur, Satpam, Kebersihan).',
        'Menambahkan akun Karyawan beserta NIP/ID unik.',
        'Mengatur jadwal shift (Jam masuk, jam pulang, toleransi keterlambatan).',
        'Menentukan titik koordinat presensi dan radius toleransi (meter).',
        'Memastikan seluruh master data tersimpan rapi.',
      ],
      highlight: 'Pengaturan operasional harian sekolah dan parameter geofence.',
    },
    {
      stepNumber: 3,
      title: 'Alur 3 — Registrasi Database Wajah (Menu Khusus KS)',
      role: 'Khusus Kepala Sekolah',
      steps: [
        'Kepala Sekolah membuka menu khusus "Database Wajah".',
        'Memilih karyawan/admin yang akan didaftarkan berdasarkan NIP/ID.',
        'Meminta izin kamera pengguna (bisa pilih kamera depan atau belakang).',
        'Mengambil sampel citra wajah dengan pencahayaan yang cukup.',
        'Algoritma mengekstraksi vektor landmark & embedding fitur geometri wajah.',
        'Data vektor wajah terenkripsi dikaitkan dengan NIP/ID karyawan bersangkutan.',
        'Admin tidak boleh mendaftarkan/mengubah wajahnya sendiri atau wajah Kepala Sekolah.',
      ],
      highlight: 'Keamanan biometrik terpusat untuk mencegah pemalsuan identitas presensi.',
    },
    {
      stepNumber: 4,
      title: 'Alur 4 — Presensi Masuk & Pulang (Wajib Semua Pengguna)',
      role: 'Semua Pengguna (KS, Admin, Karyawan)',
      steps: [
        'Pengguna membuka menu Presensi Mandiri.',
        'Sistem otomatis mendeteksi akun yang sedang aktif (bukan ketik nama bebas).',
        'Sistem meminta izin GPS dan Kamera.',
        'Pemeriksaan GPS: Menghitung jarak geodesik Haversine ke titik lokasi sekolah.',
        'Pemeriksaan Wajah: Mencocokkan wajah aktif dengan data referensi di Database Wajah.',
        'Jika LOKASI DI LUAR RADIUS atau WAJAH TIDAK COCOK, presensi ditolak dengan pesan jelas.',
        'Jika LOKASI dan WAJAH VALID, catatan disimpan dengan waktu, tanggal, status, dan foto.',
      ],
      highlight: 'Tidak ada perlakuan khusus: KS dan Admin wajib patuh aturan wajah & GPS yang sama.',
    },
    {
      stepNumber: 5,
      title: 'Alur 5 — Pengajuan Izin & Sakit',
      role: 'Karyawan / Admin',
      steps: [
        'Karyawan memilih menu Pengajuan Izin.',
        'Memilih kategori: Izin Pribadi, Sakit, atau Tugas Dinas Luar.',
        'Mengisi tanggal mulai s/d selesai dan alasan tertulis.',
        'Mengunggah bukti pendukung (surat dokter / surat dinas).',
        'Admin atau Kepala Sekolah meninjau (Review) dan menentukan Disetujui/Ditolak.',
        'Pengajuan izin TIDAK otomatis menjadi presensi hadir di hari kerja.',
      ],
      highlight: 'Pencatatan transparan dokumen pendukung dan verifikasi manual berjenjang.',
    },
    {
      stepNumber: 6,
      title: 'Alur 6 — Tugas & Dokumentasi Lapangan',
      role: 'Admin & Karyawan',
      steps: [
        'Admin membuat penugasan dan menunjuk karyawan pelaksana.',
        'Karyawan menerima notifikasi tugas pada dashboard.',
        'Karyawan melaksanakan tugas di lapangan.',
        'Karyawan mengambil foto bukti dokumentasi langsung di lokasi.',
        'Sistem merekam waktu, koordinat GPS, foto bukti, dan catatan progres.',
        'Admin memverifikasi bukti dan menandai status Selesai atau Perlu Perbaikan.',
      ],
      highlight: 'Dokumentasi terintegrasi geotagging dan timestamp otomatis.',
    },
    {
      stepNumber: 7,
      title: 'Alur 7 — Rekapitulasi Laporan & Audit',
      role: 'Kepala Sekolah & Admin',
      steps: [
        'Sistem mengumpulkan seluruh riwayat kehadiran otomatis.',
        'Filter fleksibel: Harian, Mingguan, Bulanan, per Departemen, atau per Karyawan.',
        'Kalkulasi otomatis jumlah Hadir, Terlambat, Izin, Sakit, Dinas, dan Alpa.',
        'Kepala Sekolah melihat laporan seluruh civitas sekolah.',
        'Admin melihat laporan karyawan sesuai unit binaan.',
        'Karyawan hanya dapat melihat data presensi miliknya sendiri.',
        'Dukungan ekspor data ke format Google Sheets (CSV/Excel) siap pakai.',
      ],
      highlight: 'Penyajian data akurat, bersih, dan sesuai hak akses.',
    },
  ];

  const sheetsStructure = [
    {
      tab: '1. Users',
      desc: 'Master pengguna akun (Kepala Sekolah, Admin, Karyawan/Tendik)',
      fields: 'id, nip, name, username, passwordHash, role, departmentId, position, scheduleId, isActive, createdAt',
    },
    {
      tab: '2. Departments',
      desc: 'Master unit kerja dan divisi sekolah',
      fields: 'id, name, code, description, headName, createdAt',
    },
    {
      tab: '3. Schedules',
      desc: 'Master jam operasional dan toleransi keterlambatan',
      fields: 'id, name, checkInStart, checkInDeadline, lateToleranceMinutes, checkOutStart, workDays, isActive',
    },
    {
      tab: '4. Locations',
      desc: 'Master titik koordinat GPS dan batas radius presensi',
      fields: 'id, name, latitude, longitude, radiusMeters, address, isActive',
    },
    {
      tab: '5. FaceRegistry',
      desc: 'Database fitur wajah terpusat (Khusus wewenang Kepala Sekolah)',
      fields: 'id, userId, nip, userName, role, faceEmbedding, registeredPhotoRef, registeredBy, qualityScore, updatedAt',
    },
    {
      tab: '6. Attendance',
      desc: 'Catatan transaksi presensi masuk dan pulang',
      fields: 'id, userId, nip, date, type, timestamp, status, latitude, longitude, distanceMeters, isFaceValid, photoRef',
    },
    {
      tab: '7. LeaveRequests',
      desc: 'Pengajuan cuti, sakit, izin, dan dinas luar',
      fields: 'id, userId, nip, type, startDate, endDate, durationDays, reason, documentRef, status, reviewedBy, reviewedAt',
    },
    {
      tab: '8. Assignments',
      desc: 'Distribusi tugas operasional dan bukti dokumentasi foto',
      fields: 'id, title, description, assignedToUserId, assignedByUserId, dueDate, status, documentationPhotoRef, completedAt',
    },
    {
      tab: '9. AuditLogs',
      desc: 'Jejak rekam aktivitas admin dan perubahan data krusial',
      fields: 'id, actorUserId, actorName, actorRole, action, targetEntity, targetId, details, timestamp',
    },
    {
      tab: '10. Settings',
      desc: 'Konfigurasi global sekolah dan parameter sinkronisasi',
      fields: 'schoolName, schoolAddress, appTitle, storageMode, minFaceMatchThreshold, requireStrictGps, lastSyncTimestamp',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner Tahap 2 */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/20 via-transparent to-transparent pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold mb-3">
              <Layers className="w-3.5 h-3.5" />
              <span>Tahap 2 dari 9: Desain & Perancangan Sistem</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Arsitektur Sistem KITARAJIN
            </h1>
            <p className="text-slate-300 text-sm sm:text-base mt-1 max-w-2xl leading-relaxed">
              Struktur menu adaptif 3 peran, alur 7 proses bisnis, matriks hak akses RBAC, dan skema
              10 tab basis data Google Sheets.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/15">
              <span className="text-[11px] text-slate-300 uppercase tracking-wider block font-semibold">
                Peran Pengujian:
              </span>
              <span className="text-sm font-bold text-emerald-400 capitalize">
                {currentRole.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation for Stage 2 */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-slate-700/60 overflow-x-auto pb-1 text-sm">
          <button
            type="button"
            onClick={() => setActiveTab('menu')}
            className={`px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'menu'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>1. Struktur Menu</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('alur')}
            className={`px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'alur'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Workflow className="w-4 h-4" />
            <span>2. Alur Pengguna (7 Alur)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rbac')}
            className={`px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'rbac'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>3. Matriks Hak Akses (RBAC)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sheets')}
            className={`px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'sheets'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>4. Struktur 10 Tab Sheets</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('layout')}
            className={`px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'layout'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>5. Rancangan UI Responsif</span>
          </button>
        </div>
      </div>

      {/* TAB 1: STRUKTUR MENU */}
      {activeTab === 'menu' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-600" />
                  Struktur Menu Dinamis Berdasarkan Peran
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Setiap pengguna disajikan menu yang disesuaikan dengan wewenang operasionalnya.
                </p>
              </div>

              {/* Role Toggle Selector in Card */}
              <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200 self-start sm:self-auto">
                <span className="text-xs font-semibold text-slate-500 px-2">Lihat Menu:</span>
                <button
                  type="button"
                  onClick={() => onRoleChange('kepala_sekolah')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    currentRole === 'kepala_sekolah'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Kepala Sekolah (13 Menu)
                </button>
                <button
                  type="button"
                  onClick={() => onRoleChange('admin')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    currentRole === 'admin'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Admin (9 Menu)
                </button>
                <button
                  type="button"
                  onClick={() => onRoleChange('karyawan')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    currentRole === 'karyawan'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Karyawan (5 Menu)
                </button>
              </div>
            </div>

            {/* Menu Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              {navItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-emerald-300 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-emerald-700 shadow-xs group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <span className="text-xs font-bold">{idx + 1}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.badge.includes('Khusus KS')
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-slate-800 text-sm mt-3 group-hover:text-emerald-700">
                    {item.label}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {item.description}
                  </p>
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="capitalize">Kategori: {item.group}</span>
                    <span className="font-mono text-[10px]">ID: {item.id}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Special Callout: Face Database Rule */}
            <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                  Aturan Khusus Database Wajah
                </h4>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                  Sesuai ketentuan, menu <strong>Database Wajah</strong> hanya dapat diakses oleh{' '}
                  <strong>Kepala Sekolah</strong>. Admin operasional tidak dapat mengakses atau
                  mengubah data biometrik wajah dirinya sendiri maupun Kepala Sekolah. Namun, saat
                  presensi, <strong>seluruh pengguna (termasuk Kepala Sekolah & Admin)</strong> tetap
                  wajib diverifikasi oleh sistem yang sama.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ALUR PENGGUNA (7 ALUR) */}
      {activeTab === 'alur' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
            <div className="pb-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Workflow className="w-5 h-5 text-emerald-600" />
                7 Alur Utama Proses Bisnis KITARAJIN
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Alur sekuensial yang memastikan integritas data, validasi ganda, dan transparansi
                rekapitulasi.
              </p>
            </div>

            {/* Flow Selector Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-5">
              {flows.map((f) => (
                <button
                  key={f.stepNumber}
                  type="button"
                  onClick={() => setSelectedFlow(f.stepNumber)}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    selectedFlow === f.stepNumber
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-[10px] uppercase font-bold opacity-80">
                    Alur {f.stepNumber}
                  </div>
                  <div className="text-xs truncate font-semibold mt-0.5">
                    {f.title.split('—')[1] || f.title}
                  </div>
                </button>
              ))}
            </div>

            {/* Active Flow Detail View */}
            {(() => {
              const currentF = flows.find((f) => f.stepNumber === selectedFlow)!;
              return (
                <div className="mt-6 p-6 rounded-2xl bg-gradient-to-br from-slate-50 to-emerald-50/30 border border-emerald-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
                    <div>
                      <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                        Tahapan Terpilih
                      </span>
                      <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">
                        {currentF.title}
                      </h3>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-semibold self-start sm:self-auto">
                      <span>Pelaksana: {currentF.role}</span>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {currentF.steps.map((st, i) => (
                      <div key={i} className="flex items-start gap-3 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                          {st}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 p-3 rounded-xl bg-emerald-100/60 border border-emerald-200 flex items-center gap-2.5 text-emerald-900 text-xs font-medium">
                    <Info className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span><strong>Prinsip Utama:</strong> {currentF.highlight}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB 3: MATRIKS HAK AKSES (RBAC) */}
      {activeTab === 'rbac' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                Matriks Hak Akses & Perizinan (Role-Based Access Control)
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Daftar lengkap 17 wewenang sistem dan penetapan akses untuk masing-masing peran.
              </p>
            </div>
            <div className="text-xs bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600">
              Total: <strong>{PERMISSION_MATRIX.length} Aturan Akses</strong>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-100/80 text-slate-700 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Fitur / Perizinan</th>
                  <th className="py-3 px-3 text-center">Kepala Sekolah</th>
                  <th className="py-3 px-3 text-center">Admin</th>
                  <th className="py-3 px-3 text-center">Karyawan / Tendik</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {PERMISSION_MATRIX.map((perm) => (
                  <tr key={perm.code} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{perm.label}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{perm.description}</div>
                      <span className="inline-block mt-1 text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                        {perm.code}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {perm.allowedRoles.includes('kepala_sekolah') ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full font-bold text-xs border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Diizinkan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-600 bg-rose-50 px-2 py-1 rounded-full font-medium text-xs">
                          <XCircle className="w-3.5 h-3.5" /> Ditolak
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {perm.allowedRoles.includes('admin') ? (
                        <span className="inline-flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full font-bold text-xs border border-indigo-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Diizinkan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400 bg-slate-100 px-2 py-1 rounded-full font-medium text-xs">
                          <XCircle className="w-3.5 h-3.5" /> Ditolak
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {perm.allowedRoles.includes('karyawan') ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full font-bold text-xs border border-amber-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Diizinkan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400 bg-slate-100 px-2 py-1 rounded-full font-medium text-xs">
                          <XCircle className="w-3.5 h-3.5" /> Ditolak
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: STRUKTUR 10 TAB GOOGLE SHEETS */}
      {activeTab === 'sheets' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          <div className="pb-5 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Rancangan 10 Tab Database Google Sheets
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Struktur data relasional dengan Unique ID konsisten dan format siap ekspor/impor.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sheetsStructure.map((sheet, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-emerald-300 hover:shadow-xs transition-all"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                      {idx + 1}
                    </div>
                    <span className="font-extrabold text-slate-900 text-sm">{sheet.tab}</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-200/70 text-slate-700 rounded">
                    Sheet Tab
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-2 font-medium">{sheet.desc}</p>
                <div className="mt-3 p-2.5 bg-slate-900 text-slate-200 rounded-lg font-mono text-[11px] leading-relaxed break-all">
                  <span className="text-emerald-400 font-bold block mb-0.5">Kolom Header:</span>
                  {sheet.fields}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: RANCANGAN UI RESPONSIF */}
      {activeTab === 'layout' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
            <div className="pb-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-600" />
                Rancangan Antarmuka Responsif (HP & Komputer)
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Layout dirancang khusus agar nyaman digunakan pada layar smartphone staf di lapangan
                maupun layar desktop pengelola sekolah.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {/* Mockup Preview Layar HP */}
              <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    Tampilan Mode Smartphone (Mobile View)
                  </span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold">
                    Optimal untuk Presensi
                  </span>
                </div>

                {/* Mobile Device Mockup */}
                <div className="max-w-[320px] mx-auto bg-white rounded-3xl border-4 border-slate-800 shadow-xl overflow-hidden p-3.5 space-y-3">
                  {/* Fake status bar */}
                  <div className="flex justify-between items-center text-[10px] text-slate-500 px-1">
                    <span>07:15</span>
                    <div className="flex items-center gap-1">
                      <span>4G</span>
                      <span>GPS Aktif</span>
                    </div>
                  </div>

                  {/* Header in phone */}
                  <div className="p-3 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl text-white">
                    <div className="text-[10px] opacity-80">Selamat Pagi,</div>
                    <div className="text-xs font-bold">Siti Rahmawati, S.Pd.</div>
                    <div className="text-[10px] mt-1 bg-white/20 inline-block px-1.5 py-0.2 rounded">
                      NIP: 198804152011012003
                    </div>
                  </div>

                  {/* Quick Card Status */}
                  <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-600" />
                      <span>Jarak: <strong>18 m</strong> (Dalam Radius)</span>
                    </div>
                    <span className="text-emerald-700 font-bold">Valid</span>
                  </div>

                  {/* Big Action Button */}
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-2">
                    <div className="w-12 h-12 mx-auto rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md">
                      <ScanFace className="w-6 h-6" />
                    </div>
                    <div className="font-bold text-xs text-slate-900">Presensi Masuk</div>
                    <div className="text-[10px] text-slate-500">
                      Kamera depan/belakang aktif &bull; Wajah terverifikasi
                    </div>
                  </div>

                  {/* Navigation bar mock in phone */}
                  <div className="pt-2 border-t border-slate-100 flex justify-around text-[9px] text-slate-500">
                    <span className="text-emerald-600 font-bold">Dashboard</span>
                    <span className="font-bold text-emerald-700">Presensi</span>
                    <span>Riwayat</span>
                    <span>Tugas</span>
                  </div>
                </div>
              </div>

              {/* Mockup Preview Layar Komputer / Desktop */}
              <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Monitor className="w-4 h-4 text-emerald-600" />
                    Tampilan Mode Desktop (Admin & Kepala Sekolah)
                  </span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-semibold">
                    Optimal untuk Manajemen & Rekap
                  </span>
                </div>

                {/* Desktop Monitor Mockup */}
                <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-lg p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-400" />
                      <div className="w-3 h-3 rounded-full bg-amber-400" />
                      <div className="w-3 h-3 rounded-full bg-emerald-400" />
                      <span className="text-[11px] font-mono text-slate-400 ml-2">
                        kitadrajin.sekolah.id
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-700">Dashboard Eksekutif</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
                      <div className="text-[10px] text-emerald-800 font-medium">Hadir Tepat Waktu</div>
                      <div className="text-base font-extrabold text-emerald-900">42 Staf</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                      <div className="text-[10px] text-amber-800 font-medium">Terlambat</div>
                      <div className="text-base font-extrabold text-amber-900">3 Staf</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                      <div className="text-[10px] text-blue-800 font-medium">Izin / Dinas</div>
                      <div className="text-base font-extrabold text-blue-900">2 Staf</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs">
                    <div className="font-bold text-slate-800 mb-1 flex items-center justify-between">
                      <span>Live Monitoring Presensi Sekolah</span>
                      <span className="text-[10px] font-normal text-emerald-600 font-mono">
                        GPS & Wajah Terverifikasi 100%
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Menampilkan tabel data langsung dengan filter departemen, ekspor spreadsheet,
                      dan pemantauan kepatuhan radius lokasi 50m.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
