'use client';
import { useEffect, useRef } from 'react';

// The sphere video behind every page. Holds frame 1 for reduced motion, and resumes when a background tab comes back.
export function Plate() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const q = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (q.matches) {
        v.pause();
        v.currentTime = 0;
      } else v.play().catch(() => {});
    };
    const onVisible = () => {
      if (!document.hidden) sync();
    };
    q.addEventListener('change', sync);
    document.addEventListener('visibilitychange', onVisible);
    v.addEventListener('canplay', sync);
    sync();
    return () => {
      q.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', onVisible);
      v.removeEventListener('canplay', sync);
    };
  }, []);
  return (
    <div className="plate" aria-hidden="true">
      <video ref={ref} className="bg" autoPlay muted loop playsInline preload="auto" disablePictureInPicture poster="/media/sphere-poster.png" src="/media/sphere.mp4" />
      <div className="tint" />
    </div>
  );
}
