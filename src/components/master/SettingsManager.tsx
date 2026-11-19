/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Settings,
  School,
  FileSpreadsheet,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  X,
  Save,
  UserCheck,
  Mail,
  User as UserIcon,
  Phone,
  Clock,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Key,
  Copy,
  Check,
  Code2,
  ChevronDown,
  ChevronUp,
  HardDrive,
  Activity,
  Sparkles,
  Wrench,
} from 'lucide-react';

import { AppSettings, SystemCheckResult, User } from '../../types';
import {
  getAppSettings,
  updateAppSettings,
  getAllUsers,
  getAllDepartments,
  getAllSchedules,
  getAllLocations,
  getAllFaceRegistry,
  getAllAttendanceRecords,
  getAllLeaveRequests,
  getAllAssignments,
  getAuditLogs,
  updateUser,
  getCurrentSession,
  updateSuperadminCachedPassword,
} from '../../services/storage';
import {
  getAppsScriptConfig,
  saveAppsScriptConfig,
  setAppsScriptConfigLocked,
  subscribeSyncUiState,
  getSyncUiState,
  SyncUiState,
  runSystemCheck,
  repairSheetSync,
  buildConnectedShareUrl,
} from '../../services/appsScriptSync';
import { APPS_SCRIPT_CODE, APPS_SCRIPT_DEPLOY_STEPS } from '../../config/appsScriptTemplate';

