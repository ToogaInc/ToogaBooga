export interface IMappedReactions {
    [key: string]: {
        emojiType: "KEY" | "STATUS_EFFECT" | "CLASS" | "ITEM" | "SPECIAL";
        emojiId: string;
        emojiName: string;
    };
}

export const MappedReactions: IMappedReactions = {
    NITRO: {
        emojiType: "SPECIAL",
        emojiId: "",
        emojiName: "Nitro & Early Location"
    },

    ROGUE: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Rogue"
    },
    ARCHER: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Archer"
    },
    WIZARD: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Wizard"
    },
    PRIEST: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Priest"
    },
    WARRIOR: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Warrior"
    },
    KNIGHT: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Knight"
    },
    PALADIN: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Paladin"
    },
    ASSASSIN: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Assassin"
    },
    NECROMANCER: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Necromancer"
    },
    HUNTRESS: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Huntress"
    },
    MYSTIC: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Mystic"
    },
    TRICKSTER: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Trickster"
    },
    SORCERER: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Sorcerer"
    },
    NINJA: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Ninja"
    },
    SAMURAI: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Samurai"
    },
    BARD: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Bard"
    },

    PARALYZE: {
        emojiType: "STATUS_EFFECT",
        emojiId: "",
        emojiName: "Paralyze"
    },
    STUN: {
        emojiType: "STATUS_EFFECT",
        emojiId: "",
        emojiName: "Stun"
    },
    SLOW: {
        emojiType: "STATUS_EFFECT",
        emojiId: "",
        emojiName: "Slow"
    },
    DAZE: {
        emojiType: "STATUS_EFFECT",
        emojiId: "",
        emojiName: "Daze"
    },
    ARMOR_BREAK: {
        emojiType: "STATUS_EFFECT",
        emojiId: "",
        emojiName: "Armor Break"
    },
    RUSHING_CLASS: {
        emojiType: "CLASS",
        emojiId: "",
        emojiName: "Rushing Class"
    },

    MSEAL: {
        emojiType: "ITEM",
        emojiId: "",
        emojiName: "Marble Seal"
    },
    SCHOLAR_SEAL: {
        emojiType: "ITEM",
        emojiId: "",
        emojiName: "Scholar Seal"
    },
    BRAIN_PRISM: {
        emojiType: "ITEM",
        emojiId: "",
        emojiName: "Brain of the Golem"
    },

    // Keys
    SNAKE_PIT_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Snake Pit Key"
    },
    MAGIC_WOODS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Magic Wood Key"
    },
    SPRITE_WORLD_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Sprite World Key"
    },
    ANCIENT_RUINS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Ancient Ruins Key"
    },
    CANDYLAND_HUNTING_GROUNDS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Candyland Hunting Ground Key"
    },
    CAVE_THOUSAND_TREASURES_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Cave of a Thousand Treasures Key"
    },
    UNDEAD_LAIR_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Undead Lair Key"
    },
    HEROIC_UNDEAD_LAIR_LEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Heroic Undead Lair Key"
    },
    ABYSS_OF_DEMONS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Abyss of Demons Key"
    },
    HEROIC_ABYSS_OF_DEMONS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Heroic Abyss of Demons Key"
    },
    MANOR_OF_THE_IMMORTALS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Manor of the Immortals Key"
    },
    PUPPET_MASTERS_THEATRE_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Puppet Master's Theatre Key"
    },
    TOXIC_SEWERS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Toxic Sewers Key"
    },
    HAUNTED_CEMETERY_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Haunted Cemetery Key"
    },
    MAD_LAB_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Mad Lab Key"
    },
    PARASITE_CHAMBERS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Parasite Chambers Key"
    },
    DAVY_JONES_LOCKER_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Davy Jones' Locker Key"
    },
    MOUNTAIN_TEMPLE_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Mountain Temple Key"
    },
    LAIR_OF_DRACONIS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Lair of Draconis Key"
    },
    DEADWATER_DOCKS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Deadwater Docks Key"
    },
    WOODLAND_LABYRINTH_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Woodland Labyrinth Key"
    },
    CRAWLING_DEPTHS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Crawling Depths Key"
    },
    OCEAN_TRENCH_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Ocean Trench Key"
    },
    ICE_CAVE_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Ice Cave Key"
    },
    TOMB_OF_THE_ANCIENTS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Tomb of the Ancients Key"
    },
    LAIR_OF_SHAITANS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Lair of Shaitans Key"
    },
    PUPPET_MASTERS_ENCORE_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Puppet Masters Encore Key"
    },
    CNIDARIAN_REEF_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Cnidarian Reef Key"
    },
    SECLUDED_THICKET_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Secluded Thicket Key"
    },
    HIGH_TECH_TERROR_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "High Tech Terror Key"
    },
    BATTLE_FOR_THE_NEXUS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Battle for the Nexus Key"
    },
    BELLADONNAS_GARDEN_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Belladonnas Garden Key"
    },
    ICE_TOMB_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Ice Tomb Key"
    },
    MAD_GOD_MAYHEM_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Mad God Mayhem Key"
    },
    SHATTERS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Shatters Key"
    },
    MACHINE_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Maching Key"
    },
    NEST_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Nest Key"
    },
    CURSED_LIBRARY_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Cursed Library Key"
    },
    LOST_HALLS_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Lost Halls Key"
    },
    VIAL_OF_PURE_DARKNESS: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Vial of Pure Darkness"
    },
    FUNGAL_CAVERN_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Fungal Cavern Key"
    },
    MISCELLANEOUS_DUNGEON_KEY: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Miscellaneous Dungeon Key"
    },
    WC_INC: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Wine Cellar Incantation"
    },
    SHIELD_RUNE: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Shield Rune"
    },
    SWORD_RUNE: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Sword Rune"
    },
    HELM_RUNE: {
        emojiType: "KEY",
        emojiId: "",
        emojiName: "Helm Rune"
    }
};