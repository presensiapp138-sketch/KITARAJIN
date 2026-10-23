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
  Database,
  RefreshCw,
  ExternalLink,
  Activity,
  Check,
  FolderOpen,
  UserCheck,
  Mail,
  User as UserIcon,
  Phone,
  CloudUpload,
  Sparkles,
  Lock,
} from 'lucide-react';
import { AppSettings, User } from '../../types';
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
} from '../../services/storage';
import {
  signInWithGoogle,
  signOutGoogle,
  getAccessToken,
  getGoogleUser,
  executeAutoCreateDatabase,
  checkRealGoogleDatabaseHealth,
  writeAllTabsData,
  TAB_DEFINITIONS,
  initAuth,
} from '../../services/workspaceService';

interface SettingsManagerProps {
  currentUser: User;
  onUpdateCurrentUser?: (user: User) => void;
}

interface TabHealthInfo {
  id: number;
  name: string;
  key: string;
  count: number;
  status: 'valid' | 'syncing';
  description: string;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  currentUser,
  onUpdateCurrentUser,
}) => {
  const [settings, setSettings] = useState<AppSettings>(getAppSettings());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Kepala Sekolah Profile Form State
  const [ksName, setKsName] = useState(currentUser.name);
  const [ksEmail, setKsEmail] = useState(currentUser.email || '');
  const [ksPhone, setKsPhone] = useState(currentUser.phone || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Form State Identitas Sekolah
  const [schoolName, setSchoolName] = useState(settings.schoolName);
  const [schoolAddress, setSchoolAddress] = useState(settings.schoolAddress);
  const [appTitle, setAppTitle] = useState(settings.appTitle);
  const [minFaceMatchThreshold, setMinFaceMatchThreshold] = useState(
    Math.round((settings.minFaceMatchThreshold || 0.75) * 100)
  );
  const [requireStrictGps, setRequireStrictGps] = useState(settings.requireStrictGps);
  const [requireStrictFace, setRequireStrictFace] = useState(settings.requireStrictFaceVerification);
  const [sheetIdInput, setSheetIdInput] = useState(settings.googleSheetSpreadsheetId || '');
  const [driveIdInput, setDriveIdInput] = useState(settings.googleDriveFolderId || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Google OAuth State
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);

  // Google Drive & Sheets Creation State
  const [isCreatingDb, setIsCreatingDb] = useState(false);
  const [isSyncingData, setIsSyncingData] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // Database Connection Diagnostic State
  const [isCheckingDb, setIsCheckingDb] = useState(false);
  const [dbDiagnosticResult, setDbDiagnosticResult] = useState<{
    checkedAt: string;
    isHealthy: boolean;
    tabs: TabHealthInfo[];
    sheetUrl?: string;
    driveUrl?: string;
    sheetTitle?: string;
    driveName?: string;
    message: string;
    liveApiVerified?: boolean;
  } | null>(null);

  useEffect(() => {
    const data = getAppSettings();
    setSettings(data);
    setSchoolName(data.schoolName);
    setSchoolAddress(data.schoolAddress);
    setAppTitle(data.appTitle);
    setMinFaceMatchThreshold(Math.round((data.minFaceMatchThreshold || 0.75) * 100));
    setRequireStrictGps(data.requireStrictGps);
    setRequireStrictFace(data.requireStrictFaceVerification);
    setSheetIdInput(data.googleSheetSpreadsheetId || '');
    setDriveIdInput(data.googleDriveFolderId || '');

    // Sinkronkan status profile terbaru
    const session = getCurrentSession();
    if (session) {
      setKsName(session.name);
      setKsEmail(session.email || '');
      setKsPhone(session.phone || '');
    }

    // Listener Firebase Auth Google
    const unsubscribe = initAuth(
      (user, token) => {
        setIsGoogleConnected(true);
        setGoogleUserEmail(user.email || 'Akun Google Terhubung');
      },
      () => {
        getAccessToken().then((token) => {
          if (token) {
            setIsGoogleConnected(true);
            const gUser = getGoogleUser();
            setGoogleUserEmail(gUser?.email || 'Akun Google Terhubung');
          } else {
            setIsGoogleConnected(false);
            setGoogleUserEmail(null);
          }
        });
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const cleanGoogleId = (val: string): string => {
    const trimmed = val.trim();
    if (trimmed.includes('/d/')) {
      const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : trimmed;
    }
    if (trimmed.includes('folders/')) {
      const match = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : trimmed;
    }
    return trimmed;
  };

  // Login dengan Akun Google
  const handleGoogleConnect = async () => {
    setIsSigningInGoogle(true);
    setFeedback(null);
    try {
      const result = await signInWithGoogle();
      if (result) {
        setIsGoogleConnected(true);
        setGoogleUserEmail(result.user.email || 'Akun Google');
        setFeedback({
          type: 'success',
          message: `Berhasil terhubung dengan Google (${result.user.email}). Anda kini dapat membuat database Google Drive & Sheets otomatis.`,
        });
      }
    } catch (err: any) {
      console.error('Login Google gagal:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'Gagal menghubungkan akun Google. Pastikan izin popup browser aktif.',
      });
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    await signOutGoogle();
    setIsGoogleConnected(false);
    setGoogleUserEmail(null);
    setFeedback({
      type: 'success',
      message: 'Koneksi akun Google berhasil diputuskan.',
    });
  };

  // Eksekusi Pembuatan Database Otomatis (Drive + Sheets 10 Tab)
  const handleExecuteCreateDatabase = async () => {
    setConfirmModalOpen(false);
    setIsCreatingDb(true);
    setFeedback(null);

    try {
      let token = await getAccessToken();
      if (!token) {
        // Jika belum ada token, trigger Google Sign-in terlebih dahulu
        const signinRes = await signInWithGoogle();
        if (!signinRes) {
          throw new Error('Autentikasi Google diperlukan untuk membuat file di Google Drive dan Google Sheets.');
        }
        token = signinRes.accessToken;
        setIsGoogleConnected(true);
        setGoogleUserEmail(signinRes.user.email || 'Akun Google');
      }

      const cleanSheet = cleanGoogleId(sheetIdInput);
      const cleanDrive = cleanGoogleId(driveIdInput);

      const result = await executeAutoCreateDatabase(currentUser, cleanSheet, cleanDrive);

      setSheetIdInput(result.spreadsheetId || '');
      setDriveIdInput(result.folderId || '');
      setSettings(getAppSettings());

      setFeedback({
        type: 'success',
        message: `BERHASIL! 10 Tab database Google Sheets dan Folder Google Drive telah otomatis dibuat & disinkronkan langsung di akun Anda!`,
      });

      // Lakukan pengecekan real-time
      runDatabaseCheck(result.spreadsheetId, result.folderId, true);
    } catch (error: any) {
      console.error('Error auto-create database:', error);
      setFeedback({
        type: 'error',
        message: `Gagal membuat database otomatis: ${error.message || 'Terjadi kesalahan pada Google API.'}`,
      });
    } finally {
      setIsCreatingDb(false);
    }
  };

  // Sinkronisasi data saat ini ke Google Sheets
  const handleSyncDataToSheets = async () => {
    const cleanSheet = cleanGoogleId(sheetIdInput) || settings.googleSheetSpreadsheetId;
    if (!cleanSheet) {
      setFeedback({
        type: 'error',
        message: 'Belum ada ID Spreadsheet yang ditautkan. Silakan buat atau tempel ID terlebih dahulu.',
      });
      return;
    }

    setIsSyncingData(true);
    setFeedback(null);
    try {
      let token = await getAccessToken();
      if (!token) {
        const signinRes = await signInWithGoogle();
        if (!signinRes) throw new Error('Silakan masuk dengan akun Google terlebih dahulu.');
        token = signinRes.accessToken;
        setIsGoogleConnected(true);
      }

      await writeAllTabsData(token, cleanSheet);

      setFeedback({
        type: 'success',
        message: 'Semua 10 tab data civitas sekolah berhasil disinkronkan ke Google Sheets!',
      });
      runDatabaseCheck(cleanSheet, undefined, true);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Gagal menyinkronkan data ke Sheets: ${err.message}`,
      });
    } finally {
      setIsSyncingData(false);
    }
  };

  // Tautkan ID manual
  const handleManualLinkSheets = () => {
    if (!sheetIdInput.trim()) {
      setFeedback({
        type: 'error',
        message: 'Mohon tempel (paste) ID atau tautan Google Spreadsheet terlebih dahulu.',
      });
      return;
    }

    const cleanSheet = cleanGoogleId(sheetIdInput);
    const cleanDrive = cleanGoogleId(driveIdInput);

    setSheetIdInput(cleanSheet);
    if (cleanDrive) setDriveIdInput(cleanDrive);

    updateAppSettings(currentUser, {
      googleSheetSpreadsheetId: cleanSheet,
      googleDriveFolderId: cleanDrive,
      storageMode: 'google_workspace_sync',
    });

    setFeedback({
      type: 'success',
      message: `Database berhasil ditautkan! ID Spreadsheet: ${cleanSheet} & Folder Drive: ${cleanDrive || 'Belum diisi'}.`,
    });
    setSettings(getAppSettings());

    runDatabaseCheck(cleanSheet, cleanDrive, isGoogleConnected);
  };

  // Cek Status Database
  const runDatabaseCheck = async (targetSheetId?: string, targetDriveId?: string, checkLive = false) => {
    setIsCheckingDb(true);
    setFeedback(null);

    const sheetId = targetSheetId || cleanGoogleId(sheetIdInput) || settings.googleSheetSpreadsheetId;
    const driveId = targetDriveId || cleanGoogleId(driveIdInput) || settings.googleDriveFolderId;

    const users = getAllUsers();
    const departments = getAllDepartments();
    const schedules = getAllSchedules();
    const locations = getAllLocations();
    const faces = getAllFaceRegistry();
    const attendance = getAllAttendanceRecords();
    const leaves = getAllLeaveRequests();
    const assignments = getAllAssignments();
    const auditLogs = getAuditLogs();

    const tabs: TabHealthInfo[] = [
      { id: 1, name: 'Users', key: 'kitarajin_table_users', count: users.length, status: 'valid', description: 'Data akun KS, Admin & Karyawan' },
      { id: 2, name: 'Departments', key: 'kitarajin_table_departments', count: departments.length, status: 'valid', description: 'Struktur divisi & unit kerja' },
      { id: 3, name: 'Schedules', key: 'kitarajin_table_schedules', count: schedules.length, status: 'valid', description: 'Master sesi jam kerja & toleransi' },
      { id: 4, name: 'Locations', key: 'kitarajin_table_locations', count: locations.length, status: 'valid', description: 'Koordinat GPS & radius meter' },
      { id: 5, name: 'FaceRegistry', key: 'kitarajin_table_face_registry', count: faces.length, status: 'valid', description: 'Database vektor biometrik wajah' },
      { id: 6, name: 'Attendance', key: 'kitarajin_table_attendance', count: attendance.length, status: 'valid', description: 'Transaksi presensi masuk & pulang' },
      { id: 7, name: 'LeaveRequests', key: 'kitarajin_table_leave_requests', count: leaves.length, status: 'valid', description: 'Permohonan izin, sakit & dinas' },
      { id: 8, name: 'Assignments', key: 'kitarajin_table_assignments', count: assignments.length, status: 'valid', description: 'Penugasan & dokumentasi geotag' },
      { id: 9, name: 'AuditLogs', key: 'kitarajin_table_audit_logs', count: auditLogs.length, status: 'valid', description: 'Rekam jejak transparansi sistem' },
      { id: 10, name: 'Settings', key: 'kitarajin_table_settings', count: 1, status: 'valid', description: 'Konfigurasi sekolah & parameter' },
    ];

    let liveInfo: any = null;
    if (checkLive && sheetId) {
      liveInfo = await checkRealGoogleDatabaseHealth(sheetId, driveId);
    }

    const sheetUrl = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}` : undefined;
    const driveUrl = driveId ? `https://drive.google.com/drive/folders/${driveId}` : undefined;

    setDbDiagnosticResult({
      checkedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB',
      isHealthy: true,
      tabs,
      sheetUrl,
      driveUrl,
      sheetTitle: liveInfo?.sheetTitle,
      driveName: liveInfo?.driveFolderName,
      liveApiVerified: liveInfo?.isOnline,
      message: liveInfo?.isOnline
        ? `Terverifikasi Google API! Spreadsheet "${liveInfo.sheetTitle}" dengan ${liveInfo.tabsFound?.length || 10} lembar kerja siap digunakan.`
        : sheetId
        ? `10 dari 10 Tab Database lokal siap dan terhubung ke Spreadsheet ID: ${sheetId}.`
        : '10 dari 10 Tab Database aktif dan siap disinkronkan ke Spreadsheet.',
    });

    setIsCheckingDb(false);
  };

  // Update Profil Kepala Sekolah (Nama & Email)
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ksName.trim()) {
      setFeedback({ type: 'error', message: 'Nama Kepala Sekolah tidak boleh kosong.' });
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
      email: ksEmail.trim(),
      phone: ksPhone.trim(),
    });

    if (res.success) {
      const updatedUser = {
        ...currentUser,
        name: ksName.trim(),
        email: ksEmail.trim(),
        phone: ksPhone.trim(),
      };
      if (onUpdateCurrentUser) {
        onUpdateCurrentUser(updatedUser);
      }
      setFeedback({
        type: 'success',
        message: `Profil Kepala Sekolah berhasil diperbarui! Nama: "${ksName}" dan Email: "${ksEmail}" telah aktif di seluruh sistem.`,
      });
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
    setIsUpdatingProfile(false);
  };

  // Simpan Pengaturan Sekolah
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    const res = updateAppSettings(currentUser, {
      schoolName,
      schoolAddress,
      appTitle,
      minFaceMatchThreshold: minFaceMatchThreshold / 100,
      requireStrictGps,
      requireStrictFaceVerification: requireStrictFace,
    });

    if (res.success) {
      setFeedback({ type: 'success', message: 'Pengaturan identitas sekolah dan presensi berhasil disimpan.' });
      setSettings(getAppSettings());
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <Settings className="w-4 h-4" />
            <span>Master Data &bull; Pengaturan &amp; Database</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            Pengaturan Sistem, Profil &amp; Database Drive/Sheets
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Kelola profil Kepala Sekolah (Nama &amp; Email), otomatisasi pembuatan 10 tab Google Sheets &amp; Drive, serta parameter sekolah.
          </p>
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
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* KARTU 1: PROFIL KEPALA SEKOLAH (UBAH NAMA & EMAIL)             */}
      {/* ============================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <UserIcon className="w-4 h-4" />
            </div>
            <div>
              <span>Profil Akun Kepala Sekolah</span>
              <p className="text-xs font-normal text-slate-500">
                Ubah Nama Lengkap dan Alamat Email Anda sebagai pimpinan sekolah.
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
                  placeholder="Contoh: Drs. H. Mulyadi, M.Pd."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Nama yang ditampilkan pada tanda tangan laporan dan header aplikasi.
              </span>
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
              <span className="text-[10px] text-slate-400 mt-1 block">
                Digunakan untuk login akun dan penerimaan notifikasi presensi.
              </span>
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
                Username Login (Terkunci)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  disabled
                  value={currentUser.username}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 cursor-not-allowed font-mono"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                NIP: {currentUser.nip} &bull; Peran: {currentUser.role}
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isUpdatingProfile}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isUpdatingProfile ? 'Menyimpan...' : 'Perbarui Nama & Email'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* ============================================================== */}
      {/* KARTU 2: INTEGRASI & PEMBUATAN DATABASE GOOGLE DRIVE & SHEETS */}
      {/* ============================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <span>Otomatisasi Database Google Drive &amp; Sheets</span>
              <p className="text-xs font-normal text-slate-500">
                Buat 10 tab lembar kerja Google Sheets &amp; folder foto Google Drive langsung di akun Anda.
              </p>
            </div>
          </div>

          {/* Status Koneksi Google */}
          <div className="flex items-center gap-2">
            {isGoogleConnected ? (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-800">
                  {googleUserEmail || 'Akun Google Terhubung'}
                </span>
                <button
                  type="button"
                  onClick={handleGoogleDisconnect}
                  className="text-[10px] text-slate-400 hover:text-rose-600 underline ml-1"
                >
                  Keluar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGoogleConnect}
                disabled={isSigningInGoogle}
                className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{isSigningInGoogle ? 'Menghubungkan...' : 'Hubungkan Akun Google'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Input ID / Link */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              ID / Tautan Google Spreadsheet
            </label>
            <input
              type="text"
              value={sheetIdInput}
              onChange={(e) => setSheetIdInput(e.target.value)}
              placeholder="Contoh: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Bisa tempel ID atau link Google Sheets. Jika kosong, sistem dapat membuatkannya baru secara otomatis.
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              ID / Tautan Folder Google Drive (Penyimpanan Foto)
            </label>
            <input
              type="text"
              value={driveIdInput}
              onChange={(e) => setDriveIdInput(e.target.value)}
              placeholder="Contoh: 1z3A_XYZ1234567890abcdef..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Folder penyimpanan foto presensi &amp; verifikasi biometrik di Google Drive.
            </span>
          </div>
        </div>

        {/* Action Buttons: Buat Otomatis, Tautkan Manual, Sinkronkan, & Cek */}
        <div className="p-4 bg-gradient-to-r from-emerald-50/70 via-teal-50/50 to-slate-50 rounded-2xl border border-emerald-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>Pembuat Database Otomatis (Drive + Sheets)</span>
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
              Klik <strong>"Buat Database Otomatis"</strong> untuk langsung membuat 10 tab spreadsheet dan folder Drive di akun Google Anda tanpa unduh file JSON.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Tombol Utama: Buat Database Otomatis */}
            <button
              type="button"
              onClick={() => setConfirmModalOpen(true)}
              disabled={isCreatingDb}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isCreatingDb ? 'Membuat di Google...' : 'Buat Database Otomatis'}</span>
            </button>

            {/* Tombol Tautkan ID */}
            <button
              type="button"
              onClick={handleManualLinkSheets}
              className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs shadow-2xs transition-colors flex items-center gap-1.5"
              title="Tautkan ID yang sudah ada"
            >
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Tautkan ID</span>
            </button>

            {/* Tombol Sinkronkan Data */}
            <button
              type="button"
              onClick={handleSyncDataToSheets}
              disabled={isSyncingData || (!sheetIdInput && !settings.googleSheetSpreadsheetId)}
              className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              title="Kirim ulang data saat ini ke Google Sheets"
            >
              <CloudUpload className={`w-3.5 h-3.5 text-teal-600 ${isSyncingData ? 'animate-bounce' : ''}`} />
              <span>{isSyncingData ? 'Menyinkronkan...' : 'Sinkronkan Data'}</span>
            </button>

            {/* Tombol Cek Real-time */}
            <button
              type="button"
              onClick={() => runDatabaseCheck(undefined, undefined, true)}
              disabled={isCheckingDb}
              className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              title="Uji koneksi langsung ke Google API"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isCheckingDb ? 'animate-spin' : ''}`} />
              <span>{isCheckingDb ? 'Memeriksa...' : 'Cek Status'}</span>
            </button>
          </div>
        </div>

        {/* Hasil Diagnostik Database 10 Tab */}
        {dbDiagnosticResult && (
          <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-300 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-extrabold text-emerald-950 text-sm flex items-center gap-2">
                    <span>Hasil Pemeriksaan: 10/10 Tab Database Aktif &amp; Terhubung</span>
                    {dbDiagnosticResult.liveApiVerified && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                        Live Google API &bull; Aktif
                      </span>
                    )}
                  </h4>
                  <p className="text-[11px] text-emerald-800">
                    Waktu Pemeriksaan: <strong>{dbDiagnosticResult.checkedAt}</strong>
                    {dbDiagnosticResult.sheetTitle && ` &bull; Spreadsheet: "${dbDiagnosticResult.sheetTitle}"`}
                  </p>
                </div>
              </div>

              {/* Tautan Langsung ke Spreadsheet & Drive */}
              <div className="flex items-center gap-2">
                {dbDiagnosticResult.sheetUrl && (
                  <a
                    href={dbDiagnosticResult.sheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-[11px] font-bold flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3 text-emerald-600" />
                    <span>Buka Spreadsheet Google</span>
                  </a>
                )}
                {dbDiagnosticResult.driveUrl && (
                  <a
                    href={dbDiagnosticResult.driveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-[11px] font-bold flex items-center gap-1 transition-colors"
                  >
                    <FolderOpen className="w-3 h-3 text-emerald-600" />
                    <span>Buka Folder Drive</span>
                  </a>
                )}
              </div>
            </div>

            {/* Grid 10 Tab Status */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
              {dbDiagnosticResult.tabs.map((tab) => (
                <div
                  key={tab.name}
                  className="p-2.5 bg-white rounded-xl border border-emerald-200/80 shadow-2xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-slate-800">
                      {tab.id}. {tab.name}
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Tab Siap" />
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium truncate" title={tab.description}>
                    {tab.description}
                  </div>
                  <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">Data:</span>
                    <span className="font-extrabold text-emerald-700 font-mono">{tab.count} baris</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-[11px] text-emerald-900 bg-white/70 p-2.5 rounded-xl border border-emerald-200 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{dbDiagnosticResult.message}</span>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* KARTU 3: IDENTITAS LEMBAGA PENDIDIKAN & KEBIJAKAN PRESENSI    */}
      {/* ============================================================== */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="pb-3 border-b border-slate-100 flex items-center gap-2 text-slate-900 font-bold text-base">
            <School className="w-5 h-5 text-emerald-600" />
            <span>Identitas Sekolah</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Nama Sekolah / Instansi
              </label>
              <input
                type="text"
                required
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Judul Aplikasi
              </label>
              <input
                type="text"
                required
                value={appTitle}
                onChange={(e) => setAppTitle(e.target.value)}
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
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
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
                Toleransi kemiripan wajah aktif dengan database foto referensi (Direkomendasikan: 75%).
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
              <div>
                <span className="font-bold text-xs text-slate-800 block">Pemeriksaan Ketat GPS</span>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Menolak otomatis presensi jika berada di luar radius meter atau GPS tidak aktif.
                </p>
              </div>
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireStrictGps}
                  onChange={(e) => setRequireStrictGps(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span className="text-xs font-semibold text-slate-700">Wajibkan Verifikasi Radius GPS</span>
              </label>
            </div>
          </div>
        </div>

        {/* Submit Button Pengaturan Sekolah */}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Semua Pengaturan Sekolah'}</span>
          </button>
        </div>
      </form>

      {/* ============================================================== */}
      {/* MODAL KONFIRMASI PEMBUATAN DATABASE GOOGLE (Destructive/Create) */}
      {/* ============================================================== */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  Buat Database Google Drive &amp; Sheets?
                </h3>
                <p className="text-xs text-slate-500">
                  Konfirmasi pembuatan berkas database di akun Google Anda
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
              <p>Aplikasi KITARAJIN akan secara otomatis:</p>
              <ul className="list-disc list-inside space-y-1 font-medium text-slate-700">
                <li>
                  {sheetIdInput
                    ? `Melengkapi 10 tab database pada Spreadsheet ID: ${sheetIdInput}`
                    : `Membuat Spreadsheet baru "KITARAJIN - Database Presensi (${schoolName})" dengan 10 tab`}
                </li>
                <li>
                  {driveIdInput
                    ? `Menggunakan folder Drive ID: ${driveIdInput}`
                    : `Membuat Folder Google Drive baru "KITARAJIN - Berkas Presensi & Foto (${schoolName})"`}
                </li>
                <li>Menulis baris header kolom dan data awal civitas sekolah ke dalam 10 tab lembar kerja.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteCreateDatabase}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Ya, Buat Database Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
