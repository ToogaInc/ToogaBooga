import {Collection as MCollection, FilterQuery, MongoClient, ObjectID, UpdateQuery} from "mongodb";
import {OneLifeBot} from "../OneLifeBot";
import {GeneralConstants} from "../constants/GeneralConstants";
import {UserManager} from "./UserManager";
import {GuildMember, Collection as DCollection} from "discord.js";
import {DUNGEON_DATA} from "../constants/DungeonData";
import {
    BypassFullVcOption, IBotInfo, IGuildInfo,
    IIdNameInfo,
    IPermAllowDeny,
    IPropertyKeyValuePair,
    ISectionInfo,
    IUserInfo
} from "../definitions";

export namespace MongoManager {
    export const CachedGuildCollection: DCollection<string, IGuildInfo> = new DCollection<string, IGuildInfo>();

    let ThisMongoClient: MongoClient | null = null;
    let UserCollection: MCollection<IUserInfo> | null = null;
    let GuildCollection: MCollection<IGuildInfo> | null = null;
    let BotCollection: MCollection<IBotInfo> | null = null;
    let IdNameCollection: MCollection<IIdNameInfo> | null = null;

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
     * @return {MCollection<IGuildInfo>} The guild collection.
     * @throws {ReferenceError} If the program isn't connected to the MongoDB instance.
     */
    export function getGuildCollection(): MCollection<IGuildInfo> {
        if (GuildCollection === null || ThisMongoClient === null || !ThisMongoClient.isConnected())
            throw new ReferenceError("GuildCollection null. Use connect method first.");

        return GuildCollection;
    }

    /**
     * Gets the user collection, if the program is connected to Mongo.
     *
     * @return {MCollection<IGuildInfo>} The user collection.
     * @throws {ReferenceError} If the program isn't connected to the MongoDB instance.
     */
    export function getUserCollection(): MCollection<IUserInfo> {
        if (UserCollection === null || ThisMongoClient === null || !ThisMongoClient.isConnected())
            throw new ReferenceError("UserCollection null. Use connect method first.");

        return UserCollection;
    }

