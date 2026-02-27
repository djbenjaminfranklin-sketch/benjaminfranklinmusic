"use client";

import { useState, useCallback, useRef } from "react";

interface PlacePrediction {
  name: string;
  address: string;
  placeId: string;
}

export function usePlacesSearch() {
  const [results, setResults] = useState<PlacePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((query: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/admin/places?query=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (res.ok) {
          setResults(data.predictions || []);
        }
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  return { results, isSearching, search };
}
