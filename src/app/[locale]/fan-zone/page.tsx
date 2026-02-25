import { getTranslations } from "next-intl/server";
import FanZoneContainer from "@/components/fan-zone/FanZoneContainer";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: t("fanZoneTitle"),
    description: t("fanZoneDescription"),
  };
}

export default function FanZonePage() {
  return <FanZoneContainer />;
}
