/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, AttendanceRecord, AppSettings, Department } from '../types';
import { groupAttendanceByDateAndUser, getAppSettings, getAllDepartments, getAllUsers } from './storage';

export interface PrintReportOptions {
  settings?: AppSettings;
  records: AttendanceRecord[];
  targetUser?: User | null;
  departments?: Department[];
  startDate?: string;
  endDate?: string;
  periodLabel?: string;
  ksUser?: User | null;
}

/**
 * Mencetak lembar dokumen resmi riwayat presensi (KOP Surat, Rincian, & Tanda Tangan),
 * BUKAN mencetak tampilan UI/aplikasi web.
 */
export function printAttendanceDocument(options: PrintReportOptions): void;
export function printAttendanceDocument(
  records: AttendanceRecord[],
  periodLabel?: string,
  targetUser?: User | null
): void;
export function printAttendanceDocument(
  recordsOrOptions: AttendanceRecord[] | PrintReportOptions,
  periodLabelArg?: string,
  targetUserArg?: User | null
): void {
  let settings: AppSettings;
  let records: AttendanceRecord[];
  let targetUser: User | null | undefined;
  let departments: Department[];
  let startDate: string;
  let endDate: string;
  let periodLabel: string | undefined;
  let ksUser: User | null | undefined;

  if (Array.isArray(recordsOrOptions)) {
    settings = getAppSettings();
    records = recordsOrOptions;
    periodLabel = periodLabelArg || 'Rekapitulasi Presensi';
    targetUser = targetUserArg;
    departments = getAllDepartments();
    startDate = '';
    endDate = '';
    const users = getAllUsers();
    ksUser = users.find((u) => u.role === 'kepala_sekolah');
  } else {
    settings = recordsOrOptions.settings || getAppSettings();
    records = recordsOrOptions.records;
    targetUser = recordsOrOptions.targetUser;
    departments = recordsOrOptions.departments || getAllDepartments();
    startDate = recordsOrOptions.startDate || '';
    endDate = recordsOrOptions.endDate || '';
    periodLabel = recordsOrOptions.periodLabel;
    const users = getAllUsers();
    ksUser = recordsOrOptions.ksUser || users.find((u) => u.role === 'kepala_sekolah');
  }

  const effectiveRecords = targetUser
    ? records.filter((r) => r.userId === targetUser.id)
    : records;

  const paired = groupAttendanceByDateAndUser(effectiveRecords);

  const schoolName = settings.schoolName || 'SMA NEGERI 1 PRESTASI';
  const schoolAddress = settings.schoolAddress || 'Jl. Pendidikan No. 45, Kompleks Akademika';
  const schoolEmail = settings.schoolEmail || 'kepsek@sekolah.sch.id';
  const appTitle = settings.appTitle || 'KITARAJIN Presensi';

  let docTitle = 'LAPORAN REKAPITULASI PRESENSI CIVITAS SEKOLAH';
  if (targetUser) {
    if (targetUser.role === 'kepala_sekolah') {
      docTitle = 'LAPORAN REKAPITULASI PRESENSI KEPALA SEKOLAH';
    } else if (targetUser.role === 'admin') {
      docTitle = 'LAPORAN REKAPITULASI PRESENSI ADMIN OPERASIONAL';
    } else {
      docTitle = 'LAPORAN REKAPITULASI PRESENSI KARYAWAN & TENDIK';
    }
  }

  const totalMasuk = effectiveRecords.filter((r) => r.type === 'masuk').length;
  const tepatWaktu = effectiveRecords.filter((r) => r.type === 'masuk' && r.status === 'tepat_waktu').length;
  const terlambat = effectiveRecords.filter((r) => r.type === 'masuk' && r.status === 'terlambat').length;
  const persen = totalMasuk > 0 ? Math.round((tepatWaktu / totalMasuk) * 100) : 100;

  let tableRowsHtml = '';
  paired.forEach((p, idx) => {
    const masukTime = p.masukRecord
      ? new Date(p.masukRecord.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
      : '-';
    const masukStatus = p.masukRecord
      ? p.masukRecord.status === 'tepat_waktu'
        ? 'Tepat Waktu'
        : 'Terlambat'
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

    const sesi = p.masukRecord?.sessionName || p.pulangRecord?.sessionName || 'Sesi 1';
    const gpsDistance = p.masukRecord?.distanceFromLocationMeters ? `${p.masukRecord.distanceFromLocationMeters}m` : '-';
    const faceScore = p.masukRecord?.faceSimilarityScore ? `${Math.round(p.masukRecord.faceSimilarityScore * 100)}%` : '-';

    tableRowsHtml += `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td style="text-align: center;">${p.date}</td>
        ${!targetUser ? `<td><strong>${p.userName}</strong><br/><small style="color: #64748b;">NIP: ${p.nip || '-'}</small></td>` : ''}
        <td style="text-align: center; font-weight: 600;">${sesi}</td>
        <td style="text-align: center;">${masukTime} <small>(${masukStatus})</small></td>
        <td style="text-align: center;">${pulangTime}</td>
        <td style="text-align: center; font-weight: bold;">${durasi}</td>
        <td style="text-align: center; font-size: 9px; color: #475569;">GPS: ${gpsDistance} | Face: ${faceScore}</td>
      </tr>
    `;
  });

  const todayStrIndo = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const printHtml = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8" />
        <title>${docTitle}</title>
        <style>
          @page {
            size: auto;
            margin: 12mm 15mm 15mm 15mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 0;
            background: #ffffff;
            font-size: 11px;
            line-height: 1.4;
          }
          .kop-container {
            text-align: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 8px;
            margin-bottom: 15px;
          }
          .kop-container h1 {
            font-size: 16px;
            font-weight: 800;
            margin: 0 0 4px 0;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .kop-container p {
            margin: 2px 0;
            font-size: 10px;
            color: #475569;
          }
          .doc-header {
            text-align: center;
            margin-bottom: 12px;
          }
          .doc-header h2 {
            font-size: 13px;
            font-weight: bold;
            margin: 0 0 3px 0;
            text-transform: uppercase;
          }
          .doc-header p {
            margin: 0;
            font-size: 10px;
            color: #64748b;
          }
          .profile-box {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 8px 12px;
            margin-bottom: 12px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
            font-size: 10px;
          }
          .profile-box div strong {
            color: #334155;
          }
          .summary-bar {
            background-color: #ecfdf5;
            border: 1px solid #a7f3d0;
            border-radius: 6px;
            padding: 6px 10px;
            margin-bottom: 12px;
            font-size: 10px;
            font-weight: bold;
            color: #065f46;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            margin-bottom: 20px;
          }
          th {
            background-color: #f1f5f9;
            border: 1px solid #cbd5e1;
            padding: 6px 4px;
            font-weight: bold;
            text-align: center;
            color: #1e293b;
          }
          td {
            border: 1px solid #e2e8f0;
            padding: 5px 4px;
          }
          tr:nth-child(even) {
            background-color: #f8fafc;
          }
          .signature-section {
            display: flex;
            justify-content: flex-end;
            margin-top: 20px;
            page-break-inside: avoid;
          }
          .signature-box {
            width: 220px;
            text-align: center;
            font-size: 10px;
          }
          .signature-stamp {
            border: 1px dashed #94a3b8;
            background-color: #f8fafc;
            border-radius: 4px;
            padding: 10px 4px;
            margin: 8px auto;
            color: #059669;
            font-weight: bold;
            font-size: 8px;
            letter-spacing: 0.5px;
          }
          .footer-note {
            margin-top: 30px;
            border-top: 1px solid #e2e8f0;
            padding-top: 6px;
            font-size: 8px;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
          }
        </style>
      </head>
      <body>
        <!-- KOP SURAT SEKOLAH -->
        <div class="kop-container">
          <h1>${schoolName}</h1>
          <p>${schoolAddress}</p>
          <p>Email: ${schoolEmail} &bull; Sistem Presensi: ${appTitle}</p>
        </div>

        <!-- JUDUL DOKUMEN -->
        <div class="doc-header">
          <h2>${docTitle}</h2>
          <p>${periodLabel ? `${periodLabel} &bull; ` : ''}Periode: ${startDate} s/d ${endDate}</p>
        </div>

        <!-- INFORMASI PEGAWAI JIKA PER INDIVIDU -->
        ${targetUser ? `
          <div class="profile-box">
            <div><strong>Nama Pegawai:</strong> ${targetUser.name}</div>
            <div><strong>Jabatan:</strong> ${targetUser.position || '-'}</div>
            <div><strong>NIP / Identitas:</strong> ${targetUser.nip || '-'}</div>
            <div><strong>Departemen:</strong> ${targetUser.departmentName || targetUser.departmentId || '-'}</div>
            <div><strong>Peran Akun:</strong> ${targetUser.role.toUpperCase()}</div>
            <div><strong>Kontak:</strong> ${targetUser.phone || targetUser.email || '-'}</div>
          </div>
        ` : ''}

        <!-- RINGKASAN STATISTIK -->
        <div class="summary-bar">
          Ringkasan: Hadir Masuk: ${totalMasuk} | Tepat Waktu: ${tepatWaktu} (${persen}%) | Terlambat: ${terlambat} | Total Baris Transaksi: ${paired.length}
        </div>

        <!-- TABEL RINCIAN PRESENSI -->
        <table>
          <thead>
            <tr>
              <th style="width: 25px;">No</th>
              <th style="width: 75px;">Tanggal</th>
              ${!targetUser ? '<th>Pegawai / NIP</th>' : ''}
              <th style="width: 65px;">Sesi</th>
              <th style="width: 100px;">Absen Masuk</th>
              <th style="width: 85px;">Absen Pulang</th>
              <th style="width: 65px;">Durasi</th>
              <th style="width: 120px;">Verifikasi GPS & Wajah</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml || '<tr><td colspan="7" style="text-align: center; padding: 15px; color: #94a3b8;">Tidak ada data presensi pada rentang periode ini.</td></tr>'}
          </tbody>
        </table>

        <!-- PENGESAHAN KEPALA SEKOLAH -->
        <div class="signature-section">
          <div class="signature-box">
            <div>Ditetapkan di: Sekolah</div>
            <div>Pada tanggal: ${todayStrIndo}</div>
            <div style="font-weight: bold; margin-top: 4px;">Mengetahui &amp; Mengesahkan,</div>
            <div style="font-weight: bold;">Kepala Sekolah</div>

            <div class="signature-stamp">
              [TERVERIFIKASI SISTEM DIGITAL]
            </div>

            <div style="font-weight: bold; text-decoration: underline;">
              ${ksUser?.name || 'Kepala Sekolah'}
            </div>
            <div style="color: #64748b;">
              ${ksUser?.nip ? `NIP. ${ksUser.nip}` : 'NIP. -'}
            </div>
          </div>
        </div>

        <!-- CATATAN KAKI -->
        <div class="footer-note">
          <span>Dicetak otomatis dari Sistem ${appTitle}</span>
          <span>Halaman 1</span>
        </div>
      </body>
    </html>
  `;

  // Gunakan Iframe tersembunyi agar browser hanya mencetak lembar dokumen, BUKAN halaman aplikasi
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(printHtml);
  doc.close();

  iframe.contentWindow?.focus();
  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1500);
  }, 400);
}
