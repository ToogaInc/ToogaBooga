import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {MessageEmbed} from "discord.js";
import {MongoManager} from "../../managers/MongoManager";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {OneLifeBot} from "../../OneLifeBot";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";

export class SendAnnouncement extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "SEND_ANNOUNCEMENTS_COMMAND",
            formalCommandName: "Send Announcements Command",
            botCommandName: "sendbotannouncement",
            description: "Sends an announcement to every server that has a set bot updates channel.",
            commandCooldown: 0,
            generalPermissions: [],
            argumentInfo: [
                {
                    displayName: "Announcement Text",
                    argName: "announcement",
                    desc: "The announcement to send to all servers the bot is in.",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: true,
                    example: ["This is a test announcement!"]
                }
            ],
            botPermissions: [],
            rolePermissions: [],
            guildOnly: false,
            botOwnerOnly: true
        };

        super(cmi);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        // TODO check if attachment, if so read from it
        // otherwise, find better way to send attachment (maybe message collector?)
        const args = ctx.interaction.options.get("announcement", true);
        const allGuildDocs = await MongoManager.getGuildCollection().find({}).toArray();
        const embedToSend = new MessageEmbed()
            .setColor("RANDOM")
            .setTitle("Message from OneLife Developers")
            .setDescription(args.value as string)
            .setTimestamp()
            .setAuthor("OneLife", OneLifeBot.BotInstance.client.user?.displayAvatarURL());

        let numServersSent = 0;
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
            numServersSent++;
        }

        await ctx.interaction.reply({
            ephemeral: true,
            content: `Your message has been sent to **${numServersSent}** server(s)!`
        });
        return 0;
    }
}