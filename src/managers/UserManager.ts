import { CommonRegex } from "../constants/CommonRegex";
import { Collection, Guild, GuildMember, Role, User } from "discord.js";
import { GuildFgrUtilities } from "../utilities/fetch-get-request/GuildFgrUtilities";
import { MongoManager } from "./MongoManager";
import { IGuildInfo, IIdNameInfo, IUserInfo } from "../definitions";
import { GlobalFgrUtilities } from "../utilities/fetch-get-request/GlobalFgrUtilities";
import { PermsConstants } from "../constants/PermsConstants";
import { DefinedRole } from "../definitions/Types";

export interface IResolvedMember {
    member: GuildMember;
    idNameDoc: IIdNameInfo | null;
    userDoc: IUserInfo | null;
}

interface IResolvedUser {
    user: User;
    idNameDoc: IIdNameInfo | null;
}

export namespace UserManager {
    /**
     * Resolves a user.
     * @param {string} userResolvable The user resolvable. This can either be an ID, mention, or IGN.
     * @returns {Promise<IResolvedUser | null>} The resolved user, if found.
     */
    export async function resolveUser(userResolvable: string): Promise<IResolvedUser | null> {
        /**
         * Gets the user object and corresponding document from the database.
         * @param {string} id The ID.
         * @returns {Promise<IResolvedUser | null>} The resolved user, if any.
         */
        async function getUserFromId(id: string): Promise<IResolvedUser | null> {
            console.assert(CommonRegex.ONLY_NUMBERS.test(id));
            const user = await GlobalFgrUtilities.fetchUser(id);
            const docs = await MongoManager.findIdInIdNameCollection(id);
            return user ? {
                user,
                idNameDoc: docs.length === 0 ? null : docs[0]
            } : null;
        }

        // ID
        if (CommonRegex.ONLY_NUMBERS.test(userResolvable)) {
            return getUserFromId(userResolvable);
        }

        // Mention
        if (CommonRegex.USER_MENTION.test(userResolvable)) {
            const parsedMention = userResolvable.match(CommonRegex.USER_MENTION);
            if (!parsedMention) {
                return null;
            }

            return getUserFromId(parsedMention[1]);
        }

        // IGN
        if (CommonRegex.ONLY_LETTERS.test(userResolvable)) {
            const possDocs = await MongoManager.findNameInIdNameCollection(userResolvable);
            if (possDocs.length === 0) {
                return null;
            }

            const doc = possDocs[0];
            const user = await GlobalFgrUtilities.fetchUser(doc.currentDiscordId);
            return user ? { user, idNameDoc: doc } : null;
        }

        // No other choices.
        return null;
    }

