'use client';

import { useEffect, useState } from 'react';

/** Телефон или планшет: узкий экран либо основное указательное устройство — палец. */
const QUERY = '(max-width: 860px), (pointer: coarse) and (max-width: 1100px)';

/** Синхронная проверка — нужна там, где ждать эффект нельзя (инициализация сцены). */
export function isMobileNow() {
  return typeof window !== 'undefined' && window.matchMedia(QUERY).matches;
}

export function useMobile(): boolean | null {
  const [mobile, setMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return mobile;
}
