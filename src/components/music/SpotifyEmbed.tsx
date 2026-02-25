"use client";

interface SpotifyEmbedProps {
  spotifyEmbedId: string;
}

export default function SpotifyEmbed({ spotifyEmbedId }: SpotifyEmbedProps) {
  const isAlbum = spotifyEmbedId.startsWith("album/");
  const height = isAlbum ? 352 : 152;

  return (
    <iframe
      src={`https://open.spotify.com/embed/${spotifyEmbedId}?utm_source=generator&theme=0`}
      width="100%"
      height={height}
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
      className="rounded-lg border border-border"
      title="Spotify Embed"
    />
  );
}
