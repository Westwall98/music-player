export interface Song {
  id: string;

  title: string;

  album?: string;

  artist?: string;

  albumArtist?: string;

  coverArt?: string;

  duration?: number;

  track?: number;

  year?: number;

  genre?: string;

  suffix?: string;

  contentType?: string;
}

export interface Artist {
  id: string;
  name: string;
  albumCount?: number;
  songCount?: number;
}

export interface Album {
  id: string;

  name: string;

  artist?: string;

  albumArtist?: string;

  coverArt?: string;

  songCount?: number;

  song?: Song[];
}