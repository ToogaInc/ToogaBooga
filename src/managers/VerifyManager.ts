import {DMChannel, Emoji, EmojiResolvable, GuildMember} from "discord.js";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {ISectionInfo} from "../definitions/major/ISectionInfo";
import {InteractionManager} from "./InteractionManager";
import {FetchRequestUtilities} from "../utilities/FetchRequestUtilities";
import {MongoManager} from "./MongoManager";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {StringBuilder} from "../utilities/StringBuilder";
import {Emojis} from "../constants/Emojis";
import {AdvancedCollector} from "../utilities/AdvancedCollector";

export namespace VerifyManager {

    export async function verify(member: GuildMember, guildDoc: IGuildInfo, section: ISectionInfo): Promise<void> {
        // If the person is currently interacting with something, don't let them verify.
        if (InteractionManager.InteractiveMenu.has(member.id))
            return;
        // Check if the verified role exists.
        const verifiedRole = await FetchRequestUtilities.fetchRole(member.guild, section.roles.verifiedRoleId);

        const dmChannel = await FetchRequestUtilities.tryStartDm(member);

        // If we can't open a DM, then don't bother.
        if (!dmChannel)
            return;

        // No verified role = no go.
        if (!verifiedRole || member.roles.cache.has(verifiedRole.id))
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
        if (manualVerifyEntry)
            return;

        // This has to be a verification channel so we don't need to double check.
        if (section.isMainSection) {
            await verifyMain(member, guildDoc, dmChannel);
            return;
        }

        else await verifySection(member, guildDoc, section);
    }

    async function verifyMain(member: GuildMember, guildDoc: IGuildInfo, dmChannel: DMChannel): Promise<void> {
        let nameToUse: string | null = null;
        const entry = await MongoManager.getIdNameInfo(member.id);
        if (entry.length !== 0) {
            const descOldNameSb = new StringBuilder()
                .append("You have verified at least one in-game name with this bot. Would you like to verify ")
                .append("with one of the names shown below?")
                .appendLine()
                .appendLine()
                .append("If you do __not__ want to verify with one of the names shown below, react to the ")
                .append(`${Emojis.X_EMOJI} emoji or type "cancel." Otherwise, Otherwise, react to the emoji `)
                .append("corresponding to the name that you want to use.");
            const useOldNameEmbed = MessageUtilities.generateBlankEmbed(member, "GREEN")
                .setTitle("Verification: Old Name(s) Found")
                .setDescription(descOldNameSb.toString())
                .setFooter(`Verifying in: ${member.guild.name}`)
                .setTimestamp();
            // We assume that the person doesn't have 10 alts. If they do, well, screw them.
            let emoteIdx = 0;
            const emojisToUse: EmojiResolvable[] = [];
            for (const name of entry[0].rotmgNames.slice(0, 10)) {
                const num = emoteIdx++;
                emojisToUse.push(Emojis.NUMERICAL_EMOJIS[num]);
                const nameChoiceSb = new StringBuilder()
                    .append(`React to the ${Emojis.NUMERICAL_EMOJIS[num]} emoji, or type the number **\`${num}\`**, `)
                    .append("if you want to use this name");
                useOldNameEmbed.addField(`Name: **${name.ign}**`, nameChoiceSb.toString());
            }
            emojisToUse.push(Emojis.X_EMOJI);

            const colRes = await new AdvancedCollector(dmChannel, member, 1, "M")
                .startDoubleCollector<number>({
                    embed: useOldNameEmbed
                }, AdvancedCollector.getNumberPrompt(dmChannel, {min: 1, max: emojisToUse.length + 1}), {
                    reactions: emojisToUse,
                    reactToMsg: true,
                    deleteBaseMsgAfterComplete: true,
                    cancelFlag: "cancel",
                    removeAllReactionAfterReact: false
                });
            // No response or cancel.
            if (colRes === null) return;
            // Got an emoji
            if (colRes instanceof Emoji) {
                const selectedIdx = emojisToUse.findIndex(x => x === colRes.name);
                // Cancel is last element.
                if (selectedIdx === -1 || selectedIdx === emojisToUse.length - 1)
                    return;
                // Otherwise, get right element.
                nameToUse = entry[0].rotmgNames[selectedIdx].ign;
            }
            else nameToUse = entry[0].rotmgNames[colRes - 1].ign;
        }

        // A name wasn't selected.
        if (!nameToUse) {

        }
    }

    async function verifySection(member: GuildMember, guildDoc: IGuildInfo, section: ISectionInfo): Promise<void> {

    }
}