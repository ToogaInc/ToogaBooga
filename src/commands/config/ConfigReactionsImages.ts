import { BaseCommand, ICommandContext } from "../BaseCommand";
import {
    Message,
    MessageButton,
    MessageComponentInteraction,
    MessageEmbed,
    MessageSelectMenu,
    TextChannel
} from "discord.js";
import { EmojiConstants } from "../../constants/EmojiConstants";
import { AdvancedCollector } from "../../utilities/collectors/AdvancedCollector";
import { StringBuilder } from "../../utilities/StringBuilder";
import { ArrayUtilities } from "../../utilities/ArrayUtilities";
import { GlobalFgrUtilities } from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import { GeneralConstants } from "../../constants/GeneralConstants";
import { ReactionType } from "../../definitions";
import { StringUtil } from "../../utilities/StringUtilities";
import { MongoManager } from "../../managers/MongoManager";
import { GuildFgrUtilities } from "../../utilities/fetch-get-request/GuildFgrUtilities";
import { Bot } from "../../Bot";
import { MiscUtilities } from "../../utilities/MiscUtilities";
import * as Stream from "stream";
import { TimeUtilities } from "../../utilities/TimeUtilities";
import { TimedResult, TimedStatus } from "../../definitions/Types";
import { sendOrEditBotMsg } from "./common/ConfigCommon";
import { ButtonConstants } from "../../constants/ButtonConstants";
import { MessageUtilities } from "../../utilities/MessageUtilities";

type ReactionDetailedType = {
    type: ReactionType;
    name: string;
    desc: string;
};

export class ConfigReactionsImages extends BaseCommand {
    public static ALL_REACTION_TYPES: ReactionDetailedType[] = [
        {
            type: "KEY",
            name: "Key Reaction",
            desc: "Keys that can have modifiers attached to them (e.g. LH, Shatters Keys)."
        },
        {
            type: "NM_KEY",
            name: "Key (No Modifiers Possible) Reaction",
            desc: "Keys that cannot have modifiers at all (e.g. WC Inc, Runes)."
        },
        {
            type: "STATUS_EFFECT",
            name: "Status Effect Reaction",
            desc: "For status effects like Daze, Stun, Paralyze, etc."
        },
        {
            type: "CLASS",
            name: "Class Reaction",
            desc: "For class (and related) reactions like Knight, Rusher, Wizard, etc."
        },
        {
            type: "ITEM",
            name: "Item Reaction",
            desc: "For item reactions like Fungal Tome, QoT, Brain, etc."
        },
        {
            type: "EARLY_LOCATION",
            name: "Early Location Reaction",
            desc: "For generic early reaction (usually associated with a role)."
        },
        {
            type: "UTILITY",
            name: "Misc/Utility Reaction",
            desc: "For other, uncategorized, reactions."
        }
    ];

    public static MAX_CUSTOM_REACTIONS: number = 30;
    public static MAX_CUSTOM_IMAGES: number = 40;

    public constructor() {
        super({
            cmdCode: "CONFIG_REACTIONS_IMAGES_COMMAND",
            formalCommandName: "Configure Reactions & Images Command",
            botCommandName: "configreactionsimages",
            description: "Allows you to configure custom reactions and images.",
            rolePermissions: ["Officer", "HeadRaidLeader", "Moderator"],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 3 * 1000,
            argumentInfo: [],
            guildOnly: true,
            botOwnerOnly: false,
            guildConcurrencyLimit: 1,
            allowMultipleExecutionByUser: false
        });
    }

    /** @inheritDoc */
    public async run(ctx: ICommandContext): Promise<number> {
        if (!(ctx.channel instanceof TextChannel)) return -1;

        await ctx.interaction.reply({
            content: "A new message should have popped up! Please refer to that message."
        });

        await this.mainMenu(ctx, null);
        return 0;
    }

