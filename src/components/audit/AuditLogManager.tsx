/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  Download,
  Calendar,
  Clock,
  User,
  ShieldCheck,
  CheckCircle,
  Database,
  Layers,
  ArrowUpDown,
  RefreshCw,
} from 'lucide-react';
import { AuditLog, User as UserModel, UserRole } from '../../types';
import { getAuditLogs } from '../../services/storage';

interface AuditLogManagerProps {
  currentUser: UserModel;
}

export const AuditLogManager: React.FC<AuditLogManagerProps> = ({ currentUser }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<'all' | UserRole>('all');
  const [actionCategory, setActionCategory] = useState<string>('all');

  const loadData = () => {
    setLogs(getAuditLogs());
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (selectedEntity !== 'all' && log.targetEntity !== selectedEntity) return false;
    if (selectedRole !== 'all' && log.actorRole !== selectedRole) return false;
    if (actionCategory !== 'all' && !log.action.includes(actionCategory)) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchActor = log.actorName.toLowerCase().includes(q);
      const matchAction = log.action.toLowerCase().includes(q);
      const matchDetails = log.details.toLowerCase().includes(q);
      if (!matchActor && !matchAction && !matchDetails) return false;
    }

    return true;
  });

  const handleExportAuditCSV = () => {
    const headers = ['ID Log', 'Waktu', 'Aktor', 'Peran', 'Aksi', 'Entitas Target', 'Target ID', 'Rincian Aktivitas'];
    const rows = filteredLogs.map((l) => [
      `"${l.id}"`,
      `"${new Date(l.timestamp).toLocaleString()}"`,
      `"${l.actorName}"`,
      `"${l.actorRole}"`,
      `"${l.action}"`,
      `"${l.targetEntity}"`,
      `"${l.targetId || '-'}"`,
      `"${l.details.replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Audit_Logs_KITARAJIN_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionBadgeClass = (action: string) => {
    if (action.includes('REGISTER') || action.includes('FACE')) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (action.includes('CREATE')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (action.includes('UPDATE')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (action.includes('DELETE')) return 'bg-rose-100 text-rose-800 border-rose-200';
    if (action.includes('REVIEW') || action.includes('LEAVE')) return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <ShieldAlert className="w-4 h-4" />
            <span>Log Audit Admin &amp; Transparansi Sistem</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            Rekam Jejak Aktivitas Sistem
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Audit trail lengkap mencatat seluruh perubahan data pengguna, jadwal, lokasi, database wajah, dan perizinan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
            title="Muat Ulang Log"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleExportAuditCSV}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor Log Audit (.CSV)</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari aktor, aksi, atau keterangan..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {/* Filter Entitas Target */}
        <select
          value={selectedEntity}
          onChange={(e) => setSelectedEntity(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white"
        >
          <option value="all">Semua Entitas Tabel</option>
          <option value="Users">Users (Pengguna)</option>
          <option value="Schedules">Schedules (Jadwal &amp; Sesi)</option>
          <option value="Locations">Locations (Titik Presensi &amp; Radius)</option>
          <option value="FaceRegistry">FaceRegistry (Database Wajah)</option>
          <option value="Attendance">Attendance (Presensi Mandiri)</option>
          <option value="LeaveRequests">LeaveRequests (Izin &amp; Sakit)</option>
          <option value="Assignments">Assignments (Tugas Lapangan)</option>
          <option value="Departments">Departments (Divisi Sekolah)</option>
          <option value="Settings">Settings (Pengaturan Sistem)</option>
        </select>

        {/* Filter Peran Aktor */}
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as any)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white"
        >
          <option value="all">Semua Peran Pelaku</option>
          <option value="kepala_sekolah">Kepala Sekolah</option>
          <option value="admin">Admin</option>
          <option value="karyawan">Karyawan / Guru / Staf</option>
        </select>

        {/* Filter Kategori Aksi */}
        <select
          value={actionCategory}
          onChange={(e) => setActionCategory(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white"
        >
          <option value="all">Semua Tipe Tindakan</option>
          <option value="CREATE">Pembuatan Baru (CREATE)</option>
          <option value="UPDATE">Perubahan Data (UPDATE)</option>
          <option value="DELETE">Penghapusan (DELETE)</option>
          <option value="REGISTER_FACE">Biometrik Wajah (FACE)</option>
          <option value="SUBMIT_ATTENDANCE">Presensi Masuk/Pulang</option>
          <option value="LEAVE">Pengajuan &amp; Tinjau Izin</option>
        </select>
      </div>

      {/* Log Feed */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800">
            Daftar Log Audit ({filteredLogs.length} Aktivitas Terekam)
          </span>
          <span className="text-[11px] text-slate-400">
            Disimpan secara otomatis &bull; Tidak dapat dimanipulasi
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Belum ada riwayat audit log yang sesuai dengan filter.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const formattedTime = new Date(log.timestamp).toLocaleString('id-ID', {
                dateStyle: 'medium',
                timeStyle: 'medium',
              });

              return (
                <div
                  key={log.id}
                  className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-start justify-between gap-3 text-xs"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase border ${getActionBadgeClass(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>

                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {log.targetEntity}
                      </span>

                      <span className="text-[11px] text-slate-400 font-mono">
                        {formattedTime} WIB
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 font-medium leading-relaxed">
                      {log.details}
                    </p>
                  </div>

                  {/* Actor Info */}
                  <div className="text-right shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100">
                    <div className="font-bold text-slate-900 text-xs">{log.actorName}</div>
                    <div className="text-[10px] text-slate-400 capitalize">
                      {log.actorRole.replace('_', ' ')}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
