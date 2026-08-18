'use client'

// ===== 申請ウィザードの離脱ガード・下書き自動保存（外部総合品質監査レポートM-04対応・2026-08-18） =====
// app/apply/page.tsx・app/pledge/apply/page.tsx（8STEP／6STEPの申請ウィザード）で共通に使う。
// 従来beforeunloadの登録が0件・下書き保存も0件で、入力途中でタブを閉じる・誤ってリロードすると
// 無警告で全て消える不具合があった（監査レポート指摘）。
//
// 2つの機能を提供する：
// ①離脱警告（isDirtyがtrueの間、ブラウザのタブを閉じる・リロード・URL直接遷移からbeforeunloadで警告）。
//   新規申請フローに限らず、差し戻し再申請・更新申請・最低賃金改定再申請などプリフィル済みの
//   モードでも「入力中に消えたら困る」ことに変わりはないため、呼び出し元でisDirtyを広めに算出して渡す。
// ②下書き自動保存・復元（enableDraftSaveがtrueの場合のみ。STEP切り替え時＋30秒ごとにsessionStorageへ保存）。
//   sessionStorageを使うのは、タブを閉じれば自動的に消え「いつの下書きか分からない」「別の申請と
//   混同する」事故を避けられるため（localStorageだと何日も残ってしまう）。
//   保存から4時間（maxAgeMs既定値）以上経過した下書きは古すぎるとみなし復元候補に出さない。
//   また、下書きに保存時のuserIdを記録し、復元時に現在ログイン中のuserIdと一致する場合のみ
//   候補として出す（同じブラウザ・同じタブで別の人がログインし直した場合に、前の人が入力していた
//   スタッフの個人情報が見えてしまう事故を防ぐため）。
//   差し戻し再申請・更新申請・最低賃金改定再申請の3モードは、開くたびにDBから正しい内容を
//   再プリフィルする設計のため、呼び出し元でenableDraftSave=falseにして下書き保存・復元の対象外にする
//   （DBプリフィルとsessionStorage下書きが競合する事故を避けるため。離脱警告①のみ適用）。

import { useEffect, useRef, useState, useCallback } from 'react'

export interface WizardDraftEnvelope<T> {
  savedAt: string
  userId: string
  staffName: string | null
  step: number
  data: T
}

interface UseWizardDraftGuardOptions<T> {
  storageKey: string
  userId: string | null
  isDirty: boolean
  enableDraftSave: boolean
  currentStep: number
  staffName: string | null
  getData: () => T
  maxAgeMs?: number
}

const DEFAULT_MAX_AGE_MS = 4 * 60 * 60 * 1000 // 4時間
const AUTOSAVE_INTERVAL_MS = 30 * 1000 // 30秒

export function useWizardDraftGuard<T>({
  storageKey,
  userId,
  isDirty,
  enableDraftSave,
  currentStep,
  staffName,
  getData,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
}: UseWizardDraftGuardOptions<T>) {
  const [restoreAvailable, setRestoreAvailable] = useState<WizardDraftEnvelope<T> | null>(null)
  const checkedRef = useRef(false)
  const getDataRef = useRef(getData)
  getDataRef.current = getData
  const staffNameRef = useRef(staffName)
  staffNameRef.current = staffName

  // ===== ①離脱警告：入力が進んでいる間、ブラウザ操作からの離脱にbeforeunloadで警告する =====
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // ===== ②下書きの復元候補チェック（userIdが確定した後、マウント時に1回だけ） =====
  useEffect(() => {
    if (!enableDraftSave || !userId || checkedRef.current) return
    checkedRef.current = true
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as WizardDraftEnvelope<T>
      const age = Date.now() - new Date(parsed.savedAt).getTime()
      if (parsed.userId !== userId || !(age >= 0) || age > maxAgeMs) {
        sessionStorage.removeItem(storageKey)
        return
      }
      setRestoreAvailable(parsed)
    } catch {
      sessionStorage.removeItem(storageKey)
    }
  }, [enableDraftSave, userId, storageKey, maxAgeMs])

  // ===== ②下書きの自動保存（STEP切り替え時に即・以後30秒ごと） =====
  useEffect(() => {
    if (!enableDraftSave || !isDirty || !userId) return
    const save = () => {
      try {
        const envelope: WizardDraftEnvelope<T> = {
          savedAt: new Date().toISOString(),
          userId,
          staffName: staffNameRef.current,
          step: currentStep,
          data: getDataRef.current(),
        }
        sessionStorage.setItem(storageKey, JSON.stringify(envelope))
      } catch {
        // sessionStorageが使えない環境（プライベートモード等）でも申請自体は継続できるよう、無視する
      }
    }
    save()
    const timer = setInterval(save, AUTOSAVE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [enableDraftSave, isDirty, userId, currentStep, storageKey])

  // 復元候補を取り出し、バナーを閉じる（呼び出し元がdraft.dataを各STEPのstateへ反映する）
  const restore = useCallback((): WizardDraftEnvelope<T> | null => {
    const draft = restoreAvailable
    setRestoreAvailable(null)
    return draft
  }, [restoreAvailable])

  // 復元候補を破棄する（新規作成を選んだ場合）
  const discard = useCallback(() => {
    try { sessionStorage.removeItem(storageKey) } catch { /* noop */ }
    setRestoreAvailable(null)
  }, [storageKey])

  // 申請完了・明示的な中断時に下書きを消す
  const clearDraft = useCallback(() => {
    try { sessionStorage.removeItem(storageKey) } catch { /* noop */ }
  }, [storageKey])

  return { restoreAvailable, restore, discard, clearDraft }
}
