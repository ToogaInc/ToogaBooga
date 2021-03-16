import {GuildMember} from "discord.js";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {ISectionInfo} from "../definitions/major/ISectionInfo";
import {InteractionManager} from "./InteractionManager";
import {FetchRequestUtilities} from "../utilities/FetchRequestUtilities";
import {MongoManager} from "./MongoManager";
import {MiscUtilities} from "../utilities/MiscUtilities";

export namespace VerifyManager {

    export async function verify(member: GuildMember, guildDoc: IGuildInfo, section: ISectionInfo): Promise<void> {
        // If the person is currently interacting with something, don't let them verify.
        if (InteractionManager.InteractiveMenu.has(member.id))
            return;
        // Check if the verified role exists.
        const verifiedRole = await FetchRequestUtilities.fetchRole(member.guild, section.roles.verifiedRoleId);

        // No verified role = no go.
        if (!verifiedRole)
            return;

        // Get relevant channels.
        const verificationAttemptsChannel = member.guild.channels.cache
            .get(section.channels.verification.verificationLogsChannelId);
        const verificationSuccessChannel = member.guild.channels.cache
            .get(section.channels.verification.verificationSuccessChannelId);
        const manualVerificationChannel = member.guild.channels.cache
            .get(section.channels.verification.manualVerificationChannelId);
        const verificationChannel = member.guild.channels.cache
            .get(section.channels.verification.verificationChannelId);

        // No verification channel = leave.
        if (!verificationChannel)
            return;

        // Check if this person is currently being manually verified.
        const manualVerifyEntry = section.properties.manualVerificationEntries
            .find(x => x.userId === member.id);
        // If this is true, then this person is being manually verified.
        if (manualVerifyEntry) {
            return;
        }
    }
}