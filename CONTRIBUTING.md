# Contributing
Want to help with the development of ToogaBooga? There are several ways you can do this!

## Submitting an Issue
If you suspect that there is an issue with the bot, you can submit a new issue [here](https://github.com/ToogaInc/ToogaBooga/issues/new). Make sure there isn't already an issue reported [here](https://github.com/ToogaInc/ToogaBooga/issues).

In your issue, you should generally be descriptive. For example, you should include
- a description of the issue.
- how you can replicate the issue.
- the expected behavior (what should happen).
- the actual behavior (what *actually* happens).

You can be brief if you want. As long as it's clear what's going on, it should be good.

After you submit an issue, **do not** manually assign labels to it; we will take care of that for you.

## Contributing Code
You're welcome to contribute code to our codebase if you'd like. One major thing to consider:
> When you submit code, your submissions are understood to be under the same [MIT License](https://github.com/ToogaInc/ToogaBooga/blob/master/LICENSE) that covers the project.

If you want a good place to start contributing, feel free to take a look at the list of [good first issues](https://github.com/ToogaInc/ToogaBooga/labels/g-good%20first%20issue). 

Once you find something that you want to contribute to, simply [fork](https://github.com/ToogaInc/ToogaBooga/fork) the repository and make your changes. After you're done, make a pull request that merges your fork to our main branch. See the next section for more information about our expectations regarding your code submissions.

Feel free to ask us -- the developers -- in our [Discord server](https://discord.gg/5fZu3asb4v) if you have any questions!


## Pull Request Requirements
In order to have your pull request accepted, your pull request must meet the following requirements.
- Your code changes **must** not contain:
  - any completely irrelevant additions (for example, a feature that has nothing to do with the bot's purpose), or
  - any flawed changes (for example, removing the bot owner permission check or exposing the bot token). 
- Your code **must** pass our checks (via GitHub actions). In particular, your code must
    - follow our ESLint rules, and
    - compile. 
- Your code **must** be well-documented. See **Documentation** below. 

When you submit a pull request, __make sure to request a review from one of the developers__; this is how we will know your changes are ready to be reviewed. If you do not request a review from one of the developers, we will not merge your code to the main branch.

Make sure to keep yourself updated with the status of the PR. I may occasionally ask questions about your code, or 
require that you change some things. Failure to respond to any questions or requests in a reasonable time will 
result in the PR being closed.

## Documentation
Documentation is important for a project this big. Thus, it is important that I enforce some basic documentation rules.
- You **must** document all functions and methods using [JSDocs](https://jsdoc.app/about-getting-started.html). 
- You **should** document all members of an interface. Again, use JSDocs.
- Your documentation **must** be in English. 

Additionally:
- Try to use descriptive variable names.
- It would be ideal if you document your code and thought process.

Beyond this, I won't really say much else. Try to keep the style of your code consistent with the style of the code 
that is already committed. If you have any questions, please reach out.
