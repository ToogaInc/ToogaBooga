import {StringBuilder} from "./StringBuilder";
import {GeneralConstants} from "../constants/GeneralConstants";
import {ArrayUtilities} from "./ArrayUtilities";
import {Emojis} from "../constants/Emojis";

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

    /**
     * Gets a progress bar in the form of square emojis.
     * @param {number} numSquares The number of squares.
     * @param {number} percent The percent of squares to fill as green, yellow, or red. Green for <50%, yellow for
     * 50-80%, and red for >80%.
     * @return {string} The formatted string.
     */
    export function getEmojiProgressBar(numSquares: number, percent: number): string {
        let numPut = 0;
        let returnStr = "";
        const compEmojiUsed = percent < 0.50
            ? Emojis.GREEN_SQUARE_EMOJI
            : percent < 0.80
                ? Emojis.YELLOW_SQUARE_EMOJI
                : Emojis.RED_SQUARE_EMOJI;
        for (let i = 0; i < Math.min(Math.floor(percent * numSquares), numSquares); i++) {
            returnStr += compEmojiUsed;
            numPut++;
        }

        for (let i = 0; i < numSquares - numPut; i++) {
            returnStr += Emojis.BLACK_SQUARE_EMOJI;
        }

        return returnStr;
    }

    /**
     * Breaks a string into substrings, each with size at most specified by `size`.
     * @param {string} str The string.
     * @param {number} size The size per substring.
     * @return {string[]} The string array.
     */
    export function breakStringIntoChunks(str: string, size: number): string[] {
        const numChunks = Math.ceil(str.length / size);
        const chunks = new Array(numChunks);

        for (let i = 0, o = 0; i < numChunks; ++i, o += size)
            chunks[i] = str.substr(o, size);

        return chunks;
    }

    /**
     * Parses a string containing numbers separated by a comma or space.
     * @param {string} str The string.
     * @returns {number[]} The numbers.
     */
    export function parseNumbers(str: string): number[] {
        const finalArr = new Set<number>();
        const initStr = str.split(/, |,| /);
        for (const elem of initStr) {
            if (elem.includes("-") && elem.substring(elem.indexOf("-") + 1).length > 0) {
                const [a, b] = elem.split("-");
                const aNum = Number.parseInt(a, 10);
                const bNum = Number.parseInt(b, 10);
                if (Number.isNaN(aNum) || Number.isNaN(bNum))
                    continue;

                if (aNum >= bNum) {
                    finalArr.add(aNum);
                    continue;
                }

                for (let i = aNum; i <= bNum; i++)
                    finalArr.add(i);

                continue;
            }

            const num = Number.parseInt(elem, 10);
            if (Number.isNaN(num))
                continue;

            finalArr.add(num);
        }

        return Array.from(finalArr);
    }
}