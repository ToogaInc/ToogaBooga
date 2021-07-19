import {BaseCommand} from "../BaseCommand";
import {Message, MessageEmbed} from "discord.js";
import {MongoManager} from "../../managers/MongoManager";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {OneLifeBot} from "../../OneLifeBot";
import {ArrayUtilities} from "../../utilities/ArrayUtilities";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";

class SendAnnouncementCommand extends BaseCommand {

    public constructor() {
        super({
            cmdCode: "SEND_ANNOUNCEMENTS_COMMAND",
            formalCommandName: "Send Announcements Command",
            botCommandNames: ["sendannouncements", "announce"],
            description: "Sends an announcement to every server that has a set bot updates channel.",
            usageGuide: ["sendannouncements [Content: String]"],
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

        // If there is an attachment, get its contents.
        if (msg.attachments.size > 0) {
            const firstAttachment = msg.attachments.first()!;
            const stringData = await GlobalFgrUtilities.tryExecuteAsync(async () => {
                return OneLifeBot.AxiosClient.get<string>(firstAttachment.url);
            });
            if (stringData) {
                const desc = stringData.data.substring(0, 2000);
                embedToSend.setDescription(desc);
                const data = ArrayUtilities.breakStringIntoChunks(stringData.data.substring(2000), 1000);
                for (const f of data) {
                    embedToSend.addField("Message", f);
                }
            }
        }

        for await (const guildDoc of allGuildDocs) {
            // Guild must exist.
            const guild = await GlobalFgrUtilities.fetchGuild(guildDoc.guildId);
            if (!guild) continue;
            // Get channel. Must be a text channel.
            const botUpdatesChannel = GuildFgrUtilities
                .getCachedChannel(guild, guildDoc.channels.botUpdatesChannelId);
            if (!botUpdatesChannel || !botUpdatesChannel.isText()) continue;
            // Try to send message.
            await GlobalFgrUtilities.sendMsg(botUpdatesChannel, {
                embeds: [embedToSend]
            });
        }

        return 0;
    }
}