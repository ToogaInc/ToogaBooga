import {CommandInteraction, Interaction, NewsChannel, TextChannel} from "discord.js";
import {OneLifeBot} from "../OneLifeBot";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {MongoManager} from "../managers/MongoManager";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";
import {ModmailManager} from "../managers/ModmailManager";
import {VerifyManager} from "../managers/VerifyManager";
import {RaidInstance} from "../instances/RaidInstance";
import {IGuildInfo} from "../definitions";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {StringUtil} from "../utilities/StringUtilities";
import {ICommandContext} from "../commands";
import {TimeUtilities} from "../utilities/TimeUtilities";
import {MessageConstants} from "../constants/MessageConstants";
import {StringBuilder} from "../utilities/StringBuilder";

/**
 * Acknowledges a slash command.
 * @param {CommandInteraction} interaction The interaction.
 */
async function acknowledgeSlashCmd(interaction: CommandInteraction): Promise<void> {
    if (interaction.guild) {
        if (OneLifeBot.BotInstance.config.ids.exemptGuilds.includes(interaction.guild.id))
            return;

        return slashCommandHandler(
            interaction,
            await MongoManager.getOrCreateGuildDoc(interaction.guild.id, true)
        );
    }

    return slashCommandHandler(interaction);
}

/**
 * Executes the slash command, if any.
 * @param {CommandInteraction} interaction The interaction.
 * @param {IGuildInfo} guildDoc The guild document, if any.
 */
async function slashCommandHandler(interaction: CommandInteraction, guildDoc?: IGuildInfo): Promise<void> {
    const foundCommand = OneLifeBot.NameCommands.get(interaction.commandName);
    if (!foundCommand)
        return;

    const ctx: ICommandContext = {
        user: interaction.user,
        guild: interaction.guild,
        guildDoc: guildDoc ?? null,
        interaction: interaction,
        // TODO when is this null?
        channel: interaction.channel!,
        member: interaction.guild
            ? await GuildFgrUtilities.getCachedMember(interaction.guild, interaction.user.id)
            : null
    };

    // Check cooldown.
    const cooldownLeft = foundCommand.checkCooldownFor(ctx.user);
    if (cooldownLeft > 0) {
        const onCooldownEmbed = MessageUtilities.generateBlankEmbed(ctx.user, "RED")
            .setTitle("On Cooldown.")
            .setDescription("You are currently on cooldown.")
            .addField("Remaining", StringUtil.codifyString(TimeUtilities.formatDuration(cooldownLeft, false)))
            .setTimestamp();
        return interaction.reply({
            embeds: [onCooldownEmbed],
            ephemeral: true
        });
    }

    // Guild only?
    if (foundCommand.commandInfo.guildOnly && (!ctx.guild || !ctx.guildDoc)) {
        return interaction.reply({
            embeds: [MessageConstants.NOT_IN_GUILD_EMBED.setTimestamp()],
            ephemeral: true
        });
    }

    // Is the command blocked
    const cmdInfo = foundCommand.commandInfo;
    if (ctx.guild && guildDoc && guildDoc.properties.blockedCommands.some(x => cmdInfo.cmdCode === x)) {
        return interaction.reply({
            embeds: [MessageConstants.COMMAND_BLOCKED_EMBED.setTimestamp()],
            ephemeral: true
        });
    }

    // Check permissions
    const canRunInfo = foundCommand.hasPermissionToRun(ctx.member!, ctx.guild, guildDoc!);
    if (!OneLifeBot.BotInstance.config.ids.botOwnerIds.includes(ctx.user.id) && !canRunInfo.hasAdmin)
        foundCommand.addToCooldown(ctx.user);

    if (canRunInfo.canRun) {
        await foundCommand.run(ctx);
        return;
    }

    // Acknowledge any permission issues.
    const noPermSb = new StringBuilder()
        .append("You, or the bot, are missing permissions needed to run the command.");
    const noPermissionEmbed = MessageUtilities.generateBlankEmbed(ctx.user, "RED")
        .setTitle("Missing Permissions.");

    if (canRunInfo.missingUserPerms.length !== 0 && canRunInfo.missingUserRoles.length !== 0) {
        noPermissionEmbed.addField("Missing Member Permissions (Need ≥ 1)", StringUtil.codifyString(canRunInfo
            .missingUserPerms.join(" ")))
            .addField("Missing Member Roles (Need ≥ 1)", StringUtil.codifyString(canRunInfo.missingUserRoles
                .join(" ")));
        noPermSb.appendLine()
            .append("- You need to fulfill at least __one__ of the two missing member permissions.");
    }

    if (canRunInfo.missingBotPerms.length !== 0) {
        noPermissionEmbed.addField("Missing Bot Permissions (Need All)", StringUtil.codifyString(canRunInfo
            .missingBotPerms.join(" ")));
        noPermSb.appendLine()
            .append("- The bot needs every permission that is specified to run this command.");
    }

    if (noPermissionEmbed.fields.length === 0) {
        noPermissionEmbed.addField("Unknown Error", "Something wrong occurred. Please try again later.");
        noPermSb.appendLine()
            .append("- Unknown error occurred. Please report this.");
    }

    await interaction.reply({
        embeds: [noPermissionEmbed.setDescription(noPermSb.toString())]
    });
}


