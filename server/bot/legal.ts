/** Refund policy URL not yet provided; entry is filtered out of the keyboard while this placeholder is set. */
const REFUND_POLICY_URL_PLACEHOLDER = "TBD";

export interface LegalDoc {
  title: string;
  url: string;
}

export const LEGAL_DOCS: LegalDoc[] = [
  { title: "Пользовательское соглашение", url: "https://telegra.ph/Polzovatelskoe-soglashenie-07-15-25" },
  { title: "Политика конфиденциальности", url: "https://telegra.ph/Politika-konfidencialnosti-07-15-41" },
  { title: "Политика возврата средств", url: REFUND_POLICY_URL_PLACEHOLDER },
];

/** Legal docs with a configured (non-placeholder) URL, safe to render as buttons. */
export function configuredLegalDocs(): LegalDoc[] {
  return LEGAL_DOCS.filter((d) => d.url !== REFUND_POLICY_URL_PLACEHOLDER);
}
