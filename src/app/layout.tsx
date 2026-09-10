import type { Metadata, Viewport } from 'next';
import './globals.css';

const TITLE = 'Орбитальный рейс — 3D-симулятор запуска ракеты';
const DESCRIPTION =
  'Соберите ракету-носитель из обтекателей, стабилизаторов, двигателей и баков, ' +
  'запустите её и выведите полезную нагрузку на орбиту. Реалистичная модель тяги, ' +
  'аэродинамики, устойчивости и орбитальной механики.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'Орбитальный рейс',
  keywords: ['ракета', 'симулятор', 'орбита', 'аэродинамика', '3D', 'three.js'],
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'Орбитальный рейс',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#05070f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
