import { IResolvedMember } from "../../../managers/UserManager";
import { CommandInteraction, GuildMember } from "discord.js";

/**
 * Checks if the punishment can be issued. This checks
 * - If the person to punish exists in the server.
 * - If the person to punish doesn't have a higher role than the person that is punishing the person.
 *
 * @param {CommandInteraction} interaction The interaction.
 * @param {GuildMember} moderator The moderator.
 * @param {IResolvedMember | null} resMember The member to punish or un-punish.
 * @returns {Promise<boolean>} Whether the issuing of the punishment or removal of the punishment can continue.
 */
export async function preCheckPunishment(interaction: CommandInteraction, moderator: GuildMember,
                                         resMember: IResolvedMember | null): Promise<boolean> {
    const guild = moderator.guild;
    if (!resMember) {
        await interaction.editReply({
            content: "This member could not be resolved. Please try again.",
        });

        return false;
    }

    if (guild.ownerId === resMember.member.id
        || resMember.member.roles.highest.comparePositionTo(moderator.roles.highest) >= 0) {
        await interaction.editReply({
            content: "The member you are trying to punish or un-punish has a role that is equal or higher in"
                + " position to your highest role's position, or the member is the owner of this server. Please"
                + " try again.",
        });

        return false;
    }

    return true;
}