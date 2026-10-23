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
} from '../../services/storage';
import { analyzeFaceFromCanvas, calculateFaceSimilarity } from '../../services/faceService';

interface AttendanceSelfServiceProps {
  currentUser: User;
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

export const AttendanceSelfService: React.FC<AttendanceSelfServiceProps> = ({ currentUser }) => {
  const [attendanceType, setAttendanceType] = useState<AttendanceType>('masuk');
  const [activeLocation, setActiveLocation] = useState<LocationConfig | null>(null);
  const [userSchedule, setUserSchedule] = useState<Schedule | null>(null);
  const [userRecords, setUserRecords] = useState<AttendanceRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'presensi' | 'riwayat'>('presensi');

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
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WIB
                </div>
              </div>

              {cameraError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{cameraError}</span>
                </div>
              )}

              {/* Primary Action Button */}
              <button
                type="button"
                onClick={handleSubmitAttendance}
                disabled={isProcessing}
                className={`w-full py-3.5 px-4 rounded-2xl text-white font-extrabold text-sm shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
                  attendanceType === 'masuk'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-600/30'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-indigo-600/30'
                }`}
              >
                {isProcessing ? (
                  <span>Memverifikasi Wajah &amp; GPS...</span>
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    <span>Lakukan Presensi {attendanceType.toUpperCase()} Sekarang</span>
                  </>
                )}
              </button>
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
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100 text-xs font-bold uppercase tracking-wider text-slate-700">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span>Aturan Jadwal Kerja Anda</span>
              </div>

              {userSchedule ? (
                <div className="space-y-2 text-xs">
                  <div className="font-bold text-slate-900">{userSchedule.name}</div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-xl bg-slate-50">
                      <span className="text-slate-400 block">Batas Tepat Waktu</span>
                      <span className="font-bold text-slate-800">{userSchedule.checkInDeadline}</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50">
                      <span className="text-slate-400 block">Toleransi Terlambat</span>
                      <span className="font-bold text-amber-700">+{userSchedule.lateToleranceMinutes} Menit</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 pt-1">
                    Presensi pulang dapat dilakukan mulai pukul <strong>{userSchedule.checkOutStart} WIB</strong>.
                  </div>
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
            <div className="divide-y divide-slate-100">
              {userRecords.map((rec) => (
                <div key={rec.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {rec.photoRef ? (
                      <img
                        src={rec.photoRef}
                        alt="Foto Presensi"
                        className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-2xs"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                        <Camera className="w-5 h-5" />
                      </div>
                    )}

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm capitalize">
                          Presensi {rec.type}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            rec.status === 'tepat_waktu'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {rec.status === 'tepat_waktu' ? 'Tepat Waktu' : 'Terlambat'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {rec.date} &bull; {new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} WIB
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-1">
                        <span>Jarak: {rec.distanceFromLocationMeters}m</span>
                        <span>&bull;</span>
                        <span>Kecocokan Wajah: {Math.round(rec.faceSimilarityScore * 100)}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right sm:self-center">
                    <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                      <FileCheck className="w-3.5 h-3.5" />
                      Tercatat Sah
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
