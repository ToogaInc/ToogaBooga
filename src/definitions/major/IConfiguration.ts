export interface IConfiguration {
    // The bot's token
    token: string;

    // URL to my private API for verification.
    privateApiUrl: string;

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
        botOwnerIds: Array<string>;

        // Guilds not to include to the database.
        exemptGuilds: Array<string>;
    };

    // Other non-important settings.
    misc: {
        deleteEmbedTime: number;
    };
}