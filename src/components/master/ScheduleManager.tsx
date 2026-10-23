/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Clock,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  AlertCircle,
  X,
  Power,
  Sparkles,
  Calendar,
  Layers,
  UserCheck,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { Schedule, User, UserRole } from '../../types';
import {
  getAllSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from '../../services/storage';

interface ScheduleManagerProps {
  currentUser: User;
}

const DAY_NAMES = [
  { id: 1, label: 'Senin' },
  { id: 2, label: 'Selasa' },
  { id: 3, label: 'Rabu' },
  { id: 4, label: 'Kamis' },
  { id: 5, label: 'Jumat' },
  { id: 6, label: 'Sabtu' },
  { id: 0, label: 'Minggu' },
];

export const ScheduleManager: React.FC<ScheduleManagerProps> = ({ currentUser }) => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  // Form State for Schedule & Session
  const [formName, setFormName] = useState('');
  const [formSessionName, setFormSessionName] = useState('Sesi Pagi Reguler');
  const [formTargetRole, setFormTargetRole] = useState<'semua' | UserRole>('semua');

  // Jam & Menit Mulai Presensi Masuk
  const [checkInStartHour, setCheckInStartHour] = useState('06');
  const [checkInStartMin, setCheckInStartMin] = useState('00');

  // Jam & Menit Batas Tepat Waktu
  const [checkInDeadlineHour, setCheckInDeadlineHour] = useState('07');
  const [checkInDeadlineMin, setCheckInDeadlineMin] = useState('15');

  // Toleransi Keterlambatan
  const [formLateTolerance, setFormLateTolerance] = useState(15);

  // Jam & Menit Mulai Presensi Pulang
  const [checkOutStartHour, setCheckOutStartHour] = useState('15');
  const [checkOutStartMin, setCheckOutStartMin] = useState('30');

  // Jam & Menit Batas Akhir Presensi Pulang
  const [checkOutEndHour, setCheckOutEndHour] = useState('18');
  const [checkOutEndMin, setCheckOutEndMin] = useState('00');

  // Hari Kerja & Catatan Aturan Manual
  const [formWorkDays, setFormWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [formRuleNotes, setFormRuleNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = () => {
    setSchedules(getAllSchedules());
  };

  useEffect(() => {
    loadData();
  }, []);

  const parseTime = (timeStr?: string) => {
    if (!timeStr || !timeStr.includes(':')) return { hour: '07', min: '00' };
    const [h, m] = timeStr.split(':');
    return {
      hour: h.padStart(2, '0'),
      min: m.padStart(2, '0'),
    };
  };

  const openCreateModal = (preset?: {
    name: string;
    sessionName: string;
    targetRole: 'semua' | UserRole;
    inStart: string;
    inDeadline: string;
    outStart: string;
    outEnd: string;
    tolerance: number;
    notes?: string;
  }) => {
    setEditingSchedule(null);
    if (preset) {
      setFormName(preset.name);
      setFormSessionName(preset.sessionName);
      setFormTargetRole(preset.targetRole);
      const tInStart = parseTime(preset.inStart);
      setCheckInStartHour(tInStart.hour);
      setCheckInStartMin(tInStart.min);

      const tInDead = parseTime(preset.inDeadline);
      setCheckInDeadlineHour(tInDead.hour);
      setCheckInDeadlineMin(tInDead.min);

      const tOutStart = parseTime(preset.outStart);
      setCheckOutStartHour(tOutStart.hour);
      setCheckOutStartMin(tOutStart.min);

      const tOutEnd = parseTime(preset.outEnd);
      setCheckOutEndHour(tOutEnd.hour);
      setCheckOutEndMin(tOutEnd.min);

      setFormLateTolerance(preset.tolerance);
      setFormWorkDays([1, 2, 3, 4, 5]);
      setFormRuleNotes(preset.notes || '');
    } else {
      setFormName('');
      setFormSessionName('Sesi Pagi');
      setFormTargetRole('semua');
      setCheckInStartHour('06');
      setCheckInStartMin('00');
      setCheckInDeadlineHour('07');
      setCheckInDeadlineMin('15');
      setFormLateTolerance(15);
      setCheckOutStartHour('15');
      setCheckOutStartMin('30');
      setCheckOutEndHour('18');
      setCheckOutEndMin('00');
      setFormWorkDays([1, 2, 3, 4, 5]);
      setFormRuleNotes('');
    }
    setFeedback(null);
    setIsModalOpen(true);
  };

  const openEditModal = (sch: Schedule) => {
    setEditingSchedule(sch);
    setFormName(sch.name);
    setFormSessionName(sch.sessionName || 'Sesi Reguler');
    setFormTargetRole(sch.targetRole || 'semua');

    const inStart = parseTime(sch.checkInStart);
    setCheckInStartHour(inStart.hour);
    setCheckInStartMin(inStart.min);

    const inDead = parseTime(sch.checkInDeadline);
    setCheckInDeadlineHour(inDead.hour);
    setCheckInDeadlineMin(inDead.min);

    setFormLateTolerance(sch.lateToleranceMinutes);

    const outStart = parseTime(sch.checkOutStart);
    setCheckOutStartHour(outStart.hour);
    setCheckOutStartMin(outStart.min);

    const outEnd = parseTime(sch.checkOutEnd || '18:00');
    setCheckOutEndHour(outEnd.hour);
    setCheckOutEndMin(outEnd.min);

    setFormWorkDays(sch.workDays);
    setFormRuleNotes(sch.ruleNotes || '');
    setFeedback(null);
    setIsModalOpen(true);
  };

  const toggleDaySelection = (dayId: number) => {
    if (formWorkDays.includes(dayId)) {
      if (formWorkDays.length > 1) {
        setFormWorkDays(formWorkDays.filter((d) => d !== dayId));
      }
    } else {
      setFormWorkDays([...formWorkDays, dayId].sort());
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFeedback({ type: 'error', message: 'Nama jadwal dan sesi kerja wajib diisi.' });
      return;
    }

    const checkInStart = `${checkInStartHour.padStart(2, '0')}:${checkInStartMin.padStart(2, '0')}`;
    const checkInDeadline = `${checkInDeadlineHour.padStart(2, '0')}:${checkInDeadlineMin.padStart(2, '0')}`;
    const checkOutStart = `${checkOutStartHour.padStart(2, '0')}:${checkOutStartMin.padStart(2, '0')}`;
    const checkOutEnd = `${checkOutEndHour.padStart(2, '0')}:${checkOutEndMin.padStart(2, '0')}`;

    setIsSubmitting(true);
    setFeedback(null);

    if (editingSchedule) {
      const res = updateSchedule(currentUser, editingSchedule.id, {
        name: formName,
        sessionName: formSessionName,
        targetRole: formTargetRole,
        checkInStart,
        checkInDeadline,
        lateToleranceMinutes: Number(formLateTolerance),
        checkOutStart,
        checkOutEnd,
        workDays: formWorkDays,
        ruleNotes: formRuleNotes,
      });

      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        setIsModalOpen(false);
        loadData();
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    } else {
      const res = createSchedule(currentUser, {
        name: formName,
        sessionName: formSessionName,
        targetRole: formTargetRole,
        checkInStart,
        checkInDeadline,
        lateToleranceMinutes: Number(formLateTolerance),
        checkOutStart,
        checkOutEnd,
        workDays: formWorkDays,
        ruleNotes: formRuleNotes,
      });

      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        setIsModalOpen(false);
        loadData();
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    }

    setIsSubmitting(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus jadwal & sesi "${name}"?`)) {
      const res = deleteSchedule(currentUser, id);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        loadData();
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    }
  };

  const handleToggleActive = (sch: Schedule) => {
    const res = updateSchedule(currentUser, sch.id, { isActive: !sch.isActive });
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  // Generate 24 hours and 60 minutes array
  const hoursList = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutesList = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <Clock className="w-4 h-4" />
            <span>Master Data &bull; Manajemen Sesi &amp; Jam Kerja</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            Jadwal Kerja Seluruh Pengguna
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Atur dan edit sesi kerja Kepala Sekolah, Admin, dan Karyawan (Jam &amp; Menit Masuk/Pulang manual).
          </p>
        </div>

        <button
          type="button"
          onClick={() => openCreateModal()}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Tambah Sesi Kerja Baru</span>
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

      {/* Preset Cepat Pembuatan Sesi Kerja */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span>Template Cepat Tambah Sesi Kerja:</span>
          </div>
          <span className="text-[11px] text-slate-400">Klik untuk langsung mengisi form</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() =>
              openCreateModal({
                name: 'Jadwal Reguler Guru & Tendik',
                sessionName: 'Sesi Pagi Utama',
                targetRole: 'karyawan',
                inStart: '06:00',
                inDeadline: '07:15',
                outStart: '15:30',
                outEnd: '18:00',
                tolerance: 15,
                notes: 'Masuk tepat waktu sebelum 07:15 WIB. Toleransi 15 menit.',
              })
            }
            className="p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 text-left transition-all"
          >
            <div className="font-bold text-xs text-slate-800">Sesi Pagi Guru &amp; Tendik</div>
            <div className="text-[11px] text-slate-500 mt-1">Masuk: 07:15 &bull; Pulang: 15:30</div>
            <div className="text-[10px] text-emerald-700 font-semibold mt-1">Target: Karyawan</div>
          </button>

          <button
            type="button"
            onClick={() =>
              openCreateModal({
                name: 'Jadwal Pimpinan & Administrator',
                sessionName: 'Sesi Khusus Kepala Sekolah & Admin',
                targetRole: 'semua',
                inStart: '06:30',
                inDeadline: '07:30',
                outStart: '16:00',
                outEnd: '19:00',
                tolerance: 20,
                notes: 'Wajib presensi mandiri verifikasi wajah & lokasi sebelum memulai tugas manajerial.',
              })
            }
            className="p-3 rounded-xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50/40 text-left transition-all"
          >
            <div className="font-bold text-xs text-slate-800">Sesi Pimpinan &amp; Admin</div>
            <div className="text-[11px] text-slate-500 mt-1">Masuk: 07:30 &bull; Pulang: 16:00</div>
            <div className="text-[10px] text-purple-700 font-semibold mt-1">Target: KS &amp; Admin</div>
          </button>

          <button
            type="button"
            onClick={() =>
              openCreateModal({
                name: 'Shift Siang Satpam & Keamanan',
                sessionName: 'Sesi Siang Keamanan',
                targetRole: 'karyawan',
                inStart: '13:00',
                inDeadline: '13:30',
                outStart: '21:00',
                outEnd: '22:00',
                tolerance: 10,
                notes: 'Pemeriksaan gerbang dan patroli siang hingga malam.',
              })
            }
            className="p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 text-left transition-all"
          >
            <div className="font-bold text-xs text-slate-800">Sesi Siang / Shift 2</div>
            <div className="text-[11px] text-slate-500 mt-1">Masuk: 13:30 &bull; Pulang: 21:00</div>
            <div className="text-[10px] text-blue-700 font-semibold mt-1">Target: Satpam / Karyawan</div>
          </button>

          <button
            type="button"
            onClick={() =>
              openCreateModal({
                name: 'Sesi Fleksibel Dapur & Kebersihan',
                sessionName: 'Sesi Operasional Pagi',
                targetRole: 'karyawan',
                inStart: '05:30',
                inDeadline: '06:30',
                outStart: '14:30',
                outEnd: '17:00',
                tolerance: 15,
                notes: 'Penyiapan sarana dan konsumsi sebelum KBM dimulai.',
              })
            }
            className="p-3 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/40 text-left transition-all"
          >
            <div className="font-bold text-xs text-slate-800">Sesi Dapur &amp; Sarpras</div>
            <div className="text-[11px] text-slate-500 mt-1">Masuk: 06:30 &bull; Pulang: 14:30</div>
            <div className="text-[10px] text-amber-700 font-semibold mt-1">Target: Karyawan</div>
          </button>
        </div>
      </div>

      {/* Schedules Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {schedules.map((sch) => {
          const activeDaysStr = DAY_NAMES.filter((d) => sch.workDays.includes(d.id))
            .map((d) => d.label)
            .join(', ');

          const roleBadgeColor =
            sch.targetRole === 'kepala_sekolah'
              ? 'bg-purple-100 text-purple-800 border-purple-200'
              : sch.targetRole === 'admin'
              ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
              : sch.targetRole === 'karyawan'
              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
              : 'bg-slate-100 text-slate-700 border-slate-200';

          const roleLabel =
            sch.targetRole === 'kepala_sekolah'
              ? 'Kepala Sekolah'
              : sch.targetRole === 'admin'
              ? 'Admin'
              : sch.targetRole === 'karyawan'
              ? 'Karyawan / Tendik'
              : 'Semua Pengguna (KS, Admin & Staf)';

          return (
            <div
              key={sch.id}
              className={`bg-white rounded-2xl border p-5 shadow-xs transition-all flex flex-col justify-between ${
                sch.isActive ? 'border-slate-200/80 hover:border-emerald-300' : 'border-slate-200 bg-slate-50 opacity-75'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wide">
                        {sch.sessionName || 'Sesi Kerja'}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${roleBadgeColor}`}>
                        {roleLabel}
                      </span>
                    </div>
                    <h3 className="font-extrabold text-slate-900 text-sm mt-1">{sch.name}</h3>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(sch)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                      title="Edit Sesi & Jam Kerja"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(sch)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                      title={sch.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(sch.id, sch.name)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-rose-600 transition-colors"
                      title="Hapus Jadwal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Time Windows (Masuk & Pulang) */}
                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">
                      Presensi Masuk
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="font-black text-slate-900 text-base font-mono">
                        {sch.checkInDeadline}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-bold">WIB</span>
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      Mulai dibuka: <strong className="font-mono text-slate-700">{sch.checkInStart}</strong>
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">
                      Presensi Pulang
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="font-black text-slate-900 text-base font-mono">
                        {sch.checkOutStart}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-bold">WIB</span>
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      s/d jam: <strong className="font-mono text-slate-700">{sch.checkOutEnd || '18:00'}</strong>
                    </span>
                  </div>
                </div>

                {/* Tolerance Badge */}
                <div className="mt-3 p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
                  <span className="font-medium text-[11px]">Toleransi Terlambat:</span>
                  <span className="font-extrabold font-mono text-xs">+{sch.lateToleranceMinutes} Menit</span>
                </div>

                {/* Workdays */}
                <div className="mt-3 text-xs text-slate-600">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 uppercase font-bold mb-1">
                    <Calendar className="w-3 h-3" />
                    <span>Hari Kerja:</span>
                  </div>
                  <div className="font-medium text-[11px] leading-relaxed text-slate-700">{activeDaysStr}</div>
                </div>

                {/* Manual Rule Notes if present */}
                {sch.ruleNotes && (
                  <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-[11px] leading-relaxed">
                    <span className="font-bold text-slate-900 block mb-0.5">Aturan Manual:</span>
                    {sch.ruleNotes}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Add / Edit Sesi & Jadwal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => !isSubmitting && setIsModalOpen(false)}
          />

          <div className="relative bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  {editingSchedule ? 'Edit Sesi & Jadwal Kerja' : 'Tambah Sesi & Jadwal Kerja Baru'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Atur jam dan menit mulai presensi masuk serta kepulangan secara rinci.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {/* Nama Jadwal & Nama Sesi */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Nama Jadwal <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Contoh: Jadwal Reguler Staf"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Nama Sesi / Shift <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formSessionName}
                    onChange={(e) => setFormSessionName(e.target.value)}
                    placeholder="Contoh: Sesi Pagi / Sesi Piket"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Peruntukan Peran (Semua, Kepala Sekolah, Admin, Karyawan) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Peruntukan Sesi Kerja
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'semua', label: 'Semua User' },
                    { id: 'kepala_sekolah', label: 'Kepala Sekolah' },
                    { id: 'admin', label: 'Admin' },
                    { id: 'karyawan', label: 'Karyawan / Staf' },
                  ].map((roleOpt) => (
                    <button
                      key={roleOpt.id}
                      type="button"
                      onClick={() => setFormTargetRole(roleOpt.id as any)}
                      className={`py-2 px-2 text-center rounded-xl text-xs font-bold transition-all border ${
                        formTargetRole === roleOpt.id
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {roleOpt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pengaturan Jam & Menit Presensi Masuk */}
              <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-700" />
                    Presensi Masuk (Jam &amp; Menit)
                  </span>
                  <span className="text-[11px] text-emerald-700 font-medium">Batas Waktu Masuk</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Presensi Dibuka */}
                  <div className="bg-white p-3 rounded-xl border border-emerald-100">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                      Mulai Dibuka Presensi:
                    </span>
                    <div className="flex items-center gap-1">
                      <select
                        value={checkInStartHour}
                        onChange={(e) => setCheckInStartHour(e.target.value)}
                        className="w-1/2 p-2 border border-slate-300 rounded-lg text-sm font-bold font-mono focus:ring-emerald-500"
                      >
                        {hoursList.map((h) => (
                          <option key={h} value={h}>{h} (Jam)</option>
                        ))}
                      </select>
                      <span className="font-bold text-slate-400">:</span>
                      <select
                        value={checkInStartMin}
                        onChange={(e) => setCheckInStartMin(e.target.value)}
                        className="w-1/2 p-2 border border-slate-300 rounded-lg text-sm font-bold font-mono focus:ring-emerald-500"
                      >
                        {minutesList.map((m) => (
                          <option key={m} value={m}>{m} (Mnt)</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Batas Tepat Waktu */}
                  <div className="bg-white p-3 rounded-xl border border-emerald-100">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                      Batas Tepat Waktu (Deadline):
                    </span>
                    <div className="flex items-center gap-1">
                      <select
                        value={checkInDeadlineHour}
                        onChange={(e) => setCheckInDeadlineHour(e.target.value)}
                        className="w-1/2 p-2 border border-emerald-400 bg-emerald-50/30 rounded-lg text-sm font-extrabold font-mono text-emerald-900 focus:ring-emerald-500"
                      >
                        {hoursList.map((h) => (
                          <option key={h} value={h}>{h} (Jam)</option>
                        ))}
                      </select>
                      <span className="font-bold text-slate-400">:</span>
                      <select
                        value={checkInDeadlineMin}
                        onChange={(e) => setCheckInDeadlineMin(e.target.value)}
                        className="w-1/2 p-2 border border-emerald-400 bg-emerald-50/30 rounded-lg text-sm font-extrabold font-mono text-emerald-900 focus:ring-emerald-500"
                      >
                        {minutesList.map((m) => (
                          <option key={m} value={m}>{m} (Mnt)</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Toleransi Keterlambatan */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-slate-600 font-semibold">Toleransi Terlambat (Menit):</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="120"
                      required
                      value={formLateTolerance}
                      onChange={(e) => setFormLateTolerance(Number(e.target.value))}
                      className="w-20 px-2 py-1 rounded-lg border border-slate-300 text-xs font-mono font-bold text-center"
                    />
                    <span className="text-slate-500 text-xs">Menit</span>
                  </div>
                </div>
              </div>

              {/* Pengaturan Jam & Menit Presensi Pulang */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-slate-600" />
                    Presensi Pulang (Jam &amp; Menit)
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">Waktu Kepulangan</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Mulai Presensi Pulang */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                      Mulai Presensi Pulang Dibuka:
                    </span>
                    <div className="flex items-center gap-1">
                      <select
                        value={checkOutStartHour}
                        onChange={(e) => setCheckOutStartHour(e.target.value)}
                        className="w-1/2 p-2 border border-slate-300 rounded-lg text-sm font-bold font-mono focus:ring-emerald-500"
                      >
                        {hoursList.map((h) => (
                          <option key={h} value={h}>{h} (Jam)</option>
                        ))}
                      </select>
                      <span className="font-bold text-slate-400">:</span>
                      <select
                        value={checkOutStartMin}
                        onChange={(e) => setCheckOutStartMin(e.target.value)}
                        className="w-1/2 p-2 border border-slate-300 rounded-lg text-sm font-bold font-mono focus:ring-emerald-500"
                      >
                        {minutesList.map((m) => (
                          <option key={m} value={m}>{m} (Mnt)</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Batas Akhir Presensi Pulang */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                      Batas Akhir Presensi Pulang:
                    </span>
                    <div className="flex items-center gap-1">
                      <select
                        value={checkOutEndHour}
                        onChange={(e) => setCheckOutEndHour(e.target.value)}
                        className="w-1/2 p-2 border border-slate-300 rounded-lg text-sm font-bold font-mono focus:ring-emerald-500"
                      >
                        {hoursList.map((h) => (
                          <option key={h} value={h}>{h} (Jam)</option>
                        ))}
                      </select>
                      <span className="font-bold text-slate-400">:</span>
                      <select
                        value={checkOutEndMin}
                        onChange={(e) => setCheckOutEndMin(e.target.value)}
                        className="w-1/2 p-2 border border-slate-300 rounded-lg text-sm font-bold font-mono focus:ring-emerald-500"
                      >
                        {minutesList.map((m) => (
                          <option key={m} value={m}>{m} (Mnt)</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hari Kerja Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Hari Kerja Aktif Sesi Ini
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                  {DAY_NAMES.map((d) => {
                    const isSelected = formWorkDays.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDaySelection(d.id)}
                        className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all border ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {d.label.substring(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ketentuan / Aturan Manual Bebas */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Aturan / Ketentuan Khusus Manual
                </label>
                <textarea
                  rows={2}
                  value={formRuleNotes}
                  onChange={(e) => setFormRuleNotes(e.target.value)}
                  placeholder="Ketik manual aturan khusus, misal: Khusus hari Jumat pulang pukul 11:30 WIB; Wajib presensi di pos gerbang..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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
                  {isSubmitting ? 'Menyimpan...' : editingSchedule ? 'Perbarui Sesi' : 'Simpan Sesi Baru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
