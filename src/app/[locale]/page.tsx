import { getLocale } from "next-intl/server";
import { getBio, getTagline } from "@/lib/dynamic-config";
import HeroSection from "@/components/hero/HeroSection";
import BioSection from "@/components/hero/BioSection";

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
