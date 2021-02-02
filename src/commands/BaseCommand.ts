import {Collection, Guild, GuildMember, Message, PermissionString, User} from "discord.js";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {OneRealmBot} from "../OneRealmBot";
import {MiscUtils} from "../utilities/MiscUtils";

type RolePermissions = "Suspended"
    | "Raider"
    | "Security"
    | "AlmostRaidLeader"
    | "RaidLeader"
    | "Officer"
    | "HeadRaidLeader"
    | "Moderator";

export abstract class BaseCommand {
    /**
     * The command info object.
     * @type {ICommandInfo}
     */
    public readonly commandInfo: ICommandInfo;

    /**
     * A collection of people that are in cooldown for this command. The K represents the ID; the V represents the
     * the time when the cooldown expires.
     * @type {Collection<string, number>}
     */
    protected readonly onCooldown: Collection<string, number>;

    /**
     * Creates a new `BaseCommand` object.
     * @param {ICommandInfo} cmi The command information object.
     * @throws {Error} If the command has 0 or more than 1 role permission defined and is rule inclusive.
     * @throws {Error} If the command doesn't have any way to be called.
     * @protected
     */
    protected constructor(cmi: ICommandInfo) {
        if (cmi.isRoleInclusive && cmi.rolePermissions.length !== 1)
            throw new Error(`${cmi.formalCommandName} is role inclusive but has 0 or 2+ roles specified.`);

        if (cmi.botCommandNames.length === 0)
            throw new Error(`${cmi.formalCommandName} does not have any way to be called.`);

        this.commandInfo = cmi;
        this.onCooldown = new Collection<string, number>();
    }

    /**
     * Executes a command.
     * @param {Message} msg The message object that initiated this command.
     * @param {string[]} args The arguments, if any.
     * @param {IGuildInfo | null} guildDoc The guild document.
     * @return {Promise<number>} The command result. 0 = success, any other number = fail.
     */
    public abstract run(msg: Message, args: string[], guildDoc: IGuildInfo | null): Promise<number>;

    /**
     * Checks to see if the specified person is on cooldown.
     * @param {User | GuildMember} userToTest Whether the person is on cooldown.
     * @return {number} The amount of time, in milliseconds, left before the person can run this command. `-1` if
     * there is no cooldown or the person isn't on cooldown.
     */
    public checkCooldownFor(userToTest: User | GuildMember): number {
        // Check if the person is on cooldown.
        if (this.commandInfo.commandCooldown > 0 && this.onCooldown.has(userToTest.id))
            return this.onCooldown.get(userToTest.id) as number - Date.now();

        return -1;
    }

    /**
     * Adds a person to the command cooldown. If the person is already on cooldown, then this will not update the
     * person's cooldown status.
     * @param {User | GuildMember} userToAdd The user to add.
     */
    public addToCooldown(userToAdd: User | GuildMember): void {
        if (this.commandInfo.commandCooldown <= 0) return;
        if (this.onCooldown.has(userToAdd.id)) return;
        this.onCooldown.set(userToAdd.id, Date.now() + this.commandInfo.commandCooldown);
        setTimeout(() => this.onCooldown.delete(userToAdd.id), this.commandInfo.commandCooldown);
    }

