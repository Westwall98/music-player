import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Search,
  X,
} from "lucide-react";

import type { Song } from "../types/navidrome";

import { NavidromeAPI } from "../api/navidrome";


interface Props {
  api: NavidromeAPI;

  songs: Song[];

  currentSong: Song | null;

  open: boolean;

  loading: boolean;

  onClose: () => void;

  onReload: () => void;

  onSelect: (song: Song) => void;
}


/*
 * 封面 URL 缓存。
 */
const coverUrlCache =
  new Map<string, string>();


/*
 * 已经开始预加载的图片。
 */
const coverPreloadCache =
  new Set<string>();


/*
 * 获取封面 URL。
 */
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


/*
 * 预加载图片。
 */
function preloadCover(
  url: string,
) {
  if (
    coverPreloadCache.has(url)
  ) {
    return;
  }

  coverPreloadCache.add(url);

  const image =
    new Image();

  image.decoding = "async";

  image.src = url;
}


function SongPicker({
  api,
  songs,
  currentSong,
  open,
  onClose,
  onSelect,
}: Props) {

  /*
   * SongPicker DOM。
   */
  const pickerRef =
    useRef<HTMLElement | null>(
      null,
    );


  /*
   * 搜索输入框。
   */
  const searchInputRef =
    useRef<HTMLInputElement | null>(
      null,
    );


  /*
   * 保存打开音乐库之前的 focus。
   */
  const previousFocusRef =
    useRef<HTMLElement | null>(
      null,
    );


  /*
   * 搜索模式。
   */
  const [searchMode, setSearchMode] =
    useState(false);


  /*
   * 搜索文字。
   */
  const [searchText, setSearchText] =
    useState("");


  /*
   * 打开 / 关闭时处理 focus
   * 和搜索状态。
   */
  useEffect(() => {
    const picker =
      pickerRef.current;

    if (!picker) {
      return;
    }


    if (open) {

      /*
       * 记录打开之前的 focus。
       */
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


    /*
     * 关闭时：
     * 清空搜索。
     */
    setSearchMode(false);

    setSearchText("");


    /*
     * 如果内部元素仍然 focus，
     * 先 blur。
     */
    const active =
      document.activeElement;

    if (
      active instanceof HTMLElement &&
      picker.contains(active)
    ) {
      active.blur();
    }


    /*
     * 设置 inert。
     */
    picker.setAttribute(
      "inert",
      "",
    );


    /*
     * 恢复之前的 focus。
     */
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

  }, [open]);


  /*
   * 搜索模式打开后，
   * 自动 focus 输入框。
   */
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


  /*
   * songs 改变时重新计算封面。
   */
  const songsWithCovers =
    useMemo(() => {
      return songs.map(
        (song) => {
          const cover =
            getCoverUrl(
              api,
              song,
            );

          preloadCover(cover);

          return {
            song,
            cover,
          };
        },
      );
    }, [
      api,
      songs,
    ]);


  /*
   * 搜索结果。
   *
   * 注意：
   *
   * 这里绝对不会修改 songs。
   *
   * songs 仍然是完整播放歌单。
   */
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


  /*
   * 搜索按钮 toggle。
   *
   * 第一次：
   *   打开搜索
   *
   * 第二次：
   *   关闭搜索
   *   清空搜索
   */
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
              searchMode ? "search-open" : ""
            }`}
          >
            <div className="picker-search">
              <input
                ref={searchInputRef}
                type="text"
                value={searchText}
                onChange={(event) =>
                  setSearchText(event.target.value)
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

                  <img
                    src={cover}
                    alt=""
                    loading="eager"
                    decoding="async"
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
        next.loading
    );
  },
);