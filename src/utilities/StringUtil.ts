export namespace StringUtil {
    /**
     * Adds three backticks (`) to the front and end of the string.
     * @param {T} content The content to add backticks to.
     * @return {string} The new string.
     */
    export function codifyString<T>(content: T): string {
        return "```\n" + content + "```";
    }
}