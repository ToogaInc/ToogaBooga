[← Go Back](https://github.com/ewang2002/OneLife/blob/master/docs/docs-guide.md)

# Contributing
Want to help with the development of OneLife? Please read through all of this before you do so.

## Setup
You will need the following to develop OneLife.
- The latest (LTS) version of [Node.js](https://nodejs.org/en/).
- [TypeScript](https://www.typescriptlang.org/). 

## Pull Request Requirements
In order to have your pull request accepted, your pull request must meet the following requirements.
- Your code changes **must** not contain:
  - Any completely irrelevant additions (for example, a feature that has nothing to do with the bot's purpose).
  - Any flawed changes (for example, removing the bot owner permission check or exposing the bot token). 
- Your code changes **must** follow the TSLint/ESLint code rules. 
- Your code **must** compile.
- Your code **must** be well-documented. See **Documentation** below. 

Make sure to keep yourself updated with the status of the PR. I may occasionally ask questions about your code, or 
require that you change some things. Failure to respond to any questions or requests in a reasonable time will 
result in the PR being closed.

## Documentation
Documentation is important for a project this big. Thus, it is important that I enforce some basic documentation rules.
- You **must** document all functions and methods using [JSDocs](https://jsdoc.app/about-getting-started.html). 
- You **should** document all members of an interface. Again, use JSDocs.
- Your documentation **must** be in coherent English. 

Additionally:
- Try to use descriptive variable names.
- Document your code and thought process. If you can't follow your own logic, then comment it. If I can't follow 
  your logic, I will not accept your PR. 

Beyond this, I won't really say much else. Try to keep the style of your code consistent with the style of the code 
that is already committed. If you have any questions, please reach out.