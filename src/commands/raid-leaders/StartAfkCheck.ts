import {BaseCommand} from "../BaseCommand";
import {Message} from "discord.js";
import {IGuildInfo} from "../../definitions/major/IGuildInfo";

export class StartAfkCheck extends BaseCommand {
    public static readonly START_AFK_CMD_CODE: string = "AFK_CHECK_START";

    public constructor() {
        super({
            cmdCode: StartAfkCheck.START_AFK_CMD_CODE,
            formalCommandName: "Start AFK Check Command",
            botCommandNames: ["startafkcheck", "afkcheck"],
            description: "Starts a wizard that can be used to start an AFK check.",
            usageGuide: ["startafkcheck"],
            exampleGuide: ["startafkcheck"],
            deleteCommandAfter: 5000,
            commandCooldown: 5000,
            generalPermissions: [],
            botPermissions: [],
            rolePermissions: ["RaidLeader", "AlmostRaidLeader", "HeadRaidLeader", "VeteranRaidLeader"],
            isRoleInclusive: false,
            guildOnly: true,
            botOwnerOnly: false
        });
    }

    public async run(msg: Message, args: string[], guildDoc: IGuildInfo): Promise<number> {
        // Step 1: Ask for the appropriate section
        return 0;
    }
}