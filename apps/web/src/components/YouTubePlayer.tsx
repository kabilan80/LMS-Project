import { useEffect, useRef, useState } from 'react';

// Minimal typing for the YouTube IFrame Player API (loaded from youtube.com at runtime).
interface YTPlayer {
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
}
interface YTEvent {
  data: number;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      host: string;
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, number | string>;
      events: { onReady?: () => void; onStateChange?: (e: YTEvent) => void; onError?: () => void };
    },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2 } as const;
const REPORT_EVERY_SECONDS = 5;

let apiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise<YTNamespace>((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT) resolve(window.YT);
        else reject(new Error('The video player did not load.'));
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        apiPromise = null;
        reject(new Error('Could not load the video player. Check your connection.'));
      };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

export interface PlayerProgress {
  positionSeconds: number;
  watchedSeconds: number;
  durationSeconds?: number | undefined;
  ended: boolean;
}

interface Props {
  videoId: string;
  startSeconds: number;
  onProgress: (p: PlayerProgress) => void;
}

/**
 * Plays a YouTube video inside the page (youtube-nocookie.com). Reports progress every few seconds,
 * on pause, and when the video ends. "Watched" counts only time the video was actually playing.
 */
export function YouTubePlayer({ videoId, startSeconds, onProgress }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const startRef = useRef(startSeconds);
  startRef.current = startSeconds;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setError(null);
    let cancelled = false;
    let player: YTPlayer | null = null;
    let watched = 0;
    let ticks = 0;
    let lastPosition = 0;
    let lastDuration = 0;
    const mount = document.createElement('div'); // the API replaces this node, so React never owns it
    el.appendChild(mount);

    const report = (ended = false) => {
      if (!player) return;
      try {
        lastPosition = Math.floor(player.getCurrentTime() || lastPosition);
        lastDuration = Math.floor(player.getDuration() || lastDuration);
      } catch {
        /* the player is already gone: use the last values */
      }
      onProgressRef.current({
        positionSeconds: Math.max(0, lastPosition),
        watchedSeconds: Math.floor(watched),
        durationSeconds: lastDuration > 0 ? lastDuration : undefined,
        ended,
      });
    };

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(mount, {
          host: 'https://www.youtube-nocookie.com',
          videoId,
          width: '100%',
          height: '100%',
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1, start: Math.floor(startRef.current) },
          events: {
            onStateChange: (e) => {
              if (e.data === STATE.PAUSED) report();
              else if (e.data === STATE.ENDED) report(true);
            },
            onError: () => setError('This video is unavailable or private. Please tell your instructor.'),
          },
        });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the video player.'));

    const timer = window.setInterval(() => {
      if (player && player.getPlayerState() === STATE.PLAYING) {
        watched += 1;
        ticks += 1;
        if (ticks % REPORT_EVERY_SECONDS === 0) report();
      }
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      report(); // save where the student stopped
      player?.destroy();
      el.innerHTML = '';
    };
  }, [videoId]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-card bg-black">
      <div ref={box} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />
      {error && (
        <div role="alert" className="absolute inset-0 grid place-items-center bg-navy p-6 text-center text-white">
          <div><b className="mb-1 block font-heading text-[16px]">Video not available</b>{error}</div>
        </div>
      )}
    </div>
  );
}
