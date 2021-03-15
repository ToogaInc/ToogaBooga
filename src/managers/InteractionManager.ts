import {Collection} from "discord.js";

export namespace InteractionManager {
    // If a person is in this collection, then the bot won't respond to any DM commands by this person.
    // We don't care about the value whatsoever.
    const InteractiveMenu: Collection<string, void> = new Collection<string, void>();

    /**
     * Checks whether a person is currently interacting with something (like verification).
     * @param {string} id The ID to check.
     * @return {boolean} Whether the person is interacting with something..
     */
    export function isInteracting(id: string): boolean {
        return InteractiveMenu.has(id);
    }

    /**
     * Adds a person to the list of people currently interacting with something.
     * @param {string} id The ID to check.
     */
    export function addToInteraction(id: string): void {
        InteractiveMenu.set(id);
    }

    /**
     * Removes a person from the list of people currently interacting with something.
     * @param {string} id The ID to check.
     */
    export function noLongerInteracting(id: string): void {
        if (!InteractiveMenu.has(id)) return;
        InteractiveMenu.delete(id);
    }
}