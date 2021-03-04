import {PermissionResolvable} from "discord.js";

export interface IPermAllowDeny {
    allow: PermissionResolvable[];
    deny: PermissionResolvable[];
}