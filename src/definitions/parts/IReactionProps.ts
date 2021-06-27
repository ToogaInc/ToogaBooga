import {IMappedReactions} from "../../constants/MappedReactions";

export interface IReactionProps {
    // This will refer to the key found in MappedReactions
    mappingEmojiName: keyof IMappedReactions;
    // 0 means no one can get early location
    maxEarlyLocation: number;
}