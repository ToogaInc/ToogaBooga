import {PermissionString} from "discord.js";

export interface ICmdPermOverwrite {
    useDefaultRolePerms: boolean;
    rolePermsNeeded: string[];
    useDefaultServerPerms: boolean;
    serverPermsNeeded: PermissionString[];
}