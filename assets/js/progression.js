const MIN_CURSE_LEVEL = 1;
const MAX_STANDARD_CURSE_LEVEL = 10;
const MAX_CURSE_LEVEL = MAX_STANDARD_CURSE_LEVEL;
const MAX_EQUIPMENT_LEVEL = 100;
const STANDARD_CURSE_UNLOCK_FLOOR = 10;
const CURSE_UNLOCK_TRIGGER_FLOOR = 'floor';
const CURSE_UNLOCK_TRIGGER_MONARCH = 'monarch';

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

const getNextCurseUnlockLevel = ({
    maxUnlockedCurseLevel,
    selectedCurseLevel,
    floor,
    trigger = CURSE_UNLOCK_TRIGGER_FLOOR,
    maxCurseLevel = MAX_CURSE_LEVEL,
}) => {
    const normalizedMaximum = Math.max(MIN_CURSE_LEVEL, Math.round(Number(maxCurseLevel)) || MIN_CURSE_LEVEL);
    const maxUnlocked = Math.min(normalizedMaximum, Math.max(MIN_CURSE_LEVEL, Math.round(Number(maxUnlockedCurseLevel)) || MIN_CURSE_LEVEL));
    const selectedLevel = Math.min(normalizedMaximum, Math.max(MIN_CURSE_LEVEL, Math.round(Number(selectedCurseLevel)) || MIN_CURSE_LEVEL));

    if (maxUnlocked >= normalizedMaximum || selectedLevel !== maxUnlocked) {
        return null;
    }

    const requiresMonarchVictory = maxUnlocked >= MAX_STANDARD_CURSE_LEVEL;
    if (requiresMonarchVictory) {
        return trigger === CURSE_UNLOCK_TRIGGER_MONARCH ? maxUnlocked + 1 : null;
    }

    return Number(floor) >= STANDARD_CURSE_UNLOCK_FLOOR && trigger === CURSE_UNLOCK_TRIGGER_FLOOR
        ? maxUnlocked + 1
        : null;
};
