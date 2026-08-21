import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { CSSProperties } from "react";

import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";

import type { Song } from "../types/navidrome";
import { NavidromeAPI } from "../api/navidrome";

interface Props {
  api: NavidromeAPI;
  song: Song | null;
  playing: boolean;
  duration: number;

  /*
   * 直接拿到 Audio。
   *
   * currentTime 在 Player 内部处理，
   * 不再向 App 层传递。
   */
  audioRef: React.RefObject<HTMLAudioElement | null>;

  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (value: number) => void;
}

function formatTime(
  seconds: number,
) {
  if (
    !Number.isFinite(seconds) ||
    seconds < 0
  ) {
    return "0:00";
  }

  const minutes =
    Math.floor(seconds / 60);

  const remaining =
    Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");

  return `${minutes}:${remaining}`;
}

export default function Player({
  api,
  song,
  playing,
  duration,
  audioRef,
  onPlayPause,
  onNext,
  onPrevious,
  onSeek,
}: Props) {
  /*
   * currentTime 是高频数据。
   *
   * 它现在只存在 Player 里面。
   */
  const [
    currentTime,
    setCurrentTime,
  ] = useState(0);

  /*
   * 监听 Audio 的播放进度。
   *
   * 即使这里频繁 setState，
   * 也只会让 Player 自己重新 render。
   */
  useEffect(() => {
    const audio =
      audioRef.current;

    if (!audio) {
      return;
    }

    const handleTimeUpdate =
      () => {
        setCurrentTime(
          audio.currentTime,
        );
      };

    const handleSeeked = () => {
      setCurrentTime(
        audio.currentTime,
      );
    };

    const handleLoadedMetadata =
      () => {
        setCurrentTime(
          audio.currentTime,
        );
      };

    const handleEnded = () => {
      setCurrentTime(0);
    };

    audio.addEventListener(
      "timeupdate",
      handleTimeUpdate,
    );

    audio.addEventListener(
      "seeked",
      handleSeeked,
    );

    audio.addEventListener(
      "loadedmetadata",
      handleLoadedMetadata,
    );

    audio.addEventListener(
      "ended",
      handleEnded,
    );

    /*
     * 切歌后立即同步一次。
     */
    setCurrentTime(
      audio.currentTime || 0,
    );

    return () => {
      audio.removeEventListener(
        "timeupdate",
        handleTimeUpdate,
      );

      audio.removeEventListener(
        "seeked",
        handleSeeked,
      );

      audio.removeEventListener(
        "loadedmetadata",
        handleLoadedMetadata,
      );

      audio.removeEventListener(
        "ended",
        handleEnded,
      );
    };
  }, [
    audioRef,
    song?.id,
  ]);

  /*
   * 切歌时把进度重置。
   */
  useEffect(() => {
    setCurrentTime(0);
  }, [song?.id]);

  /*
   * 封面 URL 只有歌曲变化时才重新计算。
   */
  const cover = useMemo(() => {
    if (!song) {
      return "";
    }

    return api.getCoverArtUrl(
      song.coverArt,
      1200,
    );
  }, [
    api,
    song?.coverArt,
  ]);

  if (!song) {
    return (
      <div className="player-empty">
        <div className="empty-content">
          <h2>
            选择一首歌曲
          </h2>

          <p>
            点击右上角的音乐库开始播放
          </p>
        </div>
      </div>
    );
  }

  const progress =
    duration > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (currentTime /
              duration) *
              100,
          ),
        )
      : 0;

  return (
    <main className="player-page">
      <div className="album-art-wrapper">
        <img
          className="album-art"
          src={cover}
          alt={song.title}
        />
      </div>

      <div className="track-info">
        <h1>
          {song.title}
        </h1>

        <div className="track-artist">
          {song.artist ||
            "Unknown Artist"}
        </div>

        {song.album && (
          <div className="track-album">
            {song.album}
          </div>
        )}
      </div>

      <div className="progress-container">
        <input
          className="progress"
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(
            currentTime,
            duration || currentTime,
          )}
          onChange={(event) =>
            onSeek(
              Number(
                event.target.value,
              ),
            )
          }
          style={
            {
              "--progress": `${progress}%`,
            } as CSSProperties
          }
          aria-label="播放进度"
        />

        <div className="time">
          <span>
            {formatTime(
              currentTime,
            )}
          </span>

          <span>
            {formatTime(duration)}
          </span>
        </div>
      </div>

      <div className="controls">
        <button
          className="track-control"
          onClick={onPrevious}
          aria-label="上一首"
        >
          <SkipBack
            size={21}
            strokeWidth={1.8}
          />
        </button>

        <button
          className="play-button"
          onClick={onPlayPause}
          aria-label={
            playing
              ? "暂停"
              : "播放"
          }
        >
          {playing ? (
            <Pause
              size={23}
              strokeWidth={2}
            />
          ) : (
            <Play
              size={23}
              strokeWidth={2}
            />
          )}
        </button>

        <button
          className="track-control"
          onClick={onNext}
          aria-label="下一首"
        >
          <SkipForward
            size={21}
            strokeWidth={1.8}
          />
        </button>
      </div>
    </main>
  );
}