    /**
     * Checks whether a user can run a command. This is ideal when testing permissions; not so much other things.
     * @param {User | GuildMember} userToTest The user to test.
     * @param {Guild | null} guild The guild.
     * @param {IGuildInfo | null} guildDoc The guild document.
     * @return {ICanRunResult} Results about whether a person can run this command.
     * @throws {Error} If the command that was being checked has more than one role permission specified despite
     * being role inclusive.
     * @throws {Error} If the command has invalid role permissions defined.
     */
    public hasPermissionToRun(userToTest: User | GuildMember, guild: Guild | null,
                              guildDoc: IGuildInfo | null): ICanRunResult {
        const results: ICanRunResult = {
            canRun: false,
            hasAdmin: false,
            missingBotPerms: [],
            missingUserPerms: [],
            missingUserRoles: []
        };

        // If the command is bot owner only and the person isn't a bot owner, then this person can't run this command.
        if (this.commandInfo.botOwnerOnly && !OneRealmBot.BotInstance.config.ids.botOwnerIds.includes(userToTest.id))
            return results;

        // The person tried to run the command in DMs. See if the person can do so.
        // If a command can be run in DMs, then there should not be any permission requirements, so we don't check
        // those at all.
        if (!guild) {
            if (this.commandInfo.guildOnly)
                return results;

            results.canRun = true;
            return results;
        }

        // At this point, we know we are in a guild.
        // So userToTest better be a GuildMember.
        if (userToTest instanceof User)
            return results;

        // Command was executed in the server. We need to check permissions.
        guildDoc = guildDoc as IGuildInfo;
        const bot = guild.me;

        // Check bot permissions.
        if (bot) {
            const botPerms = bot.permissions.toArray();
            // Go through each required bot permission.
            for (const perm of this.commandInfo.botPermissions) {
                // If the bot doesn't have the specified permission, then add it to the list of missing permissions.
                if (!botPerms.includes(perm))
                    results.missingBotPerms.push(perm);
            }
        }

        // If you have full Administrator, you can run this command.
        if (userToTest.permissions.has("ADMINISTRATOR")) {
            results.canRun = true;
            results.hasAdmin = true;
            return results;
        }

        // Check user permissions.
        const myPerms = userToTest.permissions.toArray();
        for (const perm of this.commandInfo.generalPermissions) {
            if (!myPerms.includes(perm))
                results.missingUserPerms.push(perm);
        }

        // Now check role permissions
        const roleOrder: [string, RolePermissions][] = [
            [guildDoc.roles.staffRoles.moderation.moderatorRoleId, "Moderator"],
            [guildDoc.roles.staffRoles.moderation.officerRoleId, "Officer"],
            [guildDoc.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId, "HeadRaidLeader"]
        ];

        // Get all leader roles.
        const allSections = MiscUtils.getAllSections(guildDoc);
        // Add other head leader roles
        for (const section of allSections)
            roleOrder.push([section.roles.leaders.sectionHeadLeaderRoleId, "HeadRaidLeader"]);

        // Add leader roles
        roleOrder.push([guildDoc.roles.staffRoles.universalLeaderRoleIds.leaderRoleId, "RaidLeader"]);
        for (const section of allSections)
            roleOrder.push([section.roles.leaders.sectionRaidLeaderRoleId, "RaidLeader"]);

        // Add almost leader roles
        roleOrder.push([guildDoc.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId, "AlmostRaidLeader"]);
        for (const section of allSections)
            roleOrder.push([section.roles.leaders.sectionAlmostRaidLeaderRoleId, "AlmostRaidLeader"]);

        // Add other roles
        roleOrder.push([guildDoc.roles.staffRoles.moderation.securityRoleId, "Security"]);
        roleOrder.push([guildDoc.roles.verifiedRoleId, "Raider"]);
        roleOrder.push([guildDoc.roles.suspendedRoleId, "Suspended"]);

        // Evaluate permissions.
        let hasPermission = false;
        if (this.commandInfo.isRoleInclusive) {
            // Check if the person has at least one role, starting from the lowest role to the top role.
            // A command that allows for role inclusion should only have one role.
            if (this.commandInfo.rolePermissions.length !== 1)
                throw new Error(`Command ${this.commandInfo.formalCommandName} has more than one role permission.`);

            let i = roleOrder.findIndex(x => x[1] === this.commandInfo.rolePermissions[0]);
            if (i === -1)
                throw new Error(`Command ${this.commandInfo.formalCommandName} has invalid role permissions.`);

            for (; i >= 0; i--) {
                if (userToTest.roles.cache.has(roleOrder[i][0])) {
                    hasPermission = true;
                    break;
                }
            }
        }
        else {
            // Check if the person has at least one role.
            for (const perm of this.commandInfo.rolePermissions) {
                // Get the correct role name
                const associatedId = roleOrder.find(x => x[1] === perm);
                if (!associatedId)
                    continue;
                // Check associated role ID
                if (userToTest.roles.cache.has(associatedId[1])) {
                    hasPermission = true;
                    break;
                }
            }
        }

        // Must either have 0 missing role perms or 0 missing user perms, and 0 missing bot perms.
        results.canRun = (results.missingUserRoles.length === 0 || results.missingUserPerms.length === 0)
            && results.missingBotPerms.length === 0;
        return results;
    }
}

interface ICanRunResult {
    canRun: boolean;
    hasAdmin: boolean;
    missingUserPerms: string[];
    missingUserRoles: string[];
    missingBotPerms: string[];
}

interface ICommandInfo {
    /**
     * The formal, human-readable, command name.
     * @type {string}
     */
    formalCommandName: string;

    /**
     * The way a user would call this command.
     * @type {string[]}
     */
    botCommandNames: string[];

    /**
     * A description of what this command does.
     * @type {string}
     */
    description: string;

    /**
     * Information on how this command is used.
     * @type {string[]}
     */
    usageGuide: string[];

    /**
     * Examples on how the command can be used.
     * @type {string[]}
     */
    exampleGuide: string[];

    /**
     * The duration in which the message that initiated a command should be kept up for.
     * @type {number}
     */
    deleteCommandAfter: number;

    /**
     * A cooldown that users will have to wait out after executing a command.
     * @type {number}
     */
    commandCooldown: number;

    /**
     * The general permissions that the user must have to execute the command.
     * @type {PermissionString[]}
     */
    generalPermissions: PermissionString[];

    /**
     * The permissions that a bot must have to execute this command.
     * @type {PermissionString[]}
     */
    botPermissions: PermissionString[];

    /**
     * The roles that a user must have to run this command.
     * @type {RolePermissions[]}
     */
    rolePermissions: RolePermissions[];

    /**
     * Whether the command can be used by any roles below the top role specified.
     * @type {boolean[]}
     */
    isRoleInclusive: boolean[];

    /**
     * Whether the command is for a server only.
     * @type {boolean}
     */
    guildOnly: boolean;

    /**
     * Whether the command is for the bot owner only.
     * @type {boolean}
     */
    botOwnerOnly: boolean;
}