import {OverwriteData, PermissionString} from "discord.js";
import { IBasicOverwriteData } from "../definitions";

/**
 * An interface designed to help convert some types found in discord.js's libraries
 * to their near-equivalent types in the project, and vice-versa. This is solely
 * for the purpose of MongoDB.
 * 
 * The reason why we do this (instead of storing discord.js types directly in the
 * database is because there's an issue with the TypeScript server and with discord.js
 * types where we end up with erroneous error messages like "Type instntiation is
 * excessively deep and possibly infinite" or "Type of property '...' circularly references
 * itself in mapped type '...'" (see issue #125), along with extremely degraded
 * type checking performance).  
 */
export namespace DjsToProjUtilities {
    /**
     * Converts the specified basic override info array to a discord.js `OverwriteData[]` object.
     * @param {IBasicOverwriteData[]} basics The basic override info array, usually from the database.
     * @returns {OverwriteData[]} The discord.js version of the parameter.
     */
    export function toOverwriteResolvableArr(basics: IBasicOverwriteData[]): OverwriteData[] {
        const data: OverwriteData[] = [];
        for (const basic of basics) {
            data.push(basic);
        }

        return data;
    }

    /**
     * Converts the given `OverwriteData[]` object to a `IBasicOverwriteData[]` object, suitable for the database.
     * @param {OverwriteData[]} arr The array.
     * @returns {IBasicOverwriteData[]} The object that can be put into the database.
     */
    export function toBasicOverwriteDataArr(arr: OverwriteData[]): IBasicOverwriteData[] {
        const data: IBasicOverwriteData[] = [];
        for (const o of arr) {
            const allow: PermissionString[] = [];
            const deny: PermissionString[] = [];

            if (o.allow) {
                if (Array.isArray(o.allow)) {
                    allow.push(...o.allow);
                }
                else {
                    // Might not be a great way of doing this.
                    allow.push(o.allow as PermissionString);
                }
            }

            if (o.deny) {
                if (Array.isArray(o.deny)) {
                    deny.push(...o.deny);
                }
                else {
                    deny.push(o.deny as PermissionString);
                }
            }

            data.push({
                allow,
                deny,
                id: typeof o.id === "string" ? o.id : o.id.id
            });
        }

        return data;
    }
}