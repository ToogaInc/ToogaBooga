import {IMappedAfkCheckOptionInfo} from "../../constants/MappedAfkCheckOptions";

export interface IAfkCheckButtonInfo {
    // This will refer to the key found in MappedAfkCheckOptions
    mapKey: keyof IMappedAfkCheckOptionInfo;
    // 0 means no one can get early location
    maxEarlyLocation: number;
}