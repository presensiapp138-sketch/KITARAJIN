/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Camera,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  SwitchCamera,
  ShieldCheck,
  CalendarCheck,
  Navigation,
  RefreshCw,
  Sparkles,
  Info,
  History,
  FileCheck,
  Lock,
  X,
  Users,
  UserCheck,
  Calendar,
  Filter,
  Check,
  Sliders,
  Save,
} from 'lucide-react';
import {
  User,
  AttendanceType,
  AttendanceRecord,
  LocationConfig,
  Schedule,
  Department,
} from '../../types';
import {
  getAllLocations,
  getAllSchedules,
  getAllDepartments,
  updateSchedule,
  getFaceRegistryByUserId,
  recordAttendance,
  getAttendanceForUser,
  getAllAttendanceRecords,
  getAllUsers,
  getAppSettings,
  groupAttendanceByDateAndUser,
} from '../../services/storage';
import { analyzeFaceFromCanvas, calculateFaceSimilarity } from '../../services/faceService';

interface AttendanceSelfServiceProps {
  currentUser: User;
  initialTab?: 'presensi' | 'riwayat';
}

// Rumus Haversine untuk kalkulasi jarak GPS
function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export const AttendanceSelfService: React.FC<AttendanceSelfServiceProps> = ({
  currentUser,
  initialTab = 'presensi',
}) => {
  const [attendanceType, setAttendanceType] = useState<AttendanceType>('masuk');
  const [activeLocation, setActiveLocation] = useState<LocationConfig | null>(null);
  const [userSchedule, setUserSchedule] = useState<Schedule | null>(null);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allAttendanceRecords, setAllAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [userRecords, setUserRecords] = useState<AttendanceRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'presensi' | 'riwayat'>(initialTab);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);

  // Riwayat State (Bisa cek hari ini maupun hari sebelumnya)
  const [historyScope, setHistoryScope] = useState<'self' | 'team'>('self');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
  const [dateFilterPreset, setDateFilterPreset] = useState<'all' | 'today' | 'yesterday' | 'custom'>('today');
  const [customDate, setCustomDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // GPS State
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsDistance, setGpsDistance] = useState<number | null>(null);
  const [isInsideRadius, setIsInsideRadius] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Camera State
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedSnapshot, setCapturedSnapshot] = useState<string | null>(null);

  // Processing & Feedback State
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [resultMessage, setResultMessage] = useState<{
    type: 'success' | 'error';
    title: string;
    description: string;
    details?: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Live Clock Ticker untuk validasi aturan jam presensi real-time
  const [currentNow, setCurrentNow] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Status Pemilihan Sesi Wajib Oleh Karyawan
  const [hasUserExplicitlySelectedSession, setHasUserExplicitlySelectedSession] = useState<boolean>(false);

  // Quick Edit Jam Sesi Khusus Admin & Kepala Sekolah
  const [isQuickSessionEditOpen, setIsQuickSessionEditOpen] = useState(false);
  const [quickCheckInStart, setQuickCheckInStart] = useState('');
  const [quickCheckInDeadline, setQuickCheckInDeadline] = useState('');
  const [quickCheckOutStart, setQuickCheckOutStart] = useState('');
  const [quickCheckOutEnd, setQuickCheckOutEnd] = useState('');
  const [isSavingQuickSession, setIsSavingQuickSession] = useState(false);

  const openQuickSessionEdit = (sch?: Schedule | null) => {
    const target = sch || userSchedule;
    if (!target) return;
    setQuickCheckInStart(target.checkInStart || '06:00');
    setQuickCheckInDeadline(target.checkInDeadline || '07:30');
    setQuickCheckOutStart(target.checkOutStart || '11:30');
    setQuickCheckOutEnd(target.checkOutEnd || '13:00');
    setIsQuickSessionEditOpen(true);
  };

  const handleSaveQuickSessionTimes = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userSchedule) return;
    setIsSavingQuickSession(true);
    const res = updateSchedule(currentUser, userSchedule.id, {
      checkInStart: quickCheckInStart,
      checkInDeadline: quickCheckInDeadline,
      checkOutStart: quickCheckOutStart,
      checkOutEnd: quickCheckOutEnd,
    });
    setIsSavingQuickSession(false);
    if (res.success) {
      loadData();
      setIsQuickSessionEditOpen(false);
      setResultMessage({
        type: 'success',
        title: 'Jam Sesi Berhasil Disimpan',
        description: `Jam ${userSchedule.sessionName || userSchedule.name} berhasil diperbarui: Masuk (${quickCheckInStart} - ${quickCheckInDeadline} WIB), Pulang (${quickCheckOutStart} - ${quickCheckOutEnd} WIB). Langsung aktif di sistem.`,
      });
    } else {
      alert(res.message);
    }
  };

  // Filter sesi yang berlaku khusus untuk karyawan ini
  const userAllowedSchedules = useMemo(() => {
    if (currentUser.assignedSessionIds && currentUser.assignedSessionIds.length > 0) {
      const filtered = allSchedules.filter((s) => currentUser.assignedSessionIds?.includes(s.id));
      if (filtered.length > 0) return filtered;
    }
    return allSchedules;
  }, [allSchedules, currentUser.assignedSessionIds]);

  // Evaluasi kepatuhan jam presensi terhadap jadwal kerja / sesi aktif
  const getScheduleStatus = () => {
    if (!userSchedule) {
      return {
        allowed: true,
        statusType: 'open',
        badge: 'Jadwal Reguler',
        color: 'emerald',
        reason: 'Jadwal presensi terbuka.',
      };
    }

    const hours = String(currentNow.getHours()).padStart(2, '0');
    const mins = String(currentNow.getMinutes()).padStart(2, '0');
    const curTime = `${hours}:${mins}`;

    if (attendanceType === 'masuk') {
      if (curTime < userSchedule.checkInStart) {
        return {
          allowed: false,
          statusType: 'early_in',
          badge: `Belum Dibuka (Buka: ${userSchedule.checkInStart} WIB)`,
          color: 'rose',
          reason: `Presensi MASUK ${userSchedule.sessionName || 'Sesi'} belum dibuka. Jam masuk dimulai pukul ${userSchedule.checkInStart} WIB. Waktu sekarang: ${curTime} WIB.`,
        };
      }
      if (curTime >= userSchedule.checkOutStart) {
        return {
          allowed: false,
          statusType: 'closed_in',
          badge: `Sesi Masuk Berakhir (Pukul ${userSchedule.checkOutStart})`,
          color: 'rose',
          reason: `Waktu presensi MASUK ${userSchedule.sessionName || 'Sesi'} sudah ditutup. Saat ini sudah memasuki jam kepulangan sesi (mulai pukul ${userSchedule.checkOutStart} WIB).`,
        };
      }
      if (curTime <= userSchedule.checkInDeadline) {
        return {
          allowed: true,
          statusType: 'on_time',
          badge: `Sesi Masuk Tepat Waktu (s/d ${userSchedule.checkInDeadline} WIB)`,
          color: 'emerald',
          reason: `Presensi masuk memenuhi kriteria tepat waktu (batas pukul ${userSchedule.checkInDeadline} WIB).`,
        };
      }
      return {
        allowed: true,
        statusType: 'late',
        badge: `Sesi Masuk: Terlambat (Batas: ${userSchedule.checkInDeadline} WIB)`,
        color: 'amber',
        reason: `Presensi masuk melebihi batas waktu (${userSchedule.checkInDeadline} WIB). Kehadiran dicatat sebagai TERLAMBAT.`,
      };
    } else {
      // Presensi Pulang
      if (curTime < userSchedule.checkOutStart) {
        return {
          allowed: false,
          statusType: 'early_out',
          badge: `Belum Dibuka (Buka: ${userSchedule.checkOutStart} WIB)`,
          color: 'rose',
          reason: `Presensi PULANG ${userSchedule.sessionName || 'Sesi'} belum dibuka. Jam kepulangan dimulai pukul ${userSchedule.checkOutStart} WIB. Waktu sekarang: ${curTime} WIB.`,
        };
      }
      if (userSchedule.checkOutEnd && curTime > userSchedule.checkOutEnd) {
        return {
          allowed: false,
          statusType: 'closed_out',
          badge: `Sesi Pulang Berakhir (${userSchedule.checkOutEnd} WIB)`,
          color: 'rose',
          reason: `Batas akhir waktu presensi PULANG ${userSchedule.sessionName || 'Sesi'} telah berakhir pada pukul ${userSchedule.checkOutEnd} WIB. Waktu saat ini: ${curTime} WIB.`,
        };
      }
      return {
        allowed: true,
        statusType: 'open_out',
        badge: `Sesi Pulang Aktif (s/d ${userSchedule.checkOutEnd || '18:00'} WIB)`,
        color: 'indigo',
        reason: `Presensi pulang sah dan dapat diajukan sekarang.`,
      };
    }
  };

  const loadData = () => {
    const locations = getAllLocations();
    const activeLoc = locations.find((l) => l.isActive) || locations[0] || null;
    setActiveLocation(activeLoc);

    const schedules = getAllSchedules();
    setAllSchedules(schedules);

    const userSessions = currentUser.assignedSessionIds || [];
    const assigned = schedules.filter((s) => userSessions.includes(s.id));
    if (assigned.length === 1) {
      setUserSchedule(assigned[0]);
      setHasUserExplicitlySelectedSession(true);
    } else {
      setUserSchedule((prev) => {
        if (prev && schedules.some((s) => s.id === prev.id)) {
          return schedules.find((s) => s.id === prev.id) || prev;
        }
        return assigned[0] || schedules[0] || null;
      });
    }

    setUserRecords(getAttendanceForUser(currentUser.id));
    setDepartments(getAllDepartments());
    setAllUsers(getAllUsers());
    setAllAttendanceRecords(getAllAttendanceRecords());
  };

  useEffect(() => {
    loadData();
    detectDeviceLocation();
    startCamera(cameraFacing);

    const handleSync = () => {
      loadData();
    };
    window.addEventListener('kitarajin_cloud_sync', handleSync);

    return () => {
      stopCamera();
      window.removeEventListener('kitarajin_cloud_sync', handleSync);
    };
  }, []);

  // Otomatis atur tombol Masuk vs Pulang saat karyawan memilih sesi
  const handleSelectSession = (sched: Schedule) => {
    setUserSchedule(sched);
    setHasUserExplicitlySelectedSession(true);
    setResultMessage(null);
    const today = currentNow.toISOString().split('T')[0];
    const hasMasuk = userRecords.some((r) => r.date === today && r.type === 'masuk' && r.sessionId === sched.id);
    const hasPulang = userRecords.some((r) => r.date === today && r.type === 'pulang' && r.sessionId === sched.id);

    if (hasMasuk && !hasPulang) {
      setAttendanceType('pulang');
    } else {
      setAttendanceType('masuk');
    }
  };

  // Update jarak setiap kali koordinat GPS atau lokasi berubah
  useEffect(() => {
    if (deviceCoords && activeLocation) {
      const dist = calculateHaversineDistance(
        deviceCoords.lat,
        deviceCoords.lng,
        activeLocation.latitude,
        activeLocation.longitude
      );
      setGpsDistance(dist);
      setIsInsideRadius(dist <= activeLocation.radiusMeters);
    }
  }, [deviceCoords, activeLocation]);

  const detectDeviceLocation = () => {
    if (!('geolocation' in navigator)) {
      setGpsError('Perangkat peramban Anda tidak mendukung sensor Geolocation GPS.');
      return;
    }

    setIsLocating(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDeviceCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setIsLocating(false);
      },
      (err) => {
        setIsLocating(false);
        setGpsError('Izin akses lokasi GPS ditolak atau sensor tidak aktif. Harap aktifkan izin lokasi.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  };

  const startCamera = async (facing: 'user' | 'environment') => {
    stopCamera();
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Peramban Anda tidak mendukung akses kamera.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch((err) => {
            console.warn('Video play error:', err);
          });
        };
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Camera error:', err);
      setIsCameraActive(false);
      if (err.name === 'NotAllowedError') {
        setCameraError('Akses kamera ditolak. Berikan izin kamera di peramban Anda.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('Kamera tidak ditemukan di perangkat ini.');
      } else {
        setCameraError('Gagal menghubungkan kamera perangkat.');
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const toggleCameraFacing = () => {
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    setCameraFacing(nextFacing);
    startCamera(nextFacing);
  };

  // Submit Presensi
  const handleSubmitAttendance = async () => {
    if (!videoRef.current) {
      setResultMessage({
        type: 'error',
        title: 'Kamera Tidak Aktif',
        description: 'Pastikan kamera aktif sebelum melakukan verifikasi presensi.',
      });
      return;
    }

    if (!hasUserExplicitlySelectedSession && userAllowedSchedules.length > 1) {
      setResultMessage({
        type: 'error',
        title: 'Wajib Memilih Sesi Terlebih Dahulu',
        description: 'Silakan pilih sesi yang akan Anda presensikan (Sesi 1, Sesi 2, atau Sesi 3) pada pilihan tombol sesi di bawah sebelum melakukan presensi.',
      });
      return;
    }

    const schedStatus = getScheduleStatus();
    if (!schedStatus.allowed) {
      setResultMessage({
        type: 'error',
        title: 'Presensi Ditolak Aturan Jam',
        description: schedStatus.reason,
      });
      return;
    }

    const settings = getAppSettings();

    // 1. Validasi Radius GPS
    if (settings.requireStrictGps && !isInsideRadius) {
      setResultMessage({
        type: 'error',
        title: 'Lokasi Berada di Luar Radius',
        description: `Jarak Anda (${gpsDistance !== null ? gpsDistance : 'N/A'}m) melebihi batas radius izin sekolah (${activeLocation?.radiusMeters}m). Presensi ditolak.`,
      });
      return;
    }

    setIsProcessing(true);
    setResultMessage(null);

    // 2. Capture Frame Kamera
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsProcessing(false);
      return;
    }
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const liveFaceAnalysis = analyzeFaceFromCanvas(canvas);
    setCapturedSnapshot(liveFaceAnalysis.photoDataUrl);

    // 3. Ambil Database Wajah Terdaftar Pegawai
    const registeredFace = getFaceRegistryByUserId(currentUser.id);
    if (!registeredFace) {
      setIsProcessing(false);
      setResultMessage({
        type: 'error',
        title: 'Wajah Belum Terdaftar',
        description:
          'Data wajah Anda belum terdaftar di sistem. Hubungi Kepala Sekolah atau Admin untuk registrasi biometrik.',
      });
      return;
    }

    // 4. Hitung Kemiripan Biometrik Wajah
    const similarityScore = calculateFaceSimilarity(
      liveFaceAnalysis.embedding,
      registeredFace.faceEmbedding
    );

    const minMatch = settings.minFaceMatchThreshold || 0.75;
    if (similarityScore < minMatch) {
      setIsProcessing(false);
      setResultMessage({
        type: 'error',
        title: 'Verifikasi Wajah Gagal',
        description: `Tingkat kecocokan wajah hanya ${Math.round(
          similarityScore * 100
        )}% (Dibutuhkan minimal ${Math.round(minMatch * 100)}%). Wajah tidak sesuai dengan pemilik akun.`,
      });
      return;
    }

    // 5. Tentukan Status Tepat Waktu atau Terlambat
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentHoursMinutes = now.toTimeString().substring(0, 5); // 'HH:MM'

    let status: 'tepat_waktu' | 'terlambat' = 'tepat_waktu';
    if (attendanceType === 'masuk' && userSchedule) {
      if (currentHoursMinutes > userSchedule.checkInDeadline) {
        status = 'terlambat';
      }
    }

    // 6. Simpan Transaksi Presensi (Terhubung Sesi & Realtime Cloud Sync)
    const res = recordAttendance({
      userId: currentUser.id,
      nip: currentUser.nip,
      userName: currentUser.name,
      role: currentUser.role,
      date: todayStr,
      type: attendanceType,
      status,
      latitude: deviceCoords ? deviceCoords.lat : 0,
      longitude: deviceCoords ? deviceCoords.lng : 0,
      distanceFromLocationMeters: gpsDistance || 0,
      isLocationValid: isInsideRadius,
      isFaceValid: true,
      faceSimilarityScore: similarityScore,
      photoRef: liveFaceAnalysis.photoDataUrl,
      deviceInfo: `${navigator.userAgent.substring(0, 50)} &bull; ${cameraFacing}`,
      sessionId: userSchedule?.id,
      sessionName: userSchedule?.sessionName || userSchedule?.name,
      notes: `Sesi: ${userSchedule?.sessionName || userSchedule?.name || 'Reguler'}`,
    });

    setIsProcessing(false);

    if (res.success) {
      setResultMessage({
        type: 'success',
        title: `Presensi ${attendanceType.toUpperCase()} Berhasil!`,
        description: `Status: ${status === 'tepat_waktu' ? 'Tepat Waktu' : 'Terlambat'}. Sesi: ${userSchedule?.sessionName || userSchedule?.name || 'Reguler'}. Jam: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} WIB. Verifikasi Wajah (${Math.round(similarityScore * 100)}%) dan Validasi GPS (${gpsDistance}m) Sah.`,
      });
      loadData();
    } else {
      setResultMessage({
        type: 'error',
        title: 'Presensi Gagal',
        description: res.message,
      });
    }
  };

  // ==============================================================
  // DATA FILTERING UNTUK TAB RIWAYAT PRESENSI
  // ==============================================================
  const getFilteredRecords = () => {
    let records = historyScope === 'self' ? userRecords : allAttendanceRecords;

    if (historyScope === 'team' && selectedStaffId !== 'all') {
      records = records.filter((r) => r.userId === selectedStaffId);
    }

    if (dateFilterPreset === 'today') {
      const today = currentNow.toISOString().split('T')[0];
      records = records.filter((r) => r.date === today);
    } else if (dateFilterPreset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yesterday = y.toISOString().split('T')[0];
      records = records.filter((r) => r.date === yesterday);
    } else if (dateFilterPreset === 'custom' && customDate) {
      records = records.filter((r) => r.date === customDate);
    }

    return records;
  };

  const filteredHistoryRecords = getFilteredRecords();

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold mb-3">
              <Camera className="w-3.5 h-3.5" />
              <span>Presensi Fleksibel Sesi 1, 2, 3</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Presensi Kehadiran Civitas Sekolah
            </h1>
            <p className="text-emerald-100/80 text-xs sm:text-sm mt-1 max-w-xl leading-relaxed">
              Pilih Sesi 1, Sesi 2, atau Sesi 3 sesuai penugasan Anda. Aturan jam mulai masuk dan kepulangan diatur secara terpusat oleh Admin &amp; Kepala Sekolah.
            </p>
          </div>

          {/* Tab Switcher: Presensi Aktif vs Riwayat */}
          <div className="flex items-center gap-2 bg-white/10 p-1.5 rounded-2xl border border-white/20 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('presensi')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'presensi'
                  ? 'bg-emerald-500 text-white shadow-md'
                  : 'text-slate-200 hover:text-white'
              }`}
            >
              Kamera &amp; GPS
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('riwayat')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'riwayat'
                  ? 'bg-emerald-500 text-white shadow-md'
                  : 'text-slate-200 hover:text-white'
              }`}
            >
              Cek Riwayat Presensi
            </button>
          </div>
        </div>

        {/* Rule Reminder */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between gap-2 text-xs text-emerald-200/90 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Identitas Login: <strong>{currentUser.name}</strong> ({currentUser.role.replace('_', ' ').toUpperCase()}) &bull; Sesi Dipilih:{' '}
              <strong className="text-white underline">{userSchedule?.sessionName || userSchedule?.name || 'Sesi 1'}</strong>
            </span>
          </div>
          <span className="text-[10px] text-emerald-300 font-mono bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-400/20">
            Realtime Cloud Multi-Device Aktif
          </span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* VIEW 1: PRESENSI AKTIF (KAMERA, PILIHAN SESI 1, 2, 3 & GPS)    */}
      {/* ============================================================== */}
      {activeTab === 'presensi' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Kolom Kiri: Kamera Live Viewport (7 Kolom) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-4">
              
              {/* KARTU IDENTITAS PRESENSI MANDIRI PRIBADI */}
              <div className="p-3.5 bg-slate-900 text-white rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md border border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center font-black text-white text-base shadow-inner">
                    {currentUser.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm">{currentUser.name}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                        {currentUser.role.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>NIP: <span className="font-mono text-white font-bold">{currentUser.nip}</span></span>
                      <span className="text-slate-500">&bull;</span>
                      <span>Jabatan / Posisi: <span className="text-emerald-300 font-bold">{currentUser.position || 'Staff'}</span></span>
                    </div>
                  </div>
                </div>
                <div className="text-left sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                  <span className="text-[11px] font-extrabold text-emerald-400 flex items-center sm:justify-end gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Presensi Mandiri Pribadi</span>
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Dilarang mewakili orang / sesi lain
                  </span>
                </div>
              </div>

              {/* INDIKATOR WAJIB MEMILIH SESI */}
              {!hasUserExplicitlySelectedSession && userAllowedSchedules.length > 1 ? (
                <div className="p-3 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-center gap-2.5 text-xs text-amber-900 font-bold animate-pulse">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Wajib Pilih Sesi: Silakan klik salah satu sesi yang akan Anda ikuti hari ini (Sesi 1, Sesi 2, atau Sesi 3) di bawah ini sebelum mengambil foto.</span>
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-950 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Sesi Terpilih: <strong>{userSchedule?.sessionName || userSchedule?.name}</strong></span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-700 bg-white px-2 py-0.5 rounded-lg border border-emerald-200">
                    Masuk: {userSchedule?.checkInStart}-{userSchedule?.checkInDeadline} | Pulang: {userSchedule?.checkOutStart} WIB
                  </span>
                </div>
              )}

              {/* RINGKASAN STATUS PRESENSI HARI INI PER SESI (SESI 1, SESI 2, SESI 3) */}
              <div className="space-y-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                  Status Presensi Hari Ini Per Sesi Anda
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {userAllowedSchedules.map((sch) => {
                    const todayIso = currentNow.toISOString().split('T')[0];
                    const recMasuk = userRecords.find(
                      (r) => r.date === todayIso && r.type === 'masuk' && r.sessionId === sch.id
                    );
                    const recPulang = userRecords.find(
                      (r) => r.date === todayIso && r.type === 'pulang' && r.sessionId === sch.id
                    );
                    const isSelected = userSchedule?.id === sch.id;

                    return (
                      <div
                        key={sch.id}
                        onClick={() => handleSelectSession(sch)}
                        className={`p-3 rounded-2xl border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20'
                            : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/80'
                        }`}
                      >
                        <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-slate-200/60">
                          <span className={`font-extrabold ${isSelected ? 'text-emerald-900' : 'text-slate-800'}`}>
                            {sch.sessionName || sch.name}
                          </span>
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          )}
                        </div>

                        {/* Status Masuk */}
                        <div className="space-y-1 text-[11px]">
                          <div className="flex items-center justify-between text-slate-600">
                            <span>Masuk:</span>
                            {recMasuk ? (
                              <span className="font-bold font-mono text-emerald-800">
                                {new Date(recMasuk.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Belum</span>
                            )}
                          </div>

                          {/* Status Pulang */}
                          <div className="flex items-center justify-between text-slate-600">
                            <span>Pulang:</span>
                            {recPulang ? (
                              <span className="font-bold font-mono text-indigo-800">
                                {new Date(recPulang.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Belum</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* TOMBOL PEMILIH SESI 1, SESI 2, SESI 3 & ATUR JAM SESI */}
              <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/90 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span>Pilih Sesi yang Akan Dipresensikan:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(currentUser.role === 'kepala_sekolah' || currentUser.role === 'admin') && (
                      <button
                        type="button"
                        onClick={() => openQuickSessionEdit(userSchedule)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                        title="Ubah jam buka presensi masuk & jam pulang untuk sesi ini"
                      >
                        <Sliders className="w-3 h-3" />
                        <span>Atur Jam {userSchedule?.sessionName || 'Sesi'}</span>
                      </button>
                    )}
                    <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-full border border-emerald-200">
                      Aturan Diatur Admin/KS
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {userAllowedSchedules.map((sch) => {
                    const isSelected = userSchedule?.id === sch.id;
                    return (
                      <button
                        key={sch.id}
                        type="button"
                        onClick={() => handleSelectSession(sch)}
                        className={`p-2.5 rounded-xl text-left transition-all border cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="font-extrabold text-xs flex items-center justify-between">
                          <span>{sch.sessionName || sch.name}</span>
                          {isSelected && <span>✓ Aktif</span>}
                        </div>
                        <div className={`text-[10px] font-mono mt-1 ${isSelected ? 'text-emerald-100' : 'text-slate-600'}`}>
                          Masuk: {sch.checkInStart} - {sch.checkInDeadline}
                        </div>
                        <div className={`text-[10px] font-mono ${isSelected ? 'text-emerald-100' : 'text-slate-600'}`}>
                          Pulang: {sch.checkOutStart} - {sch.checkOutEnd || '18:00'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selector Masuk vs Pulang & Switch Kamera */}
              <div className="flex items-center justify-between">
                <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setAttendanceType('masuk')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      attendanceType === 'masuk'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Presensi Masuk ({userSchedule?.sessionName || 'Sesi'})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttendanceType('pulang')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      attendanceType === 'pulang'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Presensi Pulang ({userSchedule?.sessionName || 'Sesi'})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={toggleCameraFacing}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Ganti Kamera Depan / Belakang"
                >
                  <SwitchCamera className="w-4 h-4 text-emerald-600" />
                  <span className="hidden sm:inline">Kamera {cameraFacing === 'user' ? 'Depan' : 'Belakang'}</span>
                </button>
              </div>

              {/* Real-time Schedule Window Status Pill */}
              {(() => {
                const schedStatus = getScheduleStatus();
                return (
                  <>
                    <div
                      className={`p-3 rounded-2xl border text-xs flex items-center justify-between transition-all ${
                        schedStatus.allowed
                          ? schedStatus.color === 'emerald'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-rose-50 border-rose-200 text-rose-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold">
                        {schedStatus.allowed ? (
                          <Clock className={`w-4 h-4 ${schedStatus.color === 'emerald' ? 'text-emerald-600' : 'text-amber-600'}`} />
                        ) : (
                          <Lock className="w-4 h-4 text-rose-600" />
                        )}
                        <span>{schedStatus.badge}</span>
                      </div>
                      <span className="font-mono text-[11px] font-bold text-slate-700 bg-white/70 px-2 py-0.5 rounded-lg border border-slate-200/50">
                        {currentNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WIB
                      </span>
                    </div>

                    {!schedStatus.allowed && (
                      <div className="p-3 bg-rose-50/70 border border-rose-200 text-rose-900 rounded-xl text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <p className="font-bold text-[11px]">Waktu Presensi Sesi Terkunci:</p>
                          <p className="text-[11px] text-rose-800 leading-relaxed">{schedStatus.reason}</p>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Viewport Kamera Video */}
              <div className="relative aspect-4/3 bg-slate-950 rounded-2xl overflow-hidden border-2 border-slate-200 flex items-center justify-center shadow-inner">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${cameraFacing === 'user' ? 'scale-x-[-1]' : ''}`}
                />

                {/* Target Face Guide Oval */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-60 border-2 border-dashed border-emerald-400/70 rounded-full animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.2)] flex items-center justify-center">
                    <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider bg-slate-900/70 px-2 py-0.5 rounded-full">
                      Posisikan Wajah Di Sini
                    </span>
                  </div>
                </div>

                {!isCameraActive && (
                  <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center text-slate-300 p-4 text-center">
                    <Camera className="w-10 h-10 text-slate-500 mb-2 animate-bounce" />
                    <span className="text-xs font-semibold">Menghubungkan Kamera...</span>
                    <button
                      type="button"
                      onClick={() => startCamera(cameraFacing)}
                      className="mt-3 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Buka Kamera Ulang
                    </button>
                  </div>
                )}
              </div>

              {cameraError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{cameraError}</span>
                </div>
              )}

              {/* Primary Action Button */}
              {(() => {
                const schedStatus = getScheduleStatus();
                const isSessionConfirmed = hasUserExplicitlySelectedSession || userAllowedSchedules.length <= 1;
                const isDisabled = isProcessing || !schedStatus.allowed || !isSessionConfirmed;

                return (
                  <button
                    type="button"
                    onClick={handleSubmitAttendance}
                    disabled={isDisabled}
                    className={`w-full py-3.5 px-4 rounded-2xl text-white font-extrabold text-sm shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed ${
                      isDisabled
                        ? 'bg-slate-400 text-slate-100 shadow-none opacity-80 cursor-not-allowed'
                        : attendanceType === 'masuk'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-600/30'
                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-indigo-600/30'
                    }`}
                  >
                    {isProcessing ? (
                      <span>Memverifikasi Wajah &amp; GPS...</span>
                    ) : !isSessionConfirmed ? (
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-200" />
                        <span>⚠️ Silakan Pilih Sesi (Sesi 1, 2, atau 3) di Atas</span>
                      </div>
                    ) : !schedStatus.allowed ? (
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-slate-200" />
                        <span>Presensi {attendanceType.toUpperCase()} Terkunci (Di Luar Jadwal {userSchedule?.sessionName || 'Sesi'})</span>
                      </div>
                    ) : (
                      <>
                        <Camera className="w-5 h-5" />
                        <span>
                          Lakukan Presensi {attendanceType.toUpperCase()} ({userSchedule?.sessionName || 'Sesi'}) Sekarang
                        </span>
                      </>
                    )}
                  </button>
                );
              })()}
            </div>
          </div>

          {/* Kolom Kanan: Status Validasi GPS & Jadwal Sesi (5 Kolom) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Result Message Box */}
            {resultMessage && (
              <div
                className={`p-5 rounded-3xl border shadow-sm space-y-2 ${
                  resultMessage.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-center gap-2 font-extrabold text-sm">
                  {resultMessage.type === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  )}
                  <span>{resultMessage.title}</span>
                </div>
                <p className="text-xs leading-relaxed font-medium">{resultMessage.description}</p>
                {resultMessage.details && (
                  <p className="text-[11px] opacity-80 pt-1 border-t border-rose-200/60">
                    {resultMessage.details}
                  </p>
                )}
              </div>
            )}

            {/* GPS Geofence Status Card */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <span>Validasi Lokasi GPS</span>
                </div>
                <button
                  type="button"
                  onClick={detectDeviceLocation}
                  disabled={isLocating}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                  <span>Refresh GPS</span>
                </button>
              </div>

              {activeLocation ? (
                <div className="space-y-2 text-xs">
                  <div className="font-bold text-slate-900">{activeLocation.name}</div>
                  <div className="text-[11px] text-slate-500">{activeLocation.address}</div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">
                        Jarak Anda
                      </span>
                      <span className="font-extrabold font-mono text-slate-800 text-sm">
                        {gpsDistance !== null ? `${gpsDistance} meter` : 'Mendeteksi...'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">
                        Batas Radius
                      </span>
                      <span className="font-extrabold font-mono text-emerald-700 text-sm">
                        {activeLocation.radiusMeters} meter
                      </span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs flex items-center justify-center gap-1.5 ${
                      isInsideRadius
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {isInsideRadius ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span>Di Dalam Radius (Lokasi Sah)</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-rose-600" />
                        <span>Di Luar Radius Presensi</span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400">Belum ada titik presensi sekolah yang aktif.</div>
              )}
            </div>

            {/* Jadwal Sesi Terpilih Card */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>Rincian Sesi Aktif</span>
                </div>
                {userSchedule && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {userSchedule.sessionName || 'Sesi 1'}
                  </span>
                )}
              </div>

              {userSchedule ? (
                <div className="space-y-3 text-xs">
                  <div className="font-bold text-slate-900 text-sm">{userSchedule.name}</div>

                  <div className="space-y-1.5">
                    {/* Sesi Masuk */}
                    <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100 text-[11px] space-y-1">
                      <div className="font-bold text-emerald-900 flex items-center justify-between">
                        <span>Sesi Presensi Masuk</span>
                        <span className="font-mono text-emerald-700">
                          {userSchedule.checkInStart} - {userSchedule.checkInDeadline}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 text-[10px]">
                        <span>Buka Presensi: <strong>{userSchedule.checkInStart} WIB</strong></span>
                        <span>Toleransi: <strong className="text-amber-700">+{userSchedule.lateToleranceMinutes} mnt</strong></span>
                      </div>
                    </div>

                    {/* Sesi Pulang */}
                    <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100 text-[11px] space-y-1">
                      <div className="font-bold text-indigo-900 flex items-center justify-between">
                        <span>Sesi Presensi Pulang</span>
                        <span className="font-mono text-indigo-700">
                          {userSchedule.checkOutStart} - {userSchedule.checkOutEnd || '18:00'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 text-[10px]">
                        <span>Mulai Pulang: <strong>{userSchedule.checkOutStart} WIB</strong></span>
                        <span>Batas Akhir: <strong>{userSchedule.checkOutEnd || '18:00'} WIB</strong></span>
                      </div>
                    </div>
                  </div>

                  {userSchedule.ruleNotes && (
                    <p className="text-[10px] text-slate-500 italic bg-slate-50 p-2 rounded-lg border border-slate-200/50">
                      &bull; {userSchedule.ruleNotes}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400">Jadwal belum ditentukan.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* VIEW 2: CEK RIWAYAT PRESENSI HARIAN (HARI INI / HARI SEBELUMNYA) */}
      {/* ============================================================== */}
      {activeTab === 'riwayat' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-5">
          {/* Header Riwayat & Filter */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <History className="w-5 h-5 text-emerald-600" />
                <span>Riwayat Presensi Mandiri &amp; Harian Civitas</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Periksa catatan presensi harian per sesi, baik hari ini maupun hari-hari sebelumnya secara lengkap.
              </p>
            </div>

            {/* Jika Admin atau Kepala Sekolah, tampilkan toggle: Saya vs Karyawan/Tim */}
            {(currentUser.role === 'admin' || currentUser.role === 'kepala_sekolah') && (
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-start md:self-auto">
                <button
                  type="button"
                  onClick={() => setHistoryScope('self')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    historyScope === 'self'
                      ? 'bg-white text-emerald-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Presensi Saya</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryScope('team')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    historyScope === 'team'
                      ? 'bg-white text-emerald-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Cek Presensi Karyawan &amp; Rekan</span>
                </button>
              </div>
            )}
          </div>

          {/* Filter Toolbar: Pilihan Tanggal (Hari ini, Kemarin, Hari Sebelumnya, Date Picker) & Pegawai */}
          <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                <span>Filter Tanggal:</span>
              </span>

              <button
                type="button"
                onClick={() => {
                  setDateFilterPreset('today');
                  setCustomDate(new Date().toISOString().split('T')[0]);
                }}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  dateFilterPreset === 'today'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Hari Ini
              </button>

              <button
                type="button"
                onClick={() => {
                  setDateFilterPreset('yesterday');
                  const d = new Date();
                  d.setDate(d.getDate() - 1);
                  setCustomDate(d.toISOString().split('T')[0]);
                }}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  dateFilterPreset === 'yesterday'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Kemarin
              </button>

              <button
                type="button"
                onClick={() => {
                  setDateFilterPreset('all');
                  setCustomDate('');
                }}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  dateFilterPreset === 'all'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Semua Hari
              </button>

              {/* Date Input untuk pilih tanggal hari sebelumnya secara bebas */}
              <div className="flex items-center gap-1 ml-1">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => {
                    setCustomDate(e.target.value);
                    setDateFilterPreset('custom');
                  }}
                  className="px-2.5 py-1 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                  title="Pilih tanggal hari sebelumnya"
                />
              </div>
            </div>

            {/* Filter Karyawan (jika mode team) */}
            {historyScope === 'team' && (currentUser.role === 'admin' || currentUser.role === 'kepala_sekolah') && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Pegawai:
                </span>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className="px-3 py-1 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="all">Semua Pegawai ({allUsers.length})</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* List Riwayat Berpasangan (Masuk & Pulang) Per Sesi */}
          {filteredHistoryRecords.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Tidak ada catatan presensi pada tanggal yang dipilih.
            </div>
          ) : (
            <div className="space-y-4">
              {groupAttendanceByDateAndUser(filteredHistoryRecords).map((pair) => {
                const hasMasuk = Boolean(pair.masukRecord);
                const hasPulang = Boolean(pair.pulangRecord);
                const sessionLabel = pair.masukRecord?.sessionName || pair.pulangRecord?.sessionName;

                return (
                  <div
                    key={`${pair.date}_${pair.userId}_${pair.masukRecord?.id || ''}_${pair.pulangRecord?.id || ''}`}
                    className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200/60 gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-xs">{pair.date}</span>
                        {pair.date === currentNow.toISOString().split('T')[0] && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800">
                            Hari Ini
                          </span>
                        )}
                        <span className="text-slate-400 text-xs">&bull;</span>
                        <span className="text-xs font-bold text-slate-800">{pair.userName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">({pair.nip})</span>
                        {sessionLabel && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-100 text-sky-800 border border-sky-200">
                            {sessionLabel}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200 w-fit">
                        {hasMasuk && hasPulang
                          ? 'Selesai (Masuk & Pulang)'
                          : hasMasuk
                          ? 'Belum Absen Pulang'
                          : 'Belum Presensi'}
                      </span>
                    </div>

                    {/* DUA KOLOM BERDAMPINGAN: ABSEN MASUK & ABSEN PULANG */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Absen Masuk */}
                      <div
                        className={`p-3 rounded-xl border text-xs ${
                          hasMasuk
                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                            : 'bg-white border-dashed border-slate-200 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-[11px] mb-2">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Absen Masuk {sessionLabel ? `(${sessionLabel})` : ''}
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
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewPhoto({
                                  url: pair.masukRecord!.photoRef,
                                  title: `Foto Absen Masuk - ${pair.userName} (${pair.date})`,
                                })
                              }
                              className="shrink-0 group relative cursor-pointer"
                              title="Klik untuk perbesar"
                            >
                              <img
                                src={pair.masukRecord.photoRef}
                                alt="Foto Masuk"
                                className="w-12 h-12 rounded-xl object-cover border border-emerald-300 group-hover:opacity-85"
                              />
                            </button>
                            <div className="text-[11px] space-y-0.5">
                              <div className="font-bold font-mono">
                                {new Date(pair.masukRecord.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}{' '}
                                WIB
                              </div>
                              <div className="text-slate-600 text-[10px]">
                                Jarak: {pair.masukRecord.distanceFromLocationMeters}m &bull; Wajah:{' '}
                                {Math.round(pair.masukRecord.faceSimilarityScore * 100)}%
                              </div>
                              {pair.masukRecord.sessionName && (
                                <div className="text-[10px] text-emerald-700 font-semibold">
                                  {pair.masukRecord.sessionName}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="py-2 text-center text-[11px] text-slate-400">
                            Belum absen masuk untuk sesi ini
                          </div>
                        )}
                      </div>

                      {/* Absen Pulang */}
                      <div
                        className={`p-3 rounded-xl border text-xs ${
                          hasPulang
                            ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950'
                            : 'bg-white border-dashed border-slate-200 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-[11px] mb-2">
                          <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${hasPulang ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                            Absen Pulang {sessionLabel ? `(${sessionLabel})` : ''}
                          </span>
                          {hasPulang && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-indigo-200 text-indigo-900">
                              Pulang Sah
                            </span>
                          )}
                        </div>

                        {hasPulang && pair.pulangRecord ? (
                          <div className="flex items-start gap-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewPhoto({
                                  url: pair.pulangRecord!.photoRef,
                                  title: `Foto Absen Pulang - ${pair.userName} (${pair.date})`,
                                })
                              }
                              className="shrink-0 group relative cursor-pointer"
                              title="Klik untuk perbesar"
                            >
                              <img
                                src={pair.pulangRecord.photoRef}
                                alt="Foto Pulang"
                                className="w-12 h-12 rounded-xl object-cover border border-indigo-300 group-hover:opacity-85"
                              />
                            </button>
                            <div className="text-[11px] space-y-0.5">
                              <div className="font-bold font-mono">
                                {new Date(pair.pulangRecord.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}{' '}
                                WIB
                              </div>
                              <div className="text-slate-600 text-[10px]">
                                Jarak: {pair.pulangRecord.distanceFromLocationMeters}m &bull; Wajah:{' '}
                                {Math.round(pair.pulangRecord.faceSimilarityScore * 100)}%
                              </div>
                              {pair.pulangRecord.sessionName && (
                                <div className="text-[10px] text-indigo-700 font-semibold">
                                  {pair.pulangRecord.sessionName}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="py-2 text-center text-[11px] text-slate-400">
                            Belum absen pulang untuk sesi ini
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Preview Foto Wajah */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-xs">{previewPhoto.title}</h3>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-slate-950 flex justify-center">
              <img
                src={previewPhoto.url}
                alt="Foto Bukti"
                className="max-h-72 rounded-2xl object-contain border border-slate-700"
              />
            </div>
            <div className="p-3 bg-slate-50 text-right">
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Quick Edit Jam Sesi (Khusus Kepala Sekolah & Admin) */}
      {isQuickSessionEditOpen && userSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    Atur Jam {userSchedule.sessionName || userSchedule.name}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Perubahan langsung aktif dan sinkron ke seluruh HP karyawan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickSessionEditOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickSessionTimes} className="p-5 space-y-4">
              {/* Aturan Masuk */}
              <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                    1. Jam Presensi Masuk
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                      setQuickCheckInStart(cur);
                      const later = new Date(now.getTime() + 60 * 60000);
                      const latStr = `${String(later.getHours()).padStart(2, '0')}:${String(later.getMinutes()).padStart(2, '0')}`;
                      setQuickCheckInDeadline(latStr);
                    }}
                    className="text-[10px] font-bold text-emerald-700 bg-emerald-200/60 hover:bg-emerald-200 px-2 py-0.5 rounded cursor-pointer"
                  >
                    ⚡ Buka Masuk Jam Sekarang
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">
                      Jam Mulai Masuk (Dibuka):
                    </label>
                    <input
                      type="time"
                      required
                      value={quickCheckInStart}
                      onChange={(e) => setQuickCheckInStart(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-[9px] text-slate-400 block mt-0.5">Tombol masuk dibuka</span>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-emerald-900 block mb-1">
                      Batas Tepat Waktu:
                    </label>
                    <input
                      type="time"
                      required
                      value={quickCheckInDeadline}
                      onChange={(e) => setQuickCheckInDeadline(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-300 text-xs font-mono font-bold bg-white text-emerald-700 focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-[9px] text-emerald-600 block mt-0.5">Batas keterlambatan</span>
                  </div>
                </div>
              </div>

              {/* Aturan Pulang */}
              <div className="p-3.5 bg-indigo-50 rounded-2xl border border-indigo-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950 uppercase tracking-wide">
                    2. Jam Presensi Pulang
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                      setQuickCheckOutStart(cur);
                      const later = new Date(now.getTime() + 120 * 60000);
                      const latStr = `${String(later.getHours()).padStart(2, '0')}:${String(later.getMinutes()).padStart(2, '0')}`;
                      setQuickCheckOutEnd(latStr);
                    }}
                    className="text-[10px] font-bold text-indigo-700 bg-indigo-200/60 hover:bg-indigo-200 px-2 py-0.5 rounded cursor-pointer"
                  >
                    ⚡ Buka Pulang Jam Sekarang
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">
                      Jam Mulai Pulang (Dibuka):
                    </label>
                    <input
                      type="time"
                      required
                      value={quickCheckOutStart}
                      onChange={(e) => setQuickCheckOutStart(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white text-indigo-700 focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-[9px] text-slate-400 block mt-0.5">Tombol pulang dibuka</span>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">
                      Batas Akhir Pulang:
                    </label>
                    <input
                      type="time"
                      required
                      value={quickCheckOutEnd}
                      onChange={(e) => setQuickCheckOutEnd(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-[9px] text-slate-400 block mt-0.5">Penutupan presensi pulang</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsQuickSessionEditOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuickSession}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingQuickSession ? 'Menyimpan...' : 'Simpan Jam Sesi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
