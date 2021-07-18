export namespace CommonRegex {
    /**
     * Use this Regex to test if a string contains ONLY letters.
     * @type {RegExp}
     */
    export const OnlyLetters: RegExp = /^[a-z]+$/i;

    /**
     * Use this Regex to test if a string contains ONLY numbers.
     * @type {RegExp}
     */
    export const OnlyNumbers: RegExp = /^[0-9]+$/;

    /**
     * Use this Regex to test (and extract) user mentions.
     * @type {RegExp}
     */
    export const UserMention: RegExp = /^<@!?(\d+)>$/;

    /**
     * Use this Regex to test (and extract) role mentions.
     * @type {RegExp}
     */
    export const RoleMention: RegExp = /^<@&(\d+)>$/;

    /**
     * Use this Regex to test (and extract) channel mentions.
     * @type {RegExp}
     */
    export const ChannelMention: RegExp = /^<#!?(\d+)>$/;
}