/**
 * 출하·배차 확인 앱 - 서버(Google Apps Script)
 *
 * 데이터는 이 스크립트가 붙어 있는 Google 시트에 저장됩니다.
 *  - "출하" 시트 : 출하 건 1건 = 1행
 *  - "설정" 시트 : 비밀번호(PIN), 회사 정보(거래명세표 공급자 정보)
 *
 * 설치 방법은 같은 폴더의 README.md 를 참고하세요.
 */

var SHEET_SHIP = '출하';
var SHEET_CFG = '설정';

// 출하 시트 열 순서 (순서를 바꾸면 기존 데이터가 어긋나므로 뒤에만 추가할 것)
var HEAD = [
  'ID', '토큰', '상태', '출하일', '거래처', '도착지', '도착지연락처',
  '품목', '합계', '요청메모',
  '운송사', '기사명', '기사전화', '차량번호', '차종', '운송사메모', '배차등록시각',
  '승인시각', '반려사유',
  '상차시각', '상차확인자', '명세표발송시각', '등록시각'
];

// 상태 값
var ST = {
  WAIT: '배차대기',      // 회사가 출하 등록 → 운송사가 배차 입력해야 함
  REQ: '승인대기',       // 운송사가 기사·차량 입력 → 회사 승인 필요
  OK: '승인완료',        // 회사 승인 → 창고 상차 담당이 확인
  REJ: '반려',           // 회사가 반려 → 운송사가 다시 입력
  DONE: '상차완료',
  CANCEL: '취소'
};

var CFG_DEFAULT = [
  ['회사PIN', '1111', '회사(관리자) 비밀번호'],
  ['운송사PIN', '2222', '운송사 비밀번호'],
  ['상차PIN', '3333', '창고 상차 담당 비밀번호'],
  ['상호', '(주)회사명', '거래명세표 공급자'],
  ['대표자', '홍길동', ''],
  ['사업자번호', '000-00-00000', ''],
  ['주소', '주소를 입력하세요', ''],
  ['전화', '000-000-0000', ''],
  ['창고주소', '창고 주소를 입력하세요', '기사 안내 문자에 표시']
];

/** 처음 한 번 실행: 시트와 기본 설정을 만듭니다. */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_SHIP) || ss.insertSheet(SHEET_SHIP);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold').setBackground('#e8f0fe');
  }
  var cfg = ss.getSheetByName(SHEET_CFG) || ss.insertSheet(SHEET_CFG);
  if (cfg.getLastRow() === 0) {
    cfg.appendRow(['항목', '값', '설명']);
    cfg.getRange(2, 1, CFG_DEFAULT.length, 3).setValues(CFG_DEFAULT);
    cfg.getRange(2, 2, CFG_DEFAULT.length, 1).setNumberFormat('@'); // 0으로 시작하는 PIN 보존
    cfg.setFrozenRows(1);
    cfg.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e8f0fe');
  }
}

// ───────────────────────── 웹 요청 처리 ─────────────────────────

function doGet() {
  return json_({ ok: true, msg: '출하·배차 확인 서버가 정상 동작 중입니다.' });
}

function doPost(e) {
  var res;
  try {
    var req = JSON.parse(e.postData.contents);
    res = handle_(req);
  } catch (err) {
    res = { ok: false, msg: String(err.message || err) };
  }
  return json_(res);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(req) {
  var a = req.action;
  // 거래명세표 보기는 비밀번호 없이 (링크의 토큰으로 확인)
  if (a === 'statement') return statement_(req.id, req.t);

  var role = roleOf_(req.pin);
  if (!role) return { ok: false, msg: '비밀번호가 맞지 않습니다.' };
  if (req.role && req.role !== role) return { ok: false, msg: '비밀번호가 맞지 않습니다.' };

  if (a === 'login') return { ok: true, role: role, company: cfg_()['상호'] };
  if (a === 'list') return { ok: true, role: role, rows: list_(role), cfg: publicCfg_() };

  var need = {
    create: 'company', edit: 'company', approve: 'company', reject: 'company', cancel: 'company',
    assign: 'carrier',
    loaded: 'loader', sent: 'loader'
  }[a];
  if (!need) return { ok: false, msg: '알 수 없는 요청입니다.' };
  if (need !== role) return { ok: false, msg: '권한이 없습니다.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return write_(a, req);
  } finally {
    lock.releaseLock();
  }
}

// ───────────────────────── 설정 ─────────────────────────

function cfg_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CFG);
  var v = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 2).getValues();
  var o = {};
  v.forEach(function (r) { if (r[0]) o[String(r[0]).trim()] = String(r[1]).trim(); });
  return o;
}

