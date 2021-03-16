import {Collection} from "discord.js";

export namespace InteractionManager {
    export const InteractiveMenu: Collection<string, string> = new Collection<string, string>();
}