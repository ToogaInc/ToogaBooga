import {BaseCommand} from "../BaseCommand";
import {Message, MessageEmbed} from "discord.js";
import {MongoManager} from "../../managers/MongoManager";
import {FetchRequestUtilities} from "../../utilities/FetchRequestUtilities";
import {MessageUtilities} from "../../utilities/MessageUtilities";

class SendAnnouncementCommand extends BaseCommand {

    public constructor() {
        super({
            cmdCode: "SEND_ANNOUNCEMENTS_COMMAND",
            formalCommandName: "Send Announcements Command",
            botCommandNames: ["sendannouncements", "announce"],
            description: "Sends an announcement to every server that has a set bot updates channel.",
            usageGuide: ["sendannouncements <Content>"],
            exampleGuide: ["sendannouncements Hello world!"],
            deleteCommandAfter: 10 * 1000,
            commandCooldown: 0,
            generalPermissions: [],
            botPermissions: [],
            rolePermissions: [],
            isRoleInclusive: false,
            guildOnly: false,
            botOwnerOnly: true,
            minArgs: 1
        });
    }

    public async run(msg: Message, args: string[]): Promise<number> {
        const allGuildDocs = await MongoManager.getGuildCollection().find({}).toArray();
        const embedToSend = new MessageEmbed()
            .setColor("RANDOM")
            .setTitle("Message from OneLife Developers")
            .setDescription(msg.content)
            .setTimestamp()
            .setAuthor("OneLife", msg.client.user?.displayAvatarURL());
        for await (const guildDoc of allGuildDocs) {
            // Guild must exist.
            const guild = await FetchRequestUtilities.fetchGuild(guildDoc.guildId);
            if (!guild) continue;
            // Get channel. Must be a text channel.
            const botUpdatesChannel = guild.channels.cache.get(guildDoc.channels.botUpdatesChannelId);
            if (!botUpdatesChannel || !botUpdatesChannel.isText()) continue;
            // Try to send message.
            await FetchRequestUtilities.sendMsg(botUpdatesChannel, {
                embed: embedToSend
            });
        }

        return 0;
    }

}