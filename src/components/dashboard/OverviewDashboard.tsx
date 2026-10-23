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
} from 'lucide-react';
import { User, UserRole } from '../../types';
import { getAllUsers, getAuditLogs } from '../../services/storage';

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Status Jadwal Saya</span>
              <Clock className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="text-xl font-extrabold text-slate-900 mt-2">Senin – Jumat (07:00 - 15:30)</div>
            <p className="text-xs text-slate-500 mt-1">
              Presensi masuk dibuka mulai 06:30 WIB. Pastikan berada di dalam radius sekolah.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Pengajuan Izin & Tugas</span>
              <FileText className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="text-xl font-extrabold text-slate-900 mt-2">Layanan Cepat Staf</div>
            <p className="text-xs text-slate-500 mt-1">
              Ajukan permohonan cuti sakit atau serahkan laporan dokumentasi tugas lewat menu terkait.
            </p>
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
    </div>
  );
};
