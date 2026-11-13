export function isValidPincode(value) {
    return /^[1-9][0-9]{5}$/.test(value.trim());
}
function zoneCovers(pincodes, pincode) {
    for (const raw of pincodes.split(/[\s,;]+/)) {
        const token = raw.trim();
        if (!token)
            continue;
        if (token === pincode)
            return true;
        const range = /^(\d{6})-(\d{6})$/.exec(token);
        if (range && pincode >= range[1] && pincode <= range[2])
            return true;
    }
    return false;
}
export function quoteShipping(db, pincodeInput, goodsTotal) {
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
        .all();
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
export function listZones(db) {
    return db.prepare("SELECT * FROM shipping_zones ORDER BY sort_order, name").all();
}
