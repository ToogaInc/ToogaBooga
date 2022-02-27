import {
    GuildMember,
    Message,
    MessageOptions,
    MessageSelectMenu,
    MessageSelectOptionData,
    Snowflake,
    TextChannel,
    Guild
} from "discord.js";
import {CommonRegex} from "../constants/CommonRegex";
import {DefinedRole} from "../definitions/Types";
import {IGuildInfo, ISectionInfo} from "../definitions";
import {MongoManager} from "../managers/MongoManager";
import {GuildFgrUtilities} from "./fetch-get-request/GuildFgrUtilities";
import {MessageUtilities} from "./MessageUtilities";
import {StringBuilder} from "./StringBuilder";
import {AdvancedCollector} from "./collectors/AdvancedCollector";
import {ButtonConstants} from "../constants/ButtonConstants";
import {PermsConstants} from "../constants/PermsConstants";
import {Logger} from "../utilities/Logger";

const LOGGER: Logger = new Logger(__filename, false);

export namespace MiscUtilities {
    /**
     * Stops execution of a function for a specified period of time.
     * @param {number} time The time, in milliseconds, to delay execution.
     * @returns {Promise<void>}
     */
    export async function stopFor(time: number): Promise<void> {
        return new Promise(resolve => {
            setTimeout(() => {
                return resolve();
            }, time);
        });
    }

    /**
     * Determines whether a `string` is a `Snowflake`.
     * @param {string} item The string to test.
     * @return {item is Snowflake} Whether the string is a `Snowflake`.
     */
    export function isSnowflake(item: string): item is Snowflake {
        return CommonRegex.ONLY_NUMBERS.test(item);
    }

    /**
     * Determines whether a `string` is a `DefinedRole`.
     * @param {string} role The role.
     * @return {role is DefinedRole} Whether the string is a `DefinedRole`.
     */
    export function isDefinedRole(role: string): role is DefinedRole {
        return (PermsConstants.ROLE_ORDER as string[]).includes(role);
    }

    /**
     * Converts a RGB value to the corresponding hex string.
     * @param {number} r Red value.
     * @param {number} g Green value.
     * @param {number} b Blue value.
     * @returns {string} The hex string. This will start with `#`.
     * @see https://stackoverflow.com/a/5623914
     */
    export function rgbToHex(r: number, g: number, b: number): string {
        // rgb          xx xx xx
        //              r  g  b
        // binary       xxxxxxxx xxxxxxxx xxxxxxxx
        //                  r        g        b
        //
        // hex string   # xx xx xx
        // binary       xxxxxxxx xxxxxxxx xxxxxxxx
        // r -> shift 24 bits to left
        // g -> shift 8 bits to left
        // b -> keep as normal
        //
        // shift 1 24 bits to the left so we know we're working with 24 bits
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }

    /**
     * Converts a hex string to the corresponding RGB value.
     * @param {string} hex The hex string.
     * @returns {[number, number, number]} A tuple containing the [R, G, B] values.
     */
    export function hexToRgb(hex: string): [number, number, number] {
        if (hex.startsWith("#"))
            hex = hex.slice(1);
        const num = Number.parseInt(hex, 16);
        // hex string: # xx xx xx
        //             24      16        8
        // binary str: xxxxxxxx xxxxxxxx xxxxxxxx
        //                 r        g        b
        // r -> shift 16 right                      num >> 16
        // g -> shift 8 right, keep bits 0-8        (num >> 8) & 0b1111_1111
        // b -> no need to shift, keep bits 0-8     num & 0b1111_1111
        return [(num >> 16) & 0b1111_1111, (num >> 8) & 0b1111_1111, num & 0b1111_1111];
    }

