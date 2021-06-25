import {IRealmIgn} from "../IRealmIgn";
import {IBaseDocument} from "./IBaseDocument";

export interface IIdNameInfo extends IBaseDocument {
    currentDiscordId: string;
    rotmgNames: IRealmIgn[];

    pastDiscordIds: ({oldId: string;} & IPastEntry)[];
    pastRealmNames: (IRealmIgn & IPastEntry)[];
}

interface IPastEntry {
    // The date which this name or ID was removed.
    toDate: number;
}