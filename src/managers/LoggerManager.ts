import {Collection, GuildMember} from "discord.js";
import {MongoManager} from "./MongoManager";
import {FilterQuery, UpdateQuery} from "mongodb";
import {IUserInfo} from "../definitions";
import {MAPPED_AFK_CHECK_REACTIONS} from "../constants/MappedAfkCheckReactions";
import {DUNGEON_DATA} from "../constants/DungeonData";

export namespace LoggerManager {
    enum RunResult {
        Complete = "Completed",
        Failed = "Failed",
        Assist = "Assisted"
    }

    const KEY_IDS_TO_STORE: string[] = [
        "VIAL_OF_PURE_DARKNESS",
        "SHIELD_RUNE",
        "SWORD_RUNE",
        "HELM_RUNE",
        "LOST_HALLS_KEY",
        "NEST_KEY",
        "SHATTERS_KEY",
        "FUNGAL_CAVERN_KEY"
    ];

    interface IUserStats {
        /**
         * The keys that were used. The key for this collection is the guild ID; the value is a collection where the
         * key is the key name (not ID) and the value is the number popped.
         *
         * @type {Collection<string, Collection<string, number>>}
         */
        keyUse: Collection<string, Collection<string, number>>;

        /**
         * The dungeons that this person did. The key for this collection is the guild ID; the value is a collection
         * where the key is the dungeon name (not ID) and the value is the number completed/failed.
         */
        dungeonRuns: Collection<string, Collection<string, { completed: number; failed: number; }>>;

        /**
         * The dungeons that this person led. The key for this collection is the guild ID; the value is a collection
         * where the key is the dungeon name (not ID) and the value is the number completed/failed/assisted.
         */
        dungeonsLed: Collection<string, Collection<string, { completed: number; failed: number; assisted: number; }>>;
    }

    /**
     * Updates the user document with the specified log ID and the amount.
     * @param {GuildMember} member The member.
     * @param {string} id The ID, represented by the `key` property.
     * @param {number} amt The amount to log.
     * @private
     */
    async function internalUpdateLoggedInfo(member: GuildMember, id: string, amt: number): Promise<void> {
        const userDoc = await MongoManager.getOrCreateUserDoc(member.id);
        let filterQuery: FilterQuery<IUserInfo>;
        let updateQuery: UpdateQuery<IUserInfo>;
        if (userDoc.loggedInfo.some(x => x.key === id)) {
            filterQuery = {
                discordId: member.id,
                "loggedInfo.key": id
            };
            updateQuery = {
                $inc: {
                    "loggedInfo.$.value": amt
                }
            };
        }
        else {
            filterQuery = {discordId: member.id};
            updateQuery = {
                $push: {
                    loggedInfo: {
                        key: id,
                        value: amt
                    }
                }
            };
        }
        await MongoManager.getUserCollection().updateOne(filterQuery, updateQuery);
    }

    /**
     * Logs a key use into the user document.
     * @param {GuildMember} member The member.
     * @param {string | null} keyId The key ID, if any.
     * @param {number} amt The number of the specified key to add.
     */
    export async function logKeyUse(member: GuildMember, keyId: string | null, amt: number): Promise<void> {
        // Format:      K:GUILD_ID:KEY_ID:USE     For runes, vials, "bigger" keys.
        //              K:GUILD_ID:GENERAL:USE            For anything else.
        let key: string;
        if (keyId && KEY_IDS_TO_STORE.includes(keyId))
            key = `${member.guild.id}:${keyId}:USE`;
        else
            key = `${member.guild.id}:GENERAL:USE`;

        await internalUpdateLoggedInfo(member, key, amt);
    }

    /**
     * Logs a dungeon run into the user document.
     * @param {GuildMember} member The member.
     * @param {string} dungeonId The dungeon ID.
     * @param {boolean} completed Whether the dungeon was completed.
     * @param {number} [amt] The number of this dungeon that was either completed or failed.
     */
    export async function logDungeonRun(member: GuildMember, dungeonId: string, completed: boolean,
                                        amt: number = 1): Promise<void> {
        // Format:      R:GUILD_ID:DUNGEON_ID:COMPLETED(1/0)
        await internalUpdateLoggedInfo(member, `${member.guild.id}:${dungeonId}:${completed ? 1 : 0}`, amt);
    }

    /**
     * Logs the result of a dungeon raid.
     * @param {GuildMember} member The member.
     * @param {string} dungeonId The dungeon ID.
     * @param {RunResult} result The result of the raid.
     * @param {number} [amt] The number of this dungeon, with the specified result, that was done.
     */
    export async function logDungeonLead(member: GuildMember, dungeonId: string, result: RunResult,
                                         amt: number = 1): Promise<void> {
        // Format:      L:GUILD_ID:DUNGEON_ID:RESULT
        await internalUpdateLoggedInfo(member, `${member.guild.id}:${dungeonId}:${result}`, amt);
    }

