import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("privacyTitle") };
}

export default function PrivacyPage() {
  const t = useTranslations("legal");

  const sections = [
    { title: t("dataCollectedTitle"), text: t("dataCollectedText") },
    { title: t("dataUsageTitle"), text: t("dataUsageText") },
    { title: t("dataStorageTitle"), text: t("dataStorageText") },
    { title: t("userRightsTitle"), text: t("userRightsText") },
    { title: t("contactTitle"), text: t("contactText") },
  ];

  return (
    <div className="min-h-screen bg-background py-20 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-primary mb-4">{t("privacyTitle")}</h1>
        <p className="text-foreground/60 mb-8">{t("privacyIntro")}</p>

        <div className="space-y-8">
          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="text-xl font-semibold text-primary mb-2">{section.title}</h2>
              <p className="text-foreground/70 leading-relaxed">{section.text}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-foreground/40 mt-12">
          {t("lastUpdated")}: 2026-02-27
        </p>
      </div>
    </div>
  );
}
