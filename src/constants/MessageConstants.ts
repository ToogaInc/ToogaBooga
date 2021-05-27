import {MessageEmbed} from "discord.js";

export namespace MessageConstants {
    // Command must be executed in the server.
    export const NOT_IN_GUILD_EMBED = new MessageEmbed()
        .setColor("RED")
        .setTitle("Server Command Only.")
        .setDescription("The command you are trying to execute can only be executed in the server.");

    // Command is blocked.
    export const COMMAND_BLOCKED_EMBED = new MessageEmbed()
        .setColor("RED")
        .setTitle("Command Blocked.")
        .setDescription("The command you are trying to execute is blocked by your server administrator.");
}