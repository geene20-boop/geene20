import { LabJournalFormType } from "@/lib/types";

export interface ItemizedRow {
  name: string;
  value: string;
  unit: string;
}

export interface ItemizedContent {
  purpose: string;
  method: string;
  items: ItemizedRow[];
  conclusion: string;
}

export interface FreeformContent {
  content: string;
}

export interface LinkedContent {
  interpretation: string;
}

export type LabJournalContent = ItemizedContent | FreeformContent | LinkedContent;

export function emptyContent(formType: LabJournalFormType): LabJournalContent {
  if (formType === "항목형") {
    return { purpose: "", method: "", items: [{ name: "", value: "", unit: "" }], conclusion: "" };
  }
  if (formType === "자유기술형") {
    return { content: "" };
  }
  return { interpretation: "" };
}
