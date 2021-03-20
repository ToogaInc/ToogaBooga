import {IVerificationRequirements} from "./IVerificationRequirements";

export interface IVerificationProperties {
    // will be shown on the verification embed
    additionalVerificationInfo: string;
    // success message to be sent when someone
    // verifies
    verificationSuccessMessage: string;
    // verification requirements
    verificationRequirements: IVerificationRequirements;
}