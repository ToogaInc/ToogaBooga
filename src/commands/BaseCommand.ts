import {Collection, Guild, GuildMember, Message, PermissionString, Role, User} from "discord.js";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {OneLifeBot} from "../OneLifeBot";
import {GeneralConstants} from "../constants/GeneralConstants";
import {FetchGetRequestUtilities} from "../utilities/FetchGetRequestUtilities";

// Type alias
type RolePermissions = GeneralConstants.RolePermissions;

export abstract class BaseCommand {
    private static readonly ROLE_ORDER: RolePermissions[] = [
        "Moderator",
        "HeadRaidLeader",
        "Officer",
        "VeteranRaidLeader",
        "RaidLeader",
        "AlmostRaidLeader",
        "Security",
        "Raider",
        "Suspended",
        "Everyone"
    ];

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
     * @param {IGuildInfo} [guildDoc] The guild document.
     * @return {Promise<number>} The command result. 0 = success, any other number = fail.
     */
    public abstract run(msg: Message, args: string[], guildDoc?: IGuildInfo): Promise<number>;

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
        if (this.commandInfo.botOwnerOnly && !OneLifeBot.BotInstance.config.ids.botOwnerIds.includes(userToTest.id))
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

        // If you have full Administrator, you can run this command (if the bot can)
        if (userToTest.permissions.has("ADMINISTRATOR")) {
            // Check to make sure the bot can run the command.
            results.canRun = results.missingBotPerms.length === 0;
            results.hasAdmin = true;
            return results;
        }

        // See if custom permissions are defined.
        // If so, use it.
        const customPermData = guildDoc.properties.customCmdPermissions.find(x => x.key === this.commandInfo.cmdCode);
        const useCustomRolePerms = Boolean(customPermData && !customPermData.value.useDefaultRolePerms);
        const rolePermissions = useCustomRolePerms
            ? customPermData!.value.rolePermsNeeded
            : this.commandInfo.rolePermissions;
        // This represents the roles that are needed to ensure that the command can be executed. The user must have
        // at least one of these roles.
        const allRoleIds = this.getNeededPermissionsBase(rolePermissions, guildDoc, useCustomRolePerms);

        const serverPermissions = customPermData && !customPermData.value.useDefaultServerPerms
            ? customPermData.value.serverPermsNeeded
            : this.commandInfo.generalPermissions;

        // If no user permissions are defined whatsoever, then the person can run the command.
        if (allRoleIds.length === 0 && serverPermissions.length === 0) {
            results.canRun = results.missingBotPerms.length === 0;
            return results;
        }

        // Check user permissions.
        const myPerms = userToTest.permissions.toArray();
        for (const perm of serverPermissions) {
            if (!myPerms.includes(perm))
                results.missingUserPerms.push(perm);
        }

        const roleArr: Role[] = [];
        let hasPermission = false;
        for (const roleId of allRoleIds) {
            if (FetchGetRequestUtilities.hasCachedRole(userToTest, roleId)) {
                hasPermission = true;
                break;
            }

            const role = FetchGetRequestUtilities.getCachedRole(guild, roleId);
            if (!role) continue;
            roleArr.push(role);
        }

        if (!hasPermission)
            results.missingUserRoles.push(...roleArr.map(x => x.name));


        // If both role and general perms are defined, then we just need to see if one or the other is fulfilled.
        // Otherwise, we either check role OR general permissions and see if the person has THOSE permissions.
        // We already covered the case where no permissions (user or role) are defined.
        if (allRoleIds.length !== 0 && serverPermissions.length !== 0)
            // Must either have 0 missing role perms or 0 missing user perms.
            results.canRun = (results.missingUserRoles.length === 0 || results.missingUserPerms.length === 0);
        else {
            // Check one or the other.
            if (allRoleIds.length !== 0) results.canRun = results.missingUserRoles.length === 0;
            else results.canRun = results.missingUserPerms.length === 0;
        }

