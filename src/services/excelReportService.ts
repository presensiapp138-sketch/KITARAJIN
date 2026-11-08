/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, AttendanceRecord, AppSettings, Department } from '../types';
import { groupAttendanceByDateAndUser, getAppSettings, getAllDepartments } from './storage';

export interface ExcelExportOptions {
  settings?: AppSettings;
  records: AttendanceRecord[];
  targetUser?: User | null;
  departments?: Department[];
  startDate?: string;
  endDate?: string;
  periodLabel?: string;
}

/**
 * Menghasilkan file Excel (.xls) berformat tabel rapi, lengkap dengan Kop Sekolah,
 * warna header, border tabel, dan pemformatan teks NIP agar tidak menjadi notasi ilmiah (1.99E+17)
 */
export function exportAttendanceToExcel(options: ExcelExportOptions): void;
export function exportAttendanceToExcel(
  records: AttendanceRecord[],
  periodLabel?: string,
  targetUser?: User | null
): void;
export function exportAttendanceToExcel(
  recordsOrOptions: AttendanceRecord[] | ExcelExportOptions,
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

  if (Array.isArray(recordsOrOptions)) {
    settings = getAppSettings();
    records = recordsOrOptions;
    periodLabel = periodLabelArg || 'Rekapitulasi Presensi';
    targetUser = targetUserArg;
    departments = getAllDepartments();
    startDate = '';
    endDate = '';
  } else {
    settings = recordsOrOptions.settings || getAppSettings();
    records = recordsOrOptions.records;
    targetUser = recordsOrOptions.targetUser;
    departments = recordsOrOptions.departments || getAllDepartments();
    startDate = recordsOrOptions.startDate || '';
    endDate = recordsOrOptions.endDate || '';
    periodLabel = recordsOrOptions.periodLabel;
  }

  const effectiveRecords = targetUser
    ? records.filter((r) => r.userId === targetUser.id)
    : records;

  const paired = groupAttendanceByDateAndUser(effectiveRecords);

  const schoolName = settings.schoolName || 'SMA NEGERI 1 PRESTASI';
  const schoolAddress = settings.schoolAddress || 'Jl. Pendidikan No. 45';
  const appTitle = settings.appTitle || 'KITARAJIN Presensi';

  const docTitle = targetUser
    ? `LAPORAN PRESENSI INDIVIDU - ${targetUser.name.toUpperCase()} (${targetUser.nip})`
    : `LAPORAN REKAPITULASI PRESENSI CIVITAS SEKOLAH`;

  const totalMasuk = effectiveRecords.filter((r) => r.type === 'masuk').length;
  const tepatWaktu = effectiveRecords.filter((r) => r.type === 'masuk' && r.status === 'tepat_waktu').length;
  const terlambat = effectiveRecords.filter((r) => r.type === 'masuk' && r.status === 'terlambat').length;
  const persen = totalMasuk > 0 ? Math.round((tepatWaktu / totalMasuk) * 100) : 100;

  // Bangun konten HTML Spreadsheet yang kompatibel 100% dengan Microsoft Excel & Google Sheets
  let tableRowsHtml = '';

  paired.forEach((p, idx) => {
    const masukTime = p.masukRecord
      ? new Date(p.masukRecord.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
      : '-';
    const masukStatus = p.masukRecord
      ? p.masukRecord.status === 'tepat_waktu'
        ? 'TEPAT WAKTU'
        : 'TERLAMBAT'
      : '-';

    const pulangTime = p.pulangRecord
      ? new Date(p.pulangRecord.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
      : '-';
    const pulangStatus = p.pulangRecord ? 'PULANG SAH' : '-';

    let durasi = '-';
    if (p.masukRecord && p.pulangRecord) {
      const diffMs = new Date(p.pulangRecord.timestamp).getTime() - new Date(p.masukRecord.timestamp).getTime();
      if (diffMs > 0) {
        const h = Math.floor(diffMs / 3600000);
        const m = Math.floor((diffMs % 3600000) / 60000);
        durasi = `${h}j ${m}m`;
      }
    }

    const kelengkapan =
      p.masukRecord && p.pulangRecord
        ? 'Lengkap'
        : p.masukRecord
        ? 'Belum Absen Pulang'
        : 'Belum Presensi';

    const dept = departments.find((d) => d.id === p.role);
    const gpsDistance = p.masukRecord ? `${p.masukRecord.distanceFromLocationMeters} meter` : '-';
    const faceScore = p.masukRecord ? `${Math.round(p.masukRecord.faceSimilarityScore * 100)}%` : '-';
    const sesi = p.masukRecord?.sessionName || p.pulangRecord?.sessionName || 'Sesi 1';

    const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    const statusBg =
      masukStatus === 'TEPAT WAKTU'
        ? 'background-color: #ecfdf5; color: #065f46;'
        : masukStatus === 'TERLAMBAT'
        ? 'background-color: #fffbeb; color: #92400e;'
        : '';

    tableRowsHtml += `
      <tr style="background-color: ${rowBg};">
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px;">${idx + 1}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px;">${p.date}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${p.userName}</td>
        <td style="mso-number-format:'\\@'; border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${p.nip || '-'}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">${p.role.toUpperCase()}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: bold;">${sesi}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${masukTime}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold; ${statusBg}">${masukStatus}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px;">${gpsDistance}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px;">${faceScore}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${pulangTime}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px;">${pulangStatus}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px; font-weight: bold;">${durasi}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 6px;">${kelengkapan}</td>
      </tr>
    `;
  });

  const excelHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Rekap Presensi</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1e293b; }
          .kop-title { font-size: 16pt; font-weight: bold; color: #0f172a; }
          .kop-sub { font-size: 10pt; color: #475569; }
          .kop-divider { border-bottom: 3px double #0f172a; }
          th {
            background-color: #059669;
            color: #ffffff;
            font-weight: bold;
            text-align: center;
            border: 1px solid #047857;
            padding: 8px;
            font-size: 10pt;
          }
          td {
            border: 1px solid #cbd5e1;
            padding: 6px;
            font-size: 9.5pt;
          }
        </style>
      </head>
      <body>
        <table>
          <tr>
            <td colspan="14" class="kop-title" style="text-align: center;">${schoolName.toUpperCase()}</td>
          </tr>
          <tr>
            <td colspan="14" class="kop-sub" style="text-align: center;">${schoolAddress}</td>
          </tr>
          <tr>
            <td colspan="14" class="kop-sub" style="text-align: center;">Aplikasi: ${appTitle} &bull; Email: ${settings.schoolEmail || 'kepsek@sekolah.sch.id'}</td>
          </tr>
          <tr>
            <td colspan="14" style="height: 10px;"></td>
          </tr>
          <tr>
            <td colspan="14" style="font-size: 12pt; font-weight: bold; text-align: center; background-color: #f1f5f9; padding: 8px; border: 1px solid #cbd5e1;">
              ${docTitle}
            </td>
          </tr>
          <tr>
            <td colspan="14" style="text-align: center; color: #64748b; font-size: 9.5pt; padding: 4px;">
              ${periodLabel ? `${periodLabel} &bull; ` : ''}Periode: ${startDate} s/d ${endDate} | Dicetak: ${new Date().toLocaleString('id-ID')}
            </td>
          </tr>
          <tr>
            <td colspan="14" style="height: 8px;"></td>
          </tr>
          <tr>
            <td colspan="14" style="background-color: #ecfdf5; border: 1px solid #a7f3d0; padding: 6px; font-weight: bold; color: #065f46; font-size: 9.5pt;">
              RINGKASAN DATA: Total Presensi Masuk: ${totalMasuk} | Tepat Waktu: ${tepatWaktu} (${persen}%) | Terlambat: ${terlambat} | Total Baris: ${paired.length}
            </td>
          </tr>
          <tr>
            <td colspan="14" style="height: 10px;"></td>
          </tr>
        </table>

        <table style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr>
              <th style="width: 40px;">No</th>
              <th style="width: 90px;">Tanggal</th>
              <th style="width: 180px;">Nama Pegawai</th>
              <th style="width: 140px;">NIP / ID</th>
              <th style="width: 90px;">Peran</th>
              <th style="width: 90px;">Sesi</th>
              <th style="width: 80px;">Jam Masuk</th>
              <th style="width: 110px;">Status Masuk</th>
              <th style="width: 90px;">Jarak GPS</th>
              <th style="width: 80px;">Wajah (%)</th>
              <th style="width: 80px;">Jam Pulang</th>
              <th style="width: 90px;">Status Pulang</th>
              <th style="width: 90px;">Durasi Kerja</th>
              <th style="width: 130px;">Kelengkapan</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml || '<tr><td colspan="14" style="text-align: center; padding: 15px;">Belum ada catatan presensi pada periode ini.</td></tr>'}
          </tbody>
        </table>

        <table>
          <tr><td colspan="14" style="height: 20px;"></td></tr>
          <tr>
            <td colspan="10"></td>
            <td colspan="4" style="text-align: center; font-weight: bold; font-size: 10pt;">
              Mengetahui,<br/>
              Kepala Sekolah ${schoolName}<br/><br/><br/><br/>
              <u>${settings.schoolName || 'Kepala Sekolah'}</u>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  const targetName = targetUser
    ? `${targetUser.role.toUpperCase()}_${targetUser.name.replace(/[^a-zA-Z0-9]/g, '_')}`
    : 'Seluruh_Civitas';
  const tag = periodLabel ? periodLabel.replace(/\s+/g, '_') : 'Rekap';
  link.download = `Rekap_Presensi_${targetName}_${tag}_${startDate}_sd_${endDate}.xls`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