export async function onInteractionEvent(interaction: Interaction): Promise<void> {
    if (interaction.isCommand()) {
        await acknowledgeSlashCmd(interaction);
        return;
    }

    // Must be a button.
    if (!interaction.isButton()) return;

    // Must be in a non-exempt guild.
    const guild = interaction.guild;
    if (!guild || OneLifeBot.BotInstance.config.ids.exemptGuilds.includes(guild.id)) return;

    // Make sure we aren't dealing with a bot.
    if (interaction.user.bot) return;

    // Get corresponding channel.
    const channel = interaction.channel;
    if (!channel || !channel.isText() || channel instanceof NewsChannel) return;
    const resolvedChannel = await channel.fetch();

    // Get guild document, users, and message.
    const [resolvedUser, resolvedMember, message, guildDoc] = await Promise.all([
        GlobalFgrUtilities.fetchUser(interaction.user.id),
        GuildFgrUtilities.fetchGuildMember(guild, interaction.user.id),
        GuildFgrUtilities.fetchMessage(resolvedChannel, interaction.message.id),
        MongoManager.getOrCreateGuildDoc(guild.id, true)
    ]);

    // All must exist.
    if (!resolvedMember || !resolvedUser || !message) return;

    // Check MODMAIL
    if (guildDoc.channels.modmailChannelId === resolvedChannel.id) {
        // Several choices.
        switch (interaction.customId) {
            case ModmailManager.MODMAIL_REPLY_ID: {
                await ModmailManager.respondToGeneralModmail(
                    message,
                    resolvedMember
                );
                return;
            }
            case ModmailManager.MODMAIL_DELETE_ID: {
                if ((message.embeds[0].description?.length ?? 0) <= 15) {
                    await message.delete().catch();
                    return;
                }
                await ModmailManager.askDeleteModmailMessage(
                    message,
                    resolvedMember
                );
                return;
            }
            case ModmailManager.MODMAIL_BLACKLIST_ID: {
                await ModmailManager.blacklistFromModmail(
                    message,
                    resolvedMember,
                    guildDoc
                );
                return;
            }
            case ModmailManager.MODMAIL_CREATE_ID: {
                await ModmailManager.convertToThread(
                    message,
                    resolvedMember
                );
                return;
            }
        }
    }

    const thread = guildDoc.properties.modmailThreads
        .find(x => x.channel === channel.id);
    if (thread) {
        switch (interaction.customId) {
            case ModmailManager.MODMAIL_REPLY_ID: {
                await ModmailManager.respondToThreadModmail(
                    thread,
                    resolvedMember,
                    guildDoc,
                    channel as TextChannel
                );
                return;
            }
            case ModmailManager.MODMAIL_DELETE_ID: {
                await ModmailManager.closeModmailThread(
                    channel as TextChannel,
                    thread,
                    guildDoc,
                    resolvedMember
                );
                return;
            }
            case ModmailManager.MODMAIL_BLACKLIST_ID: {
                await ModmailManager.blacklistFromModmail(
                    message,
                    resolvedMember,
                    guildDoc,
                    thread
                );
                return;
            }
        }
    }

    // Check VERIFICATION
    if (guildDoc.channels.verification.verificationChannelId === resolvedChannel.id && interaction.message.author.bot) {
        await VerifyManager.verifyInteraction(interaction, guildDoc, MongoManager.getMainSection(guildDoc));
        return;
    }

    const relevantSec = guildDoc.guildSections
        .find(x => x.channels.verification.verificationChannelId === resolvedChannel.id);
    if (relevantSec) {
        await VerifyManager.verifyInteraction(interaction, guildDoc, relevantSec);
        return;
    }

    // Check AFK CHECKS (reconnect button)
    for (const [msgId, afkCheckInstance] of RaidInstance.ActiveRaids) {
        if (msgId !== message.id)
            continue;
        await afkCheckInstance.interactionEventFunction(interaction);
        return;
    }
}
