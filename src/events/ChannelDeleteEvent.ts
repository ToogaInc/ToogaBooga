import { DMChannel, GuildChannel } from "discord.js";
import { RaidInstance } from "../instances/RaidInstance";

export async function onChannelDeleteEvent(c: DMChannel | GuildChannel): Promise<void> {
    if (c instanceof DMChannel) {
        return;
    }

    // Check raids
    for (const [, raidInstance] of RaidInstance.ActiveRaids) {
        if (raidInstance.raidVc?.id === c.id) {
            await raidInstance.cleanUpRaid(true);
            return;
        }
    }
}