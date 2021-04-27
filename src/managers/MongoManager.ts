import {Collection, FilterQuery, MongoClient, ObjectID} from "mongodb";
import {IUserInfo} from "../definitions/major/IUserInfo";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {IBotInfo} from "../definitions/major/IBotInfo";
import {OneRealmBot} from "../OneRealmBot";
import {GeneralConstants} from "../constants/GeneralConstants";
import {IPropertyKeyValuePair} from "../definitions/IPropertyKeyValuePair";
import {IPermAllowDeny} from "../definitions/major/IPermAllowDeny";
import {IIdNameInfo} from "../definitions/major/IIdNameInfo";
import {UserManager} from "./UserManager";
import {GuildMember} from "discord.js";

export namespace MongoManager {
    let ThisMongoClient: MongoClient | null = null;
    let UserCollection: Collection<IUserInfo> | null = null;
    let GuildCollection: Collection<IGuildInfo> | null = null;
    let BotCollection: Collection<IBotInfo> | null = null;
    let IdNameCollection: Collection<IIdNameInfo> | null = null;

    interface IDbConfiguration {
        dbUrl: string;
        dbName: string;
        guildColName: string;
        userColName: string;
        botColName: string;
        idNameColName: string;
    }

    /**
     * Whether the program is connected to MongoDB.
     *
     * @return {boolean} Whether the program is connected to MongoDB.
     */
    export function isConnected(): boolean {
        return ThisMongoClient !== null && ThisMongoClient.isConnected();
    }

    /**
     * Gets the Mongo client, if connected.
     *
     * @returns {MongoClient} The client.
     * @throws {ReferenceError} If the program isn't connected to the MongoDB instance.
     */
    export function getMongoClient(): MongoClient {
        if (ThisMongoClient === null || !ThisMongoClient.isConnected())
            throw new ReferenceError("MongoClient null. Use connect method first.");

        return ThisMongoClient;
    }

    /**
     * Gets the guild collection, if the program is connected to Mongo.
     *
     * @return {Collection<IGuildInfo>} The guild collection.
     * @throws {ReferenceError} If the program isn't connected to the MongoDB instance.
     */
    export function getGuildCollection(): Collection<IGuildInfo> {
        if (GuildCollection === null || ThisMongoClient === null || !ThisMongoClient.isConnected())
            throw new ReferenceError("GuildCollection null. Use connect method first.");

        return GuildCollection;
    }

    /**
     * Gets the user collection, if the program is connected to Mongo.
     *
     * @return {Collection<IGuildInfo>} The user collection.
     * @throws {ReferenceError} If the program isn't connected to the MongoDB instance.
     */
    export function getUserCollection(): Collection<IUserInfo> {
        if (UserCollection === null || ThisMongoClient === null || !ThisMongoClient.isConnected())
            throw new ReferenceError("UserCollection null. Use connect method first.");

        return UserCollection;
    }

    /**
     * Gets the bot collection, if the program is connected to Mongo.
     * @return {Collection<IBotInfo>} The bot collection.
     * @throws {ReferenceError} If the program isn't connected to the MongoDB instance.
     */
    export function getBotCollection(): Collection<IBotInfo> {
        if (BotCollection === null || ThisMongoClient === null || !ThisMongoClient.isConnected())
            throw new ReferenceError("BotCollection null.");

        return BotCollection;
    }

