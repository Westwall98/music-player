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
 * 封面失败后的重试间隔。
 *
 * 第一次失败：
 *   2 秒后重试
 *
 * 第二次失败：
 *   5 秒后重试
 *
 * 第三次失败：
 *   15 秒后重试
 *
 * 第三次仍然失败后停止。
 */
const coverRetryDelays = [
  2000,
  5000,
  15000,
];


/*
 * 获取封面 URL。
 *
 * 这里仍然请求 160px 封面。
 *
 * 注意：
 * 这只是 SongPicker 的缩略图。
 * 不会影响主播放器的大图。
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
 * 懒加载封面。
 *
 * 只有当封面接近可视区域时，
 * 才真正创建 <img> 并发起请求。
 */
function LazyCover({
  src,
}: {
  src: string;
}) {

  /*
   * 外层元素。
   *
   * IntersectionObserver
   * 观察的就是它。
   */
  const wrapperRef =
    useRef<HTMLDivElement | null>(
      null,
    );


  /*
   * 是否已经进入预加载区域。
   */
  const [visible, setVisible] =
    useState(false);


  /*
   * 当前重试次数。
   */
  const [retryCount, setRetryCount] =
    useState(0);


  /*
   * 是否已经加载成功。
   */
  const [loaded, setLoaded] =
    useState(false);


  /*
   * 是否已经最终失败。
   */
  const [failed, setFailed] =
    useState(false);


  /*
   * 当前 retry timeout。
   */
  const retryTimeoutRef =
    useRef<number | null>(null);


  /*
   * IntersectionObserver。
   *
   * rootMargin 300px：
   * 距离屏幕约 300px 时提前加载。
   */
  useEffect(() => {

    const element =
      wrapperRef.current;

    if (!element) {
      return;
    }


    /*
     * 如果已经进入过预加载区域，
     * 不需要再次观察。
     */
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


  /*
   * 组件卸载时清理 retry timer。
   */
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


  /*
   * src 改变时重置图片状态。
   */
  useEffect(() => {

    setRetryCount(0);

    setLoaded(false);

    setFailed(false);

  }, [
    src,
  ]);


  /*
   * 图片加载失败。
   *
   * 这里无法直接知道 HTTP 是
   * 429 / 503 / 404。
   *
   * 所以只针对“图片请求失败”
   * 做有限次数的重试。
   */
  const handleError =
    () => {

      /*
       * 已经达到最大重试次数。
       */
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

  }, [
    open,
  ]);


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
   * songs 改变时计算封面 URL。
   *
   * 注意：
   *
   * 这里只生成 URL。
   *
   * 不再调用 new Image()
   * 或 preloadCover()。
   *
   * 因此这里不会产生封面网络请求。
   */
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
        next.loading
    );

  },
);
