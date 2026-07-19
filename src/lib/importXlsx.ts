import * as XLSX from "xlsx";
import { getDb } from "@/lib/db";
import { inferShift } from "@/lib/types";

function excelDateToStr(v: unknown): string | null {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function excelTimeToStr(v: unknown): string | null {
  if (v instanceof Date) {
    const h = String(v.getHours()).padStart(2, "0");
    const m = String(v.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
  if (typeof v === "number") {
    const totalMinutes = Math.round(v * 24 * 60);
    const h = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
    const m = String(totalMinutes % 60).padStart(2, "0");
    return `${h}:${m}`;
  }
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  skippedDetails: string[];
  structureError?: string;
}

function emptyResult(): ImportResult {
  return { inserted: 0, updated: 0, skipped: 0, errors: [], skippedDetails: [] };
}

// 설비가동정보 (파일1) 형식 파싱: 날짜/주야 2행 1세트, row 5(index4)부터 데이터 시작
export function importProductionLog(buf: Buffer): ImportResult {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const header = rows[1] ?? [];
  if (str(header[0]) !== "날짜" || str(header[1]) !== "주/야") {
    return {
      ...emptyResult(),
      structureError:
        "이 파일은 예상한 설비가동정보 형식이 아닙니다 (2행에 '날짜', '주/야' 헤더가 있어야 합니다). 원본 엑셀 양식이 바뀌었는지 확인해주세요.",
    };
  }

  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO production_log (
      date, shift, product, daily_pack_amount, dryer_temp_a, dryer_temp_b,
      feed_hopper_a, feed_hopper_b, feed_fine_powder, feed_mixer, feed_molder, feed_total,
      brix, line_hours_a, line_hours_b, line_hours_total,
      lng_dryer, lng_rto, gas_usage_shift, gas_usage_total,
      moisture_manual, hardness_manual
    ) VALUES (@date, @shift, @product, @daily_pack_amount, @dryer_temp_a, @dryer_temp_b,
      @feed_hopper_a, @feed_hopper_b, @feed_fine_powder, @feed_mixer, @feed_molder, @feed_total,
      @brix, @line_hours_a, @line_hours_b, @line_hours_total,
      @lng_dryer, @lng_rto, @gas_usage_shift, @gas_usage_total,
      @moisture_manual, @hardness_manual)
    ON CONFLICT(date, shift) DO UPDATE SET
      product = excluded.product,
      daily_pack_amount = excluded.daily_pack_amount,
      dryer_temp_a = excluded.dryer_temp_a,
      dryer_temp_b = excluded.dryer_temp_b,
      feed_hopper_a = excluded.feed_hopper_a,
      feed_hopper_b = excluded.feed_hopper_b,
      feed_fine_powder = excluded.feed_fine_powder,
      feed_mixer = excluded.feed_mixer,
      feed_molder = excluded.feed_molder,
      feed_total = excluded.feed_total,
      brix = excluded.brix,
      line_hours_a = excluded.line_hours_a,
      line_hours_b = excluded.line_hours_b,
      line_hours_total = excluded.line_hours_total,
      lng_dryer = excluded.lng_dryer,
      lng_rto = excluded.lng_rto,
      gas_usage_shift = excluded.gas_usage_shift,
      gas_usage_total = excluded.gas_usage_total,
      moisture_manual = excluded.moisture_manual,
      hardness_manual = excluded.hardness_manual,
      updated_at = datetime('now')
  `);

  const result: ImportResult = emptyResult();
  let lastDate: string | null = null;

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const shift = str(row[1]);
    if (shift !== "주" && shift !== "야") continue;

    const dateStr: string | null = excelDateToStr(row[0]) ?? lastDate;
    if (!dateStr) {
      result.skipped++;
      result.skippedDetails.push(`${i + 1}행: 날짜를 인식할 수 없어 건너뜀`);
      continue;
    }
    lastDate = dateStr;

    try {
      const existed = db
        .prepare("SELECT id FROM production_log WHERE date = ? AND shift = ?")
        .get(dateStr, shift);

      upsert.run({
        date: dateStr,
        shift,
        product: str(row[2]),
        daily_pack_amount: num(row[3]),
        dryer_temp_a: num(row[4]),
        dryer_temp_b: num(row[5]),
        feed_hopper_a: num(row[6]),
        feed_hopper_b: num(row[7]),
        feed_fine_powder: num(row[8]),
        feed_mixer: num(row[9]),
        feed_molder: num(row[10]),
        feed_total: num(row[11]),
        brix: num(row[12]),
        line_hours_a: num(row[13]),
        line_hours_b: num(row[14]),
        line_hours_total: num(row[15]),
        lng_dryer: num(row[16]),
        lng_rto: num(row[17]),
        gas_usage_shift: num(row[18]),
        gas_usage_total: num(row[19]),
        moisture_manual: num(row[21]),
        hardness_manual: num(row[22]),
      });

      if (existed) result.updated++;
      else result.inserted++;
    } catch (e) {
      result.errors.push(`row ${i + 1}: ${String(e)}`);
    }
  }

  return result;
}

// 비료시료 강도테스트 (파일2) 형식 파싱: 5행 1블록 반복
export function importQcTests(buf: Buffer): ImportResult {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const header = rows[3] ?? [];
  if (str(header[0]) !== "No." || str(header[1]) !== "세부내역") {
    return {
      ...emptyResult(),
      structureError:
        "이 파일은 예상한 비료시료 강도테스트 형식이 아닙니다 (4행에 'No.', '세부내역' 헤더가 있어야 합니다). 원본 엑셀 양식이 바뀌었는지 확인해주세요.",
    };
  }

  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO qc_test (
      sample_no, fertilizer_type, date, shift, time,
      v1, v2, v3, v4, v5, v6, v7, v8, v9, v10,
      v11, v12, v13, v14, v15, v16, v17, v18, v19, v20,
      burner_temp, granulation_brix, granulation_input, fine_powder, hopper, moisture, worker
    ) VALUES (
      @sample_no, @fertilizer_type, @date, @shift, @time,
      @v1, @v2, @v3, @v4, @v5, @v6, @v7, @v8, @v9, @v10,
      @v11, @v12, @v13, @v14, @v15, @v16, @v17, @v18, @v19, @v20,
      @burner_temp, @granulation_brix, @granulation_input, @fine_powder, @hopper, @moisture, @worker
    )
  `);

  const existingCheck = db.prepare(
    "SELECT id FROM qc_test WHERE date = ? AND time IS ? AND sample_no IS ?"
  );

  const result: ImportResult = emptyResult();

  for (let r = 4; r + 4 < rows.length; r += 5) {
    const metaRow = rows[r];
    const brixMoistureRow = rows[r + 1];
    const v1_10Row = rows[r + 2];
    const finePowderRow = rows[r + 3];
    const v11_20Row = rows[r + 4];
    if (!metaRow || metaRow[0] == null) continue;

    const date = excelDateToStr(metaRow[6]);
    const time = excelTimeToStr(metaRow[9]);
    if (!date) {
      result.skipped++;
      result.skippedDetails.push(`${r + 1}행(시료 No.${str(metaRow[0]) ?? "?"}): 날짜가 비어있어 건너뜀`);
      continue;
    }
    const shift = time ? inferShift(time) : "주";

    try {
      const dup = existingCheck.get(date, time, num(metaRow[0]));
      if (dup) {
        result.skipped++;
        result.skippedDetails.push(`${r + 1}행(시료 No.${str(metaRow[0]) ?? "?"}): 이미 가져온 기록과 중복되어 건너뜀`);
        continue;
      }

      insert.run({
        sample_no: num(metaRow[0]),
        fertilizer_type: str(metaRow[2]),
        date,
        shift,
        time,
        v1: num(v1_10Row?.[1]), v2: num(v1_10Row?.[2]), v3: num(v1_10Row?.[3]), v4: num(v1_10Row?.[4]),
        v5: num(v1_10Row?.[5]), v6: num(v1_10Row?.[6]), v7: num(v1_10Row?.[7]), v8: num(v1_10Row?.[8]),
        v9: num(v1_10Row?.[9]), v10: num(v1_10Row?.[10]),
        v11: num(v11_20Row?.[1]), v12: num(v11_20Row?.[2]), v13: num(v11_20Row?.[3]), v14: num(v11_20Row?.[4]),
        v15: num(v11_20Row?.[5]), v16: num(v11_20Row?.[6]), v17: num(v11_20Row?.[7]), v18: num(v11_20Row?.[8]),
        v19: num(v11_20Row?.[9]), v20: num(v11_20Row?.[10]),
        burner_temp: num(metaRow[15]),
        granulation_brix: num(brixMoistureRow?.[15]),
        granulation_input: num(v1_10Row?.[15]),
        fine_powder: num(finePowderRow?.[15]),
        hopper: num(v11_20Row?.[15]),
        moisture: num(brixMoistureRow?.[16]),
        worker: str(metaRow[17]),
      });
      result.inserted++;
    } catch (e) {
      result.errors.push(`row ${r + 1}: ${String(e)}`);
    }
  }

  return result;
}

// ---------- 월별 유틸리티(전력 금액/LNG/경유) 엑셀 가져오기 ----------

function normalizeHeader(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[\s()\r\n㎥]/g, "")
    .replace(/kwh/g, "kwh");
}

function parseMonthCell(v: unknown): string | null {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}`;
  }
  const s = String(v ?? "").trim();
  if (!s) return null;
  // 2025-07, 2025.07, 2025/07
  let m = s.match(/(\d{4})[-./](\d{1,2})/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
  // 2025년 7월
  m = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
  return null;
}

// 헤더 키워드로 열을 찾음. 각 필드는 (반드시 포함할 키워드들, 제외 키워드들)로 판별.
function matchColumn(header: string, include: string[], exclude: string[] = []): boolean {
  return include.every((k) => header.includes(k)) && exclude.every((k) => !header.includes(k));
}

export function importMonthlyUtility(buf: Buffer): ImportResult {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  // 헤더 행 찾기: '월'로 시작하는 열이 있는 첫 행
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const normalized = (rows[i] ?? []).map(normalizeHeader);
    if (normalized.some((h) => h === "월" || h === "month" || h.includes("연월"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      ...emptyResult(),
      structureError:
        "월별 유틸리티 형식이 아닙니다. 첫 열 제목이 '월'인 표가 필요합니다. (열 예: 월, 1공장사용량, 1공장금액, 2공장사용량, 2공장금액, LNG사용량, LNG금액, 경유사용량, 경유금액, 생산량)",
    };
  }

  const headers = (rows[headerIdx] ?? []).map(normalizeHeader);
  const findCol = (include: string[], exclude: string[] = []): number =>
    headers.findIndex((h) => matchColumn(h, include, exclude));

  const col = {
    month: headers.findIndex((h) => h === "월" || h === "month" || h.includes("연월")),
    elec1_kwh: findCol(["1공장"], ["금액", "원"]),
    elec1_won: findCol(["1공장", "금액"]),
    elec2_kwh: findCol(["2공장"], ["금액", "원"]),
    elec2_won: findCol(["2공장", "금액"]),
    lng_m3: (() => {
      const i = findCol(["lng"], ["금액", "원"]);
      return i >= 0 ? i : findCol(["가스"], ["금액", "원"]);
    })(),
    lng_won: (() => {
      const i = findCol(["lng", "금액"]);
      return i >= 0 ? i : findCol(["가스", "금액"]);
    })(),
    diesel_liter: findCol(["경유"], ["금액", "원"]),
    diesel_won: findCol(["경유", "금액"]),
    production_ton: (() => {
      const i = findCol(["생산"], ["금액", "원"]);
      return i >= 0 ? i : findCol(["톤"], ["금액", "원"]);
    })(),
    note: headers.findIndex((h) => h.includes("비고")),
  };

  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO monthly_utility
      (month, elec1_kwh, elec1_won, elec2_kwh, elec2_won, lng_m3, lng_won, diesel_liter, diesel_won, production_ton, note)
    VALUES (@month, @elec1_kwh, @elec1_won, @elec2_kwh, @elec2_won, @lng_m3, @lng_won, @diesel_liter, @diesel_won, @production_ton, @note)
    ON CONFLICT(month) DO UPDATE SET
      elec1_kwh = COALESCE(excluded.elec1_kwh, monthly_utility.elec1_kwh),
      elec1_won = COALESCE(excluded.elec1_won, monthly_utility.elec1_won),
      elec2_kwh = COALESCE(excluded.elec2_kwh, monthly_utility.elec2_kwh),
      elec2_won = COALESCE(excluded.elec2_won, monthly_utility.elec2_won),
      lng_m3 = COALESCE(excluded.lng_m3, monthly_utility.lng_m3),
      lng_won = COALESCE(excluded.lng_won, monthly_utility.lng_won),
      diesel_liter = COALESCE(excluded.diesel_liter, monthly_utility.diesel_liter),
      diesel_won = COALESCE(excluded.diesel_won, monthly_utility.diesel_won),
      production_ton = COALESCE(excluded.production_ton, monthly_utility.production_ton),
      note = COALESCE(excluded.note, monthly_utility.note),
      updated_at = datetime('now')
  `);

  const result: ImportResult = emptyResult();
  const cellNum = (row: unknown[], idx: number): number | null =>
    idx >= 0 ? num(row[idx]) : null;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const month = col.month >= 0 ? parseMonthCell(row[col.month]) : null;
    if (!month) {
      // 빈 줄은 조용히 건너뜀
      if (row.some((c) => c != null && String(c).trim() !== "")) {
        result.skipped++;
        result.skippedDetails.push(`${i + 1}행: 월(YYYY-MM)을 인식할 수 없어 건너뜀`);
      }
      continue;
    }
    const record = {
      month,
      elec1_kwh: cellNum(row, col.elec1_kwh),
      elec1_won: cellNum(row, col.elec1_won),
      elec2_kwh: cellNum(row, col.elec2_kwh),
      elec2_won: cellNum(row, col.elec2_won),
      lng_m3: cellNum(row, col.lng_m3),
      lng_won: cellNum(row, col.lng_won),
      diesel_liter: cellNum(row, col.diesel_liter),
      diesel_won: cellNum(row, col.diesel_won),
      production_ton: cellNum(row, col.production_ton),
      note: col.note >= 0 ? str(row[col.note]) : null,
    };
    const info = upsert.run(record);
    if (info.changes > 0) result.inserted++;
  }

  return result;
}
