import {ObjectID} from "mongodb";

export interface IDocument<T = ObjectID> {
    _id?: T;
}