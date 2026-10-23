/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ScanFace,
  Camera,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  ShieldCheck,
  SwitchCamera,
  Users,
  Search,
  Filter,
  Trash2,
  Power,
  Sparkles,
  Info,
  X,
} from 'lucide-react';
import { User, FaceRegistryItem } from '../../types';
import {
  getAllUsers,
  getAllFaceRegistry,
  registerOrUpdateFace,
  toggleFaceStatus,
  deleteFaceRegistry,
} from '../../services/storage';
import { analyzeFaceFromCanvas, FaceAnalysisResult } from '../../services/faceService';

interface FaceRegistryManagerProps {
  currentUser: User;
}

export const FaceRegistryManager: React.FC<FaceRegistryManagerProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [registry, setRegistry] = useState<FaceRegistryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'kepala_sekolah' | 'admin' | 'karyawan'>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Camera Modal State
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<FaceAnalysisResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const loadData = () => {
    setUsers(getAllUsers());
    setRegistry(getAllFaceRegistry());
  };

  useEffect(() => {
    loadData();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async (facing: 'user' | 'environment') => {
    stopCamera();
    setCameraError(null);
    setAnalysisResult(null);

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
    } catch (err: any) {
      setCameraError('Gagal mengakses kamera. Pastikan izin kamera telah diberikan di peramban Anda.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const openRegisterModal = (targetUser: User) => {
    setSelectedUser(targetUser);
    setAnalysisResult(null);
    setCameraError(null);
    setIsCameraModalOpen(true);
    startCamera(cameraFacing);
  };

  const closeCameraModal = () => {
    stopCamera();
    setIsCameraModalOpen(false);
    setSelectedUser(null);
    setAnalysisResult(null);
  };

  const switchCameraFacing = () => {
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    setCameraFacing(nextFacing);
    startCamera(nextFacing);
  };

  const capturePhotoAndAnalyze = () => {
    if (!videoRef.current) return;
    setIsCapturing(true);

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsCapturing(false);
      return;
    }

    // Jika kamera depan, flip horizontal agar mirror alami
    if (cameraFacing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Reset transformasi untuk analisis
    if (cameraFacing === 'user') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    const result = analyzeFaceFromCanvas(canvas);
    setAnalysisResult(result);
    setIsCapturing(false);
  };

  const handleSaveToRegistry = () => {
    if (!selectedUser || !analysisResult || !analysisResult.hasFace) return;

    const res = registerOrUpdateFace(currentUser, {
      userId: selectedUser.id,
      faceEmbedding: analysisResult.embedding,
      registeredPhotoRef: analysisResult.photoDataUrl,
      cameraUsed: cameraFacing,
      qualityScore: analysisResult.qualityScore,
    });

    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      closeCameraModal();
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleToggleStatus = (item: FaceRegistryItem) => {
    const res = toggleFaceStatus(currentUser, item.id);
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleDelete = (item: FaceRegistryItem) => {
    if (confirm(`Hapus data biometrik wajah untuk "${item.userName}"? Pengguna harus didaftarkan ulang agar dapat presensi.`)) {
      const res = deleteFaceRegistry(currentUser, item.id);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        loadData();
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    }
  };

  // Filter daftar pengguna
  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.nip.toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: users.length,
    registered: users.filter((u) => registry.some((r) => r.userId === u.id && r.isActive)).length,
    unregistered: users.filter((u) => !registry.some((r) => r.userId === u.id && r.isActive)).length,
  };

  return (
    <div className="space-y-6">
      {/* Header Banner Perekaman & Database Wajah */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 text-xs font-semibold mb-3">
              <ScanFace className="w-3.5 h-3.5" />
              <span>Menu Admin &amp; Kepala Sekolah</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Perekaman &amp; Database Wajah
            </h1>
            <p className="text-purple-100/80 text-xs sm:text-sm mt-1 max-w-xl leading-relaxed">
              Perekaman biometrik wajah langsung dari kamera peramban untuk pendaftaran dan pembaruan dataset wajah civitas sekolah.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/15 text-xs text-right">
            <span className="text-slate-300 block font-medium">Status Registrasi Biometrik:</span>
            <span className="text-base font-extrabold text-emerald-400">
              {stats.registered} / {stats.total} Terdaftar
            </span>
          </div>
        </div>

        {/* Notice of Security */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-start gap-2.5 text-xs text-purple-200/90">
          <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <span>
            <strong>Hak Kelola Admin:</strong> Admin dan Kepala Sekolah dapat melakukan perekaman wajah baru, memverifikasi kemiripan, dan mengaktifkan dataset untuk presensi mandiri.
          </span>
        </div>
      </div>

      {/* Feedback Message */}
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

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase">Total Civitas</span>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{stats.total} Orang</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-emerald-600 uppercase">Wajah Terdaftar</span>
          <div className="text-xl font-extrabold text-emerald-700 mt-1">{stats.registered} Orang</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-rose-600 uppercase">Belum Terdaftar</span>
          <div className="text-xl font-extrabold text-rose-700 mt-1">{stats.unregistered} Orang</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari civitas sekolah berdasarkan nama atau NIP..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white"
          >
            <option value="all">Semua Peran</option>
            <option value="kepala_sekolah">Kepala Sekolah</option>
            <option value="admin">Admin</option>
            <option value="karyawan">Karyawan / Guru</option>
          </select>

          <button
            type="button"
            onClick={loadData}
            title="Refresh Data"
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Users & Face Registry Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Pengguna</th>
                <th className="py-3.5 px-4">NIP / ID</th>
                <th className="py-3.5 px-3">Peran</th>
                <th className="py-3.5 px-3">Status Biometrik</th>
                <th className="py-3.5 px-4 text-right">Tindakan KS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((u) => {
                const faceData = registry.find((r) => r.userId === u.id);
                const isRegistered = !!faceData && faceData.isActive;

                return (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        {faceData?.registeredPhotoRef ? (
                          <img
                            src={faceData.registeredPhotoRef}
                            alt={u.name}
                            className="w-10 h-10 rounded-full object-cover border-2 border-purple-400 shadow-xs"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                            <ScanFace className="w-5 h-5" />
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-slate-900">{u.name}</div>
                          <div className="text-[11px] text-slate-500">{u.position}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-700 text-xs">
                      {u.nip}
                    </td>
                    <td className="py-3.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          u.role === 'kepala_sekolah'
                            ? 'bg-purple-100 text-purple-800'
                            : u.role === 'admin'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      {isRegistered ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle className="w-3 h-3" /> Wajah Terdaftar
                          </span>
                          <div className="text-[10px] text-slate-400">
                            Skor Kualitas: {faceData.qualityScore}%
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <XCircle className="w-3 h-3" /> Belum Terdaftar
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openRegisterModal(u)}
                          className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-1"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>{isRegistered ? 'Pembaruan Wajah' : 'Daftarkan Wajah'}</span>
                        </button>

                        {faceData && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(faceData)}
                              className={`p-1.5 rounded-lg border transition-colors ${
                                faceData.isActive
                                  ? 'border-slate-200 hover:bg-slate-100 text-slate-600'
                                  : 'border-emerald-200 hover:bg-emerald-50 text-emerald-600'
                              }`}
                              title={faceData.isActive ? 'Nonaktifkan Wajah' : 'Aktifkan Wajah'}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(faceData)}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-rose-600 transition-colors"
                              title="Hapus Data Wajah"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Registrasi Kamera Wajah */}
      {isCameraModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs" onClick={closeCameraModal} />

          <div className="relative bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <ScanFace className="w-5 h-5 text-purple-600" />
                  Registrasi Wajah: {selectedUser.name}
                </h3>
                <p className="text-[11px] text-slate-500">
                  NIP: {selectedUser.nip} &bull; Peran: {selectedUser.role.replace('_', ' ')}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCameraModal}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Viewport / Capture Area */}
            <div className="mt-4 space-y-4">
              <div className="relative aspect-4/3 bg-slate-900 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center border-2 border-purple-500/40">
                {analysisResult ? (
                  <img
                    src={analysisResult.photoDataUrl}
                    alt="Captured preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${cameraFacing === 'user' ? 'scale-x-[-1]' : ''}`}
                  />
                )}

                {/* Face Scanning Guide Overlay (Oval) */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-52 h-64 rounded-full border-2 border-dashed border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)] flex items-center justify-center">
                    <span className="text-[11px] text-white/90 bg-slate-900/60 px-2 py-0.5 rounded-full font-medium">
                      Posisikan Wajah di Sini
                    </span>
                  </div>
                </div>

                {/* Camera Mode Badge */}
                <div className="absolute top-3 left-3 px-2 py-1 bg-slate-900/70 backdrop-blur-xs text-white rounded-lg text-[10px] font-semibold">
                  {cameraFacing === 'user' ? 'Kamera Depan' : 'Kamera Belakang'}
                </div>
              </div>

              {cameraError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{cameraError}</span>
                </div>
              )}

              {/* Controls: Switch Camera & Capture */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={switchCameraFacing}
                  className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <SwitchCamera className="w-4 h-4 text-purple-600" />
                  <span>Ganti Kamera ({cameraFacing === 'user' ? 'Depan' : 'Belakang'})</span>
                </button>

                {analysisResult ? (
                  <button
                    type="button"
                    onClick={() => setAnalysisResult(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                  >
                    Ambil Ulang
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={capturePhotoAndAnalyze}
                    disabled={isCapturing}
                    className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Ambil Foto Wajah</span>
                  </button>
                )}
              </div>

              {/* Analysis Result Feedback */}
              {analysisResult && (
                <div
                  className={`p-4 rounded-2xl border text-xs space-y-2 ${
                    analysisResult.hasFace
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>Hasil Deteksi Kualitas Wajah:</span>
                    <span className="font-mono text-sm">{analysisResult.qualityScore}%</span>
                  </div>
                  <p className="leading-relaxed">{analysisResult.feedbackMessage}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCameraModal}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveToRegistry}
                  disabled={!analysisResult || !analysisResult.hasFace}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md disabled:opacity-40 transition-all flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Simpan ke Database Wajah</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
