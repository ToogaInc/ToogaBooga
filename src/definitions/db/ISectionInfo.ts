import {IVerificationChannels} from "../parts/IVerificationChannels";
import {IRaidChannels} from "../parts/IRaidChannels";
import {ISectionLeaderRoles} from "../parts/ISectionLeaderRoles";
import {ISuspendedUser} from "../ISuspendedUser";
import {IOtherMajorConfig} from "../parts/IOtherMajorConfig";
import {IManualVerificationEntry} from "../parts/IManualVerificationEntry";

export interface ISectionInfo {
    // A random 30 character ID that can be used to identify this section.
    uniqueIdentifier: string;

    // The section name.
    sectionName: string;

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

    // other major configuration items
    otherMajorConfig: IOtherMajorConfig;

    // general section properties
    properties: {
        // people that are banned from this section
        sectionSuspended: ISuspendedUser[];
        // manual verification entries.
        manualVerificationEntries: IManualVerificationEntry[];
    };
}