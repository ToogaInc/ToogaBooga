import {Collection as MCollection, FilterQuery, MongoClient, ObjectID, UpdateQuery} from "mongodb";
import {OneLifeBot} from "../OneLifeBot";
import {GeneralConstants} from "../constants/GeneralConstants";
import {UserManager} from "./UserManager";
import {Collection, Collection as DCollection, Guild, GuildMember, TextChannel} from "discord.js";
import {DUNGEON_DATA} from "../constants/DungeonData";
import {
    IBotInfo,
    IGuildInfo,
    IIdNameInfo, IOtherMajorConfig,
    IPermAllowDeny,
    IPropertyKeyValuePair,
    IPunishmentHistoryEntry,
    ISectionInfo,
    IUnclaimedBlacklistInfo,
    IUserInfo
} from "../definitions";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";
import {DefinedRole} from "../definitions/Types";
import {StringUtil} from "../utilities/StringUtilities";

export namespace MongoManager {
    export const CachedGuildCollection: DCollection<string, IGuildInfo> = new DCollection<string, IGuildInfo>();

    let ThisMongoClient: MongoClient | null = null;
    let UserCollection: MCollection<IUserInfo> | null = null;
    let GuildCollection: MCollection<IGuildInfo> | null = null;
    let BotCollection: MCollection<IBotInfo> | null = null;
    let IdNameCollection: MCollection<IIdNameInfo> | null = null;
    let UnclaimedBlacklistCollection: MCollection<IUnclaimedBlacklistInfo> | null = null;

    interface IDbConfiguration {
        dbUrl: string;
        dbName: string;
        guildColName: string;
        userColName: string;
        botColName: string;
        idNameColName: string;
        unclaimedBlName: string;
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
     * Gets the ID/name collection, if the program is connected to Mongo.
     *
     * @return {MCollection<IIdNameInfo>} The guild collection.
     * @throws {ReferenceError} If the program isn't connected to the MongoDB instance.
     */
    export function getIdNameCollection(): MCollection<IIdNameInfo> {
        if (IdNameCollection === null || ThisMongoClient === null || !ThisMongoClient.isConnected())
            throw new ReferenceError("IdNameCollection null. Use connect method first.");

        return IdNameCollection;
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
     * Gets the unclaimed blacklist collection, if the program is connected to Mongo.
     * @return {MCollection<UnclaimedBlacklistCollection>} The unclaimed blacklist collection.
     * @throws {ReferenceError} If the program isn't connected to the MongoDB instance.
     */
    export function getUnclaimedBlacklistCollection(): MCollection<IUnclaimedBlacklistInfo> {
        if (UnclaimedBlacklistCollection === null || ThisMongoClient === null || !ThisMongoClient.isConnected())
            throw new ReferenceError("UnclaimedBlacklistCollection null.");

        return UnclaimedBlacklistCollection;
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
            .db(config.dbName)
            .collection<IIdNameInfo>(config.idNameColName);
        UnclaimedBlacklistCollection = ThisMongoClient
            .db(config.dbName)
            .collection<IUnclaimedBlacklistInfo>(config.unclaimedBlName);
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

        if (foundDocs.length === 0)
            return;

        const userDoc = getDefaultUserConfig(member.id, ign);
        const allNotes: string[] = [];
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

            // Copy all notes
            allNotes.push(...doc.details.universalNotes);
            for (const note of doc.details.guildNotes) {
                const k = note.key;
                const v = note.value;
                const idx = userDoc.details.guildNotes.findIndex(x => x.key === k);
                if (idx === -1) {
                    userDoc.details.guildNotes.push({key: k, value: v});
                    continue;
                }

                userDoc.details.guildNotes[idx].value += "\n\n" + v;
            }
        }

        userDoc.details.universalNotes = allNotes.join("\n\n");

        // Delete all old documents.
        await getUserCollection().deleteMany({
            $or: filterQuery
        });

        // And add the new user document.
        await getUserCollection().insertOne(userDoc);
    }