interface SettingsManagerProps {
  currentUser: User;
  onUpdateCurrentUser?: (user: User) => void;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  currentUser,
  onUpdateCurrentUser,
}) => {
  const [settings, setSettings] = useState<AppSettings>(() => getAppSettings());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Apps Script Config (Tempel 1x -> Simpan & Kunci Permanen)
  const [gasConfig, setGasConfig] = useState(() => getAppsScriptConfig());
  const [webAppUrlInput, setWebAppUrlInput] = useState(() => getAppsScriptConfig().webAppUrl);
  const [apiTokenInput, setApiTokenInput] = useState(() => getAppsScriptConfig().apiToken);
  const [showToken, setShowToken] = useState(false);
  const [syncUiState, setSyncUiState] = useState<SyncUiState>(() => getSyncUiState());
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isRepairingSheet, setIsRepairingSheet] = useState(false);
  const [systemCheckResult, setSystemCheckResult] = useState<SystemCheckResult | null>(null);
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [copiedVercelEnv, setCopiedVercelEnv] = useState(false);

  // Kepala Sekolah Profile Form State
  const [ksName, setKsName] = useState(currentUser.name);
  const [ksUsername, setKsUsername] = useState(currentUser.username);
  const [ksNip, setKsNip] = useState(currentUser.nip || '');
  const [ksEmail, setKsEmail] = useState(currentUser.email || '');
  const [ksPhone, setKsPhone] = useState(currentUser.phone || '');
  const [schedules, setSchedules] = useState(() => getAllSchedules());
  const [ksAssignedSessions, setKsAssignedSessions] = useState<string[]>(
    currentUser.assignedSessionIds && currentUser.assignedSessionIds.length > 0
      ? currentUser.assignedSessionIds
      : ['sesi-1', 'sesi-2', 'sesi-3']
  );
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Ubah Password Kepala Sekolah State
  const [ksPassword, setKsPassword] = useState('');
  const [ksConfirmPassword, setKsConfirmPassword] = useState('');
  const [showKsPassword, setShowKsPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Ubah Password Superadmin (Cache Aplikasi, tidak disimpan ke Sheet)
  const [saNewPassword, setSaNewPassword] = useState('');
  const [saConfirmPassword, setSaConfirmPassword] = useState('');
  const [showSaPassword, setShowSaPassword] = useState(false);

  // Form State Identitas Sekolah & Kebijakan Presensi
  const [schoolName, setSchoolName] = useState(settings.schoolName);
  const [schoolEmail, setSchoolEmail] = useState(settings.schoolEmail || (currentUser.role !== 'superadmin' ? currentUser.email : '') || '');
  const [schoolAddress, setSchoolAddress] = useState(settings.schoolAddress);
  const [appTitle, setAppTitle] = useState(settings.appTitle);
  const [minFaceMatchThreshold, setMinFaceMatchThreshold] = useState(
    Math.round((settings.minFaceMatchThreshold || 0.75) * 100)
  );
  const [requireStrictGps, setRequireStrictGps] = useState(settings.requireStrictGps);
  const [requireStrictFace, setRequireStrictFace] = useState(settings.requireStrictFaceVerification);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribeSync = subscribeSyncUiState((next) => setSyncUiState(next));

    const handleSyncEvent = () => {
      const latestData = getAppSettings();
      setSettings(latestData);
      setSchoolName(latestData.schoolName);
      setSchoolAddress(latestData.schoolAddress);
      setAppTitle(latestData.appTitle);
      setSchoolEmail(latestData.schoolEmail || getCurrentSession()?.email || '');
      setMinFaceMatchThreshold(Math.round((latestData.minFaceMatchThreshold || 0.75) * 100));
      setRequireStrictGps(latestData.requireStrictGps);
      setRequireStrictFace(latestData.requireStrictFaceVerification);
      setSchedules(getAllSchedules());
    };

    window.addEventListener('kitarajin_cloud_sync', handleSyncEvent);
    window.addEventListener('kitarajin_settings_updated', handleSyncEvent);
    window.addEventListener('storage', handleSyncEvent);

    // Uji koneksi otomatis di latar belakang jika sudah terkonfigurasi
    if (getAppsScriptConfig().webAppUrl && getAppsScriptConfig().apiToken) {
      runSystemCheck().then((res) => setSystemCheckResult(res)).catch(() => {});
    }

    return () => {
      unsubscribeSync();
      window.removeEventListener('kitarajin_cloud_sync', handleSyncEvent);
      window.removeEventListener('kitarajin_settings_updated', handleSyncEvent);
      window.removeEventListener('storage', handleSyncEvent);
    };
  }, []);

  useEffect(() => {
    setKsName(currentUser.name);
    setKsUsername(currentUser.username);
    setKsNip(currentUser.nip || '');
    setKsEmail(currentUser.email || '');
    setKsPhone(currentUser.phone || '');
    setKsAssignedSessions(
      currentUser.assignedSessionIds && currentUser.assignedSessionIds.length > 0
        ? currentUser.assignedSessionIds
        : ['sesi-1', 'sesi-2', 'sesi-3']
    );
  }, [currentUser]);

  // Simpan & Kunci URL + Token Apps Script (cukup tempel 1x, bertahan saat refresh & Vercel)
  const handleSaveAndLockAppsScript = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = webAppUrlInput.trim();
    const cleanToken = apiTokenInput.trim();

    if (!cleanUrl || !cleanUrl.startsWith('https://')) {
      setFeedback({
        type: 'error',
        message: 'URL Web App Apps Script harus berupa tautan https:// yang valid (akhiran /exec).',
      });
      return;
    }
    if (!cleanToken || cleanToken.length < 6) {
      setFeedback({
        type: 'error',
        message: 'API Token Rahasia wajib diisi (minimal 6 karakter) dan harus sama dengan Script Properties.',
      });
      return;
    }

    const saved = saveAppsScriptConfig({
      webAppUrl: cleanUrl,
      apiToken: cleanToken,
      isLocked: true,
    });
    setGasConfig(saved);
    setShowToken(false);

    setIsTestingConnection(true);
    setFeedback(null);
    try {
      const check = await runSystemCheck();
      setSystemCheckResult(check);
      if (check.authorized && check.sheetsConnected && check.driveConnected) {
        setFeedback({
          type: 'success',
          message: `Konfigurasi Apps Script disimpan & DIKUNCI! Terhubung ke Google Sheets "${check.sheetName || 'Database'}" & folder Drive "${check.driveFolderName || 'Privat'}". Sinkronisasi otomatis 2-arah aktif.`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: check.error || 'Konfigurasi terkunci, namun koneksi ke Sheets/Drive belum sepenuhnya valid. Periksa menu Cek Sistem.',
        });
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleUnlockConfig = () => {
    const next = setAppsScriptConfigLocked(false);
    setGasConfig(next);
  };

  const handleTestAppsScriptConnection = async () => {
    setIsTestingConnection(true);
    setFeedback(null);
    try {
      const check = await runSystemCheck();
      setSystemCheckResult(check);
      if (check.authorized && check.sheetsConnected && check.driveConnected) {
        setFeedback({
          type: 'success',
          message: `Koneksi Apps Script aktif (${check.latencyMs} ms)! Spreadsheet & folder Drive siap digunakan.`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: check.error || 'Koneksi gagal atau Script Properties masih ada yang kosong.',
        });
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleRepairSheetFromSettings = async () => {
    setIsRepairingSheet(true);
    setFeedback(null);
    try {
      const res = await repairSheetSync({
        id: currentUser.id,
        name: currentUser.name,
        role: currentUser.role,
      });
      if (res.ok) {
        const check = await runSystemCheck().catch(() => null);
        if (check) setSystemCheckResult(check);
        setFeedback({
          type: 'success',
          message: res.report?.summary || 'Perbaikan ketidaksinkronan Sheet berhasil dan data tersinkron.',
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Gagal memperbaiki ketidaksinkronan Sheet.',
        });
      }
    } finally {
      setIsRepairingSheet(false);
    }
  };

  const handleCopyCodeGs = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      setFeedback({
        type: 'error',
        message: 'Browser menolak akses clipboard otomatis. Buka panel kode dan salin secara manual.',
      });
    }
  };

  const handleCopyConnectedShareLink = async () => {
    try {
      const shareUrl = buildConnectedShareUrl();
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2500);
    } catch {
      setFeedback({
        type: 'error',
        message: 'Gagal menyalin tautan terhubung otomatis.',
      });
    }
  };

  const handleCopyVercelEnv = async () => {
    try {
      const envText = `VITE_APPS_SCRIPT_URL=${webAppUrlInput.trim()}\nVITE_APPS_SCRIPT_TOKEN=${apiTokenInput.trim()}`;
      await navigator.clipboard.writeText(envText);
      setCopiedVercelEnv(true);
      setTimeout(() => setCopiedVercelEnv(false), 2500);
    } catch {
      setFeedback({
        type: 'error',
        message: 'Gagal menyalin Environment Variables Vercel.',
      });
    }
  };

  // Update Profil Kepala Sekolah
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ksName.trim()) {
      setFeedback({ type: 'error', message: 'Nama Kepala Sekolah tidak boleh kosong.' });
      return;
    }
    if (!ksNip.trim()) {
      setFeedback({ type: 'error', message: 'NIP Kepala Sekolah tidak boleh kosong.' });
      return;
    }
    if (!ksEmail.trim()) {
      setFeedback({ type: 'error', message: 'Email Kepala Sekolah tidak boleh kosong.' });
      return;
    }

    setIsUpdatingProfile(true);
    setFeedback(null);

    const res = await updateUser(currentUser, currentUser.id, {
      name: ksName.trim(),
      username: ksUsername.trim() || currentUser.username,
      nip: ksNip.trim(),
      email: ksEmail.trim(),
      phone: ksPhone.trim(),
      assignedSessionIds: ksAssignedSessions,
    });

    if (res.success) {
      const updatedUser = getCurrentSession() || {
        ...currentUser,
        name: ksName.trim(),
        username: ksUsername.trim() || currentUser.username,
        nip: ksNip.trim(),
        email: ksEmail.trim(),
        phone: ksPhone.trim(),
        assignedSessionIds: ksAssignedSessions,
      };
      if (onUpdateCurrentUser) {
        onUpdateCurrentUser(updatedUser);
      }
      setFeedback({
        type: 'success',
        message: 'Profil Kepala Sekolah berhasil disimpan dan otomatis tersinkron ke Google Sheets.',
      });
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
    setIsUpdatingProfile(false);
  };

  // Ubah Password Login Kepala Sekolah
  const handleUpdateKsPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ksPassword.trim()) {
      setFeedback({ type: 'error', message: 'Password baru tidak boleh kosong.' });
      return;
    }
    if (ksPassword.trim().length < 6) {
      setFeedback({ type: 'error', message: 'Password baru minimal harus 6 karakter.' });
      return;
    }
    if (ksPassword !== ksConfirmPassword) {
      setFeedback({ type: 'error', message: 'Konfirmasi password tidak cocok dengan password baru.' });
      return;
    }

    setIsUpdatingPassword(true);
    setFeedback(null);

    try {
      const res = await updateUser(currentUser, currentUser.id, {
        rawPassword: ksPassword.trim(),
      });

      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Password login Kepala Sekolah berhasil diperbarui ke Google Sheets.',
        });
        setKsPassword('');
        setKsConfirmPassword('');
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Gagal memperbarui password: ${err?.message || 'Error'}` });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // Ubah Password Superadmin (Cache Aplikasi)
  const handleUpdateSuperadminPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saNewPassword.trim()) {
      setFeedback({ type: 'error', message: 'Password baru Superadmin tidak boleh kosong.' });
      return;
    }
    if (saNewPassword.trim().length < 4) {
      setFeedback({ type: 'error', message: 'Password Superadmin minimal 4 karakter.' });
      return;
    }
    if (saNewPassword !== saConfirmPassword) {
      setFeedback({ type: 'error', message: 'Konfirmasi password Superadmin tidak cocok.' });
      return;
    }
    const res = updateSuperadminCachedPassword(saNewPassword);
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      setSaNewPassword('');
      setSaConfirmPassword('');
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  // Simpan Identitas Sekolah & Kebijakan Presensi
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    const res = updateAppSettings(currentUser, {
      schoolName: schoolName.trim(),
      schoolAddress: schoolAddress.trim(),
      schoolEmail: schoolEmail.trim(),
      appTitle: appTitle.trim(),
      minFaceMatchThreshold: minFaceMatchThreshold / 100,
      requireStrictGps,
      requireStrictFaceVerification: requireStrictFace,
    });

    if (res.success) {
      setSettings(getAppSettings());
      setFeedback({
        type: 'success',
        message: 'Pengaturan identitas sekolah & kebijakan presensi berhasil disimpan ke Google Sheets.',
      });
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
    setIsSubmitting(false);
  };

  const localCounts = {
    Users: getAllUsers().length,
    Departments: getAllDepartments().length,
    Schedules: getAllSchedules().length,
    Locations: getAllLocations().length,
    FaceRegistry: getAllFaceRegistry().length,
    Attendance: getAllAttendanceRecords().length,
    LeaveRequests: getAllLeaveRequests().length,
    Assignments: getAllAssignments().length,
    Log: getAuditLogs().length,
    Settings: 1,
  };

  const isScriptActive =
    syncUiState.isConfigured &&
    (systemCheckResult ? systemCheckResult.authorized && systemCheckResult.sheetsConnected : true);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <Settings className="w-4 h-4" />
            <span>Master Data &bull; Pengaturan &amp; Sheets</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            Pengaturan Sistem, Google Apps Script &amp; Profil Sekolah
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Google Sheets &amp; Google Drive (via Google Apps Script Web App) adalah database tunggal real-time multi-pengguna.
          </p>
        </div>

        {/* NOTIFIKASI STATUS APPS SCRIPT AKTIF — HANYA DI MENU PENGATURAN & SHEETS */}
        <div
          className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 shrink-0 ${
            isScriptActive
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isScriptActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}
          />
          <span>
            {isScriptActive
              ? 'Apps Script Aktif • Sinkron Otomatis 2-Arah'
              : 'Apps Script Belum Terhubung'}
          </span>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs sm:text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* KARTU KONFIGURASI GOOGLE APPS SCRIPT WEB APP (TEMPEL 1X & KUNCI) */}
      {/* ============================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span>Backend Tunggal: Google Apps Script (Sheets &amp; Drive)</span>
                {gasConfig.isLocked && syncUiState.isConfigured && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <Lock className="w-3 h-3" />
                    URL &amp; TOKEN TERKUNCI
                  </span>
                )}
              </div>
              <p className="text-xs font-normal text-slate-500 mt-0.5">
                Tempel URL Web App &amp; API Token 1x saja — tersimpan &amp; terkunci permanen saat refresh maupun dibuka di Vercel.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRepairSheetFromSettings}
              disabled={isRepairingSheet || !syncUiState.isConfigured}
              className="px-3.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Wrench className={`w-3.5 h-3.5 text-amber-700 ${isRepairingSheet ? 'animate-spin' : ''}`} />
              <span>{isRepairingSheet ? 'Memperbaiki...' : 'Perbaiki Sheet'}</span>
            </button>

            <button
              type="button"
              onClick={handleTestAppsScriptConnection}
              disabled={isTestingConnection || !syncUiState.isConfigured}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Activity className={`w-3.5 h-3.5 text-emerald-600 ${isTestingConnection ? 'animate-spin' : ''}`} />
              <span>{isTestingConnection ? 'Menguji...' : 'Uji Koneksi Sheets & Drive'}</span>
            </button>
          </div>
        </div>

        {/* Status Real-time Sinkron & Notif Apps Script */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
              Status Apps Script Web App
            </span>
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  syncUiState.kind === 'error'
                    ? 'bg-rose-500'
                    : syncUiState.kind === 'offline'
                    ? 'bg-amber-500'
                    : isScriptActive
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-slate-400'
                }`}
              />
              <span>
                {syncUiState.kind === 'saving'
                  ? 'Menyimpan ke Sheet...'
                  : syncUiState.kind === 'saved'
                  ? 'Tersimpan ke Sheet'
                  : syncUiState.kind === 'offline'
                  ? syncUiState.message
                  : syncUiState.kind === 'error'
                  ? syncUiState.message
                  : isScriptActive
                  ? 'Aktif & Real-Time Multi-Pengguna'
                  : 'Menunggu URL & Token'}
              </span>
            </div>
            {syncUiState.lastSyncAt && (
              <span className="text-[11px] text-emerald-700 block">
                Update dua arah: {new Date(syncUiState.lastSyncAt).toLocaleTimeString('id-ID')}
              </span>
            )}
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Database Tunggal (Google Sheets)
            </span>
            <div className="font-bold text-slate-900 truncate">
              {systemCheckResult?.sheetName || (isScriptActive ? '10 Tab Aktif Otomatis' : 'Belum terhubung')}
            </div>
            {systemCheckResult?.spreadsheetId && (
              <span className="text-[10px] font-mono text-slate-600 block truncate" title={systemCheckResult.spreadsheetId}>
                ID: {systemCheckResult.spreadsheetId}
              </span>
            )}
            <span className="text-[11px] text-slate-500 block">
              Users: {localCounts.Users} &bull; Presensi: {localCounts.Attendance} &bull; Wajah: {localCounts.FaceRegistry} &bull; Log: {localCounts.Log}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-emerald-600" />
              Drive Privat Foto Wajah
            </span>
            <div className="font-bold text-slate-900 truncate">
              {systemCheckResult?.driveFolderName || (isScriptActive ? 'Folder Privat via DriveApp' : 'Belum terhubung')}
            </div>
            <span className="text-[11px] text-slate-500 block">
              Presensi tidak menyimpan foto (hanya nama, NIP &amp; skor wajah).
            </span>
          </div>
        </div>

        {/* Form Input URL Web App & API Token Rahasia */}
        <form onSubmit={handleSaveAndLockAppsScript} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                URL Web App Google Apps Script (<code className="lowercase font-mono">/exec</code>){' '}
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="url"
                required
                disabled={gasConfig.isLocked && syncUiState.isConfigured}
                value={webAppUrlInput}
                onChange={(e) => setWebAppUrlInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-600"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Didapat setelah Deploy &rarr; Web app di script.google.com (atau via env <code>VITE_APPS_SCRIPT_URL</code>).
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                API Token Rahasia (<code className="font-mono">API_TOKEN</code>){' '}
                <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showToken && !(gasConfig.isLocked && syncUiState.isConfigured) ? 'text' : 'password'}
                  required
                  disabled={gasConfig.isLocked && syncUiState.isConfigured}
                  value={apiTokenInput}
                  onChange={(e) => setApiTokenInput(e.target.value)}
                  placeholder="Harus sama dengan Script Property API_TOKEN"
                  className="w-full pl-3 pr-10 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-600"
                />
                {!(gasConfig.isLocked && syncUiState.isConfigured) && (
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Setiap permintaan wajib membawa token ini dan ditolak jika tidak cocok.
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-slate-500">
              {gasConfig.isLocked && syncUiState.isConfigured
                ? 'Konfigurasi sedang dikunci agar tidak berubah saat refresh atau digunakan di Vercel.'
                : 'Setelah disimpan, URL & Token langsung dikunci dan sinkronisasi otomatis aktif tanpa tombol manual.'}
            </span>

            <div className="flex flex-wrap items-center gap-2">
              {syncUiState.isConfigured && (
                <>
                  <button
                    type="button"
                    onClick={handleCopyConnectedShareLink}
                    className="px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Bagikan link ini ke karyawan agar perangkat mereka langsung terhubung ke Sheet & Drive"
                  >
                    {copiedShareLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedShareLink ? 'Link Terhubung Disalin!' : 'Salin Link Akses Terhubung'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyVercelEnv}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Tempel di Vercel -> Project Settings -> Environment Variables agar semua perangkat otomatis terhubung"
                  >
                    {copiedVercelEnv ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedVercelEnv ? 'Env Vercel Disalin!' : 'Salin Env Vercel'}</span>
                  </button>
                </>
              )}

              {gasConfig.isLocked && syncUiState.isConfigured ? (
                <button
                  type="button"
                  onClick={handleUnlockConfig}
                  className="px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Buka Kunci untuk Ubah URL/Token</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isTestingConnection}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isTestingConnection ? 'Menghubungkan & Mengunci...' : 'Simpan & Kunci Konfigurasi'}</span>
                </button>
              )}
            </div>
          </div>
        </form>

        {/* Panel Kode Apps Script & Panduan Deploy (Copy-Paste) */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/70">
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
                  Kode Backend <code className="font-mono">Code.gs</code> &amp; Petunjuk Deploy Web App
                </h3>
                <p className="text-[11px] text-slate-500">
                  Tanpa Service Account &amp; tanpa Google Cloud Console — cukup Script Properties &amp; Web App.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyCodeGs}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Kode Code.gs Disalin!' : 'Salin Kode Code.gs'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCodePanel(!showCodePanel)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>{showCodePanel ? 'Tutup Panduan' : 'Lihat Panduan & Kode'}</span>
                {showCodePanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {showCodePanel && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
                {APPS_SCRIPT_DEPLOY_STEPS.map((s, idx) => (
                  <div key={`deploy-step-${s.step}-${idx}`} className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                    <div className="text-[10px] font-extrabold text-emerald-700 uppercase">
                      Langkah {s.step}
                    </div>
                    <div className="font-bold text-slate-900 text-xs">{s.title}</div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-slate-900 text-slate-100 p-4 overflow-x-auto max-h-80 text-[11px] font-mono leading-relaxed">
                <pre>{APPS_SCRIPT_CODE}</pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* KARTU KEAMANAN PASSWORD SUPERADMIN (KHUSUS CACHE APLIKASI)     */}
      {/* ============================================================== */}
      {currentUser.role === 'superadmin' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-emerald-400 flex items-center justify-center font-bold">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <span>Password Superadmin (Cache Aplikasi)</span>
                <p className="text-xs font-normal text-slate-500">
                  Disimpan lokal di cache aplikasi (default: <code className="font-mono font-bold">superadmin</code>) dan tidak ditulis ke Google Sheet.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-slate-900 text-emerald-300">
              Cache Lokal
            </span>
          </div>

          <form onSubmit={handleUpdateSuperadminPassword} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Password Baru Superadmin
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type={showSaPassword ? 'text' : 'password'}
                    required
                    value={saNewPassword}
                    onChange={(e) => setSaNewPassword(e.target.value)}
                    placeholder="Minimal 4 karakter"
                    className="w-full pl-9 pr-10 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSaPassword(!showSaPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showSaPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Konfirmasi Password Baru
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type={showSaPassword ? 'text' : 'password'}
                    required
                    value={saConfirmPassword}
                    onChange={(e) => setSaConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang password baru"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={!saNewPassword.trim()}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                <span>Simpan Password Superadmin (Cache)</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================== */}
      {/* KARTU 1: PROFIL KEPALA SEKOLAH (KHUSUS AKUN SHEET KS)          */}
      {/* ============================================================== */}
      {currentUser.role === 'kepala_sekolah' && (
      <>
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <UserIcon className="w-4 h-4" />
            </div>
            <div>
              <span>Profil Akun Kepala Sekolah</span>
              <p className="text-xs font-normal text-slate-500">
                Ubah Nama Lengkap, NIP, Username, Sesi Presensi, dan Email pimpinan sekolah.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800">
            Super Admin
          </span>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Nama Lengkap Kepala Sekolah <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  required
                  value={ksName}
                  onChange={(e) => setKsName(e.target.value)}
                  placeholder="Nama lengkap & gelar Kepala Sekolah"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Alamat Email Kepala Sekolah <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="email"
                  required
                  value={ksEmail}
                  onChange={(e) => setKsEmail(e.target.value)}
                  placeholder="Contoh: kepsek@sekolah.sch.id"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Nomor Telepon / WhatsApp
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={ksPhone}
                  onChange={(e) => setKsPhone(e.target.value)}
                  placeholder="Contoh: 081234567890"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                NIP / Identitas Pegawai Kepala Sekolah <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <ShieldCheck className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  required
                  value={ksNip}
                  onChange={(e) => setKsNip(e.target.value)}
                  placeholder="Contoh: 197508122000031001"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Username Login <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  required
                  value={ksUsername}
                  onChange={(e) => setKsUsername(e.target.value)}
                  placeholder="Username login Kepala Sekolah"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Sesi Presensi Kepala Sekolah */}
            <div className="md:col-span-2 p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>Sesi Presensi yang Berlaku untuk Kepala Sekolah:</span>
                </label>
                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100/80 px-2 py-0.5 rounded-full">
                  Atur Sesi Mandiri
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                {schedules.map((sch, idx) => {
                  const isChecked = ksAssignedSessions.includes(sch.id);
                  return (
                    <label
                      key={`ks-sch-${sch.id || 'item'}-${idx}`}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            if (ksAssignedSessions.length === 1) {
                              setFeedback({ type: 'error', message: 'Kepala Sekolah harus memiliki minimal 1 sesi aktif.' });
                              return;
                            }
                            setKsAssignedSessions(ksAssignedSessions.filter((id) => id !== sch.id));
                          } else {
                            setKsAssignedSessions([...ksAssignedSessions, sch.id]);
                          }
                        }}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className="text-xs">{sch.sessionName || sch.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isUpdatingProfile}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isUpdatingProfile ? 'Menyimpan...' : 'Simpan Profil Kepala Sekolah'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* ============================================================== */}
      {/* KARTU 2: UBAH PASSWORD LOGIN KEPALA SEKOLAH                    */}
      {/* ============================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <span>Ubah Password Login Kepala Sekolah</span>
              <p className="text-xs font-normal text-slate-500">
                Ganti kata sandi login akun Kepala Sekolah (Super Admin).
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800">
            Keamanan Akun
          </span>
        </div>

        <form onSubmit={handleUpdateKsPassword} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Password Baru <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type={showKsPassword ? 'text' : 'password'}
                  required
                  value={ksPassword}
                  onChange={(e) => setKsPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full pl-9 pr-10 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKsPassword(!showKsPassword)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  tabIndex={-1}
                >
                  {showKsPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Konfirmasi Password Baru <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type={showKsPassword ? 'text' : 'password'}
                  required
                  value={ksConfirmPassword}
                  onChange={(e) => setKsConfirmPassword(e.target.value)}
                  placeholder="Ketik ulang password baru"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isUpdatingPassword || !ksPassword.trim()}
              className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Key className="w-3.5 h-3.5" />
              <span>{isUpdatingPassword ? 'Memperbarui Password...' : 'Ubah Password Kepala Sekolah'}</span>
            </button>
          </div>
        </form>
      </div>
      </>
      )}

      {/* ============================================================== */}
      {/* KARTU 3: IDENTITAS SEKOLAH & KEBIJAKAN PRESENSI                */}
      {/* ============================================================== */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="pb-3 border-b border-slate-100 flex items-center gap-2 text-slate-900 font-bold text-base">
            <School className="w-5 h-5 text-emerald-600" />
            <span>Identitas Sekolah</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Nama Sekolah / Instansi <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="Contoh: SMA Negeri 1 Prestasi"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Judul Aplikasi <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={appTitle}
                onChange={(e) => setAppTitle(e.target.value)}
                placeholder="KITARAJIN Presensi & Penugasan"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Alamat Email Sekolah / Instansi <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                value={schoolEmail}
                onChange={(e) => setSchoolEmail(e.target.value)}
                placeholder="info@sekolah.sch.id"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Alamat Lengkap Sekolah
            </label>
            <textarea
              rows={2}
              required
              value={schoolAddress}
              onChange={(e) => setSchoolAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Kebijakan Presensi & Validasi Biometrik */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="pb-3 border-b border-slate-100 flex items-center gap-2 text-slate-900 font-bold text-base">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            <span>Kebijakan Presensi &amp; Validasi Biometrik</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800">
                  Ambang Batas Kecocokan Wajah
                </span>
                <span className="font-extrabold text-sm text-emerald-700 font-mono">
                  {minFaceMatchThreshold}%
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                step="5"
                value={minFaceMatchThreshold}
                onChange={(e) => setMinFaceMatchThreshold(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Toleransi kemiripan wajah langsung saat presensi dengan database wajah (Direkomendasikan: 75%).
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between gap-2">
              <div>
                <span className="font-bold text-xs text-slate-800 block">Validasi Ketat GPS &amp; Wajah</span>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Presensi hanya mencatat nama, NIP, waktu server, skor kecocokan wajah, dan lokasi tanpa menyimpan foto presensi.
                </p>
              </div>
              <div className="space-y-1.5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireStrictGps}
                    onChange={(e) => setRequireStrictGps(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span className="text-xs font-semibold text-slate-700">Wajibkan Verifikasi Radius GPS</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireStrictFace}
                    onChange={(e) => setRequireStrictFace(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span className="text-xs font-semibold text-slate-700">Wajibkan Pencocokan Wajah Kamera</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Semua Pengaturan Sekolah'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
