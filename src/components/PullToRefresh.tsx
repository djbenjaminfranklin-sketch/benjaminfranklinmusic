"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

interface PullToRefreshProps {
  children: React.ReactNode;
}

export default function PullToRefresh({ children }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const threshold = 80;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!pulling || refreshing) return;
      const diff = e.touches[0].clientY - startY.current;
      if (diff > 0) {
        // Apply resistance curve
        const distance = Math.min(diff * 0.4, 120);
        setPullDistance(distance);
      }
    },
    [pulling, refreshing]
  );

  const handleTouchEnd = useCallback(() => {
    if (!pulling) return;
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      setPullDistance(threshold * 0.5);
      // Reload the page data
      window.location.reload();
    } else {
      setPullDistance(0);
    }
    setPulling(false);
  }, [pulling, pullDistance, refreshing]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

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
