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

/**
 * An interface that represents a command permission override.
 */
export interface ICmdPermOverwrite {
    /**
     * Whether to use the default role permissions (defined by the developer).
     *
     * @type {boolean}
     */
    useDefaultRolePerms: boolean;

    /**
     * The role permissions needed to verify. Role permissions means roles like verified member, raid leader, or a
     * certain role.
     *
     * @type {string[]}
     */
    rolePermsNeeded: string[];

    /**
     * Whether to use the default server permissions.
     *
     * @type {boolean}
     */
    useDefaultServerPerms: boolean;

    /**
     * The server permissions needed to verify.
     *
     * @type {string[]}
     */
    serverPermsNeeded: PermissionString[];
}