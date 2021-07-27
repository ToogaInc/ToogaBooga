/**
 * An interface that represents a typical modmail thread.
 */
export interface IModmailThread {
    /**
     * The modmail recipient. This is the person sent the original modmail to server staff and the person who any
     * responses (from staff) will be sent to.
     *
     * @type {string}
     */
    initiatorId: string;

    /**
     * The person that converted the modmail message to a modmail thread. This will most likely be a staff member.
     *
     * @type {string}
     */
    initiatedById: string;

    /**
     * The base message. This is the message that is pinned and the message that will have all the buttons (Respond,
     * Blacklist, Close).
     *
     * @type {string}
     */
    baseMsg: string;

    /**
     * When the modmail thread was created.
     *
     * @type {number}
     */
    startedOn: number;

    /**
     * The modmail thread channel.
     *
     * @type {string}
     */
    channel: string;

    /**
     * The original modmail message ID. This is the message (in #modmail or something equivalent) that the original
     * modmail author sent.
     *
     * @type {string}
     */
    originalModmailMessageId: string;

    /**
     * A series of messages sent by staff and the modmail creator.
     *
     * @type {IModmailThreadMessage[]}
     */
    messages: IModmailThreadMessage[];
}

/**
 * An interface that represents a modmail thread message.
 */
export interface IModmailThreadMessage {
    /**
     * The author's ID.
     *
     * @type {string}
     */
    authorId: string;

    /**
     * The author's tag (username#0000).
     *
     * @type {string}
     */
    tag: string;

    /**
     * The time that this message was sent.
     *
     * @type {string}
     */
    timeSent: number;

    /**
     * The content of the message.
     *
     * @type {string}
     */
    content: string;

    /**
     * Any attachments. This should be the URLs of all attachments.
     *
     * @type {string[]}
     */
    attachments: string[];
}