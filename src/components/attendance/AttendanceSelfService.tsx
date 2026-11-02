/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import {
  User,
  AttendanceType,
  AttendanceRecord,
  LocationConfig,
  Schedule,
} from '../../types';
import {
  getAllLocations,
  getAllSchedules,
  getFaceRegistryByUserId,
  recordAttendance,
  getAttendanceForUser,
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
  const [userRecords, setUserRecords] = useState<AttendanceRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'presensi' | 'riwayat'>(initialTab);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);

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

  // Evaluasi kepatuhan jam presensi terhadap jadwal kerja
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
          reason: `Presensi MASUK belum dibuka. Jam masuk resmi dimulai pukul ${userSchedule.checkInStart} WIB. Waktu saat ini: ${curTime} WIB.`,
        };
      }
      if (curTime >= userSchedule.checkOutStart) {
        return {
          allowed: false,
          statusType: 'closed_in',
          badge: `Sesi Masuk Berakhir (Pukul ${userSchedule.checkOutStart})`,
          color: 'rose',
          reason: `Waktu presensi MASUK sudah ditutup. Saat ini sudah memasuki sesi presensi pulang (mulai pukul ${userSchedule.checkOutStart} WIB).`,
        };
      }
      if (curTime <= userSchedule.checkInDeadline) {
        return {
          allowed: true,
          statusType: 'on_time',
          badge: `Sesi Masuk Tepat Waktu (s/d ${userSchedule.checkInDeadline} WIB)`,
          color: 'emerald',
          reason: `Presensi masuk sedang dibuka dan memenuhi kriteria tepat waktu (batas pukul ${userSchedule.checkInDeadline} WIB).`,
        };
      }
      return {
        allowed: true,
        statusType: 'late',
        badge: `Sesi Masuk: Terlambat (Batas: ${userSchedule.checkInDeadline} WIB)`,
        color: 'amber',
        reason: `Presensi masuk di luar batas tepat waktu (${userSchedule.checkInDeadline} WIB). Kehadiran akan dicatat sebagai TERLAMBAT.`,
      };
    } else {
      // Presensi Pulang
      if (curTime < userSchedule.checkOutStart) {
        return {
          allowed: false,
          statusType: 'early_out',
          badge: `Belum Dibuka (Buka: ${userSchedule.checkOutStart} WIB)`,
          color: 'rose',
          reason: `Presensi PULANG belum dibuka. Jam kepulangan resmi dimulai pukul ${userSchedule.checkOutStart} WIB. Waktu saat ini: ${curTime} WIB.`,
        };
      }
      if (userSchedule.checkOutEnd && curTime > userSchedule.checkOutEnd) {
        return {
          allowed: false,
          statusType: 'closed_out',
          badge: `Sesi Pulang Berakhir (${userSchedule.checkOutEnd} WIB)`,
          color: 'rose',
          reason: `Batas akhir waktu presensi PULANG telah berakhir pada pukul ${userSchedule.checkOutEnd} WIB. Waktu saat ini: ${curTime} WIB.`,
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
    const sch = schedules.find((s) => s.id === currentUser.scheduleId) || schedules[0] || null;
    setUserSchedule(sch);

    setUserRecords(getAttendanceForUser(currentUser.id));
  };

  useEffect(() => {
    loadData();
    detectDeviceLocation();
    startCamera(cameraFacing);

    return () => {
      stopCamera();
    };
  }, []);

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
        videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch {
      setCameraError('Gagal mengakses kamera. Pastikan izin akses kamera diberikan pada peramban.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const toggleCameraFacing = () => {
    const next = cameraFacing === 'user' ? 'environment' : 'user';
    setCameraFacing(next);
    startCamera(next);
  };

  const handleSubmitAttendance = async () => {
    setResultMessage(null);
    setIsProcessing(true);

    // 0. Validasi Ketat Aturan Jam Presensi (Mulai Absen & Pulang)
    const scheduleCheck = getScheduleStatus();
    if (!scheduleCheck.allowed) {
      setIsProcessing(false);
      setResultMessage({
        type: 'error',
        title: `Presensi ${attendanceType.toUpperCase()} Ditolak: Di Luar Aturan Jam`,
        description: scheduleCheck.reason,
        details: userSchedule
          ? `Ketentuan Jadwal: Masuk (${userSchedule.checkInStart} - ${userSchedule.checkInDeadline} WIB) &bull; Pulang (${userSchedule.checkOutStart} - ${userSchedule.checkOutEnd || '18:00'} WIB).`
          : undefined,
      });
      return;
    }

    const appSettings = getAppSettings();
    const threshold = appSettings.minFaceMatchThreshold || 0.75;

    // 1. Validasi GPS
    if (appSettings.requireStrictGps) {
      if (!deviceCoords || gpsDistance === null) {
        setIsProcessing(false);
        setResultMessage({
          type: 'error',
          title: 'Presensi Ditolak: Lokasi GPS Belum Terdeteksi',
          description: 'Sistem belum berhasil membaca koordinat GPS perangkat Anda. Pastikan izin GPS aktif.',
        });
        return;
      }

      if (activeLocation && gpsDistance > activeLocation.radiusMeters) {
        setIsProcessing(false);
        setResultMessage({
          type: 'error',
          title: 'Presensi Ditolak: Berada di Luar Radius Sekolah',
          description: `Jarak Anda saat ini adalah ${gpsDistance} meter dari titik sekolah. Batas maksimal yang diizinkan adalah ${activeLocation.radiusMeters} meter.`,
          details: `Titik Lokasi: ${activeLocation.name} (${activeLocation.address})`,
        });
        return;
      }
    }

    // 2. Ambil snapshot wajah dari kamera video
    if (!videoRef.current) {
      setIsProcessing(false);
      setResultMessage({
        type: 'error',
        title: 'Presensi Ditolak: Kamera Tidak Aktif',
        description: 'Kamera diperlukan untuk verifikasi identitas wajah.',
      });
      return;
    }

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsProcessing(false);
      return;
    }

    if (cameraFacing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (cameraFacing === 'user') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    const liveFaceAnalysis = analyzeFaceFromCanvas(canvas);
    setCapturedSnapshot(liveFaceAnalysis.photoDataUrl);

    if (!liveFaceAnalysis.hasFace) {
      setIsProcessing(false);
      setResultMessage({
        type: 'error',
        title: 'Presensi Ditolak: Wajah Tidak Terdeteksi',
        description: liveFaceAnalysis.feedbackMessage || 'Pastikan wajah menghadap jelas ke kamera dan pencahayaan memadai.',
      });
      return;
    }

    // 3. Cek apakah wajah user sudah terdaftar di Database Wajah Kepala Sekolah
    const registeredFace = getFaceRegistryByUserId(currentUser.id);
    if (!registeredFace) {
      setIsProcessing(false);
      setResultMessage({
        type: 'error',
        title: 'Presensi Ditolak: Wajah Belum Terdaftar',
        description:
          'Data biometrik wajah Anda belum terdaftar di Database Wajah. Silakan hubungi Kepala Sekolah untuk melakukan pendaftaran wajah.',
      });
      return;
    }

    // 4. Hitung skor kemiripan wajah (Cosine distance)
    const similarityScore = calculateFaceSimilarity(
      liveFaceAnalysis.embedding,
      registeredFace.faceEmbedding
    );

    const isFaceValid = similarityScore >= threshold;
    if (!isFaceValid) {
      setIsProcessing(false);
      setResultMessage({
        type: 'error',
        title: 'Presensi Ditolak: Verifikasi Wajah Tidak Cocok',
        description: `Tingkat kemiripan wajah (${Math.round(similarityScore * 100)}%) berada di bawah standar toleransi (${Math.round(threshold * 100)}%). Pastikan tidak ada penghalang pada wajah.`,
      });
      return;
    }

    // 5. Evaluasi Status Kehadiran (Tepat Waktu vs Terlambat)
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentHoursMinutes = now.toTimeString().substring(0, 5); // 'HH:MM'

    let status: 'tepat_waktu' | 'terlambat' = 'tepat_waktu';
    if (attendanceType === 'masuk' && userSchedule) {
      if (currentHoursMinutes > userSchedule.checkInDeadline) {
        status = 'terlambat';
      }
    }

    // 6. Simpan Transaksi Presensi
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
    });

    setIsProcessing(false);

    if (res.success) {
      setResultMessage({
        type: 'success',
        title: `Presensi ${attendanceType.toUpperCase()} Berhasil!`,
        description: `Status: ${status === 'tepat_waktu' ? 'Tepat Waktu' : 'Terlambat'}. Verifikasi Wajah (${Math.round(similarityScore * 100)}%) dan Validasi GPS (${gpsDistance}m) Valid.`,
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

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold mb-3">
              <Camera className="w-3.5 h-3.5" />
              <span>Presensi Mandiri Seluruh Pengguna</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Presensi Kehadiran Sekolah
            </h1>
            <p className="text-emerald-100/80 text-xs sm:text-sm mt-1 max-w-xl leading-relaxed">
              Wajib untuk Kepala Sekolah, Admin, dan Karyawan/Tendik. Memeriksa validitas koordinat GPS dan verifikasi wajah aktif.
            </p>
          </div>

          {/* Tab Switcher: Presensi Aktif vs Riwayat */}
          <div className="flex items-center gap-2 bg-white/10 p-1.5 rounded-2xl border border-white/20 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('presensi')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
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
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'riwayat'
                  ? 'bg-emerald-500 text-white shadow-md'
                  : 'text-slate-200 hover:text-white'
              }`}
            >
              Riwayat Saya ({userRecords.length})
            </button>
          </div>
        </div>

        {/* Rule Reminder */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-2 text-xs text-emerald-200/90">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Identitas diambil otomatis dari akun login: <strong>{currentUser.name}</strong> (NIP: {currentUser.nip}).
            Presensi ditolak jika wajah tidak cocok atau posisi di luar radius sekolah.
          </span>
        </div>
      </div>

      {/* VIEW 1: PRESENSI AKTIF (KAMERA & GPS) */}
      {activeTab === 'presensi' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Kolom Kiri: Kamera Live Viewport (7 Kolom) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-4">
              {/* Ringkasan Status Presensi Hari Ini: Absen Masuk & Pulang */}
              {(() => {
                const todayIso = currentNow.toISOString().split('T')[0];
                const recMasuk = userRecords.find((r) => r.date === todayIso && r.type === 'masuk');
                const recPulang = userRecords.find((r) => r.date === todayIso && r.type === 'pulang');

                return (
                  <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs">
                    {/* Status Absen Masuk */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Absen Masuk Hari Ini
                      </span>
                      {recMasuk ? (
                        <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="font-mono">
                            {new Date(recMasuk.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} WIB
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-normal">
                            {recMasuk.status === 'tepat_waktu' ? 'Tepat' : 'Terlambat'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                          <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>Belum Absen Masuk</span>
                        </div>
                      )}
                    </div>

                    {/* Status Absen Pulang */}
                    <div className="space-y-1 pl-3 border-l border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Absen Pulang Hari Ini
                      </span>
                      {recPulang ? (
                        <div className="flex items-center gap-1.5 text-indigo-800 font-bold">
                          <CheckCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span className="font-mono">
                            {new Date(recPulang.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} WIB
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded font-normal">
                            Sah
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                          <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>Belum Absen Pulang</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-between">
                {/* Selector: Masuk vs Pulang */}
                <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setAttendanceType('masuk')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      attendanceType === 'masuk'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Presensi Masuk
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttendanceType('pulang')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      attendanceType === 'pulang'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Presensi Pulang
                  </button>
                </div>

                <button
                  type="button"
                  onClick={toggleCameraFacing}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
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
                      <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 text-xs animate-in fade-in">
                        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-rose-900">
                            Aturan Jam Presensi: {attendanceType.toUpperCase()} Belum / Tidak Diizinkan
                          </div>
                          <p className="mt-0.5 text-rose-700 leading-relaxed">{schedStatus.reason}</p>
                          <p className="mt-1 text-[11px] text-rose-600/80 font-medium">
                            Tombol presensi terkunci otomatis demi mematuhi ketentuan jam kehadiran sekolah.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Viewport Video */}
              <div className="relative aspect-4/3 bg-slate-950 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center border-2 border-emerald-500/30">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${cameraFacing === 'user' ? 'scale-x-[-1]' : ''}`}
                />

                {/* Face Scanning Guide Overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-52 h-64 rounded-full border-2 border-dashed border-emerald-400/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.3)] flex items-center justify-center">
                    <span className="text-[10px] text-white/90 bg-slate-900/60 px-2 py-0.5 rounded-full font-medium">
                      Posisikan Wajah Anda di Dalam Oval
                    </span>
                  </div>
                </div>

                {/* Top Overlay Badges */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-slate-900/70 backdrop-blur-xs text-white rounded-lg text-[10px] font-semibold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Kamera Aktif
                  </span>
                </div>

                <div className="absolute bottom-3 right-3 px-2 py-1 bg-slate-900/70 backdrop-blur-xs text-white rounded-lg text-[10px] font-mono">
                  {currentNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WIB
                </div>
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
                const isDisabled = isProcessing || !schedStatus.allowed;

                return (
                  <button
                    type="button"
                    onClick={handleSubmitAttendance}
                    disabled={isDisabled}
                    className={`w-full py-3.5 px-4 rounded-2xl text-white font-extrabold text-sm shadow-lg transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
                      isDisabled
                        ? 'bg-slate-400 text-slate-100 shadow-none opacity-80 cursor-not-allowed'
                        : attendanceType === 'masuk'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-600/30'
                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-indigo-600/30'
                    }`}
                  >
                    {isProcessing ? (
                      <span>Memverifikasi Wajah &amp; GPS...</span>
                    ) : !schedStatus.allowed ? (
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-slate-200" />
                        <span>Presensi {attendanceType.toUpperCase()} Terkunci (Di Luar Jadwal)</span>
                      </div>
                    ) : (
                      <>
                        <Camera className="w-5 h-5" />
                        <span>Lakukan Presensi {attendanceType.toUpperCase()} Sekarang</span>
                      </>
                    )}
                  </button>
                );
              })()}
            </div>
          </div>

          {/* Kolom Kanan: Status Validasi GPS & Jadwal (5 Kolom) */}
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
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
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

            {/* Jadwal Saya Card */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>Aturan Jam &amp; Sesi Kerja</span>
                </div>
                {userSchedule && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    {userSchedule.sessionName || 'Sesi Reguler'}
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
                        <span className="font-mono text-emerald-700">{userSchedule.checkInStart} - {userSchedule.checkInDeadline}</span>
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
                        <span className="font-mono text-indigo-700">{userSchedule.checkOutStart} - {userSchedule.checkOutEnd || '18:00'}</span>
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

      {/* VIEW 2: RIWAYAT PRESENSI SAYA */}
      {activeTab === 'riwayat' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <History className="w-5 h-5 text-emerald-600" />
                Riwayat Presensi Mandiri Saya
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Histori kehadiran Anda yang tersimpan di tabel Attendance.
              </p>
            </div>
            <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
              Total: {userRecords.length} Catatan
            </span>
          </div>

          {userRecords.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Belum ada riwayat presensi yang tercatat untuk akun Anda.
            </div>
          ) : (
            <div className="space-y-4">
              {groupAttendanceByDateAndUser(userRecords).map((pair) => {
                const hasMasuk = Boolean(pair.masukRecord);
                const hasPulang = Boolean(pair.pulangRecord);

                return (
                  <div
                    key={pair.date}
                    className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-3"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs">{pair.date}</span>
                        {pair.date === currentNow.toISOString().split('T')[0] && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800">
                            Hari Ini
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
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
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewPhoto({
                                  url: pair.masukRecord!.photoRef,
                                  title: `Foto Absen Masuk - ${pair.date}`,
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
                            </div>
                          </div>
                        ) : (
                          <div className="py-2 text-center text-[11px] text-slate-400">
                            Belum absen masuk
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
                            Absen Pulang
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
                                  title: `Foto Absen Pulang - ${pair.date}`,
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
                            </div>
                          </div>
                        ) : (
                          <div className="py-2 text-center text-[11px] text-slate-400">
                            Belum absen pulang
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
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
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
                className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold"
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
