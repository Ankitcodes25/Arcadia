import LegalPageLayout from "../../components/LegalPageLayout";
import type { LegalSection } from "../../components/LegalPageLayout";

/*
 * Temporary placeholder content only. Replace these sections with the reviewed
 * Cookie Policy before publishing; nothing here describes a real cookie practice.
 */
const COOKIE_SECTIONS: readonly LegalSection[] = [
  {
    heading: "Section One — Placeholder Heading",
    body: "Temporary placeholder text for the first section of the Cookie Policy. Replace this paragraph with your final content.",
  },
  {
    heading: "Section Two — Placeholder Heading",
    body: "Temporary placeholder text for the second section of the Cookie Policy. Replace this paragraph with your final content.",
  },
  {
    heading: "Section Three — Placeholder Heading",
    body: "Temporary placeholder text for the third section of the Cookie Policy. Replace this paragraph with your final content.",
  },
];

function CookiePolicy() {
  return (
    <LegalPageLayout
      title="Cookie Policy"
      intro="This is a temporary introduction for Arcadia's Cookie Policy. Replace this placeholder with the final introduction before publishing."
      sections={COOKIE_SECTIONS}
    />
  );
}

export default CookiePolicy;
