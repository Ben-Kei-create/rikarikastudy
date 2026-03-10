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
      const storedTheme = window.localStorage.getItem('rikaquiz-theme');
      const theme = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark';
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch (error) {
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.style.colorScheme = 'dark';
    }
  `;

  return (
    <html lang="ja" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
