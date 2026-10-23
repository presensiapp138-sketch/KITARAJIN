/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  Filter,
  Download,
  Copy,
  CheckCircle,
  Clock,
  MapPin,
  Camera,
  Users,
  Search,
  Printer,
  FileSpreadsheet,
  AlertTriangle,
  ChevronDown,
  Eye,
  X,
  FileText,
} from 'lucide-react';
import {
  User,
  AttendanceRecord,
  Department,
  UserRole,
  LeaveRequest,
} from '../../types';
import {
  getAllAttendanceRecords,
  getAttendanceForUser,
  getAllUsers,
  getAllDepartments,
  getAllLeaveRequests,
  getAppSettings,
} from '../../services/storage';

interface ReportManagerProps {
  currentUser: User;
}

export const ReportManager: React.FC<ReportManagerProps> = ({ currentUser }) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);

  // Filter States
  const [periodType, setPeriodType] = useState<'hari_ini' | 'minggu_ini' | 'bulan_ini' | 'custom'>('bulan_ini');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // awal bulan
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedRole, setSelectedRole] = useState<'all' | UserRole>('all');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Photo Preview Modal
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = () => {
    const allUsers = getAllUsers();
    setUsers(allUsers);
    setDepartments(getAllDepartments());
    setLeaveRequests(getAllLeaveRequests());

    if (currentUser.role === 'karyawan') {
      setRecords(getAttendanceForUser(currentUser.id));
    } else {
      setRecords(getAllAttendanceRecords());
    }
  };

  const handlePeriodChange = (type: 'hari_ini' | 'minggu_ini' | 'bulan_ini' | 'custom') => {
    setPeriodType(type);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (type === 'hari_ini') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (type === 'minggu_ini') {
      const start = new Date(today);
      const day = start.getDay() || 7; // getDay: 0 is Sun
      start.setDate(start.getDate() - day + 1); // Senin
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (type === 'bulan_ini') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(todayStr);
    }
  };

  // Filter Records
  const filteredRecords = records.filter((r) => {
    // Filter Date Range
    if (r.date < startDate || r.date > endDate) return false;

    // Filter Role (Karyawan can only see their own anyway)
    if (currentUser.role !== 'karyawan' && selectedRole !== 'all' && r.role !== selectedRole) {
      return false;
    }

    // Filter Department
    if (selectedDeptId !== 'all') {
      const u = users.find((user) => user.id === r.userId);
      if (u?.departmentId !== selectedDeptId) return false;
    }

    // Filter Status
    if (selectedStatus !== 'all' && r.status !== selectedStatus) {
      return false;
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = r.userName.toLowerCase().includes(q);
      const matchNip = r.nip.toLowerCase().includes(q);
      if (!matchName && !matchNip) return false;
    }

    return true;
  });

  // KPI Statistics Calculation
  const totalCheckIns = filteredRecords.filter((r) => r.type === 'masuk').length;
  const totalOnTime = filteredRecords.filter((r) => r.type === 'masuk' && r.status === 'tepat_waktu').length;
  const totalLate = filteredRecords.filter((r) => r.type === 'masuk' && r.status === 'terlambat').length;

  const relevantLeaves = leaveRequests.filter((l) => {
    if (l.status !== 'disetujui') return false;
    if (l.startDate > endDate || l.endDate < startDate) return false;
    if (currentUser.role === 'karyawan' && l.userId !== currentUser.id) return false;
    return true;
  });

  const totalIzin = relevantLeaves.filter((l) => l.type === 'izin').length;
  const totalSakit = relevantLeaves.filter((l) => l.type === 'sakit').length;
  const totalDinas = relevantLeaves.filter((l) => l.type === 'dinas').length;

  const onTimePercentage = totalCheckIns > 0 ? Math.round((totalOnTime / totalCheckIns) * 100) : 100;

  // Ekspor ke CSV
  const handleExportCSV = () => {
    const settings = getAppSettings();
    const headers = [
      'ID Presensi',
      'Tanggal',
      'Waktu Presensi',
      'NIP / ID',
      'Nama Karyawan',
      'Peran',
      'Departemen',
      'Jenis Presensi',
      'Status Kehadiran',
      'Jarak GPS (Meter)',
      'GPS Valid',
      'Skor Wajah (%)',
      'Wajah Valid',
    ];

    const rows = filteredRecords.map((r) => {
      const u = users.find((user) => user.id === r.userId);
      const d = departments.find((dept) => dept.id === u?.departmentId);
      const deptName = d?.name || '-';
      const timeStr = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return [
        `"${r.id}"`,
        `"${r.date}"`,
        `"${timeStr}"`,
        `"${r.nip}"`,
        `"${r.userName}"`,
        `"${r.role}"`,
        `"${deptName}"`,
        `"${r.type.toUpperCase()}"`,
        `"${r.status.replace('_', ' ').toUpperCase()}"`,
        r.distanceFromLocationMeters,
        r.isLocationValid ? 'YA' : 'TIDAK',
        `${Math.round(r.faceSimilarityScore * 100)}%`,
        r.isFaceValid ? 'YA' : 'TIDAK',
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Rekap_Presensi_KITARAJIN_${startDate}_sd_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Salin Format Tabulasi untuk Google Sheets
  const handleCopyForGoogleSheets = () => {
    const headers = ['Tanggal', 'Waktu', 'NIP', 'Nama', 'Peran', 'Departemen', 'Tipe', 'Status', 'Jarak (m)', 'Skor Wajah'];
    const rows = filteredRecords.map((r) => {
      const u = users.find((user) => user.id === r.userId);
      const d = departments.find((dept) => dept.id === u?.departmentId);
      const timeStr = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return [
        r.date,
        timeStr,
        r.nip,
        r.userName,
        r.role,
        d?.name || '-',
        r.type.toUpperCase(),
        r.status.replace('_', ' ').toUpperCase(),
        r.distanceFromLocationMeters,
        `${Math.round(r.faceSimilarityScore * 100)}%`,
      ].join('\t');
    });

    const tsvData = [headers.join('\t'), ...rows].join('\n');
    navigator.clipboard.writeText(tsvData);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 3000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <BarChart3 className="w-4 h-4" />
            <span>Tahap 7 &bull; Rekapitulasi Presensi &amp; Ekspor</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            {currentUser.role === 'karyawan' ? 'Laporan Presensi Pribadi' : 'Laporan Kehadiran Civitas Sekolah'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Rekapitulasi presensi harian, mingguan, dan bulanan dengan verifikasi biometrik wajah &amp; koordinat GPS.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleCopyForGoogleSheets}
            className="px-3.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
            title="Salin data siap tempel ke Google Spreadsheet"
          >
            {copyFeedback ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-emerald-600" />}
            <span>{copyFeedback ? 'Tersalin ke Clipboard!' : 'Salin ke Google Sheets'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600"
            title="Cetak Laporan"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Statistic Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Presensi Masuk</span>
          <div className="text-2xl font-black text-slate-900 font-mono">{totalCheckIns}</div>
          <span className="text-[11px] text-slate-500 block">Transaksi presensi masuk</span>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-emerald-700 block">Tepat Waktu</span>
          <div className="text-2xl font-black text-emerald-800 font-mono">{totalOnTime}</div>
          <span className="text-[11px] text-emerald-700 font-semibold block">{onTimePercentage}% tingkat kedisiplinan</span>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-amber-700 block">Terlambat</span>
          <div className="text-2xl font-black text-amber-800 font-mono">{totalLate}</div>
          <span className="text-[11px] text-amber-600 block">Lewat batas toleransi jadwal</span>
        </div>

        <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-blue-700 block">Izin / Sakit / Dinas</span>
          <div className="text-2xl font-black text-blue-800 font-mono">{totalIzin + totalSakit + totalDinas}</div>
          <span className="text-[10px] text-blue-600 block">I: {totalIzin} &bull; S: {totalSakit} &bull; D: {totalDinas}</span>
        </div>

        <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200 shadow-xs space-y-1 col-span-2 lg:col-span-1">
          <span className="text-[10px] uppercase font-bold text-purple-700 block">Total Baris Log</span>
          <div className="text-2xl font-black text-purple-900 font-mono">{filteredRecords.length}</div>
          <span className="text-[11px] text-purple-700 block">Record masuk &amp; pulang</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
        {/* Periode Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            {(
              [
                { id: 'hari_ini', label: 'Hari Ini' },
                { id: 'minggu_ini', label: 'Minggu Ini' },
                { id: 'bulan_ini', label: 'Bulan Ini' },
                { id: 'custom', label: 'Kustom Tanggal' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePeriodChange(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  periodType === p.id
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date Range Inputs */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Periode:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPeriodType('custom');
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono"
            />
            <span className="text-slate-400">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPeriodType('custom');
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono"
            />
          </div>
        </div>

        {/* Dropdown Filters & Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          {/* Search by Name / NIP */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama atau NIP..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Filter Role (for non-karyawan) */}
          {currentUser.role !== 'karyawan' ? (
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as any)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white"
            >
              <option value="all">Semua Peran (KS, Admin, Tendik)</option>
              <option value="kepala_sekolah">Kepala Sekolah</option>
              <option value="admin">Admin</option>
              <option value="karyawan">Karyawan / Guru / Staf</option>
            </select>
          ) : (
            <div className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-500 bg-slate-50 flex items-center">
              Laporan Saya Sendiri
            </div>
          )}

          {/* Filter Departemen */}
          <select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white"
          >
            <option value="all">Semua Departemen / Unit</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>

          {/* Filter Status Kehadiran */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white"
          >
            <option value="all">Semua Status Presensi</option>
            <option value="tepat_waktu">Tepat Waktu</option>
            <option value="terlambat">Terlambat</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800">
            Daftar Catatan Kehadiran ({filteredRecords.length} Data)
          </div>
          <span className="text-[11px] text-slate-400">
            Urutan: Data terbaru di paling atas
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200/60">
                <th className="py-3 px-4">Tanggal &amp; Waktu</th>
                <th className="py-3 px-4">Pegawai / Staf</th>
                <th className="py-3 px-4">Jenis</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Verifikasi Wajah</th>
                <th className="py-3 px-4">Validasi GPS Radius</th>
                <th className="py-3 px-4 text-center">Foto Bukti</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    Tidak ada catatan presensi yang cocok dengan kriteria filter di atas.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  const u = users.find((user) => user.id === r.userId);
                  const d = departments.find((dept) => dept.id === u?.departmentId);
                  const timeStr = new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{r.date}</div>
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{timeStr} WIB</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{r.userName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          NIP: {r.nip} &bull; <span className="text-slate-600 font-semibold">{d?.name || r.role}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                            r.type === 'masuk' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {r.type}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            r.status === 'tepat_waktu'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : r.status === 'terlambat'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {r.status === 'tepat_waktu' && <CheckCircle className="w-3 h-3 text-emerald-600" />}
                          {r.status === 'terlambat' && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                          <span className="capitalize">{r.status.replace('_', ' ')}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-mono font-bold text-xs ${
                              r.isFaceValid ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {Math.round(r.faceSimilarityScore * 100)}%
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {r.isFaceValid ? '(Cocok)' : '(Tolak)'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-[11px] text-slate-600">
                          <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span className="font-mono font-bold text-slate-800">{r.distanceFromLocationMeters}m</span>
                          <span className="text-[10px] text-slate-400">
                            {r.isLocationValid ? '(Radius Valid)' : '(Luar Radius)'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {r.photoRef ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewPhoto({
                                url: r.photoRef,
                                title: `${r.userName} - Presensi ${r.type.toUpperCase()} (${r.date} ${timeStr})`,
                              })
                            }
                            className="inline-flex items-center justify-center p-1 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                            title="Lihat foto snapshot"
                          >
                            <img
                              src={r.photoRef}
                              alt="Snapshot"
                              className="w-7 h-7 rounded-md object-cover"
                            />
                          </button>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Preview Foto Snapshot Presensi */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs" onClick={() => setPreviewPhoto(null)} />
          <div className="relative bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h4 className="font-bold text-xs text-slate-800 truncate pr-2">{previewPhoto.title}</h4>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="aspect-square bg-slate-900 rounded-2xl overflow-hidden border">
              <img src={previewPhoto.url} alt="Presensi Snapshot" className="w-full h-full object-cover" />
            </div>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
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
