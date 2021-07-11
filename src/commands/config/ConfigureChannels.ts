import {BaseCommand} from "../BaseCommand";
import {Message, MessageEmbed, TextChannel} from "discord.js";
import { IGuildInfo } from "../../definitions/db/IGuildInfo";
import {FetchGetRequestUtilities} from "../../utilities/FetchGetRequestUtilities";
import {InteractivityHelper} from "../../utilities/InteractivityHelper";
import {ISectionInfo} from "../../definitions/db/ISectionInfo";
import {IConfigurationCmd} from "./IConfigurationCmd";
import {StringBuilder} from "../../utilities/StringBuilder";
import getCachedChannel = FetchGetRequestUtilities.getCachedChannel;

export class ConfigureChannelsCommand extends BaseCommand implements IConfigurationCmd {
    private NA: string = "N/A";

    public constructor() {
        super({
            cmdCode: "CONFIGURE_CHANNEL_COMMAND",
            formalCommandName: "Configure Channel Command",
            botCommandNames: ["configchannels"],
            description: "Allows the user to configure channels for the entire server or for a specific section",
            usageGuide: ["configchannels"],
            exampleGuide: ["configchannels"],
            deleteCommandAfter: 0,
            commandCooldown: 10 * 1000,
            generalPermissions: ["MANAGE_GUILD"],
            rolePermissions: ["Officer", "HeadRaidLeader", "Moderator"],
            botPermissions: ["ADD_REACTIONS", "MANAGE_MESSAGES"],
            isRoleInclusive: false,
            guildOnly: true,
            botOwnerOnly: false,
            minArgs: 0
        });
    }

    public async run(msg: Message, args: string[], guildDoc: IGuildInfo): Promise<number> {
        if (!(msg.channel instanceof TextChannel)) return -1;
        await this.entry(msg, guildDoc, null);
        return 0;
    }

    /** @inheritDoc */
    public async entry(msg: Message, guildDoc: IGuildInfo, botMsg: Message | null): Promise<void> {
        const member = FetchGetRequestUtilities.getCachedMember(msg.guild!, msg.author.id);
        if (!member) return;

        let selectedSection: ISectionInfo;
        let newBotMsg: Message;
        if (botMsg) {
            const queryResult = await InteractivityHelper.getSectionWithInitMsg(
                guildDoc,
                member,
                botMsg
            );
            if (!queryResult) return;
            newBotMsg = botMsg;
            selectedSection = queryResult;
        }
        else {
            const queryResult = await InteractivityHelper.getSectionQuery(
                guildDoc,
                msg.member!,
                msg.channel as TextChannel,
                "Please select the appropriate section that you want to change channel settings for.",
                true
            );
            if (!queryResult || !queryResult[1]) return;
            [selectedSection, newBotMsg] = queryResult;
        }

        await this.mainMenu(msg, guildDoc, selectedSection, newBotMsg);
    }

    /** @inheritDoc */
    public async mainMenu(origMsg: Message, guildDoc: IGuildInfo, section: ISectionInfo,
                          botMsg: Message): Promise<void> {
        const guild = origMsg.guild!;
        // Both main section + individual section will have their own AFK check + verification channel config.
        const raidChannelObj = section.channels.raids;
        const afkCheckChannel = getCachedChannel<TextChannel>(guild, raidChannelObj.afkCheckChannelId);
        const contPanelChannel = getCachedChannel<TextChannel>(guild, raidChannelObj.controlPanelChannelId);
        const raidReqChannel = getCachedChannel<TextChannel>(guild, raidChannelObj.raidRequestChannel);
        const rateLeaderChannel = getCachedChannel<TextChannel>(guild, raidChannelObj.rateLeaderChannel);

        const verifChannelObj = section.channels.verification;
        const verifChannel = getCachedChannel<TextChannel>(guild, verifChannelObj.verificationChannelId);
        const verifLogChannel = getCachedChannel<TextChannel>(guild, verifChannelObj.verificationLogsChannelId);
        const verifSucChannel = getCachedChannel<TextChannel>(guild, verifChannelObj.verificationSuccessChannelId);
        const manVerifChannel = getCachedChannel<TextChannel>(guild, verifChannelObj.manualVerificationChannelId);

        const currentConfiguration = new StringBuilder()
            .append("__**Raid Channels**__").appendLine()
            .append(`⇒ AFK Check Channel: ${afkCheckChannel ?? this.NA}`).appendLine()
            .append(`⇒ Control Panel Channel: ${contPanelChannel ?? this.NA}`).appendLine()
            .append(`⇒ Raid Request Channel: ${raidReqChannel ?? this.NA}`).appendLine()
            .append(`⇒ Rate Leader Channel: ${rateLeaderChannel ?? this.NA}`).appendLine()
            .appendLine()
            .append("__**Verification Channels**__").appendLine()
            .append(`⇒ Verification Channel: ${verifChannel ?? this.NA}`).appendLine()
            .append(`⇒ Verify Fail/Update Log Channel: ${verifLogChannel ?? this.NA}`).appendLine()
            .append(`⇒ Verify Success Log Channel: ${verifSucChannel ?? this.NA}`).appendLine()
            .append(`⇒ Manual Verification Channel: ${manVerifChannel ?? this.NA}`).appendLine()
            .appendLine();

        if (section.isMainSection) {
            const modmailChannels = guildDoc.channels.modmailChannels;
            const mmChannel = getCachedChannel<TextChannel>(guild, modmailChannels.modmailChannelId);
            const mmStorageChannel = getCachedChannel<TextChannel>(guild, modmailChannels.modmailStorageChannelId);
            const mmLoggingChannel = getCachedChannel<TextChannel>(guild, modmailChannels.modmailLoggingId);

            const botUpdatesChan = getCachedChannel<TextChannel>(guild, guildDoc.channels.botUpdatesChannelId);

            currentConfiguration.append("__**Modmail Channels**__").appendLine()
                .append(`⇒ Modmail Channel: ${mmChannel ?? this.NA}`).appendLine()
                .append(`⇒ Modmail Storage Channel: ${mmStorageChannel ?? this.NA}`).appendLine()
                .append(`⇒ Modmail Logging Channel: ${mmLoggingChannel ?? this.NA}`).appendLine()
                .appendLine()
                .append("__**Other Channels**__").appendLine()
                .append(`⇒ Bot Updates Channel: ${botUpdatesChan ?? this.NA}`).appendLine();
        }

        const displayEmbed = new MessageEmbed()
            .setAuthor(guild.name, guild.iconURL() ?? undefined)
            .setTitle(`[${section.sectionName}] **Channel** Configuration Main Menu`)
            .setDescription(`Please select the appropriate option.\n\n${currentConfiguration.toString()}`)
            .setFooter("Channel Configuration");

    }
}