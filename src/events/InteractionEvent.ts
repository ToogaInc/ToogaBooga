import {Interaction, NewsChannel} from "discord.js";
import {OneLifeBot} from "../OneLifeBot";
import {FetchGetRequestUtilities} from "../utilities/FetchGetRequestUtilities";
import {MongoManager} from "../managers/MongoManager";

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

    // Get guild document, users, and message.
    const [resolvedUser, resolvedMember, message, guildDoc] = await Promise.all([
        FetchGetRequestUtilities.fetchUser(interaction.user.id),
        FetchGetRequestUtilities.fetchGuildMember(guild, interaction.user.id),
        FetchGetRequestUtilities.fetchMessage(channel, interaction.message.id),
        MongoManager.getOrCreateGuildDb(guild.id)
    ]);

    // All must exist.
    if (!resolvedMember || !resolvedUser || !message || !guildDoc) return;
}
