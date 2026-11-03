import LegalPageLayout from "../../components/LegalPageLayout";
import type { LegalSection } from "../../components/LegalPageLayout";

/*
 * Temporary placeholder content only. Replace these sections with the reviewed
 * Privacy Policy before publishing; nothing here makes a privacy commitment.
 */
const PRIVACY_SECTIONS: readonly LegalSection[] = [
  {
    heading: "Section One — Placeholder Heading",
    body: "Temporary placeholder text for the first section of the Privacy Policy. Replace this paragraph with your final content.",
  },
  {
    heading: "Section Two — Placeholder Heading",
    body: "Temporary placeholder text for the second section of the Privacy Policy. Replace this paragraph with your final content.",
  },
  {
    heading: "Section Three — Placeholder Heading",
    body: "Temporary placeholder text for the third section of the Privacy Policy. Replace this paragraph with your final content.",
  },
];

function PrivacyPolicy() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      intro="This is a temporary introduction for Arcadia's Privacy Policy. Replace this placeholder with the final introduction before publishing."
      sections={PRIVACY_SECTIONS}
    />
  );
}

export default PrivacyPolicy;
