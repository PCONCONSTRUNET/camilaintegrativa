'use client';

import { useEffect, useId, useRef, useState } from 'react';

type ServiceAudioPlayerProps = {
  audioUrl: string;
  serviceName?: string;
  audioName?: string | null;
  compact?: boolean;
};

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

const WAVE_BARS = [35, 65, 48, 85, 55, 92, 42, 74, 60, 88, 50, 78, 45, 90, 62, 40, 72, 54, 80, 46, 68, 52, 60, 38];

export function ServiceAudioPlayer({
  audioUrl,
  serviceName,
  audioName,
  compact = false,
}: ServiceAudioPlayerProps) {
  const playerId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const handleOtherPlay = (event: Event) => {
      const customEvent = event as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id !== playerId && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener('clinica:service-audio-play', handleOtherPlay);
    return () => {
      window.removeEventListener('clinica:service-audio-play', handleOtherPlay);
    };
  }, [playerId]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      window.dispatchEvent(new CustomEvent('clinica:service-audio-play', { detail: { id: playerId } }));
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const ratio = rect.width > 0 ? clickX / rect.width : 0;
    const nextTime = ratio * duration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? '0.65rem' : '0.8rem',
        padding: compact ? '0.55rem 0.75rem' : '0.7rem 0.9rem',
        borderRadius: compact ? '13px' : '15px',
        background: isPlaying
          ? 'linear-gradient(135deg, #eff6ff 0%, #e0f2fe 100%)'
          : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        border: isPlaying ? '1.5px solid #7dd3fc' : '1px solid #cbd5e1',
        boxShadow: isPlaying
          ? '0 6px 16px rgba(14, 116, 144, 0.12)'
          : '0 2px 6px rgba(15, 23, 42, 0.04)',
        transition: 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        width: '100%',
      }}
    >
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      {/* Play / Pause Button (iOS Pill/Circle Style) */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? `Pausar explicação${serviceName ? ` de ${serviceName}` : ''}` : `Ouvir explicação${serviceName ? ` de ${serviceName}` : ''}`}
        style={{
          width: compact ? '36px' : '42px',
          height: compact ? '36px' : '42px',
          borderRadius: '999px',
          border: 'none',
          background: isPlaying
            ? 'linear-gradient(180deg, #0284c7 0%, #0369a1 100%)'
            : 'linear-gradient(180deg, #21577a 0%, #173f5a 100%)',
          color: '#ffffff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          boxShadow: '0 4px 12px rgba(23, 63, 90, 0.24), inset 0 1px 0 rgba(255,255,255,0.22)',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        }}
      >
        {isPlaying ? (
          <svg width={compact ? '15' : '17'} height={compact ? '15' : '17'} viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4.5" height="14" rx="1.5" />
            <rect x="13.5" y="5" width="4.5" height="14" rx="1.5" />
          </svg>
        ) : (
          <svg width={compact ? '15' : '17'} height={compact ? '15' : '17'} viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
            <path d="M8 5.14v13.72a1 1 0 0 0 1.55.83l10.5-6.86a1 1 0 0 0 0-1.66L9.55 4.31A1 1 0 0 0 8 5.14Z" />
          </svg>
        )}
      </button>

      {/* Content + Waveform */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.32rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <span
            style={{
              fontSize: compact ? '0.77rem' : '0.82rem',
              fontWeight: 700,
              color: isPlaying ? '#0369a1' : '#1e293b',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <span>🎧</span>
            <span>{isPlaying ? 'Ouvindo como funciona...' : 'Ouvir como funciona o serviço'}</span>
          </span>

          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color: isPlaying ? '#0284c7' : '#64748b',
              background: isPlaying ? 'rgba(2, 132, 199, 0.1)' : 'rgba(148, 163, 184, 0.15)',
              padding: '0.12rem 0.45rem',
              borderRadius: '999px',
              flexShrink: 0,
            }}
          >
            {duration > 0
              ? `${formatAudioTime(currentTime)} / ${formatAudioTime(duration)}`
              : 'Áudio MP3'}
          </span>
        </div>

        {/* Interactive Waveform / Scrub Bar */}
        <div
          onClick={handleSeek}
          title={audioName || 'Clique para avançar ou voltar no áudio'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2.5px',
            height: compact ? '16px' : '20px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          {WAVE_BARS.map((heightPct, idx) => {
            const barProgress = (idx + 1) / WAVE_BARS.length;
            const isActiveBar = progressRatio >= barProgress || (isPlaying && idx === 0 && progressRatio === 0);
            return (
              <span
                key={idx}
                style={{
                  flex: 1,
                  height: `${Math.max(24, heightPct)}%`,
                  borderRadius: '999px',
                  background: isActiveBar
                    ? '#0284c7'
                    : isPlaying
                      ? '#bae6fd'
                      : '#cbd5e1',
                  transition: 'background-color 0.15s ease, transform 0.2s ease',
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

