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
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
