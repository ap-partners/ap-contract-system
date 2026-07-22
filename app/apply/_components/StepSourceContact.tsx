'use client'

// STEP4：派遣元担当者（派遣元責任者・苦情処理申出先（派遣元））
// app/apply/page.tsx の stepType === 'sourceContact' ブロックをそのまま切り出したもの。
// ロジック・表示は変更なし。状態は親（ApplyPageInner）に残したまま、値とsetterをpropsで受け取る。

import { useState } from 'react'
import { inp, validateTel } from '../_lib/helpers'
import { FormRowAuto, SectionHeader, TelInput } from './FormParts'

type MgrCmpSource = 'master' | 'csv'

interface StepSourceContactProps {
  mgrCmpSource: MgrCmpSource
  masterSnapshot: Record<string, string>

  mgr_dept: string
  mgr_role: string
  mgr_name: string
  mgr_tel: string
  setMgrDept: (v: string) => void
  setMgrRole: (v: string) => void
  setMgrName: (v: string) => void
  setMgrTel: (v: string) => void

  cmp_dept: string
  cmp_role: string
  cmp_name: string
  cmp_tel: string
  setCmpDept: (v: string) => void
  setCmpRole: (v: string) => void
  setCmpName: (v: string) => void
  setCmpTel: (v: string) => void

  handleNext: () => void
  NavButtons: React.ComponentType<{ onNext: () => void; error?: string | null }>
}

export default function StepSourceContact({
  mgrCmpSource, masterSnapshot,
  mgr_dept, mgr_role, mgr_name, mgr_tel, setMgrDept, setMgrRole, setMgrName, setMgrTel,
  cmp_dept, cmp_role, cmp_name, cmp_tel, setCmpDept, setCmpRole, setCmpName, setCmpTel,
  handleNext, NavButtons,
}: StepSourceContactProps) {
  // 2026-07-22追加（alert/confirm置き換えPhase3・①必須項目チェック）：NavButtonsのerror propに
  // 渡すためのローカルstate。従来alert()表示していたエラーメッセージをバナー化する。
  const [stepError, setStepError] = useState<string | null>(null)
  return (
    <>
      <div className="px-5 py-3 border-b text-sm" style={{ background: '#EEF2FA', borderColor: '#D0DAF0', color: '#5A6A8A' }}>
        ℹ️ 以下は{mgrCmpSource === 'csv' ? 'CSVデータ' : '自社マスタ'}から自動入力されています。内容を確認し、必要であれば修正してください。
      </div>
      <SectionHeader label="派遣元責任者" />
      <FormRowAuto label="部署名" modified={masterSnapshot.mgr_dept !== undefined && mgr_dept !== masterSnapshot.mgr_dept} source={mgrCmpSource} wide
        isEmpty={!mgr_dept} emptyHint="入力してください">
        <input className={inp} style={{ borderColor: !mgr_dept ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} value={mgr_dept} onChange={e => setMgrDept(e.target.value)} />
      </FormRowAuto>
      <FormRowAuto label="役職" modified={masterSnapshot.mgr_role !== undefined && mgr_role !== masterSnapshot.mgr_role} source={mgrCmpSource}
        isEmpty={!mgr_role} emptyHint="入力してください">
        <input className={`${inp} max-w-xs`} style={{ borderColor: !mgr_role ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} value={mgr_role} onChange={e => setMgrRole(e.target.value)} />
      </FormRowAuto>
      <FormRowAuto label="氏名" modified={masterSnapshot.mgr_name !== undefined && mgr_name !== masterSnapshot.mgr_name} source={mgrCmpSource}
        isEmpty={!mgr_name} emptyHint="入力してください">
        <input className={`${inp} max-w-xs`} style={{ borderColor: !mgr_name ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} value={mgr_name} onChange={e => setMgrName(e.target.value)} />
      </FormRowAuto>
      <FormRowAuto label="電話番号" modified={masterSnapshot.mgr_tel !== undefined && mgr_tel !== masterSnapshot.mgr_tel} source={mgrCmpSource}
        isEmpty={!mgr_tel} emptyHint="入力してください">
        <TelInput value={mgr_tel} onChange={setMgrTel} />
      </FormRowAuto>
      <SectionHeader label="苦情処理申出先（派遣元）" />
      <FormRowAuto label="部署名" modified={masterSnapshot.cmp_dept !== undefined && cmp_dept !== masterSnapshot.cmp_dept} source={mgrCmpSource} wide
        isEmpty={!cmp_dept} emptyHint="入力してください">
        <input className={inp} style={{ borderColor: !cmp_dept ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} value={cmp_dept} onChange={e => setCmpDept(e.target.value)} />
      </FormRowAuto>
      <FormRowAuto label="役職" modified={masterSnapshot.cmp_role !== undefined && cmp_role !== masterSnapshot.cmp_role} source={mgrCmpSource}
        isEmpty={!cmp_role} emptyHint="入力してください">
        <input className={`${inp} max-w-xs`} style={{ borderColor: !cmp_role ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} value={cmp_role} onChange={e => setCmpRole(e.target.value)} />
      </FormRowAuto>
      <FormRowAuto label="氏名" modified={masterSnapshot.cmp_name !== undefined && cmp_name !== masterSnapshot.cmp_name} source={mgrCmpSource}
        isEmpty={!cmp_name} emptyHint="入力してください">
        <input className={`${inp} max-w-xs`} style={{ borderColor: !cmp_name ? '#DC2626' : '#D0DAF0', color: '#1A2340' }} value={cmp_name} onChange={e => setCmpName(e.target.value)} />
      </FormRowAuto>
      <FormRowAuto label="電話番号" modified={masterSnapshot.cmp_tel !== undefined && cmp_tel !== masterSnapshot.cmp_tel} source={mgrCmpSource}
        isEmpty={!cmp_tel} emptyHint="入力してください">
        <TelInput value={cmp_tel} onChange={setCmpTel} />
      </FormRowAuto>
      <NavButtons onNext={() => {
        if (!mgr_dept || !mgr_role || !mgr_name || !mgr_tel) { setStepError('派遣元責任者の全項目を入力してください'); return }
        if (!cmp_dept || !cmp_role || !cmp_name || !cmp_tel) { setStepError('苦情処理申出先（派遣元）の全項目を入力してください'); return }
        if (validateTel(mgr_tel) || validateTel(cmp_tel)) { setStepError('電話番号の形式が正しくありません'); return }
        setStepError(null)
        handleNext()
      }} error={stepError} />
    </>
  )
}
