import {IRealmIgn} from "../IRealmIgn";
import {IBaseDocument} from "./IBaseDocument";

export interface IIdNameInfo extends IBaseDocument {
    discordId: string;
    rotmgNames: IRealmIgn[];
}