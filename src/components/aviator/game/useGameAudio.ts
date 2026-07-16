import { useEffect, useRef, useCallback } from 'react';
import type { Phase } from './useAviatorGame';
import backgroundMusicSrc from '@assets/background_1783432132115.mp3';
import gameStartSrc from '@assets/game-start_1783432132628.mp3';
import cashoutSrc from '@assets/cashout_1783432132562.mp3';
import planeCrashSrc from '@assets/plane-crash_1783432132674.mp3';

// Preloads audio files and plays them on demand.
// HTMLAudioElement is used instead of AudioContext to avoid browser autoplay restrictions.
function createAudio(src: string, loop = false): HTMLAudioElement {
  const el = new Audio(src);
  el.preload = 'auto';
  if (loop) el.loop = true;
  return el;
}

let sharedBackgroundMusic: HTMLAudioElement | null = null;

function getBackgroundMusic(): HTMLAudioElement {
  if (!sharedBackgroundMusic) {
    sharedBackgroundMusic = createAudio(backgroundMusicSrc, true);
  }
  return sharedBackgroundMusic;
}

export function startAviatorBackgroundMusic() {
  try {
    const music = getBackgroundMusic();
    music.volume = 0.4;
    music.play().catch(() => {
      // Browser may still require a direct gesture; the hook retries on the next gesture.
    });
  } catch {
    // ignore
  }
}

export function useGameAudio(phase: Phase, soundOn: boolean, musicOn: boolean) {
  const prevPhaseRef = useRef<Phase>(phase);
  // Lazily created audio elements, reused across plays
  const startAudioRef = useRef<HTMLAudioElement | null>(null);
  const crashAudioRef = useRef<HTMLAudioElement | null>(null);
  const cashoutAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);
  const musicOnRef = useRef(musicOn);
  musicOnRef.current = musicOn;

  const playBackgroundMusic = useCallback(() => {
    try {
      musicAudioRef.current = getBackgroundMusic();
      startAviatorBackgroundMusic();
    } catch {
      // ignore
    }
  }, []);

  function getAudio(ref: React.MutableRefObject<HTMLAudioElement | null>, src: string, loop = false): HTMLAudioElement {
    if (!ref.current) {
      ref.current = createAudio(src, loop);
    }
    return ref.current;
  }

  function playSound(ref: React.MutableRefObject<HTMLAudioElement | null>, src: string) {
    if (!soundOn) return;
    try {
      const audio = getAudio(ref, src);
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Autoplay blocked — ignore silently
      });
    } catch {
      // HTMLAudioElement not available (SSR / test env)
    }
  }

  // ── Audio unlock + background music ──
  const unlockAudio = useCallback(() => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    // Touch sound-effect elements so iOS/Safari unlocks them without pausing background music.
    [startAudioRef, crashAudioRef, cashoutAudioRef].forEach((ref) => {
      const audio = ref.current;
      if (!audio) return;
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => {});
    });
    // Kick off background music immediately if it's enabled
    if (musicOnRef.current) {
      playBackgroundMusic();
    }
  }, [playBackgroundMusic]);

  useEffect(() => {
    // One-time gesture listener for autoplay unlock
    const gestureEvents = ['pointerdown', 'click', 'touchstart', 'keydown'] as const;
    const handler = () => unlockAudio();
    gestureEvents.forEach((evt) => document.addEventListener(evt, handler, { once: true, passive: true }));
    return () => gestureEvents.forEach((evt) => document.removeEventListener(evt, handler));
  }, [unlockAudio]);

  // Background music loop
  useEffect(() => {
    try {
      const music = getBackgroundMusic();
      musicAudioRef.current = music;
      if (musicOn) {
        playBackgroundMusic();
      } else {
        music.pause();
        music.currentTime = 0;
      }
    } catch {
      // ignore
    }
  }, [musicOn, playBackgroundMusic]);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    if (phase === 'flying' && prev !== 'flying') {
      playSound(startAudioRef, gameStartSrc);
    } else if (phase === 'crashed' && prev !== 'crashed') {
      playSound(crashAudioRef, planeCrashSrc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, soundOn]);

  // Stop ALL audio when the game component unmounts (user leaves the game)
  useEffect(() => {
    return () => {
      [startAudioRef, crashAudioRef, cashoutAudioRef, musicAudioRef].forEach((ref) => {
        const audio = ref.current;
        if (!audio) return;
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          // ignore
        }
      });
    };
  }, []);

  return {
    playCashOut: () => playSound(cashoutAudioRef, cashoutSrc),
  };
}
