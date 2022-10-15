import { Collection as MCollection, MongoClient } from "mongodb";
import { Collection as DCollection } from "discord.js";
import {
    IBotInfo,
    IGuildDocActiveRaids,
    IGuildDocAfkCheckSetting,
    IGuildDocCustomDungeon,
    IGuildDocDungeonOverride,
    IGuildDocGeneral,
    IGuildDocGenReaction,
    IGuildDocHeadcounts,
    IGuildDocManualVerify,
    IGuildDocModmailThread,
    IGuildDocPunishment,
    IGuildDocQuota,
    IGuildDocSecDungeonOverride,
    IGuildDocSection,
    IGuildDocVerificationSetting,
    IIdNameInfo,
    IUnclaimedBlacklistInfo,
    IUserInfo
} from "../definitions";

export namespace MongoGuildManager {
    let ThisMongoClient: MongoClient | null = null;
    let UserCollection: MCollection<IUserInfo> | null = null;
    let BotCollection: MCollection<IBotInfo> | null = null;
    let IdNameCollection: MCollection<IIdNameInfo> | null = null;
    let UnclaimedBlacklistCollection: MCollection<IUnclaimedBlacklistInfo> | null = null;

    // Each guild must have ONE entry in the following collections
    let GDGeneralCollection: MCollection<IGuildDocGeneral> | null = null;
    export const CachedGeneralDoc = new DCollection<string, IGuildDocGeneral>();

    /**
     * Returns the general guild collection, consisting of role and channel information.
     * @returns The general guild collection.
     */
    export function getGeneralGuildCollection(): MCollection<IGuildDocGeneral> {
        if (!GDGeneralCollection) {
            throw new Error("not connected.");
        }

        return GDGeneralCollection;
    }

    // Each guild must have at least ONE entry in the following collections
    // One entry per section
    let GDVerificationSettingCollection: MCollection<IGuildDocVerificationSetting> | null = null;
    export const CachedVerifSettingDoc = new DCollection<string, IGuildDocVerificationSetting>();

    /**
     * Returns the verification settings collection.
     * @returns The verification settings collection.
     */
    export function getVerificationSettingColl(): MCollection<IGuildDocVerificationSetting> {
        if (!GDVerificationSettingCollection) {
            throw new Error("not connected.");
        }

        return GDVerificationSettingCollection;
    }

    let GDAfkCheckSettingCollection: MCollection<IGuildDocAfkCheckSetting> | null = null;
    export const CachedAfkSettingDoc = new DCollection<string, IGuildDocAfkCheckSetting>();

    // Add to the following collections as needed.
    let GDSectionCollection: MCollection<IGuildDocSection> | null = null;
    export const CachedSections = new DCollection<string, IGuildDocSection>();

    let GDQuotaCollection: MCollection<IGuildDocQuota> | null = null;
    export const CachedQuotas = new DCollection<string, IGuildDocQuota>();

    let GDActiveRaidsCollection: MCollection<IGuildDocActiveRaids> | null = null;
    export const CachedActiveRaids = new DCollection<string, IGuildDocActiveRaids>();

    let GDHeadcountCollection: MCollection<IGuildDocHeadcounts> | null = null;
    export const CachedHeadcount = new DCollection<string, IGuildDocHeadcounts>();

    let GDManualVerifyCollection: MCollection<IGuildDocManualVerify> | null = null;
    export const CachedManualVerif = new DCollection<string, IGuildDocManualVerify>();

    let GDPunishmentCollection: MCollection<IGuildDocPunishment> | null = null;
    export const CachedPunishment = new DCollection<string, IGuildDocPunishment>();

    let GDGenReactionInfoCollection: MCollection<IGuildDocGenReaction> | null = null;
    export const CachedReactInfo = new DCollection<string, IGuildDocGenReaction>();

    let GDCustomDungeonCollection: MCollection<IGuildDocCustomDungeon> | null = null;
    export const CachedCustomDgn = new DCollection<string, IGuildDocDungeonOverride>();

    let GDDungeonOverrideCollection: MCollection<IGuildDocDungeonOverride> | null = null;
    export const CachedDgnOverride = new DCollection<string, IGuildDocDungeonOverride>();

    let GDDungeonSecOverrideCollection: MCollection<IGuildDocSecDungeonOverride> | null = null;
    export const CachedDgnSecOverride = new DCollection<string, IGuildDocSecDungeonOverride>();

    let GDModmailCollection: MCollection<IGuildDocModmailThread> | null = null;
    export const CachedModmail = new DCollection<string, IGuildDocModmailThread>();

    interface IDbConfiguration {
        dbUrl: string;
        dbName: string;
        guildColName: string;
        userColName: string;
        botColName: string;
        idNameColName: string;
        unclaimedBlName: string;
    }

    
}