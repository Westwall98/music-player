import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ListOrdered,
  Repeat1,
  Search,
  X,
} from "lucide-react";

import type { Song } from "../types/navidrome";
import type { PlayMode } from "../hooks/usePlayer";

import { NavidromeAPI } from "../api/navidrome";


interface Props {
  api: NavidromeAPI;

  songs: Song[];

  currentSong: Song | null;

  open: boolean;

  loading: boolean;

  playMode: PlayMode;

  onClose: () => void;

  onReload: () => void;

  onSelect: (song: Song) => void;

  onTogglePlayMode: () => void;
}

const coverUrlCache =
  new Map<string, string>();

const coverRetryDelays = [
  2000,
  5000,
  15000,
];

function getCoverUrl(
  api: NavidromeAPI,
  song: Song,
): string {
  const key =
    `${song.id}:${song.coverArt}`;

  const cached =
    coverUrlCache.get(key);

  if (cached) {
    return cached;
  }

  const url =
    api.getCoverArtUrl(
      song.coverArt,
      160,
    );

  coverUrlCache.set(
    key,
    url,
  );

  return url;
}

function LazyCover({
  src,
}: {
  src: string;
}) {

  const wrapperRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const [visible, setVisible] =
    useState(false);

  const [retryCount, setRetryCount] =
    useState(0);

  const [loaded, setLoaded] =
    useState(false);

  const [failed, setFailed] =
    useState(false);

  const retryTimeoutRef =
    useRef<number | null>(null);

  useEffect(() => {

    const element =
      wrapperRef.current;

    if (!element) {
      return;
    }

    if (visible) {
      return;
    }


    const observer =
      new IntersectionObserver(
        ([entry]) => {

          if (
            entry.isIntersecting
          ) {
            setVisible(true);

            observer.disconnect();
          }
        },
        {
          rootMargin: "300px",
        },
      );


    observer.observe(element);


    return () => {
      observer.disconnect();
    };

  }, [
    visible,
  ]);

  useEffect(() => {

    return () => {

      if (
        retryTimeoutRef.current !== null
      ) {
        window.clearTimeout(
          retryTimeoutRef.current,
        );

        retryTimeoutRef.current =
          null;
      }

    };

  }, []);

  useEffect(() => {

    setRetryCount(0);

    setLoaded(false);

    setFailed(false);

  }, [
    src,
  ]);

  const handleError =
    () => {

      if (
        retryCount >=
        coverRetryDelays.length
      ) {
        setFailed(true);

        return;
      }


      const delay =
        coverRetryDelays[
          retryCount
        ];


      retryTimeoutRef.current =
        window.setTimeout(() => {

          setRetryCount(
            (count) =>
              count + 1,
          );

          retryTimeoutRef.current =
            null;

        }, delay);
    };


  return (
    <div
      ref={wrapperRef}
      className="picker-cover"
    >

      {visible && !failed && (

        <img
          key={`${src}:${retryCount}`}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() =>
            setLoaded(true)
          }
          onError={handleError}
          className={
            loaded
              ? "loaded"
              : ""
          }
        />

      )}

    </div>
  );
}