        // Check to see if the bot can run.
        results.canRun &&= results.missingBotPerms.length === 0;
        return results;
    }

    /**
     * Gets all roles that are needed in order to run this command.
     * @param {string[]} rolePerms The role permissions. If role inclusion is enabled for the command, there must
     * only be one role.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {boolean} usingCustomPermissions Whether we are using custom permissions.
     * @return {string[]} All roles that can be used to satisfy the requirement.
     * @private
     */
    private getNeededPermissionsBase(rolePerms: string[], guildDoc: IGuildInfo,
                                     usingCustomPermissions: boolean): string[] {
        const allHrl: string[] = [
            guildDoc.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId,
            guildDoc.roles.staffRoles.sectionLeaderRoleIds.sectionHeadLeaderRoleId
        ];
        const allVrl: string[] = [
            guildDoc.roles.staffRoles.universalLeaderRoleIds.vetLeaderRoleId,
            guildDoc.roles.staffRoles.sectionLeaderRoleIds.sectionVetLeaderRoleId
        ];
        const allRl: string[] = [
            guildDoc.roles.staffRoles.universalLeaderRoleIds.leaderRoleId,
            guildDoc.roles.staffRoles.sectionLeaderRoleIds.sectionRaidLeaderRoleId
        ];
        const allArl: string[] = [
            guildDoc.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId,
            guildDoc.roles.staffRoles.sectionLeaderRoleIds.sectionAlmostRaidLeaderRoleId
        ];
        const allVerified: string[] = [guildDoc.roles.verifiedRoleId];
        for (const section of guildDoc.guildSections) {
            allHrl.push(section.roles.leaders.sectionHeadLeaderRoleId);
            allRl.push(section.roles.leaders.sectionRaidLeaderRoleId);
            allVrl.push(section.roles.leaders.sectionVetLeaderRoleId);
            allArl.push(section.roles.leaders.sectionAlmostRaidLeaderRoleId);
            allVerified.push(section.roles.verifiedRoleId);
        }

        const roleCollection = new Collection<RolePermissions, string[]>();
        roleCollection.set("Moderator", [guildDoc.roles.staffRoles.moderation.moderatorRoleId]);
        roleCollection.set("HeadRaidLeader", allHrl);
        roleCollection.set("Officer", [guildDoc.roles.staffRoles.moderation.officerRoleId]);
        roleCollection.set("VeteranRaidLeader", allVrl);
        roleCollection.set("RaidLeader", allRl);
        roleCollection.set("AlmostRaidLeader", allArl);
        roleCollection.set("Security", [guildDoc.roles.staffRoles.moderation.securityRoleId]);
        roleCollection.set("Team", [guildDoc.roles.staffRoles.teamRoleId]);
        roleCollection.set("Raider", allVerified);
        roleCollection.set("Suspended", [guildDoc.roles.suspendedRoleId]);

        // If this is true, then we cannot have custom permissions.
        // So we don't need to worry about ID roles and we can assume that
        // there is only one element in rolePerms.
        if (this.commandInfo.isRoleInclusive && !usingCustomPermissions) {
            if (rolePerms.length !== 1)
                throw new Error("rolePerms needs exactly one role for isRoleInclusive check.");

            // We want to specifically get rid of the lower roles so we are left with the lowest role possible
            // and the ones directly above said role.
            // Assume that the index exists.
            let idx = BaseCommand.ROLE_ORDER.findIndex(x => x === rolePerms[0]);
            // Increment the index so we don't remove the lowest possible included role.
            idx++;
            for (; idx < BaseCommand.ROLE_ORDER.length; idx++)
                roleCollection.delete(BaseCommand.ROLE_ORDER[idx]);
        }
        else {
            // Here, we need to assume that there are both role IDs along with concrete role names.
            // Best way to handle this is to simply delete any entries in roleCollection that isn't allowed
            // And then add the IDs later.
            // Begin by getting rid of any roles from the collection that aren't needed at all.
            for (const r of BaseCommand.ROLE_ORDER) {
                if (rolePerms.includes(r)) continue;
                roleCollection.delete(r);
            }
        }

        return Array.from(roleCollection.values()).flat().concat(rolePerms.filter(x => !Number.isNaN(x)));
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
     * An identifier for this command.
     * @type {string}
     */
    cmdCode: string;

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
     * The duration, in milliseconds, in which the message that initiated a command should be kept up for.
     * @type {number}
     */
    deleteCommandAfter: number;

    /**
     * A cooldown, in milliseconds, that users will have to wait out after executing a command.
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
    isRoleInclusive: boolean;

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

    /**
     * Minimum arguments needed.
     * @type {number}
     */
    minArgs: number;
}