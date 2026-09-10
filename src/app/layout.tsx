import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Орбитальный рейс — 3D-симулятор запуска ракеты',
  description:
    'Соберите ракету-носитель из обтекателей, стабилизаторов, двигателей и баков, запустите её и выведите полезную нагрузку на орбиту. Реалистичная модель тяги, аэродинамики, устойчивости и орбитальной механики.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#05070f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
