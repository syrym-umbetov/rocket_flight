'use client';

import { useEffect, useState } from 'react';

/** Телефон или планшет: узкий экран либо основное указательное устройство — палец. */
export function useMobile(): boolean | null {
  const [mobile, setMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px), (pointer: coarse) and (max-width: 1100px)');
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return mobile;
}