    /**
     * Gets the other major configuration object.
     * @returns {IOtherMajorConfig} The other major configuration object.
     * @private
     */
    function getOtherMajorConfigObj(): IOtherMajorConfig {
        const generalAfkCheckPerms: IPropertyKeyValuePair<string, IPermAllowDeny>[] = [];
        GeneralConstants.DEFAULT_AFK_CHECK_PERMISSIONS.forEach(permObj => {
            generalAfkCheckPerms.push({key: permObj.id, value: {allow: permObj.allow, deny: permObj.deny}});
        });

        const prePostAfkCheckPerms: IPropertyKeyValuePair<string, IPermAllowDeny>[] = [];
        const tempPerms = GeneralConstants.DEFAULT_AFK_CHECK_PERMISSIONS.slice();
        // Using .slice to make a copy of this array.
        // Get everyone role and don't allow everyone to connect
        tempPerms[0].deny = ["VIEW_CHANNEL", "SPEAK", "STREAM"];
        tempPerms.forEach(permObj => {
            prePostAfkCheckPerms.push({key: permObj.id, value: {allow: permObj.allow, deny: permObj.deny}});
        });

        return {
            verificationProperties: {
                checkRequirements: true,
                additionalVerificationInfo: "",
                verificationSuccessMessage: "",
                verifReq: {
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
                            minRank: "",
                            exact: false
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
                        onOneChar: false,
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
                },
                evidenceWithManualVerif: {
                    allowEvidenceWithManualVerif: false,
                    messageToShow: ""
                },
                manualVerifyWhenOffline: {
                    allowManualVerifyWhenOffline: false,
                    messageToShow: ""
                }
            },
            afkCheckProperties: {
                pointUserLimit: 5,
                vcLimit: 60,
                nitroEarlyLocationLimit: 5,
                customMsg: {
                    additionalAfkCheckInfo: "",
                    earlyLocConfirmMsg: "You must bring the class/gear choice that you indicated you would bring."
                        + " Failure to do so may result in consequences. Additionally, do not share this location"
                        + " with anyone else.",
                    postAfkCheckInfo: ""
                },
                afkCheckTimeout: 30 * 60 * 1000,
                afkCheckPermissions: generalAfkCheckPerms,
                prePostAfkCheckPermissions: prePostAfkCheckPerms,
                allowedDungeons: DUNGEON_DATA.map(x => x.codeName)
            }
        };
    }

