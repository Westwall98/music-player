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


function App() {
  const api = useMemo(
    () => new NavidromeAPI(),
    [],
  );

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


  /*
   * 加载歌单。
   *
   * 每次读取完成后都会重新随机排列
   * 整个歌单。
   */
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
          "未配置 VITE_NAVIDROME_PLAYLIST_ID",
        );
      }

      const result =
        await api.getPlaylistSongs(
          playlistId,
        );


      /*
       * Fisher-Yates shuffle
       *
       * 使用副本，避免修改 Navidrome
       * 返回的原始数组。
       */
      const shuffled = [
        ...result,
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