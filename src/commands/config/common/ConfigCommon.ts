import {
    Guild,
    Message,
    MessageActionRow,
    MessageButton,
    MessageComponentInteraction,
    MessageEditOptions,
    MessageOptions,
    TextBasedChannel,
    TextChannel
} from "discord.js";
import { AdvancedCollector } from "../../../utilities/collectors/AdvancedCollector";
import { EmojiConstants } from "../../../constants/EmojiConstants";
import { StringBuilder } from "../../../utilities/StringBuilder";
import { IGuildInfo, ISectionInfo } from "../../../definitions";
import { ICommandContext } from "../../BaseCommand";
import { GuildFgrUtilities } from "../../../utilities/fetch-get-request/GuildFgrUtilities";
import { MiscUtilities } from "../../../utilities/MiscUtilities";
import { ButtonConstants } from "../../../constants/ButtonConstants";

export const DB_CONFIG_BUTTONS: MessageButton[] = [
    ButtonConstants.BACK_BUTTON,
    ButtonConstants.UP_BUTTON,
    ButtonConstants.DOWN_BUTTON,
    ButtonConstants.RESET_BUTTON,
    ButtonConstants.QUIT_BUTTON
];

export const DB_CONFIG_ACTION_ROW: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents(DB_CONFIG_BUTTONS);

export const DATABASE_CONFIG_DESCRIPTION: string = new StringBuilder()
    .append("Here, you will be able to edit the following options. Keep the following in mind when you do so.")
    .appendLine()
    .append(`- The ${EmojiConstants.RIGHT_TRIANGLE_EMOJI} emoji will point to the **currently** selected option. `)
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
     * @param {unknown[]} args Anything else.
     */
    dispose(ctx: ICommandContext, ...args: unknown[]): Promise<void>;
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
    getCurrentValue: (guildDoc: IGuildInfo, section: ISectionInfo) => unknown;
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
                                    mOpt?: MessageEditOptions): Promise<[ISectionInfo, Message] | null> {
    const member = GuildFgrUtilities.getCachedMember(ctx.guild!, ctx.user.id);
    if (!member) return null;

    let selectedSection: ISectionInfo;
    let newBotMsg: Message;
    if (botMsg) {
        const queryResult = await MiscUtilities.getSectionWithInitMsg(
            ctx.guildDoc!,
            member,
            botMsg,
            mOpt
        );

        if (!queryResult)
            return null;

        newBotMsg = botMsg;
        selectedSection = queryResult;
    }
    else {
        const queryResult = await MiscUtilities.getSectionQuery(
            ctx.guildDoc!,
            ctx.member!,
            ctx.channel as TextChannel,
            "Please select the appropriate section."
        );

        if (!queryResult || !queryResult[1])
            return null;
        [selectedSection, newBotMsg] = queryResult;
    }

    return [selectedSection, newBotMsg];
}

/**
 * Sends, or edits, the bot message.
 * @param {TextBasedChannel} channel The channel.
 * @param {Message | null} botMsg The bot message object, if any.
 * @param {MessageOptions} opt The message options.
 * @return {Promise<Message>} The now-existing bot message object.
 */
export async function sendOrEditBotMsg(
    channel: TextBasedChannel,
    botMsg: Message | null,
    opt: MessageOptions | MessageEditOptions
): Promise<Message> {
    if (botMsg)
        await botMsg.edit(opt as MessageEditOptions);
    else
        botMsg = await channel.send(opt as MessageOptions);
    return botMsg;
}

/**
 * Asks for the user's input.
 * @param {ICommandContext} ctx The command context.
 * @param {Message} botMsg The bot message.
 * @param {MessageOptions} msgOptions The message options. This should display the directions.
 * @param {Function} validator The validation function.
 * @returns {Promise<T | null | undefined>} The parsed result, if any. `null` if the user specifically chose not
 * to provide any information (for example, by pressing the Back button) and `undefined` if timed out.
 */
export async function askInput<T>(ctx: ICommandContext, botMsg: Message, msgOptions: Omit<MessageEditOptions, "components">,
                                  validator: (m: Message) => T | null | Promise<T | null>): Promise<T | null | undefined> {
    await botMsg.edit({
        ...msgOptions,
        components: AdvancedCollector.getActionRowsFromComponents([
            ButtonConstants.BACK_BUTTON
        ])
    });

    while (true) {
        // Because values like "0" are considered to be false values, even though they could be valid, we can just
        // return an object so that something like the first if-statement directly after this expression doesn't
        // run if a false value is given.
        const selectedValue = await AdvancedCollector.startDoubleCollector<{val: T}>({
            acknowledgeImmediately: true,
            cancelFlag: null,
            clearInteractionsAfterComplete: false,
            deleteBaseMsgAfterComplete: false,
            deleteResponseMessage: true,
            duration: 60 * 1000,
            targetAuthor: ctx.user,
            targetChannel: botMsg.channel,
            oldMsg: botMsg
        }, async m => {
            const v = await validator(m);
            return typeof v !== "undefined" && v !== null
                ? { val: v }
                : undefined;
        });

        if (!selectedValue) {
            return;
        }

        if (selectedValue instanceof MessageComponentInteraction) {
            return null;
        }

        // Is of type T
        if (selectedValue) {
            return selectedValue.val;
        }
    }
}