function SongPicker({
  api,
  songs,
  currentSong,
  open,
  playMode,
  onClose,
  onTogglePlayMode,
  onSelect,
}: Props) {

  const pickerRef =
    useRef<HTMLElement | null>(
      null,
    );

  const searchInputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const previousFocusRef =
    useRef<HTMLElement | null>(
      null,
    );

  const [searchMode, setSearchMode] =
    useState(false);

  const [searchText, setSearchText] =
    useState("");

  useEffect(() => {

    const picker =
      pickerRef.current;

    if (!picker) {
      return;
    }


    if (open) {

      const active =
        document.activeElement;

      if (
        active instanceof HTMLElement
      ) {
        previousFocusRef.current =
          active;
      }


      /*
       * 打开时移除 inert。
       */
      picker.removeAttribute(
        "inert",
      );

      return;
    }

    setSearchMode(false);

    setSearchText("");

    const active =
      document.activeElement;

    if (
      active instanceof HTMLElement &&
      picker.contains(active)
    ) {
      active.blur();
    }

    picker.setAttribute(
      "inert",
      "",
    );

    const previous =
      previousFocusRef.current;

    if (
      previous &&
      document.contains(previous)
    ) {
      requestAnimationFrame(() => {
        previous.focus();
      });
    }

  }, [
    open,
  ]);

  useEffect(() => {

    if (
      !open ||
      !searchMode
    ) {
      return;
    }


    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

  }, [
    open,
    searchMode,
  ]);

  const songsWithCovers =
    useMemo(() => {

      return songs.map(
        (song) => ({
          song,

          cover:
            getCoverUrl(
              api,
              song,
            ),
        }),
      );

    }, [
      api,
      songs,
    ]);

  const filteredSongs =
    useMemo(() => {

      const query =
        searchText
          .trim()
          .toLocaleLowerCase();


      if (!query) {
        return songsWithCovers;
      }


      return songsWithCovers.filter(
        ({
          song,
        }) => {

          const title =
            song.title
              ?.toLocaleLowerCase() ??
            "";


          const artist =
            song.artist
              ?.toLocaleLowerCase() ??
            "";


          const album =
            song.album
              ?.toLocaleLowerCase() ??
            "";


          return (
            title.includes(query) ||
            artist.includes(query) ||
            album.includes(query)
          );
        },
      );

    }, [
      searchText,
      songsWithCovers,
    ]);

  const toggleSearch =
    () => {

      if (searchMode) {

        setSearchText("");

        setSearchMode(false);

        return;
      }


      setSearchMode(true);
    };


  return (
    <aside
      ref={pickerRef}
      className={`song-picker ${
        open ? "open" : ""
      }`}
      aria-hidden={!open}
    >

      <div className="picker-header">

        <div className="picker-title">

          <strong>
            Library
          </strong>

          <span>
            {searchText.trim()
              ? `${filteredSongs.length} 首结果`
              : `${songs.length} 首歌曲`}
          </span>

        </div>


        <div className="picker-actions">

          <div
            className={`picker-search-wrap ${
              searchMode
                ? "search-open"
                : ""
            }`}
          >

            <div className="picker-search">

              <input
                ref={searchInputRef}
                type="text"
                value={searchText}
                onChange={(event) =>
                  setSearchText(
                    event.target.value,
                  )
                }
                id="search-input"
                autoComplete="off"
              />


              <button
                className="picker-search-button"
                onClick={toggleSearch}
                type="button"
              >

                <Search size={18} />

              </button>

            </div>

          </div>


          <button
            className={`picker-action-button picker-mode-button ${
              playMode === "repeat-one"
                ? "active"
                : ""
            }`}
            onClick={onTogglePlayMode}
            type="button"
          >
            {playMode ===
            "repeat-one" ? (
              <Repeat1 size={18} />
            ) : (
              <ListOrdered size={18} />
            )}
          </button>


          <button
            className="picker-action-button"
            onClick={onClose}
            type="button"
          >

            <X size={20} />

          </button>

        </div>

      </div>


      <div className="picker-list">

        {filteredSongs.length === 0 ? (

          <div className="picker-empty">
            没有找到匹配的歌曲
          </div>

        ) : (

          filteredSongs.map(
            ({
              song,
              cover,
            }) => {

              const active =
                song.id ===
                currentSong?.id;


              return (
                <button
                  key={song.id}
                  className={`picker-song ${
                    active
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    onSelect(song)
                  }
                  type="button"
                >

                  <LazyCover
                    src={cover}
                  />


                  <div>

                    <strong>
                      {song.title}
                    </strong>

                    <span>
                      {song.artist ||
                        "Unknown Artist"}
                    </span>

                  </div>

                </button>
              );
            },
          )

        )}

      </div>

    </aside>
  );
}


export default React.memo(
  SongPicker,
  (
    previous,
    next,
  ) => {

    return (
      previous.api === next.api &&
      previous.songs === next.songs &&
      previous.currentSong ===
        next.currentSong &&
      previous.open === next.open &&
      previous.loading ===
        next.loading &&
      previous.playMode ===
        next.playMode &&
      previous.onTogglePlayMode ===
        next.onTogglePlayMode
    );

  },
);
