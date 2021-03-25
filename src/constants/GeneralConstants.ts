import {IPermAllowDeny} from "../definitions/major/IPermAllowDeny";

export namespace GeneralConstants {
    export const NUMBER_OF_STATS: number = 8;

    export const ALL_CHARACTERS: string[] = [
        ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
        ..."abcdefghijklmnopqrstuvwxyz".split(""),
        ..."0123456789".split("")
    ];

    // These are from the IVerificationRequirements.ts file
    export const SHORT_STAT_TO_LONG: { [s: string]: string } = {
        "att": "Attack",
        "def": "Defense",
        "spd": "Speed",
        "dex": "Dexterity",
        "vit": "Vitality",
        "wis": "Wisdom",
        "hp": "Health",
        "mp": "Magic"
    };

    export const GY_HIST_ACHIEVEMENTS: { [s: string]: string } = {
        "Lost Halls": "Lost Halls completed",
        "Voids": "Voids completed",
        "Cultist Hideouts": "Cultist Hideouts completed",
        "Nests": "Nests completed2",
        "Shatters": "Shatters completed1",
        "Tomb of the Ancients": "Tombs completed",
        "Ocean Trenches": "Ocean Trenches completed",
        "Parasite Chambers": "Parasite chambers completed4",
        "Lair of Shaitans": "Lairs of Shaitan completed4",
        "Puppet Master's Encores": "Puppet Master's Encores completed4",
        "Cnidarian Reefs": "Cnidarian Reefs completed",
        "Secluded Thickets": "Secluded Thickets completed",
        "Cursed Libraries": "Cursed Libraries completed",
        "Fungal Caverns": "Fungal Caverns completed",
        "Crystal Caverns": "Crystal Caverns completed",
        "Lair of Draconis (Hard)": "Lairs of Draconis (hard mode) completed2",
        "Lair of Draconis (Easy)": "Lairs of Draconis (easy mode) completed1",
        "Mountain Temples": "Mountain Temples completed2",
        "Crawling Depths": "Crawling Depths completed1",
        "Woodland Labyrinths": "Woodland Labyrinths completed1",
        "Deadwater Docks": "Deadwater Docks completed1",
        "Ice Cave": "Ice Caves completed1",
        "Belladonna's Gardens": "Bella Donnas completed3",
        "Davy Jones' Lockers": "Davy Jones's Lockers completed1",
        "Battle of the Nexus": "Battle for the Nexuses completed1",
        "Candyland Hunting Grounds": "Candyland Hunting Grounds completed",
        "Puppet Master's Theatres": "Puppet Master's Theatres completed1",
        "Toxic Sewers": "Toxic Sewers completed1",
        "Haunted Cemetaries": "Haunted Cemeteries completed1",
        "Mad Labs": "Mad Labs completed1",
        "Abyss of Demons": "Abysses of Demons completed",
        "Manor of the Immortals": "Manors of the Immortals completed",
        "Ancient Ruins": "Ancient Ruins completed",
        "Undead Lairs": "Undead Lairs completed",
        "Sprite Worlds": "Sprite Worlds completed",
        "Snake Pits": "Snake Pits completed",
        "Cave of a Thousand Treasures": "Caves of a Thousand Treasures completed1",
        "Magic Woods": "Magic Woods completed",
        "Hives": "Hives completed1",
        "Spider Dens": "Spider Dens completed",
        "Forbidden Jungles": "Forbidden Jungles completed",
        "Forest Mazes": "Forest Mazes completed1",
        "Pirate Caves": "Pirate Caves completed"
    };

    // These will be used for AFK check channel permissions.
    // PD = Program defined. These are essentially constants that will be used as placeholders for the actual
    // section or guild role IDs and will be stored in the database as the PD type.
    // User-defined role IDs will be defined in the database as the role ID.
    export const EVERYONE_ROLE: string = "PD-{EVERYONE}";
    export const MEMBER_ROLE: string = "PD-{MEMBER_ROLE}";
    export const SECURITY_ROLE: string = "PD-{SECURITY_ROLE}";
    export const OFFICER_ROLE: string = "PD-{OFFICER_ROLE}";
    export const MODERATOR_ROLE: string = "PD-{MODERATOR_ROLE}";

    export const UNIVERSAL_LEADER_ROLE: string = "PD-{UNIVERSAL_RL}";
    export const UNIVERSAL_ALMOST_LEADER_ROLE: string = "PD-{UNIVERSAL_ARL}";
    export const UNIVERSAL_VETERAN_LEADER_ROLE: string = "PD-{UNIVERSAL_VRL}";
    export const UNIVERSAL_HEAD_LEADER_ROLE: string = "PD-{UNIVERSAL_HRL}";

    export const SECTION_ALMOST_LEADER_ROLE: string = "PD-{SECTION_ARL}";
    export const SECTION_LEADER_ROLE: string = "PD-{SECTION_RL}";
    export const SECTION_VETERAN_LEADER_ROLE: string = "PD-{SECTION_VRL}";
    export const SECTION_HEAD_LEADER_ROLE: string = "PD-{SECTION_HRL}";

    export const ALL_PD_DEFINED_ROLES: string[] = [
        EVERYONE_ROLE,
        MEMBER_ROLE,
        SECURITY_ROLE,
        OFFICER_ROLE,
        MODERATOR_ROLE,

        UNIVERSAL_ALMOST_LEADER_ROLE,
        UNIVERSAL_LEADER_ROLE,
        UNIVERSAL_VETERAN_LEADER_ROLE,
        UNIVERSAL_HEAD_LEADER_ROLE,

        SECTION_ALMOST_LEADER_ROLE,
        SECTION_LEADER_ROLE,
        SECTION_VETERAN_LEADER_ROLE,
        SECTION_HEAD_LEADER_ROLE
    ];

    export const DEFAULT_AFK_CHECK_PERMISSIONS: (IPermAllowDeny & { id: string; })[] = [
        {
            id: EVERYONE_ROLE,
            allow: [],
            deny: ["VIEW_CHANNEL", "SPEAK", "STREAM", "CONNECT"]
        },
        {
            id: MEMBER_ROLE,
            allow: ["VIEW_CHANNEL"],
            deny: []
        },
        {
            id: SECURITY_ROLE,
            allow: ["CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "STREAM"],
            deny: []
        },
        {
            id: OFFICER_ROLE,
            allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "STREAM"],
            deny: []
        },
        {
            id: MODERATOR_ROLE,
            allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "STREAM"],
            deny: []
        },
        {
            id: UNIVERSAL_ALMOST_LEADER_ROLE,
            allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "STREAM"],
            deny: []
        },
        {
            id: UNIVERSAL_LEADER_ROLE,
            allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "DEAFEN_MEMBERS", "STREAM"],
            deny: []
        },
        {
            id: UNIVERSAL_HEAD_LEADER_ROLE,
            allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "STREAM"],
            deny: []
        },
        {
            id: UNIVERSAL_VETERAN_LEADER_ROLE,
            allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "STREAM"],
            deny: []
        },
        {
            id: SECTION_ALMOST_LEADER_ROLE,
            allow: ["CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "STREAM"],
            deny: []
        },
        {
            id: SECTION_LEADER_ROLE,
            allow: ["CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "DEAFEN_MEMBERS", "STREAM"],
            deny: []
        },
        {
            id: SECTION_HEAD_LEADER_ROLE,
            allow: ["CONNECT", "SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "STREAM"],
            deny: []
        },
        {
            id: SECTION_VETERAN_LEADER_ROLE,
            allow: ["CONNECT", "SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "STREAM"],
            deny: []
        }
    ];
}