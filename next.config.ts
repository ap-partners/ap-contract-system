import type { NextConfig } from "next";

// 改善提案30件・グループA①対応（2026-08-19）：外部総合品質監査レポート12章16番
// 「セキュリティヘッダーを設定してください」に対応。今回はブレイキングリスクの低い
// 4種のみを追加する（HSTS・X-Content-Type-Options・Referrer-Policy・X-Frame-Options）。
// フルのContent-Security-Policyは、Next.jsのhydration用インラインスクリプト・
// Supabase通信・PDFプレビューのblob:URL等、影響範囲の洗い出しが別途必要なため
// 今回のスコープには含めず、対応する場合は改めて方針を相談してから着手する。
const securityHeaders = [
  // HTTPS強制（Vercelは既定でHTTPSのみだが、ブラウザ側にも明示的に指示する）
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // ブラウザがContent-Typeを推測して実行してしまう（MIME種別スニッフィング）のを防止
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 他サイトへ遷移する際にURL全体を送らない（クエリ文字列に個人情報を含む事故の被害を軽減）
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 他サイトのiframeに埋め込まれてのクリックジャッキングを防止
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
