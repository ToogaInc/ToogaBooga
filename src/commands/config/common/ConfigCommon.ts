import {
    Guild,
    Message,
    MessageActionRow,
    MessageButton,
    MessageOptions,
    TextBasedChannels,
    TextChannel
} from "discord.js";
import {AdvancedCollector} from "../../../utilities/collectors/AdvancedCollector";
import {Emojis} from "../../../constants/Emojis";
import {StringBuilder} from "../../../utilities/StringBuilder";
import {IGuildInfo, ISectionInfo} from "../../../definitions";
import {ICommandContext} from "../../BaseCommand";
import {GuildFgrUtilities} from "../../../utilities/fetch-get-request/GuildFgrUtilities";
import {InteractivityHelper} from "../../../utilities/InteractivityHelper";

export const DB_CONFIG_BUTTONS: MessageButton[] = [
    new MessageButton()
        .setLabel("Back")
        .setEmoji(Emojis.LONG_LEFT_ARROW_EMOJI)
        .setCustomId("back")
        .setStyle("PRIMARY"),
    new MessageButton()
        .setLabel("Up")
        .setEmoji(Emojis.UP_TRIANGLE_EMOJI)
        .setCustomId("up")
        .setStyle("PRIMARY"),
    new MessageButton()
        .setLabel("Down")
        .setEmoji(Emojis.DOWN_TRIANGLE_EMOJI)
        .setCustomId("down")
        .setStyle("PRIMARY"),
    new MessageButton()
        .setLabel("Reset")
        .setEmoji(Emojis.WASTEBIN_EMOJI)
        .setCustomId("down")
        .setStyle("PRIMARY"),
    new MessageButton()
        .setLabel("Quit")
        .setEmoji(Emojis.X_EMOJI)
        .setCustomId("quit")
        .setStyle("PRIMARY")
];

export const DB_CONFIG_ACTION_ROW: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents(DB_CONFIG_BUTTONS);

export const DATABASE_CONFIG_DESCRIPTION: string = new StringBuilder()
    .append("Here, you will be able to edit the following options. Keep the following in mind when you do so.")
    .appendLine()
    .append(`- The ${Emojis.RIGHT_TRIANGLE_EMOJI} emoji will point to the **currently** selected option. `)
    .appendLine()
    .append("- To move up or down the list of options, simply **press** the UP/DOWN buttons. If there are ")
    .append("too many options, you can use the jump (`j`) command. For example, to move the arrow down 2, ")
    .append("send `j 2`. To move the arrow up 4, send `j -4`.")
    .appendLine()
    .append("- To edit the option, simply **send** the appropriate input. Look at the **embed footer** for ")
    .append("the appropriate input types. To __clear__ the option (i.e. reset the option to nothing), press ")
    .append("the `Reset` button.")
    .appendLine()
    .append("- Once you are done, simply press the `Back` button or the `Quit` button.")
    .toString();

export interface IConfigCommand {
    /**
     * The entry function. This is where the configuration interaction starts.
     * @param {ICommandContext} ctx The command context.
     * @param {Message | null} botMsg The bot message. This will either be a defined message if the user went "back"
     * to the entry function or `null` if this is the first time.
     */
    entry(ctx: ICommandContext, botMsg: Message | null): Promise<void>;

    /**
     * The main menu function. This is where the configuration process actually begins.
     * @param {ICommandContext} ctx The command context.
     * @param {ISectionInfo} section The section that will be configured.
     * @param {Message} botMsg The bot message, which will be used for interactivity (editing message).
     */
    mainMenu(ctx: ICommandContext, section: ISectionInfo, botMsg: Message): Promise<void>;

    /**
     * Returns a string containing the current configuration information.
     * @param {Guild} guild The guild.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section that is being configured.
     * @param {number} displayFilter The filter, using bitwise operators.
     * @return {string} The configuration settings string.
     */
    getCurrentConfiguration(guild: Guild, guildDoc: IGuildInfo, section: ISectionInfo, displayFilter: number): string;

    /**
     * Disposes this instance. Use this function to clean up any messages that were used.
     * @param {ICommandContext} ctx The command context.
     * @param args Anything else.
     */
    dispose(ctx: ICommandContext, ...args: any[]): Promise<void>;
}

export interface IBaseDatabaseEntryInfo {
    /**
     * The name of the database entry. This is the name that will be displayed to users.
     */
    name: string;

    /**
     * A brief description of the database entry. What does this database entry do?
     */
    description: string;

    /**
     * The guild document path (where in the database is this entry).
     */
    guildDocPath: string;

    /**
     * The section path (where in the database is this entry).
     */
    sectionPath: string;

    /**
     * The configuration type.
     */
    configTypeOrInstructions: ConfigType | string;

    /**
     * A function that returns the current value from the database.
     */
    getCurrentValue: (guildDoc: IGuildInfo, section: ISectionInfo) => any;
}

export enum ConfigType {
    Channel,
    Role
}

/**
 * Gets the instructions for this configuration type.
 * @param {ConfigType | string} type The configuration type.
 * @returns {string} The instructions.
 */
export function getInstructions(type: ConfigType | string): string {
    if (typeof type === "string") return type;
    switch (type) {
        case ConfigType.Channel: {
            return "Either mention the channel or provide a valid channel ID.";
        }
        case ConfigType.Role: {
            return "Either mention the role or provide a valid role ID.";
        }
        default: {
            return "Instructions are not available.";
        }
    }
}

/**
 * A function that can be used for the `entry` method.
 * @param {ICommandContext} ctx The command context.
 * @param {Message | null} botMsg The original bot message.
 * @param {MessageOptions} [mOpt] The message options, if any. This should be specified, if you have the original
 * `botMsg`.
 * @returns {Promise<[ISectionInfo, Message] | null>} A tuple containing the section and message. If this isn't
 * possible, `null` is returned.
 */
export async function entryFunction(ctx: ICommandContext, botMsg: Message | null,
                                    mOpt?: MessageOptions): Promise<[ISectionInfo, Message] | null> {
    const member = GuildFgrUtilities.getCachedMember(ctx.guild!, ctx.user.id);
    if (!member) return null;

    let selectedSection: ISectionInfo;
    let newBotMsg: Message;
    if (botMsg) {
        const queryResult = await InteractivityHelper.getSectionWithInitMsg(
            ctx.guildDoc!,
            member,
            botMsg,
            mOpt
        );

        if (!queryResult) {
            return null;
        }

        newBotMsg = botMsg;
        selectedSection = queryResult;
    }
    else {
        const queryResult = await InteractivityHelper.getSectionQuery(
            ctx.guildDoc!,
            ctx.member!,
            ctx.channel as TextChannel,
            "Please select the appropriate section.",
            true
        );
        if (!queryResult || !queryResult[1])
            return null;
        [selectedSection, newBotMsg] = queryResult;
    }

    return [selectedSection, newBotMsg];
}

/**
 * Sends, or edits, the bot message.
 * @param {TextBasedChannels} channel The channel.
 * @param {Message | null} botMsg The bot message object, if any.
 * @param {MessageOptions} opt The message options.
 * @return {Promise<Message>} The now-existing bot message object.
 */
export async function sendOrEditBotMsg(
    channel: TextBasedChannels,
    botMsg: Message | null,
    opt: MessageOptions
): Promise<Message> {
    if (botMsg)
        await botMsg.edit(opt);
    else
        botMsg = await channel.send(opt);
    return botMsg;
}