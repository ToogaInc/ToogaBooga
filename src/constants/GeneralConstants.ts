
import {MessageActionRow, MessageButton} from "discord.js";
import {Emojis} from "./Emojis";
import {AdvancedCollector} from "../utilities/collectors/AdvancedCollector";
import {MessageButtonStyles} from "discord.js/typings/enums";
import {IPermAllowDeny} from "../definitions";

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

    // Defined roles for custom AFK checks and commands.
    export type RolePermissions = "Everyone"
        | "Suspended"
        | "Raider"
        | "Team"
        | "Security"
        | "AlmostRaidLeader"
        | "RaidLeader"
        | "VeteranRaidLeader"
        | "Officer"
        | "HeadRaidLeader"
        | "Moderator";

    // Logging types.
    export type MainLogType = "Suspend"
        | "SectionSuspend"
        | "Blacklist"
        | "Mute"
        | "Warn";

    export const EVERYONE_ROLE: RolePermissions = "Everyone";
    export const SUSPENDED_ROLE: RolePermissions = "Suspended";
    export const MEMBER_ROLE: RolePermissions = "Raider";
    export const SECURITY_ROLE: RolePermissions = "Security";
    export const OFFICER_ROLE: RolePermissions = "Officer";
    export const MODERATOR_ROLE: RolePermissions = "Moderator";
    export const LEADER_ROLE: RolePermissions = "RaidLeader";
    export const ALMOST_LEADER_ROLE: RolePermissions = "AlmostRaidLeader";
    export const VETERAN_LEADER_ROLE: RolePermissions = "VeteranRaidLeader";
    export const HEAD_LEADER_ROLE: RolePermissions = "HeadRaidLeader";

    // Essentially, any staff role.
    export const TEAM_ROLE: RolePermissions = "Team";

    // Keep in mind that section RLs have the same power as regular RLs, just in their own sections.
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
    ];

    export const YES_NO_ACTION_BUTTONS: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents([
        new MessageButton()
            .setCustomId("yes")
            .setStyle(MessageButtonStyles.SUCCESS)
            .setEmoji(Emojis.GREEN_CHECK_EMOJI)
            .setLabel("Yes"),
        new MessageButton()
            .setCustomId("no")
            .setStyle(MessageButtonStyles.DANGER)
            .setEmoji(Emojis.X_EMOJI)
            .setLabel("No")
    ]);
}