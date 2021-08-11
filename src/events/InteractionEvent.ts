import {Interaction, NewsChannel} from "discord.js";
import {OneLifeBot} from "../OneLifeBot";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {MongoManager} from "../managers/MongoManager";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";

export async function onInteractionEvent(interaction: Interaction): Promise<void> {
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
        MongoManager.getOrCreateGuildDoc(guild.id)
    ]);

    // All must exist.
    if (!resolvedMember || !resolvedUser || !message || !guildDoc) return;
}
