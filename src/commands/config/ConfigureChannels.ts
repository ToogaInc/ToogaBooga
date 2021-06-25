import {BaseCommand} from "../BaseCommand";
import {Message} from "discord.js";
import { IGuildInfo } from "../../definitions/db/IGuildInfo";

export class ConfigureChannelsCommand extends BaseCommand {

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
        return 0;
    }


}