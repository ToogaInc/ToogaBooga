/**
 * An interface that represents a configuration file for this bot.
 */
export interface IConfiguration {
    /**
     * The bot's token.
     *
     * @type {string}
     */
    botToken: string;

    /**
     * The MongoDB database and collection names and other important things.
     *
     * @type {object}
     */
    database: {
        /**
         * The connection string. This should look like:
         * ```
         * mongodb://[username:password@]host1[:port1][,...hostN[:portN]][/[defaultauthdb][?options]]
         * ```
         * @link https://docs.mongodb.com/manual/reference/connection-string/
         *
         * @type {string}
         */
        connectionString: string;

        /**
         * The database name. This database should contain the collections below.
         *
         * @type {string}
         */
        dbName: string;

        /**
         * The collection names.
         *
         * @type {object}
         */
        collectionNames: {
            /**
             * The bot collection. This is where anything pertaining to the bot should be stored.
             *
             * @type {string}
             */
            botCollection: string;

            /**
             * The user collection. This is where user data will be stored.
             *
             * @type {string}
             */
            userCollection: string;

            /**
             * The guild collection. This is where guild data will be stored.
             *
             * @type {string}
             */
            guildCollection: string;

            /**
             * The ID/Name collection. This is where a person's ID will be linked to his or her name. Anytime a
             * person verifies through this bot (not through manual verification), an entry will be added to this
             * collection.
             *
             * @type {string}
             */
            idNameCollection: string;

            /**
             * The unclaimed blacklist collection. This is where a person's blacklist history will be stored if the
             * person doesn't exist in the database.
             *
             * @type {string}
             */
            unclaimedBlCollection: string;
        };
    };

    /**
     * Github links. This is needed to link users to the proper Github repository and forward issues as necessary.
     *
     * @type {object}
     */
    github: {
        /**
         * The owner or organization that currently holds the repository. In a typical Github project URL, this
         * looks like:
         *
         * ```
         * https://github.com/owner/project
         *                    ^^^^^
         * ```
         *
         * @type {string}
         */
        repositoryOwner: string;

        /**
         * The project name. This is the Github project containing the code to this bot. In a typical Github project
         * URL, this looks like:
         *
         * ```
         * https://github.com/owner/project
         *                          ^^^^^^^
         * ```
         *
         * @type {string}
         */
        repositoryName: string;

        /**
         * The Github token. This is needed to forward issues submitted by users to Github Issues.
         *
         * If this isn't specified, then you cannot submit issues.
         *
         * @type {string}
         */
        githubToken: string;
    };

    /**
     * Any relevant IDs.
     *
     * @type {object}
     */
    ids: {
        /**
         * The bot owner IDs. Any users whose user ID is stored in this array will be given the bot owner
         * status and will be able to execute bot owner-only commands.
         *
         * @type {string[]}
         */
        botOwnerIds: string[];

        /**
         * Any guilds that should not have an entry in the database. These are typically emoji servers. Any guild
         * whose ID is stored in this array will not be able to execute any commands and the bot will completely
         * ignore the guild.
         *
         * @type {string[]}
         */
        exemptGuilds: string[];

        /**
         * The developer mail channel. This is similar to the modmail channels, but any messages meant for the
         * developer will be sent to this channel.
         *
         * @type {string}
         */
        devMailChannel: string;

        /**
         * The storage channel. If the server didn't define a storage channel, it will default to this.
         *
         * @type {string}
         */
        mainStorageChannel: string;
    };

    /**
     * Other random settings.
     *
     * @type {object}
     */
    misc: {
        /**
         * The default prefix. This should only be one character long.
         */
        defaultPrefix: string;

        /**
         * Whether to validate emojis and images. If this is `true`, then any requests to add an emoji or image will
         * be sent to the `customEmojiImgValidatorChannel` channel.
         *
         * This should be `true` if this is a public bot and `false` if this is a self-hosted instance.
         *
         * @type {boolean}
         */
        validateEmojisImage: boolean;
    };

    /**
     * RealmEye API links. This exclusively uses [RealmEyeSharper](https://github.com/ewang2002/RealmEyeSharper/) as
     * the RealmEye API provider.
     *
     * @type {object}
     */
    realmEyeApiLinks: {
        /**
         * The base API link. Generally speaking, this would be:
         * ```
         * https://localhost:5001/api/realmeye/player/basics?name=consolemc
         *         ^^^^^^^^^^^^^^
         * ```
         *
         * @type {string}
         */
        baseApi: string;

        /**
         * The ping endpoint. All this endpoint does is returns an object; the true purpose is to ensure that the
         * API is online.
         *
         * @type {string}
         */
        pingOnline: string;

        /**
         * All relevant raid utility endpoints.
         *
         * @type {object}
         */
        raidUtilEndpoints: {
            /**
             * The parse endpoint. This endpoint will take a /who screenshot and parse it.
             *
             * @type {string}
             */
            parseOnlyEndpoint: string;

            /**
             * The parse endpoint. Just like with the other endpoint, this will parse a /who screenshot, but will
             * also get RealmEye data.
             *
             * @type {string}
             */
            parseAndRealmEyeEndpoint: string;

            /**
             * Given an array of names, this will return an array of RealmEye data.
             *
             * @type {string}
             */
            dataForAllNamesEndpoint: string;
        }

        /**
         * The various player endpoints. This is denoted by:
         *
         * ```
         * https://localhost:5001/api/realmeye/player/basics?name=consolemc
         *                            ^^^^^^^^^^^^^^^^^^^^^^
         * ```
         *
         * @type {object}
         */
        playerEndpoints: {
            /**
             * The basics endpoint. In the example above, this would be `realmeye/players/basics`.
             *
             * @type {string}
             */
            playerBasics: string;

            /**
             * The pet yard endpoint.
             *
             * @type {string}
             */
            petyard: string;

            /**
             * The graveyard endpoint.
             *
             * @type {string}
             */
            graveyard: string;

            /**
             * The graveyard summary endpoint.
             *
             * @type {string}
             */
            graveyardSummary: string;

            /**
             * The name history endpoint.
             *
             * @type {string}
             */
            nameHistory: string;

            /**
             * The rank history endpoint.
             *
             * @type {string}
             */
            rankHistory: string;

            /**
             * The guild history endpoint.
             *
             * @type {string}
             */
            guildHistory: string;

            /**
             * The exaltations endpoint.
             *
             * @type {string}
             */
            exaltations: string;
        };
    };
}