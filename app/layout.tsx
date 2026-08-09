import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "山行账本",
  description: "登山团队的成员、计划、行程、AA 费用与成长数据管理工具。",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
