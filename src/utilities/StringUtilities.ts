import {StringBuilder} from "./StringBuilder";
import {GeneralConstants} from "../constants/GeneralConstants";
import {ArrayUtilities} from "./ArrayUtilities";

export namespace StringUtil {
    /**
     * Adds three backticks (`) to the front and end of the string.
     * @param {T} content The content to add backticks to.
     * @return {string} The new string.
     */
    export function codifyString<T>(content: T): string {
        return "```\n" + content + "```";
    }

    /**
     * Generates a random string.
     * @param {number} amt The length of the string.
     * @return {string} The random string.
     */
    export function generateRandomString(amt: number): string {
        const sb = new StringBuilder();
        for (let i = 0; i < amt; ++i)
            sb.append(ArrayUtilities.getRandomElement(GeneralConstants.ALL_CHARACTERS));
        return sb.toString();
    }
}