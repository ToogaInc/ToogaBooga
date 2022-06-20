import { BaseCommand, ICommandContext } from "../BaseCommand";
import { Bot } from "../../Bot";
import { MessageUtilities } from "../../utilities/MessageUtilities";
import { GeneralConstants } from "../../constants/GeneralConstants";
import { StringUtil } from "../../utilities/StringUtilities";
import { TimeUtilities } from "../../utilities/TimeUtilities";
import { GlobalFgrUtilities } from "../../utilities/fetch-get-request/GlobalFgrUtilities";

export class BotInfo extends BaseCommand {
    public constructor() {
        super({
            cmdCode: "BOT_INFO_COMMAND",
            formalCommandName: "Bot Information",
            botCommandName: "botinfo",
            description: "Gets information about the bot.",
            rolePermissions: [],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 4 * 1000,
            argumentInfo: [],
            guildOnly: false,
            botOwnerOnly: false
        });
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        const instance = Bot.BotInstance;
        const serverCount = instance.client.guilds.cache.size - instance.client.guilds.cache
            .filter(x => instance.config.ids.exemptGuilds.includes(x.id)).size;
        const botOwners = (await Promise.all(
            instance.config.ids.botOwnerIds.map(async x => await GlobalFgrUtilities.fetchUser(x))
        )).filter(x => x !== null);

        const embed = MessageUtilities.generateBlankEmbed(ctx.user, "BLUE")
            .setTitle(`Bot Information: ${instance.client.user!.tag}`)
            .setDescription(
                "An open-source Realm of the Mad God Discord bot designed for cross-server verification, moderation,"
                + " and raid management. Designed with customizability in mind. This is a rewrite of my old bot,"
                + " [ZeroRaidBot](https://github.com/ewang2002/ZeroRaidBot)."
            )
            .addField("Server Count", StringUtil.codifyString(serverCount), true)
            .addField(
                "Uptime",
                StringUtil.codifyString(
                    TimeUtilities.formatDuration(Date.now() - instance.instanceStarted.getTime(), true, false)
                ), true
            )
            .addField("Bot Developer(s)", botOwners.map(x => `${x} (${x!.tag})`).join("\n"))
            .addField("Github Link", `Click [Here](${GeneralConstants.GITHUB_URL})`)
            .addField(
                "Invite Policy",
                "Please message a bot owner directly if you are interested in getting this bot for your server. We"
                + " may or may not accommodate your request."
            )
            .setThumbnail(instance.client.user!.displayAvatarURL())
            .setImage(GeneralConstants.BOT_BANNER);

        await ctx.interaction.reply({
            embeds: [embed]
        });
        return 0;
    }
}