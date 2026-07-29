import { BoardCategory } from "@/lib/types";

export const BOARD_CATEGORIES: BoardCategory[] = ["생산계획", "보수계획", "휴무일", "기타"];

export const BOARD_CATEGORY_STYLE: Record<BoardCategory, string> = {
  생산계획: "bg-sky-50 text-sky-700 border-sky-200",
  보수계획: "bg-violet-50 text-violet-700 border-violet-200",
  휴무일: "bg-amber-50 text-amber-700 border-amber-200",
  기타: "bg-slate-100 text-slate-600 border-slate-200",
};
