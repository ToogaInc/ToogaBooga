import {IRealmIgn} from "../IRealmIgn";
import {IDocument} from "./IDocument";

export interface IIdNameInfo extends IDocument<string> {
    _id: string;
    rotmgNames: IRealmIgn[];
}