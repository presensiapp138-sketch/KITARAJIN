/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import {
  initializeDatabase,
  getCurrentSession,
  clearSession,
} from './services/storage';
import { LoginForm } from './components/auth/LoginForm';
import { Shell } from './components/layout/Shell';
import { OverviewDashboard } from './components/dashboard/OverviewDashboard';
import { UserManager } from './components/users/UserManager';
import { DepartmentManager } from './components/master/DepartmentManager';
import { ScheduleManager } from './components/master/ScheduleManager';
import { LocationManager } from './components/master/LocationManager';
import { SettingsManager } from './components/master/SettingsManager';
import { FaceRegistryManager } from './components/attendance/FaceRegistryManager';
import { AttendanceSelfService } from './components/attendance/AttendanceSelfService';
import { LeaveManager } from './components/operations/LeaveManager';
import { AssignmentManager } from './components/operations/AssignmentManager';
import { ReportManager } from './components/reports/ReportManager';
import { AuditLogManager } from './components/audit/AuditLogManager';
import { Tahap2DesignView } from './components/design/Tahap2DesignView';
import { Clock, ShieldCheck, Camera, MapPin, Building2, Layers, AlertCircle } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string>('dashboard');
  const [isShowingDesignSpec, setIsShowingDesignSpec] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  useEffect(() => {
    async function init() {
      await initializeDatabase();
      const session = getCurrentSession();
      if (session) {
        setCurrentUser(session);
      }
      setIsInitializing(false);
    }
    init();
  }, []);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setActiveMenuId('dashboard');
    setIsShowingDesignSpec(false);
  };

  const handleLogout = () => {
    if (currentUser) {
      clearSession(currentUser);
    }
    setCurrentUser(null);
    setActiveMenuId('dashboard');
    setIsShowingDesignSpec(false);
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-300">Menyiapkan Database KITARAJIN...</p>
        </div>
      </div>
    );
  }

  // Jika belum login, tampilkan LoginForm
  if (!currentUser) {
    return (
      <LoginForm
        onLoginSuccess={handleLoginSuccess}
        onExploreDesignDocs={() => setIsShowingDesignSpec(true)}
      />
    );
  }

  // Render view berdasarkan activeMenuId
  const renderContent = () => {
    if (isShowingDesignSpec) {
      return (
        <Tahap2DesignView
          currentRole={currentUser.role}
          onRoleChange={() => {}}
        />
      );
    }

    switch (activeMenuId) {
      case 'dashboard':
        return (
          <OverviewDashboard
            currentUser={currentUser}
            onNavigateTo={(menu) => setActiveMenuId(menu)}
          />
        );

      case 'admin_users':
        if (currentUser.role !== 'kepala_sekolah') {
          return (
            <div className="p-8 bg-rose-50 rounded-2xl border border-rose-200 text-rose-800 text-center">
              <AlertCircle className="w-8 h-8 text-rose-600 mx-auto mb-2" />
              <h3 className="font-bold text-base">Akses Ditolak</h3>
              <p className="text-xs mt-1">Hanya Kepala Sekolah yang memiliki wewenang mengelola akun Admin.</p>
            </div>
          );
        }
        return <UserManager currentUser={currentUser} initialRoleFilter="admin" />;

      case 'karyawan_users':
        return <UserManager currentUser={currentUser} initialRoleFilter="karyawan" />;

      case 'departemen':
        return <DepartmentManager currentUser={currentUser} />;

      case 'jadwal':
        return <ScheduleManager currentUser={currentUser} />;

      case 'lokasi':
        return <LocationManager currentUser={currentUser} />;

      case 'pengaturan':
        if (currentUser.role !== 'kepala_sekolah') {
          return (
            <div className="p-8 bg-rose-50 rounded-2xl border border-rose-200 text-rose-800 text-center">
              <AlertCircle className="w-8 h-8 text-rose-600 mx-auto mb-2" />
              <h3 className="font-bold text-base">Akses Ditolak</h3>
              <p className="text-xs mt-1">Hanya Kepala Sekolah yang memiliki wewenang mengubah pengaturan sistem.</p>
            </div>
          );
        }
        return <SettingsManager currentUser={currentUser} />;

      case 'database_wajah':
        if (currentUser.role !== 'kepala_sekolah') {
          return (
            <div className="p-8 bg-purple-50 rounded-2xl border border-purple-200 text-purple-900 text-center">
              <AlertCircle className="w-8 h-8 text-purple-600 mx-auto mb-2" />
              <h3 className="font-bold text-base">Menu Khusus Kepala Sekolah</h3>
              <p className="text-xs mt-1">
                Sesuai aturan keamanan KITARAJIN, hanya Kepala Sekolah yang berwenang mengelola Database Wajah.
              </p>
            </div>
          );
        }
        return <FaceRegistryManager currentUser={currentUser} />;

      case 'presensi':
      case 'riwayat':
        return <AttendanceSelfService currentUser={currentUser} />;

      case 'izin':
        return <LeaveManager currentUser={currentUser} />;

      case 'tugas':
        return <AssignmentManager currentUser={currentUser} />;

      case 'laporan':
        return <ReportManager currentUser={currentUser} />;

      case 'audit_logs':
        if (currentUser.role !== 'kepala_sekolah') {
          return (
            <div className="p-8 bg-rose-50 rounded-2xl border border-rose-200 text-rose-800 text-center">
              <AlertCircle className="w-8 h-8 text-rose-600 mx-auto mb-2" />
              <h3 className="font-bold text-base">Akses Ditolak</h3>
              <p className="text-xs mt-1">Log Audit Admin hanya dapat diakses oleh Kepala Sekolah untuk transparansi dan pengawasan.</p>
            </div>
          );
        }
        return <AuditLogManager currentUser={currentUser} />;

      // Menu yang dijadwalkan pada tahap berikutnya
      default: {
        const stageSchedule: Record<string, { stage: string; title: string; desc: string }> = {
          presensi: {
            stage: 'Tahap 5',
            title: 'Presensi Mandiri (Verifikasi Wajah & GPS)',
            desc: 'Akan diimplementasikan pada Tahap 5 dengan integrasi kamera depan/belakang dan kalkulasi jarak GPS Haversine.',
          },
          riwayat: {
            stage: 'Tahap 5 & 7',
            title: 'Riwayat Presensi Mandiri',
            desc: 'Daftar catatan kehadiran harian, mingguan, dan bulanan yang tersimpan di tabel Attendance.',
          },
          database_wajah: {
            stage: 'Tahap 5',
            title: 'Database Wajah (Khusus Kepala Sekolah)',
            desc: 'Pendaftaran vektor biometrik wajah seluruh staf & admin oleh Kepala Sekolah.',
          },
          departemen: {
            stage: 'Tahap 4',
            title: 'Master Departemen & Unit Kerja',
            desc: 'Pengaturan divisi sekolah (TU, Guru, Dapur, Satpam, Kebersihan) pada Tahap 4 (Data Dasar).',
          },
          jadwal: {
            stage: 'Tahap 4',
            title: 'Jadwal Kerja & Toleransi Keterlambatan',
            desc: 'Pengaturan jam masuk, jam pulang, dan shift pada Tahap 4 (Data Dasar).',
          },
          lokasi: {
            stage: 'Tahap 4',
            title: 'Titik Lokasi Presensi & Radius GPS',
            desc: 'Pengaturan koordinat sekolah dan batas radius meter pada Tahap 4 (Data Dasar).',
          },
          izin: {
            stage: 'Tahap 6',
            title: 'Pengajuan Izin & Sakit',
            desc: 'Workflow pengajuan cuti, surat dokter, dan persetujuan bertingkat pada Tahap 6.',
          },
          tugas: {
            stage: 'Tahap 6',
            title: 'Penugasan & Dokumentasi Lapangan',
            desc: 'Distribusi tugas dan unggah foto bukti kegiatan dengan geotagging pada Tahap 6.',
          },
          laporan: {
            stage: 'Tahap 7',
            title: 'Rekapitulasi Laporan Presensi',
            desc: 'Laporan kehadiran civitas sekolah dan ekspor data spreadsheet pada Tahap 7.',
          },
          audit_logs: {
            stage: 'Tahap 7',
            title: 'Log Audit Admin Lengkap',
            desc: 'Rekam jejak transparansi sistem pada Tahap 7.',
          },
          pengaturan: {
            stage: 'Tahap 7 & 9',
            title: 'Pengaturan Sistem & Sinkronisasi Sheets',
            desc: 'Manajemen integrasi data spreadsheet dan preferensi sistem.',
          },
        };

        const target = stageSchedule[activeMenuId] || {
          stage: 'Tahap Selanjutnya',
          title: 'Modul Sistem',
          desc: 'Fitur ini dijadwalkan dibangun secara bertahap.',
        };

        return (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-8 shadow-xs text-center max-w-xl mx-auto space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                Dijadwalkan di {target.stage}
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-2">{target.title}</h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                {target.desc}
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setActiveMenuId('karyawan_users')}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
              >
                Buka Manajemen Pengguna (Tahap 3)
              </button>
              <button
                type="button"
                onClick={() => setActiveMenuId('dashboard')}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50"
              >
                Kembali ke Dashboard
              </button>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <Shell
      currentUser={currentUser}
      onLogout={handleLogout}
      activeMenuId={activeMenuId}
      onSelectMenu={(menuId) => {
        setActiveMenuId(menuId);
        setIsShowingDesignSpec(false);
      }}
      onToggleDesignSpec={() => setIsShowingDesignSpec(!isShowingDesignSpec)}
      isShowingDesignSpec={isShowingDesignSpec}
    >
      {renderContent()}
    </Shell>
  );
}
