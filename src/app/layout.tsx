import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "학원 관리 시스템",
  description: "학원 원생 관리 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body
        style={{
          fontFamily: "'Noto Sans KR', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
