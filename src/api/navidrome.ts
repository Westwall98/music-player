import SparkMD5 from "spark-md5";

import type {
  Album,
  Artist,
  Song,
} from "../types/navidrome";

const API_VERSION = "1.16.1";
const CLIENT_NAME = "KawarpPlayer";

export class NavidromeAPI {
  private baseUrl: string;
  private username: string;
  private password: string;

  constructor() {
    this.baseUrl =
      import.meta.env.VITE_NAVIDROME_URL.replace(
        /\/+$/,
        "",
      );

    this.username =
      import.meta.env.VITE_NAVIDROME_USERNAME;

    this.password =
      import.meta.env.VITE_NAVIDROME_PASSWORD;
  }

  private createSalt() {
    return crypto
      .randomUUID()
      .replaceAll("-", "")
      .slice(0, 16);
  }

  private createToken(salt: string) {
    return SparkMD5.hash(
      this.password + salt,
    );
  }

  private async request<T>(
    endpoint: string,
    params: Record<
      string,
      string | number
    > = {},
  ): Promise<T> {
    const salt = this.createSalt();

    const token =
      this.createToken(salt);

    const query =
      new URLSearchParams();

    query.set("u", this.username);
    query.set("t", token);
    query.set("s", salt);
    query.set("v", API_VERSION);
    query.set("c", CLIENT_NAME);
    query.set("f", "json");

    for (const [
      key,
      value,
    ] of Object.entries(params)) {
      query.set(
        key,
        String(value),
      );
    }

    const url =
      `${this.baseUrl}/rest/${endpoint}.view?${query}`;

    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Navidrome HTTP ${response.status}`,
      );
    }

    const data =
      await response.json();

    const result =
      data["subsonic-response"];

    if (result.status !== "ok") {
      throw new Error(
        result.error?.message ||
          "Navidrome API Error",
      );
    }

    return result as T;
  }

  /**
   * 测试 Navidrome 是否正常
   */
  async ping() {
    return this.request("ping");
  }

  /**
   * 获取随机歌曲
   */
  async getRandomSongs(
    size = 30,
  ): Promise<Song[]> {
    const result =
      await this.request<{
        randomSongs: {
          song: Song[];
        };
      }>("getRandomSongs", {
        size,
      });

    return (
      result.randomSongs.song || []
    );
  }

  /**
   * 获取播放列表
   *
   * playlistId:
   * Navidrome 播放列表 ID
   */
  async getPlaylistSongs(
    playlistId: string,
  ): Promise<Song[]> {
    if (!playlistId) {
      throw new Error(
        "Navidrome playlist ID 不能为空",
      );
    }

    const result =
      await this.request<{
        playlist: {
          entry?: Song[];
        };
      }>("getPlaylist", {
        id: playlistId,
      });

    return (
      result.playlist.entry || []
    );
  }

  /**
   * 获取封面
   */
  getCoverArtUrl(
    coverArt?: string,
    size = 800,
  ) {
    if (!coverArt) {
      return "";
    }

    const url = new URL(
      `${this.baseUrl}/rest/getCoverArt.view`,
    );

    url.searchParams.set(
      "id",
      coverArt,
    );

    url.searchParams.set(
      "size",
      String(size),
    );

    url.searchParams.set(
      "u",
      this.username,
    );

    const salt =
      this.createSalt();

    const token =
      this.createToken(salt);

    url.searchParams.set(
      "t",
      token,
    );

    url.searchParams.set(
      "s",
      salt,
    );

    url.searchParams.set(
      "v",
      API_VERSION,
    );

    url.searchParams.set(
      "c",
      CLIENT_NAME,
    );

    return url.toString();
  }

  /**
   * 获取歌曲播放地址
   */
  getStreamUrl(
    song: Song,
  ) {
    const salt =
      this.createSalt();

    const token =
      this.createToken(salt);

    const url = new URL(
      `${this.baseUrl}/rest/stream.view`,
    );

    url.searchParams.set(
      "id",
      song.id,
    );

    url.searchParams.set(
      "u",
      this.username,
    );

    url.searchParams.set(
      "t",
      token,
    );

    url.searchParams.set(
      "s",
      salt,
    );

    url.searchParams.set(
      "v",
      API_VERSION,
    );

    url.searchParams.set(
      "c",
      CLIENT_NAME,
    );

    return url.toString();
  }

  /**
   * 获取歌手
   */
  async getArtists() {
    const result =
      await this.request<{
        artists: {
          index: Array<{
            artist: Artist[];
          }>;
        };
      }>("getArtists");

    return result.artists.index.flatMap(
      (group) => group.artist,
    );
  }

  /**
   * 获取专辑
   */
  async getAlbum(
    id: string,
  ) {
    const result =
      await this.request<{
        album: Album;
      }>("getAlbum", {
        id,
      });

    return result.album;
  }
}