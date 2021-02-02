export interface IConfiguration {
    // The bot's token
    token: string;

    // The collection names
    database: {
        // The database connection URL.
        dbUrl: string;

        // Database name to connect to
        dbName: string;

        // Collection name
        collectionNames: {
            botCollection: string;
            userCollection: string;
            guildCollection: string;
        };
    };

    github: {
        // Can be organization or user.
        repositoryOwner: string;

        // Project name
        repositoryName: string;

        // Token
        githubToken: string;
    };

    // Relevant Discord IDs
    ids: {
        // IDs of all bot owners
        botOwnerIds: string[];

        // Guilds not to include to the database.
        exemptGuilds: string[];
    };

    // Other non-important settings.
    misc: {
        deleteEmbedTime: number;
        defaultPrefix: string;
    };

    // Private API URLs.
    privateApiLinks: {
        baseApi: string;
        pingOnline: string;
        parseEndpoint: string;
        realmEye: {
            playerBasics: string;
            petyard: string;
            graveyard: string;
            graveyardSummary: string;
            nameHistory: string;
            rankHistory: string;
            guildHistory: string;
            exaltations: string;
        };
    };
}