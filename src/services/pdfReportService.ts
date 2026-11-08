/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { User, AttendanceRecord, AppSettings, Department, DailyAttendancePair } from '../types';
import { groupAttendanceByDateAndUser, getAppSettings, getAllUsers, getAllDepartments } from './storage';

export interface GeneratePdfOptions {
  settings?: AppSettings;
  records: AttendanceRecord[];
  targetUser?: User | null; // Jika null/undefined, maka unduh laporan rekap seluruh staf
  allUsers?: User[];
  departments?: Department[];
  startDate?: string;
  endDate?: string;
  periodLabel?: string; // e.g. 'Harian', 'Pekan Ini', 'Bulanan'
  ksUser?: User | null;
}

/**
 * Menghasilkan file PDF resmi dengan format KOP Surat Sekolah dan tanda tangan pimpinan
 */
export function generateAttendancePdfReport(options: GeneratePdfOptions): void;
export function generateAttendancePdfReport(
  targetUser: User | null | undefined,
  records: AttendanceRecord[],
  periodKeyOrLabel?: string
): void;
export function generateAttendancePdfReport(
  userOrOptions: User | null | undefined | GeneratePdfOptions,
  recordsArg?: AttendanceRecord[],
  periodArg?: string
): void {
  let settings: AppSettings;
  let records: AttendanceRecord[];
  let targetUser: User | null | undefined;
  let allUsers: User[];
  let departments: Department[];
  let startDate: string;
  let endDate: string;
  let periodLabel: string | undefined;
  let ksUser: User | null | undefined;

  // Cek apakah argumen pertama adalah options object
  if (userOrOptions && typeof userOrOptions === 'object' && 'records' in userOrOptions && Array.isArray((userOrOptions as any).records)) {
    const opts = userOrOptions as GeneratePdfOptions;
    settings = opts.settings || getAppSettings();
    records = opts.records;
    targetUser = opts.targetUser;
    allUsers = opts.allUsers || getAllUsers();
    departments = opts.departments || getAllDepartments();
    startDate = opts.startDate || '';
    endDate = opts.endDate || '';
    periodLabel = opts.periodLabel;
    ksUser = opts.ksUser || allUsers.find((u) => u.role === 'kepala_sekolah');
  } else {
    settings = getAppSettings();
    records = recordsArg || [];
    targetUser = userOrOptions as User | null | undefined;
    allUsers = getAllUsers();
    departments = getAllDepartments();
    startDate = '';
    endDate = '';
    periodLabel = periodArg === 'hari_ini' || periodArg === 'today'
      ? 'Harian'
      : periodArg === 'minggu_ini' || periodArg === 'week'
      ? 'Pekan Ini'
      : periodArg === 'bulan_ini' || periodArg === 'month'
      ? 'Bulanan'
      : periodArg || 'Rekapitulasi Kehadiran';
    ksUser = allUsers.find((u) => u.role === 'kepala_sekolah');
  }

  // Filter records jika targetUser dispesifikasikan
  const effectiveRecords = targetUser
    ? records.filter((r) => r.userId === targetUser.id)
    : records;

  const paired = groupAttendanceByDateAndUser(effectiveRecords);

  // Buat dokumen PDF (Orientasi: Landscape jika seluruh staf agar kolom muat, Portrait jika individu)
  const orientation = targetUser ? 'p' : 'l';
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. KOP SURAT RESMI SEKOLAH
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20, 30, 45);

  const schoolTitle = (settings.schoolName || 'SMA NEGERI 1 PRESTASI').toUpperCase();
  doc.text(schoolTitle, pageWidth / 2, 16, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(70, 80, 95);
  doc.text(settings.schoolAddress || 'Jl. Pendidikan No. 45, Kompleks Akademika', pageWidth / 2, 21, {
    align: 'center',
  });

  const contactLine = `Email: ${settings.schoolEmail || 'kepsek@sekolah.sch.id'} | Sistem: ${settings.appTitle || 'KITARAJIN Presensi'}`;
  doc.text(contactLine, pageWidth / 2, 26, { align: 'center' });

  // Garis ganda Kop Surat
  doc.setDrawColor(20, 30, 45);
  doc.setLineWidth(0.8);
  doc.line(14, 29, pageWidth - 14, 29);
  doc.setLineWidth(0.2);
  doc.line(14, 30, pageWidth - 14, 30);

  // 2. JUDUL DOKUMEN & PERIODE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);

  let docTitle = 'LAPORAN REKAPITULASI KEHADIRAN SELURUH CIVITAS SEKOLAH';
  if (targetUser) {
    if (targetUser.role === 'kepala_sekolah') {
      docTitle = 'LAPORAN REKAPITULASI PRESENSI KEPALA SEKOLAH';
    } else if (targetUser.role === 'admin') {
      docTitle = 'LAPORAN REKAPITULASI PRESENSI ADMIN OPERASIONAL';
    } else {
      docTitle = 'LAPORAN REKAPITULASI PRESENSI KARYAWAN & TENDIK';
    }
  }

  doc.text(docTitle, pageWidth / 2, 37, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 90, 105);
  const periodText = periodLabel
    ? `Rekapitulasi ${periodLabel} • Periode: ${startDate} s/d ${endDate}`
    : `Periode: ${startDate} s/d ${endDate}`;
  doc.text(periodText, pageWidth / 2, 42, { align: 'center' });

  let startY = 47;

  // 3. INFORMASI PEGAWAI (Jika unduh per orang)
  if (targetUser) {
    const dept = departments.find((d) => d.id === targetUser.departmentId);
    const deptName = targetUser.departmentName || dept?.name || '-';

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, startY, pageWidth - 28, 20, 2, 2, 'FD');

    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);

    // Kolom kiri
    doc.setFont('helvetica', 'bold');
    doc.text('Nama Pegawai:', 18, startY + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(targetUser.name, 45, startY + 6);

    doc.setFont('helvetica', 'bold');
    doc.text('NIP / ID:', 18, startY + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(targetUser.nip || '-', 45, startY + 12);

    doc.setFont('helvetica', 'bold');
    doc.text('Peran Akun:', 18, startY + 18);
    doc.setFont('helvetica', 'normal');
    const roleLabel =
      targetUser.role === 'kepala_sekolah'
        ? 'Kepala Sekolah (Super Admin)'
        : targetUser.role === 'admin'
        ? 'Admin Operasional'
        : 'Karyawan / Guru / Staf';
    doc.text(roleLabel, 45, startY + 18);

    // Kolom kanan
    const colRight = (pageWidth / 2) + 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Jabatan / Posisi:', colRight, startY + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(targetUser.position || '-', colRight + 30, startY + 6);

    doc.setFont('helvetica', 'bold');
    doc.text('Unit / Departemen:', colRight, startY + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(deptName, colRight + 30, startY + 12);

    doc.setFont('helvetica', 'bold');
    doc.text('No. Kontak:', colRight, startY + 18);
    doc.setFont('helvetica', 'normal');
    doc.text(targetUser.phone || targetUser.email || '-', colRight + 30, startY + 18);

    startY += 24;
  }

  // 4. STATISTIK RINGKAS
  const totalMasuk = effectiveRecords.filter((r) => r.type === 'masuk').length;
  const tepatWaktu = effectiveRecords.filter((r) => r.type === 'masuk' && r.status === 'tepat_waktu').length;
  const terlambat = effectiveRecords.filter((r) => r.type === 'masuk' && r.status === 'terlambat').length;
  const persen = totalMasuk > 0 ? Math.round((tepatWaktu / totalMasuk) * 100) : 100;

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  const statText = `Total Presensi Masuk: ${totalMasuk} | Tepat Waktu: ${tepatWaktu} (${persen}%) | Terlambat: ${terlambat} | Total Catatan: ${effectiveRecords.length}`;
  doc.text(statText, 14, startY);
  startY += 4;

  // 5. TABEL DAFTAR TRANSAKSI PRESENSI
  let tableHead: string[][];
  let tableBody: string[][];

  if (targetUser) {
    // Mode Per Karyawan (Portrait)
    tableHead = [
      ['No', 'Tanggal', 'Sesi', 'Presensi Masuk', 'Presensi Pulang', 'Durasi', 'Verifikasi'],
    ];

    tableBody = paired.map((p, index) => {
      const masukTime = p.masukRecord
        ? new Date(p.masukRecord.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '-';
      const masukStatus = p.masukRecord ? ` (${p.masukRecord.status.replace('_', ' ')})` : '';

      const pulangTime = p.pulangRecord
        ? new Date(p.pulangRecord.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '-';
      const pulangStatus = p.pulangRecord ? ` (${p.pulangRecord.status.replace('_', ' ')})` : '';

      let durasi = '-';
      if (p.masukRecord && p.pulangRecord) {
        const diffMs = new Date(p.pulangRecord.timestamp).getTime() - new Date(p.masukRecord.timestamp).getTime();
        if (diffMs > 0) {
          const h = Math.floor(diffMs / 3600000);
          const m = Math.floor((diffMs % 3600000) / 60000);
          durasi = `${h}j ${m}m`;
        }
      }

      const sesi = p.masukRecord?.sessionName || p.pulangRecord?.sessionName || 'Sesi 1';
      const gpsDistance = p.masukRecord?.distanceFromLocationMeters ? `${p.masukRecord.distanceFromLocationMeters}m` : '-';
      const faceScore = p.masukRecord?.faceSimilarityScore ? `${Math.round(p.masukRecord.faceSimilarityScore * 100)}%` : '-';
      const verif = p.masukRecord ? `GPS: ${gpsDistance} | Face: ${faceScore}` : '-';

      return [
        String(index + 1),
        p.date,
        sesi,
        `${masukTime}${masukStatus}`,
        `${pulangTime}${pulangStatus}`,
        durasi,
        verif,
      ];
    });
  } else {
    // Mode Seluruh Civitas (Landscape)
    tableHead = [
      ['No', 'Tanggal', 'Nama Pegawai', 'NIP', 'Peran', 'Sesi', 'Masuk', 'Pulang', 'Durasi', 'Status Kehadiran', 'Jarak GPS'],
    ];

    tableBody = paired.map((p, index) => {
      const masukTime = p.masukRecord
        ? new Date(p.masukRecord.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '-';
      const pulangTime = p.pulangRecord
        ? new Date(p.pulangRecord.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '-';

      let durasi = '-';
      if (p.masukRecord && p.pulangRecord) {
        const diffMs = new Date(p.pulangRecord.timestamp).getTime() - new Date(p.masukRecord.timestamp).getTime();
        if (diffMs > 0) {
          const h = Math.floor(diffMs / 3600000);
          const m = Math.floor((diffMs % 3600000) / 60000);
          durasi = `${h}j ${m}m`;
        }
      }

      const status = p.masukRecord
        ? p.masukRecord.status.replace('_', ' ').toUpperCase()
        : p.pulangRecord
        ? 'PULANG SAJA'
        : 'BELUM ABSEN';

      const sesi = p.masukRecord?.sessionName || p.pulangRecord?.sessionName || 'Sesi 1';
      const gps = p.masukRecord?.distanceFromLocationMeters ? `${p.masukRecord.distanceFromLocationMeters}m` : '-';

      return [
        String(index + 1),
        p.date,
        p.userName,
        p.nip || '-',
        p.role,
        sesi,
        masukTime,
        pulangTime,
        durasi,
        status,
        gps,
      ];
    });
  }

  autoTable(doc, {
    startY,
    head: tableHead,
    body: tableBody.length > 0 ? tableBody : [['-', '-', 'Belum ada catatan presensi pada periode ini', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: [5, 150, 105], // emerald-600
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'center' },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      // Footer Nomor Halaman
      const currentPg = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Dicetak otomatis dari Sistem ${settings.appTitle || 'KITARAJIN'} | Halaman ${currentPg}`,
        14,
        pageHeight - 8
      );
    },
  });

  // 6. LEMBAR PENGESAHAN KEPALA SEKOLAH
  const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : startY + 50;

  // Cek apakah sisa halaman cukup untuk tanda tangan (perlu minimal 35mm)
  if (finalY + 35 > pageHeight) {
    doc.addPage();
  }

  const signY = (doc as any).lastAutoTable && finalY + 35 <= pageHeight ? finalY : 20;
  const signX = pageWidth - 75;

  const todayStrIndo = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.text(`Ditetapkan di: Sekolah`, signX, signY);
  doc.text(`Pada tanggal: ${todayStrIndo}`, signX, signY + 5);

  doc.setFont('helvetica', 'bold');
  doc.text('Mengetahui / Mengesahkan,', signX, signY + 11);
  doc.text('Kepala Sekolah', signX, signY + 16);

  // Ruang tanda tangan digital
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(signX, signY + 18, 48, 14, 1, 1, 'FD');
  doc.setFontSize(7);
  doc.setTextColor(5, 150, 105);
  doc.text('[TERVERIFIKASI SISTEM DIGITAL]', signX + 4, signY + 26);

  // Nama & NIP KS
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  const ksNameStr = ksUser?.name || 'Kepala Sekolah';
  const ksNipStr = ksUser?.nip ? `NIP. ${ksUser.nip}` : 'NIP. -';
  doc.text(ksNameStr, signX, signY + 37);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(ksNipStr, signX, signY + 42);

  // 7. DOWNLOAD FILE PDF
  const cleanName = targetUser
    ? targetUser.name.replace(/[^a-zA-Z0-9]/g, '_')
    : 'Seluruh_Civitas';
  const fileName = `Laporan_Presensi_${cleanName}_${startDate}_sd_${endDate}.pdf`;
  doc.save(fileName);
}
