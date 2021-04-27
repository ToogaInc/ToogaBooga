import {DMChannel, Guild, MessageEmbed, User} from "discord.js";
import {MongoManager} from "./MongoManager";
import {AdvancedCollector} from "../utilities/collectors/AdvancedCollector";
import {ArrayUtilities} from "../utilities/ArrayUtilities";

export namespace ModmailManager {


    /**
     * Selects a guild where the modmail message should be sent to. This is invoked if and only if the member is
     * able to send a message to the bot (which implies that the bot is able to send a message to the user).
     * @param {User} user The user.
     * @return {Promise<Guild | null>} The guild.
     * @private
     */
    async function chooseGuild(user: User): Promise<Guild | null> {
        const guildsToChoose: Guild[] = [];
        const allGuilds = await MongoManager.getGuildCollection()
            .find({}).toArray();
        for (const [id, guild] of user.client.guilds.cache) {
            const idx = allGuilds.findIndex(x => x.guildId === id);
            if (idx === -1) continue;
            if (guild.members.cache.has(user.id)
                && guild.roles.cache.has(allGuilds[idx].roles.verifiedRoleId)
                && guild.channels.cache.has(allGuilds[idx].channels.modmailChannels.modmailChannelId))
                guildsToChoose.push(guild);
        }

        if (guildsToChoose.length === 0) return null;
        if (guildsToChoose.length === 1) return guildsToChoose[0];

        const askForGuildEmbed = new MessageEmbed()
            .setAuthor(user.tag, user.displayAvatarURL())
            .setTitle("Select Server")
            .setDescription("The message sent above will be sent to a designated server of your choice. Please " +
                "select the server by typing the number corresponding to the server that you want to. To cancel, " +
                "please type `cancel`.")
            .setColor("RANDOM")
            .setFooter(`${guildsToChoose.length} Servers.`);
        const arrFieldsContent: string[] = ArrayUtilities.arrayToStringFields<Guild>(
            guildsToChoose,
            (i, elem) => `\`[${i + 1}]\` ${elem.name}\n`
        );
        for (const elem of arrFieldsContent) askForGuildEmbed.addField("Possible Guilds", elem);

        const selectedGuildIdx: number | null = await new AdvancedCollector(user.dmChannel as DMChannel, user, 1, "M")
            .startNormalCollector({
                embed: askForGuildEmbed
            }, AdvancedCollector.getNumberPrompt(user.dmChannel as DMChannel, {
                min: 1, max: guildsToChoose.length
            }), {
                cancelFlag: "cancel"
            });
        return selectedGuildIdx === null ? null : guildsToChoose[selectedGuildIdx - 1];
    }
}