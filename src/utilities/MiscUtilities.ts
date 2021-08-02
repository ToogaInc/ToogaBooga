import {StringBuilder} from "./StringBuilder";
import {GeneralConstants} from "../constants/GeneralConstants";
import {ArrayUtilities} from "./ArrayUtilities";
import {Snowflake} from "discord.js";
import {CommonRegex} from "../constants/CommonRegex";

export namespace MiscUtilities {
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
        return CommonRegex.ONLY_NUMBERS.test(item);
    }
}