    /**
     * Gets the bot collection, if the program is connected to Mongo.
     * @return {MCollection<IBotInfo>} The bot collection.
     * @throws {ReferenceError} If the program isn't connected to the MongoDB instance.
     */
    export function getBotCollection(): MCollection<IBotInfo> {
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
            currentDiscordId: discordId
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

        const [idEntries, ignEntries] = await Promise.all([
            findIdInIdNameCollection(member.id),
            findNameInIdNameCollection(ign)]
        );

        // There are three cases to consider.
        // Case 1: No entries found.
        if (idEntries.length === 0 && ignEntries.length === 0) {
            await IdNameCollection.insertOne(getDefaultIdNameObj(member.id, ign));
            return;
        }

        // Case 2: ID found, IGN not.
        // In this case, we can simply push the name into the names array.
        if (idEntries.length > 0 && ignEntries.length === 0) {
            await IdNameCollection.updateOne({currentDiscordId: idEntries[0].currentDiscordId}, {
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
            const oldDiscordId = ignEntries[0].currentDiscordId;
            const oldDoc = await IdNameCollection.findOneAndUpdate({
                "rotmgNames.lowercaseIgn": ign.toLowerCase()
            }, {
                $set: {
                    currentDiscordId: member.id
                },
                $push: {
                    pastDiscordIds: {
                        oldId: oldDiscordId,
                        toDate: Date.now()
                    }
                }
            }, {returnDocument: "before"});

            // Also update the user collection.
            if (oldDoc.value) {
                await getUserCollection().updateOne({discordId: oldDoc.value.currentDiscordId}, {
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

            if (entry.currentDiscordId !== member.id)
                newObj.pastDiscordIds.push({oldId: entry.currentDiscordId, toDate: Date.now()});

            newObj.pastRealmNames.push(...entry.pastRealmNames);
            newObj.pastDiscordIds.push(...entry.pastDiscordIds);
        }

        await IdNameCollection.deleteMany({
            $or: [
                {
                    currentDiscordId: {
                        $in: allEntries.map(x => x.currentDiscordId)
                    }
                },
                {
                    "rotmgNames.lowercaseIgn": {
                        $in: allEntries.flatMap(x => x.rotmgNames.flatMap(y => y.lowercaseIgn))
                    }
                }
            ]
        });
        await IdNameCollection.insertOne(newObj);

        // And now create a new User document.
        const filterQuery: FilterQuery<IUserInfo>[] = [];
        const searchedIds = new Set<string>();
        for (const entry of allEntries) {
            if (searchedIds.has(entry.currentDiscordId))
                continue;

            filterQuery.push({
                discordId: entry.currentDiscordId
            });
            searchedIds.add(entry.currentDiscordId);
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
            /*
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
            }*/
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
            manualVerificationEntries: [],
            channels: {
                botUpdatesChannelId: "",
                modmail: {
                    modmailChannelId: "",
                    modmailStorageChannelId: ""
                },
                raids: {
                    afkCheckChannelId: "",
                    controlPanelChannelId: "",
                    rateLeaderChannel: ""
                },
                verification: {
                    verificationChannelId: "",
                    manualVerificationChannelId: ""
                },
                loggingChannels: []
            },
            guildId: guildId,
            guildSections: [],
            moderation: {blacklistedUsers: [], suspendedUsers: [], blacklistedModmailUsers: []},
            otherMajorConfig: {
                verificationProperties: {
                    checkRequirements: true,
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
                    vcLimit: {
                        allowEdit: true,
                        value: 60
                    },
                    nitroEarlyLocationLimit: 5,
                    additionalAfkCheckInfo: "",
                    afkCheckTimeout: 30 * 60 * 1000,
                    bypassFullVcOption: BypassFullVcOption.KeysAndPriority,
                    afkCheckPermissions: generalAfkCheckPerms,
                    prePostAfkCheckPermissions: prePostAfkCheckPerms,
                    allowedDungeons: DUNGEON_DATA.map(x => x.codeName),
                    earlyLocConfirmMsg: "You must bring the class/gear choice that you indicated you would bring."
                        + " Failure to do so may result in consequences. Additionally, do not share this location"
                        + " with anyone else."
                }
            },
            properties: {
                blockedCommands: [],
                modmailThreads: [],
                customCmdPermissions: [],
                customDungeons: [],
                dungeonOverride: [],
                customReactions: [],
                approvedCustomImages: [],
                approvedCustomEmojiIds: [],
                genEarlyLocReactions: []
            },
            roles: {
                mutedRoleId: "",
                staffRoles: {
                    moderation: {moderatorRoleId: "", officerRoleId: "", securityRoleId: ""},
                    otherStaffRoleIds: [],
                    sectionLeaderRoleIds: {
                        sectionAlmostLeaderRoleId: "",
                        sectionLeaderRoleId: "",
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
            },
            prefix: OneLifeBot.BotInstance.config.misc.defaultPrefix
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
            details: {moderationHistory: [], universalNotes: "", guildNotes: []},
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
            currentDiscordId: userId,
            pastDiscordIds: [],
            pastRealmNames: []
        };
    }

    /**
     * Gets a guild document or creates a new one if it doesn't exist.
     * @param {string} guildId The guild ID.
     * @param {boolean} [checkCached] Whether to check cache for the guild document..
     * @return {Promise<IGuildInfo>} The guild document.
     * @throws {Error} If adding a new guild document is not possible.
     */
    export async function getOrCreateGuildDoc(guildId: string, checkCached: boolean = false): Promise<IGuildInfo> {
        if (checkCached && CachedGuildCollection.has(guildId)) {
            return CachedGuildCollection.get(guildId)!;
        }

        const docs = await getGuildCollection().find({guildId: guildId}).toArray();
        if (docs.length === 0) {
            const insertRes = await getGuildCollection().insertOne(getDefaultGuildConfig(guildId));
            if (insertRes.ops.length > 0) {
                CachedGuildCollection.set(guildId, insertRes.ops[0]);
                return insertRes.ops[0];
            }

            throw new Error(`Insert failed: ${guildId}`);
        }

        CachedGuildCollection.set(guildId, docs[0]);
        return docs[0];
    }

    /**
     * Equivalent to `findOneAndUpdate`, but this provides a cleaner way to get the guild document. This
     * will automatically set `returnDocument` to `true`. Additionally, this updates the cached guild document.
     * @param {FilterQuery<IGuildInfo>} filter The filter query.
     * @param {UpdateQuery<IGuildInfo>} update The update query.
     * @return {Promise<IGuildInfo>} The new guild document.
     */
    export async function updateAndFetchGuildDoc(filter: FilterQuery<IGuildInfo>,
                                                 update: UpdateQuery<IGuildInfo>): Promise<IGuildInfo> {
        const res = await getGuildCollection().findOneAndUpdate(filter, update, {
           returnDocument: "after"
        });

        if (!res.value) {
            throw new Error("Something went wrong when trying to update the guild document.");
        }

        CachedGuildCollection.set(res.value.guildId, res.value);
        return res.value;
    }

    /**
     * Validates that a field exists in a guild document. If the field does exist, nothing happens. Otherwise, the
     * field is set with the specified default value. Make sure to update the cache manually.
     * @param {string} guildId The guild ID.
     * @param {string} property The field, or property, to check.
     * @param {T} defaultValue The default value if the field doesn't exist.
     */
    export async function validateGuildField<T>(guildId: string, property: string, defaultValue: T): Promise<void> {
        await getGuildCollection().updateOne({
            guildId: guildId,
            [property]: {$exists: false}
        }, {
            $set: {
                [property]: defaultValue
            }
        });
    }

    /**
     * Returns a section object representing the main section.
     * @param {IGuildInfo} guildDoc The guild document.
     * @returns {ISectionInfo} The section.
     */
    export function getMainSection(guildDoc: IGuildInfo): ISectionInfo {
        return {
            channels: {
                loggingChannels: [],
                raids: guildDoc.channels.raids,
                verification: guildDoc.channels.verification
            },
            isMainSection: true,
            otherMajorConfig: guildDoc.otherMajorConfig,
            moderation: {
                sectionSuspended: []
            },
            roles: {
                leaders: guildDoc.roles.staffRoles.sectionLeaderRoleIds,
                verifiedRoleId: guildDoc.roles.verifiedRoleId
            },
            properties: {
                giveVerifiedRoleUponUnsuspend: true
            },
            sectionName: "Main",
            uniqueIdentifier: "MAIN",
            manualVerificationEntries: guildDoc.manualVerificationEntries
        };
    }

    /**
     * Returns an array containing all sections. In particular, this function will give you a section representation
     * of the main section.
     * @param {IGuildInfo} guildDoc The guild document.
     * @return {ISectionInfo[]} The array of main + other sections in this server.
     */
    export function getAllSections(guildDoc: IGuildInfo): ISectionInfo[] {
        const sections: ISectionInfo[] = [];
        // The main section
        sections.push(getMainSection(guildDoc));
        // Custom sections
        sections.push(...guildDoc.guildSections);
        return sections;
    }
}