import {
    MessageEmbed,
    BaseMessageComponent
} from "discord.js";
import { ArgumentType, BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { DUNGEON_DATA } from "../../constants/dungeons/DungeonData";
import { IDungeonInfo, IGuildInfo, IUserInfo } from "../../definitions";
import { DungeonUtilities } from "../../utilities/DungeonUtilities";
import { ArrayUtilities } from "../../utilities/ArrayUtilities";
import { LoggerManager } from "../../managers/LoggerManager";
import { UserManager } from "../../managers/UserManager";
import { MessageUtilities } from "../../utilities/MessageUtilities";
import { MongoManager } from "../../managers/MongoManager";
import { StringUtil } from "../../utilities/StringUtilities";
import { AdvancedCollector } from "../../utilities/collectors/AdvancedCollector";
import { ButtonConstants } from "../../constants/ButtonConstants";
import { GlobalFgrUtilities } from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import { MiscUtilities } from "../../utilities/MiscUtilities";

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
                            { name: "Runs Led", value: "RUN_LED" },
                            { name: "Keys Popped", value: "KEY_POP" },
                            { name: "Runes Popped", value: "RUNE_POP" },
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
            content:"Calculating Leaderboard..."
        });

        const lbType = ctx.interaction.options.getString("lb_category", true);
        //If run led, get dungeon
        let dungeon: IDungeonInfo | null = null;
        if(lbType === "RUN_LED"){
            dungeon = await DungeonUtilities.selectDungeon(ctx, DUNGEON_DATA.concat(ctx.guildDoc!.properties.customDungeons));
            //This will remove the dungeon selection instantly.
            await ctx.interaction.editReply({
                content:"Dungeon confirmed.  Calculating Leaderboard...",
                components: [],
                embeds: []
            });
        }

        const leaderboardArr = await this.createLeaderboard(ctx.guildDoc!, lbType, dungeon);
        const lbSubsets = ArrayUtilities.breakArrayIntoSubsets(leaderboardArr, 20);

        //If only one page, no need to add buttons to navigate
        if(lbSubsets.length < 2){
            await ctx.interaction.editReply({
                content: " ",
                components: [],
                embeds: [this.getLeaderboardEmbed(lbSubsets, 0, ctx, lbType, dungeon)]
            });
            return 0;
        }
        
        const uniqueId = StringUtil.generateRandomString(20);
        const nextId = uniqueId + "_next";
        const stopId = uniqueId + "_stop";
        const backId = uniqueId + "_back";
        const searchId = uniqueId + "_search";
        const jumpId = uniqueId + "_jump";
        const components: BaseMessageComponent[] = [
            AdvancedCollector.cloneButton(ButtonConstants.PREVIOUS_BUTTON)
                .setCustomId(backId),
            AdvancedCollector.cloneButton(ButtonConstants.NEXT_BUTTON)
                .setCustomId(nextId),
            AdvancedCollector.cloneButton(ButtonConstants.JUMP_BUTTON)
                .setCustomId(jumpId),
            AdvancedCollector.cloneButton(ButtonConstants.SEARCH_BUTTON)
                .setCustomId(searchId),
            AdvancedCollector.cloneButton(ButtonConstants.STOP_BUTTON)
                .setCustomId(stopId),

        ];
        await ctx.interaction.editReply({
            content: " ",
            components: AdvancedCollector.getActionRowsFromComponents(components),
            embeds: [this.getLeaderboardEmbed(lbSubsets, 0, ctx, lbType, dungeon)]
        });

        const collector = ctx.channel.createMessageComponentCollector({
            filter: i => i.customId.startsWith(uniqueId) && i.user.id === ctx.user.id,
            time: 60 * 1000
        });
        let currPage = 0;
        let active = true;
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
                    active = false;
                    return;
                }
                case jumpId: {
                    const pageEmbed = new MessageEmbed()
                        .setTitle("Enter page number")
                        .setColor("GREY");
                    const tempMsg = await ctx.channel.send({
                        embeds: [pageEmbed]
                    });
                    let pageNumber = currPage;
                    try {
                        const collected = await ctx.channel.awaitMessages({ max: 1, time: 10000, errors: ["time"] });
                        const msg = parseInt(collected.first()?.content ?? "NaN");
                        pageNumber = isNaN(msg) ? currPage : msg - 1;
                        await MiscUtilities.stopFor(1000);
                        await collected.first()?.delete();
                    } catch (e) {
                        // ignored
                    }
                    
                    await tempMsg.delete();          
                    currPage = pageNumber;
                    break;
                }
                case searchId: {
                    const pageEmbed = new MessageEmbed()
                        .setTitle("Enter member IGN, ID, or Mention")
                        .setColor("GREY");
                    const tempMsg = await ctx.channel.send({
                        embeds: [pageEmbed]
                    });
                    let memberResolvable = "";
                    try {
                        const collected = await ctx.channel.awaitMessages({ max: 1, time: 10000, errors: ["time"] });
                        memberResolvable = collected.first()?.content ?? "";
                        await MiscUtilities.stopFor(1000);
                        await collected.first()?.delete();
                    } catch (e) {
                        // ignored    
                    }

                    await tempMsg.delete();          
                    const resMember = await UserManager.resolveMember(ctx.guild!, memberResolvable);
                    if(!resMember){
                        this.sendTempMessage("Member not found on the server", ctx, 5000);
                        break;
                    }
                    const index = leaderboardArr.findIndex(x => x.user.discordId === resMember.member.id);
                    if(index < 0){
                        this.sendTempMessage("Member not found on the leaderboard", ctx, 5000);
                    }
                    currPage = Math.floor((index + 1) / 20);
                    break;
                }

            }

            await ctx.interaction.editReply({
                embeds: [this.getLeaderboardEmbed(lbSubsets, currPage, ctx, lbType, dungeon)],
                components: active ? AdvancedCollector.getActionRowsFromComponents(components) : []
            });
        });
        collector.on("end", async () => {
            active = false;
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
     * Sends a temporary message in the channel of the interaction.
     * @param {string} message The Content of the message
     * @param {ICommandContex} ctx The interaction
     * @param {number} duration How long before the message is deleted.
     */
    public async sendTempMessage(message: string, ctx: ICommandContext, duration: number) {
        const tempMsg = await ctx.channel.send({
            content: message,
        });
        return setTimeout(() => tempMsg.delete().catch(), duration);
    }

    /**
     * Iterates over guild users who have logged items, picks out users who match the
     * search criteria and sorts them.
     * @param {IGuildInfo} guildDoc the guild
     * @param {string} searchCriteria the leaderboard category identifier
     * @param {IDungeonInfo | null} dungeon the dungeon if it pertains to the category 
     * @returns 
     */
    public async createLeaderboard(guildDoc: IGuildInfo, searchCriteria: string, dungeon: IDungeonInfo | null): Promise<LeaderboardEntry[]>{
        //Dungeon is required for leaderboard of type RUN_LED
        if(searchCriteria === "RUN_LED" && !dungeon) return [];
        
        const ret : LeaderboardEntry[] = [];
        const usersWithLogs: IUserInfo[] = await MongoManager.getUserCollection().find().toArray();
        //usersWithLogs = this.duplicateUsers(usersWithLogs, 4);
        
        if(!usersWithLogs) return [];

        //For each user with logs, get their stats and find out if they meet the search criteria
        for(const user of usersWithLogs){
            const userEntry: LeaderboardEntry = { user: user, count: 0 };
            const userStats = await LoggerManager.getStatsWithDoc(user,guildDoc);
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
     * @returns {MessageEmbed}
     */
    public getLeaderboardEmbed(lbSubsets: LeaderboardEntry[][], page: number, ctx:ICommandContext, searchCriteria: string, dungeon: IDungeonInfo | null): MessageEmbed {
        //If there are no entries, provide a simple embed
        if(lbSubsets.length === 0){
            const embed = MessageUtilities.generateBlankEmbed(ctx.guild ?? ctx.user, "GREY")
                .setTimestamp()
                .setFooter({ text: `${ctx.guild?.name}` })
                .addField("No Entries Found","Try a different leaderboard category");
            switch(searchCriteria){
                case "RUN_LED":{
                    embed.setTitle(`${dungeon?.dungeonName} Top Leaders (Page 1/1)`);
                    break;
                }
                case "KEY_POP":{
                    embed.setTitle("Top Key Poppers (Page 1/1)");
                    break;
                }
                case "RUNE_POP":{
                    embed.setTitle("Top Rune Poppers (Page 1/1)");
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
            .setFooter({ text: `${ctx.guild?.name}` });
        
        switch(searchCriteria){
            case "RUN_LED":{
                embed.setTitle(`${dungeon?.dungeonName} Top Leaders (Page ${page+1}/${lbSubsets.length})`);
                break;
            }
            case "KEY_POP":{
                embed.setTitle(`Top Key Poppers (Page ${page+1}/${lbSubsets.length})`);
                break;
            }
            case "RUNE_POP":{
                embed.setTitle(`Top Rune Poppers (Page ${page+1}/${lbSubsets.length})`);
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
        let firstTenValue = "";
        for(let i = 0; i < firstTen.length; i++){
            const lbEntry = firstTen[i];
            firstTenValue += `#${10*(2*page)+(i+1)}. <@${lbEntry.user.discordId}> - ${lbEntry.count}\n`;
        }
        embed.addField(firstTenLabel, firstTenValue);
        if(splitLb.length === 1) return embed;

        const lastTen = splitLb[1];
        const lastTenLabel = `Top ${10*(2*page+2)}`;
        let lastTenValue = "";
        for(let i = 0; i < lastTen.length; i++){
            const lbEntry = lastTen[i];
            lastTenValue += `#${10*(2*page+1)+(i+1)}. <@${lbEntry.user.discordId}> - ${lbEntry.count}\n`;
        }
        embed.addField(lastTenLabel, lastTenValue);
        return embed;
    }

    /**
     * A command to expand the pool of users exponentially.  Useful for testing.
     * @param {IUserInfo[]} arr The array of users to duplicate
     * @param {number} times The amount of times to double the array 
     * @returns {IUserInfo[]} The expanded array
     */
    public duplicateUsers(arr: IUserInfo[], times: number): IUserInfo[] {
        if(times === 0) return arr;
        let ret = arr;
        for(let i = 0; i < times; i++){
            ret = ret.concat(ret);
        }
        return ret;
    }
}

