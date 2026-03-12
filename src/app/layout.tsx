import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RikaQuiz | 理科一問一答",
  description: "中学理科4分野の一問一答学習サイト",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const themeInitScript = `
    try {
      var t = window.localStorage.getItem('rikaquiz-theme');
      var theme = t === 'light' || t === 'dark' || t === 'cute' ? t : 'dark';
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
    } catch (e) {
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.style.colorScheme = 'dark';
    }
  `;

  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
