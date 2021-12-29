// noinspection JSUnusedGlobalSymbols

export namespace CommonRegex {
    /**
     * Use this Regex to test if a string contains ONLY letters.
     * @type {RegExp}
     */
    export const ONLY_LETTERS: RegExp = /^[a-z]+$/i;

    /**
     * Use this Regex to test if a string contains ONLY numbers.
     * @type {RegExp}
     */
    export const ONLY_NUMBERS: RegExp = /^[0-9]+$/;

    /**
     * Use this Regex to test (and extract) user mentions.
     * @type {RegExp}
     */
    export const USER_MENTION: RegExp = /^<@!?(\d+)>$/;

    /**
     * Use this Regex to test (and extract) role mentions.
     * @type {RegExp}
     */
    export const ROLE_MENTION: RegExp = /^<@&(\d+)>$/;

    /**
     * Use this Regex to test (and extract) channel mentions.
     * @type {RegExp}
     */
    export const CHANNEL_MENTION: RegExp = /^<#!?(\d+)>$/;
}