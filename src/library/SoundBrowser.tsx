import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioAsset } from '../audio/library';
import {
  SOUND_EFFECTS,
  SOUND_GROUP_TONE,
  SOUND_GROUPS,
  formatSoundDuration,
  peaksToPath,
  resamplePeaks,
  soundEffectSrc,
  type SoundEffect,
} from '../audio/soundLibrary';
import { Icon } from '../components/icons';
import { setLibraryDrag } from './drag';
import { useFixedVirtualGrid } from '../hooks/useFixedVirtualGrid';

// Sound-library tab:
// search ("Search sounds") + chips [popular, …groups] + list rows:
// [group-color glyph / play] [name] [waveform] [duration] [+ add]

const POPULAR = '__popular__';
const WAVE_W = 100;
const WAVE_H = 32;
const WAVE_BINS = 48;

interface SoundBrowserProps {
  fps: number;
  onAdd: (asset: AudioAsset) => void;
}

function matchesQuery(s: SoundEffect, q: string): boolean {
  if (!q) return true;
  const tokens = q
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^\p{Letter}\p{Number}]+/u)
    .filter(Boolean);
  if (!tokens.length) return true;
  const hay = [
    s.name,
    s.desc,
    s.group,
    ...s.keywords,
    SOUND_GROUPS.find((g) => g.id === s.group)?.name ?? '',
    SOUND_GROUPS.find((g) => g.id === s.group)?.nameEn ?? '',
  ]
    .join(' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

function toAsset(s: SoundEffect, fps: number): AudioAsset {
  return {
    id: `sfx_${s.id}`,
    name: s.name,
    category: 'sfx',
    src: soundEffectSrc(s.id),
    durationInFrames: Math.max(1, Math.round(s.seconds * fps)),
  };
}

export const SoundBrowser = memo(function SoundBrowser({ fps, onAdd }: SoundBrowserProps) {
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<string>(POPULAR);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const playingIdRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef(0);

  const stopAudition = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    audioRef.current = null;
    playingIdRef.current = null;
    setPlayingId(null);
    setProgress(0);
  }, []);

  useEffect(() => () => stopAudition(), [stopAudition]);

  const tick = useCallback(() => {
    const a = audioRef.current;
    if (!a || a.paused || !a.duration) return;
    setProgress(a.currentTime / a.duration);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const audition = useCallback((sound: SoundEffect) => {
    if (playingIdRef.current === sound.id) {
      stopAudition();
      return;
    }
    stopAudition();
    const audio = new Audio(soundEffectSrc(sound.id));
    audio.preload = 'auto';
    audioRef.current = audio;
    playingIdRef.current = sound.id;
    setPlayingId(sound.id);
    setProgress(0);
    audio.onended = () => stopAudition();
    audio.onerror = () => stopAudition();
    void audio.play().then(() => {
      rafRef.current = requestAnimationFrame(tick);
    }).catch(() => stopAudition());
  }, [stopAudition, tick]);

  const list = useMemo(() => {
    const q = query.trim();
    let base = SOUND_EFFECTS.filter((s) => matchesQuery(s, q));
    if (chip === POPULAR) base = base.filter((s) => s.popular);
    else base = base.filter((s) => s.group === chip);
    return [...base].sort((a, b) => a.order - b.order);
  }, [chip, query]);

  const pinnedIndexes = useMemo(() => {
    const pinnedIds = new Set([playingId, focusedId, draggedId].filter((id): id is string => id != null));
    const indexes: number[] = [];
    list.forEach((sound, index) => {
      if (pinnedIds.has(sound.id)) indexes.push(index);
    });
    return indexes;
  }, [draggedId, focusedId, list, playingId]);
  const virtualList = useFixedVirtualGrid({
    itemCount: list.length,
    cardWidth: 1,
    rowHeight: 40,
    rowGap: 4,
    overscanRows: 2,
    fixedColumnCount: 1,
    pinnedIndexes,
  });
  const addSound = useCallback((sound: SoundEffect) => {
    onAdd(toAsset(sound, fps));
  }, [fps, onAdd]);

  return (
    <div className="cc-sound-browser">
      <label className="cc-sound-search" htmlFor="cc-sound-library-search">
        <Icon name="search" size={13} />
        <input
          id="cc-sound-library-search"
          type="search"
          placeholder="Search sounds"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {query ? (
          <button type="button" className="cc-sound-search-clear" onClick={() => setQuery('')} aria-label="Clear">
            <Icon name="x" size={12} />
          </button>
        ) : null}
      </label>

      <div className="cc-sound-chips" role="tablist" aria-label="Sound groups">
        <button
          type="button"
          role="tab"
          aria-selected={chip === POPULAR}
          className={`cc-sound-chip${chip === POPULAR ? ' selected' : ''}`}
          onClick={() => setChip(POPULAR)}
        >
          Popular
        </button>
        {SOUND_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={chip === g.id}
            className={`cc-sound-chip${chip === g.id ? ' selected' : ''}`}
            onClick={() => setChip(g.id)}
          >
            {g.name}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="cc-sound-empty">No sounds in this group{query ? ` (nothing matches "${query}")` : ''}</div>
      ) : (
        <div
          ref={virtualList.containerRef}
          className="cc-sound-list"
          role="listbox"
          aria-label="Sound list"
          style={{ height: virtualList.totalHeight }}
        >
          {virtualList.rows.map((row) => {
            const sound = list[row.startIndex];
            if (!sound) return null;
            return (
              <div
                key={sound.id}
                style={{
                  position: 'absolute',
                  top: row.top,
                  left: 0,
                  width: '100%',
                  height: virtualList.rowHeight,
                }}
              >
                <SoundRow
                  sound={sound}
                  playing={playingId === sound.id}
                  progress={playingId === sound.id ? progress : 0}
                  onAudition={audition}
                  onAdd={addSound}
                  onFocusChange={setFocusedId}
                  onDragChange={setDraggedId}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="cc-sound-hint">{`Click to preview · Double-click / + / drag onto an audio track · ${list.length} sounds total`}</div>
    </div>
  );
});

interface SoundRowProps {
  sound: SoundEffect;
  playing: boolean;
  progress: number;
  onAudition: (sound: SoundEffect) => void;
  onAdd: (sound: SoundEffect) => void;
  onFocusChange: (id: string | null) => void;
  onDragChange: (id: string | null) => void;
}

const SoundRow = memo(function SoundRow({
  sound,
  playing,
  progress,
  onAudition,
  onAdd,
  onFocusChange,
  onDragChange,
}: SoundRowProps) {
  const displayName = sound.name;
  const tone = SOUND_GROUP_TONE[sound.group] ?? SOUND_GROUP_TONE['ui-motion-feedback']!;
  const path = useMemo(
    () => peaksToPath(resamplePeaks(sound.peaks, WAVE_BINS), WAVE_W, WAVE_H),
    [sound.peaks],
  );
  const clipId = `cc-sfx-clip-${sound.id}`;
  return (
    <div
      role="option"
      aria-selected={playing}
      className={`cc-sound-row${playing ? ' active' : ''}`}
      title={`${sound.desc} · Drag onto a timeline audio track`}
      draggable
      onDragStart={(event) => {
        onDragChange(sound.id);
        setLibraryDrag(event, {
          kind: 'sound',
          id: sound.id,
          name: sound.name,
          src: soundEffectSrc(sound.id),
          seconds: sound.seconds,
        });
      }}
      onDragEnd={() => onDragChange(null)}
      onFocusCapture={() => onFocusChange(sound.id)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onFocusChange(null);
      }}
      onClick={() => onAudition(sound)}
      onDoubleClick={() => onAdd(sound)}
    >
      <button
        type="button"
        className="cc-sound-glyph"
        style={{ backgroundColor: tone.bg, color: tone.ink }}
        onClick={(event) => {
          event.stopPropagation();
          onAudition(sound);
        }}
        aria-label={playing ? `Pause ${displayName}` : `Preview ${displayName}`}
      >
        <Icon name={playing ? 'pause' : 'play'} size={12} />
      </button>
      <div className="cc-sound-meta">
        <div className="cc-sound-name">{displayName}</div>
      </div>
      <div className="cc-sound-wave" aria-hidden>
        <svg viewBox={`0 0 ${WAVE_W} ${WAVE_H}`} preserveAspectRatio="none">
          <path d={path} className="cc-sound-wave-base" />
          <clipPath id={clipId}>
            <rect x={0} y={0} width={progress * WAVE_W} height={WAVE_H} />
          </clipPath>
          <path d={path} className="cc-sound-wave-prog" clipPath={`url(#${clipId})`} style={{ fill: tone.glyph }} />
        </svg>
      </div>
      <span className="cc-sound-dur">{formatSoundDuration(sound.seconds)}</span>
      <button
        type="button"
        className="cc-sound-add"
        title={`Add to timeline: ${displayName}`}
        aria-label={`Add ${displayName}`}
        onClick={(event) => {
          event.stopPropagation();
          onAdd(sound);
        }}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
});
