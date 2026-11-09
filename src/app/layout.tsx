import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enterprise Agent Platform | 工程验证",
  description: "企业 Agent 平台的本地工程初始化验证页，业务能力尚未接入。",
  robots: { index: false, follow: false },
  icons: { icon: "data:," },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
