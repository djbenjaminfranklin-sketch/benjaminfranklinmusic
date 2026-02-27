import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Inter, Raleway } from "next/font/google";
import { routing } from "@/i18n/routing";
import { getDynamicConfig } from "@/shared/lib/dynamic-config";
import Header from "@/shared/layout/Header";
import Footer from "@/shared/layout/Footer";
import { AuthProvider } from "@/features/auth/context/AuthContext";
import { SiteConfigProvider } from "@/shared/contexts/SiteConfigContext";
import AuthGate from "@/features/auth/components/AuthGate";
import PullToRefresh from "@/shared/layout/PullToRefresh";
import PushAutoSubscribe from "@/features/push/components/PushAutoSubscribe";
import { PlayerProvider } from "@/features/music/context/PlayerContext";
import MiniPlayer from "@/features/music/components/MiniPlayer";
import "../globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const raleway = Raleway({
  variable: "--font-display",
  subsets: ["latin"],
});

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  const tHero = await getTranslations({ locale, namespace: "hero" });
  const config = getDynamicConfig();

  return {
    title: {
      default: `${config.artist.name} | ${tHero("tagline")}`,
      template: `%s | ${config.artist.name}`,
    },
    description: t("homeDescription"),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as typeof routing.locales[number])) {
    notFound();
  }

  const messages = await getMessages();
  const config = getDynamicConfig();
  const { theme } = config;

  return (
    <html
      lang={locale}
      className="overflow-x-hidden"
      style={{
        "--theme-background": theme.background,
        "--theme-foreground": theme.foreground,
        "--theme-card": theme.card,
        "--theme-border": theme.border,
        "--theme-accent": theme.accent,
        "--theme-primary": theme.primary,
        "--hero-image-pos": `center ${config.assets.heroImagePos}%`,
        "--bio-image-pos": `center ${config.assets.bioImagePos}%`,
      } as React.CSSProperties}
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
      </head>
      <body className={`${inter.variable} ${raleway.variable} antialiased overflow-x-hidden`}>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <PushAutoSubscribe />
            <SiteConfigProvider config={config}>
              <PlayerProvider>
                <AuthGate>
                  <PullToRefresh>
                    <Header />
                    <main className="min-h-screen">{children}</main>
                    <Footer />
                  </PullToRefresh>
                  <MiniPlayer />
                </AuthGate>
              </PlayerProvider>
            </SiteConfigProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
