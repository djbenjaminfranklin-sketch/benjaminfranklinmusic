import type { Show, PastSet, Release } from "@/shared/types";

const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "";
const r2 = (path: string) => (R2_BASE ? `${R2_BASE}${path}` : path);

const siteConfig = {
  artist: {
    name: "Benjamin Franklin",
    email: "booking@benjaminfranklinmusic.com",
  },

  assets: {
    logo: "/logo.png",
    logoTransparent: "/logo.png",
    avatar: "/avatar.jpg",
    heroImage: "/hero.jpg",
    bioImage: "/hero.jpg",
    heroImagePos: "25",
    bioImagePos: "15",
  },

  theme: {
    accent: "#c9a84c",
    background: "#0a0a0a",
    foreground: "#ededed",
    card: "#111113",
    border: "#1e1e22",
    primary: "#ffffff",
  },

  socials: {
    spotify: "https://open.spotify.com/artist/7GALLXYUZiyfa1gYGMJOHU",
    instagram: "https://instagram.com/benjaminfranklinmusic",

    tiktok: "https://tiktok.com/@benjamin.franklin2153",
  },

  navigation: [
    {
      key: "music",
      href: "/music",
      icon: "Music" as const,
    },
    {
      key: "shows",
      href: "/shows",
      icon: "Calendar" as const,
    },
    {
      key: "fanZone",
      href: "/fan-zone",
      icon: "Users" as const,
    },
  ],

  shows: {
    upcoming: [] as Show[],
    past: [] as PastSet[],
  },

  releases: [
    {
      id: "release-1",
      title: "THIS SOUND",
      type: "single",
      releaseDate: "2025-06-16",
      coverUrl: "/covers/this-sound.jpg",
      audioUrl: r2("/audio/the-bomb-remix.mp3"),
      featured: true,
    },
    {
      id: "release-2",
      title: "Ain't No Love",
      type: "single",
      releaseDate: "2025-05-15",
      coverUrl: "/covers/aint-no-love.jpg",
      audioUrl: r2("/audio/aint-no-love.mp3"),
    },
    {
      id: "release-3",
      title: "Try To Fight",
      type: "single",
      releaseDate: "2025-06-02",
      coverUrl: "/covers/try-to-fight.jpg",
      audioUrl: r2("/audio/try-to-fight.mp3"),
    },
    {
      id: "release-4",
      title: "Chupa Sin Mano",
      type: "single",
      releaseDate: "2025-10-29",
      coverUrl: "/covers/chupa-sin-mano.jpg",
      audioUrl: r2("/audio/chupa-sin-mano.mp3"),
    },
    {
      id: "release-5",
      title: "This Is MY House",
      type: "single",
      releaseDate: "2024-09-03",
      coverUrl: "/covers/this-is-my-house.jpg",
      audioUrl: r2("/audio/this-is-my-house.mp3"),
    },
    {
      id: "release-6",
      title: "Saudade",
      type: "single",
      releaseDate: "2025-02-19",
      coverUrl: "/covers/saudade.jpg",
      audioUrl: r2("/audio/saudade.mp3"),
    },
    {
      id: "release-7",
      title: "Peace In The World",
      type: "single",
      releaseDate: "2024-06-11",
      coverUrl: "/covers/peace-in-the-world.jpg",
      audioUrl: r2("/audio/peace-in-the-world.mp3"),
    },
    {
      id: "release-9",
      title: "God Save The World",
      type: "single",
      releaseDate: "2023-05-22",
      coverUrl: "/covers/god-save-the-world.jpg",
      audioUrl: r2("/audio/god-save-the-world.mp3"),
    },
    {
      id: "release-10",
      title: "Como Como",
      type: "single",
      releaseDate: "2025-01-02",
      coverUrl: "/covers/como-como.jpg",
      audioUrl: r2("/audio/como-como.mp3"),
    },
    {
      id: "release-11",
      title: "Pray For Tomorrow",
      type: "single",
      releaseDate: "2024-12-15",
      coverUrl: "/covers/pray-for-tomorrow.jpg",
      audioUrl: r2("/audio/pray-for-tomorrow.mp3"),
    },
    {
      id: "release-12",
      title: "Respect For The DJ's (Underground Mix)",
      type: "remix",
      releaseDate: "2024-11-21",
      coverUrl: "/covers/respect-for-the-djs.jpg",
      audioUrl: r2("/audio/respect-for-the-djs.mp3"),
    },
    {
      id: "release-13",
      title: "Mona Ki Ngi Xica",
      type: "single",
      releaseDate: "2024-08-23",
      coverUrl: "/covers/mona-ki-ngi-xica.jpg",
      audioUrl: r2("/audio/mona-ki-ngi-xica.mp3"),
    },
    {
      id: "release-14",
      title: "Beautiful People (Remix)",
      type: "remix",
      releaseDate: "2024-10-04",
      coverUrl: "/covers/beautiful-people.jpg",
      audioUrl: r2("/audio/beautiful-people-remix.wav"),
    },
    {
      id: "release-15",
      title: "The Way (Benjamin Franklin Remix)",
      type: "remix",
      releaseDate: "2024-08-27",
      coverUrl: "/covers/the-way-remix.jpg",
      audioUrl: r2("/audio/the-way-remix.mp3"),
    },
    {
      id: "release-16",
      title: "What Goes Around",
      type: "single",
      releaseDate: "2025-03-22",
      coverUrl: "/covers/what-goes-around.jpg",
      audioUrl: r2("/audio/what-goes-around.mp3"),
    },
    {
      id: "release-17",
      title: "Give It Up",
      type: "single",
      releaseDate: "2025-02-19",
      coverUrl: "/covers/give-it-up.jpg",
      audioUrl: r2("/audio/give-it-up.mp3"),
    },
    {
      id: "release-18",
      title: "Sunset With You (Benjamin Franklin Remix)",
      type: "remix",
      releaseDate: "2025-04-17",
      coverUrl: "/covers/sunset-with-you-remix.jpg",
      audioUrl: r2("/audio/sunset-with-you-remix.mp3"),
    },
    {
      id: "release-19",
      title: "Peace In The World (Buyabass Remix)",
      type: "remix",
      releaseDate: "2025-03-19",
      coverUrl: "/covers/peace-in-the-world-remix.jpg",
      audioUrl: r2("/audio/peace-in-the-world-remix.mp3"),
    },
    {
      id: "release-20",
      title: "Only Me & You",
      type: "single",
      releaseDate: "2025-07-10",
      coverUrl: "/covers/only-me-and-you.jpg",
      audioUrl: r2("/audio/only-me-and-you.mp3"),
    },
    {
      id: "release-21",
      title: "FAYA (Marbella Club Mix)",
      type: "single",
      releaseDate: "2025-08-01",
      coverUrl: "/covers/faya.jpg",
      audioUrl: r2("/audio/faya.mp3"),
    },
    {
      id: "release-22",
      title: "Running",
      type: "single",
      releaseDate: "2025-09-15",
      coverUrl: "/covers/running.jpg",
      audioUrl: r2("/audio/running.mp3"),
    },
    {
      id: "release-23",
      title: "Na Na Na Na",
      type: "single",
      releaseDate: "2025-10-01",
      coverUrl: "/covers/na-na-na-na.jpeg",
      audioUrl: r2("/audio/na-na-na-na.wav"),
    },
    {
      id: "release-24",
      title: "Hakuna",
      type: "single",
      releaseDate: "2025-11-01",
      coverUrl: "/covers/hakuna.jpg",
      audioUrl: r2("/audio/hakuna.mp3"),
    },
    {
      id: "release-25",
      title: "Build At Home (Remix)",
      type: "remix",
      releaseDate: "2025-11-15",
      coverUrl: "/covers/build-at-home-remix.jpg",
      audioUrl: r2("/audio/build-at-home-remix.mp3"),
    },
    {
      id: "release-26",
      title: "Mattina",
      type: "single",
      releaseDate: "2025-12-01",
      coverUrl: "/covers/mattina.jpg",
      audioUrl: r2("/audio/mattina.mp3"),
    },
    {
      id: "release-27",
      title: "Para Bailar",
      type: "single",
      releaseDate: "2025-12-15",
      coverUrl: "/covers/para-bailar.png",
      audioUrl: r2("/audio/para-bailar.mp3"),
    },
  ] as Release[],

  fanZone: {
    djPassword: process.env.DJ_PASSWORD || "changeme",
  },

  live: {
    adminPassword: process.env.LIVE_ADMIN_PASSWORD || "changeme",
  },

  booking: {
    recipientEmail: "booking@benjaminfranklinmusic.com",
    eventTypeKeys: ["club", "festival", "private", "corporate", "wedding", "other"] as const,
  },
};

export default siteConfig;
