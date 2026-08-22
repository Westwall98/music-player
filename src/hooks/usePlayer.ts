import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { Song } from "../types/navidrome";
import { NavidromeAPI } from "../api/navidrome";

export function usePlayer(
  api: NavidromeAPI,
  songs: Song[],
) {
  /*
   * Audio 实例只创建一次。
   */
  const audioRef = useRef(
    new Audio(),
  );

  /*
   * 防止快速切歌时旧请求覆盖新歌曲。
   */
  const loadIdRef = useRef(0);

  /*
   * 是否在歌曲加载完成后自动播放。
   */
  const autoplayRef =
    useRef(false);

  /*
   * ended 事件需要访问最新的 next。
   */
  const nextRef =
    useRef<() => void>(
      () => {},
    );

  const previousRef =
    useRef<() => void>(
      () => {},
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
      nextRef.current();
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

        /*
         * 如果已经切换到其他歌曲，
         * 当前请求直接丢弃。
         */
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

  /*
   * 选择歌曲。
   */
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

  /*
   * 播放 / 暂停。
   */
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

  /*
   * 拖动进度条。
   *
   * currentTime UI 会由 Player 自己更新。
   */
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

  /*
   * 下一首。
   */
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

  /*
   * 保存最新 next。
   */
  useEffect(() => {
    nextRef.current = next;
  }, [next]);

  /*
   * 上一首。
   */
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
  
  return {
    currentSong,
    currentIndex,
    playing,
    duration,
    audioRef,
    playSong,
    togglePlay,
    seek,
    next,
    previous,
  };
}
