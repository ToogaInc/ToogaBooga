import {
    IAfkCheckReaction,
    ICustomDungeonInfo,
    IDungeonInfo,
    IDungeonOverrideInfo,
    IGuildInfo,
    IReactionInfo
} from "../definitions";
import {MAPPED_AFK_CHECK_REACTIONS} from "../constants/MappedAfkCheckReactions";
import {DUNGEON_DATA} from "../constants/DungeonData";
import {Guild} from "discord.js";
import {GuildFgrUtilities} from "./fetch-get-request/GuildFgrUtilities";
import {GlobalFgrUtilities} from "./fetch-get-request/GlobalFgrUtilities";
import {MongoManager} from "../managers/MongoManager";

/**
 * A namespace containing a series of useful functions for dungeons.
 */
export namespace DungeonUtilities {
    /**
     * Removes any dead reactions or links from all dungeons. This also fixes quota issues.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {Guild} guild The guild.
     * @return {Promise<IGuildInfo | null>} The guild document containing the new dungeons.
     */
    export async function fixDungeons(guildDoc: IGuildInfo, guild: Guild): Promise<IGuildInfo | null> {
        let changed = false;

        /**
         * Function to check if each reaction exists.
         * @param {object} obj The object containing `keyReactions` and `otherReactions`.
         */
        function checkReactions(obj: { keyReactions: IAfkCheckReaction[], otherReactions: IAfkCheckReaction[] }): void {
            // Check key reactions first
            for (let i = obj.keyReactions.length - 1; i >= 0; i--) {
                if (getReaction(guildDoc, obj.keyReactions[i].mapKey))
                    continue;
                obj.keyReactions.splice(i, 1);
                changed = true;
            }

            // Check any other non-key reactions
            for (let i = obj.otherReactions.length - 1; i >= 0; i--) {
                if (getReaction(guildDoc, obj.otherReactions[i].mapKey))
                    continue;
                obj.otherReactions.splice(i, 1);
                changed = true;
            }
        }

        /**
         * Function to check if each role exists.
         * @param {object} obj An object containing the role reuirements.
         */
        async function checkRoles(obj: { roleRequirement: string[] }): Promise<void> {
            const resolvedRoles = await Promise.all(
                obj.roleRequirement.map(x => GuildFgrUtilities.fetchRole(guild, x))
            );

            console.assert(resolvedRoles.length === obj.roleRequirement.length);
            for (let i = resolvedRoles.length - 1; i >= 0; i--) {
                if (resolvedRoles[i]) continue;
                obj.roleRequirement.splice(i, 1);
                changed = true;
            }
        }

        const overriddenDungeons: IDungeonOverrideInfo[] = [];
        const customDungeons: ICustomDungeonInfo[] = [];

        await Promise.all(guildDoc.properties.dungeonOverride.map(async overriddenDungeon => {
            checkReactions(overriddenDungeon);
            await checkRoles(overriddenDungeon);
            overriddenDungeons.push(overriddenDungeon);
        }));

        await Promise.all(guildDoc.properties.customDungeons.map(async customDungeon => {
            checkReactions(customDungeon);
            await checkRoles(customDungeon);

            // Check boss links
            for (let i = customDungeon.bossLinks.length - 1; i >= 0; i--) {
                if (guildDoc.properties.approvedCustomImages.some(x => x.url === customDungeon.bossLinks[i].url))
                    continue;

                customDungeon.bossLinks.splice(i, 1);
                changed = true;
            }

            if (!GlobalFgrUtilities.hasCachedEmoji(customDungeon.portalEmojiId)) {
                customDungeon.portalEmojiId = "";
                changed = true;
            }

            if (customDungeon.portalLink.url
                && guildDoc.properties.approvedCustomImages.every(x => x.url !== customDungeon.portalLink.url)) {
                customDungeon.portalLink.name = "";
                customDungeon.portalLink.url = "";
                changed = true;
            }

            customDungeons.push(customDungeon);
        }));

        // Check quotas
        guildDoc.quotas.quotaInfo.forEach(q => {
            const idxToRemove: number[] = [];
            for (let i = 0; i < q.pointValues.length; i++) {
                const v = q.pointValues[i].key.split(":");
                if (v.length === 1) {
                    continue;
                }

                const dungeon = getDungeonInfo(guildDoc, v[1]);
                if (!dungeon) {
                    idxToRemove.push(i);
                }
            }

            idxToRemove.sort((a, b) => b - a);
            for (const idx of idxToRemove) {
                changed = true;
                q.pointValues.splice(idx, 1);
            }
        });

        console.assert(overriddenDungeons.length === guildDoc.properties.dungeonOverride.length);
        console.assert(customDungeons.length === guildDoc.properties.customDungeons.length);

        return changed ? await MongoManager.updateAndFetchGuildDoc({guildId: guild.id}, {
            $set: {
                "properties.customDungeons": customDungeons,
                "properties.dungeonOverride": overriddenDungeons,
                "quotas.quotaInfo": guildDoc.quotas.quotaInfo
            }
        }) : guildDoc;
    }

    /**
     * Gets the dungeon object from the code name.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {string} codeName The dungeon code name, or unique identifier.
     * @return {IDungeonInfo | ICustomDungeonInfo | null} The dungeon object.
     */
    export function getDungeonInfo(guildDoc: IGuildInfo,
                                   codeName: string): IDungeonInfo | ICustomDungeonInfo | null {
        return isCustomDungeon(codeName)
            ? guildDoc.properties.customDungeons.find(x => x.codeName === codeName) ?? null
            : DUNGEON_DATA.find(x => x.codeName === codeName) ?? null;
    }


    /**
     * Checks whether the code name represents a custom dungeon.
     * @param {string} codeName The dungeon code name.
     * @return {boolean} Whether the dungeon is a custom dungeon.
     */
    export function isCustomDungeon(codeName: string): boolean {
        return codeName.startsWith("[[") && codeName.endsWith("]]");
    }

    /**
     * Gets reaction information given a mapping key.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {string} mapKey The reaction mapping key.
     * @return {IReactionInfo | null} The reaction information, if any.
     */
    export function getReaction(guildDoc: IGuildInfo, mapKey: string): IReactionInfo | null {
        return mapKey in MAPPED_AFK_CHECK_REACTIONS
            ? MAPPED_AFK_CHECK_REACTIONS[mapKey]
            : guildDoc.properties.customReactions.find(x => x.key === mapKey)?.value ?? null;
    }
}