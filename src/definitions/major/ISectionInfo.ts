import {IVerificationChannels} from "./parts/IVerificationChannels";
import {IRaidChannels} from "./parts/IRaidChannels";
import {ISectionLeaderRoles} from "./parts/ISectionLeaderRoles";
import {IAfkCheckProperties} from "./parts/IAfkCheckProperties";
import {IVerificationRequirements} from "./parts/IVerificationRequirements";
import {ISuspendedUser} from "../ISuspendedUser";


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

    // verification requirements
    verification: {
        requirements: IVerificationRequirements;
    }

    // general section properties
    properties: {
        // dungeons that can be raided here.
        dungeons: number[];
        // verification properties
        verificationProperties: IVerificationRequirements;
        // afk check properties
        afkCheckProperties: IAfkCheckProperties;
        // people that are banned from this section
        sectionSuspended: Array<ISuspendedUser>;
    };
}