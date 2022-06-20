import { Collection } from "discord.js";

export namespace InteractivityManager {
    // The key is the user ID.
    export const ACTIVE_DIRECT_MESSAGES: Collection<string, void> = new Collection();
}