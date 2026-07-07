// lib/pdf/EmploymentContractPdf.tsx
import { Document, Page, Text, View, StyleSheet, Font, Image } from "@react-pdf/renderer";
import path from "path";

// lib/pdf/documentText.ts
var toJpDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}\u5E74${d.getMonth() + 1}\u6708${d.getDate()}\u65E5`;
};
var getRetirementClause = (contractType) => {
  if (contractType === "\u6B63\u793E\u54E1") {
    return "\u2460\u5B9A\u5E74\u5236\uFF1A\u6709\uFF08\u5F93\u696D\u54E1\u306E\u5B9A\u5E74\u306F\u9078\u629E\u5B9A\u5E74\u5236\u3068\u3057\u3001\u5B9A\u5E74\u65E5\u306F\u6E8060\u6B73\u304B\u3089\u6E8065\u6B73\u306B\u9054\u3059\u308B\u307E\u3067\u306E\u5404\u6708\u672B\u65E5\u306E\u5185\u304B\u3089\u5F93\u696D\u54E1\u304C\u9078\u629E\u3067\u304D\u308B\u3082\u306E\u3068\u3059\u308B\u3002\uFF09\n\u2461\u81EA\u5DF1\u90FD\u5408\u9000\u8077\u306E\u624B\u7D9A\uFF3B\u9000\u8077\u3059\u308B3\u30F6\u6708\u4EE5\u4E0A\u524D\u306B\u5C4A\u3051\u51FA\u3001\u9000\u8077\u5F8C\u901F\u3084\u304B\u306B\u8CB8\u4E0E\u7269\u3092\u8FD4\u5374\uFF3D\n\u2462\u89E3\u96C7\u4E8B\u7531\u53CA\u3073\u624B\u7D9A\uFF08\u5C31\u696D\u898F\u5247\u7B2C8\u7AE0\u305D\u306E\u4ED6\u95A2\u9023\u3059\u308B\u898F\u7A0B\u306B\u5F93\u3046\uFF09";
  }
  if (contractType === "\u6709\u671F\u5951\u7D04" || contractType === "\u7121\u671F\u5951\u7D04") {
    return "\u2460\u5B9A\u5E74\u5236\uFF1A\u6709\uFF08\u5F93\u696D\u54E1\u306E\u5B9A\u5E74\u306F\u9078\u629E\u5B9A\u5E74\u5236\u3068\u3057\u3001\u5B9A\u5E74\u65E5\u306F\u6E8060\u6B73\u304B\u3089\u6E8065\u6B73\u306B\u9054\u3059\u308B\u307E\u3067\u306E\u5404\u6708\u672B\u65E5\u306E\u5185\u304B\u3089\u5F93\u696D\u54E1\u304C\u9078\u629E\u3067\u304D\u308B\u3082\u306E\u3068\u3059\u308B\u3002\uFF09\n\u2461\u81EA\u5DF1\u90FD\u5408\u9000\u8077\u306E\u624B\u7D9A\uFF3B\u9000\u8077\u3059\u308B30\u65E5\u4EE5\u4E0A\u524D\u306B\u5C4A\u3051\u51FA\u3001\u9000\u8077\u5F8C\u901F\u3084\u304B\u306B\u8CB8\u4E0E\u7269\u3092\u8FD4\u5374\uFF3D\n\u2462\u89E3\u96C7\u4E8B\u7531\u53CA\u3073\u624B\u7D9A\uFF08\u5951\u7D04\u793E\u54E1\u5C31\u696D\u898F\u5247\u7B2C8\u7AE0\u305D\u306E\u4ED6\u95A2\u9023\u3059\u308B\u898F\u7A0B\u306B\u5F93\u3046\uFF09";
  }
  return null;
};
var HOLIDAY_CLAUSE_LINES = [
  "\u9031\u4F112\u65E5\u3000\u30B7\u30D5\u30C8\u5236\u3000[\uFF11\u304B\u6708\u5358\u4F4D\u306E\u5909\u5F62\u52B4\u50CD\u6642\u9593\u5236\u306E\u5834\u5408]",
  "\u6642\u9593\u5916\u306F\u300136\u5354\u5B9A\u306E\u7BC4\u56F2\u5185\u3067\u53EF\u80FD\u3068\u3059\u308B\u3002(\u5B9F\u50CD8\u6642\u9593\u3092\u8D85\u3048\u308B\u52B4\u50CD\u306B\u95A2\u3057\u3066\u306F\u3001\u6642\u9593\u5916\u52B4\u50CD\u6271\u3044\u3068\u3057\u30013\u6642\u9593/\u65E5\u300145\u6642\u9593/\u6708\u3001360\u6642\u9593/\u5E74\u306E\u7BC4\u56F2\u5185\u3068\u3059\u308B\u3002\uFF09\u3001\u4F11\u65E5\u52B4\u50CD\u306F\u30011\u30F6\u6708\u306B4\u65E5\u306E\u7BC4\u56F2\u3067\u547D\u305A\u308B\u3053\u3068\u304C\u3067\u304D\u308B\u3082\u306E\u3068\u3059\u308B\u3002",
  "\u5E74\u6B21\u6709\u7D66\u4F11\u6687\u306F6\u30F6\u6708\u7D99\u7D9A\u52E4\u52D9\u3057\u305F\u5834\u5408\u5E74\u9593\u4ED8\u4E0E"
];
var WAGE_PAYMENT_TEXT = "\u9280\u884C\u632F\u8FBC\u3000\uFF3B\u632F\u8FBC\u53E3\u5EA7\u304C\u307F\u305A\u307B\u9280\u884C\u9EB9\u753A\u652F\u5E97\u307E\u305F\u306F\u308A\u305D\u306A\u9280\u884C\u30B0\u30EB\u30FC\u30D7\uFF08\u652F\u5E97\u4E0D\u554F\uFF09\u306E\u5834\u5408\u306F\u624B\u6570\u6599\u7121\u6599\u3068\u3057\u3001\u305D\u306E\u4ED6\u9280\u884C\u306E\u5834\u5408\u306F\u632F\u8FBC\u624B\u6570\u6599500\u5186\u3092\u5FC5\u8981\u3068\u3059\u308B\u3002\uFF3D\n\u8CC3\u91D1\u7DE0\u5207\u65E5\u3000\uFF3B\u3000\u5F53\u6708\u672B\u65E5\u3000\uFF3D\u3000/\u3000\u8CC3\u91D1\u652F\u6255\u65E5\u3000\uFF3B\u3000\u7FCC\u670825\u65E5\u3000\uFF3D";
var OVERTIME_RATE_TEXT = "\u6CD5\u5B9A\u306E\u5272\u5408\u306B\u57FA\u3065\u304F\u3002";
var getDeductionText = (hasEmployInsurance, hasSocialInsurance) => {
  const items = [];
  if (hasEmployInsurance) items.push("\u96C7\u7528\u4FDD\u967A");
  if (hasSocialInsurance) items.push("\u5065\u5EB7\u4FDD\u967A", "\u539A\u751F\u5E74\u91D1");
  if (items.length === 0) return "[\u6E90\u6CC9\u6240\u5F97\u7A0E]";
  return `[\u793E\u4F1A\u4FDD\u967A\u6599\uFF08${items.join("\u3001")}\uFF09\u30FB\u6E90\u6CC9\u6240\u5F97\u7A0E]`;
};
var getInsuranceLine = (hasEmployInsurance, hasSocialInsurance) => {
  const items = ["\u52B4\u707D\u4FDD\u967A"];
  if (hasSocialInsurance) items.push("\u5065\u5EB7\u4FDD\u967A", "\u539A\u751F\u5E74\u91D1");
  if (hasEmployInsurance) items.push("\u96C7\u7528\u4FDD\u967A");
  return items.join(" / ");
};
var getTrialText = (trialPeriod, trialStart, trialEnd) => {
  if (trialPeriod !== "\u6709" || !trialStart || !trialEnd) {
    return "\u8A66\u7528\u671F\u9593\uFF1A\u3000\u7121";
  }
  return `\u8A66\u7528\u671F\u9593\uFF1A\u3000\u6709
