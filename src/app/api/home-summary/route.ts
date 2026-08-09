import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  getDailyProductionSummary,
  getDailyShipmentSummary,
  getSeasonProductionBagTonbag,
  getSeasonShipmentBagTonbag,
  getStockSnapshot,
} from "@/lib/homeSummary";
import { DailyAttendanceStatus, Nationality, ShiftType } from "@/lib/types";

const STATUS_LABELS: Record<DailyAttendanceStatus, string> = {
  early_leave: "조퇴",
  comp_off: "대체휴무",
  late: "지각",
  absent: "결근",
  other: "기타",
};

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

interface AttendancePerson {
  name: string;
  nationality: Nationality;
}
interface AttendanceLeaveEntry extends AttendancePerson {
  shift: "day" | "night";
  type: string;
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  if (!isValidDate(date)) {
    return NextResponse.json({ error: "날짜를 확인해주세요." }, { status: 400 });
  }

  const db = getDb();

  const production = getDailyProductionSummary(db, date);
  const shipment = getDailyShipmentSummary(db, date);
  const seasonProduction = getSeasonProductionBagTonbag(db, date);
  const seasonShipment = getSeasonShipmentBagTonbag(db, date);
  const stock = getStockSnapshot(db, date);

  // ---- 근태현황: 주간조/야간조 정상출근 명단 + 연차·기타 통합 명단 (일일 출근부 로직과 동일 기준) ----
  const workers = db
    .prepare("SELECT id, name, nationality, shift_type FROM worker WHERE active = 1 ORDER BY name")
    .all() as { id: number; name: string; nationality: Nationality; shift_type: ShiftType | null }[];

  const dailyRows = db
    .prepare("SELECT worker_id, shift, status, status_detail FROM daily_attendance WHERE date = ?")
    .all(date) as {
    worker_id: number;
    shift: ShiftType | null;
    status: DailyAttendanceStatus | null;
    status_detail: string | null;
  }[];
  const dailyByWorker = new Map(dailyRows.map((r) => [r.worker_id, r]));

  const leaveRows = db
    .prepare(
      `SELECT worker_id, type FROM leave_request
       WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`
    )
    .all(date, date) as { worker_id: number; type: string }[];
  const leaveByWorker = new Map(leaveRows.map((r) => [r.worker_id, r]));

  const dayNormal: AttendancePerson[] = [];
  const nightNormal: AttendancePerson[] = [];
  const leaveEtc: AttendanceLeaveEntry[] = [];

  for (const w of workers) {
    const daily = dailyByWorker.get(w.id);
    const leave = leaveByWorker.get(w.id);
    const shift: ShiftType = (daily?.shift ?? w.shift_type ?? "day") as ShiftType;
    const person: AttendancePerson = { name: w.name, nationality: w.nationality };

    if (leave) {
      leaveEtc.push({ ...person, shift, type: leave.type });
    } else if (daily?.status) {
      const label = `${STATUS_LABELS[daily.status]}${daily.status_detail ? ` ${daily.status_detail}` : ""}`;
      leaveEtc.push({ ...person, shift, type: label });
    } else if (shift === "night") {
      nightNormal.push(person);
    } else {
      dayNormal.push(person);
    }
  }

  return NextResponse.json({
    date,
    production,
    shipment,
    seasonProduction,
    seasonShipment,
    stock,
    attendance: {
      day: { normal: dayNormal },
      night: { normal: nightNormal },
      leaveEtc,
    },
  });
}
