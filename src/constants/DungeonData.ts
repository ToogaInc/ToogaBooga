import {IDungeonInfo} from "../definitions/major/parts/IDungeonInfo";
import {Emojis} from "./Emojis";
import ARMOR_BREAK = Emojis.ARMOR_BREAK;
import SLOW = Emojis.SLOW;
import BRAIN_PRISM = Emojis.BRAIN_PRISM;
import WARRIOR = Emojis.WARRIOR;
import KNIGHT = Emojis.KNIGHT;
import PRIEST = Emojis.PRIEST;
import PALADIN = Emojis.PALADIN;
import TRICKSTER = Emojis.TRICKSTER;
import BARD = Emojis.BARD;
import RUSHING_CLASS = Emojis.RUSHING_CLASS;
import PARALYZE = Emojis.PARALYZE;
import SAMURAI = Emojis.SAMURAI;
import MYSTIC = Emojis.MYSTIC;
import DAZE = Emojis.DAZE;
import MSEAL = Emojis.MSEAL;

export const DungeonData: Array<IDungeonInfo> = [
    {
        id: 0,
        dungeonName: "Snake Pit",
        portalEmojiId: "561248700291088386",
        keyData: [
            {
                keyEmojiId: "561248916734083075",
                keyEmojiName: "Snake Pit Key"
            }
        ],
        reactions: [
            RUSHING_CLASS
        ],
        portalLink: "https://cdn.discordapp.com/attachments/561245975767941120/561248354173190176/Snake_Pit_Portal.png",
        bossLinks: ["https://static.drips.pw/rotmg/wiki/Enemies/Stheno%20the%20Snake%20Queen.png"],
        dungeonColors: [
            0x29c71e
        ]
    },
    {
        id: 1,
        dungeonName: "Magic Woods",
        portalEmojiId: "561248700870033408",
        keyData: [
            {
                keyEmojiId: "561248916805386270",
                keyEmojiName: "Magic Woods Key"
            }
        ],
        reactions: [
            RUSHING_CLASS
        ],
        portalLink: "https://i.imgur.com/mvUTUNo.png",
        bossLinks: ["https://i.imgur.com/jVimXOv.png"],
        dungeonColors: [
            0x1fcfcc
        ]
    },
    {
        id: 2,
        dungeonName: "Sprite World",
        portalEmojiId: "561249801501540363",
        keyData: [
            {
                keyEmojiId: "561249834292477967",
                keyEmojiName: "Sprite World Key"
            }
        ],
        reactions: [
            RUSHING_CLASS
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Glowing%20Portal.png",
        bossLinks: ["https://static.drips.pw/rotmg/wiki/Enemies/Limon%20the%20Sprite%20God.png"],
        dungeonColors: [
            0xffffff,
            0x9f22b3,
            0,
            0xe6df15
        ]
    },
    {
        id: 41,
        dungeonName: "Ancient Ruins",
        portalEmojiId: "745810341115461694",
        keyData: [
            {
                keyEmojiId: "745810341312593950",
                keyEmojiName: "Ancient Ruins Key"
            }
        ],
        reactions: [
            PARALYZE,
            SLOW,
            KNIGHT
        ],
        portalLink: "https://i.imgur.com/d7MSK2x.png",
        bossLinks: [
            "https://i.imgur.com/z01EB30.png",
            "https://i.imgur.com/jXZrNGl.png"
        ],
        dungeonColors: [
            0xe6d485,
            0xbaa263,
            0xb7934b,
            0x94643a
        ]
    },
    {
        id: 3,
        dungeonName: "Candyland Hunting Grounds",
        portalEmojiId: "561248700916301825",
        keyData: [
            {
                keyEmojiId: "561248916989935656",
                keyEmojiName: "Candyland Hunting Grounds Key"
            }
        ],
        reactions: [],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Candyland%20Portal.png",
        bossLinks: [
            "https://static.drips.pw/rotmg/wiki/Enemies/Gigacorn.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Desire%20Troll.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Spoiled%20Creampuff.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/MegaRototo.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Swoll%20Fairy.png"
        ],
        dungeonColors: [
            0xde1dc1,
            0xbdf7fc
        ]
    },
    {
        id: 4,
        dungeonName: "Cave of a Thousand Treasures",
        portalEmojiId: "561248701809557511",
        keyData: [
            {
                keyEmojiId: "561248916968964129",
                keyEmojiName: "Cave of a Thousand Treasures Key"
            }
        ],
        reactions: [
            RUSHING_CLASS
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Treasure%20Cave%20Portal.png",
        bossLinks: ["https://static.drips.pw/rotmg/wiki/Enemies/Golden%20Oryx%20Effigy.png"],
        dungeonColors: [
            0xd1c819,
            0x8a1d1d,
            0x3d3434
        ]
    },
    {
        id: 5,
        dungeonName: "Undead Lair",
        portalEmojiId: "561248700601729036",
        keyData: [
            {
                keyEmojiId: "561248917090729999",
                keyEmojiName: "Undead Lair Key"
            }
        ],
        reactions: [
            RUSHING_CLASS
        ],
        portalLink: "https://cdn.discordapp.com/attachments/561245975767941120/561248252310061066/Undead_Lair_Portal.png",
        bossLinks: ["https://static.drips.pw/rotmg/wiki/Enemies/Septavius%20the%20Ghost%20God.png"],
        dungeonColors: [
            0x3d3434,
            0x2b1e1e,
            0
        ]
    },
    {
        id: 39,
        dungeonName: "Heroic Undead Lair",
        portalEmojiId: "711479365602508820",
        keyData: [
            {
                keyEmojiId: "711444346334871643",
                keyEmojiName: "Heroic Undead Lair Key"
            }
        ],
        reactions: [
            PALADIN,
            WARRIOR,
            PRIEST,
            MSEAL,
            DAZE,
            ARMOR_BREAK
        ],
        portalLink: "https://i.imgur.com/YgiGjh7.gif",
        bossLinks: ["https://i.imgur.com/WmL1qda.png"],
        dungeonColors: [
            0x4d19d1,
            0xf5d311,
            0x3d3434,
            0x2b1e1e
        ]
    },
    {
        id: 6,
        dungeonName: "Abyss of Demons",
        portalEmojiId: "561248700643409931",
        keyData: [
            {
                keyEmojiId: "561248916624900097",
                keyEmojiName: "Abyss of Demons Key"
            }
        ],
        reactions: [
            RUSHING_CLASS
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Abyss%20of%20Demons%20Portal.png",
        bossLinks: ["https://static.drips.pw/rotmg/wiki/Enemies/Archdemon%20Malphas.png"],
        dungeonColors: [
            0xe30707,
            0xe09a19
        ]
    },
    {
        id: 40,
        dungeonName: "Heroic Abyss of Demons",
        portalEmojiId: "711431861678637129",
        keyData: [
            {
                keyEmojiId: "711444346263830559",
                keyEmojiName: "Heroic Abyss of Demons Key"
            }
        ],
        reactions: [
            PALADIN,
            WARRIOR,
            PRIEST,
            MSEAL,
            DAZE,
            ARMOR_BREAK
        ],
        portalLink: "https://i.imgur.com/zz6D2lz.png",
        bossLinks: ["https://i.imgur.com/LCALe5V.png"],
        dungeonColors: [
            0xe30707,
            0xe09a19,
            0xf5d311
        ]
    },
    {
        id: 7,
        dungeonName: "Manor of the Immortals",
        portalEmojiId: "561248700337225759",
        keyData: [
            {
                keyEmojiId: "561248917120090142",
                keyEmojiName: "Manor of the Immortals Key"
            }
        ],
        reactions: [
            RUSHING_CLASS
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Manor%20of%20the%20Immortals%20Portal.png",
        bossLinks: ["https://static.drips.pw/rotmg/wiki/Enemies/Lord%20Ruthven.png"],
        dungeonColors: [
            0,
            0x4b2078,
            0x8b4fc9,
            0x3f2e52
        ]
    },
    {
        id: 8,
        dungeonName: "Puppet Master's Theatre",
        portalEmojiId: "561248700408791051",
        keyData: [
            {
                keyEmojiId: "561248917065433119",
                keyEmojiName: "Puppet Master's Theatre"
            }
        ],
        reactions: [
            RUSHING_CLASS
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Puppet%20Theatre%20Portal.png",
        bossLinks: ["https://static.drips.pw/rotmg/wiki/Enemies/The%20Puppet%20Master.png"],
        dungeonColors: [
            0xe31b1f,
            0xad3638
        ]
    },
    {
        id: 9,
        dungeonName: "Toxic Sewers",
        portalEmojiId: "561248701213835265",
        keyData: [
            {
                keyEmojiId: "561248917145124874",
                keyEmojiName: "Toxic Sewers Key"
            }
        ],
        reactions: [
            RUSHING_CLASS
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Toxic%20Sewers%20Portal.png",
        bossLinks: ["https://static.drips.pw/rotmg/wiki/Enemies/DS%20Gulpord%20the%20Slime%20God.png"],
        dungeonColors: [
            0x074f2a,
            0x228753
        ]
    },
    {
        id: 10,
        dungeonName: "Haunted Cemetary",
        portalEmojiId: "561248700693741578",
        keyData: [
            {
                keyEmojiId: "561248917052981278",
                keyEmojiName: "Haunted Cemetary Key"
            }
        ],
        reactions: [],
        portalLink: "https://cdn.discordapp.com/attachments/561245975767941120/561248253836787717/Haunted_Cemetery_Portal.png",
        bossLinks: [
            "https://static.drips.pw/rotmg/wiki/Enemies/Troll%203.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Arena%20Ghost%20Bride.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Arena%20Grave%20Caretaker.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Ghost%20of%20Skuld.png"
        ],
        dungeonColors: [
            0x0e9c53
        ]
    },
    {
        id: 11,
        dungeonName: "Mad Lab",
        portalEmojiId: "561248700899262469",
        keyData: [
            {
                keyEmojiId: "561248917010776065",
                keyEmojiName: "Mad Lab Key"
            }
        ],
        reactions: [
            RUSHING_CLASS
        ],
        portalLink: "https://cdn.discordapp.com/attachments/561245975767941120/561248331695915018/Mad_Lab_Portal.png",
        bossLinks: [
            "https://static.drips.pw/rotmg/wiki/Enemies/Dr%20Terrible.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Horrific%20Creation.png"
        ],
        dungeonColors: [
            0x06bd5f,
            0x0db4ba
        ]
    },
    {
        id: 12,
        dungeonName: "Parasite Chambers",
        portalEmojiId: "561248700727558144",
        keyData: [
            {
                keyEmojiId: "561248917115633665",
                keyEmojiName: "Parasite Chambers Key"
            }
        ],
        reactions: [
            KNIGHT,
            WARRIOR,
            PALADIN,
            PRIEST,
            BARD,
            RUSHING_CLASS,
            DAZE,
            ARMOR_BREAK
        ],
        portalLink: "https://cdn.discordapp.com/attachments/561245975767941120/561248332635439136/Parasite.png",
        bossLinks: ["https://i.imgur.com/zodPEFO.png"],
        dungeonColors: [
            0xbf1d4b,
            0x7d1935,
            0xeb1551
        ]
    },
    {
        id: 13,
        dungeonName: "Davy Jones's Locker",
        portalEmojiId: "561248700295544883",
        keyData: [
            {
                keyEmojiId: "561248917086273536",
                keyEmojiName: "Davy Jones's Locker Key"
            }
        ],
        reactions: [
            RUSHING_CLASS
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Davy%20Jones's%20Locker%20Portal.png",
        bossLinks: ["https://i.imgur.com/Jc4FERS.png"],
        dungeonColors: [
            0x2376a6
        ]
    },
    {
        id: 14,
        dungeonName: "Mountain Temple",
        portalEmojiId: "561248700769239076",
        keyData: [
            {
                keyEmojiId: "561248917027684367",
                // Numeric literals with absolute values equal to 2^53 or greater are too large to
                // be represented accurately as integers.ts(80008) when you do 561248917027684367
                // instead of "561248917027684367n" -- interesting
                keyEmojiName: "Mountain Temple Key"
            }
        ],
        reactions: [
            RUSHING_CLASS
        ],
        portalLink: "https://i.imgur.com/SY0Jtnp.png",
        bossLinks: ["https://i.imgur.com/TIektVi.png"],
        dungeonColors: [
            0x12634e
        ]
    },
    {
        id: 15,
        dungeonName: "Lair of Draconis",
        portalEmojiId: "561248700672901120",
        keyData: [
            {
                keyEmojiId: "561248916931084320",
                keyEmojiName: "Lair of Draconis"
            }
        ],
        reactions: [
            WARRIOR,
            PALADIN,
            BARD,
            TRICKSTER,
            PRIEST,
            DAZE,
            SLOW
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Consolation%20of%20Draconis%20Portal.png",
        bossLinks: [
            "https://i.imgur.com/vT7wdjb.png",
            "https://i.imgur.com/jQ6IYmy.png",
            "https://i.imgur.com/RLw3xNe.png",
            "https://i.imgur.com/YdDzmMk.png",
            "https://i.imgur.com/beABgum.png"
        ],
        dungeonColors: [
            0x1ec7b6,
            0x1fab46,
            0xc42727,
            0xffffff,
            0x1e1adb
        ]
    },
    {
        id: 16,
        dungeonName: "Deadwater Docks",
        portalEmojiId: "561248700324773909",
        keyData: [
            {
                keyEmojiId: "561248917052850176",
                keyEmojiName: "Deadwater Docks Key"
            }
        ],
        reactions: [
            RUSHING_CLASS,
            WARRIOR,
            PALADIN
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Deadwater%20Docks.png",
        bossLinks: ["https://static.drips.pw/rotmg/wiki/Enemies/Jon%20Bilgewater%20the%20Pirate%20King.png"],
        dungeonColors: [
            0xe4e4f5,
            0xded799
        ]
    },
    {
        id: 17,
        dungeonName: "Woodland Labyrinth",
        portalEmojiId: "561248701440589824",
        keyData: [
            {
                keyEmojiId: "561248917115633667",
                keyEmojiName: "Woodland Labyrinth Key"
            }
        ],
        reactions: [
            RUSHING_CLASS,
            PARALYZE
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Woodland%20Labyrinth.png",
        bossLinks: [
            "https://static.drips.pw/rotmg/wiki/Enemies/Epic%20Larva.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Epic%20Mama%20Megamoth.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Murderous%20Megamoth.png"
        ],
        dungeonColors: [
            0x31d43c,
            0x3eb847
        ]
    },
    {
        id: 18,
        dungeonName: "Crawling Depths",
        portalEmojiId: "561248701591322644",
        keyData: [
            {
                keyEmojiId: "561248917052719104",
                keyEmojiName: "Crawling Depths Key"
            }
        ],
        reactions: [
            RUSHING_CLASS,
            PARALYZE
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/The%20Crawling%20Depths.png",
        bossLinks: ["https://static.drips.pw/rotmg/wiki/Enemies/Son%20of%20Arachna.png"],
        dungeonColors: [
            0x3eb847,
            0x1dcf2a
        ]
    },
    {
        id: 19,
        dungeonName: "Ocean Trench",
        portalEmojiId: "561248700601466891",
        keyData: [
            {
                keyEmojiId: "561248917048655882",
                keyEmojiName: "Ocean Trench Key"
            }
        ],
        reactions: [
            RUSHING_CLASS,
            WARRIOR,
            PALADIN,
            KNIGHT,
            BARD,
            ARMOR_BREAK,
            DAZE
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Ocean%20Trench%20Portal.png",
        bossLinks: ["https://static.drips.pw/rotmg/wiki/Enemies/Thessal%20the%20Mermaid%20Goddess.png"],
        dungeonColors: [
            0x25c1cc,
            0x188ec4,
            0xd41c78
        ]
    },
    {
        id: 20,
        dungeonName: "Ice Cave",
        portalEmojiId: "561248701276880918",
        keyData: [
            {
                keyEmojiId: "561248916620967949",
                keyEmojiName: "Ice Cave Key"
            }
        ],
        reactions: [
            PRIEST,
            BARD
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Ice%20Cave%20Portal.png",
        bossLinks: ["https://static.drips.pw/rotmg/wiki/Enemies/ic%20Esben%20the%20Unwilling.png"],
        dungeonColors: [
            0x2491b3,
            0xe1f0f5,
            0x79c7e0
        ]
    },
    {
        id: 21,
        dungeonName: "Tomb of the Ancients",
        portalEmojiId: "561248700723363860",
        keyData: [
            {
                keyEmojiId: "561248916822163487",
                keyEmojiName: "Tomb of the Ancients"
            }
        ],
        reactions: [
            RUSHING_CLASS,
            WARRIOR,
            PALADIN,
            KNIGHT,
            TRICKSTER,
            PARALYZE,
            BARD
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Tomb%20of%20the%20Ancients%20Portal.png",
        bossLinks: [
            "https://i.imgur.com/phgo7.png",
            "https://i.imgur.com/UQ033.png",
            "https://i.imgur.com/aAhbT.png"
        ],
        dungeonColors: [
            0xebed55,
            0xc7c91c,
            0x28b84c,
            0x17adab
        ]
    },
    {
        id: 22,
        dungeonName: "Lair of Shaitan",
        portalEmojiId: "561248700828090388",
        keyData: [
            {
                keyEmojiId: "561248917191131152",
                keyEmojiName: "Lair of Shaitan"
            }
        ],
        reactions: [
            WARRIOR,
            PALADIN,
            KNIGHT,
            SAMURAI,
            PRIEST,
            BARD,
            DAZE,
            ARMOR_BREAK
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Lair%20of%20Shaitan%20Portal.png",
        bossLinks: ["https://i.imgur.com/azzD6jD.png"],
        dungeonColors: [
            0xd92130,
            0xe0912f
        ]
    },
    {
        id: 23,
        dungeonName: "Puppet Master's Encore",
        portalEmojiId: "561248700723101696",
        keyData: [
            {
                keyEmojiId: "561248917082079252",
                keyEmojiName: "Puppet Master's Encore Key"
            }
        ],
        reactions: [
            WARRIOR,
            PALADIN,
            SAMURAI,
            PRIEST,
            BARD,
            PARALYZE,
            DAZE
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Puppet%20Encore%20Portal.png",
        bossLinks: ["https://static.drips.pw/rotmg/wiki/Enemies/Puppet%20Master%20v2.png"],
        dungeonColors: [
            0x912121
        ]
    },
    {
        id: 24,
        dungeonName: "Cnidarian Reef",
        portalEmojiId: "561250455284350998",
        keyData: [
            {
                keyEmojiId: "561251664388947968",
                keyEmojiName: "Cnidarian Reef Key"
            }
        ],
        reactions: [
            WARRIOR,
            PALADIN,
            BARD,
            SAMURAI,
            BRAIN_PRISM,
            SLOW,
            DAZE
        ],
        portalLink: "https://i.imgur.com/qjd04By.png",
        bossLinks: ["https://i.imgur.com/BF2DclQ.png"],
        dungeonColors: [
            0xf5b120,
            0x1980a6
        ]
    },
    {
        id: 25,
        dungeonName: "Secluded Thicket",
        portalEmojiId: "561248701402578944",
        keyData: [
            {
                keyEmojiId: "561248917208039434",
                keyEmojiName: "Secluded Thicket Key"
            }
        ],
        reactions: [
            WARRIOR,
            PALADIN,
            BARD,
            SAMURAI,
            PRIEST,
            SLOW,
            DAZE
        ],
        portalLink: "https://i.imgur.com/8vEAT8t.png",
        bossLinks: [
            "https://i.imgur.com/2zBZOj0.png",
            "https://i.imgur.com/5quZEAa.png",
            "https://i.imgur.com/xFWvgyV.png"
        ],
        dungeonColors: [
            0x289e67,
            0x14a341
        ]
    },
    {
        id: 42,
        dungeonName: "High Tech Terror",
        portalEmojiId: "767844930017034261",
        keyData: [
            {
                keyEmojiId: "572596041526804500",
                keyEmojiName: "High Tech Terror Key"
            }
        ],
        reactions: [
            WARRIOR,
            PALADIN,
            BARD,
            SAMURAI,
            PRIEST,
            SLOW,
            DAZE
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Enemies/F.E.R.A.L..png",
        bossLinks: [
            "https://static.drips.pw/rotmg/wiki/Enemies/F.E.R.A.L..png"
        ],
        dungeonColors: [
            0x06bd5f,
            0x0db4ba
        ]
    },
    {
        id: 26,
        dungeonName: "Battle for the Nexus",
        portalEmojiId: "561248700588883979",
        keyData: [
            {
                keyEmojiId: "561248916570505219",
                keyEmojiName: "Battle for the Nexus Key"
            }
        ],
        reactions: [
            KNIGHT,
            PALADIN,
            WARRIOR,
            BARD,
            PRIEST,
            TRICKSTER
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Battle%20Nexus%20Portal.png",
        bossLinks: [
            "https://static.drips.pw/rotmg/wiki/Enemies/Lord%20Ruthven.png",
            "https://i.imgur.com/e4u7pT5.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Archdemon%20Malphas%20Deux.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Stheno%20the%20Snake%20Queen%20Deux.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/NM%20Green%20Dragon%20God.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Oryx%20the%20Mad%20God%202.png"],
        dungeonColors: [
            0xdfe30e,
        ]
    },
    { // TODO: update emojis
        id: 27,
        dungeonName: "Belladonna's Garden",
        portalEmojiId: "561248700693741569",
        keyData: [
            {
                keyEmojiId: "561248916830552067",
                keyEmojiName: "Belladonna's Garden Key"
            }
        ],
        reactions: [
            WARRIOR,
            PALADIN,
            BARD,
            PRIEST
        ],
        portalLink: "https://i.imgur.com/VTXGPSy.png",
        bossLinks: ["https://i.imgur.com/d7xzYLG.png"],
        dungeonColors: [
            0xd42c56,
            0x08d41d
        ]
    },
    {
        id: 28,
        dungeonName: "Ice Tomb",
        portalEmojiId: "561248700270116869",
        keyData: [
            {
                keyEmojiId: "561248917082079272",
                keyEmojiName: "Ice Tomb Key"
            }
        ],
        reactions: [
            WARRIOR,
            PALADIN,
            KNIGHT,
            TRICKSTER,
            PARALYZE,
            BARD
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Ice%20Tomb%20Portal.png",
        bossLinks: [
            "https://static.drips.pw/rotmg/wiki/Enemies/Ice%20Tomb%20Defender.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Ice%20Tomb%20Support.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Ice%20Tomb%20Attacker.png"
        ],
        dungeonColors: [
            0x1ab8b5,
            0x23deda
        ]
    },
    {
        id: 29,
        dungeonName: "Mad God Mayhem",
        portalEmojiId: "561248700647604227",
        keyData: [
            {
                keyEmojiId: "561248917069496341",
                keyEmojiName: "Mad God Mayhem Key"
            }
        ],
        reactions: [],
        portalLink: "https://i.imgur.com/jnHUonE.gif",
        bossLinks: [
            "https://static.drips.pw/rotmg/wiki/Enemies/DS%20Gulpord%20the%20Slime%20God.png",
            "https://i.imgur.com/kk4AcxG.png",
            "https://i.imgur.com/prGMIfR.png",
            "https://i.imgur.com/zodPEFO.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Puppet%20Master%20v2.png",
            "https://i.imgur.com/Hn5Ugix.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/Pentaract%20Tower%20Ultra.png"
        ],
        dungeonColors: [
            0x13a813,
            0x2a852a
        ]
    },
    {
        id: 30,
        dungeonName: "Shatters",
        portalEmojiId: "561744041532719115",
        keyData: [
            {
                keyEmojiId: "561744174152548374",
                keyEmojiName: "Shatters Key"
            }
        ],
        reactions: [
            RUSHING_CLASS,
            WARRIOR,
            KNIGHT,
            SAMURAI,
            PALADIN,
            PRIEST,
            MYSTIC,
            BARD,
            TRICKSTER,
            ARMOR_BREAK,
            BRAIN_PRISM,
            DAZE
        ],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/The%20Shatters.png",
        bossLinks: [
            "https://static.drips.pw/rotmg/wiki/Enemies/shtrs%20Bridge%20Sentinel.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/shtrs%20Twilight%20Archmage.png",
            "https://static.drips.pw/rotmg/wiki/Enemies/shtrs%20The%20Forgotten%20King.png"
        ],
        dungeonColors: [
            0x137d13,
            0x054205
        ]
    },
    {
        id: 31,
        dungeonName: "Machine",
        portalEmojiId: "572596351204982784",
        keyData: [
            {
                keyEmojiId: "572596041526804500",
                keyEmojiName: "Machine Key"
            }
        ],
        reactions: [],
        portalLink: "https://i.imgur.com/0PyfYHr.png",
        bossLinks: ["https://i.imgur.com/DXIpAWm.png"],
        dungeonColors: [
            0x2ade2a,
            0x0ffc0f
        ]
    },
    {
        id: 32,
        dungeonName: "Nest",
        portalEmojiId: "585617025909653524",
        keyData: [
            {
                keyEmojiId: "585617056192266240",
                keyEmojiName: "Nest Key"
            }
        ],
        reactions: [
            WARRIOR,
            PALADIN,
            KNIGHT,
            DAZE,
            MYSTIC,
            PRIEST
        ],
        portalLink: "https://i.imgur.com/WQ95Y0j.png",
        bossLinks: [
            "https://i.imgur.com/hUWc3IV.png",
            "https://i.imgur.com/Hn5Ugix.png"
        ],
        dungeonColors: [
            0xed9121,
            0x18c7db,
            0xe3e019,
            0xbd0d30
        ]
    },
    {
        id: 33,
        dungeonName: "Cursed Library",
        portalEmojiId: "576610298262454316",
        keyData: [
            {
                keyEmojiId: "576610460690939914",
                keyEmojiName: "Cursed Library Key"
            }
        ],
        reactions: [
            RUSHING_CLASS
        ],
        portalLink: "https://cdn.discordapp.com/attachments/561245975767941120/576610932126515211/LibCursed.gif",
        bossLinks: [
            "https://i.imgur.com/DfhWagx.png",
            "https://i.imgur.com/62cghXt.png"
        ],
        dungeonColors: [
            0x1b8094
        ]
    },
    {
        id: 34,
        dungeonName: "Cultist Hideout",
        portalEmojiId: "585613559254482974",
        keyData: [
            {
                keyEmojiId: "585613660878274571",
                keyEmojiName: "Lost Halls Key"
            }
        ],
        reactions: [
            PALADIN,
            WARRIOR,
            KNIGHT,
            RUSHING_CLASS,
            TRICKSTER,
            PRIEST,
            BARD,
            DAZE,
            MSEAL,
            BRAIN_PRISM
        ],
        portalLink: "https://i.imgur.com/on1ykYB.png",
        bossLinks: [
            "https://i.imgur.com/MgFBfJp.png",
            "https://i.imgur.com/eaW9gou.png",
            "https://i.imgur.com/f3SgbCI.png",
            "https://i.imgur.com/oY8zTM2.png",
            "https://i.imgur.com/VpVMTbl.png",
            "https://i.imgur.com/SYTQc3B.png",
            "https://i.imgur.com/bWCxTDu.png",
            "https://i.imgur.com/28HkqUS.png"
        ],
        dungeonColors: [
            0xcf0c16,
            0x8110c7,
            0xd3d61c,
            0x18adb5,
            0xebf2f2
        ]
    },
    {
        id: 35,
        dungeonName: "Void",
        portalEmojiId: "612336193761443900",
        keyData: [
            {
                keyEmojiId: "585613660878274571",
                keyEmojiName: "Lost Halls Key"
            },
            {
                keyEmojiId: "714012990873272321",
                keyEmojiName: "Vial of Pure Darkness"
            }
        ],
        reactions: [
            PALADIN,
            WARRIOR,
            KNIGHT,
            RUSHING_CLASS,
            TRICKSTER,
            PRIEST,
            BARD,
            MSEAL,
            BRAIN_PRISM
        ],
        portalLink: "https://i.imgur.com/uhDj0M5.png",
        bossLinks: ["https://i.imgur.com/kbzthE4.png"],
        dungeonColors: [
            0x0810ff
        ]
    },
    {
        id: 36,
        dungeonName: "Fungal Cavern",
        portalEmojiId: "609078085945655296",
        keyData: [
            {
                keyEmojiId: "609078341529632778",
                keyEmojiName: "Fungal Cavern Key"
            }
        ],
        reactions: [
            WARRIOR,
            PALADIN,
            KNIGHT,
            TRICKSTER,
            PRIEST,
            BARD,
            ARMOR_BREAK,
            DAZE,
            MSEAL,
            SLOW,
            BRAIN_PRISM
        ],
        portalLink: "https://i.imgur.com/fHNesPK.png",
        bossLinks: [
            "https://i.imgur.com/5fsTTjQ.png",
            "https://i.imgur.com/ipkXOvt.png",
            "https://i.imgur.com/KNo6oqA.png",
            "https://i.imgur.com/0aRxp9Q.png",
            "https://i.imgur.com/CdoztOb.png",
            "https://i.imgur.com/qc1soWS.png",
            "https://i.imgur.com/kC1mFqy.png"
        ],
        dungeonColors: [
            0xd9360d,
            0x15a8b0,
            0x24a353,
            0xc71c91
        ]
    },
    {
        id: 37,
        dungeonName: "Miscellaneous Dungeon",
        portalEmojiId: "574080648000569353",
        keyData: [
            {
                keyEmojiId: "572596041526804500",
                keyEmojiName: "Miscellaneous Key"
            }
        ],
        reactions: [],
        portalLink: "https://static.drips.pw/rotmg/wiki/Environment/Portals/Pirate%20Cave%20Portal.png",
        bossLinks: ["https://static.drips.pw/rotmg/wiki/Enemies/Dreadstump%20the%20Pirate%20King.png"],
        dungeonColors: [
            0x1dbfaa
        ]
    },
    {
        id: 38,
        dungeonName: "Oryx 3",
        portalEmojiId: "711426860051071067",
        keyData: [
            {
                keyEmojiId: "708191799750950962",
                keyEmojiName: "Wine Cellar Incantation"
            },
            {
                keyEmojiId: "737672554482761739",
                keyEmojiName: "Sword Rune"
            },
            {
                keyEmojiId: "737672554642276423",
                keyEmojiName: "Shield Rune"
            },
            {
                keyEmojiId: "737673058722250782",
                keyEmojiName: "Helmet Rune"
            }
        ],
        reactions: [
            PALADIN,
            KNIGHT,
            WARRIOR,
            PRIEST,
            TRICKSTER,
            BARD,
            BRAIN_PRISM,
            SLOW,
            ARMOR_BREAK
        ],
        portalLink: "https://i.imgur.com/nKKvJsv.png",
        bossLinks: [
            "https://media.discordapp.net/attachments/561246036870430770/708192230468485150/oryx_3_w.png",
            "https://media.discordapp.net/attachments/561246036870430770/708192231449690172/oryx_3_b.png",
            "https://media.discordapp.net/attachments/561246036870430770/708192325842763836/OryxUnknownAnim.gif",
            "https://media.discordapp.net/attachments/561246036870430770/708192326320783410/oryxSanctuaryObjects16x16_5gif.gif"
        ],
        dungeonColors: [
            0xb5471b,
            0x000000
        ]
    }
];

// max id: 42 -- high tech terror