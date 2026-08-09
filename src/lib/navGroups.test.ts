import { describe, expect, it } from "vitest";
import { filterNavGroups, NavGroup } from "@/lib/navGroups";

const groups: NavGroup[] = [
  {
    label: "제품포장",
    items: [
      { href: "/packing", label: "재고현황" },
      { href: "/packing/entry", label: "생산/출하 입력" },
    ],
  },
  {
    label: "근태관리",
    items: [{ href: "/attendance", label: "근태 신청·연차현황" }],
  },
];

describe("filterNavGroups", () => {
  it("allowedHrefs가 null이면 전체 메뉴를 그대로 반환한다", () => {
    expect(filterNavGroups(groups, null)).toEqual(groups);
  });

  it("허용된 href만 남기고, 항목이 하나도 안 남는 대분류는 통째로 제거한다", () => {
    const result = filterNavGroups(groups, ["/packing"]);
    expect(result).toEqual([
      { label: "제품포장", items: [{ href: "/packing", label: "재고현황" }] },
    ]);
  });

  it("허용된 href가 없으면 빈 배열을 반환한다", () => {
    expect(filterNavGroups(groups, [])).toEqual([]);
  });
});
