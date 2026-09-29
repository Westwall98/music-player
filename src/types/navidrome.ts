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
