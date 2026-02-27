"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

interface PullToRefreshProps {
  children: React.ReactNode;
}

export default function PullToRefresh({ children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startY = useRef(0);
  const pullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const threshold = 80;

  // Keep refs in sync with state for values read inside touch handlers
  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleTouchStart(e: TouchEvent) {
      if (window.scrollY === 0 && !refreshingRef.current) {
        startY.current = e.touches[0].clientY;
        pullingRef.current = true;
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (!pullingRef.current || refreshingRef.current) return;
      const diff = e.touches[0].clientY - startY.current;
      if (diff > 0) {
        // Apply resistance curve
        const distance = Math.min(diff * 0.4, 120);
        pullDistanceRef.current = distance;
        setPullDistance(distance);
      }
    }

    function handleTouchEnd() {
      if (!pullingRef.current) return;
      if (pullDistanceRef.current >= threshold && !refreshingRef.current) {
        setRefreshing(true);
        refreshingRef.current = true;
        setPullDistance(threshold * 0.5);
        pullDistanceRef.current = threshold * 0.5;
        // Reload the page data
        window.location.reload();
      } else {
        setPullDistance(0);
        pullDistanceRef.current = 0;
      }
      pullingRef.current = false;
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  const progress = Math.min(pullDistance / threshold, 1);

  return (
    <div ref={containerRef} className="relative">
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200 ease-out"
        style={{
          height: pullDistance > 0 ? `${pullDistance}px` : "0px",
          opacity: progress,
        }}
      >
        <RefreshCw
          className={`h-5 w-5 text-accent transition-transform ${
            refreshing ? "animate-spin" : ""
          }`}
          style={{
            transform: `rotate(${progress * 360}deg)`,
          }}
        />
      </div>

      {children}
    </div>
  );
}
