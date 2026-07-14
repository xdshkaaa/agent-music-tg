import type { AppDb } from "../db";

export type GrantKind = "credits" | "subscription";

export interface Offer {
  id: number;
  title: string;
  amount: string;
  asset: string;
  starsAmount: number | null;
  icon: string | null;
  active: boolean;
  grantKind: GrantKind;
  grantAmount: number;
}

export interface OfferInput {
  title: string;
  amount: string;
  asset: string;
  starsAmount: number;
  icon?: string | null;
  active?: boolean;
  grantKind: GrantKind;
  grantAmount: number;
}

interface OfferRow {
  id: number;
  title: string;
  amount: string;
  asset: string;
  stars_amount: number | null;
  icon: string | null;
  active: number;
  grant_kind: string;
  grant_amount: number;
}

function toOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    title: row.title,
    amount: row.amount,
    asset: row.asset,
    starsAmount: row.stars_amount,
    icon: row.icon,
    active: row.active === 1,
    grantKind: row.grant_kind === "subscription" ? "subscription" : "credits",
    grantAmount: row.grant_amount,
  };
}

export class InvalidStarsAmountError extends Error {}

export function assertValidStarsAmount(v: number): void {
  if (!Number.isInteger(v) || v <= 0) throw new InvalidStarsAmountError("starsAmount must be a positive integer");
}

export function createOffer(db: AppDb, input: OfferInput): Offer {
  assertValidStarsAmount(input.starsAmount);
  const row = db
    .query<
      OfferRow,
      [string, string, string, number, string | null, number, string, number]
    >(
      `INSERT INTO offers (title, amount, asset, stars_amount, icon, active, grant_kind, grant_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(
      input.title,
      input.amount,
      input.asset,
      input.starsAmount,
      input.icon ?? null,
      input.active === false ? 0 : 1,
      input.grantKind,
      input.grantAmount,
    );
  return toOffer(row!);
}

export function listOffers(db: AppDb): Offer[] {
  return db.query<OfferRow, []>(`SELECT * FROM offers ORDER BY id`).all().map(toOffer);
}

export function listActiveOffers(db: AppDb): Offer[] {
  return db.query<OfferRow, []>(`SELECT * FROM offers WHERE active = 1 ORDER BY id`).all().map(toOffer);
}

export function getOffer(db: AppDb, id: number): Offer | null {
  const row = db.query<OfferRow, [number]>(`SELECT * FROM offers WHERE id = ?`).get(id);
  return row ? toOffer(row) : null;
}

export function updateOffer(db: AppDb, id: number, patch: Partial<OfferInput> & { starsAmount?: number | null }): Offer | null {
  const existing = getOffer(db, id);
  if (!existing) return null;

  if (patch.starsAmount !== undefined && patch.starsAmount !== null) {
    assertValidStarsAmount(patch.starsAmount);
  }

  const title = patch.title ?? existing.title;
  const amount = patch.amount ?? existing.amount;
  const asset = patch.asset ?? existing.asset;
  const starsAmount = patch.starsAmount === undefined ? existing.starsAmount : patch.starsAmount;
  const icon = patch.icon === undefined ? existing.icon : patch.icon;
  const active = patch.active ?? existing.active;
  const grantKind = patch.grantKind ?? existing.grantKind;
  const grantAmount = patch.grantAmount ?? existing.grantAmount;

  db.query(
    `UPDATE offers SET title = ?, amount = ?, asset = ?, stars_amount = ?, icon = ?, active = ?, grant_kind = ?, grant_amount = ? WHERE id = ?`,
  ).run(title, amount, asset, starsAmount ?? null, icon ?? null, active ? 1 : 0, grantKind, grantAmount, id);
  return getOffer(db, id);
}

export function setOfferActive(db: AppDb, id: number, active: boolean): void {
  db.query(`UPDATE offers SET active = ? WHERE id = ?`).run(active ? 1 : 0, id);
}

export function deleteOffer(db: AppDb, id: number): void {
  db.query(`DELETE FROM offers WHERE id = ?`).run(id);
}
