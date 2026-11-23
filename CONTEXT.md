# Keepsake

Keepsake is a UI fork of Karakeep: a self-hosted place where a person keeps what they want to remember. This glossary fixes the vocabulary the fork's own surfaces use, which diverges from upstream Karakeep's in several places. It is a glossary and nothing else: no implementation detail, no plans.

## Saved material

**File**:
A single saved thing. This fork's word for what upstream Karakeep calls a bookmark. The route behind it is still `/dashboard/bookmarks`.
_Avoid_: Bookmark, item, entry

**Physical Object**:
A File whose subject is a purchasable physical thing: a pair of trousers, a soldering station, a projector, a cap. Not an article, a recipe, a subscription, or an event ticket.
_Avoid_: Product, consumer good, thing

**Object Profile**:
The structured attributes a vision model derives from a Physical Object's image: category, brand, colours, materials, form, notable features. Colours and materials are lists, because one object can have several. It exists to feed search and is never rendered as text.
_Avoid_: Fashion profile, metadata, description, attributes

**Representative Image**:
An image that shows the Physical Object, regardless of where the File itself came from. A File saved from a social post may carry a shop's photo, as long as it shows the same object.
_Avoid_: Thumbnail, preview, banner image

**Shop URL**:
The address where a Physical Object can be bought. Distinct from the File's own URL, which is often a social post rather than a shop page.
_Avoid_: Product link, buy link, source

## Views

**Gallery**:
The view that shows Physical Objects as images alone, with no title, summary, or any other text. A second way of looking at the same Files, not a separate collection.
_Avoid_: Moodboard, board, shop, pinboard

**Gallery Item**:
A Physical Object that has a Representative Image and is therefore visible in the Gallery. One without an image is absent from the Gallery rather than shown as a placeholder.
_Avoid_: Pin, card, product card

**Notification Inbox**:
The place under the user's profile where the app reports what needs the user's attention: a Physical Object with no Representative Image, a failed crawl, a missing Shop URL. Unrelated to Files, whose sidebar glyph happens to be an inbox tray.
_Avoid_: Inbox (unqualified), notifications, alerts
