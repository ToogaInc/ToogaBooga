import {
    Emoji, EmojiResolvable,
    Guild,
    GuildEmoji,
    GuildMember,
    Message,
    MessageEmbed,
    Role, Snowflake, SnowflakeUtil,
    VoiceChannel
} from "discord.js";
import {IDungeonInfo} from "../definitions/major/parts/IDungeonInfo";
import {ISectionInfo} from "../definitions/major/ISectionInfo";
import {ArrayUtilities} from "../utilities/ArrayUtilities";
import {StringBuilder} from "../utilities/StringBuilder";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {Emojis} from "../constants/Emojis";
import {IRaidInfo} from "../definitions/major/IRaidInfo";
import {MongoFunctions} from "./MongoFunctions";
import {FindAndModifyWriteOpResultObject, UpdateWriteOpResult} from "mongodb";

export module RaidFunctions {
    import NITRO_EMOJI = Emojis.NITRO_EMOJI;

    interface IAfkCheckEmbedObject {
        guildDb: IGuildInfo;
        section: ISectionInfo;
        selectedDungeon: IDungeonInfo;
        voiceChannel: VoiceChannel;
        customRaidMessage?: string;
    }

    interface IReactionCount {
        earlyReactCount: number;
        keyCount: Array<{
            id: string;
            amt: number;
        }>;
        vcCount: number;
    }

