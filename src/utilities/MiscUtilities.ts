import {IGuildInfo} from "../definitions/db/IGuildInfo";
import {ISectionInfo} from "../definitions/db/ISectionInfo";
import {StringBuilder} from "./StringBuilder";
import {GeneralConstants} from "../constants/GeneralConstants";
import {ArrayUtilities} from "./ArrayUtilities";
import {Message, MessageActionRow, MessageButton, MessageOptions, Snowflake} from "discord.js";
import {CommonRegex} from "../constants/CommonRegex";

export namespace MiscUtilities {

    /**
     * Returns an array containing all sections. In particular, this function will give you a section representation
     * of the main section.
     * @param {IGuildInfo} guildDb The guild document.
     * @return {ISectionInfo[]} The array of sections in this server.
     */
    export function getAllSections(guildDb: IGuildInfo): ISectionInfo[] {
        const sections: ISectionInfo[] = [];
        sections.push({
            channels: {
                raids: guildDb.channels.raidChannels,
                verification: guildDb.channels.verificationChannels
            },
            isMainSection: true,
            otherMajorConfig: guildDb.otherMajorConfig,
            properties: {
                sectionSuspended: [],
                manualVerificationEntries: guildDb.manualVerificationEntries
            },
            roles: {
                leaders: guildDb.roles.staffRoles.sectionLeaderRoleIds,
                verifiedRoleId: guildDb.roles.verifiedRoleId
            },
            sectionName: "Main",
            uniqueIdentifier: "MAIN"
        });

        sections.push(...guildDb.guildSections);
        return sections;
    }

    /**
     * Stops execution of a function for a specified period of time.
     * @param {number} time The time, in milliseconds, to delay execution.
     * @returns {Promise<void>}
     */
    export async function stopFor(time: number): Promise<void> {
        return new Promise(resolve => {
            setTimeout(() => {
                return resolve();
            }, time);
        });
    }

    /**
     * Gets the current time in a nice string format.
     * @param {Date | number} [date = new Date()] The date to choose, if any.
     * @param {string} [timezone = "Atlantic/Reykjavik"] The timezone, if applicable. Otherwise, UTC is used.
     * @returns {string} The current formatter date & time.
     */
    export function getTime(date: Date | number = new Date(), timezone: string = "Atlantic/Reykjavik"): string {
        if (!isValidTimeZone(timezone)) {
            return new Intl.DateTimeFormat([], {
                year: "numeric",
                month: "numeric",
                day: "numeric",
                hour: "numeric",
                minute: "numeric",
                second: "numeric",
            }).format(date);
        }
        const options: Intl.DateTimeFormatOptions = {
            timeZone: timezone,
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
        };
        return new Intl.DateTimeFormat([], options).format(date);
    }

    /**
     * Determines whether the given timezone is valid or not.
     * @param {string} tz The timezone to test.
     * @returns {boolean} Whether the timezone is valid.
     * @see https://stackoverflow.com/questions/44115681/javascript-check-if-timezone-name-valid-or-not
     * @see https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
     */
    export function isValidTimeZone(tz: string): boolean {
        /*
        if (Intl || !Intl.DateTimeFormat().resolvedOptions().timeZone) {
            throw 'Time zones are not available in this environment';
        }*/
        try {
            Intl.DateTimeFormat(undefined, {timeZone: tz.trim()});
            return true;
        } catch (ex) {
            return false;
        }
    }

    /**
     * Generates a somewhat unique ID.
     * @param {[number = 30]} num The length.
     * @return {string} The ID.
     */
    export function generateUniqueId(num: number = 30): string {
        const id = new StringBuilder(Date.now().toString());
        for (let i = 0; i < num; i++)
            id.append(ArrayUtilities.getRandomElement(GeneralConstants.ALL_CHARACTERS));
        return id.toString();
    }

    /**
     * Determines whether a `string` is a `Snowflake`.
     * @param {string} item The string to test.
     * @return {item is Snowflake} Whether the string is a `Snowflake`.
     */
    export function isSnowflake(item: string): item is Snowflake {
        return CommonRegex.OnlyNumbers.test(item);
    }

    /**
     * Gets an array of `MessageActionRow` from an array of buttons.
     * @param {MessageButton[]} buttons The buttons.
     * @return {MessageActionRow[]} The array of `MessageActionRow`.
     */
    export function getActionRowsFromButtons(buttons: MessageButton[]): MessageActionRow[] {
        const allButtons = buttons.slice();
        const rows: MessageActionRow[] = [];
        while (allButtons.length > 0) {
            const actionRow = new MessageActionRow();
            for (let i = 0; i < 5 && allButtons.length > 0; i++)
                actionRow.addComponents(allButtons.shift()!);
            rows.push(actionRow);
        }
        return rows;
    }

    /**
     * Removes all components from a message.
     * @param {Message} msg The message.
     * @param {MessageActionRow[]} components The components, if any.
     * @return {MessageOptions} The new `MessageOptions`.
     */
    export function getMessageOptionsFromMessage(
        msg: Message,
        components?: MessageActionRow[]
    ): MessageOptions & {split?: false | undefined} {
        const obj: MessageOptions & {split?: false | undefined} = {
            components: []
        };
        if (msg.content)
            obj.content = msg.content;
        if (msg.embeds.length !== 0)
            obj.embeds = msg.embeds;
        if (msg.attachments.size !== 0)
            obj.files = msg.attachments.array();

        if (msg.components)
            obj.components = components;
        else
            obj.components = msg.components;

        return obj;
    }
}