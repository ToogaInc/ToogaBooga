/**
 * An interface that represents a suspended user, which will be stored in the guild document.
 */
import {IRealmIgn} from "./MongoDocumentInterfaces";

export interface ISuspendedUser {
    /**
     * The person's nickname (`displayName`).
     *
     * @type {string}
     */
    nickname: string;

    /**
     * The person's Discord ID. Used to automatically issue the suspended role for people that rejoined the server
     * while suspended.
     *
     * @type {string}
     */
    discordId: string;

    /**
     * The moderator in-game name.
     *
     * @type {string}
     */
    moderatorName: string;

    /**
     * The reason for this suspension.
     *
     * @type {string}
     */
    reason: string;

    /**
     * The date/time when this suspension was issued.
     *
     * @type {number}
     */
    timeIssued: number;

    /**
     * When this suspension will end.
     *
     * @type {number}
     */
    timeEnd: number;

    /**
     * The person's old roles. This will be given back to suspended users upon the end of suspension.
     *
     * @type {string[]}
     */
    oldRoles: string[];
}

/**
 * An interface that represents a blacklisted user.
 */
export interface IBlacklistedUser {
    /**
     * The person's in-game name. This is the name that was blacklisted (!blacklist [name]). As a side note, if
     * this person is found in the database, then any additional names associated with this account will be blacklisted.
     *
     * @type {string}
     */
    realmNames: IRealmIgn;

    /**
     * The Discord ID associated with the person that was blacklisted.
     *
     * If the person is not found in the server, this will be empty.
     *
     * @type {string}
     */
    discordId: string;

    /**
     * The moderator's name.
     *
     * @type {string}
     */
    moderatorName: string;

    /**
     * The reason for the blacklist.
     *
     * @type {string}
     */
    reason: string;

    /**
     * The date/time that this person was blacklisted.
     *
     * @type {number}
     */
    dateTime: number;
}

/**
 * An interface that represents a blacklisted modmail user.
 */
export interface IBlacklistedModmailUser {
    /**
     * The Discord ID associated with the person that was modmail blacklisted.
     *
     * @type {string}
     */
    discordId: string;

    /**
     * The moderator's name.
     *
     * @type {string}
     */
    moderatorName: string;

    /**
     * The date/time that this person was blacklisted.
     *
     * @type {number}
     */
    dateTime: string;

    /**
     * The reason for the blacklist.
     *
     * @type {string}
     */
    reason: string;
}