function publicCfg_() {
  var c = cfg_();
  return { 상호: c['상호'], 전화: c['전화'], 창고주소: c['창고주소'] };
}

function roleOf_(pin) {
  if (!pin) return null;
  pin = String(pin).trim();
  var c = cfg_();
  if (pin === c['회사PIN']) return 'company';
  if (pin === c['운송사PIN']) return 'carrier';
  if (pin === c['상차PIN']) return 'loader';
  return null;
}

// ───────────────────────── 조회 ─────────────────────────

function sheet_() { return SpreadsheetApp.getActive().getSheetByName(SHEET_SHIP); }

function allRows_() {
  var sh = sheet_();
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var vals = sh.getRange(2, 1, n, HEAD.length).getValues();
  return vals.map(function (r, i) {
    var o = { _row: i + 2 };
    HEAD.forEach(function (h, j) { o[h] = r[j] instanceof Date ? fmtDate_(r[j]) : r[j]; });
    try { o['품목'] = o['품목'] ? JSON.parse(o['품목']) : []; } catch (e) { o['품목'] = []; }
    return o;
  });
}

function fmtDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function now_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

function daysFromToday_(s) {
  var t = new Date(fmtDate_(new Date()) + 'T00:00:00');
  var d = new Date(String(s) + 'T00:00:00');
  return Math.round((d - t) / 86400000);
}

function list_(role) {
  var rows = allRows_().filter(function (r) {
    var dd = daysFromToday_(r['출하일']);
    if (role === 'company') return dd >= -30;
    if (role === 'carrier') return dd >= -7 && r['상태'] !== ST.CANCEL;
    // 상차 담당: 승인된 건과 최근 상차완료 건만
    return (r['상태'] === ST.OK && dd >= -7) || (r['상태'] === ST.DONE && dd >= -2);
  });
  rows.sort(function (a, b) {
    return String(a['출하일']).localeCompare(String(b['출하일'])) || a._row - b._row;
  });
  return rows.map(function (r) {
    var o = {};
    HEAD.forEach(function (h) { if (h !== '토큰') o[h] = r[h]; });
    // 운송사에는 단가·금액을 보여주지 않음
    if (role === 'carrier') {
      o['품목'] = r['품목'].map(function (it) { return { 품명: it.품명, 규격: it.규격, 수량: it.수량, 단위: it.단위 }; });
      o['합계'] = '';
    }
    // 상차 담당은 기사에게 보낼 거래명세표 토큰이 필요
    if (role === 'loader' || role === 'company') o['토큰'] = r['토큰'];
    return o;
  });
}

function statement_(id, t) {
  var r = allRows_().filter(function (x) { return x['ID'] === id; })[0];
  if (!r || !t || r['토큰'] !== t || r['상태'] === ST.CANCEL) {
    return { ok: false, msg: '거래명세표를 찾을 수 없습니다.' };
  }
  var c = cfg_();
  return {
    ok: true,
    supplier: { 상호: c['상호'], 대표자: c['대표자'], 사업자번호: c['사업자번호'], 주소: c['주소'], 전화: c['전화'] },
    doc: {
      ID: r['ID'], 출하일: r['출하일'], 거래처: r['거래처'], 도착지: r['도착지'], 도착지연락처: r['도착지연락처'],
      품목: r['품목'], 합계: r['합계'], 기사명: r['기사명'], 차량번호: r['차량번호'], 상태: r['상태']
    }
  };
}

// ───────────────────────── 저장 ─────────────────────────

function findRow_(id) {
  var sh = sheet_();
  var n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  var ids = sh.getRange(2, 1, n, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return 0;
}

function setCells_(row, obj) {
  var sh = sheet_();
  Object.keys(obj).forEach(function (k) {
    var col = HEAD.indexOf(k) + 1;
    // 전화번호·차량번호 등이 숫자/날짜로 바뀌지 않도록 텍스트로 저장
    if (col > 0) sh.getRange(row, col).setNumberFormat('@').setValue(String(obj[k]));
  });
}

function getCell_(row, key) {
  return sheet_().getRange(row, HEAD.indexOf(key) + 1).getValue();
}

function clean_(s, max) {
  return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 200);
}

function items_(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 30).map(function (it) {
    var q = Number(it.수량) || 0, p = Number(it.단가) || 0;
    return { 품명: clean_(it.품명, 60), 규격: clean_(it.규격, 40), 수량: q, 단위: clean_(it.단위, 10), 단가: p, 금액: q * p };
  }).filter(function (it) { return it.품명; });
}