    /**
     * Creates a new AFK check embed.
     *
     * @param {Message} msg The message.
     * @param {RaidFunctions.IAfkCheckEmbedObject} afkCheckObj An object containing information
     * about the AFK check.
     * @param {RaidFunctions.IReactionCount} reactCount An object containing information about
     * the amount of reactions.
     * @returns {MessageEmbed} The embed,
     */
    export function generateAfkCheckEmbed(msg: Message, afkCheckObj: IAfkCheckEmbedObject,
                                          reactCount?: IReactionCount): MessageEmbed {
        if (msg.guild === null || msg.member === null)
            throw new ReferenceError("Guild or GuildMember cannot be null.");

        const guild: Guild = msg.guild;
        const member: GuildMember = msg.member;

        // relevant emojis
        const nitroEmoji: GuildEmoji | null = guild.emojis.resolve(NITRO_EMOJI as Snowflake);

        const optionalReactsBuilder: StringBuilder = new StringBuilder();

        if (afkCheckObj.selectedDungeon.keyData.length !== 0) {
            let resolvedEmojis: Array<GuildEmoji> = [];
            for (const keyData of afkCheckObj.selectedDungeon.keyData) {
                const emoji: GuildEmoji | undefined = guild.emojis.cache
                    .get(keyData.keyEmojiId as Snowflake);

                if (typeof emoji === "undefined")
                    continue;

                resolvedEmojis.push(emoji);
            }

            if (resolvedEmojis.length !== 0)
                optionalReactsBuilder.append(`⇒ If you have one of the following keys and want to \ 
                use it for this raid, react with the corresponding emoji(s): \ 
                ${resolvedEmojis.join(" ")}`)
                    .appendLine();
        }


        const notExceededMax: boolean = typeof reactCount === "undefined"
            || reactCount.earlyReactCount < afkCheckObj.section.properties.afkCheckProperties
                .earlyLocationLimit;
        if (nitroEmoji !== null
            && afkCheckObj.guildDb.roles.earlyLocationRoles.length !== 0
            && notExceededMax) {
            let definedEarlyLocRoles: Array<Role | undefined> = afkCheckObj.guildDb.roles
                .earlyLocationRoles.map(x => guild.roles.cache.get(x));
            let actualEarlyLocRoles: Array<Role> = [];
            for (const r of definedEarlyLocRoles) {
                if (typeof r === "undefined")
                    continue;
                actualEarlyLocRoles.push(r);
            }

            if (actualEarlyLocRoles.length === 1)
                optionalReactsBuilder.append(`⇒ React to the ${nitroEmoji} if you have the \
                 ${actualEarlyLocRoles[0]} role and want to get early location.`)
                    .appendLine();
            else
                optionalReactsBuilder.append(`⇒ React to the ${nitroEmoji} if you have one of the \
                 following roles and want to get early location: ${actualEarlyLocRoles.join(" ")}`)
                    .appendLine();
        }

        optionalReactsBuilder.append("⇒ React to the emoji(s) corresponding to your class and" +
            " gear choices.");

        const embed: MessageEmbed = new MessageEmbed()
            .setColor(afkCheckObj.selectedDungeon.dungeonColors.length === 0
                ? "RANDOM"
                : ArrayUtilities.getRandomElement(afkCheckObj.selectedDungeon.dungeonColors))
            .setAuthor(`${msg.member.displayName} has started a \ 
            ${afkCheckObj.selectedDungeon.dungeonName} AFK Check.`, afkCheckObj.selectedDungeon
                .portalLink)
            .setDescription(`⇒ Join **${afkCheckObj.voiceChannel.name}** voice channel to \
             participate in this raid.`)
            .addField("Optional Reactions", optionalReactsBuilder.toString());

        if (afkCheckObj.section.properties.afkCheckProperties.additionalAfkCheckInfo.length !== 0)
            embed.addField("Section-Specific Information", afkCheckObj.section.properties
                .afkCheckProperties.additionalAfkCheckInfo);

        if (typeof afkCheckObj.customRaidMessage !== "undefined"
            && afkCheckObj.customRaidMessage.length !== 0)
            embed.addField("Message to All Raiders", afkCheckObj.customRaidMessage);

        // check reaction count
        if (afkCheckObj.section.properties.afkCheckProperties.removeKeyReactsDuringAfk
            && typeof reactCount !== "undefined") {
            const optReactCounterBuilder: StringBuilder = new StringBuilder();

            const maxEarlyLoc: number = afkCheckObj.section.properties.afkCheckProperties
                .earlyLocationLimit;
            if (maxEarlyLoc !== -1 && nitroEmoji !== null)
                optReactCounterBuilder.append(`⇒ ${nitroEmoji} Early Location: \
                 ${reactCount.earlyReactCount}/${maxEarlyLoc}`)
                    .appendLine();

            const maxKey: number = afkCheckObj.section.properties.afkCheckProperties.keyLimit;
            if (maxKey !== -1) {
                for (const data of reactCount.keyCount) {
                    const keyEmoji: GuildEmoji | undefined = guild.emojis.cache
                        .get(data.id as Snowflake);
                    if (typeof keyEmoji === "undefined")
                        continue;

                    const correspondingKey: {
                        keyEmojiId: EmojiResolvable;
                        keyEmojiName: string
                    } | undefined = afkCheckObj.selectedDungeon.keyData
                        .find(x => x.keyEmojiId === keyEmoji.id);

                    if (typeof correspondingKey === "undefined")
                        continue;

                    optReactCounterBuilder.append(`${keyEmoji} ${correspondingKey.keyEmojiName}: \
                    ${data.amt}/${maxKey}`)
                        .appendLine();
                }
            }

            if (optionalReactsBuilder.length() !== 0)
                embed.addField("Current Count", optReactCounterBuilder.toString());
        }

        return embed;
    }

    // database

    /**
     * Adds a raid object to the database.
     *
     * @param {Guild} guild The guild where the raid is being held.
     * @param {IRaidInfo} afk The raid object.
     * @returns {Promise<IGuildInfo>} The revised guild document.
     */
    export async function addRaidToDatabase(guild: Guild, afk: IRaidInfo): Promise<IGuildInfo> {
        const res: FindAndModifyWriteOpResultObject<IGuildInfo> = await MongoFunctions
            .getGuildCollection()
            .findOneAndUpdate({guildId: guild.id}, {
                $push: {
                    activeRaids: afk
                }
            }, {returnOriginal: false});

        if (typeof res.value === "undefined")
            return null;

        return res.value;
    }
}