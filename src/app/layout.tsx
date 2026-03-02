import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "학원 관리 시스템",
  description: "학원 원생 관리 시스템",
  charset: "utf-8",
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
