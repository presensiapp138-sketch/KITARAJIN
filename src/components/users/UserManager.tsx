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
  Clock,
  Plus,
  Trash2,
  Calendar,
  Layers,
  Sparkles,
  Save,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';

import { User, UserRole, Department, Schedule } from '../../types';
import {
  getAllUsers,
  getAllDepartments,
  getAllSchedules,
  createUser,
  updateUser,
  toggleUserStatus,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  updateUserSessions,
  toggleUserSession,
  assignUsersToSession,
  getAuditLogs,
} from '../../services/storage';
import { TimeInput24 } from '../common/TimeInput24';


interface UserManagerProps {
  currentUser: User;
  initialRoleFilter?: 'admin' | 'karyawan' | 'all';
  initialTab?: 'users' | 'departments' | 'sessions';
}

const DAY_OPTIONS = [
  { id: 1, label: 'Senin' },
  { id: 2, label: 'Selasa' },
  { id: 3, label: 'Rabu' },
  { id: 4, label: 'Kamis' },
  { id: 5, label: 'Jumat' },
  { id: 6, label: 'Sabtu' },
  { id: 0, label: 'Minggu' },
];

export const UserManager: React.FC<UserManagerProps> = ({
  currentUser,
  initialRoleFilter = 'all',
  initialTab = 'users',
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'sessions'>(
    initialTab === 'departments' ? 'users' : (initialTab as any) || 'users'
  );
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'karyawan'>(initialRoleFilter);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // User Modal State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formNip, setFormNip] = useState('');
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [formRole, setFormRole] = useState<'admin' | 'karyawan'>('karyawan');
  const [formDepartmentId, setFormDepartmentId] = useState('');
  const [formDepartmentName, setFormDepartmentName] = useState('');
  const [formScheduleId, setFormScheduleId] = useState('');
  const [formAssignedSessionIds, setFormAssignedSessionIds] = useState<string[]>(['sesi-1', 'sesi-2', 'sesi-3']);
  const [formPosition, setFormPosition] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  // Session / Schedule Modal State (Tambah/Edit Sesi Baru)
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Schedule | null>(null);
  const [sessionFormName, setSessionFormName] = useState('');
  const [sessionFormSessionName, setSessionFormSessionName] = useState('Sesi 1');
  const [sessionCheckInStart, setSessionCheckInStart] = useState('06:00');
  const [sessionCheckInDeadline, setSessionCheckInDeadline] = useState('07:30');
  const [sessionLateTolerance, setSessionLateTolerance] = useState(15);
  const [sessionCheckOutStart, setSessionCheckOutStart] = useState('11:30');
  const [sessionCheckOutEnd, setSessionCheckOutEnd] = useState('13:00');
  const [sessionWorkDays, setSessionWorkDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [sessionRuleNotes, setSessionRuleNotes] = useState('');
  const [isSubmittingSession, setIsSubmittingSession] = useState(false);

  // Quick Inline Session Edit State
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null);
  const [sessionTimeInputs, setSessionTimeInputs] = useState<
    Record<string, { checkInStart: string; checkInDeadline: string; checkOutStart: string; checkOutEnd: string }>
  >({});
  const [activeExpandedSessionRoster, setActiveExpandedSessionRoster] = useState<string | null>(null);
  const [sessionEmployeeSearch, setSessionEmployeeSearch] = useState('');

  // Load all data
  const loadData = () => {
    setUsers(getAllUsers());
    setDepartments(getAllDepartments());
    const schedList = getAllSchedules();
    setSchedules(schedList);

    setSessionTimeInputs((prev) => {
      const next = { ...prev };
      schedList.forEach((s) => {
        if (!next[s.id]) {
          next[s.id] = {
            checkInStart: s.checkInStart || '06:00',
            checkInDeadline: s.checkInDeadline || '07:30',
            checkOutStart: s.checkOutStart || '11:30',
            checkOutEnd: s.checkOutEnd || '13:00',
          };
        }
      });
      return next;
    });
  };

  useEffect(() => {
    loadData();

    const handleSync = () => {
      loadData();
    };
    window.addEventListener('kitarajin_cloud_sync', handleSync);
    return () => {
      window.removeEventListener('kitarajin_cloud_sync', handleSync);
    };
  }, []);

  // Filtered Users List
  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (statusFilter === 'active' && !u.isActive) return false;
    if (statusFilter === 'inactive' && u.isActive) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = u.name.toLowerCase().includes(q);
      const matchNip = u.nip.toLowerCase().includes(q);
      const matchUsername = u.username.toLowerCase().includes(q);
      const matchPosition = u.position?.toLowerCase().includes(q);
      const matchDept = (u.departmentName || u.departmentId)?.toLowerCase().includes(q);
      if (!matchName && !matchNip && !matchUsername && !matchPosition && !matchDept) return false;
    }
    return true;
  });

  // ==============================================================
  // USER HANDLERS
  // ==============================================================
  const openCreateUserModal = (presetRole?: 'admin' | 'karyawan') => {
    setEditingUser(null);
    setFormNip('');
    setFormName('');
    setFormUsername('');
    setFormPassword('');
    setFormRole(presetRole || 'karyawan');
    setFormDepartmentId('');
    setFormDepartmentName('');
    setFormScheduleId(schedules[0]?.id || '');
    setFormAssignedSessionIds(['sesi-1', 'sesi-2', 'sesi-3']);
    setFormPosition('');
    setFormEmail('');
    setFormPhone('');
    setShowFormPassword(false);
    setFeedback(null);
    setIsUserModalOpen(true);
  };

  const openEditUserModal = (user: User) => {
    const deptVal = user.departmentName || user.departmentId || '';
    setEditingUser(user);
    setFormNip(user.nip);
    setFormName(user.name);
    setFormUsername(user.username);
    setFormPassword('');
    setShowFormPassword(false);
    setFormRole(user.role === 'admin' ? 'admin' : 'karyawan');
    setFormDepartmentId(deptVal);
    setFormDepartmentName(deptVal);
    setFormScheduleId(user.scheduleId || schedules[0]?.id || '');
    setFormAssignedSessionIds(
      user.assignedSessionIds && user.assignedSessionIds.length > 0
        ? user.assignedSessionIds
        : ['sesi-1', 'sesi-2', 'sesi-3']
    );
    setFormPosition(user.position);
    setFormEmail(user.email || '');
    setFormPhone(user.phone || '');
    setFeedback(null);
    setIsUserModalOpen(true);
  };

  const toggleSessionInUserForm = (schedId: string) => {
    if (formAssignedSessionIds.includes(schedId)) {
      if (formAssignedSessionIds.length === 1) {
        setFeedback({ type: 'error', message: 'Karyawan harus memiliki minimal 1 sesi presensi.' });
        return;
      }
      setFormAssignedSessionIds(formAssignedSessionIds.filter((id) => id !== schedId));
    } else {
      setFormAssignedSessionIds([...formAssignedSessionIds, schedId]);
    }
  };

  const handleSubmitUserForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingUser(true);
    setFeedback(null);

    const manualDept = formDepartmentName.trim();

    try {
      if (editingUser) {
        const res = await updateUser(currentUser, editingUser.id, {
          nip: formNip,
          name: formName,
          username: formUsername,
          position: formPosition,
          departmentId: manualDept,
          departmentName: manualDept,
          scheduleId: formScheduleId,
          assignedSessionIds: formAssignedSessionIds,
          email: formEmail || undefined,
          phone: formPhone || undefined,
          rawPassword: formPassword.trim() ? formPassword.trim() : undefined,
        });

        if (res.success) {
          setFeedback({ type: 'success', message: res.message });
          setIsUserModalOpen(false);
          loadData();
        } else {
          setFeedback({ type: 'error', message: res.message });
        }
      } else {
        if (!formPassword.trim()) {
          setFeedback({ type: 'error', message: 'Password wajib diisi untuk akun baru.' });
          setIsSubmittingUser(false);
          return;
        }

        const res = await createUser(currentUser, {
          nip: formNip,
          name: formName,
          username: formUsername,
          rawPassword: formPassword,
          role: formRole,
          departmentId: manualDept,
          departmentName: manualDept,
          scheduleId: formScheduleId,
          assignedSessionIds: formAssignedSessionIds,
          position: formPosition,
          email: formEmail || undefined,
          phone: formPhone || undefined,
        });

        if (res.success) {
          setFeedback({ type: 'success', message: res.message });
          setIsUserModalOpen(false);
          loadData();
        } else {
          setFeedback({ type: 'error', message: res.message });
        }
      }
    } catch {
      setFeedback({ type: 'error', message: 'Terjadi kesalahan sistem saat menyimpan data pegawai.' });
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleToggleUserStatus = (targetUser: User) => {
    const res = toggleUserStatus(currentUser, targetUser.id);
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  // Toggle Sesi langsung per karyawan di tabel Sesi
  const handleToggleUserSessionQuick = (targetUser: User, sessionId: string) => {
    const currentSessions = targetUser.assignedSessionIds && targetUser.assignedSessionIds.length > 0
      ? targetUser.assignedSessionIds
      : ['sesi-1', 'sesi-2', 'sesi-3'];

    let updated: string[];
    if (currentSessions.includes(sessionId)) {
      if (currentSessions.length === 1) {
        setFeedback({ type: 'error', message: `Karyawan ${targetUser.name} minimal harus memiliki 1 sesi presensi aktif.` });
        return;
      }
      updated = currentSessions.filter((s) => s !== sessionId);
    } else {
      updated = [...currentSessions, sessionId];
    }

    const res = updateUserSessions(currentUser, targetUser.id, updated);
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };



  // ==============================================================
  // SESSION / SCHEDULE HANDLERS
  // ==============================================================
  const openCreateSessionModal = () => {
    setEditingSession(null);
    setSessionFormName('');
    setSessionFormSessionName('Sesi ' + (schedules.length + 1));
    setSessionCheckInStart('06:00');
    setSessionCheckInDeadline('07:30');
    setSessionLateTolerance(15);
    setSessionCheckOutStart('11:30');
    setSessionCheckOutEnd('13:00');
    setSessionWorkDays([1, 2, 3, 4, 5, 6]);
    setSessionRuleNotes('');
    setFeedback(null);
    setIsSessionModalOpen(true);
  };

  const openEditSessionModal = (sched: Schedule) => {
    setEditingSession(sched);
    setSessionFormName(sched.name);
    setSessionFormSessionName(sched.sessionName || sched.name);
    setSessionCheckInStart(sched.checkInStart);
    setSessionCheckInDeadline(sched.checkInDeadline);
    setSessionLateTolerance(sched.lateToleranceMinutes);
    setSessionCheckOutStart(sched.checkOutStart);
    setSessionCheckOutEnd(sched.checkOutEnd || '18:00');
    setSessionWorkDays(sched.workDays || [1, 2, 3, 4, 5, 6]);
    setSessionRuleNotes(sched.ruleNotes || '');
    setFeedback(null);
    setIsSessionModalOpen(true);
  };

  const updateSessionTimeField = (
    schedId: string,
    field: 'checkInStart' | 'checkInDeadline' | 'checkOutStart' | 'checkOutEnd',
    val: string
  ) => {
    setSessionTimeInputs((prev) => {
      const current = prev[schedId] || {
        checkInStart: '06:00',
        checkInDeadline: '07:30',
        checkOutStart: '11:30',
        checkOutEnd: '13:00',
      };
      return {
        ...prev,
        [schedId]: {
          ...current,
          [field]: val,
        },
      };
    });
  };

  // Simpan perubahan jam sesi cepat dari kartu sesi
  const handleQuickSaveSessionTimes = (sched: Schedule) => {
    const times = sessionTimeInputs[sched.id] || {
      checkInStart: sched.checkInStart,
      checkInDeadline: sched.checkInDeadline,
      checkOutStart: sched.checkOutStart,
      checkOutEnd: sched.checkOutEnd || '18:00',
    };

    setSavingSessionId(sched.id);
    const res = updateSchedule(currentUser, sched.id, {
      checkInStart: times.checkInStart,
      checkInDeadline: times.checkInDeadline,
      checkOutStart: times.checkOutStart,
      checkOutEnd: times.checkOutEnd,
    });
    setSavingSessionId(null);
    if (res.success) {
      setFeedback({
        type: 'success',
        message: `Jam ${sched.sessionName || sched.name} berhasil disimpan! Buka Masuk: ${times.checkInStart} WIB, Batas Masuk: ${times.checkInDeadline} WIB, Buka Pulang: ${times.checkOutStart} WIB, Batas Pulang: ${times.checkOutEnd} WIB. Terhubung langsung ke HP seluruh karyawan.`,
      });
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleToggleEmployeeInSession = (userId: string, sessionId: string, currentAssigned: boolean) => {
    const res = toggleUserSession(currentUser, userId, sessionId, !currentAssigned);
    if (res.success) {
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleAssignAllEmployeesToSession = (sessionId: string) => {
    const employeeIds = users.filter((u) => u.role === 'karyawan').map((u) => u.id);
    const res = assignUsersToSession(currentUser, sessionId, employeeIds);
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleClearAllEmployeesFromSession = (sessionId: string) => {
    const res = assignUsersToSession(currentUser, sessionId, []);
    if (res.success) {
      setFeedback({ type: 'success', message: `Seluruh penugasan karyawan pada sesi ini telah dikosongkan.` });
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleSubmitSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionFormName.trim()) {
      setFeedback({ type: 'error', message: 'Nama sesi wajib diisi.' });
      return;
    }

    setIsSubmittingSession(true);
    setFeedback(null);

    if (editingSession) {
      const res = updateSchedule(currentUser, editingSession.id, {
        name: sessionFormName,
        sessionName: sessionFormSessionName,
        checkInStart: sessionCheckInStart,
        checkInDeadline: sessionCheckInDeadline,
        lateToleranceMinutes: sessionLateTolerance,
        checkOutStart: sessionCheckOutStart,
        checkOutEnd: sessionCheckOutEnd,
        workDays: sessionWorkDays,
        ruleNotes: sessionRuleNotes,
      });

      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        setIsSessionModalOpen(false);
        loadData();
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    } else {
      const res = createSchedule(currentUser, {
        name: sessionFormName,
        sessionName: sessionFormSessionName,
        checkInStart: sessionCheckInStart,
        checkInDeadline: sessionCheckInDeadline,
        lateToleranceMinutes: sessionLateTolerance,
        checkOutStart: sessionCheckOutStart,
        checkOutEnd: sessionCheckOutEnd,
        workDays: sessionWorkDays,
        ruleNotes: sessionRuleNotes,
      });

      if (res.success) {
        setFeedback({ type: 'success', message: res.message });
        setIsSessionModalOpen(false);
        loadData();
        if (res.schedule) {
          setFormScheduleId(res.schedule.id);
        }
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    }
    setIsSubmittingSession(false);
  };

  const handleDeleteSession = (sched: Schedule) => {
    if (!window.confirm(`Yakin ingin menghapus sesi "${sched.name}"?`)) return;
    const res = deleteSchedule(currentUser, sched.id);
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      loadData();
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <Users className="w-4 h-4" />
            <span>Manajemen Civitas Sekolah</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            Kelola Karyawan &amp; Sesi Presensi
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Admin dan Kepala Sekolah dapat mengetik departemen secara manual, mengatur jam buka presensi masuk dan pulang Sesi 1, 2, 3, serta memilih karyawan yang wajib presensi per sesi.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start sm:self-auto border border-slate-200/60">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'users'
                ? 'bg-white text-emerald-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Data Pegawai ({users.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sessions')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'sessions'
                ? 'bg-white text-emerald-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Jadwal Sesi &amp; Karyawan ({schedules.length})</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
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

      {/* ============================================================== */}
      {/* TAB 1: KELOLA DATA PEGAWAI & AKUN                              */}
      {/* ============================================================== */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama, NIP, username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Filter Role */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-medium"
              >
                <option value="all">Semua Peran</option>
                <option value="karyawan">Karyawan / Guru</option>
                <option value="admin">Admin Operasional</option>
              </select>

              {/* Filter Status */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-medium"
              >
                <option value="all">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openCreateUserModal('karyawan')}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Tambah Pegawai Baru</span>
              </button>
            </div>
          </div>

          {/* Tabel Pegawai */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200/80 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Pegawai / NIP</th>
                    <th className="py-3 px-4">Jabatan &amp; Unit</th>
                    <th className="py-3 px-4">Sesi Presensi Ditugaskan</th>
                    <th className="py-3 px-4">Peran</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Tidak ada data pegawai yang sesuai dengan filter pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const dept = departments.find((d) => d.id === u.departmentId);
                      const userSessions = u.assignedSessionIds && u.assignedSessionIds.length > 0
                        ? u.assignedSessionIds
                        : ['sesi-1', 'sesi-2', 'sesi-3'];

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{u.name}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              NIP: {u.nip} &bull; @{u.username}
                            </div>
                            {u.email && (
                              <div className="text-[10px] text-emerald-700 flex items-center gap-1 mt-0.5">
                                <Mail className="w-3 h-3" />
                                <span>{u.email}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800">{u.position || '-'}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              <span>{u.departmentName || u.departmentId || 'Umum'}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                              {schedules.map((sch) => {
                                const isAssigned = userSessions.includes(sch.id);
                                return (
                                  <span
                                    key={sch.id}
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                      isAssigned
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                        : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'
                                    }`}
                                  >
                                    {sch.sessionName || sch.name}
                                  </span>
                                );
                              })}
                            </div>
                            <span className="text-[10px] text-slate-400 mt-1 block">
                              Fleksibel &bull; Karyawan memilih di layar presensi
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                u.role === 'kepala_sekolah'
                                  ? 'bg-purple-100 text-purple-800'
                                  : u.role === 'admin'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {u.role === 'kepala_sekolah'
                                ? 'Kepala Sekolah'
                                : u.role === 'admin'
                                ? 'Admin'
                                : 'Karyawan / Guru'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit ${
                                u.isActive
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  u.isActive ? 'bg-emerald-500' : 'bg-rose-500'
                                }`}
                              />
                              {u.isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditUserModal(u)}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Edit Akun & Jadwal Sesi"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {u.role !== 'kepala_sekolah' && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleUserStatus(u)}
                                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                    u.isActive
                                      ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                                      : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
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
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: ATURAN SESI 1, 2, 3 FLEKSIBEL PER KARYAWAN             */}
      {/* ============================================================== */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">
          {/* Header Sesi */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-900">
                  Pengaturan Jam Mulai &amp; Pulang Sesi 1, Sesi 2, Sesi 3
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Fleksibel Per Karyawan
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Kepala Sekolah dan Admin dapat mengatur jam presensi masuk dan jam pulang untuk Sesi 1, Sesi 2, dan Sesi 3. Pada menu presensi, karyawan bebas memilih sesi yang diatur untuknya.
              </p>
            </div>

            <button
              type="button"
              onClick={openCreateSessionModal}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Sesi Tambahan</span>
            </button>
          </div>

          {/* BAGIAN 1: KARTU ATURAN JAM SESI 1, SESI 2, SESI 3 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {schedules.map((sched) => {
              const assignedCount = users.filter((u) => {
                const s = u.assignedSessionIds && u.assignedSessionIds.length > 0
                  ? u.assignedSessionIds
                  : ['sesi-1', 'sesi-2', 'sesi-3'];
                return s.includes(sched.id);
              }).length;

              return (
                <div
                  key={sched.id}
                  className="bg-white rounded-2xl border-2 border-slate-200/80 p-5 shadow-xs space-y-4 flex flex-col justify-between hover:border-emerald-500/60 transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-emerald-600 text-white shadow-2xs">
                        {sched.sessionName || sched.name}
                      </span>
                      <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                        {assignedCount} Pegawai Aktif
                      </span>
                    </div>

                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base">{sched.name}</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">{sched.ruleNotes || 'Ketentuan jam kerja harian.'}</p>
                    </div>

                    {/* Form Pengaturan Jam Presensi Masuk & Pulang */}
                    <div className="space-y-3 pt-2">
                      {/* Aturan Masuk (Format 24 Jam) */}
                      <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200/80 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold uppercase text-emerald-900 tracking-wider flex items-center gap-1">
                            <Clock className="w-3 h-3 text-emerald-700" />
                            <span>1. Jam Masuk (Format 24 Jam)</span>
                          </span>
                          <span className="text-[10px] text-emerald-800 font-bold font-mono">
                            {sessionTimeInputs[sched.id]?.checkInStart || sched.checkInStart} - {sessionTimeInputs[sched.id]?.checkInDeadline || sched.checkInDeadline} WIB
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="text-[10px] text-slate-600 font-semibold block mb-1">
                              Mulai Dibuka:
                            </label>
                            <TimeInput24
                              value={sessionTimeInputs[sched.id]?.checkInStart ?? sched.checkInStart}
                              onChange={(val) => updateSessionTimeField(sched.id, 'checkInStart', val)}
                              variant="default"
                              className="w-full"
                            />
                            <span className="text-[9px] text-slate-400 block mt-0.5">Jam buka masuk (00-23 WIB)</span>
                          </div>
                          <div>
                            <label className="text-[10px] text-emerald-900 font-semibold block mb-1">
                              Batas Tepat Waktu:
                            </label>
                            <TimeInput24
                              value={sessionTimeInputs[sched.id]?.checkInDeadline ?? sched.checkInDeadline}
                              onChange={(val) => updateSessionTimeField(sched.id, 'checkInDeadline', val)}
                              variant="emerald"
                              className="w-full"
                            />
                            <span className="text-[9px] text-emerald-600 block mt-0.5">Batas keterlambatan (00-23 WIB)</span>
                          </div>
                        </div>
                      </div>

                      {/* Aturan Pulang (Format 24 Jam) */}
                      <div className="p-3 bg-indigo-50/80 rounded-xl border border-indigo-200/80 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold uppercase text-indigo-900 tracking-wider flex items-center gap-1">
                            <Clock className="w-3 h-3 text-indigo-700" />
                            <span>2. Jam Pulang (Format 24 Jam)</span>
                          </span>
                          <span className="text-[10px] text-indigo-800 font-bold font-mono">
                            {sessionTimeInputs[sched.id]?.checkOutStart || sched.checkOutStart} - {sessionTimeInputs[sched.id]?.checkOutEnd || sched.checkOutEnd || '18:00'} WIB
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="text-[10px] text-slate-600 font-semibold block mb-1">
                              Mulai Pulang:
                            </label>
                            <TimeInput24
                              value={sessionTimeInputs[sched.id]?.checkOutStart ?? sched.checkOutStart}
                              onChange={(val) => updateSessionTimeField(sched.id, 'checkOutStart', val)}
                              variant="indigo"
                              className="w-full"
                            />
                            <span className="text-[9px] text-slate-400 block mt-0.5">Jam buka pulang (00-23 WIB)</span>
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-600 font-semibold block mb-1">
                              Batas Akhir Pulang:
                            </label>
                            <TimeInput24
                              value={sessionTimeInputs[sched.id]?.checkOutEnd ?? (sched.checkOutEnd || '18:00')}
                              onChange={(val) => updateSessionTimeField(sched.id, 'checkOutEnd', val)}
                              variant="default"
                              className="w-full"
                            />
                            <span className="text-[9px] text-slate-400 block mt-0.5">Batas akhir sesi (00-23 WIB)</span>
                          </div>
                        </div>
                      </div>
                    </div>


                    {/* PILIH NAMA KARYAWAN YANG HARUS PRESENSI DI SESI INI */}
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-slate-800 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Karyawan di {sched.sessionName || sched.name} ({assignedCount})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveExpandedSessionRoster(activeExpandedSessionRoster === sched.id ? null : sched.id);
                            setSessionEmployeeSearch('');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <UserPlus className="w-3 h-3" />
                          <span>{activeExpandedSessionRoster === sched.id ? 'Tutup Pilihan' : '+ Pilih Karyawan'}</span>
                        </button>
                      </div>

                      {/* Chip Daftar Karyawan yang Ditugaskan */}
                      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1.5 bg-slate-50 rounded-xl border border-slate-200/60">
                        {users
                          .filter((u) => {
                            const s = u.assignedSessionIds && u.assignedSessionIds.length > 0 ? u.assignedSessionIds : ['sesi-1', 'sesi-2', 'sesi-3'];
                            return u.role === 'karyawan' && s.includes(sched.id);
                          })
                          .map((u) => (
                            <span
                              key={u.id}
                              className="inline-flex items-center gap-1 text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded-md font-medium text-slate-800 shadow-2xs"
                            >
                              <span>{u.name}</span>
                              <button
                                type="button"
                                onClick={() => handleToggleEmployeeInSession(u.id, sched.id, true)}
                                className="text-slate-400 hover:text-rose-600 cursor-pointer ml-0.5"
                                title={`Hapus ${u.name} dari sesi ini`}
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </span>
                          ))}
                        {assignedCount === 0 && (
                          <span className="text-[10px] text-slate-400 italic">Belum ada karyawan yang ditugaskan ke sesi ini.</span>
                        )}
                      </div>

                      {/* Popover / Panel Pemilih Karyawan */}
                      {activeExpandedSessionRoster === sched.id && (
                        <div className="p-3 bg-white rounded-xl border-2 border-emerald-500/80 shadow-lg space-y-2.5 animate-in fade-in">
                          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-slate-100">
                            <span className="text-[11px] font-extrabold text-slate-900">
                              Centang Karyawan Wajib Presensi:
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleAssignAllEmployeesToSession(sched.id)}
                                className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-bold hover:bg-emerald-700 cursor-pointer"
                              >
                                Semua
                              </button>
                              <button
                                type="button"
                                onClick={() => handleClearAllEmployeesFromSession(sched.id)}
                                className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-bold hover:bg-slate-200 cursor-pointer"
                              >
                                Kosongkan
                              </button>
                            </div>
                          </div>

                          <div className="relative">
                            <Search className="w-3 h-3 absolute left-2.5 top-2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Cari nama karyawan..."
                              value={sessionEmployeeSearch}
                              onChange={(e) => setSessionEmployeeSearch(e.target.value)}
                              className="w-full pl-7 pr-2 py-1 rounded-lg border border-slate-200 text-[11px] focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                            />
                          </div>

                          <div className="max-h-40 overflow-y-auto space-y-1 pr-1 divide-y divide-slate-100">
                            {users
                              .filter((u) => u.role === 'karyawan')
                              .filter((u) => !sessionEmployeeSearch || u.name.toLowerCase().includes(sessionEmployeeSearch.toLowerCase()))
                              .map((u) => {
                                const userSessions = u.assignedSessionIds && u.assignedSessionIds.length > 0 ? u.assignedSessionIds : ['sesi-1', 'sesi-2', 'sesi-3'];
                                const isAssigned = userSessions.includes(sched.id);
                                const dept = departments.find((d) => d.id === u.departmentId);

                                return (
                                  <label
                                    key={u.id}
                                    className="flex items-center justify-between p-1.5 hover:bg-emerald-50/60 rounded-lg cursor-pointer transition-colors"
                                  >
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={isAssigned}
                                        onChange={() => handleToggleEmployeeInSession(u.id, sched.id, isAssigned)}
                                        className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                      />
                                      <div>
                                        <div className="text-[11px] font-bold text-slate-800">{u.name}</div>
                                        <div className="text-[9px] text-slate-400">
                                          {dept ? dept.name : 'Umum'} &bull; NIP: {u.nip}
                                        </div>
                                      </div>
                                    </div>
                                    <span
                                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                        isAssigned ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'
                                      }`}
                                    >
                                      {isAssigned ? 'Wajib' : 'Tidak'}
                                    </span>
                                  </label>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tombol Simpan Jam Sesi */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openEditSessionModal(sched)}
                      className="text-xs text-slate-500 hover:text-slate-800 underline font-semibold cursor-pointer"
                    >
                      Atur Lengkap
                    </button>
                    <button
                      type="button"
                      disabled={savingSessionId === sched.id}
                      onClick={() => handleQuickSaveSessionTimes(sched)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{savingSessionId === sched.id ? 'Menyimpan...' : 'Simpan Jam Sesi'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* BAGIAN 2: MATRIKS PENUGASAN SESI FLEKSIBEL PER KARYAWAN */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>Matriks Fleksibilitas Sesi Per Karyawan</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Centang sesi (Sesi 1, Sesi 2, Sesi 3) yang berlaku untuk masing-masing karyawan. Perubahan langsung aktif di layar HP karyawan.
                </p>
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                Otomatis Sinkron Cloud
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200/80 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Nama Pegawai &amp; NIP</th>
                    <th className="py-3 px-4">Departemen</th>
                    {schedules.map((s) => (
                      <th key={s.id} className="py-3 px-4 text-center">
                        <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">
                          {s.sessionName || s.name}
                        </span>
                        <div className="text-[9px] text-slate-400 font-normal lowercase mt-0.5">
                          {s.checkInDeadline} &bull; {s.checkOutStart}
                        </div>
                      </th>
                    ))}
                    <th className="py-3 px-4 text-right">Status Penugasan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => {
                    const dept = departments.find((d) => d.id === u.departmentId);
                    const userSessions = u.assignedSessionIds && u.assignedSessionIds.length > 0
                      ? u.assignedSessionIds
                      : ['sesi-1', 'sesi-2', 'sesi-3'];

                    return (
                      <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{u.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            NIP: {u.nip} &bull; {u.position}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-slate-700 font-medium">
                            {u.departmentName || u.departmentId || '-'}
                          </span>
                        </td>
                        {schedules.map((s) => {
                          const isChecked = userSessions.includes(s.id);
                          return (
                            <td key={s.id} className="py-3 px-4 text-center">
                              <label className="inline-flex items-center justify-center cursor-pointer p-1">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleUserSessionQuick(u, s.id)}
                                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                                />
                              </label>
                            </td>
                          );
                        })}
                        <td className="py-3 px-4 text-right">
                          <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            {userSessions.length} Sesi Terbuka
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL USER / PEGAWAI                                           */}
      {/* ============================================================== */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    {editingUser ? 'Edit Data Pegawai & Sesi' : 'Tambah Pegawai Baru'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Lengkapi identitas, departemen, dan pilihan sesi presensi pegawai.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitUserForm} className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* NIP */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    NIP / No. Induk <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formNip}
                    onChange={(e) => setFormNip(e.target.value)}
                    placeholder="Contoh: 19900415..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Peran */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Peran Akun <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-medium"
                  >
                    <option value="karyawan">Karyawan / Guru / Staf</option>
                    <option value="admin">Admin Operasional</option>
                  </select>
                </div>
              </div>

              {/* Nama Lengkap */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nama Lengkap &amp; Gelar <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Siti Rahmawati, S.Pd."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Username & Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Username Login <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="sitirahma"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    {editingUser ? 'Reset Password (Opsional)' : 'Password Awal'} {!editingUser && <span className="text-rose-500">*</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showFormPassword ? 'text' : 'password'}
                      required={!editingUser}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder={editingUser ? 'Ketik jika ingin ubah...' : 'Minimal 6 karakter'}
                      className="w-full pl-3 pr-10 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFormPassword(!showFormPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      tabIndex={-1}
                      title={showFormPassword ? 'Sembunyikan password' : 'Lihat password'}
                    >
                      {showFormPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>


              {/* Jabatan & Departemen Manual */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Jabatan / Posisi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formPosition}
                    onChange={(e) => setFormPosition(e.target.value)}
                    placeholder="Guru Matematika"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Departemen / Bidang (Ketik Manual)
                  </label>
                  <input
                    type="text"
                    value={formDepartmentName}
                    onChange={(e) => {
                      setFormDepartmentName(e.target.value);
                      setFormDepartmentId(e.target.value);
                    }}
                    placeholder="Contoh: Guru, Tata Usaha, Keamanan, Dapur"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Admin &amp; Kepala Sekolah mengetik departemen secara manual.
                  </p>
                </div>
              </div>

              {/* SESI FLEKSIBEL PER KARYAWAN: CHECKBOXES SESI 1, SESI 2, SESI 3 */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span>Sesi Presensi yang Berlaku untuk Karyawan Ini:</span>
                  </label>
                  <span className="text-[10px] text-emerald-700 font-bold">
                    Fleksibel Per Pegawai
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Pilih sesi yang dapat diambil oleh karyawan ini saat presensi masuk &amp; pulang:
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {schedules.map((sch) => {
                    const isChecked = formAssignedSessionIds.includes(sch.id);
                    return (
                      <button
                        key={sch.id}
                        type="button"
                        onClick={() => toggleSessionInUserForm(sch.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                          isChecked
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] border ${
                          isChecked ? 'bg-white text-emerald-700 border-white' : 'border-slate-400'
                        }`}>
                          {isChecked && '✓'}
                        </span>
                        <span>{sch.sessionName || sch.name}</span>
                        <span className={`text-[10px] font-mono ${isChecked ? 'text-emerald-100' : 'text-slate-400'}`}>
                          ({sch.checkInDeadline})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="email@sekolah.sch.id"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    No. WhatsApp/HP
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="081234567890"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  disabled={isSubmittingUser}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUser}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingUser ? 'Menyimpan...' : editingUser ? 'Perbarui Pegawai' : 'Simpan Pegawai'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL SESI PRESENSI MANUAL                                     */}
      {/* ============================================================== */}
      {isSessionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    {editingSession ? 'Edit Detail Sesi Presensi' : 'Tambah Form Sesi Presensi Baru'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Atur jam buka masuk, batas tepat waktu, dan jam pulang sesi presensi.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSessionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitSession} className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Label Nama Sesi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={sessionFormName}
                    onChange={(e) => setSessionFormName(e.target.value)}
                    placeholder="Contoh: Sesi 1 (Pagi)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Nama Singkat Sesi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={sessionFormSessionName}
                    onChange={(e) => setSessionFormSessionName(e.target.value)}
                    placeholder="Contoh: Sesi 1 / Sesi 2 / Sesi 3"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-bold"
                  />
                </div>
              </div>

              {/* Aturan Masuk */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider block">
                    Aturan Jam Presensi Masuk (Format 24 Jam)
                  </span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    24 Jam (00-23 WIB)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Jam Buka Masuk
                    </label>
                    <TimeInput24
                      value={sessionCheckInStart}
                      onChange={setSessionCheckInStart}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Batas Tepat Waktu
                    </label>
                    <TimeInput24
                      value={sessionCheckInDeadline}
                      onChange={setSessionCheckInDeadline}
                      className="border-emerald-300 text-emerald-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Toleransi (Menit)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={sessionLateTolerance}
                      onChange={(e) => setSessionLateTolerance(Number(e.target.value))}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-mono font-bold bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Aturan Pulang */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-indigo-900 uppercase tracking-wider block">
                    Aturan Jam Presensi Pulang (Format 24 Jam)
                  </span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full">
                    24 Jam (00-23 WIB)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Mulai Buka Pulang
                    </label>
                    <TimeInput24
                      value={sessionCheckOutStart}
                      onChange={setSessionCheckOutStart}
                      className="border-indigo-300 text-indigo-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Batas Akhir Pulang
                    </label>
                    <TimeInput24
                      value={sessionCheckOutEnd}
                      onChange={setSessionCheckOutEnd}
                    />
                  </div>
                </div>
              </div>

              {/* Catatan Sesi */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Catatan Sesi / Petunjuk untuk Karyawan
                </label>
                <input
                  type="text"
                  value={sessionRuleNotes}
                  onChange={(e) => setSessionRuleNotes(e.target.value)}
                  placeholder="Contoh: Sesi pagi kedatangan seluruh guru..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSessionModalOpen(false)}
                  disabled={isSubmittingSession}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSession}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingSession ? 'Menyimpan...' : editingSession ? 'Perbarui Sesi' : 'Simpan Sesi Presensi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
