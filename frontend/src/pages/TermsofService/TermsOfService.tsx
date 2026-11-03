import LegalPageLayout from "../../components/LegalPageLayout";
import type { LegalSection } from "../../components/LegalPageLayout";

/*
 * Temporary placeholder content only. Replace these sections with the reviewed
 * Terms of Service before publishing; nothing here makes a legal claim.
 */
const TERMS_SECTIONS: readonly LegalSection[] = [
  {
    heading: "Section One — Placeholder Heading",
    body: "Temporary placeholder text for the first section of the Terms of Service. Replace this paragraph with your final content.",
  },
  {
    heading: "Section Two — Placeholder Heading",
    body: "Temporary placeholder text for the second section of the Terms of Service. Replace this paragraph with your final content.",
  },
  {
    heading: "Section Three — Placeholder Heading",
    body: "Temporary placeholder text for the third section of the Terms of Service. Replace this paragraph with your final content.",
  },
];

function TermsOfService() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      intro="This is a temporary introduction for Arcadia's Terms of Service. Replace this placeholder with the final introduction before publishing."
      sections={TERMS_SECTIONS}
    />
  );
}

export default TermsOfService;
