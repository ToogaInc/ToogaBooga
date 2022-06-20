import {IDungeonModifier} from "../../definitions";

export const HIGHEST_MODIFIER_LEVEL: number = 5;

export const DUNGEON_MODIFIERS: readonly IDungeonModifier[] = [
    {
        modifierName: "Agent of Oryx",
        maxLevel: 1,
        description: "Boss can drop Agents of Oryx Shards.",
        modifierId: "AGENT_OF_ORYX",
        defaultDisplay: true
    },
    {
        modifierName: "Bis",
        maxLevel: 1,
        description: "Boss has a 50% chance of dropping the portal to the same dungeon.",
        modifierId: "BIS",
        defaultDisplay: true
    },
    {
        modifierName: "Bored Minions",
        maxLevel: 3,
        description: "Minions' projectiles have x% less lifetime.",
        modifierId: "BORED_MINIONS",
        defaultDisplay: true
    },
    {
        modifierName: "Bulky Minions",
        maxLevel: 3,
        description: "Minions have x% more HP.",
        modifierId: "BULKY_MINIONS",
        defaultDisplay: false
    },
    {
        modifierName: "Chef",
        maxLevel: 1,
        description: "Boss has a 33% chance of dropping a food item.",
        modifierId: "CHEF",
        defaultDisplay: true
    },
    {
        modifierName: "Colorful",
        maxLevel: 1,
        description: "Boss always drops a Color Dye.",
        modifierId: "COLORFUL",
        defaultDisplay: false
    },
    {
        modifierName: "Dimitus",
        maxLevel: 1,
        description: "Dimitus will appear after the Boss is defeated.",
        modifierId: "DIMITUS",
        defaultDisplay: false
    },
    {
        modifierName: "Dull Minions",
        maxLevel: 4,
        description: "Minions' projectiles travel x% slower.",
        modifierId: "DULL_MINIONS",
        defaultDisplay: true
    },
    {
        modifierName: "Elite Boss",
        maxLevel: 3,
        description: "Boss enemies have x% more HP.",
        modifierId: "ELITE_BOSS",
        defaultDisplay: true
    },
    {
        modifierName: "Energized Minions",
        maxLevel: 3,
        description: "Minions' projectiles have x% more lifetime.",
        modifierId: "ENERGIZED_MINIONS",
        defaultDisplay: true
    },
    {
        modifierName: "Feeble Boss",
        maxLevel: 4,
        description: "Boss enemies have x% less DEF.",
        modifierId: "FEEBLE_BOSS",
        defaultDisplay: true
    },
    {
        modifierName: "Feeble Minions",
        maxLevel: 4,
        description: "Minions have x% less DEF.",
        modifierId: "FEEBLE_MINIONS",
        defaultDisplay: false
    },
    {
        modifierName: "Ferocious Boss",
        maxLevel: 4,
        description: "Boss enemies deal x% more DMG.",
        modifierId: "FEROCIOUS_BOSS",
        defaultDisplay: true
    },
    {
        modifierName: "Ferocious Minions",
        maxLevel: 3,
        description: "Minions deal x% more DMG.",
        modifierId: "FEROCIOUS_MINIONS",
        defaultDisplay: false
    },
    {
        modifierName: "Generous",
        maxLevel: 1,
        description: "Boss has a 10% chance to drop a Quest Chest.",
        modifierId: "GENEROUS",
        defaultDisplay: true
    },
    {
        modifierName: "Guaranteed Stat Potion",
        maxLevel: 1,
        description: "Boss enemies will always drop their respective Stat Potion.",
        modifierId: "GUARANTEED_STAT_POT",
        defaultDisplay: true
    },
    {
        modifierName: "Keen Minions",
        maxLevel: 4,
        description: "Minions's projectiles travel x% faster.",
        modifierId: "KEEN_MINIONS",
        defaultDisplay: true
    },
    {
        modifierName: "Lazy Minions",
        maxLevel: 3,
        description: "Minions attack x% slower.",
        modifierId: "LAZY_MINIONS",
        defaultDisplay: true
    },
    {
        modifierName: "Mystery Stat Potion",
        maxLevel: 1,
        description: "Boss always drops a Mystery Stat Potion.",
        modifierId: "MYSTERY_STAT_POT",
        defaultDisplay: false
    },
    {
        modifierName: "Noble Boss",
        maxLevel: 1,
        description: "Boss drops a portal to the Court of Oryx.",
        modifierId: "NOBLE_BOSS",
        defaultDisplay: false
    },
    {
        modifierName: "Pet Collector",
        maxLevel: 1,
        description: "Boss has a 25% chance of dropping an egg.",
        modifierId: "PET_COLLECTOR",
        defaultDisplay: false
    },
    {
        modifierName: "Prismimic",
        maxLevel: 1,
        description: "Prismimic will appear after the boss is defeated.",
        modifierId: "PRISMIMIC",
        defaultDisplay: false
    },
    {
        modifierName: "Rewards Boost (Boss)",
        maxLevel: 5,
        description: "Boss enemies give x% more loot.",
        modifierId: "REWARDS_BOOST_BOSS",
        defaultDisplay: true
    },
    {
        modifierName: "Rewards Boost (Minions)",
        maxLevel: 2,
        description: "Minions give x% more loot.",
        modifierId: "REWARDS_BOOST_MINIONS",
        defaultDisplay: false
    },
    {
        modifierName: "Rewards Decrease (Minions)",
        maxLevel: 2,
        description: "Minions give x% less loot.",
        modifierId: "REWARDS_DECREASE_MINIONS",
        defaultDisplay: false
    },
    {
        modifierName: "Skilled Minions",
        maxLevel: 3,
        description: "Minions attack x% faster.",
        modifierId: "SKILLED_MINIONS",
        defaultDisplay: true
    },
    {
        modifierName: "Souvenir",
        maxLevel: 2,
        description: "Triples your chance of the boss dropping an iconic reward.",
        modifierId: "SOUVENIR",
        defaultDisplay: true
    },
    {
        modifierName: "Survivor",
        maxLevel: 1,
        description: "Minions have a higher chance to drop Health/Mana Potions.",
        modifierId: "SURVIVOR",
        defaultDisplay: false
    },
    {
        modifierName: "Tame Boss",
        maxLevel: 4,
        description: "Boss enemies deal x% less damage.",
        modifierId: "TAME_BOSS",
        defaultDisplay: true
    },
    {
        modifierName: "Tame Minions",
        maxLevel: 3,
        description: "Minions deal x% less damage.",
        modifierId: "TAME_MINIONS",
        defaultDisplay: false
    },
    {
        modifierName: "Tough Boss",
        maxLevel: 4,
        description: "Boss enemies have x% more DEF.",
        modifierId: "TOUGH_BOSS",
        defaultDisplay: true
    },
    {
        modifierName: "Tough Minions",
        maxLevel: 4,
        description: "Minions have x% more DEF.",
        modifierId: "TOUGH_MINIONS",
        defaultDisplay: false
    },
    {
        modifierName: "Weak Boss",
        maxLevel: 3,
        description: "Boss enemies have x% less HP.",
        modifierId: "WEAK_BOSS",
        defaultDisplay: true
    },
    {
        modifierName: "Weak Minions",
        maxLevel: 3,
        description: "Minions have x% less HP.",
        modifierId: "WEAK_MINIONS",
        defaultDisplay: false
    },
    {
        modifierName: "XP Boost (Boss)",
        maxLevel: 5,
        description: "Boss enemies give x% more XP",
        modifierId: "XP_BOOST_BOSS",
        defaultDisplay: false
    },
    {
        modifierName: "XP Boost (Minions)",
        maxLevel: 2,
        description: "Minions give x% more XP.",
        modifierId: "XP_BOOST_MINIONS",
        defaultDisplay: false
    },
    {
        modifierName: "XP Decrease (Minions)",
        maxLevel: 2,
        description: "Minions give x% less XP.",
        modifierId: "XP_DECREASE_MINIONS",
        defaultDisplay: false
    },
    // https://remaster.realmofthemadgod.com/?p=2747
    {
        modifierName: "Key Fairy",
        maxLevel: 3,
        description: "Upon killing the boss, a Key Fairy has a chance to spawn.",
        modifierId: "KEY_FAIRY",
        defaultDisplay: true
    },
    {
        modifierName: "Mystery Skin",
        maxLevel: 1,
        description: "Upon killing the boss, a Mystery Skin token will have a chance to drop.",
        modifierId: "MYSTERY_SKIN",
        defaultDisplay: true
    },
    {
        modifierName: "Skin Hunter",
        maxLevel: 2,
        description: "Boss enemies that can drop pet and player skins have better drop rates applied.",
        modifierId: "SKIN_HUNTER",
        defaultDisplay: true
    },
    {
        modifierName: "Nildrops",
        maxLevel: 1,
        description: "Boss enemies drop a Nildrop on defeat. The quality depends on the dungeon.",
        modifierId: "NILDROPS",
        defaultDisplay: false
    },
    {
        modifierName: "Bonus Consumables",
        maxLevel: 1,
        description: "Bosses will drop additional consumables belonging to the dungeon upon defeat.",
        modifierId: "BONUS_CONSUMABLES",
        defaultDisplay: false
    },
    {
        modifierName: "Mystery Effusion",
        maxLevel: 1,
        description: "Boss will drop a Tincture or Effusion on defeat.",
        modifierId: "MYSTERY_EFFUSION",
        defaultDisplay: false
    },
    {
        modifierName: "Exalted Banner",
        maxLevel: 2,
        description: "Chance for an additional completion when you finish the dungeon.",
        modifierId: "EXALTED_BANNER",
        defaultDisplay: true
    },
    {
        modifierName: "Found Treasure!",
        maxLevel: 2,
        description: "Treasure rooms will reveal themselves at the start of the dungeon if they exist.",
        modifierId: "FOUND_TREASURE",
        defaultDisplay: false
    },
    {
        modifierName: "Heroic Regeneration",
        maxLevel: 1,
        description: "Enemies will have a chance to drop Heroic Orbs on death, that grant Healing or Energized.",
        modifierId: "HEROIC_REGENERATION",
        defaultDisplay: false
    },
    {
        modifierName: "Spider Swarm",
        maxLevel: 1,
        description: "Enemies have a chance to split into multiple spiders that drop ichors on death.",
        modifierId: "SPIDER_SWARM",
        defaultDisplay: false
    },
    {
        modifierName: "Alexander's Legacy",
        maxLevel: 4,
        description: "Thessal has an additional chance of becoming wounded upon defeat.",
        modifierId: "ALEXANDERS_LEGACY",
        defaultDisplay: false
    },
    {
        modifierName: "Crab Rave",
        maxLevel: 1,
        description: "The Calamity Crab is replaced with (4/6) mini-Calamity Crabs.",
        modifierId: "CRAB_RAVE",
        defaultDisplay: false
    },
    {
        modifierName: "Haunted Halls",
        maxLevel: 1,
        description: "Additional chance for each room to contain a Spectral Sentry.",
        modifierId: "HAUNTED_HALLS",
        defaultDisplay: false
    },
    {
        modifierName: "Lingering Magi",
        maxLevel: 1,
        description: "The castle starts with one Magi Generator already active.",
        modifierId: "LINGERING_MAGI",
        defaultDisplay: false
    },
    {
        modifierName: "The Wanderer",
        maxLevel: 1,
        description: "An unknown foe will appear after the Boss is defeated with its own loot table.",
        modifierId: "THE_WANDERER",
        defaultDisplay: true
    }
];

export const DEFAULT_MODIFIERS: readonly IDungeonModifier[] = DUNGEON_MODIFIERS.filter(x => x.defaultDisplay);