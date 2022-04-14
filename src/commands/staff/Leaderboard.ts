import {
    MessageEmbed,
    BaseMessageComponent
} from "discord.js";
import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {DUNGEON_DATA} from "../../constants/dungeons/DungeonData";
import {IDungeonInfo, IGuildInfo, IUserInfo} from "../../definitions";
import {DungeonUtilities} from "../../utilities/DungeonUtilities";
import {ArrayUtilities} from "../../utilities/ArrayUtilities";
import {LoggerManager} from "../../managers/LoggerManager";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringUtil} from "../../utilities/StringUtilities";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {ButtonConstants} from "../../constants/ButtonConstants";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";

export type LeaderboardEntry = { user: IUserInfo; count: number; };

export class Leaderboard extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "LEADERBOARD_CMD",
            formalCommandName: "Leaderboard Command",
            botCommandName: "leaderboard",
            description: "Provides the leaderboard for a given category.",
            rolePermissions: [
                "Helper",
                "Security",
                "Officer",
                "Moderator",
                "AlmostRaidLeader",
                "RaidLeader",
                "HeadRaidLeader",
                "VeteranRaidLeader"
            ],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 3 * 1000,
            argumentInfo: [ 
                {
                    displayName: "Leaderboard Category",
                    argName: "lb_category",
                    desc: "The leaderboard category.",
                    type: ArgumentType.String,
                    restrictions: {
                        stringChoices: [
                            ["Runs Led", "RUN_LED"],
                            ["Keys Popped", "KEY_POP"],
                            ["Runes Popped", "RUNE_POP"]
                        ]
                    },
                    prettyType: "String",
                    required: true,
                    example: ["Runs Led","Keys Popped", "Runes Popped"]
                }
            ],
            guildOnly: true,
            botOwnerOnly: false
        };

        super(cmi);
    }

    

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        await ctx.interaction.reply({
            content:`Working on it...`
        });

        const lbType = ctx.interaction.options.getString("lb_category", true);
        //If run led, get dungeon
        let dungeon: IDungeonInfo | null = null;
        if(lbType === "RUN_LED"){
            dungeon = await DungeonUtilities.selectDungeon(ctx, DUNGEON_DATA.concat(ctx.guildDoc!.properties.customDungeons));
        }

        const leaderboardArr = await this.createLeaderboard(ctx.guildDoc!, lbType, dungeon);

        const lbSubsets = ArrayUtilities.breakArrayIntoSubsets(leaderboardArr, 20);

        //If only one page, no need to add buttons to navigate
        if(lbSubsets.length < 2){
            await ctx.interaction.editReply({
                content: ` `,
                components: [],
                embeds: [this.getLeaderboardEmbed(lbSubsets, 0, ctx, lbType, dungeon)]
            });
            return 0;
        }
        
        const uniqueId = StringUtil.generateRandomString(20);
        const nextId = uniqueId + "_next";
        const stopId = uniqueId + "_stop";
        const backId = uniqueId + "_back";
        const components: BaseMessageComponent[] = [
            AdvancedCollector.cloneButton(ButtonConstants.PREVIOUS_BUTTON)
                .setCustomId(backId),
            AdvancedCollector.cloneButton(ButtonConstants.STOP_BUTTON)
                .setCustomId(stopId),
            AdvancedCollector.cloneButton(ButtonConstants.NEXT_BUTTON)
                .setCustomId(nextId)
        ];
        await ctx.interaction.editReply({
            content: ` `,
            components: AdvancedCollector.getActionRowsFromComponents(components),
            embeds: [this.getLeaderboardEmbed(lbSubsets, 0, ctx, lbType, dungeon)]
        });

        const collector = ctx.channel.createMessageComponentCollector({
            filter: i => i.customId.startsWith(uniqueId) && i.user.id === ctx.user.id,
            time: 3 * 60 * 1000
        });
        let currPage = 0;
        collector.on("collect", async i => {
            await i.deferUpdate();

            switch (i.customId) {
                case nextId: {
                    currPage++;
                    currPage %= lbSubsets.length;
                    break;
                }
                case backId: {
                    currPage--;
                    currPage = (currPage + lbSubsets.length) % lbSubsets.length;
                    break;
                }
                case stopId: {
                    collector.stop("stopped");
                    return;
                }
            }

            await ctx.interaction.editReply({
                embeds: [this.getLeaderboardEmbed(lbSubsets, currPage, ctx, lbType, dungeon)],
                components: AdvancedCollector.getActionRowsFromComponents(components)
            });
        });
        collector.on("end", async (_, r) => {
            // Possible that someone might delete the message before this triggers.
            await GlobalFgrUtilities.tryExecuteAsync(async () => {
                await ctx.interaction.editReply({
                    embeds: [this.getLeaderboardEmbed(lbSubsets, currPage, ctx, lbType, dungeon)],
                    components: []
                });
            });
        });

        return 0;
    }

    /**
     * Iterates over guild users who have logged items, picks out users who match the
     * search criteria and sorts them.
     * @param {IGuildInfo} guildDoc the guild
     * @param {String} searchCriteria the leaderboard category identifier
     * @param {IDungeonInfo | null} dungeon the dungeon if it pertains to the category 
     * @returns 
     */
    public async createLeaderboard(guildDoc: IGuildInfo, searchCriteria: String, dungeon: IDungeonInfo | null): Promise<LeaderboardEntry[]>{
        //Dungeon is required for leaderboard of type RUN_LED
        if(searchCriteria === "RUN_LED" && !dungeon) return [];
        
        const ret : LeaderboardEntry[] = [];
        const usersWithLogs = guildDoc.properties.usersWithLogs;

        if(!usersWithLogs) return [];

        //For each user with logs, get their stats and find out if they meet the search criteria
        for(const user of usersWithLogs){
            const userEntry: LeaderboardEntry = {user, count: 0};
            const userStats = await LoggerManager.getStats(null,guildDoc.guildId, user.discordId);
            if(!userStats) continue;
            switch(searchCriteria){
                case "RUN_LED":{
                    if(!dungeon) break;
                    const dungeonsLed = userStats.dungeonsLed.get(guildDoc.guildId);
                    if(!dungeonsLed) break;
                    const resultsForDungeon = dungeonsLed.get(dungeon.dungeonName);
                    if(!resultsForDungeon) break;
                    userEntry.count = resultsForDungeon.completed;
                    break;
                }
                case "KEY_POP":{
                    const keysPopped = userStats.keyUse.get(guildDoc.guildId);
                    if(!keysPopped) break;
                    for(const [key, amt] of keysPopped){
                        if(!key.toUpperCase().includes("RUNE")){
                            userEntry.count += amt;
                        }
                    }
                    break;
                }
                case "RUNE_POP":{
                    const keysPopped = userStats.keyUse.get(guildDoc.guildId);
                    if(!keysPopped) break;
                    for(const [key, amt] of keysPopped){
                        if(key.toUpperCase().includes("RUNE")){
                            userEntry.count += amt;
                        }
                    }
                    break;
                }
                default:{
                    break;
                }
            }
            //If they met the criteria, the entry will have a count so  we can add to the return array
            if(userEntry.count > 0) ret.push(userEntry);
        }

        return ret.sort((a,b)=>{
            return b.count-a.count; //Sort largest to smallest. If a > b, b-a will be positive and a sorts before b
        });
    }

    /**
     * 
     * @param {LeaderboardEntry[][]} lbSubsets The entries of the leaderboard, split into groups of 20
     * @param {number} page Which page to display on the embed
     * @param {ICommandContext} ctx The interaction context
     * @param {string} searchCriteria The leaderboard category
     * @param {IDungeonInfo | null} dungeon The dungeon, if applicable to the category
     * @returns 
     */
    public getLeaderboardEmbed(lbSubsets: LeaderboardEntry[][], page: number, ctx:ICommandContext, searchCriteria: String, dungeon: IDungeonInfo | null): MessageEmbed {
        //If there are no entries, provide a simple embed
        if(lbSubsets.length === 0){
            const embed = MessageUtilities.generateBlankEmbed(ctx.guild ?? ctx.user, "GREY")
                .setTimestamp()
                .setFooter({text: `${ctx.guild?.name}`})
                .addField(`No Entries Found`,`Try a different leaderboard category`);
            switch(searchCriteria){
                case "RUN_LED":{
                    embed.setTitle(`${dungeon?.dungeonName} Top Leaders (Page 1/1)`)
                    break;
                }
                case "KEY_POP":{
                    embed.setTitle(`Top Key Poppers (Page 1/1)`)
                    break;
                }
                case "RUNE_POP":{
                    embed.setTitle(`Top Rune Poppers (Page 1/1)`)
                    break;
                }
                default:{
                    break;
                }
            }
            return embed;
        }

        //Ensure page is within bounds.
        if(page >= lbSubsets.length){
            page = page%lbSubsets.length;
        }
        if(page < 0){
            page += lbSubsets.length;
        }
        const embed = MessageUtilities.generateBlankEmbed(ctx.guild ?? ctx.user, "GREY")
            .setTimestamp()
            .setFooter({text: `${ctx.guild?.name}`});
        
        switch(searchCriteria){
            case "RUN_LED":{
                embed.setTitle(`${dungeon?.dungeonName} Top Leaders (Page ${page+1}/${lbSubsets.length})`)
                break;
            }
            case "KEY_POP":{
                embed.setTitle(`Top Key Poppers (Page ${page+1}/${lbSubsets.length})`)
                break;
            }
            case "RUNE_POP":{
                embed.setTitle(`Top Rune Poppers (Page ${page+1}/${lbSubsets.length})`)
                break;
            }
            default:{
                break;
            }
        }
        //Split page into top and bottom 10 of the page.  I.E. First page has Top 10 and Top 20, Second has Top 30 and Top 40, etc.
        const splitLb = ArrayUtilities.breakArrayIntoSubsets(lbSubsets[page], 10);

        const firstTen = splitLb[0];
        const firstTenLabel = `Top ${10*(2*page+1)}`;
        let firstTenValue = ``;
        for(let i = 0; i < firstTen.length; i++){
            const lbEntry = firstTen[i];
            firstTenValue += `#${10*(2*page)+(i+1)}. <@${lbEntry.user.discordId}> - ${lbEntry.count}\n`;
        }
        embed.addField(firstTenLabel, firstTenValue);
        if(splitLb.length === 1) return embed;

        const lastTen = splitLb[1];
        const lastTenLabel = `Top ${10*(2*page+2)}`;
        let lastTenValue = ``;
        for(let i = 0; i < lastTen.length; i++){
            const lbEntry = lastTen[i];
            lastTenValue += `#${10*(2*page+1)+(i+1)}. <@${lbEntry.user.discordId}> - ${lbEntry.count}\n`;
        }
        embed.addField(lastTenLabel, lastTenValue);
        return embed;
    }
}

