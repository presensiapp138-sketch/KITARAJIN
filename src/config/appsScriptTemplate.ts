/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const APPS_SCRIPT_CODE = `/**
 * ============================================================================
 * KITARAJIN - Google Apps Script Web App Backend (Single Database: Sheets + Drive)
 * ============================================================================
 * Konfigurasi WAJIB di Project Settings -> Script Properties:
 *   1. SPREADSHEET_ID   : ID Google Spreadsheet database utama
 *   2. DRIVE_FOLDER_ID  : ID Folder Google Drive privat untuk foto & mirror database
 *   3. API_TOKEN        : Token rahasia bebas & panjang (harus sama dengan di aplikasi)
 *
 * Cara Deploy:
 *   Deploy -> New deployment -> Type: Web app
 *   - Execute as : Me (akun pemilik Spreadsheet & Drive)
 *   - Who has access : Anyone
 * ============================================================================
 */

var TIMEZONE = 'Asia/Jakarta';
var DRIVE_MIRROR_FILENAME = 'KITARAJIN_Database_Mirror.json';

var SCHEMAS = {
  Users: [
    'id', 'nip', 'name', 'email', 'username', 'passwordHash', 'savedPassword',
    'role', 'departmentId', 'departmentName', 'position', 'scheduleId',
    'assignedSessionIds', 'phone', 'isActive', 'avatarUrl', 'createdAt',
    'updatedAt', 'diubah_pada', 'status'
  ],
  Departments: [
    'id', 'name', 'code', 'description', 'headName', 'createdAt',
    'diubah_pada', 'status'
  ],
  Schedules: [
    'id', 'name', 'sessionName', 'targetRole', 'checkInStart', 'checkInDeadline',
    'lateToleranceMinutes', 'checkOutStart', 'checkOutEnd', 'workDays',
    'ruleNotes', 'isActive', 'diubah_pada', 'status'
  ],
  Locations: [
    'id', 'name', 'latitude', 'longitude', 'radiusMeters', 'address',
    'isActive', 'diubah_pada', 'status'
  ],
  FaceRegistry: [
    'id', 'userId', 'nip', 'userName', 'role', 'faceEmbedding',
    'registeredPhotoFileId', 'registeredBy', 'cameraUsed', 'qualityScore',
    'updatedAt', 'isActive', 'diubah_pada', 'status'
  ],
  Attendance: [
    'id', 'userId', 'nip', 'userName', 'role', 'date', 'type', 'timestamp',
    'attendanceStatus', 'latitude', 'longitude', 'distanceFromLocationMeters',
    'isLocationValid', 'isFaceValid', 'faceSimilarityScore', 'deviceInfo',
    'notes', 'sessionId', 'sessionName', 'diubah_pada', 'status'
  ],
  LeaveRequests: [
    'id', 'userId', 'nip', 'userName', 'type', 'startDate', 'endDate',
    'durationDays', 'reason', 'documentRef', 'leaveStatus', 'reviewedBy',
    'reviewNotes', 'reviewedAt', 'createdAt', 'diubah_pada', 'status'
  ],
  Assignments: [
    'id', 'title', 'description', 'assignedToUserId', 'assignedToName',
    'assignedByUserId', 'assignedByName', 'dueDate', 'assignmentStatus',
    'completedAt', 'documentationPhotoRef', 'documentationNotes',
    'documentationLocation', 'feedback', 'createdAt', 'diubah_pada', 'status'
  ],
  Settings: [
    'id', 'schoolName', 'schoolAddress', 'schoolEmail', 'appTitle',
    'storageMode', 'requireStrictFaceVerification', 'requireStrictGps',
    'minFaceMatchThreshold', 'themeColor', 'lastSyncTimestamp',
    'diubah_pada', 'status'
  ],
  Log: [
    'id', 'actorUserId', 'actorName', 'actorRole', 'action',
    'targetEntity', 'targetId', 'details', 'timestamp', 'diubah_pada', 'status'
  ]
};

var LEGACY_TAB_ALIASES = {
  Users: ['Users', 'Karyawan', 'Pegawai', 'DataKaryawan', 'users'],
  Departments: ['Departments', 'Departemen', 'departments'],
  Schedules: ['Schedules', 'Jadwal', 'Sesi', 'schedules'],
  Locations: ['Locations', 'Lokasi', 'locations'],
  FaceRegistry: ['FaceRegistry', 'Wajah', 'DatabaseWajah', 'face_registry'],
  Attendance: ['Attendance', 'Presensi', 'Absensi', 'RiwayatPresensi', 'attendance'],
  LeaveRequests: ['LeaveRequests', 'Izin', 'Cuti', 'leave_requests'],
  Assignments: ['Assignments', 'Tugas', 'Penugasan', 'assignments'],
  Settings: ['Settings', 'Pengaturan', 'settings'],
  Log: ['Log', 'AuditLogs', 'Logs', 'audit_logs']
};

var TEXT_COLUMNS = {
  id: true,
  nip: true,
  phone: true,
  username: true,
  date: true,
  startDate: true,
  endDate: true,
  dueDate: true,
  checkInStart: true,
  checkInDeadline: true,
  checkOutStart: true,
  checkOutEnd: true,
  timestamp: true,
  createdAt: true,
  updatedAt: true,
  diubah_pada: true,
  registeredPhotoFileId: true,
  savedPassword: true
};

var JSON_COLUMNS = {
  assignedSessionIds: true,
  workDays: true,
  faceEmbedding: true,
  documentationLocation: true
};

var BOOL_COLUMNS = {
  isActive: true,
  isLocationValid: true,
  isFaceValid: true,
  requireStrictFaceVerification: true,
  requireStrictGps: true
};

var NUM_COLUMNS = {
  lateToleranceMinutes: true,
  latitude: true,
  longitude: true,
  radiusMeters: true,
  qualityScore: true,
  distanceFromLocationMeters: true,
  faceSimilarityScore: true,
  durationDays: true,
  minFaceMatchThreshold: true
};

// ============================================================================
// ENTRY POINTS: doGet & doPost
// ============================================================================

function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var token = params.token || '';
    var auth = validateToken_(token);
    if (!auth.ok) {
      return jsonResponse_({ ok: false, code: 401, error: auth.error });
    }

    var action = String(params.action || 'getAll');

    if (action === 'ping' || action === 'checkSystem') {
      return jsonResponse_(handleCheckSystem_());
    }

    if (action === 'getPhoto') {
      var fileId = String(params.fileId || '').trim();
      return jsonResponse_(handleGetPhoto_(fileId));
    }

    if (action === 'getAll' || action === 'getChanges') {
      var sinceVersion = String(params.sinceVersion || '').trim();
      var deepCheck = (action === 'getAll') || String(params.deep || '') === '1';
      var scanDriveFlag = String(params.scanDrive || '') === '1';
      return jsonResponse_(handleGetChanges_(sinceVersion, deepCheck, scanDriveFlag));
    }

    return jsonResponse_({ ok: false, code: 400, error: 'Aksi GET tidak dikenali: ' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, code: 500, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    var rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseErr) {
      return jsonResponse_({ ok: false, code: 400, error: 'Format body JSON tidak valid.' });
    }

    var token = (payload && payload.token) ? String(payload.token) : '';
    var auth = validateToken_(token);
    if (!auth.ok) {
      return jsonResponse_({ ok: false, code: 401, error: auth.error });
    }

    var action = String(payload.action || '');

    // Read-only actions via POST
    if (action === 'checkSystem') {
      return jsonResponse_(handleCheckSystem_());
    }
    if (action === 'getAll' || action === 'getChanges') {
      var deepPost = (action === 'getAll') || Boolean(payload.deep);
      return jsonResponse_(handleGetChanges_(String(payload.sinceVersion || ''), deepPost, Boolean(payload.scanDrive)));
    }
    if (action === 'getPhoto') {
      return jsonResponse_(handleGetPhoto_(String(payload.fileId || '')));
    }

    // Semua operasi penulisan dibungkus LockService agar aman multi-pengguna
    var lock = LockService.getScriptLock();
    var locked = lock.tryLock(15000);
    if (!locked) {
      return jsonResponse_({
        ok: false,
        code: 503,
        error: 'Server sedang sibuk memproses antrean pengguna lain. Silakan coba sesaat lagi.'
      });
    }

    try {
      var props = getProps_();
      var result;
      var didMutate = false;

      if (action === 'updateSheetBinding') {
        result = handleUpdateSheetBinding_(payload);
        if (result && result.ok) {
          result.version = getDataVersion_();
        }
        return jsonResponse_(result);
      }

      if (!props.SPREADSHEET_ID) {
        return jsonResponse_({
          ok: false,
          code: 500,
          error: 'Script Property SPREADSHEET_ID masih kosong.'
        });
      }

      var ss = SpreadsheetApp.openById(props.SPREADSHEET_ID);
      var sheetsMap = getSheetsMap_(ss);
      ensureAllSheets_(ss, sheetsMap);

      if (action === 'createRow') {
        result = handleCreateRow_(ss, payload);
        didMutate = Boolean(result && result.ok);
      } else if (action === 'updateRow') {
        result = handleUpdateRow_(ss, payload);
        didMutate = Boolean(result && result.ok);
      } else if (action === 'softDeleteRow') {
        result = handleSoftDeleteRow_(ss, payload);
        didMutate = Boolean(result && result.ok);
      } else if (action === 'upsertSettings') {
        result = handleUpsertSettings_(ss, payload);
        didMutate = Boolean(result && result.ok);
      } else if (action === 'saveFace') {
        result = handleSaveFace_(ss, props, payload);
        didMutate = Boolean(result && result.ok);
      } else if (action === 'recordAttendanceBatch') {
        result = handleRecordAttendanceBatch_(ss, payload);
        didMutate = Boolean(result && result.ok && result.accepted && result.accepted.length > 0);
      } else if (action === 'seedInitialIfEmpty') {
        result = handleSeedInitialIfEmpty_(ss, payload);
        didMutate = Boolean(result && result.ok);
      } else if (action === 'appendLog') {
        result = handleAppendLogOnly_(ss, payload);
        didMutate = Boolean(result && result.ok);
      } else if (action === 'repairSheetSync') {
        result = handleRepairSheetSync_(ss, props, sheetsMap, payload);
        didMutate = Boolean(result && result.ok);
      } else {
        result = { ok: false, code: 400, error: 'Aksi POST tidak dikenali: ' + action };
      }

      if (result && result.ok) {
        if (didMutate) {
          bumpDataVersion_();
          syncDatabaseSnapshotToDrive_(ss, props, sheetsMap);
        }
        result.version = getDataVersion_();
      }
      return jsonResponse_(result);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return jsonResponse_({ ok: false, code: 500, error: String(err && err.message ? err.message : err) });
  }
}

// ============================================================================
// AUTHENTICATION & SCRIPT PROPERTIES
// ============================================================================

function getProps_() {
  var sp = PropertiesService.getScriptProperties();
  return {
    SPREADSHEET_ID: String(sp.getProperty('SPREADSHEET_ID') || '').trim(),
    DRIVE_FOLDER_ID: String(sp.getProperty('DRIVE_FOLDER_ID') || '').trim(),
    API_TOKEN: String(sp.getProperty('API_TOKEN') || '').trim()
  };
}

function validateToken_(incomingToken) {
  var props = getProps_();
  if (!props.API_TOKEN) {
    return {
      ok: false,
      error: 'Konfigurasi server belum lengkap: Script Property API_TOKEN masih kosong.'
    };
  }
  if (!incomingToken || String(incomingToken).trim() !== props.API_TOKEN) {
    return {
      ok: false,
      error: 'Akses ditolak (Unauthorized): Token rahasia tidak cocok.'
    };
  }
  return { ok: true };
}

function getDataVersion_() {
  var sp = PropertiesService.getScriptProperties();
  var sheetId = String(sp.getProperty('SPREADSHEET_ID') || '').trim() || 'none';
  var lastSheetId = String(sp.getProperty('LAST_BOUND_SHEET_ID') || '').trim();
  if (sheetId !== 'none' && lastSheetId !== sheetId) {
    sp.setProperty('LAST_BOUND_SHEET_ID', sheetId);
    sp.deleteProperty('LAST_DRIVE_SCAN_MS');
    sp.deleteProperty('LAST_LEGACY_TAB_SCAN_MS');
    if (lastSheetId) {
      return bumpDataVersion_();
    }
  }
  var cacheKey = 'DATA_VERSION_' + sheetId.slice(-8);
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) return String(cached);
  } catch (e) {}
  var v = String(sp.getProperty('DATA_VERSION') || '1');
  try {
    CacheService.getScriptCache().put(cacheKey, v, 21600);
  } catch (e) {}
  return v;
}

function bumpDataVersion_() {
  var sp = PropertiesService.getScriptProperties();
  var sheetId = String(sp.getProperty('SPREADSHEET_ID') || '').trim() || 'none';
  var cacheKey = 'DATA_VERSION_' + sheetId.slice(-8);
  var next = String(Date.now());
  sp.setProperty('DATA_VERSION', next);
  try {
    CacheService.getScriptCache().put(cacheKey, next, 21600);
  } catch (e) {}
  return next;
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// SYSTEM HEALTH CHECK (TANPA MEMBOCORKAN NILAI KONFIGURASI RAHASIA)
// ============================================================================

function isDemoSheetRow_(tableName, id, email, username) {
  var cleanId = String(id || '').trim();
  if (tableName === 'Users') {
    if (cleanId !== 'usr-ks-01' && cleanId !== 'usr-adm-01' && cleanId !== 'usr-stf-01') {
      return false;
    }
    var em = String(email || '').trim().toLowerCase();
    var un = String(username || '').trim().toLowerCase();
    return (
      em === 'kepsek@sekolah.sch.id' ||
      em === 'admin.fauzi@sekolah.sch.id' ||
      em === 'siti.rahma@sekolah.sch.id' ||
      un === 'kepsek' ||
      un === 'adminfauzi' ||
      un === 'sitirahma' ||
      !em
    );
  }
  if (tableName === 'Attendance') {
    return cleanId.indexOf('att-seed-') === 0;
  }
  return false;
}

function handleCheckSystem_() {
  var props = getProps_();
  var missing = [];
  if (!props.SPREADSHEET_ID) missing.push('SPREADSHEET_ID');
  if (!props.DRIVE_FOLDER_ID) missing.push('DRIVE_FOLDER_ID');
  if (!props.API_TOKEN) missing.push('API_TOKEN');

  var sheetsConnected = false;
  var sheetName = '';
  var tabsStatus = [];
  var syncIssues = [];
  var driveConnected = false;
  var driveFolderName = '';
  var errors = [];

  if (props.SPREADSHEET_ID) {
    try {
      var ss = SpreadsheetApp.openById(props.SPREADSHEET_ID);
      sheetsConnected = true;
      sheetName = ss.getName();
      var sheetsMap = getSheetsMap_(ss);
      var tableNames = Object.keys(SCHEMAS);

      var usersById = {};
      var usersMissingId = 0;
      var demoRowsCount = 0;
      var missingMetaCount = 0;
      var missingFacePhotoCount = 0;
      var crossRefMismatchCount = 0;

      for (var i = 0; i < tableNames.length; i++) {
        var name = tableNames[i];
        var sh = sheetsMap[name];
        var lastRow = sh ? sh.getLastRow() : 0;
        tabsStatus.push({
          name: name,
          exists: Boolean(sh),
          rows: sh ? Math.max(0, lastRow - 1) : 0
        });

        if (!sh) {
          syncIssues.push('Tab "' + name + '" belum ada di Spreadsheet.');
          continue;
        }

        var expectedHeaders = SCHEMAS[name];
        var curHeaders = getHeadersForSheet_(sh, name);
        var missingCols = [];
        for (var hc = 0; hc < expectedHeaders.length; hc++) {
          if (curHeaders.indexOf(expectedHeaders[hc]) === -1) {
            missingCols.push(expectedHeaders[hc]);
          }
        }
        if (missingCols.length > 0) {
          syncIssues.push('Tab "' + name + '" kekurangan kolom: ' + missingCols.join(', ') + '.');
        }

        if (lastRow >= 2 && curHeaders.length > 0) {
          var startRow = (name === 'Log') ? Math.max(2, lastRow - 199) : 2;
          var numRows = lastRow - startRow + 1;
          var vals = sh.getRange(startRow, 1, numRows, curHeaders.length).getValues();
          var cId = curHeaders.indexOf('id');
          var cDiubah = curHeaders.indexOf('diubah_pada');
          var cStatus = curHeaders.indexOf('status');
          var cEmail = curHeaders.indexOf('email');
          var cUser = curHeaders.indexOf('username');
          var cName = curHeaders.indexOf('name');
          var cNip = curHeaders.indexOf('nip');
          var cUid = curHeaders.indexOf('userId');
          var cUName = curHeaders.indexOf('userName');
          var cFileId = curHeaders.indexOf('registeredPhotoFileId');
          var cAsgToId = curHeaders.indexOf('assignedToUserId');
          var cAsgToName = curHeaders.indexOf('assignedToName');

          for (var r = 0; r < vals.length; r++) {
            if (!rowHasAnyValue_(vals[r])) continue;
            var idVal = cId !== -1 ? String(vals[r][cId] || '').trim() : String(vals[r][0] || '').trim();
            var stVal = cStatus !== -1 ? String(vals[r][cStatus] || '').trim().toLowerCase() : 'aktif';
            if (stVal === 'dihapus') continue;

            if (name !== 'Log') {
              if (!idVal) usersMissingId++;
              if ((cDiubah !== -1 && !vals[r][cDiubah]) || (cStatus !== -1 && !vals[r][cStatus])) {
                missingMetaCount++;
              }
            }

            if (name === 'Users') {
              var emVal = cEmail !== -1 ? vals[r][cEmail] : '';
              var unVal = cUser !== -1 ? vals[r][cUser] : '';
              if (isDemoSheetRow_('Users', idVal, emVal, unVal)) {
                demoRowsCount++;
              } else if (idVal) {
                usersById[idVal] = {
                  name: cName !== -1 ? String(vals[r][cName] || '').trim() : '',
                  nip: cNip !== -1 ? String(vals[r][cNip] || '').trim() : ''
                };
              }
            } else if (name === 'Attendance' && isDemoSheetRow_('Attendance', idVal, '', '')) {
              demoRowsCount++;
            } else if (name === 'FaceRegistry') {
              if (cFileId !== -1 && !String(vals[r][cFileId] || '').trim()) {
                missingFacePhotoCount++;
              }
              if (cUid !== -1) {
                var fUid = String(vals[r][cUid] || '').trim();
                var fU = usersById[fUid];
                if (fU) {
                  var curFN = cUName !== -1 ? String(vals[r][cUName] || '').trim() : '';
                  var curFNip = cNip !== -1 ? String(vals[r][cNip] || '').trim() : '';
                  if ((fU.name && curFN !== fU.name) || (fU.nip && curFNip !== fU.nip)) {
                    crossRefMismatchCount++;
                  }
                }
              }
            } else if (name === 'Attendance' || name === 'LeaveRequests') {
              if (cUid !== -1) {
                var rUid = String(vals[r][cUid] || '').trim();
                var rU = usersById[rUid];
                if (rU) {
                  var curRN = cUName !== -1 ? String(vals[r][cUName] || '').trim() : '';
                  var curRNip = cNip !== -1 ? String(vals[r][cNip] || '').trim() : '';
                  if ((rU.name && curRN !== rU.name) || (rU.nip && curRNip !== rU.nip)) {
                    crossRefMismatchCount++;
                  }
                }
              }
            } else if (name === 'Assignments' && cAsgToId !== -1 && cAsgToName !== -1) {
              var aUid = String(vals[r][cAsgToId] || '').trim();
              var aU = usersById[aUid];
              if (aU && aU.name && String(vals[r][cAsgToName] || '').trim() !== aU.name) {
                crossRefMismatchCount++;
              }
            }
          }
        }
      }

      // Cek tab alias lama yang masih terisi
      var legacyKeys = Object.keys(LEGACY_TAB_ALIASES);
      for (var lk = 0; lk < legacyKeys.length; lk++) {
        var canonicalName = legacyKeys[lk];
        var aliases = LEGACY_TAB_ALIASES[canonicalName];
        for (var ai = 0; ai < aliases.length; ai++) {
          var aliasName = aliases[ai];
          if (aliasName === canonicalName) continue;
          var aliasSh = sheetsMap[aliasName];
          if (aliasSh && aliasSh.getLastRow() >= 2) {
            syncIssues.push('Ditemukan tab lama "' + aliasName + '" (' + (aliasSh.getLastRow() - 1) + ' baris) yang perlu dipastikan tersinkron ke tab "' + canonicalName + '".');
          }
        }
      }

      if (usersMissingId > 0) {
        syncIssues.push(usersMissingId + ' baris aktif belum memiliki ID unik.');
      }
      if (missingMetaCount > 0) {
        syncIssues.push(missingMetaCount + ' baris belum memiliki metadata lengkap (diubah_pada / status).');
      }
      if (demoRowsCount > 0) {
        syncIssues.push('Terdapat ' + demoRowsCount + ' baris akun/data demo bawaan yang perlu dibersihkan.');
      }
      if (missingFacePhotoCount > 0) {
        syncIssues.push(missingFacePhotoCount + ' data wajah di FaceRegistry belum tertaut ID file foto Google Drive.');
      }
      if (crossRefMismatchCount > 0) {
        syncIssues.push(crossRefMismatchCount + ' baris presensi/wajah/izin/tugas memiliki Nama/NIP yang belum selaras dengan tab Users.');
      }
    } catch (e) {
      errors.push('Sheets: ' + (e.message || e));
    }
  }

  if (props.DRIVE_FOLDER_ID) {
    try {
      var folder = DriveApp.getFolderById(props.DRIVE_FOLDER_ID);
      driveFolderName = folder.getName();
      driveConnected = true;
    } catch (e) {
      errors.push('Drive: ' + (e.message || e));
    }
  }

  return {
    ok: true,
    authorized: true,
    sheetsConnected: sheetsConnected,
    driveConnected: driveConnected,
    sheetName: sheetName,
    spreadsheetId: props.SPREADSHEET_ID || '',
    driveFolderName: driveFolderName,
    tabsStatus: tabsStatus,
    syncIssues: syncIssues,
    missingScriptProperties: missing,
    serverTime: new Date().toISOString(),
    version: getDataVersion_(),
    error: errors.length > 0 ? errors.join(' | ') : undefined
  };
}

// ============================================================================
// SHEET INITIALIZATION & SERIALIZATION HELPERS
// ============================================================================

function getSheetsMap_(ss) {
  var list = ss.getSheets();
  var map = {};
  for (var i = 0; i < list.length; i++) {
    map[list[i].getName()] = list[i];
  }
  return map;
}

function findExistingSheetInsensitive_(ss, sheetsMap, targetName) {
  if (sheetsMap && sheetsMap[targetName]) return sheetsMap[targetName];
  var direct = ss.getSheetByName(targetName);
  if (direct) return direct;
  var lowerTarget = String(targetName || '').toLowerCase().trim();
  var allSheets = ss.getSheets();
  for (var i = 0; i < allSheets.length; i++) {
    if (String(allSheets[i].getName() || '').toLowerCase().trim() === lowerTarget) {
      return allSheets[i];
    }
  }
  return null;
}

function getColumnWidthPreset_(colName) {
  var widthMap = {
    id: 165,
    userId: 165,
    scheduleId: 140,
    departmentId: 140,
    registeredPhotoFileId: 170,
    actorUserId: 160,
    targetId: 165,
    assignedToUserId: 165,
    assignedByUserId: 165,
    name: 190,
    userName: 190,
    departmentName: 170,
    headName: 170,
    assignedToName: 185,
    assignedByName: 185,
    actorName: 185,
    sessionName: 145,
    title: 200,
    schoolName: 210,
    appTitle: 195,
    email: 205,
    schoolEmail: 205,
    schoolAddress: 230,
    address: 220,
    deviceInfo: 185,
    details: 260,
    notes: 230,
    reason: 230,
    description: 240,
    ruleNotes: 240,
    feedback: 220,
    documentationNotes: 220,
    faceEmbedding: 140,
    passwordHash: 135,
    documentationPhotoRef: 145,
    documentRef: 145,
    avatarUrl: 140,
    documentationLocation: 155,
    nip: 135,
    phone: 130,
    username: 135,
    savedPassword: 125,
    date: 115,
    startDate: 115,
    endDate: 115,
    dueDate: 115,
    timestamp: 165,
    createdAt: 165,
    updatedAt: 165,
    diubah_pada: 165,
    lastSyncTimestamp: 165
  };
  return widthMap[colName] || 115;
}

function formatSheetTidy_(sheet, tableName, headers) {
  if (!sheet || !headers || headers.length === 0) return;
  try {
    var colCount = headers.length;
    sheet.setFrozenRows(1);

    // Rapikan header baris 1
    var headerRange = sheet.getRange(1, 1, 1, colCount);
    headerRange
      .setFontWeight('bold')
      .setBackground('#ecfdf5')
      .setFontColor('#064e3b')
      .setVerticalAlignment('middle')
      .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    sheet.setRowHeight(1, 28);

    // Atur lebar kolom agar tidak tumpang tindih atau terlalu sempit/lebar
    for (var c = 0; c < colCount; c++) {
      sheet.setColumnWidth(c + 1, getColumnWidthPreset_(headers[c]));
    }

    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var dataRowCount = lastRow - 1;
      var dataRange = sheet.getRange(2, 1, dataRowCount, colCount);
      dataRange
        .setVerticalAlignment('middle')
        .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

      for (var tc = 0; tc < colCount; tc++) {
        if (TEXT_COLUMNS[headers[tc]]) {
          sheet.getRange(2, tc + 1, dataRowCount, 1).setNumberFormat('@');
        }
      }

      if (dataRowCount <= 500) {
        sheet.setRowHeights(2, dataRowCount, 24);
      }
    }
  } catch (e) {
    // Abaikan error formatting non-kritis
  }
}

function formatSingleRowTidy_(sheet, rowIdx, headers) {
  if (!sheet || rowIdx < 2 || !headers || headers.length === 0) return;
  try {
    var rowRange = sheet.getRange(rowIdx, 1, 1, headers.length);
    rowRange.setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    sheet.setRowHeight(rowIdx, 24);
  } catch (e) {}
}

function ensureAllSheets_(ss, sheetsMap) {
  var map = sheetsMap || getSheetsMap_(ss);
  var names = Object.keys(SCHEMAS);
  var sp = PropertiesService.getScriptProperties();
  var schemaKey = ss.getId() + ':v4';
  var schemaCached = sp.getProperty('SCHEMA_INIT_KEY') === schemaKey;

  var allExist = true;
  for (var i = 0; i < names.length; i++) {
    if (!map[names[i]]) {
      allExist = false;
      break;
    }
  }
  if (schemaCached && allExist) {
    return map;
  }

  for (var j = 0; j < names.length; j++) {
    ensureSheet_(ss, names[j], map);
  }
  sp.setProperty('SCHEMA_INIT_KEY', schemaKey);
  return map;
}

function ensureSheet_(ss, tableName, sheetsMap) {
  var headers = SCHEMAS[tableName];
  if (!headers) {
    throw new Error('Nama tabel tidak dikenal: ' + tableName);
  }
  var sheet = findExistingSheetInsensitive_(ss, sheetsMap, tableName);
  var didModifyStructure = false;

  // Jika tab kanonik belum ada, cek tab lama/alias yang sudah ada dan ubah nama in-place (tanpa membuat sheet baru dobel)
  if (!sheet && LEGACY_TAB_ALIASES[tableName]) {
    var aliases = LEGACY_TAB_ALIASES[tableName];
    for (var ai = 0; ai < aliases.length; ai++) {
      var candidate = findExistingSheetInsensitive_(ss, sheetsMap, aliases[ai]);
      if (candidate) {
        try {
          if (candidate.getName() !== tableName) {
            if (sheetsMap && sheetsMap[candidate.getName()]) {
              delete sheetsMap[candidate.getName()];
            }
            candidate.setName(tableName);
          }
          sheet = candidate;
          if (sheetsMap) sheetsMap[tableName] = sheet;
          didModifyStructure = true;
          break;
        } catch (renameErr) {
          sheet = candidate;
          break;
        }
      }
    }
  }

  // Pastikan casing nama tab kanonik konsisten
  if (sheet && sheet.getName() !== tableName) {
    try {
      if (sheetsMap && sheetsMap[sheet.getName()]) {
        delete sheetsMap[sheet.getName()];
      }
      sheet.setName(tableName);
      didModifyStructure = true;
    } catch (ignoreRename) {}
  }

  if (!sheet) {
    sheet = ss.insertSheet(tableName);
    didModifyStructure = true;
  }
  if (sheetsMap) sheetsMap[tableName] = sheet;

  var lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.appendRow(headers);
    formatSheetTidy_(sheet, tableName, headers);
  } else {
    var existingLastCol = sheet.getLastColumn();
    var currentHeaders = existingLastCol > 0
      ? sheet.getRange(1, 1, 1, existingLastCol).getValues()[0].map(function (v) { return String(v).trim(); })
      : [];
    for (var c = 0; c < headers.length; c++) {
      if (currentHeaders.indexOf(headers[c]) === -1) {
        var newColIdx = currentHeaders.length + 1;
        sheet.getRange(1, newColIdx).setValue(headers[c]).setFontWeight('bold').setBackground('#ecfdf5');
        currentHeaders.push(headers[c]);
        didModifyStructure = true;
      }
    }
    if (didModifyStructure) {
      formatSheetTidy_(sheet, tableName, currentHeaders);
    }
  }
  return sheet;
}

function getHeadersForSheet_(sheet, tableName) {
  var lastCol = sheet.getLastColumn();
  if (lastCol <= 0) return SCHEMAS[tableName] || [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (v) {
    return String(v).trim();
  });
}

function serializeCellValue_(colName, val) {
  if (val === undefined || val === null) return '';
  if (JSON_COLUMNS[colName]) {
    if (typeof val === 'string') return val;
    return JSON.stringify(val);
  }
  if (BOOL_COLUMNS[colName]) {
    return val === true || String(val).toLowerCase() === 'true' ? 'true' : 'false';
  }
  if (NUM_COLUMNS[colName]) {
    var n = Number(val);
    return isNaN(n) ? '' : n;
  }
  return String(val);
}

function deserializeCellValue_(colName, val) {
  if (val instanceof Date) {
    if (colName === 'date' || colName === 'startDate' || colName === 'endDate' || colName === 'dueDate') {
      return Utilities.formatDate(val, TIMEZONE, 'yyyy-MM-dd');
    }
    if (colName === 'checkInStart' || colName === 'checkInDeadline' || colName === 'checkOutStart' || colName === 'checkOutEnd') {
      return Utilities.formatDate(val, TIMEZONE, 'HH:mm');
    }
    return val.toISOString();
  }
  if (val === '' || val === null || val === undefined) {
    if (JSON_COLUMNS[colName]) return colName === 'documentationLocation' ? undefined : [];
    return undefined;
  }
  if (JSON_COLUMNS[colName]) {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch (e) {
        if (colName === 'assignedSessionIds') {
          var parts = val.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          return parts;
        }
        return colName === 'documentationLocation' ? undefined : [];
      }
    }
    return val;
  }
  if (BOOL_COLUMNS[colName]) {
    if (typeof val === 'boolean') return val;
    var lower = String(val).toLowerCase().trim();
    return lower === 'true' || lower === 'ya' || lower === '1' || lower === 'aktif';
  }
  if (NUM_COLUMNS[colName]) {
    var n = Number(val);
    return isNaN(n) ? 0 : n;
  }
  return String(val);
}

function normalizeRoleValue_(rawRole) {
  var r = String(rawRole || '').toLowerCase().trim();
  if (r === 'kepala_sekolah' || r === 'kepala sekolah' || r === 'kepsek' || r === 'super_admin') {
    return 'kepala_sekolah';
  }
  if (r === 'admin' || r === 'administrator' || r === 'tu' || r === 'tata usaha') {
    return 'admin';
  }
  return 'karyawan';
}

function extractDriveFileId_(val) {
  var s = String(val || '').trim();
  if (!s) return '';
  if (s.indexOf('data:image/') === 0) return '';
  var m1 = s.match(/\\/d\\/([a-zA-Z0-9_-]{15,})/);
  if (m1) return m1[1];
  var m2 = s.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{18,}$/.test(s)) return s;
  return '';
}

function mapFrontendToSheetRecord_(tableName, record) {
  var out = {};
  var keys = Object.keys(record || {});
  for (var i = 0; i < keys.length; i++) {
    out[keys[i]] = record[keys[i]];
  }
  if (tableName === 'Attendance') {
    if (record.status !== undefined && record.attendanceStatus === undefined) {
      out.attendanceStatus = record.status;
    }
    delete out.photoRef; // PRESENSI TIDAK MENYIMPAN FOTO
    out.status = record.rowStatus || 'aktif';
  } else if (tableName === 'LeaveRequests') {
    if (record.status !== undefined && record.leaveStatus === undefined) {
      out.leaveStatus = record.status;
    }
    out.status = record.rowStatus || 'aktif';
  } else if (tableName === 'Assignments') {
    if (record.status !== undefined && record.assignmentStatus === undefined) {
      out.assignmentStatus = record.status;
    }
    out.status = record.rowStatus || 'aktif';
  } else {
    out.status = out.status || 'aktif';
  }
  return out;
}

var HEADER_ALIAS_MAP = {
  nama: 'name',
  'nama lengkap': 'name',
  'nama karyawan': 'userName',
  'nama_karyawan': 'userName',
  nip: 'nip',
  'id karyawan': 'nip',
  id_karyawan: 'nip',
  email: 'email',
  username: 'username',
  user: 'username',
  'user name': 'username',
  nama_pengguna: 'username',
  'nama pengguna': 'username',
  jabatan: 'position',
  posisi: 'position',
  departemen: 'departmentName',
  divisi: 'departmentName',
  unit: 'departmentName',
  'no hp': 'phone',
  telepon: 'phone',
  hp: 'phone',
  password: 'savedPassword',
  pass: 'savedPassword',
  pin: 'savedPassword',
  sandi: 'savedPassword',
  'kata sandi': 'savedPassword',
  kata_sandi: 'savedPassword',
  peran: 'role',
  role: 'role',
  tanggal: 'date',
  waktu: 'timestamp',
  jam: 'timestamp',
  tipe: 'type',
  jenis: 'type',
  catatan: 'notes',
  keterangan: 'notes',
  sesi: 'sessionName',
  fileid: 'registeredPhotoFileId',
  foto: 'registeredPhotoRef'
};

function mapSheetRowToFrontendRecord_(tableName, headers, rowValues) {
  var raw = {};
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i];
    if (!h) continue;
    var canonicalH = HEADER_ALIAS_MAP[String(h).toLowerCase().trim()] || h;
    var parsed = deserializeCellValue_(canonicalH, rowValues[i]);
    if (parsed !== undefined) {
      if (raw[h] === undefined || raw[h] === '') raw[h] = parsed;
      if (raw[canonicalH] === undefined || raw[canonicalH] === '') raw[canonicalH] = parsed;
    }
  }

  var rowStatusLower = String(raw.rowStatus || raw.status || '').toLowerCase().trim();
  if (rowStatusLower === 'dihapus') {
    return null; // Soft deleted
  }

  if (tableName === 'Users') {
    raw.role = normalizeRoleValue_(raw.role);
    if (raw.isActive === undefined) raw.isActive = true;
    if (!Array.isArray(raw.assignedSessionIds) || raw.assignedSessionIds.length === 0) {
      raw.assignedSessionIds = ['sesi-1', 'sesi-2', 'sesi-3'];
    }
    if (!raw.username && raw.nip) raw.username = String(raw.nip);
    if (!raw.departmentName && raw.departmentId) raw.departmentName = raw.departmentId;
    raw.status = 'aktif';
  } else if (tableName === 'Schedules') {
    if (raw.isActive === undefined) raw.isActive = true;
    if (!Array.isArray(raw.workDays) || raw.workDays.length === 0) {
      raw.workDays = [1, 2, 3, 4, 5, 6];
    }
    raw.status = 'aktif';
  } else if (tableName === 'Locations' || tableName === 'FaceRegistry') {
    if (raw.isActive === undefined) raw.isActive = true;
    if (tableName === 'FaceRegistry') {
      if (!raw.registeredPhotoFileId && raw.registeredPhotoRef) {
        var extracted = extractDriveFileId_(raw.registeredPhotoRef);
        if (extracted) raw.registeredPhotoFileId = extracted;
      }
      if (raw.registeredPhotoFileId) {
        delete raw.registeredPhotoRef;
      }
    }
    raw.status = 'aktif';
  } else if (tableName === 'Attendance') {
    // Dukung sheet lama yang menyimpan 'tepat_waktu'/'terlambat' di kolom status
    var rawSt = String(raw.status || '').toLowerCase().trim();
    var attSt = String(raw.attendanceStatus || '').toLowerCase().trim();
    if (!attSt && (rawSt === 'tepat_waktu' || rawSt === 'terlambat')) {
      attSt = rawSt;
    }
    raw.rowStatus = 'aktif';
    raw.status = (attSt === 'terlambat') ? 'terlambat' : 'tepat_waktu';
    if (raw.faceSimilarityScore !== undefined && Number(raw.faceSimilarityScore) > 1) {
      raw.faceSimilarityScore = Number(raw.faceSimilarityScore) / 100;
    }
    raw.photoRef = '';
    delete raw.attendanceStatus;
  } else if (tableName === 'LeaveRequests') {
    var rawLv = String(raw.status || '').toLowerCase().trim();
    var lvSt = String(raw.leaveStatus || '').toLowerCase().trim();
    if (!lvSt && (rawLv === 'menunggu' || rawLv === 'disetujui' || rawLv === 'ditolak')) {
      lvSt = rawLv;
    }
    raw.rowStatus = 'aktif';
    raw.status = (lvSt === 'disetujui' || lvSt === 'ditolak') ? lvSt : 'menunggu';
    delete raw.leaveStatus;
  } else if (tableName === 'Assignments') {
    var rawAsg = String(raw.status || '').toLowerCase().trim();
    var asgSt = String(raw.assignmentStatus || '').toLowerCase().trim();
    if (!asgSt && (rawAsg === 'belum_mulai' || rawAsg === 'proses' || rawAsg === 'selesai' || rawAsg === 'perlu_perbaikan')) {
      asgSt = rawAsg;
    }
    raw.rowStatus = 'aktif';
    raw.status = (asgSt === 'proses' || asgSt === 'selesai' || asgSt === 'perlu_perbaikan') ? asgSt : 'belum_mulai';
    delete raw.assignmentStatus;
  }

  return raw;
}

function applyTextFormatting_(sheet, rowIdx, headers) {
  for (var i = 0; i < headers.length; i++) {
    if (TEXT_COLUMNS[headers[i]]) {
      sheet.getRange(rowIdx, i + 1).setNumberFormat('@');
    }
  }
}

function findRowIndexById_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var headers = getHeadersForSheet_(sheet, '');
  var colId = headers.indexOf('id');
  var idColNum = colId !== -1 ? colId + 1 : 1;
  var ids = sheet.getRange(2, idColNum, lastRow - 1, 1).getValues();
  var target = String(id).trim();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === target) {
      return i + 2;
    }
  }
  return -1;
}

function makeRecordId_(tableName, idxSeed) {
  var prefix = {
    Users: 'usr',
    Departments: 'dept',
    Schedules: 'sch',
    Locations: 'loc',
    FaceRegistry: 'face',
    Attendance: 'att',
    LeaveRequests: 'leave',
    Assignments: 'task',
    Settings: 'global',
    Log: 'log'
  }[tableName] || 'row';
  if (tableName === 'Settings') return 'global';
  return prefix + '-imp-' + Date.now() + '-' + idxSeed + '-' + Math.floor(Math.random() * 1000);
}

function rowHasAnyValue_(row) {
  for (var i = 0; i < row.length; i++) {
    if (row[i] !== '' && row[i] !== null && row[i] !== undefined) return true;
  }
  return false;
}

// ============================================================================
// LEGACY TAB + GOOGLE DRIVE HYDRATION & TWO-WAY DRIVE MIRROR
// ============================================================================

function hydrateLegacyDataIfNeeded_(ss, props, sheetsMap, forceDriveScan) {
  var sp = PropertiesService.getScriptProperties();
  var nowMs = Date.now();
  var serverIso = new Date(nowMs).toISOString();
  var importedAny = false;
  var map = sheetsMap || getSheetsMap_(ss);

  // 1. Cek Tab Lama / Alias di Spreadsheet hanya jika alias sheet benar-benar ada di map (0 RPC jika tidak ada)
  var lastTabScanMs = Number(sp.getProperty('LAST_LEGACY_TAB_SCAN_MS') || '0');
  if (forceDriveScan || (nowMs - lastTabScanMs) > 60000) {
    sp.setProperty('LAST_LEGACY_TAB_SCAN_MS', String(nowMs));
    var tableNames = Object.keys(LEGACY_TAB_ALIASES);
    for (var t = 0; t < tableNames.length; t++) {
      var canonical = tableNames[t];
      var aliases = LEGACY_TAB_ALIASES[canonical];
      var hasAliasSheet = false;
      for (var chk = 0; chk < aliases.length; chk++) {
        if (aliases[chk] !== canonical && map[aliases[chk]]) {
          hasAliasSheet = true;
          break;
        }
      }
      if (!hasAliasSheet) continue;

      var targetSheet = map[canonical] || ensureSheet_(ss, canonical, map);
      var targetHeaders = getHeadersForSheet_(targetSheet, canonical);
      var existingTargetIds = {};
      var targetLastRow = targetSheet.getLastRow();
      if (targetLastRow >= 2) {
        var idVals = targetSheet.getRange(2, 1, targetLastRow - 1, 1).getValues();
        for (var ii = 0; ii < idVals.length; ii++) {
          if (idVals[ii][0]) existingTargetIds[String(idVals[ii][0]).trim()] = true;
        }
      }

      for (var a = 0; a < aliases.length; a++) {
        var aliasName = aliases[a];
        if (aliasName === canonical) continue;
        var aliasSheet = map[aliasName];
        if (!aliasSheet || aliasSheet.getLastRow() < 2) continue;

        var aliasHeaders = getHeadersForSheet_(aliasSheet, canonical);
        var aliasRows = aliasSheet.getRange(2, 1, aliasSheet.getLastRow() - 1, aliasHeaders.length).getValues();
        for (var r = 0; r < aliasRows.length; r++) {
          if (!rowHasAnyValue_(aliasRows[r])) continue;
          var parsedAlias = mapSheetRowToFrontendRecord_(canonical, aliasHeaders, aliasRows[r]);
          if (!parsedAlias) continue;
          if (!parsedAlias.id) parsedAlias.id = makeRecordId_(canonical, r);
          if (existingTargetIds[parsedAlias.id]) continue;

          existingTargetIds[parsedAlias.id] = true;
          var mappedAlias = mapFrontendToSheetRecord_(canonical, parsedAlias);
          mappedAlias.diubah_pada = mappedAlias.diubah_pada || serverIso;
          mappedAlias.status = 'aktif';
          var appendVals = [];
          for (var hc = 0; hc < targetHeaders.length; hc++) {
            appendVals.push(serializeCellValue_(targetHeaders[hc], mappedAlias[targetHeaders[hc]]));
          }
          targetSheet.appendRow(appendVals);
          var appendedIdx = targetSheet.getLastRow();
          applyTextFormatting_(targetSheet, appendedIdx, targetHeaders);
          formatSingleRowTidy_(targetSheet, appendedIdx, targetHeaders);
          importedAny = true;
        }
      }
    }
  }

  // 2. Cek File Backup JSON & Foto Wajah Lama di Drive HANYA saat forceDriveScan atau sheet Users kosong
  if (!props.DRIVE_FOLDER_ID) return importedAny;

  var usersSheet = map['Users'];
  var usersEmpty = !usersSheet || usersSheet.getLastRow() <= 1;
  var lastDriveScanMs = Number(sp.getProperty('LAST_DRIVE_SCAN_MS') || '0');
  if (!usersEmpty && !forceDriveScan) {
    return importedAny;
  }
  if (!usersEmpty && (nowMs - lastDriveScanMs) < 30000) {
    return importedAny;
  }
  sp.setProperty('LAST_DRIVE_SCAN_MS', String(nowMs));

  try {
    var folder = DriveApp.getFolderById(props.DRIVE_FOLDER_ID);
    var files = folder.getFiles();
    var imageFiles = [];
    var jsonFiles = [];
    var scanCount = 0;

    // Batasi iterasi & waktu agar tidak pernah memicu timeout Apps Script
    while (files.hasNext() && scanCount < 50 && (Date.now() - nowMs) < 3500) {
      scanCount++;
      var f = files.next();
      if (f.isTrashed()) continue;
      var mime = String(f.getMimeType() || '').toLowerCase();
      var fname = String(f.getName() || '');
      if (mime.indexOf('json') !== -1 || fname.toLowerCase().slice(-5) === '.json') {
        jsonFiles.push(f);
      } else if (mime.indexOf('image/') === 0) {
        imageFiles.push(f);
      }
    }

    for (var jf = 0; jf < jsonFiles.length; jf++) {
      if ((Date.now() - nowMs) > 4500) break;
      var jFile = jsonFiles[jf];
      var jName = jFile.getName();
      var isSelfMirror = (jName === DRIVE_MIRROR_FILENAME);
      if (isSelfMirror && !usersEmpty) continue;

      var updatedMs = jFile.getLastUpdated().getTime();
      var seenKey = 'DRIVE_SEEN_' + jFile.getId();
      var prevSeenMs = Number(sp.getProperty(seenKey) || '0');
      if (prevSeenMs >= updatedMs && !usersEmpty) continue;

      try {
        var rawText = jFile.getBlob().getDataAsString('UTF-8');
        if (!rawText) continue;
        var parsedJson = JSON.parse(rawText);
        if (importJsonObjectToSheets_(ss, parsedJson, isSelfMirror)) {
          importedAny = true;
        }
        sp.setProperty(seenKey, String(updatedMs));
      } catch (jsonErr) {
        // Abaikan JSON yang tidak kompatibel
      }
    }

    // Hubungkan foto wajah di Drive hanya jika ada baris FaceRegistry dengan registeredPhotoFileId kosong
    if (imageFiles.length > 0 && (Date.now() - nowMs) < 5000) {
      if (linkDriveImagesToFaceRegistry_(ss, imageFiles, map)) {
        importedAny = true;
      }
    }
  } catch (driveErr) {
    // Jangan gagalkan sync jika folder Drive belum bisa diakses
  }

  return importedAny;
}

function importJsonObjectToSheets_(ss, data, isSelfMirror) {
  if (!data) return false;
  var imported = false;
  var serverIso = new Date().toISOString();

  var keyToTable = {
    Users: 'Users', users: 'Users', kitarajin_table_users: 'Users',
    Departments: 'Departments', departments: 'Departments', kitarajin_table_departments: 'Departments',
    Schedules: 'Schedules', schedules: 'Schedules', kitarajin_table_schedules: 'Schedules',
    Locations: 'Locations', locations: 'Locations', kitarajin_table_locations: 'Locations',
    FaceRegistry: 'FaceRegistry', faceRegistry: 'FaceRegistry', kitarajin_table_face_registry: 'FaceRegistry',
    Attendance: 'Attendance', attendance: 'Attendance', kitarajin_table_attendance: 'Attendance',
    LeaveRequests: 'LeaveRequests', leaveRequests: 'LeaveRequests', kitarajin_table_leave_requests: 'LeaveRequests',
    Assignments: 'Assignments', assignments: 'Assignments', kitarajin_table_assignments: 'Assignments',
    Settings: 'Settings', settings: 'Settings', kitarajin_table_settings: 'Settings',
    Log: 'Log', auditLogs: 'Log', kitarajin_table_audit_logs: 'Log'
  };

  var tableBuckets = {};

  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === 'object') {
      var sample = data[0];
      if (sample.username || (sample.nip && sample.role && !sample.type && !sample.date)) {
        tableBuckets.Users = data;
      } else if (sample.type && sample.date && sample.timestamp) {
        tableBuckets.Attendance = data;
      } else if (sample.faceEmbedding) {
        tableBuckets.FaceRegistry = data;
      } else if (sample.radiusMeters !== undefined) {
        tableBuckets.Locations = data;
      } else if (sample.checkInDeadline) {
        tableBuckets.Schedules = data;
      }
    }
  } else if (typeof data === 'object') {
    if (data.tables && typeof data.tables === 'object') {
      data = data.tables;
    }
    var keys = Object.keys(data);
    for (var k = 0; k < keys.length; k++) {
      var kName = keys[k];
      var mappedTable = keyToTable[kName];
      if (!mappedTable) continue;
      var val = data[kName];
      if (Array.isArray(val)) {
        tableBuckets[mappedTable] = val;
      } else if (mappedTable === 'Settings' && val && typeof val === 'object') {
        tableBuckets.Settings = [val];
      }
    }
  }

  var bucketNames = Object.keys(tableBuckets);
  for (var b = 0; b < bucketNames.length; b++) {
    var tableName = bucketNames[b];
    var rows = tableBuckets[tableName];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    var sheet = ensureSheet_(ss, tableName);
    var headers = getHeadersForSheet_(sheet, tableName);
    var lastRow = sheet.getLastRow();

    // Untuk self mirror, hanya pulihkan jika sheet saat ini kosong (<= 1 row)
    if (isSelfMirror && lastRow > 1) continue;

    var existingIds = {};
    var existingUserNips = {};
    var existingAttKeys = {};

    if (lastRow >= 2) {
      var curVals = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      var cNip = headers.indexOf('nip');
      var cUid = headers.indexOf('userId');
      var cDate = headers.indexOf('date');
      var cType = headers.indexOf('type');
      var cSess = headers.indexOf('sessionId');

      for (var r = 0; r < curVals.length; r++) {
        if (curVals[r][0]) existingIds[String(curVals[r][0]).trim()] = true;
        if (tableName === 'Users' && cNip !== -1 && curVals[r][cNip]) {
          existingUserNips[String(curVals[r][cNip]).trim()] = true;
        }
        if (tableName === 'Attendance' && cUid !== -1 && cDate !== -1 && cType !== -1) {
          var ak = String(curVals[r][cUid]) + '|' + String(deserializeCellValue_('date', curVals[r][cDate]) || '') + '|' + String(curVals[r][cType]) + '|' + String(cSess !== -1 ? (curVals[r][cSess] || 'default') : 'default');
          existingAttKeys[ak] = true;
        }
      }
    }

    for (var i = 0; i < rows.length; i++) {
      var rec = rows[i];
      if (!rec || typeof rec !== 'object') continue;
      if (String(rec.status || rec.rowStatus || '').toLowerCase() === 'dihapus') continue;

      var recId = String(rec.id || makeRecordId_(tableName, i)).trim();
      if (existingIds[recId]) continue;

      if (tableName === 'Users' && rec.nip && existingUserNips[String(rec.nip).trim()]) continue;
      if (tableName === 'Attendance') {
        var dk = String(rec.userId || '') + '|' + String(rec.date || '') + '|' + String(rec.type || '') + '|' + String(rec.sessionId || 'default');
        if (existingAttKeys[dk]) continue;
        existingAttKeys[dk] = true;
      }

      rec.id = recId;
      existingIds[recId] = true;
      if (tableName === 'Users' && rec.nip) existingUserNips[String(rec.nip).trim()] = true;

      var mapped = mapFrontendToSheetRecord_(tableName, rec);
      mapped.diubah_pada = mapped.diubah_pada || serverIso;
      mapped.status = 'aktif';
      if (tableName === 'Users') {
        mapped.role = normalizeRoleValue_(mapped.role);
        if (mapped.isActive === undefined) mapped.isActive = true;
      }
      if (tableName === 'FaceRegistry' && !mapped.registeredPhotoFileId && mapped.registeredPhotoRef) {
        var fid = extractDriveFileId_(mapped.registeredPhotoRef);
        if (fid) mapped.registeredPhotoFileId = fid;
      }

      var rowVals = [];
      for (var c = 0; c < headers.length; c++) {
        rowVals.push(serializeCellValue_(headers[c], mapped[headers[c]]));
      }
      sheet.appendRow(rowVals);
      applyTextFormatting_(sheet, sheet.getLastRow(), headers);
      imported = true;
    }
  }

  return imported;
}

function linkDriveImagesToFaceRegistry_(ss, imageFiles, sheetsMap) {
  var faceSheet = (sheetsMap && sheetsMap['FaceRegistry']) ? sheetsMap['FaceRegistry'] : ensureSheet_(ss, 'FaceRegistry', sheetsMap);
  var faceHeaders = getHeadersForSheet_(faceSheet, 'FaceRegistry');
  var lastRow = faceSheet.getLastRow();
  if (lastRow < 2) return false;

  var colFileId = faceHeaders.indexOf('registeredPhotoFileId');
  var colNip = faceHeaders.indexOf('nip');
  var colName = faceHeaders.indexOf('userName');
  var colStatus = faceHeaders.indexOf('status');
  var colDiubah = faceHeaders.indexOf('diubah_pada');
  if (colFileId === -1) return false;

  var rows = faceSheet.getRange(2, 1, lastRow - 1, faceHeaders.length).getValues();
  var needsLink = false;
  for (var chk = 0; chk < rows.length; chk++) {
    if (!rows[chk][0]) continue;
    if (colStatus !== -1 && String(rows[chk][colStatus]).toLowerCase() === 'dihapus') continue;
    if (String(rows[chk][colFileId] || '').trim() === '') {
      needsLink = true;
      break;
    }
  }
  if (!needsLink) return false;

  var updated = false;
  var serverIso = new Date().toISOString();

  imageFiles.sort(function (a, b) {
    return b.getLastUpdated().getTime() - a.getLastUpdated().getTime();
  });

  for (var r = 0; r < rows.length; r++) {
    if (!rows[r][0]) continue;
    if (colStatus !== -1 && String(rows[r][colStatus]).toLowerCase() === 'dihapus') continue;
    if (String(rows[r][colFileId] || '').trim() !== '') continue;

    var nip = colNip !== -1 ? String(rows[r][colNip] || '').trim() : '';
    var uName = colName !== -1 ? String(rows[r][colName] || '').toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    if (!nip && !uName) continue;

    for (var i = 0; i < imageFiles.length; i++) {
      var fName = String(imageFiles[i].getName() || '');
      var normFName = fName.toLowerCase().replace(/[^a-z0-9]/g, '');
      var matchedByNip = nip && fName.indexOf(nip) !== -1;
      var matchedByName = uName && uName.length >= 4 && normFName.indexOf(uName) !== -1;
      if (matchedByNip || matchedByName) {
        var foundId = imageFiles[i].getId();
        faceSheet.getRange(r + 2, colFileId + 1).setNumberFormat('@').setValue(foundId);
        if (colDiubah !== -1) {
          faceSheet.getRange(r + 2, colDiubah + 1).setNumberFormat('@').setValue(serverIso);
        }
        updated = true;
        break;
      }
    }
  }

  return updated;
}

function syncDatabaseSnapshotToDrive_(ss, props, sheetsMap) {
  if (!props || !props.DRIVE_FOLDER_ID) return;
  try {
    var sp = PropertiesService.getScriptProperties();
    var map = sheetsMap || getSheetsMap_(ss);
    var snapshot = {
      app: 'KITARAJIN',
      updatedAt: new Date().toISOString(),
      spreadsheetId: props.SPREADSHEET_ID,
      tables: {}
    };

    var names = Object.keys(SCHEMAS);
    for (var i = 0; i < names.length; i++) {
      var tableName = names[i];
      if (tableName === 'Log') continue; // Log tetap di Sheet tab 'Log' agar ukuran snapshot ringan & cepat (<1.5s)
      var sh = map[tableName] || ss.getSheetByName(tableName);
      if (!sh || sh.getLastRow() < 2) {
        snapshot.tables[tableName] = [];
        continue;
      }
      var headers = getHeadersForSheet_(sh, tableName);
      var vals = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues();
      var list = [];
      for (var r = 0; r < vals.length; r++) {
        if (!vals[r][0]) continue;
        var mapped = mapSheetRowToFrontendRecord_(tableName, headers, vals[r]);
        if (mapped) list.push(mapped);
      }
      snapshot.tables[tableName] = list;
    }

    var jsonContent = JSON.stringify(snapshot);
    var mirrorFileId = String(sp.getProperty('MIRROR_FILE_ID') || '').trim();
    var file = null;

    if (mirrorFileId) {
      try {
        file = DriveApp.getFileById(mirrorFileId);
        if (file.isTrashed()) file = null;
      } catch (e) {
        file = null;
      }
    }

    if (!file) {
      var folder = DriveApp.getFolderById(props.DRIVE_FOLDER_ID);
      var existing = folder.getFilesByName(DRIVE_MIRROR_FILENAME);
      if (existing.hasNext()) {
        file = existing.next();
      } else {
        file = folder.createFile(DRIVE_MIRROR_FILENAME, jsonContent, MimeType.PLAIN_TEXT);
      }
      sp.setProperty('MIRROR_FILE_ID', file.getId());
    }

    if (file) {
      file.setContent(jsonContent);
      sp.setProperty('DRIVE_SEEN_' + file.getId(), String(file.getLastUpdated().getTime()));
    }
  } catch (err) {
    // Sinkronisasi mirror Drive bersifat non-blocking bila kuota/izin terbatas
  }
}

// ============================================================================
// READ & TWO-WAY POLLING (CEPAT, ANTI-TIMEOUT, DETEKSI SHEET & DRIVE)
// ============================================================================

function getPayloadCachePrefix_(sheetId, version) {
  return 'PAYLD_' + String(sheetId || 'none').slice(-8) + '_' + String(version || '1');
}

function readCachedPayload_(sheetId, version) {
  try {
    var cache = CacheService.getScriptCache();
    var prefix = getPayloadCachePrefix_(sheetId, version);
    var metaRaw = cache.get(prefix + '_M');
    if (!metaRaw) return null;
    var meta = JSON.parse(metaRaw);
    if (!meta || !meta.chunks || !meta.version) return null;
    var keys = [];
    for (var i = 0; i < meta.chunks; i++) {
      keys.push(prefix + '_' + i);
    }
    var partsMap = cache.getAll(keys);
    var fullStr = '';
    for (var k = 0; k < keys.length; k++) {
      var piece = partsMap[keys[k]];
      if (piece === null || piece === undefined) return null;
      fullStr += piece;
    }
    var parsed = JSON.parse(fullStr);
    return {
      version: meta.version,
      tables: parsed.tables,
      sheetTotalRows: parsed.sheetTotalRows
    };
  } catch (e) {
    return null;
  }
}

function writeCachedPayload_(sheetId, dataVersion, effectiveVersion, tables, sheetTotalRows) {
  try {
    var payloadStr = JSON.stringify({
      tables: tables,
      sheetTotalRows: sheetTotalRows
    });
    var chunkSize = 85000;
    var totalChunks = Math.ceil(payloadStr.length / chunkSize);
    if (totalChunks > 18) return; // Batasi maksimal ~1.5MB di ScriptCache
    var cache = CacheService.getScriptCache();
    var prefix = getPayloadCachePrefix_(sheetId, dataVersion);
    var toPut = {};
    toPut[prefix + '_M'] = JSON.stringify({ version: effectiveVersion, chunks: totalChunks });
    for (var i = 0; i < totalChunks; i++) {
      toPut[prefix + '_' + i] = payloadStr.slice(i * chunkSize, (i + 1) * chunkSize);
    }
    cache.putAll(toPut, 21600);
  } catch (e) {
    // Non-blocking cache error
  }
}

function handleGetChanges_(sinceVersion, deepCheck, forceDriveScan) {
  var currentDataVer = getDataVersion_();
  var serverTime = new Date().toISOString();
  var sinceDataVer = sinceVersion ? String(sinceVersion).split('.')[0] : '';

  // Jalur super cepat (<50ms via CacheService) saat poll reguler & tidak ada perubahan
  if (!deepCheck && sinceVersion && sinceDataVer === currentDataVer) {
    return {
      ok: true,
      unchanged: true,
      version: sinceVersion,
      serverTime: serverTime
    };
  }

  var props = getProps_();
  if (!props.SPREADSHEET_ID) {
    return {
      ok: false,
      code: 500,
      error: 'Script Property SPREADSHEET_ID belum diisi di Apps Script.'
    };
  }

  // Jalur cache penuh (<120ms tanpa membuka Spreadsheet) saat cache masih segar
  if (!deepCheck && !forceDriveScan) {
    var cached = readCachedPayload_(props.SPREADSHEET_ID, currentDataVer);
    if (cached) {
      if (sinceVersion && sinceVersion === cached.version) {
        return {
          ok: true,
          unchanged: true,
          version: cached.version,
          serverTime: serverTime
        };
      }
      return {
        ok: true,
        unchanged: false,
        version: cached.version,
        serverTime: serverTime,
        tables: cached.tables,
        sheetTotalRows: cached.sheetTotalRows
      };
    }
  }

  var ss = SpreadsheetApp.openById(props.SPREADSHEET_ID);
  var sheetsMap = getSheetsMap_(ss);
  ensureAllSheets_(ss, sheetsMap);

  var hydratedFromLegacy = hydrateLegacyDataIfNeeded_(ss, props, sheetsMap, Boolean(forceDriveScan));
  if (hydratedFromLegacy) {
    currentDataVer = bumpDataVersion_();
  }

  var tables = {};
  var sheetTotalRows = {};
  var names = Object.keys(SCHEMAS);
  var nowIso = new Date().toISOString();
  var normalizedAnyManualRow = false;

  for (var i = 0; i < names.length; i++) {
    var tableName = names[i];
    var sheet = sheetsMap[tableName] || ss.getSheetByName(tableName);
    var headers = getHeadersForSheet_(sheet, tableName);
    var lastRow = sheet.getLastRow();
    var list = [];
    sheetTotalRows[tableName] = Math.max(0, lastRow - 1);

    if (lastRow >= 2 && headers.length > 0) {
      // Untuk tabel Log yang terus bertambah, cukup baca 200 baris terbaru agar pembacaan selalu cepat (<1 detik)
      var startRow = (tableName === 'Log') ? Math.max(2, lastRow - 199) : 2;
      var numRows = lastRow - startRow + 1;
      var values = sheet.getRange(startRow, 1, numRows, headers.length).getValues();
      var colId = headers.indexOf('id');
      var colDiubah = headers.indexOf('diubah_pada');
      var colStatus = headers.indexOf('status');

      for (var r = 0; r < values.length; r++) {
        if (!rowHasAnyValue_(values[r])) continue;

        // Jika baris ditambah manual langsung di Google Sheets tanpa ID, beri ID & metadata otomatis
        var idIdx = colId !== -1 ? colId : 0;
        if (!values[r][idIdx] && tableName !== 'Log') {
          var actualSheetRow = startRow + r;
          var newId = makeRecordId_(tableName, r);
          values[r][idIdx] = newId;
          sheet.getRange(actualSheetRow, idIdx + 1).setNumberFormat('@').setValue(newId);
          if (colDiubah !== -1 && !values[r][colDiubah]) {
            values[r][colDiubah] = nowIso;
            sheet.getRange(actualSheetRow, colDiubah + 1).setNumberFormat('@').setValue(nowIso);
          }
          if (colStatus !== -1 && !values[r][colStatus]) {
            values[r][colStatus] = 'aktif';
            sheet.getRange(actualSheetRow, colStatus + 1).setValue('aktif');
          }
          normalizedAnyManualRow = true;
        }

        var mapped = mapSheetRowToFrontendRecord_(tableName, headers, values[r]);
        if (mapped) {
          if (!mapped.id) mapped.id = makeRecordId_(tableName, r);
          list.push(mapped);
        }
      }
    }
    tables[tableName] = list;
  }

  if (normalizedAnyManualRow) {
    currentDataVer = bumpDataVersion_();
    syncDatabaseSnapshotToDrive_(ss, props, sheetsMap);
  }

  var digestBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(tables));
  var sig = Utilities.base64EncodeWebSafe(digestBytes).slice(0, 16);
  var effectiveVersion = currentDataVer + '.' + sig;

  writeCachedPayload_(props.SPREADSHEET_ID, currentDataVer, effectiveVersion, tables, sheetTotalRows);

  if (sinceVersion && sinceVersion === effectiveVersion) {
    return {
      ok: true,
      unchanged: true,
      version: effectiveVersion,
      serverTime: serverTime
    };
  }

  return {
    ok: true,
    unchanged: false,
    version: effectiveVersion,
    serverTime: serverTime,
    tables: tables,
    sheetTotalRows: sheetTotalRows
  };
}

// ============================================================================
// CRUD WITH LOCKSERVICE, APPENDROW, DIFF-CELL UPDATE, CONFLICT CHECK & LOG
// ============================================================================

function appendLogEntry_(ss, actor, action, targetEntity, targetId, details) {
  var sheet = ensureSheet_(ss, 'Log');
  var headers = getHeadersForSheet_(sheet, 'Log');
  var nowIso = new Date().toISOString();
  var logObj = {
    id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    actorUserId: (actor && actor.id) ? actor.id : 'system',
    actorName: (actor && actor.name) ? actor.name : 'Sistem',
    actorRole: (actor && actor.role) ? actor.role : 'kepala_sekolah',
    action: String(action || 'MUTATION'),
    targetEntity: String(targetEntity || ''),
    targetId: String(targetId || ''),
    details: String(details || ''),
    timestamp: nowIso,
    diubah_pada: nowIso,
    status: 'aktif'
  };

  var row = [];
  for (var i = 0; i < headers.length; i++) {
    row.push(serializeCellValue_(headers[i], logObj[headers[i]]));
  }
  sheet.appendRow(row);
  var newRowIdx = sheet.getLastRow();
  applyTextFormatting_(sheet, newRowIdx, headers);
  formatSingleRowTidy_(sheet, newRowIdx, headers);
}

function handleAppendLogOnly_(ss, payload) {
  appendLogEntry_(
    ss,
    payload.actor,
    payload.logAction || 'CLIENT_EVENT',
    payload.targetEntity || 'System',
    payload.targetId || '',
    payload.details || ''
  );
  return { ok: true, serverTime: new Date().toISOString() };
}

function handleCreateRow_(ss, payload) {
  var tableName = String(payload.table || '');
  var record = payload.record;
  if (!SCHEMAS[tableName] || !record || !record.id) {
    return { ok: false, code: 400, error: 'Parameter createRow tidak lengkap (table & record.id wajib).' };
  }

  var sheet = ensureSheet_(ss, tableName);
  var existingIdx = findRowIndexById_(sheet, record.id);
  if (existingIdx !== -1) {
    return { ok: false, code: 409, error: 'ID "' + record.id + '" sudah ada di sheet ' + tableName + '.' };
  }

  var headers = getHeadersForSheet_(sheet, tableName);
  var serverIso = new Date().toISOString();
  var mapped = mapFrontendToSheetRecord_(tableName, record);
  mapped.diubah_pada = serverIso;
  if (mapped.updatedAt !== undefined || headers.indexOf('updatedAt') !== -1) {
    mapped.updatedAt = mapped.updatedAt || serverIso;
  }
  mapped.status = 'aktif';

  var rowValues = [];
  for (var i = 0; i < headers.length; i++) {
    var col = headers[i];
    rowValues.push(serializeCellValue_(col, mapped[col]));
  }

  sheet.appendRow(rowValues);
  var insertedRow = sheet.getLastRow();
  applyTextFormatting_(sheet, insertedRow, headers);
  formatSingleRowTidy_(sheet, insertedRow, headers);

  appendLogEntry_(
    ss,
    payload.actor,
    'CREATE_' + tableName.toUpperCase(),
    tableName,
    record.id,
    payload.logDetails || ('Menambah data baru pada sheet ' + tableName + ' (ID: ' + record.id + ')')
  );

  var saved = mapSheetRowToFrontendRecord_(tableName, headers, rowValues);
  return { ok: true, record: saved, serverTime: serverIso };
}

function handleUpdateRow_(ss, payload) {
  var tableName = String(payload.table || '');
  var id = String(payload.id || (payload.record && payload.record.id) || '').trim();
  var updates = payload.updates || payload.record;
  if (!SCHEMAS[tableName] || !id || !updates) {
    return { ok: false, code: 400, error: 'Parameter updateRow tidak lengkap (table, id, updates wajib).' };
  }

  var sheet = ensureSheet_(ss, tableName);
  var rowIdx = findRowIndexById_(sheet, id);
  if (rowIdx === -1) {
    return { ok: false, code: 404, error: 'Data dengan ID "' + id + '" tidak ditemukan di sheet ' + tableName + '.' };
  }

  var headers = getHeadersForSheet_(sheet, tableName);
  var currentRowValues = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
  var currentFrontend = mapSheetRowToFrontendRecord_(tableName, headers, currentRowValues);

  var colDiubah = headers.indexOf('diubah_pada');
  var currentDiubahPada = colDiubah !== -1 ? String(deserializeCellValue_('diubah_pada', currentRowValues[colDiubah]) || '') : '';
  var expectedUpdatedAt = payload.expectedUpdatedAt ? String(payload.expectedUpdatedAt).trim() : '';

  if (expectedUpdatedAt && currentDiubahPada && expectedUpdatedAt !== currentDiubahPada) {
    return {
      ok: false,
      code: 409,
      conflict: true,
      error: 'Peringatan Konflik Data: Data di sheet ' + tableName + ' telah diubah oleh pengguna lain pada ' + currentDiubahPada + '. Data terbaru dimuat ulang ke layar Anda.',
      serverRecord: currentFrontend,
      serverDiubahPada: currentDiubahPada
    };
  }

  var serverIso = new Date().toISOString();
  var mappedUpdates = mapFrontendToSheetRecord_(tableName, updates);
  delete mappedUpdates.id;
  mappedUpdates.diubah_pada = serverIso;
  if (headers.indexOf('updatedAt') !== -1) {
    mappedUpdates.updatedAt = serverIso;
  }

  var changedCols = [];
  for (var c = 0; c < headers.length; c++) {
    var colName = headers[c];
    if (colName === 'id') continue;
    if (!(colName in mappedUpdates)) continue;

    var nextSerialized = serializeCellValue_(colName, mappedUpdates[colName]);
    var curDeserialized = deserializeCellValue_(colName, currentRowValues[c]);
    var curSerialized = serializeCellValue_(colName, curDeserialized);

    if (String(nextSerialized) !== String(curSerialized)) {
      var cell = sheet.getRange(rowIdx, c + 1);
      if (TEXT_COLUMNS[colName]) cell.setNumberFormat('@');
      cell.setValue(nextSerialized);
      currentRowValues[c] = nextSerialized;
      changedCols.push(colName);
    }
  }

  appendLogEntry_(
    ss,
    payload.actor,
    'UPDATE_' + tableName.toUpperCase(),
    tableName,
    id,
    payload.logDetails || ('Memperbarui kolom [' + changedCols.join(', ') + '] pada ' + tableName + ' ID: ' + id)
  );

  var updatedRecord = mapSheetRowToFrontendRecord_(tableName, headers, currentRowValues);
  return {
    ok: true,
    record: updatedRecord,
    changedColumns: changedCols,
    serverTime: serverIso
  };
}

function handleSoftDeleteRow_(ss, payload) {
  var tableName = String(payload.table || '');
  var id = String(payload.id || '').trim();
  if (!SCHEMAS[tableName] || !id) {
    return { ok: false, code: 400, error: 'Parameter softDeleteRow tidak lengkap.' };
  }

  var sheet = ensureSheet_(ss, tableName);
  var rowIdx = findRowIndexById_(sheet, id);
  if (rowIdx === -1) {
    return { ok: false, code: 404, error: 'Data dengan ID "' + id + '" tidak ditemukan.' };
  }

  var headers = getHeadersForSheet_(sheet, tableName);
  var currentRowValues = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
  var colDiubah = headers.indexOf('diubah_pada');
  var currentDiubahPada = colDiubah !== -1 ? String(deserializeCellValue_('diubah_pada', currentRowValues[colDiubah]) || '') : '';
  var expectedUpdatedAt = payload.expectedUpdatedAt ? String(payload.expectedUpdatedAt).trim() : '';

  if (expectedUpdatedAt && currentDiubahPada && expectedUpdatedAt !== currentDiubahPada) {
    return {
      ok: false,
      code: 409,
      conflict: true,
      error: 'Peringatan Konflik Data: Baris ini telah diubah pengguna lain sebelum dihapus.',
      serverRecord: mapSheetRowToFrontendRecord_(tableName, headers, currentRowValues)
    };
  }

  var serverIso = new Date().toISOString();
  var colStatus = headers.indexOf('status');
  if (colStatus !== -1) {
    sheet.getRange(rowIdx, colStatus + 1).setValue('dihapus');
  }
  if (colDiubah !== -1) {
    sheet.getRange(rowIdx, colDiubah + 1).setNumberFormat('@').setValue(serverIso);
  }

  appendLogEntry_(
    ss,
    payload.actor,
    'SOFT_DELETE_' + tableName.toUpperCase(),
    tableName,
    id,
    payload.logDetails || ('Menghapus (soft delete status=dihapus) pada ' + tableName + ' ID: ' + id)
  );

  return { ok: true, id: id, serverTime: serverIso };
}

function handleUpsertSettings_(ss, payload) {
  var settingsData = payload.record || payload.updates || {};
  settingsData.id = 'global';
  var sheet = ensureSheet_(ss, 'Settings');
  var rowIdx = findRowIndexById_(sheet, 'global');
  if (rowIdx === -1) {
    return handleCreateRow_(ss, {
      table: 'Settings',
      record: settingsData,
      actor: payload.actor,
      logDetails: payload.logDetails || 'Menyimpan konfigurasi awal sekolah.'
    });
  }
  return handleUpdateRow_(ss, {
    table: 'Settings',
    id: 'global',
    updates: settingsData,
    expectedUpdatedAt: payload.expectedUpdatedAt,
    actor: payload.actor,
    logDetails: payload.logDetails || 'Memperbarui konfigurasi sekolah.'
  });
}

// ============================================================================
// FACE REGISTRY + GOOGLE DRIVE STORAGE (FOLDER PRIVAT VIA DRIVEAPP)
// ============================================================================

function lookupUserIdentityForFace_(ss, userId, fallbackName, fallbackNip) {
  var outName = String(fallbackName || '').trim();
  var outNip = String(fallbackNip || '').trim();
  if (outName && outNip) return { name: outName, nip: outNip };
  try {
    var uSheet = ss.getSheetByName('Users');
    if (uSheet && uSheet.getLastRow() >= 2) {
      var uHeaders = getHeadersForSheet_(uSheet, 'Users');
      var cId = uHeaders.indexOf('id');
      var cName = uHeaders.indexOf('name');
      var cNip = uHeaders.indexOf('nip');
      var uVals = uSheet.getRange(2, 1, uSheet.getLastRow() - 1, uHeaders.length).getValues();
      for (var i = 0; i < uVals.length; i++) {
        if (String(uVals[i][cId !== -1 ? cId : 0] || '').trim() === String(userId).trim()) {
          if (!outName && cName !== -1) outName = String(uVals[i][cName] || '').trim();
          if (!outNip && cNip !== -1) outNip = String(uVals[i][cNip] || '').trim();
          break;
        }
      }
    }
  } catch (ignoreErr) {}
  return { name: outName, nip: outNip };
}

function handleSaveFace_(ss, props, payload) {
  if (!props.DRIVE_FOLDER_ID) {
    return {
      ok: false,
      code: 500,
      error: 'Script Property DRIVE_FOLDER_ID masih kosong. Tidak dapat menyimpan foto wajah ke Drive.'
    };
  }

  var item = payload.record || {};
  if (!item.userId || !item.faceEmbedding) {
    return { ok: false, code: 400, error: 'Data userId dan faceEmbedding wajib dikirim.' };
  }

  var identity = lookupUserIdentityForFace_(ss, item.userId, item.userName, item.nip);
  var resolvedName = identity.name || String(item.userName || item.userId);
  var resolvedNip = identity.nip || String(item.nip || '');

  var sheet = ensureSheet_(ss, 'FaceRegistry');
  var headers = getHeadersForSheet_(sheet, 'FaceRegistry');
  var lastRow = sheet.getLastRow();
  var colUserId = headers.indexOf('userId');
  var colPhotoFileId = headers.indexOf('registeredPhotoFileId');
  var existingRowIdx = -1;
  var existingId = item.id || ('face-' + Date.now() + '-' + Math.floor(Math.random() * 1000));
  var previousFileId = String(item.registeredPhotoFileId || '').trim();

  if (lastRow >= 2 && colUserId !== -1) {
    var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var i = 0; i < rows.length; i++) {
      var stCol = headers.indexOf('status');
      var rowSt = stCol !== -1 ? String(rows[i][stCol] || '') : 'aktif';
      if (rowSt === 'dihapus') continue;
      if (String(rows[i][colUserId]) === String(item.userId)) {
        existingRowIdx = i + 2;
        existingId = String(rows[i][0]);
        if (colPhotoFileId !== -1 && rows[i][colPhotoFileId]) {
          previousFileId = String(rows[i][colPhotoFileId]).trim();
        }
        break;
      }
    }
  }

  var photoBase64 = String(payload.photoBase64 || '');
  var fileId = previousFileId;

  if (photoBase64 && photoBase64.indexOf('data:image/') === 0) {
    var mime = 'image/jpeg';
    var rawBase64 = photoBase64;
    var match = photoBase64.match(new RegExp('^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$'));
    if (match) {
      mime = match[1];
      rawBase64 = match[2];
    }
    var bytes = Utilities.base64Decode(rawBase64);
    var safeName = resolvedName.replace(new RegExp('[^a-zA-Z0-9]+', 'g'), '_').replace(new RegExp('^_+|_+$', 'g'), '').slice(0, 48) || 'Pegawai';
    var safeNip = resolvedNip.replace(new RegExp('[^a-zA-Z0-9-]+', 'g'), '_').replace(new RegExp('^_+|_+$', 'g'), '');
    var fileName = 'WAJAH_' + safeName + (safeNip ? '_NIP_' + safeNip : '') + '.jpg';
    var blob = Utilities.newBlob(bytes, mime, fileName);
    var folder = DriveApp.getFolderById(props.DRIVE_FOLDER_ID);
    var driveFile = folder.createFile(blob);
    fileId = driveFile.getId();

    // Rapikan Drive: pindahkan foto wajah lama milik user yang sama ke Trash agar 1 orang = 1 foto wajah terbaru & rapi
    if (previousFileId && previousFileId !== fileId) {
      try {
        var oldFile = DriveApp.getFileById(previousFileId);
        if (oldFile && !oldFile.isTrashed() && isFileUnderFolderTree_(oldFile, props.DRIVE_FOLDER_ID, 3)) {
          oldFile.setTrashed(true);
        }
      } catch (trashErr) {}
    }
  } else if (previousFileId) {
    // Pastikan nama file yang sudah ada tetap rapi sesuai Nama & NIP
    try {
      var existingDriveFile = DriveApp.getFileById(previousFileId);
      if (existingDriveFile && !existingDriveFile.isTrashed()) {
        var sName2 = resolvedName.replace(new RegExp('[^a-zA-Z0-9]+', 'g'), '_').replace(new RegExp('^_+|_+$', 'g'), '').slice(0, 48) || 'Pegawai';
        var sNip2 = resolvedNip.replace(new RegExp('[^a-zA-Z0-9-]+', 'g'), '_').replace(new RegExp('^_+|_+$', 'g'), '');
        var cleanTargetName = 'WAJAH_' + sName2 + (sNip2 ? '_NIP_' + sNip2 : '') + '.jpg';
        if (existingDriveFile.getName() !== cleanTargetName) {
          existingDriveFile.setName(cleanTargetName);
        }
      }
    } catch (renamePhotoErr) {}
  }

  var recordPayload = {
    id: existingId,
    userId: item.userId,
    nip: resolvedNip,
    userName: resolvedName,
    role: item.role || 'karyawan',
    faceEmbedding: item.faceEmbedding,
    registeredPhotoFileId: fileId,
    registeredBy: item.registeredBy || (payload.actor && payload.actor.name) || 'Admin',
    cameraUsed: item.cameraUsed || 'user',
    qualityScore: Number(item.qualityScore || 90),
    updatedAt: new Date().toISOString(),
    isActive: item.isActive !== false
  };

  if (existingRowIdx !== -1) {
    return handleUpdateRow_(ss, {
      table: 'FaceRegistry',
      id: existingId,
      updates: recordPayload,
      expectedUpdatedAt: payload.expectedUpdatedAt,
      actor: payload.actor,
      logDetails: 'Memperbarui foto wajah Drive (' + resolvedName + ', ID: ' + fileId + ')'
    });
  } else {
    return handleCreateRow_(ss, {
      table: 'FaceRegistry',
      record: recordPayload,
      actor: payload.actor,
      logDetails: 'Menyimpan foto wajah baru di Drive (' + resolvedName + ', ID: ' + fileId + ')'
    });
  }
}

function isFileUnderFolderTree_(file, rootFolderId, maxDepth) {
  if (!rootFolderId) return true;
  try {
    var queue = [];
    var parents = file.getParents();
    while (parents.hasNext()) {
      var p = parents.next();
      if (p.getId() === rootFolderId) return true;
      queue.push({ folder: p, depth: 1 });
    }
    while (queue.length > 0) {
      var item = queue.shift();
      if (item.depth >= maxDepth) continue;
      var gp = item.folder.getParents();
      while (gp.hasNext()) {
        var g = gp.next();
        if (g.getId() === rootFolderId) return true;
        queue.push({ folder: g, depth: item.depth + 1 });
      }
    }
  } catch (e) {
    // ignore parent traversal error
  }
  return false;
}

function handleGetPhoto_(fileId) {
  if (!fileId) {
    return { ok: false, code: 400, error: 'Parameter fileId wajib diisi.' };
  }
  var props = getProps_();
  var file = DriveApp.getFileById(fileId);
  if (file.isTrashed()) {
    return { ok: false, code: 404, error: 'File foto sudah dihapus dari Drive.' };
  }
  if (props.DRIVE_FOLDER_ID) {
    var belongs = isFileUnderFolderTree_(file, props.DRIVE_FOLDER_ID, 3);
    if (!belongs && props.SPREADSHEET_ID) {
      // Izinkan jika fileId memang terdaftar aktif di sheet FaceRegistry
      try {
        var ss = SpreadsheetApp.openById(props.SPREADSHEET_ID);
        var sh = ss.getSheetByName('FaceRegistry');
        if (sh && sh.getLastRow() >= 2) {
          var headers = getHeadersForSheet_(sh, 'FaceRegistry');
          var colFid = headers.indexOf('registeredPhotoFileId');
          if (colFid !== -1) {
            var vals = sh.getRange(2, colFid + 1, sh.getLastRow() - 1, 1).getValues();
            for (var i = 0; i < vals.length; i++) {
              if (String(vals[i][0]).trim() === fileId) {
                belongs = true;
                break;
              }
            }
          }
        }
      } catch (ignoreErr) {}
    }
    if (!belongs) {
      return { ok: false, code: 403, error: 'File tidak berada di folder database yang diizinkan.' };
    }
  }
  var blob = file.getBlob();
  var mime = blob.getContentType() || 'image/jpeg';
  var b64 = Utilities.base64Encode(blob.getBytes());
  return {
    ok: true,
    fileId: fileId,
    mimeType: mime,
    dataUrl: 'data:' + mime + ';base64,' + b64
  };
}

// ============================================================================
// ATTENDANCE BATCH (WAKTU SERVER, TOLAK DUPLIKAT HARI YANG SAMA, TANPA FOTO)
// ============================================================================

function handleRecordAttendanceBatch_(ss, payload) {
  var items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) {
    return { ok: true, accepted: [], rejected: [], serverTime: new Date().toISOString() };
  }

  var sheet = ensureSheet_(ss, 'Attendance');
  var headers = getHeadersForSheet_(sheet, 'Attendance');
  var serverNow = new Date();
  var serverDate = Utilities.formatDate(serverNow, TIMEZONE, 'yyyy-MM-dd');
  var serverIso = serverNow.toISOString();

  var lastRow = sheet.getLastRow();
  var existingKeys = {};
  var colUserId = headers.indexOf('userId');
  var colDate = headers.indexOf('date');
  var colType = headers.indexOf('type');
  var colSession = headers.indexOf('sessionId');
  var colStatus = headers.indexOf('status');

  if (lastRow >= 2) {
    var rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var r = 0; r < rows.length; r++) {
      if (!rows[r][0]) continue;
      if (colStatus !== -1 && String(rows[r][colStatus]).toLowerCase() === 'dihapus') continue;
      var rDate = colDate !== -1 ? String(deserializeCellValue_('date', rows[r][colDate]) || '') : '';
      var rUid = colUserId !== -1 ? String(rows[r][colUserId] || '') : '';
      var rType = colType !== -1 ? String(rows[r][colType] || '') : '';
      var rSess = colSession !== -1 ? String(rows[r][colSession] || 'default') : 'default';
      existingKeys[rUid + '|' + rDate + '|' + rType + '|' + rSess] = true;
    }
  }

  var accepted = [];
  var rejected = [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item || !item.userId || !item.type) {
      rejected.push({
        clientId: item && item.id,
        reason: 'Data presensi tidak lengkap (userId atau type kosong).'
      });
      continue;
    }

    var effectiveDate = serverDate;
    var effectiveTimestamp = serverIso;
    var sessKey = String(item.sessionId || 'default');
    var dupKey = String(item.userId) + '|' + effectiveDate + '|' + String(item.type) + '|' + sessKey;

    if (existingKeys[dupKey]) {
      rejected.push({
        clientId: item.id,
        userId: item.userId,
        type: item.type,
        sessionId: item.sessionId,
        reason: 'Ditolak server: Presensi ' + String(item.type).toUpperCase() + ' pada tanggal ' + effectiveDate + ' untuk sesi ini sudah tercatat sebelumnya.'
      });
      continue;
    }

    existingKeys[dupKey] = true;

    var recId = item.id || ('att-' + Date.now() + '-' + i + '-' + Math.floor(Math.random() * 1000));
    var cleanRecord = {
      id: recId,
      userId: item.userId,
      nip: item.nip || '',
      userName: item.userName || '',
      role: item.role || 'karyawan',
      date: effectiveDate,
      type: item.type,
      timestamp: effectiveTimestamp,
      attendanceStatus: item.status || 'tepat_waktu',
      latitude: Number(item.latitude || 0),
      longitude: Number(item.longitude || 0),
      distanceFromLocationMeters: Number(item.distanceFromLocationMeters || 0),
      isLocationValid: item.isLocationValid !== false,
      isFaceValid: item.isFaceValid !== false,
      faceSimilarityScore: Number(item.faceSimilarityScore || 0),
      deviceInfo: String(item.deviceInfo || ''),
      notes: String(item.notes || ''),
      sessionId: String(item.sessionId || ''),
      sessionName: String(item.sessionName || ''),
      diubah_pada: serverIso,
      status: 'aktif'
    };

    var rowVals = [];
    for (var c = 0; c < headers.length; c++) {
      rowVals.push(serializeCellValue_(headers[c], cleanRecord[headers[c]]));
    }

    sheet.appendRow(rowVals);
    var appendedAttRow = sheet.getLastRow();
    applyTextFormatting_(sheet, appendedAttRow, headers);
    formatSingleRowTidy_(sheet, appendedAttRow, headers);

    appendLogEntry_(
      ss,
      { id: item.userId, name: item.userName, role: item.role },
      'ATTENDANCE_' + String(item.type).toUpperCase(),
      'Attendance',
      recId,
      'Presensi ' + String(item.type).toUpperCase() + ' oleh ' + item.userName + ' (NIP: ' + item.nip + ') | Sesi: ' + (item.sessionName || '-') + ' | Cocok Wajah: ' + Math.round(Number(item.faceSimilarityScore || 0) * 100) + '% | Jarak: ' + Number(item.distanceFromLocationMeters || 0) + 'm'
    );

    accepted.push(mapSheetRowToFrontendRecord_('Attendance', headers, rowVals));
  }

  return {
    ok: true,
    accepted: accepted,
    rejected: rejected,
    serverDate: serverDate,
    serverTime: serverIso
  };
}

// ============================================================================
// BOOTSTRAP INITIAL SEED / SINKRON DATA LOKAL SAAT SHEET MASIH KOSONG
// ============================================================================

function handleSeedInitialIfEmpty_(ss, payload) {
  var createdCounts = {
    users: 0,
    schedules: 0,
    departments: 0,
    locations: 0,
    faceRegistry: 0,
    attendance: 0,
    leaveRequests: 0,
    assignments: 0
  };

  var seedTableList = [
    { sheetName: 'Users', list: payload.users, countKey: 'users', label: 'pengguna' },
    { sheetName: 'Schedules', list: payload.schedules, countKey: 'schedules', label: 'jadwal sesi' },
    { sheetName: 'Departments', list: payload.departments, countKey: 'departments', label: 'departemen' },
    { sheetName: 'Locations', list: payload.locations, countKey: 'locations', label: 'lokasi' },
    { sheetName: 'FaceRegistry', list: payload.faceRegistry, countKey: 'faceRegistry', label: 'database wajah' },
    { sheetName: 'Attendance', list: payload.attendance, countKey: 'attendance', label: 'riwayat presensi' },
    { sheetName: 'LeaveRequests', list: payload.leaveRequests, countKey: 'leaveRequests', label: 'perizinan' },
    { sheetName: 'Assignments', list: payload.assignments, countKey: 'assignments', label: 'penugasan' }
  ];

  for (var t = 0; t < seedTableList.length; t++) {
    var entry = seedTableList[t];
    if (!Array.isArray(entry.list) || entry.list.length === 0) continue;
    var sheet = ensureSheet_(ss, entry.sheetName);
    if (sheet.getLastRow() > 1) continue; // Jangan timpa jika Sheet sudah berisi data

    for (var i = 0; i < entry.list.length; i++) {
      var rec = entry.list[i];
      if (!rec || !rec.id) continue;
      if (entry.sheetName === 'Attendance') {
        rec.photoRef = '';
      }
      var res = handleCreateRow_(ss, {
        table: entry.sheetName,
        record: rec,
        actor: payload.actor,
        logDetails: 'Sinkron awal ' + entry.label + ' ke Google Sheets & Drive.'
      });
      if (res.ok) createdCounts[entry.countKey]++;
    }
  }

  if (payload.settings && typeof payload.settings === 'object') {
    var settingsSheet = ensureSheet_(ss, 'Settings');
    if (settingsSheet.getLastRow() <= 1) {
      handleUpsertSettings_(ss, {
        record: payload.settings,
        actor: payload.actor,
        logDetails: 'Sinkron awal pengaturan sekolah.'
      });
    }
  }

  return { ok: true, createdCounts: createdCounts, serverTime: new Date().toISOString() };
}

// ============================================================================
// PERBAIKAN SPREADSHEET ID & REKONSILIASI KETIDAKSINKRONAN SHEET
// ============================================================================

function extractSpreadsheetId_(rawInput) {
  var s = String(rawInput || '').trim();
  if (!s) return '';
  var match = s.match(new RegExp('/spreadsheets/d/([a-zA-Z0-9-_]+)'));
  if (match) return match[1];
  return s;
}

function handleUpdateSheetBinding_(payload) {
  var rawId = payload && (payload.spreadsheetId || payload.sheetId);
  var newSheetId = extractSpreadsheetId_(rawId);
  if (!newSheetId || newSheetId.length < 15) {
    return {
      ok: false,
      code: 400,
      error: 'ID Spreadsheet tidak valid. Tempel ID Google Spreadsheet (atau URL lengkap docs.google.com/spreadsheets/d/...).'
    };
  }

  try {
    var targetSs = SpreadsheetApp.openById(newSheetId);
    var sp = PropertiesService.getScriptProperties();
    sp.setProperty('SPREADSHEET_ID', newSheetId);
    sp.deleteProperty('SCHEMA_INIT_KEY');
    sp.deleteProperty('LAST_BOUND_SHEET_ID');
    sp.deleteProperty('LAST_DRIVE_SCAN_MS');
    sp.deleteProperty('LAST_LEGACY_TAB_SCAN_MS');

    var sheetsMap = getSheetsMap_(targetSs);
    ensureAllSheets_(targetSs, sheetsMap);
    bumpDataVersion_();

    appendLogEntry_(
      targetSs,
      payload.actor,
      'UPDATE_SHEET_BINDING',
      'Settings',
      newSheetId,
      'Mengubah / memperbarui SPREADSHEET_ID menjadi ' + newSheetId + ' (' + targetSs.getName() + ').'
    );

    return {
      ok: true,
      spreadsheetId: newSheetId,
      sheetName: targetSs.getName(),
      serverTime: new Date().toISOString()
    };
  } catch (err) {
    return {
      ok: false,
      code: 400,
      error: 'Gagal membuka Spreadsheet ID "' + newSheetId + '". Pastikan ID benar dan akun Google pemilik Apps Script punya akses Edit. (' + (err && err.message ? err.message : err) + ')'
    };
  }
}

function countMissingFacePhotos_(ss, sheetsMap) {
  var sh = (sheetsMap && sheetsMap['FaceRegistry']) ? sheetsMap['FaceRegistry'] : ss.getSheetByName('FaceRegistry');
  if (!sh || sh.getLastRow() < 2) return 0;
  var headers = getHeadersForSheet_(sh, 'FaceRegistry');
  var cFid = headers.indexOf('registeredPhotoFileId');
  var cStatus = headers.indexOf('status');
  if (cFid === -1) return 0;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues();
  var count = 0;
  for (var i = 0; i < vals.length; i++) {
    if (!rowHasAnyValue_(vals[i])) continue;
    if (cStatus !== -1 && String(vals[i][cStatus] || '').toLowerCase().trim() === 'dihapus') continue;
    if (!String(vals[i][cFid] || '').trim()) count++;
  }
  return count;
}

function handleRepairSheetSync_(ss, props, sheetsMap, payload) {
  var sp = PropertiesService.getScriptProperties();
  var serverIso = new Date().toISOString();
  sp.deleteProperty('SCHEMA_INIT_KEY');
  sp.deleteProperty('LAST_LEGACY_TAB_SCAN_MS');
  sp.deleteProperty('LAST_DRIVE_SCAN_MS');

  var report = {
    tabsCreated: [],
    headersAdded: [],
    idsRepaired: 0,
    legacyRowsImported: 0,
    metadataNormalized: 0,
    demoRemoved: 0,
    photosLinked: 0,
    crossRefsRepaired: 0,
    summary: ''
  };

  var map = sheetsMap || getSheetsMap_(ss);
  var tableNames = Object.keys(SCHEMAS);

  // 1. Rapikan & perbaiki tab yang sudah ada secara in-place (rename tab alias ke nama kanonik tanpa menambah sheet dobel)
  for (var t = 0; t < tableNames.length; t++) {
    var tName = tableNames[t];
    var expected = SCHEMAS[tName];
    var existedSheet = findExistingSheetInsensitive_(ss, map, tName);
    var existed = Boolean(existedSheet);
    var beforeHeaders = existed ? getHeadersForSheet_(existedSheet, tName) : [];
    var missingCols = [];
    if (existed) {
      for (var hc = 0; hc < expected.length; hc++) {
        if (beforeHeaders.indexOf(expected[hc]) === -1) {
          missingCols.push(expected[hc]);
        }
      }
    }
    var ensuredSh = ensureSheet_(ss, tName, map);
    formatSheetTidy_(ensuredSh, tName, getHeadersForSheet_(ensuredSh, tName));
    if (!existed && !findExistingSheetInsensitive_(ss, null, tName)) {
      report.tabsCreated.push(tName);
    } else if (!existed) {
      // Tab baru terdeteksi atau direname dari tab alias
      if (ensuredSh.getLastRow() <= 1) {
        report.tabsCreated.push(tName);
      }
    } else if (missingCols.length > 0) {
      report.headersAdded.push({ table: tName, columns: missingCols });
    }
  }
  sp.setProperty('SCHEMA_INIT_KEY', ss.getId() + ':v4');
  map = getSheetsMap_(ss);

  // 2. Hitung total baris sebelum impor legacy + foto wajah kosong sebelum scan Drive
  var beforeMissingPhotos = countMissingFacePhotos_(ss, map);
  var beforeTotalRows = 0;
  for (var bIdx = 0; bIdx < tableNames.length; bIdx++) {
    var bSh = map[tableNames[bIdx]];
    if (bSh) beforeTotalRows += Math.max(0, bSh.getLastRow() - 1);
  }

  hydrateLegacyDataIfNeeded_(ss, props, map, true);
  map = getSheetsMap_(ss);

  var afterTotalRows = 0;
  for (var aIdx = 0; aIdx < tableNames.length; aIdx++) {
    var aSh = map[tableNames[aIdx]];
    if (aSh) afterTotalRows += Math.max(0, aSh.getLastRow() - 1);
  }
  report.legacyRowsImported = Math.max(0, afterTotalRows - beforeTotalRows);

  var afterMissingPhotos = countMissingFacePhotos_(ss, map);
  report.photosLinked = Math.max(0, beforeMissingPhotos - afterMissingPhotos);

  // Rapikan ulang foto wajah di Drive jika masih menggunakan nama lama agar rapi berdasar Nama & NIP
  if (props.DRIVE_FOLDER_ID) {
    try {
      var frSheet = map['FaceRegistry'] || ss.getSheetByName('FaceRegistry');
      if (frSheet && frSheet.getLastRow() >= 2) {
        var frHeaders = getHeadersForSheet_(frSheet, 'FaceRegistry');
        var fColFid = frHeaders.indexOf('registeredPhotoFileId');
        var fColName = frHeaders.indexOf('userName');
        var fColNip = frHeaders.indexOf('nip');
        var fColSt = frHeaders.indexOf('status');
        if (fColFid !== -1) {
          var frVals = frSheet.getRange(2, 1, frSheet.getLastRow() - 1, frHeaders.length).getValues();
          for (var fi = 0; fi < frVals.length; fi++) {
            if (fColSt !== -1 && String(frVals[fi][fColSt] || '').toLowerCase().trim() === 'dihapus') continue;
            var fidVal = String(frVals[fi][fColFid] || '').trim();
            if (!fidVal) continue;
            var fNameVal = fColName !== -1 ? String(frVals[fi][fColName] || '').trim() : '';
            var fNipVal = fColNip !== -1 ? String(frVals[fi][fColNip] || '').trim() : '';
            if (!fNameVal && !fNipVal) continue;
            try {
              var drvFile = DriveApp.getFileById(fidVal);
              if (drvFile && !drvFile.isTrashed()) {
                var cleanNm = (fNameVal || 'Pegawai').replace(new RegExp('[^a-zA-Z0-9]+', 'g'), '_').replace(new RegExp('^_+|_+$', 'g'), '').slice(0, 48) || 'Pegawai';
                var cleanNp = fNipVal.replace(new RegExp('[^a-zA-Z0-9-]+', 'g'), '_').replace(new RegExp('^_+|_+$', 'g'), '');
                var desiredNm = 'WAJAH_' + cleanNm + (cleanNp ? '_NIP_' + cleanNp : '') + '.jpg';
                if (drvFile.getName() !== desiredNm) {
                  drvFile.setName(desiredNm);
                }
              }
            } catch (eRename) {}
          }
        }
      }
    } catch (eDriveTidy) {}
  }

  // 3. Normalisasi baris, bersihkan akun/data demo, perbaiki ID & relasi NIP/Nama, lalu rapikan seluruh format sheet
  var usersById = {};
  var usersByNip = {};
  var usersByNameLower = {};

  for (var ti = 0; ti < tableNames.length; ti++) {
    var tbl = tableNames[ti];
    if (tbl === 'Log') continue;
    var sheet = map[tbl] || ss.getSheetByName(tbl);
    if (!sheet) continue;
    var headers = getHeadersForSheet_(sheet, tbl);
    if (sheet.getLastRow() < 2) {
      formatSheetTidy_(sheet, tbl, headers);
      continue;
    }

    var lastRow = sheet.getLastRow();
    var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    var sheetDirty = false;

    var cId = headers.indexOf('id');
    var idIdx = cId !== -1 ? cId : 0;
    var cDiubah = headers.indexOf('diubah_pada');
    var cUpdatedAt = headers.indexOf('updatedAt');
    var cCreatedAt = headers.indexOf('createdAt');
    var cStatus = headers.indexOf('status');
    var cEmail = headers.indexOf('email');
    var cUser = headers.indexOf('username');
    var cName = headers.indexOf('name');
    var cNip = headers.indexOf('nip');
    var cRole = headers.indexOf('role');
    var cIsActive = headers.indexOf('isActive');
    var cSessions = headers.indexOf('assignedSessionIds');
    var cUid = headers.indexOf('userId');
    var cUName = headers.indexOf('userName');
    var cAttSt = headers.indexOf('attendanceStatus');
    var cLvSt = headers.indexOf('leaveStatus');
    var cAsgSt = headers.indexOf('assignmentStatus');
    var cAsgToId = headers.indexOf('assignedToUserId');
    var cAsgToName = headers.indexOf('assignedToName');

    for (var r = 0; r < values.length; r++) {
      var row = values[r];
      if (!rowHasAnyValue_(row)) continue;

      var curStatusLower = cStatus !== -1 ? String(row[cStatus] || '').toLowerCase().trim() : 'aktif';
      if (curStatusLower === 'dihapus') continue;

      var rowChanged = false;
      var curId = String(row[idIdx] || '').trim();
      if (!curId) {
        curId = (tbl === 'Settings') ? 'global' : makeRecordId_(tbl, r);
        row[idIdx] = curId;
        report.idsRepaired++;
        rowChanged = true;
      }

      // Soft delete data demo bawaan
      var emailVal = cEmail !== -1 ? row[cEmail] : '';
      var usernameVal = cUser !== -1 ? row[cUser] : '';
      if (isDemoSheetRow_(tbl, curId, emailVal, usernameVal)) {
        if (cStatus !== -1) row[cStatus] = 'dihapus';
        if (cDiubah !== -1) row[cDiubah] = serverIso;
        report.demoRemoved++;
        rowChanged = true;
        sheetDirty = true;
        continue;
      }

      // Perbaiki kolom status bawaan sheet lama pada Attendance/LeaveRequests/Assignments
      if (tbl === 'Attendance' && cStatus !== -1 && (curStatusLower === 'tepat_waktu' || curStatusLower === 'terlambat')) {
        if (cAttSt !== -1 && !row[cAttSt]) row[cAttSt] = curStatusLower;
        row[cStatus] = 'aktif';
        curStatusLower = 'aktif';
        report.metadataNormalized++;
        rowChanged = true;
      } else if (tbl === 'LeaveRequests' && cStatus !== -1 && (curStatusLower === 'menunggu' || curStatusLower === 'disetujui' || curStatusLower === 'ditolak')) {
        if (cLvSt !== -1 && !row[cLvSt]) row[cLvSt] = curStatusLower;
        row[cStatus] = 'aktif';
        curStatusLower = 'aktif';
        report.metadataNormalized++;
        rowChanged = true;
      } else if (tbl === 'Assignments' && cStatus !== -1 && (curStatusLower === 'belum_mulai' || curStatusLower === 'proses' || curStatusLower === 'selesai' || curStatusLower === 'perlu_perbaikan')) {
        if (cAsgSt !== -1 && !row[cAsgSt]) row[cAsgSt] = curStatusLower;
        row[cStatus] = 'aktif';
        curStatusLower = 'aktif';
        report.metadataNormalized++;
        rowChanged = true;
      }

      if (cStatus !== -1 && String(row[cStatus] || '').trim() !== 'aktif') {
        row[cStatus] = 'aktif';
        report.metadataNormalized++;
        rowChanged = true;
      }
      if (cDiubah !== -1 && !row[cDiubah]) {
        row[cDiubah] = serverIso;
        report.metadataNormalized++;
        rowChanged = true;
      }
      if (cCreatedAt !== -1 && !row[cCreatedAt]) {
        row[cCreatedAt] = serverIso;
        rowChanged = true;
      }
      if (cUpdatedAt !== -1 && !row[cUpdatedAt]) {
        row[cUpdatedAt] = serverIso;
        rowChanged = true;
      }

      if (tbl === 'Users') {
        if (cRole !== -1) {
          var normRole = normalizeRoleValue_(row[cRole]);
          if (String(row[cRole] || '').trim() !== normRole) {
            row[cRole] = normRole;
            report.metadataNormalized++;
            rowChanged = true;
          }
        }
        if (cUser !== -1 && !String(row[cUser] || '').trim() && cNip !== -1 && String(row[cNip] || '').trim()) {
          row[cUser] = String(row[cNip]).trim();
          report.metadataNormalized++;
          rowChanged = true;
        }
        if (cIsActive !== -1 && (row[cIsActive] === '' || row[cIsActive] === null || row[cIsActive] === undefined)) {
          row[cIsActive] = 'true';
          rowChanged = true;
        }
        if (cSessions !== -1 && !String(row[cSessions] || '').trim()) {
          row[cSessions] = JSON.stringify(['sesi-1', 'sesi-2', 'sesi-3']);
          rowChanged = true;
        }

        var uObj = {
          id: curId,
          name: cName !== -1 ? String(row[cName] || '').trim() : '',
          nip: cNip !== -1 ? String(row[cNip] || '').trim() : ''
        };
        usersById[curId] = uObj;
        if (uObj.nip) usersByNip[uObj.nip] = uObj;
        if (uObj.name) usersByNameLower[uObj.name.toLowerCase()] = uObj;
      } else if (tbl === 'FaceRegistry' || tbl === 'Attendance' || tbl === 'LeaveRequests') {
        var rUidVal = cUid !== -1 ? String(row[cUid] || '').trim() : '';
        var rNipVal = cNip !== -1 ? String(row[cNip] || '').trim() : '';
        var rNameVal = cUName !== -1 ? String(row[cUName] || '').trim() : '';
        var matchedUser = (rUidVal && usersById[rUidVal]) ||
          (rNipVal && usersByNip[rNipVal]) ||
          (rNameVal && usersByNameLower[rNameVal.toLowerCase()]) ||
          null;

        if (matchedUser) {
          var refUpdated = false;
          if (cUid !== -1 && matchedUser.id && rUidVal !== matchedUser.id) {
            row[cUid] = matchedUser.id;
            refUpdated = true;
          }
          if (cUName !== -1 && matchedUser.name && rNameVal !== matchedUser.name) {
            row[cUName] = matchedUser.name;
            refUpdated = true;
          }
          if (cNip !== -1 && matchedUser.nip && rNipVal !== matchedUser.nip) {
            row[cNip] = matchedUser.nip;
            refUpdated = true;
          }
          if (refUpdated) {
            if (cDiubah !== -1) row[cDiubah] = serverIso;
            report.crossRefsRepaired++;
            rowChanged = true;
          }
        }
      } else if (tbl === 'Assignments' && cAsgToId !== -1 && cAsgToName !== -1) {
        var aUidVal = String(row[cAsgToId] || '').trim();
        var aNameVal = String(row[cAsgToName] || '').trim();
        var matchedAsgUser = (aUidVal && usersById[aUidVal]) ||
          (aNameVal && usersByNameLower[aNameVal.toLowerCase()]) ||
          null;
        if (matchedAsgUser) {
          var asgChanged = false;
          if (matchedAsgUser.id && aUidVal !== matchedAsgUser.id) {
            row[cAsgToId] = matchedAsgUser.id;
            asgChanged = true;
          }
          if (matchedAsgUser.name && aNameVal !== matchedAsgUser.name) {
            row[cAsgToName] = matchedAsgUser.name;
            asgChanged = true;
          }
          if (asgChanged) {
            if (cDiubah !== -1) row[cDiubah] = serverIso;
            report.crossRefsRepaired++;
            rowChanged = true;
          }
        }
      }

      if (rowChanged) {
        if (cDiubah !== -1) row[cDiubah] = serverIso;
        sheetDirty = true;
      }
    }

    if (sheetDirty) {
      for (var tc = 0; tc < headers.length; tc++) {
        if (TEXT_COLUMNS[headers[tc]]) {
          sheet.getRange(2, tc + 1, lastRow - 1, 1).setNumberFormat('@');
        }
      }
      sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    }

    // Rapikan tampilan seluruh isi sheet (CLIP wrap, lebar kolom presisi, tinggi baris seragam)
    formatSheetTidy_(sheet, tbl, headers);
  }

  var logSh = map['Log'] || ss.getSheetByName('Log');
  if (logSh) {
    formatSheetTidy_(logSh, 'Log', getHeadersForSheet_(logSh, 'Log'));
  }

  var parts = [];
  if (report.tabsCreated.length > 0) parts.push(report.tabsCreated.length + ' tab dirapikan');
  if (report.headersAdded.length > 0) parts.push(report.headersAdded.length + ' tab dilengkapi kolom');
  if (report.legacyRowsImported > 0) parts.push(report.legacyRowsImported + ' baris lama diimpor');
  if (report.idsRepaired > 0) parts.push(report.idsRepaired + ' ID unik dibuat');
  if (report.metadataNormalized > 0) parts.push(report.metadataNormalized + ' metadata dinormalisasi');
  if (report.demoRemoved > 0) parts.push(report.demoRemoved + ' data demo dibersihkan');
  if (report.photosLinked > 0) parts.push(report.photosLinked + ' foto Drive ditautkan');
  if (report.crossRefsRepaired > 0) parts.push(report.crossRefsRepaired + ' relasi Nama/NIP diselaraskan');

  report.summary = parts.length > 0
    ? 'Perbaikan & perapihan selesai: ' + parts.join(', ') + '.'
    : 'Semua struktur tab, kolom, tampilan sel, foto Drive, ID unik, dan relasi data di Spreadsheet sudah rapi & sinkron.';

  appendLogEntry_(
    ss,
    payload && payload.actor,
    'REPAIR_SHEET_SYNC',
    'Settings',
    ss.getId(),
    report.summary
  );

  // Kembalikan seluruh data terbaru langsung agar aplikasi tersinkron dalam 1 request
  var finalData = handleGetChanges_('', true, false);
  return {
    ok: true,
    report: report,
    tables: finalData && finalData.tables ? finalData.tables : undefined,
    sheetTotalRows: finalData && finalData.sheetTotalRows ? finalData.sheetTotalRows : undefined,
    serverTime: serverIso
  };
}
`;

