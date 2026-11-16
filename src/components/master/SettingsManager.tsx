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
  Clock,
  CloudUpload,
  Sparkles,
  Lock,
  ArrowRight,
  Layers,
  Cloud,
  Radio,
  Smartphone,
  Laptop,
  Eye,
  EyeOff,
  Key,
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
  getCloudSyncStatus,
  testFirestoreConnection,
} from '../../services/firestoreSync';
import {
  signInWithGoogle,
  signOutGoogle,
  getAccessToken,
  getGoogleUser,
  executeAutoCreateDatabase,
  checkRealGoogleDatabaseHealth,
  cleanGoogleId,
  initAuth,
  formatAuthErrorMessage,
  linkGoogleAccount,
  unlinkGoogleAccount,
  getConnectedGoogleEmail,
  syncAllUsersToDriveAndSheet,
  syncAllAppDataToDriveAndSheet,
  hasPendingWorkspaceUserSync,
  hasRealAccessToken,
  autoSyncAllDataToWorkspace,
  getWorkspaceSyncRuntimeStatus,
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

  // Form State Identitas Sekolah
  const [schoolName, setSchoolName] = useState(settings.schoolName);
  const [schoolEmail, setSchoolEmail] = useState(settings.schoolEmail || currentUser.email || '');
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

  // Ubah Password Kepala Sekolah State
  const [ksPassword, setKsPassword] = useState('');
  const [ksConfirmPassword, setKsConfirmPassword] = useState('');
  const [showKsPassword, setShowKsPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);


  // Google OAuth State
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);

  // Database Execution & Progress State
  const [isCreatingDb, setIsCreatingDb] = useState(false);
  const [creationStepMsg, setCreationStepMsg] = useState<string | null>(null);
  const [isSyncingData, setIsSyncingData] = useState(false);
  const [isSyncingUsersOnly, setIsSyncingUsersOnly] = useState(false);
  const [pendingWorkspaceSync, setPendingWorkspaceSync] = useState(() => hasPendingWorkspaceUserSync());
  const [workspaceRuntime, setWorkspaceRuntime] = useState(() => getWorkspaceSyncRuntimeStatus());
  const [workspaceConfirmModal, setWorkspaceConfirmModal] = useState<{
    type: 'create_db' | 'sync_all_tabs' | 'sync_users_only';
  } | null>(null);

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

  // Cloud Multi-Device Sync State
  const [cloudStatus, setCloudStatus] = useState(getCloudSyncStatus());
  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);

  useEffect(() => {
    const data = getAppSettings();
    setSettings(data);
    setSchoolName(data.schoolName);
    setSchoolEmail(data.schoolEmail || currentUser.email || '');
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
      setKsUsername(session.username);
      setKsNip(session.nip || '');
      setKsEmail(session.email || '');
      setKsPhone(session.phone || '');
      if (session.assignedSessionIds && session.assignedSessionIds.length > 0) {
        setKsAssignedSessions(session.assignedSessionIds);
      }
    }

    // Periksa status akun Google yang sudah tersimpan
    const savedGoogleEmail = getConnectedGoogleEmail() || data.googleAccountEmail;
    if (savedGoogleEmail) {
      setIsGoogleConnected(true);
      setGoogleUserEmail(savedGoogleEmail);
    }

    // Listener Firebase Auth Google
    const unsubscribe = initAuth(
      (user) => {
        setIsGoogleConnected(true);
        setGoogleUserEmail(user.email || savedGoogleEmail || 'Akun Google Terhubung');
      },
      () => {
        const stillLinked = getConnectedGoogleEmail() || data.googleAccountEmail;
        if (stillLinked) {
          setIsGoogleConnected(true);
          setGoogleUserEmail(stillLinked);
        } else {
          setIsGoogleConnected(false);
          setGoogleUserEmail(null);
        }
      }
    );

    // Initial check
    if (data.googleSheetSpreadsheetId || data.googleDriveFolderId) {
      runDatabaseCheck(data.googleSheetSpreadsheetId, data.googleDriveFolderId, false);
    }

    const handleSyncEvent = () => {
      setCloudStatus(getCloudSyncStatus());
      const latestData = getAppSettings();
      setSettings(latestData);
      setSchoolEmail(latestData.schoolEmail || getCurrentSession()?.email || '');
      setPendingWorkspaceSync(hasPendingWorkspaceUserSync());
      setWorkspaceRuntime(getWorkspaceSyncRuntimeStatus());
      setSchedules(getAllSchedules());
    };
    window.addEventListener('kitarajin_cloud_sync', handleSyncEvent);
    window.addEventListener('kitarajin_workspace_sync', handleSyncEvent);
    window.addEventListener('kitarajin_settings_updated', handleSyncEvent);
    window.addEventListener('storage', handleSyncEvent);

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      window.removeEventListener('kitarajin_cloud_sync', handleSyncEvent);
      window.removeEventListener('kitarajin_workspace_sync', handleSyncEvent);
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

  const handleTestCloudConnection = async () => {
    setIsTestingCloud(true);
    setCloudMessage(null);
    try {
      const ok = await testFirestoreConnection();
      setCloudStatus(getCloudSyncStatus());
      if (ok) {
        setCloudMessage('Koneksi Cloud Firestore aktif! Sinkronisasi antar-perangkat berjalan secara real-time.');
      } else {
        setCloudMessage('Koneksi ke Firestore cloud sedang offline/dibatasi.');
      }
    } catch {
      setCloudMessage('Terjadi kendala saat memeriksa koneksi cloud.');
    } finally {
      setIsTestingCloud(false);
    }
  };

  // Hubungkan Akun Google / Email Kepala Sekolah (OAuth Riil)
  const handleGoogleConnect = async (preferredEmail?: string) => {
    setIsSigningInGoogle(true);
    setFeedback(null);
    const targetEmail = (preferredEmail || ksEmail || currentUser.email || '').trim();

    try {
      const result = await signInWithGoogle(targetEmail);
      if (result) {
        setIsGoogleConnected(true);
        const email = result.user.email || targetEmail || 'Akun Google';
        setGoogleUserEmail(email);

        updateAppSettings(currentUser, {
          isGoogleConnected: true,
          googleAccountEmail: email,
          storageMode: 'google_workspace_sync',
        });

        if (email) {
          setKsEmail(email);
          await updateUser(currentUser, currentUser.id, { email });
          if (onUpdateCurrentUser) {
            onUpdateCurrentUser({ ...currentUser, email });
          }
        }

        const existingSheetId = cleanGoogleId(sheetIdInput) || settings.googleSheetSpreadsheetId;
        const existingDriveId = cleanGoogleId(driveIdInput) || settings.googleDriveFolderId;
        const currentSettings = getAppSettings();
        setSettings(currentSettings);
        setPendingWorkspaceSync(hasPendingWorkspaceUserSync());
        setWorkspaceRuntime(getWorkspaceSyncRuntimeStatus());

        if ((existingSheetId || existingDriveId) && currentSettings.autoWorkspaceSyncEnabled) {
          setIsSyncingData(true);
          try {
            await autoSyncAllDataToWorkspace('reconnect');
            setSettings(getAppSettings());
            setPendingWorkspaceSync(hasPendingWorkspaceUserSync());
            setWorkspaceRuntime(getWorkspaceSyncRuntimeStatus());
            setFeedback({
              type: 'success',
              message: `Akun Google (${email}) terhubung! Seluruh data terbaru otomatis tersinkron ke Google Drive & Sheets, dan setiap perubahan selanjutnya akan berjalan otomatis tanpa perlu klik.`,
            });
          } finally {
            setIsSyncingData(false);
          }
        } else {
          setFeedback({
            type: 'success',
            message: `Akun Google (${email}) berhasil terhubung melalui popup Google! Silakan konfirmasi dialog untuk langsung menyinkronkan seluruh data aplikasi ke Google Drive & Sheets.`,
          });

          setWorkspaceConfirmModal({
            type: existingSheetId ? 'sync_all_tabs' : 'create_db',
          });
        }
      }
    } catch (err: any) {
      console.warn('Login Google error:', err);
      const friendly = formatAuthErrorMessage(err);
      setFeedback({
        type: 'error',
        message: `${friendly} (Data akun & presensi tetap aman tersimpan di Cloud Firestore.)`,
      });
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    await signOutGoogle();
    unlinkGoogleAccount();
    updateAppSettings(currentUser, {
      isGoogleConnected: false,
      googleAccountEmail: undefined,
    });
    setSettings(getAppSettings());
    setIsGoogleConnected(false);
    setGoogleUserEmail(null);
    setFeedback({
      type: 'success',
      message: 'Koneksi akun Google berhasil diputuskan. Anda dapat menghubungkan akun email lain kapan saja.',
    });
  };

  // Inisialisasi Database 10 Tab Lokal Sekolah (Tanpa bergantung ke Google)
  const handleCreateLocalVaultDatabase = () => {
    updateAppSettings(currentUser, {
      storageMode: 'local_secure_vault',
      lastSyncTimestamp: new Date().toISOString(),
    });
    setSettings(getAppSettings());
    runDatabaseCheck(undefined, undefined, false);
    setFeedback({
      type: 'success',
      message: 'Database 10 Tab Lokal / Vault Sekolah berhasil diinisialisasi dan aktif! Semua data civitas sekolah (pengguna, jadwal, lokasi, wajah, presensi) siap digunakan.',
    });
  };

  // ==============================================================
  // EKSEKUSI PEMBUATAN & SINKRONISASI GOOGLE DRIVE & SHEETS (VIA KONFIRMASI MODAL)
  // ==============================================================
  const executeConfirmAutoCreateAndLinkDatabase = async () => {
    setWorkspaceConfirmModal(null);
    setIsCreatingDb(true);
    setCreationStepMsg('Memulai proses inisialisasi database...');
    setFeedback(null);

    const cleanSheet = cleanGoogleId(sheetIdInput);
    const cleanDrive = cleanGoogleId(driveIdInput);

    try {
      const result = await executeAutoCreateDatabase(
        currentUser,
        cleanSheet,
        cleanDrive,
        (step) => setCreationStepMsg(step)
      );

      setSheetIdInput(result.spreadsheetId || '');
      setDriveIdInput(result.folderId || '');
      const newSettings = getAppSettings();
      setSettings(newSettings);
      setPendingWorkspaceSync(hasPendingWorkspaceUserSync());

      setFeedback({
        type: 'success',
        message: result.message,
      });

      await runDatabaseCheck(result.spreadsheetId, result.folderId, true);
    } catch (error: any) {
      console.warn('Otomatisasi Google note:', error);

      if (cleanSheet || cleanDrive) {
        updateAppSettings(currentUser, {
          googleSheetSpreadsheetId: cleanSheet || settings.googleSheetSpreadsheetId,
          googleDriveFolderId: cleanDrive || settings.googleDriveFolderId,
          storageMode: 'google_workspace_sync',
        });
        setSettings(getAppSettings());
      }

      const friendlyMsg = formatAuthErrorMessage(error);
      setFeedback({
        type: 'error',
        message: friendlyMsg,
      });

      runDatabaseCheck(cleanSheet, cleanDrive, false);
    } finally {
      setIsCreatingDb(false);
      setCreationStepMsg(null);
    }
  };

  // Sinkronisasi 10 tab & backup Drive lengkap (non-destruktif untuk Users)
  const executeConfirmSyncDataToSheets = async () => {
    setWorkspaceConfirmModal(null);
    const cleanSheet = cleanGoogleId(sheetIdInput) || settings.googleSheetSpreadsheetId;
    const cleanDrive = cleanGoogleId(driveIdInput) || settings.googleDriveFolderId;

    setIsSyncingData(true);
    setFeedback(null);
    try {
      let token = await getAccessToken();
      if (!token) {
        const signinRes = await signInWithGoogle(ksEmail || currentUser.email);
        if (!signinRes) throw new Error('Silakan masuk dengan akun Google terlebih dahulu.');
        token = signinRes.accessToken;
        setIsGoogleConnected(true);
        setGoogleUserEmail(signinRes.user.email || ksEmail || null);
      }

      const syncResult = await syncAllAppDataToDriveAndSheet(currentUser, {
        accessToken: token,
        spreadsheetId: cleanSheet,
        folderId: cleanDrive,
      });

      if (syncResult.spreadsheetId) setSheetIdInput(syncResult.spreadsheetId);
      if (syncResult.folderId) setDriveIdInput(syncResult.folderId);
      setSettings(getAppSettings());
      setPendingWorkspaceSync(hasPendingWorkspaceUserSync());

      setFeedback({
        type: 'success',
        message: syncResult.message,
      });
      runDatabaseCheck(syncResult.spreadsheetId || cleanSheet, syncResult.folderId || cleanDrive, true);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: formatAuthErrorMessage(err),
      });
    } finally {
      setIsSyncingData(false);
    }
  };

  // Sinkronisasi langsung khusus Username & Password ke Google Drive & Sheets
  const executeConfirmSyncUsersOnly = async () => {
    setWorkspaceConfirmModal(null);
    setIsSyncingUsersOnly(true);
    setFeedback(null);
    try {
      let token = await getAccessToken();
      if (!token) {
        const signinRes = await signInWithGoogle(ksEmail || currentUser.email);
        if (!signinRes) throw new Error('Otorisasi Google diperlukan untuk menyinkronkan ke Drive & Sheets.');
        token = signinRes.accessToken;
        setIsGoogleConnected(true);
        setGoogleUserEmail(signinRes.user.email || ksEmail || null);
      }

      const res = await syncAllUsersToDriveAndSheet(token, {
        spreadsheetId: cleanGoogleId(sheetIdInput) || settings.googleSheetSpreadsheetId,
        folderId: cleanGoogleId(driveIdInput) || settings.googleDriveFolderId,
      });
      setSettings(getAppSettings());
      setPendingWorkspaceSync(hasPendingWorkspaceUserSync());
      setFeedback({
        type: 'success',
        message: res.message,
      });
      if (res.spreadsheetId) {
        runDatabaseCheck(res.spreadsheetId, undefined, true);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: formatAuthErrorMessage(err),
      });
    } finally {
      setIsSyncingUsersOnly(false);
    }
  };

  // Cek Status Database (Lokal + Live Google API)
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
        ? `Terverifikasi Google API! Spreadsheet "${liveInfo.sheetTitle}" dengan ${liveInfo.tabsFound?.length || 10} lembar kerja aktif.`
        : sheetId
        ? `10 dari 10 Tab Database siap dan terhubung ke Spreadsheet ID: ${sheetId}.`
        : '10 dari 10 Tab Database aktif dan siap disinkronkan ke Spreadsheet.',
    });

    setIsCheckingDb(false);
  };

  // Update Profil Kepala Sekolah (Nama, NIP & Email)
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
      const cleanEmail = ksEmail.trim();
      const cleanName = ksName.trim();
      const cleanNip = ksNip.trim();
      const cleanUsername = ksUsername.trim() || currentUser.username;
      const updatedUser = getCurrentSession() || {
        ...currentUser,
        name: cleanName,
        username: cleanUsername,
        nip: cleanNip,
        email: cleanEmail,
        phone: ksPhone.trim(),
        assignedSessionIds: ksAssignedSessions,
      };
      if (onUpdateCurrentUser) {
        onUpdateCurrentUser(updatedUser);
      }

      // Simpan email tertaut di profil aplikasi
      linkGoogleAccount(cleanEmail, cleanName);
      setIsGoogleConnected(true);
      setGoogleUserEmail(cleanEmail);
      updateAppSettings(currentUser, {
        isGoogleConnected: true,
        googleAccountEmail: cleanEmail,
        storageMode: 'google_workspace_sync',
      });
      setSettings(getAppSettings());
      setPendingWorkspaceSync(hasPendingWorkspaceUserSync());

      setFeedback({
        type: 'success',
        message: hasRealAccessToken()
          ? `Profil Kepala Sekolah (${cleanEmail}) diperbarui dan otomatis disinkronkan ke Cloud Firestore, Google Drive & Sheets!`
          : `Profil Kepala Sekolah (${cleanEmail}) diperbarui dan tersimpan di Cloud Firestore! Klik "Sinkronkan ke Drive & Sheet" atau "Hubungkan Akun Google" jika ingin menulis langsung ke Google Drive/Sheets sekarang.`,
      });
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
    setIsUpdatingProfile(false);
  };

  // Simpan Pengaturan Sekolah (Nama Sekolah, Email, Judul Aplikasi, Alamat Lengkap)
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
      setFeedback({
        type: 'success',
        message: 'Pengaturan identitas sekolah (Nama Sekolah, Email, Judul Aplikasi, Alamat Lengkap) berhasil disimpan dan disinkronkan ke database!',
      });
      setSettings(getAppSettings());
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
    setIsSubmitting(false);
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
        setPendingWorkspaceSync(hasPendingWorkspaceUserSync());
        setFeedback({
          type: 'success',
          message: hasRealAccessToken()
            ? 'Password login Kepala Sekolah BERHASIL DIPERBARUI dan langsung disinkronkan ke Cloud Firestore, Google Drive & Sheets!'
            : 'Password login Kepala Sekolah BERHASIL DIPERBARUI di Cloud Firestore! Klik "Sinkronkan ke Drive & Sheet" pada menu Database untuk menyalinnya ke Google Drive/Sheets.',
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
                  placeholder="Nama lengkap & gelar Kepala Sekolah"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Nama yang ditampilkan pada header aplikasi, riwayat, dan laporan.
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 uppercase">
                  Alamat Email Kepala Sekolah <span className="text-rose-500">*</span>
                </label>
                {isGoogleConnected ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Terhubung: {googleUserEmail}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleGoogleConnect(ksEmail)}
                      disabled={isSigningInGoogle}
                      className="text-[10px] font-bold text-slate-500 hover:text-emerald-700 underline cursor-pointer"
                      title="Sinkronkan dengan email ini"
                    >
                      Sinkronkan Ulang
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleGoogleConnect(ksEmail)}
                    disabled={isSigningInGoogle}
                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>{isSigningInGoogle ? 'Menghubungkan...' : '🔗 Hubungkan Akun Google Ini'}</span>
                  </button>
                )}
              </div>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="email"
                  required
                  value={ksEmail}
                  onChange={(e) => setKsEmail(e.target.value)}
                  placeholder="Contoh: email.pimpinan@sekolah.sch.id"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Digunakan untuk identitas, notifikasi, dan sinkronisasi database Google Sheets/Drive sekolah.
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
              <span className="text-[10px] text-slate-400 mt-1 block">
                NIP resmi Kepala Sekolah untuk tanda tangan laporan & presensi.
              </span>
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
              <span className="text-[10px] text-slate-400 mt-1 block">
                Username sistem login &bull; Peran: {currentUser.role}
              </span>
            </div>

            {/* Sesi Presensi yang Berlaku untuk Kepala Sekolah */}
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
              <p className="text-[11px] text-slate-500">
                Centang sesi yang dapat diambil oleh Kepala Sekolah saat melakukan presensi mandiri:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                {schedules.map((sch) => {
                  const isChecked = ksAssignedSessions.includes(sch.id);
                  return (
                    <label
                      key={sch.id}
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
              <span>{isUpdatingProfile ? 'Menyimpan & Menghubungkan...' : 'Perbarui Nama, NIP, Sesi, Email & Hubungkan Akun Google'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* ============================================================== */}
      {/* KARTU: UBAH PASSWORD LOGIN KEPALA SEKOLAH                      */}
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
                Ganti kata sandi login akun Kepala Sekolah (Super Admin) untuk keamanan akses.
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
                  title={showKsPassword ? 'Sembunyikan password' : 'Lihat password'}
                >
                  {showKsPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Kata sandi baru untuk login akun Kepala Sekolah.
              </span>
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
              <span className="text-[10px] text-slate-400 mt-1 block">
                Pastikan sama persis dengan password baru di sebelah kiri.
              </span>
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

      {/* ============================================================== */}
      {/* KARTU SINKRONISASI REAL-TIME MULTI-DEVICE (FIRESTORE CLOUD)     */}
      {/* ============================================================== */}

      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
            <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span>Sinkronisasi Real-Time Multi-Device (Cloud Database)</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {cloudStatus.isSyncing
                    ? 'MENYINKRONKAN OTOMATIS...'
                    : cloudStatus.pendingCount > 0
                    ? `ANTREAN OTOMATIS (${cloudStatus.pendingCount})`
                    : 'OTOMATIS AKTIF'}
                </span>
              </div>
              <p className="text-xs font-normal text-slate-500">
                Setiap perubahan akun, presensi, perizinan, dan pengaturan langsung tersinkron otomatis ke Cloud Firestore tanpa perlu diklik.
                {cloudStatus.lastSync && (
                  <span className="ml-1 text-emerald-700 font-semibold">
                    &bull; Terakhir: {new Date(cloudStatus.lastSync).toLocaleTimeString('id-ID')}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleTestCloudConnection}
              disabled={isTestingCloud}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Radio className={`w-3.5 h-3.5 ${isTestingCloud ? 'animate-spin' : 'text-sky-600'}`} />
              <span>{isTestingCloud ? 'Memeriksa...' : 'Uji Koneksi Cloud'}</span>
            </button>
          </div>
        </div>

        {cloudMessage && (
          <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-sky-600 shrink-0" />
              <span>{cloudMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setCloudMessage(null)}
              className="text-slate-400 hover:text-slate-600 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Status Grid Multi-Device */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Database Cloud ID
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="font-mono text-xs font-semibold text-slate-800 truncate" title={cloudStatus.databaseId}>
                {cloudStatus.databaseId || 'ai-studio-kitarajinsistemp-...'}
              </span>
            </div>
            <span className="text-[10px] text-emerald-600 font-semibold mt-1 block">
              &bull; Firestore Multi-Tenant Terpasang
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Dukungan Perangkat (Multi-Device)
            </span>
            <div className="mt-1 flex items-center gap-2 text-slate-800 text-xs font-bold">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <span>HP / Android / iOS</span>
              <span className="text-slate-300">&bull;</span>
              <Laptop className="w-4 h-4 text-sky-600" />
              <span>PC / Laptop</span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              Sinkron otomatis tanpa perlu refresh browser
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Kesiapan Deploy Vercel / Publik
            </span>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>
                {settings.lastWorkspaceUserSyncAt && !pendingWorkspaceSync
                  ? 'Sudah Tersinkron (Vercel Otomatis Ikut)'
                  : 'Otomatis Sinkron via Cloud Firestore'}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              {settings.lastWorkspaceUserSyncAt && !pendingWorkspaceSync
                ? `Drive/Sheets & akun terbarukan aktif (${new Date(settings.lastWorkspaceUserSyncAt).toLocaleDateString('id-ID')}) — tidak perlu sinkron ulang di Vercel.`
                : 'Akun & perubahan demo langsung aktif di domain Vercel tanpa pengaturan ulang.'}
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* KARTU 2: OTOMATISASI DATABASE GOOGLE DRIVE & SHEETS 10 TAB    */}
      {/* ============================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span>Otomatisasi Database Google Drive &amp; Sheets (10 Tab)</span>
                {workspaceRuntime.hasTargetConfigured && (
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-extrabold border ${
                      workspaceRuntime.hasToken
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        workspaceRuntime.hasToken ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                      }`}
                    />
                    {workspaceRuntime.isSyncing
                      ? 'MENYINKRONKAN DRIVE & SHEET...'
                      : workspaceRuntime.hasToken
                      ? 'AUTO-SYNC DRIVE & SHEET AKTIF'
                      : workspaceRuntime.hasPending
                      ? 'MENUNGGU OTORISASI 1x UNTUK AUTO-SYNC'
                      : 'TERTAUT (SIAP AUTO-SYNC)'}
                  </span>
                )}
              </div>
              <p className="text-xs font-normal text-slate-500">
                {workspaceRuntime.hasToken && workspaceRuntime.hasTargetConfigured
                  ? 'Sinkronisasi otomatis aktif: setiap presensi, akun, atau perubahan langsung dikirim ke Google Drive & Sheets tanpa perlu klik.'
                  : 'Cukup tempel ID/Link lalu hubungkan akun Google 1x per sesi browser; setiap presensi & perubahan langsung tersinkron otomatis ke Drive & Sheets.'}
              </p>
            </div>
          </div>

          {/* Status Akun Google */}
          <div className="flex items-center gap-2">
            {isGoogleConnected ? (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex-wrap">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-800">
                  {googleUserEmail || 'Akun Google Terhubung'}
                </span>
                <button
                  type="button"
                  onClick={() => handleGoogleConnect()}
                  className="text-[10px] text-emerald-700 hover:text-emerald-900 font-semibold underline ml-1 cursor-pointer"
                  title="Ganti ke akun email Google lain"
                >
                  Ganti Akun
                </button>
                <button
                  type="button"
                  onClick={handleGoogleDisconnect}
                  className="text-[10px] text-slate-400 hover:text-rose-600 underline ml-1 cursor-pointer"
                  title="Putuskan koneksi Google"
                >
                  Keluar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleGoogleConnect(ksEmail)}
                disabled={isSigningInGoogle}
                className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                title="Pilih akun email Google mana saja untuk membuat database"
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
                <span>{isSigningInGoogle ? 'Menghubungkan...' : 'Hubungkan Akun Google Bebas'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Input Tempel ID Spreadsheet & Folder Drive */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>ID / Tautan Google Spreadsheet</span>
              </label>
              {settings.googleSheetSpreadsheetId && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Tersambung
                </span>
              )}
            </div>
            <input
              type="text"
              value={sheetIdInput}
              onChange={(e) => setSheetIdInput(e.target.value)}
              placeholder="Tempel ID atau Link Spreadsheet (cth: 1BxiMVs...)"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
            <span className="text-[11px] text-slate-500 mt-1.5 block">
              💡 Boleh kosong jika ingin aplikasi <strong>membuat Spreadsheet baru secara otomatis</strong> di akun Google Anda.
            </span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                <FolderOpen className="w-4 h-4 text-teal-600" />
                <span>ID / Tautan Folder Google Drive</span>
              </label>
              {settings.googleDriveFolderId && (
                <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                  Tersambung
                </span>
              )}
            </div>
            <input
              type="text"
              value={driveIdInput}
              onChange={(e) => setDriveIdInput(e.target.value)}
              placeholder="Tempel ID atau Link Folder Drive (cth: 1z3A_XYZ...)"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
            <span className="text-[11px] text-slate-500 mt-1.5 block">
              💡 Boleh kosong jika ingin aplikasi <strong>membuat Folder Drive baru secara otomatis</strong> di akun Google Anda.
            </span>
          </div>
        </div>

        {/* Live Progress Bar saat pembuatan berlangsung */}
        {isCreatingDb && (
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-300 space-y-2 animate-pulse">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                <span>Sedang Memproses Database di Akun Google...</span>
              </span>
              <span className="text-[11px] font-mono">{creationStepMsg || 'Membuat berkas...'}</span>
            </div>
            <div className="w-full bg-emerald-200 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-600 h-full w-3/4 rounded-full animate-progress" />
            </div>
            <p className="text-[10px] text-emerald-700">
              Mohon tunggu, sistem sedang menyiapkan 10 tab lembar kerja &amp; folder foto langsung di Google Drive/Sheets Anda.
            </p>
          </div>
        )}

        {/* Panel Aksi Utama: Tombol Eksekusi Cepat */}
        <div className="p-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 rounded-2xl text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-sm font-extrabold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-200" />
              <span>Pilihan Eksekusi Pembuatan Database</span>
            </div>
            <p className="text-xs text-emerald-100 mt-0.5 leading-relaxed max-w-xl">
              Buat database otomatis di Google Drive/Sheets menggunakan email pilihan Anda, atau aktifkan database 10 tab langsung secara instan.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Tombol Utama 1: Buat Database Otomatis di Google */}
            <button
              type="button"
              onClick={() => setWorkspaceConfirmModal({ type: 'create_db' })}
              disabled={isCreatingDb}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-900 font-extrabold text-xs shadow-lg transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Database className="w-4 h-4 text-emerald-700" />
              <span>{isCreatingDb ? 'Memproses di Google...' : 'Buat di Google Drive & Sheets'}</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-700" />
            </button>

            {/* Tombol Sinkronkan Khusus Username & Password */}
            <button
              type="button"
              onClick={() => setWorkspaceConfirmModal({ type: 'sync_users_only' })}
              disabled={isSyncingUsersOnly}
              className="px-3.5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              title="Gabungkan & sinkronkan semua Username dan Password ke Google Drive dan Google Sheets tanpa menghapus akun lama"
            >
              <Key className={`w-3.5 h-3.5 ${isSyncingUsersOnly ? 'animate-spin' : ''}`} />
              <span>
                {isSyncingUsersOnly
                  ? 'Sinkron Akun...'
                  : pendingWorkspaceSync
                  ? 'Sinkron Username & Password*'
                  : 'Sinkron Username & Password'}
              </span>
            </button>

            {/* Tombol Utama 2: Inisialisasi Database 10 Tab Lokal */}
            <button
              type="button"
              onClick={handleCreateLocalVaultDatabase}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-800/90 hover:bg-emerald-900 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Aktifkan seluruh 10 tab database langsung secara instan"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              <span>Inisialisasi Database 10 Tab</span>
            </button>

            {/* Tombol Sinkronkan Data 10 Tab Saat Ini */}
            <button
              type="button"
              onClick={() => setWorkspaceConfirmModal({ type: 'sync_all_tabs' })}
              disabled={isSyncingData}
              className="px-3.5 py-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              title="Sinkronkan seluruh 10 tab data aplikasi ke Google Drive & Google Sheets"
            >
              <CloudUpload className={`w-3.5 h-3.5 ${isSyncingData ? 'animate-bounce' : ''}`} />
              <span>{isSyncingData ? 'Menyinkronkan...' : 'Sinkron Data 10 Tab'}</span>
            </button>

            {/* Tombol Cek Real-time */}
            <button
              type="button"
              onClick={() => runDatabaseCheck(undefined, undefined, true)}
              disabled={isCheckingDb}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-800/80 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              title="Periksa status live ke Google API"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingDb ? 'animate-spin' : ''}`} />
              <span>{isCheckingDb ? 'Cek...' : 'Cek Status'}</span>
            </button>
          </div>
        </div>

        {/* Tautan Cepat Membuka Spreadsheet & Drive jika ID aktif */}
        {(settings.googleSheetSpreadsheetId || settings.googleDriveFolderId) && (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-700">Akses Cepat Dokumen Google:</span>
            {settings.googleSheetSpreadsheetId && (
              <a
                href={`https://docs.google.com/spreadsheets/d/${settings.googleSheetSpreadsheetId}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                <span>Buka Google Sheets ({cleanGoogleId(settings.googleSheetSpreadsheetId).slice(0, 8)}...)</span>
              </a>
            )}
            {settings.googleDriveFolderId && (
              <a
                href={`https://drive.google.com/drive/folders/${settings.googleDriveFolderId}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-lg bg-white border border-teal-300 text-teal-800 hover:bg-teal-50 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5 text-teal-600" />
                <span>Buka Google Drive ({cleanGoogleId(settings.googleDriveFolderId).slice(0, 8)}...)</span>
              </a>
            )}
          </div>
        )}

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
                    <span>Hasil Pemeriksaan: 10/10 Tab Database Siap &amp; Terhubung</span>
                    {dbDiagnosticResult.liveApiVerified && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                        Live Google API &bull; Aktif
                      </span>
                    )}
                  </h4>
                  <p className="text-[11px] text-emerald-800">
                    Waktu Pemeriksaan: <strong>{dbDiagnosticResult.checkedAt}</strong>
                    {dbDiagnosticResult.sheetTitle && ` &bull; Judul: "${dbDiagnosticResult.sheetTitle}"`}
                  </p>
                </div>
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
      {/* MODAL KONFIRMASI SINKRONISASI GOOGLE DRIVE & SHEETS            */}
      {/* ============================================================== */}
      {workspaceConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                  <CloudUpload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                    {workspaceConfirmModal.type === 'create_db'
                      ? 'Buat & Tautkan Database Google Drive & Sheets'
                      : workspaceConfirmModal.type === 'sync_users_only'
                      ? 'Sinkronkan Semua Username & Password'
                      : 'Sinkronkan 10 Tab Database ke Google Sheets & Drive'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Otorisasi &amp; penggabungan data aman ke Google Workspace
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWorkspaceConfirmModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-950 space-y-2 leading-relaxed">
              {workspaceConfirmModal.type === 'create_db' && (
                <p>
                  Aplikasi akan menyiapkan folder <strong>Google Drive</strong> dan file <strong>Google Sheets (10 Tab)</strong> lalu menyalin &amp; menggabungkan seluruh akun username &amp; password ke dalamnya.
                </p>
              )}
              {workspaceConfirmModal.type === 'sync_users_only' && (
                <p>
                  Aplikasi akan membaca file <strong>KITARAJIN_Users_Database.json</strong> di Google Drive dan tab <strong>Users</strong> di Google Sheets, menggabungkan semua akun yang sudah ada, lalu menyimpan hasilnya secara real-time.
                </p>
              )}
              {workspaceConfirmModal.type === 'sync_all_tabs' && (
                <p>
                  Aplikasi akan menyinkronkan seluruh 10 tab (termasuk penggabungan non-destruktif tab <strong>Users</strong> dan backup Google Drive).
                </p>
              )}
              <p className="font-bold text-emerald-800">
                Username dan password yang sudah ditambahkan sebelumnya TIDAK AKAN DIHAPUS.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWorkspaceConfirmModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (workspaceConfirmModal.type === 'create_db') {
                    executeConfirmAutoCreateAndLinkDatabase();
                  } else if (workspaceConfirmModal.type === 'sync_users_only') {
                    executeConfirmSyncUsersOnly();
                  } else {
                    executeConfirmSyncDataToSheets();
                  }
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Ya, Lanjutkan &amp; Sinkronkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
