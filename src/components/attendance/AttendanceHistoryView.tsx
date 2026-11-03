/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  CalendarCheck,
  Clock,
  MapPin,
  Camera,
  CheckCircle,
  AlertCircle,
  Search,
  Filter,
  ArrowRight,
  User as UserIcon,
  Eye,
  X,
  FileCheck,
  Calendar,
  Layers,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { User, DailyAttendancePair, AttendanceRecord } from '../../types';
import {
  getAllAttendanceRecords,
  getAttendanceForUser,
  groupAttendanceByDateAndUser,
  getAllUsers,
} from '../../services/storage';

interface AttendanceHistoryViewProps {
  currentUser: User;
  onNavigateTo?: (menuId: string) => void;
}

export const AttendanceHistoryView: React.FC<AttendanceHistoryViewProps> = ({
  currentUser,
  onNavigateTo,
}) => {
  const [pairs, setPairs] = useState<DailyAttendancePair[]>([]);
  const [scopeFilter, setScopeFilter] = useState<'my' | 'all'>(
    currentUser.role === 'karyawan' ? 'my' : 'all'
  );
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('month');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'complete' | 'waiting_pulang' | 'late'>('all');

  // Photo Preview Modal
  const [previewPhoto, setPreviewPhoto] = useState<{
    url: string;
    title: string;
    subtitle: string;
  } | null>(null);

  const loadData = () => {
    let rawRecords: AttendanceRecord[] = [];
    if (scopeFilter === 'my') {
      rawRecords = getAttendanceForUser(currentUser.id);
    } else {
      rawRecords = getAllAttendanceRecords();
    }
    const grouped = groupAttendanceByDateAndUser(rawRecords);
    setPairs(grouped);
  };

  useEffect(() => {
    loadData();
  }, [currentUser, scopeFilter]);

  // Filter logic
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const filteredPairs = pairs.filter((item) => {
    // 1. Date filter
    if (dateFilter === 'today') {
      if (item.date !== todayStr) return false;
    } else if (dateFilter === 'week') {
      const targetDate = new Date(item.date);
      const diffTime = Math.abs(now.getTime() - targetDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 7) return false;
    } else if (dateFilter === 'month') {
      const currentMonth = todayStr.substring(0, 7);
      if (!item.date.startsWith(currentMonth)) return false;
    }

    // 2. Search Query (Name/NIP)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.userName.toLowerCase().includes(q);
      const matchNip = item.nip.toLowerCase().includes(q);
      if (!matchName && !matchNip) return false;
    }

    // 3. Status filter
    if (statusFilter === 'complete') {
      if (!item.masukRecord || !item.pulangRecord) return false;
    } else if (statusFilter === 'waiting_pulang') {
      if (!item.masukRecord || item.pulangRecord) return false;
    } else if (statusFilter === 'late') {
      if (item.masukRecord?.status !== 'terlambat') return false;
    }

    return true;
  });

  // Calculate stats
  const totalDays = filteredPairs.length;
  const completeDays = filteredPairs.filter((p) => p.masukRecord && p.pulangRecord).length;
  const waitingPulangDays = filteredPairs.filter((p) => p.masukRecord && !p.pulangRecord).length;
  const lateDays = filteredPairs.filter((p) => p.masukRecord?.status === 'terlambat').length;

  // Format Date Indo
  const formatDateIndo = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-');
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      return date.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Format Duration between check-in and check-out
  const getWorkDuration = (masukTimestamp?: string, pulangTimestamp?: string) => {
    if (!masukTimestamp || !pulangTimestamp) return null;
    const tMasuk = new Date(masukTimestamp).getTime();
    const tPulang = new Date(pulangTimestamp).getTime();
    const diffMs = tPulang - tMasuk;
    if (diffMs <= 0) return null;

    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${diffHrs} Jam ${diffMins} Menit`;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-800 via-emerald-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold mb-3">
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Histori Kehadiran &bull; Absen Masuk &amp; Pulang</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Riwayat Presensi Masuk &amp; Pulang
            </h1>
            <p className="text-emerald-100/80 text-xs sm:text-sm mt-1 max-w-xl leading-relaxed">
              Daftar rekapitulasi kehadiran harian yang memuat data terperinci baik saat **Absen Masuk** maupun **Absen Pulang**, termasuk foto biometrik wajah dan validasi radius GPS.
            </p>
          </div>

          {onNavigateTo && (
            <button
              type="button"
              onClick={() => onNavigateTo('presensi')}
              className="py-3 px-5 rounded-2xl bg-white text-emerald-950 font-extrabold text-xs shadow-lg hover:bg-emerald-50 active:scale-95 transition-all flex items-center gap-2 shrink-0 self-start md:self-auto cursor-pointer"
            >
              <Camera className="w-4 h-4 text-emerald-600" />
              <span>Lakukan Presensi Hari Ini</span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>

        {/* Stats Summary Pills */}
        <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
            <span className="text-emerald-200 block text-[11px]">Total Hari Presensi</span>
            <span className="text-lg font-extrabold text-white">{totalDays} Hari</span>
          </div>

          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
            <span className="text-emerald-200 block text-[11px]">Lengkap (Masuk &amp; Pulang)</span>
            <span className="text-lg font-extrabold text-emerald-300">{completeDays} Hari</span>
          </div>

          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
            <span className="text-amber-200 block text-[11px]">Belum Absen Pulang</span>
            <span className="text-lg font-extrabold text-amber-300">{waitingPulangDays} Hari</span>
          </div>

          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-2xl border border-white/10">
            <span className="text-rose-200 block text-[11px]">Masuk Terlambat</span>
            <span className="text-lg font-extrabold text-rose-300">{lateDays} Hari</span>
          </div>
        </div>
      </div>

      {/* Control Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Scope Filter for KS / Admin */}
          {currentUser.role !== 'karyawan' ? (
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setScopeFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  scopeFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Seluruh Civitas Sekolah
              </button>
              <button
                type="button"
                onClick={() => setScopeFilter('my')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  scopeFilter === 'my'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Riwayat Saya Sendiri
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <UserIcon className="w-4 h-4 text-emerald-600" />
              <span>Riwayat Pribadi: {currentUser.name} (NIP: {currentUser.nip})</span>
            </div>
          )}

          {/* Date Period Filter */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setDateFilter('today')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                dateFilter === 'today'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('week')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                dateFilter === 'week'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 Hari Terakhir
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('month')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                dateFilter === 'month'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Bulan Ini
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                dateFilter === 'all'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua
            </button>
          </div>
        </div>

        {/* Search & Status Filter Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama pegawai atau NIP..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white"
          >
            <option value="all">Semua Status Presensi</option>
            <option value="complete">Lengkap (Absen Masuk &amp; Pulang)</option>
            <option value="waiting_pulang">Belum Absen Pulang</option>
            <option value="late">Masuk Terlambat</option>
          </select>

          <button
            type="button"
            onClick={loadData}
            className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Segarkan Data</span>
          </button>
        </div>
      </div>

      {/* Main Paired Attendance List */}
      <div className="space-y-4">
        {filteredPairs.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center text-slate-400 space-y-3 shadow-xs">
            <CalendarCheck className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-700 text-sm">Tidak Ada Catatan Presensi</h3>
            <p className="text-xs max-w-sm mx-auto">
              Belum ada data presensi yang sesuai dengan filter yang dipilih.
            </p>
          </div>
        ) : (
          filteredPairs.map((pair) => {
            const hasMasuk = Boolean(pair.masukRecord);
            const hasPulang = Boolean(pair.pulangRecord);
            const duration = getWorkDuration(pair.masukRecord?.timestamp, pair.pulangRecord?.timestamp);
            const isToday = pair.date === todayStr;

            return (
              <div
                key={`${pair.date}_${pair.userId}_${pair.masukRecord?.sessionId || pair.pulangRecord?.sessionId || 'default'}`}
                className="bg-white rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-xs hover:border-emerald-300 transition-all space-y-4"
              >
                {/* Header Card: Tanggal & Nama Pegawai */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-100">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">
                          {formatDateIndo(pair.date)}
                        </span>
                        {isToday && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                            Hari Ini
                          </span>
                        )}
                        {(pair.masukRecord?.sessionName || pair.pulangRecord?.sessionName) && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-100 text-sky-800 border border-sky-200">
                            {pair.masukRecord?.sessionName || pair.pulangRecord?.sessionName}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        <span className="font-semibold text-slate-700">{pair.userName}</span> &bull; NIP: {pair.nip} &bull; <span className="capitalize">{pair.role.replace('_', ' ')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Summary Status Pill */}
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {hasMasuk && hasPulang ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Selesai (Masuk &amp; Pulang)</span>
                      </span>
                    ) : hasMasuk && !hasPulang ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Sedang Bekerja (Belum Pulang)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Belum Absen Masuk</span>
                      </span>
                    )}

                    {duration && (
                      <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-xl">
                        Durasi: {duration}
                      </span>
                    )}
                  </div>
                </div>

                {/* Body Card: DUA KOLOM BERDAMPINGAN: ABSEN MASUK & ABSEN PULANG */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* KOLOM 1: ABSEN MASUK */}
                  <div
                    className={`p-4 rounded-2xl border transition-all ${
                      hasMasuk
                        ? 'bg-gradient-to-br from-emerald-50/60 to-white border-emerald-200/80 shadow-2xs'
                        : 'bg-slate-50 border-dashed border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-emerald-100/60">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="font-extrabold text-xs text-emerald-950 uppercase tracking-wider">
                          1. Absen Masuk
                        </span>
                      </div>
                      {hasMasuk && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            pair.masukRecord?.status === 'tepat_waktu'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {pair.masukRecord?.status === 'tepat_waktu' ? 'Tepat Waktu' : 'Terlambat'}
                        </span>
                      )}
                    </div>

                    {hasMasuk && pair.masukRecord ? (
                      <div className="mt-3 flex items-start gap-3">
                        {/* Foto Wajah Absen Masuk */}
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewPhoto({
                              url: pair.masukRecord!.photoRef,
                              title: `Foto Absen Masuk - ${pair.userName}`,
                              subtitle: `${formatDateIndo(pair.date)} &bull; Pukul ${new Date(
                                pair.masukRecord!.timestamp
                              ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} WIB`,
                            })
                          }
                          className="relative group shrink-0"
                          title="Klik untuk memperbesar foto wajah presensi masuk"
                        >
                          <img
                            src={pair.masukRecord.photoRef}
                            alt="Foto Presensi Masuk"
                            className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-300 shadow-xs group-hover:opacity-90 transition-opacity"
                          />
                          <div className="absolute inset-0 bg-black/30 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                            <Eye className="w-4 h-4" />
                          </div>
                        </button>

                        <div className="space-y-1 text-xs flex-1">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            <Clock className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="font-mono text-sm">
                              {new Date(pair.masukRecord.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}{' '}
                              WIB
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>Jarak: <strong>{pair.masukRecord.distanceFromLocationMeters} meter</strong> (Sah)</span>
                          </div>

                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Camera className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>
                              Kecocokan Wajah:{' '}
                              <strong className="text-emerald-700">
                                {Math.round(pair.masukRecord.faceSimilarityScore * 100)}%
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="py-6 text-center text-slate-400 text-xs">
                        <AlertCircle className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                        <span>Belum ada catatan presensi masuk.</span>
                      </div>
                    )}
                  </div>

                  {/* KOLOM 2: ABSEN PULANG */}
                  <div
                    className={`p-4 rounded-2xl border transition-all ${
                      hasPulang
                        ? 'bg-gradient-to-br from-indigo-50/60 to-white border-indigo-200/80 shadow-2xs'
                        : 'bg-slate-50 border-dashed border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-indigo-100/60">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${hasPulang ? 'bg-indigo-600' : 'bg-slate-300'}`} />
                        <span className="font-extrabold text-xs text-indigo-950 uppercase tracking-wider">
                          2. Absen Pulang
                        </span>
                      </div>
                      {hasPulang ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                          Pulang Sah
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                          Belum Pulang
                        </span>
                      )}
                    </div>

                    {hasPulang && pair.pulangRecord ? (
                      <div className="mt-3 flex items-start gap-3">
                        {/* Foto Wajah Absen Pulang */}
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewPhoto({
                              url: pair.pulangRecord!.photoRef,
                              title: `Foto Absen Pulang - ${pair.userName}`,
                              subtitle: `${formatDateIndo(pair.date)} &bull; Pukul ${new Date(
                                pair.pulangRecord!.timestamp
                              ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} WIB`,
                            })
                          }
                          className="relative group shrink-0"
                          title="Klik untuk memperbesar foto wajah presensi pulang"
                        >
                          <img
                            src={pair.pulangRecord.photoRef}
                            alt="Foto Presensi Pulang"
                            className="w-16 h-16 rounded-2xl object-cover border-2 border-indigo-300 shadow-xs group-hover:opacity-90 transition-opacity"
                          />
                          <div className="absolute inset-0 bg-black/30 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                            <Eye className="w-4 h-4" />
                          </div>
                        </button>

                        <div className="space-y-1 text-xs flex-1">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            <Clock className="w-3.5 h-3.5 text-indigo-600" />
                            <span className="font-mono text-sm">
                              {new Date(pair.pulangRecord.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}{' '}
                              WIB
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>Jarak: <strong>{pair.pulangRecord.distanceFromLocationMeters} meter</strong> (Sah)</span>
                          </div>

                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Camera className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>
                              Kecocokan Wajah:{' '}
                              <strong className="text-indigo-700">
                                {Math.round(pair.pulangRecord.faceSimilarityScore * 100)}%
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="py-6 text-center text-slate-400 text-xs">
                        <Clock className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                        <span>Belum melakukan presensi pulang.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Preview Foto Biometrik Wajah */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">{previewPhoto.title}</h3>
                <p className="text-[11px] text-slate-500">{previewPhoto.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex justify-center bg-slate-950">
              <img
                src={previewPhoto.url}
                alt="Bukti Foto Presensi"
                className="max-h-80 w-auto rounded-2xl object-contain border border-slate-700"
              />
            </div>

            <div className="p-4 bg-slate-50 text-right">
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800"
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