    /**
     * Attempts to resolve an IGN, Discord ID, or mention.
     * @param {Guild} guild The guild.
     * @param {string} memberResolvable The member resolvable. This can either be an ID, mention, or IGN.
     * @param {boolean} [checkDb] Whether to check the database. If true, this will check the database for the
     * specified IGN.
     * @returns {Promise<IResolvedMember | null>} The member + other relevant information, if any. `null` if no such
     * member was found.
     */
    export async function resolveMember(guild: Guild, memberResolvable: string,
                                        checkDb: boolean = true): Promise<IResolvedMember | null> {
        async function getMemberFromId(idToUse: string): Promise<GuildMember | null> {
            // If cached, then use that
            const cachedMember = GuildFgrUtilities.getCachedMember(guild, idToUse);
            if (cachedMember)
                return cachedMember;

            return GuildFgrUtilities.fetchGuildMember(guild, idToUse);
        }

        // m can be of type GuildMember or a member ID.
        function getDocs(m: GuildMember | string): Promise<[IIdNameInfo[], IUserInfo[]]> {
            return Promise.all([
                MongoManager.findIdInIdNameCollection(typeof m === "string" ? m : m.id),
                MongoManager.getUserDoc(typeof m === "string" ? m : m.id)
            ]);
        }

        let member: GuildMember | null = null;
        let idUserDoc: IIdNameInfo | null = null;

        // Snowflake = Discord ID
        if (CommonRegex.ONLY_NUMBERS.test(memberResolvable)) {
            member = await getMemberFromId(memberResolvable);
            if (!member && checkDb) {
                const doc = await MongoManager.findIdInIdNameCollection(memberResolvable);
                if (doc.length > 0) idUserDoc = doc[0];
            }
        }
        // All letters = name
        else if (CommonRegex.ONLY_LETTERS.test(memberResolvable)) {
            const searchRes = await guild.members.search({
                query: memberResolvable,
                limit: 10
            });

            const memberRes = searchRes
                .find(x => UserManager.getAllNames(x.displayName, true)
                    .some(y => y === memberResolvable.toLowerCase()));

            if (memberRes) {
                member = memberRes;
            }
            else if (checkDb) {
                const doc = await MongoManager.findNameInIdNameCollection(memberResolvable);
                if (doc.length > 0) idUserDoc = doc[0];
            }
        }
        // Otherwise, it's a mention
        else {
            const parsedMention = memberResolvable.match(CommonRegex.USER_MENTION);
            if (!parsedMention)
                return null;
            member = await getMemberFromId(parsedMention[1]);
        }

        if (!checkDb) {
            return member ? {
                member: member,
                idNameDoc: null,
                userDoc: null
            } : null;
        }


        if (member) {
            const [idNameDocs, userDocs] = await getDocs(member.id);
            return {
                member: member,
                userDoc: userDocs.length === 0 ? null : userDocs[0],
                idNameDoc: idNameDocs.length === 0 ? null : idNameDocs[0]
            };
        }

        if (!idUserDoc)
            return null;

        member = await getMemberFromId(idUserDoc.currentDiscordId);
        if (!member)
            return null;

        const [pIdNameDocs, pUserDocs] = await getDocs(member.id);
        return {
            member: member,
            userDoc: pUserDocs.length === 0 ? null : pUserDocs[0],
            idNameDoc: pIdNameDocs.length === 0 ? null : pIdNameDocs[0]
        };
    }

    /**
     * Gets this person's prefixes. For example, if the name was "!test" then this would return '!'
     * @param {string} rawName The name.
     * @returns {string} The prefixes, if any.
     */
    export function getPrefix(rawName: string): string {
        let p = "";
        for (const c of rawName) {
            if (CommonRegex.ONLY_LETTERS.test(c) || c === "|" || c === " ") {
                break;
            }

            p += c;
        }

        return p;
    }

    /**
     * Gets all names from a raw name. This will automatically remove any symbols.
     * @param {string} rawName The raw name.
     * @param {string} [allLower] Whether the result of this function should be an array of all names, in lowercase.
     * @returns {string[]} All names.
     */
    export function getAllNames(rawName: string, allLower: boolean = false): string[] {
        const parsedNames: string[] = [];
        const allNames = (allLower ? rawName.toLowerCase() : rawName).split("|")
            .map(x => x.trim())
            .filter(x => x.length !== 0);

        for (const n of allNames) {
            const nameSplit = n.split("");
            // Trim left side of name
            while (nameSplit.length > 0) {
                // is letter
                if (nameSplit[0].toLowerCase() !== nameSplit[0].toUpperCase())
                    break;
                nameSplit.shift();
            }

            // Trim right side of name
            while (nameSplit.length > 0) {
                // is letter
                if (nameSplit[nameSplit.length - 1].toLowerCase() !== nameSplit[nameSplit.length - 1].toUpperCase())
                    break;
                nameSplit.pop();
            }

            const nameJoined = nameSplit.join("");
            if (CommonRegex.ONLY_LETTERS.test(nameJoined))
                parsedNames.push(nameJoined);
        }

        return parsedNames;
    }


    /**
     * Whether the given name is valid or not.
     *
     * @param {string} name The name to check.
     * @returns {boolean} Whether the name is valid.
     */
    export function isValidRealmName(name: string): boolean {
        if (name.length > 14 || name.length === 0)
            return false;

        // only letters
        return CommonRegex.ONLY_LETTERS.test(name);
    }

