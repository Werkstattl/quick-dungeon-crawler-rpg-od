const MIN_CURSE_LEVEL = 1;
const MAX_STANDARD_CURSE_LEVEL = 10;
const MAX_CURSE_LEVEL = MAX_STANDARD_CURSE_LEVEL;
const MAX_EQUIPMENT_LEVEL = 100;

const clampCurseLevel = (value) => {
    let level = Number(value);
    if (!Number.isFinite(level)) {
        level = MIN_CURSE_LEVEL;
    }
    level = Math.round(level);
    return Math.min(MAX_CURSE_LEVEL, Math.max(MIN_CURSE_LEVEL, level));
};

const clampEquipmentLevel = (value) => {
    let level = Number(value);
    if (!Number.isFinite(level)) {
        level = 1;
    }
    level = Math.round(level);
    return Math.min(MAX_EQUIPMENT_LEVEL, Math.max(1, level));
};