    /**
     * The main menu function. This is where the configuration process actually begins.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message, which will be used for interactivity (editing message).
     */
    public async mainMenu(ctx: ICommandContext, botMsg: Message | null): Promise<void> {
        const embed: MessageEmbed = new MessageEmbed()
            .setAuthor({ name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined })
            .setTitle("Dungeon Configuration Command")
            .setDescription("Here, you will be able to manage reactions (for AFK checks) and images.")
            .addField(
                "Quit",
                "Click on the `Quit` button to exit this process."
            )
            .addField(
                "Manage Reactions",
                "To add, remove, or modify custom emojis/reactions, press the `Manage Reactions` button."
            )
            .addField(
                "Manage Images",
                "To add or remove custom images, press the `Manage Images` button."
            );

        const buttons: MessageButton[] = [
            ButtonConstants.QUIT_BUTTON,
            new MessageButton()
                .setLabel("Manage Reactions")
                .setCustomId("reactions")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Manage Images")
                .setCustomId("images")
                .setStyle("PRIMARY")
        ];

        botMsg = await sendOrEditBotMsg(ctx.channel!, botMsg, {
            embeds: [embed],
            components: AdvancedCollector.getActionRowsFromComponents(buttons)
        });

        const selectedButton = await AdvancedCollector.startInteractionCollector({
            targetChannel: botMsg.channel as TextChannel,
            targetAuthor: ctx.user,
            oldMsg: botMsg,
            acknowledgeImmediately: true,
            clearInteractionsAfterComplete: false,
            deleteBaseMsgAfterComplete: false,
            duration: 60 * 1000
        });

        if (!selectedButton) {
            await this.dispose(ctx, botMsg);
            return;
        }

        switch (selectedButton.customId) {
            case ButtonConstants.QUIT_ID: {
                await this.dispose(ctx, botMsg);
                break;
            }
            case "reactions": {
                await this.manageReactions(ctx, botMsg);
                break;
            }
            case "images": {
                await this.manageImages(ctx, botMsg);
                break;
            }
        }
    }

    /**
     * Disposes this instance. Use this function to clean up any messages that were used.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     */
    public async dispose(ctx: ICommandContext, botMsg: Message | null): Promise<void> {
        if (botMsg) {
            await MessageUtilities.tryDelete(botMsg);
        }
    }

    /**
     * Manages images for this guild.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @private
     */
    private async manageImages(ctx: ICommandContext, botMsg: Message): Promise<void> {
        let storageChannel: TextChannel | null = null;
        if (ctx.guildDoc!.channels.storageChannelId) {
            storageChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
                ctx.guild!,
                ctx.guildDoc!.channels.storageChannelId
            );
        }

        if (!storageChannel) {
            storageChannel = GlobalFgrUtilities.getCachedChannel<TextChannel>(
                Bot.BotInstance.config.ids.mainStorageChannel
            );
        }

        if (!storageChannel) {
            await botMsg.edit({
                embeds: [
                    new MessageEmbed()
                        .setAuthor({ name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined })
                        .setTitle("Unable to Manage Images")
                        .setColor("RED")
                        .setDescription("You did not define a storage channel. Please do so via the channel"
                            + " configuration command.")
                        .setFooter({ text: "This process will go to the previous page in 5 seconds." })
                ]
            });

            await MiscUtilities.stopFor(5 * 1000);
            await this.mainMenu(ctx, botMsg);
            return;
        }

        const upButton = AdvancedCollector.cloneButton(ButtonConstants.UP_BUTTON);
        const downButton = AdvancedCollector.cloneButton(ButtonConstants.DOWN_BUTTON);
        const addButton = AdvancedCollector.cloneButton(ButtonConstants.ADD_BUTTON);
        const removeButton = AdvancedCollector.cloneButton(ButtonConstants.REMOVE_BUTTON);
        const changeButton = new MessageButton()
            .setStyle("PRIMARY")
            .setLabel("Change Name")
            .setCustomId("change_name")
            .setEmoji(EmojiConstants.PENCIL_EMOJI);

        const buttons: MessageButton[] = [
            ButtonConstants.BACK_BUTTON,
            upButton,
            downButton,
            addButton,
            removeButton,
            changeButton,
            ButtonConstants.SAVE_BUTTON,
            ButtonConstants.QUIT_BUTTON
        ];

