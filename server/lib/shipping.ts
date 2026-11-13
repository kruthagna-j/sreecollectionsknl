import type { DB } from "../db.js";

export type ShippingQuote = {
  serviceable: boolean;
  pincode: string;
  zoneName: string | null;
  fee: number;
  freeAbove: number | null;
  freeApplied: boolean;
  etaDaysMin: number | null;
  etaDaysMax: number | null;
  message: string;
};

export function isValidPincode(value: string): boolean {
  return /^[1-9][0-9]{5}$/.test(value.trim());
}

type ZoneRow = {
  id: string;
  name: string;
  pincodes: string;
  fee: number;
  free_above: number | null;
  eta_days_min: number;
  eta_days_max: number;
};

function zoneCovers(pincodes: string, pincode: string): boolean {
  for (const raw of pincodes.split(/[\s,;]+/)) {
    const token = raw.trim();
    if (!token) continue;
    if (token === pincode) return true;
    const range = /^(\d{6})-(\d{6})$/.exec(token);
    if (range && pincode >= range[1] && pincode <= range[2]) return true;
  }
  return false;
}

export function quoteShipping(db: DB, pincodeInput: string, goodsTotal: number): ShippingQuote {
  const pincode = pincodeInput.trim();
  if (!isValidPincode(pincode)) {
    return {
      serviceable: false,
      pincode,
      zoneName: null,
      fee: 0,
      freeAbove: null,
      freeApplied: false,
      etaDaysMin: null,
      etaDaysMax: null,
      message: "Enter a valid 6-digit Indian PIN code."
    };
  }
  const zones = db
    .prepare("SELECT * FROM shipping_zones WHERE is_active = 1 ORDER BY sort_order, name")
    .all() as ZoneRow[];
  const zone = zones.find((row) => zoneCovers(row.pincodes, pincode));
  if (!zone) {
    return {
      serviceable: false,
      pincode,
      zoneName: null,
      fee: 0,
      freeAbove: null,
      freeApplied: false,
      etaDaysMin: null,
      etaDaysMax: null,
      message: "We do not currently deliver to this PIN code. Please contact us to check availability."
    };
  }
  const freeApplied = zone.free_above !== null && goodsTotal >= zone.free_above;
  return {
    serviceable: true,
    pincode,
    zoneName: zone.name,
    fee: freeApplied ? 0 : zone.fee,
    freeAbove: zone.free_above,
    freeApplied,
    etaDaysMin: zone.eta_days_min,
    etaDaysMax: zone.eta_days_max,
    message: freeApplied
      ? `Delivery included · estimated in ${zone.eta_days_min}–${zone.eta_days_max} working days`
      : `Estimated in ${zone.eta_days_min}–${zone.eta_days_max} working days`
  };
}

export function listZones(db: DB) {
  return db.prepare("SELECT * FROM shipping_zones ORDER BY sort_order, name").all() as Array<
    ZoneRow & { is_active: number; sort_order: number }
  >;
}
