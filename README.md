<p align="center">
  <img src="https://github.com/ewang2002/OneLifeBot/blob/bug_fixes/assets/banner.png"  alt="Bot Banner"/>
</p>

An open-source [Realm of the Mad God](https://www.realmofthemadgod.com/) designed for cross-verification,
moderation, and raid management.

The name was inspired by Ooga-Booga, another RotMG Discord bot.

## Warning

The bot is **not ready for production.** In particular:
- There are numerous bugs that I need to fix.
- Lots of refactoring needs to be done (i.e. the codebase is very messy).
- The documentation (including setup guide) is very incomplete.
- I did not set up a testing suite or configure ESLint yet.

It is in your best interest to not use this bot in its current state. More work will be done to fix the bugs and 
refactor the codebase. Once the bot is sufficiently cleaned/fixed up, a public invite link will be available. 

## Purpose

The main purpose of this bot is to simplify verification and raid management in any Realm Discord server. This bot,
which represents a huge overhaul of [ZeroRaidBot](https://github.com/ewang2002/ZeroRaidBot), is designed with
customization in mind.

## Technologies

Tooga-Booga actually consists of two projects: the bot itself (this repository);
and [RealmSharper](https://github.com/ewang2002/RealmEyeSharper/), which is how the bot gets its data from RealmEye and
provides other services like screenshot parsing.

### Tooga-Booga

- [TypeScript](https://www.typescriptlang.org/)
- [Node.js](https://nodejs.org/en/)
- [MongoDB](https://www.mongodb.com/)

### [RealmSharper](https://github.com/ewang2002/RealmEyeSharper/)

- [C#](https://docs.microsoft.com/en-us/dotnet/csharp/)
- [.NET](https://dotnet.microsoft.com/learn/dotnet/what-is-dotnet)
- [ASP.NET](https://dotnet.microsoft.com/apps/aspnet)

## Documentation, Setup & Support
To invite the official bot, click [here](). 

To see the documentation, click [here](https://github.com/ewang2002/OneLifeBot/blob/master/docs/docs-guide.md). The 
documentation includes a setup guide and information about how you can get support.


## Other Projects
These are some other projects that you might be interested in.

- [ZeroRaidBot](https://github.com/ewang2002/ZeroRaidBot) - The original open-source bot that I created. This project is
  in maintenance mode, though I may revisit it when I have time; I will only fix bugs and update dependencies as needed.
  Written in TypeScript and uses MongoDB.

- [Rotmg-Discord-Bot](https://github.com/Jacobvs/Rotmg-Discord-Bot) - Another open-source bot created
  by [Jacob](https://github.com/Jacobvs). Written in Python and uses MySQL.

## License
Unless otherwise specified, all files in this repository here are listed under the **MIT** license.