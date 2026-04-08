export interface Team {
  id: number | undefined
  name: string
  logo?: string
}

export interface Event {
  id: number | undefined
  name: string
  logo?: string
}

export interface Demo {
  name: string
  /** Direct download link to the .dem.rar / .dem file */
  link: string
}

export enum MatchStatus {
  Live = 'Live',
  Scheduled = 'Scheduled',
  Over = 'Over',
  Postponed = 'Postponed',
  Deleted = 'Deleted',
}

export enum MatchFormat {
  Bo1 = 'bo1',
  Bo2 = 'bo2',
  Bo3 = 'bo3',
  Bo5 = 'bo5',
  Unknown = 'unknown',
}