    /**
     * For each member with the specified role, adds or removes the Team role from their profile.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {Role} role The role.
     * @param {"add" | "remove"} addType Whether the role was added to, or removed from, the list of all custom staff
     * roles.
     */
    export function updateStaffRolesForRole(guildDoc: IGuildInfo, role: Role, addType: "add" | "remove"): void {
        const teamRole = GuildFgrUtilities.getCachedRole(role.guild, guildDoc.roles.staffRoles.teamRoleId);
        if (!teamRole) {
            return;
        }

        // Add case is very simple
        if (addType === "add") {
            for (const [, member] of role.members) {
                if (GuildFgrUtilities.memberHasCachedRole(member, teamRole.id)) {
                    continue;
                }

                GlobalFgrUtilities.tryExecuteAsync(async () => {
                    await member.roles.add(teamRole, "Member has staff role.");
                }).then();
            }

            return;
        }

        // Remove case is slightly more complicated
        const genStaffRoles = getAllStaffRoles(guildDoc);
        const customStaffRoles = guildDoc.roles.staffRoles.otherStaffRoleIds.slice();
        const idx = customStaffRoles.indexOf(role.id);
        if (idx !== -1) {
            customStaffRoles.splice(idx, 1);
        }

        // Note that role.members is cached
        main: for (const [, member] of role.members) {
            for (const [, roles] of genStaffRoles) {
                // If the member has an existing staff role, then don't need to do any further checks, and can move
                // to next member
                if (roles.some(x => GuildFgrUtilities.memberHasCachedRole(member, x))) {
                    continue main;
                }
            }

            // If the member has a some other defined staff role, then again don't need to do any further checks.
            if (customStaffRoles.some(x => GuildFgrUtilities.memberHasCachedRole(member, x))) {
                continue;
            }

            // Otherwise, remove the role
            if (!GuildFgrUtilities.memberHasCachedRole(member, teamRole.id)) {
                continue;
            }

            GlobalFgrUtilities.tryExecuteAsync(async () => {
                await member.roles.remove(teamRole, "Member no longer has staff role.");
            }).then();
        }
    }

    /**
     * Gets all staff roles (excluding custom staff roles).
     * @param {IGuildInfo} guildDoc The guild document.
     * @returns {Collection<DefinedRole, string[]>} The collection of all staff roles.
     * @private
     */
    function getAllStaffRoles(guildDoc: IGuildInfo): Collection<DefinedRole, string[]> {
        const allRoles = MongoManager.getAllConfiguredRoles(guildDoc);
        allRoles.delete(PermsConstants.EVERYONE_ROLE);
        allRoles.delete(PermsConstants.SUSPENDED_ROLE);
        allRoles.delete(PermsConstants.MEMBER_ROLE);
        allRoles.delete(PermsConstants.TEAM_ROLE);
        return allRoles;
    }

    /**
     * Either adds the Team role to the member, or removes the Team role from the member, depending on what role was
     * added.
     * @param {GuildMember} member The member.
     * @param {IGuildInfo} guildDoc The guild document.
     */
    export function updateStaffRolesForMember(member: GuildMember, guildDoc: IGuildInfo): void {
        const teamRole = GuildFgrUtilities.getCachedRole(member.guild, guildDoc.roles.staffRoles.teamRoleId);
        if (!teamRole) {
            return;
        }

        const genStaffRoles = getAllStaffRoles(guildDoc);
        const tryAddRole = (roleId: string): boolean => {
            if (!GuildFgrUtilities.memberHasCachedRole(member, roleId)) {
                return false;
            }

            if (!GuildFgrUtilities.memberHasCachedRole(member, teamRole.id)) {
                GlobalFgrUtilities.tryExecuteAsync(async () => {
                    await member.roles.add(teamRole, "Member has staff role.");
                }).then();
            }

            return true;
        };

        for (const [, roles] of genStaffRoles) {
            if (roles.some(x => tryAddRole(x))) {
                return;
            }
        }

        if (guildDoc.roles.staffRoles.otherStaffRoleIds.some(x => tryAddRole(x))) {
            return;
        }

        // At this point, they don't have any staff roles
        if (!GuildFgrUtilities.memberHasCachedRole(member, teamRole.id)) {
            return;
        }

        GlobalFgrUtilities.tryExecuteAsync(async () => {
            await member.roles.remove(teamRole, "Member no longer has staff role.");
        }).then();
    }
}