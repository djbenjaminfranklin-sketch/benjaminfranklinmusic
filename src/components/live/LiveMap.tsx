"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#181818" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f2f2f" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    __gmapsLoaded?: boolean;
    __gmapsCallbacks?: (() => void)[];
    google?: any;
    __gmapsInit?: () => void;
  }
}

function loadGoogleMaps(): Promise<void> {
  if (window.__gmapsLoaded && window.google?.maps) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    if (!window.__gmapsCallbacks) {
      window.__gmapsCallbacks = [];
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&callback=__gmapsInit`;
      script.async = true;
      script.defer = true;
      window.__gmapsInit = () => {
        window.__gmapsLoaded = true;
        window.__gmapsCallbacks!.forEach((cb) => cb());
        window.__gmapsCallbacks = [];
      };
      document.head.appendChild(script);
    }
    window.__gmapsCallbacks.push(resolve);
  });
}

interface LiveMapProps {
  lat: number;
  lng: number;
}

export default function LiveMap({ lat, lng }: LiveMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const t = useTranslations("live");

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps().then(() => {
      if (cancelled || !mapRef.current) return;

      const gmaps = window.google.maps;
      const center = { lat, lng };

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new gmaps.Map(mapRef.current, {
          center,
          zoom: 15,
          styles: DARK_MAP_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
        });

        markerRef.current = new gmaps.Marker({
          position: center,
          map: mapInstanceRef.current,
          title: "DJ Location",
        });

        circleRef.current = new gmaps.Circle({
          map: mapInstanceRef.current,
          center,
          radius: 50,
          fillColor: "#f97316",
          fillOpacity: 0.2,
          strokeColor: "#f97316",
          strokeOpacity: 0.6,
          strokeWeight: 2,
        });
      } else {
        mapInstanceRef.current.setCenter(center);
        markerRef.current?.setPosition(center);
        circleRef.current?.setCenter(center);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return (
    <div className="mt-4 rounded-2xl overflow-hidden border border-border">
      <div className="px-4 py-2 bg-card border-b border-border">
        <span className="text-xs font-medium text-foreground/60">{t("liveFrom")}</span>
      </div>
      <div ref={mapRef} className="w-full h-[250px]" />
    </div>
  );
}
