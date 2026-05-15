# Gift List Website

This is a birthday and Christmas gift list website. It uses Firebase so the gift list can be shared across devices.

## What is done

- Visitors can make a simple account with name, relation, and PIN.
- Returning visitors can enter their PIN.
- Visitor PINs are stored as one-way fingerprints, not plain PIN numbers.
- Gifts can be searched and sorted.
- Product names open the buying link.
- Bought gifts are crossed out and their buying links are removed.
- Owner tools use Firebase email/password sign-in.
- Owner tools can add gifts and update the current interests note.
- Firebase support is wired in.

## Important

Before sharing the real site, publish the Realtime Database rules and use the owner login once to initialize the shared list.

## Next setup step

Paste the rules from `firebase-rules.json` into Firebase Realtime Database Rules, then use the owner login once to initialize the shared gift list.
