/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Calendar,
  X,
  Upload,
  UserCheck,
  Search,
  Filter,
  Eye,
  Info,
} from 'lucide-react';
import { User, LeaveRequest, LeaveType, LeaveStatus } from '../../types';
import {
  getAllLeaveRequests,
  getLeaveRequestsForUser,
  createLeaveRequest,
  reviewLeaveRequest,
} from '../../services/storage';

interface LeaveManagerProps {
  currentUser: User;
}

export const LeaveManager: React.FC<LeaveManagerProps> = ({ currentUser }) => {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | LeaveStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | LeaveType>('all');

  // Submit Modal State
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [formType, setFormType] = useState<LeaveType>('izin');
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [formEndDate, setFormEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [formReason, setFormReason] = useState('');
  const [formDocRef, setFormDocRef] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Review Modal State (For Admin & KS)
  const [reviewingLeave, setReviewingLeave] = useState<LeaveRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const loadData = () => {
    if (currentUser.role === 'karyawan') {
      setLeaves(getLeaveRequestsForUser(currentUser.id));
    } else {
      setLeaves(getAllLeaveRequests());
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setFormDocRef(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formReason.trim()) {
      setFeedback({ type: 'error', message: 'Alasan permohonan wajib diisi.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    const res = createLeaveRequest(currentUser, {
      type: formType,
      startDate: formStartDate,
      endDate: formEndDate,
      reason: formReason,
      documentRef: formDocRef || undefined,
    });

    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      setIsSubmitModalOpen(false);
      setFormReason('');
      setFormDocRef('');
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
    setIsSubmitting(false);
  };

  const handleReviewDecision = (decision: 'disetujui' | 'ditolak') => {
    if (!reviewingLeave) return;

    const res = reviewLeaveRequest(currentUser, reviewingLeave.id, decision, reviewNotes);
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      setReviewingLeave(null);
      setReviewNotes('');
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const filteredLeaves = leaves.filter((l) => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    if (typeFilter !== 'all' && l.type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <FileText className="w-4 h-4" />
            <span>Tahap 6 &bull; Layanan Perizinan &amp; Sakit</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            {currentUser.role === 'karyawan' ? 'Pengajuan Izin, Sakit &amp; Dinas' : 'Peninjauan Izin Civitas Sekolah'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {currentUser.role === 'karyawan'
              ? 'Ajukan permohonan ketidakhadiran resmi dengan melampirkan surat bukti pendukung.'
              : 'Verifikasi dan setujui atau tolak permohonan izin karyawan dan staf.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFeedback(null);
            setIsSubmitModalOpen(true);
          }}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Ajukan Izin Baru</span>
        </button>
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

      {/* Filter and Status Counts */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white"
          >
            <option value="all">Semua Status</option>
            <option value="menunggu">Menunggu Peninjauan</option>
            <option value="disetujui">Telah Disetujui</option>
            <option value="ditolak">Ditolak</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white"
          >
            <option value="all">Semua Kategori</option>
            <option value="izin">Izin Pribadi</option>
            <option value="sakit">Sakit</option>
            <option value="dinas">Dinas Luar</option>
          </select>
        </div>

        <div className="text-xs text-slate-500">
          Menampilkan <strong>{filteredLeaves.length}</strong> pengajuan
        </div>
      </div>

      {/* Leave Requests List */}
      <div className="space-y-4">
        {filteredLeaves.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center text-slate-400 text-xs">
            Belum ada data pengajuan izin yang sesuai filter.
          </div>
        ) : (
          filteredLeaves.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-emerald-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      item.type === 'sakit'
                        ? 'bg-rose-100 text-rose-800'
                        : item.type === 'dinas'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {item.type}
                  </span>

                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      item.status === 'disetujui'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : item.status === 'ditolak'
                        ? 'bg-rose-50 text-rose-800 border border-rose-200'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {item.status === 'disetujui' ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    ) : item.status === 'ditolak' ? (
                      <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                    )}
                    <span className="capitalize">{item.status}</span>
                  </span>
                </div>

                <div className="text-sm font-bold text-slate-900">
                  {item.userName} <span className="text-xs text-slate-400 font-normal font-mono">({item.nip})</span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  {item.reason}
                </p>

                <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 font-semibold text-slate-700">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {item.startDate} s/d {item.endDate} ({item.durationDays} Hari)
                  </span>

                  {item.reviewedBy && (
                    <span className="text-slate-600">
                      Ditinjau oleh: <strong>{item.reviewedBy}</strong>
                      {item.reviewNotes && ` (${item.reviewNotes})`}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                {item.documentRef && (
                  <a
                    href={item.documentRef}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Lihat Lampiran</span>
                  </a>
                )}

                {currentUser.role !== 'karyawan' && item.status === 'menunggu' && (
                  <button
                    type="button"
                    onClick={() => {
                      setReviewingLeave(item);
                      setReviewNotes('');
                    }}
                    className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors"
                  >
                    Tinjau Izin
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Pengajuan Izin Baru */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={() => setIsSubmitModalOpen(false)} />

          <div className="relative bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                Formulir Pengajuan Izin / Sakit / Dinas
              </h3>
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitLeave} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Kategori Permohonan <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['izin', 'sakit', 'dinas'] as LeaveType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormType(t)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold uppercase transition-all border ${
                        formType === t
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Tanggal Mulai <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Tanggal Selesai <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Alasan &amp; Keterangan <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Jelaskan keperluan izin, diagnosis sakit, atau rincian tugas dinas..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Unggah Dokumen Bukti (Surat Dokter / Surat Tugas)
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2 text-[11px] text-amber-900">
                <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Aturan Presensi:</strong> Pengajuan izin yang disetujui tidak otomatis
                  menjadi presensi hadir di sistem, melainkan tercatat sebagai status resmi izin/sakit/dinas.
                </span>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Mengirim...' : 'Kirim Pengajuan Izin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tinjau Izin (Khusus Admin / KS) */}
      {reviewingLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={() => setReviewingLeave(null)} />

          <div className="relative bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                Tinjau Permohonan Izin: {reviewingLeave.userName}
              </h3>
              <button
                type="button"
                onClick={() => setReviewingLeave(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl space-y-1 text-xs">
              <div><strong>Kategori:</strong> <span className="uppercase font-bold text-emerald-800">{reviewingLeave.type}</span></div>
              <div><strong>Periode:</strong> {reviewingLeave.startDate} s/d {reviewingLeave.endDate} ({reviewingLeave.durationDays} hari)</div>
              <div><strong>Alasan:</strong> {reviewingLeave.reason}</div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Catatan Peninjau / Catatan Pimpinan (Opsional)
              </label>
              <textarea
                rows={2}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Misal: Disetujui, jaga kesehatan / Tugas selesai segera kirim laporan..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleReviewDecision('ditolak')}
                className="px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-bold transition-colors"
              >
                Tolak Izin
              </button>
              <button
                type="button"
                onClick={() => handleReviewDecision('disetujui')}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
              >
                Setujui Izin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
