/**
 * An interface that represents a configuration file for this bot.
 */
export interface IConfiguration {
    tokens: {
        /**
         * The bot's token.
         *
         * @type {string}
         */
        botToken: string;

        /**
         * The Github token.
         *
         * @type {string}
         */
        githubToken: string;
    };

    /**
     * The bot's invite link.
     *
     * @type {string}
     */
    botInviteUrl: string;

    /**
     * Object that represents slash command configuration.
     *
     * @type {object}
     */
    slash: {
        /**
         * The bot's client ID.
         *
         * @type {string}
         */
        clientId: string;

        /**
         * The guild IDs where guild commands should exit. Specify this DURING DEVELOPMENT ONLY. This is because guild
         * commands update instantly, whereas global commands do not. During production, set this to an empty array
         * so the commands exist globally.
         *
         * @type {string[]}
         */
        guildIds: string[];
    };

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