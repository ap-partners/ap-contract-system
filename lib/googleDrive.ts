// ===== Google Drive アップロード処理（署名済みPDFの保管） =====
// 署名／確認が完了した契約書PDFを、共有ドライブ内に
// 「年月フォルダ（雇用開始日 or 派遣開始日）→ 部署フォルダ（対象スタッフの所属部署）」の
// 2階層で保存する。フォルダが無ければその場で自動作成する。
// 2026-07-08設計・フェーズ5（署名機能）。日付・部署の決め方の理由はdocs/SYSTEM_DESIGN.md 10章参照。

import { google, drive_v3 } from 'googleapis'
import { Readable } from 'stream'

// 保存先の共有ドライブID（フォルダIDではなく共有ドライブID。0Aから始まる形式）
const ROOT_DRIVE_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません。')
  }
  const key = JSON.parse(raw)
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
}

// Google検索クエリ用に、名前に含まれる可能性のあるシングルクォートをエスケープする
function escapeForQuery(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// 指定した親フォルダ（または共有ドライブ直下）に、同名のフォルダが無ければ作成し、あれば既存のものを使う
async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string
): Promise<string> {
  const query = [
    `name='${escapeForQuery(name)}'`,
    "mimeType='application/vnd.google-apps.folder'",
    `'${parentId}' in parents`,
    'trashed=false',
  ].join(' and ')

  const found = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'drive',
    driveId: ROOT_DRIVE_ID,
  })

  const existing = found.data.files?.[0]
  if (existing?.id) {
    return existing.id
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })

  if (!created.data.id) {
    throw new Error(`フォルダの作成に失敗しました（name=${name}）`)
  }
  return created.data.id
}

export type UploadSignedPdfParams = {
  buffer: Buffer
  yearMonth: string // 例: '2026-07'（雇用開始日 or 派遣開始日から算出したもの。呼び出し側で決定する）
  departmentName: string // 例: 'SP1課'（対象スタッフの所属部署名）
  fileName: string // 例: '猪野正明_100123_雇用契約書.pdf'
}

// 完成PDFをアップロードし、Google DriveのファイルIDを返す（contracts.drive_file_idに保存する）
export async function uploadSignedPdf(params: UploadSignedPdfParams): Promise<string> {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  const yearMonthFolderId = await findOrCreateFolder(drive, params.yearMonth, ROOT_DRIVE_ID)
  const departmentFolderId = await findOrCreateFolder(drive, params.departmentName, yearMonthFolderId)

  const file = await drive.files.create({
    requestBody: {
      name: params.fileName,
      parents: [departmentFolderId],
    },
    media: {
      mimeType: 'application/pdf',
      body: Readable.from(params.buffer),
    },
    fields: 'id',
    supportsAllDrives: true,
  })

  if (!file.data.id) {
    throw new Error('Google Driveへのアップロードに失敗しました（ファイルIDが取得できませんでした）')
  }
  return file.data.id
}

// 2026-07-10追加：署名済み契約のダッシュボード「帳票PDFプレビュー」から、押印済みの
// 実際のPDF（署名時にGoogle Driveへ保存したもの）を取得できるようにする。
// それまではプレビューAPIが毎回未署名の状態で再生成していたため、ダッシュボードから
// 押印済みPDFを確認する手段が無く、Google Driveのフォルダを直接開くしかなかった
// （伊藤さん指摘・2026-07-10）。同じサービスアカウント権限でファイル本体を取得し、
// 呼び出し元（/api/contracts/[id]/pdf）がそのままレスポンスとして返す。
export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  )

  return Buffer.from(res.data as ArrayBuffer)
}

// 総合レビュー指摘16対応（2026-07-15）：complete APIでは「PDF生成→Driveアップロード→
// contractsの条件付きUPDATE」の順で処理しており、UPDATEが競合等で失敗した場合、
// アップロード済みのPDFがどの契約にも紐づかない孤児ファイルとしてDrive上に残ってしまう。
// UPDATE失敗時にこの関数でアップロード直後のファイルを削除し、孤児ファイルを残さないようにする。
// 削除自体が失敗しても（権限・ネットワーク等）呼び出し元の処理は止めず、ログに残すだけにする。
export async function deleteDriveFile(fileId: string): Promise<void> {
  try {
    const auth = getAuth()
    const drive = google.drive({ version: 'v3', auth })
    await drive.files.delete({ fileId, supportsAllDrives: true })
  } catch (e) {
    console.error(`[deleteDriveFile] 孤児ファイルの削除に失敗しました（fileId=${fileId}）`, e)
  }
}