export const APPS_SCRIPT_DEPLOY_STEPS = [
  {
    step: 1,
    title: 'Buat Google Spreadsheet & Folder Drive Privat',
    desc: 'Buat 1 Google Spreadsheet baru (kosong, tidak perlu buat tab manual karena skrip otomatis membuat 10 tab lengkap) dan 1 Folder Google Drive privat untuk foto database wajah & mirror JSON. Salin ID masing-masing dari URL browser.',
  },
  {
    step: 2,
    title: 'Buka Google Apps Script & Tempel Kode Backend',
    desc: 'Buka script.google.com -> Proyek Baru (atau Extensions -> Apps Script dari Spreadsheet), hapus isi default Code.gs lalu tempel seluruh kode Code.gs dari panel di bawah, lalu tekan Ctrl+S.',
  },
  {
    step: 3,
    title: 'Isi 3 Script Properties Rahasia',
    desc: 'Di menu sebelah kiri Apps Script buka Project Settings (ikon gerigi) -> scroll ke Script Properties -> tambahkan 3 baris: SPREADSHEET_ID, DRIVE_FOLDER_ID, dan API_TOKEN (isi token rahasia bebas & panjang, misal: kitarajin-rahasia-2026-xyz).',
  },
  {
    step: 4,
    title: 'Deploy sebagai Web App (Tanpa Service Account / GCP)',
    desc: 'Klik Deploy -> New deployment (atau Manage deployments -> New version jika memperbarui kode) -> pilih Web app -> Execute as: Me -> Who has access: Anyone -> salin Web app URL (/exec).',
  },
  {
    step: 5,
    title: 'Tempel URL & Token 1x di Aplikasi & Kunci',
    desc: 'Tempel Web app URL dan API_TOKEN ke form Konfigurasi di Pengaturan (atau set VITE_APPS_SCRIPT_URL & VITE_APPS_SCRIPT_TOKEN di Environment Variables Vercel), lalu klik Simpan & Kunci agar sinkron otomatis dua arah berjalan.',
  },
];
