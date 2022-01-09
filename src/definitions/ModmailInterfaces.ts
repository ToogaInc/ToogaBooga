/**
 * An interface that represents a typical modmail thread.
 */
export interface IModmailThread {
    /**
     * The base modmail message that has a thread attached to it.
     *
     * @type {string}
     */
    baseMsg: string;

    /**
     * The thread ID associated with this modmail message. This is where modmail communications take place.
     *
     * @type {string}
     */
    threadId: string;

    /**
     * The person that will be receiving the modmail message responses.
     *
     * @type {string}
     */
    recipientId: string;
}