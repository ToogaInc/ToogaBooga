import {Guild, Message} from "discord.js";
import {IGuildInfo} from "../../definitions/db/IGuildInfo";
import {ISectionInfo} from "../../definitions/db/ISectionInfo";

export interface IConfigurationCmd {
    /**
     * The entry function. This is where the configuration interaction starts.
     * @param {Message} msg The user-sent message that called this command.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {Message | null} botMsg The bot message. This will either be a defined message if the user went "back"
     * to the entry function or `null` if this is the first time.
     */
    entry(msg: Message, guildDoc: IGuildInfo, botMsg: Message | null): Promise<void>;

    /**
     * The main menu function. This is where the configuration process actually begins.
     * @param {Message} origMsg The user-sent message that called this command.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section that will be configured.
     * @param {Message} botMsg The bot message, which will be used for interactivity (editing message).
     */
    mainMenu(origMsg: Message, guildDoc: IGuildInfo, section: ISectionInfo, botMsg: Message): Promise<void>;

    /**
     * Returns a string containing the current configuration information.
     * @param {Guild} guild The guild.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section that is being configured.
     * @param {number} displayFilter The filter, using bitwise operators.
     * @return {string} The configuration settings string.
     */
    getCurrentConfiguration(guild: Guild, guildDoc: IGuildInfo, section: ISectionInfo, displayFilter: number): string;
}