export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export interface Box {
  min: Vec3;
  max: Vec3;
}

export interface Snap {
  pos: Vec3;
  quat: Quat;
}

export type Kind = "core" | "fortification" | "defence" | "support" | "vehicle" | "structure";

export interface Buildable {
  id: string;
  kind: Kind;
  name: string;
  label: string;
  cost: number;
  placementCost: number;
  health: number;
  c4: number | null;
  maxStack: number;
  fobOnly: boolean;
  selectable: boolean;
  box: Box | null;
  collisionBox: Box | null;
  snaps: Snap[];
  meshCount: number;
  hasDoor: boolean;
  cash?: number;
  seats?: number;
  world?: string;
}

export interface Dataset {
  fetchedAt: string;
  source: string;
  fobRangeM: number;
  buildables: Buildable[];
}

export interface Piece {
  key: string;
  id: string;
  pos: Vec3;
  yaw: number;
  hidden?: number[];
}

export interface Plan {
  world: string | null;
  pieces: Piece[];
}

export const SITE_URL = "https://wardogs.zone/loadouts/base";
export const DRAFT_KEY = "wdz.base.draft";
export const FOB_ID = "fob";
export const BASE_PIECES_MAX = 1200;
export const BASE_REACH_M = 400;
export const SUPPORT_MAX_M = 15;
export const SITE_IDS = new Set(["kavkazi", "europe", "northamerica"]);