function write_(a, req) {
  var d = req.data || {};
  var sh = sheet_();

  if (a === 'create') {
    var its = items_(d.품목);
    if (!d.출하일 || !clean_(d.거래처)) return { ok: false, msg: '출하일과 거래처는 꼭 입력해 주세요.' };
    if (!its.length) return { ok: false, msg: '품목을 1개 이상 입력해 주세요.' };
    var id = 'S' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMddHHmmss');
    while (findRow_(id)) id += 'x';
    var rec = {
      ID: id, 토큰: Utilities.getUuid().replace(/-/g, '').slice(0, 16), 상태: ST.WAIT,
      출하일: clean_(d.출하일, 10), 거래처: clean_(d.거래처, 60), 도착지: clean_(d.도착지, 120),
      도착지연락처: clean_(d.도착지연락처, 30), 품목: JSON.stringify(its),
      합계: its.reduce(function (s, it) { return s + it.금액; }, 0), 요청메모: clean_(d.요청메모, 200),
      등록시각: now_()
    };
    sh.appendRow(HEAD.map(function (h) { return rec[h] == null ? '' : rec[h]; }));
    sh.getRange(sh.getLastRow(), HEAD.indexOf('출하일') + 1).setNumberFormat('@').setValue(rec.출하일);
    return { ok: true, id: id };
  }

  var row = findRow_(req.id);
  if (!row) return { ok: false, msg: '해당 출하 건을 찾을 수 없습니다.' };
  var st = getCell_(row, '상태');

  if (a === 'edit') {
    if (st === ST.DONE || st === ST.CANCEL) return { ok: false, msg: '상차완료/취소된 건은 수정할 수 없습니다.' };
    var its2 = items_(d.품목);
    if (!its2.length) return { ok: false, msg: '품목을 1개 이상 입력해 주세요.' };
    setCells_(row, {
      거래처: clean_(d.거래처, 60), 도착지: clean_(d.도착지, 120), 도착지연락처: clean_(d.도착지연락처, 30),
      품목: JSON.stringify(its2), 합계: its2.reduce(function (s, it) { return s + it.금액; }, 0),
      요청메모: clean_(d.요청메모, 200)
    });
    sh.getRange(row, HEAD.indexOf('출하일') + 1).setNumberFormat('@').setValue(clean_(d.출하일, 10));
    return { ok: true };
  }

  if (a === 'assign') {
    if ([ST.WAIT, ST.REJ, ST.REQ].indexOf(st) < 0) return { ok: false, msg: '이미 승인된 건은 회사에 전화로 변경을 요청해 주세요.' };
    var plate = clean_(d.차량번호, 20).replace(/\s+/g, '');
    var phone = clean_(d.기사전화, 20).replace(/[^0-9]/g, '');
    if (!clean_(d.기사명) || !plate || phone.length < 9) return { ok: false, msg: '기사 이름, 전화번호, 차량번호를 모두 입력해 주세요.' };
    setCells_(row, {
      상태: ST.REQ, 운송사: clean_(d.운송사, 40), 기사명: clean_(d.기사명, 20), 기사전화: phone,
      차량번호: plate, 차종: clean_(d.차종, 20), 운송사메모: clean_(d.운송사메모, 200),
      배차등록시각: now_(), 반려사유: ''
    });
    return { ok: true };
  }

  if (a === 'approve') {
    if (st !== ST.REQ) return { ok: false, msg: '승인대기 상태인 건만 승인할 수 있습니다.' };
    setCells_(row, { 상태: ST.OK, 승인시각: now_() });
    return { ok: true };
  }

  if (a === 'reject') {
    if (st !== ST.REQ && st !== ST.OK) return { ok: false, msg: '반려할 수 없는 상태입니다.' };
    setCells_(row, { 상태: ST.REJ, 반려사유: clean_(d.사유, 200) || '재배차 요청', 승인시각: '' });
    return { ok: true };
  }

  if (a === 'cancel') {
    if (st === ST.DONE) return { ok: false, msg: '상차완료된 건은 취소할 수 없습니다.' };
    setCells_(row, { 상태: ST.CANCEL });
    return { ok: true };
  }

  if (a === 'loaded') {
    if (st !== ST.OK) return { ok: false, msg: '승인완료 상태인 건만 상차완료 처리할 수 있습니다.' };
    setCells_(row, { 상태: ST.DONE, 상차시각: now_(), 상차확인자: clean_(d.확인자, 20) });
    return { ok: true };
  }

  if (a === 'sent') {
    setCells_(row, { 명세표발송시각: now_() });
    return { ok: true };
  }

  return { ok: false, msg: '알 수 없는 요청입니다.' };
}
