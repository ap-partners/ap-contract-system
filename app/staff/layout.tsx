import type { Metadata } from "next";

// ===== マイページ（/staff配下）専用のページタイトル =====
// 2026-07-22追加。ルートのapp/layout.tsx（社内向け「契約書管理システム」）とは別に、
// 従業員向けマイページはブラウザタブで見分けやすいよう固有タイトルを設定する
// （伊藤さんとのUI/UXレビューで決定。docs/SYSTEM_DESIGN.md 10章2026-07-22参照）。
// /staff配下の画面（login・mypage・mypage/documents/[id]）は全て'use client'の
// クライアントコンポーネントでmetadataをexportできないため、この階層のlayout.tsx
// （サーバーコンポーネント）で一括指定する。
export const metadata: Metadata = {
  title: "マイページ | 契約書管理システム",
};

export default function StaffLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
