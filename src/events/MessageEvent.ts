import {Guild, Message} from "discord.js";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {OneRealmBot} from "../OneRealmBot";
import {MongoManager} from "../managers/MongoManager";
import {BaseCommand} from "../commands/BaseCommand";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {StringUtil} from "../utilities/StringUtilities";
import {StringBuilder} from "../utilities/StringBuilder";
import {InteractionManager} from "../managers/InteractionManager";

export async function onMessageEvent(msg: Message): Promise<void> {
    // We don't care about non-regular messages, bot messages, or webhook messages.
    if (msg.type !== "DEFAULT" || msg.author.bot || msg.webhookID)
        return;

    if (msg.guild) {
        if (OneRealmBot.BotInstance.config.ids.exemptGuilds.includes(msg.guild.id))
            return;

        const guildDoc = await MongoManager.getDefaultGuildConfig(msg.guild.id);
        return await commandHandler(msg, msg.guild, guildDoc);
    }

    // TODO make modmail better.
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
    const prefixes = [OneRealmBot.BotInstance.config.misc.defaultPrefix];
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
    outerLoop: for (const [, cmd] of OneRealmBot.Commands) {
        for (const c of cmd) {
            if (c.commandInfo.botCommandNames.includes(cmdWithNoPrefix)) {
                foundCommand = c;
                break outerLoop;
            }
        }
    }

    // No command found = return.
    if (!foundCommand)
        return;

    // Check some basic permission issues.
    // Start with bot owner.
    const isBotOwner = OneRealmBot.BotInstance.config.ids.botOwnerIds.includes(msg.author.id);
    if (foundCommand.commandInfo.botOwnerOnly && !isBotOwner) {
        const noBotOwnerEmbed = MessageUtilities.generateBlankEmbed(msg.author, "RED")
            .setTitle("Bot Owner Only Command.")
            .setDescription("The command you are trying to execute is for bot owners only.")
            .setTimestamp();
        return MessageUtilities.sendThenDelete({embed: noBotOwnerEmbed}, msg.channel);
    }

    // Check cooldown.
    const cooldownLeft = foundCommand.checkCooldownFor(msg.author);
    if (cooldownLeft !== -1) {
        const cooldownInSecRounded = Math.round(cooldownLeft) / 1000;
        const onCooldownEmbed = MessageUtilities.generateBlankEmbed(msg.author, "RED")
            .setTitle("On Cooldown.")
            .setDescription("You are currently on cooldown.")
            .addField("Cooldown Remaining", StringUtil.codifyString(`${cooldownInSecRounded} Seconds.`))
            .setTimestamp();
        return MessageUtilities.sendThenDelete({embed: onCooldownEmbed}, msg.channel);
    }

    // Guild only?
    if (foundCommand.commandInfo.guildOnly && !msg.guild) {
        const notInGuild = MessageUtilities.generateBlankEmbed(msg.author, "RED")
            .setTitle("Server Command Only.")
            .setDescription("The command you are trying to execute can only be executed in the server.")
            .addField("Message Content", StringUtil.codifyString(msg.content))
            .setTimestamp();
        return MessageUtilities.sendThenDelete({embed: notInGuild}, msg.channel);
    }

    // Is the command blocked
    const cmdInfo = foundCommand.commandInfo;
    if (msg.guild && guildDoc && guildDoc.properties.blockedCommands.some(x => cmdInfo.cmdCode === x)) {
        const commandBlockedEmbed = MessageUtilities.generateBlankEmbed(msg.author, "RED")
            .setTitle("Command Blocked.")
            .setDescription("The command you are trying to execute is blocked by your server administrator.")
            .setTimestamp();
        return MessageUtilities.sendThenDelete({embed: commandBlockedEmbed}, msg.channel);
    }

    // If not in guild, then we can just run it from here.
    if (!guild) {
        if (!isBotOwner) foundCommand.addToCooldown(msg.author);
        await foundCommand.run(msg, args, null);
        return;
    }

    const member = await guild.members.fetch(msg.author);
    // Check permissions now.
    const canRunInfo = foundCommand.hasPermissionToRun(member, guild, guildDoc as IGuildInfo);

    // If no permission issues arise, then we can run like normal.
    if (canRunInfo.canRun) {
        if (!isBotOwner && !canRunInfo.hasAdmin) foundCommand.addToCooldown(msg.author);
        await foundCommand.run(msg, args, guildDoc as IGuildInfo);
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
    MessageUtilities.sendThenDelete({embed: noPermissionEmbed}, msg.channel, 10 * 1000);
}