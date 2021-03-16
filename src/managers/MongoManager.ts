import {Collection, MongoClient} from "mongodb";
import {IUserInfo} from "../definitions/major/IUserInfo";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {IBotInfo} from "../definitions/major/IBotInfo";
import {OneRealmBot} from "../OneRealmBot";
import {GeneralConstants} from "../constants/GeneralConstants";
import {IPropertyKeyValuePair} from "../definitions/IPropertyKeyValuePair";
import {IPermAllowDeny} from "../definitions/major/IPermAllowDeny";

export namespace MongoManager {
    let ThisMongoClient: MongoClient | null = null;
    let UserCollection: Collection<IUserInfo> | null = null;
    let GuildCollection: Collection<IGuildInfo> | null = null;
    let BotCollection: Collection<IBotInfo> | null = null;

    interface IDbConfiguration {
        dbUrl: string;
        dbName: string;
        guildColName: string;
        userColName: string;
        botColName: string;
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

        return true;
    }

    /**
     * Finds any user documents that contains the given name.
     *
     * @param {string} name The name to search up.
     * @returns {Array<IUserInfo>} The search results.
     * @throws {ReferenceError} If the Mongo instance isn't connected.
     */
    export async function getUserDb(name: string): Promise<IUserInfo[]> {
        if (UserCollection === null)
            throw new ReferenceError("UserCollection null. Use connect method first.");

        if (!isValidRealmName(name))
            return [];

        return await UserCollection.find({
            "rotmgNames.lowercaseIgn": name.toLowerCase()
        }).toArray();
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
        return /^[a-zA-Z]*$/.test(name);
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
            moderation: {blacklistedUsers: [], suspendedUsers: []},
            otherMajorConfig: {
                verificationProperties: {
                    showVerificationRequirements: true,
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
                            },
                            requireAll: false
                        },
                        graveyardSummary: {
                            checkThis: false,
                            minimum: {
                                minOryxKills: 0,
                                minLostHalls: 0,
                                minVoids: 0,
                                minCults: 0,
                                minNests: 0,
                                minShatters: 0,
                                minFungal: 0,
                                minCrystal: 0,
                            }
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
                quotasAndLogging: {
                    logging: {topKeysWeek: [], topKeysWeeklyMessageId: ""},
                    runsDone: {topRunsCompletedMessageId: "", topRunsCompletedWeek: []},
                    runsLed: {noRunsWeeklyMessageId: "", topRunsLedWeek: [], topRunsLedWeeklyMessageId: ""}
                },
                prefix: OneRealmBot.BotInstance.config.misc.defaultPrefix,
                blockedCommands: []
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
                        sectionHeadLeaderRoleId: ""
                    },
                    teamRoleId: "",
                    universalLeaderRoleIds: {almostLeaderRoleId: "", headLeaderRoleId: "", leaderRoleId: ""},
                },
                suspendedRoleId: "",
                verifiedRoleId: ""
            }
        };
    }

    /**
     * Gets the default user configuration object.
     * @param {string} ign The IGN of the person.
     * @param {string} userId The person's Discord ID.
     * @return {IGuildInfo} The user configuration object.
     */
    export function getDefaultUserConfig(ign: string, userId: string): IUserInfo {
        return {
            details: {moderationHistory: [], settings: []},
            discordUserId: userId,
            loggedInfo: [],
            rotmgNames: [{lowercaseIgn: ign.toLowerCase(), ign: ign}]
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