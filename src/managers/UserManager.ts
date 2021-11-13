import {CommonRegex} from "../constants/CommonRegex";
import {Guild, GuildMember} from "discord.js";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {MongoManager} from "./MongoManager";
import {IIdNameInfo, IUserInfo} from "../definitions";

interface IResolvedMember {
    member: GuildMember;
    idNameDoc: IIdNameInfo | null;
    userDoc: IUserInfo | null;
}

export namespace UserManager {

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
}