\u8A66\u7528\u671F\u9593\uFF1A${toJpDate(trialStart)}\u301C${toJpDate(trialEnd)}\u307E\u3067\u3000\uFF08\u8A66\u7528\u671F\u9593\u5EF6\u9577\u306E\u5834\u5408\u306F\u3001\u305D\u306E2\u9031\u9593\u524D\u307E\u3067\u306B\u901A\u77E5\u3057\u307E\u3059\uFF09
\u8A66\u7528\u671F\u9593\u6E80\u4E86\u5F8C\u306E\u672C\u63A1\u7528\u306F\u6B21\u306E\u3044\u305A\u308C\u304B\u306B\u3088\u308A\u5224\u65AD\u3057\u307E\u3059\u3002
\u2460\u8A66\u7528\u671F\u9593\u6E80\u4E86\u6642\u306E\u696D\u52D9\u91CF\u3000\u2461\u5F93\u4E8B\u3057\u3066\u3044\u308B\u696D\u52D9\u306E\u9032\u6357\u72B6\u6CC1\u3000\u2462\u80FD\u529B\u3001\u52E4\u52D9\u6210\u7E3E\u3001\u52E4\u52D9\u614B\u5EA6\u3000\u2463\u5065\u5EB7\u72B6\u614B\u3001\u2464\u8077\u52D9\u3078\u306E\u9069\u6B63\u6027\u305D\u306E\u4ED6\u5C31\u696D\u898F\u5247\u4E0A\u306E\u898F\u5B9A\u57FA\u6E96
\u8A66\u7528\u671F\u9593\u958B\u59CB\u65E5\u3088\u308A14\u65E5\u7D4C\u904E\u5F8C\u306E\u672C\u63A1\u7528\u62D2\u5426\u306E\u5834\u5408\u306F\u3001\u5C11\u306A\u304F\u3068\u3082\u672C\u63A1\u7528\u62D2\u5426\u9000\u8077\u306E30\u65E5\u524D\u306B\u901A\u77E5\u3057\u307E\u3059\u3002`;
};
var FIXED_REMARKS_SUFFIX = "\u4E0A\u8A18\u4EE5\u5916\u306E\u4E8B\u9805\u306B\u3064\u3044\u3066\u306F\u3001\u5F53\u793E\u5C31\u696D\u898F\u5247\u53CA\u3073\u8CC3\u91D1\u898F\u5B9A\u306B\u3088\u308B\u3002\u624B\u5F53\u306F\u30AF\u30E9\u30A4\u30A2\u30F3\u30C8\u898F\u5B9A\u306B\u3088\u308A\u652F\u6255\u3046\u3082\u306E\u3068\u3059\u308B\u3002";
var getRemarksText = (pattern, contractType, bonusType) => {
  const suffix = FIXED_REMARKS_SUFFIX;
  if (pattern === "B") return "";
  const isSeishain = contractType === "\u6B63\u793E\u54E1";
  const isKeiyaku = contractType === "\u6709\u671F\u5951\u7D04" || contractType === "\u7121\u671F\u5951\u7D04" || contractType === "\u30A2\u30EB\u30D0\u30A4\u30C8";
  if (pattern === "C") {
    if (isKeiyaku) return `\u8CDE\u4E0E\u3010\u7121\u3011\u3001\u9000\u8077\u624B\u5F53\u3010\u6709\u3011(\u9000\u8077\u624B\u5F53\u524D\u6255\u3044\u5236\u5EA6)\u3001\u6607\u7D66\u3010\u7121\u3011(\u5951\u7D04\u66F4\u65B0\u6642\u306B\u6539\u5B9A\u3059\u308B\u5834\u5408\u304C\u3042\u308B\u3002)
