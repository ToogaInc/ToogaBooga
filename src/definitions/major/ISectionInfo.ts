import {IVerificationChannels} from "./parts/IVerificationChannels";
import {IRaidChannels} from "./parts/IRaidChannels";
import {ISectionLeaderRoles} from "./parts/ISectionLeaderRoles";
import {IAfkCheckProperties} from "./parts/IAfkCheckProperties";
import {IVerificationProperties} from "./parts/IVerificationProperties";
import {ISuspendedUser} from "../ISuspendedUser";
import {IVerificationRequirements} from "./parts/IVerificationRequirements";
import {IOtherMajorConfig} from "./parts/IOtherMajorConfig";


export interface ISectionInfo {
    // A random 30 character ID that can be used to identify this section.
    uniqueIdentifier: string;

    // Whether the section is the main section or not.
    isMainSection: boolean;

    // all channels
    channels: {
        verification: IVerificationChannels;
        raids: IRaidChannels;
    };

    // all roles
    roles: {
        leaders: ISectionLeaderRoles;
        verifiedRoleId: string;
    };

    otherMajorConfig: IOtherMajorConfig;

    // general section properties
    properties: {
        // verification properties
        verificationProperties: IVerificationProperties;
        // afk check properties
        afkCheckProperties: IAfkCheckProperties;
        // people that are banned from this section
        sectionSuspended: Array<ISuspendedUser>;
    };
}