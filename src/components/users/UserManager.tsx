/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Edit2,
  Lock,
  Power,
  AlertCircle,
  Building2,
  Phone,
  Mail,
  UserCheck,
  RefreshCw,
  X,
} from 'lucide-react';
import { User, UserRole, Department, Schedule } from '../../types';
import {
  getAllUsers,
  getAllDepartments,
  getAllSchedules,
  createUser,
  updateUser,
  toggleUserStatus,
  getAuditLogs,
} from '../../services/storage';

interface UserManagerProps {
  currentUser: User;
  initialRoleFilter?: 'admin' | 'karyawan' | 'all';
}

export const UserManager: React.FC<UserManagerProps> = ({
  currentUser,
  initialRoleFilter = 'all',
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'karyawan'>(initialRoleFilter);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form State
  const [formNip, setFormNip] = useState('');
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'karyawan'>('karyawan');
  const [formDepartmentId, setFormDepartmentId] = useState('');
  const [formScheduleId, setFormScheduleId] = useState('');
  const [formPosition, setFormPosition] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load data
  const loadData = () => {
    setUsers(getAllUsers());
    setDepartments(getAllDepartments());
    setSchedules(getAllSchedules());
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter list
  const filteredUsers = users.filter((u) => {
    // Role filter
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    // Status filter
    if (statusFilter === 'active' && !u.isActive) return false;
    if (statusFilter === 'inactive' && u.isActive) return false;
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = u.name.toLowerCase().includes(q);
      const matchNip = u.nip.toLowerCase().includes(q);
      const matchUsername = u.username.toLowerCase().includes(q);
      const matchPosition = u.position.toLowerCase().includes(q);
      if (!matchName && !matchNip && !matchUsername && !matchPosition) return false;
    }
    return true;
  });

  const openCreateModal = (presetRole?: 'admin' | 'karyawan') => {
    setEditingUser(null);
    setFormNip('');
    setFormName('');
    setFormUsername('');
    setFormPassword('');
    setFormRole(presetRole || (currentUser.role === 'admin' ? 'karyawan' : 'karyawan'));
    setFormDepartmentId(departments[0]?.id || '');
    setFormScheduleId(schedules[0]?.id || '');
    setFormPosition('');
    setFormEmail('');
    setFormPhone('');
    setFeedback(null);
    setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormNip(user.nip);
    setFormName(user.name);
    setFormUsername(user.username);
    setFormPassword(''); // Password dikosongkan jika tidak ingin direset
    setFormRole(user.role === 'admin' ? 'admin' : 'karyawan');
    setFormDepartmentId(user.departmentId || departments[0]?.id || '');
    setFormScheduleId(user.scheduleId || schedules[0]?.id || '');
    setFormPosition(user.position);
    setFormEmail(user.email || '');
    setFormPhone(user.phone || '');
    setFeedback(null);
    setIsModalOpen(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      if (editingUser) {
        // Edit existing user
        const res = await updateUser(currentUser, editingUser.id, {
          nip: formNip,
          name: formName,
          username: formUsername,
          position: formPosition,
          departmentId: formDepartmentId,
          scheduleId: formScheduleId,
          email: formEmail || undefined,
          phone: formPhone || undefined,
          rawPassword: formPassword.trim() ? formPassword.trim() : undefined,
        });

        if (res.success) {
          setFeedback({ type: 'success', message: res.message });
          setIsModalOpen(false);
          loadData();
        } else {
          setFeedback({ type: 'error', message: res.message });
        }
      } else {
        // Create new user
        if (!formPassword.trim()) {
          setFeedback({ type: 'error', message: 'Password wajib diisi untuk akun baru.' });
          setIsSubmitting(false);
          return;
        }

        const res = await createUser(currentUser, {
          nip: formNip,
          name: formName,
          username: formUsername,
          rawPassword: formPassword,
          role: formRole,
          departmentId: formDepartmentId,
          scheduleId: formScheduleId,
          position: formPosition,
          email: formEmail || undefined,
          phone: formPhone || undefined,
        });

        if (res.success) {
          setFeedback({ type: 'success', message: res.message });
          setIsModalOpen(false);
          loadData();
        } else {
          setFeedback({ type: 'error', message: res.message });
        }
      }
    } catch {
      setFeedback({ type: 'error', message: 'Terjadi kesalahan sistem saat menyimpan.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = (targetUser: User) => {
    const res = toggleUserStatus(currentUser, targetUser.id);
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === 'admin').length,
    karyawan: users.filter((u) => u.role === 'karyawan').length,
    active: users.filter((u) => u.isActive).length,
    inactive: users.filter((u) => !u.isActive).length,
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <Users className="w-4 h-4" />
            <span>Tahap 3 &bull; Manajemen Pengguna & Otoritas</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            Pengelolaan Akun Sekolah
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {currentUser.role === 'kepala_sekolah'
              ? 'Kepala Sekolah memiliki hak mengelola akun Admin dan seluruh Karyawan/Tendik.'
              : 'Admin berwenang mengelola data dan kredensial Karyawan/Tendik sekolah.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {currentUser.role === 'kepala_sekolah' && (
            <button
              type="button"
              onClick={() => openCreateModal('admin')}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>+ Buat Akun Admin</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => openCreateModal('karyawan')}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Tambah Karyawan / Tendik</span>
          </button>
        </div>
      </div>

      {/* Feedback Message */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between text-xs sm:text-sm ${
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase">Total Pengguna</span>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{stats.total} Orang</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-indigo-600 uppercase">Akun Admin</span>
          <div className="text-xl font-extrabold text-indigo-700 mt-1">{stats.admins} Akun</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-emerald-600 uppercase">Karyawan / Guru</span>
          <div className="text-xl font-extrabold text-emerald-700 mt-1">{stats.karyawan} Orang</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-amber-600 uppercase">Status Aktif</span>
          <div className="text-xl font-extrabold text-slate-800 mt-1">
            {stats.active} <span className="text-xs font-normal text-slate-400">/ {stats.inactive} nonaktif</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan nama, NIP, username, atau posisi..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white"
          >
            <option value="all">Semua Peran</option>
            {currentUser.role === 'kepala_sekolah' && <option value="admin">Khusus Admin</option>}
            <option value="karyawan">Khusus Karyawan</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white"
          >
            <option value="all">Semua Status</option>
            <option value="active">Hanya Aktif</option>
            <option value="inactive">Hanya Nonaktif</option>
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

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Pengguna</th>
                <th className="py-3.5 px-4">NIP / ID</th>
                <th className="py-3.5 px-3">Peran & Departemen</th>
                <th className="py-3.5 px-3">Status</th>
                <th className="py-3.5 px-4 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Tidak ditemukan data pengguna yang cocok dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const dept = departments.find((d) => d.id === u.departmentId);
                  const canEdit =
                    currentUser.role === 'kepala_sekolah' ||
                    (currentUser.role === 'admin' && u.role === 'karyawan');
                  const canToggle =
                    u.role !== 'kepala_sekolah' &&
                    (currentUser.role === 'kepala_sekolah' ||
                      (currentUser.role === 'admin' && u.role === 'karyawan'));

                  return (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{u.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">@{u.username}</div>
                        {u.email && (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Mail className="w-3 h-3" />
                            <span>{u.email}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-700 text-xs">
                        {u.nip}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                              u.role === 'kepala_sekolah'
                                ? 'bg-emerald-100 text-emerald-800'
                                : u.role === 'admin'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {u.role.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-slate-800 mt-1">{u.position}</div>
                        {dept && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            <span>{dept.name}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-3">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle className="w-3 h-3" /> Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3" /> Nonaktif
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEditModal(u)}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors"
                              title="Edit Data & Reset Password"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canToggle && (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(u)}
                              className={`p-1.5 rounded-lg border transition-colors ${
                                u.isActive
                                  ? 'border-rose-200 hover:bg-rose-50 text-rose-600'
                                  : 'border-emerald-200 hover:bg-emerald-50 text-emerald-600'
                              }`}
                              title={u.isActive ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah / Edit Pengguna */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => !isSubmitting && setIsModalOpen(false)}
          />

          <div className="relative bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  {editingUser ? <Edit2 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {editingUser ? `Edit Akun: ${editingUser.name}` : 'Tambah Pengguna Baru'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Password disimpan terenkripsi dengan hashing SHA-256 aman.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4 mt-4">
              {/* Role Selection (Only allowed for KS creating new) */}
              {!editingUser && currentUser.role === 'kepala_sekolah' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Jenis Peran Akun
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormRole('admin')}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                        formRole === 'admin'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-700 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Admin Sekolah
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormRole('karyawan')}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                        formRole === 'karyawan'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Karyawan / Tendik
                    </button>
                  </div>
                </div>
              )}

              {/* NIP / ID */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  NIP / ID Unik <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formNip}
                  onChange={(e) => setFormNip(e.target.value)}
                  placeholder="Misal: 198804152011012003"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Nama Lengkap */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nama Lengkap & Gelar <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Misal: Siti Rahmawati, S.Pd."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Username Login <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="Misal: sitirahma"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {editingUser ? 'Reset Password (Kosongkan jika tidak diubah)' : 'Password Awal'} {!editingUser && <span className="text-rose-500">*</span>}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder={editingUser ? 'Ketik password baru untuk mereset...' : 'Minimal 6 karakter'}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Jabatan & Departemen */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Jabatan / Posisi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formPosition}
                    onChange={(e) => setFormPosition(e.target.value)}
                    placeholder="Contoh: Guru Matematika"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Departemen
                  </label>
                  <select
                    value={formDepartmentId}
                    onChange={(e) => setFormDepartmentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Jadwal Kerja */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Jadwal Kerja / Shift Presensi
                </label>
                <select
                  value={formScheduleId}
                  onChange={(e) => setFormScheduleId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                >
                  {schedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Batas: {s.checkInDeadline}, Toleransi: +{s.lateToleranceMinutes}m, Pulang: {s.checkOutStart})
                    </option>
                  ))}
                </select>
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="nama@sekolah.sch.id"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Nomor WhatsApp/HP
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="08123456789"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
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
                  {isSubmitting ? 'Menyimpan...' : editingUser ? 'Perbarui Akun' : 'Simpan Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
