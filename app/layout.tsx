import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Parse DNS — Агрегатор комплектующих',
  description: 'Парсинг и сравнение комплектующих ПК с DNS-Shop и Citilink',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
