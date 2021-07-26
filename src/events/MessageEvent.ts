import {Guild, Message} from "discord.js";
import {IGuildInfo} from "../definitions/db/IGuildInfo";
import {OneLifeBot} from "../OneLifeBot";
import {MongoManager} from "../managers/MongoManager";
import {BaseCommand} from "../commands";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {StringUtil} from "../utilities/StringUtilities";
import {StringBuilder} from "../utilities/StringBuilder";
import {InteractionManager} from "../managers/InteractionManager";
import {ModmailManager} from "../managers/ModmailManager";
import {MessageConstants} from "../constants/MessageConstants";

export async function onMessageEvent(msg: Message): Promise<void> {
    // We don't care about non-regular messages, bot messages, or webhook messages.
    if (msg.type !== "DEFAULT" || msg.author.bot || msg.webhookId)
        return;

    if (msg.guild) {
        if (OneLifeBot.BotInstance.config.ids.exemptGuilds.includes(msg.guild.id))
            return;

        const guildDoc = await MongoManager.getOrCreateGuildDoc(msg.guild.id, true);
        return await commandHandler(msg, msg.guild, guildDoc);
    }

    // If this person is in any interactive menus in DMs, then don't let them run commands in DMs.
    if (InteractionManager.InteractiveMenu.has(msg.author.id))
        return;

    return await commandHandler(msg);
}

/**
 * The command handler function.
 * @param {Message} msg The message object.
 * @param {Guild} guild The guild object.
 * @param {IGuildInfo} guildDoc The guild database.
 */
async function commandHandler(msg: Message, guild?: Guild, guildDoc?: IGuildInfo): Promise<void> {
    const prefixes = [OneLifeBot.BotInstance.config.misc.defaultPrefix];
    if (guildDoc)
        prefixes.push(guildDoc.properties.prefix);

    let usedPrefix: string | undefined;
    for (const p of prefixes) {
        if (msg.content.indexOf(p) !== 0) continue;
        usedPrefix = p;
        break;
    }

    // No prefix means no command to handle. Maybe modmail?
    if (!usedPrefix) {
        return;
    }

    const messageArray = msg.content.split(/ +/);
    const cmdWithPrefix = messageArray[0];
    const args = messageArray.slice(1);
    const cmdWithNoPrefix = cmdWithPrefix.slice(usedPrefix.length);

    // Get the correct command.
    let foundCommand: BaseCommand | undefined;
    outerLoop: for (const [, cmd] of OneLifeBot.Commands) {
        for (const c of cmd) {
            if (c.commandInfo.botCommandNames.includes(cmdWithNoPrefix)) {
                foundCommand = c;
                break outerLoop;
            }
        }
    }

    // No command found = deal with modmail and return.
    if (!foundCommand) {
        if (msg.guild || InteractionManager.InteractiveMenu.has(msg.author.id))
            return;
        await ModmailManager.initiateModmailContact(msg.author, msg);
        return;
    }

    // Check some basic permission issues.
    // Start with bot owner.
    const isBotOwner = OneLifeBot.BotInstance.config.ids.botOwnerIds.includes(msg.author.id);
    if (foundCommand.commandInfo.botOwnerOnly && !isBotOwner) {
        const noBotOwnerEmbed = MessageUtilities.generateBlankEmbed(msg.author, "RED")
            .setTitle("Bot Owner Only Command.")
            .setDescription("The command you are trying to execute is for bot owners only.")
            .setTimestamp();
        return MessageUtilities.sendThenDelete({embeds: [noBotOwnerEmbed]}, msg.channel);
    }

    // Check cooldown.
    const cooldownLeft = foundCommand.checkCooldownFor(msg.author);
    if (cooldownLeft !== -1) {
        const cooldownInSecRounded = Math.round(cooldownLeft / 1000);
        const onCooldownEmbed = MessageUtilities.generateBlankEmbed(msg.author, "RED")
            .setTitle("On Cooldown.")
            .setDescription("You are currently on cooldown.")
            .addField("Cooldown Remaining", StringUtil.codifyString(`${cooldownInSecRounded} Seconds.`))
            .setTimestamp();
        return MessageUtilities.sendThenDelete({embeds: [onCooldownEmbed]}, msg.channel);
    }

    // Guild only?
    if (foundCommand.commandInfo.guildOnly && !msg.guild) {
        return MessageUtilities.sendThenDelete({
            embeds: [MessageConstants.NOT_IN_GUILD_EMBED.setTimestamp()]
        }, msg.channel);
    }

    // Is the command blocked
    const cmdInfo = foundCommand.commandInfo;
    if (msg.guild && guildDoc && guildDoc.properties.blockedCommands.some(x => cmdInfo.cmdCode === x)) {
        return MessageUtilities.sendThenDelete({
            embeds: [MessageConstants.COMMAND_BLOCKED_EMBED.setTimestamp()]
        }, msg.channel);
    }

    // Correct number of arguments?
    if (args.length < cmdInfo.minArgs) {
        const notEnoughArguments = MessageUtilities.generateBlankEmbed(msg.author, "RED")
            .setTitle("Not Enough Arguments.")
            .setDescription(`The command you are trying to execute requires at least ${cmdInfo.minArgs} arguments. `
                + `You provided ${args.length} arguments. Please try again.`)
            .setTimestamp();
        return MessageUtilities.sendThenDelete({embeds: [notEnoughArguments]}, msg.channel);
    }

    // If not in guild, then we can just run it from here.
    if (!guild) {
        if (!isBotOwner) foundCommand.addToCooldown(msg.author);
        await foundCommand.run(msg, args);
        return;
    }

    const member = await guild.members.fetch(msg.author);
    // Check permissions now.
    const canRunInfo = foundCommand.hasPermissionToRun(member, guild, guildDoc as IGuildInfo);

    // If no permission issues arise, then we can run like normal.
    if (canRunInfo.canRun) {
        if (!isBotOwner && !canRunInfo.hasAdmin) foundCommand.addToCooldown(msg.author);
        await foundCommand.run(msg, args, guildDoc);
        return;
    }

    // Acknowledge any permission issues.
    const noPermSb = new StringBuilder()
        .append("You, or the bot, are missing permissions needed to run the command.");
    const noPermissionEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
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

    noPermissionEmbed.setDescription(noPermSb.toString())
        .addField("Command Used", StringUtil.codifyString(msg.content));
    MessageUtilities.sendThenDelete({embeds: [noPermissionEmbed]}, msg.channel, 10 * 1000);
}