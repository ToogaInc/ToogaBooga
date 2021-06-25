import {ObjectID} from "mongodb";

export interface IBaseDocument<T = ObjectID> {
    _id: T;
}