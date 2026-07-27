// ===== 読み込み中のスケルトン表示（プレーンテキストの「読み込み中…」の置き換え） =====
// 総合レビュー指摘3対応（2026-07-27）。管理部ダッシュボードの「マスタ管理」「アカウント管理」
// タブ初回表示時、装飾のないテキストのみのローディング表示だったものを、コンテンツの形を
// 模したスケルトン矩形に置き換える。既存のloading分岐の中身だけを差し替えるため、
// レイアウト・所要時間・分岐条件など他の挙動には影響しない。
const SKELETON_ROW_COUNT = 4

export default function SkeletonBlock() {
  return (
    <div className="animate-pulse space-y-3" role="status" aria-label="読み込み中">
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
        <div key={i} className="h-12 rounded-lg bg-[#EEF1F6]" />
      ))}
    </div>
  )
}
