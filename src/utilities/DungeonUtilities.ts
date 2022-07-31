import {
    IAfkCheckReaction,
    ICustomDungeonInfo,
    IDungeonInfo,
    IDungeonOverrideInfo,
    IGuildInfo,
    IReactionInfo
} from "../definitions";
import { MAPPED_AFK_CHECK_REACTIONS } from "../constants/dungeons/MappedAfkCheckReactions";
import { DUNGEON_DATA } from "../constants/dungeons/DungeonData";
import {
    Guild,
    MessageSelectMenu
} from "discord.js";
import { GuildFgrUtilities } from "./fetch-get-request/GuildFgrUtilities";
import { GlobalFgrUtilities } from "./fetch-get-request/GlobalFgrUtilities";
import { MongoManager } from "../managers/MongoManager";
import { ArrayUtilities } from "./ArrayUtilities";
import { MessageUtilities } from "./MessageUtilities";
import { AdvancedCollector } from "./collectors/AdvancedCollector";
import { ButtonConstants } from "../constants/ButtonConstants";
import { StringUtil } from "./StringUtilities";
import { ICommandContext } from "../commands/BaseCommand";

/**
 * A namespace containing a series of useful functions for dungeons, raids, and so on.
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
                const r = getReaction(guildDoc, obj.keyReactions[i].mapKey);
                if (r && GlobalFgrUtilities.getNormalOrCustomEmoji(r))
                    continue;
                obj.keyReactions.splice(i, 1);
                changed = true;
            }

            // Check any other non-key reactions
            for (let i = obj.otherReactions.length - 1; i >= 0; i--) {
                const r = getReaction(guildDoc, obj.otherReactions[i].mapKey);
                if (r && GlobalFgrUtilities.getNormalOrCustomEmoji(r))
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

                const dungeon = getDungeonInfo(v[1], guildDoc);
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

        return changed ? await MongoManager.updateAndFetchGuildDoc({ guildId: guild.id }, {
            $set: {
                "properties.customDungeons": customDungeons,
                "properties.dungeonOverride": overriddenDungeons,
                "quotas.quotaInfo": guildDoc.quotas.quotaInfo
            }
        }) : guildDoc;
    }

    /**
     * Fixes early location roles, removing them from the database if it doesn't contain a valid custom emoji, or it
     * doesn't contain a valid role.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {Guild} guild The guild.
     * @returns {Promise<IGuildInfo | null>} The new document.
     */
    export async function fixEarlyLocRoles(guildDoc: IGuildInfo, guild: Guild): Promise<IGuildInfo | null> {
        const temp = guildDoc.properties.genEarlyLocReactions!
            .filter(x => {
                if (!GuildFgrUtilities.hasCachedRole(guild, x.roleId)) {
                    return false;
                }

                const r = getReaction(guildDoc, x.mappingKey);
                return r && GlobalFgrUtilities.getNormalOrCustomEmoji(r);
            });

        if (temp.length === guildDoc.properties.genEarlyLocReactions.length) {
            return guildDoc;
        }

        return await MongoManager.updateAndFetchGuildDoc({ guildId: guild.id }, {
            $set: {
                "properties.genEarlyLocReactions": temp
            }
        });
    }

    /**
     * Gets the dungeon object from the code name.
     * @param {string} codeName The dungeon code name, or unique identifier.
     * @param {IGuildInfo} [guildDoc] The guild document, if any.
     * @return {IDungeonInfo | ICustomDungeonInfo | null} The dungeon object.
     */
    export function getDungeonInfo(codeName: string,
                                   guildDoc?: IGuildInfo | null): IDungeonInfo | ICustomDungeonInfo | null {
        return isCustomDungeon(codeName)
            ? guildDoc?.properties.customDungeons.find(x => x.codeName === codeName) ?? null
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

    export async function selectDungeon(ctx: ICommandContext, dungeons: IDungeonInfo[]): Promise<IDungeonInfo | null>{
        const selectMenus: MessageSelectMenu[] = [];
        const uIdentifier = StringUtil.generateRandomString(20);
        const preselectedDungeon = ctx.interaction.options.getString("dungeon");

        if (preselectedDungeon) {
            const preselected = dungeons.find(x => x.codeName === preselectedDungeon);
            if (preselected) {
                return preselected;
            }
        }
        
        const exaltDungeons: IDungeonInfo[] = [];
        for (const dungeon of dungeons){
            if (dungeon.dungeonCategory === "Exaltation Dungeons") {
                exaltDungeons.push(dungeon);
            }
        }
        if (exaltDungeons.length > 0){
            selectMenus.push(
                new MessageSelectMenu()
                    .setCustomId(`${uIdentifier}_${5}`)
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setPlaceholder("Exaltation Dungeons")
                    .addOptions(exaltDungeons.map(x => {
                        return {
                            label: x.dungeonName,
                            value: x.codeName,
                            emoji: x.portalEmojiId
                        };
                    }))
            );
        }
        const dungeonSubset = ArrayUtilities.breakArrayIntoSubsets(
            dungeons.filter(x => x.dungeonCategory !== "Exaltation Dungeons"),
            25
        );
        for (let i = 0; i < Math.min(4, dungeonSubset.length); i++) {
            selectMenus.push(
                new MessageSelectMenu()
                    .setCustomId(`${uIdentifier}_${i}`)
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setPlaceholder("All Dungeons " + (i + 1))
                    .addOptions(dungeonSubset[i].map(x => {
                        return {
                            label: x.dungeonName,
                            value: x.codeName,
                            emoji: x.portalEmojiId
                        };
                    }))
            );
        }
        const askDgnEmbed = MessageUtilities.generateBlankEmbed(ctx.member!, "GOLD")
            .setTitle("Select Dungeon")
            .setDescription("Please select a dungeon from the dropdown menu(s) below. If you want to cancel this,"
                + " press the **Cancel** button.")
            .setFooter({ text: "You have 1 minute and 30 seconds to select a dungeon." })
            .setTimestamp();

        if (dungeonSubset.length > 4) {
            askDgnEmbed.addField(
                "Warning",
                "Some dungeons have been excluded from the dropdown. This is due to a Discord limitation. To fix "
                + "this issue, please ask a higher-up to exclude some irrelevant dungeons from this list."
            );
        }

        if (!(ctx.interaction.replied || ctx.interaction.deferred)){
            await ctx.interaction.reply({
                content: "Creating dungeon selection panel",
            });
        }

        await ctx.interaction.editReply({
            content: " ",
            embeds: [askDgnEmbed],
            components: AdvancedCollector.getActionRowsFromComponents([
                ...selectMenus,
                AdvancedCollector.cloneButton(ButtonConstants.CANCEL_BUTTON)
                    .setCustomId(`${uIdentifier}_cancel`)
            ])
        });

        const selectedDgn = await AdvancedCollector.startInteractionEphemeralCollector({
            targetAuthor: ctx.user,
            acknowledgeImmediately: false,
            targetChannel: ctx.channel,
            duration: 1.5 * 60 * 1000
        }, uIdentifier);

        if (!selectedDgn || !selectedDgn.isSelectMenu()) {
            await ctx.interaction.editReply({
                components: [],
                content: "You either did not select a dungeon in time or canceled this process.",
                embeds: []
            });
            return null;
        }
    
        return dungeons.find(x => x.codeName === selectedDgn.values[0]!) ?? null;
    }
}