    /**
     * Asks a user for the section that he/she wants to perform an action on. This will send a message and then
     * either deletes the message once the question is asked or returns the message for later use.
     * @param {IGuildInfo} guildDb The guild document.
     * @param {GuildMember} member The member asking.
     * @param {TextChannel} channel The channel where this occurred.
     * @param {string} desc The description (i.e. instructions) to post.
     * @return {Promise<ISectionInfo | null>} The section, if any. Null otherwise.
     */
    export async function getSectionQuery(guildDb: IGuildInfo, member: GuildMember, channel: TextChannel,
                                          desc: string): Promise<[ISectionInfo, Message | null] | null> {
        const allSections = MongoManager.getAllSections(guildDb);
        const selectOptions: MessageSelectOptionData[] = allSections
            .map(x => {
                const role = GuildFgrUtilities.getCachedRole(member.guild, x.roles.verifiedRoleId);
                return {
                    label: x.sectionName,
                    description: role?.name ?? "No Member Role.",
                    value: x.uniqueIdentifier
                };
            });

        const msgOptions: MessageOptions = {
            embeds: [
                MessageUtilities.generateBlankEmbed(member, "RANDOM")
                    .setTitle("Select Section")
                    .setDescription(new StringBuilder(desc)
                        .appendLine().appendLine()
                        .append("If you wish to cancel this process, please press the `Cancel` button.").toString())
                    .setFooter({text: "Section Selector"})
            ],
            components: AdvancedCollector.getActionRowsFromComponents([
                new MessageSelectMenu()
                    .addOptions(...selectOptions)
                    .setCustomId("section_selector")
                    .setMinValues(1)
                    .setMaxValues(1),
                ButtonConstants.CANCEL_BUTTON
            ])
        };

        const askMsg = await channel.send(msgOptions);
        const result = await AdvancedCollector.startInteractionCollector({
            targetChannel: channel,
            targetAuthor: member,
            acknowledgeImmediately: true,
            deleteBaseMsgAfterComplete: false,
            duration: 60 * 1000,
            oldMsg: askMsg,
            clearInteractionsAfterComplete: true
        });

        // Button = guaranteed to be a button.
        if (!result || !result.isSelectMenu()) {
            askMsg.delete().catch();
            return null;
        }

        return [allSections.find(x => x.uniqueIdentifier === result.values[0])!, askMsg];
    }

    /**
     * Asks a user for the section that he/she wants to perform an action on. If no `msgOptions` is specified, then
     * this will keep the original message content.
     * @param {IGuildInfo} guildDb The guild document.
     * @param {GuildMember} member The member asking.
     * @param {Message} message The message to use. This will edit the message, but not delete it.
     * @param {MessageOptions} [msgOptions] The message options. If specified, the bot will edit the given message
     * with whatever is contained here. Do not include any components.
     * @return {Promise<ISectionInfo | null>} The section, if any. Null otherwise.
     */
    export async function getSectionWithInitMsg(
        guildDb: IGuildInfo,
        member: GuildMember,
        message: Message,
        msgOptions?: Omit<MessageOptions, "components">
    ): Promise<ISectionInfo | null> {
        const allSections = MongoManager.getAllSections(guildDb);
        const selectOptions: MessageSelectOptionData[] = allSections
            .map(x => {
                const role = GuildFgrUtilities.getCachedRole(member.guild, x.roles.verifiedRoleId);
                return {
                    label: x.sectionName,
                    description: role?.name ?? "No Member Role.",
                    value: x.uniqueIdentifier
                };
            });

        const components = AdvancedCollector.getActionRowsFromComponents([
            new MessageSelectMenu()
                .addOptions(...selectOptions)
                .setCustomId("section_selector")
                .setMinValues(1)
                .setMaxValues(1),
            ButtonConstants.CANCEL_BUTTON
        ]);
        let o: MessageOptions;
        if (msgOptions) {
            o = msgOptions;
            o.components = components;
        }
        else {
            o = MessageUtilities.getMessageOptionsFromMessage(message, components);
        }

        await message.edit(o).catch();
        const result = await AdvancedCollector.startInteractionCollector({
            targetChannel: message.channel as TextChannel,
            targetAuthor: member,
            acknowledgeImmediately: true,
            deleteBaseMsgAfterComplete: false,
            duration: 60 * 1000,
            oldMsg: message,
            clearInteractionsAfterComplete: false
        });

        // Button = guaranteed to be a button.
        if (!result || !result.isSelectMenu()) {
            message.delete().catch();
            return null;
        }
        return allSections.find(x => x.uniqueIdentifier === result.values[0])!;
    }

        /**
     * Returns role name when provided with guild and roleId.
     * @param {string} roleId The role ID.
     * @param {Guild} guild The guild.
     * @returns {string} the name of the role or NOT_FOUND
     */
        export function getRoleName(roleId: string, guild: Guild): string {
            LOGGER.debug(`Obtaining role name from ${roleId}`);
            const role = guild.roles.cache.find(r => r.id === roleId);
            const ret = role ? role.name : "NOT_FOUND";
            return ret;
    }    

}