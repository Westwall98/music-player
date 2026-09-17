import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { Song } from "../types/navidrome";
import { NavidromeAPI } from "../api/navidrome";

export type PlayMode =
  | "sequence"
  | "repeat-one";

export function usePlayer(
  api: NavidromeAPI,
  songs: Song[],
) {
  const audioRef = useRef(
    new Audio(),
  );

  const loadIdRef = useRef(0);

  const autoplayRef =
    useRef(false);

  const nextRef =
    useRef<() => void>(
      () => {},
    );

  const sequenceNextRef =
    useRef<() => void>(
      () => {},
    );

  const previousRef =
    useRef<() => void>(
      () => {},
    );

  const playModeRef =
    useRef<PlayMode>(
      "sequence",
    );
  
  const songsRef =
    useRef<Song[]>(songs);

  const currentIndexRef =
    useRef(-1);

  const [
    currentIndex,
    setCurrentIndex,
  ] = useState(-1);

  const [
    playing,
    setPlaying,
  ] = useState(false);

  const [
    playMode,
    setPlayMode,
  ] = useState<PlayMode>(
    "sequence",
  );

  const [
    duration,
    setDuration,
  ] = useState(0);

  const currentSong =
    currentIndex >= 0 &&
    currentIndex < songs.length
      ? songs[currentIndex]
      : null;

  useEffect(() => {
    songsRef.current = songs;
  }, [songs]);

  useEffect(() => {
    playModeRef.current =
      playMode;
  }, [playMode]);

  useEffect(() => {
    const audio =
      audioRef.current;

    audio.preload = "auto";

    const handlePlay = () => {
      setPlaying(true);
      if (
        "mediaSession" in navigator
      ) {
        navigator.mediaSession.playbackState =
          "playing";
      }
    };

    const handlePause = () => {
      setPlaying(false);
      if (
        "mediaSession" in navigator
      ) {
        navigator.mediaSession.playbackState =
          "paused";
      }
    };

    const handleLoadedMetadata =
      () => {
        if (
          Number.isFinite(
            audio.duration,
          )
        ) {
          setDuration(
            audio.duration,
          );
        }
      };

    const handleDurationChange =
      () => {
        if (
          Number.isFinite(
            audio.duration,
          )
        ) {
          setDuration(
            audio.duration,
          );
        }
      };

    const handleEnded = () => {
      if (
        playModeRef.current ===
        "repeat-one"
      ) {
        audio.currentTime = 0;

        audio.play().catch((error) => {
          if (
            error instanceof
              DOMException &&
            error.name ===
              "AbortError"
          ) {
            return;
          }

          console.error(
            "单曲循环播放失败:",
            error,
          );
        });

        return;
      }

      sequenceNextRef.current();
    };

    audio.addEventListener(
      "play",
      handlePlay,
    );

    audio.addEventListener(
      "pause",
      handlePause,
    );

    audio.addEventListener(
      "loadedmetadata",
      handleLoadedMetadata,
    );

    audio.addEventListener(
      "durationchange",
      handleDurationChange,
    );

    audio.addEventListener(
      "ended",
      handleEnded,
    );

    if (
      "mediaSession" in navigator
    ) {
      navigator.mediaSession.setActionHandler(
        "play",
        () => {
          audio.play().catch((error) => {
            console.error(
              "Media Session play 失败:",
              error,
            );
          });
        },
      );

      navigator.mediaSession.setActionHandler(
        "pause",
        () => {
          audio.pause();
        },
      );

      navigator.mediaSession.setActionHandler(
        "nexttrack",
        () => {
          nextRef.current();
        },
      );

      navigator.mediaSession.setActionHandler(
        "previoustrack",
        () => {
          previousRef.current();
        },
      );
    }
    
    return () => {
      audio.pause();

      audio.src = "";

      audio.removeEventListener(
        "play",
        handlePlay,
      );

      audio.removeEventListener(
        "pause",
        handlePause,
      );

      audio.removeEventListener(
        "loadedmetadata",
        handleLoadedMetadata,
      );

      audio.removeEventListener(
        "durationchange",
        handleDurationChange,
      );

      audio.removeEventListener(
        "ended",
        handleEnded,
      );
      if (
        "mediaSession" in navigator
      ) {
        navigator.mediaSession.setActionHandler(
          "play",
          null,
        );

        navigator.mediaSession.setActionHandler(
          "pause",
          null,
        );

        navigator.mediaSession.setActionHandler(
          "nexttrack",
          null,
        );

        navigator.mediaSession.setActionHandler(
          "previoustrack",
          null,
        );

        navigator.mediaSession.metadata =
          null;
      }
    };
  }, []);
  
  useEffect(() => {
    if (
      !currentSong ||
      !("mediaSession" in navigator)
    ) {
      return;
    }

    const artworkUrl =
      api.getCoverArtUrl(
        currentSong.coverArt,
        1000,
      );

    navigator.mediaSession.metadata =
      new MediaMetadata({
        title:
          currentSong.title ||
          "未知歌曲",

        artist:
          currentSong.artist ||
          "未知艺术家",

        album:
          currentSong.album ||
          "",

        artwork: artworkUrl
          ? [
              {
                src: artworkUrl,
                sizes: "1000x1000",
              },
            ]
          : [],
      });
  }, [
    api,
    currentSong,
  ]);

  useEffect(() => {
    if (currentSong === null) {
      return;
    }

    const songToLoad =
      currentSong;

    const audio =
      audioRef.current;

    const loadId =
      ++loadIdRef.current;

    const shouldAutoplay =
      autoplayRef.current;

    autoplayRef.current =
      false;

    setDuration(0);

    audio.pause();

    audio.removeAttribute(
      "src",
    );

    audio.load();

    setPlaying(false);

    let cancelled = false;

    async function loadSong() {
      try {
        const url =
          await api.getStreamUrl(
            songToLoad,
          );

        if (
          cancelled ||
          loadId !==
            loadIdRef.current
        ) {
          return;
        }

        audio.src = url;

        audio.load();

        if (!shouldAutoplay) {
          return;
        }

        if (
          cancelled ||
          loadId !==
            loadIdRef.current
        ) {
          return;
        }

        try {
          await audio.play();
        } catch (error) {
          if (
            error instanceof
              DOMException &&
            error.name ===
              "AbortError"
          ) {
            return;
          }

          console.error(
            "自动播放失败:",
            error,
          );
        }
      } catch (error) {
        if (
          cancelled ||
          loadId !==
            loadIdRef.current
        ) {
          return;
        }

        console.error(
          "加载歌曲失败:",
          error,
        );

        setPlaying(false);
      }
    }

    loadSong();

    return () => {
      cancelled = true;
    };
  }, [
    currentIndex,
    currentSong,
    api,
  ]);

  const playSong =
    useCallback(
      (
        song: Song,
        autoplay = false,
      ) => {
        const index =
          songsRef.current.findIndex(
            (item) =>
              item.id === song.id,
          );

        if (index === -1) {
          return;
        }

        autoplayRef.current =
          autoplay;

        currentIndexRef.current =
          index;

        setCurrentIndex(index);
      },
      [],
    );

  const togglePlay =
    useCallback(
      async () => {
        const audio =
          audioRef.current;

        if (
          currentSong === null
        ) {
          return;
        }

        try {
          if (audio.paused) {
            await audio.play();
          } else {
            audio.pause();
          }
        } catch (error) {
          if (
            error instanceof
              DOMException &&
            error.name ===
              "AbortError"
          ) {
            return;
          }

          console.error(
            "播放失败:",
            error,
          );
        }
      },
      [currentSong],
    );

  const seek =
    useCallback(
      (value: number) => {
        const audio =
          audioRef.current;

        if (
          !Number.isFinite(value)
        ) {
          return;
        }

        if (
          !Number.isFinite(
            audio.duration,
          )
        ) {
          return;
        }

        const newTime =
          Math.max(
            0,
            Math.min(
              value,
              audio.duration,
            ),
          );

        audio.currentTime =
          newTime;
      },
      [],
    );

  const next =
    useCallback(() => {
      const list =
        songsRef.current;

      if (list.length === 0) {
        return;
      }

      const index =
        currentIndexRef.current;

      const nextIndex =
        index + 1 >= list.length
          ? 0
          : index + 1;

      autoplayRef.current =
        true;

      currentIndexRef.current =
        nextIndex;

      setCurrentIndex(
        nextIndex,
      );
    }, []);

  const sequenceNext =
    useCallback(() => {
      const list =
        songsRef.current;

      if (list.length === 0) {
        return;
      }

      const index =
        currentIndexRef.current;

      const nextIndex =
        index + 1 >= list.length
          ? 0
          : index + 1;

      autoplayRef.current =
        true;

      currentIndexRef.current =
        nextIndex;

      setCurrentIndex(
        nextIndex,
      );
    }, []);

  useEffect(() => {
    nextRef.current = next;
  }, [next]);

  useEffect(() => {
    sequenceNextRef.current =
      sequenceNext;
  }, [sequenceNext]);

  const previous =
    useCallback(() => {
      const list =
        songsRef.current;

      if (list.length === 0) {
        return;
      }

      const index =
        currentIndexRef.current;

      const previousIndex =
        index - 1 < 0
          ? list.length - 1
          : index - 1;

      autoplayRef.current =
        true;

      currentIndexRef.current =
        previousIndex;

      setCurrentIndex(
        previousIndex,
      );
    }, []);

  useEffect(() => {
    previousRef.current =
      previous;
  }, [previous]);

  const togglePlayMode =
    useCallback(() => {
      setPlayMode((mode) => {
        const nextMode =
          mode === "sequence"
            ? "repeat-one"
            : "sequence";

        playModeRef.current =
          nextMode;

        return nextMode;
      });
    }, []);
  
  return {
    currentSong,
    currentIndex,
    playing,
    playMode,
    duration,
    audioRef,
    playSong,
    togglePlay,
    togglePlayMode,
    seek,
    next,
    previous,
  };
}