${suffix}`;
    if (isSeishain && bonusType === "\u3042\u308A") return `\u8CDE\u4E0E\u3010\u6709\u3011\u3001\u9000\u8077\u624B\u5F53\u3010\u6709\u3011(\u9000\u8077\u624B\u5F53\u524D\u6255\u3044\u5236\u5EA6)\u3001\u6607\u7D66\u3010\u7121\u3011(\u5951\u7D04\u66F4\u65B0\u6642\u306B\u6539\u5B9A\u3059\u308B\u5834\u5408\u304C\u3042\u308B\u3002)
${suffix}`;
    if (isSeishain && bonusType === "\u306A\u3057") return `\u8CDE\u4E0E\u3010\u7121\u3011\u3001\u9000\u8077\u624B\u5F53\u3010\u6709\u3011(\u9000\u8077\u624B\u5F53\u524D\u6255\u3044\u5236\u5EA6)\u3001\u6607\u7D66\u3010\u7121\u3011(\u5951\u7D04\u66F4\u65B0\u6642\u306B\u6539\u5B9A\u3059\u308B\u5834\u5408\u304C\u3042\u308B\u3002)
${suffix}`;
  }
  if (pattern === "A") {
    if (isKeiyaku) return `\u8CDE\u4E0E\u3010\u7121\u3011\u3001\u6607\u7D66\u3010\u7121\u3011(\u5951\u7D04\u66F4\u65B0\u6642\u306B\u6539\u5B9A\u3059\u308B\u5834\u5408\u304C\u3042\u308B\u3002)
${suffix}`;
    if (isSeishain && bonusType === "\u3042\u308A") return `\u8CDE\u4E0E\u3010\u6709\u3011\u3001\u6607\u7D66\u3010\u7121\u3011(\u5951\u7D04\u66F4\u65B0\u6642\u306B\u6539\u5B9A\u3059\u308B\u5834\u5408\u304C\u3042\u308B\u3002)
${suffix}`;
    if (isSeishain && bonusType === "\u306A\u3057") return `\u8CDE\u4E0E\u3010\u7121\u3011\u3001\u6607\u7D66\u3010\u7121\u3011(\u5951\u7D04\u66F4\u65B0\u6642\u306B\u6539\u5B9A\u3059\u308B\u5834\u5408\u304C\u3042\u308B\u3002)
