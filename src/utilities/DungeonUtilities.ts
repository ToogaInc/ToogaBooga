/**
 * A namespace containing a series of useful functions for dungeons.
 */
import {IGuildInfo, IReactionInfo} from "../definitions";
import {MAPPED_AFK_CHECK_REACTIONS} from "../constants/MappedAfkCheckReactions";

export namespace DungeonUtilities {

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