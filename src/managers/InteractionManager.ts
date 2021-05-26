import {Collection} from "discord.js";

export namespace InteractionManager {
    // Use this collection to keep track of people that are currently in a menu in DMs. This is because, by default,
    // if someone sends a message in DMs, that message will go to modmail. But, if they are in this collection and
    // they send a message in DMs, then it won't be sent.
    export const InteractiveMenu: Collection<string, string> = new Collection<string, string>();
}