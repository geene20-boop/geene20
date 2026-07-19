"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "hanil_entered_by";

// 입력자 이름을 기기에 기억해뒀다가 다음 입력에도 자동으로 채워준다.
// (같은 기기를 여러 사람이 쓰면 그때그때 값을 바꿔 입력하면 됨)
export function useEnteredBy() {
  const [enteredBy, setEnteredByState] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnteredByState(localStorage.getItem(STORAGE_KEY) ?? "");
  }, []);

  function setEnteredBy(name: string) {
    setEnteredByState(name);
    if (name.trim()) localStorage.setItem(STORAGE_KEY, name.trim());
  }

  return { enteredBy, setEnteredBy };
}
