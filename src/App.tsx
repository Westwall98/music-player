import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { ListMusic } from "lucide-react";

import type { Song } from "./types/navidrome";

import { NavidromeAPI } from "./api/navidrome";

import KawarpBackground from "./components/KawarpBackground";

import Player from "./components/Player";

import SongPicker from "./components/SongPicker";

import { usePlayer } from "./hooks/usePlayer";

function normalizeSearchText(
  value: string,
) {
  return value
    .trim()
    .toLocaleLowerCase();
}

function songMatchesSearch(
  song: Song,
  searchText: string,
) {
  const query =
    normalizeSearchText(
      searchText,
    );

  if (!query) {
    return true;
  }

  const title =
    song.title
      ?.toLocaleLowerCase() ?? "";

  const artist =
    song.artist
      ?.toLocaleLowerCase() ?? "";

  const album =
    song.album
      ?.toLocaleLowerCase() ?? "";

  return (
    title.includes(query) ||
    artist.includes(query) ||
    album.includes(query)
  );
}

function App() {
  const api = useMemo(
    () => new NavidromeAPI(),
    [],
  );

  const forcedSearchText =
    useMemo(() => {
      return (
        new URLSearchParams(
          window.location.search,
        )
          .get("s")
          ?.trim() || ""
      );
    }, []);

  const [songs, setSongs] =
    useState<Song[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [pickerOpen, setPickerOpen] =
    useState(false);

  const [
    selectFirstAfterLoad,
    setSelectFirstAfterLoad,
  ] = useState(false);


  const player = usePlayer(
    api,
    songs,
  );

  const loadSongs = async (
    selectFirst = false,
  ) => {
    try {
      setLoading(true);

      setSelectFirstAfterLoad(
        selectFirst,
      );

      const playlistId =
        import.meta.env
          .VITE_NAVIDROME_PLAYLIST_ID;

      if (!playlistId) {
        throw new Error(
          "NO PLAYLIST ID",
        );
      }

      const result =
        await api.getPlaylistSongs(playlistId,);

      const filtered =
        forcedSearchText
          ? result.filter((song) =>
              songMatchesSearch(
                song,
                forcedSearchText,
              ),
            )
          : result;

      const shuffled = [
        ...filtered,
      ];

      for (
        let i = shuffled.length - 1;
        i > 0;
        i--
      ) {
        const j =
          Math.floor(
            Math.random() *
              (i + 1),
          );

        [
          shuffled[i],
          shuffled[j],
        ] = [
          shuffled[j],
          shuffled[i],
        ];
      }

      setSongs(shuffled);

    } catch (error) {
      console.error(
        "加载歌曲失败:",
        error,
      );

      setSelectFirstAfterLoad(
        false,
      );

    } finally {
      setLoading(false);
    }
  };


  /*
   * 歌曲列表加载完成后，
   * 选择第一首，但不自动播放。
   */
  useEffect(() => {
    if (!selectFirstAfterLoad) {
      return;
    }

    if (songs.length === 0) {
      return;
    }

    player.playSong(
      songs[0],
      false,
    );

    setSelectFirstAfterLoad(
      false,
    );
  }, [
    songs,
    selectFirstAfterLoad,
    player.playSong,
  ]);


  /*
   * 页面第一次进入。
   */
  useEffect(() => {
    loadSongs(true);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  /*
   * 当前歌曲封面。
   */
  const cover = useMemo(() => {
    if (!player.currentSong) {
      return undefined;
    }

    return api.getCoverArtUrl(
      player.currentSong.coverArt,
      1000,
    );
  }, [
    api,
    player.currentSong?.coverArt,
  ]);

  useEffect(() => {
    const song = player.currentSong;

    if (!song) {
      return;
    }

    if (!("mediaSession" in navigator)) {
      return;
    }

    navigator.mediaSession.metadata =
      new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: song.album,
        artwork: cover
          ? [
              {
                src: cover,
                sizes: "1000x1000"
              },
            ]
          : [],
      });
  }, [
    player.currentSong,
    cover,
  ]);

  return (
    <div className="app">

      <KawarpBackground
        image={cover}
      />


      {/* 音乐库按钮：只保留图标 */}
      <button
        className="library-button"
        onClick={() =>
          setPickerOpen(true)
        }
      >
        <ListMusic size={21} />
      </button>


      {loading &&
      songs.length === 0 ? (
        <div className="loading-screen">
          <div className="loading-spinner" />

          <span>
            正在加载音乐...
          </span>
        </div>
      ) : (
        <Player
          api={api}
          song={
            player.currentSong
          }
          playing={
            player.playing
          }
          duration={
            player.duration
          }
          audioRef={
            player.audioRef
          }
          onPlayPause={
            player.togglePlay
          }
          onNext={
            player.next
          }
          onPrevious={
            player.previous
          }
          onSeek={
            player.seek
          }
        />
      )}


      <SongPicker
        api={api}
        songs={songs}
        currentSong={
          player.currentSong
        }
        open={pickerOpen}
        loading={loading}
        playMode={
          player.playMode
        }

        onClose={() =>
          setPickerOpen(false)
        }

        onReload={() =>
          loadSongs(true)
        }

        onSelect={(song) => {
          player.playSong(
            song,
            true,
          );

          setPickerOpen(false);
        }}
        onTogglePlayMode={
          player.togglePlayMode
        }
      />


      {pickerOpen && (
        <div
          className="picker-backdrop"
          onClick={() =>
            setPickerOpen(false)
          }
        />
      )}

    </div>
  );
}


export default App;
