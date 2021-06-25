import {IVerificationProperties} from "./IVerificationProperties";
import {IAfkCheckProperties} from "./IAfkCheckProperties";

export interface IOtherMajorConfig {
    // verification requirements
    verificationProperties: IVerificationProperties;
    // afk check properties
    afkCheckProperties: IAfkCheckProperties;
}