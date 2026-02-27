import { getLocale } from "next-intl/server";
import { getBio, getTagline } from "@/shared/lib/dynamic-config";
import HeroSection from "@/features/hero/components/HeroSection";
import BioSection from "@/features/hero/components/BioSection";

export default async function HomePage() {
  const locale = await getLocale();
  const bioOverride = getBio(locale);
  const taglineOverride = getTagline(locale);

  return (
    <>
      <HeroSection taglineOverride={taglineOverride} />
      <BioSection bioOverride={bioOverride} />
    </>
  );
}
