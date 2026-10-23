/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ClipboardList,
  Plus,
  CheckCircle,
  Clock,
  AlertCircle,
  Camera,
  MapPin,
  Calendar,
  X,
  SwitchCamera,
  MessageSquare,
  Eye,
  CheckSquare,
  AlertTriangle,
} from 'lucide-react';
import { User, Assignment, AssignmentStatus } from '../../types';
import {
  getAllAssignments,
  getAssignmentsForUser,
  createAssignment,
  submitAssignmentDocumentation,
  reviewAssignment,
  getAllUsers,
} from '../../services/storage';

interface AssignmentManagerProps {
  currentUser: User;
}

export const AssignmentManager: React.FC<AssignmentManagerProps> = ({ currentUser }) => {
  const [tasks, setTasks] = useState<Assignment[]>([]);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | AssignmentStatus>('all');

  // Create Task Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAssignedToUserId, setFormAssignedToUserId] = useState('');
  const [formDueDate, setFormDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Documentation Upload Modal State (Camera & GPS for Staff)
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Assignment | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [docNotes, setDocNotes] = useState('');
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isCapturingDoc, setIsCapturingDoc] = useState(false);

  // Admin Review Modal State
  const [reviewingTask, setReviewingTask] = useState<Assignment | null>(null);
  const [reviewFeedbackText, setReviewFeedbackText] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const loadData = () => {
    if (currentUser.role === 'karyawan') {
      setTasks(getAssignmentsForUser(currentUser.id));
    } else {
      setTasks(getAllAssignments());
    }
    const all = getAllUsers();
    setStaffUsers(all.filter((u) => u.role === 'karyawan'));
    if (!formAssignedToUserId && all.length > 0) {
      const firstStaff = all.find((u) => u.role === 'karyawan');
      if (firstStaff) setFormAssignedToUserId(firstStaff.id);
    }
  };

  useEffect(() => {
    loadData();
    return () => {
      stopCamera();
    };
  }, [currentUser]);

  const startCamera = async (facing: 'user' | 'environment') => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      // Camera error handled gracefully
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const openDocModal = (task: Assignment) => {
    setSelectedTask(task);
    setCapturedPhoto(null);
    setDocNotes('');
    setIsDocModalOpen(true);
    startCamera(cameraFacing);

    // Ambil GPS perangkat saat pengerjaan tugas
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setDeviceCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  const closeDocModal = () => {
    stopCamera();
    setIsDocModalOpen(false);
    setSelectedTask(null);
    setCapturedPhoto(null);
  };

  const switchCamera = () => {
    const next = cameraFacing === 'user' ? 'environment' : 'user';
    setCameraFacing(next);
    startCamera(next);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (cameraFacing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedPhoto(dataUrl);
  };

  const handleSubmitDocumentation = () => {
    if (!selectedTask || !capturedPhoto) return;
    setIsCapturingDoc(true);

    const res = submitAssignmentDocumentation(currentUser, selectedTask.id, {
      documentationPhotoRef: capturedPhoto,
      documentationNotes: docNotes || 'Dokumentasi tugas lapangan telah selesai dilaksanakan.',
      documentationLocation: deviceCoords
        ? { latitude: deviceCoords.lat, longitude: deviceCoords.lng }
        : undefined,
    });

    setIsCapturingDoc(false);

    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      closeDocModal();
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDescription.trim() || !formAssignedToUserId) {
      setFeedback({ type: 'error', message: 'Judul, deskripsi, dan penerima tugas wajib diisi.' });
      return;
    }

    setIsSubmittingTask(true);
    const res = createAssignment(currentUser, {
      title: formTitle,
      description: formDescription,
      assignedToUserId: formAssignedToUserId,
      dueDate: formDueDate,
    });

    setIsSubmittingTask(false);

    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      setIsCreateModalOpen(false);
      setFormTitle('');
      setFormDescription('');
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleReviewTask = (status: 'selesai' | 'perlu_perbaikan') => {
    if (!reviewingTask) return;

    const res = reviewAssignment(currentUser, reviewingTask.id, status, reviewFeedbackText);
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      setReviewingTask(null);
      setReviewFeedbackText('');
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <ClipboardList className="w-4 h-4" />
            <span>Penugasan &amp; Dokumentasi Lapangan</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            {currentUser.role === 'karyawan' ? 'Daftar Tugas Saya' : 'Distribusi &amp; Verifikasi Tugas Staf'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {currentUser.role === 'karyawan'
              ? 'Laksanakan tugas yang didelegasikan dan unggah foto dokumentasi kegiatan ber-geotagging.'
              : 'Berikan tugas operasional kepada staf dan periksa bukti foto dokumentasi lapangan.'}
          </p>
        </div>

        {currentUser.role !== 'karyawan' && (
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setIsCreateModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>+ Berikan Tugas Baru</span>
          </button>
        )}
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

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white"
        >
          <option value="all">Semua Status Tugas</option>
          <option value="belum_mulai">Belum Dimulai</option>
          <option value="proses">Menunggu Verifikasi Bukti</option>
          <option value="selesai">Selesai</option>
          <option value="perlu_perbaikan">Perlu Perbaikan</option>
        </select>

        <span className="text-xs text-slate-500">
          Total: <strong>{filteredTasks.length}</strong> Tugas
        </span>
      </div>

      {/* Tasks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredTasks.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border border-slate-200/80 p-10 text-center text-slate-400 text-xs">
            Belum ada tugas yang sesuai dengan kriteria filter.
          </div>
        ) : (
          filteredTasks.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-emerald-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-extrabold text-slate-900 text-base">{t.title}</h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                      t.status === 'selesai'
                        ? 'bg-emerald-100 text-emerald-800'
                        : t.status === 'proses'
                        ? 'bg-blue-100 text-blue-800'
                        : t.status === 'perlu_perbaikan'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {t.status.replace('_', ' ')}
                  </span>
                </div>

                <p className="text-xs text-slate-600 mt-2 leading-relaxed font-medium">
                  {t.description}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                  <div>
                    <span className="text-slate-400 block font-bold uppercase text-[9px]">Penerima Tugas</span>
                    <span className="font-bold text-slate-800">{t.assignedToName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-bold uppercase text-[9px]">Batas Waktu</span>
                    <span className="font-bold text-rose-700">{t.dueDate}</span>
                  </div>
                </div>

                {/* Bukti Dokumentasi Lapangan if submitted */}
                {t.documentationPhotoRef && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Bukti Dokumentasi Lapangan:
                    </span>
                    <div className="flex items-center gap-3">
                      <img
                        src={t.documentationPhotoRef}
                        alt="Bukti Dokumentasi"
                        className="w-14 h-14 rounded-lg object-cover border border-slate-200 shadow-2xs"
                      />
                      <div className="text-[11px] text-slate-600 space-y-0.5">
                        <div className="font-medium">{t.documentationNotes}</div>
                        {t.documentationLocation && (
                          <div className="text-slate-400 flex items-center gap-1 font-mono text-[10px]">
                            <MapPin className="w-3 h-3 text-emerald-600" />
                            <span>GPS: {t.documentationLocation.latitude.toFixed(5)}, {t.documentationLocation.longitude.toFixed(5)}</span>
                          </div>
                        )}
                        {t.completedAt && (
                          <div className="text-slate-400 text-[10px]">
                            Waktu: {new Date(t.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} WIB
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Feedback from Admin if any */}
                {t.feedback && (
                  <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                    <span className="font-bold block text-[10px] uppercase">Catatan Peninjau:</span>
                    {t.feedback}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                {currentUser.role === 'karyawan' && t.status !== 'selesai' && (
                  <button
                    type="button"
                    onClick={() => openDocModal(t)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{t.documentationPhotoRef ? 'Unggah Ulang Bukti' : 'Kerjakan & Foto Bukti'}</span>
                  </button>
                )}

                {currentUser.role !== 'karyawan' && t.documentationPhotoRef && t.status !== 'selesai' && (
                  <button
                    type="button"
                    onClick={() => {
                      setReviewingTask(t);
                      setReviewFeedbackText(t.feedback || '');
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Verifikasi Hasil Tugas</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Tambah Tugas Baru (Khusus Admin / KS) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={() => setIsCreateModalOpen(false)} />

          <div className="relative bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-emerald-600" />
                Delegasikan Tugas Baru ke Staf
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Judul Tugas <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Contoh: Pemeliharaan Kebersihan Area Kantin"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Penerima Tugas (Staf / Karyawan) <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={formAssignedToUserId}
                  onChange={(e) => setFormAssignedToUserId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                >
                  {staffUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} &bull; {u.position} (NIP: {u.nip})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Batas Waktu Pengerjaan (Due Date) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Rincian Instruksi Tugas <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Deskripsikan secara jelas apa yang harus dikerjakan dan didokumentasikan..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isSubmittingTask}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTask}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  {isSubmittingTask ? 'Menyimpan...' : 'Kirim Tugas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Dokumentasi Lapangan (Kamera & GPS Karyawan) */}
      {isDocModalOpen && selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs" onClick={closeDocModal} />

          <div className="relative bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Camera className="w-5 h-5 text-emerald-600" />
                  Dokumentasi Tugas: {selectedTask.title}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Ambil foto kegiatan langsung dengan stempel lokasi GPS dan waktu.
                </p>
              </div>
              <button type="button" onClick={closeDocModal} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* Kamera Viewport */}
              <div className="relative aspect-4/3 bg-slate-950 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center border-2 border-emerald-500/30">
                {capturedPhoto ? (
                  <img src={capturedPhoto} alt="Snapshot dokumentasi" className="w-full h-full object-cover" />
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${cameraFacing === 'user' ? 'scale-x-[-1]' : ''}`}
                  />
                )}

                {/* GPS Stamp Overlay */}
                <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-xs text-white p-2 rounded-xl text-[10px] space-y-0.5">
                  <div className="flex items-center gap-1 font-mono text-emerald-400">
                    <MapPin className="w-3 h-3" />
                    <span>
                      {deviceCoords
                        ? `${deviceCoords.lat.toFixed(5)}, ${deviceCoords.lng.toFixed(5)}`
                        : 'GPS Terdeteksi'}
                    </span>
                  </div>
                  <div className="text-slate-300 font-mono">
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} WIB
                  </div>
                </div>
              </div>

              {/* Camera Switch & Snapshot Buttons */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={switchCamera}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
                >
                  <SwitchCamera className="w-4 h-4 text-emerald-600" />
                  <span>Kamera {cameraFacing === 'user' ? 'Depan' : 'Belakang'}</span>
                </button>

                {capturedPhoto ? (
                  <button
                    type="button"
                    onClick={() => setCapturedPhoto(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                  >
                    Foto Ulang
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md flex items-center gap-1.5"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Ambil Foto Bukti</span>
                  </button>
                )}
              </div>

              {/* Notes Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Catatan Progres Pengerjaan
                </label>
                <textarea
                  rows={2}
                  value={docNotes}
                  onChange={(e) => setDocNotes(e.target.value)}
                  placeholder="Keterangan singkat hasil pengerjaan di lapangan..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeDocModal}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSubmitDocumentation}
                  disabled={!capturedPhoto || isCapturingDoc}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md disabled:opacity-40 flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Kirim Laporan Dokumentasi</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Review Tugas (Admin / KS) */}
      {reviewingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={() => setReviewingTask(null)} />

          <div className="relative bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                Verifikasi Bukti Tugas: {reviewingTask.title}
              </h3>
              <button type="button" onClick={() => setReviewingTask(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {reviewingTask.documentationPhotoRef && (
              <div className="aspect-video bg-slate-900 rounded-xl overflow-hidden border">
                <img
                  src={reviewingTask.documentationPhotoRef}
                  alt="Bukti Dokumentasi"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1">
              <div><strong>Karyawan:</strong> {reviewingTask.assignedToName}</div>
              <div><strong>Catatan Staf:</strong> {reviewingTask.documentationNotes || '-'}</div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Feedback / Catatan Evaluasi Admin (Opsional)
              </label>
              <textarea
                rows={2}
                value={reviewFeedbackText}
                onChange={(e) => setReviewFeedbackText(e.target.value)}
                placeholder="Misal: Sudah bersih dan rapi, terima kasih / Sudut lab masih kotor mohon disapu ulang..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleReviewTask('perlu_perbaikan')}
                className="px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 text-xs font-bold transition-colors"
              >
                Perlu Perbaikan
              </button>
              <button
                type="button"
                onClick={() => handleReviewTask('selesai')}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
              >
                Tandai Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
