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

    /**
     * Converts a RGB value to the corresponding hex string.
     * @param {number} r Red value.
     * @param {number} g Green value.
     * @param {number} b Blue value.
     * @returns {string} The hex string. This will start with `#`.
     * @see https://stackoverflow.com/a/5623914
     */
    export function rgbToHex(r: number, g: number, b: number): string {
        // rgb          xx xx xx
        //              r  g  b
        // binary       xxxxxxxx xxxxxxxx xxxxxxxx
        //                  r        g        b
        //
        // hex string   # xx xx xx
        // binary       xxxxxxxx xxxxxxxx xxxxxxxx
        // r -> shift 24 bits to left
        // g -> shift 8 bits to left
        // b -> keep as normal
        //
        // shift 1 24 bits to the left so we know we're working with 24 bits
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }

    /**
     * Converts a hex string to the corresponding RGB value.
     * @param {string} hex The hex string.
     * @returns {[number, number, number]} A tuple containing the [R, G, B] values.
     */
    export function hexToRgb(hex: string): [number, number, number] {
        if (hex.startsWith("#"))
            hex = hex.slice(1);
        const num = Number.parseInt(hex, 16);
        // hex string: # xx xx xx
        //             24      16        8
        // binary str: xxxxxxxx xxxxxxxx xxxxxxxx
        //                 r        g        b
        // r -> shift 16 right                      num >> 16
        // g -> shift 8 right, keep bits 0-8        (num >> 8) & 0b1111_1111
        // b -> no need to shift, keep bits 0-8     num & 0b1111_1111
        return [(num >> 16) & 0b1111_1111, (num >> 8) & 0b1111_1111, num & 0b1111_1111];
    }
}