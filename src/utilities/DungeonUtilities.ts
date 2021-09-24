import {ICustomDungeonInfo, IDungeonInfo, IGuildInfo, IReactionInfo} from "../definitions";
import {MAPPED_AFK_CHECK_REACTIONS} from "../constants/MappedAfkCheckReactions";
import {DUNGEON_DATA} from "../constants/DungeonData";

/**
 * A namespace containing a series of useful functions for dungeons.
 */
export namespace DungeonUtilities {

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