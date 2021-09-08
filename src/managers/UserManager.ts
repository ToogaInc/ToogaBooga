import {CommonRegex} from "../constants/CommonRegex";
import {Guild, GuildMember} from "discord.js";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {MongoManager} from "./MongoManager";

export namespace UserManager {

    /**
     * Attempts to resolve an IGN, Discord ID, or mention.
     * @param {Guild} guild The guild.
     * @param {string} memberResolvable The member resolvable.
     * @returns {Promise<GuildMember | null>} The member, if any. `null` if no such member was found.
     */
    export async function resolveMember(guild: Guild, memberResolvable: string): Promise<GuildMember | null> {
        async function getMemberFromId(idToUse: string): Promise<GuildMember | null> {
            // If cached, then use that
            const cachedMember = GuildFgrUtilities.getCachedMember(guild, idToUse);
            if (cachedMember)
                return cachedMember;

            return GuildFgrUtilities.fetchGuildMember(guild, idToUse);
        }

        // Snowflake = Discord ID
        if (CommonRegex.ONLY_NUMBERS.test(memberResolvable)) {
            return getMemberFromId(memberResolvable);
        }

        // All letters = name
        if (CommonRegex.ONLY_LETTERS.test(memberResolvable)) {
            const searchRes = await guild.members.search({
                query: memberResolvable,
                limit: 10
            });

            const memberRes = searchRes
                .find(x => UserManager.getAllNames(x.displayName, true)
                    .some(y => y === memberResolvable.toLowerCase()));
            if (memberRes)
                return memberRes;

            // Find via db so we can get the associated ID
            const idNameDocs = await MongoManager.findNameInIdNameCollection(memberResolvable);
            if (idNameDocs.length === 0)
                return null;

            return getMemberFromId(idNameDocs[0].currentDiscordId);
        }

        // Otherwise, it's a mention
        const parsedMention = memberResolvable.match(CommonRegex.USER_MENTION);
        if (!parsedMention)
            return null;

        return getMemberFromId(parsedMention[1]);
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