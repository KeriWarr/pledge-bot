#pledge-bot

**pledge** is a tool for making wagers with your friends.

**pledge-api** is the slack frontend for the project.


---


## Design notes

### Prompting details

- When a wager is `Unaccepted`, both the _taker_ and the _arbiter_ (if specified) are prompted to accept or reject.
- When a wager is `Unconfirmed`, both the _maker_ and the _arbiter_ (if specified) are prompted to accept or reject.
- If the _maturation_ is reached on an `Accepted` wager:
  - If an _arbiter_ was specified, the _arbiter_ will be prompted to close the wager.
  - Otherwise, the _maker_ and _taker_ will be prompted to close the wager.
- When a wager is `Closed`, any of the _maker_ and the _taker_ that did not close the wager will be prompted to appeal the decision.
- When a wager is `Completed`, both the _maker_ and _taker_ will be notified of the results.


# License

MIT
