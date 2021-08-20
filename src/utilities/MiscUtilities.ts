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