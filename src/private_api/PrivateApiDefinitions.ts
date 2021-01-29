export namespace PrivateApiDefinitions {
    export interface IRealmEyePlayerResponse {
        profileIsPrivate: boolean;
        sectionIsPrivate: boolean;
        name: string;
    }

    export interface IApiStatus extends IRealmEyePlayerResponse {
        online: boolean;
    }

    export interface INameHistory extends IRealmEyePlayerResponse {
        nameHistory: {
            name: string;
            from: string;
            to: string;
        }[];
    }

    export interface IRankHistory extends IRealmEyePlayerResponse {
        rankHistory: {
            rank: number;
            achieved: string;
            date: string;
        }[];
    }
}