        const selectedImages = ctx.guildDoc!.properties.approvedCustomImages.slice();
        const embed = new MessageEmbed()
            .setAuthor({ name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined })
            .setTitle("Manage Images")
            .setDescription(
                new StringBuilder()
                    .append("Here, you can add or remove images. These images can be used to further customize your")
                    .append(" custom AFK checks.").appendLine(2)
                    .append(`The ${EmojiConstants.RIGHT_TRIANGLE_EMOJI} emoji will point to the currently selected image.`)
                    .appendLine()
                    .append("- You can move this arrow up or down by either pressing the Up/Down button, or by using")
                    .append(" the jump (`j`) command. For example, to move the arrow down 2, send `j 2`. To move the")
                    .append(" arrow up 4, send `j -4`.")
                    .appendLine()
                    .append("- To change the name of this image, press the **Change Name** button.")
                    .appendLine()
                    .append("- You can also delete the selected image by pressing the **Remove** button.")
                    .appendLine(2)
                    .append("Once you are done, you can either __Save__ your changes, or go __Back__ to the previous")
                    .append(" page without saving your changes.")
                    .toString()
            );

        let currentIdx = 0;

        while (true) {
            changeButton.setDisabled(selectedImages.length === 0);
            addButton.setDisabled(selectedImages.length + 1 > ConfigReactionsImages.MAX_CUSTOM_IMAGES);
            removeButton.setDisabled(selectedImages.length === 0);
            upButton.setDisabled(selectedImages.length <= 1);
            downButton.setDisabled(selectedImages.length <= 1);

            embed.fields = [];
            const fields = ArrayUtilities.arrayToStringFields(
                selectedImages,
                (i, elem) => {
                    return i === currentIdx
                        ? `${EmojiConstants.RIGHT_TRIANGLE_EMOJI} ${elem.name} [Image](${elem.url})\n`
                        : `${elem.name}\n`;
                }
            );

            for (const field of fields) {
                embed.addField(GeneralConstants.ZERO_WIDTH_SPACE, field);
            }

            await botMsg.edit({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });

            const res = await AdvancedCollector.startInteractionCollector({
                targetChannel: ctx.channel,
                acknowledgeImmediately: true,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                duration: 2 * 60 * 1000,
                targetAuthor: ctx.user,
                oldMsg: botMsg
            });

            if (!res) {
                await this.dispose(ctx, botMsg);
                return;
            }

            switch (res.customId) {
                case ButtonConstants.BACK_ID: {
                    await this.mainMenu(ctx, botMsg);
                    return;
                }
                case ButtonConstants.ADD_ID: {
                    await botMsg.edit({
                        embeds: [
                            new MessageEmbed()
                                .setAuthor({ name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined })
                                .setTitle("Send Image")
                                .setDescription("Please send your image __as an attachment__ now. The bot will"
                                    + " __not__ accept image links. If you don't want to add a new image at this"
                                    + " time, press the **Cancel** button.")
                        ],
                        components: AdvancedCollector.getActionRowsFromComponents([
                            ButtonConstants.CANCEL_BUTTON
                        ])
                    });

                    const imageRes = await AdvancedCollector.startDoubleCollector<Buffer | Stream | string>({
                        acknowledgeImmediately: true,
                        cancelFlag: null,
                        clearInteractionsAfterComplete: false,
                        deleteBaseMsgAfterComplete: false,
                        deleteResponseMessage: false,
                        duration: 60 * 1000,
                        oldMsg: botMsg,
                        targetAuthor: ctx.user,
                        targetChannel: ctx.channel
                    }, async m => {
                        if (m.attachments.size === 0) {
                            await m.delete();
                            return;
                        }

                        const at = m.attachments.first()!;
                        if (!at.height) {
                            await m.delete();
                            return;
                        }

                        setTimeout(() => {
                            m.delete();
                        }, 5 * 1000);
                        return at.attachment;
                    });

                    if (!imageRes) {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (imageRes instanceof MessageComponentInteraction)
                        break;

                    const storedMsg = await storageChannel!.send({
                        files: [imageRes],
                        content: new StringBuilder()
                            .append(`Upload Time: ${TimeUtilities.getDiscordTime({ style: "F" })}`).appendLine()
                            .append(`Uploaded By: ${ctx.user}`)
                            .toString()
                    });

                    const newName = await this.getNameFunction(ctx, botMsg, "IMAGE")();

                    if (newName.status === TimedStatus.TIMED_OUT) {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (newName.status === TimedStatus.CANCELED)
                        break;

                    selectedImages.push({
                        name: newName.value!,
                        url: storedMsg.attachments.first()!.url
                    });
                    break;
                }
                case ButtonConstants.REMOVE_ID: {
                    selectedImages.splice(currentIdx, 1);
                    if (selectedImages.length === 0)
                        currentIdx = 0;
                    else
                        currentIdx %= selectedImages.length;
                    break;
                }
                case "change_name": {
                    const r = await this.getNameFunction(ctx, botMsg, "IMAGE")();

                    if (r.status === TimedStatus.TIMED_OUT) {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (r.status === TimedStatus.CANCELED)
                        break;

                    selectedImages[currentIdx].name = r.value!;
                    break;
                }
                case ButtonConstants.SAVE_ID: {
                    ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc({ guildId: ctx.guild!.id }, {
                        $set: {
                            "properties.approvedCustomImages": selectedImages
                        }
                    });
                    await this.mainMenu(ctx, botMsg);
                    return;
                }
                case ButtonConstants.QUIT_ID: {
                    await this.dispose(ctx, botMsg);
                    return;
                }
                case ButtonConstants.UP_ID: {
                    currentIdx = (currentIdx + selectedImages.length - 1) % selectedImages.length;
                    break;
                }
                case ButtonConstants.DOWN_ID: {
                    currentIdx++;
                    currentIdx %= selectedImages.length;
                    break;
                }
            }
        }
    }

    /**
     * Gets the function that can be used to ask for the name of either a reaction or image.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {string} embedType The embed type.
     * @return {Function} The function that can be used to ask for the name.
     * @private
     */
    private getNameFunction(
        ctx: ICommandContext,
        botMsg: Message,
        embedType: "REACTION" | "IMAGE"
    ): () => Promise<TimedResult<string>> {
        return async function getNameForReaction(): Promise<TimedResult<string>> {
            const embed = embedType === "REACTION"
                ? new MessageEmbed()
                    .setAuthor({ name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined })
                    .setTitle("Specify Reaction Name")
                    .setDescription("You will now specify the name for this reaction. This name will be displayed on"
                        + " the AFK check button. If you decide that you don't want to create a new reaction, press the"
                        + " **Cancel** button.")
                : new MessageEmbed()
                    .setAuthor({ name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined })
                    .setTitle("Specify ReaImage Name")
                    .setDescription("You will now specify the name for this image. This is solely used to make"
                        + " identification of images easier. If you decide that you don't want to create a new image,"
                        + " press the **Cancel** button.");

            await botMsg.edit({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents([
                    ButtonConstants.CANCEL_BUTTON
                ])
            });

            const res = await AdvancedCollector.startDoubleCollector<string>({
                acknowledgeImmediately: true,
                cancelFlag: null,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                deleteResponseMessage: true,
                duration: 60 * 1000,
                oldMsg: botMsg,
                targetAuthor: ctx.user,
                targetChannel: ctx.channel
            }, AdvancedCollector.getStringPrompt(ctx.channel, { min: 1, max: 50 }));

            if (!res)
                return { value: null, status: TimedStatus.TIMED_OUT };

            if (res instanceof MessageComponentInteraction)
                return { value: null, status: TimedStatus.CANCELED };

            return { value: res, status: TimedStatus.SUCCESS };
        };
    }

    /**
     * Manages reactions for this guild.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @private
     */
    private async manageReactions(ctx: ICommandContext, botMsg: Message): Promise<void> {
        const currentReactions = ctx.guildDoc!.properties.customReactions.slice();
        const upButton = AdvancedCollector.cloneButton(ButtonConstants.UP_BUTTON);
        const downButton = AdvancedCollector.cloneButton(ButtonConstants.DOWN_BUTTON);
        const addButton = AdvancedCollector.cloneButton(ButtonConstants.ADD_BUTTON);
        const removeButton = AdvancedCollector.cloneButton(ButtonConstants.REMOVE_BUTTON);
        const changeEmojiBtn = new MessageButton()
            .setStyle("PRIMARY")
            .setLabel("Change Emoji")
            .setCustomId("change_emoji");
        const changeNameBtn = new MessageButton()
            .setStyle("PRIMARY")
            .setLabel("Change Name")
            .setCustomId("change_name");

        const buttons: MessageButton[] = [
            ButtonConstants.BACK_BUTTON,
            upButton,
            downButton,
            addButton,
            removeButton,
            changeEmojiBtn,
            changeNameBtn,
            ButtonConstants.SAVE_BUTTON,
            ButtonConstants.QUIT_BUTTON
        ];

        const embed = new MessageEmbed()
            .setAuthor({ name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined })
            .setTitle("Manage Reactions")
            .setDescription(
                new StringBuilder()
                    .append("Here, you can add, remove, or modify reactions. You can use these reactions for your AFK")
                    .append(" checks. Note that each reaction __must__ have an emoji associated with it or it will")
                    .append(" not be recognized by the bot as being a valid reaction.").appendLine(2)
                    .append(`The ${EmojiConstants.RIGHT_TRIANGLE_EMOJI} emoji will point to the currently selected reaction.`)
                    .appendLine()
                    .append("- You can move this arrow up or down by either pressing the Up/Down button, or by using")
                    .append(" the jump (`j`) command. For example, to move the arrow down 2, send `j 2`. To move the")
                    .append(" arrow up 4, send `j -4`.")
                    .appendLine()
                    .append("- You can either change the name of the reaction *or* change the emoji used to represent")
                    .append(" this reaction; in either case, just press the corresponding button.")
                    .appendLine()
                    .append("- You can also delete the selected reaction by pressing the **Remove** button.")
                    .appendLine()
                    .append("Otherwise, you can add an emoji; press the **Add**.")
                    .appendLine(2)
                    .append("Once you are done, you can either __Save__ your changes, or go __Back__ to the previous")
                    .append(" page without saving your changes.")
                    .toString()
            );

        // Asks the user for an emoji for this reaction
        async function getEmojiForReaction(): Promise<TimedResult<{ identifier: string; isCustom: boolean; }>> {
            const emojiEmbed = new MessageEmbed()
                .setAuthor({ name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined })
                .setTitle("Select New Emoji")
                .setDescription("You will now specify the emoji for this reaction. To specify the emoji that you"
                    + " want to use for this reaction, **react to this message with the emoji.** If you decide that"
                    + " you don't want to do this, press the **Cancel** button.");

            await botMsg.edit({
                embeds: [emojiEmbed],
                components: AdvancedCollector.getActionRowsFromComponents([
                    ButtonConstants.CANCEL_BUTTON
                ])
            });

            return new Promise(async (resolve) => {
                const iCollector = botMsg.createMessageComponentCollector({
                    filter: i => i.user.id === ctx.user.id,
                    time: 60 * 1000
                });

                iCollector.on("collect", async i => {
                    await i.deferUpdate();
                    iCollector.stop();
                    rCollector.stop();
                    return resolve({
                        value: null,
                        status: TimedStatus.CANCELED
                    });
                });

                const rCollector = botMsg.createReactionCollector({
                    filter: (r, u) => u.id === ctx.user.id,
                    time: 60 * 1000
                });

                rCollector.on("collect", async r => {
                    rCollector.stop();
                    iCollector.stop();
                    return resolve({
                        status: TimedStatus.SUCCESS,
                        value: {
                            identifier: r.emoji.id ?? r.emoji.name ?? "",
                            isCustom: !!r.emoji.id
                        }
                    });
                });

                rCollector.on("end", async (c, r) => {
                    if (r === "time") {
                        return resolve({
                            status: TimedStatus.TIMED_OUT,
                            value: null
                        });
                    }
                });
            });
        }

        let selectedIdx = 0;
        while (true) {
            addButton.setDisabled(currentReactions.length + 1 > ConfigReactionsImages.MAX_CUSTOM_REACTIONS);
            removeButton.setDisabled(currentReactions.length === 0);
            upButton.setDisabled(currentReactions.length <= 1);
            downButton.setDisabled(currentReactions.length <= 1);
            changeEmojiBtn.setDisabled(currentReactions.length === 0);
            changeNameBtn.setDisabled(currentReactions.length === 0);

            embed.fields = [];
            const fields = ArrayUtilities.arrayToStringFields(
                currentReactions,
                (i, elem) => {
                    const cType = ConfigReactionsImages.ALL_REACTION_TYPES.find(x => x.type === elem.value.type);
                    const sb = new StringBuilder();
                    if (i === selectedIdx)
                        sb.append(EmojiConstants.RIGHT_TRIANGLE_EMOJI).append(" ");
                    sb.append(`**\`${elem.value.name}\`**`)
                        .append(" ")
                        .append(GlobalFgrUtilities.getNormalOrCustomEmoji(elem.value))
                        .appendLine()
                        .append(`- Type: **\`${cType?.name ?? "N/A"}\`**`)
                        .appendLine(2);

                    return sb.toString();
                }
            );

            for (const field of fields) {
                embed.addField(GeneralConstants.ZERO_WIDTH_SPACE, field);
            }

            await botMsg.edit({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });

            const res = await AdvancedCollector.startInteractionCollector({
                targetChannel: ctx.channel,
                acknowledgeImmediately: true,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                duration: 60 * 1000,
                targetAuthor: ctx.user,
                oldMsg: botMsg
            });

            if (!res) {
                await this.dispose(ctx, botMsg);
                return;
            }

            switch (res.customId) {
                case ButtonConstants.BACK_ID: {
                    await this.mainMenu(ctx, botMsg);
                    return;
                }
                case ButtonConstants.ADD_ID: {
                    const newEmoji = await getEmojiForReaction();

                    if (newEmoji.status === TimedStatus.TIMED_OUT) {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (newEmoji.status === TimedStatus.CANCELED)
                        break;

                    const newName = await this.getNameFunction(ctx, botMsg, "REACTION")();
                    if (newName.status === TimedStatus.TIMED_OUT) {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (newName.status === TimedStatus.CANCELED)
                        break;

                    const selectMenu = new MessageSelectMenu()
                        .setCustomId("select")
                        .setMaxValues(1)
                        .setMaxValues(1)
                        .addOptions(ConfigReactionsImages.ALL_REACTION_TYPES.map(x => {
                            return {
                                description: x.desc,
                                label: x.name,
                                value: x.type
                            };
                        }));

                    await botMsg.edit({
                        embeds: [
                            new MessageEmbed()
                                .setAuthor({ name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined })
                                .setTitle("Specify Reaction Type")
                                .setDescription("Please select the category that best represents this reaction."
                                    + " __Once you select a category, you cannot change it.__ If you do not want to"
                                    + " create a reaction, press the **Cancel** button.")
                        ],
                        components: AdvancedCollector.getActionRowsFromComponents([
                            selectMenu,
                            ButtonConstants.CANCEL_BUTTON
                        ])
                    });

                    const reactionType = await AdvancedCollector.startInteractionCollector({
                        acknowledgeImmediately: true,
                        clearInteractionsAfterComplete: false,
                        deleteBaseMsgAfterComplete: false,
                        duration: 60 * 1000,
                        oldMsg: botMsg,
                        targetAuthor: ctx.user,
                        targetChannel: ctx.channel
                    });

                    if (!reactionType) {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (!reactionType.isSelectMenu())
                        break;

                    currentReactions.push({
                        key: `${newName.value!.toUpperCase()}_${Date.now()}_${StringUtil.generateRandomString(10)}`,
                        value: {
                            type: reactionType.values[0] as ReactionType,
                            name: newName.value!,
                            emojiInfo: newEmoji.value!,
                            isExaltKey: false
                        }
                    });
                    break;
                }
                case ButtonConstants.REMOVE_ID: {
                    currentReactions.splice(selectedIdx, 1);
                    selectedIdx %= currentReactions.length;
                    break;
                }
                case "change_emoji": {
                    const r = await getEmojiForReaction();

                    if (r.status === TimedStatus.TIMED_OUT) {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (r.status === TimedStatus.CANCELED)
                        break;

                    currentReactions[selectedIdx].value.emojiInfo = r.value!;
                    break;
                }
                case "change_name": {
                    const r = await this.getNameFunction(ctx, botMsg, "REACTION")();
                    if (r.status === TimedStatus.TIMED_OUT) {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (r.status === TimedStatus.CANCELED)
                        break;

                    currentReactions[selectedIdx].value.name = r.value!;
                    break;
                }
                case ButtonConstants.SAVE_ID: {
                    ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc({ guildId: ctx.guild!.id }, {
                        $set: {
                            "properties.customReactions": currentReactions
                        }
                    });
                    await this.mainMenu(ctx, botMsg);
                    return;
                }
                case ButtonConstants.QUIT_ID: {
                    await this.dispose(ctx, botMsg);
                    return;
                }
                case ButtonConstants.UP_ID: {
                    selectedIdx = (selectedIdx + currentReactions.length - 1) % currentReactions.length;
                    break;
                }
                case ButtonConstants.DOWN_ID: {
                    selectedIdx++;
                    selectedIdx %= currentReactions.length;
                    break;
                }
            }
        }
    }
}