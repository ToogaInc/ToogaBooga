import {Message, MessageEmbed, VoiceChannel} from "discord.js";
import {IDungeonInfo} from "../definitions/major/parts/IDungeonInfo";
import {ISectionInfo} from "../definitions/major/ISectionInfo";
import {ArrayUtilities} from "../utilities/ArrayUtilities";
import {StringBuilder} from "../utilities/StringBuilder";
import {IGuildInfo} from "../definitions/major/IGuildInfo";

export module RaidFunctions {
    interface IAfkCheckEmbedObject {
        guildDb: IGuildInfo;
        section: ISectionInfo;
        selectedDungeon: IDungeonInfo;
        voiceChannel: VoiceChannel;
        customRaidMessage?: string;
    }

    export function generateAfkCheckEmbed(msg: Message, obj: IAfkCheckEmbedObject): MessageEmbed {
        if (msg.guild === null || msg.member === null)
            throw new ReferenceError("Guild or GuildMember cannot be null.");


        const optionalReactsBuilder: StringBuilder = new StringBuilder();
        if (obj.guildDb.roles.earlyLocationRoles.length !== 0) {

        }

        const embed: MessageEmbed = new MessageEmbed()
            .setColor(obj.selectedDungeon.dungeonColors.length === 0
                ? "RANDOM"
                : ArrayUtilities.getRandomElement(obj.selectedDungeon.dungeonColors))
            .setAuthor(`${msg.member.displayName} has started a ${obj.selectedDungeon.dungeonName} AFK Check.`, obj.selectedDungeon.portalLink)
            .setDescription(`⇒ Join **${obj.voiceChannel.name}** voice channel to participate in this raid.`);

        if (obj.section.properties.afkCheckProperties.additionalAfkCheckInfo.length !== 0)
            embed.addField("Section-Specific Information", obj.section.properties
                .afkCheckProperties.additionalAfkCheckInfo);

        if (typeof obj.customRaidMessage !== "undefined" && obj.customRaidMessage.length !== 0)
            embed.addField("Message to All Raiders", obj.customRaidMessage);

        return embed;
    }
}