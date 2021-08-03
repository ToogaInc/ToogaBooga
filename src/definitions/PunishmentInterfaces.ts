/**
 * An interface that represents a suspended user, which will be stored in the guild document.
 */
import {IRealmIgn} from "./MongoDocumentInterfaces";

/**
 * The base punishment interface. All punishment objects will derive this object.
 */
export interface IBasePunishment {
    /**
     * The person that received the punishment (or got the punishment removed).
     *
     * @type {object}
     */
    affectedUser: {
        /**
         * The person's ID.
         *
         * @type {string}
         */
        id: string;

        /**
         * The person's tag (User#0000).
         *
         * @type {string}
         */
        tag: string;

        /**
         * The person's name.
         *
         * @type {string}
         */
        name: string;
    };

    /**
     * The moderator that was responsible for this moderation action.
     *
     * @type {object}
     */
    moderator: {
        /**
         * The moderator's ID.
         *
         * @type {string}
         */
        id: string;

        /**
         * The moderator's tag (User#0000).
         *
         * @type {string}
         */
        tag: string;

        /**
         * The moderator's name.
         *
         * @type {string}
         */
        name: string;
    };

    /**
     * The reason for this punishment (or removal of punishment).
     *
     * @type {string}
     */
    reason: string;
}

/**
 * An interface representing a muted user.
 */
export interface IMutedUser extends IBasePunishment {
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
}

/**
 * An interface representing a suspended user.
 */
export interface ISuspendedUser extends IBasePunishment {
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
export interface IBlacklistedUser extends Omit<IBasePunishment, "affectedUser"> {
    /**
     * The person's in-game name. This is the name that was blacklisted (!blacklist [name]). As a side note, if
     * this person is found in the database, then any additional names associated with this account will be blacklisted.
     *
     * @type {string}
     */
    realmName: IRealmIgn;

    /**
     * The Discord ID associated with the person that was blacklisted.
     *
     * If the person is not found in the server, this will be empty.
     *
     * @type {string}
     */
    discordId: string;

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
export interface IBlacklistedModmailUser extends IBasePunishment{
    /**
     * The date/time that this person was blacklisted.
     *
     * @type {number}
     */
    dateTime: string;
}