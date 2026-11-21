# Learn PopShield, from zero

This guide takes you from knowing nothing about how the web works to being
able to change PopShield's code with confidence. No programming knowledge is
assumed. Every term is explained before it's used, every code snippet is
commented line by line, and every chapter ends with a few questions to check
your understanding.

It's written for curious people, and for automated coding agents, meeting a
browser extension for the first time. The code in [`src/`](../src) is the source of truth: if
this guide and the code disagree, the code wins, and a fix to the guide is
welcome.

## How the guide is organised

Each part builds on the one before. Skip what you already know.

| Part | What you'll get out of it | Start here if... |
|---|---|---|
| [**Part 0 · Starting from zero**](learn/00-basics.md) | how a web page is built, what your browser does with it, and enough JavaScript to read the code in this guide | you've never written code |
| [**Part I · How ads hijack your clicks**](learn/01-attacks.md) | the tricks ad scripts use, drawn out, and why Chrome's own blocker misses them | you know how pages work, but not the ad tricks |
| [**Part II · How a browser extension works**](learn/02-extensions.md) | what an extension can do, where its code runs, and how to install PopShield | you know the web but not extensions |
| [**Part III · How PopShield works**](learn/03-popshield.md) | PopShield's rule for new tabs, one click traced from start to finish, and every defence | you want to understand PopShield itself |
| [**Part IV · Every design decision, and why**](learn/04-decisions.md) | the story behind each choice: what went wrong, what failed, what was chosen, what it costs | you want to change PopShield safely |
| [**Part V · Becoming a contributor**](learn/05-contributing.md) | running the tests, finding your way around the code, adding a test, debugging | you're ready to contribute |
| [**Glossary**](learn/glossary.md) | a short definition of every term | you meet a word you don't know |

## The short version

If you only have five minutes:

- Chrome's popup blocker only asks *"did the user click recently?"* Ad
  scripts open their tabs during your real clicks, so they pass.
- PopShield asks *"is the code running right now handling a real click on a
  specific element?"* An ad listening to every click on the page fails; a
  Share button's own handler passes.
- PopShield's hooks sit in the page's own JavaScript world, where the page can
  tamper with anything, so they only **ask**. Every decision is made in the
  extension's isolated world, which the page can't reach.
- A safety net in the background closes any new tab that the isolated world
  didn't approve, and follows a tab for a few seconds when the approval rested
  on thin evidence.
- **Smart** mode (the default) keeps checkouts working by allowing a script
  redirect more than about 5 seconds after your click. **Strict** mode blocks
  that too, for sites you don't trust.
- **PopShield keeps no browsing history.** The only site names it saves are
  the ones you choose a mode for; everything else is an anonymous count. The
  list of what was blocked on a page is cleared when you go to a new page or
  close the tab.

Then read [one click, traced end to end](learn/03-popshield.md#2-following-one-click-from-start-to-finish)
and [why the decision lives where the page can't touch it](learn/03-popshield.md#4-asking-through-the-wall).

## Other documents

- [ARCHITECTURE.md](ARCHITECTURE.md): the concise technical reference for
  maintainers, including the threat model.
- [AGENTS.md](../AGENTS.md) and [CONTRIBUTING.md](../CONTRIBUTING.md): the
  rules for contributions.
- [PRIVACY.md](../PRIVACY.md) and [SECURITY.md](../SECURITY.md): the privacy
  policy and how to report a vulnerability.