${suffix}`;
  }
  return suffix;
};
var TRANSPORT_BODY_TEXT = {
  default: "\u539F\u5247\u3068\u3057\u3066\u5B9A\u671F\u4EE3\u652F\u7D66\u3000\u2460\u6700\u5BC4\u99C5\u304B\u3089\u52E4\u52D9\u5148\u307E\u3067\u306E\u6700\u5B89\u7D4C\u8DEF\u3067\u306E\u5B9A\u671F\u4EE3\u3068\u3059\u308B\u3002\u2461\u652F\u6255\u4E0A\u9650\u306F3\u4E07\u5186/\u6708\u3068\u3059\u308B\u3002\u2462\u4EA4\u901A\u8CBB\u660E\u7D30\u66F8\u53CA\u3073\u5B9A\u671FIC\u30AB\u30FC\u30C9\u306E\u5199\u3057\uFF08\u30A8\u30D3\u30C7\u30F3\u30B9\uFF09\u304C\u5FC5\u8981\u3002IC\u30AB\u30FC\u30C9\u306F\u5404\u81EA\u3067\u7528\u610F\u3002\u2463\u30A8\u30D3\u30C7\u30F3\u30B9\u306E\u63D0\u51FA\u78BA\u8A8D\u304C\u53D6\u308C\u306A\u3044\u4EA4\u901A\u8CBB\u306F\u3001\u652F\u6255\u3044\u5BFE\u8C61\u5916\u3068\u3059\u308B\u3002",
  included: "\u57FA\u672C\u7D66\u306B\u542B\u3080\u3002\u4F46\u3057\u3001\u696D\u52D9\u4EA4\u901A\u8CBB\u306B\u3064\u3044\u3066\u306F\u5B9A\u671F\u533A\u9593\u5916\u306E\u307F\u5B9F\u8CBB\u652F\u7D66\u3068\u3059\u308B\u3002\u203B\u5B9A\u671F\u533A\u9593\u3068\u306F\u3001\u81EA\u5B85\uFF5E\u5C31\u696D\u5834\u6240\u307E\u3067\u306E\u6700\u9069\u7D4C\u8DEF\u3068\u3059\u308B\u3002",
  gas: "\u79C1\u6709\u8ECA\u901A\u52E4\uFF1A\u30AC\u30BD\u30EA\u30F3\u4EE3\u652F\u7D66\u3000\u3010 12\u5186 / km \u3011\n\u2460\u5225\u9014\u79C1\u6709\u8ECA\u901A\u52E4\u3092\u8A31\u53EF\u3059\u308B\u66F8\u9762\u3092\u63D0\u51FA\u3057\u3001\u898F\u5B9A\u3092\u9075\u5B88\u3059\u308B\u3053\u3068\u3002\u2461\u305D\u306E\u4ED6\u4E0A\u8A18\u4EE5\u5916\u306E\u696D\u52D9\u4EA4\u901A\u8CBB\u306B\u3064\u3044\u3066\u306F\u5B9F\u8CBB\u652F\u7D66\u3068\u3059\u308B\u3002\u2462\u5B9F\u8CBB\u652F\u7D66\u306E\u5834\u5408\u3001\u30A8\u30D3\u30C7\u30F3\u30B9\u306E\u63D0\u51FA\u78BA\u8A8D\u304C\u53D6\u308C\u306A\u3044\u4EA4\u901A\u8CBB\u306F\u3001\u652F\u6255\u3044\u5BFE\u8C61\u5916\u3068\u3059\u308B\u3002",
  "pass-gas": "\u5B9A\u671F\u4EE3\u652F\u7D66\u304A\u3088\u3073\u30AC\u30BD\u30EA\u30F3\u4EE3\u652F\u7D66\u3010\u79C1\u6709\u8ECA\u901A\u52E4(\u6700\u5BC4\u308A\u99C5\u307E\u3067) 12\u5186 / km \u3011\u3000\u2460\u5B9A\u671F\u4EE3\u306B\u3064\u3044\u3066\u306F\u6700\u5BC4\u99C5\u304B\u3089\u52E4\u52D9\u5148\u307E\u3067\u306E\u6700\u5B89\u7D4C\u8DEF\u3067\u306E\u5B9A\u671F\u4EE3\u3068\u3059\u308B\u3002\u2461\u652F\u6255\u4E0A\u9650\u306F3\u4E07\u5186/\u6708\u3068\u3059\u308B\u3002\u2462\u30A8\u30D3\u30C7\u30F3\u30B9\u306E\u63D0\u51FA\u78BA\u8A8D\u304C\u53D6\u308C\u306A\u3044\u4EA4\u901A\u8CBB\u306F\u652F\u6255\u3044\u5BFE\u8C61\u5916\u3068\u3059\u308B\u3002\u2464\u79C1\u6709\u8ECA\u901A\u52E4\u306B\u3064\u3044\u3066\u306F\u5225\u9014\u79C1\u6709\u8ECA\u901A\u52E4\u3092\u8A31\u53EF\u3059\u308B\u66F8\u9762\u3092\u63D0\u51FA\u3057\u3001\u898F\u5B9A\u3092\u9075\u5B88\u3059\u308B\u3053\u3068\u3002"
};
var getTransportText = (transportType) => {
  return TRANSPORT_BODY_TEXT[transportType] || TRANSPORT_BODY_TEXT.default;
};
var TRANSPORT_SECONDARY_NOTE = "15\u65E5\u4EE5\u4E0A\u306E\u52E4\u52D9\u65E5\u6570\u306E\u5834\u5408\u306F\u5B9A\u671F\u4EE3\u652F\u7D66\u3068\u3059\u308B\u3002\u3053\u308C\u306B\u6E80\u305F\u306A\u3044\u52E4\u52D9\u65E5\u6570\u306E\u5834\u5408\u3001\u5B9F\u8CBB\u652F\u7D66\u3068\u3059\u308B\u3002";
var getTransportSecondaryNote = (transportType) => {
  return transportType === "default" || transportType === "pass-gas" ? TRANSPORT_SECONDARY_NOTE : "";
};
var getWorkDaysText = (workDays, workDaysOther) => {
  if (workDays === "\u90315\u65E5") return "\u6982\u306D\u3001\u90315\u65E5\u3068\u3057\u3001\u52E4\u52D9\u65E5\u306F\u5C31\u696D\u898F\u5247\u7B2C3\u7AE0\u304A\u3088\u3073\u52E4\u52D9\u30B7\u30D5\u30C8\u306B\u3088\u308B";
  if (workDays === "other") return workDaysOther || "\u2015";
  return workDays || "\u2015";
};
var COMPANY_HQ_ADDRESS_LINES = ["\u6771\u4EAC\u90FD\u65B0\u5BBF\u533A\u65B0\u5BBF2-16-20", "\u65B0\u5BBF\u901A\u6771\u6D0B\u30D3\u30EB10F"];
var formatHoursMinutes = (h, m) => {
  const hh = Number(h) || 0;
  const mm = Number(m) || 0;
  if (hh === 0 && mm === 0) return "\u2015";
  return mm > 0 ? `${hh}\u6642\u9593${mm}\u5206` : `${hh}\u6642\u9593`;
};
var formatMinutes = (minutes) => {
  const n = Number(minutes);
  if (!n) return "\u2015";
  return `${n}\u5206`;
};
var formatSalaryType = (salaryType) => salaryType ? `${salaryType}\u5236` : "\u2015";
var formatYen = (amount) => {
  const n = Number(amount);
  if (!n) return "\u2015";
  return `${n.toLocaleString()}\u5186`;
};

// lib/pdf/EmploymentContractPdf.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
Font.register({
  family: "BodyFont",
  fonts: [
    { src: path.join(process.cwd(), "assets", "fonts", "ipaexm.ttf"), fontWeight: "normal" },
    { src: path.join(process.cwd(), "assets", "fonts", "NotoSerifJP-Bold.ttf"), fontWeight: "bold" }
  ]
});
Font.registerHyphenationCallback((word) => [word]);
var COMPANY_SEAL_PATH = path.join(process.cwd(), "assets", "images", "company-seal.png");
var BORDER = "#000000";
var LABEL_COL_WIDTH = "17%";
var THICK = 1;
var THIN = 0.6;
var styles = StyleSheet.create({
  page: {
    fontFamily: "BodyFont",
    fontSize: 8.3,
    lineHeight: 1.32,
    padding: 26,
    color: "#000000"
  },
  title: {
    fontSize: 15,
    textAlign: "center",
    letterSpacing: 1,
    marginBottom: 26,
    fontWeight: "bold"
  },
  intro: {
    marginBottom: 8
  },
  table: {
    borderWidth: THICK,
    borderColor: BORDER
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: THICK,
    borderColor: BORDER
  },
  rowLast: {
    flexDirection: "row"
  },
  labelCell: {
    width: LABEL_COL_WIDTH,
    padding: "3 4",
    borderRightWidth: THICK,
    borderColor: BORDER,
    justifyContent: "center"
  },
  labelText: {
    fontWeight: "bold"
  },
  valueCell: {
    width: `${100 - 17}%`,
    padding: 0
  },
  splitLine: {
    flexDirection: "row"
  },
  splitLineWithBorder: {
    flexDirection: "row",
    borderBottomWidth: THIN,
    borderColor: BORDER
  },
  splitSubLabel: {
    width: 78,
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRightWidth: THIN,
    borderColor: BORDER,
    fontWeight: "bold",
    justifyContent: "center"
  },
  splitSubValue: {
    flex: 1,
    paddingVertical: 3,
    paddingHorizontal: 5
  },
  wageGridRow: {
    flexDirection: "row",
    borderBottomWidth: THIN,
    borderColor: BORDER
  },
  wageGridRowLast: {
    flexDirection: "row"
  },
  wageCellLabel: {
    width: "22%",
    padding: "3 4",
    borderRightWidth: THIN,
    borderColor: BORDER,
    justifyContent: "center",
    fontWeight: "bold"
  },
  wageCellValue: {
    width: "28%",
    padding: "3 4",
    borderRightWidth: THIN,
    borderColor: BORDER,
    justifyContent: "center"
  },
  wageCellValueLast: {
    width: "28%",
    padding: "3 4",
    justifyContent: "center"
  },
  freeText: {
    padding: "4 5"
  },
  footerText: {
    marginTop: 8,
    marginBottom: 12
  },
  signatureRow: {
    flexDirection: "row",
    marginTop: 4
  },
  signatureCol: {
    width: "50%",
    position: "relative"
  },
  companySeal: {
    width: 44,
    height: 44,
    position: "absolute",
    top: 6,
    left: 128
  },
  boxedSplitRow: {
    flexDirection: "row"
  },
  boxedSplitMain: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 5
  },
  boxedSplitBox: {
    width: 132,
    borderLeftWidth: THIN,
    borderColor: BORDER,
    padding: "3 6",
    justifyContent: "center"
  },
  boxedSplitBoxLabel: {
    fontSize: 6.6,
    marginBottom: 1,
    fontWeight: "bold"
  }
});
var BoxedSplitRow = ({ main, boxLabel, boxValue }) => /* @__PURE__ */ jsxs(View, { style: styles.boxedSplitRow, children: [
  /* @__PURE__ */ jsx(View, { style: styles.boxedSplitMain, children: typeof main === "string" ? /* @__PURE__ */ jsx(Text, { children: main }) : main }),
  /* @__PURE__ */ jsxs(View, { style: styles.boxedSplitBox, children: [
    /* @__PURE__ */ jsx(Text, { style: styles.boxedSplitBoxLabel, children: boxLabel }),
    typeof boxValue === "string" ? /* @__PURE__ */ jsx(Text, { children: boxValue }) : boxValue
  ] })
] });
var EmploymentPeriodRow = ({ p }) => {
  const isIndefinite = p.contractType === "\u7121\u671F\u5951\u7D04" || p.contractType === "\u6B63\u793E\u54E1";
  const mainText = isIndefinite ? "\u671F\u9593\u306E\u5B9A\u3081\u306A\u3057" : `\u81EA\u3000${toJpDate(p.employStart)}\u3000\u3000\u81F3\u3000${toJpDate(p.employEnd)}`;
  return /* @__PURE__ */ jsxs(View, { style: styles.row, children: [
    /* @__PURE__ */ jsx(View, { style: styles.labelCell, children: /* @__PURE__ */ jsx(Text, { style: styles.labelText, children: "\u96C7\u7528\u671F\u9593" }) }),
    /* @__PURE__ */ jsx(View, { style: styles.valueCell, children: /* @__PURE__ */ jsx(
      BoxedSplitRow,
      {
        main: mainText,
        boxLabel: "\u5951\u7D04\u6761\u4EF6\u9069\u7528\u958B\u59CB\u65E5",
        boxValue: isIndefinite ? toJpDate(p.contractStartDate) : ""
      }
    ) })
  ] });
};
var LabeledRow = ({ label, children, last, minHeight }) => /* @__PURE__ */ jsxs(View, { style: minHeight ? [last ? styles.rowLast : styles.row, { minHeight }] : last ? styles.rowLast : styles.row, children: [
  /* @__PURE__ */ jsx(View, { style: styles.labelCell, children: /* @__PURE__ */ jsx(Text, { style: styles.labelText, children: label }) }),
  /* @__PURE__ */ jsx(View, { style: styles.valueCell, children })
] });
var SplitLines = ({ lines }) => /* @__PURE__ */ jsx(Fragment, { children: lines.map((l, i) => /* @__PURE__ */ jsxs(View, { style: i < lines.length - 1 ? styles.splitLineWithBorder : styles.splitLine, children: [
  /* @__PURE__ */ jsx(View, { style: styles.splitSubLabel, children: /* @__PURE__ */ jsx(Text, { children: l.label }) }),
  /* @__PURE__ */ jsx(View, { style: styles.splitSubValue, children: typeof l.value === "string" ? /* @__PURE__ */ jsx(Text, { children: l.value }) : l.value })
] }, i)) });
var WageGrid = ({ p, overtimeHoursNote }) => {
  const rows = [
    ["\u7D66\u4E0E\u306E\u7A2E\u985E", formatSalaryType(p.salaryType), "\u5F79\u8077\u624B\u5F53", formatYen(p.rolePay)],
    ["\u57FA\u672C\u7D66", formatYen(p.basicSalary), "\u55B6\u696D\u624B\u5F53", formatYen(p.salesPay)],
    ["\u8077\u80FD\u7D66", formatYen(p.skillPay), "\u4F4F\u5B85\u624B\u5F53", formatYen(p.housingPay)],
    ["\u5B9A\u984D\u6B8B\u696D\u624B\u5F53", `${formatYen(p.overtimePay)}${overtimeHoursNote}`, "\u5272\u5897\u8CC3\u91D1\u7387", OVERTIME_RATE_TEXT]
  ];
  return /* @__PURE__ */ jsx(Fragment, { children: rows.map(([l1, v1, l2, v2], i) => /* @__PURE__ */ jsxs(View, { style: i < rows.length - 1 ? styles.wageGridRow : styles.wageGridRowLast, children: [
    /* @__PURE__ */ jsx(View, { style: styles.wageCellLabel, children: /* @__PURE__ */ jsx(Text, { children: l1 }) }),
    /* @__PURE__ */ jsx(View, { style: styles.wageCellValue, children: /* @__PURE__ */ jsx(Text, { children: v1 }) }),
    /* @__PURE__ */ jsx(View, { style: styles.wageCellLabel, children: /* @__PURE__ */ jsx(Text, { children: l2 }) }),
    /* @__PURE__ */ jsx(View, { style: styles.wageCellValueLast, children: /* @__PURE__ */ jsx(Text, { children: v2 }) })
  ] }, i)) });
};
var EmploymentContractPdf = (p) => {
  const retirementClause = getRetirementClause(p.contractType);
  const workDaysText = getWorkDaysText(p.workDays, p.workDaysOther);
  const overtimeHoursNote = Number(p.overtimeHours) > 0 ? `\u3000\u203B\u5B9A\u984D\u6B8B\u696D\u6642\u9593\uFF1A${p.overtimeHours}\u6642\u9593` : "";
  const deductionText = getDeductionText(p.hasEmployInsurance, p.hasSocialInsurance);
  const transportSecondaryNote = getTransportSecondaryNote(p.transportType);
  return /* @__PURE__ */ jsx(Document, { children: /* @__PURE__ */ jsxs(Page, { size: "A4", style: styles.page, children: [
    /* @__PURE__ */ jsx(Text, { style: styles.title, children: p.documentLabel }),
    /* @__PURE__ */ jsxs(Text, { style: styles.intro, children: [
      "\u682A\u5F0F\u4F1A\u793E\uFF21\uFF30\u30D1\u30FC\u30C8\u30CA\u30FC\u30BA(\u4EE5\u4E0B\u300C\u7532\u300D\u3068\u3044\u3046)\u3068\u3000",
      p.employeeName,
      "\u3000(\u4EE5\u4E0B\u300C\u4E59\u300D\u3068\u3044\u3046)\u306F\u3001\u4E0B\u8A18\u306E\u3068\u304A\u308A\u96C7\u7528\u5951\u7D04\u3092\u7DE0\u7D50\u3059\u308B\u3002"
    ] }),
    /* @__PURE__ */ jsxs(View, { style: styles.table, children: [
      /* @__PURE__ */ jsx(EmploymentPeriodRow, { p }),
      /* @__PURE__ */ jsx(LabeledRow, { label: "\u5C31\u696D\u5834\u6240", children: /* @__PURE__ */ jsx(SplitLines, { lines: [
        {
          label: "(\u96C7\u5165\u308C\u6642)",
          value: `${p.workLocationName}\u3000${p.workLocationAddress}${p.workLocationTel ? `\u3000TEL ${p.workLocationTel}` : ""}`
        },
        { label: "(\u5909\u66F4\u306E\u7BC4\u56F2)", value: "\u4F1A\u793E\u306E\u5B9A\u3081\u308B\u4E8B\u696D\u6240" }
      ] }) }),
      /* @__PURE__ */ jsx(LabeledRow, { label: "\u5F93\u4E8B\u3059\u3079\u304D\n\u696D\u52D9\u5185\u5BB9", children: /* @__PURE__ */ jsx(SplitLines, { lines: [
        { label: "(\u96C7\u5165\u308C\u6642)", value: p.businessContent },
        { label: "(\u5909\u66F4\u306E\u7BC4\u56F2)", value: "\u4F1A\u793E\u304C\u6307\u793A\u3059\u308B\u696D\u52D9" }
      ] }) }),
      /* @__PURE__ */ jsx(LabeledRow, { label: "\u59CB\u696D\u30FB\u7D42\u696D\u6642\u523B", children: /* @__PURE__ */ jsx(SplitLines, { lines: [
        { label: "\u59CB\u696D", value: p.startTime },
        { label: "\u7D42\u696D", value: p.endTime + (p.isShift ? "\u3000\u203B\u30B7\u30D5\u30C8\u306B\u6E96\u305A\u308B" : "") }
      ] }) }),
      /* @__PURE__ */ jsxs(View, { style: styles.row, children: [
        /* @__PURE__ */ jsx(View, { style: styles.labelCell, children: /* @__PURE__ */ jsx(Text, { style: styles.labelText, children: "\u6240\u5B9A\u52B4\u50CD\u65E5\u6570\n\u6240\u5B9A\u52B4\u50CD\u6642\u9593" }) }),
        /* @__PURE__ */ jsx(View, { style: styles.valueCell, children: /* @__PURE__ */ jsx(
          BoxedSplitRow,
          {
            main: /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(Text, { children: workDaysText }),
              /* @__PURE__ */ jsx(Text, { children: formatHoursMinutes(p.workingHoursH, p.workingHoursM) })
            ] }),
            boxLabel: "\u6240\u5B9A\u52B4\u50CD\u6642\u9593\u3092\u8D85\u3048\u308B\u52B4\u50CD",
            boxValue: p.overtime || "\u2015"
          }
        ) })
      ] }),
      /* @__PURE__ */ jsxs(View, { style: styles.row, children: [
        /* @__PURE__ */ jsx(View, { style: styles.labelCell, children: /* @__PURE__ */ jsx(Text, { style: styles.labelText, children: "\u4F11\u61A9\u6642\u9593" }) }),
        /* @__PURE__ */ jsx(View, { style: styles.valueCell, children: /* @__PURE__ */ jsx(
          BoxedSplitRow,
          {
            main: formatMinutes(p.breakTime),
            boxLabel: "\u5909\u5F62\u52B4\u50CD\u6642\u9593\u5236",
            boxValue: p.flexTime || "\u2015"
          }
        ) })
      ] }),
      /* @__PURE__ */ jsx(LabeledRow, { label: "\u4F11\u65E5\u53C8\u306F\u52E4\u52D9\n\u4F11\u6687", children: /* @__PURE__ */ jsx(View, { style: styles.freeText, children: HOLIDAY_CLAUSE_LINES.map((line, i) => /* @__PURE__ */ jsx(Text, { children: line }, i)) }) }),
      /* @__PURE__ */ jsx(LabeledRow, { label: "\u8CC3\u91D1", children: /* @__PURE__ */ jsx(WageGrid, { p, overtimeHoursNote }) }),
      /* @__PURE__ */ jsx(LabeledRow, { label: "\u8CC3\u91D1\u652F\u6255\u65B9\u6CD5\n\n\u652F\u6255\u6642\u306E\u63A7\u9664", children: /* @__PURE__ */ jsxs(View, { style: styles.freeText, children: [
        /* @__PURE__ */ jsx(Text, { children: WAGE_PAYMENT_TEXT }),
        /* @__PURE__ */ jsxs(Text, { children: [
          "\u8CC3\u91D1\u652F\u6255\u6642\u306E\u63A7\u9664\uFF1A",
          deductionText || "\u306A\u3057"
        ] })
      ] }) }),
      /* @__PURE__ */ jsx(LabeledRow, { label: "\u4EA4\u901A\u8CBB", children: /* @__PURE__ */ jsxs(View, { style: styles.freeText, children: [
        /* @__PURE__ */ jsx(Text, { children: getTransportText(p.transportType) }),
        transportSecondaryNote ? /* @__PURE__ */ jsx(Text, { children: transportSecondaryNote }) : null
      ] }) }),
      retirementClause && /* @__PURE__ */ jsx(LabeledRow, { label: "\u9000\u8077\u30FB\u89E3\u96C7", children: /* @__PURE__ */ jsx(Text, { style: styles.freeText, children: retirementClause }) }),
      /* @__PURE__ */ jsx(LabeledRow, { label: "\u5404\u7A2E\u4FDD\u967A", children: /* @__PURE__ */ jsx(Text, { style: styles.freeText, children: getInsuranceLine(p.hasEmployInsurance, p.hasSocialInsurance) }) }),
      /* @__PURE__ */ jsx(LabeledRow, { label: "\u8A66\u7528\u671F\u9593", minHeight: 62, children: /* @__PURE__ */ jsx(Text, { style: styles.freeText, children: getTrialText(p.trialPeriod, p.trialStart, p.trialEnd) }) }),
      /* @__PURE__ */ jsx(LabeledRow, { label: "\u5099\u8003\n\u305D\u306E\u4ED6", last: true, children: /* @__PURE__ */ jsx(Text, { style: styles.freeText, children: getRemarksText(p.pattern, p.contractType, p.bonusType) }) })
    ] }),
    /* @__PURE__ */ jsx(Text, { style: styles.footerText, children: "\u682A\u5F0F\u4F1A\u793EAP\u30D1\u30FC\u30C8\u30CA\u30FC\u30BA\u306F\u672C\u66F8\u306B\u3066\u63D0\u793A\u3057\u305F\u5185\u5BB9\u306B\u76F8\u9055\u306A\u3044\u3053\u3068\u3092\u4FDD\u8A3C\u3057\u3001\u5F93\u696D\u54E1\u306F\u4E0A\u8A18\u63D0\u793A\u5185\u5BB9\u3092\u627F\u8AFE\u3059\u308B\u3002" }),
    /* @__PURE__ */ jsxs(View, { style: styles.signatureRow, children: [
      /* @__PURE__ */ jsxs(View, { style: styles.signatureCol, children: [
        /* @__PURE__ */ jsx(Text, { children: "\u4F1A\u793E" }),
        COMPANY_HQ_ADDRESS_LINES.map((line, i) => /* @__PURE__ */ jsx(Text, { children: line }, i)),
        /* @__PURE__ */ jsx(Text, { style: { fontWeight: "bold" }, children: "\u682A\u5F0F\u4F1A\u793EAP\u30D1\u30FC\u30C8\u30CA\u30FC\u30BA" }),
        /* @__PURE__ */ jsx(Text, { children: "\u4EE3\u8868\u53D6\u7DE0\u5F79\u3000\u5C71\u7530\u3000\u660C" }),
        p.showSeal && /* @__PURE__ */ jsx(Image, { src: COMPANY_SEAL_PATH, style: styles.companySeal })
      ] }),
      /* @__PURE__ */ jsxs(View, { style: styles.signatureCol, children: [
        /* @__PURE__ */ jsx(Text, { children: "\u5F93\u696D\u54E1" }),
        /* @__PURE__ */ jsxs(Text, { children: [
          "\u4F4F\u6240\uFF1A",
          p.employeeAddress || ""
        ] }),
        /* @__PURE__ */ jsxs(Text, { children: [
          "\u6C0F\u540D\uFF1A",
          p.employeeName
        ] })
      ] })
    ] })
  ] }) });
};
export {
  EmploymentContractPdf
};
