import { OverwriteData } from "discord.js";
import { IBasicOverwriteData } from "../definitions";
import { StringBuilder } from "./StringBuilder";

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
     * Converts the given `OverwriteData[]` object to a `IBasicOverwriteData[]` object, suitable for the database.
     * @param {OverwriteData[]} arr The array.
     * @returns {IBasicOverwriteData[]} The object that can be put into the database.
     */
    export function toBasicOverwriteDataArr(arr: OverwriteData[]): IBasicOverwriteData[] {
        const data: IBasicOverwriteData[] = [];
        for (const o of arr) {
            const obj: IBasicOverwriteData = {
                allow: "0",
                deny: "0",
                id: typeof o.id === "string" ? o.id : o.id.id,
                type: o.type
            };

            if (o.allow) {
                if (typeof o.allow === "object" && "bitfield" in o.allow) {
                    obj.allow = o.allow.bitfield.toString();
                }
                else {
                    console.error(
                        new StringBuilder()
                            .append("Invalid 'allow' object.").appendLine()
                            .append(`\t${JSON.stringify(o)}`)
                            .toString()
                    );
                }
            }

            if (o.deny) {
                if (typeof o.deny === "object" && "bitfield" in o.deny) {
                    obj.deny = o.deny.bitfield.toString();
                }
                else {
                    console.error(
                        new StringBuilder()
                            .append("Invalid 'deny' object.").appendLine()
                            .append(`\t${JSON.stringify(o)}`)
                            .toString()
                    );
                }
            }

            data.push(obj);
        }

        return data;
    }
}