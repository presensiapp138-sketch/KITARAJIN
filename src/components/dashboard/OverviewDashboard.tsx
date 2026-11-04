/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  UserCheck,
  Camera,
  MapPin,
  Clock,
  ShieldCheck,
  Users,
  Building2,
  CalendarCheck,
  FileText,
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Calendar,
  Eye,
  X,
} from 'lucide-react';
import { User, UserRole, DailyAttendancePair } from '../../types';
import {
  getAllUsers,
  getAuditLogs,
  getAttendanceForUser,
  getAllAttendanceRecords,
  groupAttendanceByDateAndUser,
  getAllSchedules,
  getAllDepartments,
} from '../../services/storage';

interface OverviewDashboardProps {
  currentUser: User;
  onNavigateTo: (menuId: string) => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  currentUser,
  onNavigateTo,
}) => {
  const users = getAllUsers();
  const auditLogs = getAuditLogs().slice(0, 5);

  const stats = {
    totalUsers: users.length,
    totalAdmins: users.filter((u) => u.role === 'admin').length,
    totalStaff: users.filter((u) => u.role === 'karyawan').length,
  };

  const allSchedules = getAllSchedules();
  const allDepartments = getAllDepartments();
  const userDept = allDepartments.find((d) => d.id === currentUser.departmentId);
  const userAssignedSessions = allSchedules.filter((s) => (currentUser.assignedSessionIds || []).includes(s.id));
  const activeSessionsList = userAssignedSessions.length > 0 ? userAssignedSessions : allSchedules;

  const todayStr = new Date().toISOString().split('T')[0];
  const userRecords = getAttendanceForUser(currentUser.id);
  const todayMasuk = userRecords.find((r) => r.date === todayStr && r.type === 'masuk');
  const todayPulang = userRecords.find((r) => r.date === todayStr && r.type === 'pulang');

  const displayRecords = currentUser.role === 'karyawan' ? userRecords : getAllAttendanceRecords();
  const recentPairs = groupAttendanceByDateAndUser(displayRecords).slice(0, 5);
  const [previewPhoto, setPreviewPhoto] = React.useState<{ url: string; title: string; subtitle: string } | null>(null);

  const getWorkDuration = (masukTimestamp?: string, pulangTimestamp?: string) => {
    if (!masukTimestamp || !pulangTimestamp) return null;
    const tMasuk = new Date(masukTimestamp).getTime();
    const tPulang = new Date(pulangTimestamp).getTime();
    const diffMs = tPulang - tMasuk;
    if (diffMs <= 0) return null;
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${diffHrs}j ${diffMins}m`;
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sistem Presensi Berbasis Wajah & GPS</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Selamat Datang, {currentUser.name}
            </h1>
            <p className="text-emerald-100/80 text-xs sm:text-sm mt-1 max-w-xl leading-relaxed">
              {currentUser.position} &bull; NIP: <span className="font-mono">{currentUser.nip}</span>
            </p>
          </div>

          {/* Quick Action: Presensi Button (Wajib untuk semua!) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigateTo('presensi')}
              className="py-3 px-5 rounded-2xl bg-white text-emerald-950 font-extrabold text-sm shadow-lg hover:bg-emerald-50 active:scale-95 transition-all flex items-center justify-center gap-2.5"
            >
              <Camera className="w-4 h-4 text-emerald-600" />
              <span>Buka Menu Presensi Mandiri</span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Mandatory Attendance Reminder Notice */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-2 text-xs text-emerald-200/90">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>Aturan Presensi:</strong> Seluruh pengguna (Kepala Sekolah, Admin, dan Karyawan)
            wajib melakukan verifikasi wajah dan GPS saat masuk & pulang.
          </span>
        </div>
      </div>

      {/* Status Presensi Hari Ini: DUA KARTU ABSEN MASUK & ABSEN PULANG */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
              <CalendarCheck className="w-4 h-4 text-emerald-600" />
              <span>Presensi Hari Ini &bull; {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            <h2 className="text-base font-extrabold text-slate-900 mt-0.5">
              Status Presensi Masuk &amp; Pulang Anda
            </h2>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTo('presensi')}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 transition-colors self-start sm:self-auto cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-600" />
            <span>Buka Kamera Presensi</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* KARTU 1: ABSEN MASUK */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              todayMasuk
                ? 'bg-gradient-to-br from-emerald-50/70 to-white border-emerald-200/90'
                : 'bg-amber-50/50 border-amber-200/70'
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${todayMasuk ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                  1. Absen Masuk
                </span>
              </div>
              {todayMasuk ? (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    todayMasuk.status === 'tepat_waktu'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {todayMasuk.status === 'tepat_waktu' ? 'Tepat Waktu' : 'Terlambat'}
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  Belum Presensi
                </span>
              )}
            </div>

            {todayMasuk ? (
              <div className="mt-3 flex items-start gap-3">
                {todayMasuk.photoRef ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewPhoto({
                        url: todayMasuk.photoRef,
                        title: `Absen Masuk - ${currentUser.name}`,
                        subtitle: `Hari Ini &bull; ${new Date(todayMasuk.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} WIB`,
                      })
                    }
                    className="relative group shrink-0 cursor-pointer"
                    title="Klik untuk memperbesar foto wajah"
                  >
                    <img
                      src={todayMasuk.photoRef}
                      alt="Foto Masuk"
                      className="w-14 h-14 rounded-xl object-cover border-2 border-emerald-300 shadow-2xs group-hover:opacity-85"
                    />
                    <div className="absolute inset-0 bg-black/30 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                      <Eye className="w-3.5 h-3.5" />
                    </div>
                  </button>
                ) : null}

                <div className="space-y-1 text-xs flex-1">
                  <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900 text-sm">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span>
                      {new Date(todayMasuk.timestamp).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}{' '}
                      WIB
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    <span>Jarak: <strong>{todayMasuk.distanceFromLocationMeters}m</strong> (Sah)</span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Camera className="w-3 h-3 text-slate-400" />
                    <span>Kecocokan Wajah: <strong className="text-emerald-700">{Math.round(todayMasuk.faceSimilarityScore * 100)}%</strong></span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 py-2 flex items-center justify-between">
                <span className="text-xs text-amber-800 font-medium">Anda belum melakukan presensi masuk hari ini.</span>
                <button
                  type="button"
                  onClick={() => onNavigateTo('presensi')}
                  className="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Presensi Masuk
                </button>
              </div>
            )}
          </div>

          {/* KARTU 2: ABSEN PULANG */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              todayPulang
                ? 'bg-gradient-to-br from-indigo-50/70 to-white border-indigo-200/90'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${todayPulang ? 'bg-indigo-600' : 'bg-slate-400'}`} />
                <span className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                  2. Absen Pulang
                </span>
              </div>
              {todayPulang ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                  Pulang Sah
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                  {todayMasuk ? 'Belum Pulang' : 'Menunggu Masuk'}
                </span>
              )}
            </div>

            {todayPulang ? (
              <div className="mt-3 flex items-start gap-3">
                {todayPulang.photoRef ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewPhoto({
                        url: todayPulang.photoRef,
                        title: `Absen Pulang - ${currentUser.name}`,
                        subtitle: `Hari Ini &bull; ${new Date(todayPulang.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })} WIB`,
                      })
                    }
                    className="relative group shrink-0 cursor-pointer"
                    title="Klik untuk memperbesar foto wajah"
                  >
                    <img
                      src={todayPulang.photoRef}
                      alt="Foto Pulang"
                      className="w-14 h-14 rounded-xl object-cover border-2 border-indigo-300 shadow-2xs group-hover:opacity-85"
                    />
                    <div className="absolute inset-0 bg-black/30 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                      <Eye className="w-3.5 h-3.5" />
                    </div>
                  </button>
                ) : null}

                <div className="space-y-1 text-xs flex-1">
                  <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900 text-sm">
                    <Clock className="w-4 h-4 text-indigo-600" />
                    <span>
                      {new Date(todayPulang.timestamp).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}{' '}
                      WIB
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    <span>Jarak: <strong>{todayPulang.distanceFromLocationMeters}m</strong> (Sah)</span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Camera className="w-3 h-3 text-slate-400" />
                    <span>Kecocokan Wajah: <strong className="text-indigo-700">{Math.round(todayPulang.faceSimilarityScore * 100)}%</strong></span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 py-2 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">
                  {todayMasuk
                    ? 'Anda telah presensi masuk. Ingat lakukan presensi pulang di akhir jam kerja.'
                    : 'Lakukan presensi masuk terlebih dahulu sebelum sesi pulang.'}
                </span>
                {todayMasuk && (
                  <button
                    type="button"
                    onClick={() => onNavigateTo('presensi')}
                    className="px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer shrink-0 ml-2"
                  >
                    Presensi Pulang
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Role-Specific Metric Cards */}
      {currentUser.role === 'kepala_sekolah' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Total Staf & Admin</span>
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-2">
              {stats.totalUsers} Orang
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {stats.totalAdmins} Admin Operasional &bull; {stats.totalStaff} Tendik/Guru
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Database Wajah</span>
              <Camera className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="text-2xl font-extrabold text-indigo-700 mt-2">
              Perekaman Wajah
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Dikelola oleh Admin &amp; Kepala Sekolah
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Pengaturan Data</span>
              <ShieldCheck className="w-5 h-5 text-teal-600" />
            </div>
            <div className="text-2xl font-extrabold text-slate-800 mt-2">10 Tab Database</div>
            <div className="text-xs text-slate-500 mt-1">
              Siap sinkronisasi Google Sheets / Vault Lokal
            </div>
          </div>
        </div>
      )}

      {currentUser.role === 'admin' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Karyawan Binaan</span>
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="text-2xl font-extrabold text-indigo-900 mt-2">
              {stats.totalStaff} Orang
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Dikelola oleh Admin Tata Usaha
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Perekaman Wajah</span>
              <Camera className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-2xl font-extrabold text-purple-900 mt-2">Database Wajah</div>
            <div className="text-xs text-slate-500 mt-1">Perekaman &amp; validasi biometrik staf</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Jadwal Operasional</span>
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-2xl font-extrabold text-amber-800 mt-2">07:00 - 15:30</div>
            <div className="text-xs text-slate-500 mt-1">Toleransi keterlambatan 15 menit</div>
          </div>
        </div>
      )}

      {currentUser.role === 'karyawan' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Jadwal Sesi Anda</span>
              <Clock className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="text-xs font-bold text-slate-700">Sesi yang Tersedia Untuk Anda:</div>
              <div className="space-y-1.5">
                {activeSessionsList.map((sch) => (
                  <div
                    key={sch.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs"
                  >
                    <span className="font-bold text-slate-900">{sch.sessionName || sch.name}</span>
                    <span className="font-mono text-[11px] text-emerald-800 font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200">
                      Masuk: {sch.checkInStart}-{sch.checkInDeadline} &bull; Pulang: {sch.checkOutStart} WIB
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-1 italic">
                * Pilih sesi yang sesuai saat presensi mandiri.
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Pengajuan Izin & Tugas</span>
                <FileText className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="text-xl font-extrabold text-slate-900 mt-2">Layanan Mandiri Staf</div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Ajukan permohonan izin/cuti atau serahkan dokumentasi laporan tugas dinas langsung melalui menu terkait. Data akan otomatis terhubung ke Kepala Sekolah &amp; Admin.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-100 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateTo('presensi')}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Buka Kamera &amp; Pilih Sesi Presensi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Navigation Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Quick Menu Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-emerald-600" />
            Pintasan Tindakan
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currentUser.role === 'kepala_sekolah' && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigateTo('database_wajah')}
                  className="p-3.5 rounded-xl border border-purple-200 bg-purple-50 hover:bg-purple-100/80 text-left transition-colors"
                >
                  <div className="font-bold text-xs text-purple-900">Database Wajah</div>
                  <div className="text-[11px] text-purple-700 mt-0.5">Kelola data biometrik seluruh pengguna</div>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTo('admin_users')}
                  className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100/80 text-left transition-colors"
                >
                  <div className="font-bold text-xs text-indigo-900">Kelola Akun Admin</div>
                  <div className="text-[11px] text-indigo-700 mt-0.5">Tambah / edit akun admin TU</div>
                </button>
              </>
            )}

            {(currentUser.role === 'kepala_sekolah' || currentUser.role === 'admin') && (
              <button
                type="button"
                onClick={() => onNavigateTo('karyawan_users')}
                className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100/80 text-left transition-colors"
              >
                <div className="font-bold text-xs text-emerald-900">Kelola Karyawan</div>
                <div className="text-[11px] text-emerald-700 mt-0.5">Data staf, guru, dan departemen</div>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigateTo('riwayat')}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-left transition-colors"
            >
              <div className="font-bold text-xs text-slate-900">Riwayat Presensi</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Histori kehadiran mandiri</div>
            </button>
          </div>
        </div>

        {/* Audit Log Stream (for Kepala Sekolah) or Info Panel */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              {currentUser.role === 'kepala_sekolah' ? 'Jejak Audit Aktivitas Terbaru' : 'Status Akun Saya'}
            </h2>
          </div>

          {currentUser.role === 'kepala_sekolah' ? (
            <div className="space-y-3">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-bold text-slate-800">{log.actorName}</span>
                    <span className="font-mono text-[10px]">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-slate-600 mt-1">{log.details}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-400 block font-bold uppercase">NIP / ID</span>
                <span className="font-mono font-bold text-slate-800 text-sm">{currentUser.nip}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-400 block font-bold uppercase">Username Login</span>
                <span className="font-mono font-bold text-slate-800 text-sm">{currentUser.username}</span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-medium">
                Akun aktif dan terotentikasi aman dengan SHA-256 password hashing.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Riwayat Presensi Terbaru: PAIRED ABSEN MASUK & ABSEN PULANG */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
              <ClipboardList className="w-4 h-4 text-emerald-600" />
              <span>Aktivitas Kehadiran Terakhir</span>
            </div>
            <h2 className="text-base font-extrabold text-slate-900 mt-0.5">
              Riwayat Presensi Masuk &amp; Pulang Terbaru
            </h2>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTo('riwayat')}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 transition-all self-start sm:self-auto cursor-pointer"
          >
            <span>Buka Semua Riwayat Presensi</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
          </button>
        </div>

        {recentPairs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            Belum ada catatan presensi yang tersimpan di sistem.
          </div>
        ) : (
          <div className="space-y-3">
            {recentPairs.map((pair) => {
              const hasMasuk = Boolean(pair.masukRecord);
              const hasPulang = Boolean(pair.pulangRecord);
              const duration = getWorkDuration(pair.masukRecord?.timestamp, pair.pulangRecord?.timestamp);

              return (
                <div
                  key={`${pair.date}_${pair.userId}_${pair.masukRecord?.sessionId || pair.pulangRecord?.sessionId || 'default'}`}
                  className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5 flex-wrap">
                          <span>{pair.date}</span> &bull; <span className="text-slate-700">{pair.userName}</span>
                          {(pair.masukRecord?.sessionName || pair.pulangRecord?.sessionName) && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-sky-100 text-sky-800 border border-sky-200">
                              {pair.masukRecord?.sessionName || pair.pulangRecord?.sessionName}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          NIP: {pair.nip} &bull; <span className="capitalize">{pair.role.replace('_', ' ')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      {duration && (
                        <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                          Durasi: {duration}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          hasMasuk && hasPulang
                            ? 'bg-emerald-100 text-emerald-800'
                            : hasMasuk
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {hasMasuk && hasPulang
                          ? 'Selesai (Masuk & Pulang)'
                          : hasMasuk
                          ? 'Belum Absen Pulang'
                          : 'Belum Presensi'}
                      </span>
                    </div>
                  </div>

                  {/* Dua Kolom Berdampingan: Absen Masuk & Pulang */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Absen Masuk */}
                    <div
                      className={`p-3 rounded-xl border text-xs ${
                        hasMasuk
                          ? 'bg-emerald-50/60 border-emerald-200/80 text-emerald-950'
                          : 'bg-white border-dashed border-slate-200 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold text-[11px] mb-2">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Absen Masuk
                        </span>
                        {hasMasuk && (
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                              pair.masukRecord?.status === 'tepat_waktu'
                                ? 'bg-emerald-200 text-emerald-900'
                                : 'bg-amber-200 text-amber-900'
                            }`}
                          >
                            {pair.masukRecord?.status === 'tepat_waktu' ? 'Tepat Waktu' : 'Terlambat'}
                          </span>
                        )}
                      </div>

                      {hasMasuk && pair.masukRecord ? (
                        <div className="flex items-start gap-2.5">
                          {pair.masukRecord.photoRef && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewPhoto({
                                  url: pair.masukRecord!.photoRef,
                                  title: `Absen Masuk - ${pair.userName}`,
                                  subtitle: `${pair.date} &bull; ${new Date(pair.masukRecord!.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })} WIB`,
                                })
                              }
                              className="shrink-0 group relative cursor-pointer"
                              title="Klik untuk perbesar"
                            >
                              <img
                                src={pair.masukRecord.photoRef}
                                alt="Foto Masuk"
                                className="w-11 h-11 rounded-xl object-cover border border-emerald-300 group-hover:opacity-85"
                              />
                            </button>
                          )}
                          <div className="text-[11px] space-y-0.5">
                            <div className="font-bold font-mono">
                              {new Date(pair.masukRecord.timestamp).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                              })}{' '}
                              WIB
                            </div>
                            <div className="text-slate-600 text-[10px]">
                              Jarak: {pair.masukRecord.distanceFromLocationMeters}m &bull; Wajah: {Math.round(pair.masukRecord.faceSimilarityScore * 100)}%
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic">Tidak ada presensi masuk</div>
                      )}
                    </div>

                    {/* Absen Pulang */}
                    <div
                      className={`p-3 rounded-xl border text-xs ${
                        hasPulang
                          ? 'bg-indigo-50/60 border-indigo-200/80 text-indigo-950'
                          : 'bg-white border-dashed border-slate-200 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold text-[11px] mb-2">
                        <span className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${hasPulang ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                          Absen Pulang
                        </span>
                        {hasPulang ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-indigo-200 text-indigo-900">
                            Pulang Sah
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-slate-200 text-slate-600">
                            Belum Pulang
                          </span>
                        )}
                      </div>

                      {hasPulang && pair.pulangRecord ? (
                        <div className="flex items-start gap-2.5">
                          {pair.pulangRecord.photoRef && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewPhoto({
                                  url: pair.pulangRecord!.photoRef,
                                  title: `Absen Pulang - ${pair.userName}`,
                                  subtitle: `${pair.date} &bull; ${new Date(pair.pulangRecord!.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })} WIB`,
                                })
                              }
                              className="shrink-0 group relative cursor-pointer"
                              title="Klik untuk perbesar"
                            >
                              <img
                                src={pair.pulangRecord.photoRef}
                                alt="Foto Pulang"
                                className="w-11 h-11 rounded-xl object-cover border border-indigo-300 group-hover:opacity-85"
                              />
                            </button>
                          )}
                          <div className="text-[11px] space-y-0.5">
                            <div className="font-bold font-mono">
                              {new Date(pair.pulangRecord.timestamp).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                              })}{' '}
                              WIB
                            </div>
                            <div className="text-slate-600 text-[10px]">
                              Jarak: {pair.pulangRecord.distanceFromLocationMeters}m &bull; Wajah: {Math.round(pair.pulangRecord.faceSimilarityScore * 100)}%
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic">Belum melakukan presensi pulang</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Preview Foto Snapshot */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-xs">{previewPhoto.title}</h3>
                <p className="text-[10px] text-slate-500">{previewPhoto.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex justify-center bg-slate-950">
              <img
                src={previewPhoto.url}
                alt="Bukti Foto Presensi"
                className="max-h-72 w-auto rounded-xl object-contain border border-slate-700"
              />
            </div>

            <div className="p-3 bg-slate-50 text-right">
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="px-3.5 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
