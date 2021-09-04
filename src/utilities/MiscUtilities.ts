import {GeneralConstants} from "../constants/GeneralConstants";
import {Snowflake} from "discord.js";
import {CommonRegex} from "../constants/CommonRegex";
import {DefinedRole} from "../definitions/Types";

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
     * Determines whether a `string` is a `Snowflake`.
     * @param {string} item The string to test.
     * @return {item is Snowflake} Whether the string is a `Snowflake`.
     */
    export function isSnowflake(item: string): item is Snowflake {
        return CommonRegex.ONLY_NUMBERS.test(item);
    }

    /**
     * Determines whether a `string` is a `DefinedRole`.
     * @param {string} role The role.
     * @return {role is DefinedRole} Whether the string is a `DefinedRole`.
     */
    export function isDefinedRole(role: string): role is DefinedRole {
        return (GeneralConstants.ROLE_ORDER as string[]).includes(role);
    }
}