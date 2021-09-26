import {MessageActionRow, MessageButton} from "discord.js";
import {Emojis} from "./Emojis";
import {AdvancedCollector} from "../utilities/collectors/AdvancedCollector";
import {MessageButtonStyles} from "discord.js/typings/enums";
import {IPermAllowDeny} from "../definitions";
import {DefinedRole} from "../definitions/Types";

export namespace GeneralConstants {
    export const ROLE_ORDER: readonly DefinedRole[] = Object.freeze([
        GeneralConstants.MODERATOR_ROLE,
        GeneralConstants.HEAD_LEADER_ROLE,
        GeneralConstants.OFFICER_ROLE,
        GeneralConstants.VETERAN_LEADER_ROLE,
        GeneralConstants.LEADER_ROLE,
        GeneralConstants.SECURITY_ROLE,
        GeneralConstants.ALMOST_LEADER_ROLE,
        GeneralConstants.HELPER_ROLE,
        GeneralConstants.TEAM_ROLE,
        GeneralConstants.MEMBER_ROLE,
        GeneralConstants.SUSPENDED_ROLE,
        GeneralConstants.EVERYONE_ROLE
    ]);

    export const ZERO_WIDTH_SPACE: string = "\u200b";

    export const NUMBER_OF_STATS: number = 8;

    export const ALL_CHARACTERS: string[] = [
        ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
        ..."abcdefghijklmnopqrstuvwxyz".split(""),
        ..."0123456789".split("")
    ];

    // These are from the IVerificationRequirements.ts file
    export const SHORT_STAT_TO_LONG: { [s: string]: [string, string] } = {
        "att": ["attack", "Attack"],
        "def": ["defense", "Defense"],
        "spd": ["speed", "Speed"],
        "dex": ["dexterity", "Dexterity"],
        "vit": ["vitality", "Vitality"],
        "wis": ["wisdom", "Wisdom"],
        "hp": ["health", "Health"],
        "mp": ["magic", "Magic"]
    };

    export const LONG_STAT_TO_SHORT: { [s: string]: string } = {
        "attack": "att",
        "defense": "def",
        "speed": "spd",
        "dexterity": "dex",
        "vitality": "vit",
        "wisdom": "wis",
        "health": "hp",
        "magic": "mp"
    };

    export const GY_HIST_TO_DISPLAY: { [s: string]: string } = {
        "Lost Halls completed": "Lost Halls",
        "Voids completed": "Voids",
        "Cultist Hideouts completed": "Cultist Hideouts",
        "Nests completed2": "Nests",
        "Shatters completed1": "Shatters",
        "Tombs completed": "Tomb of the Ancients",
        "Ocean Trenches completed": "Ocean Trenches",
        "Parasite chambers completed4": "Parasite Chambers",
        "Lairs of Shaitan completed4": "Lair of Shaitans",
        "Puppet Master's Encores completed4": "Puppet Master's Encores",
        "Cnidarian Reefs completed": "Cnidarian Reefs",
        "Secluded Thickets completed": "Secluded Thickets",
        "Cursed Libraries completed": "Cursed Libraries",
        "Fungal Caverns completed": "Fungal Caverns",
        "Crystal Caverns completed": "Crystal Caverns",
        "Lairs of Draconis (hard mode) completed2": "Lair of Draconis (Hard)",
        "Lairs of Draconis (easy mode) completed1": "Lair of Draconis (Easy)",
        "Mountain Temples completed2": "Mountain Temples",
        "Crawling Depths completed1": "Crawling Depths",
        "Woodland Labyrinths completed1": "Woodland Labyrinths",
        "Deadwater Docks completed1": "Deadwater Docks",
        "Ice Caves completed1": "Ice Cave",
        "Bella Donnas completed3": "Belladonna's Gardens",
        "Davy Jones's Lockers completed1": "Davy Jones' Lockers",
        "Battle for the Nexuses completed1": "Battle of the Nexus",
        "Candyland Hunting Grounds completed": "Candyland Hunting Grounds",
        "Puppet Master's Theatres completed1": "Puppet Master's Theatres",
        "Toxic Sewers completed1": "Toxic Sewers",
        "Haunted Cemeteries completed1": "Haunted Cemetaries",
        "Mad Labs completed1": "Mad Labs",
        "Abysses of Demons completed": "Abyss of Demons",
        "Manors of the Immortals completed": "Manor of the Immortals",
        "Ancient Ruins completed": "Ancient Ruins",
        "Undead Lairs completed": "Undead Lairs",
        "Sprite Worlds completed": "Sprite Worlds",
        "Snake Pits completed": "Snake Pits",
        "Caves of a Thousand Treasures completed1": "Cave of a Thousand Treasures",
        "Magic Woods completed": "Magic Woods",
        "Hives completed1": "Hives",
        "Spider Dens completed": "Spider Dens",
        "Forbidden Jungles completed": "Forbidden Jungles",
        "Forest Mazes completed1": "Forest Mazes",
        "Pirate Caves completed": "Pirate Caves"
    };

    export const DISPLAY_TO_GY_HIST: { [s: string]: string } = {
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

    export const EVERYONE_ROLE: DefinedRole = "Everyone";
    export const SUSPENDED_ROLE: DefinedRole = "Suspended";
    export const MEMBER_ROLE: DefinedRole = "Raider";
    export const HELPER_ROLE: DefinedRole = "Helper";
    export const SECURITY_ROLE: DefinedRole = "Security";
    export const OFFICER_ROLE: DefinedRole = "Officer";
    export const MODERATOR_ROLE: DefinedRole = "Moderator";
    export const LEADER_ROLE: DefinedRole = "RaidLeader";
    export const ALMOST_LEADER_ROLE: DefinedRole = "AlmostRaidLeader";
    export const VETERAN_LEADER_ROLE: DefinedRole = "VeteranRaidLeader";
    export const HEAD_LEADER_ROLE: DefinedRole = "HeadRaidLeader";

    // Essentially, any staff role.
    export const TEAM_ROLE: DefinedRole = "Team";

    // Keep in mind that section RLs have the same power as regular RLs, just in their own sections.
    export const DEFAULT_AFK_CHECK_PERMISSIONS: readonly (IPermAllowDeny & { id: string; })[] = Object.freeze([
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
            id: HELPER_ROLE,
            allow: ["CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS"],
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
            id: ALMOST_LEADER_ROLE,
            allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "STREAM"],
            deny: []
        },
        {
            id: LEADER_ROLE,
            allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "DEAFEN_MEMBERS", "STREAM"],
            deny: []
        },
        {
            id: HEAD_LEADER_ROLE,
            allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "STREAM"],
            deny: []
        },
        {
            id: VETERAN_LEADER_ROLE,
            allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "STREAM"],
            deny: []
        }
    ]);

    export const YES_NO_ACTION_BUTTONS: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents([
        new MessageButton()
            .setCustomId("yes")
            .setStyle(MessageButtonStyles.SUCCESS)
            .setEmoji(Emojis.GREEN_CHECK_EMOJI)
            .setLabel("Yes"),
        new MessageButton()
            .setCustomId("no")
            .setStyle("DANGER")
            .setEmoji(Emojis.X_EMOJI)
            .setLabel("No")
    ]);

    export const GITHUB_URL: string = "https://github.com/ewang2002/OneLifeBot/";
}