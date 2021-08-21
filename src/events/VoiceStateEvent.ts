import {VoiceState} from "discord.js";
import {RaidInstance} from "../instances/RaidInstance";

export async function onVoiceStateEvent(oldState: VoiceState, newState: VoiceState): Promise<void> {
    // Only want events that pertain to this raid.
    for (const [, raidInstance] of RaidInstance.ActiveRaids) {
        if (raidInstance.raidVc?.id !== oldState.channel?.id && raidInstance.raidVc?.id !== newState.channel?.id)
            continue;
        await raidInstance.voiceStateUpdateEventFunction(oldState, newState);
        return;
    }
}