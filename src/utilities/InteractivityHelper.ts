import {ISectionInfo} from "../definitions/db/ISectionInfo";
import {IGuildInfo} from "../definitions/db/IGuildInfo";
import {
    GuildMember, Message,
    MessageButton,
    MessageOptions,
    MessageSelectMenu,
    MessageSelectOptionData,
    TextChannel
} from "discord.js";
import {MessageUtilities} from "./MessageUtilities";
import {StringBuilder} from "./StringBuilder";
import {MongoManager} from "../managers/MongoManager";
import {AdvancedCollector} from "./collectors/AdvancedCollector";
import {Emojis} from "../constants/Emojis";
import {MessageButtonStyles} from "discord.js/typings/enums";
import {FetchGetRequestUtilities} from "./FetchGetRequestUtilities";

/**
 * Asks a user from the section that he/she wants to perform an action.
 * @param {IGuildInfo} guildDb The guild document.
 * @param {GuildMember} member The member asking.
 * @param {TextChannel} channel The channel where this occurred.
 * @param {string} action The action that is being done.
 * @return {Promise<ISectionInfo | null>} The section, if any. Null otherwise.
 */
export async function getSectionQuery(guildDb: IGuildInfo, member: GuildMember, channel: TextChannel,
                                      action: string): Promise<ISectionInfo | null> {
    const allSections = MongoManager.getAllSections(guildDb);
    const selectOptions: MessageSelectOptionData[] = allSections
        .map(x => {
            const role = FetchGetRequestUtilities.getCachedRole(member.guild, x.roles.verifiedRoleId);
            return {
                default: x.uniqueIdentifier === "MAIN",
                label: x.sectionName,
                description: role?.name ?? "No Member Role.",
                value: x.uniqueIdentifier
            };
        });

    const msgOptions: MessageOptions = {
        embeds: [
            MessageUtilities.generateBlankEmbed(member, "RANDOM")
                .setTitle("Select Section")
                .setDescription(new StringBuilder(`You are about to perform the following action: ${action}. `)
                    .appendLine().appendLine()
                    .append("Please select one section from the select menu where you want to perform this action. ")
                    .append("If you wish to cancel this process, please press the `Cancel` button.").toString())
                .setFooter("Section Selector")
        ],
        components: AdvancedCollector.getActionRowsFromComponents([
            new MessageSelectMenu()
                .addOptions(...selectOptions)
                .setCustomId("section_selector")
                .setMinValues(1)
                .setMaxValues(1),
            new MessageButton()
                .setLabel("Cancel")
                .setEmoji(Emojis.X_EMOJI)
                .setCustomId("cancel_button")
                .setStyle(MessageButtonStyles.DANGER)
        ])
    };

    const result = await AdvancedCollector.startInteractionCollector({
        targetChannel: channel,
        targetAuthor: member,
        acknowledgeImmediately: true,
        deleteBaseMsgAfterComplete: true,
        duration: 60 * 1000,
        msgOptions: msgOptions,
        clearInteractionsAfterComplete: true
    });

    // Button = guaranteed to be a button.
    if (!result || !result.isSelectMenu()) return null;
    return allSections.find(x => x.uniqueIdentifier === result.values[0])!;
}

export async function getSectionWithInitMsg(guildDb: IGuildInfo, member: GuildMember,
                                            message: Message): Promise<ISectionInfo | null> {
    const allSections = MongoManager.getAllSections(guildDb);
    const selectOptions: MessageSelectOptionData[] = allSections
        .map(x => {
            const role = FetchGetRequestUtilities.getCachedRole(member.guild, x.roles.verifiedRoleId);
            return {
                default: x.uniqueIdentifier === "MAIN",
                label: x.sectionName,
                description: role?.name ?? "No Member Role.",
                value: x.uniqueIdentifier
            };
        });

    const needToAddComponents = message.components.length === 0;
    if (needToAddComponents) {
        const options = MessageUtilities.getMessageOptionsFromMessage(message,
            AdvancedCollector.getActionRowsFromComponents([
                new MessageSelectMenu()
                    .addOptions(...selectOptions)
                    .setCustomId("section_selector")
                    .setMinValues(1)
                    .setMaxValues(1),
                new MessageButton()
                    .setLabel("Cancel")
                    .setEmoji(Emojis.X_EMOJI)
                    .setCustomId("cancel_button")
                    .setStyle(MessageButtonStyles.DANGER)
            ]));
        await message.edit(options).catch();
    }

    const result = await AdvancedCollector.startInteractionCollector({
        targetChannel: message.channel as TextChannel,
        targetAuthor: member,
        acknowledgeImmediately: true,
        deleteBaseMsgAfterComplete: false,
        duration: 60 * 1000,
        oldMsg: message,
        clearInteractionsAfterComplete: needToAddComponents
    });

    // Button = guaranteed to be a button.
    if (!result || !result.isSelectMenu()) return null;
    return allSections.find(x => x.uniqueIdentifier === result.values[0])!;
}