    /**
     * Gets this person's stats.
     * @param {GuildMember} member The member.
     * @param {string} [guildId] The guild ID. If specified, this will only grab the stats associated with this guild.
     * @returns {Promise<LoggerManager.IUserStats | null>} The result, if any.
     */
    export async function getStats(member: GuildMember, guildId?: string): Promise<IUserStats | null> {
        const userDoc = await MongoManager.getOrCreateUserDoc(member.id);
        if (!userDoc)
            return null;

        const stats: IUserStats = {
            keyUse: new Collection<string, Collection<string, number>>(),
            dungeonsLed: new Collection<string, Collection<string, {
                completed: number;
                failed: number;
                assisted: number
            }>>(),
            dungeonRuns: new Collection<string, Collection<string, {
                completed: number;
                failed: number
            }>>()
        };

        const guildDoc = guildId
            ? await MongoManager.getOrCreateGuildDoc(guildId, true)
            : null;
        const logInfoToProcess = guildId
            ? userDoc.loggedInfo.filter(x => x.key.startsWith(guildId))
            : userDoc.loggedInfo;

        for (const {key, value} of logInfoToProcess) {
            // gId = guild ID
            // vId = value ID
            const [type, gId, vId, ...rest] = key.split(":");
            switch (type) {
                case "K": {
                    // K = Key flag
                    let keyName: string | null = null;
                    if (vId === "GENERAL")
                        keyName = "General";
                    else if (vId in MAPPED_AFK_CHECK_REACTIONS)
                        keyName = MAPPED_AFK_CHECK_REACTIONS[vId].name;
                    else {
                        const customKey = guildDoc?.properties.customReactions.find(x => x.key === vId);
                        if (customKey)
                            keyName = customKey.value.name;
                    }

                    if (!keyName)
                        break;

                    if (!stats.keyUse.has(gId))
                        stats.keyUse.set(gId, new Collection<string, number>());

                    if (stats.keyUse.get(gId)!.has(keyName))
                        stats.keyUse.get(gId)!.set(keyName, stats.keyUse.get(gId)!.get(keyName)! + value);
                    else
                        stats.keyUse.get(gId)!.set(keyName, value);

                    break;
                }
                case "L": {
                    // Lead dungeon flag
                    const dgnName = guildDoc?.properties.customDungeons.find(x => x.codeName === vId)?.dungeonName
                        ?? DUNGEON_DATA.find(x => x.codeName === vId)?.dungeonName
                        ?? null;

                    if (!dgnName)
                        break;

                    const [result,] = rest;

                    if (!stats.dungeonsLed.has(gId)) {
                        stats.dungeonsLed.set(gId, new Collection<string, {
                            completed: number;
                            failed: number;
                            assisted: number;
                        }>());
                    }

                    if (stats.dungeonsLed.get(gId)!.has(dgnName)) {
                        if (result === "Completed")
                            stats.dungeonsLed.get(gId)!.get(dgnName)!.completed += value;
                        else if (result === "Assisted")
                            stats.dungeonsLed.get(gId)!.get(dgnName)!.assisted += value;
                        else
                            stats.dungeonsLed.get(gId)!.get(dgnName)!.failed += value;
                    }
                    else {
                        if (result === "Completed")
                            stats.dungeonsLed.get(gId)!.set(dgnName, {completed: value, failed: 0, assisted: 0});
                        else if (result === "Assisted")
                            stats.dungeonsLed.get(gId)!.set(dgnName, {completed: 0, failed: 0, assisted: value});
                        else
                            stats.dungeonsLed.get(gId)!.set(dgnName, {completed: 0, failed: value, assisted: 0});
                    }

                    break;
                }
                case "R": {
                    // Dungeon raid flag
                    const dgnName = guildDoc?.properties.customDungeons.find(x => x.codeName === vId)?.dungeonName
                        ?? DUNGEON_DATA.find(x => x.codeName === vId)?.dungeonName
                        ?? null;

                    if (!dgnName)
                        break;

                    const result = Number.parseInt(rest[0], 10);
                    if (!result)
                        break;

                    if (!stats.dungeonRuns.has(gId)) {
                        stats.dungeonRuns.set(gId, new Collection<string, {
                            completed: number;
                            failed: number;
                        }>());
                    }

                    if (stats.dungeonRuns.get(gId)!.has(dgnName)) {
                        if (result === 0)
                            stats.dungeonRuns.get(gId)!.get(dgnName)!.failed += value;
                        else
                            stats.dungeonRuns.get(gId)!.get(dgnName)!.completed += value;
                    }
                    else {
                        if (result === 0)
                            stats.dungeonRuns.get(gId)!.set(dgnName, {completed: 0, failed: value});
                        else
                            stats.dungeonRuns.get(gId)!.set(dgnName, {completed: value, failed: 0});
                    }

                    break;
                }
            }
        }

        return stats;
    }
}