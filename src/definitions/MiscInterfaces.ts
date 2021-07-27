import {PermissionResolvable, PermissionString} from "discord.js";

export interface IQuotaLoggingInfo {
    userId: string;
    amt: number;
}

export interface IPermAllowDeny {
    allow: PermissionResolvable[];
    deny: PermissionResolvable[];
}

export interface IPropertyKeyValuePair<K, V> {
    key: K;
    value: V;
}

export interface ICmdPermOverwrite {
    useDefaultRolePerms: boolean;
    rolePermsNeeded: string[];
    useDefaultServerPerms: boolean;
    serverPermsNeeded: PermissionString[];
}