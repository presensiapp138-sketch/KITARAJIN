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
import { AttendanceHistoryView } from './components/attendance/AttendanceHistoryView';
import { LeaveManager } from './components/operations/LeaveManager';
import { AssignmentManager } from './components/operations/AssignmentManager';
import { ReportManager } from './components/reports/ReportManager';
import { AuditLogManager } from './components/audit/AuditLogManager';
import { AlertCircle } from 'lucide-react';
import { startMultiDeviceRealtimeSync } from './services/firestoreSync';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string>('dashboard');
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [syncVersion, setSyncVersion] = useState<number>(0);

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

    // Mulai sinkronisasi multi-device real-time dengan Cloud Firestore
    const stopSync = startMultiDeviceRealtimeSync((collectionName) => {
      // Jika profil akun aktif diperbarui dari device lain, sinkronkan sesi
      if (collectionName === 'users') {
        const session = getCurrentSession();
        if (session) {
          setCurrentUser(session);
        }
      }
      // Trigger render ulang seluruh tampilan aktif agar data dari perangkat lain langsung muncul
      setSyncVersion((v) => v + 1);
    });

    return () => {
      stopSync();
    };
  }, []);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setActiveMenuId('dashboard');
  };

  const handleLogout = () => {
    if (currentUser) {
      clearSession(currentUser);
    }
    setCurrentUser(null);
    setActiveMenuId('dashboard');
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
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  // Render view berdasarkan activeMenuId
  const renderContent = () => {
    switch (activeMenuId) {
      case 'dashboard':
        return (
          <OverviewDashboard
            currentUser={currentUser}
            onNavigateTo={(menu) => setActiveMenuId(menu)}
          />
        );

      case 'presensi':
        return <AttendanceSelfService currentUser={currentUser} initialTab="presensi" />;

      case 'riwayat':
        return (
          <AttendanceHistoryView
            currentUser={currentUser}
            onNavigateTo={(menu) => setActiveMenuId(menu)}
          />
        );

      case 'database_wajah':
        // Perekaman & Database Wajah dapat diakses oleh Admin dan Kepala Sekolah
        if (currentUser.role !== 'admin' && currentUser.role !== 'kepala_sekolah') {
          return (
            <div className="p-8 bg-purple-50 rounded-2xl border border-purple-200 text-purple-900 text-center max-w-md mx-auto my-8">
              <AlertCircle className="w-8 h-8 text-purple-600 mx-auto mb-2" />
              <h3 className="font-bold text-base">Akses Ditolak</h3>
              <p className="text-xs mt-1">
                Perekaman dan database wajah hanya dapat dikelola oleh Admin atau Kepala Sekolah.
              </p>
            </div>
          );
        }
        return <FaceRegistryManager currentUser={currentUser} />;

      case 'lokasi':
        // Admin DILARANG atur lokasi & radius, cukup kepala sekolah yang bisa
        if (currentUser.role !== 'kepala_sekolah') {
          return (
            <div className="p-8 bg-rose-50 rounded-2xl border border-rose-200 text-rose-800 text-center max-w-md mx-auto my-8">
              <AlertCircle className="w-8 h-8 text-rose-600 mx-auto mb-2" />
              <h3 className="font-bold text-base">Akses Ditolak</h3>
              <p className="text-xs mt-1">
                Hanya Kepala Sekolah yang memiliki wewenang mengatur titik lokasi dan radius presensi.
              </p>
            </div>
          );
        }
        return <LocationManager currentUser={currentUser} />;

      case 'admin_users':
        if (currentUser.role !== 'kepala_sekolah') {
          return (
            <div className="p-8 bg-rose-50 rounded-2xl border border-rose-200 text-rose-800 text-center max-w-md mx-auto my-8">
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
        return <UserManager currentUser={currentUser} initialTab="departments" />;

      case 'jadwal':
        return <UserManager currentUser={currentUser} initialTab="sessions" />;

      case 'izin':
        return <LeaveManager currentUser={currentUser} />;

      case 'tugas':
        return <AssignmentManager currentUser={currentUser} />;

      case 'laporan':
        return <ReportManager currentUser={currentUser} />;

      case 'audit_logs':
        if (currentUser.role !== 'kepala_sekolah') {
          return (
            <div className="p-8 bg-rose-50 rounded-2xl border border-rose-200 text-rose-800 text-center max-w-md mx-auto my-8">
              <AlertCircle className="w-8 h-8 text-rose-600 mx-auto mb-2" />
              <h3 className="font-bold text-base">Akses Ditolak</h3>
              <p className="text-xs mt-1">Log Audit Admin hanya dapat diakses oleh Kepala Sekolah.</p>
            </div>
          );
        }
        return <AuditLogManager currentUser={currentUser} />;

      case 'pengaturan':
        if (currentUser.role !== 'kepala_sekolah') {
          return (
            <div className="p-8 bg-rose-50 rounded-2xl border border-rose-200 text-rose-800 text-center max-w-md mx-auto my-8">
              <AlertCircle className="w-8 h-8 text-rose-600 mx-auto mb-2" />
              <h3 className="font-bold text-base">Akses Ditolak</h3>
              <p className="text-xs mt-1">Hanya Kepala Sekolah yang memiliki wewenang mengubah pengaturan sistem.</p>
            </div>
          );
        }
        return (
          <SettingsManager
            currentUser={currentUser}
            onUpdateCurrentUser={(updated) => setCurrentUser(updated)}
          />
        );

      default:
        return (
          <OverviewDashboard
            currentUser={currentUser}
            onNavigateTo={(menu) => setActiveMenuId(menu)}
          />
        );
    }
  };

  return (
    <Shell
      currentUser={currentUser}
      onLogout={handleLogout}
      activeMenuId={activeMenuId}
      onSelectMenu={(menuId) => setActiveMenuId(menuId)}
      onUpdateCurrentUser={(updated) => setCurrentUser(updated)}
    >
      <div key={activeMenuId}>
        {renderContent()}
      </div>
    </Shell>
  );
}
