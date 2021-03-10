import {Collection} from "discord.js";

export namespace ModmailManager {
    // If a person is in this collection, then the bot won't respond to any DM commands by this person.
    // We don't care about the value whatsoever.
    const CurrentlyRespondingToModmail: Collection<string, void> = new Collection<string, void>();

    /**
     * Checks whether a person is currently in modmail.
     * @param {string} id The ID to check.
     * @return {boolean} Whether the person is in modmail.
     */
    export function isInModmail(id: string): boolean {
        return CurrentlyRespondingToModmail.has(id);
    }

    /**
     * Adds a person to the list of people currently in modmail.
     * @param {string} id The ID to check.
     */
    export function addToModmail(id: string): void {
        CurrentlyRespondingToModmail.set(id);
    }

    /**
     * Removes a person from the list of people currently in modmail.
     * @param {string} id The ID to check.
     */
    export function removeFromModmail(id: string): void {
        if (!isInModmail(id)) return;
        CurrentlyRespondingToModmail.delete(id);
    }
}