    /**
     * Gets the default guild configuration object.
     * @param {string} guildId The guild ID.
     * @return {IGuildInfo} The guild configuration object.
     */
    export function getDefaultGuildConfig(guildId: string): IGuildInfo {


        return {
            _id: new ObjectID(),
            activeRaids: [],
            manualVerificationEntries: [],
            channels: {
                storageChannelId: "",
                botUpdatesChannelId: "",
                modmailChannelId: "",
                raids: {
                    afkCheckChannelId: "",
                    controlPanelChannelId: "",
                    leaderFeedbackChannelId: ""
                },
                verification: {
                    verificationChannelId: "",
                    manualVerificationChannelId: ""
                },
                loggingChannels: []
            },
            guildId: guildId,
            guildSections: [],
            moderation: {blacklistedUsers: [], suspendedUsers: [], blacklistedModmailUsers: [], mutedUsers: []},
            otherMajorConfig: getOtherMajorConfigObj(),
            properties: {
                blockedCommands: [],
                modmailThreads: [],
                customCmdPermissions: [],
                customDungeons: [],
                dungeonOverride: [],
                customReactions: [],
                approvedCustomImages: [],
                approvedCustomEmojiIds: [],
                genEarlyLocReactions: [],
                reactionPoints: []
            },
            roles: {
                mutedRoleId: "",
                staffRoles: {
                    moderation: {helperRoleId: "", moderatorRoleId: "", officerRoleId: "", securityRoleId: ""},
                    otherStaffRoleIds: [],
                    sectionLeaderRoleIds: {
                        sectionAlmostLeaderRoleId: "",
                        sectionLeaderRoleId: "",
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
            quotas: {
                quotaInfo: [],
                resetTime: {
                    // Sunday at 12:00 AM
                    dayOfWeek: 0,
                    time: 0
                }
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
     * Gets the default section object.
     * @param {string} secName The section name.
     * @param {string} roleId The verified member role ID.
     * @returns {ISectionInfo} The new section.
     */
    export function getDefaultSectionObj(secName: string, roleId: string): ISectionInfo {
        return {
            channels: {
                loggingChannels: [],
                raids: {
                    afkCheckChannelId: "",
                    controlPanelChannelId: "",
                    leaderFeedbackChannelId: ""
                },
                verification: {
                    verificationChannelId: "",
                    manualVerificationChannelId: ""
                },
            },
            isMainSection: false,
            moderation: {sectionSuspended: []},
            otherMajorConfig: getOtherMajorConfigObj(),
            properties: {giveVerifiedRoleUponUnsuspend: false},
            roles: {
                leaders: {
                    sectionAlmostLeaderRoleId: "",
                    sectionLeaderRoleId: "",
                    sectionVetLeaderRoleId: ""
                },
                verifiedRoleId: roleId
            },
            sectionName: secName,
            uniqueIdentifier: `${StringUtil.generateRandomString(20)}_${Date.now()}`
        };
    }

    /**
     * Gets a user document ot creates a new one if it doesn't exist.
     * @param {string} userId The user ID.
     * @returns {Promise<IUserInfo>} The user document.
     * @throws {Error} If adding a new user document is not possible.
     */
    export async function getOrCreateUserDoc(userId: string): Promise<IUserInfo> {
        const docs = await getUserCollection().find({discordId: userId}).toArray();
        if (docs.length === 0) {
            const insertRes = await getUserCollection().insertOne(getDefaultUserConfig(userId));
            if (insertRes.ops.length > 0)
                return insertRes.ops[0];

            throw new Error(`Insert failed: ${userId}`);
        }

        return docs[0];
    }

    /**
     * Gets a guild document or creates a new one if it doesn't exist. This also caches the new document in the cache.
     * @param {string} guild The guild ID.
     * @param {boolean} checkCached Whether to check cache for the guild document.
     * @return {Promise<IGuildInfo>} The guild document.
     * @throws {Error} If adding a new guild document is not possible.
     */
    export async function getOrCreateGuildDoc(guild: string | Guild, checkCached: boolean): Promise<IGuildInfo> {
        const id = typeof guild === "string" ? guild : guild.id;
        if (checkCached && CachedGuildCollection.has(id)) {
            return CachedGuildCollection.get(id)!;
        }

        const docs = await getGuildCollection().find({guildId: id}).toArray();
        if (docs.length === 0) {
            const insertRes = await getGuildCollection().insertOne(getDefaultGuildConfig(id));
            if (insertRes.ops.length > 0) {
                CachedGuildCollection.set(id, insertRes.ops[0]);
                return insertRes.ops[0];
            }

            throw new Error(`Insert failed: ${id}`);
        }

        CachedGuildCollection.set(id, docs[0]);
        return docs[0];
    }

    /**
     * Equivalent to `findOneAndUpdate`, but this provides a cleaner way to get the guild document. This
     * will automatically set `returnDocument` to `true`. Additionally, this updates the cached guild document.
     * @param {FilterQuery<IGuildInfo>} filter The filter query.
     * @param {UpdateQuery<IGuildInfo>} update The update query.
     * @return {Promise<IGuildInfo | null>} The new guild document, if any.
     */
    export async function updateAndFetchGuildDoc(filter: FilterQuery<IGuildInfo>,
                                                 update: UpdateQuery<IGuildInfo>): Promise<IGuildInfo | null> {
        const res = await getGuildCollection().findOneAndUpdate(filter, update, {
            returnDocument: "after"
        });

        if (!res.value)
            return null;

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
                // Note that we aren't going to show logging channels since this is irrelevant for our use case.
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
            uniqueIdentifier: "MAIN"
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

    /**
     * Finds a user that has the corresponding punishment ID.
     * @param {string} punishmentId The punishment ID.
     * @returns {Promise<IPunishmentHistoryEntry | null>} The punishment information, if any.
     */
    export async function lookupPunishmentById(punishmentId: string): Promise<IPunishmentHistoryEntry | null> {
        const [userInfo, blacklistInfo] = await Promise.all([
            getUserCollection().findOne({
                $or: [
                    {
                        "details.moderationHistory.actionId": punishmentId
                    },
                    {
                        "details.moderationHistory.resolved.actionId": punishmentId
                    }
                ]
            }),
            getUnclaimedBlacklistCollection().findOne({
                $or: [
                    {
                        actionId: punishmentId
                    },
                    {
                        "resolved.actionId": punishmentId
                    }
                ]
            })
        ]);


        if (userInfo) {
            return userInfo.details.moderationHistory
                .find(x => x.actionId === punishmentId || x.resolved?.actionId === punishmentId)!;
        }

        return blacklistInfo;
    }

    /**
     * Gets the storage channel.
     * @param {Guild} [guild] The guild, if any. If none is specified, this defaults to the main storage channel.
     * @returns {Promise<TextChannel | null>} The storage channel, if any.
     */
    export async function getStorageChannel(guild?: Guild): Promise<TextChannel | null> {
        const db: IGuildInfo | null = guild ? await getOrCreateGuildDoc(guild.id, true) : null;
        const channels = await Promise.all([
            GlobalFgrUtilities.fetchChannel<TextChannel>(db?.channels.storageChannelId ?? ""),
            GlobalFgrUtilities.fetchChannel<TextChannel>(OneLifeBot.BotInstance.config.ids.mainStorageChannel)
        ]);

        for (const channel of channels) {
            if (!channel) continue;
            return channel;
        }

        return null;
    }

    /**
     * Gets all configured role IDs. This returns a collection where the key is the role name and the value is all
     * roles under that name.
     * @param {IGuildInfo} guildDoc The guild document.
     * @return {DCollection<DefinedRole, string[]>} The collection.
     */
    export function getAllConfiguredRoles(guildDoc: IGuildInfo): DCollection<DefinedRole, string[]> {
        const allHrl: string[] = [];
        if (guildDoc.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId)
            allHrl.push(guildDoc.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId);

        const allVrl: string[] = [];
        if (guildDoc.roles.staffRoles.universalLeaderRoleIds.vetLeaderRoleId)
            allVrl.push(guildDoc.roles.staffRoles.universalLeaderRoleIds.vetLeaderRoleId);
        if (guildDoc.roles.staffRoles.sectionLeaderRoleIds.sectionVetLeaderRoleId)
            allVrl.push(guildDoc.roles.staffRoles.sectionLeaderRoleIds.sectionVetLeaderRoleId);

        const allRl: string[] = [];
        if (guildDoc.roles.staffRoles.universalLeaderRoleIds.leaderRoleId)
            allRl.push(guildDoc.roles.staffRoles.universalLeaderRoleIds.leaderRoleId);
        if (guildDoc.roles.staffRoles.sectionLeaderRoleIds.sectionLeaderRoleId)
            allRl.push(guildDoc.roles.staffRoles.sectionLeaderRoleIds.sectionLeaderRoleId);

        const allArl: string[] = [];
        if (guildDoc.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId)
            allArl.push(guildDoc.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId);
        if (guildDoc.roles.staffRoles.sectionLeaderRoleIds.sectionAlmostLeaderRoleId)
            allArl.push(guildDoc.roles.staffRoles.sectionLeaderRoleIds.sectionAlmostLeaderRoleId);

        const allVerified: string[] = [];
        if (guildDoc.roles.verifiedRoleId)
            allVerified.push(guildDoc.roles.verifiedRoleId);

        for (const section of guildDoc.guildSections) {
            if (section.roles.leaders.sectionLeaderRoleId)
                allRl.push(section.roles.leaders.sectionLeaderRoleId);

            if (section.roles.leaders.sectionVetLeaderRoleId)
                allVrl.push(section.roles.leaders.sectionVetLeaderRoleId);

            if (section.roles.leaders.sectionAlmostLeaderRoleId)
                allArl.push(section.roles.leaders.sectionAlmostLeaderRoleId);

            if (section.roles.verifiedRoleId)
                allVerified.push(section.roles.verifiedRoleId);
        }

        const roleCollection = new Collection<DefinedRole, string[]>();
        roleCollection.set(GeneralConstants.MODERATOR_ROLE, []);
        if (guildDoc.roles.staffRoles.moderation.moderatorRoleId) {
            roleCollection.get(GeneralConstants.MODERATOR_ROLE)!.push(
                guildDoc.roles.staffRoles.moderation.moderatorRoleId
            );
        }

        roleCollection.set(GeneralConstants.HEAD_LEADER_ROLE, allHrl);

        roleCollection.set(GeneralConstants.OFFICER_ROLE, []);
        if (guildDoc.roles.staffRoles.moderation.officerRoleId) {
            roleCollection.get(GeneralConstants.OFFICER_ROLE)!.push(
                guildDoc.roles.staffRoles.moderation.officerRoleId
            );
        }

        roleCollection.set(GeneralConstants.VETERAN_LEADER_ROLE, allVrl);
        roleCollection.set(GeneralConstants.LEADER_ROLE, allRl);

        roleCollection.set(GeneralConstants.SECURITY_ROLE, []);
        if (guildDoc.roles.staffRoles.moderation.securityRoleId) {
            roleCollection.get(GeneralConstants.SECURITY_ROLE)!.push(
                guildDoc.roles.staffRoles.moderation.securityRoleId
            );
        }

        roleCollection.set(GeneralConstants.ALMOST_LEADER_ROLE, allArl);

        roleCollection.set(GeneralConstants.HELPER_ROLE, []);
        if (guildDoc.roles.staffRoles.moderation.helperRoleId) {
            roleCollection.get(GeneralConstants.HELPER_ROLE)!.push(
                guildDoc.roles.staffRoles.moderation.helperRoleId
            );
        }

        roleCollection.set(GeneralConstants.TEAM_ROLE, []);
        if (guildDoc.roles.staffRoles.teamRoleId) {
            roleCollection.get(GeneralConstants.TEAM_ROLE)!.push(
                guildDoc.roles.staffRoles.teamRoleId
            );
        }

        roleCollection.set(GeneralConstants.MEMBER_ROLE, allVerified);

        roleCollection.set(GeneralConstants.SUSPENDED_ROLE, []);
        if (guildDoc.roles.suspendedRoleId) {
            roleCollection.get(GeneralConstants.SUSPENDED_ROLE)!.push(
                guildDoc.roles.suspendedRoleId
            );
        }

        return roleCollection;
    }
}