import {IPermAllowDeny} from "../definitions";
import {DefinedRole} from "../definitions/Types";

export namespace PermsConstants {
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
    export const TEAM_ROLE: DefinedRole = "Team";

    export const ROLE_ORDER: readonly DefinedRole[] = Object.freeze([
        MODERATOR_ROLE,
        HEAD_LEADER_ROLE,
        OFFICER_ROLE,
        VETERAN_LEADER_ROLE,
        LEADER_ROLE,
        SECURITY_ROLE,
        ALMOST_LEADER_ROLE,
        HELPER_ROLE,
        TEAM_ROLE,
        MEMBER_ROLE,
        SUSPENDED_ROLE,
        EVERYONE_ROLE
    ]);

    // Keep in mind that section RLs have the same power as regular RLs, just in their own sections.
    export const DEFAULT_AFK_CHECK_PERMISSIONS: readonly (IPermAllowDeny & { id: string; })[] = Object.freeze([
        {
            id: EVERYONE_ROLE,
            allow: [],
            deny: ["VIEW_CHANNEL", "SPEAK", "STREAM"]
        },
        {
            id: MEMBER_ROLE,
            allow: ["VIEW_CHANNEL"],
            deny: []
        },
        {
            id: HELPER_ROLE,
            allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS"],
            deny: []
        },
        {
            id: SECURITY_ROLE,
            allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "STREAM"],
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
}