    /**
     * Connects to the MongoDB instance.
     *
     * @param {IDbConfiguration} config The Mongo configuration info.
     * @returns {Promise<boolean>} Whether the instance is connected.
     */
    export async function connect(config: IDbConfiguration): Promise<boolean> {
        if (ThisMongoClient && ThisMongoClient.isConnected())
            return true;

        const mongoDbClient: MongoClient = new MongoClient(config.dbUrl, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        ThisMongoClient = await mongoDbClient.connect();
        UserCollection = ThisMongoClient
            .db(config.dbName)
            .collection<IUserInfo>(config.userColName);
        GuildCollection = ThisMongoClient
            .db(config.dbName)
            .collection<IGuildInfo>(config.guildColName);
        BotCollection = ThisMongoClient
            .db(config.dbName)
            .collection<IBotInfo>(config.botColName);
        IdNameCollection = ThisMongoClient
            .db(config.idNameColName)
            .collection<IIdNameInfo>(config.idNameColName);
        return true;
    }

    /**
     * Finds any user documents that contains the given name.
     *
     * @param {string} name The name to search up.
     * @returns {Array<IUserInfo[]>} The search results.
     * @throws {ReferenceError} If the Mongo instance isn't connected.
     */
    export async function getUserDb(name: string): Promise<IUserInfo[]> {
        if (UserCollection === null)
            throw new ReferenceError("UserCollection null. Use connect method first.");

        if (!UserManager.isValidRealmName(name))
            return [];

        return await UserCollection.find({
            "rotmgNames.lowercaseIgn": name.toLowerCase()
        }).toArray();
    }

    /**
     * Finds any user documents that contains the given ID. This should be preferred over `getUserDb` as anyone
     * that verifies through the bot will have an entry.
     *
     * @param {string} discordId The Discord ID to search up.
     * @returns {Array<IIdNameInfo[]>} The search results.
     * @throws {ReferenceError} If the Mongo instance isn't connected.
     */
    export async function findIdInIdNameCollection(discordId: string): Promise<IIdNameInfo[]> {
        if (IdNameCollection === null)
            throw new ReferenceError("IDNameCollection null. Use connect method first.");

        return await IdNameCollection.find({
            discordId: discordId
        }).toArray();
    }

    /**
     * Finds a name in the IDName collection.
     * @param {string} name The name to look for.
     * @return {Promise<IIdNameInfo[]>} The results, if any.
     * @throws {ReferenceError} If the Mongo instance isn't connected.
     */
    export async function findNameInIdNameCollection(name: string): Promise<IIdNameInfo[]> {
        if (IdNameCollection === null)
            throw new ReferenceError("IDNameCollection null. Use connect method first.");

        return await IdNameCollection.find({
            "rotmgNames.lowercaseIgn": name.toLowerCase()
        }).toArray();
    }

    /**
     * Adds the specified name and ID to the IDName collection. This will take care of any potential duplicate
     * entries that may exist in both IDNameCollection and UserCollection.
     * @param {GuildMember} member The member.
     * @param {string} ign The in-game name.
     * @throws {ReferenceError} If the Mongo instance isn't connected.
     */
    export async function addIdNameToTheCollection(member: GuildMember, ign: string): Promise<void> {
        if (IdNameCollection === null)
            throw new ReferenceError("IDNameCollection null. Use connect method first.");

        const idEntries = await findIdInIdNameCollection(member.id);
        const ignEntries = await findNameInIdNameCollection(ign);

        // There are three cases to consider.
        // Case 1: No entries found.
        if (idEntries.length === 0 && ignEntries.length === 0) {
            await IdNameCollection.insertOne(getDefaultIdNameObj(member.id, ign));
            return;
        }

        // Case 2: ID found, IGN not.
        if (idEntries.length > 0 && ignEntries.length === 0) {
            await IdNameCollection.updateOne({discordId: idEntries[0].discordId}, {
                $push: {
                    rotmgNames: {
                        lowercaseIgn: ign.toLowerCase(),
                        ign: ign
                    }
                }
            });
            return;
        }

        // Case 3: ID not found, IGN found.
        // In this case, we need to also modify the ID of the document found in the UserManager doc.
        if (idEntries.length === 0 && ignEntries.length > 0) {
            const oldDoc = await IdNameCollection.findOneAndUpdate({
                "rotmgNames.lowercaseIgn": ign.toLowerCase()
            }, {
                $set: {
                    discordId: member.id
                }
            }, {returnOriginal: true});

            if (oldDoc.value) {
                await getUserCollection().updateOne({discordId: oldDoc.value.discordId}, {
                    $set: {
                        discordId: member.id
                    }
                });
            }

            return;
        }

        // Case 4: ID and IGN found. In this case, we just merge the objects together.
        const newObj = getDefaultIdNameObj(member.id, ign);
        const allEntries: IIdNameInfo[] = [...idEntries, ...ignEntries];
        for (const entry of allEntries) {
            for (const name of entry.rotmgNames) {
                if (newObj.rotmgNames.some(x => x.lowercaseIgn === name.lowercaseIgn))
                    continue;
                newObj.rotmgNames.push({
                    lowercaseIgn: name.lowercaseIgn,
                    ign: name.ign
                });
            }
        }

        await IdNameCollection.deleteMany({
            $or: [
                {
                    discordId: {
                        $in: allEntries.map(x => x.discordId)
                    }
                },
                {
                    rotmgNames: {
                        $in: allEntries.map(x => x.rotmgNames)
                    }
                }
            ]
        });

        await IdNameCollection.insertOne(newObj);

        // And now create a new User document.
        const filterQuery: FilterQuery<IUserInfo>[] = [];
        const searchedIds = new Set<string>();
        for (const entry of allEntries) {
            if (searchedIds.has(entry.discordId))
                continue;

            filterQuery.push({
                discordId: entry.discordId
            });
            searchedIds.add(entry.discordId);
        }

        // Get all relevant documents.
        const foundDocs = await getUserCollection().find({
            $or: filterQuery
        }).toArray();

        const userDoc = getDefaultUserConfig(member.id, ign);
        // Copy all old values to the new document
        for (const doc of foundDocs) {
            // Copy all logged info to the user document.
            for (const loggedInfo of doc.loggedInfo) {
                const idx = userDoc.loggedInfo.findIndex(x => x.key === loggedInfo.key);
                if (idx === -1) {
                    userDoc.loggedInfo.push({
                        key: loggedInfo.key,
                        value: loggedInfo.value
                    });
                    continue;
                }

                userDoc.loggedInfo[idx].value += loggedInfo.value;
            }

            // Copy all punishment history
            for (const punishmentHist of doc.details.moderationHistory)
                userDoc.details.moderationHistory.push(punishmentHist);

            // Copy all settings
            for (const setting of doc.details.settings) {
                const idx = userDoc.details.settings.findIndex(x => x.key === setting.key);
                if (idx === -1) {
                    userDoc.details.settings.push({
                        key: setting.key,
                        value: setting.value
                    });
                    continue;
                }

                userDoc.details.settings[idx].value = setting.value;
            }
        }

        // Delete all old documents.
        await getUserCollection().deleteMany({
            $or: filterQuery
        });

        // And add the new user document.
        await getUserCollection().insertOne(userDoc);
    }

    /**
     * Gets the default guild configuration object.
     * @param {string} guildId The guild ID.
     * @return {IGuildInfo} The guild configuration object.
     */
    export function getDefaultGuildConfig(guildId: string): IGuildInfo {
        const prePostAfkCheckPerms: IPropertyKeyValuePair<string, IPermAllowDeny>[] = [];
        GeneralConstants.DEFAULT_AFK_CHECK_PERMISSIONS.forEach(permObj => {
            prePostAfkCheckPerms.push({key: permObj.id, value: {allow: permObj.allow, deny: permObj.deny}});
        });

        const generalAfkCheckPerms: IPropertyKeyValuePair<string, IPermAllowDeny>[] = [];
        const tempPerms = GeneralConstants.DEFAULT_AFK_CHECK_PERMISSIONS.slice();
        // Using .slice to make a copy of this array.
        // Get everyone role and allow people to connect
        tempPerms[0].deny = ["VIEW_CHANNEL", "SPEAK", "STREAM"];
        tempPerms.forEach(permObj => {
            generalAfkCheckPerms.push({key: permObj.id, value: {allow: permObj.allow, deny: permObj.deny}});
        });

        return {
            _id: new ObjectID(),
            activeRaids: [],
            customCmdPermissions: [],
            customDungeons: [],
            manualVerificationEntries: [],
            channels: {
                botUpdatesChannelId: "",
                manualVerificationChannelId: "",
                modmailChannels: {modmailChannelId: "", modmailLoggingId: "", modmailStorageChannelId: ""},
                quotaLogsChannelId: "",
                raidChannels: {
                    afkCheckChannelId: "",
                    controlPanelChannelId: "",
                    raidRequestChannel: "",
                    rateLeaderChannel: ""
                },
                verificationChannels: {
                    verificationChannelId: "",
                    verificationLogsChannelId: "",
                    verificationSuccessChannelId: "",
                    manualVerificationChannelId: ""
                },
                logging: {
                    suspensionLoggingChannelId: "",
                    blacklistLoggingChannelId: ""
                }
            },
            guildId: guildId,
            guildSections: [],
            moderation: {blacklistedUsers: [], suspendedUsers: [], blacklistedModmailUsers: []},
            otherMajorConfig: {
                verificationProperties: {
                    additionalVerificationInfo: "",
                    verificationSuccessMessage: "",
                    verificationRequirements: {
                        aliveFame: {
                            checkThis: false,
                            minFame: 0
                        },
                        guild: {
                            checkThis: false,
                            guildName: {
                                checkThis: false,
                                name: ""
                            },
                            guildRank: {
                                checkThis: false,
                                minRank: ""
                            },
                        },
                        lastSeen: {
                            mustBeHidden: false
                        },
                        rank: {
                            checkThis: false,
                            minRank: 0
                        },
                        characters: {
                            checkThis: false,
                            statsNeeded: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                            checkPastDeaths: true
                        },
                        exaltations: {
                            checkThis: false,
                            minimum: {
                                hp: 0,
                                mp: 0,
                                def: 0,
                                att: 0,
                                dex: 0,
                                spd: 0,
                                vit: 0,
                                wis: 0,
                            }
                        },
                        graveyardSummary: {
                            checkThis: false,
                            minimum: []
                        }
                    }
                },
                afkCheckProperties: {
                    vcLimit: 60,
                    nitroEarlyLocationLimit: 3,
                    additionalAfkCheckInfo: "",
                    removeKeyReactsDuringAfk: false,
                    afkCheckTimeout: 30 * 60 * 1000,
                    allowedDungeons: [],
                    dungeonReactionOverride: [],
                    defaultDungeon: "",
                    allowKeyReactsToBypassFullVc: true,
                    afkCheckPermissions: generalAfkCheckPerms,
                    prePostAfkCheckPermissions: prePostAfkCheckPerms
                }
            },
            properties: {
                promoteDemoteRules: [],
                quotasAndLogging: {
                    logging: {topKeysWeek: [], topKeysWeeklyMessageId: ""},
                    runsDone: {topRunsCompletedMessageId: "", topRunsCompletedWeek: []},
                    runsLed: {noRunsWeeklyMessageId: "", topRunsLedWeek: [], topRunsLedWeeklyMessageId: ""}
                },
                prefix: OneRealmBot.BotInstance.config.misc.defaultPrefix,
                blockedCommands: [],
                modmailThreads: []
            },
            roles: {
                earlyLocationRoles: [],
                mutedRoleId: "",
                staffRoles: {
                    moderation: {moderatorRoleId: "", officerRoleId: "", securityRoleId: ""},
                    otherStaffRoleIds: [],
                    sectionLeaderRoleIds: {
                        sectionAlmostRaidLeaderRoleId: "",
                        sectionRaidLeaderRoleId: "",
                        sectionHeadLeaderRoleId: "",
                        sectionVetLeaderRoleId: ""
                    },
                    teamRoleId: "",
                    universalLeaderRoleIds: {
                        almostLeaderRoleId: "",
                        headLeaderRoleId: "",
                        leaderRoleId: "",
                        vetLeaderRoleId: ""
                    },
                },
                suspendedRoleId: "",
                verifiedRoleId: ""
            }
        };
    }

    /**
     * Gets the default user configuration object.
     * @param {string} userId The person's Discord ID.
     * @param {string} [ign] The IGN of the person, if any.
     * @return {IUserInfo} The user configuration object.
     */
    export function getDefaultUserConfig(userId: string, ign?: string): IUserInfo {
        return {
            _id: new ObjectID(),
            details: {moderationHistory: [], settings: []},
            discordId: userId,
            loggedInfo: []
        };
    }

    /**
     * Gets the default basic user configuration object.
     * @param {string} userId The person's Discord ID.
     * @param {string} ign The IGN of the person.
     * @return {IIdNameInfo} The basic user configuration object.
     */
    export function getDefaultIdNameObj(userId: string, ign: string): IIdNameInfo {
        return {
            _id: new ObjectID(),
            rotmgNames: [{lowercaseIgn: ign.toLowerCase(), ign: ign}],
            discordId: userId
        };
    }

    /**
     * Gets a guild document or creates a new one if it doesn't exist.
     * @param {string} guildId The guild ID.
     * @return {Promise<IGuildInfo>} The guild document.
     * @throws {Error} If adding a new guild document is not possible.
     */
    export async function getOrCreateGuildDb(guildId: string): Promise<IGuildInfo> {
        const docs = await getGuildCollection().find({guildId: guildId}).toArray();
        if (docs.length === 0) {
            const insertRes = await getGuildCollection().insertOne(getDefaultGuildConfig(guildId));
            if (insertRes.ops.length > 0)
                return insertRes.ops[0];
            throw new Error(`Insert failed: ${guildId}`);
        }
        return docs[0];
    }
}