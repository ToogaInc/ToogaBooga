import { CommandInteraction, Interaction, Message } from "discord.js";
import { Bot } from "../Bot";
import { GuildFgrUtilities } from "../utilities/fetch-get-request/GuildFgrUtilities";
import { MongoManager } from "../managers/MongoManager";
import { GlobalFgrUtilities } from "../utilities/fetch-get-request/GlobalFgrUtilities";
import { VerifyManager } from "../managers/VerifyManager";
import { RaidInstance } from "../instances/RaidInstance";
import { IGuildInfo } from "../definitions";
import { MessageUtilities } from "../utilities/MessageUtilities";
import { StringUtil } from "../utilities/StringUtilities";
import { ICommandContext } from "../commands";
import { TimeUtilities } from "../utilities/TimeUtilities";
import { MessageConstants } from "../constants/MessageConstants";
import { StringBuilder } from "../utilities/StringBuilder";
import { ModmailManager } from "../managers/ModmailManager";
import { ButtonConstants } from "../constants/ButtonConstants";

/**
 * Acknowledges a slash command.
 * @param {CommandInteraction} interaction The interaction.
 */
async function acknowledgeSlashCmd(interaction: CommandInteraction): Promise<void> {
    if (interaction.guild) {
        if (Bot.BotInstance.config.ids.exemptGuilds.includes(interaction.guild.id))
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
    const foundCommand = Bot.NameCommands.get(interaction.commandName);
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
            .addField("Remaining", StringUtil.codifyString(TimeUtilities.formatDuration(cooldownLeft, true, false)))
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

    // Check if too many people running
    if (ctx.guild && foundCommand.hasMaxConcurrentUsersRunning(ctx.guild.id)) {
        const tooManyPeopleEmbed = MessageUtilities.generateBlankEmbed(ctx.user, "RED")
            .setTitle("Too Many People Using Command.")
            .setDescription(
                `Only a maximum of ${foundCommand.getGuildConcurrentLimit()} user(s) can run this command at any given`
                + " time. Please wait for someone to stop using the command."
            ).setTimestamp();
        return interaction.reply({
            embeds: [tooManyPeopleEmbed],
            ephemeral: true
        });
    }

    // Don't let the user run the command again if they are already running it
    if (!foundCommand.allowsMultipleExecutionsByUser() && foundCommand.hasActiveUser(ctx.user.id, ctx.guild?.id)) {
        const alreadyRunningCmdEmbed = MessageUtilities.generateBlankEmbed(ctx.user, "RED")
            .setTitle("Already Using Command.")
            .setDescription(
                "You are already using this command. If you can't find the running instance, please wait a few minutes"
                + " for the command to time-out before you try again."
            ).setTimestamp();
        return interaction.reply({
            embeds: [alreadyRunningCmdEmbed],
            ephemeral: true
        });
    }

    // Check permissions
    const canRunInfo = foundCommand.hasPermissionToRun(ctx.member!, ctx.guild, guildDoc!);
    if (!Bot.BotInstance.config.ids.botOwnerIds.includes(ctx.user.id) && !canRunInfo.hasAdmin)
        foundCommand.addToCooldown(ctx.user);

    if (canRunInfo.canRun) {
        foundCommand.addActiveUser(ctx.user.id, ctx.guild?.id);
        await foundCommand.run(ctx);
        foundCommand.removeActiveUser(ctx.user.id, ctx.guild?.id);
        return;
    }

    // Acknowledge any permission issues.
    const noPermSb = new StringBuilder()
        .append("You, or the bot, are missing permissions needed to run the command.");
    const noPermissionEmbed = MessageUtilities.generateBlankEmbed(ctx.user, "RED")
        .setTitle("Missing Permissions.");

    if (canRunInfo.missingUserPerms.length !== 0) {
        noPermissionEmbed.addField("Missing Member Permissions (Need ≥ 1)", StringUtil.codifyString(canRunInfo
            .missingUserPerms.join(", ")));
        noPermSb.appendLine()
            .append("- You need to fulfill at least __one__ of the missing member permissions.");
    }

    if (canRunInfo.missingUserRoles.length !== 0) {
        noPermissionEmbed.addField("Missing Member Roles (Need ≥ 1)", StringUtil.codifyString(canRunInfo
            .missingUserRoles.join(", ")));
        noPermSb.appendLine()
            .append("- You need to fulfill at least __one__ of the missing member permissions.");
    }

    if (canRunInfo.missingBotPerms.length !== 0) {
        noPermissionEmbed.addField("Missing Bot Permissions (Need All)", StringUtil.codifyString(canRunInfo
            .missingBotPerms.join(", ")));
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
    if (!guild || Bot.BotInstance.config.ids.exemptGuilds.includes(guild.id)) return;

    // Make sure we aren't dealing with a bot.
    if (interaction.user.bot) return;

    // Get corresponding channel.
    const channel = interaction.channel;
    if (!channel || !channel.isText()) return;
    const resolvedChannel = await channel.fetch();
    const guildDoc = await MongoManager.getOrCreateGuildDoc(guild.id, true);

    // If this is happening in control panel, don't process it
    const allControlPanelChannels = [
        guildDoc.channels.raids.controlPanelChannelId,
        ...guildDoc.guildSections.map(x => x.channels.raids.controlPanelChannelId)
    ];

    if (allControlPanelChannels.includes(resolvedChannel.id))
        return;

    // Get guild document, users, and message.
    const [resolvedUser, resolvedMember, message] = await Promise.all([
        GlobalFgrUtilities.fetchUser(interaction.user.id),
        GuildFgrUtilities.fetchGuildMember(guild, interaction.user.id),
        GuildFgrUtilities.fetchMessage(resolvedChannel, interaction.message.id)
    ]);

    // All must exist.
    if (!resolvedMember || !resolvedUser || !message) return;

    // Check MANUAL VERIFICATION
    const manualVerifyChannels = guildDoc.manualVerificationEntries
        .find(x => x.manualVerifyMsgId === message.id && x.manualVerifyChannelId === channel.id);

    if (manualVerifyChannels) {
        interaction.deferUpdate().catch();
        VerifyManager.acknowledgeManualVerifyRes(manualVerifyChannels, resolvedMember, interaction.customId, message)
            .then();
        return;
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

    // Check modmail
    if (channel.id === guildDoc.channels.modmailChannelId) {
        interaction.deferUpdate().catch();
        if (!(interaction.message instanceof Message) || interaction.message.embeds.length === 0) {
            return;
        }

        switch (interaction.customId) {
            case ButtonConstants.OPEN_THREAD_ID: {
                await ModmailManager.openModmailThread(guildDoc, interaction.message, resolvedMember);
                return;
            }
            case ButtonConstants.REMOVE_ID: {
                await ModmailManager.closeModmailThread(interaction.message, guildDoc);
                return;
            }
        }
    }
}
