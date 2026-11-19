/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { User } from './types';
import {
  initializeDatabase,
  getCurrentSession,
  clearSession,
  refreshCurrentSessionFromUsers,
  reconcileUserReferences,
  getAllUsers,
} from './services/storage';
import { LoginForm } from './components/auth/LoginForm';
import { Shell } from './components/layout/Shell';
import { OverviewDashboard } from './components/dashboard/OverviewDashboard';
import { AlertCircle } from 'lucide-react';
import {
  startAppsScriptRealtimeSync,
  pullChangesFromAppsScript,
  isAppsScriptConfigured,
  flushAttendanceBatch,
} from './services/appsScriptSync';

const UserManager = lazy(() =>
  import('./components/users/UserManager').then((m) => ({ default: m.UserManager }))
);
const LocationManager = lazy(() =>
  import('./components/master/LocationManager').then((m) => ({ default: m.LocationManager }))
);
const SettingsManager = lazy(() =>
  import('./components/master/SettingsManager').then((m) => ({ default: m.SettingsManager }))
);
const SystemCheckManager = lazy(() =>
  import('./components/master/SystemCheckManager').then((m) => ({ default: m.SystemCheckManager }))
);
const FaceRegistryManager = lazy(() =>
  import('./components/attendance/FaceRegistryManager').then((m) => ({
    default: m.FaceRegistryManager,
  }))
);
const AttendanceSelfService = lazy(() =>
  import('./components/attendance/AttendanceSelfService').then((m) => ({
    default: m.AttendanceSelfService,
  }))
);
const AttendanceHistoryView = lazy(() =>
  import('./components/attendance/AttendanceHistoryView').then((m) => ({
    default: m.AttendanceHistoryView,
  }))
);
const LeaveManager = lazy(() =>
  import('./components/operations/LeaveManager').then((m) => ({ default: m.LeaveManager }))
);
const AssignmentManager = lazy(() =>
  import('./components/operations/AssignmentManager').then((m) => ({
    default: m.AssignmentManager,
  }))
);
const ReportManager = lazy(() =>
  import('./components/reports/ReportManager').then((m) => ({ default: m.ReportManager }))
);
const AuditLogManager = lazy(() =>
  import('./components/audit/AuditLogManager').then((m) => ({ default: m.AuditLogManager }))
);

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string>('dashboard');
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [, setSyncVersion] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    let renderDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleSyncRender = () => {
      if (renderDebounceTimer) {
        clearTimeout(renderDebounceTimer);
      }
      renderDebounceTimer = setTimeout(() => {
        renderDebounceTimer = null;
        if (isMounted) {
          setSyncVersion((v) => v + 1);
        }
      }, 40);
    };

    const resolveAuthenticatedSession = (): User | null => {
      return refreshCurrentSessionFromUsers() || getCurrentSession() || null;
    };

    async function init() {
      await initializeDatabase();
      const hasRealLocalUsers = getAllUsers().length > 0;

      if (hasRealLocalUsers) {
        if (!isMounted) return;
        const resolvedUser = resolveAuthenticatedSession();
        setCurrentUser(resolvedUser);
        if (resolvedUser?.role === 'superadmin') {
          setActiveMenuId('pengaturan');
        }
        setIsInitializing(false);

        if (isAppsScriptConfigured()) {
          pullChangesFromAppsScript(true, false).catch(() => false);
        }
      } else {
        if (isAppsScriptConfigured()) {
          await Promise.race([
            pullChangesFromAppsScript(true, false).catch(() => false),
            new Promise((resolve) => setTimeout(resolve, 6000)),
          ]);
        }
        if (!isMounted) return;
        const resolvedUser = resolveAuthenticatedSession();
        setCurrentUser(resolvedUser);
        if (resolvedUser?.role === 'superadmin') {
          setActiveMenuId('pengaturan');
        }
        setIsInitializing(false);
      }
    }
    init();

    const syncSessionAndReferences = (collectionName?: string) => {
      if (
        !collectionName ||
        collectionName === 'all' ||
        collectionName === 'users' ||
        collectionName === 'auto'
      ) {
        reconcileUserReferences(undefined, false);
        const resolvedUser = resolveAuthenticatedSession();
        setCurrentUser(resolvedUser);
        if (resolvedUser?.role === 'superadmin') {
          setActiveMenuId((prev) => (prev === 'cek_sistem' || prev === 'pengaturan' ? prev : 'pengaturan'));
        }
      }
      scheduleSyncRender();
    };

    // Sinkronisasi dua arah otomatis super cepat di latar belakang
    const stopRealtimeSync = startAppsScriptRealtimeSync((collectionName) => {
      syncSessionAndReferences(collectionName);
    });

    const handleStorageEvent = (ev: StorageEvent) => {
      if (!ev.key || ev.key === 'kitarajin_table_users' || ev.key === 'kitarajin_session_user') {
        syncSessionAndReferences('users');
      } else {
        scheduleSyncRender();
      }
    };

    window.addEventListener('storage', handleStorageEvent);

    return () => {
      isMounted = false;
      if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
      stopRealtimeSync();
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, []);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setActiveMenuId(user.role === 'superadmin' ? 'pengaturan' : 'dashboard');
    if (isAppsScriptConfigured()) {
      pullChangesFromAppsScript(false).catch(() => {});
      flushAttendanceBatch().catch(() => {});
    }
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
          <p className="text-sm font-semibold text-slate-300">Menyiapkan KITARAJIN...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

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
        return <UserManager key="admin_users" currentUser={currentUser} initialRoleFilter="admin" />;

      case 'karyawan_users':
        return <UserManager key="karyawan_users" currentUser={currentUser} initialRoleFilter="karyawan" />;

      case 'departemen':
        return <UserManager key="departemen" currentUser={currentUser} initialTab="departments" />;

      case 'jadwal':
        return <UserManager key="jadwal" currentUser={currentUser} initialTab="sessions" />;

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
              <p className="text-xs mt-1">Log Audit hanya dapat diakses oleh Kepala Sekolah.</p>
            </div>
          );
        }
        return <AuditLogManager currentUser={currentUser} />;

      case 'pengaturan':
        if (currentUser.role !== 'superadmin') {
          return (
            <div className="p-8 bg-rose-50 rounded-2xl border border-rose-200 text-rose-800 text-center max-w-md mx-auto my-8">
              <AlertCircle className="w-8 h-8 text-rose-600 mx-auto mb-2" />
              <h3 className="font-bold text-base">Akses Ditolak</h3>
              <p className="text-xs mt-1">Hanya Superadmin yang memiliki wewenang mengelola Pengaturan &amp; Sheets.</p>
            </div>
          );
        }
        return (
          <SettingsManager
            currentUser={currentUser}
            onUpdateCurrentUser={(updated) => setCurrentUser(updated)}
          />
        );

      case 'cek_sistem':
        if (currentUser.role !== 'superadmin') {
          return (
            <div className="p-8 bg-rose-50 rounded-2xl border border-rose-200 text-rose-800 text-center max-w-md mx-auto my-8">
              <AlertCircle className="w-8 h-8 text-rose-600 mx-auto mb-2" />
              <h3 className="font-bold text-base">Akses Ditolak</h3>
              <p className="text-xs mt-1">Menu Cek &amp; Perbaikan Sheet hanya dapat diakses oleh Superadmin.</p>
            </div>
          );
        }
        return (
          <SystemCheckManager
            currentUser={currentUser}
            onNavigateToSettings={() => setActiveMenuId('pengaturan')}
          />
        );

      default:
        if (currentUser.role === 'superadmin') {
          return (
            <SettingsManager
              currentUser={currentUser}
              onUpdateCurrentUser={(updated) => setCurrentUser(updated)}
            />
          );
        }
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
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <div className="w-7 h-7 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          {renderContent()}
        </Suspense>
      </div>
    </Shell>
  );
}
